import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotesData, WorkspaceIndex, WorkspaceMeta } from '../../shared/types/notes';
import { createWorkspaceMeta, defaultWorkspaceId, NotesSnapshot, parseWorkspaceIndex, serializeWorkspaceIndex } from './notesRepository';
import { validateNotesData } from './validation';

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Returns a key prefix that scopes cache entries to a specific user.
 * When uid is absent we fall back to an anonymous prefix so unauthenticated
 * reads/writes still work (e.g. during the brief window before Firebase
 * resolves the auth state).
 */
function userPrefix(uid: string | null | undefined): string {
  return uid ? `rnnotetaking.u.${uid}` : 'rnnotetaking.anon';
}

function snapshotKey(uid: string | null | undefined): string {
  return `${userPrefix(uid)}.workspace.snapshot.v1`;
}

function workspaceListKey(uid: string | null | undefined): string {
  return `${userPrefix(uid)}.workspaces.list`;
}

function legacyWorkspaceIndexKey(uid: string | null | undefined): string {
  return `${userPrefix(uid)}.workspaces.index`;
}

function workspaceNotesKey(uid: string | null | undefined, workspaceId: string): string {
  const cleanId = (workspaceId.trim() || defaultWorkspaceId).replace(/[\/]/g, '_');
  return `${userPrefix(uid)}.notes.workspace.${cleanId}`;
}

function legacyNotesKey(uid: string | null | undefined): string {
  return `${userPrefix(uid)}.notes.main`;
}

// ---------------------------------------------------------------------------
// Legacy (anonymous/unscoped) key constants — kept for migration reads only
// ---------------------------------------------------------------------------
const LEGACY_ANON_SNAPSHOT_KEY = 'rnnotetaking.workspace.snapshot.v1';
const LEGACY_ANON_WORKSPACE_LIST_KEY = 'rnnotetaking.workspaces.list';
const LEGACY_ANON_WORKSPACE_INDEX_KEY = 'rnnotetaking.workspaces.index';
const LEGACY_ANON_NOTES_KEY = 'rnnotetaking.notes.main';

function legacyAnonWorkspaceNotesKey(workspaceId: string): string {
  const cleanId = (workspaceId.trim() || defaultWorkspaceId).replace(/[\/]/g, '_');
  return `rnnotetaking.notes.workspace.${cleanId}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalWorkspaceSnapshot = {
  workspaceIndex: WorkspaceIndex;
  data: NotesData;
  cachedAt: number;
};

// ---------------------------------------------------------------------------
// Snapshot (combined notes + workspace index in one key — fastest cold boot)
// ---------------------------------------------------------------------------

export async function readLocalWorkspaceSnapshot(uid?: string | null): Promise<LocalWorkspaceSnapshot | null> {
  const key = snapshotKey(uid);

  // 1. Try the user-scoped key first
  const raw = await AsyncStorage.getItem(key);
  if (raw) {
    const snapshot = parseLocalWorkspaceSnapshot(raw);
    if (snapshot) return snapshot;
  }

  // 2. Migrate from old legacy (anonymous/unscoped) key if this is a returning
  //    user whose data was written before uid-scoping was introduced.
  if (uid) {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_ANON_SNAPSHOT_KEY);
    if (legacyRaw) {
      const snapshot = parseLocalWorkspaceSnapshot(legacyRaw);
      if (snapshot) {
        // Persist under the new user-scoped key and clean up the legacy key.
        await writeLocalWorkspaceSnapshot(snapshot.workspaceIndex, snapshot.data, uid);
        AsyncStorage.removeItem(LEGACY_ANON_SNAPSHOT_KEY).catch(() => undefined);
        return snapshot;
      }
    }
  }

  // 3. Try composing from individual workspace/notes keys (handles very old data).
  const hasLegacyCache = Boolean(
    await AsyncStorage.getItem(workspaceListKey(uid))
    ?? await AsyncStorage.getItem(legacyWorkspaceIndexKey(uid))
    ?? await AsyncStorage.getItem(workspaceNotesKey(uid, defaultWorkspaceId))
    ?? await AsyncStorage.getItem(legacyNotesKey(uid)),
  );
  if (!hasLegacyCache) return null;

  const [workspaceIndex, notesSnapshot] = await Promise.all([
    readLocalWorkspaceIndex(uid),
    readLocalWorkspaceNotes(defaultWorkspaceId, uid),
  ]);
  const snapshot = { workspaceIndex, data: notesSnapshot.data, cachedAt: Date.now() };
  await writeLocalWorkspaceSnapshot(workspaceIndex, notesSnapshot.data, uid);
  return snapshot;
}

export async function writeLocalWorkspaceSnapshot(workspaceIndex: WorkspaceIndex, data: NotesData, uid?: string | null): Promise<void> {
  await AsyncStorage.setItem(snapshotKey(uid), JSON.stringify({
    workspaceIndex: serializeWorkspaceIndex(workspaceIndex),
    notes: { data },
    cachedAt: Date.now(),
  }));
}

function parseLocalWorkspaceSnapshot(raw: string): LocalWorkspaceSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawWorkspaceIndex = parsed.workspaceIndex;
    const rawNotes = parsed.notes;
    if (!rawWorkspaceIndex || typeof rawWorkspaceIndex !== 'object' || Array.isArray(rawWorkspaceIndex)) return null;
    const notesRecord = rawNotes && typeof rawNotes === 'object' && !Array.isArray(rawNotes) ? rawNotes as Record<string, unknown> : {};
    const validation = validateNotesData(notesRecord.data ?? {});
    if (!validation.ok) return null;
    return {
      workspaceIndex: parseLocalWorkspaceIndex(rawWorkspaceIndex as Record<string, unknown>),
      data: validation.data,
      cachedAt: typeof parsed.cachedAt === 'number' ? parsed.cachedAt : 0,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function readLocalNotes(uid?: string | null): Promise<NotesSnapshot> {
  return readLocalWorkspaceNotes(defaultWorkspaceId, uid);
}

export async function readLocalWorkspaceNotes(workspaceId: string, uid?: string | null): Promise<NotesSnapshot> {
  const scopedKey = workspaceNotesKey(uid, workspaceId);
  let raw = await AsyncStorage.getItem(scopedKey);

  // Migrate from anonymous key if present and this is a signed-in user
  if (!raw && uid) {
    const legacyKey = legacyAnonWorkspaceNotesKey(workspaceId);
    const legacyRaw = await AsyncStorage.getItem(legacyKey);
    if (!legacyRaw && workspaceId === defaultWorkspaceId) {
      raw = await AsyncStorage.getItem(LEGACY_ANON_NOTES_KEY);
    } else {
      raw = legacyRaw;
    }
    if (raw) {
      // Re-persist under user-scoped key, then clean up anonymous key
      await AsyncStorage.setItem(scopedKey, raw);
      AsyncStorage.removeItem(legacyKey).catch(() => undefined);
    }
  }

  if (!raw) return { data: {} };

  const parsed = JSON.parse(raw) as { data?: unknown };
  const validation = validateNotesData(parsed.data ?? {});
  if (!validation.ok) return { data: {} };
  return { data: validation.data };
}

export async function writeLocalNotes(data: NotesData, uid?: string | null): Promise<void> {
  await writeLocalWorkspaceNotes(defaultWorkspaceId, data, uid);
}

export async function writeLocalWorkspaceNotes(workspaceId: string, data: NotesData, uid?: string | null): Promise<void> {
  await AsyncStorage.setItem(workspaceNotesKey(uid, workspaceId), JSON.stringify({ data }));
}

// ---------------------------------------------------------------------------
// Workspace index
// ---------------------------------------------------------------------------

export async function readLocalWorkspaceIndex(uid?: string | null): Promise<WorkspaceIndex> {
  const raw = await AsyncStorage.getItem(workspaceListKey(uid))
    ?? await AsyncStorage.getItem(legacyWorkspaceIndexKey(uid));

  // Migrate from anonymous key if uid is present
  if (!raw && uid) {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_ANON_WORKSPACE_LIST_KEY)
      ?? await AsyncStorage.getItem(LEGACY_ANON_WORKSPACE_INDEX_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as Record<string, unknown>;
        const index = parseLocalWorkspaceIndex(parsed);
        await writeLocalWorkspaceIndex(index, uid);
        AsyncStorage.multiRemove([LEGACY_ANON_WORKSPACE_LIST_KEY, LEGACY_ANON_WORKSPACE_INDEX_KEY]).catch(() => undefined);
        return index;
      } catch {
        return defaultLocalWorkspaceIndex();
      }
    }
  }

  if (!raw) return defaultLocalWorkspaceIndex();

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const index = parseLocalWorkspaceIndex(parsed);
    await writeLocalWorkspaceIndex(index, uid);
    return index;
  } catch {
    return defaultLocalWorkspaceIndex();
  }
}

export async function writeLocalWorkspaceIndex(index: WorkspaceIndex, uid?: string | null): Promise<void> {
  await AsyncStorage.setItem(workspaceListKey(uid), JSON.stringify(serializeWorkspaceIndex(index)));
}

// ---------------------------------------------------------------------------
// Cache clearing
// ---------------------------------------------------------------------------

/**
 * Removes all local repository keys for a specific user.
 * If `uid` is omitted, removes ALL app keys (used for full wipe / dev reset).
 */
export async function clearAllLocalRepositories(uid?: string | null): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    let keysToRemove: string[];
    if (uid) {
      // Remove only this user's scoped keys
      const prefix = userPrefix(uid);
      keysToRemove = allKeys.filter((key) => key.startsWith(prefix));
    } else {
      // Full wipe: remove all app keys (all users + anonymous)
      keysToRemove = allKeys.filter((key) => key.startsWith('rnnotetaking.'));
    }
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (error) {
    console.error('[CACHE CLEAR] Error clearing AsyncStorage:', error);
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function parseLocalWorkspaceIndex(parsed: Record<string, unknown>): WorkspaceIndex {
  if (Array.isArray(parsed.workspaces)) {
    return parseLegacyWorkspaceIndex(parsed as Partial<WorkspaceIndex>);
  }
  return parseWorkspaceIndex(parsed);
}

function parseLegacyWorkspaceIndex(parsed: Partial<WorkspaceIndex>): WorkspaceIndex {
  const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces.flatMap((item): WorkspaceMeta[] => {
    if (!item || typeof item !== 'object') return [];
    const workspace = item as Partial<WorkspaceMeta>;
    const name = typeof workspace.name === 'string' && workspace.name.trim() ? workspace.name.trim() : typeof workspace.id === 'string' && workspace.id.trim() ? workspace.id.trim() : '';
    if (!name) return [];
    return [{
      id: name,
      name,
      selectedCategoryPaths: Array.isArray(workspace.selectedCategoryPaths) ? workspace.selectedCategoryPaths : [],
      pinnedCategoryPaths: Array.isArray(workspace.pinnedCategoryPaths) ? workspace.pinnedCategoryPaths : [],
      pinnedNotes: Array.isArray(workspace.pinnedNotes) ? workspace.pinnedNotes : [],
      teleprompterEnabled: typeof workspace.teleprompterEnabled === 'boolean' ? workspace.teleprompterEnabled : true,
      teleprompterCategories: Array.isArray(workspace.teleprompterCategories) ? workspace.teleprompterCategories : [],
    }];
  }) : [];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === parsed.activeWorkspaceId || workspace.name === parsed.activeWorkspaceId) ?? workspaces[0];
  const defaultWorkspace = workspaces.find((workspace) => workspace.id === parsed.defaultWorkspaceId || workspace.name === parsed.defaultWorkspaceId) ?? activeWorkspace;
  if (!activeWorkspace) return defaultLocalWorkspaceIndex();
  return { workspaces, activeWorkspaceId: activeWorkspace.id, defaultWorkspaceId: defaultWorkspace.id, version: 1 };
}

function defaultLocalWorkspaceIndex(): WorkspaceIndex {
  const workspace = createWorkspaceMeta(defaultWorkspaceId, defaultWorkspaceId, [], [], [], true, []);
  return { workspaces: [workspace], activeWorkspaceId: workspace.id, defaultWorkspaceId: workspace.id, version: 1 };
}
