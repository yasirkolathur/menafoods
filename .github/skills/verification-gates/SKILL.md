---
name: verification-gates
description: Use before declaring any MENAFoods feature, integration, APK or release complete.
---
# Verification gates
A feature is complete only when evidence covers:
1. Source change exists in Git.
2. Relevant build/lint/test passes.
3. Authorization is enforced at the correct layer.
4. Happy path works.
5. Failure/retry path is safe.
6. Duplicate submission is safe where applicable.
7. No secret was added.
8. Mobile responsive/RTL impact checked when UI changed.
9. Financial/Zoho mutations are auditable and idempotent.
10. Remaining blockers and manual device checks are stated explicitly.

Compilation alone is not end-to-end verification.