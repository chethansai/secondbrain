import { CategoryPath, FlatNote, PinnedNoteRef } from '../../shared/types/notes';

export function createPinnedNoteRef(note: FlatNote): PinnedNoteRef {
  return { path: note.path, note: note.note, index: note.index };
}

export function isPinnedNote(note: FlatNote, pinnedNotes: PinnedNoteRef[]) {
  return pinnedNotes.some((pin) => samePinnedNote(pin, note));
}

export function togglePinnedNote(note: FlatNote, pinnedNotes: PinnedNoteRef[]) {
  return isPinnedNote(note, pinnedNotes)
    ? pinnedNotes.filter((pin) => !samePinnedNote(pin, note))
    : [...pinnedNotes, createPinnedNoteRef(note)];
}

export function sortPinnedNotesFirst(notes: FlatNote[], pinnedNotes: PinnedNoteRef[]) {
  return [...notes].sort((left, right) => {
    const leftPinned = isPinnedNote(left, pinnedNotes);
    const rightPinned = isPinnedNote(right, pinnedNotes);
    if (leftPinned === rightPinned) return 0;
    return leftPinned ? -1 : 1;
  });
}

export function removePinnedNote(note: FlatNote, pinnedNotes: PinnedNoteRef[]) {
  return pinnedNotes.filter((pin) => !samePinnedNote(pin, note));
}

export function replacePinnedNote(oldNote: FlatNote, newNote: FlatNote, pinnedNotes: PinnedNoteRef[]) {
  return pinnedNotes.map((pin) => (samePinnedNote(pin, oldNote) ? createPinnedNoteRef(newNote) : pin));
}

export function removePinnedNotesInPath(path: CategoryPath, pinnedNotes: PinnedNoteRef[]) {
  return pinnedNotes.filter((pin) => !startsWithPath(pin.path, path));
}

export function replacePinnedNotesInPath(oldPath: CategoryPath, newPath: CategoryPath, pinnedNotes: PinnedNoteRef[]) {
  return pinnedNotes.map((pin) => startsWithPath(pin.path, oldPath) ? { ...pin, path: [...newPath, ...pin.path.slice(oldPath.length)] } : pin);
}

function samePinnedNote(pin: PinnedNoteRef, note: FlatNote) {
  return pin.index === note.index && pin.note === note.note && samePath(pin.path, note.path);
}

function samePath(left: CategoryPath, right: CategoryPath) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function startsWithPath(path: CategoryPath, prefix: CategoryPath) {
  return prefix.every((segment, index) => path[index] === segment);
}