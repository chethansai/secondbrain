import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { countCategoryContents, createRootCategory, createSubcategory, formatPath, getCategoryItems, listChildCategories, renameCategory, deleteCategory, setCategoryPriority } from '../categories/categoryTree';
import { NoteEditorModal } from '../editor/NoteEditorModal';
import { TextPromptModal } from '../editor/TextPromptModal';
import { MoveCopyModal } from '../notes/MoveCopyModal';
import { addNote, appendHistoryNote, copyNote, deleteNote, editNote, formatAddedNoteHistory, formatHistoryPath, formatHistoryTime, HISTORY_CATEGORY, listNotesAtPath, moveNote, setNotePriority } from '../notes/noteMutations';
import { removePinnedNote, removePinnedNotesInPath, replacePinnedNote, replacePinnedNotesInPath, sortPinnedNotesFirst, togglePinnedNote } from '../notes/pinnedNotes';
import { useAiWorkspaceSync } from '../sync/useAiWorkspaceSync';
import { WorkspaceBoard } from '../workspace/WorkspaceBoard';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, FlatNote, MutationResult, NotesData, PinnedNoteRef, WorkspaceMeta } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { CategoryList } from '../categories/CategoryList';
import { NoteList } from '../notes/NoteList';
import { copyText } from '../settings/clipboard';

type ModalMode = 'root' | 'subcategory' | 'rename' | null;
type MoveCopyAction = 'move' | 'copy';
type DeleteTarget = { type: 'category'; path: CategoryPath } | { type: 'note'; note: FlatNote } | null;
type PathStateByDocument = Record<string, CategoryPath[]>;
type PinnedNoteStateByDocument = Record<string, PinnedNoteRef[]>;

export function AiWorkspacePanel() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, documents, idMap, activeDocument, activeDocumentId, loading, saving, refreshing, localMode, error, setError, createFromJson, selectDocument, deleteDocument, commit, refresh } = useAiWorkspaceSync();
  const [jsonInput, setJsonInput] = useState('');
  const [documentMenuOpen, setDocumentMenuOpen] = useState(false);
  const [path, setPath] = useState<CategoryPath>([]);
  const [selectedPathsByDocument, setSelectedPathsByDocument] = useState<PathStateByDocument>({});
  const [pinnedPathsByDocument, setPinnedPathsByDocument] = useState<PathStateByDocument>({});
  const [pinnedNotesByDocument, setPinnedNotesByDocument] = useState<PinnedNoteStateByDocument>({});
  const [promptMode, setPromptMode] = useState<ModalMode>(null);
  const [promptPath, setPromptPath] = useState<CategoryPath | null>(null);
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [selectedNote, setSelectedNote] = useState<FlatNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [moveVisible, setMoveVisible] = useState(false);
  const [moveCopyAction, setMoveCopyAction] = useState<MoveCopyAction>('move');
  const activeSelectionKey = activeDocumentId ?? 'none';
  const selectedCategoryPaths = selectedPathsByDocument[activeSelectionKey] ?? [];
  const pinnedCategoryPaths = pinnedPathsByDocument[activeSelectionKey] ?? [];
  const pinnedNotes = pinnedNotesByDocument[activeSelectionKey] ?? [];
  const workspace = useMemo<WorkspaceMeta | null>(() => activeDocument ? {
    id: activeDocument.documentId,
    name: activeDocument.name,
    selectedCategoryPaths,
    pinnedCategoryPaths,
    pinnedNotes,
    teleprompterEnabled: true,
    teleprompterCategories: [],
  } : null, [activeDocument, pinnedCategoryPaths, pinnedNotes, selectedCategoryPaths]);
  const currentItems = path.length ? getCategoryItems(data, path) : null;
  const childCategories = useMemo(() => (currentItems ? listChildCategories(currentItems, path) : []), [currentItems, path]);
  const notes = useMemo(() => (path.length ? sortPinnedNotesFirst(listNotesAtPath(data, path), pinnedNotes) : []), [data, path, pinnedNotes]);
  const activeTitle = path.length ? path[path.length - 1] : activeDocument?.name ?? 'AI WORKSPACE';

  async function generateDocument() {
    const ok = await createFromJson(jsonInput);
    if (ok) {
      setJsonInput('');
      setPath([]);
      setDocumentMenuOpen(false);
    }
  }

  async function selectAiDocument(documentId: string) {
    setPath([]);
    setDocumentMenuOpen(false);
    await selectDocument(documentId);
  }

  async function runDeleteDocument() {
    if (!deleteDocumentId) return false;
    const ok = await deleteDocument(deleteDocumentId);
    if (ok) {
      setPath([]);
      setDocumentMenuOpen(false);
      setSelectedPathsByDocument((current) => removeDocumentPathState(current, deleteDocumentId));
      setPinnedPathsByDocument((current) => removeDocumentPathState(current, deleteDocumentId));
      setPinnedNotesByDocument((current) => removeDocumentPinnedNoteState(current, deleteDocumentId));
    }
    return ok;
  }

  async function commitWithHistory(result: MutationResult, historyText: string) {
    if (!result.ok) return commit(result);
    const ok = await commit(appendHistoryNote(result.data, historyText));
    if (ok) includeWorkspaceCategory(HISTORY_CATEGORY);
    return ok;
  }

  async function submitPrompt(value: string) {
    if (promptMode === 'root') {
      const cleanName = value.trim();
      const result = createRootCategory(data, value);
      const ok = await commitWithHistory(result, `${cleanName} category created - ${cleanName} - ${formatHistoryTime()} - Event: CATEGORY_CREATED`);
      if (ok && result.ok) includeWorkspaceCategory(cleanName);
      return ok;
    }
    if (promptMode === 'subcategory') {
      const parentPath = promptPath ?? path;
      const cleanName = value.trim();
      const nextPath = [...parentPath, cleanName];
      return commitWithHistory(createSubcategory(data, parentPath, value), `${formatHistoryPath(nextPath)} category created - ${formatHistoryPath(nextPath)} - ${formatHistoryTime()} - Event: SUBCATEGORY_CREATED - Parent: ${formatHistoryPath(parentPath)}`);
    }
    if (promptMode === 'rename') {
      const oldPath = path;
      const result = renameCategory(data, oldPath, value);
      const newPath = [...oldPath.slice(0, -1), value.trim()];
      const ok = await commitWithHistory(result, `${formatHistoryPath(oldPath)} renamed to ${formatHistoryPath(newPath)} - ${formatHistoryPath(newPath)} - ${formatHistoryTime()} - Event: CATEGORY_RENAMED`);
      if (ok && result.ok) {
        setPath(newPath);
        replaceWorkspaceCategoryPath(oldPath, newPath);
        replaceWorkspacePinnedCategoryPath(oldPath, newPath);
        updatePinnedNotes(replacePinnedNotesInPath(oldPath, newPath, pinnedNotes));
      }
      return ok;
    }
    return false;
  }

  async function addWorkspaceNote(notePath: CategoryPath, text: string) {
    return commitWithHistory(addNote(data, notePath, text), formatAddedNoteHistory(text, notePath));
  }

  async function setNoteOrderPriority(note: FlatNote, priority: number) {
    const result = setNotePriority(data, note.path, note.note, priority, note.index);
    const ok = await commit(result);
    if (ok && result.ok) {
      const reorderedNotes = listNotesAtPath(result.data, note.path);
      const nextNote = reorderedNotes[Math.max(0, Math.min(priority - 1, reorderedNotes.length - 1))];
      if (nextNote?.note === note.note) updatePinnedNotes(replacePinnedNote(note, nextNote, pinnedNotes));
    }
    return ok;
  }

  async function submitNoteEdit(text: string) {
    if (!selectedNote) return addWorkspaceNote(path, text);
    const ok = await commitWithHistory(editNote(data, selectedNote.path, selectedNote.note, text, selectedNote.index), `${selectedNote.note} edited to ${text.trim()} - ${formatHistoryPath(selectedNote.path)} - ${formatHistoryTime()} - Event: NOTE_EDITED`);
    if (ok) updatePinnedNotes(replacePinnedNote(selectedNote, { ...selectedNote, note: text.trim() }, pinnedNotes));
    return ok;
  }

  async function runDelete() {
    if (!deleteTarget) return false;
    if (deleteTarget.type === 'note') {
      const ok = await commitWithHistory(deleteNote(data, deleteTarget.note.path, deleteTarget.note.note, deleteTarget.note.index), `${deleteTarget.note.note} deleted - ${formatHistoryPath(deleteTarget.note.path)} - ${formatHistoryTime()} - Event: NOTE_DELETED`);
      if (ok) updatePinnedNotes(removePinnedNote(deleteTarget.note, pinnedNotes));
      return ok;
    }
    const parent = deleteTarget.path.slice(0, -1);
    const ok = await commitWithHistory(deleteCategory(data, deleteTarget.path), `${formatHistoryPath(deleteTarget.path)} category deleted - ${formatHistoryPath(deleteTarget.path)} - ${formatHistoryTime()} - Event: CATEGORY_DELETED`);
    if (ok) {
      removeWorkspaceCategoryPath(deleteTarget.path);
      removeWorkspacePinnedCategoryPath(deleteTarget.path);
      updatePinnedNotes(removePinnedNotesInPath(deleteTarget.path, pinnedNotes));
      if (startsWithPath(path, deleteTarget.path)) setPath(parent);
    }
    return ok;
  }

  function updateSelectedCategoryPaths(paths: CategoryPath[]) {
    setSelectedPathsByDocument((current) => ({ ...current, [activeSelectionKey]: dedupePaths(paths) }));
  }

  function updatePinnedCategoryPaths(paths: CategoryPath[]) {
    setPinnedPathsByDocument((current) => ({ ...current, [activeSelectionKey]: dedupePaths(paths) }));
  }

  function updatePinnedNotes(notes: PinnedNoteRef[]) {
    setPinnedNotesByDocument((current) => ({ ...current, [activeSelectionKey]: dedupePinnedNotes(notes) }));
  }

  function toggleWorkspaceCategory(categoryPath: CategoryPath) {
    const key = pathKey(categoryPath);
    const exists = selectedCategoryPaths.some((item) => pathKey(item) === key);
    updateSelectedCategoryPaths(exists ? selectedCategoryPaths.filter((item) => pathKey(item) !== key) : [...selectedCategoryPaths, categoryPath]);
  }

  function setWorkspaceCategoryPriority(categoryPath: CategoryPath, priority: number, visibleCategoryPaths?: CategoryPath[]) {
    const key = pathKey(categoryPath);
    const selected = visibleCategoryPaths?.length ? visibleCategoryPaths : selectedCategoryPaths;
    const withoutCategory = selected.filter((item) => pathKey(item) !== key);
    const insertionIndex = Math.max(0, Math.min(priority - 1, withoutCategory.length));
    updateSelectedCategoryPaths([...withoutCategory.slice(0, insertionIndex), categoryPath, ...withoutCategory.slice(insertionIndex)]);
  }

  function setSubcategoryOrderPriority(categoryPath: CategoryPath, priority: number) {
    return commit(setCategoryPriority(data, categoryPath, priority));
  }

  function includeWorkspaceCategory(categoryName: string) {
    if (!categoryName || selectedCategoryPaths.some((item) => item[0] === categoryName)) return;
    updateSelectedCategoryPaths([...selectedCategoryPaths, [categoryName]]);
  }

  function replaceWorkspaceCategoryPath(oldPath: CategoryPath, newPath: CategoryPath) {
    updateSelectedCategoryPaths(selectedCategoryPaths.map((item) => startsWithPath(item, oldPath) ? [...newPath, ...item.slice(oldPath.length)] : item));
  }

  function removeWorkspaceCategoryPath(categoryPath: CategoryPath) {
    updateSelectedCategoryPaths(selectedCategoryPaths.filter((item) => !startsWithPath(item, categoryPath)));
  }

  function togglePinnedMoveCopyCategory(categoryPath: CategoryPath) {
    const key = pathKey(categoryPath);
    const exists = pinnedCategoryPaths.some((item) => pathKey(item) === key);
    updatePinnedCategoryPaths(exists ? pinnedCategoryPaths.filter((item) => pathKey(item) !== key) : [...pinnedCategoryPaths, categoryPath]);
  }

  function toggleNotePin(note: FlatNote) {
    updatePinnedNotes(togglePinnedNote(note, pinnedNotes));
  }

  async function copyNoteText(note: FlatNote) {
    const copied = await copyText(note.note);
    if (!copied) setError('Clipboard copy is not available on this device.');
  }

  function replaceWorkspacePinnedCategoryPath(oldPath: CategoryPath, newPath: CategoryPath) {
    updatePinnedCategoryPaths(pinnedCategoryPaths.map((item) => startsWithPath(item, oldPath) ? [...newPath, ...item.slice(oldPath.length)] : item));
  }

  function removeWorkspacePinnedCategoryPath(categoryPath: CategoryPath) {
    updatePinnedCategoryPaths(pinnedCategoryPaths.filter((item) => !startsWithPath(item, categoryPath)));
  }

  function openMoveCopy(note: FlatNote, action: MoveCopyAction) {
    setSelectedNote(note);
    setMoveCopyAction(action);
    setMoveVisible(true);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.controls}>
        <View style={styles.documentControlRow}>
          <View style={styles.documentSelectWrap}>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose AI workspace document" onPress={() => setDocumentMenuOpen((current) => !current)} style={styles.documentSelectButton}>
              <Icon name="albums-outline" size={16} color={colors.primary} />
              <Text style={styles.documentSelectText} numberOfLines={1}>{activeDocument?.name ?? 'No AI document'}</Text>
              <Icon name="chevron-down" size={13} color={colors.slate} />
            </Pressable>
            {documentMenuOpen ? (
              <View style={styles.documentMenu}>
                {documents.length ? documents.map((document) => (
                  <Pressable key={document.documentId} accessibilityRole="button" accessibilityLabel={`Open ${document.name}`} onPress={() => selectAiDocument(document.documentId)} style={[styles.documentMenuRow, document.documentId === activeDocumentId && styles.documentMenuRowActive]}>
                    <Text style={[styles.documentMenuText, document.documentId === activeDocumentId && styles.documentMenuTextActive]} numberOfLines={1}>{document.name}</Text>
                    <Text style={[styles.documentMenuId, document.documentId === activeDocumentId && styles.documentMenuTextActive]}>{document.id}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${document.name}`} onPress={(event) => { event.stopPropagation(); setDeleteDocumentId(document.documentId); }} style={[styles.documentDeleteButton, document.documentId === activeDocumentId && styles.documentDeleteButtonActive]}>
                      <Icon name="trash-outline" size={12} color={document.documentId === activeDocumentId ? colors.onPrimary : colors.semanticError} />
                    </Pressable>
                  </Pressable>
                )) : <Text style={styles.emptyMenuText}>No documents</Text>}
              </View>
            ) : null}
          </View>
          <Button label="Reload" icon="reload-outline" variant="secondary" disabled={refreshing} onPress={refresh} style={styles.reloadButton} />
        </View>

        <TextInput
          accessibilityLabel="AI workspace JSON input"
          value={jsonInput}
          onChangeText={(text) => { setError(null); setJsonInput(text); }}
          placeholder={'{"Tasks":["Review notes"]}'}
          placeholderTextColor={colors.stone}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.jsonInput}
        />
        <View style={styles.generateRow}>
          <Button label="Generate" icon="sparkles-outline" disabled={saving || !jsonInput.trim()} onPress={generateDocument} style={styles.generateButton} />
          {saving ? <ActivityIndicator color={colors.primary} /> : null}
          {localMode ? <Text style={styles.statusText}>Local</Text> : null}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.statusText}>Loading AI workspace</Text></View>
      ) : null}

      {!loading && !activeDocument ? (
        <EmptyState title="No AI workspace" message="Paste main JSON and generate a document." />
      ) : null}

      {!loading && activeDocument && workspace && path.length === 0 ? (
        <WorkspaceBoard
          data={data}
          workspaces={[workspace]}
          activeWorkspace={workspace}
          activeWorkspaceId={workspace.id}
          defaultWorkspaceId={workspace.id}
          saving={saving}
          refreshing={refreshing}
          floatingActionsVisible
          onSelectWorkspace={selectAiDocument}
          onSetDefaultWorkspace={() => undefined}
          onCreateWorkspace={() => undefined}
          onRenameWorkspace={() => undefined}
          onRefresh={refresh}
          onOpenSearch={() => undefined}
          onOpenSettings={() => undefined}
          onOpenAiChat={() => undefined}
          onOpenAiNotifications={() => undefined}
          onOpenAi={() => undefined}
          onOpenAiWorkspace={() => undefined}
          onLogout={() => undefined}
          onStartFloatingIcon={() => false}
          overlayAvailable={false}
          onOpenCategory={setPath}
          onCreateRootCategory={() => setPromptMode('root')}
          onToggleCategory={toggleWorkspaceCategory}
          onToggleCategoryPin={togglePinnedMoveCopyCategory}
          onSetCategoryPriority={setWorkspaceCategoryPriority}
          onSetSubcategoryPriority={setSubcategoryOrderPriority}
          onAddNote={addWorkspaceNote}
          onCreateSubcategory={(categoryPath) => { setPromptPath(categoryPath); setPromptMode('subcategory'); }}
          onCopyCategory={() => undefined}
          onRenameCategory={(categoryPath) => { setPath(categoryPath); setPromptMode('rename'); }}
          onDeleteCategory={(categoryPath) => setDeleteTarget({ type: 'category', path: categoryPath })}
          onEditNote={(note) => { setSelectedNote(note); setEditorMode('edit'); }}
          onMoveNote={(note) => openMoveCopy(note, 'move')}
          onCopyNote={(note) => openMoveCopy(note, 'copy')}
          onCopyNoteText={(note) => { copyNoteText(note).catch(() => setError('Clipboard copy failed.')); }}
          onSetNotePriority={setNoteOrderPriority}
          onToggleNotePin={toggleNotePin}
          onDeleteNote={(note) => setDeleteTarget({ type: 'note', note })}
        />
      ) : null}

      {!loading && activeDocument && path.length > 0 ? (
        <View style={styles.sectionStack}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setPath(path.slice(0, -1))} style={styles.backButton}>
              <Icon name="arrow-back" size={20} color={colors.ink} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>{activeDocument.name} / {formatPath(path)}</Text>
              <Text style={styles.heading}>{activeTitle}</Text>
            </View>
          </View>
          <View style={styles.actionGrid}>
            <Button label="Note" icon="add" onPress={() => setEditorMode('add')} style={styles.gridButton} />
            <Button label="Folder" icon="folder-outline" variant="secondary" onPress={() => { setPromptPath(path); setPromptMode('subcategory'); }} style={styles.gridButton} />
            <Button label="Rename" icon="create-outline" variant="secondary" onPress={() => setPromptMode('rename')} style={styles.gridButton} />
            <Button label="Delete" icon="trash-outline" variant="danger" onPress={() => setDeleteTarget({ type: 'category', path })} style={styles.gridButton} />
          </View>
          {childCategories.length ? <CategoryList categories={childCategories} onSelect={setPath} /> : null}
          {notes.length ? (
            <NoteList
              notes={notes}
              onEdit={(note) => { setSelectedNote(note); setEditorMode('edit'); }}
              onMove={(note) => openMoveCopy(note, 'move')}
              onCopy={(note) => openMoveCopy(note, 'copy')}
              onCopyText={(note) => { copyNoteText(note).catch(() => setError('Clipboard copy failed.')); }}
              onSetPriority={setNoteOrderPriority}
              onTogglePin={toggleNotePin}
              onDelete={(note) => setDeleteTarget({ type: 'note', note })}
              pinnedNotes={pinnedNotes}
            />
          ) : <EmptyState title="No notes here" message="This AI category is ready for notes or subcategories." actionLabel="Add note" onAction={() => setEditorMode('add')} />}
        </View>
      ) : null}

      {documents.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.idMapList}>
          {Object.entries(idMap).map(([id, documentId]) => <Text key={id} style={styles.idMapChip}>{id} - {documentId}</Text>)}
        </ScrollView>
      ) : null}

      <TextPromptModal
        visible={promptMode !== null}
        title={promptMode === 'rename' ? 'Rename category' : promptMode === 'subcategory' ? 'New subcategory' : 'New root category'}
        label="Category name"
        initialValue={promptMode === 'rename' ? activeTitle : ''}
        submitLabel="Save category"
        onClose={() => { setPromptMode(null); setPromptPath(null); }}
        onSubmit={submitPrompt}
      />
      <NoteEditorModal
        visible={editorMode !== null}
        title={editorMode === 'edit' ? 'Edit note' : 'Add note'}
        initialText={editorMode === 'edit' ? selectedNote?.note ?? '' : ''}
        onClose={() => { setEditorMode(null); setSelectedNote(null); }}
        onSubmit={(text) => editorMode === 'edit' ? submitNoteEdit(text) : addWorkspaceNote(path, text)}
      />
      <MoveCopyModal
        visible={moveVisible}
        action={moveCopyAction}
        data={data}
        pinnedPaths={pinnedCategoryPaths}
        onClose={() => { setMoveVisible(false); setSelectedNote(null); }}
        onTogglePin={togglePinnedMoveCopyCategory}
        onResetPins={() => updatePinnedCategoryPaths([])}
        onMove={async (destination) => {
          if (!selectedNote) return false;
          const ok = await commitWithHistory(moveNote(data, selectedNote.path, destination, selectedNote.note, selectedNote.index), `${selectedNote.note} moved - ${formatHistoryPath(destination)} - ${formatHistoryTime()} - Event: NOTE_MOVED - From: ${formatHistoryPath(selectedNote.path)}`);
          if (ok) updatePinnedNotes(removePinnedNote(selectedNote, pinnedNotes));
          return ok;
        }}
        onCopy={(destination) => selectedNote ? commitWithHistory(copyNote(data, selectedNote.path, destination, selectedNote.note, selectedNote.index), `${selectedNote.note} copied - ${formatHistoryPath(destination)} - ${formatHistoryTime()} - Event: NOTE_COPIED - From: ${formatHistoryPath(selectedNote.path)}`) : false}
      />
      <ConfirmModal
        visible={deleteTarget !== null}
        title={deleteTarget?.type === 'category' ? 'Delete category?' : 'Delete note?'}
        message={deleteTarget?.type === 'category' ? categoryDeleteMessage(data, deleteTarget.path) : 'This note will be removed from this AI document.'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={runDelete}
      />
      <ConfirmModal
        visible={deleteDocumentId !== null}
        title="Delete AI document?"
        message={aiDocumentDeleteMessage(documents.find((document) => document.documentId === deleteDocumentId)?.id, deleteDocumentId)}
        onClose={() => setDeleteDocumentId(null)}
        onConfirm={runDeleteDocument}
      />
    </View>
  );
}

function categoryDeleteMessage(data: NotesData, path: CategoryPath) {
  const counts = countCategoryContents(data, path);
  return `${counts.notes} notes and ${counts.categories} subcategories will be deleted.`;
}

function startsWithPath(path: CategoryPath, prefix: CategoryPath) {
  return prefix.every((segment, index) => path[index] === segment);
}

function pathKey(path: CategoryPath) {
  return path.join('\u001f');
}

function dedupePaths(paths: CategoryPath[]) {
  return Array.from(new Map(paths.filter((path) => path.length > 0).map((path) => [pathKey(path), path])).values());
}

function dedupePinnedNotes(notes: PinnedNoteRef[]) {
  return Array.from(new Map(notes.filter((note) => note.path.length > 0 && note.note.length > 0 && note.index >= 0).map((note) => [`${pathKey(note.path)}\u001f${note.index}\u001f${note.note}`, note])).values());
}

function removeDocumentPathState(state: PathStateByDocument, documentId: string) {
  const { [documentId]: _removed, ...nextState } = state;
  return nextState;
}

function removeDocumentPinnedNoteState(state: PinnedNoteStateByDocument, documentId: string) {
  const { [documentId]: _removed, ...nextState } = state;
  return nextState;
}

function aiDocumentDeleteMessage(id: string | undefined, documentId: string | null) {
  const label = [id, documentId].filter(Boolean).join(' - ');
  return `${label || 'This AI document'} will be removed from the tracker and its AI JSON document will be deleted.`;
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.lg },
    controls: { gap: spacing.sm },
    documentControlRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, zIndex: 5 },
    documentSelectWrap: { flex: 1, zIndex: 5 },
    documentSelectButton: { minHeight: 44, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    documentSelectText: { ...typography.bodySmMedium, color: colors.ink, flex: 1, minWidth: 0 },
    documentMenu: { position: 'absolute', top: 48, left: 0, right: 0, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: spacing.xs, gap: spacing.xs, zIndex: 20 },
    documentMenuRow: { minHeight: 40, borderRadius: rounded.sm, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    documentMenuRowActive: { backgroundColor: colors.inkDeep },
    documentMenuText: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1, minWidth: 0 },
    documentMenuId: { ...typography.micro, color: colors.slate },
    documentMenuTextActive: { color: colors.onDark },
    documentDeleteButton: { width: 30, height: 30, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    documentDeleteButtonActive: { borderColor: colors.onPrimary, backgroundColor: 'transparent' },
    emptyMenuText: { ...typography.bodySm, color: colors.slate, padding: spacing.sm, textAlign: 'center' },
    reloadButton: { minWidth: 104 },
    jsonInput: { minHeight: 118, maxHeight: 220, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.surface, padding: spacing.md, color: colors.ink, ...typography.bodySm, textAlignVertical: 'top' },
    generateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    generateButton: { minWidth: 132 },
    statusText: { ...typography.bodySm, color: colors.slate },
    errorText: { ...typography.bodySmMedium, color: colors.semanticError },
    loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
    sectionStack: { gap: spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    backButton: { width: 40, height: 40, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    headerText: { flex: 1, minWidth: 0 },
    eyebrow: { ...typography.captionBold, color: colors.primary },
    heading: { ...typography.heading2, color: colors.ink },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
    gridButton: { flex: 1, minWidth: 80 },
    idMapList: { gap: spacing.xs, paddingVertical: spacing.xs },
    idMapChip: { ...typography.micro, color: colors.slate, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surface },
  });
}
