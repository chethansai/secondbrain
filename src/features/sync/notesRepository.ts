import { doc, getDoc, getDocFromServer, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { CategoryPath, NotesData, PinnedNoteRef, WorkspaceIndex, WorkspaceListDocument, WorkspaceMeta } from '../../shared/types/notes';
import { firestore } from './firebase';
import { validateNotesData } from './validation';

export type NotesSnapshot = {
  data: NotesData;
};

export const defaultWorkspaceId = 'workspace1';

export type WorkspaceSnapshot = WorkspaceIndex;

export function getUserNotesRef(uid: string) {
  return doc(firestore, 'users', uid, 'reactnativecollection', 'main');
}

export function getUserWorkspaceListRef(uid: string) {
  return doc(firestore, 'users', uid, 'reactnativecollection', 'workspaceslist');
}

export function subscribeToNotes(uid: string, onChange: (snapshot: NotesSnapshot) => void, onError: (message: string) => void): Unsubscribe {
  return subscribeToWorkspaceNotes(uid, defaultWorkspaceId, onChange, onError);
}

export function subscribeToWorkspaceNotes(uid: string, workspaceId: string, onChange: (snapshot: NotesSnapshot) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(
    getUserNotesRef(uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange({ data: {} });
        return;
      }

      const raw = snapshot.data();
      const parsed = validateNotesData(raw.data ?? {});
      if (parsed.ok === false) {
        onError(parsed.message);
        return;
      }
      onChange({ data: parsed.data });
    },
    (error) => onError(error.message),
  );
}

export async function readWorkspaceNotes(uid: string, workspaceId: string): Promise<NotesSnapshot> {
  const snapshot = await getDoc(getUserNotesRef(uid));
  return parseNotesSnapshot(snapshot.exists() ? snapshot.data() : undefined);
}

export async function readLatestWorkspaceNotes(uid: string, workspaceId: string): Promise<NotesSnapshot> {
  const snapshot = await getDocFromServer(getUserNotesRef(uid));
  return parseNotesSnapshot(snapshot.exists() ? snapshot.data() : undefined);
}

function parseNotesSnapshot(raw: Record<string, unknown> | undefined): NotesSnapshot {
  if (!raw) return { data: {} };

  const parsed = validateNotesData(raw.data ?? {});
  if (parsed.ok === false) throw new Error(parsed.message);
  return { data: parsed.data };
}

export async function readLatestWorkspaceIndex(uid: string): Promise<WorkspaceSnapshot> {
  const snapshot = await getDocFromServer(getUserWorkspaceListRef(uid));
  if (!snapshot.exists()) return defaultWorkspaceIndex();

  const parsed = parseWorkspaceIndex(snapshot.data());
  return parsed.workspaces.length ? parsed : defaultWorkspaceIndex();
}

export async function writeNotes(uid: string, data: NotesData): Promise<void> {
  await writeWorkspaceNotes(uid, defaultWorkspaceId, data);
}

export async function writeWorkspaceNotes(uid: string, workspaceId: string, data: NotesData): Promise<void> {
  await setDoc(getUserNotesRef(uid), { data }, { merge: false });
}

export async function readWorkspaceIndex(uid: string): Promise<WorkspaceSnapshot> {
  const snapshot = await getDoc(getUserWorkspaceListRef(uid));
  if (!snapshot.exists()) {
    const legacy = await getDoc(getUserNotesRef(uid));
    const index = defaultWorkspaceIndex();
    await writeWorkspaceIndex(uid, index);

    if (legacy.exists()) {
      const raw = legacy.data();
      const parsed = validateNotesData(raw.data ?? {});
      if (parsed.ok) {
        await writeWorkspaceNotes(uid, defaultWorkspaceId, parsed.data);
      }
    }

    return index;
  }

  const parsed = parseWorkspaceIndex(snapshot.data());
  if (parsed.workspaces.length === 0) {
    const index = defaultWorkspaceIndex();
    await writeWorkspaceIndex(uid, index);
    return index;
  }
  return parsed;
}

export function subscribeToWorkspaceIndex(uid: string, onChange: (snapshot: WorkspaceSnapshot) => void, onError: (message: string) => void): Unsubscribe {
  let initialized = false;
  return onSnapshot(
    getUserWorkspaceListRef(uid),
    async (snapshot) => {
      if (!snapshot.exists()) {
        if (!initialized) {
          initialized = true;
          onChange(await readWorkspaceIndex(uid));
        }
        return;
      }
      onChange(parseWorkspaceIndex(snapshot.data()));
    },
    (error) => onError(error.message),
  );
}

export async function writeWorkspaceIndex(uid: string, index: WorkspaceIndex): Promise<void> {
  await setDoc(getUserWorkspaceListRef(uid), serializeWorkspaceIndex(index), { merge: false });
}

export function createWorkspaceMeta(id: string, name: string, selectedCategoryNames: string[] = [], pinnedCategoryNames: string[] = [], pinnedNotes: PinnedNoteRef[] = [], teleprompterEnabled: boolean = true, teleprompterCategoryNames: string[] = []): WorkspaceMeta {
  return {
    id,
    name,
    selectedCategoryPaths: selectedCategoryNames.map((categoryName) => parseCategoryPath(categoryName)),
    pinnedCategoryPaths: pinnedCategoryNames.map((categoryName) => parseCategoryPath(categoryName)),
    pinnedNotes,
    teleprompterEnabled,
    teleprompterCategories: teleprompterCategoryNames,
  };
}

export function parseWorkspaceIndex(raw: Record<string, unknown>): WorkspaceIndex {
  const workspaceNames = Object.entries(raw).flatMap(([key, value]) => {
    const workspaceName = key.trim();
    if (!workspaceName || isReservedWorkspaceListKey(workspaceName) || !Array.isArray(value)) return [];
    return [workspaceName];
  });
  const defaultWorkspaceName = typeof raw.defaultworkspace === 'string' && raw.defaultworkspace.trim()
    ? raw.defaultworkspace.trim()
    : workspaceNames[0] ?? defaultWorkspaceId;
  const normalizedWorkspaceNames = workspaceNames.includes(defaultWorkspaceName)
    ? workspaceNames
    : [defaultWorkspaceName, ...workspaceNames];
  const uniqueWorkspaceNames = [...new Set(normalizedWorkspaceNames)];
  const pinnedCategoryNamesByWorkspace = parsePinnedCategoryNamesByWorkspace(raw.pinnedcategories);
  const pinnedNotesByWorkspace = parsePinnedNotesByWorkspace(raw.pinnednotes);
  const teleprompterByWorkspace = parseTeleprompterSettings(raw.teleprompter);
  const workspaces = uniqueWorkspaceNames.map((workspaceName) => createWorkspaceMeta(
    workspaceName,
    workspaceName,
    parseSelectedCategoryNames(raw[workspaceName]),
    pinnedCategoryNamesByWorkspace.get(workspaceName) ?? [],
    pinnedNotesByWorkspace.get(workspaceName) ?? [],
    teleprompterByWorkspace.get(workspaceName)?.enabled ?? true,
    teleprompterByWorkspace.get(workspaceName)?.categories ?? [],
  ));

  return {
    workspaces,
    activeWorkspaceId: defaultWorkspaceName,
    defaultWorkspaceId: defaultWorkspaceName,
    version: 1,
  };
}

export function serializeWorkspaceIndex(index: WorkspaceIndex): WorkspaceListDocument {
  const defaultWorkspace = index.workspaces.find((workspace) => workspace.id === index.defaultWorkspaceId) ?? index.workspaces.find((workspace) => workspace.id === index.activeWorkspaceId) ?? index.workspaces[0] ?? createWorkspaceMeta(defaultWorkspaceId, defaultWorkspaceId, [], [], [], true, []);
  const document: WorkspaceListDocument = { defaultworkspace: defaultWorkspace.id };
  const pinnedCategories: Record<string, string[]> = {};
  const pinnedNotes: Record<string, unknown[]> = {};
  const teleprompterSettings: Record<string, any> = {};
  for (const workspace of index.workspaces) {
    document[workspace.id] = selectedCategoryNamesFromPaths(workspace.selectedCategoryPaths);
    const pinnedNames = selectedCategoryNamesFromPaths(workspace.pinnedCategoryPaths);
    if (pinnedNames.length) pinnedCategories[workspace.id] = pinnedNames;
    if (workspace.pinnedNotes.length) pinnedNotes[workspace.id] = workspace.pinnedNotes.map(serializePinnedNoteRef);
    if (!workspace.teleprompterEnabled || workspace.teleprompterCategories.length > 0) {
      teleprompterSettings[workspace.id] = {
        enabled: workspace.teleprompterEnabled,
        categories: workspace.teleprompterCategories,
      };
    }
  }
  if (Object.keys(pinnedCategories).length) document.pinnedcategories = pinnedCategories;
  if (Object.keys(pinnedNotes).length) document.pinnednotes = pinnedNotes;
  if (Object.keys(teleprompterSettings).length) document.teleprompter = teleprompterSettings;
  if (!Array.isArray(document[defaultWorkspace.id])) {
    document[defaultWorkspace.id] = [];
  }
  return document;
}

function defaultWorkspaceIndex(): WorkspaceIndex {
  const workspace = createWorkspaceMeta(defaultWorkspaceId, defaultWorkspaceId);
  return { workspaces: [workspace], activeWorkspaceId: workspace.id, defaultWorkspaceId: workspace.id, version: 1 };
}

function isReservedWorkspaceListKey(key: string) {
  return key === 'defaultworkspace' || key === 'updatedAt' || key === 'version';
}

function parseSelectedCategoryNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function parsePinnedCategoryNamesByWorkspace(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map<string, string[]>();
  return new Map(Object.entries(value).map(([workspaceName, categoryNames]) => [workspaceName, parseSelectedCategoryNames(categoryNames)]));
}

function parsePinnedNotesByWorkspace(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map<string, PinnedNoteRef[]>();
  return new Map(Object.entries(value).map(([workspaceName, notes]) => [workspaceName, parsePinnedNoteRefs(notes)]));
}
function parseTeleprompterSettings(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map<string, {enabled: boolean; categories: string[] }>();
  return new Map(Object.entries(value).map(([workspaceName, settings]) => {
    const s = settings as any;
    return [workspaceName, {
      enabled: s?.enabled !== false,
      categories: Array.isArray(s?.categories) ? s.categories.filter((c: any) => typeof c === 'string' && c.trim().length > 0).map((c: string) => c.trim()) : [],
    }];
  }));
}
function parsePinnedNoteRefs(value: unknown): PinnedNoteRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PinnedNoteRef[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const path = Array.isArray(raw.path) ? raw.path.filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0).map((segment) => segment.trim()) : [];
    const note = typeof raw.note === 'string' ? raw.note : '';
    const index = typeof raw.index === 'number' && Number.isInteger(raw.index) && raw.index >= 0 ? raw.index : -1;
    if (!path.length || !note || index < 0) return [];
    return [{ path, note, index }];
  });
}

function serializePinnedNoteRef(ref: PinnedNoteRef) {
  return { path: ref.path, note: ref.note, index: ref.index };
}

function selectedCategoryNamesFromPaths(paths: CategoryPath[]) {
  return [...new Set(paths.flatMap((path) => {
    const cleanPath = path.map((segment) => segment.trim()).filter(Boolean);
    return cleanPath.length ? [cleanPath.join(' > ')] : [];
  }))];
}

function parseCategoryPath(value: string): CategoryPath {
  return value.split('>').map((segment) => segment.trim()).filter(Boolean);
}

