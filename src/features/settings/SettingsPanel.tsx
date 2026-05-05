import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { TextInputField } from '../../shared/ui/TextInputField';
import { NotesData } from '../../shared/types/notes';
import { authTimeoutOptions } from '../auth/authSession';
import { validateNotesData } from '../sync/validation';
import { copyText } from './clipboard';

type Props = {
  data: NotesData;
  authTimeoutHours: number;
  onAuthTimeoutChange: (hours: number) => Promise<void> | void;
  onImport: (data: NotesData) => Promise<boolean> | boolean;
};

export function SettingsPanel({ data, authTimeoutHours, onAuthTimeoutChange, onImport }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);

  async function exportJson() {
    const copied = await copyText(JSON.stringify(data, null, 2));
    setStatus(copied ? 'Export copied.' : 'Copy is available in the web browser.');
  }

  async function importJson() {
    try {
      const parsed = JSON.parse(importText);
      const validation = validateNotesData(parsed);
      if (!validation.ok) {
        setStatus(validation.message);
        return;
      }
      const ok = await onImport(validation.data);
      setStatus(ok ? 'Import saved.' : 'Import failed.');
    } catch {
      setStatus('Import JSON could not be parsed.');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.settingGroup}>
        <Text style={styles.settingLabel}>Ask for password after</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose password timeout" onPress={() => setAuthMenuOpen((current) => !current)} style={styles.dropdownButton}>
          <Text style={styles.dropdownValue}>{formatHours(authTimeoutHours)}</Text>
          <Icon name="chevron-down" size={16} color={colors.ink} />
        </Pressable>
        {authMenuOpen ? (
          <View style={styles.dropdownMenu}>
            {authTimeoutOptions.map((hours) => (
              <Pressable
                key={hours}
                accessibilityRole="button"
                accessibilityLabel={`Set password timeout to ${formatHours(hours)}`}
                onPress={async () => {
                  await onAuthTimeoutChange(hours);
                  setAuthMenuOpen(false);
                  setStatus(`Password will be asked again after ${formatHours(hours)}.`);
                }}
                style={[styles.dropdownOption, hours === authTimeoutHours && styles.dropdownOptionSelected]}
              >
                <Text style={[styles.dropdownOptionText, hours === authTimeoutHours && styles.dropdownOptionTextSelected]}>{formatHours(hours)}</Text>
                {hours === authTimeoutHours ? <Icon name="checkmark" size={16} color={colors.onPrimary} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Button label="Copy export JSON" icon="copy-outline" onPress={exportJson} />
      <TextInputField value={importText} onChangeText={setImportText} multiline placeholder="Paste simple nested JSON" accessibilityLabel="Import JSON" />
      <Button label="Import JSON" icon="cloud-upload-outline" variant="dark" onPress={importJson} disabled={!importText.trim()} />
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

function formatHours(hours: number) {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  wrap: { gap: spacing.md },
  settingGroup: { gap: spacing.xs },
  settingLabel: { ...typography.bodySmMedium, color: colors.charcoal },
  dropdownButton: { minHeight: 44, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.canvas, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dropdownValue: { ...typography.body, color: colors.ink, flex: 1 },
  dropdownMenu: { borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.canvas, overflow: 'hidden' },
  dropdownOption: { minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.hairlineSoft },
  dropdownOptionSelected: { backgroundColor: colors.primary },
  dropdownOptionText: { ...typography.bodySmMedium, color: colors.ink },
  dropdownOptionTextSelected: { color: colors.onPrimary },
  status: { ...typography.bodySmMedium, color: colors.slate },
  });
}