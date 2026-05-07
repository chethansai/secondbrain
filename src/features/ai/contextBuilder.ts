import { listAllCategories } from '../categories/categoryTree';
import { flattenNotes, listNotesAtPath } from '../notes/noteMutations';
import { CategoryPath, NotesData } from '../../shared/types/notes';

const defaultChunkBudget = 9000;

export function buildCategoryContext(data: NotesData, path: CategoryPath) {
  const notes = listNotesAtPath(data, path);
  return notes.map((note) => `- [${note.path.join(' > ')} #${note.index}] ${note.note}`).join('\n');
}

export function buildWorkspaceCatalog(data: NotesData) {
  return listAllCategories(data)
    .map((category) => `- ${category.path.join(' > ')} (${category.noteCount} notes, ${category.childCount} subcategories)`)
    .join('\n');
}

export function buildWorkspaceChunks(data: NotesData, maxChars = defaultChunkBudget) {
  const lines = flattenNotes(data).map((note) => `[${note.path.join(' > ')} #${note.index}] ${note.note}`);
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function buildWorkspaceJsonContext(data: NotesData) {
  return JSON.stringify(data, null, 2);
}

export function countWorkspaceNotes(data: NotesData) {
  return flattenNotes(data).length;
}
