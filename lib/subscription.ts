import { auth } from "@clerk/nextjs/server";
import { app_subscriptions, plans, type FeatureLimits } from "@/db/schema/plans";
import { getBillingState } from "./billing-state";

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

    /*
      One definition of "current plan" (lib/billing-state): paid period → that
      plan, otherwise the free plan. Returning null only when no free plan is
      seeded lets callers show "no active plan" instead of guessing.
    */
    const billing = await getBillingState(userId);
    if (!billing.plan) return null;

    return buildGate(billing.plan, billing.subscription);
}
