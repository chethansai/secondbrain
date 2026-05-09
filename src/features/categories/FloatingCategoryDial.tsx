import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, NotesData } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';
import { collapseExactNameCategories, formatPath, listAllCategories } from './categoryTree';

type Props = {
  data: NotesData;
  disabled?: boolean;
  selectedPath?: CategoryPath | null;
  onSelect: (path: CategoryPath) => Promise<boolean> | boolean;
};

export function FloatingCategoryDial({ data, disabled = false, selectedPath = null, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const categories = useMemo(() => {
    return collapseExactNameCategories(listAllCategories(data))
      .map((category) => category.path)
      .sort((left, right) => formatPath(left).localeCompare(formatPath(right), undefined, { sensitivity: 'base' }));
  }, [data]);

  async function selectCategory(path: CategoryPath) {
    if (disabled) return;
    const ok = await onSelect(path);
    if (ok) setOpen(false);
  }

  if (categories.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close category dial' : 'Open category dial'}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={[styles.trigger, open && styles.triggerOpen, disabled && styles.disabled]}
      >
        <Icon name="folder-outline" size={16} color={open ? colors.onPrimary : colors.primary} />
      </Pressable>

      {open ? (
        <View style={styles.dialPanel}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.buttonGrid} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {categories.map((path) => {
              const active = selectedPath?.join('\u001f') === path.join('\u001f');
              return (
                <Pressable
                  key={path.join('\u001f')}
                  accessibilityRole="button"
                  accessibilityLabel={`Save note to ${formatPath(path)}`}
                  disabled={disabled}
                  onPress={() => selectCategory(path)}
                  style={[styles.categoryButton, active && styles.categoryButtonActive, disabled && styles.disabled]}
                >
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]} numberOfLines={1}>{formatPath(path)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { position: 'relative', alignSelf: 'flex-start', zIndex: 20, elevation: 12 },
    trigger: { width: 42, height: 42, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairlineStrong },
    triggerOpen: { backgroundColor: colors.primary, borderColor: colors.primary },
    disabled: { opacity: 0.55 },
    dialPanel: { position: 'absolute', left: 0, top: 48, width: 300, maxWidth: 300, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.xs, zIndex: 30, elevation: 16 },
    scroll: { maxHeight: 220 },
    buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingBottom: spacing.xs },
    categoryButton: { minHeight: 34, maxWidth: '100%', borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.sm, justifyContent: 'center', flexGrow: 1, flexBasis: '46%' },
    categoryButtonActive: { backgroundColor: colors.inkDeep, borderColor: colors.inkDeep },
    categoryText: { ...typography.micro, color: colors.charcoal, textAlign: 'center' },
    categoryTextActive: { color: colors.onDark },
  });
}