import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AiNotificationBackgroundStatus, AiNotificationState } from '../../shared/types/notes';
import {
  createAiNotificationJob,
  defaultAiNotificationState,
  addAiNotificationJob,
  mergeAndWriteAiNotifications,
  removeAiNotificationJob,
  readLatestAiNotifications,
  readLocalAiNotifications,
  subscribeToAiNotifications,
  writeLocalAiNotifications,
} from './aiNotificationsRepository';
import { cancelNativeAiNotification, cancelNativeAiNotificationWorker, getAiNotificationBackgroundStatus, processDueAiNotifications, registerAiNotificationBackgroundTask, scheduleNativeAiNotificationPlaceholder } from './aiNotificationRunner';
import { useAuth } from '../auth/authContext';

const defaultBackgroundStatus: AiNotificationBackgroundStatus = {
  mode: 'foreground-catchup',
  available: false,
  registered: false,
  permissionGranted: false,
  localOnly: false,
  details: 'Checking background worker availability.',
};

export function useAiNotificationsSync() {
  const { uid } = useAuth();
  const [state, setState] = useState<AiNotificationState>(defaultAiNotificationState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundStatus, setBackgroundStatus] = useState<AiNotificationBackgroundStatus>(defaultBackgroundStatus);
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (!uid) {
      readLocalAiNotifications().then((snapshot) => {
        setState(snapshot);
        setLoading(false);
        setLocalMode(true);
        getAiNotificationBackgroundStatus(true).then(setBackgroundStatus).catch(() => undefined);
      });
      return;
    }
    const unsubscribe = subscribeToAiNotifications(
      uid,
      (snapshot) => {
        setState(snapshot);
        setLoading(false);
        setError(null);
        setLocalMode(false);
        writeLocalAiNotifications(snapshot).catch(() => undefined);
        getAiNotificationBackgroundStatus(false).then(setBackgroundStatus).catch(() => undefined);
      },
      async () => {
        const snapshot = await readLocalAiNotifications();
        setState(snapshot);
        setLoading(false);
        setLocalMode(true);
        const status = await getAiNotificationBackgroundStatus(true).catch(() => defaultBackgroundStatus);
        setBackgroundStatus(status);
      },
    );
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    registerAiNotificationBackgroundTask()
      .then(setBackgroundStatus)
      .catch(async () => setBackgroundStatus(await getAiNotificationBackgroundStatus(localMode).catch(() => defaultBackgroundStatus)));
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
      let job = createAiNotificationJob({
        ...input,
        documentId: 'main',
        documentName: 'Main JSON',
      });
      let nextState: AiNotificationState;
      let savedRemotely = false;
      try {
        if (uid) {
          nextState = await addAiNotificationJob(uid, job);
          savedRemotely = true;
        } else {
          nextState = { jobs: [job, ...stateRef.current.jobs], version: stateRef.current.version + 1 };
          await writeLocalAiNotifications(nextState);
        }
      } catch {
        nextState = { jobs: [job, ...stateRef.current.jobs], version: stateRef.current.version + 1 };
        await writeLocalAiNotifications(nextState);
      }

      setState(nextState);
      stateRef.current = nextState;
      setLocalMode(!savedRemotely);
      setBackgroundStatus((current) => ({ ...current, localOnly: !savedRemotely }));

      const nativeNotificationId = await scheduleNativeAiNotificationPlaceholder(job).catch(() => undefined);
      if (nativeNotificationId) {
        job = { ...job, nativeNotificationId };
        const stateWithNativeId = {
          jobs: stateRef.current.jobs.map((item) => item.id === job.id ? job : item),
          version: stateRef.current.version + 1,
        };
        try {
          if (uid) {
            const mergedState = await mergeAndWriteAiNotifications(uid, stateWithNativeId);
            setState(mergedState);
            stateRef.current = mergedState;
            setLocalMode(false);
            setBackgroundStatus((current) => ({ ...current, localOnly: false }));
          } else {
            await writeLocalAiNotifications(stateWithNativeId);
            setState(stateWithNativeId);
            stateRef.current = stateWithNativeId;
            setLocalMode(true);
            setBackgroundStatus((current) => ({ ...current, localOnly: true }));
          }
        } catch {
          await writeLocalAiNotifications(stateWithNativeId);
          setState(stateWithNativeId);
          stateRef.current = stateWithNativeId;
          setLocalMode(true);
          setBackgroundStatus((current) => ({ ...current, localOnly: true }));
        }
      }

      return true;
    } finally {
      setSaving(false);
    }
  }, [uid]);

  const deleteNotification = useCallback(async (jobId: string) => {
    setSaving(true);
    const job = stateRef.current.jobs.find((item) => item.id === jobId);
    await cancelNativeAiNotification(job?.nativeNotificationId);
    await cancelNativeAiNotificationWorker(job?.id);
    try {
      if (uid) {
        const nextState = await removeAiNotificationJob(uid, jobId);
        setState(nextState);
        stateRef.current = nextState;
        setLocalMode(false);
        setBackgroundStatus((current) => ({ ...current, localOnly: false }));
      } else {
        const nextState = { jobs: stateRef.current.jobs.filter((job) => job.id !== jobId), version: stateRef.current.version + 1 };
        await writeLocalAiNotifications(nextState);
        setState(nextState);
        stateRef.current = nextState;
        setLocalMode(true);
        setBackgroundStatus((current) => ({ ...current, localOnly: true }));
      }
      return true;
    } catch {
      const nextState = { jobs: stateRef.current.jobs.filter((job) => job.id !== jobId), version: stateRef.current.version + 1 };
      await writeLocalAiNotifications(nextState);
      setState(nextState);
      stateRef.current = nextState;
      setLocalMode(true);
      setBackgroundStatus((current) => ({ ...current, localOnly: true }));
      return true;
    } finally {
      setSaving(false);
    }
  }, [uid]);

  const refresh = useCallback(async () => {
    if (refreshing) return false;
    setRefreshing(true);
    setError(null);
    try {
      if (!uid) {
        setRefreshing(false);
        return false;
      }
      const nextState = await readLatestAiNotifications(uid);
      setState(nextState);
      stateRef.current = nextState;
      await writeLocalAiNotifications(nextState);
      setLocalMode(false);
      setBackgroundStatus(await getAiNotificationBackgroundStatus(false).catch(() => defaultBackgroundStatus));
      return true;
    } catch (refreshError) {
      const localState = await readLocalAiNotifications();
      setState(localState);
      stateRef.current = localState;
      setLocalMode(true);
      setBackgroundStatus(await getAiNotificationBackgroundStatus(true).catch(() => defaultBackgroundStatus));
      const message = refreshError instanceof Error ? refreshError.message.toLowerCase() : '';
      setError(message.includes('permission') ? null : refreshError instanceof Error ? `Could not reload AI notifications: ${refreshError.message}` : 'Could not reload AI notifications.');
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, uid]);

  const runDueJobs = useCallback(() => {
    const hasDueJob = stateRef.current.jobs.some((job) => job.status === 'scheduled' && new Date(job.scheduledAt).getTime() <= Date.now());
    if (!hasDueJob) return;
    processDueAiNotifications()
      .then((result) => {
        setState(result.state);
        stateRef.current = result.state;
        writeLocalAiNotifications(result.state).catch(() => undefined);
      })
      .catch((runError) => setError(runError instanceof Error ? runError.message : 'AI notification could not run.'));
  }, []);

  useEffect(() => {
    if (loading) return;
    runDueJobs();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') runDueJobs();
    });
    return () => subscription.remove();
  }, [loading, runDueJobs]);

  return {
    jobs: state.jobs,
    loading,
    saving,
    refreshing,
    localMode,
    backgroundStatus,
    error,
    setError,
    scheduleNotification,
    deleteNotification,
    refresh,
  };
}
