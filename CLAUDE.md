# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` - install dependencies from `package-lock.json`.
- `npm start` - start Expo/Metro on LAN. The `prestart` script rejects Node 24+; use Node `>=20.19.4 <24`.
- `npm run android` - start Expo and open Android.
- `npm run ios` - start Expo and open iOS.
- `npm run web` - start Expo web.
- `npm run typecheck` - run TypeScript in strict mode with no emit.
- `npm run deploy:rules` - deploy Firestore rules to Firebase project `notes-55c97` using `firebase.json`.
- `npx eas build --profile development|preview|production --platform android` - build with EAS profiles from `eas.json`.

There is no test script in `package.json`; use `npm run typecheck` as the available automated validation unless tests are added.

## Mandatory project workflow from `plan.md`

After each implemented chat step, update the `## history` section in `plan.md` with a dated summary of the completed step and any redirection/decision that happened. Then run the required Git handoff sequence: `git status`, `git add .`, `git commit -m "<proper message>"`, and `git push -u origin main`. Because pushing affects shared remote state, ask the user for confirmation before the push unless they have already explicitly authorized that push in the current step.

## Plan constraints

- Keep the main notes document AI-clean: `reactnativecollection/main` has a `data` field containing only the simple nested JSON of category keys, note strings, and nested single-key category objects.
- Do not store old tree metadata in `data`: no IDs, node types, children fields, mirror metadata, category connection metadata, Instagram/OCR metadata, CSRF/Django metadata, or per-note timestamps.
- Workspace/category selection metadata belongs outside the main `data` field, currently in sidecar metadata such as `reactnativecollection/workspaceslist`.
- The app is React Native + Firebase client SDK only; do not add Django dependencies or call old Django URLs.
- Password-only auth protects the UI only. Do not treat it as Firestore security; real multi-user security would require Firebase Auth and restricted rules.
- Notes remain plain strings in v1. Duplicate exact notes are allowed.
- Note operations should use path arrays plus exact full-note text, with selected rendered occurrence/index when available. Avoid substring matching for writes.
- Internal category paths are arrays like `["Category", "Subcategory"]`; display strings using `>` must not be the source of truth for writes when an array path is available.
- Copied notes and categories are independent in v1. Do not reintroduce mirror propagation without explicit sidecar metadata.
- URLs may render clickable, but do not mutate note text for URL metadata and do not add Instagram-specific parsing/embed behavior.
- AI integration must not write directly to notes. AI suggestions should be applied through deterministic app mutations.

## Source organization rules from `plan.md`

- Use strict feature-based architecture under `src/features`; shared UI is only for reusable primitives and shared types/libs are only for genuinely cross-feature code.
- No source file may exceed 600 lines. Prefer 300-450 lines, and split files before adding behavior if they approach 450-500 lines.
- Keep business logic out of UI components where practical; persistence, sync, validation, and mutations should live in feature services/hooks/helpers.
- Before adding code, identify the owning feature boundary and extend the smallest appropriate file set.
- Remove dead code quickly and avoid catch-all components, services, or utility files.

## Architecture

This is an Expo React Native app named "Native Note Taking" with web support. `index.js` boots `App.tsx`, and `App.tsx` is the central coordinator for auth, sync, workspace/category navigation, note modals, automation imports, AI review, and settings tabs.

Source is organized by feature under `src/features` and shared primitives under `src/shared`:

- `src/shared/types/notes.ts` defines the core data shape. Notes are strings; categories are nested single-key objects inside arrays, with root categories stored as `Record<string, NoteItem[]>`. Workspace metadata stores selected/pinned category paths and pinned note refs.
- `src/features/categories/categoryTree.ts` owns category tree mutation/query logic. It clones data before mutations and keeps standalone root category entries synchronized with nested category copies via `syncStandaloneCategory`.
- `src/features/notes/noteMutations.ts` owns note CRUD, priority ordering, flattening, and `HISTORY` note formatting. Many UI actions append history notes through `App.tsx` before committing.
- `src/features/sync/useNotesSync.ts` is the main notes/workspace sync hook. It subscribes to Firestore through `notesRepository.ts`, writes through repository functions, and falls back to AsyncStorage via `localNotesRepository.ts` when remote reads/writes fail.
- `src/features/sync/notesRepository.ts` currently persists notes to Firestore document `reactnativecollection/main` and workspace lists to `reactnativecollection/workspaceslist`. The `workspaceId` parameter is mostly legacy/defaulted; do not assume per-workspace note documents without checking repository behavior.
- AI review lives in `src/features/ai` and `src/features/sync/useAiReviewSync.ts`. `aiReviewService.ts` builds prompts from the full notes JSON, posts to the configured `/v1/responses` endpoint, parses score/action responses, and stores decisions in the AI review ledger.
- AI workspace and scheduled AI notifications are separate sync areas under `src/features/sync/*AiWorkspace*` and `*aiNotifications*`. Background notification processing is in `aiNotificationRunner.ts` and uses Expo background task/notifications plus an Android native worker module when available.
- Automation supports the `nativenotes:` URL scheme from `app.json`. `src/features/automation/deepLinks.ts` parses `add-note` and `import-file` actions, and `fileQueue.ts` reads `seek-notes.json` from Expo document storage, defaulting imported notes to the `SEEK` category.
- Auth gating is local-only in `src/features/auth`: `AuthGate` wraps the app, `LockScreen` handles unlocking, and `authSession.ts` stores unlock timeout/session data.
- Shared design values are in `src/shared/design/tokens.ts` and provided through `ThemeProvider`; prefer these tokens/components over ad hoc colors and spacing.

## Platform and config notes

- `app.json` sets scheme `nativenotes`, Android package `com.notes.nativenotetaking`, iOS bundle id `com.notes.native`, and includes `expo-secure-store` and `expo-background-task` plugins.
- `metro.config.js` extends Expo Metro config and blocklists Android Gradle/build output folders so Metro does not scan generated native build artifacts.
- `firebase.json` hosts `dist` and configures Firestore in `asia-south1`; `firestore.rules` currently allow read/write on the app collections.
- TypeScript is strict and uses Expo's base config with bundler module resolution; included source is `App.tsx` and `src/**/*.ts(x)`.
- ADB path on this machine: `C:\Users\chethan sheshu\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
- Manual deep-link test after installing a build: `adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "nativenotes://add-note?category=SEEK&note=Intent%20test" com.notes.nativenotetaking`.
- LlamaLab Automate should launch package `com.notes.nativenotetaking`, activity `com.notes.nativenotetaking.MainActivity`, action `android.intent.action.VIEW`, categories `DEFAULT` and `BROWSABLE`, and a data URI like `nativenotes://add-note?category=SEEK&note=Your%20note%20text`.
