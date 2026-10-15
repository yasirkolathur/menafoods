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

## 2026-10-13 later — v12.5.17 private checkout and unit-pricing isolation

**New staged build** `MENAFoodsCustomer_v12.5.17_DEPT1_CHECKOUT_ISOLATION_TESTED_NOT_DEPLOYED.zip`
- SHA-256 `9bb9ffbabfaa3ed2d15007d3ecc7e6d74c542abe2d73a5916511392af3bc49a2`.
- Incremental private patch `MENAFoodsCustomer_v12.5.16_to_v12.5.17_DEPT1_PRIVATE.patch`, SHA-256 `abe2b0c29a1e7b0b18230a8e2eb4d282d1feea8a4969a8c8e6b3ddae5440ef56`.
- Test source archive `MENAFoods_DEPT1_v12.5.17_TESTS.zip`. Artifacts live only in the owner's ChatGPT handoff, **not in this public repository**.
- Historical baseline remains the private staged 12.5.16, originally from recovered 12.5.13; **not** proven equivalent to the currently deployed Catalyst source.

**Changes implemented in historical existing customer frontend, without modifying the single Catalyst backend:**
1. Snapshot per-customer unit-rule overrides before merging into shared product records; restore the original Commerce product price, unit, and unit-related raw attributes whenever businesses change. Reapplying rules no longer compounds values from the previous account.
2. Block checkout for provisional/unassigned identities without an approved account; verify the same user+business scope after loading the outlet list, after syncing cart, after the protected checkout preview, and after order POST before writing any checkout UI/cart state.
3. If an order acknowledgement arrives after a business switch, do not clear or replace the *new* business cart. A transport failure leaves the same idempotency key available for reconciliation; server-side exactly-once enforcement remains mandatory.
4. Prevent a stale wallet/KPI response, old business list, stale branch select, or old unit-rule response from repainting a newly selected account; align service-worker registration query version with the application.
5. Preserve the existing `/server/mf_zoho_gateway` route and server-authoritative price/stock/tax/credit preview. No new order writer or client authority over purchase cost.

**Actual local verification on extracted source:**
- `node --check` passed for **5/5** JavaScript assets.
- `node --test business-scope.test.mjs checkout-unit-regression.test.mjs`: **19/19 passed** (10 preexisting + 9 new scoped checkout / price-rule tests).
- Extracted ZIP package: **38 archive entries**, ZIP CRC successful; source HTML has **244 element IDs, all unique**. (Earlier docs' 211 count came from a narrower HTML audit; this run counts every literal `id="..."` occurrence.)
- Changed file paths: `assets/app.js`, `index.html`, `sw.js`, `client-package.json` and a staged release note. GitHub PR contains only documentation and a sanitized static verifier; **no private source code in the public repository**.
- The above are local regression/static verification only: no authenticated customer browser test, no real cross-business role enforcement proof, no Books Sales Order / financial writes, no live service-worker update, no Catalyst deployment receipt and no GitHub CI green assertion.

**RELEASE: NO-GO.** Do not merge PR #29 or upload the historical archive to Catalyst. Remains blocked by #15 authoritative client source export/current deployment fingerprint, #17 authenticated Development QA, #27 upstream page-context/storefront filtering contract, and #25 RTL/mobile/checkout pilot. User action needed only if Catalyst's owner access is required to expose the current hosted bundle.

**Final checksum clarification (2026-10-13):** Package rebuilt with reproducible fixed ZIP entry timestamps; the final SHA-256 above supersedes the earlier pre-normalization ZIP checksum quoted in comments. File contents and 19/19 test results are unchanged. The QA JSON has the definitive final checksum.

## 2026-10-13 — Department 1 v12.5.18 (private staged outlet isolation; not deployed)

**Source baseline:** `MENAFoodsCustomer_v12.5.17_DEPT1_CHECKOUT_ISOLATION_TESTED_NOT_DEPLOYED.zip`, verified SHA-256 `9bb9ffbabfaa3ed2d15007d3ecc7e6d74c542abe2d73a5916511392af3bc49a2`. This is still the recovered historical private customer client, **not** a verified export of current Catalyst hosting. Same existing Catalyst backend: `menafoodscustomermiddleware` project `17990000000237407`. Frontend changes were made only in the local staged bundle; no live changes.

**Private owner handoff files:**
- `MENAFoodsCustomer_v12.5.18_DEPT1_OUTLET_SAFETY_TESTED_NOT_DEPLOYED.zip` SHA-256 `296587f5f397ddffde14d46202a3bc06b70eb8ffb4d3beb7a9144f101efca41b`.
- `MENAFoodsCustomer_v12.5.17_to_v12.5.18_DEPT1_PRIVATE.patch` SHA-256 `3b3173c5555a235b4d11ab73add804fc9d9ed60e1b1f2d49e1938202f6783a18`.
- `MENAFoods_DEPT1_v12.5.18_TESTS.zip` SHA-256 `68714372e5891cea583f9a43d7ecf21c9342e39635f3e28c9daec454f6772779`.
- `MENAFoods_DEPT1_v12.5.18_QA.json` contains the checksums, scope, limitations and test details.

**Staged frontend changes:**
1. Introduced `outletCode`, `outletIsActive`, and `verifiedOutletCode` to select **only ACTIVE** business outlets for checkout; inactive/default/disabled outlet values can never fall through to checkout. `branchOptions` uses the same condition.
2. Branch list displays inactive outlets for transparency, but disables selection; hides add/edit controls for buyers and other non-manager roles. Only a verified `OWNER` or `ADMIN` may open/submit the outlet editor (additional to existing server authorization).
3. Outlet save/form records the opening user+account scope and refuses stale form submission. Pending POST responses cannot overwrite branch/checkout state when the user switches businesses; server-side cross-account authorization remains a required independent test.
4. Checkout dropdown disables itself while the current outlet POST is pending; if the server rejects it, restores both the dropdown and checkout branch code rather than leaving an unconfirmed selection.
5. Account switch clears checkout receiver name/mobile, customer PO, cost center, payment method, date/window/notes, outlet selectors and prior `mf_resume_checkout` session marker; also closes outlet and invite modals.
6. Preserved existing Catalyst functions, session/tenant rules, single authoritative server checkout writer, pricing, stock, tax and credit controls. No new backend and no financial writes.

**Verification run on extracted existing frontend:** `node --test business-scope.test.mjs checkout-unit-regression.test.mjs outlet-safety.test.mjs` → **32/32 PASS** (19 existing + 13 new). All **5/5** shipped JavaScript files passed `node --check`, package ZIP CRC PASS, **244 unique literal HTML IDs** and no duplicates, no obvious PEM private-key literals in bundled JS/HTML/JSON/CSS, deterministic ZIP with **39** entries. Reproducible private source diff reports changed `assets/app.js`, `index.html`, `sw.js`, `client-package.json`, and staged note. GitHub PR #29 public branch holds only safe documentation and a static bundle verifier, not the private application.

**Not verified:** current-hosted-source version match/export, authenticated Catalyst Development roles/outlets, Arabic RTL mobile/tablet/desktop visual QA, live Books order idempotency, product pagination/visibility server policy (#27), CI workflow success or any deployment receipt. Frontend role hiding does NOT establish server authorization. Keep **NO-GO** and draft PR #29, track #15/#17/#25/#27.
