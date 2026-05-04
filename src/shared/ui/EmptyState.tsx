import { StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../design/tokens';
import { Button } from './Button';
import { Icon } from './Icon';

type Props = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, message, actionLabel, onAction }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <View style={styles.iconBubble}>
        <Icon name="document-text-outline" size={24} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} icon="add" onPress={onAction} /> : null}
    </View>
  );
}

function createStyles(colors: typeof import('../design/tokens').colors) {
  return StyleSheet.create({
  empty: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: rounded.lg,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: rounded.lg,
    backgroundColor: colors.cardTintLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.heading5, color: colors.ink, textAlign: 'center' },
  message: { ...typography.bodySm, color: colors.slate, textAlign: 'center' },
  });
}