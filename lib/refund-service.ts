import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema/payment-orders";
import { paymentRefunds } from "@/db/schema/payment-refunds";
import { app_subscriptions } from "@/db/schema/plans";
import { users } from "@/db/schema/users";
import { getBillingState } from "@/lib/billing-state";
import { fromPaise, toPaise } from "@/lib/money";
import {
    createRazorpayRefund,
    getRazorpayConfig,
    RazorpayError,
} from "@/lib/razorpay";
import {
    sendRefundConfirmation,
} from "@/lib/refund-emails";
import {
    applyProviderRefund,
    refundStatusFromProvider,
} from "@/lib/refund-fulfillment";
import {
    calculateRefund,
    REFUND_COOLDOWN_DAYS,
    type RefundPolicyFailure,
    type RefundPolicyResult,
} from "@/lib/refund-policy";

export const CANCEL_REASONS = [
    "too_expensive",
    "not_using",
    "missing_feature",
    "other",
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export type CancellationPreview = {
    eligible: boolean;
    planName: string | null;
    periodEnd: string | null;
    currency: string;
    paid: string;
    alreadyRefunded: string;
    /** `0.00` when not eligible. */
    refundAmount: string;
    kind: "full_window" | "prorated" | null;
    /** Plain sentence explaining why cancelling is unavailable. */
    reason: string | null;
    /** Plain sentence describing the formula, e.g. "14 unused days of 30". */
    explanation: string | null;
};

export class CancellationError extends Error {
    readonly status: 400 | 404 | 409 | 500 | 503;
    readonly code: string;
    readonly preview?: CancellationPreview;

    constructor(
        message: string,
        status: 400 | 404 | 409 | 500 | 503,
        code: string,
        preview?: CancellationPreview,
    ) {
        super(message);
        this.name = "CancellationError";
        this.status = status;
        this.code = code;
        this.preview = preview;
    }
}

/** Fail closed until the feature is switched on (§5.11 / D13). */
export function isBillingRefundsEnabled(): boolean {
    return process.env.BILLING_REFUNDS_ENABLED === "true";
}

const REASON_TEXT: Record<RefundPolicyFailure, string> = {
    not_paid: "You are on the Free plan, so there is nothing to refund.",
    nothing_left: "This payment has already been refunded.",
    missing_period:
        "We do not have the billing period for this payment. Contact support.",
    period_ended: "The paid period has ended, so there is nothing to refund.",
    payment_too_old:
        "This payment is older than Razorpay's refund window. Your plan ends on its normal date.",
    cooldown: `A refund was issued in the last ${REFUND_COOLDOWN_DAYS} days, so another one is not available. Contact support.`,
    below_minimum: "The unused amount is below ₹10, so a refund is not available.",
};

function explain(result: RefundPolicyResult): string | null {
    if (!result.eligible) return null;
    const days = (count: number) =>
        `${count} day${count === 1 ? "" : "s"}`;
    if (result.kind === "full_window") {
        return `Full refund: you paid ${days(result.daysSincePayment)} ago.`;
    }
    return `Refund for ${days(result.unusedDays)} unused of ${days(
        result.totalDays,
    )}.`;
}

function failurePreview(
    base: Omit<CancellationPreview, "eligible" | "refundAmount" | "kind" | "reason" | "explanation">,
    result: RefundPolicyResult,
): CancellationPreview {
    return {
        ...base,
        eligible: result.eligible,
        refundAmount: result.eligible ? fromPaise(result.amountPaise) : "0.00",
        kind: result.kind,
        reason: result.reason ? REASON_TEXT[result.reason] : null,
        explanation: explain(result),
    };
}

/**
 * Read-only preview for the cancel dialog. It never trusts a client amount:
 * every number comes from the order the subscription points at.
 */
export async function getCancellationPreview(
    userId: string,
    now: Date = new Date(),
): Promise<CancellationPreview> {
    const billing = await getBillingState(userId, now);
    const base = {
        planName: billing.plan?.name ?? billing.subscriptionPlan?.name ?? null,
        periodEnd: billing.currentPeriodEnd?.toISOString() ?? null,
        currency: "INR",
        paid: "0.00",
        alreadyRefunded: "0.00",
    };

    if (billing.status !== "paid") {
        return {
            ...base,
            eligible: false,
            refundAmount: "0.00",
            kind: null,
            reason:
                billing.status === "canceled"
                    ? "Your plan is already canceled."
                    : billing.status === "expired"
                      ? "The paid period has ended, so there is nothing to refund."
                      : "You are on the Free plan, so there is nothing to refund.",
            explanation: null,
        };
    }

    if (!billing.fundingOrderId) {
        return {
            ...base,
            eligible: false,
            refundAmount: "0.00",
            kind: null,
            reason:
                "We cannot find the payment for this period. Contact support.",
            explanation: null,
        };
    }

    const [order] = await db
        .select()
        .from(paymentOrders)
        .where(
            and(
                eq(paymentOrders.id, billing.fundingOrderId),
                eq(paymentOrders.userId, userId),
            ),
        )
        .limit(1);

    if (!order || order.status !== "paid" || !order.providerPaymentId) {
        return {
            ...base,
            eligible: false,
            refundAmount: "0.00",
            kind: null,
            reason: "The payment for this period is not available. Contact support.",
            explanation: null,
        };
    }

    const [lastRefund] = await db
        .select({ processedAt: paymentRefunds.processedAt })
        .from(paymentRefunds)
        .where(
            and(
                eq(paymentRefunds.userId, userId),
                eq(paymentRefunds.status, "processed"),
            ),
        )
        .orderBy(desc(paymentRefunds.processedAt))
        .limit(1);

    const result = calculateRefund({
        amountPaid: order.amountPaid,
        amountRefunded: order.amountRefunded,
        paidAt: order.paidAt,
        periodStart: order.periodStart,
        periodEnd: order.periodEnd,
        now,
        lastRefundAt: lastRefund?.processedAt ?? null,
    });

    return {
        ...failurePreview(
            {
                ...base,
                currency: order.currency,
                paid: order.amountPaid,
                alreadyRefunded: order.amountRefunded,
                periodEnd:
                    order.periodEnd?.toISOString() ?? base.periodEnd,
            },
            result,
        ),
    };
}

/**
 * Cancels now and refunds the unused time.
 *
 * TX1 inserts a `requested` row under the user lock and re-validates the
 * preview. The Razorpay call runs outside every lock. TX2 applies the accepted
 * refund, ends the plan and writes the accounting row. If Razorpay rejects it,
 * TX1 is marked `failed` and the plan is untouched.
 */
export async function cancelNow(params: {
    userId: string;
    expectedRefund: string;
    reason?: CancelReason | null;
    now?: Date;
}): Promise<{
    refundId: string;
    providerRefundId: string;
    amount: string;
    currency: string;
    status: string;
    planEnded: boolean;
}> {
    if (!isBillingRefundsEnabled()) {
        throw new CancellationError(
            "Cancellation is not available.",
            404,
            "disabled",
        );
    }

    const config = getRazorpayConfig();
    if (!config) {
        throw new CancellationError(
            "Payments are not configured, so a refund cannot be issued.",
            503,
            "not_configured",
        );
    }

    const now = params.now ?? new Date();
    const preview = await getCancellationPreview(params.userId, now);
    if (!preview.eligible) {
        throw new CancellationError(
            preview.reason ?? "This plan cannot be refunded.",
            409,
            "not_eligible",
            preview,
        );
    }
    if (toPaise(preview.refundAmount) !== toPaise(params.expectedRefund)) {
        throw new CancellationError(
            "The refund amount changed. Review and confirm again.",
            409,
            "stale_amount",
            preview,
        );
    }

    const billing = await getBillingState(params.userId, now);
    if (!billing.fundingOrderId) {
        throw new CancellationError(
            "We cannot find the payment for this period. Contact support.",
            409,
            "not_eligible",
            preview,
        );
    }
    const fundingOrderId = billing.fundingOrderId;

    const prepared = await db.transaction(async (tx) => {
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${params.userId}))`,
        );

        const [subscription] = await tx
            .select()
            .from(app_subscriptions)
            .where(eq(app_subscriptions.userId, params.userId))
            .orderBy(desc(app_subscriptions.currentPeriodEnd))
            .limit(1);

        if (
            !subscription ||
            subscription.currentPaymentOrderId !== fundingOrderId
        ) {
            throw new CancellationError(
                "Your plan changed. Review the new amount.",
                409,
                "changed",
                preview,
            );
        }

        const [order] = await tx
            .select()
            .from(paymentOrders)
            .where(
                and(
                    eq(paymentOrders.id, fundingOrderId),
                    eq(paymentOrders.userId, params.userId),
                ),
            )
            .limit(1)
            .for("update");

        if (
            !order ||
            order.status !== "paid" ||
            !order.providerPaymentId
        ) {
            throw new CancellationError(
                "The payment for this period is no longer refundable.",
                409,
                "not_eligible",
                preview,
            );
        }

        const [lastRefund] = await tx
            .select({ processedAt: paymentRefunds.processedAt })
            .from(paymentRefunds)
            .where(
                and(
                    eq(paymentRefunds.userId, params.userId),
                    eq(paymentRefunds.status, "processed"),
                ),
            )
            .orderBy(desc(paymentRefunds.processedAt))
            .limit(1);

        const fresh = calculateRefund({
            amountPaid: order.amountPaid,
            amountRefunded: order.amountRefunded,
            paidAt: order.paidAt,
            periodStart: order.periodStart,
            periodEnd: order.periodEnd,
            now,
            lastRefundAt: lastRefund?.processedAt ?? null,
        });
        const freshPreview = {
            ...preview,
            eligible: fresh.eligible,
            refundAmount: fresh.eligible ? fromPaise(fresh.amountPaise) : "0.00",
            kind: fresh.kind,
            reason: fresh.reason ? REASON_TEXT[fresh.reason] : null,
            explanation: explain(fresh),
        };

        if (!fresh.eligible) {
            throw new CancellationError(
                fresh.reason
                    ? REASON_TEXT[fresh.reason]
                    : "This plan cannot be refunded.",
                409,
                "not_eligible",
                freshPreview,
            );
        }
        if (fresh.amountPaise !== toPaise(params.expectedRefund)) {
            throw new CancellationError(
                "The refund amount changed. Review and confirm again.",
                409,
                "stale_amount",
                freshPreview,
            );
        }

        const [active] = await tx
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
                    ne(paymentRefunds.kind, "external"),
                ),
            )
            .limit(1);
        if (active) {
            throw new CancellationError(
                "A refund for this payment is already in progress.",
                409,
                "already_in_progress",
                freshPreview,
            );
        }

        const kind = fresh.kind ?? "prorated";
        const [row] = await tx
            .insert(paymentRefunds)
            .values({
                paymentOrderId: order.id,
                userId: params.userId,
                appSubscriptionId: subscription.id,
                kind,
                status: "requested",
                amount: fromPaise(fresh.amountPaise),
                currency: order.currency,
                speedRequested: "normal",
                requestedBy: "user",
                calc: {
                    policy: "7d-full-then-prorated",
                    paid: order.amountPaid,
                    periodStart: order.periodStart?.toISOString() ?? null,
                    periodEnd: order.periodEnd?.toISOString() ?? null,
                    now: now.toISOString(),
                    unusedDays: fresh.unusedDays,
                    totalDays: fresh.totalDays,
                },
            })
            .returning({ id: paymentRefunds.id });

        return {
            rowId: row.id,
            order,
            amountPaise: fresh.amountPaise,
            kind,
            preview: freshPreview,
        };
    });

    let providerRefund;
    try {
        providerRefund = await createRazorpayRefund(
            {
                paymentId: prepared.order.providerPaymentId as string,
                amountPaise: Number(prepared.amountPaise),
                idempotencyKey: `rfnd-${prepared.rowId}`,
                notes: {
                    refundId: prepared.rowId,
                    orderId: prepared.order.providerOrderId,
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
            throw new CancellationError(
                "Razorpay could not process this refund. Nothing was charged and your plan is unchanged.",
                400,
                "provider_rejected",
                prepared.preview,
            );
        }

        // A timeout may still have created the refund. Leave the row
        // `requested`; the webhook or reconciler settles it with the same key.
        throw new CancellationError(
            "We could not confirm the refund. Check your billing page shortly; do not retry yet.",
            503,
            "provider_timeout",
            prepared.preview,
        );
    }

    const status = refundStatusFromProvider(providerRefund.status);
    if (status === "failed") {
        await db
            .update(paymentRefunds)
            .set({
                status: "failed",
                errorCode: "REFUND_FAILED",
                updatedAt: new Date(),
            })
            .where(eq(paymentRefunds.id, prepared.rowId));
        throw new CancellationError(
            "Razorpay could not process this refund. Your plan is unchanged.",
            400,
            "provider_rejected",
            prepared.preview,
        );
    }

    const result = await applyProviderRefund({
        providerPaymentId: prepared.order.providerPaymentId as string,
        providerRefundId: providerRefund.id,
        amountPaise: providerRefund.amount,
        currency: providerRefund.currency ?? prepared.order.currency,
        status,
        refundId: prepared.rowId,
        requestedBy: "user",
        kind: prepared.kind,
        speedRequested: "normal",
        applyWhenPending: true,
        endPlan: true,
        cancelReason: params.reason ?? null,
    });

    if (
        !result.applied &&
        result.reason !== "already_processed" &&
        result.reason !== "pending"
    ) {
        console.error("[refunds] Accepted refund could not be recorded:", {
            refundId: providerRefund.id,
            reason: result.reason,
        });
        throw new CancellationError(
            "The refund was created but could not be recorded. Contact support.",
            500,
            "not_recorded",
            prepared.preview,
        );
    }

    const [profile] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, params.userId))
        .limit(1);

    await sendRefundConfirmation({
        email: profile?.email ?? null,
        planName: prepared.preview.planName ?? "paid",
        amount: fromPaise(prepared.amountPaise),
        currency: prepared.order.currency,
        refundId: providerRefund.id,
    });

    return {
        refundId: prepared.rowId,
        providerRefundId: providerRefund.id,
        amount: fromPaise(prepared.amountPaise),
        currency: prepared.order.currency,
        status: providerRefund.status,
        planEnded: result.endedPlan,
    };
}
