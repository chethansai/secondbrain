import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { TextInputField } from '../../shared/ui/TextInputField';
import { NotesData } from '../../shared/types/notes';
import { validateNotesData } from '../sync/validation';
import { copyText } from './clipboard';

type Props = {
  data: NotesData;
  onImport: (data: NotesData) => Promise<boolean> | boolean;
};

export function SettingsPanel({ data, onImport }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

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
      <Button label="Copy export JSON" icon="copy-outline" onPress={exportJson} />
      <TextInputField value={importText} onChangeText={setImportText} multiline placeholder="Paste simple nested JSON" accessibilityLabel="Import JSON" />
      <Button label="Import JSON" icon="cloud-upload-outline" variant="dark" onPress={importJson} disabled={!importText.trim()} />
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  wrap: { gap: spacing.md },
  status: { ...typography.bodySmMedium, color: colors.slate },
  });
}