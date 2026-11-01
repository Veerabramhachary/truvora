/**
 * One-off: link the first charge of old subscriptions to its subscription.
 *
 * Before F-04, POST /api/subscriptions inserted the first `transactions` row
 * with `subscription_id = NULL`. This finds those rows and sets the link.
 *
 * Titles are encrypted at rest, so matching happens here in app code:
 *   same ledger + type "subscription" + date == subscription.startDate
 *   + same (decrypted) name as the subscription.
 * A transaction that matches zero or more than one subscription is reported
 * and left alone.
 *
 *   npx tsx scripts/backfill-subscription-links.ts           # dry run (default)
 *   npx tsx scripts/backfill-subscription-links.ts --apply   # write changes
 */
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { subscriptions, transactions } from "@/db/schema/schema";

const APPLY = process.argv.includes("--apply");
const norm = (v: string | null) => (v ?? "").trim().toLocaleLowerCase();

async function main() {
    const orphans = await db
        .select({
            id: transactions.id,
            ledgerId: transactions.ledgerId,
            title: transactions.title,
            date: transactions.date,
        })
        .from(transactions)
        .where(and(eq(transactions.type, "subscription"), isNull(transactions.subscriptionId)));

    const subs = await db
        .select({
            id: subscriptions.id,
            ledgerId: subscriptions.ledgerId,
            name: subscriptions.name,
            startDate: subscriptions.startDate,
        })
        .from(subscriptions);

    let linked = 0;
    let unmatched = 0;
    let ambiguous = 0;
    // Why did an unlinked transaction not match? (counts and ids only; no
    // titles are printed because they are encrypted financial data)
    const reasons = { sameNameOtherDate: 0, sameDateOtherName: 0, noCandidate: 0 };
    const unmatchedIds: string[] = [];
    for (const tx of orphans) {
        const matches = subs.filter(
            (s) =>
                s.ledgerId === tx.ledgerId &&
                s.startDate.getTime() === tx.date.getTime() &&
                norm(s.name) === norm(tx.title),
        );
        if (matches.length === 0) {
            unmatched++;
            unmatchedIds.push(tx.id);
            const inLedger = subs.filter((s) => s.ledgerId === tx.ledgerId);
            if (inLedger.some((s) => norm(s.name) === norm(tx.title))) reasons.sameNameOtherDate++;
            else if (inLedger.some((s) => s.startDate.getTime() === tx.date.getTime())) reasons.sameDateOtherName++;
            else reasons.noCandidate++;
            continue;
        }
        if (matches.length > 1) { ambiguous++; continue; }
        if (APPLY) {
            await db
                .update(transactions)
                .set({ subscriptionId: matches[0].id })
                .where(and(eq(transactions.id, tx.id), isNull(transactions.subscriptionId)));
        }
        linked++;
    }

    console.log(
        `${APPLY ? "APPLIED" : "DRY RUN"}: ${orphans.length} unlinked subscription transactions — ` +
            `${linked} ${APPLY ? "linked" : "would be linked"}, ${unmatched} unmatched, ${ambiguous} ambiguous.`,
    );
    if (unmatched > 0) {
        console.log(
            `Unmatched breakdown: ${reasons.sameNameOtherDate} same name but different start date (subscription edited), ` +
                `${reasons.sameDateOtherName} same start date but different name (renamed), ` +
                `${reasons.noCandidate} no similar subscription in the ledger (likely subscription deleted).`,
        );
        console.log("Unmatched transaction ids:", unmatchedIds.join(", "));
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
