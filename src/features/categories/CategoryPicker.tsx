import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { NotesData, CategoryPath } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';
import { TextInputField } from '../../shared/ui/TextInputField';
import { collapseExactNameCategories, formatPath, listAllCategories } from './categoryTree';

type Props = {
  data: NotesData;
  selectedPath: CategoryPath | null;
  onSelect: (path: CategoryPath) => void;
  disabled?: boolean;
  pinnedPaths?: CategoryPath[];
  onTogglePin?: (path: CategoryPath) => void;
  onResetPins?: () => void;
};

export function CategoryPicker({ data, selectedPath, onSelect, disabled = false, pinnedPaths = [], onTogglePin, onResetPins }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const pinnedPathKeys = useMemo(() => new Map(pinnedPaths.map((path, index) => [pathKey(path), index])), [pinnedPaths]);
  const paths = useMemo(() => {
    const categories = collapseExactNameCategories(listAllCategories(data));
    const categoriesByKey = new Map(categories.map((category) => [pathKey(category.path), category]));
    return categories
      .map((category) => ({ category, pinIndex: pinnedPathKeys.get(pathKey(category.path)) ?? -1 }))
      .sort((left, right) => {
        const leftPinned = left.pinIndex >= 0;
        const rightPinned = right.pinIndex >= 0;
        if (leftPinned && rightPinned) return left.pinIndex - right.pinIndex;
        if (leftPinned) return -1;
        if (rightPinned) return 1;
        return formatPath(left.category.path).localeCompare(formatPath(right.category.path), undefined, { sensitivity: 'base' });
      })
      .map(({ category }) => categoriesByKey.get(pathKey(category.path))?.path ?? category.path);
  }, [data, pinnedPathKeys]);
  const filteredPaths = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return paths;
    return paths.filter((path) => formatPath(path).toLowerCase().includes(cleanQuery));
  }, [paths, query]);
  return (
    <View style={styles.wrap}>
      {onResetPins ? (
        <View style={styles.toolbar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset pinned category order" disabled={disabled || pinnedPaths.length === 0} onPress={onResetPins} style={[styles.resetButton, (disabled || pinnedPaths.length === 0) && styles.disabled]}>
            <Icon name="reload-outline" size={13} color={pinnedPaths.length ? colors.primary : colors.stone} />
            <Text style={[styles.resetText, !pinnedPaths.length && styles.resetTextDisabled]}>Reset</Text>
          </Pressable>
        </View>
      ) : null}
      <TextInputField value={query} onChangeText={setQuery} placeholder="Search categories" accessibilityLabel="Search categories" autoCapitalize="none" autoCorrect={false} editable={!disabled} />
      <ScrollView style={styles.list} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {filteredPaths.map((path) => {
          const active = selectedPath?.join('/') === path.join('/');
          const pinned = pinnedPathKeys.has(pathKey(path));
          return (
            <Pressable key={path.join('/')} disabled={disabled} onPress={() => onSelect(path)} style={[styles.row, active && styles.active, disabled && styles.disabled]}>
              <Text style={[styles.text, active && styles.activeText]} numberOfLines={1}>{formatPath(path)}</Text>
              {onTogglePin ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${pinned ? 'Unpin' : 'Pin'} ${formatPath(path)}`} disabled={disabled} onPress={(event) => { event.stopPropagation(); onTogglePin(path); }} style={[styles.pinButton, pinned && styles.pinButtonActive]}>
                  <Icon name="pin-outline" size={13} color={pinned ? colors.onPrimary : colors.steel} />
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}
        {query.trim() && filteredPaths.length === 0 ? <Text style={styles.empty}>No matching categories.</Text> : null}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  wrap: { gap: spacing.sm },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end' },
  resetButton: { minHeight: 32, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  resetText: { ...typography.micro, color: colors.primary },
  resetTextDisabled: { color: colors.stone },
  list: { maxHeight: 260 },
  content: { gap: spacing.xs },
  row: { minHeight: 44, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, paddingLeft: spacing.sm, paddingRight: spacing.xs, paddingVertical: spacing.xs, backgroundColor: colors.canvas, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  disabled: { opacity: 0.6 },
  active: { backgroundColor: colors.inkDeep, borderColor: colors.inkDeep },
  text: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1, minWidth: 0 },
  activeText: { color: colors.onDark },
  pinButton: { width: 32, height: 32, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pinButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  empty: { ...typography.bodySm, color: colors.slate, textAlign: 'center', padding: spacing.lg },
  });
}

function pathKey(path: CategoryPath) {
  return path.join('\u001f');
}