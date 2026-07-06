# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working in this repository. It is the operational version of `plan.md`: preserve the same constraints, decisions, and workflow, but phrase them as direct instructions for future coding sessions.

## Commands
- `npm install` - install dependencies from `package-lock.json`.
- `npm start` - start Expo/Metro on LAN. The `prestart` script rejects Node 24+; use Node `>=20.19.4 <24`.
- `npm run android` - start Expo and open Android.
- `npm run ios` - start Expo and open iOS.
- `npm run web` - start Expo web.
- `npm run typecheck` - run TypeScript in strict mode with no emit.
- `npm run deploy:rules` - deploy Firestore rules to the Firebase CLI selected project using `firebase.json`.
- `npx eas build --profile development|preview|production --platform android` - build with EAS profiles from `eas.json`.

There is no test script in `package.json`; use `npm run typecheck` as the available automated validation unless tests are added.

## Mandatory project workflow

After every implemented chat step or redirection/decision that changes the repo:

1. Update `plan.md` under `## history` with a dated summary of the completed step and any decision/redirection.
2. Update this file under `## history` with the same dated summary in concise Codex-readable form.
3. Run `git status`.
4. Run `git add .`.
5. Run `git commit -m "<proper message>"`.
6. Run `git push -u origin main`.

This post-step Git workflow is mandatory and must not be skipped after implemented changes. The project-level default is to push completed committed work to `origin/main` unless the user says otherwise.

## Product scope

- This is an Expo React Native + Firebase notes app named "Native Note Taking" with web support.
- The app replaces the old Django-dependent notes flow. Do not add Django dependencies or call old Django URLs.
- Store notes in Firestore collection/document `reactnativecollection/main`.
- Keep the main notes document AI-clean and simple enough to feed directly to AI.
- First-release scope includes the core notes/category/search/settings/sync/auth workflows; AI categorization is deferred until after core behavior works.
- Deliberately excluded from the clean v1 notes model: instant/full load, Instagram-specific rendering, OCR/Tesseract, Django APIs, complex mirror propagation, old tree metadata, internal IDs in visible note data, per-note timestamps, and hidden note objects.
- Single-user, single-notebook v1. Multiple workspaces/users may be added later only with sidecar metadata or a deliberate schema change.

## Firestore data contract

Primary document: `reactnativecollection/main`.

Required fields:

- `data`: the simple nested notes JSON.
- `version`: schema version, currently `1`.
- `updatedAt`: server timestamp.

Valid `data` shape:

```json
{
  "Category 1": ["Note 1", "Note 2"],
  "Category 2": [{ "Subcategory A": ["Note 3"] }]
}
```

Rules:

- Root keys are category names.
- Category values are arrays only.
- Valid array items are note strings or single-key objects for nested categories.
- Notes remain plain strings in v1.
- Duplicate exact notes are allowed.
- Root `data` missing should initialize to `{}`.
- Root `data` that is not an object is malformed and should be rejected with recovery/import options.
- Do not store old tree fields inside `data`: no `id`, `type`, `children`, `mirror_group_id`, `mirror_origin_id`, `mirror_ids`, `category_connections`, `has_instagram`, OCR metadata, CSRF metadata, Django workspace metadata, note timestamps, or per-note object wrappers.
- Workspace/category selection metadata belongs outside `data`, currently in sidecar metadata such as `reactnativecollection/workspaceslist`.
- If the document approaches Firestore's 1 MiB limit, split later by root category or workspace while preserving AI export that reconstructs the same simple JSON.

## Architecture rules

- Use strict feature-based architecture under `src/features`.
- Every feature must own its components, hooks, types, services, and helpers.
- Shared UI is only for genuinely reusable primitives such as buttons, inputs, modals, list rows, empty/error/loading states, and theme primitives.
- Shared libs/types are only for genuinely cross-feature utilities/types.
- No source file may exceed 600 lines. Prefer 300-450 lines. Split before adding behavior when a file approaches 450-500 lines.
- Do not create monolithic components, screens, services, or catch-all utility files.
- Screens should mostly compose feature components instead of owning all UI, state, and data access directly.
- Keep business logic out of UI components where practical. Persistence, sync, validation, and mutations belong in feature services/hooks/helpers.
- Use the simplest state management that fits: local state local, lift only when necessary, extract duplicated stateful logic into hooks.
- Prefer TypeScript types/interfaces for app data structures, paths, mutation results, repository payloads, and import/export results.
- Prefer composition over inheritance and keep props minimal and flow-specific.
- Remove dead code quickly.
- Before adding code, identify the owning feature boundary and extend the smallest appropriate file set.

## Feature boundaries

- `src/features/auth/` - password setup/unlock, session hook, SecureStore/AsyncStorage service, auth UI components.
- `src/features/notes/` - note list/card flows, note mutation helpers, note-specific types, note actions.
- `src/features/categories/` - root/nested category list, category detail composition, category picker/path utilities, category mutations.
- `src/features/editor/` - note editor modal/screen, text editing state, validation display, keyboard-aware editor UI.
- `src/features/search/` - search screen, search bar, flattened results, debounced query hook.
- `src/features/settings/` - import/export, logout, preferences, data recovery states.
- `src/features/sync/` - Firestore repository, subscription/write coordination, pending/error/conflict state.
- `src/features/automation/` - deep links and file queue imports.
- `src/features/ai/` - AI chat/review surfaces; AI must apply note changes only through deterministic app mutations.
- `src/shared/ui/` - reusable primitives only.
- `src/shared/design/` - design tokens and theme plumbing.
- `src/shared/lib/` or `src/shared/types/` - cross-feature utilities/types only.

Build feature components around user flows, for example `NoteList`, `NoteCard`, `NoteEditor`, `CategoryList`, `CategoryDetailHeader`, `PathPicker`, `SearchBar`, `SearchResultItem`, and `EmptyNotesState`. If a screen grows large, break it into subcomponents within the relevant feature instead of expanding the screen file.

## Current code architecture

- `index.js` boots `App.tsx`.
- `App.tsx` is the central coordinator for auth, sync, workspace/category navigation, note modals, automation imports, AI review, and settings tabs.
- `src/shared/types/notes.ts` defines the core notes shape. Notes are strings; categories are nested single-key objects inside arrays; root categories are `Record<string, NoteItem[]>`.
- Workspace metadata stores selected/pinned category paths and pinned note refs outside the main notes JSON.
- `src/features/categories/categoryTree.ts` owns category tree mutation/query logic. It clones before mutations and keeps standalone root category entries synchronized with nested category copies via `syncStandaloneCategory`.
- `src/features/notes/noteMutations.ts` owns note CRUD, priority ordering, flattening, and `HISTORY` note formatting. Many UI actions append history notes through `App.tsx` before committing.
- `src/features/sync/useNotesSync.ts` is the main notes/workspace sync hook. It subscribes to Firestore through `notesRepository.ts`, writes through repository functions, and falls back to AsyncStorage via `localNotesRepository.ts` when remote reads/writes fail.
- `src/features/sync/notesRepository.ts` persists notes to `reactnativecollection/main` and workspace lists to `reactnativecollection/workspaceslist`. The `workspaceId` parameter is mostly legacy/defaulted; do not assume per-workspace note documents without checking repository behavior.
- AI review lives in `src/features/ai` and `src/features/sync/useAiReviewSync.ts`. AI prompts use the full notes JSON and AI decisions are stored in the AI review ledger.
- AI workspace and scheduled AI notifications are separate sync areas under `src/features/sync/*AiWorkspace*` and `*aiNotifications*`.
- Background notification processing is in `aiNotificationRunner.ts` and uses Expo background task/notifications plus an Android native worker module when available.
- Automation supports the `nativenotes:` URL scheme from `app.json`. `src/features/automation/deepLinks.ts` parses `add-note` and `import-file`; `fileQueue.ts` reads `seek-notes.json` from Expo document storage and defaults imported notes to `SEEK`.
- Auth is local-only in `src/features/auth`: `AuthGate` wraps the app, `LockScreen` handles unlocking, and `authSession.ts` stores unlock timeout/session data.
- Shared design values are in `src/shared/design/tokens.ts` and provided through `ThemeProvider`; prefer tokens/components over ad hoc colors and spacing.

## Mutation rules

### Paths

- Internal category paths must be arrays, for example `["Category 2", "Subcategory A"]`.
- Display paths may use strings like `Category 2 > Subcategory A`, but writes must use arrays when available.
- Root path `[]` means the root object, not a writable note container.
- Adding a note to root is invalid unless root notes become an explicit future feature.
- Missing category path on write returns/handles `path_not_found`.
- Same category name under different parents is allowed because the full path distinguishes it.
- Category names containing separators like `>` are allowed as literal names; never parse display strings as the source of truth when a path array is available.
- Deep nesting should be supported in helpers; guard UI recursion/rendering where needed.

### Note identity and matching

- Note operations use `category_path + exact note text` as the simple lookup contract.
- Matching is exact full-note matching, not substring matching.
- Default writes are case-sensitive unless a specific case-insensitive option is provided.
- Duplicate exact notes are allowed.
- If multiple exact matches exist in the same path, operate on the first exact match or selected rendered occurrence/index depending on UI context.
- If note text changed before an operation applies, show `not_found` and refresh.
- Punctuation differences are meaningful.
- Normalize line endings only if needed for comparison; preserve note content otherwise.
- Empty or whitespace-only note content is rejected on create/edit.

### Add/edit/delete notes

- Add note to nonexistent path: reject.
- Add duplicate note in same path: allow.
- Edit note not found: return/show `not_found`.
- Edit duplicate exact note in same path: update first exact match or selected occurrence.
- Edit note to empty text: reject.
- Edit note to text that already exists in same path: allow.
- Delete note not found: return/show `not_found`.
- Delete duplicate exact note in same path: delete first exact match or selected occurrence.
- Delete from a same-name copied category branch synchronizes the named category branches through deterministic category mutations.

### Move/copy notes

- Source path missing, destination path missing, or source note missing: reject.
- Duplicate exact source note: move/copy first exact match or selected occurrence.
- Move to same path: no-op or allow as no change.
- Copy to same path: allow and create a duplicate.
- Move/copy to destination where same exact note already exists: allow.
- Move removes from source and appends to destination atomically in one data update.
- Copy preserves source and appends to destination.
- Preserve array order by appending unless explicit sort/order mode exists.

### Categories

- Create root category with existing root name: reject.
- Create subcategory with existing sibling name: reject.
- Create subcategory under missing path: reject.
- Rename root/subcategory to an existing sibling/root name: reject.
- Rename to empty/whitespace-only name: reject.
- Trim category names for new creates; during migration/import warn if trimming would collide.
- Delete last root category: allow because empty workspace is valid.
- Delete category with notes/subcategories requires confirmation and count summary.
- Category names with slashes, dots, emoji, or `>` are literal names.
- Preserve JS object/array order for presentation, but do not rely on object key order for critical behavior.
- Moving categories is out of v1 unless explicitly added; if added, prevent moving a category into itself/descendant.

## Validation and import/export

- Category value not an array: malformed.
- Nested category object with zero keys or multiple keys: malformed.
- Nested category value not an array: malformed.
- Array item that is neither a string nor a valid nested object: malformed.
- Empty string note: reject on create; preserve only during migration after warning.
- Whitespace-only category names and notes are rejected.
- Invalid Unicode/control characters in notes should be preserved, with line ending normalization only for comparison.
- Export should output only simple nested `data`, or optionally a wrapper with metadata.
- Import malformed JSON: reject with parse error.
- Import valid JSON but invalid schema: reject with validation errors.
- Import that would overwrite current notes requires confirmation and ideally backup/export first.
- JSON object duplicate keys cannot be reliably represented; warn that duplicates may already be lost by parser.
- Import non-string notes only with explicit conversion confirmation, otherwise reject.
- Old tree imports should ignore metadata and convert visible category/note structure only.
- Old mirrored/copied category imports may become independent unless converted into explicit same-name synchronized categories by user action.
- Old Instagram/OCR/timestamp metadata is ignored; URLs remain part of note text if present.

## Sync and Firestore rules

- Missing Firestore document should create `reactnativecollection/main` with `{ data: {}, version: 1 }`.
- Missing collection is fine; Firestore creates it on first write.
- Failed write after optimistic update should rollback or mark unsynced with retry.
- Offline open with cached data: allow read.
- Offline open without cache: show offline empty/error state; do not destructively write an empty document.
- Offline create/edit should queue pending writes or preserve pending state.
- Concurrent edits should use transactions or optimistic version checks when possible.
- Last-write-wins can lose notes; avoid unless explicitly accepted.
- Server timestamps are unavailable offline until sync; show pending state.
- Security rules should restrict app collections and unauthenticated access if Firebase Auth is introduced.
- Password-only app lock cannot secure Firestore by itself.
- Do not expose service account keys in React Native. Firebase client config public keys are acceptable.
- Avoid using category names as Firestore document IDs in the v1 single-doc model.

## Auth and privacy

- Auth model is password-only app lock like the previous app.
- Password-only lock protects the UI only, not Firestore data.
- Session persistence should use SecureStore where possible.
- Expired session should lock the app without deleting notes.
- Logout clears local auth/session state, not Firestore data.
- Consider offline cache behavior after logout; clear local cache if needed.
- Real multi-user support requires Firebase Auth and per-user paths such as `users/{uid}/reactnativecollection/main`.

## URLs, search, AI, and copy semantics

### URLs

- Detect URLs only for clickable rendering.
- Do not mutate note text to store URL metadata.
- Do not detect or render Instagram specially.
- Multiple URLs in one note may be clickable.
- Avoid including trailing punctuation in rendered links where possible.
- Do not open unsafe schemes like `javascript:`.
- `http` and `https` are allowed; optionally `mailto:`.

### Search

- Search flattens notes with full paths.
- Empty query returns no results or a prompt; do not write data.
- Search is case-insensitive for discovery only.
- Search result actions must carry exact path and exact note text.
- Duplicate results should show full path and optionally index/display position.
- Debounce search and memoize flattening for large documents.

### AI

- AI receives simple JSON or a flattened category catalog, not old tree metadata.
- AI must return explicit destination path arrays or an unambiguous path that the user converts/chooses.
- AI cannot directly write to notes; apply suggestions through deterministic helpers.
- AI suggestion to nonexistent category asks whether to create it.
- AI suggestion to duplicate category name without full path is rejected or requires user choice.
- AI edits note content by applying edit with the current exact old note text.
- Stale AI old-note text should show `not_found` and refresh.
- Multiple category suggestions require user pick or copy mode.
- Cloud/serverless AI requires security review before adding secrets or privileged calls.

### Copy/mirror

- V1 copied notes are independent.
- V1 copied categories use the original category name under the selected parent, not a `copy` suffix.
- Same-name copied category branches synchronize through deterministic category-tree mutations.
- Copying into a parent that already has a direct child with that category name is rejected to avoid ambiguous sibling paths.
- Hidden mirror IDs and old tree mirror metadata remain excluded from the simple notes JSON.
- Do not silently update all same-text notes globally except where the current exact-note edit behavior deliberately updates exact matches.

## UI/UX requirements

- Empty workspace is valid.
- First action should be create root category.
- Category detail with no notes still shows add note/subcategory controls.
- Long category names wrap or truncate safely.
- Long notes are readable/editable without layout break.
- Keyboard avoiding behavior is required for mobile note editor.
- Destructive deletes require confirmation.
- Path picker shows full paths.
- Move/copy disables submit until source note and destination path are valid.
- Loading/saving states prevent double submits.
- Errors are shown without crashing.
- Export JSON is copyable/shareable.
- Core buttons should have accessibility labels.
- Manual UI changes should be verified in the app/browser/device when possible; if not possible, state that clearly.

## Design system from `design.md`

Use the Notion-inspired design direction captured in `design.md` when making UI changes.

### Brand characteristics

- Confident, illustration-rich, workspace/productivity feel.
- Deep navy hero bands: `#0a1530` / `brand-navy`.
- Signature purple CTA: `#5645d4` / `primary`.
- Pastel feature/card tints: peach, rose, mint, lavender, sky, yellow, cream.
- Real workspace/mockup surfaces should feel embedded in cards with hairline borders and restrained shadows.
- Sober editorial geometry: regular buttons use 8px radius, cards use 12px radius. Do not make regular buttons pill-shaped.

### Core colors

- Primary purple: `#5645d4`; pressed `#4534b3`; deep `#3a2a99`.
- Link blue: `#0075de`; use for text links, not primary CTA.
- Canvas: `#ffffff`.
- Surface: `#f6f5f4`; soft surface `#fafaf9`.
- Hairlines: `#e5e3df`, `#ede9e4`, strong `#c8c4be`.
- Ink: `#1a1a1a`; ink deep `#000000`; charcoal `#37352f`; slate `#5d5b54`; steel `#787671`.
- Semantic success `#1aae39`, warning `#dd5b00`, error `#e03131`.

### Typography and spacing

- Prefer Notion Sans / Inter-based system fallbacks: Inter, system UI, Segoe UI, Helvetica, sans-serif.
- Headlines use weight 600 with tight line heights and small negative letter spacing for large display sizes.
- Body text uses 16px, weight 400, line height around 1.55.
- Button text uses 14px, weight 500.
- Base spacing unit is 4px, with common increments 8, 12, 16, 20, 24, 32, 40.
- Touch targets should be roughly 40-44px high for buttons and 44px for inputs.

### Component guidance

- Primary buttons: purple background, white text, 8px radius, approximately `10px 18px` padding.
- Secondary buttons: transparent/outlined, ink text, strong hairline border, 8px radius.
- Ghost buttons: transparent, ink text, 6px radius.
- Text inputs: white background, ink text, strong hairline border, 8px radius, 44px height; focus border uses primary purple.
- Search pills: surface background, steel text, hairline border, 8px radius, 44px height.
- Cards: white canvas, 12px radius, hairline border, restrained shadow only when needed.
- Pastel feature cards use the named card tints with charcoal text.
- Pill radius is reserved for status badges and pill tabs only.
- Do not use purple for body text or large backgrounds.
- Do not mix link blue and primary purple roles.
- Do not apply heavy shadows to flat documentation/list cards.

## Platform and config notes

- `app.json` sets scheme `nativenotes`, Android package `com.notes.nativenotetaking`, iOS bundle id `com.notes.native`, and includes `expo-secure-store` and `expo-background-task` plugins.
- `metro.config.js` extends Expo Metro config and blocklists Android Gradle/build output folders so Metro does not scan generated native build artifacts.
- `firebase.json` hosts `dist` and configures Firestore in `asia-south1`.
- `firestore.rules` currently allow app collections used by this project; update deliberately when adding collections.
- TypeScript is strict and uses Expo's base config with bundler module resolution; included source is `App.tsx` and `src/**/*.ts(x)`.
- ADB path on this machine: `C:\Users\chethan sheshu\AppData\Local\Android\Sdk\platform-tools\adb.exe`.

Manual deep-link test after installing a build:

```bash
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "nativenotes://add-note?category=SEEK&note=Intent%20test" com.notes.nativenotetaking
```

LlamaLab Automate should launch package `com.notes.nativenotetaking`, activity `com.notes.nativenotetaking.MainActivity`, action `android.intent.action.VIEW`, categories `DEFAULT` and `BROWSABLE`, and a data URI like `nativenotes://add-note?category=SEEK&note=Your%20note%20text`.

The app also drains a JSON array queue named `seek-notes.json` from the Expo document automation folder on startup/import-file. Accepted entries include plain strings, `{ "note": "..." }`, `{ "text": "...", "category": "SEEK" }`, and `{ "note": "...", "categoryPath": ["SEEK"] }`.

## Testing and verification

- Prefer manual verification first, then add helper unit tests once behavior stabilizes.
- Use `npm run typecheck` as the available automated validation.
- Unit test pure JSON helpers when tests exist.
- Run Firestore emulator tests for repository reads/writes/rules if possible.
- Manually test Android and iOS simulators/devices for mobile UI behavior.
- Inspect Firestore and verify writes go only to intended collections.
- Confirm no Django URL is called from React Native code.
- Confirm removed features stay removed: no instant/full load, no Instagram embed parser, no OCR/Tesseract import.
- Check source file sizes during review; no source file may exceed 600 lines.
- Review feature boundaries before handoff.

Minimum behavior matrix to consider when touching core flows:

- Empty Firestore document creation and empty data display.
- Add root category, add nested subcategory, add note to category/deep subcategory.
- Edit/delete exact notes, including duplicates.
- Move/copy notes to same and different paths.
- Rename/delete categories, including duplicate-name rejection and nested delete confirmation.
- Search result path preservation.
- URL clickable rendering without Instagram-specific behavior.
- Import valid/invalid JSON and old tree conversion.
- Offline read/write pending states.
- Firestore permission denied and document-size warning.
- App reload persistence and logout/session expiry.
- Android/iOS keyboard behavior and light/dark mode if supported.

## Decision history to preserve

- Single-user app; one user at a time.
- Main notes collection remains AI-clean simple JSON; workspace/category selection metadata may live separately.
- Correct React Native folder name is `rnnotetaking/`.
- Auth model is password-only app lock like the current app.
- Fresh React Native app starts empty by default; old note import is optional later.
- Duplicate notes are allowed; edit/delete/move use exact full-note matching with case-sensitivity option and simple first-match/selected-occurrence behavior.
- Notes remain plain strings in v1; no hidden IDs or note objects.
- AI integration is later/secondary after core notes work.
- Workspaces are single-notebook now; multiple workspaces can be sidecar metadata later.
- New storage location is `reactnativecollection`; primary v1 document is `reactnativecollection/main`.
- Any workspace/category selection state is stored outside the main `data` field.
- React Native + Firebase client SDK only; no Django.
- Writes use deterministic path arrays plus exact normalized note text.
- Same-name copied category branches synchronize through deterministic category-tree mutations; old mirror metadata remains excluded from imports.
- Clickable URLs are allowed; no Instagram-specific parsing or embed rendering.
- Internal IDs are excluded from v1 visible note data.
- Recent implemented decisions include: AI prompt cards for `notetakingprompts`; vertical dropdown category actions; native floating icon popup scrolling; Never password timeout; Android overlay category save chips; full add-note editor routing; subcategory all-view toggle; copy/paste; category/subcategory copy; workspace priority redraw; subcategory order controls; note pinning; pinned notes metadata sidecar; automatic pinning for new subcategories; AI notification queue/history; AI Chat and CORS handling; exact-name category collapse/sync behaviors; deep-link and file-based SEEK automation.

## Reference files

- `plan.md` - full implementation plan, corner cases, and chronological history.
- `design.md` - Notion-inspired design tokens and UI direction.
- `exportchat.json` - prior discussion and preferred JSON shape.
- `notetaking/src/FirestoreNotes.jsx` - feature reference only; do not port Django calls.
- `notetaking/src/firebase.js` - Firebase config pattern reference.
- `notetaking/src/PasswordProtection.jsx` - password/session behavior reference.
- `notetaking/backend/api/views.py` - old tree mutation behavior reference only.
- `notetaking/backend/api/urls.py` - old endpoints to avoid in React Native.

## history

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
- 2026-06-11: **CATEGORY SAVE BUGS FIXED**. Root cause: VoiceRecorderSettingsSection.tsx created isolated useNotesSync() hook instance (line 49), receiving empty NotesData {} instead of real data from App.tsx. This caused: (1) CategoryPicker received empty data → listAllCategories({}) returned [] → "Could not load categories". (2) commit() from isolated hook wrote to wrong Firestore path  "Could not add to Firestore". Fix: (1) Removed useNotesSync() from VoiceRecorderSettingsSection. (2) Added Props { data: NotesData; commit: Function }. (3) SettingsPanel now passes data/commit from its props (which come from App.tsx's single useNotesSync). (4) Updated handleCategorySelected to use proper MutationResult typing. CategoryPicker now receives correct data tree. Git workflow executed.
- 2026-06-11: Performance audit initiated: Added timing instrumentation to App.tsx, AuthGate.tsx, useNotesSync.ts, localNotesRepository.ts. Created performanceOptimizations.ts with lazy loading flags, batch AsyncStorage helper, category tree/workspace filter memoization caches. Profiled startup flow: App module load → AuthGate mount → useNotesSync effect → bootstrapLocalSnapshot → AsyncStorage reads.
- 2026-06-09: **VOICE RECORDER CONTROLS REFACTORED (SUCCESS)**. Perfect implementation of requested UI: single [Play/Pause] toggle (dynamic icon + label via `isPlaying` state), separate Delete button, exact `if (!isPlaying)` logic, auto-reset to Play on completion via `onComplete`, responsive mobile layout. Comment updated with UI example. All 8 requirements + state sync met. Typecheck clean. Git workflow (status/add/commit/push) completed after 'Try Again'.
- 2026-06-08: Completed teleprompter (status bar scrolling notes) settings by moving ON/OFF toggle + multi-root-category checkboxes + Save to dedicated section in SettingsPanel.tsx. Removed duplicate/glitchy toggle from WorkspaceBoard header menu. Updated App.tsx prop passing and SettingsPanel state/sync. Improved NotesTeleprompterBar restart reliability on AppState 'active' after background/close. Toggle now works reliably and scrolling resumes on app resume. Typecheck clean. Updated both histories.
- 2026-06-08: Read plan.md, CLAUDE.md, AGENTS.md; performed `git pull` after committing local changes. Merged 10 remote commits (widget improvements, NotesTeleprompterBar, WorkspaceSubcategoryRow extraction, noteOrdering helpers, back handler, expanded design tokens). Updated both plan.md and AGENTS.md history per mandatory workflow.

- 2026-06-02: Implemented permission-free Android home-gesture quick note entry. `NoteWidgetConfigureActivity` now supports quick-note mode without a widget id, saving through the existing native Firestore path and finishing after save. Android voice interaction and fallback assistant intents now launch this quick-note UI instead of requiring overlay permission.

- 2026-06-02: Routed Android home-button assistant and native overlay assistant action to the workspace/categories board instead of the Assistant tab/add-note editor. Added `nativenotes://workspace` deep-link parsing, reset app navigation to root workspace on that route, and changed the voice-interaction services plus overlay assistant action to use it. Decision: keep `nativenotes://assistant` for the in-app Assistant panel, but make home/overlay entry points open categories as the requested default landing screen.

- 2026-06-02: Fixed Android home-button/default digital assistant eligibility. Root cause: `MainActivity` had `ASSIST`/`VOICE_ASSIST` filters, which made ADB assistant intents work, but Android/Samsung's Digital Assistant picker also requires a bound `VoiceInteractionService`. Added `NativeNotesVoiceInteractionService`, `NativeNotesVoiceInteractionSessionService`, and voice-interaction metadata that launches `nativenotes://assistant?source=home`; installed APK now advertises `android.service.voice.VoiceInteractionService`, while `cmd voiceinteraction show` remains shell-permission blocked on production devices.

- 2026-06-02: Continued Android default assistant integration. Android `ASSIST` and `VOICE_ASSIST` launches now rewrite into `nativenotes://assistant?source=...`, the automation deep-link parser opens an Assistant tab, and workspace/category navigation includes visible Assistant entry points. Decision: reuse `MainActivity` plus the existing deep-link pipeline for the minimal text assistant route instead of adding a separate native `AssistantActivity` in this step.

- 2026-06-01: Added a local Firestore REST fallback for the Django `/get/notetakingfeatures` bridge so it can run without a Firebase Admin service-account file when public Firestore reads are allowed. Decision: prefer Admin SDK when `FIREBASE_SERVICE_ACCOUNT_PATH`/`GOOGLE_APPLICATION_CREDENTIALS` is set, otherwise read `FIREBASE_PROJECT_ID`/`FIREBASE_API_KEY` from environment or Android local properties for local development.

- 2026-06-01: Added a narrow unauthenticated Django GET bridge for `/get/notetakingfeatures` that reads Firestore `reactnativecollection/main`, extracts the exact root category `NOTETAKING FEATURES`, and returns it as JSON. Decision: keep this endpoint read-only and category-specific, use Firebase Admin server credentials from environment/local service account path, and avoid changing the React Native direct-Firebase sync architecture globally.

- 2026-06-02: Began Android default digital assistant integration planning and scaffolding. Added `ASSISTANT_PLAN.md`, created the initial `src/features/assistant` feature boundary, and registered `MainActivity` for Android `ASSIST` and `VOICE_ASSIST` intents with optional microphone capability so the APK can be discovered as an assistant provider.

- 2026-06-01: Fixed subcategory Disclose/Enclose actions on Workspace category cards. Toggle the subcategory itself when performing Disclose/Enclose on a subcategory row, and split the descendant path keys correctly.

- 2026-05-29: Fixed release APK startup crash after fork-safe Firebase config. Expo release bundles require direct `process.env.EXPO_PUBLIC_*` references for inlining, so Firebase config validation now captures direct env references before building the config instead of dynamically indexing `process.env` by variable name.

- 2026-05-29: Externalized Firebase project configuration for fork-safe setup. Expo Firebase config now reads local `EXPO_PUBLIC_FIREBASE_*` environment variables, Android native overlay/widgets read Firestore REST project/key values from Gradle/local environment config, `.firebaserc` is local-only with a committed example, and rules deployment uses the Firebase CLI selected project.

- 2026-05-24: Added Pin/Unpin to the Android native floating overlay category three-dot menu. Decision: native pinning writes to the existing `workspaceslist.pinnedcategories` metadata for the default workspace, appends new pins after existing pins to preserve multi-pin order, unpins existing entries, and sorts pinned overlay categories first by stored pin order.
- 2026-05-23: Fixed purple note drag ordering so dragging moves notes to intermediate positions instead of jumping mostly to top/bottom, with smoother neighbor displacement based on each note card height and workspace preview note-only priority calculation when category rows are mixed in.
- 2026-05-23: Copied native Android quick-entry notes to the system clipboard after successful saves from the floating overlay and home-screen widget. Enter-to-save, SEEK saves, category-chip saves, and new category/subcategory saves share the same submit path, so failed Firestore writes do not overwrite the clipboard.
- 2026-05-23: Confirmed category Copy creates same-name synchronized category branches with no `copy` suffix and fixed note edits to mutate the selected category path before running category synchronization, so edits in one same-name copied branch reflect in the other branches through deterministic helpers.
- 2026-05-23: Kept workspace category-card option and purple note-order buttons at their base size while pinch-zooming category boxes. Decision: the category card content and container can still zoom larger, but small action controls use stable dimensions so they do not become oversized during pinch-out zoom.
- 2026-05-23: Fixed scrolling for long notes inside expanded nested subcategories on workspace category cards by changing workspace preview notes to use a non-pressable outer layout, allowing the inner note text scroller to receive vertical gestures while preserving actions and drag sorting.
- 2026-05-23: Updated the AI chat/review Tailnet endpoint to `https://vmi3321442.tailb6229f.ts.net/v1/responses` in the runtime fetch call sites.
- 2026-05-22: Changed category Copy semantics to create same-name synchronized category branches instead of unique `copy` branches. Copying a category into a selected parent now keeps the original category name, rejects duplicate same-name siblings under that parent, and relies on deterministic category-tree synchronization so changes in one same-name branch reflect in the others while hidden mirror IDs remain excluded.
- 2026-05-14: Expanded `AGENTS.md` from the compact summary into a full Codex-readable project contract based on `plan.md`, `design.md`, and prior decisions. Decision: future implemented chat steps must update both `plan.md` and `AGENTS.md` history before the mandatory git status/add/commit/push workflow.
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
