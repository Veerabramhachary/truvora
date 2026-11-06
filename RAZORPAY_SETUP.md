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
| Status pages | `app/(dashboard)/billing/success/page.tsx`, `.../failure/page.tsx` | Display-only. They read order status from the DB and never activate a plan from `?order_id`. |
| Create order API | `app/api/payments/razorpay/order/route.ts` | Authenticates the user, re-reads the plan price, creates the Razorpay order. |
| Verify API | `app/api/payments/razorpay/verify/route.ts` | Verifies the signature, re-fetches the payment, checks amount/currency, then grants the plan. |
| Webhook | `app/api/webhooks/razorpay/route.ts` | Signature-verified backup path for `payment.captured`, `order.paid` and `payment.failed`. |
| Fulfillment | `lib/payment-fulfillment.ts` | Transactional, idempotent grant of the plan + invoice + payment transaction. |
| Razorpay client | `lib/razorpay.ts` | Server-only Orders/Payments API calls and HMAC verification. |
| Order table | `db/schema/payment-orders.ts` | One row per Razorpay order, scoped to the owner. |

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
```

Rules:

- `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` must **never** be
  prefixed with `NEXT_PUBLIC_` or imported into a client component.
- `RAZORPAY_KEY_ID` is the only key value returned to the browser, and only
  from the create-order API.
- Rotating the webhook secret means updating the Razorpay dashboard and the
  deployment together. Razorpay retries deliveries after a 4xx/5xx response.

## 4. Database migration

The change adds:

- `payment_provider` enum value `razorpay`
- `payment_order_status` enum
- `payment_orders` table (unique `provider_order_id`, unique
  `provider_payment_id`, owner FK)

Generate and commit the SQL + snapshot:

```bash
npm run db:generate -- --name razorpay_payment_orders
```

Then apply it with the normal process for the environment (`db:migrate` on a
fresh DB, `db:push` on an existing reconciled DB — see `drizzle/README.md`).

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
  create-order and verify calls, keyed per user.
- **Same-origin** mutation checks in `proxy.ts` still apply to both APIs. The
  webhook is public only because Razorpay has no Clerk session; its signature
  is its authentication.

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

## 7. Deliberately not included yet

- Recurring card/UPI mandates (Razorpay Subscriptions). The current flow sells
  **one billing period**; `currentPeriodEnd` is set, and the existing renewal
  cron only tracks the user's own subscriptions, not app billing.
- Refund UI, cancellation/self-serve plan changes, proration, dunning and
  GST invoices.
- Tax/GST fields on the generated invoice.
- A second payment provider.

Treat those as follow-up work before marketing “auto-renewing subscriptions”.
