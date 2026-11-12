# Discount / Referral Campaign Audit — Truvora

**Audited:** 2026-11-12  
**Scope:** `db/schema/platform-discounts.ts`, `db/schema/users.ts`, Clerk webhook, referral capture, Razorpay checkout, plans seeder, middleware (`proxy.ts`), `PROJECT_FEATURES.md`, `PLAN_GUIDE.md`.

---

## 1. What exists (implemented)

| Layer | File | What it does |
|---|---|---|
| Schema | `db/schema/platform-discounts.ts` | `platform_discounts` table: `id`, `platform` (unique), `name`, `discountType` (`percent`\|`amount`), `discountValue` decimal(10,2), `currency`, `duration` (`once`\|`repeating`\|`forever`, default `once`), `durationInMonths`, `maxRedemptions` (default 50), `isActive` (default true), `startsAt`, `endsAt`, `metadata` jsonb, timestamps. |
| Migration | `drizzle/0007_platform_referral_discounts.sql` | Creates `platform_discounts`; adds `users.referral_platform` and `users.platform_discount_id` (FK, onDelete set null). |
| Users | `db/schema/users.ts` | `users.referralPlatform` (text), `users.platformDiscountId` (uuid → platform_discounts.id). |
| Attribution (signup) | `app/api/webhooks/clerk/route.ts` | On `user.created`/`user.updated`, reads `unsafe_metadata.referralPlatform`, looks up a matching `platform_discounts` row by `platform`, stamps `platformDiscountId` + `referralPlatform` on the user row. Wrapped in a transaction with an advisory lock; idempotent via `onConflictDoUpdate`. Non-fatal if no campaign matches. |
| Capture plumbing | `components/referral-capture.tsx` | Reads `?ref=` query param, trims/lowercases/slices to 64 chars, writes to `sessionStorage` key `truvora.referral-platform`. Mounted in root `app/layout.tsx` so it runs on every page. |
| Sign-up forwarding | `app/auth/sign-up/page.tsx` | Reads `ref` param / sessionStorage and sends `unsafeMetadata.referralPlatform` in both email/password `signUp.create` and OAuth `authenticateWithRedirect`. |

**Current behavior:** A user who signs up with `?ref=producthunt` gets `platformDiscountId` stamped on their user row if a campaign with `platform = 'producthunt'` exists. That's it. The discount is **attribution only** — it is never shown, never validated, and never reduces a price.

---

## 2. What does NOT exist (gaps)

| Gap | Detail |
|---|---|
| **No admin CRUD** | No API route to create/list/update/deactivate a discount campaign. The only way to add one is a direct DB insert (Drizzle Studio / psql). No seed script either (`scripts/plans.ts` seeds plans only). |
| **No redemptions table** | `platform_discount_redemptions` appears in old `drizzle/meta` snapshots (0014/0015) but is **not** in `db/schema/` and not in any migration (latest is `0017`). So there is no tracking of who used a discount, no `maxRedemptions` enforcement, and no one-redemption-per-user protection. |
| **Discount never applied to money** | Razorpay order route (`app/api/payments/razorpay/order/route.ts`) charges full `plan.price`. No percent/amount-off calculation, no discounted amount passed to Razorpay, no discount reference stored on `paymentOrders`. |
| **No validity checks at signup** | The webhook matches by platform name only. It does not check `isActive`, `startsAt`/`endsAt`, or `maxRedemptions`. A user can be stamped with an expired/inactive campaign. |
| **No UI** | No "apply promo code" field on checkout/billing, no discounted price display on `/pricing` or billing, no admin dashboard for campaigns, no user-facing confirmation that a referral discount was recognized. |
| **Schema drift vs snapshots** | Snapshots 0014/0015 include a `provider_coupon_id` column on `platform_discounts`; the current `db/schema/platform-discounts.ts` does not. Minor, but worth reconciling if we build a Razorpay-coupon integration. |

---

## 3. Issues & risks

1. **Discount is stamped but never honored.** A referred user sees no benefit at checkout — the feature is dead ends-to-end.
2. **No redemption enforcement.** `maxRedemptions` is defined but unenforceable without a redemptions table + unique constraint.
3. **Silent best-effort attribution.** If the platform name doesn't match a campaign (typo, case, inactive), sign-up still succeeds — which is correct for UX, but there's no logging/telemetry to tell ops that a referral code was ignored.
4. **No authorization model for discount management.** There is no `role` column on `users` and no admin table, so an admin CRUD API has no natural gate. Would need a Clerk-user-ID allowlist (env) or a new role concept.
5. **Checkout is amount-rigid.** The Razorpay order route re-derives the amount from `plans.price` and asserts the provider order amount matches exactly (`BigInt(order.amount) !== amountPaise` → 502). Any discount integration must recompute server-side and store the discounted amount on the payment order before calling Razorpay, or the verify step will reject the mismatch.

---

## 4. What this feature is NOT (per PROJECT_FEATURES.md / PLAN_GUIDE.md)

- Not a referral **payout** or affiliate-commission system ("attribution plumbing, not an available referral payout or checkout flow").
- Not automatic renewals, cancellation, refunds, or proration ("each checkout buys a single billing period").
- Not multi-provider — paid checkout is Razorpay only.
- Not bank/card connections or automatic import.

---

## 5. Recommended plan (phased)

### Phase 1 — Foundation (tracking + validation) — DO

1. **Add `platform_discount_redemptions` table** (new migration):
   - `id` uuid PK
   - `platform_discount_id` uuid → platform_discounts.id
   - `user_id` text → users.id
   - `payment_order_id` uuid → payment_orders.id (nullable; links to the checkout that used it)
   - `status` enum: `pending` | `completed` | `failed` | `refunded`
   - `amount_off` decimal(10,2), `currency`
   - `redeemed_at` timestamp
   - Unique index `(platform_discount_id, user_id)` → one redemption per user per campaign (enforces max redemptions at the DB level).
   - Keep `maxRedemptions` enforced by counting completed redemptions before granting.

2. **Admin API for campaigns** (`app/api/platform-discounts/*`): GET list, POST create, PATCH deactivate/update, DELETE. Protect with a simple allowlist (e.g. `DISCOUNT_ADMIN_USER_IDS` env var, comma-separated Clerk IDs) since no role system exists. Add to `proxy.ts` public allow-list only if you want public read (recommend: keep admin routes private/authenticated).

3. **Validity checks in the webhook** (best-effort, non-blocking):
   - Only stamp `platformDiscountId` if the matched campaign is `isActive` and within `startsAt`/`endsAt`.
   - Log when a `ref` is ignored (no match / inactive / expired) so ops can see attribution leakage.
   - Never fail user creation because of a discount issue.

4. **Seed script** `scripts/insert-discounts.ts` (or add to plans seed) so local/dev/staging have sample campaigns (e.g. `producthunt` 20% off first month).

### Phase 2 — Apply discount at checkout — DO

5. **Extend `paymentOrders`** (or a linked discount row) with `discount_id`, `discount_amount`, `discount_currency` so the paid amount is auditable.

6. **Razorpay order route** accepts an optional `discountCode`/`platform` in the body:
   - Validate the code/platform belongs to the authenticated user (or is a public active campaign) and is unredeemed for that user.
   - Compute discounted amount: percent → `price * (1 - value/100)`; amount → `price - value`. Floor at 0.
   - If the result is 0 (fully comped), skip Razorpay and fulfill directly (or still create a `created`/`paid` order without a provider call — decide in Phase 2 design).
   - Pass the discounted amount to Razorpay; store `discount_id` + `discount_amount` on `paymentOrders`.
   - The verify route already asserts `payment.amount === toPaise(order.amount)` — since we set `order.amount` to the discounted amount server-side, the existing check stays valid.

7. **Fulfillment** (`lib/payment-fulfillment`): on successful capture, insert a `completed` redemption row (inside the same transaction as subscription grant) and mark the payment order.

### Phase 3 — UI — DO (only after Phase 2 works)

8. **Promo code field** on the billing/upgrade checkout page (`app/(dashboard)/billing/checkout/[planId]/`); show discounted price before the user commits.
9. **Pricing page** optional: show "Referred? Add your code at checkout" messaging. No auto-applied discounts on public plan cards (keep prices canonical).
10. **Admin UI** (optional): simple list/toggle for campaigns. Defer unless ops needs self-serve campaign management.

### Explicitly NOT do (out of scope)

| Item | Reason |
|---|---|
| Referral payouts / affiliate commissions / revenue share | Project defines attribution plumbing only, not payouts. |
| Auto-apply discounts to renewals / existing subscriptions | No auto-renewal or proration exists; each checkout buys one period. |
| Refund / proration flow | Not built; out of scope for a discount MVP. |
| Stripe / PayPal coupon integration | Razorpay is the only payment provider. |
| Making discount validation block sign-up | Keep attribution best-effort; a bad `ref` must never prevent account creation. |
| Public CRUD for discounts | Campaign creation/management is ops-only; no anonymous discount authoring. |
| `provider_coupon_id` Razorpay coupon sync | Adds external dependency; only if Razorpay coupons are actually used later. |
| Multi-use / stackable coupons beyond one-per-user-per-campaign | Keep the redemption model simple (one redemption per user per campaign). |

---

## 6. Open questions to confirm before building

1. **Who manages campaigns?** No admin role exists. Should discount CRUD be gated by a comma-separated `DISCOUNT_ADMIN_USER_IDS` env var (Clerk IDs), or do you want a `role` column on `users` first?
2. **One redemption per user per campaign, or one per user total?** The schema's `maxRedemptions` is campaign-level; I recommend unique `(platform_discount_id, user_id)`.
3. **Fully-comped (100% off) checkouts:** skip Razorpay entirely and mark the order `paid` server-side, or still route through Razorpay for a ₹0 order?
4. **Can a discount apply to a plan change mid-period, or only new checkouts?** Phase 2 assumes new checkout only.
5. **Should a `ref` discount also apply to yearly plans?** The math is the same; just confirm.

---

**Next step:** Confirm the plan above (phases, admin gating, 100%-off behavior). Once approved I'll implement Phase 1 (redemptions table + migration + admin API + webhook validity checks + seed script), then Phase 2 (checkout discount application).
