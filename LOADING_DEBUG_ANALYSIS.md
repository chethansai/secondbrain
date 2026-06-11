# Loading Workspace Stuck - Root Cause Analysis
**Date:** 2026-06-11
**Status:** ROOT CAUSE IDENTIFIED - AWAITING MEASUREMENT VERIFICATION

---

## STEP 1 - LOADING STATE TRACE COMPLETE

### Loading Screen Location
**File:** `App.tsx` lines 626-628
```tsx
{loading ? (
  <View style={styles.loading}>
    <ActivityIndicator color={colors.primary} />
    <Text style={styles.loadingText}>Loading workspace</Text>
  </View>
) : null}
```

### Loading State Variable
**File:** `src/features/sync/useNotesSync.ts` line 18
```typescript
const [loading, setLoading] = useState(true);
```

### Condition Keeping Loading Visible
**App.tsx line 626:** `loading ?` renders the loading screen when `loading === true`

---

## WHERE LOADING IS SET TRUE

**useNotesSync.ts line 18:**
```typescript
const [loading, setLoading] = useState(true);  // INITIAL STATE = TRUE
```

---

## WHERE LOADING IS SET FALSE (3 LOCATIONS)

### Location 1: Local Snapshot Hydration Success
**useNotesSync.ts lines 60-65:**
```typescript
if (snapshot && !remoteNotesSettled) {
  hydratedFromSnapshot = true;
  if (!remoteWorkspaceSettled) setWorkspaceIndex(snapshot.workspaceIndex);
  setData(snapshot.data);
  setWorkspaceLoading(false);
  setLoading(false);  // ← SET FALSE HERE
  setRefreshing(true);
  setLocalMode(true);
  setError(null);
}
```

### Location 2: Remote Notes Subscription Success
**useNotesSync.ts lines 117-122:**
```typescript
(snapshot) => {
  if (cancelled) return;
  const remoteNotesTime = Date.now();
  console.log('[PERF] Remote notes data received at', remoteNotesTime, ...);
  setData(snapshot.data);
  setLoading(false);  // ← SET FALSE HERE
  setError(null);
  setLocalMode(false);
  ...
}
```

### Location 3: Remote Notes Subscription Error Fallback
**useNotesSync.ts lines 132-144:**
```typescript
async () => {
  if (cancelled) return;
  try {
    const snapshot = await readLocalWorkspaceNotes(defaultWorkspaceId);
    setData(snapshot.data);
    setLocalMode(true);
    setError(null);
    setLoading(false);  // ← SET FALSE HERE (success path)
  } catch {
    setLoading(false);  // ← SET FALSE HERE (error path)
  } finally {
    markRemoteNotesSettled();
  }
}
```

---

## WHERE WORKSPACELOADING IS SET FALSE (3 LOCATIONS)

**Location 1:** Line 64 - Local snapshot hydration
**Location 2:** Line 90 - Remote workspace index received
**Location 3:** Line 105 - Remote workspace error fallback

---

## STEP 2 - STARTUP FLOW TRACE

```
App Launch
  ↓
App.tsx renders (APP_START_TIME logged)
  ↓
AuthGate mounts (authGateStartTime logged)
  ↓
AuthGate useEffect → Promise.all([readAuthTimeoutHours(), readShouldStartUnlocked()])
  ↓
useNotesSync hook initialized (perfStartTime logged)
  ↓
useNotesSync useEffect starts (effectStartTime logged)
  ↓
bootstrapLocalSnapshot() called
  ↓
readLocalWorkspaceSnapshot() → AsyncStorage.getItem (logged duration)
  ↓
[BRANCH POINT]
  ├─ Snapshot EXISTS → hydrate state → setLoading(false) ✓
  └─ Snapshot MISSING → DO NOTHING (loading stays TRUE)
         ↓
subscribeToWorkspaceIndex() registered (Firestore listener)
  ↓
subscribeToWorkspaceNotes() registered (Firestore listener)
  ↓
[WAITING FOR FIRESTORE]
  ├─ Firestore reachable → onSnapshot fires → setLoading(false) ✓
  └─ Firestore unreachable/offline/permission denied → NEVER SETS LOADING FALSE ✗
```

---

## STEP 3 - INFINITE LOOP SEARCH

**Search Pattern:** `useEffect` depending on `data`, `workspace`, `loading`

**Result:** No obvious infinite loops found in current code.

**Potential Risk:**
- `useEffect` at App.tsx line 149 depends on `[aiReviewLoading, aiReviewLedger, automationCommand, commit, data, loading, ...]`
- This effect only runs when `automationCommand` changes, not on every data change
- No continuous re-runs detected

---

## STEP 4 - FIRESTORE AUDIT

### Listener Registration
**notesRepository.ts line 20-39:** `subscribeToWorkspaceNotes()`
```typescript
export function subscribeToWorkspaceNotes(workspaceId, onChange, onError): Unsubscribe {
  return onSnapshot(
    legacyNotesRef,
    (snapshot) => { /* success handler */ },
    (error) => onError(error.message),  // ← ERROR HANDLER EXISTS
  );
}
```

**Issue Identified:**
- Error handler calls `onError(message)` but `onError` in useNotesSync.ts (lines 112-125) does NOT call `setLoading(false)`
- Only the success callback and the fallback async function set loading=false

### Duplicate Listener Check
- Single `useEffect` with `[]` dependency (line 31)
- Two listeners registered once: `subscribeToWorkspaceIndex` + `subscribeToWorkspaceNotes`
- Cleanup properly unsubscribes on unmount (lines 148-152)
- **No duplicate listeners detected**

### Startup Deadlock Check
**Potential Deadlock Scenario:**
1. No local snapshot exists (first run, or cache cleared)
2. Firestore is unreachable (offline, network blocked, permission denied)
3. `bootstrapLocalSnapshot()` completes without setting loading=false (line 73 catches all errors)
4. Remote listeners registered but never fire (or fire error callbacks that don't set loading=false)
5. **Result: `loading` stays `true` forever → stuck on "Loading workspace"**

### Await Chain Analysis
- `bootstrapLocalSnapshot()` is NOT awaited before registering listeners (line 78)
- Listeners registered immediately after calling bootstrap (non-blocking)
- **No blocking await chains in render path**

---

## STEP 5 - WORKSPACE AUDIT

**Category Tree Generation:**
- Memoized in App.tsx: `useMemo(() => listAllCategories(data), [data])` (line 115)
- `listChildCategories`, `detailCategories`, `expandableDetailKeys` all memoized

**Workspace Filtering:**
- `filteredTeleprompterNotes` memoized (line 121-128)
- `notes` memoized (line 129)

**Expensive Operations:**
- `flattenNotes(data)` called inside `filteredTeleprompterNotes` memo (could be expensive for large datasets)
- No virtualization on category/note lists (potential performance issue, not loading blocker)

---

## STEP 6 - ROOT CAUSE CONFIRMED

### Primary Root Cause: Missing Error Path for Loading State

**File:** `src/features/sync/useNotesSync.ts` lines 112-125

**Current Code:**
```typescript
async () => {
  if (cancelled) return;
  try {
    const snapshot = await readLocalWorkspaceNotes(defaultWorkspaceId);
    setData(snapshot.data);
    setLocalMode(true);
    setError(null);
    setLoading(false);  // ← Only on SUCCESS
  } catch {
    setLoading(false);  // ← Only catches readLocalWorkspaceNotes errors
  } finally {
    markRemoteNotesSettled();
  }
}
```

**Problem:**
This is the **error fallback** for `subscribeToWorkspaceNotes`. It only runs if the initial Firestore snapshot fails.

**However**, the PRIMARY error path is:
```typescript
subscribeToWorkspaceNotes(
  defaultWorkspaceId,
  (snapshot) => { /* success */ },
  async () => { /* error fallback - this one */ }
)
```

If Firestore permission is denied OR network is completely blocked, the `onError` callback fires, which calls this fallback.

**BUT** if Firestore simply never responds (no network, no error, just silent timeout), neither success nor error callbacks fire.

---

## STEP 7 - FIX STRATEGY

### Required Changes:

1. **Add timeout to bootstrap** - If no snapshot + no remote response within N seconds, show offline state instead of infinite loading

2. **Ensure error callbacks set loading=false** - Verify all `onError` paths call `setLoading(false)`

3. **Render workspace shell immediately** - Show empty workspace UI, load data in background, show loading indicator as overlay not blocking screen

4. **Add explicit "offline mode" state** - When localMode=true and no remote connection, allow user to use cached data

---

## MEASUREMENT REQUIRED

**To confirm this diagnosis, run the app and capture console output:**

Look for these log sequences:

**SUCCESSFUL STARTUP (with cache):**
```
[PERF] App module loaded at XXX
[PERF] App component render at XXX (+5ms)
[PERF] AuthGate component mount at XXX
[PERF] Auth session reads completed in 45ms
[PERF] useNotesSync hook initialized at XXX
[PERF] useNotesSync useEffect started at XXX
[PERF] bootstrapLocalSnapshot started at XXX
[PERF] readLocalWorkspaceSnapshot AsyncStorage.getItem completed in 120ms
[PERF] Local snapshot hydration completed at XXX (+150ms from snapshot start)
[PERF] Remote workspace index received at XXX (+XXXms from effect start)
[PERF] Remote notes data received at XXX (+XXXms from effect start)
```

**STUCK SCENARIO (no cache, Firestore blocked):**
```
[PERF] App module loaded at XXX
[PERF] App component render at XXX
[PERF] AuthGate component mount at XXX
[PERF] Auth session reads completed in 45ms
[PERF] useNotesSync hook initialized at XXX
[PERF] useNotesSync useEffect started at XXX
[PERF] bootstrapLocalSnapshot started at XXX
[PERF] readLocalWorkspaceSnapshot AsyncStorage.getItem completed in 50ms
// ← NO "Local snapshot hydration completed" log (snapshot was null/empty)
// ← NO "Remote workspace/notes received" logs (Firestore unreachable)
// ← App stuck on "Loading workspace" forever
```

---

## NEXT STEPS

1. Run app and capture console logs
2. Share the `[PERF]` output
3. Confirm stuck scenario or identify different root cause
4. Implement fix based on actual measurement data

**Do not implement fix until measurement confirms the hypothesis.**