# MENAFoods Copilot instructions

Work as a specialist developer inside the existing MENAFoods architecture.

## Architecture rules
- Do not create a new backend, duplicate middleware, duplicate customer/catalog/order authority, or a second MENAFoods ecosystem.
- The existing Zoho Middleware Connect / Catalyst middleware remains the backend and orchestration boundary.
- Zoho Books remains finance authority after reconciliation.
- Zoho Inventory remains product/warehouse/stock authority.
- The Android Accountant app is a client of the existing backend; do not move finance authority into the app.
- Never hardcode credentials, OAuth secrets, tokens, organization IDs, or customer-sensitive values.

## Development rules
- Prefer small, reviewable changes on the assigned branch.
- Do not rewrite working modules unless required by the issue.
- Preserve API compatibility unless the issue explicitly requires a coordinated contract change.
- Use idempotent behavior for financial or retryable actions.
- Preserve immutable audit history. Posted financial movements must be reversed rather than destructively deleted.
- Validate authorization and role boundaries server-side where applicable.
- Run relevant tests and Gradle/build checks before declaring completion.
- Do not merge or publish automatically. Open a PR and report tests, risks, and any manual verification needed.

## Authentication rules
- Do not auto-trigger sign-in on first launch.
- Restore a valid existing session silently.
- When signed out, show a stable signed-out state until the user explicitly chooses Sign in.
- Logout must clear app/WebView auth state and must not immediately sign the user back in.
- Avoid splash/sign-in redirect loops.
- Expired sessions must fail safely and return to the signed-out state.

## Cost and scope
- Avoid unnecessary libraries, paid services, duplicated agents, or infrastructure.
- Implement only the assigned issue and directly required tests.
- If a backend contract is missing, document the requirement rather than inventing a competing local backend.
