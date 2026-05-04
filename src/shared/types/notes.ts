export type CategoryPath = string[];
export type NoteItem = string | CategoryNode;
export type CategoryNode = { [categoryName: string]: NoteItem[] };
export type NotesData = Record<string, NoteItem[]>;

export type MutationResult<T = NotesData> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export type FlatNote = {
  path: CategoryPath;
  note: string;
  index: number;
};

export type CategorySummary = {
  name: string;
  path: CategoryPath;
  noteCount: number;
  childCount: number;
};

export type WorkspaceMeta = {
  id: string;
  name: string;
  selectedCategoryPaths: CategoryPath[];
};

export type WorkspaceIndex = {
  workspaces: WorkspaceMeta[];
  activeWorkspaceId: string;
  defaultWorkspaceId: string;
  version: number;
};

export type WorkspaceListDocument = Record<string, string[] | string | unknown> & {
  defaultworkspace?: string;
};
