import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../shared/design/tokens';
import { normalizeNoteText } from '../notes/noteMutations';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { TextInputField } from '../../shared/ui/TextInputField';

type Props = {
  visible: boolean;
  title: string;
  initialText?: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<boolean> | boolean;
};

export function NoteEditorModal({ visible, title, initialText = '', onClose, onSubmit }: Props) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);

  useEffect(() => setText(normalizeNoteText(initialText)), [initialText, visible]);

  async function submit() {
    setBusy(true);
    const ok = await onSubmit(text);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <ModalShell visible={visible} title={title} onClose={onClose}>
      <View style={styles.content}>
        <TextInputField value={text} onChangeText={setText} autoCapitalize="sentences" multiline placeholder="Write a note" accessibilityLabel="Note text" />
        <Button label="Save note" icon="checkmark" onPress={submit} disabled={busy || !text.trim()} />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md } });