import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AiNotificationJob, AiNotificationState, NotesData } from '../../shared/types/notes';
import { formatAiReviewRequestError, requestAiText } from '../ai/aiReviewService';
import { mergeAndWriteAiNotifications, readAiNotifications, readLocalAiNotifications, writeLocalAiNotifications } from './aiNotificationsRepository';
import { readLocalWorkspaceNotes } from './localNotesRepository';
import { defaultWorkspaceId, readWorkspaceNotes } from './notesRepository';

export const aiNotificationBackgroundTaskName = 'rnnotetaking-ai-notifications';
const notificationChannelId = 'ai-notifications';
const processingJobIds = new Set<string>();

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

export async function registerAiNotificationBackgroundTask() {
  if (Platform.OS === 'web') return false;
  await cancelScheduledAiPlaceholderNotifications();
  const available = await TaskManager.isAvailableAsync();
  if (!available) return false;
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  const registered = await TaskManager.isTaskRegisteredAsync(aiNotificationBackgroundTaskName);
  if (!registered) await BackgroundTask.registerTaskAsync(aiNotificationBackgroundTaskName, { minimumInterval: 15 });
  return true;
}

export async function triggerAiNotificationBackgroundTaskForTesting() {
  if (Platform.OS === 'web') return false;
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
  let nextState = state;
  let processed = 0;
  for (const job of dueJobs) {
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