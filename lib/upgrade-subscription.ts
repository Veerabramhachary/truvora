import { db } from "@/db";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { and, eq } from "drizzle-orm";
import { fromPaise, toPaise } from "@/lib/money";

export type ProrationBehavior = "always_invoice" | "create_prorations";

export class UpgradeError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "UpgradeError";
        this.status = status;
    }
}

/**
 * Moves a subscription onto a new plan.
 *
 * Every lookup is scoped by `userId` so a caller can never touch a
 * subscription that belongs to somebody else.
 */
export async function upgradeSubscription(params: {
    userId: string;
    subscriptionId: string;
    newPlanId: string;
    prorationBehavior?: ProrationBehavior;
}) {
    const { userId, subscriptionId, newPlanId } = params;
    const prorationBehavior: ProrationBehavior =
        params.prorationBehavior ?? "create_prorations";

    return db.transaction(async (tx) => {
        // Fetch subscription with current plan snapshot, scoped to the owner.
        const [sub] = await tx
            .select()
            .from(app_subscriptions)
            .where(
                and(
                    eq(app_subscriptions.id, subscriptionId),
                    eq(app_subscriptions.userId, userId),
                ),
            );

        if (!sub) {
            throw new UpgradeError("Subscription not found", 404);
        }
        if (sub.status !== "active" && sub.status !== "trialing") {
            throw new UpgradeError("Subscription not active", 400);
        }
        if (!sub.planSnapshot) {
            throw new UpgradeError("Plan snapshot not found", 400);
        }

        // Fetch new plan
        const [newPlan] = await tx
            .select()
            .from(plans)
            .where(eq(plans.id, newPlanId));
        if (!newPlan) {
            throw new UpgradeError("New plan not found", 404);
        }
        if (newPlan.currency !== "INR") {
            throw new UpgradeError("Only INR plans are available", 400);
        }

        const now = new Date();
        const currentPeriodEnd = sub.currentPeriodEnd;
        // Clerk provisions the free plan with a far-future end date to model
        // a non-expiring tier. Once upgraded, start a real billing period for
        // the selected plan instead of carrying that placeholder forward.
        const hasNonExpiringPeriod =
            currentPeriodEnd.getTime() - now.getTime() > 10 * 365 * 24 * 60 * 60 * 1000;
        const upgradedPeriodStart = hasNonExpiringPeriod
            ? now
            : sub.currentPeriodStart;
        const upgradedPeriodEnd = hasNonExpiringPeriod
            ? new Date(now)
            : currentPeriodEnd;
        if (hasNonExpiringPeriod) {
            if (newPlan.interval === "year") {
                upgradedPeriodEnd.setFullYear(
                    upgradedPeriodEnd.getFullYear() + newPlan.intervalCount,
                );
            } else {
                upgradedPeriodEnd.setMonth(
                    upgradedPeriodEnd.getMonth() + newPlan.intervalCount,
                );
            }
        }

        // If the new plan is more expensive and we need to charge prorated amount
        const currentPricePaise = toPaise(String(sub.planSnapshot.price));
        const newPricePaise = toPaise(newPlan.price);

        if (
            newPricePaise > currentPricePaise &&
            prorationBehavior === "create_prorations"
        ) {
            // Calculate proration: (newPrice - currentPrice) * (days left / total days)
            const msPerDay = 1000 * 60 * 60 * 24;
            const daysLeft = Math.ceil(
                (currentPeriodEnd.getTime() - now.getTime()) / msPerDay,
            );
            const totalDays = Math.ceil(
                (currentPeriodEnd.getTime() -
                    sub.currentPeriodStart.getTime()) /
                    msPerDay,
            );

            // Guard against a zero-length billing period, which would make the
            // proration `Infinity` and fail the insert below.
            if (daysLeft > 0 && totalDays > 0) {
                const numerator = (newPricePaise - currentPricePaise) * BigInt(daysLeft);
                const totalDaysBigInt = BigInt(totalDays);
                const prorationAmount = fromPaise(
                    (numerator + totalDaysBigInt / BigInt(2)) / totalDaysBigInt,
                );

                // Create a one-off invoice for the prorated amount
                const invoiceNumber = `INV-${Date.now()}-${sub.id}`;
                await tx.insert(paymentInvoices).values({
                    subscriptionId: sub.id,
                    invoiceNumber,
                    providerInvoiceId: invoiceNumber,
                    amountDue: prorationAmount,
                    currency: newPlan.currency,
                    status: "open",
                    lines: [
                        {
                            description: `Prorated upgrade from ${sub.planSnapshot.name} to ${newPlan.name}`,
                            amount: Number(prorationAmount),
                        },
                    ],
                });
            }
        }

        // Update subscription with new plan
        await tx
            .update(app_subscriptions)
            .set({
                planId: newPlanId,
                planSnapshot: {
                    name: newPlan.name,
                    price: Number(newPlan.price),
                    currency: newPlan.currency,
                    interval: newPlan.interval,
                    intervalCount: newPlan.intervalCount,
                },
                currentPeriodStart: upgradedPeriodStart,
                currentPeriodEnd: upgradedPeriodEnd,
                updatedAt: now,
            })
            .where(
                and(
                    eq(app_subscriptions.id, sub.id),
                    eq(app_subscriptions.userId, userId),
                ),
            );

        return sub.id;
    });
}
