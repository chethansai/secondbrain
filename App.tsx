import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, NativeScrollEvent, NativeSyntheticEvent, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AutomationCommand, parseAutomationDeepLink } from './src/features/automation/deepLinks';
import { clearSavedUnlock, defaultAuthTimeoutHours, markUnlocked, readAuthTimeoutHours, readShouldStartUnlocked, writeAuthTimeoutHours } from './src/features/auth/authSession';
import { LockScreen } from './src/features/auth/LockScreen';
import { AiChatPanel } from './src/features/ai/AiChatPanel';
import { CategoryList } from './src/features/categories/CategoryList';
import { countCategoryContents, createRootCategory, createSubcategory, deleteCategory, formatPath, getCategoryItems, listChildCategories, renameCategory } from './src/features/categories/categoryTree';
import { TextPromptModal } from './src/features/editor/TextPromptModal';
import { NoteEditorModal } from './src/features/editor/NoteEditorModal';
import { MoveCopyModal } from './src/features/notes/MoveCopyModal';
import { NoteList } from './src/features/notes/NoteList';
import { addNote, appendHistoryNote, copyNote, deleteNote, editNote, formatAddedNoteHistory, formatHistoryPath, formatHistoryTime, HISTORY_CATEGORY, listNotesAtPath, moveNote, setNotePriority } from './src/features/notes/noteMutations';
import { SearchPanel } from './src/features/search/SearchPanel';
import { SettingsPanel } from './src/features/settings/SettingsPanel';
import { useNotesSync } from './src/features/sync/useNotesSync';
import { WorkspaceBoard } from './src/features/workspace/WorkspaceBoard';
import { ThemeProvider, useTheme } from './src/shared/design/ThemeProvider';
import { rounded, spacing, typography } from './src/shared/design/tokens';
import { CategoryPath, FlatNote, NotesData } from './src/shared/types/notes';
import { Button } from './src/shared/ui/Button';
import { ConfirmModal } from './src/shared/ui/ConfirmModal';
import { EmptyState } from './src/shared/ui/EmptyState';
import { Icon } from './src/shared/ui/Icon';

type ModalMode = 'root' | 'subcategory' | 'rename' | 'workspace' | 'renameWorkspace' | null;
type MoveCopyAction = 'move' | 'copy';
type Tab = 'workspace' | 'search' | 'settings' | 'ai';
type DeleteTarget = { type: 'category'; path: CategoryPath } | { type: 'note'; note: FlatNote } | null;

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>;
}

function AppContent() {
  const [unlocked, setUnlocked] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authTimeoutHours, setAuthTimeoutHours] = useState(defaultAuthTimeoutHours);
  const [pendingAutomationCommand, setPendingAutomationCommand] = useState<AutomationCommand | null>(null);
  const processedAutomationLinks = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    async function loadAuthSession() {
      try {
        const [timeoutHours, shouldStartUnlocked] = await Promise.all([
          readAuthTimeoutHours(),
          readShouldStartUnlocked(),
        ]);
        if (!mounted) return;
        setAuthTimeoutHours(timeoutHours);
        setUnlocked(shouldStartUnlocked);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    loadAuthSession();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const shouldStayUnlocked = await readShouldStartUnlocked();
      setUnlocked(shouldStayUnlocked);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const interval = setInterval(async () => {
      const shouldStayUnlocked = await readShouldStartUnlocked();
      setUnlocked(shouldStayUnlocked);
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [unlocked]);

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

  async function unlock() {
    await markUnlocked();
    setUnlocked(true);
  }

  async function updateAuthTimeout(hours: number) {
    const nextHours = await writeAuthTimeoutHours(hours);
    setAuthTimeoutHours(nextHours);
    const shouldStayUnlocked = await readShouldStartUnlocked();
    setUnlocked(shouldStayUnlocked);
  }

  async function logout() {
    await clearSavedUnlock();
    setUnlocked(false);
  }

  if (authLoading) return <AuthLoadingScreen />;
  if (!unlocked) return <LockScreen onUnlock={unlock} />;
  return <NotesWorkspace automationCommand={pendingAutomationCommand} onAutomationComplete={completeAutomationCommand} authTimeoutHours={authTimeoutHours} onAuthTimeoutChange={updateAuthTimeout} onLogout={logout} />;
}

function AuthLoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={[authLoadingStyles.screen, { backgroundColor: colors.brandNavy }]}>
      <ActivityIndicator color={colors.onPrimary} />
    </View>
  );
}

const authLoadingStyles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

function NotesWorkspace({ automationCommand, onAutomationComplete, authTimeoutHours, onAuthTimeoutChange, onLogout }: { automationCommand: AutomationCommand | null; onAutomationComplete: (commandKey: string) => void; authTimeoutHours: number; onAuthTimeoutChange: (hours: number) => Promise<void>; onLogout: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, workspaces, activeWorkspace, activeWorkspaceId, defaultWorkspaceId, loading, saving, refreshing, error, setError, commit, createWorkspace, selectWorkspace, setDefaultWorkspace, renameWorkspace, updateSelectedCategoryPaths, updatePinnedCategoryPaths, refresh } = useNotesSync();
  const [tab, setTab] = useState<Tab>('workspace');
  const [path, setPath] = useState<CategoryPath>([]);
  const [promptMode, setPromptMode] = useState<ModalMode>(null);
  const [promptPath, setPromptPath] = useState<CategoryPath | null>(null);
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [selectedNote, setSelectedNote] = useState<FlatNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [moveVisible, setMoveVisible] = useState(false);
  const [moveCopyAction, setMoveCopyAction] = useState<MoveCopyAction>('move');
  const [boardTopActionsVisible, setBoardTopActionsVisible] = useState(true);
  const runningAutomationKey = useRef<string | null>(null);

  const currentItems = path.length ? getCategoryItems(data, path) : null;
  const childCategories = useMemo(() => (currentItems ? listChildCategories(currentItems, path) : []), [currentItems, path]);
  const notes = useMemo(() => (path.length ? listNotesAtPath(data, path) : []), [data, path]);
  const activeTitle = path.length ? path[path.length - 1] : activeWorkspace?.name ?? 'Workspace';
  const showingRootBoard = !loading && tab === 'workspace' && path.length === 0;

  useEffect(() => {
    if (!automationCommand || loading || runningAutomationKey.current === automationCommand.key) return;
    runningAutomationKey.current = automationCommand.key;

    async function runAutomationCommand(command: AutomationCommand) {
      const ok = await commitWithHistory(addNote(data, command.categoryPath, command.note), formatAddedNoteHistory(command.note, command.categoryPath));
      if (ok) {
        setTab('workspace');
        setPath(command.categoryPath);
      }
      onAutomationComplete(command.key);
      runningAutomationKey.current = null;
    }

    runAutomationCommand(automationCommand).catch(() => {
      setError('Automation note could not be saved.');
      onAutomationComplete(automationCommand.key);
      runningAutomationKey.current = null;
    });
  }, [automationCommand, commit, data, loading, onAutomationComplete, setError]);

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
      return commitWithHistory(createSubcategory(data, parentPath, value), `${formatHistoryPath(nextPath)} category created - ${formatHistoryPath(nextPath)} - ${formatHistoryTime()} - Event: SUBCATEGORY_CREATED - Parent: ${formatHistoryPath(parentPath)}`);
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
    setMoveCopyAction(action);
    setMoveVisible(true);
  }

  async function runDelete() {
    if (!deleteTarget) return false;
    if (deleteTarget.type === 'note') {
      return commitWithHistory(deleteNote(data, deleteTarget.note.path, deleteTarget.note.note, deleteTarget.note.index), `${deleteTarget.note.note} deleted - ${formatHistoryPath(deleteTarget.note.path)} - ${formatHistoryTime()} - Event: NOTE_DELETED`);
    }

    const parent = deleteTarget.path.slice(0, -1);
    const ok = await commitWithHistory(deleteCategory(data, deleteTarget.path), `${formatHistoryPath(deleteTarget.path)} category deleted - ${formatHistoryPath(deleteTarget.path)} - ${formatHistoryTime()} - Event: CATEGORY_DELETED`);
    if (ok) {
      await removeWorkspaceCategoryPath(deleteTarget.path);
      await removeWorkspacePinnedCategoryPath(deleteTarget.path);
      if (startsWithPath(path, deleteTarget.path)) setPath(parent);
    }
    return ok;
  }

  async function importData(nextData: NotesData) {
    return commit({ ok: true, data: nextData });
  }

  async function addBoardNote(notePath: CategoryPath, text: string) {
    return addWorkspaceNote(notePath, text);
  }

  async function addWorkspaceNote(notePath: CategoryPath, text: string) {
    return commitWithHistory(addNote(data, notePath, text), formatAddedNoteHistory(text, notePath));
  }

  async function setNoteOrderPriority(note: FlatNote, priority: number) {
    return commit(setNotePriority(data, note.path, note.note, priority, note.index));
  }

  async function toggleWorkspaceCategory(categoryPath: CategoryPath) {
    const selected = activeWorkspace?.selectedCategoryPaths ?? [];
    const key = categoryPath.join('\u001f');
    const exists = selected.some((item) => item.join('\u001f') === key);
    const nextSelected = exists ? selected.filter((item) => item.join('\u001f') !== key) : [...selected, categoryPath];
    return updateSelectedCategoryPaths(nextSelected);
  }

  async function setWorkspaceCategoryPriority(categoryPath: CategoryPath, priority: number) {
    const selected = activeWorkspace?.selectedCategoryPaths ?? [];
    const key = categoryPath.join('\u001f');
    const withoutCategory = selected.filter((item) => item.join('\u001f') !== key);
    const insertionIndex = Math.max(0, Math.min(priority - 1, withoutCategory.length));
    const nextSelected = [...withoutCategory.slice(0, insertionIndex), categoryPath, ...withoutCategory.slice(insertionIndex)];
    return updateSelectedCategoryPaths(nextSelected);
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
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" onScroll={handleScreenScroll} scrollEventThrottle={16}>
        <View style={[styles.workspaceCard, showingRootBoard && styles.workspaceCardBoard]}>
          {error ? <ErrorBanner message={error} colors={colors} styles={styles} onDismiss={() => setError(null)} /> : null}
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
                  onOpenAi={() => setTab('ai')}
                  onAuthTimeoutChange={onAuthTimeoutChange}
                  onLogout={onLogout}
                  onOpenCategory={setPath}
                  onCreateRootCategory={() => setPromptMode('root')}
                  onToggleCategory={toggleWorkspaceCategory}
                  onSetCategoryPriority={setWorkspaceCategoryPriority}
                  onAddNote={addBoardNote}
                  onCreateSubcategory={(categoryPath) => { setPromptPath(categoryPath); setPromptMode('subcategory'); }}
                  onRenameCategory={(categoryPath) => { setPath(categoryPath); setPromptMode('rename'); }}
                  onDeleteCategory={(categoryPath) => setDeleteTarget({ type: 'category', path: categoryPath })}
                  onEditNote={(note) => { setSelectedNote(note); setEditorMode('edit'); }}
                  onMoveNote={(note) => openMoveCopy(note, 'move')}
                  onCopyNote={(note) => openMoveCopy(note, 'copy')}
                  onSetNotePriority={setNoteOrderPriority}
                  onDeleteNote={confirmDeleteNote}
                />
              ) : (
                <View style={styles.sectionStack}>
                  <WorkspaceHeader
                    title={activeTitle}
                    path={path}
                    workspaceName={activeWorkspace?.name ?? 'Workspace'}
                    colors={colors}
                    styles={styles}
                    onBack={() => setPath(path.slice(0, -1))}
                    onOpenSearch={() => setTab('search')}
                    onOpenSettings={() => setTab('settings')}
                    onOpenAi={() => setTab('ai')}
                  />
                  <ActionGrid
                    styles={styles}
                    onAddNote={() => setEditorMode('add')}
                    onSubcategory={() => { setPromptPath(path); setPromptMode('subcategory'); }}
                    onRename={() => setPromptMode('rename')}
                    onDelete={confirmDeleteCategory}
                  />
                  {childCategories.length ? <CategoryList categories={childCategories} onSelect={setPath} /> : null}
                  {notes.length ? (
                    <NoteList
                      notes={notes}
                      onEdit={(note) => { setSelectedNote(note); setEditorMode('edit'); }}
                      onMove={(note) => openMoveCopy(note, 'move')}
                      onCopy={(note) => openMoveCopy(note, 'copy')}
                      onSetPriority={setNoteOrderPriority}
                      onDelete={confirmDeleteNote}
                    />
                  ) : <EmptyState title="No notes here" message="This category is ready for notes or subcategories." actionLabel="Add note" onAction={() => setEditorMode('add')} />}
                </View>
              )}
            </View>
          ) : null}
          {!loading && tab === 'search' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="Search" colors={colors} styles={styles} onBack={() => setTab('workspace')} />
              <SearchPanel data={data} onSelect={(note) => { setPath(note.path); setTab('workspace'); }} />
            </View>
          ) : null}
          {!loading && tab === 'settings' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="Settings" colors={colors} styles={styles} onBack={() => setTab('workspace')} />
              <SettingsPanel data={data} authTimeoutHours={authTimeoutHours} onAuthTimeoutChange={onAuthTimeoutChange} onImport={importData} />
            </View>
          ) : null}
          {!loading && tab === 'ai' ? (
            <View style={styles.sectionStack}>
              <PanelHeader title="AI" colors={colors} styles={styles} onBack={() => setTab('workspace')} />
              <AiChatPanel data={data} />
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
        onClose={() => { setPromptMode(null); setPromptPath(null); }}
        onSubmit={submitPrompt}
      />
      <NoteEditorModal
        visible={editorMode !== null}
        title={editorMode === 'edit' ? 'Edit note' : 'Add note'}
        initialText={editorMode === 'edit' ? selectedNote?.note ?? '' : ''}
        onClose={() => { setEditorMode(null); setSelectedNote(null); }}
        onSubmit={(text) => editorMode === 'edit' && selectedNote ? commitWithHistory(editNote(data, selectedNote.path, selectedNote.note, text, selectedNote.index), `${selectedNote.note} edited to ${text.trim()} - ${formatHistoryPath(selectedNote.path)} - ${formatHistoryTime()} - Event: NOTE_EDITED`) : addWorkspaceNote(path, text)}
      />
      <MoveCopyModal
        visible={moveVisible}
        action={moveCopyAction}
        data={data}
        pinnedPaths={activeWorkspace?.pinnedCategoryPaths ?? []}
        onClose={() => { setMoveVisible(false); setSelectedNote(null); }}
        onTogglePin={togglePinnedMoveCopyCategory}
        onResetPins={() => updatePinnedCategoryPaths([])}
        onMove={(destination) => selectedNote ? commitWithHistory(moveNote(data, selectedNote.path, destination, selectedNote.note, selectedNote.index), `${selectedNote.note} moved - ${formatHistoryPath(destination)} - ${formatHistoryTime()} - Event: NOTE_MOVED - From: ${formatHistoryPath(selectedNote.path)}`) : false}
        onCopy={(destination) => selectedNote ? commitWithHistory(copyNote(data, selectedNote.path, destination, selectedNote.note, selectedNote.index), `${selectedNote.note} copied - ${formatHistoryPath(destination)} - ${formatHistoryTime()} - Event: NOTE_COPIED - From: ${formatHistoryPath(selectedNote.path)}`) : false}
      />
      <ConfirmModal
        visible={deleteTarget !== null}
        title={deleteTarget?.type === 'category' ? 'Delete category?' : 'Delete note?'}
        message={deleteTarget?.type === 'category' ? categoryDeleteMessage(data, deleteTarget.path) : 'This note will be removed from this category.'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={runDelete}
      />
    </SafeAreaView>
  );
}

function categoryDeleteMessage(data: NotesData, path: CategoryPath) {
  const counts = countCategoryContents(data, path);
  return `${counts.notes} notes and ${counts.categories} subcategories will be deleted.`;
}

function startsWithPath(path: CategoryPath, prefix: CategoryPath) {
  return prefix.every((segment, index) => path[index] === segment);
}

function WorkspaceHeader({ title, path, workspaceName, colors, styles, onBack, onOpenSearch, onOpenSettings, onOpenAi }: { title: string; path: CategoryPath; workspaceName: string; colors: typeof import('./src/shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onBack: () => void; onOpenSearch: () => void; onOpenSettings: () => void; onOpenAi: () => void }) {
  return (
    <View style={styles.header}>
      {path.length ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
          <Icon name="arrow-back" size={20} color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.eyebrow}>{path.length ? `${workspaceName} / ${formatPath(path)}` : workspaceName}</Text>
        <Text style={styles.heading}>{title}</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open AI" onPress={onOpenAi} style={styles.headerIconButton}>
          <Icon name="sparkles-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open search" onPress={onOpenSearch} style={styles.headerIconButton}>
          <Icon name="search-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={onOpenSettings} style={styles.headerIconButton}>
          <Icon name="settings-outline" size={17} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function PanelHeader({ title, colors, styles, onBack }: { title: string; colors: typeof import('./src/shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to workspace" onPress={onBack} style={styles.backButton}>
        <Icon name="arrow-back" size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.eyebrow}>Workspace</Text>
        <Text style={styles.heading}>{title}</Text>
      </View>
    </View>
  );
}

function ActionGrid({ styles, onAddNote, onSubcategory, onRename, onDelete }: { styles: ReturnType<typeof createStyles>; onAddNote: () => void; onSubcategory: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <View style={styles.actionGrid}>
      <Button label="Note" icon="add" onPress={onAddNote} style={styles.gridButton} />
      <Button label="Folder" icon="folder-outline" variant="secondary" onPress={onSubcategory} style={styles.gridButton} />
      <Button label="Rename" icon="create-outline" variant="secondary" onPress={onRename} style={styles.gridButton} />
      <Button label="Delete" icon="trash-outline" variant="danger" onPress={onDelete} style={styles.gridButton} />
    </View>
  );
}

function ErrorBanner({ message, colors, styles, onDismiss }: { message: string; colors: typeof import('./src/shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onDismiss: () => void }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onDismiss} style={styles.dismiss}><Icon name="close" size={18} color={colors.semanticError} /></Pressable>
    </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  headerText: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  headerIconButton: { width: 38, height: 38, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  eyebrow: { ...typography.captionBold, color: colors.primary },
  heading: { ...typography.heading2, color: colors.ink },
  sectionStack: { gap: spacing.md },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridButton: { flexGrow: 1, minWidth: 132 },
  loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  loadingText: { ...typography.bodySm, color: colors.slate },
  errorBanner: { backgroundColor: colors.cardTintRose, borderRadius: rounded.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorText: { ...typography.bodySmMedium, color: colors.semanticError, flex: 1 },
  dismiss: { width: 32, height: 32, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center' },
  });
}