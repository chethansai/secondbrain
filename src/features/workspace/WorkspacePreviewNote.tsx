import { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderGestureState, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { colors as designColors } from '../../shared/design/tokens';
import { FlatNote } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';
import { isHistoryPath, parseHistoryNote } from '../notes/noteMutations';

type Props = {
  note: FlatNote;
  itemCount: number;
  currentOrder: number;
  stackOrder: number;
  pinned: boolean;
  colors: typeof designColors;
  styles: Record<string, any>;
  onEdit: (note: FlatNote) => void;
  onMove: (note: FlatNote) => void;
  onCopy: (note: FlatNote) => void;
  onCopyText: (note: FlatNote) => void;
  onSetPriority: (note: FlatNote, priority: number) => void;
  onTogglePin: (note: FlatNote) => void;
  onDelete: (note: FlatNote) => void;
  onPressNote?: (note: FlatNote) => void;
  dragKey?: string;
  dragging?: boolean;
  selectedForOrdering?: boolean;
  dragOffset?: number;
  onDragStart?: (key: string, note: FlatNote, order: number) => void;
  onDragMove?: (event: GestureResponderEvent, gesture: PanResponderGestureState) => void;
  onDragRelease?: (event: GestureResponderEvent, gesture: PanResponderGestureState) => void;
  onLayoutNote?: (key: string, y: number, height: number) => void;
};

export function WorkspacePreviewNote({ note, itemCount, currentOrder, stackOrder, pinned, colors, styles, onEdit, onMove, onCopy, onCopyText, onSetPriority, onTogglePin, onDelete, onPressNote, dragKey, dragging = false, selectedForOrdering = false, dragOffset = 0, onDragStart, onDragMove, onDragRelease, onLayoutNote }: Props) {
  const [open, setOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [prioritySearch, setPrioritySearch] = useState('');
  const priorityScrollRef = useRef<ScrollView>(null);
  const priorityOptions = createPriorityOptions(itemCount, prioritySearch);
  const openUpward = currentOrder > Math.ceil(itemCount / 2);
  const historyNote = isHistoryPath(note.path) ? parseHistoryNote(note.note) : null;
  const sortResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(dragKey && onDragStart && onDragMove && onDragRelease),
    onMoveShouldSetPanResponder: () => Boolean(dragKey && onDragStart && onDragMove && onDragRelease),
    onPanResponderGrant: () => { if (dragKey) onDragStart?.(dragKey, note, currentOrder); },
    onPanResponderMove: (event, gesture) => onDragMove?.(event, gesture),
    onPanResponderRelease: (event, gesture) => onDragRelease?.(event, gesture),
    onPanResponderTerminate: (event, gesture) => onDragRelease?.(event, gesture),
  });

  useEffect(() => {
    if (!priorityOpen || prioritySearch) return;
    requestAnimationFrame(() => {
      priorityScrollRef.current?.scrollTo({ y: Math.max(0, (currentOrder - 2) * previewPriorityOptionHeight), animated: true });
    });
  }, [currentOrder, priorityOpen, prioritySearch]);

  return (
    <View
      onLayout={(event) => { if (dragKey) onLayoutNote?.(dragKey, event.nativeEvent.layout.y, event.nativeEvent.layout.height); }}
      style={[styles.previewNote, open && styles.previewNoteMenuOpen, selectedForOrdering && styles.previewNoteOrderingSelected, dragging && styles.previewNoteDragging, dragging && { transform: [{ translateY: dragOffset }] }, { zIndex: open || dragging ? 1000 : stackOrder }]}
    >
      {historyNote ? (
        <View style={styles.previewHistoryBlock}>
          <Text selectable style={styles.previewHistoryPrimary} numberOfLines={3}>{historyNote.primary}</Text>
          <Text selectable style={styles.previewHistoryMeta} numberOfLines={2}>{[historyNote.event ? formatHistoryEvent(historyNote.event) : null, ...historyNote.metadata].filter(Boolean).join(' · ')}</Text>
        </View>
      ) : (
        <View style={styles.previewTextButton}>
          <ScrollView style={styles.previewTextScroller} nestedScrollEnabled showsVerticalScrollIndicator>
            <Text selectable style={styles.previewText}>{note.note}</Text>
          </ScrollView>
        </View>
      )}
      <View accessibilityRole="adjustable" accessibilityLabel={selectedForOrdering ? 'Selected note. Tap another note order button to place this note below it.' : 'Drag note to reorder, or tap to select then tap another note to place below it'} style={[styles.previewSortButton, (dragging || selectedForOrdering) && styles.previewSortButtonActive]} {...sortResponder.panHandlers}>
        <View style={styles.previewSortButtonLine} />
        <View style={styles.previewSortButtonLine} />
        <View style={styles.previewSortButtonLine} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={pinned ? 'Pinned note actions' : 'Note actions'} onPress={() => setOpen((current) => !current)} style={[styles.previewMenuButton, pinned && styles.previewMenuButtonPinned]}>
        <Icon name="settings-outline" size={11} color={pinned ? colors.onPrimary : colors.steel} />
      </Pressable>
      {open ? (
        <View style={[styles.previewActions, openUpward && styles.previewActionsAbove]}>
          <Pressable onPress={() => { setOpen(false); onTogglePin(note); }} style={[styles.previewAction, pinned && styles.previewActionPinnedRow]}><Text style={[styles.previewActionText, pinned && styles.previewActionPinnedText]}>{pinned ? 'Unpin' : 'Pin'}</Text></Pressable>
          <Pressable onPress={() => { setOpen(false); onEdit(note); }} style={styles.previewAction}><Text style={styles.previewActionText}>Edit</Text></Pressable>
          <Pressable onPress={() => { setOpen(false); onMove(note); }} style={styles.previewAction}><Text style={styles.previewActionText}>Move</Text></Pressable>
          <Pressable onPress={() => { setOpen(false); onCopyText(note); }} style={styles.previewAction}><Text style={styles.previewActionText}>Copy text</Text></Pressable>
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
          <Pressable onPress={() => { setOpen(false); onCopy(note); }} style={styles.previewAction}><Text style={styles.previewActionText}>Copy to category</Text></Pressable>
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

function formatHistoryEvent(event: string) {
  return event.replace(/_/g, ' ').toLowerCase();
}
