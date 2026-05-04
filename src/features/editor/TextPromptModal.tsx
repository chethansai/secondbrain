import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { TextInputField } from '../../shared/ui/TextInputField';

type Props = {
  visible: boolean;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<boolean> | boolean;
};

export function TextPromptModal({ visible, title, label, initialValue = '', submitLabel, onClose, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => setValue(initialValue), [initialValue, visible]);

  async function submit() {
    setBusy(true);
    const ok = await onSubmit(value);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <ModalShell visible={visible} title={title} onClose={onClose}>
      <View style={styles.content}>
        <TextInputField label={label} value={value} onChangeText={setValue} autoCapitalize="sentences" />
        <Button label={submitLabel} icon="checkmark" onPress={submit} disabled={busy || !value.trim()} />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md } });