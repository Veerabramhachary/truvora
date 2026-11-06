# Truvora feature, capability, and limits audit

**Reviewed:** 2026-11-05  
**Scope:** Current application source, API routes, schema, and plan seeder.  
**Important:** Plan limits and prices below are the definitions in `scripts/plans.ts`. They apply only when those plans have been seeded and the user has an active subscription row in the database; this audit does not verify live database contents.

## Product summary

Truvora is a manual personal/business finance tracker. Users enter records themselves; the app does not import transactions from a bank or charge subscriptions on a user's behalf. Data is separated into ledgers, with personal and business records kept apart.

## Features available in the app

| Area | Current capability | Limits and qualifications |
|---|---|---|
| Sign-in and onboarding | Clerk sign-in/sign-up with email/password and Google/GitHub OAuth; first-run setup for personal, business, or both; creates a personal ledger as needed. | Sign-up requires a name, accepted terms, and a password of at least 8 characters. Email verification depends on Clerk instance settings. One active personal ledger and at most one active business ledger per user. Business ledger names are 1-40 characters. |
| Ledger separation | Switch between personal and business ledgers. Expenses, income, subscriptions, transactions, charts, and tax summaries are scoped to the selected ledger. | A missing ledger selection falls back to the personal ledger for API compatibility. |
| Expenses and income | Create, list, edit, and delete records; assign categories, dates, and optional notes. Income and expense records also appear in transaction history. | New financial records must use INR. Amounts must be greater than zero, have at most two decimal places, and contain at most 8 digits before the decimal (maximum 99,999,999.99). |
| Categories | Built-in expense and subscription categories; custom categories can be created and listed when the plan enables them. | Custom category names are 1-40 characters. No numeric custom-category count cap is defined in the current route or plan schema. |
| Recurring subscriptions | Track a name, price, category, start/end dates, monthly or yearly interval, and optional interval count/note. Renewals are recorded in transaction history; expired subscriptions stop counting as active. | New amounts are INR. Active-subscription caps depend on plan. The renewal job records due cycles; it does not collect money from a payment provider. |
| Dashboard | Selected-ledger monthly spend, income, active subscription totals/counts, upcoming renewals, recent transactions, category spending, and spending charts. Business ledgers also show the tax summary. | The upcoming-renewal card covers today through 7 days ahead. Comparative/advanced chart access is plan-gated; the seed gives those tiers to Starter and Pro. |
| Transactions and record filters | Paginated history of income, expenses, and subscription events; sorting and filtering by record type, category, currency, date range, and amount; case-insensitive text search. Filter choices reflect categories/currencies used in the ledger. | List endpoints return at most 100 records per page. Search text is at most 100 characters; at most 20 category IDs may be selected. Text search scans at most 5,000 filtered rows and marks a truncated result. Amount filters allow up to 8 integer digits and 2 decimals. |
| Tax organization | On business ledgers, tag expenses/subscriptions as tax-deductible or tax-paid, and income as taxable income or tax refund. Dashboard summary groups tagged values by tax type and month and shows net tax paid. | Uses April-March tax years and offers the current plus three prior years in the UI. API requests are limited to 400 days and summaries to 20,000 matching rows; responses indicate truncation. This organizes records; it does not calculate tax liability or provide tax advice. |
| CSV and PDF exports | Export subscriptions, expenses/income, or transactions. Expense and transaction exports accept the list filters. PDF exports are plan-gated; advanced PDFs include summaries, and business PDFs can include tax labels. | Export allowance is monthly and shared across CSV/PDF. PDF includes at most 2,000 rows and notes when results are truncated. Text search in exports has the same 5,000-row scan cap. Subscription exports do not support search/list filters. CSV and PDF do not export notes/descriptions. XLSX is not implemented. |
| Renewal reminders | Email reminders are sent through the Resend-backed scheduled route, with duplicate-send protection. | Requires the cron schedule, `CRON_SECRET`, `RESEND_API_KEY`, and `RENEWAL_EMAIL_FROM`. The seeded plans specify email reminders. Delivery depends on deployment configuration and the email provider. |
| Account deletion | Settings can request permanent deletion and check a pending deletion's status. A scheduled job retries cleanup that could not complete immediately. | Deletion is irreversible. Limited billing totals may be retained where required; provider backups/logs may persist temporarily. Deletion/status processing needs the scheduled job and `CRON_SECRET`. |
| Pricing and billing display | Public pricing and signed-in billing pages display active plans and current subscription information. Paid plans can be purchased through Razorpay checkout when provider keys are configured. | The seeded plans are monthly and INR-denominated. Checkout is server-priced and signature-verified; with no `RAZORPAY_*` environment variables the Upgrade buttons stay disabled and the checkout API returns unavailable. |
| Public and legal pages | Landing page, pricing, privacy policy, and terms pages are available. | These do not imply bank connectivity, paid checkout, or other integrations. |
| Appearance | Light, dark, and system theme choices are available. | Theme preference is a UI setting; it does not affect financial data or plan entitlements. |
| Referral attribution | A `ref` query parameter can be captured at signup and attached to Clerk user metadata for campaign/discount lookup. | The value is trimmed, lowercased, and limited to 64 characters. This is attribution plumbing, not an available referral payout or checkout flow. |

## Seeded plan definitions

`npm run insert-plans` defines the following INR monthly plans. These values describe the seeder, not a guarantee that a deployment has already seeded or assigned them.

| Seed plan | Price | Active subscriptions | Exports per month | Charts | PDF | Custom categories | Reminders |
|---|---:|---:|---:|---|---|---|---|
| Free | INR 0 | 10 | 10 | No comparative/advanced chart tier | No | No | Email |
| Starter | INR 129 | 50 | 100 | Comparative | Basic | Yes | Email |
| Pro | INR 299 | Unlimited (`-1`) | 1,000 | Advanced | Advanced | Yes | Email |

All three seeded plans enable CSV. None enables XLSX. The Pro seed contains a disabled saved-views flag and describes saved views, monthly reports, and XLSX as coming soon. Paid checkout is available through Razorpay only when `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are configured and the migration has been applied (see `RAZORPAY_SETUP.md`); otherwise the displayed paid-plan prices are not purchasable through the app.

## Request and data limits

| Limit | Current value / behavior |
|---|---|
| Authenticated API rate limit | 100 requests/minute and 5,000/day per user. |
| Public plans/prices rate limit | 60 requests/minute and 1,000/day per client IP. |
| Export route rate limit | 5 requests/minute and 50/day per user, in addition to the general authenticated API policy. |
| Sensitive operations rate limit | 5 requests/hour for account deletion, checkout, and subscription upgrade endpoints. |
| Rate-limit availability | Limits use Upstash Redis. If Redis credentials are absent or a Redis request fails, requests are allowed and a warning is logged; limits therefore depend on correctly configured Redis. |
| Record list page size | Maximum 100 rows per page for expenses, subscriptions, and transactions. |
| Decrypted text search | Up to 5,000 rows scanned per query; encrypted fields cannot be filtered in SQL. |
| Tax summary | Up to 400 days per request; tagged rows: Free 50, Starter 500, Pro unlimited |
| PDF export | Maximum 2,000 included rows per export. |
| Category name | Maximum 40 characters for a custom category. |
| Business ledger name | Maximum 40 characters. |
| New financial record currency | INR only, enforced by the write APIs. Existing records can still expose other currencies to filters/exports if present in stored data. |

## Not currently available or not enabled

- Bank or card connections, automatic bank transaction import, and payment-provider setup.
- Purchases, paid checkout, plan upgrades, or subscription payments collected by Truvora.
- The Reports & Insights page's planned trend analysis, upcoming-renewal/price-increase analytics, and report workspace. The separate CSV/PDF export endpoint is implemented.
- XLSX exports, saved views, custom notification channels, outgoing webhooks, and non-email reminder tiers in the seeded plans.
- A user-editable profile/settings surface for display details, sign-in methods, sessions, or devices; the Profile page is a placeholder.
- A configured live plan assignment or database state cannot be inferred from source code alone.

## Privacy and implementation boundaries

- Clerk protects private pages and APIs; API access is checked again by route handlers. Financial data access is scoped through ownership-checked ledger resolution.
- Selected text/JSON fields are encrypted at rest. Encryption does not cover every account or financial field, and encrypted text is not SQL-searchable. Text search decrypts a bounded set of rows in application code.
- The encryption key depends on `ENCRYPTION_PASSPHRASE` and `ENCRYPTION_SALT`; the project documents no key-rotation path. Changing either value can make existing ciphertext unreadable.
- Exports include record values such as names/titles, amounts, dates, categories, and types, but omit notes/descriptions. Exported files are outside the app's access controls once downloaded.

## Main implementation areas

- Pages/UI: `app/(dashboard)/`, `app/(marketing)/`, `app/auth/`, and `app/onboarding/`.
- API: `app/api/` (records, dashboard, categories, ledgers, tax, exports, billing/webhooks, account deletion, and scheduled jobs).
- Data model: `db/schema/`; feature limits: `db/schema/plans.ts` and `scripts/plans.ts`.
- Feature and ledger rules: `lib/feature-access.ts`, `lib/ledger.ts`, `lib/transaction-filters.ts`, and `lib/tax.ts`.
- Deployment-dependent schedules: `app/api/crons/` and `deploy/crontab.example`.
