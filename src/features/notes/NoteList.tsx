import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { FlatNote } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';

type Props = {
  notes: FlatNote[];
  onEdit: (note: FlatNote) => void;
  onMove: (note: FlatNote) => void;
  onDelete: (note: FlatNote) => void;
};

export function NoteList({ notes, onEdit, onMove, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.list}>
      {notes.map((note, index) => (
        <View key={`${note.path.join('/')}-${note.index}-${index}`} style={styles.card}>
          <Text style={styles.text}>{note.note}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit note" onPress={() => onEdit(note)} style={styles.iconButton}>
              <Icon name="create-outline" size={18} color={colors.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Move or copy note" onPress={() => onMove(note)} style={styles.iconButton}>
              <Icon name="git-branch-outline" size={18} color={colors.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete note" onPress={() => onDelete(note)} style={styles.iconButton}>
              <Icon name="trash-outline" size={18} color={colors.semanticError} />
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  list: { gap: spacing.sm },
  card: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.lg, padding: spacing.lg, gap: 1 },
  text: { ...typography.body, color: colors.charcoal },
  actions: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end' },
  iconButton: { width: 40, height: 40, borderRadius: rounded.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  });
}