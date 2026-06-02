import { CategoryPath } from '../../shared/types/notes';

export type AutomationCommand = {
  type: 'addNote';
  key: string;
  rawUrl: string;
  categoryPath: CategoryPath;
  note: string;
} | {
  type: 'importFile';
  key: string;
  rawUrl: string;
  fileUri?: string;
} | {
  type: 'openNoteEditor';
  key: string;
  rawUrl: string;
};

export type DeepLinkParseResult =
  | { ok: true; command: AutomationCommand }
  | { ok: false; message: string };

const supportedScheme = 'nativenotes:';
const addNoteAction = 'add-note';
const importFileAction = 'import-file';
const defaultCategoryPath = ['SEEK'];

export function parseAutomationDeepLink(rawUrl: string): DeepLinkParseResult {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== supportedScheme) {
      return { ok: false, message: 'Unsupported automation link scheme.' };
    }

    const action = normalizeAction(url);
    if (action === importFileAction) {
      const fileUri = url.searchParams.get('file') ?? url.searchParams.get('uri') ?? undefined;
      return {
        ok: true,
        command: {
          type: 'importFile',
          key: rawUrl,
          rawUrl,
          fileUri,
        },
      };
    }

    if (action === 'open-note-editor') {
      return {
        ok: true,
        command: {
          type: 'openNoteEditor',
          key: rawUrl,
          rawUrl,
        },
      };
    }

    if (action !== addNoteAction) {
      return { ok: false, message: 'Unsupported automation action.' };
    }

    const note = (url.searchParams.get('note') ?? '').trim();
    if (!note) {
      return { ok: false, message: 'Automation note text cannot be empty.' };
    }

    const categoryPath = parseCategoryPath(url.searchParams.get('category'));
    if (!categoryPath.length) {
      return { ok: false, message: 'Automation category cannot be empty.' };
    }

    return {
      ok: true,
      command: {
        type: 'addNote',
        key: rawUrl,
        rawUrl,
        categoryPath,
        note,
      },
    };
  } catch {
    return { ok: false, message: 'Automation link could not be read.' };
  }
}

function normalizeAction(url: URL) {
  const hostAction = url.hostname.trim();
  if (hostAction) return hostAction;
  return url.pathname.replace(/^\/+/, '').trim();
}

function parseCategoryPath(value: string | null): CategoryPath {
  const cleanValue = value?.trim();
  if (!cleanValue) return defaultCategoryPath;
  return cleanValue.split('>').map((segment) => segment.trim()).filter(Boolean);
}