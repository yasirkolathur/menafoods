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

## 2026-10-13 follow-up — staged 12.5.15, READ-ONLY Development observations

Catalyst connector now confirms an existing web app named `MENAFoodsCustomer` (app ID `17990000000248760`) in the **same** project; app metadata reports last modified **Oct 12, 2026 10:17 AM**. No authoritative current-client source export or package/deploy fingerprint is available from the connector. **Do not overwrite current hosting.**

Read-only Development responses from the existing `/mf-api/mobile/catalog/products` endpoint confirm:
- `page_start_from=2` repeats response `page_context.page=1`; `page=2` sets context page 2. The 12.5.14 client used the wrong query parameter.
- One `page=2` read reported an **empty products array** while `has_more_page=true`. This is an upstream pagination discrepancy; Department 3 #27 should investigate server/provider cursor semantics. Frontend search cannot promise all products while that persists.
- One `page=1` read included an item with `show_in_storefront=false`. The **server** must enforce customer-visible filtering; the 12.5.15 client additionally hides these products as a UI safeguard, not as an authorization control.

**New local staged archive:** `MENAFoodsCustomer_v12.5.15_DEPT1_TESTED_NOT_DEPLOYED.zip`; SHA-256 `59b6d788746818b751b97bbdeb5117def3262979236b82af81a8be5c2ec2d411`. Stored privately in the ChatGPT handoff; **not** in this public repo.

Incremental fixes in the *staged* frontend source (not live): correct `page` pagination; stop and display truthful partial-results warning if a provider page is empty/repeated; hide non-storefront/inactive catalogue items; remove supplier purchase-cost/margin fallbacks from customer unit config and cart; reject mismatched or ambiguous historical reorder variants; recalculate local cart line totals after edits; align JS/HTML/service worker versions and preserve other apps' caches.

**Local evidence:** `node --check` passed for five shipped JavaScript assets; Node's built-in regression suite passed 6/6 tests (page cursor, partial empty page, duplicates, customer unit-cost privacy, exact reorder, version/cache correctness). ZIP CRC/integrity passed; HTML has 211 unique IDs. A separate headless-browser attempt did not produce visual evidence; mobile/desktop visual, RTL and authenticated end-to-end checks are **still pending**. No financial writes or deployment occurred.

The draft PR's verification script now targets the new v12.5.15 bundle, but it is a static checklist, not the executable app source. No claim of CI green until GitHub check status is observed.

Next external dependency remains authoritative hosted client export/diff (#15), Development authenticated and role tests (#17), and the catalogue route discrepancy (#27). 

## 2026-10-13 afternoon — staged v12.5.16 business-account isolation (not deployed)

**Source:** incremental patch against the private staged v12.5.15 frontend, which itself was recovered from v12.5.13 Library source. This remains **unverified against the currently deployed Catalyst client**; current app record was last modified on Oct 12 and source-export access is unavailable through present connector tools. The canonical hosted source must be exported and diffed before applying.

**Private staged ZIP:** `MENAFoodsCustomer_v12.5.16_DEPT1_ISOLATION_TESTED_NOT_DEPLOYED.zip` — SHA-256 `2263ec7933e7709b264a5f9baeef04c2ee719a037d93d30c4e8217678ed8417d`. Patch `MENAFoodsCustomer_v12.5.15_to_v12.5.16_DEPT1_PRIVATE.patch` — SHA-256 `95a4eef3f573b16a8e9bdfa9594922bb5b6ad3300688d7e9bf4d39903a377efa`. Both delivered only through owner chat; **no private client source added to this public GitHub repository**.

Changes made **locally to recovered existing client files**:
- Added a strict authenticated `user_id:account_id` scope identifier; switching accounts or signing out clears prior business cart, financial KPI panels, old orders, selected outlet, branch list, Customer 360, customer home recommendations, pending checkout quote, portal role cache and existing Books price overlays.
- Business switch explicitly refreshes authenticated session and resolves account, branches and Books selling-price overlay before claiming success.
- Stale asynchronous Books pricing, customer home sections, order history, Customer 360, branch and unit-rules responses cannot repaint another account's screen.
- Removed the alternative Customer 360 `POST /customer/orders/:id/repeat` action; it now calls the same guarded `Buy Again` matching function as the Orders page, which adds matched current-unit lines to the existing cart and never submits checkout automatically.
- Branch selection now consistently handles case-insensitive ACTIVE statuses; editing cart invalidates stale authoritative checkout preview; avoid copying the legacy `base_unit_price` and `default_margin` data into customer-facing product raw rule overlay.
- Retained all existing same-origin Catalyst API paths, owner-approved account access, Zoho Books authoritative checkout, role permissions, and single backend.

**Verification receipt**: all 5 shipped JS files passed `node --check`. The built-in Node regression suite against recovered functions passed **10/10** (scope guards, data reset, stale pricing/unit-rules/home response, safe reorder, active branch filtering). ZIP CRC passed; **211 unique HTML element IDs with no duplicates**. This is static/unit verification, **not** authenticated Catalyst Development, mobile visual/RTL, exact role permissions, API isolation, verified Books order or CI green. The public PR verifier has been updated to expect v12.5.16. No finance writes, server changes, hosted upload, Production deployment or merge occurred.

**Outstanding:** #15 source authority and secure source diff; #17 authenticated Development browser/portal/outlet/checkout checks; #27 Commerce page-context/visibility discrepancy; issue #25 full mobile/tablet/desktop RTL QA, real customer/cart/order single-writer pilot and release receipt. Keep draft #29 and issue #25 open.
