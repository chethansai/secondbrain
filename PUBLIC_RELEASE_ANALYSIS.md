# Public Release Analysis & Improvement Plan for Native Note Taking App

**Date:** 2026-06-30
**Status:** Analysis Complete - Ready for Implementation
**Scope:** Transform from developer-internal tool to production-ready, open-source/public app with **BYOK (Bring Your Own Key)** for AI, proper security, and no developer-incurred costs.

## Executive Summary

The current app is a sophisticated React Native (Expo) + Firebase notes app with advanced AI review, voice, workspace, and assistant features. However, it is **not ready for public use** due to:

1. **Centralized AI Infrastructure** (incurs developer costs, not scalable).
2. **Completely Insecure Firestore** (`allow read, write: if true;`).
3. **No Real Authentication** (only local lock screen using AsyncStorage).
4. **Hardcoded Dev Endpoints & Fallbacks** (tailnet VM, ChatPTUI with dev keys).
5. **Shared Single-Document Data Model** (not multi-tenant).

**Core Recommendation: Adopt BYOK + Firebase Auth + Per-User Data.**

This eliminates developer AI costs, ensures user privacy/control, and enables public distribution (App Store, Play Store, web).

---

## 1. AI API Configuration (BYOK) - **Highest Priority**

### Current Problems
- `src/features/ai/aiReviewService.ts`: Hardcoded to private `vmi3321442.tailb6229f.ts.net` endpoint (model `oca/gpt-5.4`) with dummy auth.
- Fallback to `CHATPTUI_BASE_URL` (`http://vmi... :8787`) with hardcoded `dev-local-api-key` and complex polling logic.
- `FORCE_CHATPTUI_FALLBACK` toggle for testing.
- `src/features/assistant/assistantService.ts`: Same hardcoded tailnet endpoint.
- No user control over provider, model, or keys → developer pays for all usage.

### Required Changes
- **Remove ChatPTUI Fallback Entirely**: Delete all fallback code, constants (`CHATPTUI_*`), polling, `FORCE_CHATPTUI_FALLBACK`, and related error paths. Simplify `requestAiText()` to only use configured provider.
- **Implement User-Configurable AI Providers**:
  - Supported: OpenAI, Anthropic, Groq, Google Gemini, Azure OpenAI (or Ollama for local).
  - UI in **Settings > AI Configuration**:
    - Dropdown for Provider.
    - Secure input for API Key (use `expo-secure-store`).
    - Model selector (with defaults per provider).
    - Temperature, max tokens, custom system prompt.
    - Test connection button.
    - Usage/cost estimator and warnings ("You will be billed by the provider").
  - Store config in AsyncStorage + SecureStore. Never commit keys to git.
- **Refactor AI Service**:
  - Create `aiProviderFactory.ts` or use a library like `langchain` (if bundle size allows) or simple fetch wrappers.
  - `requestAiText(prompt: string, options?: AiOptions)` that uses user's key.
  - Example for OpenAI:
    ```ts
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userApiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });
    ```
  - Make prompts (`defaultScorePromptTemplate`, `defaultActionPromptTemplate`) provider-aware if needed (e.g. Claude prefers XML).
  - Update `AiReviewPanel.tsx`, `AiWorkspacePanel.tsx`, `assistantService.ts`, `AiChatPanel.tsx` etc. to read config from context/hook.
- **Add `useAiConfig.ts`** hook with validation, defaults, and fallback to local-only mode if no key.
- **Remove/Deprecate** all backend Python/Django AI proxying and tailnet references.

**Impact**: Zero AI cost to developer. Users control their own billing and privacy.

---

## 2. Proper Authentication Setup - **Critical Security**

### Current Problems
- `src/features/auth/`: Only implements a local "Lock Screen" with timeout (AsyncStorage based, easily bypassable).
- No Firebase Auth integration despite heavy Firebase use.
- **Firestore Rules**: `allow read, write: if true;` on all collections — **complete data exposure**. Any user (or script) can read/write everyone's notes.
- No user IDs, no ownership.
- `AuthGate.tsx` only manages local unlock state.

### Required Changes
- **Integrate Firebase Authentication** (`expo-firebase-auth` or `@react-native-firebase/auth` + Firebase JS SDK):
  - Support Email/Password, Google Sign-In, Apple Sign-In, Anonymous (with upgrade path).
  - Add Login/Signup screen as initial gate (before or integrated with LockScreen).
  - Use `onAuthStateChanged` listener.
- **Update Firestore Rules** (`firestore.rules`):
  ```rules
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if request.auth != null 
          && request.auth.uid == resource.data.userId;  // or path-based
      }
      // Specific per-user collections
      match /users/{userId}/{collection}/{doc} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```
- **Data Model Migration**:
  - Change from global `reactnativecollection/main` to `users/{uid}/notes/main` or subcollections.
  - Update all sync hooks (`useAiReviewSync`, `useAiWorkspaceSync`, noteMutations, categoryTree, etc.).
  - Add data migration script (one-time per user on first login).
  - Update `firebase.json`, indexes, and backend if used.
- **Enhance LockScreen**:
  - Add biometric auth (`expo-local-authentication`).
  - Make it secondary to Firebase Auth (app-level PIN after login).
  - Store PIN hashed in SecureStore.
- **Update `authSession.ts`** to integrate with Firebase user.

**Security Benefits**: Per-user data isolation, prevents unauthorized access, complies with GDPR/App Store requirements.

---

## 3. Infrastructure & Configuration Cleanup

- **Remove All Hardcoded Dev URLs**: Search/replace all `vmi3321442.tailb6229f.ts.net`, `CHATPTUI`, tailnet references.
- **Expo Config (`app.json`, `eas.json`)**:
  - Use Expo Constants for Firebase config.
  - Add environment-specific configs (dev/prod).
  - Configure deep links, notifications, updates properly.
- **Backend (`backend/`)**:
  - Update Django to support multi-user or convert to serverless (Vercel/Cloud Functions) for optional proxy features.
  - If keeping Django, add auth middleware and per-user Firebase rules.
  - Consider making AI optional and fully client-side.
- **Settings Panel**:
  - Expand with AI config tab, Auth settings, Data export/import, Privacy controls.
- **Privacy & Legal**:
  - Add Privacy Policy screen/link (explain AI calls go directly to user's provider).
  - Terms of Service.
  - Consent for optional analytics (Firebase Analytics).

---

## 4. Additional Improvements for Public Release

**Scalability & UX:**
- Implement pagination or lazy loading (current single-doc approach hits 1MiB Firestore limit quickly).
- Add offline-first with better sync (already partially there with mutations).
- Rate limiting and usage dashboards for AI calls.
- Comprehensive error handling and user-friendly messages ("Invalid API key", "Rate limited by OpenAI").
- Dark/light theme consistency (already good).

**Distribution:**
- EAS Build configuration for stores.
- App icons, splash screens, store listings.
- Update `README.md` with:
  - BYOK setup instructions.
  - Self-hosting guide (if applicable).
  - Open source license (MIT recommended).
- Remove internal files like `LOADING_DEBUG_ANALYSIS.md`, `DISCLOSE_ENCLOSE_PLAN.md` from production builds.

**Testing & Quality:**
- Add unit/integration tests for AI service, auth flows.
- E2E tests for critical paths.
- Cross-platform testing (iOS, Android, Web).
- Security audit (especially after rules change).

**Monetization (Optional):**
- Freemium: Basic free, premium for advanced AI features or cloud sync.
- But core value is in BYOK + local-first notes.

---

## Implementation Priority (Phased)

1. **Phase 1 (Foundation - 1-2 weeks)**: AI BYOK + Remove fallback + Config UI.
2. **Phase 2 (Security - 2 weeks)**: Firebase Auth + New rules + Data migration.
3. **Phase 3 (Cleanup & Polish)**: Refactor services, update all callers, remove dev code.
4. **Phase 4 (Release)**: Documentation, store prep, testing.

**Estimated Effort**: 4-6 weeks for a solo developer or with AI assistance.

## Files to Create/Update (High Impact)

- `src/features/settings/AiConfigPanel.tsx` (new)
- `src/features/ai/aiProvider.ts` (new - unified interface)
- `src/features/ai/aiReviewService.ts` (major refactor)
- `src/features/assistant/assistantService.ts` (update)
- `firestore.rules` (secure)
- `src/features/auth/*` (Firebase integration)
- `src/shared/hooks/useUser.ts` or context for auth.
- `PUBLIC_RELEASE_PLAN.md` (detailed tasks)
- Update `AGENTS.md`, `plan.md`, `README.md`.

**Risks**: Data migration for existing users, bundle size with multiple AI SDKs (prefer fetch over heavy SDKs), Firebase costs for auth (minimal).

This plan makes the app **self-sustaining, private, and production-grade**. Users configure their own AI keys — no more unnecessary developer costs. The ChatGPT UI fallback is eliminated. Real auth protects user data.

**Next Step**: Confirm priorities and begin implementation with `runSubagent` for specific phases or direct edits.

---
*Generated from workspace analysis of AI services, auth, Firebase config, and feature reports.*
