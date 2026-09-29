---
name: catalyst-single-backend
description: Use for MENAFoods APIs, datastore, auth, customer onboarding, Zoho sync, webhooks or backend business logic.
---
# Catalyst implementation skill
- Search existing Catalyst routes/tables/mappings first.
- Keep customer identity and business association canonical; do not duplicate Zoho customers for an existing business.
- Existing-customer association requires controlled approval before protected commercial data is exposed.
- New businesses may enter cash/prepaid purchasing flow while credit remains separately controlled.
- Validate input, authorize server-side, use stable idempotency keys and write audit events.
- Handle Zoho timeouts/rate limits with retry-safe states.
- Never log secrets or sensitive payloads unnecessarily.
- Add verification for unauthorized, duplicate and upstream-failure cases.