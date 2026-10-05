# Merge Plan

## Preserve
- Existing working auth/session code
- Existing Zoho Books/Inventory/Creator adapters
- Existing stable Catalyst production routes

## Consolidate
- One `/mf-api` contract
- One authorization model
- One credit decision function
- One idempotency strategy
- One cache policy
- One backend/runtime: Zoho Catalyst

## Catalyst first endpoints
- GET /mf-api/bootstrap
- POST /mf-api/webhooks/books
- POST /mf-api/webhooks/inventory
- POST /mf-api/finops/credit/decision
- GET /mf-api/dashboard/finance-ops

## Rollout
Keep CREDIT_MODE=OBSERVE until reconciliation/idempotency tests pass.
