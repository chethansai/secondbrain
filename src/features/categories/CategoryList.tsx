import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, CategorySummary } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';

type Props = {
  categories: CategorySummary[];
  expandedKeys?: Set<string>;
  onToggleCategory?: (path: CategoryPath) => void;
  onSelect: (path: CategoryPath) => void;
};

export function CategoryList({ categories, expandedKeys, onToggleCategory, onSelect }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const tints = useMemo(() => createCategoryTints(colors, isDark), [colors, isDark]);
  const [localExpandedKeys, setLocalExpandedKeys] = useState<Set<string>>(() => new Set());
  const activeExpandedKeys = expandedKeys ?? localExpandedKeys;
  const directCategories = useMemo(() => categories.filter((category) => category.path.length === categories[0]?.path.length), [categories]);
  const childCategoriesByParentKey = useMemo(() => groupChildCategories(categories), [categories]);

  function toggleCategory(path: CategoryPath) {
    if (onToggleCategory) {
      onToggleCategory(path);
      return;
    }
    const key = pathKey(path);
    setLocalExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <View style={styles.grid}>
      {directCategories.map((category, index) => (
        <CategoryListItem
          key={pathKey(category.path)}
          category={category}
          depth={0}
          tint={tints[index % tints.length]}
          expandedKeys={activeExpandedKeys}
          childCategoriesByParentKey={childCategoriesByParentKey}
          colors={colors}
          styles={styles}
          onToggle={toggleCategory}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function CategoryListItem({ category, depth, tint, expandedKeys, childCategoriesByParentKey, colors, styles, onToggle, onSelect }: { category: CategorySummary; depth: number; tint: string; expandedKeys: Set<string>; childCategoriesByParentKey: Map<string, CategorySummary[]>; colors: typeof import('../../shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onToggle: (path: CategoryPath) => void; onSelect: (path: CategoryPath) => void }) {
  const children = childCategoriesByParentKey.get(pathKey(category.path)) ?? [];
  const expandable = children.length > 0;
  const expanded = expandedKeys.has(pathKey(category.path));
  const indent = depth * spacing.md;

  return (
    <View style={styles.itemStack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${category.name}`}
        onPress={() => onSelect(category.path)}
        style={[styles.card, { backgroundColor: tint, marginLeft: indent }]}
      >
        <View style={styles.iconRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expandable ? `${expanded ? 'Enclose' : 'Disclose'} ${category.name}` : `${category.name} has no subcategories`}
            disabled={!expandable}
            onPress={(event) => { event.stopPropagation(); onToggle(category.path); }}
            style={[styles.iconBox, !expandable && styles.iconBoxDisabled]}
          >
            <Icon name={expandable ? (expanded ? 'chevron-down' : 'chevron-forward') : 'folder-outline'} size={20} color={colors.charcoal} />
          </Pressable>
          <Icon name="chevron-forward" size={18} color={colors.steel} />
        </View>
        <Text style={styles.name} numberOfLines={2}>{category.name}</Text>
        <Text style={styles.meta}>{category.noteCount} notes / {category.childCount} folders</Text>
      </Pressable>
      {expanded ? children.map((child) => (
        <CategoryListItem
          key={pathKey(child.path)}
          category={child}
          depth={depth + 1}
          tint={tint}
          expandedKeys={expandedKeys}
          childCategoriesByParentKey={childCategoriesByParentKey}
          colors={colors}
          styles={styles}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      )) : null}
    </View>
  );
}

function groupChildCategories(categories: CategorySummary[]) {
  return categories.reduce<Map<string, CategorySummary[]>>((groups, category) => {
    const parentKey = pathKey(category.path.slice(0, -1));
    const siblings = groups.get(parentKey) ?? [];
    siblings.push(category);
    groups.set(parentKey, siblings);
    return groups;
  }, new Map());
}

function pathKey(path: CategoryPath) {
  return path.join('');
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors, isDark: boolean) {
  return StyleSheet.create({
  grid: { gap: spacing.md },
  itemStack: { gap: spacing.sm },
  card: { borderRadius: rounded.lg, padding: spacing.xl, gap: spacing.sm, borderWidth: 1, borderColor: isDark ? '#353a45' : colors.hairline },
  iconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBox: { width: 38, height: 38, borderRadius: rounded.md, backgroundColor: isDark ? 'rgba(10,11,14,0.66)' : 'rgba(255,255,255,0.68)', alignItems: 'center', justifyContent: 'center' },
  iconBoxDisabled: { opacity: 0.72 },
  name: { ...typography.heading5, color: colors.charcoal },
  meta: { ...typography.bodySm, color: colors.slate },
  });
}

function createCategoryTints(colors: typeof import('../../shared/design/tokens').colors, isDark: boolean) {
  if (isDark) {
    return ['#1e2634', '#2f2430', '#1f2c29', '#232735', '#252337', '#2c2920'];
  }

  return [colors.cardTintPeach, colors.cardTintRose, colors.cardTintMint, colors.cardTintSky, colors.cardTintLavender, colors.cardTintYellow];
}
