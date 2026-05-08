import { AppRegistry, NativeModules, Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AiNotificationBackgroundStatus, AiNotificationJob, AiNotificationState, NotesData } from '../../shared/types/notes';
import { formatAiReviewRequestError, requestAiText } from '../ai/aiReviewService';
import { mergeAndWriteAiNotifications, readAiNotifications, readLocalAiNotifications, writeLocalAiNotifications } from './aiNotificationsRepository';
import { readLocalWorkspaceNotes } from './localNotesRepository';
import { defaultWorkspaceId, readWorkspaceNotes } from './notesRepository';

export const aiNotificationBackgroundTaskName = 'rnnotetaking-ai-notifications';
const notificationChannelId = 'ai-notifications';
const processingJobIds = new Set<string>();

type AiNotificationWorkerStatus = {
  available: boolean;
  registered: boolean;
  workCount?: number;
};

type AiNotificationWorkerNativeModule = {
  scheduleJob: (jobId: string, scheduledAtMillis: number, repeatEveryHours: number) => Promise<boolean>;
  schedulePolling: () => Promise<boolean>;
  cancelJob: (jobId: string) => Promise<boolean>;
  triggerNow: () => Promise<boolean>;
  getStatus: () => Promise<AiNotificationWorkerStatus>;
};

const aiNotificationWorkerModule = NativeModules.AiNotificationWorkerModule as AiNotificationWorkerNativeModule | undefined;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function defineAiNotificationBackgroundTask() {
  if (TaskManager.isTaskDefined(aiNotificationBackgroundTaskName)) return;
  TaskManager.defineTask(aiNotificationBackgroundTaskName, async () => {
    try {
      await processDueAiNotifications();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export function defineAiNotificationHeadlessTask() {
  if (Platform.OS !== 'android') return;
  AppRegistry.registerHeadlessTask('AiNotificationHeadlessTask', () => async () => {
    await processDueAiNotifications();
  });
}

export async function getAiNotificationBackgroundStatus(localOnly = false): Promise<AiNotificationBackgroundStatus> {
  if (Platform.OS === 'web') {
    return {
      mode: 'unsupported',
      available: false,
      registered: false,
      permissionGranted: false,
      localOnly,
      details: 'Web can show browser notifications, but scheduled AI jobs do not run in the background.',
    };
  }

  const nativeWorkerStatus = await getNativeAiNotificationWorkerStatus();
  const nativeWorkerAvailable = Platform.OS === 'android' && nativeWorkerStatus.available;
  const available = await TaskManager.isAvailableAsync().catch(() => false);
  if (!available && !nativeWorkerAvailable) {
    return {
      mode: 'foreground-catchup',
      available: false,
      registered: false,
      permissionGranted: false,
      localOnly,
      details: 'Background tasks are unavailable in this runtime. Overdue jobs run when the app is open.',
    };
  }

  const backgroundStatus = await BackgroundTask.getStatusAsync().catch(() => BackgroundTask.BackgroundTaskStatus.Restricted);
  const taskRegistered = await TaskManager.isTaskRegisteredAsync(aiNotificationBackgroundTaskName).catch(() => false);
  const permissions = await Notifications.getPermissionsAsync().catch(() => ({ granted: false }));

  if (nativeWorkerAvailable) {
    return {
      mode: 'native-background',
      available: true,
      registered: taskRegistered || nativeWorkerStatus.registered,
      permissionGranted: permissions.granted,
      localOnly,
      details: nativeWorkerStatus.registered
        ? 'Android native worker is scheduled. AI result delivery can still be delayed by battery and network limits.'
        : 'Android native worker is available and will be scheduled with AI notifications.',
    };
  }

  if (backgroundStatus !== BackgroundTask.BackgroundTaskStatus.Available) {
    return {
      mode: 'foreground-catchup',
      available: false,
      registered: taskRegistered,
      permissionGranted: permissions.granted,
      localOnly,
      details: 'Native background processing is restricted by the OS or current build. Overdue jobs run when the app is reopened.',
    };
  }

  return {
    mode: 'native-background',
    available: true,
    registered: taskRegistered,
    permissionGranted: permissions.granted,
    localOnly,
    details: taskRegistered
      ? 'Native background worker is registered. Delivery may still be delayed by the OS.'
      : 'Native background worker is available but not registered yet.',
  };
}

export async function registerAiNotificationBackgroundTask() {
  if (Platform.OS === 'web') return getAiNotificationBackgroundStatus();
  await ensureAiNotificationPermissions();
  if (Platform.OS === 'android') await aiNotificationWorkerModule?.schedulePolling().catch(() => false);
  const available = await TaskManager.isAvailableAsync();
  if (!available) return getAiNotificationBackgroundStatus();
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return getAiNotificationBackgroundStatus();
  const registered = await TaskManager.isTaskRegisteredAsync(aiNotificationBackgroundTaskName);
  if (!registered) await BackgroundTask.registerTaskAsync(aiNotificationBackgroundTaskName, { minimumInterval: 15 });
  return getAiNotificationBackgroundStatus();
}

export async function triggerAiNotificationBackgroundTaskForTesting() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    const nativeTriggered = await aiNotificationWorkerModule?.triggerNow().catch(() => false);
    if (nativeTriggered) return true;
  }
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}

export async function sendAiNotificationTestNotification() {
  if (Platform.OS === 'web') return false;
  const granted = await ensureAiNotificationPermissions();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'AI notifications ready',
      body: 'Native notification permission and channel are working.',
      sound: true,
      data: { type: 'ai-notification-test' },
    },
    trigger: null,
  });
  return true;
}

export async function ensureAiNotificationPermissions() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(notificationChannelId, {
      name: 'AI Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5645d4',
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function cancelNativeAiNotification(notificationId: string | undefined) {
  if (!notificationId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
}

export async function scheduleNativeAiNotificationPlaceholder(job: AiNotificationJob) {
  if (Platform.OS === 'web') return undefined;
  await scheduleNativeAiNotificationWorker(job).catch(() => undefined);
  const granted = await ensureAiNotificationPermissions();
  if (!granted) return undefined;
  const scheduledTime = new Date(job.scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) return undefined;
  const trigger: Notifications.NotificationTriggerInput = scheduledTime <= Date.now()
    ? null
    : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(scheduledTime) };
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: job.title,
      body: 'AI notification is scheduled. Open the app near this time to trigger processing and receive the result.',
      sound: true,
      data: { type: 'ai-notification', jobId: job.id },
    },
    trigger,
  });
  return notificationId;
}

export async function scheduleNativeAiNotificationWorker(job: AiNotificationJob) {
  if (Platform.OS !== 'android' || !aiNotificationWorkerModule) return false;
  const scheduledTime = new Date(job.scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) return false;
  return aiNotificationWorkerModule.scheduleJob(job.id, scheduledTime, job.repeatEveryHours ?? 0);
}

export async function cancelNativeAiNotificationWorker(jobId: string | undefined) {
  if (!jobId || Platform.OS !== 'android' || !aiNotificationWorkerModule) return;
  await aiNotificationWorkerModule.cancelJob(jobId).catch(() => undefined);
}

export async function cancelScheduledAiPlaceholderNotifications() {
  if (Platform.OS === 'web') return;
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(scheduledNotifications.map((notification) => {
    const type = notification.content.data?.type;
    return type === 'ai-notification' ? Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined) : Promise.resolve();
  }));
}

export async function processDueAiNotifications() {
  const state = await readNotificationStateForRunner();
  const now = Date.now();
  const dueJobs = state.jobs.filter((job) => job.status === 'scheduled' && new Date(job.scheduledAt).getTime() <= now && !processingJobIds.has(job.id));
  if (!dueJobs.length) return { state, processed: 0 };

  const latestState = await readNotificationStateForRunner();
  const refreshedDueJobs = latestState.jobs.filter((job) => job.status === 'scheduled' && new Date(job.scheduledAt).getTime() <= now && !processingJobIds.has(job.id));
  let nextState = latestState;
  let processed = 0;
  for (const job of refreshedDueJobs) {
    processingJobIds.add(job.id);
    try {
      nextState = await processAiNotificationJob(job, nextState);
      processed += 1;
    } finally {
      processingJobIds.delete(job.id);
    }
  }
  return { state: nextState, processed };
}

async function processAiNotificationJob(job: AiNotificationJob, state: AiNotificationState) {
  let nextState = updateJob(state, job.id, { status: 'running', updatedAt: new Date().toISOString(), error: undefined });
  await writeNotificationStateForRunner(nextState);
  try {
    const data = await readNotificationDocument(job.documentId);
    const result = cleanResult(await requestAiText(buildNotificationPrompt(job.prompt, data)));
    const now = new Date().toISOString();
    nextState = updateJob(nextState, job.id, createCompletedPatch(job, { result, now, failed: false }));
    await writeNotificationStateForRunner(nextState);
    await cancelNativeAiNotification(job.nativeNotificationId);
    if (!job.notifiedAt) await presentAiResultNotification(job.title, result);
  } catch (runError) {
    const message = formatAiReviewRequestError(runError);
    const now = new Date().toISOString();
    nextState = updateJob(nextState, job.id, createCompletedPatch(job, { error: message, now, failed: true }));
    await writeNotificationStateForRunner(nextState);
    await cancelNativeAiNotification(job.nativeNotificationId);
    if (!job.notifiedAt) await presentAiResultNotification(`${job.title} failed`, message);
  }
  return nextState;
}

async function readNotificationStateForRunner() {
  try {
    const state = await readAiNotifications();
    await writeLocalAiNotifications(state);
    return state;
  } catch {
    return readLocalAiNotifications();
  }
}

async function writeNotificationStateForRunner(state: AiNotificationState) {
  await mergeAndWriteAiNotifications(state).catch(() => writeLocalAiNotifications(state));
}

async function readNotificationDocument(documentId: string): Promise<NotesData> {
  if (documentId === 'main') return readMainNotesData();
  return readMainNotesData();
}

async function readMainNotesData(): Promise<NotesData> {
  try {
    return (await readWorkspaceNotes(defaultWorkspaceId)).data;
  } catch {
    return (await readLocalWorkspaceNotes(defaultWorkspaceId)).data;
  }
}

function buildNotificationPrompt(prompt: string, data: NotesData) {
  return [
    'Use the main JSON context below to answer the user prompt. Return a concise notification-ready result.',
    'User prompt:',
    prompt,
    'Main JSON:',
    JSON.stringify(data, null, 2),
  ].join('\n\n');
}

function cleanResult(result: string) {
  const clean = result.replace(/\s+/g, ' ').trim();
  return clean || 'AI completed the scheduled prompt.';
}

function updateJob(state: AiNotificationState, jobId: string, patch: Partial<AiNotificationJob>): AiNotificationState {
  return {
    jobs: state.jobs.map((item) => item.id === jobId ? { ...item, ...patch } : item),
    version: state.version + 1,
  };
}

async function presentAiResultNotification(title: string, body: string) {
  if (Platform.OS === 'web') return;
  const granted = await ensureAiNotificationPermissions();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data: { type: 'ai-notification-result' } },
    trigger: null,
  });
}

function createCompletedPatch(job: AiNotificationJob, completion: { now: string; failed: boolean; result?: string; error?: string }): Partial<AiNotificationJob> {
  if (job.repeatEveryHours) {
    return {
      status: 'scheduled',
      scheduledAt: nextRepeatScheduledAt(job.scheduledAt, job.repeatEveryHours),
      result: completion.result,
      error: completion.error,
      sentAt: completion.failed ? job.sentAt : completion.now,
      notifiedAt: undefined,
      updatedAt: completion.now,
      lastRunScheduledAt: job.scheduledAt,
    };
  }
  return completion.failed
    ? { status: 'failed', error: completion.error, notifiedAt: completion.now, updatedAt: completion.now, lastRunScheduledAt: job.scheduledAt }
    : { status: 'sent', result: completion.result, sentAt: completion.now, notifiedAt: completion.now, updatedAt: completion.now, error: undefined, lastRunScheduledAt: job.scheduledAt };
}

function nextRepeatScheduledAt(scheduledAt: string, repeatEveryHours: number) {
  const intervalMs = repeatEveryHours * 60 * 60 * 1000;
  const scheduledTime = new Date(scheduledAt).getTime();
  const baseTime = Number.isFinite(scheduledTime) ? scheduledTime : Date.now();
  let nextTime = baseTime + intervalMs;
  while (nextTime <= Date.now()) nextTime += intervalMs;
  return new Date(nextTime).toISOString();
}

async function getNativeAiNotificationWorkerStatus() {
  if (Platform.OS !== 'android' || !aiNotificationWorkerModule) return { available: false, registered: false };
  return aiNotificationWorkerModule.getStatus().catch(() => ({ available: false, registered: false }));
}