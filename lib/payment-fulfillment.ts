import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { paymentTransactions } from "@/db/schema/appTransactions";
import { paymentOrders } from "@/db/schema/payment-orders";
import { platformDiscountRedemptions } from "@/db/schema/platform-discount-redemptions";
import { addBillingInterval } from "@/lib/billing-period";
import { toPaise } from "@/lib/money";

export class PaymentFulfillmentError extends Error {
    readonly status: 400 | 404 | 409;

    constructor(message: string, status: 400 | 404 | 409) {
        super(message);
        this.name = "PaymentFulfillmentError";
        this.status = status;
    }
}

/**
 * Grants the purchased plan exactly once.
 *
 * Every write is inside one transaction, taking the user advisory lock and
 * then the order row, in the same order every billing mutation uses (§5.4), so
 * the browser `verify` call and the Razorpay webhook can arrive at the same
 * time without granting the plan twice. A previously-paid order is a no-op,
 * including after a refund (the order stays `paid`).
 */
export async function fulfillPaymentOrder(params: {
    providerOrderId: string;
    providerPaymentId?: string | null;
    amountPaise?: number | null;
    currency?: string | null;
}): Promise<{ alreadyProcessed: boolean; planName: string }> {
    return db.transaction(async (tx) => {
        /*
          Lock order (§5.4): user advisory lock → order row → subscription row.
          The owner id is read before the advisory lock because the lock key is
          derived from it; it never changes.
        */
        const [owner] = await tx
            .select({ userId: paymentOrders.userId })
            .from(paymentOrders)
            .where(eq(paymentOrders.providerOrderId, params.providerOrderId))
            .limit(1);

        if (!owner) {
            throw new PaymentFulfillmentError("Payment order not found", 404);
        }

        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${owner.userId}))`,
        );

        const [order] = await tx
            .select()
            .from(paymentOrders)
            .where(eq(paymentOrders.providerOrderId, params.providerOrderId))
            .limit(1)
            .for("update");

        if (!order) {
            throw new PaymentFulfillmentError("Payment order not found", 404);
        }

        const [plan] = await tx
            .select()
            .from(plans)
            .where(eq(plans.id, order.planId))
            .limit(1);

        if (!plan) {
            throw new PaymentFulfillmentError("Plan not found", 404);
        }

        if (order.status === "paid") {
            return { alreadyProcessed: true, planName: plan.name };
        }

        if (params.amountPaise != null) {
            if (BigInt(params.amountPaise) !== toPaise(order.amount)) {
                throw new PaymentFulfillmentError(
                    "Payment amount does not match the order",
                    400,
                );
            }
        }

        if (params.currency && params.currency.toUpperCase() !== order.currency.toUpperCase()) {
            throw new PaymentFulfillmentError(
                "Payment currency does not match the order",
                400,
            );
        }

        if (!plan.isActive) {
            // The customer may already have been charged. Leave the order open
            // and log loudly so ops can refund or re-activate the plan; never
            // silently grant a withdrawn plan.
            console.error(
                "[payments] Paid order references an inactive plan:",
                order.providerOrderId,
            );
            throw new PaymentFulfillmentError(
                "This plan is no longer available",
                409,
            );
        }

        const now = new Date();
        const [existing] = await tx
            .select({
                id: app_subscriptions.id,
                planId: app_subscriptions.planId,
                status: app_subscriptions.status,
                currentPeriodStart: app_subscriptions.currentPeriodStart,
                currentPeriodEnd: app_subscriptions.currentPeriodEnd,
            })
            .from(app_subscriptions)
            .where(eq(app_subscriptions.userId, order.userId))
            .limit(1);

        // Paying for the same plan again is a renewal, not a replacement: keep
        // the unused time and extend from the current end. Moving to a
        // different plan starts a fresh period from now (no proration yet).
        const samePlanRenewal =
            existing?.planId === plan.id &&
            (existing.status === "active" || existing.status === "trialing") &&
            existing.currentPeriodEnd > now;

        if (
            existing?.planId &&
            existing.planId !== plan.id &&
            (existing.status === "active" || existing.status === "trialing") &&
            existing.currentPeriodEnd > now
        ) {
            const [existingPlan] = await tx
                .select({ price: plans.price })
                .from(plans)
                .where(eq(plans.id, existing.planId))
                .limit(1);

            if (existingPlan && Number(existingPlan.price) > 0) {
                throw new PaymentFulfillmentError(
                    "An active paid plan already covers this period. The payment cannot replace it.",
                    409,
                );
            }
        }
        // The subscription row keeps one period; a same-plan renewal extends
        // it from the current end. The order row records only the slice this
        // payment bought, which is what a refund is prorated over.
        const periodStart = samePlanRenewal
            ? existing.currentPeriodStart
            : now;
        const grantStart = samePlanRenewal ? existing.currentPeriodEnd : now;
        const periodEnd = addBillingInterval(
            grantStart,
            plan.interval,
            plan.intervalCount,
        );

        const planSnapshot = {
            name: plan.name,
            price: Number(plan.price),
            currency: plan.currency,
            interval: plan.interval,
            intervalCount: plan.intervalCount,
        };

        let subscriptionId: string;
        if (existing) {
            subscriptionId = existing.id;
            await tx
                .update(app_subscriptions)
                .set({
                    planId: plan.id,
                    planSnapshot,
                    status: "active",
                    provider: "razorpay",
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    currentPaymentOrderId: order.id,
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                    cancelReason: null,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(app_subscriptions.id, existing.id),
                        eq(app_subscriptions.userId, order.userId),
                    ),
                );
        } else {
            const [created] = await tx
                .insert(app_subscriptions)
                .values({
                    userId: order.userId,
                    planId: plan.id,
                    planSnapshot,
                    status: "active",
                    provider: "razorpay",
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    currentPaymentOrderId: order.id,
                    cancelAtPeriodEnd: false,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning({ id: app_subscriptions.id });
            subscriptionId = created.id;
        }

        await tx
            .update(paymentOrders)
            .set({
                status: "paid",
                providerPaymentId: params.providerPaymentId ?? null,
                amountPaid: order.amount,
                periodStart: grantStart,
                periodEnd,
                paidAt: now,
                failureReason: null,
                updatedAt: now,
            })
            .where(eq(paymentOrders.id, order.id));

        // Mark the platform discount redemption as consumed now that the
        // order is paid (one redemption per user total). The link and the
        // amount are stored so a refund can be traced back to this order.
        if (order.discountId) {
            await tx
                .update(platformDiscountRedemptions)
                .set({
                    status: "completed",
                    redeemedAt: now,
                    paymentOrderId: order.id,
                    amountOff: order.discountAmount ?? null,
                    currency: order.discountCurrency ?? order.currency,
                })
                .where(
                    and(
                        eq(
                            platformDiscountRedemptions.platformDiscountId,
                            order.discountId,
                        ),
                        eq(platformDiscountRedemptions.userId, order.userId),
                        eq(platformDiscountRedemptions.status, "pending"),
                    ),
                );
        }

        const invoiceNumber = `TV-${now
            .toISOString()
            .slice(0, 10)
            .replaceAll("-", "")}-${order.id}`;

        const [invoice] = await tx
            .insert(paymentInvoices)
            .values({
                subscriptionId,
                providerInvoiceId: `razorpay:${order.providerOrderId}`,
                invoiceNumber,
                amountDue: order.amount,
                amountPaid: order.amount,
                currency: order.currency,
                status: "paid",
                dueDate: now,
                paidAt: now,
                lines: [
                    {
                        description: `${plan.name} — ${plan.interval} plan`,
                        amount: Number(order.amount),
                    },
                ],
                metadata: {
                    provider: "razorpay",
                    orderId: order.providerOrderId,
                },
            })
            .onConflictDoNothing()
            .returning({ id: paymentInvoices.id });

        await tx
            .insert(paymentTransactions)
            .values({
                subscriptionsId: subscriptionId,
                invoiceId: invoice?.id ?? null,
                type: "payment",
                amount: order.amount,
                currency: order.currency,
                status: "succeeded",
                paymentMethod: "razorpay",
                idempotencyKey: `razorpay:${
                    params.providerPaymentId ?? order.providerOrderId
                }`,
                providerTransactionId:
                    params.providerPaymentId ?? order.providerOrderId,
                metadata: {
                    provider: "razorpay",
                    orderId: order.providerOrderId,
                    planId: plan.id,
                },
            })
            .onConflictDoNothing();

        return { alreadyProcessed: false, planName: plan.name };
    });
}

/** Records a failed attempt without ever downgrading an already-paid order. */
export async function recordPaymentFailure(params: {
    providerOrderId: string;
    reason?: string | null;
}): Promise<void> {
    const reason = (params.reason ?? "")
        .replace(/[^\w\s:.,-]/g, "")
        .trim()
        .slice(0, 200);

    await db
        .update(paymentOrders)
        .set({
            status: "failed",
            failureReason: reason || null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(paymentOrders.providerOrderId, params.providerOrderId),
                inArray(paymentOrders.status, ["created", "attempted"]),
            ),
        );
}

/** Owner-scoped lookup used by the success/failure pages. */
export async function getPaymentOrderForUser(
    userId: string,
    providerOrderId: string,
) {
    const [row] = await db
        .select({
            order: paymentOrders,
            planName: plans.name,
            planInterval: plans.interval,
            planIntervalCount: plans.intervalCount,
        })
        .from(paymentOrders)
        .innerJoin(plans, eq(paymentOrders.planId, plans.id))
        .where(
            and(
                eq(paymentOrders.userId, userId),
                eq(paymentOrders.providerOrderId, providerOrderId),
            ),
        )
        .limit(1);

    return row ?? null;
}
