import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotesData, WorkspaceIndex, WorkspaceMeta } from '../../shared/types/notes';
import { createWorkspaceMeta, defaultWorkspaceId, NotesSnapshot, parseWorkspaceIndex, serializeWorkspaceIndex } from './notesRepository';
import { validateNotesData } from './validation';

const localNotesKey = 'rnnotetaking.notes.main';
const localWorkspaceNotesPrefix = 'rnnotetaking.notes.workspace.';
const localWorkspaceListKey = 'rnnotetaking.workspaces.list';
const legacyLocalWorkspaceIndexKey = 'rnnotetaking.workspaces.index';
const localWorkspaceSnapshotKey = 'rnnotetaking.workspace.snapshot.v1';

export type LocalWorkspaceSnapshot = {
  workspaceIndex: WorkspaceIndex;
  data: NotesData;
  cachedAt: number;
};

export async function readLocalWorkspaceSnapshot(): Promise<LocalWorkspaceSnapshot | null> {
  const startTime = Date.now();
  console.log('[PERF] readLocalWorkspaceSnapshot AsyncStorage.getItem started');
  const raw = await AsyncStorage.getItem(localWorkspaceSnapshotKey);
  const endTime = Date.now();
  console.log('[PERF] readLocalWorkspaceSnapshot AsyncStorage.getItem completed in', (endTime - startTime) + 'ms');
  if (raw) {
    const snapshot = parseLocalWorkspaceSnapshot(raw);
    if (snapshot) return snapshot;
  }

  const hasLegacyCache = Boolean(
    await AsyncStorage.getItem(localWorkspaceListKey)
    ?? await AsyncStorage.getItem(legacyLocalWorkspaceIndexKey)
    ?? await AsyncStorage.getItem(localWorkspaceNotesKey(defaultWorkspaceId))
    ?? await AsyncStorage.getItem(localNotesKey),
  );
  if (!hasLegacyCache) return null;

  const [workspaceIndex, notesSnapshot] = await Promise.all([
    readLocalWorkspaceIndex(),
    readLocalWorkspaceNotes(defaultWorkspaceId),
  ]);
  const snapshot = { workspaceIndex, data: notesSnapshot.data, cachedAt: Date.now() };
  await writeLocalWorkspaceSnapshot(workspaceIndex, notesSnapshot.data);
  return snapshot;
}

export async function writeLocalWorkspaceSnapshot(workspaceIndex: WorkspaceIndex, data: NotesData): Promise<void> {
  await AsyncStorage.setItem(localWorkspaceSnapshotKey, JSON.stringify({
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

export async function readLocalNotes(): Promise<NotesSnapshot> {
  return readLocalWorkspaceNotes(defaultWorkspaceId);
}

export async function readLocalWorkspaceNotes(workspaceId: string): Promise<NotesSnapshot> {
  const raw = await AsyncStorage.getItem(localWorkspaceNotesKey(workspaceId)) ?? (workspaceId === defaultWorkspaceId ? await AsyncStorage.getItem(localNotesKey) : null);
  if (!raw) return { data: {} };

  const parsed = JSON.parse(raw) as { data?: unknown };
  const validation = validateNotesData(parsed.data ?? {});
  if (!validation.ok) return { data: {} };

  return { data: validation.data };
}

export async function writeLocalNotes(data: NotesData): Promise<void> {
  await writeLocalWorkspaceNotes(defaultWorkspaceId, data);
}

export async function writeLocalWorkspaceNotes(workspaceId: string, data: NotesData): Promise<void> {
  await AsyncStorage.setItem(localWorkspaceNotesKey(workspaceId), JSON.stringify({ data }));
  if (workspaceId === defaultWorkspaceId) {
    await AsyncStorage.setItem(localNotesKey, JSON.stringify({ data }));
  }
}

function localWorkspaceNotesKey(workspaceId: string) {
  const cleanId = (workspaceId.trim() || defaultWorkspaceId).replace(/[\/]/g, '_');
  return `${localWorkspaceNotesPrefix}${cleanId}`;
}

export async function readLocalWorkspaceIndex(): Promise<WorkspaceIndex> {
  const raw = await AsyncStorage.getItem(localWorkspaceListKey) ?? await AsyncStorage.getItem(legacyLocalWorkspaceIndexKey);
  if (!raw) return defaultLocalWorkspaceIndex();

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const index = parseLocalWorkspaceIndex(parsed);
    await writeLocalWorkspaceIndex(index);
    return index;
  } catch {
    return defaultLocalWorkspaceIndex();
  }
}

export async function writeLocalWorkspaceIndex(index: WorkspaceIndex): Promise<void> {
  await AsyncStorage.setItem(localWorkspaceListKey, JSON.stringify(serializeWorkspaceIndex(index)));
}

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
