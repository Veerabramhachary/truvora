import { and, eq, gt, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema/schema";
import { featureUsage } from "@/db/schema/feature-usage";

/**
 * THE definition of an "active" subscription (F-04).
 *
 * A subscription counts as active right now when ALL of these hold:
 *   1. its `active` flag is on,
 *   2. `startDate <= now <= endDate`,
 *   3. it has not been deactivated (`deactivatedAt IS NULL`).
 *
 * The dashboard, the subscription list, the plan limit, the export status and
 * the reminder cron must all use this one condition so they can never
 * disagree. Do not re-write it inline.
 *
 * `now` is passed in (instead of SQL `NOW()`) so one request evaluates every
 * query against the same instant.
 */
export function activeSubscriptionNow(now: Date = new Date()): SQL {
    return and(
        eq(subscriptions.active, true),
        lte(subscriptions.startDate, now),
        gte(subscriptions.endDate, now),
        isNull(subscriptions.deactivatedAt),
    )!;
}

/**
 * Point-in-time variant, used for "how many were active at the end of last
 * month". The `active` flag only stores the current state and has no history,
 * so history is judged from the dates alone: started on or before `asOf`, not
 * yet ended, and not deactivated before `asOf`.
 */
export function activeSubscriptionAt(asOf: Date): SQL {
    return and(
        lte(subscriptions.startDate, asOf),
        gte(subscriptions.endDate, asOf),
        or(
            isNull(subscriptions.deactivatedAt),
            gt(subscriptions.deactivatedAt, asOf),
        ),
    )!;
}

/** `active` as a boolean column for SELECT lists (list screen, export). */
export function activeSubscriptionFlag(now: Date = new Date()) {
    return sql<boolean>`CASE WHEN ${activeSubscriptionNow(now)} THEN TRUE ELSE FALSE END`;
}

/** Plain-JS mirror of {@link activeSubscriptionNow}, kept for tests and UI. */
export function isSubscriptionActiveNow(
    row: {
        active: boolean;
        startDate: Date;
        endDate: Date;
        deactivatedAt: Date | null;
    },
    now: Date = new Date(),
): boolean {
    return (
        row.active &&
        row.startDate <= now &&
        row.endDate >= now &&
        row.deactivatedAt === null
    );
}

type Executor = Pick<typeof db, "select" | "insert">;

/**
 * Number of active subscriptions a user has across all of their ledgers.
 * This is what the plan limit is measured against.
 */
export async function countActiveSubscriptions(
    executor: Executor,
    userId: string,
    now: Date = new Date(),
): Promise<number> {
    const [row] = await executor
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), activeSubscriptionNow(now)));
    return row?.count ?? 0;
}

/** Keeps the stored usage counter equal to {@link countActiveSubscriptions}. */
export async function syncActiveSubscriptionUsage(
    executor: Executor,
    userId: string,
    now: Date = new Date(),
): Promise<number> {
    const count = await countActiveSubscriptions(executor, userId, now);
    await executor
        .insert(featureUsage)
        .values({ userId, feature: "subscriptions", period: "active", count })
        .onConflictDoUpdate({
            target: [featureUsage.userId, featureUsage.feature, featureUsage.period],
            set: { count, updatedAt: now },
        });
    return count;
}
