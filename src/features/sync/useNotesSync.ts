import { useCallback, useEffect, useState } from 'react';
import { CategoryPath, NotesData, MutationResult, WorkspaceIndex } from '../../shared/types/notes';
import { readLocalWorkspaceIndex, readLocalWorkspaceNotes, writeLocalWorkspaceIndex, writeLocalWorkspaceNotes } from './localNotesRepository';
import { createWorkspaceMeta, defaultWorkspaceId, readLatestWorkspaceIndex, readLatestWorkspaceNotes, readWorkspaceIndex, readWorkspaceNotes, subscribeToWorkspaceIndex, subscribeToWorkspaceNotes, writeWorkspaceIndex, writeWorkspaceNotes } from './notesRepository';

export function useNotesSync() {
  const [data, setData] = useState<NotesData>({});
  const [version, setVersion] = useState(1);
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndex>({
    workspaces: [createWorkspaceMeta(defaultWorkspaceId, defaultWorkspaceId)],
    activeWorkspaceId: defaultWorkspaceId,
    defaultWorkspaceId,
    version: 1,
  });
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const activeWorkspaceId = workspaceIndex.activeWorkspaceId;
  const activeWorkspace = workspaceIndex.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaceIndex.workspaces[0] ?? null;

  useEffect(() => {
    const unsubscribe = subscribeToWorkspaceIndex(
      (snapshot) => {
        setWorkspaceIndex(snapshot);
        setWorkspaceLoading(false);
        setError(null);
        writeLocalWorkspaceIndex(snapshot).catch(() => undefined);
      },
      async () => {
        const snapshot = await readLocalWorkspaceIndex();
        setWorkspaceIndex(snapshot);
        setWorkspaceLoading(false);
        setLocalMode(true);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToWorkspaceNotes(
      activeWorkspaceId,
      (snapshot) => {
        setData(snapshot.data);
        setVersion(snapshot.version);
        setLoading(false);
        setError(null);
        setLocalMode(false);
      },
      async () => {
        const snapshot = await readLocalWorkspaceNotes(activeWorkspaceId);
        setData(snapshot.data);
        setVersion(snapshot.version);
        setLocalMode(true);
        setError(null);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [activeWorkspaceId]);

  const persistWorkspaceIndex = useCallback(async (index: WorkspaceIndex) => {
    setWorkspaceIndex(index);
    try {
      await writeWorkspaceIndex(index);
      await writeLocalWorkspaceIndex(index);
      setLocalMode(false);
      return true;
    } catch {
      await writeLocalWorkspaceIndex(index);
      setLocalMode(true);
      return true;
    }
  }, []);

  const commit = useCallback(
    async (result: MutationResult) => {
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      const nextVersion = version + 1;
      setSaving(true);
      setError(null);
      setData(result.data);
      setVersion(nextVersion);
      try {
        await writeWorkspaceNotes(activeWorkspaceId, result.data, nextVersion);
        await writeLocalWorkspaceNotes(activeWorkspaceId, result.data, nextVersion);
        setLocalMode(false);
        return true;
      } catch {
        await writeLocalWorkspaceNotes(activeWorkspaceId, result.data, nextVersion);
        setLocalMode(true);
        setError(null);
        return true;
      } finally {
        setSaving(false);
      }
    },
    [activeWorkspaceId, version],
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

  const refresh = useCallback(async () => {
    if (refreshing) return false;
    setRefreshing(true);
    setError(null);
    try {
      const [indexSnapshot, notesSnapshot] = await Promise.all([
        readLatestWorkspaceIndex(),
        readLatestWorkspaceNotes(activeWorkspaceId),
      ]);
      setWorkspaceIndex(indexSnapshot);
      setData(notesSnapshot.data);
      setVersion(notesSnapshot.version);
      await Promise.all([
        writeLocalWorkspaceIndex(indexSnapshot),
        writeLocalWorkspaceNotes(activeWorkspaceId, notesSnapshot.data, notesSnapshot.version),
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
  }, [activeWorkspaceId, refreshing]);

  return {
    data,
    version,
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
    refresh,
  };
}

function isReservedWorkspaceName(name: string) {
  return name === 'defaultworkspace' || name === 'updatedAt' || name === 'version';
}
