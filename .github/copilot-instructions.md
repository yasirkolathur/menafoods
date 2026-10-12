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

## Department 4 AI assistant review (issue #28)
- Review `src/api/routes/assistant-help.js` as **read-only integration code**, not as an installed or deployed Catalyst route. Never generate order-writing AI tools, bypass `/mf-api`, or create a second backend.
- Verify server-sourced `getAssistantScope()`: principal/customer equality, active customer role and `assistant.use` permission; no customer IDs or privileges from the prompt.
- WhatsApp text/voice transcripts may enter only after verified provider signature, replay protection, and sender-to-customer linking in the existing gateway. Do not store raw voice clips or secrets in AI logs.
- Keep deterministic bilingual intent first; optional classifier is bounded and cannot choose arbitrary action names. Customer history, supplier costs, negotiated pricing, credit, VAT and stock never enter model input.
- Test Customer, Seller, Salesperson, Delivery, Admin, Accountant and Storekeeper denial/approval by actual backend identity, not UI-only conditionals. Add cross-tenant, rate-limit, offline, duplicate-tap, RTL, accessibility and provider-outage tests where real integration enables them.
- Before requesting merge, provide exact CI SHA/run receipts, secure Development identity/data evidence, Android/PWA test artifacts and owner-approved GO/NO-GO. Production deployment is never implicit.
