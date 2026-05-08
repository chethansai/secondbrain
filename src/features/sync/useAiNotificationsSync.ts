import { useCallback, useEffect, useRef, useState } from 'react';
import { AiNotificationState } from '../../shared/types/notes';
import {
  createAiNotificationJob,
  defaultAiNotificationState,
  addAiNotificationJob,
  mergeAndWriteAiNotifications,
  removeAiNotificationJob,
  readLatestAiNotifications,
  readLocalAiNotifications,
  subscribeToAiNotifications,
  writeAiNotifications,
  writeLocalAiNotifications,
} from './aiNotificationsRepository';
import { cancelNativeAiNotification, cancelScheduledAiPlaceholderNotifications, processDueAiNotifications, registerAiNotificationBackgroundTask } from './aiNotificationRunner';

export function useAiNotificationsSync() {
  const [state, setState] = useState<AiNotificationState>(defaultAiNotificationState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const unsubscribe = subscribeToAiNotifications(
      (snapshot) => {
        setState(snapshot);
        setLoading(false);
        setError(null);
        writeLocalAiNotifications(snapshot).catch(() => undefined);
      },
      async () => {
        const snapshot = await readLocalAiNotifications();
        setState(snapshot);
        setLoading(false);
        setLocalMode(true);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    cancelScheduledAiPlaceholderNotifications().catch(() => undefined);
    registerAiNotificationBackgroundTask().catch(() => undefined);
  }, []);

  const persist = useCallback(async (nextState: AiNotificationState) => {
    setState(nextState);
    stateRef.current = nextState;
    try {
      const mergedState = await mergeAndWriteAiNotifications(nextState);
      setState(mergedState);
      stateRef.current = mergedState;
      setLocalMode(false);
      return true;
    } catch {
      await writeLocalAiNotifications(nextState);
      setLocalMode(true);
      return true;
    }
  }, []);

  const scheduleNotification = useCallback(async (input: { title: string; prompt: string; scheduledAt: string; repeatEveryHours?: number }) => {
    if (!input.prompt.trim()) {
      setError('Enter a prompt.');
      return false;
    }
    const scheduledTime = new Date(input.scheduledAt).getTime();
    if (!Number.isFinite(scheduledTime)) {
      setError('Enter a valid notification time.');
      return false;
    }

    setSaving(true);
    setError(null);
    try {
      const job = createAiNotificationJob({
        ...input,
        documentId: 'main',
        documentName: 'Main JSON',
      });
      try {
        const nextState = await addAiNotificationJob(job);
        setState(nextState);
        stateRef.current = nextState;
        setLocalMode(false);
        return true;
      } catch {
        const nextState = { jobs: [job, ...stateRef.current.jobs], version: stateRef.current.version + 1 };
        await writeLocalAiNotifications(nextState);
        setState(nextState);
        stateRef.current = nextState;
        setLocalMode(true);
        return true;
      }
    } finally {
      setSaving(false);
    }
  }, [persist]);

  const deleteNotification = useCallback(async (jobId: string) => {
    setSaving(true);
    const job = stateRef.current.jobs.find((item) => item.id === jobId);
    await cancelNativeAiNotification(job?.nativeNotificationId);
    try {
      const nextState = await removeAiNotificationJob(jobId);
      setState(nextState);
      stateRef.current = nextState;
      setLocalMode(false);
      return true;
    } catch {
      const nextState = { jobs: stateRef.current.jobs.filter((job) => job.id !== jobId), version: stateRef.current.version + 1 };
      await writeLocalAiNotifications(nextState);
      setState(nextState);
      stateRef.current = nextState;
      setLocalMode(true);
      return true;
    } finally {
      setSaving(false);
    }
  }, [persist]);

  const refresh = useCallback(async () => {
    if (refreshing) return false;
    setRefreshing(true);
    setError(null);
    try {
      const nextState = await readLatestAiNotifications();
      setState(nextState);
      stateRef.current = nextState;
      await writeLocalAiNotifications(nextState);
      setLocalMode(false);
      return true;
    } catch (refreshError) {
      const localState = await readLocalAiNotifications();
      setState(localState);
      stateRef.current = localState;
      setLocalMode(true);
      const message = refreshError instanceof Error ? refreshError.message.toLowerCase() : '';
      setError(message.includes('permission') ? null : refreshError instanceof Error ? `Could not reload AI notifications: ${refreshError.message}` : 'Could not reload AI notifications.');
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const runDueJobs = useCallback(() => {
    const hasDueJob = stateRef.current.jobs.some((job) => job.status === 'scheduled' && new Date(job.scheduledAt).getTime() <= Date.now());
    if (!hasDueJob) return;
    processDueAiNotifications()
      .then((result) => persist(result.state))
      .catch((runError) => setError(runError instanceof Error ? runError.message : 'AI notification could not run.'));
  }, [persist]);

  useEffect(() => {
    if (loading) return;
    runDueJobs();
    const interval = setInterval(runDueJobs, 30 * 1000);
    return () => clearInterval(interval);
  }, [loading, runDueJobs, state.jobs]);

  return {
    jobs: state.jobs,
    loading,
    saving,
    refreshing,
    localMode,
    error,
    setError,
    scheduleNotification,
    deleteNotification,
    refresh,
  };
}
