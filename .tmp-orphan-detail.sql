-- READ-ONLY diagnostic: everything still owned by the 2 orphan-transaction users,
-- plus row-level detail of the orphans themselves.
SELECT 'transactions.detail' AS what,
       t.id::text            AS ref,
       t.user_id             AS owner,
       t.type::text          AS detail,
       t.action::text        AS detail2,
       t.amount::text        AS detail3,
       t.date::date::text    AS detail4
  FROM transactions t
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id)
UNION ALL
SELECT 'expenses', e.id::text, e.user_id, e.title, '', '', e."date"::date::text
  FROM expenses e
 WHERE e.user_id IN (SELECT t.user_id FROM transactions t
                      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id))
UNION ALL
SELECT 'subscriptions', s.id::text, s.user_id, s.name, '', '', s."start_date"::date::text
  FROM subscriptions s
 WHERE s.user_id IN (SELECT t.user_id FROM transactions t
                      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id))
UNION ALL
SELECT 'categories', c.id::text, coalesce(c.user_id, '<global>'), c.name, '', '', ''
  FROM categories c
 WHERE c.user_id IN (SELECT t.user_id FROM transactions t
                      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id))
UNION ALL
SELECT 'feature_usage', f.id::text, f.user_id, '', '', '', ''
  FROM feature_usage f
 WHERE f.user_id IN (SELECT t.user_id FROM transactions t
                      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id))
UNION ALL
SELECT 'app_subscriptions', a.id::text, a.user_id, a.status::text, '', '', a."created_at"::text
  FROM app_subscriptions a
 WHERE a.user_id IN (SELECT t.user_id FROM transactions t
                      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id));
