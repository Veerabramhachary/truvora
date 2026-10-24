import { db } from "@/db";
import { featureUsage } from "@/db/schema/feature-usage";
import { FeatureLimits } from "@/db/schema/plans";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getSubscriptionGate } from "./subscription";
import { subscriptions } from "@/db/schema/schema";

type LimitInfo = {
    limit: number;
    interval: "month" | "year" | "none";
};

export function getPeriod(
    interval: "month" | "year" | "none",
    date: Date = new Date(),
): string | null {
    if (interval === "none") return null;
    if (interval === "month") {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return `${year}-${month}`
    }
    if (interval === "year") {
        const year = date.getFullYear();
        return `${year}`;
    }
    return null;
}

export async function getFeatureLimit(userId: string, featureKey: keyof FeatureLimits): Promise<FeatureLimits[typeof featureKey] | null> {
    const gate = await getSubscriptionGate();
    if (!gate) return null;
    return gate.checkFeatures(featureKey);
}

export const getCurrentCountForStaticCap = async (
    userId: string,
    feature: string,
): Promise<number> => {
    if (feature === "subscriptions") {
        const now = new Date();
        const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(subscriptions)
            .where(
                and(
                    eq(subscriptions.userId, userId),
                    eq(subscriptions.active, true),
                    lte(subscriptions.startDate, now),
                    gte(subscriptions.endDate, now),
                    isNull(subscriptions.deactivatedAt),
                ),
            );
        return result[0]?.count ?? 0;
    }
    return 0;
};

export const FeatureUsage = async (
    userId: string,
    feature: string,
    period: string,
): Promise<number> => {
    const result = await db
        .select({ count: featureUsage.count })
        .from(featureUsage)
        .where(
            and(
                eq(featureUsage.userId, userId),
                eq(featureUsage.feature, feature),
                eq(featureUsage.period, period),
            ),
        )
        .limit(1);

    return result[0]?.count ?? 0;
};

async function getCurrentUsage(
    userId: string,
    feature: string,
    period: string,
): Promise<number> {
    const result = await db
        .select({ count: featureUsage.count })
        .from(featureUsage)
        .where(
            and(
                eq(featureUsage.userId, userId),
                eq(featureUsage.feature, feature),
                eq(featureUsage.period, period),
            ),
        )
        .limit(1);

    return result[0]?.count ?? 0;
}

async function incrementUsage(
    userId: string,
    feature: string,
    period: string,
    quantity: number = 1,
) {
    const result = await db
        .insert(featureUsage)
        .values({
            userId,
            feature,
            period,
            count: quantity,
        })
        .onConflictDoUpdate({
            target: [
                featureUsage.userId,
                featureUsage.feature,
                featureUsage.period,
            ],
            set: {
                count: sql`${featureUsage.count} + ${quantity}`,
                updatedAt: new Date(),
            },
        })
        .returning({ count: featureUsage.count });

    return result[0]?.count ?? quantity;
}

export async function canUseFeature(
    userId: string,
    featureKey: keyof FeatureLimits,
    quantity: number = 1,
    consume: boolean = false,
): Promise<boolean> {
    // 1. Get active subscription and plan limits
    const gate = await getSubscriptionGate(); // now cached!
    if (!gate) return false; // no active subscription

    const limitDef = gate.checkFeatures(featureKey);

    // If the feature is not defined in the plan, deny access (or treat as false)
    if (limitDef === null || limitDef === undefined) return false;

    // Handle boolean features (earlyAccess, webhooks, etc.)
    if (typeof limitDef === "boolean") {
        return limitDef; // true means allowed
    }

    // Handle features with structured limits (exports, subscriptions, etc.)
    // We expect an object with limit and interval
    if (
        typeof limitDef === "object" &&
        "limit" in limitDef &&
        "interval" in limitDef
    ) {
        const { limit, interval } = limitDef as LimitInfo;

        // Unlimited (interval 'none' or limit maybe -1?)
        if (interval === "none" || limit === -1) return true;

        const period = getPeriod(interval);
        if (!period) return true; // no period means unlimited? adjust as needed

        // Get current usage
        const current = await getCurrentUsage(
            userId,
            featureKey as string,
            period,
        );

        if (current + quantity > limit) {
            return false; // would exceed limit
        }

        // If we should consume the usage, do it atomically
        if (consume) {
            // But careful: between check and consume, another request could sneak in.
            // Better to do a single atomic operation that checks and increments.
            // We'll handle that in a separate transaction function.
            await incrementUsage(
                userId,
                featureKey as string,
                period,
                quantity,
            );
        }

        return true;
    }


    // Fallback: if it's a number (e.g., subscriptions limit), treat as cap?
    if (typeof limitDef === "number") {
        const current = await getCurrentCountForStaticCap(
            userId,
            featureKey as string,
        );
        if (current + quantity > limitDef) return false;

        return true;
    }

    if (typeof limitDef === "object" && "limit" in limitDef) {
        const { limit, interval } = limitDef as {
            limit: number;
            interval?: string;
        };

        if (interval) {
            // Narrow instead of casting to `any`. An interval outside these
            // three values falls through `getPeriod` and returns null, which
            // the `!period` branch below already treats as "unbounded".
            const period =
                interval === "month" ||
                interval === "year" ||
                interval === "none"
                    ? getPeriod(interval)
                    : null;
            if (!period) return true;
            const current = await getCurrentUsage(
                userId,
                featureKey as string,
                period,
            );
            if (current + quantity > limit) return false;
            if (consume) {
                await incrementUsage(
                    userId,
                    featureKey as string,
                    period,
                    quantity,
                );
            }

            return true;
        }

        const current = await getCurrentCountForStaticCap(
            userId,
            featureKey as string,
        );
        if (current + quantity > limit) return false;
        return true;
    }
    return false;
}

// Atomic check-and-consume (recommended)
export async function tryConsumeFeature(
    userId: string,
    featureKey: keyof FeatureLimits,
    quantity: number = 1,
): Promise<boolean> {
    const gate = await getSubscriptionGate();
    if (!gate) return false;

    const limitDef = gate.checkFeatures(featureKey);
    if (!limitDef) return false;
    if (typeof limitDef === "boolean") return limitDef; // can't consume boolean features

    if (typeof limitDef === "number") {
        const current = await getCurrentCountForStaticCap(
            userId,
            featureKey as string,
        );
        return current + quantity <= limitDef;
    }

    if (
        typeof limitDef === "object" &&
        "limit" in limitDef &&
        "interval" in limitDef
    ) {
        const { limit, interval } = limitDef as LimitInfo;
        if (interval) {
            if (interval === "none" || limit === -1) return true;

            const period = getPeriod(interval);
            if (!period) return true;

            if (quantity > limit) return false;

            // Let Postgres serialize the insert/update for the unique usage
            // key. A SELECT FOR UPDATE cannot lock a row before the first use,
            // which allowed concurrent first exports to bypass the limit.
            const consumed = await db
                .insert(featureUsage)
                .values({
                    userId,
                    feature: featureKey as string,
                    period,
                    count: quantity,
                })
                .onConflictDoUpdate({
                    target: [
                        featureUsage.userId,
                        featureUsage.feature,
                        featureUsage.period,
                    ],
                    set: {
                        count: sql`${featureUsage.count} + ${quantity}`,
                        updatedAt: new Date(),
                    },
                    setWhere: sql`${featureUsage.count} + ${quantity} <= ${limit}`,
                })
                .returning({ id: featureUsage.id });

            return consumed.length > 0;
        } else {
            const current = await getCurrentCountForStaticCap(
                userId,
                featureKey as string,
            );
            return current + quantity <= limit;
        }
    }

    return false;
}
