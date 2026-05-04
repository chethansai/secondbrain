import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { CategorySummary } from '../../shared/types/notes';
import { Icon } from '../../shared/ui/Icon';

type Props = {
  categories: CategorySummary[];
  onSelect: (path: string[]) => void;
};

export function CategoryList({ categories, onSelect }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const tints = useMemo(() => createCategoryTints(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.grid}>
      {categories.map((category, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${category.name}`}
          key={category.path.join('/')}
          onPress={() => onSelect(category.path)}
          style={[styles.card, { backgroundColor: tints[index % tints.length] }]}
        >
          <View style={styles.iconRow}>
            <View style={styles.iconBox}>
              <Icon name="folder-outline" size={20} color={colors.charcoal} />
            </View>
            <Icon name="chevron-forward" size={18} color={colors.steel} />
          </View>
          <Text style={styles.name} numberOfLines={2}>{category.name}</Text>
          <Text style={styles.meta}>{category.noteCount} notes / {category.childCount} folders</Text>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors, isDark: boolean) {
  return StyleSheet.create({
  grid: { gap: spacing.md },
  card: { borderRadius: rounded.lg, padding: spacing.xl, gap: spacing.sm, borderWidth: 1, borderColor: isDark ? '#353a45' : colors.hairline },
  iconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBox: { width: 38, height: 38, borderRadius: rounded.md, backgroundColor: isDark ? 'rgba(10,11,14,0.66)' : 'rgba(255,255,255,0.68)', alignItems: 'center', justifyContent: 'center' },
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