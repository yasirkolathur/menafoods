# MENAFoods repository audit — 2026-10-09

## Scope and evidence

Read-only source inspection of yasirkolathur/menafoods. Main tree at 52ab95687aaa93cc148b64a1d38b842107ad3c73 contains README.md and the accountant verification workflow. Catalyst core inspected at 9ebaa132c15c42785ff2442755e039cd1b19ff3a; checkout helpers inspected at dc7a56d30c3a3e33a5f1270688ac906409a9cb3a. Open PRs #14 and #23 already propose these helpers. This audit does not prove current deployment behavior or repeat those implementation PRs.

The existing runtime remains menafoodscustomermiddleware / mf_zoho_gateway. No new project, backend, datastore, order writer, Replit service, or deployment is proposed.

## Findings and focused repair batches

### 1. Authentication and business isolation

src/api/routes/bootstrap.js checks ctx.user.id and provider presence, then requests profile, permissions, summary and versions concurrently. It does not explicitly bind the returned profile to the authenticated identity, check ACTIVE membership or permitted business role, or gate cache reads on authorization success. Dashboard lookup accepts only user ID; business isolation depends on an unseen adapter.

src/frontend/shared/api-client.js has no explicit credentials setting. Fetch defaults to same-origin cookies, so same-origin deployments may work; cross-origin use requires verified Catalyst domain/auth configuration. Do not change auth transport blindly.

First repair batch in the private gateway: identify its real session/profile schema; verify identity, ACTIVE membership and selected business before provider/cache reads; bind cache, cart and history keys to authenticated business scope. Test two identities and business switching, forbidden membership, logout and invalid sessions. Preserve working OTP/OAuth.

### 2. Customer pricing and unit/tax mapping

src/api/lib/checkout-gates.js rejects client monetary fields, duplicate SKU splits and unverified sources, and uses integer-halalas arithmetic. It trusts server adapter flags such as customerPriceVerified, stockFresh and taxMappingVerified; the inspected branch contains no concrete Creator pricing resolver or Books tax/unit mapper that establishes those facts.

The quote result does not include a Books tax ID or taxInclusive flag. The private payload builder must obtain and reconcile those separately; whether that builder does so cannot be established here.

Second repair batch: connect existing scoped Creator price resolution and existing Books/Inventory mappings; verify customer-specific prices, CTN/PCS precision, VAT-inclusive/exclusive and zero-rate cases against actual provider values. Block unmapped products and stale stock. Keep purchase costs out of customer responses.

### 3. Checkout persistence and retry reconciliation

src/api/routes/sales-order-once.js provides a gated helper, stable server-cart token, payload conflict detection and read-before-write reconciliation. src/api/lib/idempotency.js requires claim/get/complete/release functions, but no concrete durable Catalyst adapter is present. Function shape validation alone cannot guarantee atomic cross-instance claims.

The helper retains claims after ambiguous provider/completion failures. No recovery worker or administrative reconciliation implementation is visible. Pre-post read-only failures explicitly release claims; correctness depends on durable storage and the callback having no financial side effects.

Third repair batch: reuse the existing order writer, implement/verify datastore-enforced atomic claims and ownership, persist canonical Books salesorder_id, and provide recovery using customer plus stable reference and full totals/lines comparison. Test concurrent sessions, double taps, changed payloads, provider timeouts and completion failures. Keep credit OBSERVE.

### 4. Zoho Books and webhook integrations

findExisting, createBooksOrder, verifyPrePostPayload and verifyBooksResult are injected functions, not concrete Books adapters in the inspected checkout branch. OAuth refresh, actual organization scoping, payload serialization and Creator Sales_Order_ZBooks synchronization cannot be verified.

src/api/routes/webhook-books.js validates event fields but does not verify ingress authentication/signature itself. Its idempotency key uses module plus record ID without an explicit organization or event/version discriminator. Adapter/ingress scoping may compensate, but is not visible: distinct updates to a record may otherwise be suppressed, and multi-organization keys may collide. Verify provider retry/event semantics before changing key design.

Fourth repair batch: inspect existing ingress and OAuth adapters; authenticate notifications before cache mutations, scope keys to trusted organization and provider event identity, and test repeat deliveries versus distinct updates. Reconcile Books and Creator records using the existing single writer.

## Integration blocker

docs/CATALYST_DEVELOPMENT_INTEGRATION_HANDOFF_20261005.md states that the actual existing gateway source is private and that public catalyst-core-p0 is scaffolding/tests, not a complete deployed function. Neither inspected core nor checkout tree includes catalyst.json or .catalystrc. Do not initialize another project or fabricate these files.

Required handoff: make the current private mf_zoho_gateway and hosted-client source available in a restricted workspace/private repository, with its existing deployment manifests and non-secret configuration. Do not upload that source or credentials to this public repository. Confirm the current deployed source version before integration.

## Validation and limitations

Repository trees, source files, runtime contract, handoff and open PR metadata were read through connected GitHub tools. No local application checkout was available; the prior clone failed and network access was cancelled. No unit, authenticated E2E, live HTTP, or provider-write tests were run in this audit. Existing test fixtures demonstrate intended contracts, not live integration.

This PR is documentation only. No backend fixes, credential changes, Books orders, merges or deployments occurred. Once private source is available, run baseline unit checks, implement the batches above with regression tests, and run authenticated Development verification before proposing any release.
