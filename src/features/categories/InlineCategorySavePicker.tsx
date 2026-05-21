import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  onCreateSubcategory?: (path: CategoryPath, name: string) => Promise<CategoryPath | null> | CategoryPath | null;
};

export function InlineCategorySavePicker({ data, disabled = false, excludedPath = [], selectedPath = null, onSelect, onCreateSubcategory }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [subcategoryParentKey, setSubcategoryParentKey] = useState<string | null>(null);
  const [subcategoryName, setSubcategoryName] = useState('');
  const [creating, setCreating] = useState(false);
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
    setSubcategoryParentKey(null);
    await onSelect(path);
  }

  async function submitSubcategory(path: CategoryPath) {
    if (disabled || creating || !onCreateSubcategory) return;
    const cleanName = subcategoryName.trim();
    if (!cleanName) return;
    setCreating(true);
    const nextPath = await onCreateSubcategory(path, cleanName);
    setCreating(false);
    if (nextPath) {
      setSubcategoryName('');
      setSubcategoryParentKey(null);
      setOpenMenuKey(null);
      await onSelect(nextPath);
    }
  }

  if (categories.length === 0) return null;

  return (
    <ScrollView style={styles.pane} contentContainerStyle={styles.chipGroup} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
      {categories.map((path) => {
        const key = pathKey(path);
        const label = formatPath(path);
        const active = selectedKey === key;
        const menuOpen = openMenuKey === key;
        const creatingHere = subcategoryParentKey === key;
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
                onPress={() => {
                  setOpenMenuKey((current) => (current === key ? null : key));
                  setSubcategoryParentKey(null);
                  setSubcategoryName('');
                }}
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
                {onCreateSubcategory ? (
                  <Pressable accessibilityRole="menuitem" accessibilityLabel={`Create subcategory inside ${label}`} disabled={disabled} onPress={() => setSubcategoryParentKey(creatingHere ? null : key)} style={styles.menuItem}>
                    <Icon name="folder-outline" size={14} color={colors.primary} />
                    <Text style={styles.menuItemText}>Create as subcategory</Text>
                  </Pressable>
                ) : null}
                {creatingHere ? (
                  <View style={styles.createBox}>
                    <TextInput
                      value={subcategoryName}
                      onChangeText={setSubcategoryName}
                      autoCapitalize="sentences"
                      placeholder="Subcategory name"
                      placeholderTextColor={colors.stone}
                      accessibilityLabel={`New subcategory name inside ${label}`}
                      editable={!disabled && !creating}
                      returnKeyType="done"
                      onSubmitEditing={() => submitSubcategory(path)}
                      style={styles.createInput}
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel={`Create subcategory inside ${label}`} disabled={disabled || creating || !subcategoryName.trim()} onPress={() => submitSubcategory(path)} style={[styles.createButton, (!subcategoryName.trim() || creating) && styles.createButtonDisabled]}>
                      <Icon name="add" size={14} color={colors.onPrimary} />
                      <Text style={styles.createButtonText}>Create</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function pathKey(path: CategoryPath) {
  return path.join('');
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
    menu: { position: 'absolute', top: 42, right: 0, width: 236, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.xs, gap: spacing.xs, zIndex: 30, elevation: 12 },
    menuItem: { minHeight: 34, borderRadius: rounded.sm, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    menuItemText: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1 },
    createBox: { gap: spacing.xs, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineSoft, backgroundColor: colors.surfaceSoft, padding: spacing.xs },
    createInput: { minHeight: 38, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, color: colors.ink, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, ...typography.bodySm },
    createButton: { minHeight: 34, borderRadius: rounded.sm, backgroundColor: colors.primary, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
    createButtonDisabled: { opacity: 0.55 },
    createButtonText: { ...typography.bodySmMedium, color: colors.onPrimary },
    disabled: { opacity: 0.55 },
  });
}
