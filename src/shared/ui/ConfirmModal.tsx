import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/ThemeProvider';
import { colors, spacing, typography } from '../design/tokens';
import { Button } from './Button';
import { ModalShell } from './ModalShell';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean> | boolean;
};

export function ConfirmModal({ visible, title, message, confirmLabel = 'Delete', onClose, onConfirm }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <ModalShell visible={visible} title={title} onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Button label="Cancel" icon="close" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
          <Button label={confirmLabel} icon="trash-outline" variant="danger" onPress={confirm} disabled={busy} style={styles.action} />
        </View>
      </View>
    </ModalShell>
  );
}

function createStyles(colors: typeof import('../design/tokens').colors) {
  return StyleSheet.create({
  content: { gap: spacing.lg },
  message: { ...typography.bodySm, color: colors.charcoal },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  });
}