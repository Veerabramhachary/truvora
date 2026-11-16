# Refund & Cancellation: Implementation Audit

**Status:** AUDIT ONLY. No code, schema or config was changed by this audit.
**Date:** 2026-11-15
**Audited against:** `REFUND_CANCELLATION_PLAN.md` (Steps 1 to 4, decisions D1 to D13 at their defaults)
**Method:** read the files with the Filesystem tool. I did **not** run `tsc`, `lint`, `vitest`, `next build`, any database query, any migration, or any Razorpay call.

---

## 1. Verdict

The implementation follows the plan closely and the core design is sound: one definition of "current plan", a refund workflow table with database guards, a fixed lock order, idempotent webhook handling, a reconciler, a fail-closed flag, and policy copy that is tested against the code constants.

**It is not ready to be switched on in production.** Three problems touch money or customer access and should be fixed first (R-01, R-02, R-03). Keep `BILLING_REFUNDS_ENABLED="false"` until they are fixed and a Razorpay test-mode run passes.

| Severity | Count | IDs |
|---|---|---|
| P0 | 0 | |
| P1 | 1 | R-01 |
| P2 | 3 | R-02, R-03, R-04 |
| P3 | 7 | R-05 to R-11 |

---

## 2. What I could not verify

| Item | Why it matters |
|---|---|
| `tsc`, lint, tests, build | Not executed. The test files exist and look reasonable, but I have not seen them pass. |
| Migrations 0019 and 0020 applied to your databases | Files, journal entries and snapshots are present and consistent. Whether they ran, and on which database, is unknown. |
| Step 1 dry-run result | `schema` comments say it reported no duplicate subscription rows. I could not see the output. Migration 0020 (unique index on `app_subscriptions.user_id`) fails if production has duplicates. |
| Backfill (`scripts/backfill-payment-periods.ts`) run on production | Without it, existing paid users have no `current_payment_order_id`, so the Cancel button is hidden for them (by design). |
| Razorpay dashboard: refund events subscribed | Required for webhooks to reach the app. |
| Files read only partly or not at all | `tests/razorpay-refund.test.ts`, `tests/payment-history-route.test.ts`, `PLAN_GUIDE.md`, `PROJECT_FEATURES.md`, `deploy/README.md`, success/failure page changes. |

---

## 3. Plan conformance

| Plan item | Status | Evidence |
|---|---|---|
| Migration 0019 (columns, `payment_refunds`, CHECK, partial unique index) | Done | `drizzle/0019_refunds_and_cancellation.sql`, `db/schema/payment-refunds.ts`, `db/schema/payment-orders.ts` |
| Unique index on `app_subscriptions.user_id` (B-06) | Done (0020) | `drizzle/0020_furry_stature.sql`. Not `IF NOT EXISTS`; fails loudly on duplicates. |
| Circular import between plans and orders fixed | Done | `db/schema/payment-provider.ts` |
| `lib/billing-state.ts` as the single definition (B-03, B-04) | Done | Used by `lib/subscription.ts`, billing page, checkout page, order route, verify route, refund service |
| Fulfillment: advisory lock, period slice, funding-order pointer, discount link (B-07, B-08) | Done | `lib/payment-fulfillment.ts` |
| Order stays `paid` after a refund so a replayed `payment.captured` cannot re-grant (B-09) | Done in code | Not covered by a unit test (see R-10) |
| Razorpay refund client with idempotency header and retryable errors | Done | `lib/razorpay.ts` |
| Webhook handles `refund.created/processed/failed`, ignores uncaptured and `speed_changed` | Done | `app/api/webhooks/razorpay/route.ts` |
| `refund-fulfillment`, `refund-service`, `refund-policy`, `refund-reconciler`, emails | Done | `lib/refund-*.ts` |
| Cancel preview and execute routes, dialog, payment history | Done | `app/api/billing/*`, `CancelPlanDialog.tsx`, billing page |
| Reconciler cron, `vercel.json`, `crontab.example` | Done | `app/api/crons/refund-reconcile/route.ts` |
| Ops script and backfill/dry-run scripts | Done | `scripts/refund-order.ts`, `backfill-payment-periods.ts`, `billing-dry-run.ts` |
| Account deletion covers refund rows (B-11) | Done | `lib/account-deletion.ts` (verification list; accounting rows carry `subscriptions_id`) |
| Plan-switch guard (B-05, D12) | Done, with side effects | See R-03 and R-05 |
| Remove dead `lib/upgrade-subscription.ts` (B-13) | Done | File no longer exists |
| Custom-category edit lockout after downgrade (B-14) | Done | `app/api/subscriptions/[id]/route.ts` (see R-11) |
| Terms, checkout copy, `RAZORPAY_SETUP.md`, `.env.example`, flag default off | Done | `tests/refund-copy.test.ts` guards the numbers |
| Lock order advisory, then order, then subscription (§5.4) | Mostly | The subscription row is read without `FOR UPDATE`; the advisory lock covers every billing path that takes it (informational, see R-11) |

---

## 4. Findings

### R-01 (P1) A refund that fails after it was accepted leaves the books saying it succeeded

**Where:** `lib/refund-service.ts` (`cancelNow` passes `applyWhenPending: true`), `lib/refund-fulfillment.ts` (failed branch), `tests/refund-fulfillment.test.ts` ("records a failed event without restoring or ending the plan").

**What happens:** cancel-now applies the refund as soon as Razorpay accepts it, even while it is `pending`. That already adds the amount to `payment_orders.amount_refunded`, writes a `payment_transactions` row (`type refund`, `status succeeded`) and marks the discount redemption `refunded`. If Razorpay later sends `refund.failed`, the handler only changes the `payment_refunds` row to `failed`. Nothing reverses the other three writes.

**Impact:**
- The order shows as fully refunded and the accounting row says `succeeded`, but the customer never received the money.
- The ops script cannot retry: `scripts/refund-order.ts` computes `refundable = paid - refunded`, which is 0, and stops with "Nothing left to refund".
- Re-issuing from the Razorpay dashboard is also rejected locally: `applyProviderRefund` returns `over_refund` because `amount_refunded + new amount > amount_paid`.
- The billing page tells the user "Contact support and we will retry it", which the tooling cannot do cleanly.

**Recommended fix:** when a refund that was already applied turns `failed`, in one transaction under the lock order: subtract its amount from `amount_refunded`, mark its accounting row failed (or add a reversing `adjustment` row, your choice for audit), keep the plan canceled (matches the plan), and keep the support alert. Add tests for it. Decide separately whether the discount redemption should stay `refunded`.

**Verify:** unit test for the reversal; then Razorpay test mode with a refund that fails, followed by an ops retry.

---

### R-02 (P2) A prorated cancel that is finished by the webhook or reconciler does not end the plan

**Where:** `lib/refund-fulfillment.ts` (`endPlanIfCurrent(params.endPlan ?? totalPaise === paidPaise)`), `app/api/webhooks/razorpay/route.ts`.

**What happens:** the plan is only ended automatically when the refund is for the full paid amount, or when the caller passes `endPlan: true`. The webhook never passes it and never looks at who requested the refund. If cancel-now does not finish its second transaction (Razorpay call timed out, function crashed), the `refund.processed` webhook records the money for a prorated refund but leaves the plan active. A `refund.created` webhook in the `pending` state is not applied at all, and the reconciler only revisits `requested` rows after 10 minutes and `pending` rows after 8 days.

**Impact:** the user receives the refund and keeps the paid plan until the period ends (or at least 8 days). Rare path (needs a timeout or crash after Razorpay accepted), but it is exactly the path the webhook backup exists for, and the test suite does not cover it.

**Recommended fix:** when the matched `payment_refunds` row has `requested_by = 'user'` and kind `full_window` or `prorated`, treat it as a cancel: apply on `pending` and `processed`, and end the plan if it funds the current period. Add a webhook-level test with an existing user row.

---

### R-03 (P2) A payment that was captured but cannot be fulfilled is marked failed and never refunded

**Where:** `lib/payment-fulfillment.ts` (new 409 guard "An active paid plan already covers this period"), `app/api/payments/razorpay/verify/route.ts` and the webhook catch block (`recordPaymentFailure`).

**What happens:** the order route blocks buying while a paid period is active, but that check is not atomic with payment. If two checkouts are opened (two tabs, two plans) and both are paid, the second payment reaches fulfillment after Razorpay already captured it. Fulfillment throws 409, the order is set to `failed`, and the only trace is a `console.error`. The verify route's pre-capture check only helps for accounts that do not auto-capture (`authorized` payments). The same dead end already existed for inactive plans.

**Impact:** the customer is charged and has no plan. The order status is `failed`, so a later dashboard refund is ignored by the webhook (`order_not_paid`), leaving the database and Razorpay out of step.

**Recommended fix:** treat "captured but unfulfillable" as its own case: create a full refund through the same refund service (or at minimum store a durable flag and alert support), and allow the refund webhook to reconcile it. Add tests for both the verify route and the webhook path.

---

### R-04 (P2) The 90-day refund limit can be bypassed while a refund is still pending

**Where:** `lib/refund-service.ts` (`lastRefund` query filters `status = 'processed'`), `lib/refund-policy.ts`.

**What happens:** the cooldown only looks at refunds already `processed`. Razorpay normal refunds start as `pending`; a user can cancel, buy again and cancel again before the first one is processed. The unique index only blocks a second refund on the *same* order. How wide the gap is depends on how quickly Razorpay marks refunds `processed` (the docs show both states).

The same query also counts support or dashboard refunds (`requested_by` ops or provider), so a goodwill refund from you blocks the customer's own self-service cancel for 90 days. That may or may not be what you want. Terms say "you received a refund in the previous 90 days".

**Recommended fix:** count non-failed user-initiated refunds created in the last 90 days (`requested`, `pending`, `processed`). Decide explicitly whether external refunds should count (D8 did not say).

---

### R-05 (P3, regression) A Free user can run the Free plan through checkout

**Where:** `app/api/payments/razorpay/order/route.ts`, `lib/payment-fulfillment.ts`.

**What happens:** the old order route returned "You are already on this plan" for any current plan. The new guard only fires when `billing.status === "paid"`. A Free user can POST the Free plan id, take the ₹0 branch, and fulfillment treats it as a same-plan renewal because the Free row is `active` with a far-future end date. It creates a ₹0 `paid` order, invoice and payment row, extends the Free period by a month, switches `provider` to `razorpay`, and points `current_payment_order_id` at the ₹0 order. Entitlements do not change (billing state still resolves to `free`), and each call is limited by the `sensitive` rate limit.

**Impact:** data pollution and a misleading funding-order pointer on Free rows. No money moves.

**Recommended fix:** reject the request when `billing.plan?.id === plan.id` for any status, and reject ₹0 plans in the order route (the checkout page already redirects them).

---

### R-06 (P3) The "Plan canceled" confirmation probably disappears right after it shows

**Where:** `app/(dashboard)/billing/CancelPlanDialog.tsx` (`router.refresh()` after success), `app/(dashboard)/billing/page.tsx` (dialog rendered only while `billing.status === "paid"`).

**What happens:** after a successful cancel, `router.refresh()` re-renders the page; the status is now `canceled`, so the dialog component is no longer rendered and its success message (refund amount and `rfnd_` reference) is removed. The billing card then shows the refund status, so nothing is lost, but the reference is only in the email. I did not run this in a browser, so please check it.

**Recommended fix:** keep the confirmation outside the conditionally rendered component, or call `router.refresh()` when the dialog closes.

---

### R-07 (P3) Copy details

- `not_paid` text says "You are on the Free plan" even for a paid plan that was comped for ₹0.
- Terms §5 says "You can cancel a paid plan from the Billing page", but a user with no refund available (past 170 days, below ₹10, cooldown, missing funding order) cannot cancel at all (D3). The dialog explains why, the Terms do not.
- Terms still show "Last updated: October 26, 2026" although §5 changed (Terms §10 promises the date is revised).

---

### R-08 (P3) Ops script and the partial unique index

- `payment_refunds_order_active_unique` covers every non-external kind. After an ops partial refund is `processed`, the order can never get another ops refund, and the user's own cancel is blocked with "A refund for this payment is already in progress" even though that refund is finished.
- `scripts/refund-order.ts` inserts its `requested` row without the user advisory lock and without the cooldown. For an ops tool that is acceptable, but it is outside the lock order in plan §5.4.

---

### R-09 (P3) Runbook and docs

- `RAZORPAY_SETUP.md` lists the new webhook events, but the "What is implemented" table (§1), the migration section (§4), the trust rules (§5) and the staging checklist (§6) do not mention refunds. There is no test-mode checklist for refund, failed refund, dashboard refund, replay, or cancel race.
- §4 still says `db:push` on an existing database, which `drizzle/README.md` forbids.
- There is no short runbook for "refund failed" or for the steps to switch the flag on.
- `PROJECT_FEATURES.md` still says paid checkout and plan upgrades are not available (older than this work; I did not read it fully).

---

### R-10 (P3) Test gaps

Existing tests cover the policy calculator, the service happy path and error branches, the webhook dispatch, `applyProviderRefund` branches, the reconciler and the routes. Missing:

- webhook or reconciler finishing a **user-initiated prorated** refund and ending the plan (R-02)
- `refund.failed` after an accepted refund restoring `amount_refunded` (R-01)
- `fulfillPaymentOrder`: replay after a refund does not re-grant (B-09), and the 409 plan-conflict guard
- order route: blocked while paid, Free plan blocked (R-05)
- account deletion with refund rows
- a real two-request concurrency run against a Neon branch (mocks cannot show lock behaviour)

---

### R-11 (P3) Maintainability notes

- `PATCH /api/subscriptions/[id]` now contains two nearly identical update transactions plus a retry loop. It works and removes the downgrade lockout, but the duplicated block is easy to let drift. Worth extracting.
- The subscription row is not locked `FOR UPDATE` in `applyProviderRefund` or `cancelNow`. This is safe while every writer takes the advisory lock, but `scripts/update-user-plan.ts` does not.
- `GET /api/billing/payments` is not used by the billing page (the page calls `getPaymentHistory` directly). Harmless, owner-scoped, fixed 50-row limit.

---

## 5. Things that are right (worth keeping)

- The refund amount is only ever computed on the server, from the order the subscription points at, in BigInt paise. The client sends `expectedRefund` only as a staleness check, and both the preview and TX1 recompute.
- Double-submit and double-refund are blocked at three levels: advisory lock, partial unique index, and the CHECK on `amount_refunded`.
- Razorpay calls happen outside every lock, with an idempotency key derived from the refund row id and only opaque ids in `notes`.
- Webhook replay is safe at two levels (unique `provider_refund_id` and unique accounting key).
- Permanent Razorpay rejections mark the row `failed` and leave the plan untouched; timeouts leave a retryable `requested` row.
- The flag is off by default, documented in `.env.example`, and a test asserts it stays off.
- The Terms numbers (7, 90, about 170 days, ₹10, 5 to 7 working days) are asserted against the code constants.

---

## 6. Recommended order of work (after your approval)

1. **R-01** reverse a failed accepted refund (code + tests).
2. **R-02** treat user-requested refund rows as cancels in webhook and reconciler (code + tests).
3. **R-03** auto-refund or flag captured-but-unfulfillable payments (code + tests).
4. **R-04** cooldown on non-failed user refunds; decide on external refunds.
5. **R-05** order route rejects same-plan and ₹0 plan.
6. Add the missing tests (R-10), update docs and the staging checklist (R-09), small copy and UI fixes (R-06, R-07, R-08).
7. Then your run: Neon branch, apply 0019/0020, run backfill (dry run first), Razorpay test mode checklist, subscribe refund events, and only then set `BILLING_REFUNDS_ENABLED="true"`.

Nothing above has been changed. Waiting for your approval before implementing any fix.
