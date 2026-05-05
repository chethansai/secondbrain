import { CategoryPath, FlatNote, MutationResult, NotesData } from '../../shared/types/notes';
import { cloneData, getCategoryItems, isCategoryNode, syncStandaloneCategory } from '../categories/categoryTree';

export function addNote(data: NotesData, path: CategoryPath, text: string): MutationResult {
  const cleanText = normalizeNoteText(text);
  if (!cleanText) return failure('empty_note', 'Note text cannot be empty.');
  const next = cloneData(data);
  const items = getCategoryItems(next, path);
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  items.push(cleanText);
  syncStandaloneCategory(next, path);
  return { ok: true, data: next };
}

export function editNote(data: NotesData, path: CategoryPath, oldText: string, newText: string, selectedIndex?: number): MutationResult {
  const cleanText = normalizeNoteText(newText);
  if (!cleanText) return failure('empty_note', 'Note text cannot be empty.');
  const next = cloneData(data);
  const items = getCategoryItems(next, path);
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  const matchedCount = editExactNotes(next, oldText, cleanText);
  if (matchedCount === 0) return failure('not_found', 'The note could not be found.');
  return { ok: true, data: next };
}

export function deleteNote(data: NotesData, path: CategoryPath, text: string, selectedIndex?: number): MutationResult {
  const next = cloneData(data);
  const items = getCategoryItems(next, path);
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  const index = findNoteIndex(items, text, selectedIndex);
  if (index === -1) return failure('not_found', 'The note could not be found.');
  items.splice(index, 1);
  syncStandaloneCategory(next, path);
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
  syncStandaloneCategory(next, sourcePath);
  syncStandaloneCategory(next, destinationPath);
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
  syncStandaloneCategory(next, destinationPath);
  return { ok: true, data: next };
}

export function setNotePriority(data: NotesData, path: CategoryPath, text: string, priority: number, selectedIndex?: number): MutationResult {
  const next = cloneData(data);
  const items = getCategoryItems(next, path);
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  const index = findNoteIndex(items, text, selectedIndex);
  if (index === -1) return failure('not_found', 'The note could not be found.');

  const noteEntries = items.flatMap((item, itemIndex) => (typeof item === 'string' ? [{ item, itemIndex }] : []));
  if (noteEntries.length <= 1) return { ok: true, data: next };

  const visibleNotes = [...noteEntries].reverse();
  const currentVisibleIndex = visibleNotes.findIndex((entry) => entry.itemIndex === index);
  if (currentVisibleIndex === -1) return failure('not_found', 'The note could not be found.');

  const targetVisibleIndex = Math.max(0, Math.min(priority - 1, visibleNotes.length - 1));
  const [selectedNote] = visibleNotes.splice(currentVisibleIndex, 1);
  visibleNotes.splice(targetVisibleIndex, 0, selectedNote);

  const nextNoteOrder = [...visibleNotes].reverse();
  noteEntries.forEach((entry, entryIndex) => {
    items[entry.itemIndex] = nextNoteOrder[entryIndex].item;
  });

  syncStandaloneCategory(next, path);
  return { ok: true, data: next };
}

export function listNotesAtPath(data: NotesData, path: CategoryPath): FlatNote[] {
  const items = getCategoryItems(data, path) ?? [];
  return items.reduceRight<FlatNote[]>((notes, item, itemIndex) => {
    if (typeof item === 'string') notes.push({ path, note: item, index: itemIndex });
    return notes;
  }, []);
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

function editExactNotes(data: NotesData, oldText: string, newText: string): number {
  return Object.values(data).reduce((count, items) => count + editExactNotesInItems(items, oldText, newText), 0);
}

function editExactNotesInItems(items: unknown[], oldText: string, newText: string): number {
  let matchedCount = 0;
  items.forEach((item, index) => {
    if (typeof item === 'string') {
      if (item === oldText) {
        items[index] = newText;
        matchedCount += 1;
      }
      return;
    }
    if (!isCategoryNode(item)) return;
    const [, childItems] = Object.entries(item)[0];
    matchedCount += editExactNotesInItems(childItems, oldText, newText);
  });
  return matchedCount;
}

export function normalizeNoteText(text: string) {
  return text.trim();
}

function failure(code: string, message: string): MutationResult {
  return { ok: false, code, message };
}