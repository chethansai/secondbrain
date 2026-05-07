import { doc, getDoc, getDocFromServer, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { CategoryPath, NotesData, WorkspaceIndex, WorkspaceListDocument, WorkspaceMeta } from '../../shared/types/notes';
import { firestore } from './firebase';
import { validateNotesData } from './validation';

export type NotesSnapshot = {
  data: NotesData;
};

const legacyNotesRef = doc(firestore, 'reactnativecollection', 'main');
const workspaceListRef = doc(firestore, 'reactnativecollection', 'workspaceslist');
export const defaultWorkspaceId = 'workspace1';

export type WorkspaceSnapshot = WorkspaceIndex;

export function subscribeToNotes(onChange: (snapshot: NotesSnapshot) => void, onError: (message: string) => void): Unsubscribe {
  return subscribeToWorkspaceNotes(defaultWorkspaceId, onChange, onError);
}

export function subscribeToWorkspaceNotes(workspaceId: string, onChange: (snapshot: NotesSnapshot) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(
    legacyNotesRef,
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

export async function readWorkspaceNotes(workspaceId: string): Promise<NotesSnapshot> {
  const snapshot = await getDoc(legacyNotesRef);
  return parseNotesSnapshot(snapshot.exists() ? snapshot.data() : undefined);
}

export async function readLatestWorkspaceNotes(workspaceId: string): Promise<NotesSnapshot> {
  const snapshot = await getDocFromServer(legacyNotesRef);
  return parseNotesSnapshot(snapshot.exists() ? snapshot.data() : undefined);
}

function parseNotesSnapshot(raw: Record<string, unknown> | undefined): NotesSnapshot {
  if (!raw) return { data: {} };

  const parsed = validateNotesData(raw.data ?? {});
  if (parsed.ok === false) throw new Error(parsed.message);
  return { data: parsed.data };
}

export async function readLatestWorkspaceIndex(): Promise<WorkspaceSnapshot> {
  const snapshot = await getDocFromServer(workspaceListRef);
  if (!snapshot.exists()) return defaultWorkspaceIndex();

  const parsed = parseWorkspaceIndex(snapshot.data());
  return parsed.workspaces.length ? parsed : defaultWorkspaceIndex();
}

export async function writeNotes(data: NotesData): Promise<void> {
  await writeWorkspaceNotes(defaultWorkspaceId, data);
}

export async function writeWorkspaceNotes(workspaceId: string, data: NotesData): Promise<void> {
  await setDoc(legacyNotesRef, { data }, { merge: false });
}

export async function readWorkspaceIndex(): Promise<WorkspaceSnapshot> {
  const snapshot = await getDoc(workspaceListRef);
  if (!snapshot.exists()) {
    const legacy = await getDoc(legacyNotesRef);
    const index = defaultWorkspaceIndex();
    await writeWorkspaceIndex(index);

    if (legacy.exists()) {
      const raw = legacy.data();
      const parsed = validateNotesData(raw.data ?? {});
      if (parsed.ok) {
        await writeWorkspaceNotes(defaultWorkspaceId, parsed.data);
      }
    }

    return index;
  }

  const parsed = parseWorkspaceIndex(snapshot.data());
  if (parsed.workspaces.length === 0) {
    const index = defaultWorkspaceIndex();
    await writeWorkspaceIndex(index);
    return index;
  }
  return parsed;
}

export function subscribeToWorkspaceIndex(onChange: (snapshot: WorkspaceSnapshot) => void, onError: (message: string) => void): Unsubscribe {
  let initialized = false;
  return onSnapshot(
    workspaceListRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        if (!initialized) {
          initialized = true;
          onChange(await readWorkspaceIndex());
        }
        return;
      }
      onChange(parseWorkspaceIndex(snapshot.data()));
    },
    (error) => onError(error.message),
  );
}

export async function writeWorkspaceIndex(index: WorkspaceIndex): Promise<void> {
  await setDoc(workspaceListRef, serializeWorkspaceIndex(index), { merge: false });
}

export function createWorkspaceMeta(id: string, name: string, selectedCategoryNames: string[] = [], pinnedCategoryNames: string[] = []): WorkspaceMeta {
  return {
    id,
    name,
    selectedCategoryPaths: selectedCategoryNames.map((categoryName) => parseCategoryPath(categoryName)),
    pinnedCategoryPaths: pinnedCategoryNames.map((categoryName) => parseCategoryPath(categoryName)),
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
  const workspaces = uniqueWorkspaceNames.map((workspaceName) => createWorkspaceMeta(
    workspaceName,
    workspaceName,
    parseSelectedCategoryNames(raw[workspaceName]),
    pinnedCategoryNamesByWorkspace.get(workspaceName) ?? [],
  ));

  return {
    workspaces,
    activeWorkspaceId: defaultWorkspaceName,
    defaultWorkspaceId: defaultWorkspaceName,
    version: 1,
  };
}

export function serializeWorkspaceIndex(index: WorkspaceIndex): WorkspaceListDocument {
  const defaultWorkspace = index.workspaces.find((workspace) => workspace.id === index.defaultWorkspaceId) ?? index.workspaces.find((workspace) => workspace.id === index.activeWorkspaceId) ?? index.workspaces[0] ?? createWorkspaceMeta(defaultWorkspaceId, defaultWorkspaceId);
  const document: WorkspaceListDocument = { defaultworkspace: defaultWorkspace.id };
  const pinnedCategories: Record<string, string[]> = {};
  for (const workspace of index.workspaces) {
    document[workspace.id] = selectedCategoryNamesFromPaths(workspace.selectedCategoryPaths);
    const pinnedNames = selectedCategoryNamesFromPaths(workspace.pinnedCategoryPaths);
    if (pinnedNames.length) pinnedCategories[workspace.id] = pinnedNames;
  }
  if (Object.keys(pinnedCategories).length) document.pinnedcategories = pinnedCategories;
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

function selectedCategoryNamesFromPaths(paths: CategoryPath[]) {
  return [...new Set(paths.flatMap((path) => {
    const cleanPath = path.map((segment) => segment.trim()).filter(Boolean);
    return cleanPath.length ? [cleanPath.join(' > ')] : [];
  }))];
}

function parseCategoryPath(value: string): CategoryPath {
  return value.split('>').map((segment) => segment.trim()).filter(Boolean);
}

