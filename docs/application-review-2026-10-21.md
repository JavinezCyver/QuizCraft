# QuizCraft application review — 21 October 2026

This report covers the requested flashcard changes already present in the working tree, the additional bugs reproduced during this review, the fixes, and the runtime optimizations. Existing work was preserved. No release was published, APK rebuilt, or personal quiz library modified; browser tests used isolated test data.

## Fixes following the read-only audit

- **Self-assessed scoring:** Completed short responses without an answer key now receive credit when the learner selects SATISFIED. History scoring uses the same correctness helper as completion, so an accepted self-assessment is no longer recorded as 0%.
- **Stale SATISFIED marker:** Editing a satisfied typed response to an incorrect answer changes its rating to BAD immediately. Clearing it changes the rating to UNRATED. Equivalent correct text, including capitalization/whitespace changes, remains SATISFIED. Changing an incorrect answer back to correct still requires the learner to confirm satisfaction.
- **Unfinishable imports:** Published quiz imports and backup restores now share the editor's readiness checks. Empty published decks, missing accepted answers, choice questions without a correct choice, and true/false questions with multiple correct choices are rejected before replacing or adding data. Incomplete drafts remain importable, and valid self-assessed short questions remain supported.
- **Draft save/reload protection:** The editor maintains its latest draft reference at each actual update instead of assigning it during rendering. A same-tab recovery copy is written on explicit save or when leaving with unsaved edits. Reloading and reopening the quiz merges this recovery copy with saved data using the existing conflict protection. Recovery copies are removed after a successful save; a successful backup replacement clears older copies so they cannot overwrite restored data. Rejected restores keep them. If browser recovery storage is unavailable/full, an unsaved reload uses the browser's leave-page protection instead of silently assuming recovery is available. Recovery serialization happens at save/exit, not on every keystroke.
- **Study rating reload race:** Pending study progress now has a same-tab recovery copy before its IndexedDB save completes. Reload validates that copy against the deck before restoring it. Older completed writes cannot clear a newer pending copy, and an older incomplete snapshot cannot reopen a committed completed session. Successful writes clear recovery; successful backup replacement clears both study and editor recovery. This metadata copy contains no question/answer image data.
- **Test expectations:** The older authoring test now expects a BAD response to clear on retry, and the swipe test uses an incorrect answer when checking a right swipe. Correct answers continue to block right swipes.

New browser regressions cover self-assessed history credit, live/persisted typed-answer rating changes, atomic published import/restore rejection, recovery after a simulated IndexedDB write failure on phone and desktop, and recovery cleanup on explicit backup replacement. Existing tests cover responsive editor/flashcard layouts, images, saves, review, swipe directions, backup transfer, and offline behavior. The tests use Chrome viewports; no physical-device installation or APK release was performed.

The audit also corrected a gesture helper that could target scrolled-out question text, and a shuffled-deck fixture whose accepted answer was not present in its options. The immediate-reload swipe case and corrected shuffled-deck case passed three repeats each. Added study-recovery tests verify pending ratings survive failed writes and reload, and completed results remain completed even if an older pending snapshot exists.

**Final verification after these fixes:** `npm test` completed successfully. The production TypeScript/Vite build passed, all **27 unit tests passed**, and all **154 active browser tests passed** in the final uninterrupted browser run (9.2 minutes). Source/new-regression formatting checks and `git diff --check` passed. Responsive coverage includes 320 × 568, 390 × 844, 568 × 320, 844 × 390, 768 × 1024, 1024 × 768, 1440 × 900, 1920 × 1080, short-window checks, and live resizing. The result is Chrome-based automated coverage, not a physical-device or Safari certification. No APK was rebuilt or published.

## Follow-up: More appeared to duplicate a question

The screenshot follow-up identified a confusing part of the card interface: More advanced an overlapping content page inside the same question, displaying its image and choices again. It did not add a question, but looked like a duplicate. The content paging implementation and its More/Back buttons have now been removed. Each question remains in a single card; content that does not fit scrolls inside that card while ratings and question navigation remain fixed. Short content does not scroll. Restart returns the content to the top. The historical paging fixes and measurements below describe the earlier audit implementation and are superseded by this follow-up.

Two new browser regressions cover two-question decks with one photo at 320 × 568 and 390 × 844, checking that answering leaves one photo on the first question, no More controls appear, and Next opens the second question without a copied photo. Existing responsive tests now exercise native content scrolling instead of content paging.

Follow-up verification: the production build passed. Of 92 affected browser cases, 91 passed in the combined run. The remaining long-landscape test was sampling fixed scroll positions, which can miss a control between samples in a continuous scroller; it now also scrolls each choice into view and checks its bounds. Both long portrait and landscape cases passed on rerun, verifying all 92 affected cases across the combined run and follow-up. Source/new-test formatting and whitespace checks passed. The follow-up build contains approximately 401.54 kB JavaScript (127.27 kB gzip) and 93.65 kB CSS (19.65 kB gzip).

## Requested behavior and appearance

### Follow-up: retry unsatisfied answers and require correct completion

The latest review behavior clears selections, typed text, answer-border feedback, and emoji feedback when a question returns for another review pass. Returning to a BAD/GOOD card through Previous or a rating filter also prepares a fresh attempt. Current completed choices stay locked while their feedback is displayed; correct SATISFIED cards retain their responses.

A left swipe marks a correct answer SATISFIED. An incorrect completed answer stays BAD, including when SATISFIED is clicked manually, and returns for retry. Unanswered/incomplete responses remain unrated when skipped. At the end of the pass, unanswered, incorrect, and unsatisfied cards repeat rather than opening Session complete. Completion requires correct accepted answers and SATISFIED for every question. Short free-response questions without an answer key remain self-assessed. The same correctness rule protects completion records and completed backup validation, including shuffled option identities.

The next swipe update blocks right swipes on correct answers. A blocked swipe leaves the current card, selections, feedback, and rating unchanged; left swipes still mark correct answers SATISFIED and advance. This applies to single/multiple choices, true/false, typed accepted answers, filtered review, and restored progress. Incorrect answers can still swipe right for BAD review.

Swipe-update verification: production build passed; all five targeted swipe regressions passed, including correct multi-answer/typed responses, correct true/false responses in SATISFIED review after reload, normal left-swipe completion, incorrect right-swipe review, and incorrect left-swipe retries. Whitespace checks passed.

Verification for this follow-up: the production build and 27 unit tests passed. All 72 affected browser cases were verified across runs: 51 passed in the main run, 20 in a follow-up, and the final rating-filter case passed after updating its retry setup. Older tests expecting selected answers to survive an unsatisfied retry, or an incorrect response to complete a session, were updated to the requested behavior. New coverage checks a wrong multiple-choice left swipe, a clean persisted retry, completing only after correction, and rejection of a forged completed backup containing a wrong answer. Other coverage checks navigation, filters, images, reduced motion, shuffling/duplicate option identities, history, persistence, and offline behavior. Formatting and whitespace checks passed.

### Follow-up: responsive answer editor

The answer-options screenshot prompted a targeted editor update. Option fields now use wrapping textareas that automatically grow or shrink when text or available width changes. A three-column grid reserves 44-pixel targets for the correctness toggle and delete button while giving the text the remaining width; true/false rows use two columns. Long unbroken text wraps. The heading/guidance wraps, and the explanation field now has a 96-pixel minimum height and grows with its contents. Very long entries have bounded heights and remain scrollable instead of overflowing the page. Existing values and scoring metadata are unchanged.

Verification: the production build passed; all 29 editor-responsive and flashcard-authoring browser tests passed in 2.3 minutes. Four new cases cover long text at 320, 390, 768, and 1440 pixels, live resizing, shortening text, touch-target sizes, preserved correctness selection, and no horizontal overflow. The existing suite also checks landscape layouts, saving, images, multiple correct choices, formatting, and previews. The 320-pixel screenshot was visually inspected. Formatting and whitespace checks passed. Physical devices were not used.

### Answer selection and feedback

- Multiple-choice and true/false questions show feedback through option borders without automatically flipping the card. Manual Reveal remains available when the deck permits answer reveal.
- A question requiring multiple choices waits until the required number has been selected before evaluating the response. For example, if A and C are correct, selecting only A does not finish the response.
- A fully correct response highlights its selected correct choices in muted green. Unselected wrong choices remain neutral.
- An incorrect completed response reveals the answer using borders: all correct choices become green and all incorrect choices become muted red. This includes incorrect options that were not selected.
- Feedback says “Perfect!” for a fully correct response, “Almost!” when some selected choices are correct, and “Not quite!” when none are correct.
- Completed correct and incorrect choice responses become unclickable while feedback is displayed. Returning for an unsatisfied retry clears the response and unlocks the choices; Refresh/Start again resets the whole session.
- Every card in a new review pass clears its previous answer and feedback. Correct SATISFIED cards remain outside the pending review queue.
- The visible instruction “Select N answers. Green means correct; red means incorrect” has been removed. Accessible guidance remains available where appropriate.
- Disabling answer reveal in the deck settings remains respected.

### Motion and stable card layout

- Correct responses trigger a short celebration with 20 CSS particles. The burst lasts about 900 ms and is removed after one second.
- Incorrect completed responses trigger a small horizontal shake, approximately 3 px over 280 ms.
- Feedback has reserved space. Celebration particles are positioned independently of document flow and cannot intercept clicks. Emoji feedback and celebration do not change the card's position or size.
- Both effects respect the device's reduced-motion preference. Restoring a saved answer does not replay a celebration.

### Swipes and ratings

| Action/state | Result |
| --- | --- |
| Swipe left after a correct answer | Mark SATISFIED and advance |
| Swipe left after an incorrect answer | Keep BAD, advance, and return the card for retry |
| Swipe right after an incorrect completed answer | Mark BAD and advance |
| Swipe right after a correct answer | Stay on the same card without changing its rating |
| Skip an unanswered or incomplete question | Mark UNRATED |
| Previous button | Go to the previous card |
| Next button | Advance without assigning SATISFIED automatically |
| BAD or GOOD rating | Remain available for another review pass |
| Every question answered correctly and SATISFIED | Allow session completion |

Swipe direction refers to finger movement across the card. Right swipe no longer means previous. Existing keyboard navigation remains available. Saved ratings, filters, review order, answers, and completion survive reload and backup restore.

Final rating colors are BAD red (`#ef4444`), GOOD blue (`#3b82f6`), SATISFIED green (`#22c55e`), and UNRATED cream pink (`#f4d6d9`). Missing ratings are treated as unrated by the filter. The final cream pink replaces the previously requested black.

Option feedback uses a quieter palette than the rating controls: light-theme correct `#4b8060`, incorrect `#a36363`; dark-theme correct `#628b70`, incorrect `#b07777`. Disabled completed options retain these colors rather than fading away.

### Text, small screens, and history

- Option letters and answer text occupy separate grid columns. Long answer text wraps beside its letter, including long unbroken words.
- Narrow option containers use one column; wider containers can use two. Short landscape screens use full-width choices for long-question cards so whole answer buttons remain reachable.
- Flashcards keep readable text and scroll long content inside a single card. The follow-up removed content-page arrows because their overlapping pages looked like duplicate questions. The outer study screen and its navigation remain fixed.
- Narrow navigation and four rating controls fit small phone screens. Feedback does not push the card around.
- Quiz history displays elapsed time in hours and minutes: `5593` seconds becomes `1h 33m`. Seconds are omitted, and partial minutes are rounded down; a session shorter than a minute displays `0h 0m`.

An isolated browser check also verified history rows for 5,593, 3,600, and 59 seconds display `1h 33m`, `1h 0m`, and `0h 0m`, respectively.

## Bugs found and fixed

### 1. Partial multiple-choice answers could offer Finish session

**Reproduction:** Create a question with two correct choices, select only one, then rate it SATISFIED. The interface offered Finish session even though the response was incomplete. Clicking it returned the card for review instead of finishing. Backup validation also accepted a completed progress record containing this incomplete response.

**Cause:** Completion checks treated any selected option as an answered question.

**Fix:** A shared `hasCompleteAnswer` check now requires the required number of distinct valid choice indices, or nonempty trimmed text for typed questions. Both the study interface and restored-progress validation use it. Completing an incorrect response still counts as answering; correctness and satisfaction remain separate requirements.

**Verification:** Unit coverage includes partial, duplicate, invalid, fully correct, fully incorrect, boolean, and typed responses. A browser regression verifies that partial responses show Review unanswered and that a forged completed backup is rejected without replacing the library.

### 2. Refresh retained an old content page

**Reproduction:** In a short landscape viewport, page/focus down to a later option, then restart. The card's content remained translated upward; the measured transform stayed at approximately `-78.72px` before and after refresh.

**Cause:** Restart reset answer state but reused the same paginated card component.

**Fix:** The card component's identity includes the study session identifier, so refresh creates a fresh content-page state.

**Verification:** A browser test confirms the content transform returns to zero and the previous-content-page control is disabled after restart.

### 3. Small-screen paging could clip or miss complete controls

**Reproduction:** At 320 × 568, the Reveal control was slightly clipped. At 568 × 320, long picture questions exposed only two of four choices completely; the longer choices were taller than the available content area in the two-column arrangement.

**Cause:** Fractional layout heights were rounded down during paging, and long choices shared narrow columns on an especially short screen.

**Fix:** Pagination uses the ceiling of the measured body height and tighter visibility bounds. Short landscape cards use reduced padding; long-question choices span the available width.

**Verification:** Browser checks measure control bounds and text-line coverage, page through long content, and require every option and Reveal to become fully visible. Portrait and landscape regressions pass in the focused run.

### 4. A replacement question image could revert after save and reopen

**Reproduction:** Replace a landscape question photo with a portrait photo, remove the answer photo, save, reload, and reopen. The baseline browser run reopened the old landscape image: its JPEG dimensions were 1600 × 800 instead of the replacement's 800 × 1600.

**Fix:** Editor changes synchronously update the latest draft reference. Question patches apply to that latest draft by question identifier, so an autosave response cannot use an outdated rendered question list to replace newer input.

**Verification:** The image authoring test replaces photos, removes the answer image, saves, reloads, and compares the reopened image with the replacement. It passes after the change. The existing three-way merge also protects independent edits and pending typing.

### 5. An immediately reloaded swipe rating could revert

**Reproduction:** The baseline showed SATISFIED after a swipe, but an immediate reload restored UNRATED.

**Fix:** Progress saving is queued in a layout effect, before the updated screen is painted, rather than a later passive effect. Eliminating unrelated database writes also reduces transaction contention.

**Verification:** The incomplete/complete swipe regression checks the rating immediately after reload and passes in the focused run. This improves normal navigation/reload persistence; it is not a guarantee against a process or device losing power before an asynchronous transaction commits.

### 6. Read-only browsing rewrote the complete library

**Reproduction:** Instrumenting IndexedDB showed three writes during a fresh startup and two additional writes when opening My quizzes. These actions did not edit data. A read unnecessarily depended on write availability.

**Cause:** The common data-access helper always opened a read/write transaction and wrote the whole library back, including for GET requests.

**Fix:** Read operations now use readonly transactions without `put`. Initial data is created once during database creation. Loading study progress and exporting backups also use readonly access. Actual mutations retain atomic read/write transactions.

**Verification:** The same isolated measurement now records one write on fresh startup, zero writes on startup with an existing library, and zero additional writes when opening My quizzes. A fault-injection browser test makes every `put` throw a quota error and confirms an existing six-quiz library can still load and be browsed without an alert or attempted write.

## Other data-integrity fixes already included in this work

These fixes were present before this final audit and are included in its regression coverage:

| Issue | Resulting behavior | Verification |
| --- | --- | --- |
| Two editors saving stale copies could overwrite each other | A three-way merge retains changes to independent fields/settings. Conflicting changes to the same field are rejected while keeping the unsaved draft visible. Question arrays are protected as one unit. | Unit merge cases and two-editor browser tests |
| Large photo backups could export but fail import limits | Removed the arbitrary 30 MB backup/file-picker ceiling and 1,000-quiz transfer ceiling; parsing, validation, and device storage limits still apply. Busy/error handling remains in place. | A real exported photo backup larger than 30 MB is restored |
| The editor could create more questions than storage accepted | Both the editor and storage enforce a 500-question limit; existing questions remain editable at the limit. | 500-question boundary test |
| Restoring a backup changed creation dates and play counts | Valid original creation dates and usage counts are preserved. | Backup metadata round-trip test |
| Android Back could leave the library showing stale draft details | The pending editor save finishes and refreshes the library callback. | Simulated Android Back test |

## Optimizations

| Change | Practical effect | Evidence or scope |
| --- | --- | --- |
| Readonly IndexedDB paths | Avoids rewriting image-heavy libraries while browsing; removes an unnecessary dependency on writes for reading | Fresh startup writes 3 → 1; My quizzes navigation writes 2 → 0; existing startup writes 0 |
| Avoid a second clone for readonly results | Avoids an additional full-library clone after IndexedDB has already returned a separate value | Code-path review; no claimed wall-clock percentage |
| Consolidate startup requests | Uses `/library` for both the library and published deck list, alongside `/me` | Three initial reads reduced to two; independent reads start together |
| Reduce study timer updates | Schedules about one update per second instead of four; uses the remaining deadline for the final timeout | Approximately 75% fewer scheduled timer updates; expiration/restart browser test |
| Cache derived study data | Reuses question lookup, answered/visited sets, filtered questions, pending questions, and progress marker rendering | Avoids rebuilding equivalent collections on unrelated renders |
| Replace repeated prefix scans in progress markers | Uses a visited-ID set instead of slicing/scanning the sequence for every marker | Removes the quadratic prefix-scan pattern for large decks |
| Cache library filtering, sorting, and categories | Avoids repeating these calculations when unrelated state changes | Code-path review; search normalization happens once per calculation |

These are runtime and storage optimizations. They do not establish that the entire application is a fixed percentage faster. The production JavaScript bundle changed from about 402.57 kB to 403.48 kB (gzip 127.57 → 127.92 kB); it did not shrink. Final CSS is about 94.42 kB (gzip 19.74 kB).

The storage format still keeps the collection in one IndexedDB record. Actual edits and progress saves therefore still rewrite that record. Very large photo libraries may benefit from a future per-quiz/per-image schema migration; that migration was deliberately outside this review.

## Testing and results

The baseline `npm test` completed with a successful production build, 24 passing unit tests, and 127 of 132 active browser tests passing. Five browser tests failed. Four exposed the clipping, replacement-image, immediate-reload, and landscape-paging problems described above. One was an outdated test assumption: it clicked an option on a content page that was not currently visible after the responsive layout changes. That test now pages to the option using the actual controls; it is not counted as an application defect.

Additional targeted probing exposed the partial-answer completion and unnecessary-storage-write issues. Three new browser regressions and expanded completion-check unit cases were added. Focused reruns passed the previously failing areas, including the final landscape paging fix.

Final verification results:

| Check | Result |
| --- | --- |
| Production TypeScript/Vite build | Passed |
| Unit tests | 25 passed, zero failed |
| Complete 135-case browser run | 134 passed; one outdated test expectation timed out; run took 9.4 minutes |
| Corrected review-pass test rerun | Passed in 8.0 seconds; one-case command completed successfully |
| Active browser cases verified across the full run and follow-up | All 135 passed |
| Isolated database-write measurement | Fresh startup 1; existing startup 0; My quizzes navigation 0 |
| Isolated history-duration display check | Passed for 5,593, 3,600, and 59 seconds |
| Prettier check of current-audit source files and new audit spec | Passed |
| `git diff --check` | Passed |

The full `npm test` command did not exit successfully because the review-pass test was still waiting for “Review remaining” after selecting only one of two required answers. The corrected application properly offers “Review unanswered” for that incomplete response. Only the test's expected button label changed, and the entire affected test then passed on its targeted rerun. No application source changed after the full run. This is recorded separately from application defects rather than presented as an uninterrupted green full-suite run.

The active suite covers:

- Fresh empty installations, isolated libraries, offline startup/refresh, bookmarks, preferences, and persistence.
- Draft creation/autosave, publishing and visibility, multiple editors, question limits, formatting, and photo replacement/removal.
- Single/multiple correct choices, true/false, typed answers, answer reveal settings, shuffle identity, scoring, answer locks, animations, reduced motion, and stable geometry.
- Both swipe directions, Previous/Next, UNRATED, rating filters, repeated review passes, partial answers, completion, history, timer expiry, and restart.
- Backup export/restore including photo backups over 30 MB, preserved metadata/progress, and atomic rejection of invalid imports.
- Mobile, tablet, desktop, portrait, landscape, and short-window layouts. Covered dimensions include 320 × 568, 390 × 844, 568 × 320, 844 × 390, 768 × 1024, 1024 × 768, 1440 × 900, and 1920 × 1080. Some cases also exercise a 390 × 420 short window.
- Simulated native frontend/Android Back, update checks, and offline/native bridge behavior.

`npm test` builds the production app, runs the active unit tests, and runs the configured offline Playwright suite in installed Chrome. Retained legacy server/authentication tests are outside this offline suite. Tests use isolated browser contexts and test fixtures, not the user's personal library.

## Main files changed

| File | Responsibility |
| --- | --- |
| `src/components/Flashcards.tsx` | Answer feedback/locking, celebration, swipe ratings, persistence timing, restart identity, timer and derived-state optimizations |
| `src/components/FlashcardFace.tsx` | Content measurement, focus visibility, paging bounds |
| `src/components/Studio.tsx` | Latest-draft updates, queued saves, question patches, limits, exit refresh |
| `src/App.tsx` | History duration, consolidated startup, memoized library discovery/filtering |
| `src/styles.css` | Muted feedback borders, rating colors, wrapping, responsive layout, stable feedback, motion |
| `src/lib/questions.ts` | Shared complete-answer rules and answer identity |
| `src/lib/quiz-edit.ts` | Three-way editor merging and conflict protection |
| `src/lib/offline.ts` | Transaction modes, one-time initialization, save merges, question limit |
| `src/lib/study-progress.ts` | Completed-progress validation and readonly loads |
| `src/lib/transfer.ts` | Readonly export, large backup handling, metadata preservation |
| `src/lib/review.ts` | Four-rating review logic |
| `tests/browser/*.spec.ts`, unit tests, `playwright.config.ts` | Responsive/behavior/data regressions and active suite configuration |

## Limits of this review

Automated coverage cannot prove the application has no remaining bugs. The browser tests exercise Chrome at simulated device sizes; Android bridge behavior is simulated. Physical Android/iOS devices and Safari were not tested, and no new APK was built, installed, or published. Storage quota behavior was injected rather than tested by filling a real device. Performance measurements above concern database write counts and code paths, not physical-device frame rates or battery consumption.

## Release build verification: 1.0.11

Following the audit, the user requested a GitHub APK release. The signed production ARM64 APK built successfully with version name `1.0.11`, version code `1000011`, package `com.quizcraft.app`, minimum SDK 24, and target SDK 36. Android signature verification passed, and its signing certificate matches the published 1.0.10 APK. ZIP integrity and 16 KB page alignment checks passed. A versioned APK and `SHA256SUMS.txt` were prepared for GitHub release assets. The earlier statements about no APK build describe the audit stage; this release build was performed afterward. No physical-device installation was tested.
