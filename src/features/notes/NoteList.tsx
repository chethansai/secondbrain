import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { FlatNote } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';

type Props = {
  notes: FlatNote[];
  onEdit: (note: FlatNote) => void;
  onMove: (note: FlatNote) => void;
  onCopy: (note: FlatNote) => void;
  onSetPriority: (note: FlatNote, priority: number) => void;
  onDelete: (note: FlatNote) => void;
};

export function NoteList({ notes, onEdit, onMove, onCopy, onSetPriority, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.list}>
      {notes.map((note, index) => (
        <View key={`${note.path.join('/')}-${note.index}-${index}`} style={[styles.card, { zIndex: notes.length - index }]}>
          <Text style={styles.text}>{note.note}</Text>
          <NoteActionsDropdown note={note} noteCount={notes.length} currentOrder={index + 1} colors={colors} styles={styles} onEdit={onEdit} onMove={onMove} onCopy={onCopy} onSetPriority={onSetPriority} onDelete={onDelete} />
        </View>
      ))}
    </View>
  );
}

function NoteActionsDropdown({ note, noteCount, currentOrder, colors, styles, onEdit, onMove, onCopy, onSetPriority, onDelete }: { note: FlatNote; noteCount: number; currentOrder: number; colors: typeof import('../../shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onEdit: (note: FlatNote) => void; onMove: (note: FlatNote) => void; onCopy: (note: FlatNote) => void; onSetPriority: (note: FlatNote, priority: number) => void; onDelete: (note: FlatNote) => void }) {
  const [open, setOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [prioritySearch, setPrioritySearch] = useState('');
  const priorityScrollRef = useRef<ScrollView>(null);
  const priorityOptions = createPriorityOptions(noteCount, prioritySearch);

  useEffect(() => {
    if (!priorityOpen || prioritySearch) return;
    requestAnimationFrame(() => {
      priorityScrollRef.current?.scrollTo({ y: Math.max(0, (currentOrder - 2) * priorityOptionHeight), animated: true });
    });
  }, [currentOrder, priorityOpen, prioritySearch]);

  function close() {
    setOpen(false);
    setPriorityOpen(false);
    setPrioritySearch('');
  }

  return (
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Note actions" onPress={() => setOpen((current) => !current)} style={styles.iconButton}>
        <Icon name="settings-outline" size={18} color={colors.ink} />
      </Pressable>
      {open ? (
        <View style={styles.dropdown}>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit note" onPress={() => { close(); onEdit(note); }} style={styles.dropdownItem}>
            <Icon name="create-outline" size={15} color={colors.ink} />
            <Text style={styles.dropdownItemText}>Edit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Move note" onPress={() => { close(); onMove(note); }} style={styles.dropdownItem}>
            <Icon name="git-branch-outline" size={15} color={colors.ink} />
            <Text style={styles.dropdownItemText}>Move</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Change note order" onPress={() => setPriorityOpen((current) => !current)} style={styles.dropdownItem}>
            <Icon name="albums-outline" size={15} color={colors.ink} />
            <Text style={styles.dropdownItemText}>Order</Text>
            <Icon name="chevron-down" size={11} color={colors.steel} />
          </Pressable>
          {priorityOpen ? (
            <View style={styles.priorityPicker}>
              <TextInput value={prioritySearch} onChangeText={setPrioritySearch} placeholder="Search number" placeholderTextColor={colors.stone} keyboardType="number-pad" style={styles.prioritySearch} />
              <ScrollView ref={priorityScrollRef} style={styles.priorityScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {priorityOptions.map((option) => {
                  const current = option === currentOrder;
                  return (
                    <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Set note order ${option}${current ? ', current order' : ''}`} onPress={() => { close(); onSetPriority(note, option); }} style={[styles.priorityOption, current && styles.priorityOptionCurrent]}>
                      <Text style={[styles.priorityOptionText, current && styles.priorityOptionTextCurrent]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Delete note" onPress={() => { close(); onDelete(note); }} style={styles.dropdownItem}>
            <Icon name="trash-outline" size={15} color={colors.semanticError} />
            <Text style={styles.dropdownItemDanger}>Delete</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy note" onPress={() => { close(); onCopy(note); }} style={styles.dropdownItem}>
            <Icon name="copy-outline" size={15} color={colors.ink} />
            <Text style={styles.dropdownItemText}>Copy</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const priorityOptionHeight = 37;

function createPriorityOptions(count: number, search: string) {
  const cleanSearch = search.replace(/[^0-9]/g, '');
  return Array.from({ length: count }, (_, index) => index + 1).filter((option) => !cleanSearch || String(option).includes(cleanSearch));
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  list: { gap: spacing.sm },
  card: { position: 'relative', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.lg, padding: spacing.lg, gap: 1 },
  text: { ...typography.body, color: colors.charcoal },
  actions: { position: 'relative', flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end', zIndex: 3 },
  iconButton: { width: 40, height: 40, borderRadius: rounded.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dropdown: { position: 'absolute', top: 44, right: 0, width: 172, borderRadius: rounded.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, padding: spacing.xs, gap: 3, zIndex: 5, elevation: 8 },
  dropdownItem: { minHeight: 36, borderRadius: rounded.sm, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceSoft },
  dropdownItemText: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1 },
  dropdownItemDanger: { ...typography.bodySmMedium, color: colors.semanticError, flex: 1 },
  priorityPicker: { gap: spacing.xs, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairlineSoft, paddingVertical: spacing.xs },
  prioritySearch: { minHeight: 34, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineStrong, color: colors.ink, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.xs, paddingVertical: 0, ...typography.bodySm },
  priorityScroll: { maxHeight: 160 },
  priorityOption: { minHeight: 34, borderRadius: rounded.sm, justifyContent: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.surfaceSoft, marginBottom: 3 },
  priorityOptionCurrent: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryDeep },
  priorityOptionText: { ...typography.bodySmMedium, color: colors.charcoal },
  priorityOptionTextCurrent: { color: colors.onPrimary },
  });
}