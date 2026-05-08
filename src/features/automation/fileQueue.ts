import * as FileSystem from 'expo-file-system/legacy';
import { CategoryPath } from '../../shared/types/notes';

export type AutomationFileNote = {
  id?: string;
  note: string;
  categoryPath: CategoryPath;
  raw: unknown;
};

export type AutomationFileReadResult =
  | { ok: true; fileUri: string; notes: AutomationFileNote[] }
  | { ok: false; code: 'not_available' | 'not_found' | 'invalid_json' | 'invalid_payload' | 'read_failed'; message: string };

const defaultCategoryPath = ['SEEK'];
const automationDirectoryName = 'automation';
export const automationQueueFileName = 'seek-notes.json';

export function getDefaultAutomationQueueUri() {
  if (!FileSystem.documentDirectory) return null;
  return `${FileSystem.documentDirectory}${automationDirectoryName}/${automationQueueFileName}`;
}

export async function readAutomationFileQueue(fileUri = getDefaultAutomationQueueUri()): Promise<AutomationFileReadResult> {
  if (!fileUri) return { ok: false, code: 'not_available', message: 'Automation file storage is not available on this platform.' };

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return { ok: false, code: 'not_found', message: 'No automation queue file is waiting.' };

    const rawText = await FileSystem.readAsStringAsync(fileUri);
    if (!rawText.trim()) return { ok: true, fileUri, notes: [] };

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { ok: false, code: 'invalid_json', message: 'Automation queue file must contain valid JSON.' };
    }

    const notes = parseAutomationFileNotes(parsed);
    if (notes === null) {
      return { ok: false, code: 'invalid_payload', message: 'Automation queue file must be a JSON array of note strings or note objects.' };
    }

    return { ok: true, fileUri, notes };
  } catch {
    return { ok: false, code: 'read_failed', message: 'Automation queue file could not be read.' };
  }
}

export async function clearAutomationFileQueue(fileUri: string) {
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
}

export async function rewriteAutomationFileQueue(fileUri: string, remaining: AutomationFileNote[]) {
  if (remaining.length === 0) {
    await clearAutomationFileQueue(fileUri);
    return;
  }
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(remaining.map((item) => item.raw), null, 2));
}

export async function ensureDefaultAutomationQueueFile() {
  if (!FileSystem.documentDirectory) return null;
  const directoryUri = `${FileSystem.documentDirectory}${automationDirectoryName}`;
  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  const fileUri = getDefaultAutomationQueueUri();
  if (!fileUri) return null;
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) await FileSystem.writeAsStringAsync(fileUri, '[]');
  return fileUri;
}

function parseAutomationFileNotes(value: unknown): AutomationFileNote[] | null {
  if (!Array.isArray(value)) return null;
  const notes: AutomationFileNote[] = [];

  for (const item of value) {
    const parsed = parseAutomationFileNote(item);
    if (parsed) notes.push(parsed);
  }

  return notes;
}

function parseAutomationFileNote(value: unknown): AutomationFileNote | null {
  if (typeof value === 'string') {
    const note = value.trim();
    return note ? { note, categoryPath: defaultCategoryPath, raw: value } : null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const objectValue = value as Record<string, unknown>;
  const note = readTextField(objectValue, ['note', 'text', 'title']);
  if (!note) return null;

  return {
    id: readTextField(objectValue, ['id']),
    note,
    categoryPath: readCategoryPath(objectValue.categoryPath ?? objectValue.category),
    raw: value,
  };
}

function readTextField(value: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const field = value[name];
    if (typeof field === 'string' && field.trim()) return field.trim();
  }
  return undefined;
}

function readCategoryPath(value: unknown): CategoryPath {
  if (Array.isArray(value)) {
    const path = value.filter((segment): segment is string => typeof segment === 'string').map((segment) => segment.trim()).filter(Boolean);
    return path.length ? path : defaultCategoryPath;
  }
  if (typeof value === 'string' && value.trim()) {
    const path = value.split('>').map((segment) => segment.trim()).filter(Boolean);
    return path.length ? path : defaultCategoryPath;
  }
  return defaultCategoryPath;
}