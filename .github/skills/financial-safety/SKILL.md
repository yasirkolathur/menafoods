---
name: financial-safety
description: Use whenever code creates, changes, approves, reconciles, locks or synchronizes financial/accounting records.
---
# Financial safety
- AI extracts/suggests only; deterministic validation and authorized approval control posting.
- Never auto-resolve uncertain totals, counterparties, tax, payment allocation or duplicates.
- Require idempotency for Books writes.
- Store upstream Zoho Books identifiers and sync status.
- Preserve immutable audit history for approval/rejection/reopen/sync.
- Daily close must reconcile expected vs physical cash and block unresolved differences.
- Reopening a locked day requires authorized reason and audit event.
- Test duplicate submission, retry after timeout, partial failure and unauthorized mutation.