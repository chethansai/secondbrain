import { CategoryPath, NotesData } from '../../shared/types/notes';

export type AiProviderConfig = {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  token: string;
  enabled: boolean;
  streaming: boolean;
  timeoutMs: number;
};

export type AiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiRequest = {
  messages: AiMessage[];
  responseFormat?: 'text' | 'json';
  temperature?: number;
};

export type AiClientResult = {
  providerId: string;
  text: string;
  usage?: AiUsage;
};

export type AiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiRunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AiRunType = 'chat' | 'classify_note' | 'category_request' | 'generate_workspace';

export type AiRunRecord = {
  id: string;
  type: AiRunType;
  status: AiRunStatus;
  title: string;
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  generatedWorkspaceId?: string;
  generatedWorkspaceName?: string;
  prompt: string;
  responseText: string;
  generatedJson?: NotesData;
  error?: string;
  createdAt: string;
  completedAt?: string;
};

export type AiNotification = {
  id: string;
  runId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type AiContextScope = 'none' | 'current_category' | 'workspace';

export type AiCategoryRequest = {
  parent_path: CategoryPath;
  new_category_name: string;
  mode: 'copy' | 'move';
  reason: string;
  items: Array<{ source_path: CategoryPath; note: string }>;
};

export type AiWorkspaceResponse = {
  workspace_name: string;
  rationale: string;
  data: NotesData;
};

export type AiNoteClassification = {
  cleaned_text: string;
  type: 'action' | 'project' | 'idea' | 'reflection' | 'resource' | 'habit' | 'person' | 'finance' | 'health' | 'career' | 'content' | 'archive' | 'trash';
  area: 'health' | 'money' | 'career' | 'relationships' | 'content' | 'self' | 'home' | 'learning' | 'entertainment' | 'admin';
  project: string | null;
  tags: string[];
  next_action: string | null;
  review_priority: 'low' | 'medium' | 'high';
  reason: string;
};
