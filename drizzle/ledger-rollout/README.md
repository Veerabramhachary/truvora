# Ledger rollout (personal / business separation)

Order of operations for step 1 (expand). Rehearse on a Neon branch first.

1. `psql "$DATABASE_URL" -f drizzle/ledger-rollout/00_orphan_check.sql`  (expect all 0)
2. `npm run db:generate -- --name add_ledgers` then review the SQL: it should only
   create `ledger_type`, `ledgers`, add nullable `ledger_id` columns + FKs + indexes.
   Commit the `.sql` AND `drizzle/meta/`. Then `npm run db:migrate`.
   (Do not use `db:push --force`.)
3. `psql "$DATABASE_URL" -f drizzle/ledger-rollout/01_backfill.sql`
4. `psql "$DATABASE_URL" -f drizzle/ledger-rollout/02_verify.sql`  (expect all 0)

Re-run 01 and 02 immediately before step 4 (NOT NULL). That mattered only for
rows created between the expand and NOT NULL deploys, back when app code did
not set `ledger_id` on insert; every write now stamps it (`lib/ledger.ts`
`requireLedger`), so a re-run is a no-op safety check.
