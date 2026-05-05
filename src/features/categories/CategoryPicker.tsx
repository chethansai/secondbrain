import { ScrollView, StyleSheet, Text, Pressable } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { NotesData, CategoryPath } from '../../shared/types/notes';
import { collapseExactNameCategories, formatPath, listAllCategories } from './categoryTree';

type Props = {
  data: NotesData;
  selectedPath: CategoryPath | null;
  onSelect: (path: CategoryPath) => void;
  disabled?: boolean;
};

export function CategoryPicker({ data, selectedPath, onSelect, disabled = false }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const paths = useMemo(() => collapseExactNameCategories(listAllCategories(data)).map((category) => category.path), [data]);
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      {paths.map((path) => {
        const active = selectedPath?.join('/') === path.join('/');
        return (
          <Pressable key={path.join('/')} disabled={disabled} onPress={() => onSelect(path)} style={[styles.row, active && styles.active, disabled && styles.disabled]}>
            <Text style={[styles.text, active && styles.activeText]}>{formatPath(path)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  list: { maxHeight: 260 },
  content: { gap: spacing.xs },
  row: { borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, padding: spacing.sm, backgroundColor: colors.canvas },
  disabled: { opacity: 0.6 },
  active: { backgroundColor: colors.inkDeep, borderColor: colors.inkDeep },
  text: { ...typography.bodySmMedium, color: colors.charcoal },
  activeText: { color: colors.onDark },
  });
}