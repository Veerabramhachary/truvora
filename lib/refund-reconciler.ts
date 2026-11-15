import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema/payment-orders";
import { paymentRefunds } from "@/db/schema/payment-refunds";
import { toPaise } from "@/lib/money";
import {
    createRazorpayRefund,
    fetchRazorpayPaymentRefunds,
    fetchRazorpayRefund,
    getRazorpayConfig,
    RazorpayError,
    type RazorpayConfig,
    type RazorpayRefund,
} from "@/lib/razorpay";
import {
    applyProviderRefund,
    refundIdFromNotes,
    refundStatusFromProvider,
} from "@/lib/refund-fulfillment";

const REQUEST_STALE_MS = 10 * 60 * 1000;
const PENDING_STALE_MS = 8 * 24 * 60 * 60 * 1000;

export type RefundReconcileSummary = {
    dryRun: boolean;
    /** `requested` rows older than 10 minutes. */
    requested: number;
    /** `pending` rows last touched more than 8 days ago. */
    pending: number;
    /** Rows checked or finished successfully. */
    settled: number;
    failed: number;
    moreDue: boolean;
};

type RefundRow = typeof paymentRefunds.$inferSelect;
type OrderRow = typeof paymentOrders.$inferSelect;

async function orderFor(row: RefundRow): Promise<OrderRow | null> {
    const [order] = await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, row.paymentOrderId))
        .limit(1);
    return order ?? null;
}

async function applyFound(
    row: RefundRow,
    order: OrderRow,
    providerRefund: RazorpayRefund,
): Promise<boolean> {
    if (!order.providerPaymentId) return false;

    const result = await applyProviderRefund({
        providerPaymentId: order.providerPaymentId,
        providerRefundId: providerRefund.id,
        amountPaise: providerRefund.amount,
        currency: providerRefund.currency ?? order.currency,
        status: refundStatusFromProvider(providerRefund.status),
        refundId: row.id,
        requestedBy: row.requestedBy,
        kind: row.kind,
        speedRequested: row.speedRequested,
        // Cancel-now revokes access on acceptance; ops/external keep the rule.
        applyWhenPending: row.requestedBy === "user",
        endPlan: row.requestedBy === "user" ? true : undefined,
    });

    return (
        result.applied ||
        result.reason === "already_processed" ||
        result.reason === "pending"
    );
}

async function retryRequested(row: RefundRow, config: RazorpayConfig) {
    const order = await orderFor(row);
    if (!order?.providerPaymentId) return false;

    let providerRefund: RazorpayRefund | undefined;
    try {
        const list = await fetchRazorpayPaymentRefunds(
            order.providerPaymentId,
            config,
        );
        providerRefund = list.entity.find(
            (item) =>
                item.id === row.providerRefundId ||
                refundIdFromNotes(item.notes) === row.id,
        );
    } catch (error) {
        // A failed lookup is not fatal: retrying create with the same
        // idempotency key is equally safe.
        console.error("[refunds] Could not list refunds during reconcile:", error);
    }

    if (!providerRefund) {
        try {
            providerRefund = await createRazorpayRefund(
                {
                    paymentId: order.providerPaymentId,
                    amountPaise: Number(toPaise(row.amount)),
                    idempotencyKey: `rfnd-${row.id}`,
                    notes: { refundId: row.id, orderId: order.providerOrderId },
                    speed: "normal",
                },
                config,
            );
        } catch (error) {
            if (error instanceof RazorpayError && !error.retryable) {
                await db
                    .update(paymentRefunds)
                    .set({
                        status: "failed",
                        errorCode: error.code,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(paymentRefunds.id, row.id),
                            eq(paymentRefunds.status, "requested"),
                        ),
                    );
                return false;
            }
            throw error;
        }
    }

    return applyFound(row, order, providerRefund);
}

async function settlePending(row: RefundRow, config: RazorpayConfig) {
    if (!row.providerRefundId) return false;

    const order = await orderFor(row);
    if (!order?.providerPaymentId) return false;

    const providerRefund = await fetchRazorpayRefund(
        row.providerRefundId,
        config,
    );
    // Still pending after 8 days: nothing to settle yet, but the check itself
    // succeeded, so it is not a failed run.
    if (refundStatusFromProvider(providerRefund.status) === "pending") {
        return true;
    }
    return applyFound(row, order, providerRefund);
}

/**
 * Daily safety net for refunds that stopped between Razorpay and our database
 * (§5.9). `requested` rows are retried with the same idempotency key; `pending`
 * rows are refreshed from the provider. A dry run reports counts only.
 */
export async function reconcileRefunds(
    options: { now?: Date; dryRun?: boolean; batchSize?: number } = {},
): Promise<RefundReconcileSummary> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 50;

    const staleRequests = await db
        .select()
        .from(paymentRefunds)
        .where(
            and(
                eq(paymentRefunds.status, "requested"),
                lt(
                    paymentRefunds.createdAt,
                    new Date(now.getTime() - REQUEST_STALE_MS),
                ),
            ),
        )
        .limit(batchSize);

    const stalePending = await db
        .select()
        .from(paymentRefunds)
        .where(
            and(
                eq(paymentRefunds.status, "pending"),
                lt(
                    paymentRefunds.updatedAt,
                    new Date(now.getTime() - PENDING_STALE_MS),
                ),
            ),
        )
        .limit(batchSize);

    const summary: RefundReconcileSummary = {
        dryRun,
        requested: staleRequests.length,
        pending: stalePending.length,
        settled: 0,
        failed: 0,
        moreDue:
            staleRequests.length === batchSize ||
            stalePending.length === batchSize,
    };

    if (dryRun) return summary;

    const config = getRazorpayConfig();
    if (!config) {
        console.error("[refunds] Reconciler skipped: Razorpay is not configured");
        summary.failed = summary.requested + summary.pending;
        return summary;
    }

    for (const row of staleRequests) {
        try {
            if (await retryRequested(row, config)) summary.settled++;
            else summary.failed++;
        } catch (error) {
            console.error("[refunds] Could not reconcile requested refund:", {
                refundId: row.id,
                error,
            });
            summary.failed++;
        }
    }

    for (const row of stalePending) {
        try {
            if (await settlePending(row, config)) summary.settled++;
            else summary.failed++;
        } catch (error) {
            console.error("[refunds] Could not reconcile pending refund:", {
                refundId: row.id,
                error,
            });
            summary.failed++;
        }
    }

    return summary;
}
