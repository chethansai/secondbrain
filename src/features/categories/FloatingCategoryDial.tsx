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
        <View style={styles.triggerIcon}>
          <Icon name="folder-outline" size={15} color={open ? colors.primary : colors.onPrimary} />
        </View>
        <Text style={[styles.triggerText, open && styles.triggerTextOpen]} numberOfLines={1}>Categories</Text>
        <Text style={[styles.triggerCount, open && styles.triggerCountOpen]}>{categories.length}</Text>
      </Pressable>

      {open ? (
        <View style={styles.dialPanel}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.buttonGrid} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
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
                  <View style={styles.categoryIconWrap}>
                    <Icon name="folder-outline" size={12} color={active ? colors.onDark : colors.primary} />
                  </View>
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{formatPath(path)}</Text>
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
    wrap: { width: '100%', gap: spacing.xs, zIndex: 20, elevation: 12 },
    trigger: { minHeight: 42, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairlineStrong, paddingHorizontal: spacing.sm, flexDirection: 'row', gap: spacing.xs, alignSelf: 'flex-start' },
    triggerIcon: { width: 24, height: 24, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    triggerText: { ...typography.bodySmMedium, color: colors.charcoal, maxWidth: 112 },
    triggerTextOpen: { color: colors.onPrimary },
    triggerCount: { ...typography.micro, color: colors.slate, minWidth: 18, textAlign: 'center' },
    triggerCountOpen: { color: colors.onPrimary },
    triggerOpen: { backgroundColor: colors.primary, borderColor: colors.primary },
    disabled: { opacity: 0.55 },
    dialPanel: { width: '100%', borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.xs, zIndex: 30, elevation: 16 },
    scroll: { maxHeight: 224 },
    buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.xs, paddingBottom: spacing.xs },
    categoryButton: { minHeight: 42, maxWidth: '100%', borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, justifyContent: 'center', alignItems: 'stretch', gap: spacing.xxs, flexGrow: 1, flexBasis: '31%' },
    categoryButtonActive: { backgroundColor: colors.inkDeep, borderColor: colors.inkDeep },
    categoryIconWrap: { alignItems: 'center' },
    categoryText: { ...typography.micro, color: colors.charcoal, textAlign: 'center', flexWrap: 'wrap', width: '100%' },
    categoryTextActive: { color: colors.onDark },
  });
}