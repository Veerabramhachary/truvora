-- READ-ONLY. After backfill: every count below must be 0 before step 4.
SELECT 'users without personal ledger' AS check, count(*) AS bad
  FROM users u WHERE NOT EXISTS (SELECT 1 FROM ledgers l WHERE l.owner_user_id = u.id AND l.type = 'personal')
UNION ALL SELECT 'expenses without ledger', count(*) FROM expenses WHERE ledger_id IS NULL
UNION ALL SELECT 'subscriptions without ledger', count(*) FROM subscriptions WHERE ledger_id IS NULL
UNION ALL SELECT 'transactions without ledger', count(*) FROM transactions WHERE ledger_id IS NULL
UNION ALL SELECT 'custom categories without ledger', count(*) FROM categories WHERE user_id IS NOT NULL AND ledger_id IS NULL
UNION ALL SELECT 'built-in categories wrongly scoped', count(*) FROM categories WHERE user_id IS NULL AND ledger_id IS NOT NULL
-- Cross-checks: a row's ledger must belong to the same user as the row.
UNION ALL SELECT 'expenses owner mismatch', count(*) FROM expenses e JOIN ledgers l ON l.id = e.ledger_id WHERE l.owner_user_id <> e.user_id
UNION ALL SELECT 'subscriptions owner mismatch', count(*) FROM subscriptions s JOIN ledgers l ON l.id = s.ledger_id WHERE l.owner_user_id <> s.user_id
UNION ALL SELECT 'transactions owner mismatch', count(*) FROM transactions t JOIN ledgers l ON l.id = t.ledger_id WHERE l.owner_user_id <> t.user_id
-- A ledger link must not cross ledgers.
UNION ALL SELECT 'transactions vs expense ledger mismatch', count(*) FROM transactions t JOIN expenses e ON e.id = t.expense_id WHERE t.ledger_id IS DISTINCT FROM e.ledger_id
UNION ALL SELECT 'transactions vs subscription ledger mismatch', count(*) FROM transactions t JOIN subscriptions s ON s.id = t.subscription_id WHERE t.ledger_id IS DISTINCT FROM s.ledger_id;
