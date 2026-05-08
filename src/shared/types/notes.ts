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
  itemIndex?: number;
};

export type WorkspaceMeta = {
  id: string;
  name: string;
  selectedCategoryPaths: CategoryPath[];
  pinnedCategoryPaths: CategoryPath[];
};

export type WorkspaceIndex = {
  workspaces: WorkspaceMeta[];
  activeWorkspaceId: string;
  defaultWorkspaceId: string;
  version: number;
};

export type WorkspaceListDocument = Record<string, string[] | string | unknown> & {
  defaultworkspace?: string;
  pinnedcategories?: Record<string, string[]>;
};

export type AiWorkspaceDocumentMeta = {
  id: string;
  documentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type AiWorkspaceIndex = {
  documents: AiWorkspaceDocumentMeta[];
  idMap: Record<string, string>;
  activeDocumentId: string | null;
  nextNumber: number;
  version: number;
};

export type AiNotificationStatus = 'scheduled' | 'running' | 'sent' | 'failed';

export type AiNotificationJob = {
  id: string;
  title: string;
  prompt: string;
  documentId: string;
  documentName: string;
  scheduledAt: string;
  repeatEveryHours?: number;
  status: AiNotificationStatus;
  result?: string;
  error?: string;
  nativeNotificationId?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  notifiedAt?: string;
  lastRunScheduledAt?: string;
};

export type AiNotificationState = {
  jobs: AiNotificationJob[];
  version: number;
};
