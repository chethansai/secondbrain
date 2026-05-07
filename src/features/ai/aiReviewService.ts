import { Platform } from 'react-native';
import { listAllCategories } from '../categories/categoryTree';
import { flattenNotes, HISTORY_CATEGORY, listNotesAtPath } from '../notes/noteMutations';
import { CategoryPath, FlatNote, NotesData } from '../../shared/types/notes';
import { AiReviewDecision, AiReviewLedger, AiReviewSuggestion, ARCHIVE_CATEGORY, SEEK_CATEGORY } from './aiReviewTypes';

export type AiReviewPromptConfig = {
  scorePromptTemplate: string;
  actionPromptTemplate: string;
};

export const defaultScorePromptTemplate = [
  'Rate this SEEK note from 1 to 10 using the full notes JSON, existing categories, and recent history below.',
  'Weight recent logs more strongly. Penalize clutter: if moving this note would not add meaningful value to an existing category, score it lower.',
  'Output only one number. No words. No JSON. No punctuation. Valid outputs: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.',
  '{context}',
].join('\n\n');

export const defaultActionPromptTemplate = [
  'The locked score for this SEEK note is {score}/10. Do not change the score.',
  'Use the full context below to choose the best action.',
  'Every SEEK note must receive an action. If it is redundant, weak, stale, unclear, or not useful in any existing category, choose {archiveCategory}.',
  'If score is greater than 8, choose an existing category only when it fits without clutter. If it is not important, choose {archiveCategory}.',
  'If score is 8 or less, suggest one action note and the category it should go into. If even that would add clutter, set actionType to "archive" and targetPath to ["{archiveCategory}"]. If a new category would help, suggest it.',
  'Return only strict JSON with this shape: {"targetPath": string[], "reason": string, "actionType": "move_to_existing" | "create_action_note" | "create_category" | "archive", "suggestedActionNote": string | null, "suggestedNewCategoryPath": string[] | null}.',
  '{context}',
].join('\n\n');

export function listPendingSeekNotes(data: NotesData, ledger: AiReviewLedger): FlatNote[] {
  const reviewed = new Set(ledger.decisions.map((decision) => decision.fingerprint));
  return listNotesAtPath(data, [SEEK_CATEGORY]).filter((note) => !reviewed.has(noteFingerprint(note)));
}

export async function requestAiReview(data: NotesData, note: FlatNote, promptConfig: AiReviewPromptConfig = defaultPromptConfig()): Promise<AiReviewSuggestion> {
  const scoreText = await requestAiText(buildScorePrompt(data, note, promptConfig.scorePromptTemplate));
  const score = parseScoreOnly(scoreText);
  const actionText = await requestAiText(buildActionPrompt(data, note, score, promptConfig.actionPromptTemplate));
  return parseReviewSuggestion(actionText, score);
}

export function defaultPromptConfig(): AiReviewPromptConfig {
  return { scorePromptTemplate: defaultScorePromptTemplate, actionPromptTemplate: defaultActionPromptTemplate };
}

async function requestAiText(input: string) {
  const response = await fetch('https://chethan.tailb6229f.ts.net/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dummy' },
    body: JSON.stringify({ model: 'oca/gpt-5.4', input }),
  });
  if (!response.ok) throw new Error(`AI review failed with ${response.status}.`);
  const text = await response.text();
  return consumeSseText(text);
}

export function createDecisionFromSuggestion(note: FlatNote, suggestion: AiReviewSuggestion, nextId: string): AiReviewDecision {
  const now = new Date().toISOString();
  return {
    simpleId: nextId,
    fingerprint: noteFingerprint(note),
    note: note.note,
    sourcePath: note.path,
    sourceIndex: note.index,
    targetPath: suggestion.targetPath,
    score: suggestion.score,
    reason: suggestion.reason,
    actionType: suggestion.actionType,
    status: 'pending',
    suggestedActionNote: suggestion.suggestedActionNote,
    suggestedNewCategoryPath: suggestion.suggestedNewCategoryPath,
    createdAt: now,
    updatedAt: now,
  };
}

export function nextSimpleReviewId(ledger: AiReviewLedger) {
  const highest = ledger.decisions.reduce((max, decision) => {
    const match = /^R-(\d+)$/.exec(decision.simpleId);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `R-${String(highest + 1).padStart(4, '0')}`;
}

export function formatAiReviewRequestError(error: unknown) {
  if (Platform.OS === 'web' && error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return 'AI endpoint blocked this browser request. Open the app on Android/iOS, or enable CORS and OPTIONS on the AI server for this web origin.';
  }
  return error instanceof Error ? error.message : 'AI review failed.';
}

export function noteFingerprint(note: FlatNote) {
  return `${note.path.join('\u001f')}\u001f${note.index}\u001f${note.note}`;
}

export function buildScorePrompt(data: NotesData, note: FlatNote, template = defaultScorePromptTemplate) {
  const context = buildReviewContext(data, note);
  return fillPromptTemplate(template, { context });
}

export function buildActionPrompt(data: NotesData, note: FlatNote, score: number, template = defaultActionPromptTemplate) {
  const context = buildReviewContext(data, note);
  return fillPromptTemplate(template, { context, score: String(score), archiveCategory: ARCHIVE_CATEGORY });
}

function buildReviewContext(data: NotesData, note: FlatNote) {
  const categories = listAllCategories(data).map((category) => category.path.join(' > '));
  const recentHistory = listNotesAtPath(data, [HISTORY_CATEGORY]).slice(0, 20).map((item) => item.note);
  const allNotes = flattenNotes(data).length;
  return [
    `SEEK note: ${note.note}`,
    `SEEK source path: ${note.path.join(' > ')}`,
    `Total notes: ${allNotes}`,
    'Existing categories:',
    JSON.stringify(categories),
    'Recent history:',
    JSON.stringify(recentHistory),
    'Main document JSON:',
    JSON.stringify(data, null, 2),
  ].join('\n\n');
}

function fillPromptTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((prompt, [key, value]) => prompt.replaceAll(`{${key}}`, value), template);
}

function parseScoreOnly(text: string) {
  const clean = text.trim();
  if (/^(10|[1-9])$/.test(clean)) return Number(clean);
  const jsonText = clean.startsWith('{') ? clean : '';
  if (jsonText) {
    try {
      const raw = JSON.parse(jsonText) as { score?: unknown };
      if (typeof raw.score === 'number' && raw.score >= 1 && raw.score <= 10) return Math.round(raw.score);
    } catch {
      // Keep the explicit error below so the UI explains the contract failure.
    }
  }
  throw new Error(`AI score response must be only a number from 1 to 10. Received: ${clean.slice(0, 80) || 'empty response'}`);
}

function parseReviewSuggestion(text: string, score: number): AiReviewSuggestion {
  const jsonText = extractJsonObject(text);
  const raw = JSON.parse(jsonText) as Record<string, unknown>;
  const targetPath = parsePath(raw.targetPath) ?? [ARCHIVE_CATEGORY];
  const suggestedNewCategoryPath = parsePath(raw.suggestedNewCategoryPath);
  const suggestedActionNote = typeof raw.suggestedActionNote === 'string' && raw.suggestedActionNote.trim() ? raw.suggestedActionNote.trim() : undefined;
  const actionType = raw.actionType === 'move_to_existing' || raw.actionType === 'create_action_note' || raw.actionType === 'create_category' || raw.actionType === 'archive'
    ? raw.actionType
    : targetPath[0] === ARCHIVE_CATEGORY ? 'archive' : score > 8 ? 'move_to_existing' : 'create_action_note';
  const normalizedTargetPath = actionType === 'archive' ? [ARCHIVE_CATEGORY] : targetPath;
  return {
    score,
    targetPath: normalizedTargetPath,
    actionType,
    reason: typeof raw.reason === 'string' ? raw.reason.trim() : '',
    suggestedActionNote,
    suggestedNewCategoryPath: suggestedNewCategoryPath ?? undefined,
  };
}

function parsePath(value: unknown): CategoryPath | null {
  if (!Array.isArray(value)) return null;
  const path = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  return path.length ? path : null;
}

function extractJsonObject(text: string) {
  const clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI review response was not valid JSON.');
  return clean.slice(start, end + 1);
}

function consumeSseText(text: string) {
  let fullText = '';
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean.startsWith('data:')) continue;
    const data = clean.replace(/^data:\s*/, '');
    if (!data || data === '[DONE]') continue;
    try {
      const token = extractSseToken(JSON.parse(data) as Record<string, unknown>);
      fullText += token;
    } catch {
      continue;
    }
  }
  return fullText || text;
}

function extractSseToken(parsed: Record<string, unknown>) {
  const choices = parsed.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as { delta?: { content?: unknown }; message?: { content?: unknown }; text?: unknown } | undefined;
    const choiceToken = first?.delta?.content ?? first?.message?.content ?? first?.text;
    if (typeof choiceToken === 'string') return choiceToken;
  }

  const outputText = parsed.output_text ?? parsed.text ?? parsed.delta;
  if (typeof outputText === 'string') return outputText;

  if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') return parsed.delta;
  if (parsed.type === 'content_block_delta' && isTextDelta(parsed.delta)) return parsed.delta.text;
  if (parsed.type === 'message_delta' && isTextDelta(parsed.delta)) return parsed.delta.text;

  return '';
}

function isTextDelta(value: unknown): value is { text: string } {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { text?: unknown }).text === 'string';
}
