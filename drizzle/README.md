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
TypeScript schema. It is the source of truth for new environments.

## Applying to an existing database

The baseline is a **create-from-scratch** script, so it will not apply cleanly
to a database that already has these tables. Existing environments must be
reconciled with `push`, which diffs the live database against the schema and
applies only the delta:

```bash
npm run db:push -- --force   # --force skips the confirmation prompt
```

`push` reconciles the following, which the previous schema definition got wrong:

| Change | Why |
| --- | --- |
| `CREATE TYPE payment_transaction_type` | `transaction_type` was declared twice with different value sets. `payment_transactions.type` pointed at the `(expense, income, subscription)` enum and could therefore never store `payment`. |
| `payment_transactions.type` → `payment_transaction_type` | Same collision. |
| `UNIQUE (provider_subscription_id)` on `app_subscriptions` | `ON CONFLICT (provider_subscription_id)` had no matching unique constraint, so every Stripe subscription event failed with `42P10`. |
| `CREATE TABLE feature_usage` | Added after the last surviving snapshot. |
| `ALTER TYPE payment_provider ADD VALUE 'none'` | The Clerk webhook provisions new users with `provider: "none"`, which the previous enum rejected. |

## After reconciling

Once `push` has run, the baseline in this folder is what a fresh environment
gets. Keep both in step: from now on, use `drizzle-kit generate` and commit the
resulting `.sql` file **and** the `drizzle/meta/` snapshots.

```bash
npm run db:generate -- --name <change_description>
```

## Note on `ENCRYPTION_PASSPHRASE` / `ENCRYPTION_SALT`

The schema imports `db/utils/encryption.ts`, which derives its key lazily. It
used to derive it at module load, which made `drizzle-kit generate` crash with
an opaque crypto error whenever those variables were not set. The key is now
resolved on first use, so migration generation works without them.
