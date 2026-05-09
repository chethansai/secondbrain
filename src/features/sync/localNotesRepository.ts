import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotesData, WorkspaceIndex, WorkspaceMeta } from '../../shared/types/notes';
import { createWorkspaceMeta, defaultWorkspaceId, NotesSnapshot, parseWorkspaceIndex, serializeWorkspaceIndex } from './notesRepository';
import { validateNotesData } from './validation';

const localNotesKey = 'rnnotetaking.notes.main';
const localWorkspaceNotesPrefix = 'rnnotetaking.notes.workspace.';
const localWorkspaceListKey = 'rnnotetaking.workspaces.list';
const legacyLocalWorkspaceIndexKey = 'rnnotetaking.workspaces.index';

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
    }];
  }) : [];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === parsed.activeWorkspaceId || workspace.name === parsed.activeWorkspaceId) ?? workspaces[0];
  const defaultWorkspace = workspaces.find((workspace) => workspace.id === parsed.defaultWorkspaceId || workspace.name === parsed.defaultWorkspaceId) ?? activeWorkspace;
  if (!activeWorkspace) return defaultLocalWorkspaceIndex();
  return { workspaces, activeWorkspaceId: activeWorkspace.id, defaultWorkspaceId: defaultWorkspace.id, version: 1 };
}

function defaultLocalWorkspaceIndex(): WorkspaceIndex {
  const workspace = createWorkspaceMeta(defaultWorkspaceId, defaultWorkspaceId);
  return { workspaces: [workspace], activeWorkspaceId: workspace.id, defaultWorkspaceId: workspace.id, version: 1 };
}
