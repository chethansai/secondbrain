import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, shadows, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { TextInputField } from '../../shared/ui/TextInputField';

type Props = {
  onUnlock: () => void;
};

export function LockScreen({ onUnlock }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();

  function submit() {
    if (password === 'c') {
      setError(undefined);
      onUnlock();
      return;
    }
    setError('Incorrect password.');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={styles.dotPink} />
      <View style={styles.dotYellow} />
      <View style={styles.dotGreen} />
      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Native workspace</Text>
        </View>
        <Text style={styles.title}>Meet the night shift.</Text>
        <Text style={styles.subtitle}>Unlock your notes workspace.</Text>
        <TextInputField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
          onSubmitEditing={submit}
          accessibilityLabel="Password"
        />
        <Button label="Unlock" icon="lock-open-outline" onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandNavy, justifyContent: 'center', padding: spacing.xl },
  card: { backgroundColor: colors.canvas, borderRadius: rounded.lg, padding: spacing.xxl, gap: spacing.lg, ...shadows.mockup },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: rounded.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  badgeText: { ...typography.captionBold, color: colors.onPrimary },
  title: { ...typography.hero, color: colors.ink, letterSpacing: 0 },
  subtitle: { ...typography.subtitle, color: colors.slate },
  dotPink: { position: 'absolute', width: 28, height: 28, borderRadius: rounded.sm, backgroundColor: colors.brandPink, top: 96, left: 32, transform: [{ rotate: '-12deg' }] },
  dotYellow: { position: 'absolute', width: 42, height: 42, borderRadius: rounded.md, backgroundColor: colors.brandYellow, right: 42, top: 158, transform: [{ rotate: '9deg' }] },
  dotGreen: { position: 'absolute', width: 20, height: 20, borderRadius: rounded.xs, backgroundColor: colors.brandGreen, right: 78, bottom: 126, transform: [{ rotate: '-6deg' }] },
  });
}