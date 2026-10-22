# Truvora

Privacy-first personal finance tracker: expenses, income, recurring
subscriptions and spending insights, with the sensitive fields encrypted at
rest.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Auth | Clerk |
| Billing | Stripe |
| Database | Postgres (Neon) via Drizzle ORM |
| i18n | next-intl (`en`, `ar`) |
| UI | shadcn/ui + Tailwind CSS v4, Radix, Lucide |
| Data fetching | Refine (simple-rest) + TanStack Query |

## Prerequisites

- Node.js 20 or newer
- A Postgres database (Neon works well)
- A Clerk application
- A Stripe account with products and prices
- A Resend account (renewal reminders)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app is served at <http://localhost:3000>. The `/ar` locale is available for
Arabic.

### Environment variables

See [`.env.example`](.env.example) for the full list. The ones that will bite
you if you skip them:

- `DATABASE_URL` — required by everything.
- `ENCRYPTION_PASSPHRASE` and `ENCRYPTION_SALT` — required before any row with
  a `description`, `note` or `metadata` column can be read or written. **There
  is no key rotation path**: changing either value makes existing ciphertext
  permanently unreadable.
- `CLERK_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET` — required by the two
  webhook routes, which are the only way a new user or a new subscription
  reaches the database.

## Database

```bash
npm run db:generate   # create a migration from the schema
npm run db:migrate    # apply pending migrations
npm run db:push       # reconcile an existing database with the schema
npm run db:studio     # browse the data
```

The migration history was rebuilt from scratch — see
[`drizzle/README.md`](drizzle/README.md) for why, and for how to reconcile an
existing database.

### Seed scripts

These attach sample data to the Clerk user id in `DEV_ID`:

```bash
npm run insert-plans   # subscription plans
npm run insert-seed    # categories
npm run insert-db      # sample expenses
npm run insert-sub     # sample subscriptions
```

## Project layout

```
app/
  [locale]/           routes with a locale prefix (en, ar)
    (dashboard)/      authenticated app
    (marketing)/      public pricing
  api/                route handlers
  auth/               Clerk sign-in / sign-up / sign-out
proxy.ts              Clerk auth middleware (Next 16 `proxy` convention)
db/schema/            Drizzle schema
i18n/                 next-intl config and messages
lib/                  feature gating, Stripe client, subscription helpers
scripts/              one-off seed scripts
```

## Conventions

- Route protection lives in `proxy.ts` (Clerk). Public routes are allow-listed
  at the top of that file; API routes return `401` rather than redirecting.
- Money is stored in `numeric` columns and therefore comes back from Drizzle
  as a **string**. Convert with `Number()` before doing arithmetic or
  formatting.
- `description`, `note` and `metadata` columns are encrypted with AES-256-GCM.
  They cannot be filtered, sorted or searched in SQL.
