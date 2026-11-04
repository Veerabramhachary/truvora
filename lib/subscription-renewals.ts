import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, transactions } from "@/db/schema/schema";
import { ledgers } from "@/db/schema/ledgers";
import { planRenewals } from "./subscription-cycles";

export type RenewalSummary = {
    dryRun: boolean;
    /** Subscriptions looked at in this run. */
    processed: number;
    /** Subscriptions left for tomorrow because the batch limit was reached. */
    moreDue: boolean;
    /** Charges written to the ledger (or that would be, in a dry run). */
    recorded: number;
    /** Cycles passed over without a charge (inactive, ended or archived ledger). */
    skippedInactive: number;
    /** Charges that already existed for that (subscription, date). */
    alreadyRecorded: number;
    /** Subscriptions that stopped at the per-run cycle cap. */
    capped: number;
    failed: number;
};

type OneResult = Pick<RenewalSummary, "recorded" | "skippedInactive" | "alreadyRecorded"> & {
    capped: boolean;
    skipped: boolean;
};

/** When the ledger was archived (null if it is live or no longer exists). */
async function ledgerArchivedAt(
    executor: Pick<typeof db, "select">,
    ledgerId: string,
): Promise<Date | null> {
    const [row] = await executor
        .select({ archivedAt: ledgers.archivedAt })
        .from(ledgers)
        .where(eq(ledgers.id, ledgerId))
        .limit(1);
    return row?.archivedAt ?? null;
}

const EMPTY: OneResult = { recorded: 0, skippedInactive: 0, alreadyRecorded: 0, capped: false, skipped: true };

/**
 * Records every passed renewal of one subscription in ITS OWN ledger and
 * advances `nextDate`, atomically. Safe to run twice: the row is locked for
 * the transaction, `nextDate` moves in the same commit as the inserts, and
 * the unique (subscription_id, date) index rejects a repeated cycle.
 */
async function renewOne(id: string, now: Date, dryRun: boolean): Promise<OneResult> {
    if (dryRun) {
        const [sub] = await db
            .select()
            .from(subscriptions)
            .where(and(eq(subscriptions.id, id), lte(subscriptions.nextDate, now)))
            .limit(1);
        if (!sub) return EMPTY;
        const plan = planRenewals(
            { ...sub, ledgerArchivedAt: await ledgerArchivedAt(db, sub.ledgerId) },
            now,
        );
        const charges = plan.cycles.filter((c) => c.charge).length;
        return {
            recorded: charges,
            skippedInactive: plan.cycles.length - charges,
            alreadyRecorded: 0,
            capped: plan.capped,
            skipped: false,
        };
    }

    return db.transaction(async (tx) => {
        const [sub] = await tx
            .select()
            .from(subscriptions)
            .where(and(eq(subscriptions.id, id), lte(subscriptions.nextDate, now)))
            .for("update", { skipLocked: true });
        // Gone, already advanced by another run, or locked by one: nothing to do.
        if (!sub) return EMPTY;

        // A frozen (archived) ledger gets no new charges, but nextDate still
        // moves on so restoring it later does not back-charge the gap.
        const plan = planRenewals(
            { ...sub, ledgerArchivedAt: await ledgerArchivedAt(tx, sub.ledgerId) },
            now,
        );
        const charges = plan.cycles.filter((c) => c.charge);

        let recorded = 0;
        if (charges.length > 0) {
            const inserted = await tx
                .insert(transactions)
                .values(
                    charges.map((cycle) => ({
                        userId: sub.userId,
                        // The subscription's own ledger, never the user's
                        // personal one: a cron has no request ledger header.
                        ledgerId: sub.ledgerId,
                        title: sub.name,
                        description: sub.note,
                        amount: sub.price,
                        currency: sub.currency,
                        categoryId: sub.categoryId,
                        subscriptionId: sub.id,
                        // The subscription decides the tax treatment of its charges.
                        taxKind: sub.taxKind,
                        type: "subscription" as const,
                        action: "created" as const,
                        date: cycle.date,
                    })),
                )
                .onConflictDoNothing({
                    target: [transactions.subscriptionId, transactions.date],
                })
                .returning({ id: transactions.id });
            recorded = inserted.length;
        }

        await tx
            .update(subscriptions)
            .set({ nextDate: plan.nextDate, updatedAt: now })
            .where(eq(subscriptions.id, sub.id));

        return {
            recorded,
            skippedInactive: plan.cycles.length - charges.length,
            alreadyRecorded: charges.length - recorded,
            capped: plan.capped,
            skipped: false,
        };
    });
}

export async function processSubscriptionRenewals(
    options: { now?: Date; dryRun?: boolean; batchSize?: number } = {},
): Promise<RenewalSummary> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 1000;

    const due = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(lte(subscriptions.nextDate, now))
        .orderBy(asc(subscriptions.nextDate))
        .limit(batchSize + 1);

    const ids = due.slice(0, batchSize).map((row) => row.id);
    const summary: RenewalSummary = {
        dryRun,
        processed: 0,
        moreDue: due.length > batchSize,
        recorded: 0,
        skippedInactive: 0,
        alreadyRecorded: 0,
        capped: 0,
        failed: 0,
    };

    for (const id of ids) {
        try {
            const result = await renewOne(id, now, dryRun);
            if (result.skipped) continue;
            summary.processed++;
            summary.recorded += result.recorded;
            summary.skippedInactive += result.skippedInactive;
            summary.alreadyRecorded += result.alreadyRecorded;
            if (result.capped) summary.capped++;
        } catch (error) {
            // One bad row must not stop everyone else's renewals. Its
            // transaction rolled back, so it is retried on the next run.
            console.error(`Renewal failed for subscription ${id}:`, error);
            summary.failed++;
        }
    }
    return summary;
}
