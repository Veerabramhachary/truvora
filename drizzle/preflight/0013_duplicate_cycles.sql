-- READ-ONLY. Run BEFORE applying 0013_subscription_cycle_unique.
--
-- 1) Duplicate (subscription_id, date) pairs would make the unique index fail
--    to build. Expect ZERO rows. Anything returned needs a decision (usually
--    delete the extra copy) before migrating.
SELECT subscription_id, date, count(*) AS copies, array_agg(id ORDER BY created_at) AS transaction_ids
  FROM transactions
 WHERE subscription_id IS NOT NULL
 GROUP BY subscription_id, date
HAVING count(*) > 1;

-- 2) Preview of the first renewal run: how many subscriptions already have a
--    next_date in the past (their nextDate was never advanced before this
--    job existed). Each of these will be caught up on the first run.
--    Prefer the job's own dry run:  GET /api/crons/subscription-renewals?dryRun=1
SELECT count(*) AS subscriptions_due_now,
       min(next_date) AS oldest_next_date
  FROM subscriptions
 WHERE next_date <= now();
