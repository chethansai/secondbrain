import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { NotesData, FlatNote } from '../../shared/types/notes';
import { TextInputField } from '../../shared/ui/TextInputField';
import { formatPath } from '../categories/categoryTree';
import { flattenNotes } from '../notes/noteMutations';

type Props = {
  data: NotesData;
  onSelect: (note: FlatNote) => void;
};

export function SearchPanel({ data, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    return flattenNotes(data).filter((note) => note.note.toLowerCase().includes(clean) || formatPath(note.path).toLowerCase().includes(clean));
  }, [data, query]);

  return (
    <View style={styles.wrap}>
      <TextInputField value={query} onChangeText={setQuery} placeholder="Search notes" accessibilityLabel="Search notes" />
      {results.map((note, index) => (
        <Pressable key={`${note.path.join('/')}-${note.index}-${index}`} onPress={() => onSelect(note)} style={styles.result}>
          <Text style={styles.path}>{formatPath(note.path)}</Text>
          <Text style={styles.note} numberOfLines={3}>{note.note}</Text>
        </Pressable>
      ))}
      {query.trim() && results.length === 0 ? <Text style={styles.empty}>No matching notes.</Text> : null}
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  wrap: { gap: spacing.sm },
  result: { backgroundColor: colors.canvas, borderRadius: rounded.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.md, gap: spacing.xs },
  path: { ...typography.captionBold, color: colors.primary },
  note: { ...typography.bodySm, color: colors.charcoal },
  empty: { ...typography.bodySm, color: colors.slate, textAlign: 'center', padding: spacing.lg },
  });
}