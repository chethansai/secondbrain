import { useEffect, useState } from 'react';
import { ModalShell } from '../../shared/ui/ModalShell';
import { CategoryPath, NotesData } from '../../shared/types/notes';
import { CategoryPicker } from '../categories/CategoryPicker';

type Props = {
  visible: boolean;
  action: 'move' | 'copy';
  itemType?: 'note' | 'category';
  data: NotesData;
  pinnedPaths: CategoryPath[];
  onClose: () => void;
  onTogglePin: (path: CategoryPath) => void;
  onResetPins: () => void;
  onMove: (path: CategoryPath) => Promise<boolean> | boolean;
  onCopy: (path: CategoryPath) => Promise<boolean> | boolean;
};

export function MoveCopyModal({ visible, action, itemType = 'note', data, pinnedPaths, onClose, onTogglePin, onResetPins, onMove, onCopy }: Props) {
  const [selectedPath, setSelectedPath] = useState<CategoryPath | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelectedPath(null);
      setBusy(false);
    }
  }, [visible]);

  async function run(path: CategoryPath) {
    if (busy) return;
    setSelectedPath(path);
    setBusy(true);
    const ok = action === 'move' ? await onMove(path) : await onCopy(path);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <ModalShell visible={visible} title={createTitle(action, itemType)} onClose={onClose}>
      <CategoryPicker data={data} selectedPath={selectedPath} onSelect={run} disabled={busy} pinnedPaths={pinnedPaths} onTogglePin={onTogglePin} onResetPins={onResetPins} />
    </ModalShell>
  );
}

function createTitle(action: 'move' | 'copy', itemType: 'note' | 'category') {
  const verb = action === 'move' ? 'Move' : 'Copy';
  return `${verb} ${itemType} to category`;
}