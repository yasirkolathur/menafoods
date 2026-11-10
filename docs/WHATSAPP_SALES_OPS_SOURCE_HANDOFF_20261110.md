# MENAFoods WhatsApp sales operations — source-only handoff (2026-11-10)

**STATUS: NOT DEPLOYED.** No WhatsApp channel, API token, webhook, Zoho Books sale, customer message, or duplicate order has been created by this patch.

## Objective

Route incoming MENAFoods WhatsApp Business sales messages through the **existing** Catalyst gateway; categorize common requests without LLM/API consumption; prepare verified customer-specific responses and Books sales orders through existing canonical systems, **not** a second backend.

## Channel decision

1. Prefer official **WhatsApp Business App + Cloud API coexistence**, retaining the existing number and mobile app where eligibility and provider ownership permit. Verify the actual current Meta/Picky Assist setup and any extra channel fee before touching the connection.
2. Reuse verified, signature-checked provider webhooks in the existing Catalyst function. Do not use MacroDroid notification previews as an authoritative customer identity or complete-message transport; keep MacroDroid as an optional owner notification/approval surface only.
3. Do not create an extra Picky Assist/Cloud API sender, move WABA, rotate credentials or send a template while testing.

## Fast and inexpensive flow

Verified webhook → durable message-ID dedupe → server-side sender/customer binding → local deterministic triage → one of these queues:

- ORDER_REQUEST
- ORDER_AND_PRICE_REVIEW
- PRICE_ENQUIRY
- AVAILABILITY_ENQUIRY
- REPEAT_ORDER_REVIEW
- CHANGE_OR_CANCEL_REVIEW
- DELIVERY_ENQUIRY
- PAYMENT_ENQUIRY
- GREETING
- GENERAL_REVIEW / SENSITIVE_REVIEW

Only ambiguous requests may require later optional AI, with data minimization. Product/pack extraction is a **hint**, not an authoritative SKU match. Do not treat words like "Customer: Harabi" as proof of customer identity.

## Canonical transaction requirements — not implemented in this source patch

1. Authenticate webhook using raw-payload signature, message-ID replay check and permitted WABA/number. Bind active Creator customer to canonical Books contact server-side. Unknown/ambiguous contact → manual queue.
2. Resolve exact product, pack, variant, CTN/PCS conversion and Books item ID. Exclude duplicate/hold products and honor current customer-specific fixed/percentage prices and customer type rules.
3. Read real price, stock and VAT from current Books/Creator/Inventory authoritative sources. Never quote a model-generated price or show supplier purchase cost.
4. Compare with pending Creator drafts and posted Books sales orders. Claim durable idempotency key per incoming WhatsApp message and order fingerprint.
5. Submit with the **existing** single Books sales-order writer once; reconcile the reference on ambiguous failures. Carry one Books SO ID to Creator. Trust native Books ↔ Inventory ↔ Commerce synchronization only after verifying it is enabled and accurate for the tenant.
6. For price queries, reply through the verified WhatsApp channel only after checking exact item, pack, per-customer price, tax, messaging window, approved messaging policy and confidence. Start with owner approval required.
7. Store minimal message-ID/intent/status/Books ID evidence, not duplicate full chat histories or financial records. No polling of every chat/product every minute.

## Existing Harabi example

The November 10 Harabi Kebab order text should yield ORDER_REQUEST with Jawahir rice 40kg (1 bag), Zahrati oil 1.5L × 6 (1 carton) and Burcu large paste (1 bottle). The actual Burcu large bottle variant and current price remain unverified. **An existing Creator draft for November 2 already holds these lines; it must be reconciled before any new Books posting.**

## Release gates

- This PR is **disabled by default** and contains no deployed endpoint.
- Confirm actual private Catalyst gateway source and deployed hash before integration; public repository is only source scaffolding.
- Verify Meta coexistence/provider ownership and WhatsApp consent policy.
- Verify Books contacts/items, Creator customer special pricing, stock/VAT, 2-way sync and idempotent writer.
- Pass offline unit tests, provider-specific webhook signature/replay tests, and authenticated Development end-to-end customer/role tests.
- Never deploy production, auto-send WhatsApp messages or auto-post orders without a separately verified launch gate.

## Files

- src/api/lib/whatsapp-sales-ops.js — local deterministic classification and optional line extraction.
- src/api/routes/whatsapp-sales-ops-preview.js — verified-identity, read-only, disabled-by-default preview adapter.
- test/whatsapp-sales-ops.test.js — 11 classification/security tests.
