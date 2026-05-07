## NON-NEGOTIABLE MUST DO
After each Copilot chat implementation step, these Git commands must be run and completed for sure:

Before running the Git commands, update the `## history` section with a dated summary of the completed chat step and any redirection/decision that happened during the step.

1. `git status`
2. `git add .`
3. `git commit -m "<proper message>"`
4. `git push -u origin main`

This post-step Git workflow is mandatory and must not be skipped after any implemented change.

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
2. Each feature should own its relevant components, hooks, types, services, and helpers. Shared UI is only for truly reusable primitives such as `Button`, `Input`, `Modal`, `ListItem`, and `EmptyState`.
3. No source file should exceed 600 lines. Prefer 300-450 lines. If a file approaches 450-500 lines, split it immediately.
4. Do not create monolithic components, screens, services, or utility files. Prefer smaller files with clear names over catch-all files.
5. Keep each component focused on one responsibility. Screens should mostly compose feature components rather than contain all UI, state, and data access logic directly.
6. Keep business logic out of UI components whenever possible. Put data fetching, persistence, sync, validation, and mutation behavior in feature services or hooks.
7. Use the simplest state management that fits the app. Keep local UI state local, lift state only when necessary, and extract duplicated stateful logic into hooks.
8. Prefer TypeScript types/interfaces for app data structures, including notes data, category paths, mutation results, repository payloads, and import/export results.
9. Prefer composition over inheritance and keep props clean, minimal, and flow-specific.
10. Avoid unnecessary abstractions, but split early when a component or helper is taking on multiple responsibilities.
11. Remove dead code quickly during implementation so the new RN app stays small and easy to reason about.
12. Before adding new code, identify the feature boundary first. Extend an existing feature file only if it remains clean and below size limits; otherwise create a new feature component, hook, service, helper, or type file.

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
9. Delete from copied branch: delete only in that exact branch in v1.

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
8. Old mirrored/copied categories should become independent branches in v1.
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
2. V1 copied categories are independent duplicated branches.
3. Editing a copied branch changes only that exact branch.
4. Deleting from a copied branch changes only that exact branch.
5. Mirrored propagation is excluded from v1.
6. If mirror behavior is added later, simple `data` is insufficient; add sidecar metadata such as `mirrorLinks`.
7. Migration from old mirrored categories should not preserve hidden links unless `mirrorLinks` is explicitly designed.
8. Do not silently update all same-text notes globally.

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
26. Old copied/mirrored branches become independent.
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
- Duplicate exact notes are allowed. Edit/delete/move should use exact full-note matching with case-sensitive/case-insensitive option and keep behavior simple: first exact match or selected rendered occurrence.
- Old copied/mirrored branches are independent after migration/import.
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
4. If mirror propagation becomes essential, add explicit sidecar metadata instead of changing the simple visible JSON.
5.  The Conundrum onversation export requests such as `exportocnversation.txt` / `exportconversation.txt` are separate transcript utility tasks, not part of the React Native notes app implementation plan.

## history

- 2026-05-08: Added an AI Chat button inside the AI placeholder space. Decision: keep AI unavailable in this build, but show a visible `AI Chat` entry button inside the AI panel without restoring chat/client behavior.
- 2026-05-08: Restored shared notes data for workspace category selection after AI cleanup. Decision: workspaces again read/write the single `reactnativecollection/main` notes document while `workspaceslist` only stores selected/pinned category metadata, so the shown-categories picker can see all existing categories regardless of the active workspace.
- 2026-05-08: Removed the implemented AI feature surface and kept only an AI placeholder entry. Decision: delete the AI feature files and proxy script, remove note-level AI review actions, remove streamed chat/assistant wiring, and leave an AI button beside Search and Settings that opens a simple unavailable panel.
- 2026-05-08: Labeled the existing AI entry points as AI Chat after rebasing onto the newer AI implementation. Decision: preserve the remote streamed AI chat work and make the workspace menu/category header/tab title consistently read `AI Chat`.
- 2026-05-07: Completed the AI implementation finishing pass. Decision: make SSE streaming robust to split chunks, expose multiple AI providers for fallback configuration, mark AI notifications read when opened, reject generated AI workspaces that omit source note strings, and allow AI run/notification Firestore collections in rules.
- 2026-05-07: Hardened per-workspace notes implementation after starting implementation from the existing in-progress app state. Decision: allow the new `reactnativecollection_workspace_notes` collection in Firestore rules and preserve a workspace's note document when renaming a workspace ID, because workspace IDs now address note documents.
- 2026-05-07: Implemented AI assistant, AI workspace generation, AI category requests, note AI review, AI provider settings, run/notification history, and real per-workspace note storage. Decision: keep the existing nested JSON as the source shape, make AI-generated JSON validate through the same `NotesData` contract, retain generated outputs as separate workspaces, store full AI prompts/responses in AI run history, and keep AI writes behind deterministic app mutations or generated-workspace creation.
- 2026-05-08: Implemented a simple ChatGPT-style AI chat panel. Decision: replace the local AI insight panel with streamed responses from the provided `/v1/responses` endpoint, include the main notes document as context, persist conversations as JSON by chat id with user/assistant messages, add per-conversation delete, and keep web access supported through the local AI CORS proxy script.
- 2026-05-05: Limited the shown-categories drawer to seven visible rows. Decision: keep the existing left drawer interaction, but cap the internal category list height and show its vertical scrollbar when more categories are available.
- 2026-05-05: Implemented exact-name subcategory creation propagation. Decision: creating a subcategory now treats every case-sensitive exact-name parent category as the same logical category, adds the child relationship to all matching root/nested parent occurrences, initializes the child from any existing standalone/nested child content, and keeps note-route propagation aligned with the existing exact-name sync behavior.
- 2026-05-05: Collapsed exact-name categories in move/copy destination picker. Decision: share the case-sensitive exact-name category collapse helper across the workspace shown-categories picker and note move/copy category picker, so destination choices no longer show both a nested category and its standalone exact-name category.
- 2026-05-05: Fixed exact-character note editing across nested notes. Decision: preserve user-entered note casing/punctuation by removing forced uppercase normalization, and make edit-note replace every case-sensitive exact matching note string throughout all categories and subcategories.
- 2026-05-05: Restored category card subcategory views after exact-name collapse. Decision: keep collapsed exact-name categories only for the workspace board and shown-categories picker, while passing the full raw category tree into cards so nested subcategories still render inside their parent cards.
- 2026-05-05: Collapsed exact-name shown categories. Decision: the workspace board and shown-categories picker now treat categories with exactly matching case-sensitive names as one visible category, preferring the standalone/root category over a nested duplicate while preserving old nested selections.
- 2026-05-05: Reconciled workspace card subcategory add-note changes after the move/copy push. Decision: keep the subcategory inline add control, pass the selected category path through the board note-add callback, and add the missing styles so the workspace card remains typecheck-clean.
- 2026-05-05: Updated note actions and move/copy category selection. Decision: note option menus now show Edit, Move, Order, Delete, and Copy; Copy is only launched from the note options, and choosing a category after Move or Copy immediately performs the selected action without an extra submit button.
- 2026-05-05: Completed mandatory git handoff for the category card note options stacking fix. Decision: include the finished UI stacking change and current workspace changes in the requested `git status`, `git add .`, commit, and push workflow.
- 2026-05-05: Fixed Android category card note options stacking. Decision: open note action menus now raise their row above sibling notes and lower-half note menus open upward so the options container stays in front of the card content instead of going behind it.
- 2026-05-05: Updated the mandatory post-step workflow. Decision: after every Copilot chat implementation step and any redirection, `plan.md` history must be updated before running the required git status/add/commit/push sequence.
- 2026-05-05: Fixed workspace metadata behavior. Decision: `workspaceslist` stores selected root categories when root categories are created, renamed, deleted, or toggled; notes remain in the single `reactnativecollection/main` document, so creating/selecting/renaming workspaces no longer creates per-workspace note documents.
- 2026-05-05: Started Android Intent/deep-link automation. Decision: LlamaLab Automate should launch the installed app with `ACTION_VIEW` and a `nativenotes://add-note?...` data URI; the app queues the command while locked and saves to `SEEK` after unlock/load.

### LlamaLab Automate Intent Setup

Use Automate's activity/intent block to launch the app locally on the same Android device. This is not an HTTP POST endpoint; it is an Android deep link into the installed app.

Fill the Automate fields with:

1. Package: `com.notes.nativenotetaking`
2. Activity class: `com.notes.nativenotetaking.MainActivity`
3. Action: `android.intent.action.VIEW`
4. Data URI: `nativenotes://add-note?category=SEEK&note=Your%20note%20text`
5. MIME type: leave empty
6. Categories: add both `android.intent.category.DEFAULT` and `android.intent.category.BROWSABLE`
7. Flags: optional; use `FLAG_ACTIVITY_NEW_TASK` only if Automate requires it for launching an activity from the background

For dynamic text, build the Data URI by URL-encoding the note text and putting it in the `note` query parameter. If `category=SEEK` is omitted, the app defaults to `SEEK`.

Example Data URI values:

- `nativenotes://add-note?note=Buy%20milk`
- `nativenotes://add-note?category=SEEK&note=Call%20doctor`
- `nativenotes://add-note?category=SEEK&note=Line%201%0ALine%202`

Manual ADB test command after installing a build that includes the `nativenotes` scheme:

```bash
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "nativenotes://add-note?category=SEEK&note=Intent%20test" com.notes.nativenotetaking
```

Expected behavior: the app opens, shows the lock screen if locked, then after unlock and sync load it adds the note to category `SEEK` once and navigates to `SEEK`.


### 2026-05-08 - AI chat interface

Added a simple ChatGPT-style AI tab that sends the current main notes JSON as context to `https://chethan.tailb6229f.ts.net/v1/responses` using model `oca/gpt-5.4`, parses the returned `data:` SSE-style chunks, stores conversations locally in AsyncStorage as chat id plus user/assistant message JSON, and supports deleting conversations. Kept the notes Firestore document path untouched so the app still runs with local chat history when Firestore hosting/storage is unavailable.
