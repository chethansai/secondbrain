import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, shadows, spacing, typography } from '../../shared/design/tokens';
import { CategorySummary, FlatNote } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';

type Props = {
  category: CategorySummary;
  notes: FlatNote[];
  priority: number;
  workspaceName: string;
  showWorkspaceIntro: boolean;
  onOpen: () => void;
  onAddNote: (text: string) => Promise<boolean> | boolean;
  onRename: () => void;
  onDelete: () => void;
  onEditNote: (note: FlatNote) => void;
  onMoveNote: (note: FlatNote) => void;
  onSetNotePriority: (note: FlatNote, priority: number) => void;
  onDeleteNote: (note: FlatNote) => void;
};

export function WorkspaceCategoryCard({
  category,
  notes,
  priority,
  workspaceName,
  showWorkspaceIntro,
  onOpen,
  onAddNote,
  onRename,
  onDelete,
  onEditNote,
  onMoveNote,
  onSetNotePriority,
  onDeleteNote,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const tints = useMemo(() => createCategoryTints(colors, isDark), [colors, isDark]);
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tint = tints[(priority - 1) % tints.length];

  async function submitNote() {
    const text = newNote.trim();
    if (!text) {
      setAdding(false);
      return;
    }
    setBusy(true);
    const ok = await onAddNote(text);
    setBusy(false);
    if (ok) {
      setNewNote('');
      setAdding(false);
    }
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
          <Button label="Rename" icon="create-outline" variant="secondary" onPress={onRename} style={styles.panelButton} />
          <Button label="Delete" icon="trash-outline" variant="danger" onPress={onDelete} style={styles.panelButton} />
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

        {notes.length ? notes.map((note, index) => (
          <WorkspacePreviewNote key={`${note.path.join('/')}-${note.index}`} note={note} noteCount={notes.length} currentOrder={index + 1} stackOrder={notes.length - index} colors={colors} styles={styles} onEdit={onEditNote} onMove={onMoveNote} onSetPriority={onSetNotePriority} onDelete={onDeleteNote} />
        )) : !adding ? (
          <View style={styles.emptyPreview}><Text style={styles.emptyPreviewText}>No notes yet.</Text></View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function WorkspacePreviewNote({ note, noteCount, currentOrder, stackOrder, colors, styles, onEdit, onMove, onSetPriority, onDelete }: { note: FlatNote; noteCount: number; currentOrder: number; stackOrder: number; colors: typeof import('../../shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onEdit: (note: FlatNote) => void; onMove: (note: FlatNote) => void; onSetPriority: (note: FlatNote, priority: number) => void; onDelete: (note: FlatNote) => void }) {
  const [open, setOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [prioritySearch, setPrioritySearch] = useState('');
  const priorityScrollRef = useRef<ScrollView>(null);
  const priorityOptions = createPriorityOptions(noteCount, prioritySearch);

  useEffect(() => {
    if (!priorityOpen || prioritySearch) return;
    requestAnimationFrame(() => {
      priorityScrollRef.current?.scrollTo({ y: Math.max(0, (currentOrder - 2) * previewPriorityOptionHeight), animated: true });
    });
  }, [currentOrder, priorityOpen, prioritySearch]);

  return (
    <View style={[styles.previewNote, { zIndex: stackOrder }]}>
      <Text style={styles.previewText} numberOfLines={4}>{note.note}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Note actions" onPress={() => setOpen((current) => !current)} style={styles.previewMenuButton}>
        <Icon name="settings-outline" size={11} color={colors.steel} />
      </Pressable>
      {open ? (
        <View style={styles.previewActions}>
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

function createStyles(colors: typeof import('../../shared/design/tokens').colors, isDark: boolean) {
  return StyleSheet.create({
  card: { width: '100%', minWidth: 0, height: 264, borderRadius: rounded.lg, borderWidth: 1, borderColor: isDark ? '#353a45' : colors.hairline, paddingHorizontal: 5, paddingVertical: 7, gap: 2, ...shadows.card },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  titleBlock: { flex: 1, minWidth: 0 },
  workspaceName: { fontSize: 7, fontWeight: '500', lineHeight: 9, color: colors.steel, textTransform: 'uppercase' },
  titleButton: { minHeight: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 3, paddingRight: 1 },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  title: { fontSize: 13, fontWeight: '700', lineHeight: 16, color: colors.charcoal, flex: 1, minWidth: 0 },
  titleMeta: { flexShrink: 0, flexDirection: 'row', gap: 2, paddingTop: 1 },
  titleMetaText: { fontSize: 7, fontWeight: '700', lineHeight: 9, color: colors.steel, textTransform: 'uppercase' },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 3, maxWidth: 40 },
  iconButtonSmall: { width: 18, height: 18, borderRadius: rounded.xs, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.12)' : colors.hairline, backgroundColor: isDark ? 'rgba(10,11,14,0.72)' : 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  actionsPanel: { flexDirection: 'row', gap: 4 },
  panelButton: { flex: 1, minHeight: 32, paddingHorizontal: 4 },
  previewScroller: { flex: 1, minHeight: 0, marginTop: 1 },
  previewList: { gap: 1, paddingBottom: 2 },
  inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 27, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.xs, backgroundColor: isDark ? 'rgba(10,11,14,0.82)' : colors.canvas, paddingHorizontal: 5 },
  inlineInput: { ...typography.micro, color: colors.charcoal, flex: 1, minWidth: 0, paddingVertical: 0 },
  inlineIconButton: { width: 22, height: 22, borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center' },
  previewNote: { position: 'relative', flexDirection: 'row', alignItems: 'flex-start', gap: 4, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, borderRadius: rounded.xs, backgroundColor: isDark ? 'rgba(10,11,14,0.54)' : 'rgba(255,255,255,0.66)', paddingHorizontal: 4, paddingVertical: 3, marginTop: 0 },
  previewText: { fontSize: 11, fontWeight: '500', lineHeight: 13, color: colors.charcoal, flex: 1, minWidth: 0, paddingRight: 24 },
  previewMenuButton: { position: 'absolute', top: 3, right: 3, width: 22, height: 16, borderRadius: rounded.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: isDark ? 'rgba(243,241,236,0.10)' : colors.hairlineSoft, zIndex: 4 },
  previewActions: { position: 'absolute', top: 22, right: 3, zIndex: 5, minWidth: 94, borderRadius: rounded.xs, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, padding: 3, ...shadows.card },
  previewAction: { minHeight: 22, justifyContent: 'center', paddingHorizontal: 6 },
  previewActionText: { ...typography.micro, color: colors.charcoal },
  previewActionDanger: { ...typography.micro, color: colors.semanticError },
  previewPriorityPicker: { gap: 3, borderTopWidth: 1, borderTopColor: colors.hairlineSoft, borderBottomWidth: 1, borderBottomColor: colors.hairlineSoft, paddingVertical: 3, marginVertical: 2 },
  previewPrioritySearch: { height: 26, borderRadius: rounded.xs, borderWidth: 1, borderColor: colors.hairlineStrong, color: colors.ink, backgroundColor: colors.surfaceSoft, paddingHorizontal: 6, paddingVertical: 0, fontSize: 11, lineHeight: 14 },
  previewPriorityScroll: { maxHeight: 96 },
  previewPriorityOption: { minHeight: 24, borderRadius: rounded.xs, justifyContent: 'center', paddingHorizontal: 7, backgroundColor: colors.surfaceSoft, marginBottom: 2 },
  previewPriorityOptionCurrent: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryDeep },
  previewPriorityOptionText: { ...typography.micro, color: colors.charcoal },
  previewPriorityOptionTextCurrent: { color: colors.onPrimary },
  emptyPreview: { borderRadius: rounded.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairlineStrong, padding: spacing.sm, backgroundColor: isDark ? 'rgba(10,11,14,0.42)' : 'rgba(255,255,255,0.45)' },
  emptyPreviewText: { ...typography.micro, color: colors.slate },
  });
}
