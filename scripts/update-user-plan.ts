import { and, eq, inArray } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";

async function updateUserPlan(userId: string, planId: string) {
    return db.transaction(async (tx) => {
        const [plan] = await tx
            .select()
            .from(plans)
            .where(and(eq(plans.id, planId), eq(plans.isActive, true)))
            .limit(1);

        if (!plan) {
            throw new Error(`Active plan not found: ${planId}`);
        }

        const subscriptions = await tx
            .select({ id: app_subscriptions.id })
            .from(app_subscriptions)
            .where(
                and(
                    eq(app_subscriptions.userId, userId),
                    inArray(app_subscriptions.status, ["active", "trialing"]),
                ),
            );

        if (subscriptions.length !== 1) {
            throw new Error(
                subscriptions.length === 0
                    ? `No active or trialing subscription found for user ${userId}`
                    : `Found ${subscriptions.length} active or trialing subscriptions for user ${userId}; refusing to guess which one to update`,
            );
        }

        const now = new Date();
        const [updated] = await tx
            .update(app_subscriptions)
            .set({
                planId: plan.id,
                planSnapshot: {
                    name: plan.name,
                    price: Number(plan.price),
                    currency: plan.currency,
                    interval: plan.interval,
                    intervalCount: plan.intervalCount,
                },
                updatedAt: now,
            })
            .where(
                and(
                    eq(app_subscriptions.id, subscriptions[0].id),
                    eq(app_subscriptions.userId, userId),
                ),
            )
            .returning({ id: app_subscriptions.id });

        if (!updated) {
            throw new Error("Subscription update did not affect a row");
        }

        return { subscriptionId: updated.id, planName: plan.name };
    });
}

async function main() {
    const [, , userId, planId] = process.argv;
    if (!userId || !planId || process.argv.length !== 4) {
        throw new Error(
            "Usage: npm run update-user-plan -- <clerk-user-id> <plan-id>",
        );
    }

    const result = await updateUserPlan(userId, planId);
    console.log(
        `Updated subscription ${result.subscriptionId} for user ${userId} to ${result.planName} in the database.`,
    );
}

main()
    .catch((error: unknown) => {
        console.error(
            "Failed to update user plan:",
            error instanceof Error ? error.message : error,
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDb();
    });
