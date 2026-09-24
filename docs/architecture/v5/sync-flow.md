# Event/Sync Rules

1. Books invoice/payment/customer-change event
   -> Catalyst webhook
   -> validate signature/auth
   -> compute idempotency key
   -> upsert Creator cache/current state
   -> update dashboard snapshot
   -> notify only if exception/threshold crossed

2. Inventory stock/package/shipment event
   -> Catalyst webhook
   -> idempotent upsert
   -> Creator operational state
   -> invalidate affected cache version

3. Scheduled reconciliation
   - batch, not per-page
   - compare authoritative Books/Inventory state to Creator cache
   - only fetch changed/exception candidates where possible

4. Retry
   - transient 429/5xx only
   - exponential backoff + jitter
   - no duplicate retries across layers
