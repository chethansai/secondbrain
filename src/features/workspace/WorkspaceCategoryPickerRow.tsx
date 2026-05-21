import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatPath } from '../categories/categoryTree';
import { colors as baseColors, rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, CategorySummary } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';

type Props = {
  category: CategorySummary;
  selected: boolean;
  priority: number;
  priorityOptions: number[];
  priorityMenuOpen: boolean;
  actionsMenuOpen: boolean;
  colors: typeof baseColors;
  onToggleCategory: (path: CategoryPath) => void;
  onTogglePriorityMenu: () => void;
  onSetPriority: (path: CategoryPath, priority: number) => void;
  onToggleActionsMenu: () => void;
  onCreateSubcategory: (path: CategoryPath) => void;
};

export function WorkspaceCategoryPickerRow({ category, selected, priority, priorityOptions, priorityMenuOpen, actionsMenuOpen, colors, onToggleCategory, onTogglePriorityMenu, onSetPriority, onToggleActionsMenu, onCreateSubcategory }: Props) {
  const styles = createStyles(colors);

  return (
    <View style={[styles.row, selected && styles.rowSelected, (priorityMenuOpen || actionsMenuOpen) && styles.rowMenuOpen]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${selected ? 'Hide' : 'Show'} ${formatPath(category.path)}`} onPress={() => onToggleCategory(category.path)} style={styles.main}>
        <View style={[styles.selectionBox, selected && styles.selectionBoxSelected]}>
          {selected ? <Icon name="checkmark" size={11} color={colors.onPrimary} /> : null}
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>{category.name}</Text>
          <Text style={styles.path} numberOfLines={1}>{formatPath(category.path)}</Text>
        </View>
      </Pressable>

      <View style={styles.priorityWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Priority ${priority} for ${category.name}`} onPress={onTogglePriorityMenu} style={[styles.priorityButton, selected && styles.priorityButtonSelected]}>
          <Text style={[styles.priorityButtonText, selected && styles.priorityButtonTextSelected]}>{priority}</Text>
          <Icon name="chevron-down" size={10} color={selected ? colors.charcoal : colors.steel} />
        </Pressable>
        {priorityMenuOpen ? (
          <View style={styles.priorityMenu}>
            {priorityOptions.map((option) => (
              <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Set ${category.name} priority ${option}`} onPress={() => onSetPriority(category.path, option)} style={[styles.priorityMenuItem, option === priority && selected && styles.priorityMenuItemActive]}>
                <Text style={[styles.priorityMenuItemText, option === priority && selected && styles.priorityMenuItemTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.actionsWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open options for ${category.name}`} onPress={onToggleActionsMenu} style={styles.actionsButton}>
          <Icon name="ellipsis-vertical" size={15} color={colors.steel} />
        </Pressable>
        {actionsMenuOpen ? (
          <View style={styles.actionsMenu}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Create subcategory inside ${category.name}`} onPress={() => onCreateSubcategory(category.path)} style={styles.actionsMenuItem}>
              <View style={styles.actionsMenuIcon}><Icon name="folder-outline" size={15} color={colors.ink} /></View>
              <Text style={styles.actionsMenuText} numberOfLines={1}>Create subcategory</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: typeof baseColors) {
  return StyleSheet.create({
    row: { position: 'relative', minHeight: 52, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, padding: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, zIndex: 1 },
    rowSelected: { backgroundColor: colors.cardTintYellow, borderColor: colors.brandYellow, zIndex: 2 },
    rowMenuOpen: { zIndex: 100, elevation: 12 },
    main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    selectionBox: { width: 24, height: 24, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    selectionBoxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
    textBlock: { flex: 1, minWidth: 0 },
    name: { ...typography.bodySmMedium, color: colors.slate },
    nameSelected: { color: colors.charcoal },
    path: { ...typography.micro, color: colors.steel },
    priorityWrap: { position: 'relative', zIndex: 110, elevation: 12, flexShrink: 0 },
    priorityButton: { width: 46, height: 34, borderRadius: rounded.md, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas },
    priorityButtonSelected: { borderColor: colors.brandYellow, backgroundColor: colors.cardTintYellowBold },
    priorityButtonText: { ...typography.captionBold, color: colors.steel, minWidth: 14, textAlign: 'center' },
    priorityButtonTextSelected: { color: colors.charcoal },
    priorityMenu: { position: 'absolute', top: 38, right: 0, width: 54, maxHeight: 220, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: 3, gap: 2, zIndex: 140, elevation: 18 },
    priorityMenuItem: { height: 28, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
    priorityMenuItemActive: { backgroundColor: colors.primary },
    priorityMenuItemText: { ...typography.micro, color: colors.charcoal },
    priorityMenuItemTextActive: { color: colors.onPrimary },
    actionsWrap: { position: 'relative', zIndex: 120, elevation: 13, flexShrink: 0 },
    actionsButton: { width: 34, height: 34, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas },
    actionsMenu: { position: 'absolute', top: 38, right: 0, width: 184, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: 4, gap: 3, zIndex: 150, elevation: 20 },
    actionsMenuItem: { minHeight: 36, borderRadius: rounded.sm, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceSoft },
    actionsMenuIcon: { width: 24, height: 24, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, flexShrink: 0 },
    actionsMenuText: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1, minWidth: 0 },
  });
}
