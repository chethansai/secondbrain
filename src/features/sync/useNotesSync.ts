import { useCallback, useEffect, useState } from 'react';
import { CategoryPath, NotesData, MutationResult, PinnedNoteRef, WorkspaceIndex, WorkspaceMeta } from '../../shared/types/notes';
import { readLocalWorkspaceIndex, readLocalWorkspaceNotes, readLocalWorkspaceSnapshot, writeLocalWorkspaceIndex, writeLocalWorkspaceNotes, writeLocalWorkspaceSnapshot } from './localNotesRepository';
import { createWorkspaceMeta, defaultWorkspaceId, readLatestWorkspaceIndex, readLatestWorkspaceNotes, subscribeToWorkspaceIndex, subscribeToWorkspaceNotes, writeWorkspaceIndex, writeWorkspaceNotes } from './notesRepository';
import { useAuth } from '../auth/authContext';

function defaultWorkspaceIndex(): WorkspaceIndex {
  return {
    workspaces: [createWorkspaceMeta(defaultWorkspaceId, defaultWorkspaceId)],
    activeWorkspaceId: defaultWorkspaceId,
    defaultWorkspaceId,
    version: 1,
  };
}

export function useNotesSync() {
  const { uid } = useAuth();
  const [data, setData] = useState<NotesData>({});
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndex>(() => defaultWorkspaceIndex());
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const activeWorkspaceId = workspaceIndex.activeWorkspaceId;
  const activeWorkspace = (workspaceIndex.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaceIndex.workspaces[0] ?? null) as WorkspaceMeta | null;

  // PERFORMANCE INSTRUMENTATION - Startup timing
  const perfStartTime = Date.now();
  console.log('[PERF] useNotesSync hook initialized at', perfStartTime);

  useEffect(() => {
    const effectStartTime = Date.now();
    console.log('[PERF] useNotesSync useEffect started at', effectStartTime, '(+' + (effectStartTime - perfStartTime) + 'ms from hook init)');

    let cancelled = false;
    let hydratedFromSnapshot = false;
    let remoteWorkspaceSettled = false;
    let remoteNotesSettled = false;

    function markRemoteWorkspaceSettled() {
      remoteWorkspaceSettled = true;
      if (!hydratedFromSnapshot || remoteNotesSettled) setRefreshing(false);
    }

    function markRemoteNotesSettled() {
      remoteNotesSettled = true;
      if (!hydratedFromSnapshot || remoteWorkspaceSettled) setRefreshing(false);
    }

    async function bootstrapLocalSnapshot() {
      const snapshotStartTime = Date.now();
      console.log('[PERF] bootstrapLocalSnapshot started at', snapshotStartTime, '(+' + (snapshotStartTime - effectStartTime) + 'ms from effect start)');

      try {
        const snapshot = await readLocalWorkspaceSnapshot(uid);
        const snapshotReadTime = Date.now();
        console.log('[PERF] readLocalWorkspaceSnapshot completed in', (snapshotReadTime - snapshotStartTime) + 'ms');

        if (cancelled) return;
        if (snapshot && !remoteNotesSettled) {
          hydratedFromSnapshot = true;
          if (!remoteWorkspaceSettled) setWorkspaceIndex(snapshot.workspaceIndex);
          setData(snapshot.data);
          setWorkspaceLoading(false);
          setLoading(false);
          setRefreshing(true);
          setLocalMode(true);
          setError(null);

          const snapshotHydrationTime = Date.now();
          console.log('[PERF] Local snapshot hydration completed at', snapshotHydrationTime, '(+' + (snapshotHydrationTime - snapshotStartTime) + 'ms from snapshot start)');
        }
      } catch {
        if (cancelled) return;
      }
    }

    bootstrapLocalSnapshot();

    if (!uid) {
      // Unauthenticated state behaves in offline fallback mode locally
      setLoading(false);
      setWorkspaceLoading(false);
      setLocalMode(true);
      return;
    }

    function cacheSnapshot(nextWorkspaceIndex: WorkspaceIndex, nextData: NotesData) {
      writeLocalWorkspaceSnapshot(nextWorkspaceIndex, nextData, uid).catch(() => undefined);
    }

    // SAFETY TIMEOUT - Prevents permanent "Loading workspace" blank screen (root cause fix)
    // If Firestore subscriptions never settle (no network, permission, rules, etc.), force offline mode
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) {
        console.log('[PERF] [SAFETY] Loading timeout triggered after 8s - forcing offline mode to prevent stuck screen');
        setLoading(false);
        setWorkspaceLoading(false);
        if (!localMode) setLocalMode(true);
        if (!error) setError('Started in offline mode (Firestore timeout). Check connection/firewall/rules.');
      }
    }, 8000);

    const unsubscribe = subscribeToWorkspaceIndex(
      uid,
      (snapshot) => {
        if (cancelled) return;
        const remoteWorkspaceTime = Date.now();
        console.log('[PERF] Remote workspace index received at', remoteWorkspaceTime, '(+' + (remoteWorkspaceTime - effectStartTime) + 'ms from effect start)');
        setWorkspaceIndex(snapshot);
        setWorkspaceLoading(false);
        setError(null);
        writeLocalWorkspaceIndex(snapshot, uid).catch(() => undefined);
        setData((currentData) => {
          cacheSnapshot(snapshot, currentData);
          return currentData;
        });
        setLocalMode(false);
        markRemoteWorkspaceSettled();
      },
      async () => {
        if (cancelled) return;
        try {
          const snapshot = await readLocalWorkspaceIndex(uid);
          setWorkspaceIndex(snapshot);
          setWorkspaceLoading(false);
          setLocalMode(true);
        } catch {
          setWorkspaceLoading(false);
        } finally {
          markRemoteWorkspaceSettled();
        }
      },
    );

    const unsubscribeNotes = subscribeToWorkspaceNotes(
      uid,
      defaultWorkspaceId,
      (snapshot) => {
        if (cancelled) return;
        const remoteNotesTime = Date.now();
        console.log('[PERF] Remote notes data received at', remoteNotesTime, '(+' + (remoteNotesTime - effectStartTime) + 'ms from effect start)');
        setData(snapshot.data);
        setLoading(false);
        setError(null);
        setLocalMode(false);
        writeLocalWorkspaceNotes(defaultWorkspaceId, snapshot.data, uid).catch(() => undefined);
        setWorkspaceIndex((currentIndex) => {
          cacheSnapshot(currentIndex, snapshot.data);
          return currentIndex;
        });
        markRemoteNotesSettled();
      },
      async () => {
        if (cancelled) return;
        try {
          const snapshot = await readLocalWorkspaceNotes(defaultWorkspaceId, uid);
          setData(snapshot.data);
          setLocalMode(true);
          setError(null);
          setLoading(false);
        } catch {
          setLoading(false);
        } finally {
          markRemoteNotesSettled();
        }
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(loadingTimeout);
      unsubscribe();
      unsubscribeNotes();
    };
  }, [uid]);

  const persistWorkspaceIndex = useCallback(async (index: WorkspaceIndex) => {
    setWorkspaceIndex(index);
    try {
      if (uid) {
        await writeWorkspaceIndex(uid, index);
        setLocalMode(false);
      } else {
        setLocalMode(true);
      }
      await writeLocalWorkspaceIndex(index, uid);
      await writeLocalWorkspaceSnapshot(index, data, uid);
      return true;
    } catch (error) {
      console.log('FIRESTORE ERROR CODE:', (error as any).code);
      console.log('FIRESTORE ERROR MESSAGE:', (error as any).message);
      console.log('FIRESTORE ERROR FULL:', error);
      await writeLocalWorkspaceIndex(index, uid);
      await writeLocalWorkspaceSnapshot(index, data, uid);
      setLocalMode(true);
      setError(`Could not save to Firestore: ${(error as any).code}\n${(error as any).message}`);
      return true;
    }
  }, [uid, data]);

  const commit = useCallback(
    async (result: MutationResult) => {
      if (result.ok === false) {
        setError(result.message);
        return false;
      }
      setSaving(true);
      setError(null);
      setData(result.data);
      try {
        if (uid) {
          await writeWorkspaceNotes(uid, defaultWorkspaceId, result.data);
          setLocalMode(false);
        } else {
          setLocalMode(true);
        }
        await writeLocalWorkspaceNotes(defaultWorkspaceId, result.data, uid);
        await writeLocalWorkspaceSnapshot(workspaceIndex, result.data, uid);
        return true;
      } catch (error) {
        console.log('FIRESTORE ERROR CODE:', (error as any).code);
        console.log('FIRESTORE ERROR MESSAGE:', (error as any).message);
        console.log('FIRESTORE ERROR FULL:', error);
        await writeLocalWorkspaceNotes(defaultWorkspaceId, result.data, uid);
        await writeLocalWorkspaceSnapshot(workspaceIndex, result.data, uid);
        setLocalMode(true);
        setError(`Could not add to Firestore: ${(error as any).code}\n${(error as any).message}`);
        return true;
      } finally {
        setSaving(false);
      }
    },
    [uid, workspaceIndex],
  );

  const createWorkspace = useCallback(async (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Workspace name cannot be empty.');
      return false;
    }
    if (isReservedWorkspaceName(cleanName) || workspaceIndex.workspaces.some((workspace) => workspace.id === cleanName)) {
      setError('A workspace with this name already exists or is reserved.');
      return false;
    }
    const workspace = createWorkspaceMeta(cleanName, cleanName);
    const nextIndex = {
      workspaces: [...workspaceIndex.workspaces, workspace],
      activeWorkspaceId: workspace.id,
      defaultWorkspaceId: workspaceIndex.defaultWorkspaceId,
      version: workspaceIndex.version + 1,
    };
    return persistWorkspaceIndex(nextIndex);
  }, [persistWorkspaceIndex, workspaceIndex]);

  const selectWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaceIndex.workspaces.some((workspace) => workspace.id === workspaceId)) return false;
    setWorkspaceIndex({ ...workspaceIndex, activeWorkspaceId: workspaceId });
    return true;
  }, [workspaceIndex]);

  const setDefaultWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaceIndex.workspaces.some((workspace) => workspace.id === workspaceId)) return false;
    return persistWorkspaceIndex({ ...workspaceIndex, defaultWorkspaceId: workspaceId, version: workspaceIndex.version + 1 });
  }, [persistWorkspaceIndex, workspaceIndex]);

  const renameWorkspace = useCallback(async (workspaceId: string, name: string) => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Workspace name cannot be empty.');
      return false;
    }
    if (isReservedWorkspaceName(cleanName) || workspaceIndex.workspaces.some((workspace) => workspace.id === cleanName && workspace.id !== workspaceId)) {
      setError('A workspace with this name already exists or is reserved.');
      return false;
    }
    if (cleanName === workspaceId) return true;
    const nextWorkspaces = workspaceIndex.workspaces.map((workspace) => workspace.id === workspaceId ? { ...workspace, id: cleanName, name: cleanName } : workspace);
    const nextActiveWorkspaceId = workspaceIndex.activeWorkspaceId === workspaceId ? cleanName : workspaceIndex.activeWorkspaceId;
    const nextDefaultWorkspaceId = workspaceIndex.defaultWorkspaceId === workspaceId ? cleanName : workspaceIndex.defaultWorkspaceId;
    return persistWorkspaceIndex({ ...workspaceIndex, workspaces: nextWorkspaces, activeWorkspaceId: nextActiveWorkspaceId, defaultWorkspaceId: nextDefaultWorkspaceId, version: workspaceIndex.version + 1 });
  }, [persistWorkspaceIndex, workspaceIndex]);

  const updateSelectedCategoryPaths = useCallback(async (selectedCategoryPaths: CategoryPath[]) => {
    const validSelections = selectedCategoryPaths.filter((path) => path.length > 0 && path.every((segment) => segment.trim().length > 0));
    const dedupedSelections = Array.from(new Map(validSelections.map((path) => [path.join('\u001f'), path])).values());
    const nextWorkspaces = workspaceIndex.workspaces.map((workspace) => workspace.id === activeWorkspaceId ? { ...workspace, selectedCategoryPaths: dedupedSelections } : workspace);
    return persistWorkspaceIndex({ ...workspaceIndex, workspaces: nextWorkspaces, version: workspaceIndex.version + 1 });
  }, [activeWorkspaceId, persistWorkspaceIndex, workspaceIndex]);

  const updatePinnedCategoryPaths = useCallback(async (pinnedCategoryPaths: CategoryPath[]) => {
    const validPins = pinnedCategoryPaths.filter((path) => path.length > 0 && path.every((segment) => segment.trim().length > 0));
    const dedupedPins = Array.from(new Map(validPins.map((path) => [path.join('\u001f'), path])).values());
    const nextWorkspaces = workspaceIndex.workspaces.map((workspace) => workspace.id === activeWorkspaceId ? { ...workspace, pinnedCategoryPaths: dedupedPins } : workspace);
    return persistWorkspaceIndex({ ...workspaceIndex, workspaces: nextWorkspaces, version: workspaceIndex.version + 1 });
  }, [activeWorkspaceId, persistWorkspaceIndex, workspaceIndex]);

  const updatePinnedNotes = useCallback(async (pinnedNotes: PinnedNoteRef[]) => {
    const validPins = pinnedNotes.filter((pin) => pin.path.length > 0 && pin.path.every((segment) => segment.trim().length > 0) && pin.note.length > 0 && pin.index >= 0);
    const dedupedPins = Array.from(new Map(validPins.map((pin) => [`${pin.path.join('\u001f')}\u001f${pin.index}\u001f${pin.note}`, pin])).values());
    const nextWorkspaces = workspaceIndex.workspaces.map((workspace) => workspace.id === activeWorkspaceId ? { ...workspace, pinnedNotes: dedupedPins } : workspace);
    return persistWorkspaceIndex({ ...workspaceIndex, workspaces: nextWorkspaces, version: workspaceIndex.version + 1 });
  }, [activeWorkspaceId, persistWorkspaceIndex, workspaceIndex]);

  const updateTeleprompterSettings = useCallback(async (enabled: boolean, selectedCategories: string[] = []) => {
    const validCategories = selectedCategories.filter(c => c.trim().length > 0);
    const nextWorkspaces = workspaceIndex.workspaces.map((workspace) => 
      workspace.id === activeWorkspaceId 
        ? { ...workspace, teleprompterEnabled: enabled, teleprompterCategories: validCategories } 
        : workspace
    );
    return persistWorkspaceIndex({ ...workspaceIndex, workspaces: nextWorkspaces, version: workspaceIndex.version + 1 });
  }, [activeWorkspaceId, persistWorkspaceIndex, workspaceIndex]);

  const refresh = useCallback(async () => {
    if (refreshing) return false;
    setRefreshing(true);
    setError(null);
    try {
      if (!uid) {
        setRefreshing(false);
        return false;
      }
      const [indexSnapshot, notesSnapshot] = await Promise.all([
        readLatestWorkspaceIndex(uid),
        readLatestWorkspaceNotes(uid, defaultWorkspaceId),
      ]);
      setWorkspaceIndex(indexSnapshot);
      setData(notesSnapshot.data);
      await Promise.all([
        writeLocalWorkspaceIndex(indexSnapshot, uid),
        writeLocalWorkspaceNotes(defaultWorkspaceId, notesSnapshot.data, uid),
        writeLocalWorkspaceSnapshot(indexSnapshot, notesSnapshot.data, uid),
      ]);
      setLocalMode(false);
      return true;
    } catch (refreshError) {
      setLocalMode(true);
      setError(refreshError instanceof Error ? `Could not reload recent data: ${refreshError.message}` : 'Could not reload recent data.');
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, uid]);

  return {
    data,
    workspaceIndex,
    workspaces: workspaceIndex.workspaces,
    activeWorkspace,
    activeWorkspaceId,
    defaultWorkspaceId: workspaceIndex.defaultWorkspaceId,
    loading: loading || workspaceLoading,
    saving,
    refreshing,
    error,
    setError,
    commit,
    createWorkspace,
    selectWorkspace,
    setDefaultWorkspace,
    renameWorkspace,
    updateSelectedCategoryPaths,
    updatePinnedCategoryPaths,
    updatePinnedNotes,
    updateTeleprompterSettings,
    refresh,
  };
}

function isReservedWorkspaceName(name: string) {
  return name === 'defaultworkspace' || name === 'updatedAt' || name === 'version';
}
