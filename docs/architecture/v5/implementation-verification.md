# Architecture v5 implementation verification

## Current safe branch
All work in this document applies to `architecture-v5-low-api`. Do not merge to `main` until the real Replit source is imported and E2E gates pass.

## Verified contract rules
- Credit mode defaults to OBSERVE.
- A proposed hold/prepaid result in OBSERVE returns `decision=OBSERVE` plus `proposed_decision`.
- Approved overrides return ALLOW.
- Untrusted finance data cannot enforce a hold.
- Idempotency supports atomic claim/complete stores when available and falls back to get/put for adapters that do not yet support atomic claims.
- Shared frontend client has request timeout handling and structured API errors.
- Browser client does not contain Zoho secrets.

## Required integration tests after Replit source import
1. Existing auth/session can satisfy GET /mf-api/bootstrap.
2. Duplicate Books payment webhook produces one operational mutation.
3. Duplicate Sales Order sync updates/no-ops rather than inserts a lifecycle copy.
4. OBSERVE overdue customer returns proposed CREDIT_HOLD without blocking the order.
5. Approved override returns ALLOW.
6. Replit and Catalyst frontends consume the same API client contract.
7. No normal dashboard render directly calls Books and Inventory from the browser.
8. No secrets are present in frontend bundles.
9. Current delivery/supplier flows continue to pass.
10. Credit ENFORCE remains disabled until all reconciliation tests pass.
