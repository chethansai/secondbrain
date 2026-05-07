import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlatNote } from '../../shared/types/notes';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { AiNoteClassification } from './types';

type Props = {
  visible: boolean;
  note: FlatNote | null;
  busy: boolean;
  onClose: () => void;
  onClassify: (note: string) => Promise<AiNoteClassification | null>;
  onReplace: (text: string) => Promise<boolean> | boolean;
  onCreateAction: (text: string) => Promise<boolean> | boolean;
};

export function AiReviewModal({ visible, note, busy, onClose, onClassify, onReplace, onCreateAction }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [classification, setClassification] = useState<AiNoteClassification | null>(null);

  useEffect(() => {
    if (!visible) setClassification(null);
  }, [visible]);

  async function runReview() {
    if (!note) return;
    const result = await onClassify(note.note);
    setClassification(result);
  }

  async function replaceText() {
    if (!classification) return;
    const ok = await onReplace(classification.cleaned_text);
    if (ok) onClose();
  }

  async function createAction() {
    if (!classification?.next_action) return;
    const ok = await onCreateAction(classification.next_action);
    if (ok) onClose();
  }

  return (
    <ModalShell visible={visible} title="AI note review" onClose={onClose}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.block}>
          <Text style={styles.label}>Note</Text>
          <Text style={styles.noteText}>{note?.note ?? ''}</Text>
        </View>
        {!classification ? <Button label="Review note" icon="sparkles-outline" onPress={runReview} disabled={busy || !note} /> : null}
        {classification ? (
          <View style={styles.result}>
            <Field label="Type" value={classification.type} />
            <Field label="Area" value={classification.area} />
            <Field label="Project" value={classification.project ?? 'None'} />
            <Field label="Tags" value={classification.tags.join(', ') || 'None'} />
            <Field label="Priority" value={classification.review_priority} />
            <Field label="Reason" value={classification.reason} />
            <Field label="Cleaned" value={classification.cleaned_text} multiline />
            {classification.next_action ? <Field label="Next action" value={classification.next_action} multiline /> : null}
            <View style={styles.actions}>
              <Button label="Replace text" icon="create-outline" onPress={replaceText} disabled={busy || !classification.cleaned_text.trim()} />
              {classification.next_action ? <Button label="Create action" icon="add" variant="secondary" onPress={createAction} disabled={busy} /> : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ModalShell>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, multiline && styles.valueMultiline]}>{value}</Text>
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    scroll: { maxHeight: 620 },
    block: { gap: spacing.xs, marginBottom: spacing.md },
    label: { ...typography.captionBold, color: colors.primary },
    noteText: { ...typography.body, color: colors.charcoal, backgroundColor: colors.surfaceSoft, borderRadius: rounded.md, padding: spacing.sm },
    result: { gap: spacing.sm },
    field: { gap: 3 },
    value: { ...typography.bodySmMedium, color: colors.ink },
    valueMultiline: { ...typography.body, color: colors.charcoal, backgroundColor: colors.surfaceSoft, borderRadius: rounded.md, padding: spacing.sm },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  });
}
