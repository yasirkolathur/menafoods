# Department 1 — MENAFoodsCustomer staged frontend recovery and QA (2026-10-12)

Tracking issue: #25. Source recovery gate: #15. Catalyst Development gate: #17.

## Scope and source authority

- **Target:** the existing `MENAFoodsCustomer` client of Catalyst project `menafoodscustomermiddleware`, project ID `17990000000237407`.
- **Recovered editable baseline:** user Library `MENAFoodsCustomer_v12.5.13_ONBOARDING_OAUTH_REPAIR.zip`; compared to `v12.5.12_SERVER_CART_CHECKOUT.zip`. This is a **staged historical source package**, not a verified export of the currently deployed client.
- **Local staged frontend-only output:** `MENAFoodsCustomer_v12.5.14_DEPT1_STAGED.zip`. SHA-256: `3d3c3585da67d7cc21afa013793407f2b3982b59654cd621862f0ff13593ca75`. The owner receives the private ZIP and patch directly in the ChatGPT handoff; they are deliberately **not published in this public repository**.
- The repository's default `main` branch does **not** contain the current Catalyst customer frontend. Existing shared API scaffolds on feature branches are not authoritative deployed client source.
- The Figma customer web/mobile source was read for layout guidance; product images remain dynamic Commerce catalogue assets. No mocked product or financial data was promoted as a released feature.

## Changes tested in the staged recovered client

1. Catalogue search now searches the complete *already loaded* product array (including Arabic name and SKU), rather than the first 30 cards. Rendering is capped to 36 initially with explicit *Show more* for mobile performance.
2. Search uses accessible native search input, Enter/Escape behavior, debounce and result counts. Cards use standardized aspect ratio/contained catalogue images, graceful image fallbacks and explicit backorder/status labels.
3. `Buy again` appears beside real customer orders. Clicking performs a *protected GET* of the selected order detail, strictly matches current product/variant/unit and quantity, and adds matching lines to the existing business-scoped cart in one save. Mismatches are skipped rather than substituted. Historical order prices are not reused.
4. Reorder is invalidated on a business-account switch while the request is in flight. **It cannot submit an order or circumvent existing checkout review.**
5. Existing Catalyst function origin, session/auth, payment, credit and checkout implementations were **left unchanged**; no duplicate backend or order writer was added.

## Static test receipt

- `node --check` passed for shipped JavaScript.
- Local real-source regression suite passed: EN/AR search, SKU, product/unit match, rejection of unknown/ambiguous/invalid quantities, tenant/account-switch guard, deferred cart write, presence of markup/assets.
- Local extracted-bundle verification gate passed 12/12 static checks.
- HTML parsing found 211 unique element IDs and no duplicate IDs.
- ZIP integrity test passed. Scan found no obvious private-key/token patterns in changed text.
- Not run: authenticated live-browser/order regression or Catalyst Development deploy. **No deployment receipt, no production rollout and no verified Books Sales Order.**

## Required merge/deployment gates

1. Recover/export the *currently hosted* Catalyst `MENAFoodsCustomer` source and compare its fingerprint, routes, loaded assets and manifest with the 12.5.13 baseline. Apply the narrow patch to the current source if the deployed version differs; do **not overwrite** with the ZIP.
2. Resolve route contract: recovered client calls `/server/mf_zoho_gateway/customer/...` and `/server/mf_zoho_gateway/mobile/catalog/...`; GitHub coordination refers to protected `/mf-api` routes. Confirm actual API Gateway mappings/auth rules before changing URLs. Never move protected calls to unguarded endpoints.
3. Verify product imagery licences/accuracy and authoritative customer-visible pricing without exposing purchase costs. Review requested CTN/PCS conversion against actual current unit rules; ensure backorder/stock policy is server-enforced.
4. Run signed-in multi-account/role checks, onboarding → outlet create/edit/select → cart → checkout preview and full mobile/tablet/desktop, Arabic RTL and accessibility audits against actual Figma frames.
5. With owner approval and credit fail-closed, run exactly one controlled COD/prepaid order in Catalyst Development; verify the single Books order ID and retry/double-tap reconciliation.
6. Obtain signed CI, Catalyst deployment ID/version, route responses, screenshots and a rollback path before closing #25. Do not claim live without a deployment receipt.

This PR is an **issue-coordination and reproducible static verification handoff**, not a PR that embeds private deployed application source. It is intentionally a draft until #15 establishes source authority.
