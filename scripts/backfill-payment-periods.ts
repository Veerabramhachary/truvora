/**
 * One-off: fill the period and funding-order links the refund flow needs.
 *
 *   npx tsx scripts/backfill-payment-periods.ts           # dry run (default)
 *   npx tsx scripts/backfill-payment-periods.ts --apply   # write changes
 *
 * 1. `payment_orders.period_start/period_end` for paid orders. The period is
 *    derived from `paid_at` plus the plan interval. A same-plan renewal
 *    actually starts at the previous period end; if a user renewed early the
 *    derived start is a few days late. That only changes a prorated refund by
 *    that drift, and such users are reported.
 * 2. `app_subscriptions.current_payment_order_id` for active, unexpired
 *    subscriptions, pointing at the user's latest paid order. A subscription
 *    whose period does not line up with that order (>2 days) is reported and
 *    left unlinked, so cancel shows "contact support" instead of refunding a
 *    guessed amount.
 *
 * Only opaque ids are printed. Safe to re-run: it only fills NULL columns.
 */
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { paymentOrders } from "@/db/schema/payment-orders";
import { addBillingInterval } from "@/lib/billing-period";

const APPLY = process.argv.includes("--apply");
const DAY_MS = 24 * 60 * 60 * 1000;

type PaidOrderRow = {
    order: typeof paymentOrders.$inferSelect;
    plan: typeof plans.$inferSelect;
};

function derivedPeriod(row: PaidOrderRow) {
    const start = row.order.paidAt ?? row.order.createdAt;
    return {
        start,
        end: addBillingInterval(
            start,
            row.plan.interval,
            row.plan.intervalCount,
        ),
    };
}

async function main() {
    const now = new Date();

    const paidOrders = await db
        .select({ order: paymentOrders, plan: plans })
        .from(paymentOrders)
        .innerJoin(plans, eq(paymentOrders.planId, plans.id))
        .where(eq(paymentOrders.status, "paid"));

    const missingPeriods = paidOrders.filter(
        (row) => !row.order.periodStart || !row.order.periodEnd,
    );

    let periodsWritten = 0;
    for (const row of missingPeriods) {
        const { start, end } = derivedPeriod(row);
        if (APPLY) {
            await db
                .update(paymentOrders)
                .set({ periodStart: start, periodEnd: end, updatedAt: now })
                .where(
                    and(
                        eq(paymentOrders.id, row.order.id),
                        or(
                            isNull(paymentOrders.periodStart),
                            isNull(paymentOrders.periodEnd),
                        ),
                    ),
                );
        }
        periodsWritten++;
    }

    const paidByUser = new Map<string, PaidOrderRow[]>();
    for (const row of paidOrders) {
        const list = paidByUser.get(row.order.userId) ?? [];
        list.push(row);
        paidByUser.set(row.order.userId, list);
    }

    const unlinked = await db
        .select({ subscription: app_subscriptions, plan: plans })
        .from(app_subscriptions)
        .innerJoin(plans, eq(app_subscriptions.planId, plans.id))
        .where(
            and(
                inArray(app_subscriptions.status, ["active", "trialing"]),
                gte(app_subscriptions.currentPeriodEnd, now),
                isNull(app_subscriptions.currentPaymentOrderId),
            ),
        );

    // The Free tier row also has a current period but was never paid for.
    const paidUnlinked = unlinked.filter(
        ({ plan }) => Number(plan.price) > 0,
    );

    const noOrder: string[] = [];
    const irregular: string[] = [];
    let linked = 0;

    for (const { subscription } of paidUnlinked) {
        const latest = (paidByUser.get(subscription.userId) ?? [])
            .slice()
            .sort(
                (a, b) =>
                    (b.order.paidAt ?? b.order.createdAt).getTime() -
                    (a.order.paidAt ?? a.order.createdAt).getTime(),
            )[0];

        if (!latest) {
            noOrder.push(subscription.userId);
            continue;
        }

        const { end } = derivedPeriod(latest);
        const driftDays =
            Math.abs(end.getTime() - subscription.currentPeriodEnd.getTime()) /
            DAY_MS;
        if (driftDays > 2) {
            irregular.push(subscription.userId);
            continue;
        }

        if (APPLY) {
            await db
                .update(app_subscriptions)
                .set({
                    currentPaymentOrderId: latest.order.id,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(app_subscriptions.id, subscription.id),
                        isNull(app_subscriptions.currentPaymentOrderId),
                    ),
                );
        }
        linked++;
    }

    console.log(
        `${APPLY ? "APPLIED" : "DRY RUN"}: ` +
            `${periodsWritten} paid orders ${APPLY ? "got" : "would get"} period dates, ` +
            `${linked} subscriptions ${APPLY ? "linked" : "would be linked"} to their funding order.`,
    );
    console.log(
        `${paidUnlinked.length} paid, active/unexpired subscriptions needed a link; ` +
            `${noOrder.length} have no paid order (manual plan change or comped without an order) and ` +
            `${irregular.length} do not line up with their latest order (>2 days).`,
    );
    if (noOrder.length) {
        console.log("No funding order (cancel → contact support):", noOrder.join(", "));
    }
    if (irregular.length) {
        console.log("Irregular period (cancel → contact support):", irregular.join(", "));
    }
    if (!APPLY) console.log("Re-run with --apply to write the changes.");
}

main()
    .then(closeDb)
    .catch(async (error) => {
        console.error("Backfill failed:", error);
        await closeDb();
        process.exitCode = 1;
    });
