/**
 * Read-only pre-flight for the refund/cancellation work (Step 1).
 *
 *   npx tsx scripts/billing-dry-run.ts
 *
 * It never writes. Use the output to decide whether the unique index on
 * `app_subscriptions.user_id` is safe and which users would need "contact
 * support" instead of self-serve cancel. Only opaque ids are printed; no
 * names, emails or amounts of individual users.
 *
 * It selects only columns that exist before migration 0019, so it can run
 * before `db:migrate`.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { paymentOrders } from "@/db/schema/payment-orders";
import { addBillingInterval } from "@/lib/billing-period";

const DAY_MS = 24 * 60 * 60 * 1000;

type PaidOrderRow = {
    userId: string;
    providerOrderId: string;
    providerPaymentId: string | null;
    amountPaid: string;
    paidAt: Date | null;
    createdAt: Date;
    plan: typeof plans.$inferSelect;
};

function latestPaidOrder(rows: PaidOrderRow[] | undefined): PaidOrderRow | undefined {
    return rows
        ?.slice()
        .sort(
            (a, b) =>
                (b.paidAt ?? b.createdAt).getTime() -
                (a.paidAt ?? a.createdAt).getTime(),
        )[0];
}

async function main() {
    const [duplicateRows, missingPlan, subscriptions, paidOrders] =
        await Promise.all([
            db
                .select({
                    userId: app_subscriptions.userId,
                    rows: sql<number>`count(*)::int`,
                })
                .from(app_subscriptions)
                .groupBy(app_subscriptions.userId)
                .having(sql`count(*) > 1`),
            db
                .select({ count: sql<number>`count(*)::int` })
                .from(app_subscriptions)
                .where(isNull(app_subscriptions.planId)),
            db
                .select({
                    userId: app_subscriptions.userId,
                    status: app_subscriptions.status,
                    currentPeriodEnd: app_subscriptions.currentPeriodEnd,
                })
                .from(app_subscriptions),
            db
                .select({
                    userId: paymentOrders.userId,
                    providerOrderId: paymentOrders.providerOrderId,
                    providerPaymentId: paymentOrders.providerPaymentId,
                    amountPaid: paymentOrders.amountPaid,
                    paidAt: paymentOrders.paidAt,
                    createdAt: paymentOrders.createdAt,
                    plan: plans,
                })
                .from(paymentOrders)
                .innerJoin(plans, eq(paymentOrders.planId, plans.id))
                .where(eq(paymentOrders.status, "paid")),
        ]);

    const now = new Date();
    const subscriptionUsers = new Set(subscriptions.map((row) => row.userId));
    const paidUsers = new Set(paidOrders.map((row) => row.userId));

    const comped = paidOrders.filter(
        (row) =>
            Number(row.amountPaid) === 0 ||
            row.providerOrderId.startsWith("free_"),
    );
    const withoutPaymentId = paidOrders.filter((row) => !row.providerPaymentId);

    const paidOrdersByUser = new Map<string, PaidOrderRow[]>();
    for (const row of paidOrders) {
        const list = paidOrdersByUser.get(row.userId) ?? [];
        list.push(row);
        paidOrdersByUser.set(row.userId, list);
    }
    const multiplePaidOrders = [...paidOrdersByUser.entries()].filter(
        ([, rows]) => rows.length > 1,
    );
    const paidWithoutSubscription = [...paidUsers].filter(
        (userId) => !subscriptionUsers.has(userId),
    );

    /*
      A current paid period should end where the funding order's period ends.
      A mismatch means the row was edited by hand (update-user-plan) or the
      order predates this design; those users get "contact support".
    */
    const irregularPeriods: Array<{ userId: string; driftDays: number }> = [];
    for (const subscription of subscriptions) {
        if (
            (subscription.status !== "active" &&
                subscription.status !== "trialing") ||
            subscription.currentPeriodEnd < now
        ) {
            continue;
        }
        const latest = latestPaidOrder(paidOrdersByUser.get(subscription.userId));
        if (!latest) continue;
        const expectedEnd = addBillingInterval(
            latest.paidAt ?? latest.createdAt,
            latest.plan.interval,
            latest.plan.intervalCount,
        );
        const driftDays =
            Math.abs(
                expectedEnd.getTime() -
                    subscription.currentPeriodEnd.getTime(),
            ) / DAY_MS;
        if (driftDays > 2) {
            irregularPeriods.push({
                userId: subscription.userId,
                driftDays: Math.round(driftDays),
            });
        }
    }

    const [freePlan] = await db
        .select({ name: plans.name, price: plans.price })
        .from(plans)
        .where(and(eq(plans.isActive, true), eq(plans.currency, "INR")))
        .orderBy(plans.price)
        .limit(1);

    const expiredActive = subscriptions.filter(
        (row) => row.status === "active" && row.currentPeriodEnd < now,
    ).length;

    console.log("Billing dry run (read-only)");
    console.log("----------------------------");
    console.log(`Subscription rows:              ${subscriptions.length}`);
    console.log(`Users with a subscription row:  ${subscriptionUsers.size}`);
    console.log(`Rows with no plan:              ${missingPlan[0]?.count ?? 0}`);
    console.log(
        `Users with >1 subscription row: ${duplicateRows.length}` +
            (duplicateRows.length
                ? ` → unique index NOT safe yet: ${duplicateRows
                      .map((row) => `${row.userId} (${row.rows})`)
                      .join(", ")}`
                : " → unique index is safe"),
    );
    console.log(`Active rows already expired:    ${expiredActive}`);
    console.log("");
    console.log(`Paid orders:                    ${paidOrders.length}`);
    console.log(`Users with a paid order:        ${paidUsers.size}`);
    console.log(
        `Paid orders per user >1:        ${multiplePaidOrders.length}` +
            (multiplePaidOrders.length
                ? ` → ${multiplePaidOrders
                      .map(([userId, rows]) => `${userId} (${rows.length})`)
                      .join(", ")}`
                : ""),
    );
    console.log(`₹0 comped paid orders:          ${comped.length}`);
    console.log(`Paid orders without payment id: ${withoutPaymentId.length}`);
    console.log(
        `Paid users without a sub row:   ${paidWithoutSubscription.length}` +
            (paidWithoutSubscription.length
                ? ` → ${paidWithoutSubscription.join(", ")}`
                : ""),
    );
    console.log(
        `Current periods off by >2 days: ${irregularPeriods.length}` +
            (irregularPeriods.length
                ? ` → ${irregularPeriods
                      .map((row) => `${row.userId} (${row.driftDays}d)`)
                      .join(", ")}`
                : ""),
    );
    console.log("");
    console.log(
        freePlan
            ? `Free plan: "${freePlan.name}" at ${freePlan.price} → ${
                  Number(freePlan.price) <= 0
                      ? "OK, gate has a Free fallback"
                      : "NOT free: expired users would get no plan"
              }`
            : "No active INR plan: expired users would get no plan",
    );
}

main()
    .then(closeDb)
    .catch(async (error) => {
        console.error("Dry run failed:", error);
        await closeDb();
        process.exitCode = 1;
    });
