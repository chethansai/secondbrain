import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../shared/design/tokens';
import { CategoryPath, NotesData } from '../../shared/types/notes';
import { FloatingCategoryDial } from '../categories/FloatingCategoryDial';
import { normalizeNoteText } from '../notes/noteMutations';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { TextInputField } from '../../shared/ui/TextInputField';

type Props = {
  visible: boolean;
  title: string;
  initialText?: string;
  categoryData?: NotesData;
  selectedPath?: CategoryPath | null;
  onClose: () => void;
  onSubmit: (text: string) => Promise<boolean> | boolean;
  onSubmitToCategory?: (path: CategoryPath, text: string) => Promise<boolean> | boolean;
};

export function NoteEditorModal({ visible, title, initialText = '', categoryData, selectedPath = null, onClose, onSubmit, onSubmitToCategory }: Props) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);

  useEffect(() => setText(normalizeNoteText(initialText)), [initialText, visible]);

  async function submit() {
    setBusy(true);
    const ok = await onSubmit(text);
    setBusy(false);
    if (ok) onClose();
  }

  async function submitToCategory(path: CategoryPath) {
    if (!onSubmitToCategory) return false;
    setBusy(true);
    const ok = await onSubmitToCategory(path, text);
    setBusy(false);
    if (ok) onClose();
    return ok;
  }

  return (
    <ModalShell visible={visible} title={title} onClose={onClose}>
      <View style={styles.content}>
        <TextInputField value={text} onChangeText={setText} autoCapitalize="sentences" multiline placeholder="Write a note" accessibilityLabel="Note text" />
        {categoryData && onSubmitToCategory ? (
          <FloatingCategoryDial data={categoryData} selectedPath={selectedPath} disabled={busy || !text.trim()} onSelect={submitToCategory} />
        ) : null}
        <Button label={onSubmitToCategory ? 'Seek' : 'Save note'} icon="checkmark" onPress={submit} disabled={busy || !text.trim()} />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md } });