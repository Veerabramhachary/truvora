import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { paymentTransactions } from "@/db/schema/appTransactions";
import { paymentOrders } from "@/db/schema/payment-orders";
import { paymentRefunds } from "@/db/schema/payment-refunds";
import { app_subscriptions } from "@/db/schema/plans";
import { platformDiscountRedemptions } from "@/db/schema/platform-discount-redemptions";
import { fromPaise, toPaise } from "@/lib/money";

export type ProviderRefundStatus = "pending" | "processed" | "failed";

export type RefundApplyReason =
    | "order_not_found"
    | "order_not_paid"
    | "currency_mismatch"
    | "over_refund"
    | "already_processed"
    | "pending"
    | "failed";

export type RefundApplyResult = {
    applied: boolean;
    endedPlan: boolean;
    /** False when a replay found the work already done (safe to acknowledge). */
    changed: boolean;
    reason?: RefundApplyReason;
};

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Razorpay's `pending` and `processed` both mean the refund was accepted. */
export function refundStatusFromProvider(status: string): ProviderRefundStatus {
    if (status === "processed") return "processed";
    if (status === "failed") return "failed";
    return "pending";
}

/** `notes` is an object for our refunds but can be `[]` in provider events. */
export function refundIdFromNotes(notes: unknown): string | null {
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) return null;
    const value = (notes as Record<string, unknown>).refundId;
    return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

/**
 * Applies one Razorpay refund event to the order, subscription and accounting
 * rows (§5.8). Callers are webhooks, the ops script and cancel-now, so this
 * must be safe to replay: the `payment_refunds` row is the state machine and
 * the accounting row's idempotency key is the second guard.
 *
 * A refund ends the plan when it is full **and** the refunded order funds the
 * current period, or when the caller passes `endPlan` (cancel-now; access ends
 * on acceptance, not when the money lands). Refunding an old order after a
 * re-purchase must not cancel the new, paid period.
 *
 * `applied = true` does not mean a plan ended; check `endedPlan`.
 */
export async function applyProviderRefund(params: {
    providerPaymentId: string;
    providerRefundId: string;
    amountPaise: number;
    currency?: string | null;
    status: ProviderRefundStatus;
    notes?: unknown;
    /** Local `payment_refunds.id`, used by our own refunds and the ops tool. */
    refundId?: string | null;
    requestedBy?: "user" | "ops" | "provider";
    kind?: "full_window" | "prorated" | "external";
    speedRequested?: string;
    /** Cancel-now: a provider `pending` still revokes access and records money. */
    applyWhenPending?: boolean;
    /** Cancel-now always ends the plan; webhooks use the full-refund rule. */
    endPlan?: boolean;
    /** Optional short reason from the cancel dialog. */
    cancelReason?: string | null;
}): Promise<RefundApplyResult> {
    return db.transaction(async (tx) => {
        const [owner] = await tx
            .select({ id: paymentOrders.id, userId: paymentOrders.userId })
            .from(paymentOrders)
            .where(eq(paymentOrders.providerPaymentId, params.providerPaymentId))
            .limit(1);

        if (!owner) {
            return {
                applied: false,
                endedPlan: false,
                changed: false,
                reason: "order_not_found",
            };
        }

        // Lock order (§5.4): user advisory lock → order row → subscription row.
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${owner.userId}))`,
        );

        const [order] = await tx
            .select()
            .from(paymentOrders)
            .where(eq(paymentOrders.id, owner.id))
            .limit(1)
            .for("update");

        if (!order) {
            return {
                applied: false,
                endedPlan: false,
                changed: false,
                reason: "order_not_found",
            };
        }

        // Covers both a never-completed checkout and an auto-refund of a payment
        // Razorpay never captured. Neither is money we may refund locally.
        if (order.status !== "paid") {
            return {
                applied: false,
                endedPlan: false,
                changed: false,
                reason: "order_not_paid",
            };
        }

        if (
            params.currency &&
            params.currency.toUpperCase() !== order.currency.toUpperCase()
        ) {
            return {
                applied: false,
                endedPlan: false,
                changed: false,
                reason: "currency_mismatch",
            };
        }

        const refundId =
            (params.refundId && UUID_PATTERN.test(params.refundId)
                ? params.refundId
                : null) ?? refundIdFromNotes(params.notes);

        const [existing] = await tx
            .select()
            .from(paymentRefunds)
            .where(
                and(
                    eq(paymentRefunds.paymentOrderId, order.id),
                    or(
                        eq(paymentRefunds.providerRefundId, params.providerRefundId),
                        refundId ? eq(paymentRefunds.id, refundId) : undefined,
                    ),
                ),
            )
            .limit(1);

        const [subscription] = await tx
            .select()
            .from(app_subscriptions)
            .where(eq(app_subscriptions.userId, order.userId))
            .orderBy(desc(app_subscriptions.currentPeriodEnd))
            .limit(1);

        const now = new Date();

        /**
         * Revokes access for the current funding order. Safe to call on every
         * replay: once canceled, the status guard makes it a no-op. Cancel-now
         * needs this even when a webhook already recorded the processed refund,
         * otherwise a prorated refund accepted by Razorpay before TX2 would
         * leave the user with access for the rest of the period.
         */
        const endPlanIfCurrent = async (shouldEnd: boolean) => {
            if (
                !shouldEnd ||
                !subscription ||
                subscription.currentPaymentOrderId !== order.id ||
                (subscription.status !== "active" &&
                    subscription.status !== "trialing")
            ) {
                return false;
            }
            await tx
                .update(app_subscriptions)
                .set({
                    status: "canceled",
                    canceledAt: now,
                    currentPeriodEnd: now,
                    cancelAtPeriodEnd: false,
                    cancelReason: params.cancelReason ?? null,
                    updatedAt: now,
                })
                .where(eq(app_subscriptions.id, subscription.id));
            return true;
        };

        if (existing?.status === "processed") {
            const endedPlan = await endPlanIfCurrent(params.endPlan === true);
            return {
                applied: false,
                endedPlan,
                changed: endedPlan,
                reason: "already_processed",
            };
        }

        const shouldApply =
            params.status === "processed" ||
            (params.status === "pending" && params.applyWhenPending === true);

        // Pending/failed events only move the workflow row; no money changes
        // until Razorpay reports `processed` (or cancel-now accepted a pending).
        if (!shouldApply) {
            if (existing?.status === params.status) {
                return {
                    applied: false,
                    endedPlan: false,
                    changed: false,
                    reason: params.status === "pending" ? "pending" : "failed",
                };
            }

            if (existing) {
                await tx
                    .update(paymentRefunds)
                    .set({
                        status: params.status,
                        providerRefundId: params.providerRefundId,
                        amount: fromPaise(BigInt(params.amountPaise)),
                        appSubscriptionId:
                            existing.appSubscriptionId ?? subscription?.id ?? null,
                        processedAt: null,
                        errorCode: null,
                        updatedAt: now,
                    })
                    .where(eq(paymentRefunds.id, existing.id));
            } else {
                await tx
                    .insert(paymentRefunds)
                    .values({
                        paymentOrderId: order.id,
                        userId: order.userId,
                        appSubscriptionId: subscription?.id ?? null,
                        kind: params.kind ?? "external",
                        status: params.status,
                        amount: fromPaise(BigInt(params.amountPaise)),
                        currency: order.currency,
                        providerRefundId: params.providerRefundId,
                        speedRequested: params.speedRequested ?? "normal",
                        requestedBy: params.requestedBy ?? "provider",
                        updatedAt: now,
                    })
                    .onConflictDoNothing();
            }

            return {
                applied: false,
                endedPlan: false,
                changed: true,
                reason: params.status === "pending" ? "pending" : "failed",
            };
        }

        const paidPaise = toPaise(order.amountPaid);
        const totalPaise =
            toPaise(order.amountRefunded) + BigInt(params.amountPaise);

        if (totalPaise > paidPaise) {
            // The DB CHECK would reject this too. Acknowledge the webhook but
            // log loudly: over-refunding is a manual investigation.
            console.error("[refunds] Refund exceeds the paid amount:", {
                orderId: order.id,
                refundId: params.providerRefundId,
            });
            return {
                applied: false,
                endedPlan: false,
                changed: false,
                reason: "over_refund",
            };
        }

        const accountingKey = `razorpay:refund:${params.providerRefundId}`;
        const [alreadyAccounted] = await tx
            .select({ id: paymentTransactions.id })
            .from(paymentTransactions)
            .where(eq(paymentTransactions.idempotencyKey, accountingKey))
            .limit(1);

        // A pending refund accepted by cancel-now wrote the money already; a
        // later `refund.processed` must only settle the status. This is the
        // second guard behind the row status.
        if (alreadyAccounted) {
            const endedPlan = await endPlanIfCurrent(params.endPlan === true);
            const statusChanged =
                existing != null && existing.status !== params.status;
            if (statusChanged) {
                await tx
                    .update(paymentRefunds)
                    .set({
                        status: params.status,
                        providerRefundId: params.providerRefundId,
                        processedAt:
                            params.status === "processed" ? now : null,
                        updatedAt: now,
                    })
                    .where(eq(paymentRefunds.id, existing.id));
            }
            return {
                applied: false,
                endedPlan,
                changed: statusChanged || endedPlan,
                reason:
                    params.status === "pending"
                        ? "pending"
                        : "already_processed",
            };
        }

        if (existing) {
            await tx
                .update(paymentRefunds)
                .set({
                    status: params.status,
                    providerRefundId: params.providerRefundId,
                    amount: fromPaise(BigInt(params.amountPaise)),
                    appSubscriptionId:
                        existing.appSubscriptionId ?? subscription?.id ?? null,
                    processedAt: params.status === "processed" ? now : null,
                    errorCode: null,
                    updatedAt: now,
                })
                .where(eq(paymentRefunds.id, existing.id));
        } else {
            const [created] = await tx
                .insert(paymentRefunds)
                .values({
                    paymentOrderId: order.id,
                    userId: order.userId,
                    appSubscriptionId: subscription?.id ?? null,
                    kind: params.kind ?? "external",
                    status: params.status,
                    amount: fromPaise(BigInt(params.amountPaise)),
                    currency: order.currency,
                    providerRefundId: params.providerRefundId,
                    speedRequested: params.speedRequested ?? "normal",
                    requestedBy: params.requestedBy ?? "provider",
                    processedAt: params.status === "processed" ? now : null,
                    updatedAt: now,
                })
                .onConflictDoNothing()
                .returning({ id: paymentRefunds.id });

            if (!created) {
                // A concurrent delivery won the insert and will apply the money.
                return {
                    applied: false,
                    endedPlan: false,
                    changed: false,
                    reason: "already_processed",
                };
            }
        }

        await tx
            .update(paymentOrders)
            .set({
                amountRefunded: fromPaise(totalPaise),
                updatedAt: now,
            })
            .where(eq(paymentOrders.id, order.id));

        const endedPlan = await endPlanIfCurrent(
            params.endPlan ?? totalPaise === paidPaise,
        );

        const [invoice] = await tx
            .select({ id: paymentInvoices.id })
            .from(paymentInvoices)
            .where(
                eq(
                    paymentInvoices.providerInvoiceId,
                    `razorpay:${order.providerOrderId}`,
                ),
            )
            .limit(1);

        // Accounting row. `subscriptions_id` is set so account deletion severs
        // the provider identifiers (B-11); the idempotency key makes replays
        // no-ops even if the refund row is edited manually.
        await tx
            .insert(paymentTransactions)
            .values({
                subscriptionsId: subscription?.id ?? null,
                invoiceId: invoice?.id ?? null,
                type: "refund",
                amount: fromPaise(BigInt(params.amountPaise)),
                currency: order.currency,
                status: "succeeded",
                paymentMethod: "razorpay",
                idempotencyKey: accountingKey,
                providerTransactionId: params.providerRefundId,
                metadata: {
                    provider: "razorpay",
                    orderId: order.providerOrderId,
                    refundId: params.providerRefundId,
                },
            })
            .onConflictDoNothing();

        if (order.discountId) {
            await tx
                .update(platformDiscountRedemptions)
                .set({ status: "refunded", updatedAt: now })
                .where(
                    and(
                        eq(platformDiscountRedemptions.userId, order.userId),
                        eq(
                            platformDiscountRedemptions.platformDiscountId,
                            order.discountId,
                        ),
                        or(
                            eq(
                                platformDiscountRedemptions.paymentOrderId,
                                order.id,
                            ),
                            eq(platformDiscountRedemptions.status, "completed"),
                        ),
                    ),
                );
        }

        return { applied: true, endedPlan, changed: true };
    });
}
