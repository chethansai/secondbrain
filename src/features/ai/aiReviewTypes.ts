import { CategoryPath } from '../../shared/types/notes';

export const SEEK_CATEGORY = 'SEEK';
export const ARCHIVE_CATEGORY = 'ARCHIVE';
export const AI_REVIEW_THRESHOLD = 8;

export type AiReviewDecisionStatus = 'pending' | 'accepted' | 'rejected' | 'undone';
export type AiReviewActionType = 'move_to_existing' | 'create_action_note' | 'create_category' | 'archive';

export type AiReviewSimpleRecord = {
  simpleId: string;
  note: string;
  category: string;
};

export type AiReviewUndoSnapshot = {
  sourcePath: CategoryPath;
  sourceIndex: number;
  targetPath?: CategoryPath;
  createdCategoryPath?: CategoryPath;
  generatedActionNote?: string;
  autoMoved?: boolean;
};

export type AiReviewDecision = {
  simpleId: string;
  fingerprint: string;
  note: string;
  sourcePath: CategoryPath;
  sourceIndex: number;
  targetPath: CategoryPath;
  score: number;
  reason: string;
  actionType: AiReviewActionType;
  status: AiReviewDecisionStatus;
  suggestedActionNote?: string;
  suggestedNewCategoryPath?: CategoryPath;
  autoMovedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  undoneAt?: string;
  createdAt: string;
  updatedAt: string;
  undo?: AiReviewUndoSnapshot;
};

export type AiReviewSettings = {
  autoMoveHighConfidence: boolean;
  threshold: number;
};

export type AiReviewLedger = {
  decisions: AiReviewDecision[];
  accepted: AiReviewSimpleRecord[];
  rejected: AiReviewSimpleRecord[];
  settings: AiReviewSettings;
  version: number;
  updatedAt: string;
};

export type AiReviewSuggestion = {
  score: number;
  reason: string;
  targetPath: CategoryPath;
  actionType: AiReviewActionType;
  suggestedActionNote?: string;
  suggestedNewCategoryPath?: CategoryPath;
};

export function defaultAiReviewSettings(): AiReviewSettings {
  return { autoMoveHighConfidence: false, threshold: AI_REVIEW_THRESHOLD };
}

export function defaultAiReviewLedger(): AiReviewLedger {
  return {
    decisions: [],
    accepted: [],
    rejected: [],
    settings: defaultAiReviewSettings(),
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}
