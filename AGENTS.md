# AGENTS.md — Truvora

Privacy-first personal finance app: Next.js 16 (App Router, Turbopack) + React 19, Clerk, Stripe, Drizzle + Neon Postgres, Refine (`simple-rest`) + TanStack Query, shadcn/ui + Tailwind v4.

## Commands

```bash
npm install
cp .env.example .env   # README says .env.local; code loads dotenv from .env
npm run dev            # http://localhost:3000
npm run build          # full typecheck + production build
npx tsc --noEmit       # typecheck only (no `typecheck` script)
npm run lint           # bare `eslint` with flat config (eslint.config.mjs)
```

There is **no test suite** and **no typecheck npm script**. After non-trivial TS changes, run `npx tsc --noEmit` and `npm run lint`. Prefer order: `lint → tsc → build`.

Package manager is **npm** (`package-lock.json`, lockfileVersion 3). Do not switch to pnpm/yarn unless asked.

```bash
npm run db:generate    # drizzle-kit generate → commit drizzle/*.sql + drizzle/meta/
npm run db:migrate     # apply migrations (fresh envs)
npm run db:push        # reconcile existing DB with schema (use -- --force non-interactive)
npm run db:studio
npm run insert-plans   # seed plans (run before anything that needs feature gates)
npm run insert-seed    # categories
npm run insert-db      # sample expenses (needs DEV_ID)
npm run insert-sub     # sample subscriptions (needs DEV_ID)
```

Seed scripts attach rows to Clerk user id in `DEV_ID`. Plans must exist or Clerk webhook leaves users without a subscription and all feature gates deny access.

## Architecture (what files actually mean)

- `proxy.ts` — Clerk auth middleware. **Next 16 name is `proxy`, not `middleware.ts`.** Public routes are the allow-list at the top of that file. Unlisted pages redirect to sign-in; unlisted `/api/*` returns 401. Mutating API methods get a same-origin check.
- `app/api/**/route.ts` — REST handlers. Each re-checks `auth()` even though middleware exists.
- `app/(dashboard)/components/Providers.tsx` — Refine root. `dataProvider("/api")` means resource names map to `/api/<resource>`.
- `db/schema/*.ts` — sole Drizzle schema source (`drizzle.config.ts` glob). Do not add compiled `.js` schema copies under `drizzle/`.
- `db/index.ts` — Neon serverless Pool + `drizzle`; loads `dotenv/config`.
- `lib/` — feature access, Stripe client (lazy), upgrade flow, site URL.
- `scripts/` — one-off tsx seeds; not part of the app runtime.

Path alias: `@/*` → repo root (`tsconfig.json`).

## Data & API conventions (easy to get wrong)

- **Money** is `numeric`/`decimal` in Postgres → Drizzle returns **strings**. Use `Number()` (or decimal-safe helpers) before arithmetic/formatting.
- **Encrypted columns** (`encryptedText` / `encryptedJson` in `db/schema/custom-types.ts`): `description`, `note`, `metadata` (and invoice `lines`). AES-256-GCM via `ENCRYPTION_PASSPHRASE` + `ENCRYPTION_SALT`. **No key rotation** — changing env makes ciphertext unreadable. Cannot WHERE/ORDER BY on those columns in SQL. Key is lazy so `db:generate` works without env set.
- **Refine list contract** (`@refinedev/simple-rest`): accept `_start`, `_end`, `_sort`, `_order`; respond with a **bare JSON array** and `X-Total-Count`. Primary key field must be named `id` on list items. Clamp page size (existing routes use max 100).
- **Users** are provisioned by the Clerk webhook (`app/api/webhooks/clerk/route.ts`), not by local signup handlers. Checkout can also insert a missing user row. Empty `plans` table → sign-up still works but no `app_subscriptions` row.
- **Feature gates**: server helpers in `lib/feature-access.ts` / `lib/subscription.ts`; UI wraps some controls in `<FeatureGate feature="...">` (`lib/feature-gate.tsx`). Some product surfaces are still client-gated only — when adding paid features, enforce on the route handler too.
- Validation is **Zod v4** (`z.coerce`, `error.issues`). API errors often return `{ error: string }`; client helpers live in `lib/api-error.ts`.

## Env & ops

- Required for most local work: `DATABASE_URL`, `ENCRYPTION_PASSPHRASE`, `ENCRYPTION_SALT`. Webhooks: `CLERK_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`. Billing: `STRIPE_SECRET_KEY`. Reminders cron: `RESEND_API_KEY`, `CRON_SECRET` (fail-closed if unset).
- Cron path `/api/crons/*` is public in middleware and authenticates with `Authorization: Bearer $CRON_SECRET`.
- Webhooks must verify signatures on **raw body** (`req.text()`), not re-serialized JSON.
- `NEXT_PUBLIC_APP_URL` feeds sitemap/metadata via `lib/site.ts` (falls back to localhost).
- Migrations history was rebuilt: see `drizzle/README.md`. Existing DBs: `db:push`. New changes: `db:generate` and **commit SQL + `drizzle/meta/`**.

## When changing code

- Keep route protection and public allow-list in `proxy.ts` in sync with any new public pages/APIs.
- Do not log or return driver/Stripe internals on 500s; prefer generic messages + `console.error` server-side.
- After schema changes: `db:generate`, then `npx tsc --noEmit`.
