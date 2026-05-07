import { doc, getDocFromServer, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { AiReviewActionType, AiReviewDecision, AiReviewDecisionStatus, AiReviewLedger, AiReviewSettings, AiReviewSimpleRecord, defaultAiReviewLedger, defaultAiReviewSettings } from '../ai/aiReviewTypes';
import { CategoryPath } from '../../shared/types/notes';
import { firestore } from './firebase';

const aiReviewLedgerRef = doc(firestore, 'reactnativecollection', 'reviewledger');

export function subscribeToAiReviewLedger(onChange: (ledger: AiReviewLedger) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(
    aiReviewLedgerRef,
    (snapshot) => onChange(snapshot.exists() ? parseAiReviewLedger(snapshot.data()) : defaultAiReviewLedger()),
    (error) => onError(error.message),
  );
}

export async function readLatestAiReviewLedger(): Promise<AiReviewLedger> {
  const snapshot = await getDocFromServer(aiReviewLedgerRef);
  return snapshot.exists() ? parseAiReviewLedger(snapshot.data()) : defaultAiReviewLedger();
}

export async function writeAiReviewLedger(ledger: AiReviewLedger): Promise<void> {
  await setDoc(aiReviewLedgerRef, removeUndefinedFields(ledger), { merge: false });
}

function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(removeUndefinedFields) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, removeUndefinedFields(item)]),
  ) as T;
}

export function parseAiReviewLedger(raw: Record<string, unknown>): AiReviewLedger {
  const fallback = defaultAiReviewLedger();
  return {
    decisions: Array.isArray(raw.decisions) ? raw.decisions.flatMap(parseDecision) : [],
    accepted: Array.isArray(raw.accepted) ? raw.accepted.flatMap(parseSimpleRecord) : [],
    rejected: Array.isArray(raw.rejected) ? raw.rejected.flatMap(parseSimpleRecord) : [],
    settings: parseSettings(raw.settings),
    version: typeof raw.version === 'number' ? raw.version : fallback.version,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
  };
}

function parseDecision(value: unknown): AiReviewDecision[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = value as Partial<AiReviewDecision>;
  if (typeof raw.simpleId !== 'string' || typeof raw.fingerprint !== 'string' || typeof raw.note !== 'string') return [];
  if (!isCategoryPath(raw.sourcePath) || !isCategoryPath(raw.targetPath)) return [];
  if (typeof raw.sourceIndex !== 'number' || typeof raw.score !== 'number') return [];
  if (!isStatus(raw.status) || !isActionType(raw.actionType)) return [];
  if (typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') return [];
  return [{
    simpleId: raw.simpleId,
    fingerprint: raw.fingerprint,
    note: raw.note,
    sourcePath: raw.sourcePath,
    sourceIndex: raw.sourceIndex,
    targetPath: raw.targetPath,
    score: Math.max(1, Math.min(10, raw.score)),
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    actionType: raw.actionType,
    status: raw.status,
    suggestedActionNote: typeof raw.suggestedActionNote === 'string' ? raw.suggestedActionNote : undefined,
    suggestedNewCategoryPath: isCategoryPath(raw.suggestedNewCategoryPath) ? raw.suggestedNewCategoryPath : undefined,
    autoMovedAt: typeof raw.autoMovedAt === 'string' ? raw.autoMovedAt : undefined,
    acceptedAt: typeof raw.acceptedAt === 'string' ? raw.acceptedAt : undefined,
    rejectedAt: typeof raw.rejectedAt === 'string' ? raw.rejectedAt : undefined,
    undoneAt: typeof raw.undoneAt === 'string' ? raw.undoneAt : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    undo: raw.undo && typeof raw.undo === 'object' && !Array.isArray(raw.undo) ? raw.undo : undefined,
  }];
}

function parseSimpleRecord(value: unknown): AiReviewSimpleRecord[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = value as Partial<AiReviewSimpleRecord>;
  if (typeof raw.simpleId !== 'string' || typeof raw.note !== 'string' || typeof raw.category !== 'string') return [];
  return [{ simpleId: raw.simpleId, note: raw.note, category: raw.category }];
}

function parseSettings(value: unknown): AiReviewSettings {
  const fallback = defaultAiReviewSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const raw = value as Partial<AiReviewSettings>;
  return {
    autoMoveHighConfidence: typeof raw.autoMoveHighConfidence === 'boolean' ? raw.autoMoveHighConfidence : fallback.autoMoveHighConfidence,
    threshold: typeof raw.threshold === 'number' ? Math.max(1, Math.min(10, raw.threshold)) : fallback.threshold,
  };
}

function isStatus(value: unknown): value is AiReviewDecisionStatus {
  return value === 'pending' || value === 'accepted' || value === 'rejected' || value === 'undone';
}

function isActionType(value: unknown): value is AiReviewActionType {
  return value === 'move_to_existing' || value === 'create_action_note' || value === 'create_category' || value === 'archive';
}

function isCategoryPath(value: unknown): value is CategoryPath {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}
