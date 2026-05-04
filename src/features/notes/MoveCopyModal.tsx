import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { CategoryPath, NotesData } from '../../shared/types/notes';
import { CategoryPicker } from '../categories/CategoryPicker';

type Props = {
  visible: boolean;
  data: NotesData;
  onClose: () => void;
  onMove: (path: CategoryPath) => Promise<boolean> | boolean;
  onCopy: (path: CategoryPath) => Promise<boolean> | boolean;
};

export function MoveCopyModal({ visible, data, onClose, onMove, onCopy }: Props) {
  const [selectedPath, setSelectedPath] = useState<CategoryPath | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: 'move' | 'copy') {
    if (!selectedPath) return;
    setBusy(true);
    const ok = action === 'move' ? await onMove(selectedPath) : await onCopy(selectedPath);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <ModalShell visible={visible} title="Move or copy" onClose={onClose}>
      <View style={styles.content}>
        <CategoryPicker data={data} selectedPath={selectedPath} onSelect={setSelectedPath} />
        <View style={styles.actions}>
          <Button label="Copy" icon="copy-outline" variant="secondary" onPress={() => run('copy')} disabled={!selectedPath || busy} style={styles.action} />
          <Button label="Move" icon="arrow-forward" onPress={() => run('move')} disabled={!selectedPath || busy} style={styles.action} />
        </View>
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});