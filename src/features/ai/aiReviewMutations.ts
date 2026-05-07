import { createRootCategory, createSubcategory, getCategoryItems } from '../categories/categoryTree';
import { addNote, appendHistoryNote, deleteNote, formatHistoryPath, formatHistoryTime, moveNote } from '../notes/noteMutations';
import { CategoryPath, MutationResult, NotesData } from '../../shared/types/notes';
import { AiReviewDecision, ARCHIVE_CATEGORY } from './aiReviewTypes';

export function applyAiReviewDecision(data: NotesData, decision: AiReviewDecision): MutationResult<{ data: NotesData; decision: AiReviewDecision }> {
  let nextData = data;
  let nextDecision = { ...decision };
  const targetPath = decision.actionType === 'archive' ? [ARCHIVE_CATEGORY] : decision.suggestedNewCategoryPath ?? decision.targetPath;
  const ensureResult = ensureCategoryPath(nextData, targetPath);
  if (!ensureResult.ok) return ensureResult;
  nextData = ensureResult.data;

  if (decision.actionType === 'create_action_note' || decision.actionType === 'create_category') {
    const actionText = decision.suggestedActionNote || `Review SEEK note: ${decision.note}`;
    const addResult = addNote(nextData, targetPath, actionText);
    if (!addResult.ok) return addResult;
    nextData = addResult.data;
    nextDecision = { ...nextDecision, targetPath, undo: { sourcePath: decision.sourcePath, sourceIndex: decision.sourceIndex, targetPath, generatedActionNote: actionText, createdCategoryPath: ensureResult.createdPath } };
  } else {
    const moveResult = moveNote(nextData, decision.sourcePath, targetPath, decision.note, decision.sourceIndex);
    if (!moveResult.ok) return moveResult;
    nextData = moveResult.data;
    nextDecision = { ...nextDecision, targetPath, undo: { sourcePath: decision.sourcePath, sourceIndex: decision.sourceIndex, targetPath, createdCategoryPath: ensureResult.createdPath } };
  }

  const now = new Date().toISOString();
  nextDecision = { ...nextDecision, status: 'accepted', acceptedAt: now, updatedAt: now };
  return withReviewHistory(nextData, nextDecision, 'AI_REVIEW_ACCEPTED');
}

export function autoMoveAiReviewDecision(data: NotesData, decision: AiReviewDecision): MutationResult<{ data: NotesData; decision: AiReviewDecision }> {
  const targetPath = decision.actionType === 'archive' ? [ARCHIVE_CATEGORY] : decision.targetPath;
  const ensureResult = ensureCategoryPath(data, targetPath);
  if (!ensureResult.ok) return ensureResult;
  const moveResult = moveNote(ensureResult.data, decision.sourcePath, targetPath, decision.note, decision.sourceIndex);
  if (!moveResult.ok) return moveResult;
  const now = new Date().toISOString();
  const nextDecision = {
    ...decision,
    targetPath,
    autoMovedAt: now,
    updatedAt: now,
    undo: { sourcePath: decision.sourcePath, sourceIndex: decision.sourceIndex, targetPath, createdCategoryPath: ensureResult.createdPath, autoMoved: true },
  };
  return withReviewHistory(moveResult.data, nextDecision, 'AI_REVIEW_AUTO_MOVED');
}

export function acceptAutoMovedDecision(data: NotesData, decision: AiReviewDecision): MutationResult<{ data: NotesData; decision: AiReviewDecision }> {
  const now = new Date().toISOString();
  const nextDecision = { ...decision, status: 'accepted' as const, acceptedAt: now, updatedAt: now };
  return withReviewHistory(data, nextDecision, 'AI_REVIEW_ACCEPTED');
}

export function rejectAiReviewDecision(data: NotesData, decision: AiReviewDecision): MutationResult<{ data: NotesData; decision: AiReviewDecision }> {
  const now = new Date().toISOString();
  const nextDecision = { ...decision, status: 'rejected' as const, rejectedAt: now, updatedAt: now };
  return withReviewHistory(data, nextDecision, 'AI_REVIEW_REJECTED');
}

export function undoAiReviewDecision(data: NotesData, decision: AiReviewDecision): MutationResult<{ data: NotesData; decision: AiReviewDecision }> {
  if (!decision.undo?.targetPath) return failure('undo_unavailable', 'This AI review decision cannot be undone.');
  let next = data;
  if (decision.undo.generatedActionNote) {
    const deleteResult = deleteNote(next, decision.undo.targetPath, decision.undo.generatedActionNote);
    if (!deleteResult.ok) return deleteResult;
    next = deleteResult.data;
  } else {
    const undoResult = moveNote(next, decision.undo.targetPath, decision.undo.sourcePath, decision.note);
    if (!undoResult.ok) return undoResult;
    next = undoResult.data;
  }
  const now = new Date().toISOString();
  const nextDecision = { ...decision, status: 'undone' as const, undoneAt: now, updatedAt: now };
  return withReviewHistory(next, nextDecision, 'AI_REVIEW_UNDONE');
}

function ensureCategoryPath(data: NotesData, path: CategoryPath): MutationResult<NotesData> & { createdPath?: CategoryPath } {
  if (getCategoryItems(data, path)) return { ok: true, data };
  if (path.length === 1) {
    const result = createRootCategory(data, path[0]);
    return result.ok ? { ...result, createdPath: path } : result;
  }
  const parentPath = path.slice(0, -1);
  const parent = getCategoryItems(data, parentPath);
  if (!parent) return failure('missing_category', 'The suggested category parent does not exist.');
  const result = createSubcategory(data, parentPath, path[path.length - 1]);
  return result.ok ? { ...result, createdPath: path } : result;
}

function withReviewHistory(data: NotesData, decision: AiReviewDecision, event: string): MutationResult<{ data: NotesData; decision: AiReviewDecision }> {
  const history = `${decision.simpleId}: ${decision.note} - ${formatHistoryPath(decision.targetPath)} - ${formatHistoryTime()} - Event: ${event} - Score: ${decision.score}`;
  const result = appendHistoryNote(data, history);
  if (!result.ok) return result;
  return { ok: true, data: { data: result.data, decision } };
}

function failure<T = NotesData>(code: string, message: string): MutationResult<T> {
  return { ok: false, code, message };
}
