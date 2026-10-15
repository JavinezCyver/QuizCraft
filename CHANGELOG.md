# Changelog

## 1.0.7 - 2026-10-15

- Add App updates in Settings, showing installed and latest versions, release notes, and download progress.
- Download Android updates inside QuizCraft and open Android's installer without visiting GitHub.
- Verify the download checksum, package version, and signing certificate before installation. Keep verified downloads available when Settings is reopened or the app restarts.
- Handle offline checks, retries, and Android's permission to install app updates. Existing flashcards and saved progress remain on the device.
- Fix Settings buttons overflowing narrow phone screens.

Install this version once to enable in-app updates for future releases. Android requires confirmation before installation and may ask to allow updates from QuizCraft.

## 1.0.6 - 2026-10-15

- Focus study on flashcards with multiple choice, true or false, and fill in the blank questions. Multiple choice supports more than one correct answer.
- Add question formatting, question and answer pictures, typed answers, and matching-word highlights when revealing answers.
- Add BAD, GOOD, and SATISFIED ratings, rating filters, and review passes. Finish a session once every card has an answer and a SATISFIED rating.
- Save study progress on the device and include it in collection backups. Record completed flashcard sessions in history with actual answer scores.
- Improve mobile layouts, dropdown scrolling, next-card and swipe navigation, and add a startup logo.
- Show full cover images without cropping or empty bands, and simplify the personal study interface.
- Fix backup validation, pending image uploads during saving, malformed answer selections, missing collections beyond the first six, and duplicate or missing completion records.

The Android release is a signed ARM64 APK for Android 7.0 or newer. Install it over the previous release to keep local data; export a backup in Settings before updating for an additional copy.
