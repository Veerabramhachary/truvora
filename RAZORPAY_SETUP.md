# Razorpay checkout setup

This document covers the **requirements** for enabling paid checkout and the
security model of the pages/routes that now exist. The integration is designed
to fail closed: with no keys, the billing page keeps the Upgrade buttons
disabled and the checkout API returns `503`.

## 1. What is implemented

| Piece | Path | Purpose |
| --- | --- | --- |
| Checkout page | `app/(dashboard)/billing/checkout/[planId]/page.tsx` | Server-rendered order summary. Price comes from `plans`, not the URL. |
| Checkout button | `app/(dashboard)/billing/checkout/[planId]/RazorpayCheckoutButton.tsx` | Opens Razorpay Checkout and submits the signed result for verification. |
| Status pages | `app/(dashboard)/billing/success/page.tsx`, `.../failure/page.tsx` | Display-only. They read order status from the DB and never activate a plan from `?order_id`. The failure page also says when a captured payment was refunded automatically. |
| Create order API | `app/api/payments/razorpay/order/route.ts` | Authenticates the user, re-reads the plan price, creates the Razorpay order. Refuses the Free plan, the plan the user is already on, and any switch while a paid period is active. |
| Verify API | `app/api/payments/razorpay/verify/route.ts` | Verifies the signature, re-fetches the payment, checks amount/currency, then grants the plan. |
| Webhook | `app/api/webhooks/razorpay/route.ts` | Signature-verified backup path for `payment.captured`, `order.paid`, `payment.failed` and the three `refund.*` events. |
| Fulfillment | `lib/payment-fulfillment.ts` | Transactional, idempotent grant of the plan + invoice + payment transaction. Never grants an order that is already paid or being refunded. |
| Razorpay client | `lib/razorpay.ts` | Server-only Orders/Payments/Refunds API calls and HMAC verification. |
| Order table | `db/schema/payment-orders.ts` | One row per Razorpay order, scoped to the owner. Holds `amount_refunded` and the period the payment bought. |
| Billing state | `lib/billing-state.ts` | The single definition of "current plan" used by the gate, billing page, checkout and order routes. |
| Refund workflow | `db/schema/payment-refunds.ts`, `lib/refund-service.ts`, `lib/refund-fulfillment.ts`, `lib/refund-policy.ts` | Cancel-now with a refund, the refund state machine, and the policy calculation. |
| Unfulfilled payments | `lib/unfulfilled-payment-refund.ts` | Full automatic refund of a payment Razorpay captured but we could not turn into a plan. |
| Reconciler | `app/api/crons/refund-reconcile/route.ts`, `lib/refund-reconciler.ts` | Daily safety net for refunds left `requested` or `pending`. |
| Ops tools | `scripts/refund-order.ts`, `scripts/billing-dry-run.ts`, `scripts/backfill-payment-periods.ts` | Support refunds, the read-only data check, and the backfill. |

## 2. Razorpay account requirements

1. Create a Razorpay account and complete business/KYC verification for INR
   payments.
2. In **Dashboard → Account & Settings → API Keys**, generate a key pair.
   - Local/staging: `rzp_test_...`
   - Production: `rzp_live_...` only after staging passes.
3. In **Dashboard → Account & Settings → Webhooks**, add:

   ```
   https://<your-public-origin>/api/webhooks/razorpay
   ```

   Subscribe to at least:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
   - `refund.created`
   - `refund.processed`
   - `refund.failed`

   Refunds created in the Razorpay dashboard use the same three refund events,
   so they reach the app even when the user never clicked anything. Leave
   `refund.speed_changed` unsubscribed; if it is subscribed it is acknowledged
   and ignored.

   Use a strong webhook secret and put it in `RAZORPAY_WEBHOOK_SECRET`.
4. Confirm auto-capture is on, or leave it off — the verify route explicitly
   captures an `authorized` payment.
5. Use HTTPS in every non-local environment. Razorpay Checkout will not run from
   an insecure origin. For local testing, expose the app with a tunnel
   (`npm run share` uses ngrok) and set `NEXT_PUBLIC_APP_URL` / webhook URL to
   the tunnel origin.

## 3. Environment variables

Add these to `.env` (and to the deployment environment):

```bash
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."
BILLING_REFUNDS_ENABLED="false"
```

Rules:

- `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` must **never** be
  prefixed with `NEXT_PUBLIC_` or imported into a client component.
- `RAZORPAY_KEY_ID` is the only key value returned to the browser, and only
  from the create-order API.
- Rotating the webhook secret means updating the Razorpay dashboard and the
  deployment together. Razorpay retries deliveries after a 4xx/5xx response.
- `BILLING_REFUNDS_ENABLED` stays `"false"` until the refund checklist in §6
  has passed in test mode. It only controls the user-facing cancel button and
  API; refund webhooks and the automatic refund of unfulfillable payments run
  regardless, because they protect money that has already moved.

## 4. Database migrations

The billing work added these migrations (generate with `npm run db:generate`,
never by hand; see `drizzle/README.md`):

- `0017_razorpay_payment_orders` — `razorpay` provider value, `payment_orders`.
- `0019_refunds_and_cancellation` — refund columns on `payment_orders`
  (`amount_refunded`, `period_start`, `period_end`), `current_payment_order_id`
  and `cancel_reason` on `app_subscriptions`, the `payment_refunds` table, the
  over-refund CHECK and the one-active-refund unique index.
- `0020_*` — one `app_subscriptions` row per user (unique `user_id`). It fails
  if a user has two rows, so run `scripts/billing-dry-run.ts` first.

Apply them with `npm run db:migrate` (or `db:migrate:verbose`) on a Neon branch
first, then production. Do not use `db:push` against a real database.

After migrating, run the backfill (dry run first) so existing paid users have a
funding order and can use cancel-now:

```bash
npx tsx scripts/billing-dry-run.ts
npx tsx scripts/backfill-payment-periods.ts          # dry run
npx tsx scripts/backfill-payment-periods.ts --apply
```

## 5. Payment flow and trust boundaries

```
Browser                    Next.js server                    Razorpay
  |                              |                              |
  | POST /payments/razorpay/order|                              |
  |----------------------------->| auth + rate limit            |
  |                              | read price from plans        |
  |                              | POST /v1/orders ------------->|
  |<-----------------------------| order id + publishable key   |
  | open Checkout -------------------------------------------->|
  |                              |                              |
  | handler(order_id, payment_id, signature)                   |
  | POST /payments/razorpay/verify                             |
  |----------------------------->| HMAC(order_id|payment_id)    |
  |                              | fetch payment -------------->|
  |                              | check amount/currency/status |
  |                              | transaction: paid + plan     |
  |<-----------------------------| success                      |
  |                              |                              |
  |                              |<---- signed webhook ---------|
  |                              | idempotent fallback grant    |
```

Trust rules:

- **Amount** is always recomputed from `plans.price` on the server. It is
  never accepted from the request or the URL.
- **Plan ownership** is checked by filtering orders and subscriptions by the
  Clerk `userId`. A leaked Razorpay order id cannot upgrade another account.
- **Signature** uses `crypto.timingSafeEqual` over the exact HMAC hex. Webhook
  signatures are checked against the raw body before JSON parsing.
- **Idempotency** comes from unique `provider_order_id` /
  `provider_payment_id` / payment idempotency key and a row lock inside the
  fulfillment transaction. Browser verification and webhook delivery may race;
  only one grant happens.
- **No card data** reaches Truvora. Razorpay Checkout collects payment details
  in its own iframe.
- **Rate limits** reuse the existing `sensitive` policy (5 requests/hour) for
  create-order and verify calls, keyed per user. The limiter fails open without
  Redis, so money-moving routes never depend on it alone.
- **Same-origin** mutation checks in `proxy.ts` still apply to both APIs. The
  webhook is public only because Razorpay has no Clerk session; its signature
  is its authentication.

Refund trust rules:

- **Refund amounts are never accepted from a client.** They are recomputed
  from the funding order (`payment_orders.amount_paid`, not the list price).
- **Lock order** for every billing mutation: user advisory lock → order row →
  subscription row. No Razorpay call happens while those locks are held.
- **Double refunds** are blocked by the advisory lock, the partial unique index
  on `payment_refunds`, the `amount_refunded <= amount_paid` CHECK, and the
  Razorpay idempotency key (`rfnd-<refund row id>`).
- **Order status stays `paid`** after a refund, so a replayed
  `payment.captured` cannot grant the plan again.
- **A captured payment that cannot be fulfilled** (second checkout while a paid
  plan is active, withdrawn plan) is refunded in full automatically and the
  order is never fulfilled afterwards. Amount or currency mismatches are not
  refunded automatically and need a person.
- **A refund that fails after it was accepted** is reversed in the database
  (order total, accounting row, discount) and support is emailed. The plan
  stays canceled.

## 6. Staging test checklist

Use Razorpay test keys and test cards/UPI.

- [ ] Billing page shows Upgrade links only when keys are present.
- [ ] Opening `/billing/checkout/<free-plan-id>` redirects to `/billing`.
- [ ] Changing the URL cannot change the amount shown or charged.
- [ ] Completing a test payment activates the plan and writes one invoice and
      one payment transaction.
- [ ] Refreshing `/billing/success?order_id=...` stays idempotent.
- [ ] Replaying the same webhook does not create a second invoice or extend the
      period twice.
- [ ] A tampered `payment_id` / `signature` returns 400 and does not activate.
- [ ] Another user's `order_id` returns 404.
- [ ] `payment.failed` marks the order failed and leaves the old plan intact.
- [ ] Closing the Razorpay modal leaves the old plan intact.
- [ ] Webhook invalid signature returns 400; missing secret returns 503.
- [ ] Production `NEXT_PUBLIC_APP_URL` and webhook URL use the real HTTPS
      origin.

### Refunds and cancellation (test mode, `BILLING_REFUNDS_ENABLED="true"` in staging only)

- [ ] Cancel within 7 days: full refund, plan returns to Free, email arrives,
      the billing card shows the refund and its status.
- [ ] Cancel after 7 days: refund equals unused whole days; the dialog amount
      matches the Razorpay refund.
- [ ] Cancel with a referral discount: the refund is the discounted amount.
- [ ] Cancel twice quickly (two tabs): one refund, the other gets a clear
      message, nothing is refunded twice.
- [ ] Refund issued from the Razorpay dashboard (full): the plan ends. Partial:
      only recorded.
- [ ] Replay each refund webhook: no second accounting row, no second change.
- [ ] Replay `payment.captured` for a refunded order: the plan is not granted
      again.
- [ ] A refund that Razorpay reports as `refund.failed` after cancel-now: the
      order total is restored, support is emailed, and `scripts/refund-order.ts`
      can re-issue it.
- [ ] Open two checkouts (two plans) and pay both: the second payment is
      refunded automatically, the failure page says so, the plan from the first
      is unchanged.
- [ ] A second cancel within 90 days, including while the first refund is still
      pending, is refused.
- [ ] The Free plan cannot be sent through checkout (`400`).
- [ ] Delete an account that has a refund: refund rows are removed and the
      accounting row loses its provider identifiers.
- [ ] Two parallel cancel requests against a Neon branch (mocks cannot show lock
      behaviour).

## 7. Deliberately not included yet

- Recurring card/UPI mandates (Razorpay Subscriptions). The current flow sells
  **one billing period**; `currentPeriodEnd` is set, and the existing renewal
  cron only tracks the user's own subscriptions, not app billing.
- Proration, dunning, GST invoices and credit notes, and credit-based plan
  switching mid-period (switching is blocked while a paid period is active; the
  user cancels first).
- Tax/GST fields on the generated invoice.
- A second payment provider.

Self-serve cancellation/refunds are built but gated by `BILLING_REFUNDS_ENABLED`
(off by default; see Terms §5).

Treat those as follow-up work before marketing “auto-renewing subscriptions”.

## 8. Runbook

**Switching refunds on:** migrations applied → dry run clean → backfill applied
→ refund webhook events subscribed → §6 refund checklist passed in test mode →
set `BILLING_REFUNDS_ENABLED="true"` and redeploy.

**A refund failed (support email received):**

1. Open the payment in the Razorpay dashboard and check the refund status.
2. If Razorpay shows it as failed, the app has already restored the order's
   refundable amount. Re-issue it with
   `npx tsx scripts/refund-order.ts <order id>` (dry run first), or refund from
   the dashboard; the webhook records it.
3. Do not restore the user's plan unless you have decided to; a failed refund
   does not reinstate it.

**A customer says they were charged but have no plan:** look up the order by
Razorpay order id. If the order is `failed` and has a `payment_refunds` row with
`calc.source = "unfulfilled-payment"`, the automatic refund is under way. If
there is no row and the payment is captured, refund it from the dashboard and
check the reason in the logs (`Webhook could not fulfil order`).

**Refund stuck in `requested`:** the daily reconciler retries it with the same
idempotency key. To run it now, call `/api/crons/refund-reconcile` with the
`CRON_SECRET` bearer token (add `?dryRun=1` to preview).
