import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, NativeScrollEvent, NativeSyntheticEvent, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AutomationCommand, parseAutomationDeepLink } from './src/features/automation/deepLinks';
import { clearAutomationFileQueue, ensureDefaultAutomationQueueFile, getDefaultAutomationQueueUri, readAutomationFileQueue, rewriteAutomationFileQueue } from './src/features/automation/fileQueue';
import { AuthGate } from './src/features/auth/AuthGate';
import { isFloatingOverlayAvailable, readFloatingOverlaySettings, requestFloatingOverlayPermission, startFloatingOverlay } from './src/features/settings/floatingOverlay';
import { AiChatPanel } from './src/features/ai/AiChatPanel';
import { AiNotificationsPanel } from './src/features/ai/AiNotificationsPanel';
import { AiReviewPanel } from './src/features/ai/AiReviewPanel';
import { createDecisionFromSuggestion, formatAiReviewRequestError, nextSimpleReviewId, noteFingerprint, requestAiReview } from './src/features/ai/aiReviewService';
import { AiReviewLedger, SEEK_CATEGORY } from './src/features/ai/aiReviewTypes';
import { AiWorkspacePanel } from './src/features/ai/AiWorkspacePanel';
import { AssistantPanel } from './src/features/assistant/AssistantPanel';
import { CategoryList } from './src/features/categories/CategoryList';
import { categoryDeleteMessage, copyCategory, createRootCategory, createSubcategory, deleteCategory, getCategoryItems, listAllCategories, listChildCategories, renameCategory, setCategoryPriority, startsWithPath } from './src/features/categories/categoryTree';
import { TextPromptModal } from './src/features/editor/TextPromptModal';
import { NoteEditorModal } from './src/features/editor/NoteEditorModal';
import { MoveCopyModal } from './src/features/notes/MoveCopyModal';
import { NoteList } from './src/features/notes/NoteList';
import { addNote, appendHistoryNote, copyNote, deleteNote, editNote, flattenNotes, formatAddedNoteHistory, formatHistoryPath, formatHistoryTime, HISTORY_CATEGORY, listNotesAtPath, moveNote, setNotePriority } from './src/features/notes/noteMutations';
import { removePinnedNote, removePinnedNotesInPath, replacePinnedNote, replacePinnedNotesInPath, sortPinnedNotesFirst, togglePinnedNote } from './src/features/notes/pinnedNotes';
import { SearchPanel } from './src/features/search/SearchPanel';
import { copyText } from './src/features/settings/clipboard';
import { SettingsPanel } from './src/features/settings/SettingsPanel';
import { useNotesSync } from './src/features/sync/useNotesSync';
import { useAiReviewSync } from './src/features/sync/useAiReviewSync';
import { WorkspaceBoard } from './src/features/workspace/WorkspaceBoard';
import { ActionGrid, ErrorBanner, PanelHeader, WorkspaceHeader } from './src/features/workspace/WorkspaceChrome';
import { NotesTeleprompterBar } from './src/features/workspace/NotesTeleprompterBar';
import { useWorkspaceBackHandler } from './src/features/workspace/useWorkspaceBackHandler';
import { ThemeProvider, useTheme } from './src/shared/design/ThemeProvider';
import { rounded, spacing, typography } from './src/shared/design/tokens';
import { CategoryPath, FlatNote, NotesData } from './src/shared/types/notes';
import { ConfirmModal } from './src/shared/ui/ConfirmModal';
import { EmptyState } from './src/shared/ui/EmptyState';

type ModalMode = 'root' | 'subcategory' | 'rename' | 'workspace' | 'renameWorkspace' | null;
type MoveCopyAction = 'move' | 'copy';
type MoveCopyTarget = { type: 'note'; note: FlatNote } | { type: 'category'; path: CategoryPath } | null;
type Tab = 'workspace' | 'search' | 'settings' | 'aiChat' | 'ai' | 'aiWorkspace' | 'aiNotifications' | 'assistant';
type DeleteTarget = { type: 'category'; path: CategoryPath } | { type: 'note'; note: FlatNote } | null;
const DEFAULT_NOTE_CATEGORY = 'No TS';

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>;
}
function AppContent() {
  const [pendingAutomationCommand, setPendingAutomationCommand] = useState<AutomationCommand | null>(null);
  const processedAutomationLinks = useRef(new Set<string>());

  useEffect(() => {
    function queueAutomationUrl(url: string | null) {
      if (!url || processedAutomationLinks.current.has(url)) return;
      const parsed = parseAutomationDeepLink(url);
      if (!parsed.ok) return;
      processedAutomationLinks.current.add(url);
      setPendingAutomationCommand(parsed.command);
    }

    Linking.getInitialURL().then(queueAutomationUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) => queueAutomationUrl(event.url));
    return () => subscription.remove();
  }, []);

  function completeAutomationCommand(commandKey: string) {
    setPendingAutomationCommand((current) => (current?.key === commandKey ? null : current));
  }

  return (
    <AuthGate>
      {({ authTimeoutHours, onAuthTimeoutChange, onLogout }) => (
        <NotesWorkspace automationCommand={pendingAutomationCommand} onAutomationComplete={completeAutomationCommand} authTimeoutHours={authTimeoutHours} onAuthTimeoutChange={onAuthTimeoutChange} onLogout={onLogout} />
      )}
    </AuthGate>
  );
}

function NotesWorkspace({ automationCommand, onAutomationComplete, authTimeoutHours, onAuthTimeoutChange, onLogout }: { automationCommand: AutomationCommand | null; onAutomationComplete: (commandKey: string) => void; authTimeoutHours: number; onAuthTimeoutChange: (hours: number) => Promise<void>; onLogout: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, workspaces, activeWorkspace, activeWorkspaceId, defaultWorkspaceId, loading, saving, refreshing, error, setError, commit, createWorkspace, selectWorkspace, setDefaultWorkspace, renameWorkspace, updateSelectedCategoryPaths, updatePinnedCategoryPaths, updatePinnedNotes, refresh } = useNotesSync();
  const { ledger: aiReviewLedger, loading: aiReviewLoading, setError: setAiReviewError, upsertDecision } = useAiReviewSync();
  const [tab, setTab] = useState<Tab>('workspace');
  const [path, setPath] = useState<CategoryPath>([]);
  const [promptMode, setPromptMode] = useState<ModalMode>(null);
  const [promptPath, setPromptPath] = useState<CategoryPath | null>(null);
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [editorPath, setEditorPath] = useState<CategoryPath | null>(null);
  const [selectedNote, setSelectedNote] = useState<FlatNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [moveVisible, setMoveVisible] = useState(false);
  const [moveCopyAction, setMoveCopyAction] = useState<MoveCopyAction>('move');
  const [moveCopyTarget, setMoveCopyTarget] = useState<MoveCopyTarget>(null);
  const [boardTopActionsVisible, setBoardTopActionsVisible] = useState(true);
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(() => new Set());
  const runningAutomationKey = useRef<string | null>(null);
  const fileAutomationRunKey = useRef<string | null>(null);
  const runningAiReviewFingerprints = useRef(new Set<string>());

  const closePrompt = useCallback(() => { setPromptMode(null); setPromptPath(null); }, []);
  const closeEditor = useCallback(() => { setEditorMode(null); setEditorPath(null); setSelectedNote(null); }, []);
  const closeMoveCopy = useCallback(() => { setMoveVisible(false); setSelectedNote(null); setMoveCopyTarget(null); }, []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);
  const backToWorkspace = useCallback(() => setTab('workspace'), []);
  const backPath = useCallback(() => setPath((currentPath) => currentPath.slice(0, -1)), []);

  const currentItems = path.length ? getCategoryItems(data, path) : null;
  const overlayAvailable = isFloatingOverlayAvailable();
  const childCategories = useMemo(() => (currentItems ? listChildCategories(currentItems, path) : []), [currentItems, path]);
  const detailCategories = useMemo(() => listAllCategories(data).filter((category) => startsWithPath(category.path, path) && category.path.length > path.length), [data, path]);
  const expandableDetailKeys = useMemo(() => detailCategories.filter((category) => category.childCount > 0).map((category) => category.path.join('')), [detailCategories]);
  const allDetailCategoriesExpanded = expandableDetailKeys.length > 0 && expandableDetailKeys.every((key) => expandedCategoryKeys.has(key));
  const pinnedNotes = activeWorkspace?.pinnedNotes ?? [];
  const notes = useMemo(() => (path.length ? sortPinnedNotesFirst(listNotesAtPath(data, path), pinnedNotes) : []), [data, path, pinnedNotes]);
  const teleprompterNotes = useMemo(() => flattenNotes(data), [data]);
  const activeTitle = path.length ? path[path.length - 1] : activeWorkspace?.name ?? 'Workspace';
  const showingRootBoard = !loading && tab === 'workspace' && path.length === 0;

  useWorkspaceBackHandler({
    tab,
    pathLength: path.length,
    promptOpen: promptMode !== null,
    editorOpen: editorMode !== null,
    moveOpen: moveVisible,
    deleteOpen: deleteTarget !== null,
    onClosePrompt: closePrompt,
    onCloseEditor: closeEditor,
    onCloseMove: closeMoveCopy,
    onCloseDelete: closeDelete,
    onBackToWorkspace: backToWorkspace,
    onBackPath: backPath,
  });

  useEffect(() => {
    if (!automationCommand || loading || aiReviewLoading || runningAutomationKey.current === automationCommand.key) return;
    runningAutomationKey.current = automationCommand.key;

    async function runAutomationCommand(command: AutomationCommand) {
      if (command.type === 'importFile') {
        await drainAutomationFileQueue(command.fileUri);
      } else if (command.type === 'openNoteEditor') {
        setTab('workspace');
        setEditorMode('add');
        setEditorPath(path.length ? path : null);
      } else if (command.type === 'openWorkspace') {
        setTab('workspace');
        setPath([]);
        setEditorMode(null);
        setEditorPath(null);
        setSelectedNote(null);
      } else if (command.type === 'openAssistant') {
        setTab('assistant');
      } else {
        const result = addNote(data, command.categoryPath, command.note);
        const historyText = formatAddedNoteHistory(command.note, command.categoryPath);
        const ok = await commitWithHistory(result, historyText);
        if (ok) {
          setTab('workspace');
          setPath(command.categoryPath);
          if (result.ok) {
            const reviewData = appendHistoryNote(result.data, historyText);
            const reviewNote = getInsertedFlatNote(result.data, command.categoryPath, command.note);
            if (reviewData.ok && reviewNote) await reviewIncomingSeekNotes(reviewData.data, [reviewNote]);
          }
        }
      }
      onAutomationComplete(command.key);
      runningAutomationKey.current = null;
    }

    runAutomationCommand(automationCommand).catch(() => {
      setError('Automation note could not be saved.');
      onAutomationComplete(automationCommand.key);
      runningAutomationKey.current = null;
    });
  }, [aiReviewLoading, aiReviewLedger, automationCommand, commit, data, loading, onAutomationComplete, setAiReviewError, setError, upsertDecision]);

  useEffect(() => {
    if (loading || aiReviewLoading) return;
    let cancelled = false;
    ensureDefaultAutomationQueueFile().then((queueUri) => {
      if (cancelled || !queueUri || fileAutomationRunKey.current === queueUri) return;
      fileAutomationRunKey.current = queueUri;
      drainAutomationFileQueue(queueUri).finally(() => {
        fileAutomationRunKey.current = null;
      });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [aiReviewLoading, aiReviewLedger, loading, data, setAiReviewError, setError, upsertDecision]);

  function selectWorkspaceAndReset(workspaceId: string) {
    setPath([]);
    selectWorkspace(workspaceId);
  }

  async function commitWithHistory(result: ReturnType<typeof addNote>, historyText: string) {
    if (!result.ok) return commit(result);
    const ok = await commit(appendHistoryNote(result.data, historyText));
    if (ok) await includeWorkspaceCategory(HISTORY_CATEGORY);
    return ok;
  }

  async function startFloatingIcon() {
    try {
      const settings = await readFloatingOverlaySettings();
      if (!settings.permissionGranted) {
        const granted = await requestFloatingOverlayPermission();
        if (!granted) {
          setError('Allow display over other apps, then return and start the floating icon.');
          return false;
        }
      }
      const started = await startFloatingOverlay();
      if (!started) {
        setError('Floating icon could not start.');
        return false;
      }
      return true;
    } catch (overlayError) {
      setError(overlayError instanceof Error ? overlayError.message : 'Floating icon could not start.');
      return false;
    }
  }

  async function submitPrompt(value: string) {
    if (promptMode === 'root') {
      const result = createRootCategory(data, value);
      const cleanName = value.trim();
      const ok = await commitWithHistory(result, `${cleanName} category created - ${cleanName} - ${formatHistoryTime()} - Event: CATEGORY_CREATED`);
      if (ok && result.ok) await includeWorkspaceCategory(value.trim());
      return ok;
    }
    if (promptMode === 'subcategory') {
      const parentPath = promptPath ?? path;
      const cleanName = value.trim();
      const nextPath = [...parentPath, cleanName];
      const result = createSubcategory(data, parentPath, value);
      const ok = await commitWithHistory(result, `${formatHistoryPath(nextPath)} category created - ${formatHistoryPath(nextPath)} - ${formatHistoryTime()} - Event: SUBCATEGORY_CREATED - Parent: ${formatHistoryPath(parentPath)}`);
      if (ok && result.ok) await includeWorkspacePinnedCategory(nextPath);
      return ok;
    }
    if (promptMode === 'workspace') {
      const ok = await createWorkspace(value);
      if (ok) setPath([]);
      return ok;
    }
    if (promptMode === 'renameWorkspace' && activeWorkspace) return renameWorkspace(activeWorkspace.id, value);
    if (promptMode === 'rename') {
      const oldPath = path;
      const result = renameCategory(data, oldPath, value);
      const newPath = [...oldPath.slice(0, -1), value.trim()];
      const ok = await commitWithHistory(result, `${formatHistoryPath(oldPath)} renamed to ${formatHistoryPath(newPath)} - ${formatHistoryPath(newPath)} - ${formatHistoryTime()} - Event: CATEGORY_RENAMED`);
      if (ok && result.ok) {
        setPath(newPath);
        await replaceWorkspaceCategoryPath(oldPath, newPath);
        await replaceWorkspacePinnedCategoryPath(oldPath, newPath);
        await updatePinnedNotes(replacePinnedNotesInPath(oldPath, newPath, pinnedNotes));
      }
      return ok;
    }
    return false;
  }

  function confirmDeleteCategory() {
    setDeleteTarget({ type: 'category', path });
  }

  function confirmDeleteNote(note: FlatNote) {
    setDeleteTarget({ type: 'note', note });
  }

  function openMoveCopy(note: FlatNote, action: MoveCopyAction) {
    setSelectedNote(note);
    setMoveCopyTarget({ type: 'note', note });
    setMoveCopyAction(action);
    setMoveVisible(true);
  }

  function openCategoryCopy(categoryPath: CategoryPath) {
    setMoveCopyTarget({ type: 'category', path: categoryPath });
    setMoveCopyAction('copy');
    setMoveVisible(true);
  }

  async function runDelete() {
    if (!deleteTarget) return false;
    if (deleteTarget.type === 'note') {
      const ok = await commitWithHistory(deleteNote(data, deleteTarget.note.path, deleteTarget.note.note, deleteTarget.note.index), `${deleteTarget.note.note} deleted - ${formatHistoryPath(deleteTarget.note.path)} - ${formatHistoryTime()} - Event: NOTE_DELETED`);
      if (ok) await updatePinnedNotes(removePinnedNote(deleteTarget.note, pinnedNotes));
      return ok;
    }

    const parent = deleteTarget.path.slice(0, -1);
    const ok = await commitWithHistory(deleteCategory(data, deleteTarget.path), `${formatHistoryPath(deleteTarget.path)} category deleted - ${formatHistoryPath(deleteTarget.path)} - ${formatHistoryTime()} - Event: CATEGORY_DELETED`);
    if (ok) {
      await removeWorkspaceCategoryPath(deleteTarget.path);
      await removeWorkspacePinnedCategoryPath(deleteTarget.path);
      await updatePinnedNotes(removePinnedNotesInPath(deleteTarget.path, pinnedNotes));
      if (startsWithPath(path, deleteTarget.path)) setPath(parent);
    }
    return ok;
  }

  async function importData(nextData: NotesData) {
    return commit({ ok: true, data: nextData });
  }

  function openAddNoteEditor(notePath: CategoryPath = path) {
    setEditorPath(notePath);
    setEditorMode('add');
  }

  async function addBoardNote(notePath: CategoryPath, text: string) {
    return addWorkspaceNote(notePath, text);
  }

  async function addWorkspaceNote(notePath: CategoryPath, text: string, sourceData: NotesData = data) {
    const result = addNote(sourceData, notePath, text);
    const historyText = formatAddedNoteHistory(text, notePath);
    const ok = await commitWithHistory(result, historyText);
    if (ok && result.ok) {
      const reviewData = appendHistoryNote(result.data, historyText);
      const reviewNote = getInsertedFlatNote(result.data, notePath, text);
      if (reviewData.ok && reviewNote) await reviewIncomingSeekNotes(reviewData.data, [reviewNote]);
    }
    return ok;
  }

  async function addEditorDefaultNote(text: string) {
    const targetPath = editorPath?.length ? editorPath : path.length ? path : [DEFAULT_NOTE_CATEGORY];
    let sourceData = data;

    if (!getCategoryItems(sourceData, targetPath)) {
      if (targetPath.length !== 1 || targetPath[0] !== DEFAULT_NOTE_CATEGORY) {
        setError('The selected category no longer exists.');
        return false;
      }
      const categoryResult = createRootCategory(sourceData, DEFAULT_NOTE_CATEGORY);
      if (!categoryResult.ok) return commit(categoryResult);
      sourceData = categoryResult.data;
    }

    const ok = await addWorkspaceNote(targetPath, text, sourceData);
    if (ok) {
      await includeWorkspaceCategory(targetPath[0]);
      setPath(targetPath);
    }
    return ok;
  }

  async function createEditorSubcategory(parentPath: CategoryPath, name: string) {
    const cleanName = name.trim();
    const nextPath = [...parentPath, cleanName];
    const result = createSubcategory(data, parentPath, cleanName);
    const ok = await commitWithHistory(result, `${formatHistoryPath(nextPath)} category created - ${formatHistoryPath(nextPath)} - ${formatHistoryTime()} - Event: SUBCATEGORY_CREATED - Parent: ${formatHistoryPath(parentPath)}`);
    if (!ok || !result.ok) return null;
    await includeWorkspacePinnedCategory(nextPath);
    return nextPath;
  }

  async function addSeekNote(text: string) {
    const seekResult = getCategoryItems(data, [SEEK_CATEGORY]) ? { ok: true as const, data } : createRootCategory(data, SEEK_CATEGORY);
    if (!seekResult.ok) return commit(seekResult);
    const seekData = seekResult.data;
    const result = addNote(seekData, [SEEK_CATEGORY], text);
    const historyText = formatAddedNoteHistory(text, [SEEK_CATEGORY]);
    const ok = await commitWithHistory(result, historyText);
    if (ok && result.ok) {
      await includeWorkspaceCategory(SEEK_CATEGORY);
      setPath([SEEK_CATEGORY]);
      const reviewData = appendHistoryNote(result.data, historyText);
      const reviewNote = getInsertedFlatNote(result.data, [SEEK_CATEGORY], text);
      if (reviewData.ok && reviewNote) await reviewIncomingSeekNotes(reviewData.data, [reviewNote]);
    }
    return ok;
  }

  async function reviewIncomingSeekNotes(reviewData: NotesData, notesToReview: FlatNote[]) {
    const seekNotes = notesToReview.filter((note) => note.path[0] === SEEK_CATEGORY);
    if (!seekNotes.length) return;

    let workingLedger: AiReviewLedger = aiReviewLedger;
    const reviewedFingerprints = new Set(workingLedger.decisions.map((decision) => decision.fingerprint));

    for (const note of seekNotes) {
      const fingerprint = noteFingerprint(note);
      if (reviewedFingerprints.has(fingerprint) || runningAiReviewFingerprints.current.has(fingerprint)) continue;
      runningAiReviewFingerprints.current.add(fingerprint);
      try {
        const suggestion = await requestAiReview(reviewData, note);
        const decision = createDecisionFromSuggestion(note, suggestion, nextSimpleReviewId(workingLedger));
        await upsertDecision(decision);
        workingLedger = { ...workingLedger, decisions: [decision, ...workingLedger.decisions] };
        reviewedFingerprints.add(fingerprint);
      } catch (reviewError) {
        const message = formatAiReviewRequestError(reviewError);
        setAiReviewError(message);
        setError(message);
      } finally {
        runningAiReviewFingerprints.current.delete(fingerprint);
      }
    }
  }

  async function drainAutomationFileQueue(fileUri?: string) {
    const queue = await readAutomationFileQueue(fileUri);
    if (!queue.ok) {
      if (queue.code !== 'not_found' && queue.code !== 'not_available') setError(queue.message);
      return false;
    }
    if (queue.notes.length === 0) {
      await clearAutomationFileQueue(queue.fileUri);
      return true;
    }

    let nextData = data;
    const remaining = [];
    const importedSeekNotes: FlatNote[] = [];
    let importedCount = 0;
    for (const item of queue.notes) {
      const preparedData = ensureAutomationCategoryPath(nextData, item.categoryPath);
      if (!preparedData) {
        remaining.push(item);
        continue;
      }
      nextData = preparedData;
      const result = addNote(nextData, item.categoryPath, item.note);
      if (!result.ok) {
        remaining.push(item);
        continue;
      }
      const insertedSeekNote = getInsertedFlatNote(result.data, item.categoryPath, item.note);
      const historyResult = appendHistoryNote(result.data, formatAddedNoteHistory(item.note, item.categoryPath));
      if (!historyResult.ok) {
        remaining.push(item);
        continue;
      }
      nextData = historyResult.data;
      if (insertedSeekNote) importedSeekNotes.push(insertedSeekNote);
      importedCount += 1;
    }

    if (importedCount === 0) {
      setError('Automation queue was found, but no notes could be imported into SEEK.');
      return false;
    }

    const ok = await commit({ ok: true, data: nextData });
    if (!ok) return false;
    await rewriteAutomationFileQueue(queue.fileUri, remaining);
    await includeWorkspaceCategory('SEEK');
    setTab('workspace');
    setPath(['SEEK']);
    await reviewIncomingSeekNotes(nextData, importedSeekNotes);
    return true;
  }

  function getInsertedFlatNote(sourceData: NotesData, categoryPath: CategoryPath, noteText: string): FlatNote | null {
    if (categoryPath[0] !== SEEK_CATEGORY) return null;
    const cleanNote = noteText.trim();
    const items = getCategoryItems(sourceData, categoryPath);
    if (!items) return null;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index] === cleanNote) return { path: categoryPath, note: cleanNote, index };
    }
    return null;
  }

  function ensureAutomationCategoryPath(sourceData: NotesData, categoryPath: CategoryPath) {
    let nextData = sourceData;
    for (let index = 0; index < categoryPath.length; index += 1) {
      const currentPath = categoryPath.slice(0, index + 1);
      if (getCategoryItems(nextData, currentPath)) continue;
      const result = index === 0
        ? createRootCategory(nextData, currentPath[0])
        : createSubcategory(nextData, categoryPath.slice(0, index), currentPath[index]);
      if (!result.ok) return null;
      nextData = result.data;
    }
    return nextData;
  }

  async function setNoteOrderPriority(note: FlatNote, priority: number) {
    const result = setNotePriority(data, note.path, note.note, priority, note.index);
    const ok = await commit(result);
    if (ok && result.ok) {
      const reorderedNotes = listNotesAtPath(result.data, note.path);
      const nextNote = reorderedNotes[Math.max(0, Math.min(priority - 1, reorderedNotes.length - 1))];
      if (nextNote?.note === note.note) await updatePinnedNotes(replacePinnedNote(note, nextNote, pinnedNotes));
    }
    return ok;
  }

  async function toggleNotePin(note: FlatNote) {
    return updatePinnedNotes(togglePinnedNote(note, pinnedNotes));
  }

  async function copyNoteText(note: FlatNote) {
    const copied = await copyText(note.note);
    if (!copied) setError('Clipboard copy is not available on this device.');
  }

  function toggleDetailCategory(categoryPath: CategoryPath) {
    const key = categoryPath.join('');
    setExpandedCategoryKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function setDetailCategoriesExpanded(expanded: boolean) {
    setExpandedCategoryKeys((current) => {
      const next = new Set(current);
      expandableDetailKeys.forEach((key) => {
        if (expanded) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  }

  async function toggleWorkspaceCategory(categoryPath: CategoryPath) {
    const selected = activeWorkspace?.selectedCategoryPaths ?? [];
    const key = categoryPath.join('\u001f');
    const exists = selected.some((item) => item.join('\u001f') === key);
    const nextSelected = exists ? selected.filter((item) => item.join('\u001f') !== key) : [...selected, categoryPath];
    return updateSelectedCategoryPaths(nextSelected);
  }

  async function setWorkspaceCategoryPriority(categoryPath: CategoryPath, priority: number, visibleCategoryPaths?: CategoryPath[]) {
    const selected = visibleCategoryPaths?.length ? visibleCategoryPaths : activeWorkspace?.selectedCategoryPaths ?? [];
    const key = categoryPath.join('\u001f');
    const withoutCategory = selected.filter((item) => item.join('\u001f') !== key);
    const insertionIndex = Math.max(0, Math.min(priority - 1, withoutCategory.length));
    const nextSelected = [...withoutCategory.slice(0, insertionIndex), categoryPath, ...withoutCategory.slice(insertionIndex)];
    return updateSelectedCategoryPaths(nextSelected);
  }

  async function setSubcategoryOrderPriority(categoryPath: CategoryPath, priority: number) {
    return commit(setCategoryPriority(data, categoryPath, priority));
  }

  async function includeWorkspaceCategory(categoryName: string) {
    if (!categoryName) return false;
    const selected = activeWorkspace?.selectedCategoryPaths ?? [];
    if (selected.some((item) => item[0] === categoryName)) return true;
    return updateSelectedCategoryPaths([...selected, [categoryName]]);
  }

  async function replaceWorkspaceCategoryPath(oldPath: CategoryPath, newPath: CategoryPath) {
    if (!oldPath.length || !newPath.length) return false;
    const selected = activeWorkspace?.selectedCategoryPaths ?? [];
    const nextSelected = selected.map((item) => startsWithPath(item, oldPath) ? [...newPath, ...item.slice(oldPath.length)] : item);
    return updateSelectedCategoryPaths(nextSelected);
  }

  async function removeWorkspaceCategoryPath(categoryPath: CategoryPath) {
    if (!categoryPath.length) return false;
    const selected = activeWorkspace?.selectedCategoryPaths ?? [];
    return updateSelectedCategoryPaths(selected.filter((item) => !startsWithPath(item, categoryPath)));
  }

  async function togglePinnedMoveCopyCategory(categoryPath: CategoryPath) {
    const pinned = activeWorkspace?.pinnedCategoryPaths ?? [];
    const key = categoryPath.join('\u001f');
    const exists = pinned.some((item) => item.join('\u001f') === key);
    const nextPinned = exists ? pinned.filter((item) => item.join('\u001f') !== key) : [...pinned, categoryPath];
    return updatePinnedCategoryPaths(nextPinned);
  }

  async function includeWorkspacePinnedCategory(categoryPath: CategoryPath) {
    if (!categoryPath.length) return false;
    const pinned = activeWorkspace?.pinnedCategoryPaths ?? [];
    const key = categoryPath.join('\u001f');
    if (pinned.some((item) => item.join('\u001f') === key)) return true;
    return updatePinnedCategoryPaths([...pinned, categoryPath]);
  }

  async function replaceWorkspacePinnedCategoryPath(oldPath: CategoryPath, newPath: CategoryPath) {
    if (!oldPath.length || !newPath.length) return false;
    const pinned = activeWorkspace?.pinnedCategoryPaths ?? [];
    const nextPinned = pinned.map((item) => startsWithPath(item, oldPath) ? [...newPath, ...item.slice(oldPath.length)] : item);
    return updatePinnedCategoryPaths(nextPinned);
  }

  async function removeWorkspacePinnedCategoryPath(categoryPath: CategoryPath) {
    if (!categoryPath.length) return false;
    const pinned = activeWorkspace?.pinnedCategoryPaths ?? [];
    return updatePinnedCategoryPaths(pinned.filter((item) => !startsWithPath(item, categoryPath)));
  }

  function handleScreenScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const atTop = event.nativeEvent.contentOffset.y <= 8;
    setBoardTopActionsVisible((current) => (current === atTop ? current : atTop));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <NotesTeleprompterBar notes={teleprompterNotes} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" onScroll={handleScreenScroll} scrollEventThrottle={16}>
        <View style={[styles.workspaceCard, showingRootBoard && styles.workspaceCardBoard]}>
          {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
          {loading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Loading workspace</Text></View>
          ) : null}
          {!loading && tab === 'workspace' ? (
            <View style={styles.panel}>
              {path.length === 0 ? (
                <WorkspaceBoard
                  data={data}
                  workspaces={workspaces}
                  activeWorkspace={activeWorkspace}
                  activeWorkspaceId={activeWorkspaceId}
                  defaultWorkspaceId={defaultWorkspaceId}
                  saving={saving}
                  refreshing={refreshing}
                  floatingActionsVisible={boardTopActionsVisible}
                  authTimeoutHours={authTimeoutHours}
                  onSelectWorkspace={selectWorkspaceAndReset}
                  onSetDefaultWorkspace={setDefaultWorkspace}
                  onCreateWorkspace={() => setPromptMode('workspace')}
                  onRenameWorkspace={() => setPromptMode('renameWorkspace')}
                  onRefresh={refresh}
                  onOpenSearch={() => setTab('search')}
                  onOpenSettings={() => setTab('settings')}
                  onOpenAiChat={() => setTab('aiChat')}
                  onOpenAssistant={() => setTab('assistant')}
                  onOpenAiNotifications={() => setTab('aiNotifications')}
                  onOpenAi={() => setTab('ai')}
                  onOpenAiWorkspace={() => setTab('aiWorkspace')}
                  onAuthTimeoutChange={onAuthTimeoutChange}
                  onLogout={onLogout}
                  onStartFloatingIcon={startFloatingIcon}
                  overlayAvailable={overlayAvailable}
                  onOpenCategory={setPath}
                  onCreateRootCategory={() => setPromptMode('root')}
                  onToggleCategory={toggleWorkspaceCategory}
                  onToggleCategoryPin={togglePinnedMoveCopyCategory}
                  onSetCategoryPriority={setWorkspaceCategoryPriority}
                  onSetSubcategoryPriority={setSubcategoryOrderPriority}
                  onAddNote={addBoardNote}
                  onCreateSubcategory={(categoryPath) => { setPromptPath(categoryPath); setPromptMode('subcategory'); }}
                  onCopyCategory={openCategoryCopy}
                  onRenameCategory={(categoryPath) => { setPath(categoryPath); setPromptMode('rename'); }}
                  onDeleteCategory={(categoryPath) => setDeleteTarget({ type: 'category', path: categoryPath })}
                  onEditNote={(note) => { setSelectedNote(note); setEditorMode('edit'); }}
                  onMoveNote={(note) => openMoveCopy(note, 'move')}
                  onCopyNote={(note) => openMoveCopy(note, 'copy')}
                  onCopyNoteText={(note) => { copyNoteText(note).catch(() => setError('Clipboard copy failed.')); }}
                  onSetNotePriority={setNoteOrderPriority}
                  onToggleNotePin={toggleNotePin}
                  onDeleteNote={confirmDeleteNote}
                />
              ) : (
                <View style={styles.sectionStack}>
                  <WorkspaceHeader
                    title={activeTitle}
                    path={path}
                    workspaceName={activeWorkspace?.name ?? 'Workspace'}
                    onBack={backPath}
                    onOpenSearch={() => setTab('search')}
                    onOpenSettings={() => setTab('settings')}
                    onOpenAiChat={() => setTab('aiChat')}
                    onOpenAssistant={() => setTab('assistant')}
                    onOpenAiNotifications={() => setTab('aiNotifications')}
                    onOpenAi={() => setTab('ai')}
                    onOpenAiWorkspace={() => setTab('aiWorkspace')}
                  />
                  <ActionGrid
                    discloseLabel={expandableDetailKeys.length ? (allDetailCategoriesExpanded ? 'Enclose' : 'Disclose') : undefined}
                    onDisclose={expandableDetailKeys.length ? () => setDetailCategoriesExpanded(!allDetailCategoriesExpanded) : undefined}
                    onAddNote={() => openAddNoteEditor(path)}
                    onSubcategory={() => { setPromptPath(path); setPromptMode('subcategory'); }}
                    onRename={() => setPromptMode('rename')}
                    onDelete={confirmDeleteCategory}
                    onCopy={() => openCategoryCopy(path)}
                  />
                  {childCategories.length ? <CategoryList categories={detailCategories} expandedKeys={expandedCategoryKeys} onToggleCategory={toggleDetailCategory} onSelect={setPath} /> : null}
                  {notes.length ? (
                    <NoteList
                      notes={notes}
                      onEdit={(note) => { setSelectedNote(note); setEditorMode('edit'); }}
                      onMove={(note) => openMoveCopy(note, 'move')}
                      onCopy={(note) => openMoveCopy(note, 'copy')}
                      onCopyText={(note) => { copyNoteText(note).catch(() => setError('Clipboard copy failed.')); }}
                      onSetPriority={setNoteOrderPriority}
                      onTogglePin={toggleNotePin}
                      onDelete={confirmDeleteNote}
                      pinnedNotes={pinnedNotes}
                    />
                  ) : <EmptyState title="No notes here" message="This category is ready for notes or subcategories." actionLabel="Add note" onAction={() => openAddNoteEditor(path)} />}
                </View>
              )}
            </View>
          ) : null}
          {!loading && tab === 'search' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="Search" onBack={backToWorkspace} />
              <SearchPanel data={data} onSelect={(note) => { setPath(note.path); setTab('workspace'); }} />
            </View>
          ) : null}
          {!loading && tab === 'settings' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="Settings" onBack={backToWorkspace} />
              <SettingsPanel data={data} authTimeoutHours={authTimeoutHours} onAuthTimeoutChange={onAuthTimeoutChange} onImport={importData} />
            </View>
          ) : null}
          {!loading && tab === 'aiChat' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="AI Chat" onBack={backToWorkspace} />
              <AiChatPanel
                data={data}
                pinnedNotes={pinnedNotes}
                onAddNote={addWorkspaceNote}
                onCreateSubcategory={(categoryPath) => { setPromptPath(categoryPath); setPromptMode('subcategory'); }}
                onCopyCategory={openCategoryCopy}
                onSetSubcategoryPriority={setSubcategoryOrderPriority}
                onRenameCategory={(categoryPath) => { setPath(categoryPath); setPromptMode('rename'); }}
                onDeleteCategory={(categoryPath) => setDeleteTarget({ type: 'category', path: categoryPath })}
                onEditNote={(note) => { setSelectedNote(note); setEditorMode('edit'); }}
                onMoveNote={(note) => openMoveCopy(note, 'move')}
                onCopyNote={(note) => openMoveCopy(note, 'copy')}
                onCopyNoteText={(note) => { copyNoteText(note).catch(() => setError('Clipboard copy failed.')); }}
                onSetNotePriority={setNoteOrderPriority}
                onToggleNotePin={toggleNotePin}
                onDeleteNote={confirmDeleteNote}
              />
            </View>
          ) : null}
          {!loading && tab === 'aiNotifications' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="AI Notifications" onBack={backToWorkspace} />
              <AiNotificationsPanel data={data} />
            </View>
          ) : null}
          {!loading && tab === 'ai' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="AI Review" onBack={backToWorkspace} />
              <AiReviewPanel data={data} commit={commit} onIncludeCategory={includeWorkspaceCategory} />
            </View>
          ) : null}
          {!loading && tab === 'aiWorkspace' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="AI WORKSPACE" onBack={backToWorkspace} />
              <AiWorkspacePanel />
            </View>
          ) : null}
          {!loading && tab === 'assistant' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="Assistant" onBack={backToWorkspace} />
              <AssistantPanel />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <TextPromptModal
        visible={promptMode !== null}
        title={promptMode === 'renameWorkspace' ? 'Rename workspace' : promptMode === 'workspace' ? 'New workspace' : promptMode === 'rename' ? 'Rename category' : promptMode === 'subcategory' ? 'New subcategory' : 'New root category'}
        label={promptMode === 'workspace' || promptMode === 'renameWorkspace' ? 'Workspace name' : 'Category name'}
        initialValue={promptMode === 'rename' ? activeTitle : promptMode === 'renameWorkspace' ? activeWorkspace?.name ?? '' : ''}
        submitLabel={promptMode === 'workspace' || promptMode === 'renameWorkspace' ? 'Save workspace' : 'Save category'}
        onClose={closePrompt}
        onSubmit={submitPrompt}
      />
      <NoteEditorModal
        visible={editorMode !== null}
        title={editorMode === 'edit' ? 'Edit note' : 'Add note'}
        initialText={editorMode === 'edit' ? selectedNote?.note ?? '' : ''}
        categoryData={editorMode === 'add' ? data : undefined}
        selectedPath={editorMode === 'add' ? editorPath ?? path : null}
        onClose={closeEditor}
        onSubmit={async (text) => {
          if (editorMode !== 'edit' || !selectedNote) return addSeekNote(text);
          const ok = await commitWithHistory(editNote(data, selectedNote.path, selectedNote.note, text, selectedNote.index), `${selectedNote.note} edited to ${text.trim()} - ${formatHistoryPath(selectedNote.path)} - ${formatHistoryTime()} - Event: NOTE_EDITED`);
          if (ok) await updatePinnedNotes(replacePinnedNote(selectedNote, { ...selectedNote, note: text.trim() }, pinnedNotes));
          return ok;
        }}
        onSubmitToCategory={editorMode === 'add' ? addWorkspaceNote : undefined}
        onSubmitDefaultCategory={editorMode === 'add' ? addEditorDefaultNote : undefined}
        defaultCategoryLabel={(editorPath?.length ? editorPath : path.length ? path : [DEFAULT_NOTE_CATEGORY]).join(' > ')}
        onCreateSubcategory={editorMode === 'add' ? createEditorSubcategory : undefined}
        pinnedPaths={activeWorkspace?.pinnedCategoryPaths ?? []}
        onToggleCategoryPin={togglePinnedMoveCopyCategory}
      />
      <MoveCopyModal
        visible={moveVisible}
        action={moveCopyAction}
        itemType={moveCopyTarget?.type ?? 'note'}
        data={data}
        pinnedPaths={activeWorkspace?.pinnedCategoryPaths ?? []}
        onClose={closeMoveCopy}
        onTogglePin={togglePinnedMoveCopyCategory}
        onResetPins={() => updatePinnedCategoryPaths([])}
        onMove={async (destination) => {
          if (moveCopyTarget?.type !== 'note') return false;
          const selectedNote = moveCopyTarget.note;
          const ok = await commitWithHistory(moveNote(data, selectedNote.path, destination, selectedNote.note, selectedNote.index), `${selectedNote.note} moved - ${formatHistoryPath(destination)} - ${formatHistoryTime()} - Event: NOTE_MOVED - From: ${formatHistoryPath(selectedNote.path)}`);
          if (ok) await updatePinnedNotes(removePinnedNote(selectedNote, pinnedNotes));
          return ok;
        }}
        onCopy={(destination) => {
          if (moveCopyTarget?.type === 'note') {
            const selectedNote = moveCopyTarget.note;
            return commitWithHistory(copyNote(data, selectedNote.path, destination, selectedNote.note, selectedNote.index), `${selectedNote.note} copied - ${formatHistoryPath(destination)} - ${formatHistoryTime()} - Event: NOTE_COPIED - From: ${formatHistoryPath(selectedNote.path)}`);
          }
          if (moveCopyTarget?.type === 'category') {
            const sourcePath = moveCopyTarget.path;
            const result = copyCategory(data, sourcePath, destination);
            const copiedPath = result.ok ? result.path : destination;
            return commitWithHistory(result, `${formatHistoryPath(sourcePath)} category copied - ${formatHistoryPath(copiedPath)} - ${formatHistoryTime()} - Event: CATEGORY_COPIED - From: ${formatHistoryPath(sourcePath)}`);
          }
          return false;
        }}
      />
      <ConfirmModal
        visible={deleteTarget !== null}
        title={deleteTarget?.type === 'category' ? 'Delete category?' : 'Delete note?'}
        message={deleteTarget?.type === 'category' ? categoryDeleteMessage(data, deleteTarget.path) : 'This note will be removed from this category.'}
        onClose={closeDelete}
        onConfirm={runDelete}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: typeof import('./src/shared/design/tokens').colors) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 110 },
  workspaceCard: { width: '100%', backgroundColor: colors.canvas, padding: spacing.lg, gap: spacing.lg },
  workspaceCardBoard: { paddingHorizontal: 0 },
  panel: { gap: spacing.lg },
  sectionStack: { gap: spacing.md },
  loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  loadingText: { ...typography.bodySm, color: colors.slate },
  });
}
