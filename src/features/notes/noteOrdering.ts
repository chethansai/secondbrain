export type NoteOrderSelection<TNote> = {
  key: string;
  note: TNote;
  order: number;
};

export function getPriorityBelowTarget(sourceOrder: number, targetOrder: number) {
  return sourceOrder < targetOrder ? targetOrder : targetOrder + 1;
}

export function getDragDisplacement(fromOrder: number, targetOrder: number, order: number, draggedHeight: number) {
  if (!draggedHeight || order === fromOrder) return 0;
  if (targetOrder > fromOrder && order > fromOrder && order <= targetOrder) return -draggedHeight;
  if (targetOrder < fromOrder && order >= targetOrder && order < fromOrder) return draggedHeight;
  return 0;
}

export function isTapGesture(dy: number, dx = 0) {
  return Math.abs(dy) < 6 && Math.abs(dx) < 6;
}
