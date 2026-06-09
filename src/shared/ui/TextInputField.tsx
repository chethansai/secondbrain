import { Text, TextInput, TextInputProps, View, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '../design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../design/tokens';

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export function TextInputField({ label, error, style, ...props }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.stone}
        style={[styles.input, props.multiline ? styles.multiline : undefined, error ? styles.errorBorder : undefined, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function createStyles(colors: typeof import('../design/tokens').colors) {
  return StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.bodySmMedium, color: colors.charcoal },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: rounded.md,
    backgroundColor: colors.canvas,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodySm,
  },
  multiline: { minHeight: 132, textAlignVertical: 'top' },
  errorBorder: { borderColor: colors.semanticError },
  error: { ...typography.captionBold, color: colors.semanticError },
  });
}