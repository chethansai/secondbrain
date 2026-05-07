import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { TextInputField } from '../../shared/ui/TextInputField';
import { defaultAiProvider, readAiProviders, writeAiProviders } from './settings';
import { AiProviderConfig } from './types';

export function AiSettingsPanel() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [providers, setProviders] = useState<AiProviderConfig[]>([defaultAiProvider]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    readAiProviders().then((nextProviders) => setProviders(nextProviders.length ? nextProviders : [defaultAiProvider])).catch(() => undefined);
  }, []);

  async function save() {
    await writeAiProviders(providers);
    setStatus('AI providers saved.');
  }

  function updateProvider(index: number, patch: Partial<AiProviderConfig>) {
    setProviders((current) => current.map((provider, providerIndex) => providerIndex === index ? { ...provider, ...patch } : provider));
  }

  function addProvider() {
    setProviders((current) => [...current, { ...defaultAiProvider, id: `fallback-${Date.now()}`, name: `Fallback ${current.length}` }]);
  }

  function removeProvider(index: number) {
    setProviders((current) => current.length <= 1 ? current : current.filter((_, providerIndex) => providerIndex !== index));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>AI providers</Text>
        <Button label="Add" icon="add" variant="secondary" onPress={addProvider} />
      </View>
      {providers.map((provider, index) => (
        <View key={provider.id} style={styles.providerCard}>
          <View style={styles.providerHeader}>
            <Text style={styles.providerTitle}>{index === 0 ? 'Primary' : `Fallback ${index}`}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${provider.name}`} disabled={providers.length <= 1} onPress={() => removeProvider(index)} style={[styles.iconButton, providers.length <= 1 && styles.disabled]}>
              <Icon name="trash-outline" size={14} color={providers.length <= 1 ? colors.stone : colors.semanticError} />
            </Pressable>
          </View>
          <TextInputField value={provider.name} onChangeText={(name) => updateProvider(index, { name })} placeholder="Provider name" accessibilityLabel="AI provider name" autoCapitalize="words" autoCorrect={false} />
          <TextInputField value={provider.endpoint} onChangeText={(endpoint) => updateProvider(index, { endpoint })} placeholder="Endpoint URL" accessibilityLabel="AI endpoint URL" autoCapitalize="none" autoCorrect={false} />
          <TextInputField value={provider.model} onChangeText={(model) => updateProvider(index, { model })} placeholder="Model" accessibilityLabel="AI model" autoCapitalize="none" autoCorrect={false} />
          <TextInputField value={provider.token} onChangeText={(token) => updateProvider(index, { token })} placeholder="Bearer token" accessibilityLabel="AI bearer token" autoCapitalize="none" autoCorrect={false} />
          <TextInputField value={String(provider.timeoutMs)} onChangeText={(value) => updateProvider(index, { timeoutMs: Number(value.replace(/[^0-9]/g, '')) || provider.timeoutMs })} placeholder="Timeout ms" accessibilityLabel="AI timeout" keyboardType="number-pad" />
        </View>
      ))}
      <Button label="Save AI providers" icon="cloud-done-outline" onPress={save} />
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, borderRadius: rounded.md, padding: spacing.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    title: { ...typography.bodySmMedium, color: colors.ink, flex: 1 },
    providerCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, borderRadius: rounded.md, padding: spacing.sm },
    providerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    providerTitle: { ...typography.captionBold, color: colors.primary },
    iconButton: { width: 34, height: 34, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
    disabled: { opacity: 0.5 },
    status: { ...typography.bodySm, color: colors.slate },
  });
}
