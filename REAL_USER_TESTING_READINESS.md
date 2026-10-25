# Real-user testing readiness

## Goal

Address the audit findings and verify the app is safe and reliable enough for a limited pilot with real people entering financial data.

## Required before a pilot

- [ ] Implement complete account deletion. Ensure deleting a Clerk account removes or irreversibly anonymizes all user-owned expenses, subscriptions, transaction history, feature usage, and billing records as intended. Make deletion available to users or document a working support process. Verify repeat webhook delivery is safe.
- [ ] Keep the expense ledger consistent. Link each ledger row to its source expense, update the corresponding ledger row on edits, and delete only the linked row when an expense is removed. Avoid matching ledger rows by title/amount/date.
- [ ] Correct the privacy policy to match actual data storage, encryption, retention, deletion, and support practices. Explicitly account for plain-text titles and names, or change how those fields are stored.
- [ ] Prevent CSV formula injection by neutralizing spreadsheet formula prefixes in exported user-controlled fields. Preserve normal CSV quoting and validate with spreadsheet-compatible examples.
- [ ] Configure renewal reminders in production with a verified Resend sender domain; verify delivery in staging. The cron reads its API key and sender from `RESEND_API_KEY` and `RENEWAL_EMAIL_FROM`, personalizes the greeting when a first name exists, and records reminder claims to prevent duplicate sends.

## Deployment and pilot verification

- [ ] Verify production secrets and provider settings: Clerk keys/webhooks, Stripe keys/webhooks and price mappings, database URL, encryption passphrase and salt, app URL, Resend key, and cron secret.
- [ ] Confirm database backups and a tested restore path exist before storing participant data.
- [ ] Exercise sign-up, sign-in, data creation/edit/deletion, export, account deletion, checkout, Stripe webhook retries, and reminder delivery in staging.
- [ ] Check that users cannot access another user's records and that API errors do not expose provider or database details.
- [ ] Review the privacy policy and terms for accuracy and suitability for the intended pilot audience and jurisdictions.

## Audit notes

- Personal-data API handlers generally authenticate with Clerk and scope records by user ID; mutating API requests also have a same-origin guard.
- Free-text note/description columns use encrypted database types, but titles/names are plain text.
- The Clerk `user.deleted` handler currently removes the local user and app subscription rows, while expenses, subscriptions, and transactions do not have user foreign keys that cascade on deletion.
- Expense creation writes a transaction mirror. Expense updates do not update that mirror, and deletion finds a mirror by matching values, which can select the wrong record when entries are duplicates.
- CSV output quotes cells but does not neutralize spreadsheet formula prefixes in user-controlled values.
- The reminder cron requires `RESEND_API_KEY`, `RENEWAL_EMAIL_FROM`, and `CRON_SECRET`; its sender is environment-configured and its delivery table provides per-reminder claims/deduplication. Production sender verification and end-to-end delivery still need staging validation.
- Audit was read-only; no tests or build checks were run. Reassess these findings against the code before closing this task.
