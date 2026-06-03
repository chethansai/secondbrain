import { useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponderGestureState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, shadows, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, CategorySummary, FlatNote, PinnedNoteRef } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';
import { normalizeNoteText } from '../notes/noteMutations';
import { WorkspaceCategoryActionItem } from './WorkspaceCategoryActionItem';
import { WorkspacePreviewNote } from './WorkspacePreviewNote';
import { WorkspaceSubcategoryRow } from './WorkspaceSubcategoryRow';
import { isPinnedNote } from '../notes/pinnedNotes';
import { getDragDisplacement, getPriorityBelowTarget, isTapGesture, NoteOrderSelection } from '../notes/noteOrdering';

type Props = {
  category: CategorySummary;
  allCategories: CategorySummary[];
  notesByCategoryKey: Map<string, FlatNote[]>;
  notes: FlatNote[];
  pinnedNotes: PinnedNoteRef[];
  priority: number;
  workspaceName: string;
  showWorkspaceIntro: boolean;
  zoom?: number;
  onOpen: () => void;
  onOpenCategory: (path: CategoryPath) => void;
  onAddNote: (path: CategoryPath, text: string) => Promise<boolean> | boolean;
  onCreateSubcategory: (path: CategoryPath) => void;
  onCopyCategory: (path: CategoryPath) => void;
  onSetSubcategoryPriority: (path: CategoryPath, priority: number) => void;
  onRenameCategory: (path: CategoryPath) => void;
  onDeleteCategory: (path: CategoryPath) => void;
  onEditNote: (note: FlatNote) => void;
  onMoveNote: (note: FlatNote) => void;
  onCopyNote: (note: FlatNote) => void;
  onCopyNoteText: (note: FlatNote) => void;
  onSetNotePriority: (note: FlatNote, priority: number) => void;
  onToggleNotePin: (note: FlatNote) => void;
  onDeleteNote: (note: FlatNote) => void;
  onPressNote?: (note: FlatNote) => void;
};

type PreviewItem =
  | { type: 'category'; category: CategorySummary; order: number }
  | { type: 'note'; note: FlatNote; order: number };

type PreviewDragState = {
  key: string;
  note: FlatNote;
  fromOrder: number;
  targetOrder: number;
  dy: number;
  originY: number;
  height: number;
  originScrollY: number;
};

type PreviewLayout = {
  y: number;
  height: number;
};

export function WorkspaceCategoryCard({
  category,
  allCategories,
  notesByCategoryKey,
  notes,
  pinnedNotes,
  priority,
  workspaceName,
  showWorkspaceIntro,
  zoom = 1,
  onOpen,
  onOpenCategory,
  onAddNote,
  onCreateSubcategory,
  onCopyCategory,
  onSetSubcategoryPriority,
  onRenameCategory,
  onDeleteCategory,
  onEditNote,
  onMoveNote,
  onCopyNote,
  onCopyNoteText,
  onSetNotePriority,
  onToggleNotePin,
  onDeleteNote,
  onPressNote,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark, zoom), [colors, isDark, zoom]);
  const tints = useMemo(() => createCategoryTints(colors, isDark), [colors, isDark]);
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAllSubcategories, setShowAllSubcategories] = useState(false);
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(() => new Set());
  const [previewDrag, setPreviewDrag] = useState<PreviewDragState | null>(null);
  const [orderSelection, setOrderSelection] = useState<NoteOrderSelection<FlatNote> | null>(null);
  const previewDragRef = useRef<PreviewDragState | null>(null);
  const previewLayoutsRef = useRef<Record<string, PreviewLayout>>({});
  const previewScrollRef = useRef<ScrollView>(null);
  const previewScrollYRef = useRef(0);
  const previewViewportHeightRef = useRef(0);
  const previewContentHeightRef = useRef(0);
  const tint = tints[(priority - 1) % tints.length];
  const childCategoriesByParentKey = useMemo(() => groupChildCategories(allCategories, category.path), [allCategories, category.path]);
  const childCategories = childCategoriesByParentKey.get(pathKey(category.path)) ?? [];
  const visibleSubcategories = useMemo(() => (showAllSubcategories ? listDescendantCategories(allCategories, category.path) : childCategories), [allCategories, category.path, childCategories, showAllSubcategories]);
  const expandableDescendantKeys = useMemo(() => listExpandableDescendantKeys(allCategories, category.path, notesByCategoryKey), [allCategories, category.path, notesByCategoryKey]);
  const allDescendantsExpanded = expandableDescendantKeys.length > 0 && expandableDescendantKeys.every((key) => expandedCategoryKeys.has(key));
  const previewItems = useMemo(() => createOrderedPreviewItems(visibleSubcategories, notes, showAllSubcategories), [notes, showAllSubcategories, visibleSubcategories]);

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

  function openAddNote() {
    setActionsOpen(false);
    setAdding(true);
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

  function updatePreviewDrag(next: PreviewDragState | null) {
    previewDragRef.current = next;
    setPreviewDrag(next);
  }

  function previewNoteKey(note: FlatNote, index: number) {
    return `${note.path.join('/')}-${note.index}-${index}`;
  }

  function getPreviewTargetOrder(activeKey: string, dragCenter: number, items: PreviewItem[]) {
    const entries = items
      .map((item, index) => item.type === 'note' ? { key: previewNoteKey(item.note, index), layout: previewLayoutsRef.current[previewNoteKey(item.note, index)] } : null)
      .filter((entry): entry is { key: string; layout: PreviewLayout } => entry !== null && entry.layout !== undefined && entry.key !== activeKey);
    const targetIndex = entries.findIndex((entry) => dragCenter < entry.layout.y + entry.layout.height / 2);
    return targetIndex === -1 ? entries.length + 1 : targetIndex + 1;
  }

  function startPreviewDrag(key: string, note: FlatNote, order: number) {
    const layout = previewLayoutsRef.current[key];
    if (!layout) return;
    updatePreviewDrag({ key, note, fromOrder: order, targetOrder: order, dy: 0, originY: layout.y, height: layout.height, originScrollY: previewScrollYRef.current });
  }

  function movePreviewDrag(_: GestureResponderEvent, gesture: PanResponderGestureState) {
    const current = previewDragRef.current;
    if (!current) return;
    const edgeCenter = current.originY + current.height / 2 + gesture.dy + previewScrollYRef.current - current.originScrollY;
    scrollPreviewAtEdge(edgeCenter);
    const scrollDelta = previewScrollYRef.current - current.originScrollY;
    const dragCenter = current.originY + current.height / 2 + gesture.dy + scrollDelta;
    updatePreviewDrag({ ...current, dy: gesture.dy + scrollDelta, targetOrder: getPreviewTargetOrder(current.key, dragCenter, previewItems) });
  }

  function handlePreviewSortTap(key: string, note: FlatNote, order: number) {
    if (!orderSelection) {
      setOrderSelection({ key, note, order });
      return;
    }
    setOrderSelection(null);
    if (orderSelection.key === key) return;
    onSetNotePriority(orderSelection.note, getPriorityBelowTarget(orderSelection.order, order));
  }

  function releasePreviewDrag(_: GestureResponderEvent, gesture: PanResponderGestureState) {
    const current = previewDragRef.current;
    updatePreviewDrag(null);
    if (!current) return;
    if (isTapGesture(gesture.dy, gesture.dx)) {
      handlePreviewSortTap(current.key, current.note, current.fromOrder);
      return;
    }
    setOrderSelection(null);
    if (current.targetOrder === current.fromOrder) return;
    onSetNotePriority(current.note, current.targetOrder);
  }

  function setPreviewLayout(key: string, y: number, height: number) {
    previewLayoutsRef.current[key] = { y, height };
  }

  function scrollPreviewAtEdge(dragCenter: number) {
    const viewportHeight = previewViewportHeightRef.current;
    if (!viewportHeight) return;
    const edgeSize = Math.min(56, viewportHeight / 3);
    const scrollY = previewScrollYRef.current;
    const maxScrollY = Math.max(0, previewContentHeightRef.current - viewportHeight);
    if (dragCenter - scrollY < edgeSize) {
      const nextY = Math.max(0, scrollY - 18);
      previewScrollYRef.current = nextY;
      previewScrollRef.current?.scrollTo({ y: nextY, animated: false });
    } else if (scrollY + viewportHeight - dragCenter < edgeSize) {
      const nextY = Math.min(maxScrollY, scrollY + 18);
      previewScrollYRef.current = nextY;
      previewScrollRef.current?.scrollTo({ y: nextY, animated: false });
    }
  }

  function setDescendantsExpanded(expanded: boolean) {
    setExpandedCategoryKeys((current) => {
      const next = new Set(current);
      expandableDescendantKeys.forEach((key) => {
        if (expanded) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
    setActionsOpen(false);
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
          <Pressable accessibilityRole="button" accessibilityLabel={`Add note to ${category.name}`} onPress={(event) => { event.stopPropagation(); openAddNote(); }} style={styles.iconButtonSmall}>
            <Icon name="add" size={12} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${category.name}`} onPress={(event) => { event.stopPropagation(); setActionsOpen((current) => !current); }} style={styles.iconButtonSmall}>
            <Icon name="settings-outline" size={12} color={colors.steel} />
          </Pressable>
        </View>
      </View>

      {actionsOpen ? (
        <View style={styles.actionsPanel}>
          <WorkspaceCategoryActionItem label={showAllSubcategories ? 'Direct' : 'All subcats'} icon="git-branch-outline" colors={colors} styles={styles} onPress={() => setShowAllSubcategories((current) => !current)} />
          {expandableDescendantKeys.length ? <WorkspaceCategoryActionItem label={allDescendantsExpanded ? 'Enclose' : 'Disclose'} icon={allDescendantsExpanded ? 'chevron-up' : 'chevron-down'} colors={colors} styles={styles} onPress={() => setDescendantsExpanded(!allDescendantsExpanded)} /> : null}
          <WorkspaceCategoryActionItem label="Rename" icon="create-outline" colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onRenameCategory(category.path); }} />
          <WorkspaceCategoryActionItem label="Folder" icon="folder-outline" colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onCreateSubcategory(category.path); }} />
          <WorkspaceCategoryActionItem label="Copy" icon="copy-outline" colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onCopyCategory(category.path); }} />
          <WorkspaceCategoryActionItem label="Delete" icon="trash-outline" danger colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onDeleteCategory(category.path); }} />
        </View>
      ) : null}

      <ScrollView
        ref={previewScrollRef}
        style={styles.previewScroller}
        contentContainerStyle={styles.previewList}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={notes.length > 4}
        scrollEventThrottle={16}
        onLayout={(event) => { previewViewportHeightRef.current = event.nativeEvent.layout.height; }}
        onContentSizeChange={(_, height) => { previewContentHeightRef.current = height; }}
        onScroll={(event) => { previewScrollYRef.current = event.nativeEvent.contentOffset.y; }}
      >
        {priority === 1 && !adding ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Add note to ${category.name}`} onPress={(event) => { event.stopPropagation(); openAddNote(); }} style={styles.previewAddButton}>
            <View style={styles.previewAddIcon}>
              <Icon name="add" size={12} color={colors.primary} />
            </View>
            <Text style={styles.previewAddText} numberOfLines={1}>Add note</Text>
          </Pressable>
        ) : null}

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
              <View key={pathKey(item.category.path)} onLayout={(event) => setPreviewLayout(pathKey(item.category.path), event.nativeEvent.layout.y, event.nativeEvent.layout.height)} style={[styles.subcategoryBlock, { zIndex: stackOrder }]}>
                <WorkspaceSubcategoryRow
                  category={item.category}
                  depth={0}
                  itemCount={previewItems.length}
                  currentOrder={index + 1}
                  stackOrder={stackOrder}
                  expandedCategoryKeys={expandedCategoryKeys}
                  childCategoriesByParentKey={childCategoriesByParentKey}
                  notesByCategoryKey={notesByCategoryKey}
                  pinnedNotes={pinnedNotes}
                  colors={colors}
                  styles={styles}
                  onToggleCategory={toggleCategory}
                  onOpenCategory={onOpenCategory}
                  onAddNote={onAddNote}
                  onCreateSubcategory={onCreateSubcategory}
                  onCopyCategory={onCopyCategory}
                  onSetSubcategoryPriority={onSetSubcategoryPriority}
                  onRenameCategory={onRenameCategory}
                  onDeleteCategory={onDeleteCategory}
                  onEditNote={onEditNote}
                  onMoveNote={onMoveNote}
                  onCopyNote={onCopyNote}
                  onCopyNoteText={onCopyNoteText}
                  onSetNotePriority={onSetNotePriority}
                  onToggleNotePin={onToggleNotePin}
                  onDeleteNote={onDeleteNote}
                  onPressNote={onPressNote}
                />
              </View>
            );
          }

          const key = previewNoteKey(item.note, index);
          const noteOrder = getPreviewNoteOrder(previewItems, index);
          const noteCount = getPreviewNoteCount(previewItems);
          const dragging = previewDrag?.key === key;
          const selectedForOrdering = orderSelection?.key === key;
          const displaced = previewDrag ? getDragDisplacement(previewDrag.fromOrder, previewDrag.targetOrder, noteOrder, previewDrag.height) : 0;
          return (
            <View key={key} style={displaced ? { transform: [{ translateY: displaced }] } : undefined}>
              <WorkspacePreviewNote note={item.note} itemCount={noteCount} currentOrder={noteOrder} stackOrder={stackOrder} pinned={isPinnedNote(item.note, pinnedNotes)} colors={colors} styles={styles} onEdit={onEditNote} onMove={onMoveNote} onCopy={onCopyNote} onCopyText={onCopyNoteText} onSetPriority={onSetNotePriority} onTogglePin={onToggleNotePin} onDelete={onDeleteNote} onPressNote={onPressNote} dragKey={key} dragging={dragging} selectedForOrdering={selectedForOrdering} dragOffset={dragging ? previewDrag.dy : 0} onDragStart={startPreviewDrag} onDragMove={movePreviewDrag} onDragRelease={releasePreviewDrag} onLayoutNote={setPreviewLayout} />
            </View>
          );
        }) : !adding ? (
          <View style={styles.emptyPreview}><Text style={styles.emptyPreviewText}>No notes yet.</Text></View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function getPreviewNoteOrder(items: PreviewItem[], itemIndex: number) {
  return items.slice(0, itemIndex + 1).filter((item) => item.type === 'note').length;
}

function getPreviewNoteCount(items: PreviewItem[]) {
  return items.filter((item) => item.type === 'note').length;
}

function createOrderedPreviewItems(categories: CategorySummary[], notes: FlatNote[], categoriesFirst = false): PreviewItem[] {
  const categoryItems = categories.map((category) => ({ type: 'category' as const, category, order: category.itemIndex ?? 0 }));
  const noteItems = notes.map((note) => ({ type: 'note' as const, note, order: note.index }));
  if (categoriesFirst) {
    return [...categoryItems.sort(compareCategoryPreviewItems), ...noteItems.sort((left, right) => right.order - left.order)];
  }
  return [...categoryItems, ...noteItems].sort((left, right) => right.order - left.order);
}

function compareCategoryPreviewItems(left: Extract<PreviewItem, { type: 'category' }>, right: Extract<PreviewItem, { type: 'category' }>) {
  const depth = left.category.path.length - right.category.path.length;
  if (depth !== 0) return depth;
  return left.category.path.join('\u001f').localeCompare(right.category.path.join('\u001f'), undefined, { sensitivity: 'base' });
}

function listDescendantCategories(categories: CategorySummary[], rootPath: CategoryPath) {
  return categories.filter((category) => isDescendantPath(rootPath, category.path));
}

function listExpandableDescendantKeys(categories: CategorySummary[], rootPath: CategoryPath, notesByCategoryKey: Map<string, FlatNote[]>) {
  const childGroups = groupChildCategories(categories, rootPath);
  return listDescendantCategories(categories, rootPath)
    .filter((category) => (childGroups.get(pathKey(category.path))?.length ?? 0) > 0 || (notesByCategoryKey.get(pathKey(category.path))?.length ?? 0) > 0)
    .map((category) => pathKey(category.path));
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
  const actionButtonSize = 18;
  const previewActionButtonWidth = 22;
  const previewActionButtonHeight = 16;
  return StyleSheet.create({
  card: { position: 'relative', width: '100%', minWidth: 0, height: scale(264), borderRadius: scaledRadius, borderWidth: 1, borderColor: isDark ? '#353a45' : colors.hairline, paddingHorizontal: scale(5), paddingVertical: scale(7), gap: scale(2), ...shadows.card },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(3) },
  titleBlock: { flex: 1, minWidth: 0 },
  workspaceName: { fontSize: scale(7), fontWeight: '500', lineHeight: scale(9), color: colors.steel, textTransform: 'uppercase' },
  titleButton: { minHeight: scale(18), flexDirection: 'row', alignItems: 'flex-start', gap: scale(3), paddingRight: scale(1) },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: scale(4) },
  title: { fontSize: scale(13), fontWeight: '700', lineHeight: scale(16), color: colors.charcoal, flex: 1, minWidth: 0 },
  titleMeta: { flexShrink: 0, flexDirection: 'row', gap: scale(2), paddingTop: scale(1) },
  titleMetaText: { fontSize: scale(7), fontWeight: '700', lineHeight: scale(9), color: colors.steel, textTransform: 'uppercase' },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 3, maxWidth: actionButtonSize * 2 + 3 },
  iconButtonSmall: { width: actionButtonSize, height: actionButtonSize, borderRadius: rounded.xs, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.12)' : colors.hairline, backgroundColor: isDark ? 'rgba(10,11,14,0.72)' : 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  actionsPanel: { position: 'absolute', top: scale(30), right: scale(5), zIndex: 1200, width: scale(118), gap: scale(2), borderRadius: rounded.xs, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: scale(3), ...shadows.card, elevation: 20 },
  categoryActionItem: { minHeight: scale(25), borderRadius: rounded.xs, flexDirection: 'row', alignItems: 'center', gap: scale(5), paddingHorizontal: scale(6), backgroundColor: colors.surfaceSoft },
  categoryActionItemDanger: { backgroundColor: isDark ? 'rgba(224,49,49,0.12)' : 'rgba(224,49,49,0.08)' },
  categoryActionItemPressed: { opacity: 0.78 },
  categoryActionText: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.charcoal, flex: 1, minWidth: 0 },
  categoryActionTextDanger: { color: colors.semanticError },
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
  subcategoryAddButton: { width: actionButtonSize, height: 20, borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(10,11,14,0.62)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, flexShrink: 0 },
  subcategoryActionsPanel: { width: scale(118), gap: scale(2), borderRadius: rounded.xs, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: scale(3), marginTop: scale(1), marginBottom: scale(2), ...shadows.card, elevation: 16, zIndex: 1000 },
  subcategoryPriorityPicker: { gap: scale(3), borderRadius: rounded.xs, borderWidth: 1, borderColor: colors.hairlineSoft, backgroundColor: isDark ? 'rgba(10,11,14,0.54)' : 'rgba(255,255,255,0.66)', padding: scale(3), marginBottom: scale(2) },
  subcategoryName: { fontSize: scale(10), fontWeight: '700', lineHeight: scale(13), color: colors.charcoal, flex: 1, minWidth: 0 }, subcategoryCounts: { flexDirection: 'row', alignItems: 'center', gap: scale(2), flexShrink: 0 }, subcategoryCount: { fontSize: scale(7), fontWeight: '700', lineHeight: scale(9), color: colors.steel },
  inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: scale(4), minHeight: scale(27), borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.xs, backgroundColor: isDark ? 'rgba(10,11,14,0.82)' : colors.canvas, paddingHorizontal: scale(5) }, subcategoryInlineAdd: { marginTop: scale(1), marginBottom: scale(1) },
  inlineInput: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.charcoal, flex: 1, minWidth: 0, paddingVertical: 0 }, inlineIconButton: { width: scale(22), height: scale(22), borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center' },
  previewAddButton: { minHeight: scale(29), flexDirection: 'row', alignItems: 'center', gap: scale(5), borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairlineStrong, borderRadius: rounded.xs, backgroundColor: isDark ? 'rgba(10,11,14,0.50)' : 'rgba(255,255,255,0.56)', paddingHorizontal: scale(5), paddingVertical: scale(3) }, previewAddIcon: { width: scale(20), height: scale(20), borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(10,11,14,0.72)' : colors.surface, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, flexShrink: 0 },
  previewAddText: { fontSize: scale(11), fontWeight: '700', lineHeight: scale(14), color: colors.primary, flex: 1, minWidth: 0 },
  previewNote: { position: 'relative', flexDirection: 'row', alignItems: 'flex-start', gap: scale(4), borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, borderRadius: rounded.xs, backgroundColor: isDark ? 'rgba(10,11,14,0.54)' : 'rgba(255,255,255,0.66)', paddingHorizontal: scale(4), paddingVertical: scale(3), marginTop: 0 },
  previewNoteDragging: { borderColor: colors.primary, elevation: 12 }, previewNoteOrderingSelected: { borderColor: colors.primary, borderWidth: 2 }, previewDropIndicator: { height: scale(2), borderRadius: scale(1), backgroundColor: colors.primary, marginVertical: scale(2) }, previewNoteMenuOpen: { elevation: 16 }, previewTextScroller: { flex: 1, minWidth: 0, maxHeight: scale(52), paddingRight: scale(50) }, previewTextButton: { flex: 1, minWidth: 0 },
  previewText: { fontSize: scale(11), fontWeight: '500', lineHeight: scale(13), color: colors.charcoal }, previewHistoryBlock: { flex: 1, minWidth: 0, gap: scale(1), paddingRight: scale(50) },
  previewHistoryPrimary: { fontSize: scale(11), fontWeight: '700', lineHeight: scale(13), color: colors.charcoal }, previewHistoryMeta: { fontSize: scale(8), fontWeight: '500', lineHeight: scale(10), color: colors.steel },
  previewSortButton: { position: 'absolute', top: 3, right: previewActionButtonWidth + 6, width: previewActionButtonWidth, height: previewActionButtonHeight, borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryDeep, zIndex: 4, elevation: 4 }, previewSortButtonActive: { backgroundColor: colors.primaryPressed }, previewSortButtonDisabled: { opacity: 0.45 }, previewSortButtonLine: { width: 12, height: 1.5, borderRadius: 1, backgroundColor: colors.onPrimary },
  previewMenuButton: { position: 'absolute', top: 3, right: 3, width: previewActionButtonWidth, height: previewActionButtonHeight, borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, zIndex: 4 }, previewMenuButtonPinned: { backgroundColor: colors.primary, borderColor: colors.primaryDeep },
  previewActions: { position: 'absolute', top: scale(22), right: scale(3), zIndex: 1001, minWidth: scale(94), borderRadius: rounded.xs, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, padding: scale(3), ...shadows.card, elevation: 18 }, previewActionsAbove: { top: undefined, bottom: scale(22) }, previewAction: { minHeight: scale(22), justifyContent: 'center', paddingHorizontal: scale(6) },
  previewActionText: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.charcoal }, previewActionPinnedRow: { borderRadius: rounded.xs, backgroundColor: colors.primary }, previewActionPinnedText: { color: colors.onPrimary, fontWeight: '700' }, previewActionDanger: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.semanticError },
  previewPriorityPicker: { gap: scale(3), borderTopWidth: 1, borderTopColor: colors.hairlineSoft, borderBottomWidth: 1, borderBottomColor: colors.hairlineSoft, paddingVertical: scale(3), marginVertical: scale(2) }, previewPrioritySearch: { height: scale(26), borderRadius: rounded.xs, borderWidth: 1, borderColor: colors.hairlineStrong, color: colors.ink, backgroundColor: colors.surfaceSoft, paddingHorizontal: scale(6), paddingVertical: 0, fontSize: scale(11), lineHeight: scale(14) },
  previewPriorityScroll: { maxHeight: scale(96) }, previewPriorityOption: { minHeight: scale(24), borderRadius: rounded.xs, justifyContent: 'center', paddingHorizontal: scale(7), backgroundColor: colors.surfaceSoft, marginBottom: scale(2) }, previewPriorityOptionCurrent: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryDeep }, previewPriorityOptionText: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.charcoal }, previewPriorityOptionTextCurrent: { color: colors.onPrimary },
  emptyPreview: { borderRadius: rounded.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairlineStrong, padding: scale(spacing.sm), backgroundColor: isDark ? 'rgba(10,11,14,0.42)' : 'rgba(255,255,255,0.45)' }, emptyPreviewText: { ...typography.micro, fontSize: scale(12), lineHeight: scale(17), color: colors.slate },
  }); }
