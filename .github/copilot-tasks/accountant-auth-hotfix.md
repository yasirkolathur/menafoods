# Copilot task: Accountant Android auth hotfix

Implement issue #8 on this branch.

Scope:
- Preserve operational and audit localStorage across logout. Clear only auth/session state needed for sign-out.
- Align Gradle wrapper to 8.9 for AGP 8.7.3.
- Remove accidental committed Gradle cache marker files introduced by the prior auth branch if present.
- Preserve explicit sign-in/session restore/logout behavior and camera/file chooser behavior.
- Run JavaScript syntax checks and Android debug APK + release AAB build.
- Do not change backend architecture.
- Report verification results before merge.

Verification trigger: owner-authored CI run after Copilot implementation.
