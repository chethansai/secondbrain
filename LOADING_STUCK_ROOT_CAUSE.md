# ROOT CAUSE ANALYSIS - "Loading workspace" Stuck Screen

## EXECUTIVE SUMMARY

**Root Cause:** The `loading` state in `useNotesSync` is initialized to `true` and only set to `false` in success paths or specific error fallbacks. When:
1. No local cache exists (first run / cache cleared)
2. Firestore is unreachable (offline / network blocked / permission denied)

The app enters an infinite loading state because NO code path calls `setLoading(false)`.

---

## EVIDENCE

### Loading State Initialization
**File:** `src/features/sync/useNotesSync.ts:18`
```typescript
const [loading, setLoading] = useState(true);  // STARTS AS TRUE
```

### Loading Screen Render Condition
**File:** `App.tsx:626-628`
```tsx
{loading ? (
  <View style={styles.loading}>
    <ActivityIndicator />
    <Text>Loading workspace</Text>
  </View>
) : null}
```

### Three Places Where Loading Becomes False

**Path 1 - Local Snapshot Success (lines 60-65):**
```typescript
if (snapshot && !remoteNotesSettled) {
  // ...hydrate state...
  setLoading(false);  // ONLY IF SNAPSHOT EXISTS
}
```

**Path 2 - Remote Success (lines 117-122):**
```typescript
(snapshot) => {
  setData(snapshot.data);
  setLoading(false);  // ONLY IF FIRESTORE RESPONDS
}
```

**Path 3 - Remote Error Fallback (lines 132-144):**
```typescript
async () => {
  try {
    const snapshot = await readLocalWorkspaceNotes(defaultWorkspaceId);
    setLoading(false);
  } catch {
    setLoading(false);  // ONLY IF READ FAILS (not if Firestore never responds)
  }
}
```

---

## STUCK SCENARIO

```
1. App launches (no cache)
2. bootstrapLocalSnapshot() runs
3. readLocalWorkspaceSnapshot() returns null (no cache)
4. Condition `if (snapshot && !remoteNotesSettled)` is FALSE
5. setLoading(false) is NEVER CALLED
6. Listeners registered to Firestore
7. Firestore unreachable (offline/permission/network)
8. Neither success nor error callbacks fire
9. loading stays TRUE forever
10. User sees infinite "Loading workspace" spinner
```

---

## FIX IMPLEMENTED

**File:** `src/features/sync/useNotesSync.ts`

**Changes:**
1. Added 10-second timeout to bootstrap phase
2. If no local snapshot and no remote response within timeout, show empty workspace with offline indicator
3. Error callbacks now explicitly set loading=false
4. Added explicit offline mode handling

**Result:** App will never be stuck on loading screen. Worst case: shows empty workspace with "offline" indicator.