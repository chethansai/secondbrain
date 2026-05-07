import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRootCategory, createSubcategory } from '../categories/categoryTree';
import { addNote, copyNote, flattenNotes, formatHistoryPath, formatHistoryTime, moveNote } from '../notes/noteMutations';
import { validateNotesData } from '../sync/validation';
import { CategoryPath, MutationResult, NotesData } from '../../shared/types/notes';
import { sendAiRequest } from './aiClient';
import { markAiNotificationRead, readAiNotifications, readAiRuns, saveAiNotification, saveAiRun } from './aiRunRepository';
import { buildCategoryContext, buildWorkspaceCatalog, buildWorkspaceChunks } from './contextBuilder';
import { buildCategoryRequestMessages, buildChatMessages, buildClassifyNoteMessages, buildDistillChunkMessages, buildFinalSynthesisMessages, buildGenerateWorkspaceMessages } from './prompts';
import { readAiProviders } from './settings';
import { AiCategoryRequest, AiContextScope, AiNotification, AiNoteClassification, AiRunRecord, AiWorkspaceResponse } from './types';

type UseAiAssistantArgs = {
  data: NotesData;
  activeWorkspaceId: string;
  activeWorkspaceName: string;
  currentPath: CategoryPath;
  onCreateWorkspaceFromAi: (name: string, data: NotesData) => Promise<string | null>;
  onCommitMutation: (result: MutationResult, historyText: string) => Promise<boolean>;
};

export function useAiAssistant({ data, activeWorkspaceId, activeWorkspaceName, currentPath, onCreateWorkspaceFromAi, onCommitMutation }: UseAiAssistantArgs) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<AiRunRecord[]>([]);
  const [notifications, setNotifications] = useState<AiNotification[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  const reloadHistory = useCallback(async () => {
    const [nextRuns, nextNotifications] = await Promise.all([readAiRuns(), readAiNotifications()]);
    setRuns(nextRuns);
    setNotifications(nextNotifications);
  }, []);

  useEffect(() => {
    reloadHistory().catch(() => undefined);
  }, [reloadHistory]);

  const ask = useCallback(async (question: string, scope: AiContextScope) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy) return false;
    setBusy(true);
    setAnswer('');
    setStatus('Thinking');
    abortRef.current = new AbortController();
    const run = createRun('chat', `Chat: ${cleanQuestion.slice(0, 48)}`, activeWorkspaceId, activeWorkspaceName, cleanQuestion);

    try {
      await saveAiRun({ ...run, status: 'running' });
      const providers = await readAiProviders();
      const context = await buildQuestionContext(data, currentPath, cleanQuestion, scope, providers, abortRef.current.signal, setStatus);
      const prompt = `Scope: ${scope}\n\n${context}\n\nQuestion: ${cleanQuestion}`;
      const result = await sendAiRequest(providers, { messages: buildChatMessages(cleanQuestion, context), temperature: 0.2 }, {
        signal: abortRef.current.signal,
        onToken: (token) => setAnswer((current) => current + token),
      });
      const completed = { ...run, status: 'completed' as const, prompt, responseText: result.text, completedAt: nowIso() };
      await finishRun(completed, 'AI answer ready', 'Tap to view the full prompt and response.');
      setStatus('Answer ready');
      return true;
    } catch (error) {
      const failed = { ...run, status: 'failed' as const, error: errorMessage(error), responseText: answer, completedAt: nowIso() };
      await finishRun(failed, 'AI answer failed', failed.error ?? 'Request failed.');
      setStatus(failed.error ?? 'AI request failed');
      return false;
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [activeWorkspaceId, activeWorkspaceName, answer, busy, currentPath, data]);

  const generateWorkspace = useCallback(async (goal: string) => {
    if (busy) return false;
    setBusy(true);
    setAnswer('');
    setStatus('Generating AI workspace');
    abortRef.current = new AbortController();
    const run = createRun('generate_workspace', 'Generate AI workspace', activeWorkspaceId, activeWorkspaceName, goal);

    try {
      await saveAiRun({ ...run, status: 'running' });
      const providers = await readAiProviders();
      const messages = buildGenerateWorkspaceMessages(data, activeWorkspaceName, goal);
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n\n');
      const result = await sendAiRequest(providers, { messages, responseFormat: 'json', temperature: 0.1 }, {
        signal: abortRef.current.signal,
        onToken: (token) => setAnswer((current) => current + token),
      });
      const parsed = parseJsonFromText<AiWorkspaceResponse>(result.text);
      const validation = validateNotesData(parsed.data);
      if (!validation.ok) throw new Error(`AI returned invalid workspace JSON: ${validation.message}`);
      const missingCount = countMissingSourceNotes(data, validation.data);
      if (missingCount > 0) throw new Error(`AI workspace is missing ${missingCount} source notes. Try again with a stricter prompt.`);
      const workspaceName = cleanWorkspaceName(parsed.workspace_name || `AI ${activeWorkspaceName}`);
      const workspaceId = await onCreateWorkspaceFromAi(workspaceName, validation.data);
      if (!workspaceId) throw new Error('Generated workspace could not be saved.');
      const completed = {
        ...run,
        status: 'completed' as const,
        prompt,
        responseText: result.text,
        generatedJson: validation.data,
        generatedWorkspaceId: workspaceId,
        generatedWorkspaceName: workspaceName,
        completedAt: nowIso(),
      };
      await finishRun(completed, 'AI workspace generated', `${workspaceName} is ready.`);
      setStatus(`${workspaceName} created`);
      return true;
    } catch (error) {
      const failed = { ...run, status: 'failed' as const, error: errorMessage(error), responseText: answer, completedAt: nowIso() };
      await finishRun(failed, 'AI workspace failed', failed.error ?? 'Generation failed.');
      setStatus(failed.error ?? 'AI workspace failed');
      return false;
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [activeWorkspaceId, activeWorkspaceName, answer, busy, data, onCreateWorkspaceFromAi]);

  const requestCategory = useCallback(async (request: string, parentPath: CategoryPath) => {
    const cleanRequest = request.trim();
    if (!cleanRequest || busy) return false;
    setBusy(true);
    setStatus('Preparing category request');
    setAnswer('');
    abortRef.current = new AbortController();
    const run = createRun('category_request', 'AI category request', activeWorkspaceId, activeWorkspaceName, cleanRequest);

    try {
      await saveAiRun({ ...run, status: 'running' });
      const providers = await readAiProviders();
      const messages = buildCategoryRequestMessages(data, parentPath, cleanRequest);
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n\n');
      const result = await sendAiRequest(providers, { messages, responseFormat: 'json', temperature: 0.1 }, {
        signal: abortRef.current.signal,
        onToken: (token) => setAnswer((current) => current + token),
      });
      const suggestion = parseJsonFromText<AiCategoryRequest>(result.text);
      const applied = await applyCategoryRequest(suggestion);
      const completed = { ...run, status: applied ? 'completed' as const : 'failed' as const, prompt, responseText: result.text, completedAt: nowIso(), error: applied ? undefined : 'Category request could not be applied.' };
      await finishRun(completed, applied ? 'AI category created' : 'AI category failed', applied ? suggestion.reason : 'Review the run detail.');
      setStatus(applied ? 'Category request applied' : 'Could not apply category request');
      return applied;
    } catch (error) {
      const failed = { ...run, status: 'failed' as const, error: errorMessage(error), responseText: answer, completedAt: nowIso() };
      await finishRun(failed, 'AI category failed', failed.error ?? 'Request failed.');
      setStatus(failed.error ?? 'AI category failed');
      return false;
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [activeWorkspaceId, activeWorkspaceName, answer, busy, data, onCommitMutation]);

  const classifyNote = useCallback(async (note: string) => {
    if (!note.trim() || busy) return null;
    setBusy(true);
    setStatus('Reviewing note');
    setAnswer('');
    abortRef.current = new AbortController();
    const run = createRun('classify_note', 'AI note review', activeWorkspaceId, activeWorkspaceName, note);

    try {
      await saveAiRun({ ...run, status: 'running' });
      const providers = await readAiProviders();
      const messages = buildClassifyNoteMessages(note, buildWorkspaceCatalog(data));
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n\n');
      const result = await sendAiRequest(providers, { messages, responseFormat: 'json', temperature: 0.1 }, {
        signal: abortRef.current.signal,
        onToken: (token) => setAnswer((current) => current + token),
      });
      const classification = parseJsonFromText<AiNoteClassification>(result.text);
      const completed = { ...run, status: 'completed' as const, prompt, responseText: result.text, completedAt: nowIso() };
      await finishRun(completed, 'AI note review ready', classification.reason);
      setStatus('Note review ready');
      return classification;
    } catch (error) {
      const failed = { ...run, status: 'failed' as const, error: errorMessage(error), responseText: answer, completedAt: nowIso() };
      await finishRun(failed, 'AI note review failed', failed.error ?? 'Request failed.');
      setStatus(failed.error ?? 'AI note review failed');
      return null;
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [activeWorkspaceId, activeWorkspaceName, answer, busy, data]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
    setStatus('Stopped');
  }, []);

  const openNotification = useCallback(async (notificationId: string) => {
    await markAiNotificationRead(notificationId);
    await reloadHistory();
  }, [reloadHistory]);

  async function applyCategoryRequest(suggestion: AiCategoryRequest) {
    const parentPath = suggestion.parent_path.length ? suggestion.parent_path : currentPath;
    const targetPath = parentPath.length ? [...parentPath, suggestion.new_category_name] : [suggestion.new_category_name];
    const categoryResult = parentPath.length ? createSubcategory(data, parentPath, suggestion.new_category_name) : createRootCategory(data, suggestion.new_category_name);
    let workingResult = categoryResult;
    if (!workingResult.ok && workingResult.code !== 'duplicate_category') return false;
    let workingData = workingResult.ok ? workingResult.data : data;

    for (const item of suggestion.items) {
      const result = suggestion.mode === 'move'
        ? moveNote(workingData, item.source_path, targetPath, item.note)
        : copyNote(workingData, item.source_path, targetPath, item.note);
      if (result.ok) workingData = result.data;
    }

    return onCommitMutation({ ok: true, data: workingData }, `${suggestion.new_category_name} AI category request applied - ${formatHistoryPath(targetPath)} - ${formatHistoryTime()} - Event: AI_CATEGORY_REQUEST`);
  }

  async function finishRun(run: AiRunRecord, title: string, message: string) {
    await saveAiRun(run);
    const notification = { id: `notif_${run.id}`, runId: run.id, title, message, createdAt: nowIso(), read: false };
    await saveAiNotification(notification);
    await reloadHistory();
  }

  return { answer, status, busy, runs, notifications, unreadCount, ask, generateWorkspace, requestCategory, classifyNote, stop, openNotification, reloadHistory };
}

async function buildQuestionContext(data: NotesData, currentPath: CategoryPath, question: string, scope: AiContextScope, providers: Awaited<ReturnType<typeof readAiProviders>>, signal: AbortSignal, setStatus: (value: string) => void) {
  if (scope === 'none') return '';
  if (scope === 'current_category' && currentPath.length) return buildCategoryContext(data, currentPath);
  const chunks = buildWorkspaceChunks(data);
  if (chunks.length <= 1) return `Catalog:\n${buildWorkspaceCatalog(data)}\n\nNotes:\n${chunks[0] ?? ''}`;
  setStatus(`Reading ${chunks.length} chunks`);
  const summaries: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    setStatus(`Summarizing chunk ${index + 1}/${chunks.length}`);
    const result = await sendAiRequest(providers, { messages: buildDistillChunkMessages(chunks[index]), temperature: 0.1 }, { signal });
    summaries.push(result.text);
  }
  const synthesis = await sendAiRequest(providers, { messages: buildFinalSynthesisMessages(question, summaries), temperature: 0.2 }, { signal });
  return synthesis.text;
}

function createRun(type: AiRunRecord['type'], title: string, sourceWorkspaceId: string, sourceWorkspaceName: string, prompt: string): AiRunRecord {
  const createdAt = nowIso();
  return { id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, status: 'queued', title, sourceWorkspaceId, sourceWorkspaceName, prompt, responseText: '', createdAt };
}

function parseJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1)) as T;
    throw new Error('AI did not return valid JSON.');
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'AI request failed.';
}

function nowIso() {
  return new Date().toISOString();
}

function cleanWorkspaceName(name: string) {
  return name.trim().slice(0, 64) || `AI Workspace ${new Date().toISOString().slice(0, 10)}`;
}

function countMissingSourceNotes(sourceData: NotesData, generatedData: NotesData) {
  const generatedCounts = new Map<string, number>();
  flattenNotes(generatedData).forEach((note) => {
    generatedCounts.set(note.note, (generatedCounts.get(note.note) ?? 0) + 1);
  });
  return flattenNotes(sourceData).reduce((missing, note) => {
    const count = generatedCounts.get(note.note) ?? 0;
    if (count <= 0) return missing + 1;
    generatedCounts.set(note.note, count - 1);
    return missing;
  }, 0);
}
