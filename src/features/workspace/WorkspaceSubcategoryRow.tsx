import { useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponderGestureState, Pressable, ScrollView, StyleProp, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { colors as designColors } from '../../shared/design/tokens';
import { CategoryPath, CategorySummary, FlatNote, PinnedNoteRef } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';
import { getDragDisplacement, getPriorityBelowTarget, isTapGesture, NoteOrderSelection } from '../notes/noteOrdering';
import { normalizeNoteText } from '../notes/noteMutations';
import { isPinnedNote } from '../notes/pinnedNotes';
import { WorkspaceCategoryActionItem } from './WorkspaceCategoryActionItem';
import { WorkspacePreviewNote } from './WorkspacePreviewNote';

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

type SubcategoryRowStyles = Record<string, any> & {
  categoryActionItem: StyleProp<ViewStyle>;
  categoryActionItemDanger: StyleProp<ViewStyle>;
  categoryActionItemPressed: StyleProp<ViewStyle>;
  categoryActionText: StyleProp<TextStyle>;
  categoryActionTextDanger: StyleProp<TextStyle>;
};

type Props = {
  category: CategorySummary;
  depth: number;
  itemCount: number;
  currentOrder: number;
  stackOrder: number;
  expandedCategoryKeys: Set<string>;
  childCategoriesByParentKey: Map<string, CategorySummary[]>;
  notesByCategoryKey: Map<string, FlatNote[]>;
  pinnedNotes: PinnedNoteRef[];
  colors: typeof designColors;
  styles: SubcategoryRowStyles;
  onToggleCategory: (path: CategoryPath) => void;
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

const previewPriorityOptionHeight = 26;

export function WorkspaceSubcategoryRow({ category, depth, itemCount, currentOrder, stackOrder, expandedCategoryKeys, childCategoriesByParentKey, notesByCategoryKey, pinnedNotes, colors, styles, onToggleCategory, onOpenCategory, onAddNote, onCreateSubcategory, onCopyCategory, onSetSubcategoryPriority, onRenameCategory, onDeleteCategory, onEditNote, onMoveNote, onCopyNote, onCopyNoteText, onSetNotePriority, onToggleNotePin, onDeleteNote, onPressNote }: Props) {
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [prioritySearch, setPrioritySearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewDrag, setPreviewDrag] = useState<PreviewDragState | null>(null);
  const [orderSelection, setOrderSelection] = useState<NoteOrderSelection<FlatNote> | null>(null);
  const priorityScrollRef = useRef<ScrollView>(null);
  const previewDragRef = useRef<PreviewDragState | null>(null);
  const previewLayoutsRef = useRef<Record<string, PreviewLayout>>({});
  const key = pathKey(category.path);
  const children = childCategoriesByParentKey.get(key) ?? [];
  const childNotes = notesByCategoryKey.get(key) ?? [];
  const childItems = useMemo(() => createOrderedPreviewItems(children, childNotes), [children, childNotes]);
  const expanded = expandedCategoryKeys.has(key);
  const hasChildren = children.length > 0;
  const expandable = childItems.length > 0;
  const expandableDescendantKeys = useMemo(() => listExpandableDescendantKeysFromGroups(category.path, childCategoriesByParentKey, notesByCategoryKey), [category.path, childCategoriesByParentKey, notesByCategoryKey]);
  const allDescendantsExpanded = expandableDescendantKeys.length > 0 && expandableDescendantKeys.every((key) => expandedCategoryKeys.has(key));
  const indent = Math.min(depth, 4) * styles.subcategoryIndent.width;
  const priorityOptions = createPriorityOptions(itemCount, prioritySearch);

  useEffect(() => {
    if (!priorityOpen || prioritySearch) return;
    requestAnimationFrame(() => {
      priorityScrollRef.current?.scrollTo({ y: Math.max(0, (currentOrder - 2) * previewPriorityOptionHeight), animated: true });
    });
  }, [currentOrder, priorityOpen, prioritySearch]);

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

  function setDescendantsExpanded(expanded: boolean) {
    const selfKey = pathKey(category.path);
    const selfExpanded = expandedCategoryKeys.has(selfKey);
    if (expanded !== selfExpanded) onToggleCategory(category.path);
    expandableDescendantKeys.forEach((key) => {
      const isExpanded = expandedCategoryKeys.has(key);
      if (expanded !== isExpanded) onToggleCategory(key.split('\u001f'));
    });
    setActionsOpen(false);
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
    updatePreviewDrag({ key, note, fromOrder: order, targetOrder: order, dy: 0, originY: layout.y, height: layout.height, originScrollY: 0 });
  }

  function movePreviewDrag(_: GestureResponderEvent, gesture: PanResponderGestureState) {
    const current = previewDragRef.current;
    if (!current) return;
    const dragCenter = current.originY + current.height / 2 + gesture.dy;
    updatePreviewDrag({ ...current, dy: gesture.dy, targetOrder: getPreviewTargetOrder(current.key, dragCenter, childItems) });
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

  return (
    <View style={[styles.subcategoryNode, { zIndex: stackOrder }]}> 
      <View style={[styles.subcategoryRow, { marginLeft: indent }]}> 
        <Pressable accessibilityRole="button" accessibilityLabel={expandable ? `${expanded ? 'Collapse' : 'Expand'} ${category.name}` : `${category.name} is empty`} disabled={!expandable} onPress={(event) => { event.stopPropagation(); onToggleCategory(category.path); }} style={[styles.subcategoryToggle, !expandable && styles.subcategoryToggleEmpty]}>
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
          {expandableDescendantKeys.length ? <WorkspaceCategoryActionItem label={allDescendantsExpanded ? 'Enclose' : 'Disclose'} icon={allDescendantsExpanded ? 'chevron-up' : 'chevron-down'} colors={colors} styles={styles} onPress={() => setDescendantsExpanded(!allDescendantsExpanded)} /> : null}
          <WorkspaceCategoryActionItem label="Rename" icon="create-outline" colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onRenameCategory(category.path); }} />
          <WorkspaceCategoryActionItem label="Folder" icon="folder-outline" colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onCreateSubcategory(category.path); }} />
          <WorkspaceCategoryActionItem label="Copy" icon="copy-outline" colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onCopyCategory(category.path); }} />
          <WorkspaceCategoryActionItem label="Order" icon="albums-outline" colors={colors} styles={styles} onPress={() => setPriorityOpen((current) => !current)} />
          <WorkspaceCategoryActionItem label="Delete" icon="trash-outline" danger colors={colors} styles={styles} onPress={() => { setActionsOpen(false); onDeleteCategory(category.path); }} />
        </View>
      ) : null}
      {actionsOpen && priorityOpen ? (
        <View style={[styles.subcategoryPriorityPicker, { marginLeft: indent + styles.subcategoryIndent.width }]}> 
          <TextInput value={prioritySearch} onChangeText={setPrioritySearch} placeholder="Search number" placeholderTextColor={colors.stone} keyboardType="number-pad" style={styles.previewPrioritySearch} />
          <ScrollView ref={priorityScrollRef} style={styles.previewPriorityScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {priorityOptions.map((option) => {
              const current = option === currentOrder;
              return (
                <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Set category order ${option}${current ? ', current order' : ''}`} onPress={() => { setActionsOpen(false); setPriorityOpen(false); setPrioritySearch(''); onSetSubcategoryPriority(category.path, option); }} style={[styles.previewPriorityOption, current && styles.previewPriorityOptionCurrent]}>
                  <Text style={[styles.previewPriorityOptionText, current && styles.previewPriorityOptionTextCurrent]}>{option}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      {adding ? (
        <Pressable onPress={(event) => event.stopPropagation()} style={[styles.inlineAdd, styles.subcategoryInlineAdd, { marginLeft: indent + styles.subcategoryIndent.width }]}> 
          <TextInput value={newNote} onChangeText={setNewNote} autoCapitalize="sentences" placeholder="Add note" placeholderTextColor={colors.stone} accessibilityLabel={`New note in ${category.name}`} autoFocus editable={!busy} returnKeyType="done" onSubmitEditing={submitNote} style={styles.inlineInput} />
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
              return <WorkspaceSubcategoryRow key={pathKey(item.category.path)} category={item.category} depth={depth + 1} itemCount={childItems.length} currentOrder={index + 1} stackOrder={childStackOrder} expandedCategoryKeys={expandedCategoryKeys} childCategoriesByParentKey={childCategoriesByParentKey} notesByCategoryKey={notesByCategoryKey} pinnedNotes={pinnedNotes} colors={colors} styles={styles} onToggleCategory={onToggleCategory} onOpenCategory={onOpenCategory} onAddNote={onAddNote} onCreateSubcategory={onCreateSubcategory} onCopyCategory={onCopyCategory} onSetSubcategoryPriority={onSetSubcategoryPriority} onRenameCategory={onRenameCategory} onDeleteCategory={onDeleteCategory} onEditNote={onEditNote} onMoveNote={onMoveNote} onCopyNote={onCopyNote} onCopyNoteText={onCopyNoteText} onSetNotePriority={onSetNotePriority} onToggleNotePin={onToggleNotePin} onDeleteNote={onDeleteNote} onPressNote={onPressNote} />;
            }

            const key = previewNoteKey(item.note, index);
            const noteOrder = getPreviewNoteOrder(childItems, index);
            const noteCount = getPreviewNoteCount(childItems);
            const dragging = previewDrag?.key === key;
            const selectedForOrdering = orderSelection?.key === key;
            const displaced = previewDrag ? getDragDisplacement(previewDrag.fromOrder, previewDrag.targetOrder, noteOrder, previewDrag.height) : 0;
            return (
              <View key={key} style={displaced ? { transform: [{ translateY: displaced }] } : undefined}>
                <WorkspacePreviewNote note={item.note} itemCount={noteCount} currentOrder={noteOrder} stackOrder={childStackOrder} pinned={isPinnedNote(item.note, pinnedNotes)} colors={colors} styles={styles} onEdit={onEditNote} onMove={onMoveNote} onCopy={onCopyNote} onCopyText={onCopyNoteText} onSetPriority={onSetNotePriority} onTogglePin={onToggleNotePin} onDelete={onDeleteNote} onPressNote={onPressNote} dragKey={key} dragging={dragging} selectedForOrdering={selectedForOrdering} dragOffset={dragging ? previewDrag.dy : 0} onDragStart={startPreviewDrag} onDragMove={movePreviewDrag} onDragRelease={releasePreviewDrag} onLayoutNote={setPreviewLayout} />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function createPriorityOptions(count: number, search: string) {
  const cleanSearch = search.replace(/[^0-9]/g, '');
  return Array.from({ length: count }, (_, index) => index + 1).filter((option) => !cleanSearch || String(option).includes(cleanSearch));
}

function createOrderedPreviewItems(categories: CategorySummary[], notes: FlatNote[]): PreviewItem[] {
  const categoryItems = categories.map((category) => ({ type: 'category' as const, category, order: category.itemIndex ?? 0 }));
  const noteItems = notes.map((note) => ({ type: 'note' as const, note, order: note.index }));
  return [...categoryItems, ...noteItems].sort((left, right) => right.order - left.order);
}

function getPreviewNoteOrder(items: PreviewItem[], itemIndex: number) {
  return items.slice(0, itemIndex + 1).filter((item) => item.type === 'note').length;
}

function getPreviewNoteCount(items: PreviewItem[]) {
  return items.filter((item) => item.type === 'note').length;
}

function listExpandableDescendantKeysFromGroups(rootPath: CategoryPath, childGroups: Map<string, CategorySummary[]>, notesByCategoryKey: Map<string, FlatNote[]>) {
  const keys: string[] = [];
  const pending = [...(childGroups.get(pathKey(rootPath)) ?? [])];
  while (pending.length) {
    const category = pending.shift();
    if (!category) continue;
    const key = pathKey(category.path);
    const children = childGroups.get(key) ?? [];
    if (children.length > 0 || (notesByCategoryKey.get(key)?.length ?? 0) > 0) keys.push(key);
    pending.push(...children);
  }
  return keys;
}

function pathKey(path: CategoryPath) {
  return path.join('\u001f');
}