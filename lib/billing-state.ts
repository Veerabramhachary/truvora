import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";

type PlanRow = typeof plans.$inferSelect;
type SubscriptionRow = typeof app_subscriptions.$inferSelect;

export type BillingStatus = "free" | "paid" | "expired" | "canceled";

export type BillingState = {
    /** Plan that grants features right now (Free when the paid period is over). */
    plan: PlanRow | null;
    /** Plan on the user's row, even after it expired or was canceled. */
    subscriptionPlan: PlanRow | null;
    subscription: SubscriptionRow | null;
    status: BillingStatus;
    isPaid: boolean;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    /** Order that funds the current period; refunds and cancels act on it. */
    fundingOrderId: string | null;
};

/**
 * THE definition of a user's billing state (F-04 / B-03).
 *
 * `billingStatusFor` classifies the period; `getBillingState` resolves the plan
 * that actually grants features (Free once the paid period is over). The gate,
 * the billing page, the checkout page and the order route all read this
 * instead of writing their own status/date condition, so they can never
 * disagree. Trials count as active; they are unused today but the column
 * exists.
 */
export function billingStatusFor(
    subscription: Pick<SubscriptionRow, "status" | "currentPeriodEnd"> | null,
    now: Date = new Date(),
): BillingStatus {
    if (!subscription) return "free";
    if (subscription.status === "canceled") return "canceled";
    if (
        subscription.status !== "active" &&
        subscription.status !== "trialing"
    ) {
        return "expired";
    }
    return subscription.currentPeriodEnd >= now ? "paid" : "expired";
}

export async function getBillingState(
    userId: string,
    now: Date = new Date(),
): Promise<BillingState> {
    const [row] = await db
        .select({ subscription: app_subscriptions, plan: plans })
        .from(app_subscriptions)
        .innerJoin(plans, eq(app_subscriptions.planId, plans.id))
        .where(eq(app_subscriptions.userId, userId))
        // One row per user is the expectation (scripts/billing-dry-run checks
        // it). Until the unique index exists, prefer the period that ends last.
        .orderBy(desc(app_subscriptions.currentPeriodEnd))
        .limit(1);

    const subscription = row?.subscription ?? null;
    const periodStatus = billingStatusFor(subscription, now);
    // Free users also have a current row (far-future period, price 0). They are
    // "free", not "paid", so refund/entitlement code cannot mistake them.
    const onPaidPlan = row ? Number(row.plan.price) > 0 : false;
    const status: BillingStatus =
        periodStatus === "paid" && !onPaidPlan ? "free" : periodStatus;

    return {
        plan:
            periodStatus === "paid"
                ? (row?.plan ?? null)
                : await getFreePlan(),
        subscriptionPlan: row?.plan ?? null,
        subscription,
        status,
        isPaid: status === "paid",
        currentPeriodStart: subscription?.currentPeriodStart ?? null,
        currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
        fundingOrderId: subscription?.currentPaymentOrderId ?? null,
    };
}

/** Cheapest active INR plan, but only when it is actually free. */
async function getFreePlan(): Promise<PlanRow | null> {
    const [row] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.isActive, true), eq(plans.currency, "INR")))
        .orderBy(asc(plans.price))
        .limit(1);

    return row && Number(row.price) <= 0 ? row : null;
}
