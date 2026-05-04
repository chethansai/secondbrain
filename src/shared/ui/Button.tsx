import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../design/tokens';
import { Icon, IconName } from './Icon';

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'onDark' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function Button({ label, onPress, icon, variant = 'primary', disabled, style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const variantStyles = useMemo(() => createVariantStyles(colors), [colors]);
  const textColors = useMemo(() => createTextColors(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={17} color={textColors[variant]} /> : null}
      <Text style={[styles.label, { color: disabled ? colors.muted : textColors[variant] }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function createTextColors(colors: typeof import('../design/tokens').colors): Record<ButtonVariant, string> {
  return {
  primary: colors.onPrimary,
  secondary: colors.ink,
  dark: colors.onDark,
  onDark: colors.ink,
  ghost: colors.ink,
  danger: colors.onPrimary,
  };
}

function createStyles(colors: typeof import('../design/tokens').colors) {
  return StyleSheet.create({
  base: {
    minHeight: 42,
    borderRadius: rounded.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  label: {
    ...typography.bodySmMedium,
  },
  disabled: {
    backgroundColor: colors.hairline,
    borderColor: colors.hairline,
  },
  pressed: {
    opacity: 0.82,
  },
  });
}

function createVariantStyles(colors: typeof import('../design/tokens').colors) {
  return StyleSheet.create({
  primary: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.hairlineStrong },
  dark: { backgroundColor: colors.inkDeep, borderWidth: 1, borderColor: colors.inkDeep },
  onDark: { backgroundColor: colors.onDark, borderWidth: 1, borderColor: colors.onDark },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'transparent' },
  danger: { backgroundColor: colors.semanticError, borderWidth: 1, borderColor: colors.semanticError },
  });
}