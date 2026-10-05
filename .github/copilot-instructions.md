# MENAFoods Copilot Instructions

## Architecture lock
- Zoho Catalyst project `17990000000237407` / `menafoodscustomermiddleware` is the single backend/runtime.
- Do not create a second backend, local business database, or Replit production API.
- GitHub is source control and CI only.
- Zoho Books is accounting authority.
- Zoho Inventory is stock/fulfillment authority.
- Zoho Creator may be used for operational cache/workflows/approvals where already established.

## Security
- Never commit secrets, refresh tokens, client secrets, webhook secrets, or credentials.
- Keep privileged Zoho calls server-side in Catalyst.
- Frontends use `/mf-api/*` only.
- Preserve tenant/customer scope and role checks.

## Core P0 invariants
- COD checkout uses 15% VAT where applicable.
- Persist canonical Zoho `salesorder_id`.
- Keep idempotency and duplicate prevention.
- Unknown provider outcomes go to manual review; never blindly retry.
- Zero stock is valid data, not a missing-data error.
- Admin/Owner integration setup remains protected.

## Change discipline
- Prefer small PRs with tests.
- Do not overwrite working Catalyst auth/session or existing Zoho adapters blindly.
- Keep CREDIT_MODE=OBSERVE until reconciliation/idempotency tests pass.
