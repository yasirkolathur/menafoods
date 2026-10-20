# MENAFoods — one-action, low-API transaction release gate

**Current state: source-only; NOT DEPLOYED.** Target only the existing Catalyst Development gateway (project 17990000000237407, mf_zoho_gateway), existing Mena Creator forms, existing Books organization. No production release or parallel backend.

## What the user should see
One Process action after an invoice photo/order: Received → Matched → Priced → Ready → Posting → Books Verified. Only genuine exceptions such as ambiguous entity, unreadable invoice number, tax/unit uncertainty, negative contribution, failed authorization or posting conflict should interrupt the user. A Creator draft or Books create response alone is not final verification.

## Exact, inexpensive server workflow
1. Parse the photo/message without inventing fields. Confirm tenant/role/branch from the existing gateway session.
2. Resolve customer/supplier by exact legal VAT, verified phone or known trusted alias. A similar spelling is not sufficient. Use targeted Books queries + TTL mapping cache; create in Books only when complete search proves genuine absence.
3. Resolve product by Books item ID/SKU/barcode AND brand, pack size/count and selected unit; 100g x40 is never 200g x24. Create only genuinely missing Books item and link it back to Products_Form. Photo enrichment is optional and asynchronous.
4. Price using tax-exclusive purchase cost per selected unit + configured margin per unit. Calculate VAT and contribution ex VAT. Require confirmed carton/piece conversion and floor margin.
5. Gate by durable atomic lock and canonical reference: vendor Books ID + supplier invoice number for bills, existing Books SO ID or server-derived checkout reference for orders. Never create a second Books order when a canonical SO exists.
6. Make at most one authorized Books write. Fetch the Books transaction afterward and verify party, reference, item IDs, quantity/UOM, rate, VAT and total before recording BOOKS_VERIFIED. Timeouts after writes are uncertain and must be reconciled, never blindly retried.
7. Source invoice PAID stamps are not proof of a MENAFoods Books payment. No unverified payment entry.

## Deployment blockers / gates
- GitHub branch contains a pure policy library + tests, NOT the deployed gateway source; the existing Catalyst control plane currently does not expose a source upload/publish action.
- Source is stacked on Department 3 draft PR #31 so Grok's branch remains untouched.
- Canonical Bill_Books is currently only Books_Bill_Id + Updated; extend the existing form and install/approve Deluge from draft PR #22 before creating a live bill writer.
- Add real trusted Books/Creator/Inventory adapters, durable atomic Datastore claim, role gates, secure credential handling, and real source invoice attachment flow in existing Development application.
- Prove end-to-end with one actual Books SO and one bill, safe timeout/retry tests, no duplicate, exact tax/UOM/total GET verification, and sanitized deployment receipt.
- Never mark live or deploy Production without separate approval. Previously exposed credentials need controlled rotation as a separate security activity.

API minimization is an objective, not permission to omit required accounting and fraud checks. Track real upstream API calls per transaction, avoid catalogue scans, use exact cached ID mappings and bounded retry only for safe reads.
