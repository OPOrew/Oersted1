# Oersted 737 Line Lab — Android

Native Android (Kotlin + Jetpack Compose) port of the 737-200 AMM trainer web app in `reference/web`.

- Start with `CLAUDE.md`, then `docs/HANDOFF.md` and `docs/PORT_MAP.md`.
- Build: GitHub Actions workflow `.github/workflows/android.yml` (debug APK artifact; tag `v*` creates a Release).
- Local: `./gradlew :app:testDebugUnitTest :app:assembleDebug` (needs Android SDK).
