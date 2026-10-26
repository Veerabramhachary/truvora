# Production Readiness Checklist

This checklist reflects the current code, not the older
`REAL_USER_TESTING_READINESS.md`. Check off manual items only after verifying
them in a staging environment configured like production.

## Manual staging tests

- [ ] Sign up, verify email, sign in, sign out, and confirm a signed-out user
      cannot access dashboard pages or protected APIs.
- [ ] Create, edit, list, export, and delete expenses and subscriptions. Check
      that the right user's records appear, ownership is enforced, and expense
      changes stay consistent in the transaction history.
- [ ] Try invalid input, missing records, and another user's record IDs; confirm
      requests fail safely without exposing database or provider details.
- [ ] Test CSV exports in spreadsheet software with values beginning with
      `=`, `+`, `-`, and `@`; confirm they are treated as text and normal values
      still export correctly.
- [ ] Delete an account in Settings. Confirm Clerk deletion completes and the
      signed `user.deleted` webhook removes that user's finance records,
      categories, usage, and account data. Retry the webhook and confirm it is
      safe to process again. Check that retained billing aggregates are
      anonymized as intended.
- [ ] Verify the deployed renewal cron runs on schedule, rejects missing or
      incorrect `CRON_SECRET`, sends to the intended recipients, and does not
      send duplicate reminders after retries. Confirm Resend sender-domain
      verification and delivery in its logs.
- [ ] Exercise plan feature limits through the UI and direct API requests,
      including concurrent requests near a limit. Confirm denied operations
      don't consume quota unexpectedly.
- [ ] Confirm the current checkout behavior is intentional: authenticated
      checkout requests return `503` because payments are disabled.
- [ ] Test on supported mobile and desktop browsers, including empty states,
      error states, and recovery after refresh or network failure.

## Implementation still outstanding

- [ ] **Payment launch:** checkout is intentionally disabled in
      `app/api/stripe/checkout/route.ts`. Before accepting payments, enable it
      deliberately and complete end-to-end Stripe test-mode coverage for
      checkout, price/plan matching, webhook signature verification and
      retries, subscription state changes, refunds/failures as applicable,
      customer mapping, and cancellation. Update the privacy policy and
      configure live Stripe keys, webhook, and price IDs only after staging
      passes.
- [x] **Request rate limiting:** shared Upstash Redis limits cover authenticated
      APIs, exports, sensitive account/billing actions, and public plans/prices
      endpoints. Configure Redis credentials in each deployed environment and
      review limits and limiter error logs after launch.
- [x] **Account-erasure cleanup:** the Clerk deletion webhook does not delete
      rows from `reminder_deliveries`. Remove or irreversibly anonymize those
      rows for the deleted user's subscriptions as part of the same cleanup,
      and verify the behavior with repeat webhook delivery.
- [ ] Review the Terms and Privacy Policy with appropriate legal guidance for
      the actual service, jurisdictions, retention, and support contact.

## Production deployment checks

- [ ] Set and verify production environment variables: `DATABASE_URL`,
      `ENCRYPTION_PASSPHRASE`, `ENCRYPTION_SALT`, Clerk keys and webhook secret,
      `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `RESEND_API_KEY`,
      `RENEWAL_EMAIL_FROM`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, and
      `UPSTASH_REDIS_REST_TOKEN`. Keep secrets out of source and CI logs. Add
      Stripe secrets only when payments are enabled.
- [ ] Confirm database migrations are applied, backups are running, and a
      restore has been tested. Protect the encryption passphrase and salt:
      changing them makes existing encrypted values unreadable.
- [ ] Confirm the deployed Vercel cron matches `vercel.json` and that required
      plan/category seed data exists.
- [ ] Review provider dashboards for webhook health, cron executions, email
      delivery, error rates, and database capacity after staging and initial
      production traffic.
- [ ] Confirm CI is green for lint, tests, type-check, and production build.

## Current automated coverage

CI runs lint, Vitest, `npx tsc --noEmit`, and `next build`. The current Vitest
suite has a few Stripe route and ownership-filter tests; it does not replace
the staging checks above, especially for real webhook delivery, database
cleanup, cron execution, or provider configuration.
