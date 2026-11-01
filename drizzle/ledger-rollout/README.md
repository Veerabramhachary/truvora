# Ledger rollout (personal / business separation)

Order of operations for step 1 (expand). Rehearse on a Neon branch first.

1. `psql "$DATABASE_URL" -f drizzle/ledger-rollout/00_orphan_check.sql`  (expect all 0)
2. `npm run db:generate -- --name add_ledgers` then review the SQL: it should only
   create `ledger_type`, `ledgers`, add nullable `ledger_id` columns + FKs + indexes.
   Commit the `.sql` AND `drizzle/meta/`. Then `npm run db:migrate`.
   (Do not use `db:push --force`.)
3. `psql "$DATABASE_URL" -f drizzle/ledger-rollout/01_backfill.sql`
4. `psql "$DATABASE_URL" -f drizzle/ledger-rollout/02_verify.sql`  (expect all 0)

Re-run 01 and 02 immediately before step 4 (NOT NULL). At the time this note
was written the app did not set `ledger_id` on insert yet, so rows created
between the step-1 and step-4 deploys stayed NULL; every write now goes through
`requireLedger` (see Status below), so nothing accrues NULL anymore.

## Status — executed 2026-10-31 (complete)

| Step | Result |
| --- | --- |
| 1. `00_orphan_check.sql` | 5 ownerless `transactions` across 2 deleted users found, backed up, then deleted; all counts 0 |
| 2. `db:generate -- --name add_ledgers` + `db:migrate` | `drizzle/0011_add_ledgers.sql` — needed `npm run db:journal-backfill` first (empty journal on a push-built DB, see `drizzle/README.md`) |
| 3. `01_backfill.sql` | 2 personal ledgers; expenses, subscriptions, transactions and custom categories attached |
| 4. `02_verify.sql` | all 11 checks 0 (re-run immediately before the NOT NULL migration, per the note above) |
| NOT NULL migration | `drizzle/0012_ledger_id_not_null.sql` on `expenses`, `subscriptions`, `transactions`. `categories.ledger_id` **stays nullable**: built-in categories are global (`user_id` NULL) and own no ledger — `02_verify` enforces that with "built-in categories wrongly scoped" |

App code resolves the active ledger before every request (`lib/ledger.ts`
`requireLedger`: an `x-ledger-id` header selects a specific owned, non-archived
ledger; no header falls back to the personal ledger) and stamps `ledgerId` on
every insert, so no row can be written with a NULL `ledger_id`. Verification
after `0012`: `02_verify` all 0, `00_orphan_check` all 0, `ledger_id` is
`NOT NULL` on the three tables and still nullable on `categories`.
