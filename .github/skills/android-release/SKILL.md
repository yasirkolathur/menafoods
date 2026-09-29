---
name: android-release
description: Use for MENAFoods Android WebView, authentication handoff, camera/file upload, splash, navigation, APK/AAB builds or release work.
---
# Android release skill
- Keep local app URL separate from valid HTTPS auth return URL.
- Never send file:// as OAuth/Catalyst redirect_url.
- Splash must be deterministically removable even when page JavaScript fails.
- Preserve FileProvider camera capture and image/PDF chooser.
- Restrict in-WebView navigation to trusted Zoho/Catalyst hosts; open other web links externally.
- Back/logout must recover to a usable local sign-in/app state.
- Run Gradle build and require successful artifact generation.
- For release claims record version, commit, workflow result and artifact identity.