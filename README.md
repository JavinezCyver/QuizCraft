# QuizCraft

QuizCraft is now an offline quiz and flashcard app. Anyone can use it immediately, without registration, login, a hosted API, or an internet connection. The React interface is shared by the web app and the Rust + Tauri Android app.

Download the signed Android APK from [GitHub Releases](https://github.com/JavinezCyver/QuizCraft/releases/latest). The Android release supports ARM64 phones running Android 7.0 or newer.

## What works offline

- Start with a clean, empty library. No demo quizzes, questions, answers, or creator data are bundled.
- Create and edit quizzes, autosave drafts, manage categories, duplicate and delete quizzes.
- Study flashcards, take timed quizzes, review answers, and receive scores.
- Save bookmarks, quiz history, a display name, and appearance on the device.
- Review short answers and assign points in My quizzes.
- Export/import quiz files and back up/restore the collection and completed history in Settings.

Data lives in the app's IndexedDB database, `quizcraft-offline`. Each update uses a transaction, so simultaneous browser tabs cannot overwrite each other's changes. Quizzes and results are specific to the device/browser; they are not sent to a server or automatically synchronized. Removing the app or clearing site storage removes local data. Use Settings > Export backup to keep a copy.

New installations initialize an empty library. Quizzes created on a developer's computer or another person's device are never copied into builds. The original `data/quizcraft.sqlite` database is left intact and is not packaged. Updating an existing installation preserves that device's local quizzes; it does not import content from the developer's device. Android automatic cloud backup/restore and device-transfer backup are disabled. Only a deliberate quiz import or backup restore transfers quiz data.

## Run the web app

```powershell
npm install
npm run dev
```

Open http://localhost:5173. A Rust API is no longer needed for development or data storage.

For a production build:

```powershell
npm run build
npm run preview
```

The production web app caches its HTML, scripts, styles, and bundled images after the first visit. Once caching completes, it can reopen and refresh without internet. Serve it over HTTPS, or use localhost, for service-worker support. The Vite development server is for development and does not provide offline startup. See [Mozilla's service-worker documentation](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

The existing Rust Axum server can still host the production `dist` directory with `npm start`; its legacy online API is not used by the offline interface. A normal static HTTPS host also works.

## Android

The Android app contains the React build and interface assets inside the APK, without quiz data. It works offline on its first launch, including on a physical phone. It needs no API URL, server, login, or Google Fonts connection.

Prerequisites: Node.js, Rust, Visual Studio C++ Build Tools on Windows, Android Studio, SDK 36, NDK, and Java 21. Install the Rust ARM64 target:

```powershell
rustup target add aarch64-linux-android
npm run android:build:debug
```

The scripts find the usual Windows Cargo, Android SDK, Android Studio JBR, and NDK locations. The build produces:

```text
src-tauri/gen/android/app/build/outputs/apk/arm64/debug/QuizCraft.apk
```

Install that APK on an ARM64 Android phone. If a prior version is installed, update it with the same debug signing key. The offline version no longer uses the prior server-backed account or server session.

On Windows without symbolic-link permission, both build scripts copy the newly compiled Rust library into the Android project and package it with Gradle. `android:dev` uses Tauri's standard tooling and requires Developer Mode or permission to create symlinks on Windows.

```powershell
npm run android:dev
npm run android:build:release
```

The signed, optimized release APK is written to:

```text
src-tauri/gen/android/app/build/outputs/apk/arm64/release/QuizCraft.apk
```

Release signing loads `${user.home}/.android/quizcraft-release/keystore.properties`, or the file specified by `QUIZCRAFT_ANDROID_KEYSTORE_PROPERTIES`. It contains `storeFile` (absolute keystore path with forward slashes), `storePassword`, `keyAlias`, and `keyPassword`, following [Tauri's Android signing guide](https://v2.tauri.app/distribute/sign/android/). The local release key and its properties are stored outside this repository. Preserve both files to sign future updates with the same key; builds never regenerate them.

The release key differs from the debug key. Export a backup in Settings before uninstalling the debug app, then install the release APK and restore the backup. Subsequent release updates use the same release key and preserve local data. No `QUIZCRAFT_API_URL` or `QUIZCRAFT_PUBLIC_URL` is required.

## Transfer and backup

Settings offers Export backup and Import quizzes / restore backup. JSON exports contain local quiz answers and completed attempt history. Import quizzes adds new copies with fresh identifiers. Restore backup explicitly replaces the local collection, bookmarks, display name, and history; export the current collection first to retain it. In-progress attempts are not included in exported backups. Appearance remains the current device's preference.

Use Download JSON in a browser. Android WebViews may not support browser downloads; the transfer dialog also provides selectable JSON text to copy or paste, plus a file picker to import JSON. Cover images are selected from local files and stored with the quiz. Remote image URLs and online moderation/sharing are replaced by local features.

## Structure and verification

- `src/lib/offline.ts`: transactional local storage, quiz management, answer scoring, timers, history, bookmarks, and manual grading.
- `src/lib/transfer.ts`: quiz imports and collection backups.
- `src-tauri/`: Rust Tauri shell and Android project, without the former HTTP bridge.
- `vite.config.ts`: production offline cache generation.
- `server-rust/`, `server/`: retained legacy server and test utilities for the original database.

```powershell
npm test
```

Builds the production app and tests offline startup/refresh, persistence, editing, scoring, manual grading, backup restore, imports, flashcards, and responsive layouts. The active Playwright suite targets the offline app. The old authentication/server browser scenarios remain as references and are not part of the offline suite. `npm run test:legacy` runs the retained Rust and HTTP API tests separately.
