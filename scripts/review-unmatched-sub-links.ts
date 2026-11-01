/**
 * One-off (read-only): show the unlinked subscription transactions that
 * backfill-subscription-links.ts could not match, with nearest candidates.
 *
 * Match rule used by the backfill: same ledger + date == subscription.startDate
 * + same decrypted name. Here we also report partial matches (name-only,
 * date-only) so a human can decide.
 */
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { subscriptions, transactions } from "@/db/schema/schema";

const norm = (v: string | null) => (v ?? "").trim().toLocaleLowerCase();
const fmt = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
    const orphans = await db
        .select({
            id: transactions.id,
            ledgerId: transactions.ledgerId,
            title: transactions.title,
            description: transactions.description,
            date: transactions.date,
            amount: transactions.amount,
            createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(and(eq(transactions.type, "subscription"), isNull(transactions.subscriptionId)));

    const subs = await db
        .select({
            id: subscriptions.id,
            ledgerId: subscriptions.ledgerId,
            name: subscriptions.name,
            startDate: subscriptions.startDate,
            price: subscriptions.price,
            active: subscriptions.active,
        })
        .from(subscriptions);

    for (const tx of orphans) {
        const inLedger = subs.filter((s) => s.ledgerId === tx.ledgerId);
        const byName = inLedger.filter((s) => norm(s.name) === norm(tx.title));
        const byDate = inLedger.filter((s) => s.startDate.getTime() === tx.date.getTime());

        console.log(`\nTX ${tx.id}`);
        console.log(`  title       ${tx.title}`);
        if (tx.description) console.log(`  description ${tx.description}`);
        console.log(`  date        ${fmt(tx.date)}   amount ${tx.amount}   created ${fmt(tx.createdAt)}`);
        console.log(`  ledger      ${tx.ledgerId} (${inLedger.length} subscription(s) in ledger)`);

        for (const s of byName) {
            console.log(`  ~ NAME matches sub ${s.id} "${s.name}" but startDate is ${fmt(s.startDate)} (price ${s.price}, active ${s.active})`);
        }
        for (const s of byDate) {
            console.log(`  ~ DATE matches sub ${s.id} "${s.name}" (price ${s.price}, active ${s.active})`);
        }
        if (!byName.length && !byDate.length) {
            console.log("  ? no subscription in this ledger shares either the name or the date");
        }
    }
    console.log(`\n${orphans.length} unmatched; ${subs.length} subscription(s) total.`);
}

main()
    .then(closeDb)
    .catch(async (error) => {
        console.error("Review failed:", error);
        await closeDb();
        process.exitCode = 1;
    });
