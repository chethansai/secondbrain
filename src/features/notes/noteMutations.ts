import { CategoryPath, FlatNote, MutationResult, NotesData } from '../../shared/types/notes';
import { cloneData, getCategoryItems, isCategoryNode } from '../categories/categoryTree';

export function addNote(data: NotesData, path: CategoryPath, text: string): MutationResult {
  const cleanText = text.trim();
  if (!cleanText) return failure('empty_note', 'Note text cannot be empty.');
  const next = cloneData(data);
  const items = getCategoryItems(next, path);
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  items.push(cleanText);
  return { ok: true, data: next };
}

export function editNote(data: NotesData, path: CategoryPath, oldText: string, newText: string, selectedIndex?: number): MutationResult {
  const cleanText = newText.trim();
  if (!cleanText) return failure('empty_note', 'Note text cannot be empty.');
  const next = cloneData(data);
  const items = getCategoryItems(next, path);
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  const index = findNoteIndex(items, oldText, selectedIndex);
  if (index === -1) return failure('not_found', 'The note could not be found.');
  items[index] = cleanText;
  return { ok: true, data: next };
}

export function deleteNote(data: NotesData, path: CategoryPath, text: string, selectedIndex?: number): MutationResult {
  const next = cloneData(data);
  const items = getCategoryItems(next, path);
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  const index = findNoteIndex(items, text, selectedIndex);
  if (index === -1) return failure('not_found', 'The note could not be found.');
  items.splice(index, 1);
  return { ok: true, data: next };
}

export function moveNote(data: NotesData, sourcePath: CategoryPath, destinationPath: CategoryPath, text: string, selectedIndex?: number): MutationResult {
  const next = cloneData(data);
  const source = getCategoryItems(next, sourcePath);
  const destination = getCategoryItems(next, destinationPath);
  if (!source || !destination) return failure('path_not_found', 'Source or destination category no longer exists.');
  const index = findNoteIndex(source, text, selectedIndex);
  if (index === -1) return failure('not_found', 'The note could not be found.');
  const [note] = source.splice(index, 1);
  destination.push(note);
  return { ok: true, data: next };
}

export function copyNote(data: NotesData, sourcePath: CategoryPath, destinationPath: CategoryPath, text: string, selectedIndex?: number): MutationResult {
  const next = cloneData(data);
  const source = getCategoryItems(next, sourcePath);
  const destination = getCategoryItems(next, destinationPath);
  if (!source || !destination) return failure('path_not_found', 'Source or destination category no longer exists.');
  const index = findNoteIndex(source, text, selectedIndex);
  if (index === -1) return failure('not_found', 'The note could not be found.');
  destination.push(source[index]);
  return { ok: true, data: next };
}

export function listNotesAtPath(data: NotesData, path: CategoryPath): FlatNote[] {
  const items = getCategoryItems(data, path) ?? [];
  return items.flatMap((item, itemIndex) => (typeof item === 'string' ? [{ path, note: item, index: itemIndex }] : []));
}

export function flattenNotes(data: NotesData): FlatNote[] {
  return Object.entries(data).flatMap(([name, items]) => flattenItems(items, [name]));
}

function flattenItems(items: unknown[], path: CategoryPath): FlatNote[] {
  return items.flatMap((item, itemIndex) => {
    if (typeof item === 'string') return [{ path, note: item, index: itemIndex }];
    if (!isCategoryNode(item)) return [];
    const [name, childItems] = Object.entries(item)[0];
    return flattenItems(childItems, [...path, name]);
  });
}

function findNoteIndex(items: unknown[], text: string, selectedIndex?: number): number {
  if (typeof selectedIndex === 'number' && items[selectedIndex] === text) return selectedIndex;
  return items.findIndex((item) => item === text);
}

function failure(code: string, message: string): MutationResult {
  return { ok: false, code, message };
}