# MENAFoods repository instructions

MENAFoods is a B2B foodstuff wholesale/distribution system. Keep one backend only: the existing Zoho Catalyst project `menafoodscustomermiddleware`. Never create a second backend, database, auth system, accounting engine, or WhatsApp/WABA integration.

## Engineering rules
- GitHub is the source of truth. Make small reviewable commits.
- Preserve existing Zoho Books, Inventory, Commerce and SalesIQ integrations.
- Replit is optional frontend/dev tooling only; never make it a business backend.
- Treat accounting, credit, approvals, identity, permissions and day locks as server-enforced rules.
- AI may extract, normalize, classify and suggest; deterministic rules and authorized humans approve financial mutations.
- Every external write must be idempotent and auditable.
- Never commit credentials, tokens, WABA identifiers, API keys or customer secrets.
- Prefer existing tables/routes/modules before creating new ones.
- Mobile UX must be responsive, accessible and support Arabic RTL.
- Before finishing: build, test the changed path, report evidence, remaining blockers and rollback risk.

## Android
Build from `accountant-agent`. Preserve camera/file chooser behavior. Splash must have deterministic native fallback. Never use a `file://` URL as an OAuth/Catalyst redirect target.

## Cost
Prefer existing GitHub Copilot Pro, GitHub Actions, ChatGPT and Zoho capabilities. Avoid new paid infrastructure unless explicitly approved.