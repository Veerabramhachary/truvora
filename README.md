# Truvora

Privacy-first finance tracker for individuals and small businesses: expenses,
income, recurring subscriptions, tax tagging and spending insights, with the
sensitive fields encrypted at rest. Every user gets a personal ledger and can
add business ledgers, so personal and business records stay separate.

For instructions on using Truvora, see the [user guide](USER_GUIDE.md).
For Razorpay checkout setup and security requirements, see
[RAZORPAY_SETUP.md](RAZORPAY_SETUP.md).

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Auth | Clerk |
| Billing | Local plans and feature gates; Razorpay checkout is disabled unless keys are configured |
| Database | Postgres (Neon) via Drizzle ORM |
| UI | shadcn/ui + Tailwind CSS v4, Radix, Lucide |
| Data fetching | Refine (simple-rest) + TanStack Query |
| Email | Resend (welcome and renewal reminder emails) |
| Rate limiting | Upstash Redis (optional; skipped with a logged warning when unset) |
| Monitoring | Sentry |
| Exports | CSV and PDF (`pdf-lib`) |

## Prerequisites

- Node.js 20 or newer (CI runs Node 22)
- A Postgres database (Neon works well)
- A Clerk application
- A Resend account (welcome and renewal reminder emails)
- Optional: Upstash Redis (rate limits), Razorpay keys (paid plans), Sentry

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app is served at <http://localhost:3000>.

Use `.env.local` for local development: Next.js, `drizzle-kit` and the
migration scripts all load it, and it wins over `.env`. A plain `.env` is only
used for Docker and self-hosting (`docker run --env-file .env`, see
[`deploy/README.md`](deploy/README.md)). Both files are gitignored.

### Environment variables

See [`.env.example`](.env.example) for the full list. The ones that will bite
you if you skip them:

- `DATABASE_URL` — required by everything.
- `ENCRYPTION_PASSPHRASE` and `ENCRYPTION_SALT` — required before any row with
  a `description`, `note` or `metadata` column can be read or written. **There
  is no key rotation path**: changing either value makes existing ciphertext
  permanently unreadable.
- `CLERK_WEBHOOK_SECRET` — required by the Clerk webhook that provisions new
  users, their default plan and their personal ledger.
- `CRON_SECRET` — required by the `/api/crons/*` routes (they return 503 when
  it is unset and 401 on a wrong token).

## Database

```bash
npm run db:generate          # create a migration from the schema
npm run db:migrate           # apply pending migrations (new and existing databases)
npm run db:migrate:verbose   # same, but prints the Postgres error if it fails
npm run db:studio            # browse the data
```

Always change the schema with `db:generate` and commit the generated
`drizzle/*.sql` file **and** `drizzle/meta/`. Do not use `drizzle-kit push`
against a real database: it diffs the live database against the schema and can
apply destructive changes.

The migration history was rebuilt from scratch. If an existing database has an
empty migration journal, see [`drizzle/README.md`](drizzle/README.md) for how
to mark what it already contains before running `db:migrate`.

### Seed scripts

These attach sample data to the Clerk user id in `DEV_ID`:

```bash
npm run insert-plans   # subscription plans
npm run insert-seed    # categories
npm run insert-db      # sample expenses
npm run insert-sub     # sample subscriptions
```

## Scheduled jobs

Defined in `vercel.json` (replacements for other hosts are in
[`deploy/README.md`](deploy/README.md)); each needs `CRON_SECRET`:

| Route | Schedule (UTC) | What it does |
| --- | --- | --- |
| `/api/crons/subscription-renewals` | 00:00 | Records due subscription charges in the subscription's ledger and advances `nextDate` |
| `/api/crons/subscriptionsTC` | 00:30 | Sends renewal reminder emails (runs after renewals) |
| `/api/crons/account-deletions` | 00:00 | Retries pending account deletions |

## Testing

```bash
npm test             # Vitest
npm run lint
npx tsc --noEmit     # typecheck (there is no `typecheck` script)
```

CI runs lint, tests and the typecheck on every push.

## Project layout

```
app/
  (dashboard)/      authenticated app (dashboard, expenses, transactions,
                    subscriptions, reports, billing, settings, …)
  (marketing)/      privacy policy and terms
  api/              route handlers
  auth/             Clerk sign-in / sign-up / sign-out
  onboarding/       sign-up wizard (personal / business / both)
proxy.ts            Clerk auth middleware (Next 16 `proxy` convention)
db/schema/          Drizzle schema
lib/                feature gating, ledgers, subscriptions, exports, tax
scripts/            one-off seed and maintenance scripts
tests/              Vitest suite
```

## Conventions

- Route protection lives in `proxy.ts` (Clerk). Public routes are allow-listed
  at the top of that file; API routes return `401` rather than redirecting.
- Records belong to a ledger (personal or business). Ledger-scoped API routes
  resolve it through `requireLedger` from the `x-ledger-id` header.
- Money is stored in `numeric` columns and therefore comes back from Drizzle
  as a **string**. Convert with `Number()` before doing arithmetic or
  formatting.
- `description`, `note` and `metadata` columns are encrypted with AES-256-GCM.
  They cannot be filtered, sorted or searched in SQL.
