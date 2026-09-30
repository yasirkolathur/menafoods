# Copilot task: Accountant Android Drive Mode

Implement issue #10 on this branch.

Scope:
- Android Accountant app only.
- Convert the current Hands-Free UI placeholder into a real Drive Mode.
- Use native Android speech recognition and text-to-speech bridged to the existing WebView.
- Support safe navigation/read-only voice commands.
- Block controlled financial actions from voice and require manual confirmation.
- Preserve auth/session, camera/file chooser, and operational localStorage.
- Build debug APK + release AAB with Gradle 8.9 and report verification.
- Do not modify backend architecture.
