import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteDoc, doc, getDoc, getDocFromServer, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { AiWorkspaceDocumentMeta, AiWorkspaceIndex, NotesData } from '../../shared/types/notes';
import { firestore } from './firebase';
import { validateNotesData } from './validation';

export type AiWorkspaceNotesSnapshot = {
  data: NotesData;
};

export function getUserAiWorkspaceIndexRef(uid: string) {
  return doc(firestore, 'users', uid, 'reactnativecollection', 'aiworkspaceindex');
}

export function getUserAiWorkspaceNotesRef(uid: string, documentId: string) {
  return doc(firestore, 'users', uid, 'reactnativecollection', sanitizeDocumentId(documentId));
}

const localAiWorkspaceIndexKey = 'rnnotetaking.aiWorkspace.index';
const localAiWorkspaceNotesPrefix = 'rnnotetaking.aiWorkspace.notes.';

export function subscribeToAiWorkspaceIndex(uid: string, onChange: (snapshot: AiWorkspaceIndex) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(
    getUserAiWorkspaceIndexRef(uid),
    (snapshot) => onChange(parseAiWorkspaceIndex(snapshot.exists() ? snapshot.data() : undefined)),
    (error) => onError(error.message),
  );
}

export function subscribeToAiWorkspaceNotes(uid: string, documentId: string, onChange: (snapshot: AiWorkspaceNotesSnapshot) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(
    getUserAiWorkspaceNotesRef(uid, documentId),
    (snapshot) => {
      try {
        onChange(parseAiWorkspaceNotes(snapshot.exists() ? snapshot.data() : undefined));
      } catch (error) {
        onError(error instanceof Error ? error.message : 'AI workspace JSON is invalid.');
      }
    },
    (error) => onError(error.message),
  );
}

export async function readLatestAiWorkspaceIndex(uid: string): Promise<AiWorkspaceIndex> {
  const snapshot = await getDocFromServer(getUserAiWorkspaceIndexRef(uid));
  return parseAiWorkspaceIndex(snapshot.exists() ? snapshot.data() : undefined);
}

export async function readAiWorkspaceIndex(uid: string): Promise<AiWorkspaceIndex> {
  const snapshot = await getDoc(getUserAiWorkspaceIndexRef(uid));
  return parseAiWorkspaceIndex(snapshot.exists() ? snapshot.data() : undefined);
}

export async function writeAiWorkspaceIndex(uid: string, index: AiWorkspaceIndex): Promise<void> {
  await setDoc(getUserAiWorkspaceIndexRef(uid), serializeAiWorkspaceIndex(index), { merge: false });
}

export async function readAiWorkspaceNotes(uid: string, documentId: string): Promise<AiWorkspaceNotesSnapshot> {
  const snapshot = await getDoc(getUserAiWorkspaceNotesRef(uid, documentId));
  return parseAiWorkspaceNotes(snapshot.exists() ? snapshot.data() : undefined);
}

export async function readLatestAiWorkspaceNotes(uid: string, documentId: string): Promise<AiWorkspaceNotesSnapshot> {
  const snapshot = await getDocFromServer(getUserAiWorkspaceNotesRef(uid, documentId));
  return parseAiWorkspaceNotes(snapshot.exists() ? snapshot.data() : undefined);
}

export async function writeAiWorkspaceNotes(uid: string, documentId: string, data: NotesData): Promise<void> {
  await setDoc(getUserAiWorkspaceNotesRef(uid, documentId), { data, updatedAt: new Date().toISOString() }, { merge: false });
}

export async function deleteAiWorkspaceNotes(uid: string, documentId: string): Promise<void> {
  await deleteDoc(getUserAiWorkspaceNotesRef(uid, documentId));
}

export async function readLocalAiWorkspaceIndex(): Promise<AiWorkspaceIndex> {
  const raw = await AsyncStorage.getItem(localAiWorkspaceIndexKey);
  if (!raw) return defaultAiWorkspaceIndex();
  try {
    return parseAiWorkspaceIndex(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return defaultAiWorkspaceIndex();
  }
}

export async function writeLocalAiWorkspaceIndex(index: AiWorkspaceIndex): Promise<void> {
  await AsyncStorage.setItem(localAiWorkspaceIndexKey, JSON.stringify(serializeAiWorkspaceIndex(index)));
}

export async function readLocalAiWorkspaceNotes(documentId: string): Promise<AiWorkspaceNotesSnapshot> {
  const raw = await AsyncStorage.getItem(localAiWorkspaceNotesKey(documentId));
  if (!raw) return { data: {} };
  try {
    return parseAiWorkspaceNotes(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return { data: {} };
  }
}

export async function writeLocalAiWorkspaceNotes(documentId: string, data: NotesData): Promise<void> {
  await AsyncStorage.setItem(localAiWorkspaceNotesKey(documentId), JSON.stringify({ data }));
}

export async function deleteLocalAiWorkspaceNotes(documentId: string): Promise<void> {
  await AsyncStorage.removeItem(localAiWorkspaceNotesKey(documentId));
}

export function createAiWorkspaceDocumentMeta(number: number, createdAt = new Date().toISOString()): AiWorkspaceDocumentMeta {
  const documentId = `aimain${number}`;
  return { id: `id${number}`, documentId, name: documentId, createdAt, updatedAt: createdAt };
}

export function parseAiWorkspaceIndex(raw: Record<string, unknown> | undefined): AiWorkspaceIndex {
  if (!raw) return defaultAiWorkspaceIndex();
  const documents = parseDocuments(raw.documents);
  const idMap = parseIdMap(raw.idMap, documents);
  const activeDocumentId = typeof raw.activeDocumentId === 'string' && documents.some((item) => item.documentId === raw.activeDocumentId) ? raw.activeDocumentId : documents[0]?.documentId ?? null;
  const nextNumberValue = typeof raw.nextNumber === 'number' && Number.isFinite(raw.nextNumber) ? Math.floor(raw.nextNumber) : nextNumberFromDocuments(documents);
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? Math.floor(raw.version) : 1;
  return { documents, idMap, activeDocumentId, nextNumber: Math.max(1, nextNumberValue), version };
}

export function serializeAiWorkspaceIndex(index: AiWorkspaceIndex) {
  return {
    documents: index.documents,
    idMap: index.idMap,
    activeDocumentId: index.activeDocumentId,
    nextNumber: index.nextNumber,
    version: index.version,
  };
}



function sanitizeDocumentId(documentId: string) {
  return documentId.trim().replace(/[\/]/g, '_') || 'aimain1';
}

function localAiWorkspaceNotesKey(documentId: string) {
  return `${localAiWorkspaceNotesPrefix}${sanitizeDocumentId(documentId)}`;
}

function parseAiWorkspaceNotes(raw: Record<string, unknown> | undefined): AiWorkspaceNotesSnapshot {
  if (!raw) return { data: {} };
  const parsed = validateNotesData(raw.data ?? {});
  if (parsed.ok === false) throw new Error(parsed.message);
  return { data: parsed.data };
}

function parseDocuments(value: unknown): AiWorkspaceDocumentMeta[] {
  if (!Array.isArray(value)) return [];
  const documents = value.flatMap((item): AiWorkspaceDocumentMeta[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Partial<AiWorkspaceDocumentMeta>;
    if (typeof raw.id !== 'string' || typeof raw.documentId !== 'string') return [];
    const documentId = raw.documentId.trim();
    const id = raw.id.trim();
    if (!id || !documentId) return [];
    return [{
      id,
      documentId,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : documentId,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    }];
  });
  return [...new Map(documents.map((item) => [item.documentId, item])).values()];
}

function parseIdMap(value: unknown, documents: AiWorkspaceDocumentMeta[]) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value).flatMap(([key, item]) => typeof item === 'string' && key.trim() && item.trim() ? [[key.trim(), item.trim()] as const] : []);
    if (entries.length) return Object.fromEntries(entries);
  }
  return Object.fromEntries(documents.map((item) => [item.id, item.documentId]));
}

function nextNumberFromDocuments(documents: AiWorkspaceDocumentMeta[]) {
  const maxNumber = documents.reduce((max, document) => {
    const match = /^aimain(\d+)$/.exec(document.documentId);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return maxNumber + 1;
}

function defaultAiWorkspaceIndex(): AiWorkspaceIndex {
  return { documents: [], idMap: {}, activeDocumentId: null, nextNumber: 1, version: 1 };
}
