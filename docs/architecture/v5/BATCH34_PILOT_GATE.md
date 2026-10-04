# MENAFoods Batches 3–4: checkout evidence and controlled pilot gate

**Target existing runtime only:** Catalyst project `menafoodscustomermiddleware` (17990000000237407), `mf_zoho_gateway`, Development. Do not deploy this isolated GitHub helper as another backend or silently replace the recovered Catalyst function.

## Evidence at implementation time (4 Oct 2026)
- Existing `catalyst-core-p0` is draft PR #14, not merged into or proven equivalent to deployed `mf_zoho_gateway`.
- Connector lists `mf_zoho_gateway` with `is_deployed:false`; this conflicts with earlier observed successful Development responses and is **not** proof either way about active deployed source. Verify with a direct authenticated HTTP test and Catalyst CLI deployment version.
- Catalyst MCP `Execute_Function_Via_GET` cannot execute this Advanced I/O function (`Only BasicIO Execution is supported`). No live purchase can be verified through this tool.
- Current Development setting `MF_CREDIT_ENFORCEMENT_MODE=OBSERVE`. Therefore, **no CREDIT pilot order is authorized**. A gated COD/PREPAID pilot may be considered only after the remaining gates are passed.
- Existing core helper has an atomic idempotency store contract; one legacy test had an obsolete `get/put` fixture. The fixture has been updated here; green CI is still required.
- Product images, pricing, customer isolation, multi-unit mapping, credit exposure and Orders must be validated on existing gateway before go-live.

## Batch 3 — verification contract
1. Sign in as **two distinct actual test customers**, each with a different Creator customer type / negotiated price. Request the *same* SKU under each. Compare returned prices against authenticated Creator/Books authoritative values, and confirm neither sees the other's pricing, profile, cart or orders. Never surface purchase cost.
2. Submit client cart containing **only** item ID, unit (CTN/PCS), and quantity. Server independently resolves authenticated customer, effective selling price, Books item mapping, package multiplier, stock and per-product tax ID/rate. Reject client price/cost, VAT, credit, customer IDs and inventory overrides.
3. Confirm piece versus carton totals and the mapped **Books base-unit equivalent**; avoid rounding a carton price to a piece rate in the order adapter without checking Books price precision. Reject missing conversions, stale stock and unmapped Books items.
4. For ordinary 15% VAT-exclusive product: 5 × SAR 198 = SAR 990; VAT SAR 148.50; grand total SAR 1,138.50. Verify tax-inclusive and zero-rated cases against actual Books tax mappings, not a universal hardcoded 15%.
5. Stock: zero is a real stock value; reject sale unless explicit per-SKU backorder approval is recorded.
6. Credit: for account-CREDIT require fresh trusted Books exposure, `ENFORCE` mode, no overdue balance or pending override and sufficient available credit. With current `OBSERVE`, keep CREDIT checkout disabled. COD/PREPAID may proceed only if all other gates pass.
7. Confirm server recalculates quote **immediately before** write; mismatch → return to review, no Books POST.

## Batch 4 — exactly one Books order
1. Existing Catalyst runtime is **the only Sales Order POST writer**. Disable duplicate Creator, Commerce or Books automation writers for this same source cart; preserve read-only downstream sync.
2. Use stable server-side `organizationId + customerId + immutable cartId` as atomic durable idempotency claim, checked on every double-tap/retry. An in-memory map is insufficient.
3. Search Books by dedicated MENAFoods reference number **and** Books customer before POST. Match only identical customer/reference, never another customer's similar order.
4. Save Books Sales Order ID with the idempotency result and original operational record. On timeout/unknown response or claim completion failure, leave claim in reconciliation-needed state and **do not repeat POST** until checking Books.
5. Confirm exactly one Books ID after double-tap, timeout, refresh and two app sessions, and a corresponding single Creator `Sales_Order_ZBooks` record. Do not create an Invoice automatically until reviewed.
6. Review the actual Books quantity, unit representation, line rate precision, VAT, discount, payment term, warehouse and credit; reconcile calculated quote to returned Books totals, allowing no undocumented discrepancy.

## Controlled pilot: no-go until all live evidence passes
- Start only in Catalyst **Development**, pilot feature flag default **OFF**, authenticated allowlist of up to two consenting internal/test customers, and limited to low-value COD/PREPAID checkout while credit remains OBSERVE.
- Keep a one-order-at-a-time window, owner review, no anonymous orders or bulk import. Do not use actual third-party customer financial data in test fixtures.
- Save sanitized evidence: build hash, test/customer mapping IDs (masked), SKU, server quote, Books Sales Order ID, Creator record ID, stock result, 200/401/403 responses, finance decision, and duplicate retry outcome.
- STOP / rollback flag if pricing differs, cross-customer exposure, excess credit, mismatched VAT, stale stock, unknown Book mapping, duplicate order or failed financial reconciliation.
- Owner release gate after pilot: confirm recovered Catalyst source and privacy patch merged, authenticated end-to-end tests green, actual Books/Inventory OAuth healthy, role isolation green, no duplicates after retries; then move to restricted production separately.

## Manual verification
- Customer Development entry: https://menafoodscustomermiddleware-809407193.development.catalystserverless.com/app/
- Read-only gateway smoke: `npm run test:live` (from a networked CI/runner), verifies existing Development health and unauthenticated 401s.
- Offline guards: `npm run check && npm test`.
- Existing application mapping requires owner/dev to inspect live Creator `Sales_Order_ZBooks` and Books organization `844477749` using connected authorized tools. No secrets in logs or PRs.

### Creator schema verified read-only on 4 Oct 2026
- Existing Creator account `menafoods`, app `mena`: reports `All_Customer_Price_Lists`, `Customer_Types_and_Offers_Report` and `Sales_Order1_Report` are present. `Sales_Order1_Report` is based on the required `Sales_Order_ZBooks` form; older `Sales_Order_Report` is based on a **different** `Sales_Order` form and is not the pilot writer.
- `Customer_Price_List` exposes `Customer`, `Product`, `Offer_Type`, `Price`, `Percent` and `Custom_Price`. `Customer_Types_and_Offers` exposes `Customer_Type`, `Offers`, and `ZBooks_PriceList_ID`. These are mapping candidates, **not** evidence that current Catalyst returns the right customer price.
- `Sales_Order_ZBooks` has `Customer_Form`, `Customer_ZBooks_ID`, `Line_Items` (including `Products_Form`, `Item_ZBooks_ID`, `Qty`, `Rate`), `SO_ZBooks_ID` and `Invoice_Zbooks_ID`. `Qty` and `Rate` fields are only two decimal places; do not silently round derived piece rates (e.g., CTN price divided by package count) in a way that changes invoice totals. Resolve tax mapping in the Books payload; no dedicated VAT field was found in the form metadata inspected.
- All metadata queries are read-only. No Creator workflow, form or Books Sales Order was modified or posted during this verification.

### Follow-up verification (4 Oct 2026)
- Creator read-only sampled **200** per-customer price-list records: **199** had `Custom_Price`; among **34** products appearing more than once in the sample, **32** had differentiated custom price values. This proves price differences exist in Creator, **not** that per-session tenant scoping is enforced at Catalyst.
- The `Customer_Types_and_Offers_Report` had **31** records, only **13** with `ZBooks_PriceList_ID`. The target path must apply appropriate business-type pricing / fallback without exposing an unmapped wholesale price.
- The first **200** `All_Products` rows include **185** with `ZB_Item_ID`. Of **115** marked storefront-available, **1** lacks `ZB_Item_ID` and must be blocked from checkout until mapped; remaining rows/pages were not sampled. This is **not** comprehensive mapping coverage.
- Actual Creator `Orders` checkout's `Sales_Order` lookup still points to the legacy `Sales_Order` form; that form is **not** `Sales_Order_ZBooks`. Before pilot, verify which actual customer UI action writes, and enforce exactly one Books writer by source cart ID rather than running both Creator workflows.
- Financial checkout patch now rejects duplicate SKU split across CTN and PCS, rejects client-supplied price/owner fields, uses integer-halalas/VAT BigInt arithmetic, requires confirmed prepaid funds, checks immutable payload hash against prior cart, and requires a real `verifyBooksResult` callback. That callback must fetch real Books SO values and compare totals, tax, unit quantities and customer; returning `true` unconditionally is never acceptable outside tests.
- Draft PR #23 was reconciled with current Core P0 (including webhook/bootstrap fixes), and re-checked; not deployed. The live Catalyst HTTP URL could not be accessed from the browser connection. Do **not** claim a successful remote smoke test based only on mocked/unit checks.
