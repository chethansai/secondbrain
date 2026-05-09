import { useEffect, useState } from 'react';
import { NativeSyntheticEvent, StyleSheet, TextInputSelectionChangeEventData, View } from 'react-native';
import { spacing } from '../../shared/design/tokens';
import { CategoryPath, NotesData } from '../../shared/types/notes';
import { InlineCategorySavePicker } from '../categories/InlineCategorySavePicker';
import { normalizeNoteText } from '../notes/noteMutations';
import { readText } from '../settings/clipboard';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { TextInputField } from '../../shared/ui/TextInputField';
import { SEEK_CATEGORY } from '../ai/aiReviewTypes';

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
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [busy, setBusy] = useState(false);
  const canSubmit = !busy && Boolean(text.trim());

  useEffect(() => {
    const nextText = normalizeNoteText(initialText);
    setText(nextText);
    setSelection({ start: nextText.length, end: nextText.length });
  }, [initialText, visible]);

  function updateSelection(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    setSelection(event.nativeEvent.selection);
  }

  async function pasteFromClipboard() {
    const clipboardText = await readText();
    if (!clipboardText) return;
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);
    const nextText = `${text.slice(0, start)}${clipboardText}${text.slice(end)}`;
    const cursor = start + clipboardText.length;
    setText(nextText);
    setSelection({ start: cursor, end: cursor });
  }

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
        <TextInputField value={text} onChangeText={setText} onSelectionChange={updateSelection} selection={selection} autoCapitalize="sentences" multiline placeholder="Write a note" accessibilityLabel="Note text" />
        <Button label="Paste" icon="copy-outline" variant="secondary" onPress={pasteFromClipboard} disabled={busy} />
        {categoryData && onSubmitToCategory ? (
          <>
            <View style={styles.mainActions}>
              <Button label="SEEK" icon="checkmark" onPress={submit} disabled={!canSubmit} style={styles.mainActionButton} />
              <Button label="Cancel" icon="close" variant="secondary" onPress={onClose} disabled={busy} style={styles.mainActionButton} />
            </View>
            <InlineCategorySavePicker data={categoryData} selectedPath={selectedPath} excludedPath={[SEEK_CATEGORY]} disabled={!canSubmit} onSelect={submitToCategory} />
          </>
        ) : (
          <Button label="Save note" icon="checkmark" onPress={submit} disabled={!canSubmit} />
        )}
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  mainActions: { flexDirection: 'row', gap: spacing.sm },
  mainActionButton: { flex: 1 },
});