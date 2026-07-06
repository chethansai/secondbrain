import { useCallback, useEffect, useRef, useState } from 'react';
import { AiReviewDecision, AiReviewLedger, AiReviewSettings, defaultAiReviewLedger } from '../ai/aiReviewTypes';
import { readLatestAiReviewLedger, subscribeToAiReviewLedger, writeAiReviewLedger } from './aiReviewRepository';
import { readLocalAiReviewLedger, writeLocalAiReviewLedger } from './localAiReviewRepository';
import { useAuth } from '../auth/authContext';

export function useAiReviewSync() {
  const { uid } = useAuth();
  const [ledger, setLedger] = useState<AiReviewLedger>(defaultAiReviewLedger());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const ledgerRef = useRef(ledger);

  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);

  useEffect(() => {
    if (!uid) {
      readLocalAiReviewLedger(uid).then((localLedger) => {
        setLedger(localLedger);
        ledgerRef.current = localLedger;
        setLoading(false);
        setLocalMode(true);
      });
      return;
    }
    const unsubscribe = subscribeToAiReviewLedger(
      uid,
      (snapshot) => {
        setLedger(snapshot);
        ledgerRef.current = snapshot;
        setLoading(false);
        setError(null);
        setLocalMode(false);
        writeLocalAiReviewLedger(snapshot, uid).catch(() => undefined);
      },
      async () => {
        const localLedger = await readLocalAiReviewLedger(uid);
        setLedger(localLedger);
        ledgerRef.current = localLedger;
        setLoading(false);
        setLocalMode(true);
      },
    );
    return unsubscribe;
  }, [uid]);

  const persist = useCallback(async (nextLedger: AiReviewLedger) => {
    const stamped = { ...nextLedger, version: nextLedger.version + 1, updatedAt: new Date().toISOString() };
    setSaving(true);
    setError(null);
    setLedger(stamped);
    ledgerRef.current = stamped;
    try {
      if (uid) {
        await writeAiReviewLedger(uid, stamped);
        setLocalMode(false);
      } else {
        setLocalMode(true);
      }
      await writeLocalAiReviewLedger(stamped, uid);
      return true;
    } catch {
      await writeLocalAiReviewLedger(stamped, uid);
      setLocalMode(true);
      return true;
    } finally {
      setSaving(false);
    }
  }, [uid]);

  const setSettings = useCallback((settings: AiReviewSettings) => persist({ ...ledgerRef.current, settings }), [persist]);

  const upsertDecision = useCallback((decision: AiReviewDecision) => {
    const currentLedger = ledgerRef.current;
    const decisions = upsertById(currentLedger.decisions, decision);
    return persist({ ...currentLedger, decisions, accepted: acceptedRecords(decisions), rejected: rejectedRecords(decisions) });
  }, [persist]);

  const refresh = useCallback(async () => {
    if (refreshing) return false;
    setRefreshing(true);
    setError(null);
    try {
      if (!uid) {
        setRefreshing(false);
        return false;
      }
      const latest = await readLatestAiReviewLedger(uid);
      setLedger(latest);
      ledgerRef.current = latest;
      await writeLocalAiReviewLedger(latest, uid);
      setLocalMode(false);
      return true;
    } catch {
      const localLedger = await readLocalAiReviewLedger(uid);
      setLedger(localLedger);
      ledgerRef.current = localLedger;
      setLocalMode(true);
      setError(null);
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, uid]);

  return { ledger, settings: ledger.settings, loading, saving, refreshing, error, localMode, setError, setSettings, upsertDecision, refresh };
}

function upsertById(decisions: AiReviewDecision[], decision: AiReviewDecision): AiReviewDecision[] {
  const index = decisions.findIndex((item) => item.simpleId === decision.simpleId);
  if (index === -1) return [decision, ...decisions];
  return decisions.map((item) => item.simpleId === decision.simpleId ? decision : item);
}

function acceptedRecords(decisions: AiReviewDecision[]) {
  return decisions.filter((decision) => decision.status === 'accepted').map((decision) => ({ simpleId: decision.simpleId, note: decision.note, category: decision.targetPath.join(' > ') }));
}

function rejectedRecords(decisions: AiReviewDecision[]) {
  return decisions.filter((decision) => decision.status === 'rejected').map((decision) => ({ simpleId: decision.simpleId, note: decision.note, category: decision.targetPath.join(' > ') }));
}
