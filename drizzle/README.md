# Database migrations

## State of this folder

The migration history in this repository was rebuilt. The previous history was
unusable:

- `drizzle/*.sql` and `drizzle/meta/` were listed in `.gitignore`, so **no
  migration SQL was ever committed**.
- `drizzle/meta/_journal.json` referenced six migrations (`0000`…`0005`) but
  only the `0000` snapshot survived, so `drizzle-kit generate` could not diff
  against it and aborted on an interactive prompt.

`drizzle/0000_baseline.sql` is a fresh baseline generated from the current
TypeScript schema. It is the source of truth for new environments, and every
later change is a numbered migration after it.

## Everyday workflow

```bash
npm run db:generate -- --name <change_description>   # after editing db/schema/*.ts
npm run db:migrate                                   # apply pending migrations
```

Commit the generated `.sql` file **and** the `drizzle/meta/` snapshots, and never hand-write a migration file: one that is not in `meta/_journal.json` is invisible to `db:migrate` and makes the next `db:generate` re-propose the same change. This is
the same for a fresh database and an existing one: `db:migrate` applies only
what the database's journal (`drizzle.__drizzle_migrations`) has not seen.

**Do not use `drizzle-kit push` (or `db:push -- --force`) against a real
database.** `push` diffs the live database against the TypeScript schema and
applies the difference, and `--force` auto-approves the destructive parts
(dropped columns and tables, data loss). It also writes nothing to the
migration journal, which is what broke `db:migrate` on older databases (see
below). Take a Neon branch or backup before migrating production.

## History: what the one-time reconciliation fixed

Databases created before the rebuild were reconciled once with `push` so they
matched the new baseline. That already happened; it is not a step to repeat.
It fixed:

| Change | Why |
| --- | --- |
| `CREATE TYPE payment_transaction_type` | `transaction_type` was declared twice with different value sets. `payment_transactions.type` pointed at the `(expense, income, subscription)` enum and could therefore never store `payment`. |
| `payment_transactions.type` → `payment_transaction_type` | Same collision. |
| `UNIQUE (provider_subscription_id)` on `app_subscriptions` | `ON CONFLICT (provider_subscription_id)` had no matching unique constraint, so every payment-provider subscription event failed with `42P10`. |
| `CREATE TABLE feature_usage` | Added after the last surviving snapshot. |
| `ALTER TYPE payment_provider ADD VALUE 'none'` | The Clerk webhook provisions new users with `provider: "none"`, which the previous enum rejected. |

## If `db:migrate` exits with code 1 and prints nothing

`drizzle-kit migrate` with the Neon driver can fail without showing the
database error. Run the same migrations with `npm run db:migrate:verbose`: it
applies pending migrations in one transaction and prints the Postgres message,
code, detail and hint on failure. Migrations should be idempotent
(`IF NOT EXISTS`) so a database that was once synced with `db:push` can still
run them. Note `db:journal-backfill` only works on an EMPTY journal; it refuses
to touch a journal that already has rows.

## If `db:migrate` fails on an existing database with an empty journal

A database that was reconciled with `push` has an **empty journal**, because
`push` writes nothing to `drizzle.__drizzle_migrations`. `npm run db:migrate`
then treats `0000_baseline` as unapplied, replays it on top of live tables, and
dies on the first `CREATE TABLE` (`relation "users" already exists`). The run
is one transaction, so nothing is damaged — but nothing is applied either, and
the only output you see is drizzle-kit's driver warning.

Mark the migrations the database already reflects, then migrate again; only
the pending ones run:

```bash
npm run db:journal-backfill -- --dry-run    # shows exactly what it would insert
npm run db:journal-backfill -- --up-to 0010_tense_supreme_intelligence
npm run db:migrate
```

`--up-to` must name the last migration already **in the database**. Naming the
newest journal entry would mark an unapplied migration as done, after which
`db:migrate` silently applies nothing — the script refuses to do that. Confirm
afterwards with `SELECT count(*) FROM drizzle.__drizzle_migrations;`.

## Note on `ENCRYPTION_PASSPHRASE` / `ENCRYPTION_SALT`

The schema imports `db/utils/encryption.ts`, which derives its key lazily. It
used to derive it at module load, which made `drizzle-kit generate` crash with
an opaque crypto error whenever those variables were not set. The key is now
resolved on first use, so migration generation works without them.
