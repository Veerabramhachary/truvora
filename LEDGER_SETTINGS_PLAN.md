# Plan: Delete a business ledger from Settings

## Scope

This document records the proposed implementation plan only. No application code changes, builds, tests, or lint runs are part of this planning task.

## Problem and approach

The existing Settings page supports account deletion but has no ledger-management controls. The ledgers API currently lists and creates ledgers only. Add a destructive Settings action for deleting the business ledger when present, while preserving the personal ledger. Deletion permanently removes data belonging to that business ledger.

## Implementation steps

1. Add an authenticated, owner-scoped `DELETE /api/ledgers/[id]` endpoint that only deletes a business ledger and preserves the personal ledger. Perform deletion transactionally, remove ledger-owned records in foreign-key-safe order, and return explicit errors for invalid, missing, or non-deletable ledgers. Add focused API tests for authorization, ledger-type/invariant protection, and successful deletion.
2. Add a business-ledger management section to `app/(dashboard)/settings/SettingsContent.tsx`, shown when the business ledger exists. Explain the permanent data loss, require a clear confirmation, handle loading/errors, and on success remove the deleted ledger from client state and select the remaining personal ledger. Extend `components/ledger-provider.tsx` with the smallest needed deletion/state update method.
3. Run focused ledger tests and the project test, lint, and TypeScript checks; resolve any regressions introduced by the change.

## Decisions and considerations

- **Deletable ledger:** Business only. Personal remains as the required default ledger.
- **Data policy:** Permanently delete that business ledger's financial records and custom categories.
- The DELETE endpoint must enforce these rules server-side, not rely on the Settings UI.
- Existing ledger-scoped foreign keys do not cascade on ledger deletion, so dependent records need explicit, ordered cleanup in a transaction.
- Keep the existing Settings/account-deletion behavior and incumbent visual style unchanged.
