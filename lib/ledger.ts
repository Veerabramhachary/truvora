import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ledgers } from "@/db/schema/ledgers";

/**
 * The app's `db` and the `tx` handed to `db.transaction(async (tx) => ...)`
 * are both `PgDatabase` subclasses (`NeonDatabase` and `PgTransaction`), so
 * this one parameter type accepts either.
 */
export type LedgerDb =
    | (typeof db)
    | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve the owner's personal ledger, creating it on first use.
 *
 * Every ledger-scoped row (expenses, subscriptions, transactions, custom
 * categories) must carry `ledger_id`: the column goes NOT NULL in step 4 of
 * the ledger rollout, and `02_verify.sql` treats a ledger-less row as a
 * failure. New users normally get their ledger from the Clerk webhook (or the
 * backfill), so the insert here is the safety net for rows written before that
 * provisioning existed — not the common path.
 *
 * Safe to call concurrently: `ledgers_one_personal_per_owner` is a partial
 * unique index, so the loser of a race gets `ON CONFLICT DO NOTHING` and then
 * re-reads the winner's committed row.
 */
export async function getPersonalLedgerId(
    userId: string,
    client: LedgerDb = db,
): Promise<string> {
    const existing = await client
        .select({ id: ledgers.id })
        .from(ledgers)
        .where(and(eq(ledgers.ownerUserId, userId), eq(ledgers.type, "personal")))
        .limit(1);
    if (existing[0]) return existing[0].id;

    const [created] = await client
        .insert(ledgers)
        .values({ ownerUserId: userId, type: "personal", name: "Personal" })
        .onConflictDoNothing()
        .returning({ id: ledgers.id });
    if (created) return created.id;

    const [raced] = await client
        .select({ id: ledgers.id })
        .from(ledgers)
        .where(and(eq(ledgers.ownerUserId, userId), eq(ledgers.type, "personal")))
        .limit(1);
    if (!raced) {
        // Only reachable if the users row does not exist (FK violation above)
        // or the ledger was deleted between the two reads.
        throw new Error("Could not resolve a personal ledger for this user");
    }
    return raced.id;
}
