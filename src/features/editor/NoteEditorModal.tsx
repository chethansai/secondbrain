import { useEffect, useState } from 'react';
import { NativeSyntheticEvent, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInputSelectionChangeEventData, View } from 'react-native';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, NotesData } from '../../shared/types/notes';
import { InlineCategorySavePicker } from '../categories/InlineCategorySavePicker';
import { normalizeNoteText } from '../notes/noteMutations';
import { readText } from '../settings/clipboard';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { TextInputField } from '../../shared/ui/TextInputField';
import { SEEK_CATEGORY } from '../ai/aiReviewTypes';
import { requestAiText } from '../ai/aiReviewService';
import { SpeechRecognitionService } from '../speech/SpeechRecognitionService';

type Props = {
  visible: boolean;
  title: string;
  initialText?: string;
  categoryData?: NotesData;
  selectedPath?: CategoryPath | null;
  onClose: () => void;
  onSubmit: (text: string) => Promise<boolean> | boolean;
  onSubmitToCategory?: (path: CategoryPath, text: string) => Promise<boolean> | boolean;
  onSubmitDefaultCategory?: (text: string) => Promise<boolean> | boolean;
  defaultCategoryLabel?: string;
  onCreateSubcategory?: (path: CategoryPath, name: string) => Promise<CategoryPath | null> | CategoryPath | null;
  pinnedPaths?: CategoryPath[];
  onToggleCategoryPin?: (path: CategoryPath) => Promise<boolean> | boolean | void;
};

export function NoteEditorModal({ visible, title, initialText = '', categoryData, selectedPath = null, onClose, onSubmit, onSubmitToCategory, onSubmitDefaultCategory, defaultCategoryLabel = 'No TS', onCreateSubcategory, pinnedPaths = [], onToggleCategoryPin }: Props) {
  const [text, setText] = useState(initialText);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [aiProcessNote, setAiProcessNote] = useState(false);
  const canSubmit = !busy && Boolean(text.trim());

  useEffect(() => {
    const nextText = normalizeNoteText(initialText);
    setText(nextText);
    setSelection({ start: nextText.length, end: nextText.length });
    setPartialTranscript('');
    setSpeechError(null);
    setAiProcessNote(false);
  }, [initialText, visible]);

  useEffect(() => {
    if (visible) return undefined;
    setListening(false);
    SpeechRecognitionService.stopListening().catch(() => undefined);
    return undefined;
  }, [visible]);

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

  async function startSpeechRecognition() {
    const allowed = await requestMicrophonePermission();
    if (!allowed) {
      setSpeechError('Microphone permission is required.');
      return;
    }

    setSpeechError(null);
    setPartialTranscript('');
    setListening(true);
    await SpeechRecognitionService.startListening({
      onPartialTranscript: (transcript) => setPartialTranscript(transcript),
      onFinalTranscript: (transcript) => {
        appendTranscript(transcript);
        setPartialTranscript('');
        setListening(false);
      },
      onError: (message) => {
        setSpeechError(message);
        setListening(false);
      },
    });
  }

  async function stopSpeechRecognition() {
    await SpeechRecognitionService.stopListening();
    setPartialTranscript('');
    setListening(false);
  }

  async function requestMicrophonePermission() {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  function appendTranscript(transcript: string) {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) return;
    setText((current) => {
      const cleanCurrent = current.trim();
      const nextText = cleanCurrent ? `${cleanCurrent} ${cleanTranscript}` : cleanTranscript;
      setSelection({ start: nextText.length, end: nextText.length });
      return nextText;
    });
  }

  async function prepareNoteText() {
    const cleanText = text.trim();
    if (!aiProcessNote || !cleanText) return cleanText;
    const aiOutput = await requestAiText([
      'Process this voice note transcript.',
      'Return concise sections named Summary and Tasks.',
      'Transcript:',
      cleanText,
    ].join('\n\n'));
    return [cleanText, '', 'AI Processed:', aiOutput.trim()].filter(Boolean).join('\n');
  }

  async function submit() {
    setBusy(true);
    try {
      const ok = await onSubmit(await prepareNoteText());
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  }

  async function submitToCategory(path: CategoryPath) {
    if (!onSubmitToCategory) return false;
    setBusy(true);
    try {
      const ok = await onSubmitToCategory(path, await prepareNoteText());
      if (ok) onClose();
      return ok;
    } finally {
      setBusy(false);
    }
  }

  async function submitToDefaultCategory() {
    if (!onSubmitDefaultCategory) return false;
    setBusy(true);
    try {
      const ok = await onSubmitDefaultCategory(await prepareNoteText());
      if (ok) onClose();
      return ok;
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell visible={visible} title={title} onClose={onClose}>
      <View style={styles.content}>
        <TextInputField value={text} onChangeText={setText} onSelectionChange={updateSelection} selection={selection} autoCapitalize="sentences" multiline placeholder="Write a note" accessibilityLabel="Note text" />
        {partialTranscript ? <Text style={styles.partialTranscript}>{partialTranscript}</Text> : null}
        {speechError ? <Text style={styles.speechError}>{speechError}</Text> : null}
        <View style={styles.toolRow}>
          <Button label={listening ? 'Stop' : 'Mic'} icon={listening ? 'close' : 'mic-outline'} variant={listening ? 'danger' : 'secondary'} onPress={listening ? () => { stopSpeechRecognition().catch(() => setSpeechError('Speech recognition could not stop.')); } : () => { startSpeechRecognition().catch((error) => { setListening(false); setSpeechError(error instanceof Error ? error.message : 'Speech recognition could not start.'); }); }} disabled={busy} style={styles.toolButton} />
          <Button label="Paste" icon="copy-outline" variant="secondary" onPress={pasteFromClipboard} disabled={busy} style={styles.toolButton} />
        </View>
        {categoryData && onSubmitToCategory ? (
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: aiProcessNote }} accessibilityLabel="AI Process Note" onPress={() => setAiProcessNote((current) => !current)} style={styles.aiToggle}>
            <View style={[styles.checkbox, aiProcessNote && styles.checkboxOn]}>{aiProcessNote ? <Text style={styles.checkboxText}>v</Text> : null}</View>
            <Text style={styles.aiToggleText}>AI Process Note</Text>
          </Pressable>
        ) : null}
        {categoryData && onSubmitToCategory ? (
          <>
            <View style={styles.mainActions}>
              {onSubmitDefaultCategory ? <Button label="Save" icon="checkmark" onPress={submitToDefaultCategory} disabled={!canSubmit} style={styles.mainActionButton} accessibilityLabel={`Save note to ${defaultCategoryLabel}`} /> : null}
              <Button label="SEEK" icon="checkmark" onPress={submit} disabled={!canSubmit} style={styles.mainActionButton} />
              <Button label="Cancel" icon="close" variant="secondary" onPress={onClose} disabled={busy} style={styles.mainActionButton} />
            </View>
            <InlineCategorySavePicker data={categoryData} selectedPath={selectedPath} excludedPath={[SEEK_CATEGORY]} pinnedPaths={pinnedPaths} disabled={!canSubmit} onSelect={submitToCategory} onCreateSubcategory={onCreateSubcategory} onTogglePin={onToggleCategoryPin} />
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
  toolRow: { flexDirection: 'row', gap: spacing.sm },
  toolButton: { flex: 1 },
  mainActions: { flexDirection: 'row', gap: spacing.sm },
  mainActionButton: { flex: 1 },
  partialTranscript: { ...typography.bodySm, color: '#5d5b54' },
  speechError: { ...typography.captionBold, color: '#e03131' },
  aiToggle: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: rounded.sm, borderWidth: 1, borderColor: '#c8c4be', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { borderColor: '#5645d4', backgroundColor: '#5645d4' },
  checkboxText: { ...typography.captionBold, color: '#ffffff' },
  aiToggleText: { ...typography.bodySmMedium, color: '#1a1a1a' },
});
