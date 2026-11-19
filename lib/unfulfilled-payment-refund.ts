import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema/payment-orders";
import { paymentRefunds } from "@/db/schema/payment-refunds";
import { users } from "@/db/schema/users";
import { toPaise } from "@/lib/money";
import {
    createRazorpayRefund,
    getRazorpayConfig,
    RazorpayError,
} from "@/lib/razorpay";
import {
    sendRefundFailureAlert,
    sendUnfulfilledPaymentNotice,
} from "@/lib/refund-emails";
import {
    refundStatusFromProvider,
    UNFULFILLED_REFUND_SOURCE,
} from "@/lib/refund-fulfillment";

export type UnfulfilledRefundResult =
    | {
          outcome: "refund_started";
          refundId: string;
          providerRefundId: string;
      }
    | {
          outcome: "skipped";
          reason:
              | "not_configured"
              | "order_not_found"
              | "already_paid"
              | "amount_mismatch"
              | "already_refunding";
      }
    /** Razorpay did not answer; the reconciler retries with the same key. */
    | { outcome: "pending_retry"; refundId: string }
    | { outcome: "rejected"; refundId: string }
    | { outcome: "error" };

/**
 * Refunds a payment Razorpay captured but fulfillment refused (R-03): a second
 * checkout paid while another paid plan is active, or a plan withdrawn after
 * the order was created. Without this the customer is charged, the order is
 * marked `failed`, and nothing gives the money back.
 *
 * The order is never `paid`, so this does not touch `amount_refunded`; the
 * `payment_refunds` row (calc.source = "unfulfilled-payment") is the only
 * record and `applyProviderRefund` only settles its status. The order's
 * `provider_payment_id` is stored so refund webhooks can find it.
 *
 * Idempotent: a verify call and a webhook for the same payment race on the
 * user advisory lock, and the loser finds the row and skips. It never throws;
 * callers are already handling a failed fulfillment.
 */
export async function refundUnfulfilledPayment(params: {
    providerOrderId: string;
    providerPaymentId: string;
    amountPaise: number;
    reason: string;
}): Promise<UnfulfilledRefundResult> {
    try {
        const config = getRazorpayConfig();
        if (!config) {
            console.error(
                "[refunds] Captured payment could not be fulfilled and Razorpay is not configured:",
                params.providerOrderId,
            );
            return { outcome: "skipped", reason: "not_configured" };
        }

        const prepared = await db.transaction(async (tx) => {
            const [owner] = await tx
                .select({ userId: paymentOrders.userId })
                .from(paymentOrders)
                .where(eq(paymentOrders.providerOrderId, params.providerOrderId))
                .limit(1);

            if (!owner) return { skip: "order_not_found" as const };

            // Lock order (§5.4): user advisory lock → order row.
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtext(${owner.userId}))`,
            );

            const [order] = await tx
                .select()
                .from(paymentOrders)
                .where(eq(paymentOrders.providerOrderId, params.providerOrderId))
                .limit(1)
                .for("update");

            if (!order) return { skip: "order_not_found" as const };
            if (order.status === "paid") return { skip: "already_paid" as const };
            if (BigInt(params.amountPaise) !== toPaise(order.amount)) {
                return { skip: "amount_mismatch" as const };
            }

            const [existing] = await tx
                .select({ id: paymentRefunds.id })
                .from(paymentRefunds)
                .where(
                    and(
                        eq(paymentRefunds.paymentOrderId, order.id),
                        inArray(paymentRefunds.status, [
                            "requested",
                            "pending",
                            "processed",
                        ]),
                    ),
                )
                .limit(1);

            if (existing) return { skip: "already_refunding" as const };

            if (!order.providerPaymentId) {
                await tx
                    .update(paymentOrders)
                    .set({
                        providerPaymentId: params.providerPaymentId,
                        updatedAt: new Date(),
                    })
                    .where(eq(paymentOrders.id, order.id));
            }

            const [row] = await tx
                .insert(paymentRefunds)
                .values({
                    paymentOrderId: order.id,
                    userId: order.userId,
                    kind: "external",
                    status: "requested",
                    amount: order.amount,
                    currency: order.currency,
                    speedRequested: "normal",
                    requestedBy: "ops",
                    calc: {
                        source: UNFULFILLED_REFUND_SOURCE,
                        reason: params.reason,
                        providerPaymentId: params.providerPaymentId,
                    },
                })
                .returning({ id: paymentRefunds.id });

            return {
                rowId: row.id,
                userId: order.userId,
                amount: order.amount,
                currency: order.currency,
            };
        });

        if ("skip" in prepared) {
            console.error("[refunds] Unfulfilled payment not refunded:", {
                orderId: params.providerOrderId,
                reason: prepared.skip,
            });
            return { outcome: "skipped", reason: prepared.skip! };
        }

        let providerRefund;
        try {
            providerRefund = await createRazorpayRefund(
                {
                    paymentId: params.providerPaymentId,
                    amountPaise: params.amountPaise,
                    idempotencyKey: `rfnd-${prepared.rowId}`,
                    notes: {
                        refundId: prepared.rowId,
                        orderId: params.providerOrderId,
                    },
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
                            eq(paymentRefunds.id, prepared.rowId),
                            eq(paymentRefunds.status, "requested"),
                        ),
                    );
                await sendRefundFailureAlert(prepared.rowId);
                return { outcome: "rejected", refundId: prepared.rowId };
            }

            // A timeout may still have created the refund. The row stays
            // `requested`; the webhook or the reconciler settles it.
            console.error(
                "[refunds] Could not confirm the refund for an unfulfilled payment:",
                params.providerOrderId,
            );
            return { outcome: "pending_retry", refundId: prepared.rowId };
        }

        const status = refundStatusFromProvider(providerRefund.status);
        const now = new Date();
        await db
            .update(paymentRefunds)
            .set({
                providerRefundId: providerRefund.id,
                status,
                processedAt: status === "processed" ? now : null,
                errorCode: status === "failed" ? "REFUND_FAILED" : null,
                updatedAt: now,
            })
            .where(eq(paymentRefunds.id, prepared.rowId));

        if (status === "failed") {
            await sendRefundFailureAlert(prepared.rowId);
            return { outcome: "rejected", refundId: prepared.rowId };
        }

        const [profile] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, prepared.userId))
            .limit(1);

        await sendUnfulfilledPaymentNotice({
            email: profile?.email ?? null,
            amount: prepared.amount,
            currency: prepared.currency,
            refundId: providerRefund.id,
        });

        return {
            outcome: "refund_started",
            refundId: prepared.rowId,
            providerRefundId: providerRefund.id,
        };
    } catch (error) {
        console.error(
            "[refunds] Refund of an unfulfilled payment failed:",
            error,
        );
        return { outcome: "error" };
    }
}
