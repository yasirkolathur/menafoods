# Copilot task: Accountant Android authentication hardening

Implement issue #4 on this pull request branch.

Target base branch: accountant-agent-apk-build.

Scope:
- Android Accountant app only.
- Fix first-launch signed-out behavior, explicit sign-in, valid-session restore, expired-session handling, auth callback return, logout, refresh/reopen after logout, and splash/login loop behavior.
- Preserve file chooser/camera behavior.
- Do not create or change backend architecture.
- Follow .github/copilot-instructions.md.
- Build and test before reporting completion.

After implementing, summarize changed behavior, tests/build result, and any live-auth verification that still needs a real user account.
