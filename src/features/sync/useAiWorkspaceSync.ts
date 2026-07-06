import { useCallback, useEffect, useMemo, useState } from 'react';
import { AiWorkspaceIndex, MutationResult, NotesData } from '../../shared/types/notes';
import { validateNotesData } from './validation';
import {
  createAiWorkspaceDocumentMeta,
  deleteAiWorkspaceNotes,
  deleteLocalAiWorkspaceNotes,
  readLatestAiWorkspaceIndex,
  readLatestAiWorkspaceNotes,
  readLocalAiWorkspaceIndex,
  readLocalAiWorkspaceNotes,
  subscribeToAiWorkspaceIndex,
  subscribeToAiWorkspaceNotes,
  writeAiWorkspaceIndex,
  writeAiWorkspaceNotes,
  writeLocalAiWorkspaceIndex,
  writeLocalAiWorkspaceNotes,
} from './aiWorkspaceRepository';
import { useAuth } from '../auth/authContext';

export function useAiWorkspaceSync() {
  const { uid } = useAuth();
  const [data, setData] = useState<NotesData>({});
  const [index, setIndex] = useState<AiWorkspaceIndex>({ documents: [], idMap: {}, activeDocumentId: null, nextNumber: 1, version: 1 });
  const [indexLoading, setIndexLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeDocument = useMemo(() => index.documents.find((document) => document.documentId === index.activeDocumentId) ?? index.documents[0] ?? null, [index]);

  useEffect(() => {
    if (!uid) {
      readLocalAiWorkspaceIndex().then((snapshot) => {
        setIndex(snapshot);
        setIndexLoading(false);
        setLocalMode(true);
      });
      return;
    }
    const unsubscribe = subscribeToAiWorkspaceIndex(
      uid,
      (snapshot) => {
        setIndex(snapshot);
        setIndexLoading(false);
        setError(null);
        writeLocalAiWorkspaceIndex(snapshot).catch(() => undefined);
      },
      async () => {
        const snapshot = await readLocalAiWorkspaceIndex();
        setIndex(snapshot);
        setIndexLoading(false);
        setLocalMode(true);
      },
    );
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!index.activeDocumentId) {
      setData({});
      setDataLoading(false);
      return;
    }
    const documentId = index.activeDocumentId;
    if (!uid) {
      readLocalAiWorkspaceNotes(documentId).then((snapshot) => {
        setData(snapshot.data);
        setDataLoading(false);
        setLocalMode(true);
      });
      return;
    }
    setDataLoading(true);
    const unsubscribe = subscribeToAiWorkspaceNotes(
      uid,
      documentId,
      (snapshot) => {
        setData(snapshot.data);
        setDataLoading(false);
        setError(null);
        writeLocalAiWorkspaceNotes(documentId, snapshot.data).catch(() => undefined);
      },
      async () => {
        const snapshot = await readLocalAiWorkspaceNotes(documentId);
        setData(snapshot.data);
        setDataLoading(false);
        setLocalMode(true);
      },
    );
    return unsubscribe;
  }, [uid, index.activeDocumentId]);

  const persistIndex = useCallback(async (nextIndex: AiWorkspaceIndex) => {
    setIndex(nextIndex);
    try {
      if (uid) {
        await writeAiWorkspaceIndex(uid, nextIndex);
        setLocalMode(false);
      } else {
        setLocalMode(true);
      }
      await writeLocalAiWorkspaceIndex(nextIndex);
      return true;
    } catch (error) {
      console.log('FIRESTORE ERROR CODE:', (error as any).code);
      console.log('FIRESTORE ERROR MESSAGE:', (error as any).message);
      console.log('FIRESTORE ERROR FULL:', error);
      await writeLocalAiWorkspaceIndex(nextIndex);
      setLocalMode(true);
      setError(`Could not save to Firestore: ${(error as any).code}\n${(error as any).message}`);
      return true;
    }
  }, [uid]);

  const createFromJson = useCallback(async (jsonText: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError('Enter valid JSON.');
      return false;
    }
    const validation = validateNotesData(parsed);
    if (!validation.ok) {
      setError(validation.message);
      return false;
    }

    setSaving(true);
    setError(null);
    const documentMeta = createAiWorkspaceDocumentMeta(index.nextNumber);
    const nextDocuments = [...index.documents, documentMeta];
    const nextIndex = {
      documents: nextDocuments,
      idMap: { ...index.idMap, [documentMeta.id]: documentMeta.documentId },
      activeDocumentId: documentMeta.documentId,
      nextNumber: index.nextNumber + 1,
      version: index.version + 1,
    };

    setData(validation.data);
    try {
      if (uid) {
        await writeAiWorkspaceNotes(uid, documentMeta.documentId, validation.data);
        await writeAiWorkspaceIndex(uid, nextIndex);
        setLocalMode(false);
      } else {
        setLocalMode(true);
      }
      await writeLocalAiWorkspaceNotes(documentMeta.documentId, validation.data);
      await writeLocalAiWorkspaceIndex(nextIndex);
      setIndex(nextIndex);
      return true;
    } catch (error) {
      console.log('FIRESTORE ERROR CODE:', (error as any).code);
      console.log('FIRESTORE ERROR MESSAGE:', (error as any).message);
      console.log('FIRESTORE ERROR FULL:', error);
      await writeLocalAiWorkspaceNotes(documentMeta.documentId, validation.data);
      await writeLocalAiWorkspaceIndex(nextIndex);
      setIndex(nextIndex);
      setLocalMode(true);
      setError(`Could not add to Firestore: ${(error as any).code}\n${(error as any).message}`);
      return true;
    } finally {
      setSaving(false);
    }
  }, [uid, index]);

  const selectDocument = useCallback(async (documentId: string) => {
    if (!index.documents.some((document) => document.documentId === documentId)) return false;
    return persistIndex({ ...index, activeDocumentId: documentId, version: index.version + 1 });
  }, [index, persistIndex]);

  const deleteDocument = useCallback(async (documentId: string) => {
    const document = index.documents.find((item) => item.documentId === documentId);
    if (!document) {
      setError('AI workspace document no longer exists.');
      return false;
    }

    setSaving(true);
    setError(null);
    const nextDocuments = index.documents.filter((item) => item.documentId !== documentId);
    const nextIdMap = Object.fromEntries(Object.entries(index.idMap).filter(([, mappedDocumentId]) => mappedDocumentId !== documentId));
    const nextActiveDocumentId = index.activeDocumentId === documentId ? nextDocuments[0]?.documentId ?? null : index.activeDocumentId;
    const nextIndex = {
      ...index,
      documents: nextDocuments,
      idMap: nextIdMap,
      activeDocumentId: nextActiveDocumentId,
      version: index.version + 1,
    };

    setIndex(nextIndex);
    if (!nextActiveDocumentId) setData({});

    try {
      if (uid) {
        await deleteAiWorkspaceNotes(uid, documentId);
        await writeAiWorkspaceIndex(uid, nextIndex);
        setLocalMode(false);
      } else {
        setLocalMode(true);
      }
      await deleteLocalAiWorkspaceNotes(documentId);
      await writeLocalAiWorkspaceIndex(nextIndex);
      return true;
    } catch (error) {
      console.log('FIRESTORE ERROR CODE:', (error as any).code);
      console.log('FIRESTORE ERROR MESSAGE:', (error as any).message);
      console.log('FIRESTORE ERROR FULL:', error);
      await deleteLocalAiWorkspaceNotes(documentId);
      await writeLocalAiWorkspaceIndex(nextIndex);
      setLocalMode(true);
      setError(`Could not delete from Firestore: ${(error as any).code}\n${(error as any).message}`);
      return true;
    } finally {
      setSaving(false);
    }
  }, [uid, index]);

  const commit = useCallback(async (result: MutationResult) => {
    if (result.ok === false) {
      setError(result.message);
      return false;
    }
    if (!index.activeDocumentId) {
      setError('Create or select an AI workspace document first.');
      return false;
    }

    setSaving(true);
    setError(null);
    setData(result.data);
    const now = new Date().toISOString();
    const nextIndex = {
      ...index,
      documents: index.documents.map((document) => document.documentId === index.activeDocumentId ? { ...document, updatedAt: now } : document),
      version: index.version + 1,
    };

    try {
      if (uid) {
        await writeAiWorkspaceNotes(uid, index.activeDocumentId, result.data);
        await writeAiWorkspaceIndex(uid, nextIndex);
        setLocalMode(false);
      } else {
        setLocalMode(true);
      }
      await writeLocalAiWorkspaceNotes(index.activeDocumentId, result.data);
      await writeLocalAiWorkspaceIndex(nextIndex);
      setIndex(nextIndex);
      return true;
    } catch (error) {
      console.log('FIRESTORE ERROR CODE:', (error as any).code);
      console.log('FIRESTORE ERROR MESSAGE:', (error as any).message);
      console.log('FIRESTORE ERROR FULL:', error);
      await writeLocalAiWorkspaceNotes(index.activeDocumentId, result.data);
      await writeLocalAiWorkspaceIndex(nextIndex);
      setIndex(nextIndex);
      setLocalMode(true);
      setError(`Could not add to Firestore: ${(error as any).code}\n${(error as any).message}`);
      return true;
    } finally {
      setSaving(false);
    }
  }, [uid, index]);

  const refresh = useCallback(async () => {
    if (refreshing) return false;
    setRefreshing(true);
    setError(null);
    try {
      if (!uid) {
        setRefreshing(false);
        return false;
      }
      const nextIndex = await readLatestAiWorkspaceIndex(uid);
      setIndex(nextIndex);
      await writeLocalAiWorkspaceIndex(nextIndex);
      if (nextIndex.activeDocumentId) {
        const snapshot = await readLatestAiWorkspaceNotes(uid, nextIndex.activeDocumentId);
        setData(snapshot.data);
        await writeLocalAiWorkspaceNotes(nextIndex.activeDocumentId, snapshot.data);
      }
      setLocalMode(false);
      return true;
    } catch (refreshError) {
      setLocalMode(true);
      setError(refreshError instanceof Error ? `Could not reload AI workspace: ${refreshError.message}` : 'Could not reload AI workspace.');
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, uid]);

  return {
    data,
    documents: index.documents,
    idMap: index.idMap,
    activeDocument,
    activeDocumentId: index.activeDocumentId,
    loading: indexLoading || dataLoading,
    saving,
    refreshing,
    localMode,
    error,
    setError,
    createFromJson,
    selectDocument,
    deleteDocument,
    commit,
    refresh,
  };
}
