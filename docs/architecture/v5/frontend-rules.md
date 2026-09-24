# Frontend Implementation Rules

## Catalyst frontend
Primary production UI. PWA enabled. Uses `/mf-api/*` only.

## Replit frontend
Development/preview/secondary UI. Uses the same `/mf-api/*` only.
No business database. No privileged Zoho credentials. No independent backend rules.

## Performance rules
- one bootstrap request after login
- lazy-load routes
- paginate tables
- cache safe GETs
- background refresh
- request deduplication
- skeleton UI
- no AI call during normal navigation
- no direct Books/Inventory API from browser
- compress images/assets
- stale-while-revalidate for safe reads
