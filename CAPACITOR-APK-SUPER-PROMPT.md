# Tazkeer Capacitor APK Modernization Super Prompt

Copy the prompt below into an implementation-capable coding agent after reviewing it. The agent must inspect the repository before changing code and must implement the work rather than only describing it.

---

## Prompt

You are a senior mobile architect and implementation engineer. Modernize the existing Arabic Islamic PWA **Tazkeer / ذَكِّرْ** in this repository into a production-ready Android APK using **Capacitor JS**, while preserving the current Arabic RTL experience and all existing features.

Do not rewrite the application blindly. First inspect the complete repository and create an implementation inventory. The current application is a static Vanilla JavaScript, HTML, and CSS PWA with no `package.json`, no Capacitor project, and no Android project. Existing entry points include `index.html`, `script.js`, `quran.js`, `prophets.js`, `dailyDuas.js`, `js/core/storage.js`, `js/core/router.js`, `js/modules/misbaha.js`, `js/modules/qibla.js`, `sw.js`, `manifest.json`, `data/`, and `images/`.

### Product goal

Deliver an installable, signed-build-ready Android application named **Tazkeer / ذَكِّرْ** that works reliably online and offline and includes:

1. Quran reading with the existing 604-page Mushaf experience, search, bookmarks, Khatmah progress, daily reading targets, and offline page downloads.
2. Daily adhkar, morning/evening/prayer/sleep categories, repetition counters, favorites, progress, streaks, and copy/share actions.
3. Prayer times based on the user’s location and selected calculation method, with cached offline results and a visible next-prayer countdown.
4. A complete **Adhan / Muezzin** feature with scheduled local notifications and selectable audio.
5. At least two legally usable audio choices:
   - Abdul Basit Abdul Samad recitation/audio.
   - A licensed Masjid al-Haram / Makkah audio option.
6. Qibla compass using location and device orientation sensors.
7. Prophets’ stories with lazy loading, reading progress, font-size controls, and resume position.
8. Digital misbaha with targets, rounds, totals, haptics, and persistence.
9. Hijri/Gregorian date, daily dua, Ramadan countdown, fasting guidance, dark mode, profile/statistics, backup/import, and offline status.
10. Correct Android hardware-back behavior for tabs, modals, readers, and exit confirmation.

### Mandatory licensing and content rule

Do not download, bundle, stream, or redistribute Abdul Basit or Masjid al-Haram recordings unless a verified license or permission allows the exact use case. Build the audio system behind a provider/catalog abstraction and use placeholders or explicitly licensed URLs until the owner supplies approved assets. Add attribution, source URL, license/permission metadata, and a removal/replacement mechanism for every recording. Never scrape or hotlink an unverified source.

### Phase 1 — Repository audit before implementation

Inspect every source file, data file, stylesheet, asset, and current Git status. Produce an internal inventory covering:

- Current routes/tabs, modals, global functions, initialization order, and all persistence keys.
- Every remote API and CDN dependency, including failure and offline behavior.
- Every feature that relies on `localStorage`, Cache Storage, Service Worker, Geolocation, DeviceOrientation, Vibration, Web Audio, or browser history.
- Existing accessibility, RTL, responsive-layout, safe-area, and dark-mode behavior.
- Large assets and likely APK-size risks.
- Current defects or risky assumptions that must be fixed as part of the migration, without unrelated refactoring.

Treat existing behavior as the baseline. Do not remove a feature merely because it is implemented with globals or inline handlers. Preserve behavior first, then improve boundaries surgically.

### Phase 2 — Capacitor foundation

Create a standard npm project and add a pinned, mutually compatible Capacitor version. Add:

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`
- `@capacitor/app`
- `@capacitor/haptics`
- `@capacitor/geolocation`
- `@capacitor/device`
- `@capacitor/filesystem`
- `@capacitor/local-notifications`
- `@capacitor/preferences`
- `@capacitor/share`
- `@capacitor/status-bar`
- `@capacitor/splash-screen`
- `@capacitor/network`
- an audio solution appropriate for background playback and Android audio focus, selected only after verifying current Capacitor compatibility.

Use the existing static web app as the initial web directory unless a measured reason requires a build directory. Add `capacitor.config.ts` or the project’s chosen typed configuration, an Android project, npm scripts, and documented debug/release build commands. Do not commit generated secrets, signing keys, keystores, or API tokens.

### Phase 3 — Native capability adapters

Create small, testable adapters under a clear native-integration boundary. Keep feature code platform-agnostic wherever possible.

#### Storage

- Replace direct persistence scattered through the application with a compatibility storage service.
- Preserve existing keys and migrate them safely.
- Use Capacitor Preferences for small settings and progress.
- Use the Filesystem or an equivalent managed cache for downloaded Quran pages and audio.
- Keep export/import compatible with existing Tazkeer backup JSON.
- Version the migration and handle corrupt or partial data with explicit user-facing errors.

#### Android back handling

- Integrate `@capacitor/app` back-button events with the existing `AppRouter`.
- Close the top modal/reader first, then return to the home tab, then allow exit.
- Never register duplicate listeners.
- Verify behavior on Android 12+ and when the app is resumed from the background.

#### Location and Qibla

- Prefer Capacitor Geolocation in the APK and retain a browser fallback for the web build.
- Explain permission purpose in Arabic before requesting permission.
- Handle denied, unavailable, stale, and approximate location states.
- Preserve the existing Cairo fallback only as an explicit, clearly labeled fallback; never present it as the user’s real location.
- Verify compass permissions and sensor availability. Show a static bearing when sensors are unavailable.

#### Haptics

- Use Capacitor Haptics on Android with a safe web fallback.
- Respect a user setting to disable vibration.

#### Network and offline

- Use Capacitor Network for a reliable connectivity indicator.
- Keep the Service Worker for the web deployment but do not assume it is the only offline mechanism inside the APK.
- Define cache namespaces and cleanup rules.
- Cache prayer times by location, calculation method, date, and timezone; do not reuse stale data silently.
- Make Quran and audio downloads resumable, cancellable, observable, and deletable.

### Phase 4 — Prayer times and Adhan

Implement a dedicated prayer domain/service rather than embedding new logic into `script.js`.

Required behavior:

- Location selection: GPS, manual city/search, and saved location.
- Calculation method selector, madhhab/asr setting where supported, time format, and notification preferences.
- Fajr, Sunrise, Dhuhr, Asr, Maghrib, and Isha.
- Correct timezone and date handling, including midnight rollover and daylight-saving transitions.
- Refresh when the date, location, method, or timezone changes.
- Clear loading, cached, stale, offline, permission-denied, and API-error states.
- Keep the current Aladhan integration behind an adapter so another provider can be substituted.
- Add local scheduled notifications for each enabled prayer. Schedule only the next safe window if Android limits are reached, then reschedule on boot/app resume/date change.
- Include notification channels, Arabic titles, prayer name, location, vibration preference, and sound selection.
- Provide a test mode that schedules a notification a few minutes ahead without changing real prayer schedules.
- Avoid claiming exact religious correctness; expose the calculation method and let the user verify settings.

The Adhan audio subsystem must support:

- Catalog entries with `id`, display name, reciter/muezzin, source, license/permission, duration, local path, remote URL, checksum/version, and availability state.
- Abdul Basit and Masjid al-Haram/Makkah options only when approved assets are supplied.
- Streaming with a clear offline-download action.
- Download progress, pause/resume, retry, checksum validation, storage estimate, and delete.
- Audio preview in the foreground.
- Background playback/notification playback using Android-compatible audio focus.
- Stop/skip behavior and no overlapping players.
- Respect silent mode, notification volume, Do Not Disturb, and user preferences as far as Android permits.
- Clear fallback notification behavior when audio is unavailable.

### Phase 5 — Quran and recitations

Preserve the current image-based Mushaf UX and its 604-page offline download, but harden it for mobile:

- Replace fragile Cache Storage-only assumptions with a managed download/cache service where needed.
- Do not load all 604 pages into memory.
- Add disk-space checks, progress, cancellation, retry, and cleanup.
- Preserve last page, bookmarks, Khatmah state, and daily goal.
- Make the image provider configurable and show a useful offline error when a page is unavailable.
- Add a separate recitation player/catalog for approved Abdul Basit Quran audio; do not conflate Quran recitation with the Adhan.
- Support surah/ayah playback metadata, play/pause/seek, background behavior, download state, and attribution.

### Phase 6 — UI and accessibility

Preserve the existing visual identity but make it mobile-production quality:

- Arabic-first RTL layout with correct safe-area padding and Android status/navigation bars.
- No horizontal overflow on small Android screens.
- Touch targets of at least 44dp where practical.
- Semantic buttons, labels, focus states, contrast, reduced motion, and screen-reader-friendly Arabic labels.
- Keep dark mode consistent across every modal, reader, card, download state, and notification.
- Replace fragile inline event handlers only when touched; do not perform a needless full rewrite.
- Add a settings area for language readiness, theme, font size, audio, adhan, notifications, location, calculation method, storage, and data backup.

### Phase 7 — Reliability and security

- Validate all remote responses before use.
- Use request timeouts, bounded retries, and explicit error states.
- Do not use broad silent catches for new code.
- Avoid injecting untrusted API/content strings with unsafe `innerHTML`; sanitize or use DOM APIs where user/remote data is involved.
- Do not store secrets in the client or repository.
- Add a Content Security Policy compatible with required CDN/API/audio hosts, or self-host assets where practical.
- Minimize third-party CDN dependence for the APK.
- Audit permissions and request only location, notifications, sensors, storage/media, and network capabilities that are actually required.

### Phase 8 — Tests and acceptance criteria

Add automated tests for pure logic and integration tests for critical flows. At minimum verify:

- Prayer-time parsing, timezone/date rollover, next-prayer selection, cache freshness, and calculation settings.
- Qibla bearing calculations for known coordinates.
- Storage migration and backup import/export.
- Quran download resume, cancellation, corruption, and deletion.
- Audio catalog validation and no-overlap playback state.
- Adhan scheduling around midnight and app restart.
- Android back-button modal/tab/exit flow.
- Permission denial and offline startup.
- RTL layout and dark mode at narrow mobile widths.
- Existing misbaha, adhkar, Khatmah, prophets, profile, and qibla behavior remains intact.

Acceptance requires:

1. `npm install` succeeds from a clean checkout.
2. Web build or static validation succeeds.
3. `npx cap sync android` succeeds.
4. Android debug build succeeds.
5. The APK launches offline with previously downloaded content.
6. A fresh install can request permissions and schedule a test notification.
7. A real prayer notification is rescheduled correctly after reboot/resume.
8. Approved audio can preview, download, play, stop, and be removed.
9. No unauthorized audio is bundled.
10. No regressions in the existing Arabic features.

### Required deliverables

Implement the code and provide:

- Updated source code and native Android project.
- `package.json`, lockfile, Capacitor configuration, and npm scripts.
- Native permission/channel configuration.
- Audio catalog schema and approved-asset integration path.
- Data migration code.
- Automated tests and their results.
- A concise README section for local development, Android sync/build, debug APK, release signing, permissions, audio licensing, and troubleshooting.
- A final change report listing modified files, known limitations, and manual device-test steps.

Work in small verified increments. After each major phase, run the narrowest relevant tests/build. Do not claim completion until the Android project syncs and the critical flows are exercised.

---

## Repository-specific implementation notes

- The existing prayer API is called from `script.js` and currently uses Aladhan with method `5`; preserve this behind a service and make it configurable.
- The existing Service Worker caches Quran images, prophet JSON, static assets, and selected APIs; native downloads must not depend solely on that Service Worker.
- Existing state is spread across raw `localStorage` and `SafeStorage`; migration must preserve both.
- `AppRouter` already models modal history and should be the integration point for Android back behavior.
- `qibla.js` already calculates the great-circle bearing and listens to device orientation; adapt it to native permissions without duplicating the algorithm.
- `misbaha.js` already provides vibration and persistence; route vibration through a native adapter while preserving the web fallback.
- There are currently no Adhan audio files or Abdul Basit/Masjid al-Haram assets in the repository. Treat these as pending licensed inputs, not as permission to fetch arbitrary recordings.
