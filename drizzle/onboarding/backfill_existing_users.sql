-- Run ONLY if you reconcile the schema with `npm run db:push` instead of
-- `npm run db:migrate`. `push` adds the column but does not run the UPDATE that
-- lives inside migration 0014, so without this every existing user would be
-- redirected into the sign-up wizard on their next page load.
--
-- Run it right after the schema change and BEFORE deploying the new code.
UPDATE users SET onboarding_completed_at = now() WHERE onboarding_completed_at IS NULL;
