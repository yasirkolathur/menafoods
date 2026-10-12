# Department 4 — guarded assistant and QA gate (issue #28)

**Decision: NO-GO for Production and for the live pilot until evidence below is complete.**
**Scope:** staged read-only adapter for existing Catalyst `menafoodscustomermiddleware` / `mf_zoho_gateway`, NOT a new backend or an installed live route. Based on unmerged PR #23, which depends on unmerged core PR #14. Department 1 frontend PR #29 is independent and must be reconciled before integration.

## Implemented in this draft branch
- `src/api/routes/assistant-help.js` exposes an **integration function**, not a deployed /mf-api route. A gateway owner must explicitly mount **POST /mf-api/assistant** into the recovered/current Catalyst function after verifying its auth/session plumbing.
- `MenaApi.assistant(text,locale)` uses the same protected /mf-api origin. No alternate AI API, database, write path or WhatsApp endpoint is created.
- User input strictly accepts `text` (1–500 characters) and `locale` (en/ar). Rejects client identity, credit, tax, price, unit, confirmation or role overrides. Server-resolved customer identity is mandatory.
- Server-only customer role and `assistant.use` permission, customer active state, and principal ID agreement are mandatory. Staff roles are intentionally blocked **until** separate audited, server-scoped support policies exist. Do not infer authorizations from app screen visibility.
- Verified WhatsApp webhook identity and customer linking must be established **upstream** before entering the same handler, including signed provider webhook validation, replay protection and consent. `intakeVerifiedWhatsApp` accepts only typed text or an existing voice transcript; voice is **held for same-sender customer confirmation** before any model, catalog or order read. The gateway must establish `transcriptConfirmedServerSide` from its own protected correlation state. This PR does not include or claim to integrate a transcription provider or raw voice capture.
- **Default-OFF release flag:** gateway must map `ctx.flags.assistantEnabled` from a server-owned opt-in `MF_ASSISTANT_ENABLED === "true"`; missing/false is 503 with no provider calls. Model classification has a separate default-OFF flag `ctx.flags.modelEnabled`. These flags are **not added to or enabled in Catalyst by this PR**.
- Bounded durable limiter contract: **30 requests/customer-user/hour**. Missing/failed limiter = 503; depleted = 429. No retries. EN/AR deterministic intent classification avoids model calls on common intents. Unknown intent may call one cheap optional classifier with a 24-token output limit and 1-second timeout, but only with **server-approved intent keywords** (no raw prompt, customer name/address or Zoho data). Model may ONLY choose one allowlisted intent.
- Product search requires authenticated customer-scoped catalog callback; returned items are a strict identity/name/SKU allowlist with hard maximum 5 verified rows; order status maximum 3. Provider errors return generic 503 and unsafe/mixed-tenant rows return generic 502, never raw internal errors. Branch-scoped records require selected server-owned outlet or `allBranchesAllowed` plus `assistant.all_branches` server permission. No model-derived or stale client price, VAT, stock, purchase cost, supplier names, margins or credit data. Display up-to-date sell prices solely via existing authenticated catalog/cart and server quote.
- Order status uses customer-scoped read-only history with output allowlist of number/status. Reorder opens **existing** Buy Again (not a cart mutation). Support opens existing support UI. Suggestions always require **human confirmation** in the actual cart/checkout. Assistant never invokes Books, Creator order writes, credit decisions or order approval.
- Telemetry emits aggregate intent/channel/count flags, never raw prompts or secrets. Do not log the caller's exception or raw webhook payload. Cache may be added only for scoped public catalog data with customer and version in key; never cache cross-customer prices or conversations.

## Mandatory production integration contract
1. Recover and hash the **actual hosted** `mf_zoho_gateway` source and current client; reconcile PR #14/#23 and Department 1 first. Confirm exact mapping `/mf-api` vs legacy `/server/mf_zoho_gateway`. Do not overwrite runtime blindly.
2. Bind the route only **after** existing Catalyst session auth. Implement `ctx.auth.getAssistantScope()` from server-owned user/customer/role/permission mappings, never request data. Bind `ctx.channel` from trusted gateway transport (web/android/whatsapp), not request body. Require the existing signed/verified WhatsApp provider intake and sender/customer association. Treat unmapped senders as customer service only, not catalog/order access.
3. Bind `ctx.rateLimiter.consume` to **atomic, durable** existing Catalyst storage; implement shared timeout/retry detection; never use an in-memory process counter for enforcement. Bind `ctx.catalog.searchForCustomer` and `ctx.orders.listRecentForCustomer` to Zoho operational reads **restricted to the same customer**. Fail closed on missing customer field, mixed rows, stale mapping or unavailable provider.
4. If `ctx.model.classifyIntent` is enabled, select a cost-capped provider under organization policy. Keep secrets server-side, opt out of provider prompt retention where possible, scrub messages, and do not grant tool calls/function calls to the model. Never send Zoho order histories, financial data or raw WhatsApp voice clips to a model for classification.
5. Wire Android and PWA role-specific assistant entry to shared API only after actual current app source recovery. Maintain WCAG keyboard labels, focus management, screen-reader announcement, RTL mirroring, Arabic font and Android splash/logout/auth recovery. Do not collect microphone input silently.
6. Keep a single existing Catalyst Sales Order writer from #23. Assistant has **zero** order/credit write capability. Any Buy Again/WhatsApp transcription passes through existing protected cart + checkout, updated live quote, all stock/tax/credit checks, explicit confirmation and durable idempotency.

## Test and role-permission matrix
| Role | Assistant discovery | Own order status | Accounting data | Create order via AI |
| --- | --- | --- | --- | --- |
| Customer | Allowed with server permission | Own business only | Denied | Never |
| Salesperson | Denied until audited delegation | Denied until scoped delegation | Privileged app rules, not assistant | Never |
| Delivery | Denied | Denied via assistant | Not in assistant | Never |
| Admin/Owner | Denied in this adapter until scoped admin policy | Denied in this adapter | Separate privileged backend | Never |
| Accountant | Denied | Denied via assistant | Separate privileged backend | Never |
| Seller | Denied | Denied | Denied | Never |
| Storekeeper | Denied | Denied | Outside assistant | Never |

CI deterministic cases include: EN and Arabic intent recognition, redaction, prompt injection/model output filtering, false identity, role and permission mismatches, cross-customer product and order leaks, denied/missing rate limits, WhatsApp proof, no autonomous order, client request path and no automatic retry. **Unit tests are not substitutes for live multi-tenant security tests.**

## Evidence required for GO
- [x] Automated GitHub Actions syntax/unit tests passed for source head `6f6e66e5c7222e7a840d6ccde15b7d9a9f742a78`: [run 38248864677](https://github.com/yasirkolathur/menafoods/actions/runs/38248864677), [run 38248864584](https://github.com/yasirkolathur/menafoods/actions/runs/38248864584), **91/91 tests passed, 0 failed** in each. Later documentation commits require a fresh head CI check.
- [ ] Copilot/QA independent reviewer signoff; no review was fabricated or self-approved.
- [ ] Authenticated Catalyst Development `POST /mf-api/assistant` with **real mapped** two test customers: correct 200 only for own scope; 401 anonymous; 403 other role/customer, unsigned WhatsApp and cross-tenant attempts.
- [ ] Provider identity: verified WhatsApp webhook/replay/phone ownership; voice-to-text consent, Arabic dialect sample and transcript correction before cart.
- [ ] Customer A and B negotiated price and order data never cross tenant; no purchase/supplier cost or private fields in responses, network logs, instrumentation or AI provider payloads.
- [ ] Model budget (calls/request ≤ 1, input ≤ 500 chars, response token cap 24, time ≤ 1s), bounded durable rate-limit, redaction and outage recovery verified in Development.
- [ ] Android debug APK smoke: splash, login/logout, offline queue/non-submission, back navigation, denied permissions, rapid duplicate taps, accessibility labels, 200% font scaling and TalkBack. PWA: Lighthouse accessibility, network offline/retry, keyboard and RTL screenshots. Attach artifacts with device/build versions.
- [ ] Actual safe COD/prepaid order pilot through **original** customer cart, including live VAT/price/stock/credit, a **single** Books SO ID and matching Creator `Sales_Order_ZBooks` record, zero duplicate creation on retries. CREDIT is NO-GO while `MF_CREDIT_ENFORCEMENT_MODE=OBSERVE`.
- [ ] Independent reviewer accepts diff, green action run, actual Development function/client hashes, clear rollback/disable flag and sanitized audit logs.
- [ ] Owner explicitly approves separate Production promotion; no implicit automatic release.

## GO/NO-GO evidence snapshot — 12 Oct 2026
- Git branch: `dept4/guarded-ai-assistant-20261012`; **draft PR**, based on `feature/batch34-checkout-guard-20261004`.
- Code and deterministic test fixtures: checked in. **First head `006f0752`: GitHub Actions runs [38244773702](https://github.com/yasirkolathur/menafoods/actions/runs/38244773702) and [38244773745](https://github.com/yasirkolathur/menafoods/actions/runs/38244773745) completed SUCCESS; each reported 70 tests, 70 pass, 0 fail, with syntax checks passed.** These were source-level tests only; all Development/live checks below remain NO-GO. Newer commits require fresh CI verification.
- The current Catalyst metadata (read-only, 12 Oct) confirms registered Development project and existing web app. Function `mf_zoho_gateway` returns `is_deployed:false`; no source equivalence or working HTTP deployment receipt. Exact MFAPI route `/mf-api/{path1:(.*)}` forwards to the same gateway with no explicit `authentication` field returned; MFUser `/mf-user/{path1:(.*)}` explicitly lists `CatalystUserManagement`. **This does not prove an exploit, but requires real anonymous / tenant 401/403 tests.** Hosted URL was inaccessible through the browser tool. The registered web app was modified Oct 12; PR #30 is not proof of its contents.
- Source-of-truth hosted runtime, authenticated Development integration, real order proof, verified WhatsApp provider intake, Android/PWA builds, accessibility performance reports, Copilot review: **not evidenced here**.
- Existing Catalyst function metadata exposes high-sensitivity configuration fields via the connected administrative tool. Their actual values are **not** included in GitHub artifacts; Department 2 must audit least-privilege access and coordinate any rotation with the owner.
- Pilot: **NO-GO**. Production: **NO-GO**. This PR must not trigger a Catalyst deploy or modify Zoho Books.


## Live integration handoff / release safety

1. No route, function, environment flag, webhook, credential, customer, product, order or hosted client was changed in Catalyst or Zoho during Department 4 source and metadata verification.
2. The proposed `assistantHelp` and `intakeVerifiedWhatsApp` modules are integration seams, not registered Catalyst handlers. Only mount them inside the **recovered exact source** of `mf_zoho_gateway` after Department 2 verifies server-authenticated `ctx.user`, `ctx.auth.getAssistantScope`, gateway-authoritative channel/proof and outlet scope. Never trust a browser-provided proof object, role, source channel, `transcriptConfirmedServerSide` or flags.
3. `MFAPI` has no explicit Catalyst User Management auth in its retrieved API Gateway definition, while `MFUser` does. Confirm that current `MFAPI` functions perform server-side 401/403 controls before enabling any assistant path; no production or Development route changes without source reconciliation and separate review.
4. Before Development trial, implement durable atomic rate limiting, authorized Zoho provider adapters, signed WhatsApp webhook and nonce/message-ID replay check, a protected same-sender voice transcript approval record, budget counters, monitoring, privacy retention settings and independent abuse tests. Abort safely on missing state.
5. Shared web/PWA must render catalog labels with DOM `textContent` (never interpolate a product name with `innerHTML`). Verify keyboard, TalkBack, 200% fonts, English/Arabic RTL screenshots, timeout/retry recovery, duplicate taps and no order submission from AI. Screens and APK remain the responsibility of Department 1 and authorized Development release review.
6. Independent QA must attach run URL, exact app/runtime hashes, separate test customers/outlets, scoped redacted logs and source mapping. The owner must authorize any financial pilot and separate Production promotion. Status remains NO-GO.

## Stop and rollback
If any cross-customer disclosure, prompt retention, incorrect role, cost exposure, mismatched price, tax, stock, credit, duplicate order or order creation occurs: disable the assistant route/feature flag in Development, revoke affected model credentials if exposed, stop intake and preserve redacted incident evidence. Restore prior verified Catalyst function/client artifact **only after** owner review; do not delete or recreate project 17990000000237407. No Production rollback is needed because nothing in this PR is deployed there.
