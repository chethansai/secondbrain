import { NotesData, NoteItem } from '../../shared/types/notes';
import { isCategoryNode } from '../categories/categoryTree';

export function validateNotesData(value: unknown): { ok: true; data: NotesData } | { ok: false; message: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'Root data must be an object of category arrays.' };
  }

  for (const [name, items] of Object.entries(value)) {
    if (!name.trim()) return { ok: false, message: 'Category names cannot be empty.' };
    if (!Array.isArray(items)) return { ok: false, message: `Category ${name} must contain an array.` };
    const child = validateItems(items as NoteItem[], name);
    if (!child.ok) return child;
  }

  return { ok: true, data: value as NotesData };
}

function validateItems(items: NoteItem[], label: string): { ok: true } | { ok: false; message: string } {
  for (const item of items) {
    if (typeof item === 'string') continue;
    if (!isCategoryNode(item)) return { ok: false, message: `${label} contains an invalid nested category.` };
    const [name, childItems] = Object.entries(item)[0];
    if (!name.trim()) return { ok: false, message: 'Nested category names cannot be empty.' };
    if (!Array.isArray(childItems)) return { ok: false, message: `Nested category ${name} must contain an array.` };
    const child = validateItems(childItems, name);
    if (!child.ok) return child;
  }
  return { ok: true };
}