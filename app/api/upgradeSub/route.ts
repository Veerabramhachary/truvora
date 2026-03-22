import { db } from "@/db";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { eq } from "drizzle-orm";

export async function upgradeSubscription(
    subscriptionId: number,
    newPlanId: number,
    prorationBehavior:
        | "always_invoice"
        | "create_prorations" = "create_prorations",
) {
    return await db.transaction(async (tx) => {
        // Fetch subscription with current plan snapshot
        const [sub] = await tx
            .select()
            .from(app_subscriptions)
            .where(eq(app_subscriptions.id, String(subscriptionId)));

        if (!sub) throw new Error("Subscription not found");
        if (sub.status !== "active" && sub.status !== "trialing") {
            throw new Error("Subscription not active");
        }
        if (!sub.planSnapshot) throw new Error("Plan snapshot not found");

        // Fetch new plan
        const [newPlan] = await tx
            .select()
            .from(plans)
            .where(eq(plans.id, String(newPlanId)));
        if (!newPlan) throw new Error("New plan not found");

        const now = new Date();
        const currentPeriodEnd = sub.currentPeriodEnd;

        // If the new plan is more expensive and we need to charge prorated amount
        const currentPrice = Number(sub.planSnapshot.price);
        const newPrice = Number(newPlan.price);

        if (
            newPrice > currentPrice &&
            prorationBehavior === "create_prorations"
        ) {
            // Calculate proration: (newPrice - currentPrice) * (days left / total days)
            const daysLeft = Math.ceil(
                (currentPeriodEnd.getTime() - now.getTime()) /
                    (1000 * 60 * 60 * 24),
            );
            const totalDays = Math.ceil(
                (currentPeriodEnd.getTime() -
                    sub.currentPeriodStart.getTime()) /
                    (1000 * 60 * 60 * 24),
            );

            const prorationAmount =
                ((newPrice - currentPrice) * daysLeft) / totalDays;

            // Create a one-off invoice for the prorated amount
            const invoiceNumber = `INV-${Date.now()}-${sub.id}`;
            await tx.insert(paymentInvoices).values({
                subscriptionId: sub.id,
                invoiceNumber,
                amountDue: prorationAmount.toFixed(2),
                currency: newPlan.currency,
                status: "open",
                lines: [
                    {
                        description: `Prorated upgrade from ${sub.planSnapshot.name} to ${newPlan.name}`,
                        amount: prorationAmount,
                    },
                ],
            });
        }

        // Update subscription with new plan
        await tx
            .update(app_subscriptions)
            .set({
                planId: String(newPlanId),
                planSnapshot: {
                    name: newPlan.name,
                    price: Number(newPlan.price),
                    currency: newPlan.currency,
                    interval: newPlan.interval,
                    intervalCount: newPlan.intervalCount,
                },
                // Optionally keep same period end or reset? Typically keep same period end.
                updatedAt: now,
            })
            .where(eq(app_subscriptions.id, sub.id));
    });
}
