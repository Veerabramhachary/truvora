import { db } from "@/db";
import { auth } from "@clerk/nextjs/server";
import { app_subscriptions, plans, type FeatureLimits } from "@/db/schema/plans";
import { and, asc, eq } from "drizzle-orm";

// Single definition lives next to the `plans.featureLimits` column.
export type { FeatureLimits };

type PlanRow = typeof plans.$inferSelect;
type SubscriptionRow = typeof app_subscriptions.$inferSelect;

function buildGate(plan: PlanRow, subscription: SubscriptionRow | null) {
    return {
        subscription,
        checkFeatures: (feature: keyof FeatureLimits) => {
            const limits = plan?.featureLimits as
                | FeatureLimits
                | undefined;
            return limits ? limits[feature] : null;
        },
    };
}

export async function getSubscriptionGate() {
    const { userId } = await auth();

    if (!userId) return;

    const result = await db
        .select({
            subscription: app_subscriptions,
            plan: plans,
        })
        .from(app_subscriptions)
        .where(
            and(
                eq(app_subscriptions.userId, userId),
                eq(app_subscriptions.status, "active"),
            ),
        )
        .innerJoin(plans, eq(app_subscriptions.planId, plans.id))
        .limit(1);

    const current = result[0];
    if (current && current.subscription.currentPeriodEnd >= new Date()) {
        return buildGate(current.plan, current.subscription);
    }

    /*
      An expired paid period must not keep paid features alive, and it must not
      lock the user out of the free tier either. Fall back to the cheapest
      active plan only when that plan is actually free; otherwise return null
      and let the caller show "no active plan".
    */
    const [fallback] = await db
        .select({ plan: plans })
        .from(plans)
        .where(and(eq(plans.isActive, true), eq(plans.currency, "INR")))
        .orderBy(asc(plans.price))
        .limit(1);

    if (!fallback || Number(fallback.plan.price) > 0) return null;

    return buildGate(fallback.plan, current?.subscription ?? null);
}
