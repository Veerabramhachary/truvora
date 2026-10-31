-- Step 1 (expand) backfill. Run AFTER the migration that creates `ledgers` and
-- adds the nullable ledger_id columns. Idempotent: safe to re-run, and it MUST
-- be re-run just before step 4, because rows written between the step-1 deploy
-- and the step-2 deploy still have ledger_id NULL.
BEGIN;

-- 1. One personal ledger per existing user.
INSERT INTO ledgers (owner_user_id, type, name)
SELECT u.id, 'personal', 'Personal'
FROM users u
ON CONFLICT (owner_user_id) WHERE type = 'personal' DO NOTHING;

-- 2. Attach existing rows to their owner's personal ledger.
UPDATE expenses e SET ledger_id = l.id
FROM ledgers l
WHERE e.ledger_id IS NULL AND l.owner_user_id = e.user_id AND l.type = 'personal';

UPDATE subscriptions s SET ledger_id = l.id
FROM ledgers l
WHERE s.ledger_id IS NULL AND l.owner_user_id = s.user_id AND l.type = 'personal';

UPDATE transactions t SET ledger_id = l.id
FROM ledgers l
WHERE t.ledger_id IS NULL AND l.owner_user_id = t.user_id AND l.type = 'personal';

UPDATE categories c SET ledger_id = l.id
FROM ledgers l
WHERE c.ledger_id IS NULL AND c.user_id IS NOT NULL
  AND l.owner_user_id = c.user_id AND l.type = 'personal';

COMMIT;
