-- READ-ONLY. Run BEFORE the backfill and again before step 4.
-- Rows whose user_id has no users row cannot get a ledger (ledgers.owner_user_id
-- is a FK to users). Expect every count to be 0; anything else needs a decision.
SELECT 'expenses' AS tbl, count(*) AS orphans, count(DISTINCT user_id) AS users
  FROM expenses e WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.user_id)
UNION ALL
SELECT 'transactions', count(*), count(DISTINCT user_id)
  FROM transactions t WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id)
UNION ALL
SELECT 'subscriptions', count(*), count(DISTINCT user_id)
  FROM subscriptions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)
UNION ALL
SELECT 'categories (custom)', count(*), count(DISTINCT user_id)
  FROM categories c
  WHERE c.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id);
