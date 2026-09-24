# Merge Plan

## 1. Preserve
- Existing working auth/session code
- Existing Zoho Books/Inventory/Creator adapters
- Existing production routes that are already stable

## 2. Consolidate
- One `/mf-api` contract
- One authorization model
- One credit decision function
- One idempotency strategy
- One cache policy

## 3. Replit cleanup
Search for:
- local DB schemas storing customers/products/orders/payments
- direct Zoho secrets
- direct Books/Inventory browser calls
- duplicated pricing/credit rules

Replace with calls to Catalyst `/mf-api`.

## 4. Catalyst first endpoints
- GET /mf-api/bootstrap
- POST /mf-api/webhooks/books
- POST /mf-api/webhooks/inventory
- POST /mf-api/finops/credit/decision
- GET /mf-api/dashboard/finance-ops

## 5. Rollout
Keep CREDIT_MODE=OBSERVE until reconciliation/idempotency tests pass.
