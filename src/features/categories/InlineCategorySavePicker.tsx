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
  excludedPath?: CategoryPath;
  selectedPath?: CategoryPath | null;
  onSelect: (path: CategoryPath) => Promise<boolean> | boolean;
};

export function InlineCategorySavePicker({ data, disabled = false, excludedPath = [], selectedPath = null, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const excludedKey = pathKey(excludedPath);
  const selectedKey = selectedPath ? pathKey(selectedPath) : null;
  const categories = useMemo(() => {
    return collapseExactNameCategories(listAllCategories(data))
      .map((category) => category.path)
      .filter((path) => pathKey(path) !== excludedKey)
      .sort((left, right) => formatPath(left).localeCompare(formatPath(right), undefined, { sensitivity: 'base' }));
  }, [data, excludedKey]);

  async function selectCategory(path: CategoryPath) {
    if (disabled) return;
    setOpenMenuKey(null);
    await onSelect(path);
  }

  if (categories.length === 0) return null;

  return (
    <ScrollView style={styles.pane} contentContainerStyle={styles.chipGroup} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
      {categories.map((path) => {
        const key = pathKey(path);
        const label = formatPath(path);
        const active = selectedKey === key;
        const menuOpen = openMenuKey === key;
        return (
          <View key={key} style={[styles.chipWrap, menuOpen && styles.chipWrapOpen]}>
            <View style={[styles.chip, active && styles.chipActive, disabled && styles.disabled]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Save note to ${label}`} disabled={disabled} onPress={() => selectCategory(path)} style={styles.chipLabelButton}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open options for ${label}`}
                disabled={disabled}
                onPress={() => setOpenMenuKey((current) => (current === key ? null : key))}
                style={[styles.overflowButton, active && styles.overflowButtonActive]}
              >
                <Icon name="ellipsis-vertical" size={16} color={active ? colors.onPrimary : colors.steel} />
              </Pressable>
            </View>
            {menuOpen ? (
              <View style={styles.menu}>
                <Pressable accessibilityRole="menuitem" accessibilityLabel={`Save note to ${label}`} disabled={disabled} onPress={() => selectCategory(path)} style={styles.menuItem}>
                  <Icon name="checkmark" size={14} color={colors.primary} />
                  <Text style={styles.menuItemText}>Save here</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function pathKey(path: CategoryPath) {
  return path.join('\u001f');
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    pane: { maxHeight: 196, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft },
    chipGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.xs, padding: spacing.xs, paddingBottom: spacing.md },
    chipWrap: { position: 'relative', width: '100%', maxWidth: 320, zIndex: 1 },
    chipWrapOpen: { zIndex: 20, elevation: 8 },
    chip: { minHeight: 38, maxWidth: '100%', borderRadius: rounded.full, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, flexDirection: 'row', alignItems: 'stretch', overflow: 'visible' },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primaryDeep },
    chipLabelButton: { minHeight: 36, flex: 1, justifyContent: 'center', paddingLeft: spacing.sm, paddingRight: spacing.xs, paddingVertical: spacing.xs },
    chipText: { ...typography.bodySmMedium, color: colors.charcoal, flexWrap: 'wrap', width: '100%' },
    chipTextActive: { color: colors.onPrimary },
    overflowButton: { width: 34, minHeight: 36, borderLeftWidth: 1, borderLeftColor: colors.hairlineSoft, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: rounded.full, borderBottomRightRadius: rounded.full },
    overflowButtonActive: { borderLeftColor: colors.primaryDeep },
    menu: { position: 'absolute', top: 42, right: 0, width: 132, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.xs, zIndex: 30, elevation: 12 },
    menuItem: { minHeight: 34, borderRadius: rounded.sm, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    menuItemText: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1 },
    disabled: { opacity: 0.55 },
  });
}