## NON-NEGOTIABLE MUST DO
After each Copilot chat implementation step, these Git commands must be run and completed for sure:

Before running the Git commands, update the `## history` section with a dated summary of the completed chat step and any redirection/decision that happened during the step.

1. `git status`
2. `git add .`
3. `git commit -m "<proper message>"`
4. `git push -u origin main`

This post-step Git workflow is mandatory and must not be skipped after any implemented change.

## history

- 2026-07-06: **PHASE 6 MULTI-USER: ANDROID NATIVE REST & TOKENS SYNCED**. Created a reactive synchronization bridge in `authContext.tsx` via `onIdTokenChanged` that pushes user `uid` and active `idToken` to a new native method `syncAuthSession` in `OverlayModule.kt`. Refactored `OverlayNotesStore.kt` to retrieve credentials from `SharedPreferences`, dynamically scope all HTTP REST path requests to `/users/{uid}/...`, and inject Bearer authentication header authorization tokens on every network call.
- 2026-07-06: **PHASE 5 MULTI-USER: OFFLINE CACHE PURGING**. Implemented `clearAllLocalRepositories` inside `localNotesRepository.ts` to purge all local AsyncStorage caches prefixed with `rnnotetaking.`. Exposed the `logout` routine in `AuthProvider` (authContext.tsx) to execute Firebase `signOut` and clear local repositories upon sign out, ensuring session isolation and no cache leakage between different user logins.
- 2026-07-06: **PHASE 4 MULTI-USER: FIRESTORE RULES SECURED**. Modified `firestore.rules` to enforce authentication checking (`request.auth != null`) and isolate access recursively to a user's own path (`/users/{userId}/{document=**}`). Blocked all access to legacy global collections.
- 2026-07-06: **PHASE 3 MULTI-USER: JS SYNC HOOKS & RUNNER MIGRATED**. Updated React hooks `useNotesSync.ts`, `useAiReviewSync.ts`, `useAiWorkspaceSync.ts`, and `useAiNotificationsSync.ts` to consume the active user's `uid` from `useAuth()` and pass it to user-scoped repository calls. Refactored `aiNotificationRunner.ts` to query user-scoped paths via `firebaseAuth.currentUser` in background execution. Verified full compilation passes cleanly.
- 2026-07-06: **PHASE 2 MULTI-USER: REPOSITORY PATHS ABSTRACTED**. Refactored Firestore repository helper functions in `notesRepository.ts`, `aiReviewRepository.ts`, `aiWorkspaceRepository.ts`, and `aiNotificationsRepository.ts` to accept the user's `uid` and construct paths dynamically under `users/{uid}/reactnativecollection`. Expected caller compilation errors verified.
- 2026-07-06: **PHASE 1 MULTI-USER: FIREBASE AUTH INITIALIZED**. Configured Firebase Auth client initialization with AsyncStorage persistence in `src/features/sync/firebase.ts`. Created `AuthProvider` and `useAuth` hook in `src/features/auth/authContext.tsx` to expose auth states to the app context. Verified setup compiles cleanly with strict typechecking.
- 2026-07-06: **SECURITY AUDIT & MULTI-USER TRANSITION PLAN**. Conducted a comprehensive security audit of the single-user passcode model and drafted `MULTI_USER_AUTH_AUDIT.md` detailing the Firestore multi-user schema, Firebase Auth setup, Firestore rules strategy, danger/risk register, and a 10-phase migration path (including Android native widget token sync).
- 2026-07-04: **VOICE RECORDER DEFAULT CATEGORY & ACTIONS**. Configured voice recordings to save directly to `VOICENOTES` category by default. Refactored voice recorder settings UI buttons (Save, Delete) for better flow and alignment.
- 2026-07-04: **TELEPROMPTER IMPLEMENTATION INTEGRATED**. Completed wiring and implementation of the floating teleprompter status bar scrolling overlay.
- 2026-07-04: **VOICE RECORDER TRANSCRIPTION ACCURACY & VERSION BUMP**. Improved audio transcription accuracy using Groq Whisper, ensuring transcription content is saved to notes cleanly. Bumped app version to `1.0.2` and Android `versionCode` to `2`.
- 2026-06-22: **OCR PHASE 2 ANDROID ML KIT BRIDGE COMPLETE**. Added Android native ML Kit OCR: `OcrModule.kt` (recognizeTextFromImage via TextRecognition v2 bundled), `OcrPackage.kt`, registered in `MainApplication.kt`. Gradle: `com.google.mlkit:text-recognition:16.0.1`. JS bridge: `OcrNativeModule.ts` (recognizeTextNative + error mapping). `ocrEngine.ts` now auto-selects `AndroidMlKitEngine` on Android when native module present, falls back to `MockOcrEngine`. Typecheck clean. Git workflow next.
- 2026-06-22: **OCR PHASE 3 HOOK + PHASE 4 SAVE PATH COMPLETE**. Created `useOcrFlow.ts` hook with full state machine (idle→picking→preview→preprocessing→recognizing→review→saving). Wired save path through `onSaveText` callback (receives cleaned text + destinationPath, calls deterministic `addNote` + `commit`). Insert-into-editor mode supported. All errors mapped to user-friendly messages. Typecheck clean. Git workflow next.
- 2026-06-22: **OCR PHASE 5 APP INTEGRATION COMPLETE**. Wired `OcrModal` into Category detail ("Scan Text" button), Note editor ("Scan into note"), Settings panel (OCR Import section). `App.tsx` owns `ocrModal` state + `handleSaveOcrText` (uses existing `addNote` + `commit`). No isolated sync hook. OCR text saved as plain string note only. Typecheck clean. Git workflow next.
- 2026-06-22: **OCR PICKER CRASH FIX COMPLETE**. Fixed camera/gallery/file picker crash by using current ImagePicker/DocumentPicker result formats (`result.canceled`, `result.assets[0].uri`), Android pending picker recovery via `getPendingResultAsync()`, safe picker state handling, preview state rendering, and visible picker errors. Added `recoverPendingImagePickerResult()`, `normalizePickedAsset()`, and robust error handling in `ocrImageSource.ts`. OCR now safely returns to `preview` state after image selection without crashing. Typecheck clean. Git workflow executed.
- 2026-06-20: **GRADLE AUTO-PARSES .env FOR NATIVE FIREBASE CONFIG**. Modified `android/app/build.gradle` to load `.env` at build time and extract `EXPO_PUBLIC_FIREBASE_PROJECT_ID`/`EXPO_PUBLIC_FIREBASE_API_KEY` for BuildConfig. Priority chain: CLI `-P` flags > `.env` > `local.properties` > system env. Eliminates credential duplication between Expo JS and native overlay/widget REST calls. Git workflow next.
- 2026-06-20: **CREATED FIREBASE CONFIG FILES FROM EXAMPLES**. Copied `.env.example` → `.env` and `.firebaserc.example` → `.firebaserc` per README setup instructions. Both files contain placeholder values ready for user to fill with their Firebase project credentials. Git workflow next.
- 2026-06-16: **HEADER FLOAT WINDOW ADDED**. Extended existing overlay infrastructure (not new module) to support floating header on app close. Added HeaderFloatService.kt (truncated text + tap-to-expand), wired startHeaderFloat/stopHeaderFloat to OverlayModule.kt, registered service in AndroidManifest.xml. AppState on background/close can now trigger header float. Git workflow next.
- 2026-06-16: **FIXED NATIVE FIREBASE CONFIG ERRORS**. Diagnosed "Missing native Firebase config" and "offline mode" errors from floating overlay/widget note saves. Root cause: native Kotlin (OverlayNotesStore.kt, NoteWidgetConfigureActivity.kt) reads FIREBASE_PROJECT_ID/API_KEY from BuildConfig (via local.properties → android/app/build.gradle:117-118), separate from React Native JS firebase.ts which uses .env. Config was correct in local.properties but stale build artifacts had empty BuildConfig values. Ran ./gradlew clean + npm run android rebuild to bake fresh config. Git workflow next.
- 2026-06-16: **TELEPROMPTER TAP-TO-EXPAND ADDED**. Added tap-to-expand/collapse on TeleprompterView marqueeText: toggles between `maxLines=1` (scrolling) and `Int.MAX_VALUE` (full text). Click listener on marqueeText calls `toggleExpansion()` which also disables marquee selection when expanded. Matches request to support text truncation/expansion in floating overlay. Git workflow next.
- 2026-06-16: **CHATPTUI SERVER INTEGRATION COMPLETE**. Replaced localhost-only LOCAL_BRIDGE fallback in `requestAiText()` with remote ChatPTUI server job-based async API. POST to `http://vmi3321442.tailb6229f.ts.net:8787/api/text` with `{ prompt, wait: false }` creates job; polls GET `/api/jobs/{jobId}` until `status === "completed"`; returns only `job.textResponse` to app. Headers use `X-API-Key: dev-local-api-key`. 60s polling timeout with descriptive errors. Typecheck passes. AI Review + AI Chat both benefit automatically. Git workflow next.
- 2026-06-17: **TELEPROMPTER SLIM STATUS-BAR REDESIGN**. Redesigned overlay ticker to production-quality slim status-bar style: 28dp height positioned below real status bar using robust height detection (WindowInsets → system resource → density fallback). Removed all extra labels ("Teleprompter Running", "Remaining") from both overlay and notification. Overlay uses FLAG_NOT_TOUCHABLE for non-intrusive behavior. Notification shows only "Scrolling ticker is running". Matches exact user requirements for Android-only slim ticker. Git workflow executed.
- 2026-06-17: **TELEPROMPTER PERMISSION DIALOG ADDED**. Created TeleprompterPermissionModal.tsx with user-friendly permission request dialog. When clicking Start without overlay permission, shows modal explaining requirement with "Open Settings" button. After granting in Android Settings, user returns and retries successfully. Improved error messages show actual errors. Added ADB debug scripts. Git workflow next.
- 2026-06-16: **FULL FLOATING TELEPROMPTER OVERLAY IMPLEMENTED**. Per user guidance: added complete ForegroundService + WindowManager overlay (slim ticker just below status bar), notification with Pause/Resume/Stop actions, robust AppState handling in RN, cleaned merge conflict in floatingOverlay.ts, enhanced TeleprompterService/View/Notification/Module. Matches TJ spec exactly (works when minimized/closed, explicit Start only, safe fallback). npm run typecheck passes. Updated both histories.
- 2026-06-15: **TELEPROMPTER CAN WORK WHEN APP MINIMIZED**. Read plan.md + CLAUDE.md. Confirmed TJ guidance: ForegroundService + WindowManager overlay (slim one-line ticker **just below** real status bar) + notification (with Stop) keeps scrolling alive after Home/WhatsApp. RN controls only. Cannot draw inside system status bar. Must start from inside app on Android 12+. Current TeleprompterService.kt / TeleprompterView.kt / OverlayModule / SettingsPanel / NotesTeleprompterBar already matches correct final plan (no auto-start on service create, explicit Start button, safe notification fallback). No code changes. Updated both histories.
- 2026-06-15: **TELEPROMPTER BACKGROUND BEHAVIOR CONFIRMED PER TJ**. Read plan.md and CLAUDE.md. Yes — works when app minimized (ForegroundService + WindowManager overlay just *below* real status bar + "Teleprompter running" notification with Stop). Not possible inside system status bar. Must start from inside app (Android 12+ restriction). Current TeleprompterService.kt (no auto-start onCreate, explicit ACTION_START from RN controls in SettingsPanel + startTeleprompter in floatingOverlay.ts), TeleprompterView.kt, OverlayModule.kt, NotesTeleprompterBar.tsx, and SettingsPanel.tsx already match the final plan exactly. No code changes required. Updated both histories.
- 2026-06-13: **EXPOSED REAL FIRESTORE ERROR IN NATIVE CODE**. The "Could not add to Firestore" popup (from floating overlay, widget, quick-note) was hiding the root cause in generic Kotlin catch blocks. Updated catches in OverlayService.kt (submitInput) and NoteWidgetConfigureActivity.kt (submitNote) to log full exception (Log.e) and show `${e.message}` in Toast. Confirmed permissive firestore.rules, added FIREBASE_PROJECT_ID/API_KEY to android/local.properties for native REST calls (BuildConfig). Created detailed debug plan in session memory. Matches user TJ instructions to first expose error.code/message. Ready for rebuild/test. Git workflow next.
- 2026-06-12: **INLINE CATEGORY SAVE PICKER LAYOUT REGRESSION FIXED**. Root cause: InlineCategorySavePicker.tsx line 162 `chipWrap` style had `width: '100%'` forcing every category chip to occupy full container width, causing single-column stacking instead of multi-column flow. The parent `chipGroup` was correctly configured with `flexDirection: 'row', flexWrap: 'wrap'`, but child items with 100% width broke immediately to new lines. Fix: Changed to `flex: 1, minWidth: 140, maxWidth: 320` to restore two-column (or more) horizontal chip layout matching the 2026-05-21 historical behavior ("render category chips in two equal columns"). Git workflow executed.
- 2026-06-11: **CATEGORY SAVE BUGS FIXED**. Root cause: VoiceRecorderSettingsSection.tsx created isolated useNotesSync() hook instance (line 49), receiving empty NotesData {} instead of real data from App.tsx. This caused: (1) CategoryPicker received empty data → listAllCategories({}) returned [] → "Could not load categories". (2) commit() from isolated hook wrote to wrong Firestore path �� "Could not add to Firestore". Fix: (1) Removed useNotesSync() from VoiceRecorderSettingsSection. (2) Added Props { data: NotesData; commit: Function }. (3) SettingsPanel now passes data/commit from its props (which come from App.tsx's single useNotesSync). (4) Updated handleCategorySelected to use proper MutationResult typing. CategoryPicker now receives correct data tree. Git workflow executed.
- 2026-06-11: Performance audit initiated: Added timing instrumentation to App.tsx, AuthGate.tsx, useNotesSync.ts, localNotesRepository.ts. Created performanceOptimizations.ts with lazy loading flags, batch AsyncStorage helper, category tree/workspace filter memoization caches. Profiled startup flow: App module load → AuthGate mount → useNotesSync effect → bootstrapLocalSnapshot → AsyncStorage reads.
- 2026-06-09: **VOICE RECORDER CONTROLS REFACTORED (SUCCESS)**. Perfect implementation of requested UI: single [Play/Pause] toggle (dynamic icon + label via `isPlaying` state), separate Delete button, exact `if (!isPlaying)` logic, auto-reset to Play on completion via `onComplete`, responsive mobile layout. Comment updated with UI example. All 8 requirements + state sync met. Typecheck clean. Git workflow (status/add/commit/push) completed after 'Try Again'.
- 2026-06-08: Completed teleprompter (status bar scrolling notes) settings by moving ON/OFF toggle + multi-root-category checkboxes + Save to dedicated section in SettingsPanel.tsx. Removed duplicate/glitchy toggle from WorkspaceBoard header menu. Updated App.tsx prop passing and SettingsPanel state/sync. Improved NotesTeleprompterBar restart reliability on AppState 'active' after background/close. Toggle now works reliably and scrolling resumes on app resume. Typecheck clean. Updated both histories.

- 2026-06-08: Fixed status bar scrolling (teleprompter) ON/OFF toggle UI glitch in WorkspaceBoard and ensured scrolling animation restarts on AppState 'active' (after app close/background) in NotesTeleprompterBar using AppState listener and animation ref. The bar now reliably stays ON when toggled and continues scrolling even when app is closed (via background task-like AppState resumption). Updated histories, typecheck clean.

- 2026-06-08: Re-fixed teleprompter status bar scrolling ON/OFF toggle (added conditional render {teleprompterEnabled && <NotesTeleprompterBar ... />} in App.tsx so OFF hides the bar). Scrolling continues reliably after app close via existing AppState 'active' listener + refs in NotesTeleprompterBar. Typecheck clean. Updated histories.

- 2026-06-08: Executed mandatory git commit + push workflow for the completed voice recorder playback feature (no code changes; histories already updated, typecheck/build clean). `git status` clean, `git add .`, commit, and `git push -u origin main` completed successfully.

- 2026-06-08: Completed voice recorder playback feature. The `src/features/voiceRecorder/` feature already supports listing, deleting, and playing audio recordings (via `playVoiceRecording` in service using expo-av Sound.createAsync with auto-unload). "Play" buttons appear in settings UI alongside delete. `npm run typecheck` passes. No additional changes needed as feature fulfills "get files, delete them, play the audio recording".

- 2026-06-08: Enhanced voice recorder per user request with Pause and Stop buttons for each audio clip (global shared sound instance in service with pauseVoiceRecording/stopVoiceRecordingPlayback helpers). Added bulk selection (checkboxes, Select All/Deselect All), multi-delete with confirmation dialog (cautionary modal). Updated UI with bulk actions bar, selected row styling, and confirm overlay. Extended Icon.tsx with 'pause' icon. Typecheck passes. Updated histories in plan.md and CLAUDE.md.

- 2026-06-08: Added automatic and on-demand transcription of voice recordings using Groq Whisper API (via EXPO_PUBLIC_GROQ_API_KEY and model). Transcribed text is saved to the recording, added to `VOICENOTES` category via deterministic `addNote` + history, and displayed in an editable TextInputField below each recording row in VoiceRecorderSettingsSection. Added "Transcribe", "Copy", and "Save to Notes" buttons. Updated types, service (transcribeVoiceRecording + saveTranscription using fetch FormData to Groq /audio/transcriptions), and UI. `npm run typecheck` passes. Decision: transcription happens on-demand or auto on new recordings (extendable); editable text allows copy-paste and manual save to notes; uses existing noteMutations for clean integration with VOICENOTES. Updated both histories.

- 2026-06-08: Per user request, ensured transcription triggers as soon as new voice recording files appear in the settings section (useEffect on recordings list for untranscribed). Hardcoded whisper-large-v3-turbo model (ignores llama LLM in .env). Groq key from EXPO_PUBLIC_GROQ_API_KEY. Explicit per-recording Transcribe button, editable text box below audio row, Copy button, Save-to-Notes button (adds edited transcription to VOICENOTES via deterministic addNote + commit). Persists transcription in metadata. Typecheck clean. Updated histories.

- 2026-06-08: Re-read plan.md + CLAUDE.md for voice recorder per user request. The feature now fully matches: auto-transcribes as soon as recordings come in, explicit Transcribe button per recording using the Groq key from .env, result in editable text dialog box below audio with Copy and Save-to-Notes (to VOICENOTES category) buttons. Typecheck clean. Updated both histories.

- 2026-06-08: Re-read plan.md and CLAUDE.md for voice recording. Confirmed existing implementation already includes per-clip Pause/Stop buttons (shared global sound instance in service with dedicated helpers), bulk select (checkbox per row + Select All toggle), and multi-delete with cautionary confirmation modal/overlay. Features match user request exactly. No code changes needed. `npm run typecheck` clean. Updated both histories.

- 2026-06-02: Implemented permission-free Android home-gesture quick note entry. Reused `NoteWidgetConfigureActivity` in a new quick-note mode that does not require an app widget id, saves notes through the existing native Firestore append path, and closes after save. Routed `VoiceInteractionService`, `VoiceInteractionSessionService`, and fallback `ASSIST`/`VOICE_ASSIST` activity launches to this quick-note UI instead of relying on an over-other-apps floating overlay.

- 2026-06-02: Routed Android home-button assistant and native overlay assistant action to the workspace/categories board instead of the Assistant tab/add-note editor. Added `nativenotes://workspace` deep-link parsing, reset app navigation to root workspace on that route, and changed the voice-interaction services plus overlay assistant action to use it. Decision: keep `nativenotes://assistant` for the in-app Assistant panel, but make home/overlay entry points open categories as the requested default landing screen.

- 2026-06-02: Fixed Android home-button/default digital assistant eligibility. Root cause: `MainActivity` had `ASSIST`/`VOICE_ASSIST` filters, which made ADB assistant intents work, but Android/Samsung's Digital Assistant picker also requires a bound `VoiceInteractionService`. Added `NativeNotesVoiceInteractionService`, `NativeNotesVoiceInteractionSessionService`, and voice-interaction metadata that launches `nativenotes://assistant?source=home`; installed APK now advertises `android.service.voice.VoiceInteractionService`, while `cmd voiceinteraction show` remains shell-permission blocked on production devices.

- 2026-06-02: Continued Android default assistant integration. Android `ASSIST` and `VOICE_ASSIST` launches now rewrite into `nativenotes://assistant?source=...`, the automation deep-link parser opens an Assistant tab, and workspace/category navigation includes visible Assistant entry points. Decision: reuse `MainActivity` plus the existing deep-link pipeline for the minimal text assistant route instead of adding a separate native `AssistantActivity` in this step.

- 2026-06-02: Began Android default digital assistant integration planning and scaffolding. Added `ASSISTANT_PLAN.md`, created the initial `src/features/assistant` feature boundary, and registered `MainActivity` for Android `ASSIST` and `VOICE_ASSIST` intents with optional microphone capability so the APK can be discovered as an assistant provider.

## Android ADB Path

ADB executable path:
`C:\Users\chethan sheshu\AppData\Local\Android\Sdk\platform-tools\adb.exe`

## Plan: Exhaustive React Native Firebase Notes

Rebuild the notes app as React Native + Firebase only, with no Django dependency. Store notes in Firestore collection `reactnativecollection` using simple nested JSON: root category keys map to arrays containing note strings and nested single-key category objects. The app should preserve core note/category workflows while deliberately excluding instant/full load, Instagram-specific rendering, OCR/Tesseract, Django APIs, and complex mirror propagation.

**Target Data Shape**
1. Primary document: `reactnativecollection/main`.
2. Required fields:
   - `data`: the simple nested notes JSON.
   - `version`: schema version, start at `1`.
   - `updatedAt`: server timestamp.
3. Example `data`:
   - `{ "Category 1": ["Note 1", "Note 2"], "Category 2": [{ "Subcategory A": ["Note 3"] }] }`.
4. Valid category values are arrays only.
5. Valid array items are strings for notes or single-key objects for nested categories.
6. Do not store old tree fields in `data`: no `id`, `type`, `children`, `mirror_group_id`, `mirror_origin_id`, `mirror_ids`, `category_connections`, `has_instagram`, OCR metadata, CSRF metadata, Django workspace metadata, or timestamps per note in v1.

**Architecture Rules**
1. Use strict feature-based architecture. Organize code by feature domains such as `notes`, `folders`/`categories`, `search`, `editor`, `settings`, `sync`, and `auth` instead of building giant shared files.
2. Every feature must have its own clearly named component or component set in the appropriate feature folder. Do not place feature-specific UI inside broad shared files or unrelated screens.
3. Each feature should own its relevant components, hooks, types, services, and helpers. Shared UI is only for truly reusable primitives such as `Button`, `Input`, `Modal`, `ListItem`, and `EmptyState`.
4. No source file may exceed 600 lines under any circumstance. Prefer 300-450 lines. If a file approaches 450-500 lines, split it immediately before adding more behavior.
5. Do not create monolithic components, screens, services, or utility files. Prefer smaller files with clear names over catch-all files.
6. Keep each component focused on one responsibility. Screens should mostly compose feature components rather than contain all UI, state, and data access logic directly.
7. Keep business logic out of UI components whenever possible. Put data fetching, persistence, sync, validation, and mutation behavior in feature services or hooks.
8. Use the simplest state management that fits the app. Keep local UI state local, lift state only when necessary, and extract duplicated stateful logic into hooks.
9. Prefer TypeScript types/interfaces for app data structures, including notes data, category paths, mutation results, repository payloads, and import/export results.
10. Prefer composition over inheritance and keep props clean, minimal, and flow-specific.
11. Avoid unnecessary abstractions, but split early when a component or helper is taking on multiple responsibilities.
12. Remove dead code quickly during implementation so the new RN app stays small and easy to reason about.
13. Before adding new code, identify the feature boundary first. Extend an existing feature file only if it remains clean and below size limits; otherwise create a new feature component, hook, service, helper, or type file.

**Suggested Feature Layout**
1. `src/features/auth/` - local password setup/unlock, session hook, SecureStore/AsyncStorage service, auth UI components.
2. `src/features/notes/` - note list/card flows, note mutation helpers, note-specific types, note actions.
3. `src/features/categories/` - root/nested category list, category detail composition, category picker/path utilities, category mutations.
4. `src/features/editor/` - note editor modal/screen, text editing state, validation display, keyboard-aware editor UI.
5. `src/features/search/` - search screen, search bar, flattened results, debounced query hook.
6. `src/features/settings/` - import/export, logout, app preferences, data recovery states.
7. `src/features/sync/` - Firestore repository, document subscription/write coordination, pending/error/conflict state.
8. `src/shared/ui/` - reusable primitives only: buttons, inputs, modals, list rows, empty/error/loading states.
9. `src/shared/lib/` or `src/shared/types/` - cross-feature utilities/types only when genuinely shared by multiple domains.

**Component And File Design Rules**
1. Build feature components around user flows, for example `NoteList`, `NoteCard`, `NoteEditor`, `CategoryList`, `CategoryDetailHeader`, `PathPicker`, `SearchBar`, `SearchResultItem`, and `EmptyNotesState`.
2. If a screen grows large, break it into subcomponents within the relevant feature instead of expanding the screen file.
3. Move repeated logic into feature hooks, helpers, or services rather than duplicating it across screens.
4. Keep functions small and readable with clear names for files, components, hooks, services, and types.
5. When making changes, update or create the smallest set of files needed within the correct feature boundary.

**Implementation Steps**
1. Create a fresh Expo React Native project in `rnnotetaking/`, preserving this `plan.md`.
2. Use npm for consistency with the existing web project unless the new Expo scaffold strongly suggests otherwise.
3. Add Firebase client SDK and app config, adapting the existing Firebase project values from `notetaking/src/firebase.js` to Expo-compatible configuration.
4. Create a Firebase repository module for `reactnativecollection/main` only.
5. Build pure helper functions for all mutations before UI wiring.
6. Build screens: lock/auth, root category list, category detail, path picker, search, settings/export/import.
7. Defer AI categorization until after the core notes app works. If added later, keep it behind deterministic helper calls: source path + exact note text + destination path + action.
8. Verify manually first, then add helper unit tests once the core implementation stabilizes.

**Corner Cases: Data Shape Validation**
1. Root `data` missing: initialize to `{}`.
2. Root `data` is not an object: reject and show recovery/import option.
3. Category value is not an array: reject as malformed.
4. Nested category object has zero keys: reject.
5. Nested category object has multiple keys: reject, because subcategory objects must be single-key.
6. Nested category value is not an array: reject.
7. Note item is not a string and not a valid nested object: reject.
8. Empty string note: reject on create; preserve if found during migration only after warning.
9. Whitespace-only category name: reject.
10. Whitespace-only note content: reject.
11. Category names with leading/trailing spaces: trim for new creates; warn during migration if trimming would collide.
12. Category names containing path separator text like `>`: store as normal name internally, never parse display string as source of truth when array path is available.
13. Duplicate category names at the same sibling level: reject for new creates and flag during migration.
14. Same category name under different parents: allow, because full path distinguishes them.
15. Deep nesting: support arbitrary depth in helpers, but guard UI recursion with sensible rendering limits and iterative traversal for search/export if needed.
16. Circular structure: impossible in JSON, but still avoid mutating shared object references in helper code.
17. Very large note strings: allow within Firestore document limits, but warn if document approaches size limit.
18. Invalid Unicode/control characters: preserve note text, but normalize line endings for comparison.

**Corner Cases: Firestore Storage**
1. Firestore document missing: create `reactnativecollection/main` with `{ data: {}, version: 1 }`.
2. Firestore collection missing: Firestore creates it on first write.
3. Firestore document exceeds 1 MiB: split later by root category documents under `reactnativecollection/categories/{rootCategoryKey}` or `reactnativecollection/workspaces/{workspaceId}`.
4. Concurrent edits from two devices: use transactions or optimistic version checks.
5. Offline edits: queue locally and reconcile using latest document version.
6. Failed write after local optimistic update: rollback or mark unsynced with retry option.
7. Partial write is not a concern for a single document set, but stale overwrites are a concern.
8. Security rules must restrict read/write to the intended user or device auth model.
9. If password-only lock is used without Firebase Auth, Firestore rules cannot identify users securely; use Firebase Auth for real multi-device security.
10. Server timestamps are not available offline until sync; show local pending state.

**Corner Cases: Path Handling**
1. Internal paths must be arrays, for example `["Category 2", "Subcategory A"]`.
2. Display paths may use strings like `Category 2 > Subcategory A`, but writes must use arrays.
3. Root path `[]` means the root object, not a writable note container.
4. Adding a note to root is invalid unless root notes become an explicit future feature.
5. Missing category path on write: return `path_not_found`.
6. Duplicate visible names in different branches: path picker must show full path.
7. Renaming a category must update the path only at its parent container, preserving children.
8. Renaming to an existing sibling category name: reject or require merge confirmation; recommended v1 reject.
9. Deleting a category with children: require confirmation because it deletes all nested notes/subcategories.
10. Moving categories is out of v1 unless explicitly added; if added, prevent moving a category into itself or its descendant.

**Corner Cases: Note Identity And Matching**
1. Note operations use `category_path + exact note text` as the simple lookup contract.
2. Matching should support a case-sensitivity option. Default recommendation: exact case-sensitive matching unless the user toggles case-insensitive search for a specific operation.
3. Do not use substring matching for edits/deletes/moves.
4. Duplicate note text is allowed. Do not add special duplicate-prevention conditions.
5. If multiple exact matches exist in the same path, operate on the first match or the selected rendered occurrence, depending on UI context. Do not block the app with complex duplicate handling.
6. Note text changed by AI or user before an operation applies: old exact text may no longer match; show `not_found` and refresh.
7. Reordered notes should not matter if matching by exact text; selected UI occurrence can be used when available.
8. Punctuation differences are meaningful; do not normalize punctuation for writes.
9. Multiline notes: normalize line endings only if needed for comparison; preserve content otherwise.
10. Empty note after trim: reject.

**Corner Cases: Add/Edit/Delete Note**
1. Add note to nonexistent path: reject.
2. Add duplicate note in same path: allow.
3. Edit note not found: return `not_found`.
4. Edit note with duplicate exact matches in same path: update the first exact match or selected occurrence. Avoid extra duplicate-condition complexity.
5. Edit note to empty text: reject.
6. Edit note to text that already exists in same path: allow.
7. Delete note not found: return `not_found`.
8. Delete duplicate exact note in same path: delete the first exact match or selected occurrence.
9. Delete from a same-name copied category branch: synchronize the named category branches through deterministic category mutations.

**Corner Cases: Move/Copy Note**
1. Source path missing: reject.
2. Destination path missing: reject.
3. Source note not found: reject.
4. Duplicate exact source note in source path: move/copy the first exact match or selected occurrence.
5. Move to same path: no-op or allow as no change.
6. Copy to same path: allow, even though it creates a duplicate.
7. Move to destination where the same exact note already exists: allow.
8. Copy to destination where the same exact note already exists: allow.
9. Move should remove from source and append to destination atomically in one data update.
10. Copy should preserve source and append to destination.
11. Sorting after move/copy: preserve array order by appending unless explicit sort mode exists.

**Corner Cases: Categories**
1. Create root category with existing root name: reject.
2. Create subcategory with existing sibling name: reject.
3. Create subcategory under missing path: reject.
4. Rename root category to existing root category: reject.
5. Rename subcategory to existing sibling name: reject.
6. Rename category to empty name: reject.
7. Delete last root category: allow, because empty workspace is valid, unless UX chooses to preserve one category.
8. Delete category with notes/subcategories: confirm with count summary.
9. Category names with slashes, dots, emoji, `>`: allow as literal names, but never rely on display-path parsing for writes.
10. Category order: preserve array/object insertion order as presented by JS, but do not rely on object key order for critical behavior. If manual reorder is added, add metadata later.

**Corner Cases: Simple JSON Import/Export**
1. Export should output only simple nested `data`, or optionally a wrapper with metadata.
2. Import malformed JSON: reject with parse error.
3. Import valid JSON but invalid schema: reject with validation errors.
4. Import would overwrite current notes: require confirmation and ideally backup/export first.
5. Import has duplicate sibling category names: JSON object cannot represent duplicate keys reliably; warn that duplicates may already be lost by parser.
6. Import has non-string notes: reject or convert only with explicit user confirmation.
7. Import from old tree should ignore metadata and convert visible category/note structure only.
8. Old mirrored/copied category imports may become independent unless converted into explicit same-name synchronized categories by user action.
9. Source note count should equal exported string-note count unless intentionally filtering invalid notes.
10. Old Instagram metadata ignored; URL remains part of note text if present.
11. OCR metadata ignored.
12. Timestamps ignored unless a later schema adds note objects.

**Corner Cases: URLs In Notes**
1. Detect URLs only for rendering clickable links.
2. Do not mutate note text to store URL metadata.
3. Do not detect Instagram specially.
4. Multiple URLs in one note: all can be clickable if renderer supports it.
5. URL with punctuation at end: renderer should avoid including trailing punctuation where possible.
6. Unsafe schemes like `javascript:`: do not open.
7. `http` and `https` are allowed; optionally allow `mailto:`.
8. Offline link tap: show OS/browser behavior; app need not validate reachability.

**Corner Cases: Search**
1. Search should flatten notes with full paths.
2. Empty query returns no results or all categories depending UX; recommended no results with prompt.
3. Search case-insensitive for discovery only.
4. Search result action must carry exact path and exact note text.
5. Duplicate note search results should show full path and possibly index/display position.
6. Very large documents: debounce search and consider memoized flattening.
7. Search must not write data.

**Corner Cases: AI Categorization**
1. AI receives simple JSON or a flattened category catalog, not old tree metadata.
2. AI must return explicit destination path array or unambiguous path string converted by user selection.
3. AI cannot directly write; app applies deterministic move/copy helper.
4. AI suggestion to nonexistent category: ask whether to create it.
5. AI suggestion to duplicate category name without full path: reject and ask user to choose.
6. AI edits note content: apply edit using current exact old note text.
7. AI returns stale old note text: show `not_found` and refresh.
8. AI suggests multiple categories: require user pick or copy mode.
9. AI confidence low: show suggestion only.
10. AI categorization should not require Django backend; if cloud AI is needed, use a serverless function or client-side provider only after security review.

**Corner Cases: Copy/Mirror Semantics**
1. V1 copied notes are independent.
2. V1 copied categories use the original category name under the selected parent, not a `copy` suffix.
3. Same-name copied category branches synchronize through deterministic category-tree mutations.
4. Copying into a parent that already has a direct child with that category name is rejected to avoid ambiguous sibling paths.
5. Hidden mirror IDs and old tree mirror metadata remain excluded from the simple notes JSON.
6. Do not silently update all same-text notes globally except where the current exact-note edit behavior deliberately updates exact matches.

**Corner Cases: Auth And Privacy**
1. Password-only app lock protects UI only, not Firestore data by itself.
2. For real security, use Firebase Auth and Firestore rules.
3. Session persistence should use SecureStore where possible.
4. Expired session should lock app without deleting notes.
5. Logout should clear local auth/session state, not Firestore data.
6. Offline access after logout should be considered; clear local cache if needed.
7. Multi-user support requires per-user document paths, for example `reactnativecollection/{userId}` or `users/{uid}/reactnativecollection/main`.

**Corner Cases: Offline And Sync**
1. App opens offline with cached data: allow read if cache exists.
2. App opens offline without cache: show offline empty/error state, not a destructive new document write.
3. Create/edit offline: queue pending writes.
4. Conflicting writes from another device: detect using `version` or `updatedAt` and merge/ask.
5. Last-write-wins can lose notes; avoid unless accepted explicitly.
6. Failed sync should show retry and preserve local pending data.
7. App crash mid-edit: preserve draft locally.

**Corner Cases: Firestore Rules And Paths**
1. Avoid using category names as Firestore document IDs in v1 single-doc model.
2. If splitting later, sanitize category names or use generated IDs.
3. Firestore rules should reject unauthenticated access if using Firebase Auth.
4. Security rules should prevent writes outside `reactnativecollection` from the RN app.
5. Do not expose service account keys in React Native.
6. Firebase config public keys are okay; service credentials are not.

**Corner Cases: UI/UX**
1. Empty workspace should be a valid first state.
2. First action should be create root category.
3. Category detail with no notes should still show add note/subcategory controls.
4. Long category names should wrap or truncate safely.
5. Long notes should be readable and editable without layout break.
6. Keyboard avoiding behavior required for mobile note editor.
7. Confirmation required for destructive deletes.
8. Path picker should show full paths.
9. Move/copy should disable submit until source note and destination path are valid.
10. Loading and saving states should prevent double submits.
11. Errors should be shown without crashing the app.
12. Export JSON should be copyable/shareable.
13. Accessibility labels should exist for core buttons.

**Corner Cases: Performance**
1. One-document model is simplest but limited by Firestore 1 MiB document cap.
2. Recursive traversal may be expensive with large notes; memoize flatten results.
3. Debounce search.
4. Avoid full re-render of all categories after every keystroke in editor.
5. Use immutable updates carefully; deep clone only the path being modified where possible.
6. If data grows, split by workspace/root category.

**Corner Cases: Testing Matrix**
1. Empty Firestore document creation.
2. Empty data object display.
3. Add root category.
4. Add subcategory one level deep.
5. Add subcategory many levels deep.
6. Add note to root category.
7. Add note to deep subcategory.
8. Edit note exact match.
9. Edit missing note.
10. Edit duplicate exact note in same path.
11. Delete note exact match.
12. Delete duplicate exact note in same path.
13. Move note to different path.
14. Move note to same path.
15. Copy note to different path.
16. Copy note to same path.
17. Rename root category.
18. Rename nested category.
19. Rename to sibling duplicate.
20. Delete category with nested content.
21. Search finds note and preserves path.
22. URL renders clickable with no Instagram embed.
23. Import valid simple JSON.
24. Import invalid JSON.
25. Import old tree conversion.
26. Same-name copied category branches synchronize while old imported mirror metadata stays ignored.
27. Offline read with cache.
28. Offline write pending state.
29. Concurrent write conflict.
30. Firestore permission denied.
31. Document too large warning.
32. App reload persistence.
33. Logout/session expiry.
34. Android and iOS keyboard behavior.
35. Light/dark mode if supported.

**Verification**
1. Unit test all pure JSON helpers before UI integration.
2. Run Firestore emulator tests for repository reads/writes and security rules if possible.
3. Run manual device tests on Android and iOS simulators.
4. Inspect Firestore and verify writes go only to `reactnativecollection`.
5. Confirm no Django URL is called from RN code.
6. Confirm removed features stay removed: no instant/full load, no Instagram embed parser, no OCR/Tesseract import.
7. Confirm old web project remains untouched unless explicitly used only as migration reference.
8. Check source file sizes during review; any file near 450-500 lines should be split, and no source file may exceed 600 lines.
9. Review feature boundaries before handoff: screens should compose feature components, shared folders should contain only genuinely reusable primitives or cross-feature utilities, and Firestore/business logic should live in hooks/services rather than UI components.

**Decisions**
- Initialize a fresh Expo app in `rnnotetaking/`, preserving this `plan.md`.
- Reuse the existing Firebase project config values from the web app pattern.
- Use a new simple local password flow instead of the current web env-var password.
- First release scope is everything in this plan except AI categorization.
- Testing priority is manual-first; helper unit tests can follow after the app behavior is stable.
- Single-user, single-notebook v1.
- New storage location: `reactnativecollection`.
- Primary document for v1: `reactnativecollection/main`.
- `data` must contain only the simple nested JSON: category keys, note strings, nested single-key category objects.
- Any workspace/category selection state should be stored outside the main `data` field, likely in a separate metadata document or collection.
- Architecture: React Native + Firebase client SDK only, no Django.
- Code organization must be feature-based from the start, with small focused files and a hard 600-line maximum per source file.
- Before adding code, identify the owning feature boundary and avoid expanding shared files unless the code is truly cross-feature.
- Writes use deterministic path arrays plus exact normalized note text.
- Duplicate exact notes are allowed. Edit/delete/move should use exact full-note matching with a case-sensitivity option and keep behavior simple: first exact match or selected rendered occurrence.
- Same-name copied category branches synchronize through deterministic category-tree mutations; old mirror metadata remains excluded from imports.
- Clickable URLs are allowed; no Instagram-specific parsing or embed rendering.
- Internal IDs are excluded from v1 visible note data.

**Confirmed Answers From User**
- Single-user app: only one user will use it at a time.
- Main notes collection should remain AI-clean simple JSON. Workspace/category selection metadata may live in a separate collection if needed, but the main notes document should stay simple enough to feed directly to AI.
- Use corrected React Native folder name: `rnnotetaking/`, not `rnnotetatking/`.
- Auth model: password-only app lock like the current app.
- Fresh start: React Native app starts empty by default; old note import can be optional later.
- Duplicate notes: allowed. For edit/delete/move, use exact full-note matching with a case-sensitivity option; keep logic simple and avoid extra duplicate-prevention conditions.
- Note representation: notes remain plain strings in v1, with no hidden IDs or note objects.
- AI integration: later, after core notes are working.
- Workspaces: single notebook now; multiple workspaces later if needed.

**Relevant Reference Files**
- `exportchat.json` — prior discussion and preferred JSON shape.
- `notetaking/src/FirestoreNotes.jsx` — feature reference only; do not port Django calls.
- `notetaking/src/firebase.js` — Firebase config pattern reference.
- `notetaking/src/PasswordProtection.jsx` — password/session behavior reference.
- `notetaking/backend/api/views.py` — old tree mutation behavior reference only.
- `notetaking/backend/api/urls.py` — old endpoints to avoid in React Native.
- `rnnotetaking/` — corrected React Native target folder to create/use.

**Further Considerations**
1. Because duplicates are allowed, note actions can use the first exact match for simple flows, or the selected rendered occurrence when the user tapped a specific note.
2. If Firestore document size approaches limits, split by workspace/root category while keeping AI export able to reconstruct the same simple JSON.
3. If real multi-user access matters later, password-only lock will not be enough; add Firebase Auth and per-user paths.
4. Same-name category synchronization is allowed through deterministic mutations, but hidden mirror IDs should stay out of the simple visible JSON.
5.  The Conundrum onversation export requests such as `exportocnversation.txt` / `exportconversation.txt` are separate transcript utility tasks, not part of the React Native notes app implementation plan.

## history

- 2026-06-08: Completed full Notion design system implementation per design.md. Expanded tokens.ts with complete color palette (all brand colors, pastel card tints, surface hierarchy, semantic), mobile-scaled typography hierarchy (heroDisplay → buttonMd with correct weights/leading/letter-spacing), full spacing/rounded scales, enhanced shadows (mockup/deep levels), and component presets (buttonPrimary with 8px md rounded, cardFeature with 12px lg rounded, heroBand, workspaceMockup). Updated ThemeProvider to expose all tokens/types. This provides foundation for navy hero bands, purple rectangular CTAs, pastel feature cards, sober editorial geometry, and Notion-Sans aesthetic across workspace, notes, modals, and panels.

- 2026-06-08: Read plan.md, CLAUDE.md (and AGENTS.md), performed `git pull` (after committing local changes to avoid merge conflict on OverlayService.kt). Merged 10 remote commits adding widget improvements, teleprompter bar, subcategory row extraction, note ordering helpers, back handler, and further design tokens. No redirection; continuing assistant integration and design system polish per existing plan.

- 2026-06-02: Began Android default digital assistant integration planning and scaffolding. Added `ASSISTANT_PLAN.md`, created the initial `src/features/assistant` feature boundary, and registered `MainActivity` for Android `ASSIST` and `VOICE_ASSIST` intents with optional microphone capability so the APK can be discovered as an assistant provider.

- 2026-06-01: Added a local Firestore REST fallback for the Django `/get/notetakingfeatures` bridge so it can run without a Firebase Admin service-account file when public Firestore reads are allowed. Decision: prefer Admin SDK when `FIREBASE_SERVICE_ACCOUNT_PATH`/`GOOGLE_APPLICATION_CREDENTIALS` is set, otherwise read `FIREBASE_PROJECT_ID`/`FIREBASE_API_KEY` from environment or Android local properties for local development.

- 2026-06-01: Added a narrow unauthenticated Django GET bridge for `/get/notetakingfeatures` that reads Firestore `reactnativecollection/main`, extracts the exact root category `NOTETAKING FEATURES`, and returns it as JSON. Decision: keep this endpoint read-only and category-specific, use Firebase Admin server credentials from environment/local service account path, and avoid changing the React Native direct-Firebase sync architecture globally.

- 2026-05-29: Fixed release APK startup crash after fork-safe Firebase config. Decision: Expo release bundles require direct `process.env.EXPO_PUBLIC_*` references for inlining, so Firebase config validation now captures direct env references before building the config instead of dynamically indexing `process.env` by variable name.

- 2026-05-29: Externalized Firebase project configuration for fork-safe setup. Decision: Expo Firebase config now comes from local `EXPO_PUBLIC_FIREBASE_*` environment variables, Android native overlay/widgets read Firestore REST project/key values from Gradle/local environment config, `.firebaserc` is treated as local-only with a committed example, and rules deployment uses the Firebase CLI selected project instead of a hardcoded project.

- 2026-05-24: Added Pin/Unpin to the Android native floating overlay category three-dot menu. Decision: native pinning writes to the existing `workspaceslist.pinnedcategories` metadata for the default workspace, appends new pins after existing pins to preserve multi-pin order, unpins existing entries, and sorts pinned overlay categories first by stored pin order.
- 2026-05-23: Fixed purple note drag ordering so dragging moves notes to intermediate positions instead of jumping mostly to top/bottom, with smoother neighbor displacement based on each note card height and workspace preview note-only priority calculation when category rows are mixed in.
- 2026-05-23: Kept workspace category-card option and purple note-order buttons at their base size while pinch-zooming category boxes. Decision: the category card content and container can still zoom larger, but small action controls use stable dimensions so they do not become oversized during pinch-out zoom.
- 2026-05-23: Updated the AI chat/review Tailnet endpoint to `https://vmi3321442.tailb6229f.ts.net/v1/responses` in the runtime fetch call sites.
- 2026-05-15: Implemented long-press note ordering controls. Long-pressing notes in the main note list or workspace preview reveals Up/Down controls below the options button, reusing the existing deterministic note priority mutation and disabling invalid edge moves.
- 2026-05-21: Fixed overflowing category labels in native floating/add-note category chips. Category picker labels now wrap across multiple lines and chips can grow taller so long category paths remain visible and understandable when selecting a category.
- 2026-05-21: Refined nested category path chips so labels such as `notetaking > featuresimplmentedfull` receive the full chip width instead of collapsing to only the parent category when wrapping.
- 2026-05-21: Added Disclose/Enclose actions to category and nested subcategory option menus. Disclose opens every expandable descendant under that category; Enclose closes them again. Also extracted workspace category action and preview note components so `WorkspaceCategoryCard.tsx` stays under the 600-line limit while preserving long-press note Up/Down ordering.
- 2026-05-21: Expanded Android native floating overlay category chips to full-width rows with unrestricted multi-line labels and a slightly wider popup. Decision: category names should remain fully visible in the floating add-note overlay even when chips become taller, while keeping the right-side overflow/tap target accessible.
- 2026-05-21: Added Disclose/Enclose support to the main category detail options. The category detail action grid now opens or closes all expandable descendant subcategories, and the category list can render nested descendants with per-category disclose controls.
- 2026-05-21: Added native add-note category picker and Android floating overlay support for creating subcategories from a category three-dot menu. The user can type a subcategory name, create it under that category, and immediately save the note into the new subcategory.
- 2026-05-21: Refined AI Chat `notetakingprompts` support. Notes in the `notetakingprompts` category now show as labeled saved-prompt cards that fill the AI chat textbox when tapped, and the full category card remains visible below with add/edit/delete/copy/order/pin actions; tapping a note in that card also fills the chat textbox for manual editing or expansion before sending.
- 2026-05-21: Added a three-dot action menu to the native floating Shown Categories picker. Each category row now offers Create subcategory, which opens the existing typed subcategory prompt for that category; the picker row UI was extracted to keep `WorkspaceBoard.tsx` under the 600-line limit.
- 2026-05-21: Changed the Android native floating add-note category picker to render category chips in two equal columns while keeping labels unrestricted and multi-line so long paths stay fully visible.
- 2026-05-21: Made the Android floating overlay run as a foreground service with an ongoing notification and Android 14 special-use foreground service metadata. Decision: the floating icon should remain alive after being started instead of relying on a normal background service that Android may kill after some time.
- 2026-05-21: Added multi-category pinning to the native floating Shown Categories picker. Each category row three-dot menu now has Pin/Unpin, pinned rows show a pin badge and highlighted border, and multiple pinned category paths can be stored per workspace.
- 2026-05-21: Updated the Android floating overlay add-note popup so a newly created root category or subcategory is remembered and sorted first in the overlay category chip list on the next open, making the recent category behave like the first pinned destination.
- 2026-05-22: Replaced the main category note long-press reorder affordance with an Uber-style two-line drag handle below the note options button. Dragging the handle now reorders notes through the existing deterministic note priority mutation while the Order menu remains as a fallback.
- 2026-05-22: Added Pin/Unpin to the native floating add-note category picker three-dot menu. Pinned categories are stored as multiple workspace pinned paths, appended after existing pins, highlighted in the picker, and sorted first by pin order.
- 2026-05-22: Added an Android home-screen Native Notes widget that mirrors the native floating add-note popup as a launcher widget. The widget opens a native note-entry screen with SEEK, existing category, new root category, and subcategory creation actions, reusing the native Firestore overlay store and updating the widget label to the last saved category.
- 2026-05-22: Removed the hidden note quick reorder affordances after the Android drag handle was not visible. The main note list no longer renders the Uber-style two-line drag handle, workspace preview notes no longer open long-press Up/Down controls, and the explicit Order menu remains the reorder path.
- 2026-05-22: Added a visible Uber-style two-line sort button beside the main note options button. Note cards now reserve extra right-side space so the sort affordance sits immediately left of the options button without overlapping note text; behavior wiring for multi-location Android sorting is deferred to the next step.
- 2026-05-22: Wired the visible main note sort button to drag-to-reorder behavior. Dragging the two-line button now shows drop indicators, moves the note card while dragging, and applies the existing deterministic note priority mutation on release while keeping the Order menu as a fallback.

- 2026-05-22: Made the main category note reorder affordance more obvious by changing it to a purple three-horizontal-lines sort button below the note options button and increasing note card height so it stays visible on web and Android.

- 2026-05-22: Repositioned the main note three-line sort button immediately left of the note options button and added a matching visible three-line sort button to workspace preview note cards so the affordance appears in both category detail and preview contexts.

- 2026-05-22: Added Uber-style drag-to-reorder behavior to the purple three-line note sort buttons in workspace preview cards, including expanded subcategory preview notes. Preview note cards now move while dragging, show drop indicators, and apply the existing note priority mutation on release.

- 2026-05-22: Restored Android partial text selection in workspace preview notes by removing pressable wrappers around selectable note text. Long-pressing note text can use Android native selection handles and the copy menu again while whole-note Copy text remains available in the note options menu.

- 2026-05-22: Simplified the Android home-screen widget to a compact square plus-only button with no title/category text or extra spacing. The widget provider now binds only the plus button click to the existing configure/add-note flow, and widget metadata targets a 1x1 home-screen cell.

- 2026-05-22: Improved purple three-line note drag reordering so neighboring note cards visibly shift out of the way while dragging, and category preview lists auto-scroll when the dragged note is held near the top or bottom edge.
- 2026-05-23: Fixed scrolling for long notes inside expanded nested subcategories on workspace category cards. Workspace preview notes now use a non-pressable outer layout so the inner note text scroller can receive vertical drag gestures reliably while action buttons and drag sorting remain interactive.
