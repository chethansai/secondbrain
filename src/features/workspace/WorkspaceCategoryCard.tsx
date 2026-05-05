import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, shadows, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, CategorySummary, FlatNote } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { normalizeNoteText } from '../notes/noteMutations';

type Props = {
  category: CategorySummary;
  allCategories: CategorySummary[];
  notesByCategoryKey: Map<string, FlatNote[]>;
  notes: FlatNote[];
  priority: number;
  workspaceName: string;
  showWorkspaceIntro: boolean;
  zoom?: number;
  onOpen: () => void;
  onOpenCategory: (path: CategoryPath) => void;
  onAddNote: (path: CategoryPath, text: string) => Promise<boolean> | boolean;
  onCreateSubcategory: (path: CategoryPath) => void;
  onRenameCategory: (path: CategoryPath) => void;
  onDeleteCategory: (path: CategoryPath) => void;
  onEditNote: (note: FlatNote) => void;
  onMoveNote: (note: FlatNote) => void;
  onCopyNote: (note: FlatNote) => void;
  onSetNotePriority: (note: FlatNote, priority: number) => void;
  onDeleteNote: (note: FlatNote) => void;
};

type PreviewItem =
  | { type: 'category'; category: CategorySummary; order: number }
  | { type: 'note'; note: FlatNote; order: number };

export function WorkspaceCategoryCard({
  category,
  allCategories,
  notesByCategoryKey,
  notes,
  priority,
  workspaceName,
  showWorkspaceIntro,
  zoom = 1,
  onOpen,
  onOpenCategory,
  onAddNote,
  onCreateSubcategory,
  onRenameCategory,
  onDeleteCategory,
  onEditNote,
  onMoveNote,
  onCopyNote,
  onSetNotePriority,
  onDeleteNote,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark, zoom), [colors, isDark, zoom]);
  const tints = useMemo(() => createCategoryTints(colors, isDark), [colors, isDark]);
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(() => new Set());
  const tint = tints[(priority - 1) % tints.length];
  const childCategoriesByParentKey = useMemo(() => groupChildCategories(allCategories, category.path), [allCategories, category.path]);
  const childCategories = childCategoriesByParentKey.get(pathKey(category.path)) ?? [];
  const previewItems = useMemo(() => createOrderedPreviewItems(childCategories, notes), [childCategories, notes]);

  async function submitNote() {
    const text = normalizeNoteText(newNote);
    if (!text) {
      setAdding(false);
      return;
    }
    setBusy(true);
    const ok = await onAddNote(category.path, text);
    setBusy(false);
    if (ok) {
      setNewNote('');
      setAdding(false);
    }
  }

  function toggleCategory(path: CategoryPath) {
    const key = pathKey(path);
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

  return (
    <View style={[styles.card, { backgroundColor: tint }]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          {showWorkspaceIntro ? <Text style={styles.workspaceName} numberOfLines={1}>{workspaceName}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${category.name}, ${notes.length} notes, priority ${priority}`} onPress={onOpen} style={styles.titleButton}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>{category.name}</Text>
              <View style={styles.titleMeta}>
                <Text style={styles.titleMetaText}>{notes.length}</Text>
                <Text style={styles.titleMetaText}>{priority}</Text>
              </View>
            </View>
          </Pressable>
        </View>
        <View style={styles.headerMeta}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Add note to ${category.name}`} onPress={(event) => { event.stopPropagation(); setActionsOpen(false); setAdding(true); }} style={styles.iconButtonSmall}>
            <Icon name="add" size={12} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${category.name}`} onPress={(event) => { event.stopPropagation(); setActionsOpen((current) => !current); }} style={styles.iconButtonSmall}>
            <Icon name="settings-outline" size={12} color={colors.steel} />
          </Pressable>
        </View>
      </View>

      {actionsOpen ? (
        <View style={styles.actionsPanel}>
          <Button label="Rename" icon="create-outline" variant="secondary" onPress={() => { setActionsOpen(false); onRenameCategory(category.path); }} style={styles.panelButton} />
          <Button label="Folder" icon="folder-outline" variant="secondary" onPress={() => { setActionsOpen(false); onCreateSubcategory(category.path); }} style={styles.panelButton} />
          <Button label="Delete" icon="trash-outline" variant="danger" onPress={() => { setActionsOpen(false); onDeleteCategory(category.path); }} style={styles.panelButton} />
        </View>
      ) : null}

      <ScrollView
        style={styles.previewScroller}
        contentContainerStyle={styles.previewList}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={notes.length > 4}
      >
        {adding ? (
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.inlineAdd}>
            <TextInput
              value={newNote}
              onChangeText={setNewNote}
              autoCapitalize="sentences"
              placeholder="Add note"
              placeholderTextColor={colors.stone}
              accessibilityLabel={`New note in ${category.name}`}
              autoFocus
              editable={!busy}
              returnKeyType="done"
              onSubmitEditing={submitNote}
              style={styles.inlineInput}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel new note" onPress={(event) => { event.stopPropagation(); setAdding(false); setNewNote(''); }} style={styles.inlineIconButton}>
              <Icon name="close" size={11} color={colors.steel} />
            </Pressable>
          </Pressable>
        ) : null}

        {previewItems.length ? previewItems.map((item, index) => {
          const stackOrder = previewItems.length - index;
          if (item.type === 'category') {
            return (
              <View key={pathKey(item.category.path)} style={[styles.subcategoryBlock, { zIndex: stackOrder }]}> 
                <WorkspaceSubcategoryRow
                  category={item.category}
                  depth={0}
                  stackOrder={stackOrder}
                  expandedCategoryKeys={expandedCategoryKeys}
                  childCategoriesByParentKey={childCategoriesByParentKey}
                  notesByCategoryKey={notesByCategoryKey}
                  colors={colors}
                  styles={styles}
                  onToggleCategory={toggleCategory}
                  onOpenCategory={onOpenCategory}
                  onAddNote={onAddNote}
                  onCreateSubcategory={onCreateSubcategory}
                  onRenameCategory={onRenameCategory}
                  onDeleteCategory={onDeleteCategory}
                  onEditNote={onEditNote}
                  onMoveNote={onMoveNote}
                  onCopyNote={onCopyNote}
                  onSetNotePriority={onSetNotePriority}
                  onDeleteNote={onDeleteNote}
                />
              </View>
            );
          }

          return (
            <WorkspacePreviewNote key={`${item.note.path.join('/')}-${item.note.index}`} note={item.note} itemCount={previewItems.length} currentOrder={index + 1} stackOrder={stackOrder} colors={colors} styles={styles} onEdit={onEditNote} onMove={onMoveNote} onCopy={onCopyNote} onSetPriority={onSetNotePriority} onDelete={onDeleteNote} />
          );
        }) : !adding ? (
          <View style={styles.emptyPreview}><Text style={styles.emptyPreviewText}>No notes yet.</Text></View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function WorkspaceSubcategoryRow({ category, depth, stackOrder, expandedCategoryKeys, childCategoriesByParentKey, notesByCategoryKey, colors, styles, onToggleCategory, onOpenCategory, onAddNote, onCreateSubcategory, onRenameCategory, onDeleteCategory, onEditNote, onMoveNote, onCopyNote, onSetNotePriority, onDeleteNote }: { category: CategorySummary; depth: number; stackOrder: number; expandedCategoryKeys: Set<string>; childCategoriesByParentKey: Map<string, CategorySummary[]>; notesByCategoryKey: Map<string, FlatNote[]>; colors: typeof import('../../shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onToggleCategory: (path: CategoryPath) => void; onOpenCategory: (path: CategoryPath) => void; onAddNote: (path: CategoryPath, text: string) => Promise<boolean> | boolean; onCreateSubcategory: (path: CategoryPath) => void; onRenameCategory: (path: CategoryPath) => void; onDeleteCategory: (path: CategoryPath) => void; onEditNote: (note: FlatNote) => void; onMoveNote: (note: FlatNote) => void; onCopyNote: (note: FlatNote) => void; onSetNotePriority: (note: FlatNote, priority: number) => void; onDeleteNote: (note: FlatNote) => void }) {
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = pathKey(category.path);
  const children = childCategoriesByParentKey.get(key) ?? [];
  const childNotes = notesByCategoryKey.get(key) ?? [];
  const childItems = useMemo(() => createOrderedPreviewItems(children, childNotes), [children, childNotes]);
  const expanded = expandedCategoryKeys.has(key);
  const hasChildren = children.length > 0;
  const expandable = childItems.length > 0;
  const indent = Math.min(depth, 4) * styles.subcategoryIndent.width;

  async function submitNote() {
    const text = normalizeNoteText(newNote);
    if (!text) {
      setAdding(false);
      return;
    }
    setBusy(true);
    const ok = await onAddNote(category.path, text);
    setBusy(false);
    if (ok) {
      setNewNote('');
      setAdding(false);
      if (!expanded) onToggleCategory(category.path);
    }
  }

  return (
    <View style={[styles.subcategoryNode, { zIndex: stackOrder }]}>
      <View style={[styles.subcategoryRow, { marginLeft: indent }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expandable ? `${expanded ? 'Collapse' : 'Expand'} ${category.name}` : `${category.name} is empty`}
          disabled={!expandable}
          onPress={(event) => { event.stopPropagation(); onToggleCategory(category.path); }}
          style={[styles.subcategoryToggle, !expandable && styles.subcategoryToggleEmpty]}
        >
          {expandable ? <Icon name={expanded ? 'chevron-down' : 'chevron-forward'} size={10} color={colors.steel} /> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${category.name}`} onPress={() => onOpenCategory(category.path)} style={styles.subcategoryMain}>
          <Text style={styles.subcategoryName} numberOfLines={1}>{category.name}</Text>
          <View style={styles.subcategoryCounts}>
            {childNotes.length ? <Text style={styles.subcategoryCount}>{childNotes.length}</Text> : null}
            {hasChildren ? <Text style={styles.subcategoryCount}>{children.length}</Text> : null}
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Add note to ${category.name}`} onPress={(event) => { event.stopPropagation(); setAdding(true); }} style={styles.subcategoryAddButton}>
          <Icon name="add" size={10} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${category.name}`} onPress={(event) => { event.stopPropagation(); setActionsOpen((current) => !current); }} style={styles.subcategoryAddButton}>
          <Icon name="settings-outline" size={10} color={colors.steel} />
        </Pressable>
      </View>
      {actionsOpen ? (
        <View style={[styles.subcategoryActionsPanel, { marginLeft: indent + styles.subcategoryIndent.width }]}> 
          <Button label="Rename" icon="create-outline" variant="secondary" onPress={() => { setActionsOpen(false); onRenameCategory(category.path); }} style={styles.subcategoryPanelButton} />
          <Button label="Folder" icon="folder-outline" variant="secondary" onPress={() => { setActionsOpen(false); onCreateSubcategory(category.path); }} style={styles.subcategoryPanelButton} />
          <Button label="Delete" icon="trash-outline" variant="danger" onPress={() => { setActionsOpen(false); onDeleteCategory(category.path); }} style={styles.subcategoryPanelButton} />
        </View>
      ) : null}
      {adding ? (
        <Pressable onPress={(event) => event.stopPropagation()} style={[styles.inlineAdd, styles.subcategoryInlineAdd, { marginLeft: indent + styles.subcategoryIndent.width }]}> 
          <TextInput
            value={newNote}
            onChangeText={setNewNote}
            autoCapitalize="sentences"
            placeholder="Add note"
            placeholderTextColor={colors.stone}
            accessibilityLabel={`New note in ${category.name}`}
            autoFocus
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={submitNote}
            style={styles.inlineInput}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel new note" onPress={(event) => { event.stopPropagation(); setAdding(false); setNewNote(''); }} style={styles.inlineIconButton}>
            <Icon name="close" size={11} color={colors.steel} />
          </Pressable>
        </Pressable>
      ) : null}
      {expanded ? (
        <View style={[styles.subcategoryContents, { marginLeft: indent + styles.subcategoryIndent.width }]}>
          {childItems.map((item, index) => {
            const childStackOrder = childItems.length - index;
            if (item.type === 'category') {
              return (
                <WorkspaceSubcategoryRow
                  key={pathKey(item.category.path)}
                  category={item.category}
                  depth={depth + 1}
                  stackOrder={childStackOrder}
                  expandedCategoryKeys={expandedCategoryKeys}
                  childCategoriesByParentKey={childCategoriesByParentKey}
                  notesByCategoryKey={notesByCategoryKey}
                  colors={colors}
                  styles={styles}
                  onToggleCategory={onToggleCategory}
                  onOpenCategory={onOpenCategory}
                  onAddNote={onAddNote}
                  onCreateSubcategory={onCreateSubcategory}
                  onRenameCategory={onRenameCategory}
                  onDeleteCategory={onDeleteCategory}
                  onEditNote={onEditNote}
                  onMoveNote={onMoveNote}
                  onCopyNote={onCopyNote}
                  onSetNotePriority={onSetNotePriority}
                  onDeleteNote={onDeleteNote}
                />
              );
            }

            return (
              <WorkspacePreviewNote key={`${item.note.path.join('/')}-${item.note.index}`} note={item.note} itemCount={childItems.length} currentOrder={index + 1} stackOrder={childStackOrder} colors={colors} styles={styles} onEdit={onEditNote} onMove={onMoveNote} onCopy={onCopyNote} onSetPriority={onSetNotePriority} onDelete={onDeleteNote} />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function WorkspacePreviewNote({ note, itemCount, currentOrder, stackOrder, colors, styles, onEdit, onMove, onCopy, onSetPriority, onDelete }: { note: FlatNote; itemCount: number; currentOrder: number; stackOrder: number; colors: typeof import('../../shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onEdit: (note: FlatNote) => void; onMove: (note: FlatNote) => void; onCopy: (note: FlatNote) => void; onSetPriority: (note: FlatNote, priority: number) => void; onDelete: (note: FlatNote) => void }) {
  const [open, setOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [prioritySearch, setPrioritySearch] = useState('');
  const priorityScrollRef = useRef<ScrollView>(null);
  const priorityOptions = createPriorityOptions(itemCount, prioritySearch);
  const openUpward = currentOrder > Math.ceil(itemCount / 2);

  useEffect(() => {
    if (!priorityOpen || prioritySearch) return;
    requestAnimationFrame(() => {
      priorityScrollRef.current?.scrollTo({ y: Math.max(0, (currentOrder - 2) * previewPriorityOptionHeight), animated: true });
    });
  }, [currentOrder, priorityOpen, prioritySearch]);

  return (
    <View style={[styles.previewNote, open && styles.previewNoteMenuOpen, { zIndex: open ? 1000 : stackOrder }]}>
      <Text style={styles.previewText} numberOfLines={4}>{note.note}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Note actions" onPress={() => setOpen((current) => !current)} style={styles.previewMenuButton}>
        <Icon name="settings-outline" size={11} color={colors.steel} />
      </Pressable>
      {open ? (
        <View style={[styles.previewActions, openUpward && styles.previewActionsAbove]}>
          <Pressable onPress={() => { setOpen(false); onEdit(note); }} style={styles.previewAction}><Text style={styles.previewActionText}>Edit</Text></Pressable>
          <Pressable onPress={() => { setOpen(false); onMove(note); }} style={styles.previewAction}><Text style={styles.previewActionText}>Move</Text></Pressable>
          <Pressable onPress={() => setPriorityOpen((current) => !current)} style={styles.previewAction}><Text style={styles.previewActionText}>Order</Text></Pressable>
          {priorityOpen ? (
            <View style={styles.previewPriorityPicker}>
              <TextInput value={prioritySearch} onChangeText={setPrioritySearch} placeholder="Search number" placeholderTextColor={colors.stone} keyboardType="number-pad" style={styles.previewPrioritySearch} />
              <ScrollView ref={priorityScrollRef} style={styles.previewPriorityScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {priorityOptions.map((option) => {
                  const current = option === currentOrder;
                  return (
                    <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Set note order ${option}${current ? ', current order' : ''}`} onPress={() => { setOpen(false); setPriorityOpen(false); setPrioritySearch(''); onSetPriority(note, option); }} style={[styles.previewPriorityOption, current && styles.previewPriorityOptionCurrent]}>
                      <Text style={[styles.previewPriorityOptionText, current && styles.previewPriorityOptionTextCurrent]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <Pressable onPress={() => { setOpen(false); onDelete(note); }} style={styles.previewAction}><Text style={styles.previewActionDanger}>Delete</Text></Pressable>
          <Pressable onPress={() => { setOpen(false); onCopy(note); }} style={styles.previewAction}><Text style={styles.previewActionText}>Copy</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

const previewPriorityOptionHeight = 26;

function createPriorityOptions(count: number, search: string) {
  const cleanSearch = search.replace(/[^0-9]/g, '');
  return Array.from({ length: count }, (_, index) => index + 1).filter((option) => !cleanSearch || String(option).includes(cleanSearch));
}

function createOrderedPreviewItems(categories: CategorySummary[], notes: FlatNote[]): PreviewItem[] {
  return [
    ...categories.map((category) => ({ type: 'category' as const, category, order: category.itemIndex ?? 0 })),
    ...notes.map((note) => ({ type: 'note' as const, note, order: note.index })),
  ].sort((left, right) => right.order - left.order);
}

function groupChildCategories(categories: CategorySummary[], rootPath: CategoryPath) {
  const rootKey = pathKey(rootPath);
  return categories.reduce<Map<string, CategorySummary[]>>((groups, category) => {
    if (!isDescendantPath(rootPath, category.path)) return groups;
    const parentKey = pathKey(category.path.slice(0, -1));
    const siblings = groups.get(parentKey) ?? [];
    siblings.push(category);
    groups.set(parentKey, siblings);
    return groups;
  }, new Map([[rootKey, []]]));
}

function isDescendantPath(rootPath: CategoryPath, path: CategoryPath) {
  return path.length > rootPath.length && rootPath.every((segment, index) => path[index] === segment);
}

function pathKey(path: CategoryPath) {
  return path.join('\u001f');
}

function createCategoryTints(colors: typeof import('../../shared/design/tokens').colors, isDark: boolean) {
  if (isDark) {
    return [
      '#17191f',
      '#1e2634',
      '#1f2c29',
      '#252337',
      '#2f2430',
      '#2c2920',
      '#232735',
    ];
  }

  return [colors.canvas, colors.cardTintYellow, colors.cardTintMint, colors.cardTintSky, colors.cardTintRose, colors.cardTintLavender, colors.cardTintPeach];
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors, isDark: boolean, zoom: number) {
  const scale = (value: number) => Math.round(value * zoom);
  const scaledRadius = Math.max(rounded.xs, scale(rounded.lg));
  return StyleSheet.create({
  card: { width: '100%', minWidth: 0, height: scale(264), borderRadius: scaledRadius, borderWidth: 1, borderColor: isDark ? '#353a45' : colors.hairline, paddingHorizontal: scale(5), paddingVertical: scale(7), gap: scale(2), ...shadows.card },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(3) },
  titleBlock: { flex: 1, minWidth: 0 },
  workspaceName: { fontSize: scale(7), fontWeight: '500', lineHeight: scale(9), color: colors.steel, textTransform: 'uppercase' },
  titleButton: { minHeight: scale(18), flexDirection: 'row', alignItems: 'flex-start', gap: scale(3), paddingRight: scale(1) },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: scale(4) },
  title: { fontSize: scale(13), fontWeight: '700', lineHeight: scale(16), color: colors.charcoal, flex: 1, minWidth: 0 },
  titleMeta: { flexShrink: 0, flexDirection: 'row', gap: scale(2), paddingTop: scale(1) },
  titleMetaText: { fontSize: scale(7), fontWeight: '700', lineHeight: scale(9), color: colors.steel, textTransform: 'uppercase' },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: scale(3), maxWidth: scale(40) },
  iconButtonSmall: { width: scale(18), height: scale(18), borderRadius: rounded.xs, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.12)' : colors.hairline, backgroundColor: isDark ? 'rgba(10,11,14,0.72)' : 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  actionsPanel: { flexDirection: 'row', gap: scale(4) },
  panelButton: { flex: 1, minHeight: scale(32), paddingHorizontal: scale(4) },
  previewScroller: { flex: 1, minHeight: 0, marginTop: scale(1) },
  previewList: { gap: scale(1), paddingBottom: scale(2) },
  subcategoryBlock: { position: 'relative', gap: scale(1), borderRadius: rounded.xs, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, backgroundColor: isDark ? 'rgba(10,11,14,0.32)' : 'rgba(255,255,255,0.48)', padding: scale(2), marginBottom: scale(2) },
  subcategoryNode: { position: 'relative', gap: scale(1) },
  subcategoryRow: { minHeight: scale(24), flexDirection: 'row', alignItems: 'center', gap: scale(2) },
  subcategoryIndent: { width: scale(10) },
  subcategoryContents: { gap: scale(1), paddingTop: scale(1), paddingBottom: scale(1) },
  subcategoryToggle: { width: scale(18), height: scale(20), borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(10,11,14,0.62)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, flexShrink: 0 },
  subcategoryToggleEmpty: { opacity: 0.45 },
  subcategoryMain: { flex: 1, minWidth: 0, minHeight: scale(22), borderRadius: rounded.xs, flexDirection: 'row', alignItems: 'center', gap: scale(4), paddingHorizontal: scale(4), backgroundColor: isDark ? 'rgba(10,11,14,0.42)' : 'rgba(255,255,255,0.56)' },
  subcategoryAddButton: { width: scale(18), height: scale(20), borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(10,11,14,0.62)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, flexShrink: 0 },
  subcategoryActionsPanel: { flexDirection: 'row', gap: scale(3), paddingVertical: scale(2) },
  subcategoryPanelButton: { flex: 1, minHeight: scale(27), paddingHorizontal: scale(3), paddingVertical: scale(4), borderRadius: rounded.xs },
  subcategoryName: { fontSize: scale(10), fontWeight: '700', lineHeight: scale(13), color: colors.charcoal, flex: 1, minWidth: 0 },
  subcategoryCounts: { flexDirection: 'row', alignItems: 'center', gap: scale(2), flexShrink: 0 },
  subcategoryCount: { fontSize: scale(7), fontWeight: '700', lineHeight: scale(9), color: colors.steel },
  inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: scale(4), minHeight: scale(27), borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.xs, backgroundColor: isDark ? 'rgba(10,11,14,0.82)' : colors.canvas, paddingHorizontal: scale(5) },
  subcategoryInlineAdd: { marginTop: scale(1), marginBottom: scale(1) },
  inlineInput: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.charcoal, flex: 1, minWidth: 0, paddingVertical: 0 },
  inlineIconButton: { width: scale(22), height: scale(22), borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center' },
  previewNote: { position: 'relative', flexDirection: 'row', alignItems: 'flex-start', gap: scale(4), borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, borderRadius: rounded.xs, backgroundColor: isDark ? 'rgba(10,11,14,0.54)' : 'rgba(255,255,255,0.66)', paddingHorizontal: scale(4), paddingVertical: scale(3), marginTop: 0 },
  previewNoteMenuOpen: { elevation: 16 },
  previewText: { fontSize: scale(11), fontWeight: '500', lineHeight: scale(13), color: colors.charcoal, flex: 1, minWidth: 0, paddingRight: scale(24) },
  previewMenuButton: { position: 'absolute', top: scale(3), right: scale(3), width: scale(22), height: scale(16), borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, zIndex: 4 },
  previewActions: { position: 'absolute', top: scale(22), right: scale(3), zIndex: 1001, minWidth: scale(94), borderRadius: rounded.xs, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, padding: scale(3), ...shadows.card, elevation: 18 },
  previewActionsAbove: { top: undefined, bottom: scale(22) },
  previewAction: { minHeight: scale(22), justifyContent: 'center', paddingHorizontal: scale(6) },
  previewActionText: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.charcoal },
  previewActionDanger: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.semanticError },
  previewPriorityPicker: { gap: scale(3), borderTopWidth: 1, borderTopColor: colors.hairlineSoft, borderBottomWidth: 1, borderBottomColor: colors.hairlineSoft, paddingVertical: scale(3), marginVertical: scale(2) },
  previewPrioritySearch: { height: scale(26), borderRadius: rounded.xs, borderWidth: 1, borderColor: colors.hairlineStrong, color: colors.ink, backgroundColor: colors.surfaceSoft, paddingHorizontal: scale(6), paddingVertical: 0, fontSize: scale(11), lineHeight: scale(14) },
  previewPriorityScroll: { maxHeight: scale(96) },
  previewPriorityOption: { minHeight: scale(24), borderRadius: rounded.xs, justifyContent: 'center', paddingHorizontal: scale(7), backgroundColor: colors.surfaceSoft, marginBottom: scale(2) },
  previewPriorityOptionCurrent: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryDeep },
  previewPriorityOptionText: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.charcoal },
  previewPriorityOptionTextCurrent: { color: colors.onPrimary },
  emptyPreview: { borderRadius: rounded.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairlineStrong, padding: scale(spacing.sm), backgroundColor: isDark ? 'rgba(10,11,14,0.42)' : 'rgba(255,255,255,0.45)' },
  emptyPreviewText: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.slate },
  });
}
