# Frontend Implementation Rules

## Production frontend
Primary production UI is hosted with Zoho Catalyst and uses `/mf-api/*` only.

## Backend rule
Zoho Catalyst is the only backend/runtime. No Replit production API, no browser-to-Books/Inventory privileged calls, and no duplicated business database.

## Performance
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
