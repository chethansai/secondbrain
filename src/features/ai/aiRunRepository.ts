import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { firestore } from '../sync/firebase';
import { AiNotification, AiRunRecord } from './types';

const localRunsKey = 'rnnotetaking.ai.runs.v1';
const localNotificationsKey = 'rnnotetaking.ai.notifications.v1';
const runsCollection = 'reactnativecollection_ai_runs';
const notificationsCollection = 'reactnativecollection_notifications';

export async function readAiRuns(): Promise<AiRunRecord[]> {
  try {
    const snapshot = await getDocs(query(collection(firestore, runsCollection), orderBy('createdAt', 'desc')));
    const runs = snapshot.docs.flatMap((item) => parseRun(item.data()));
    await writeLocalAiRuns(runs);
    return runs;
  } catch {
    return readLocalAiRuns();
  }
}

export async function saveAiRun(run: AiRunRecord) {
  const localRuns = await readLocalAiRuns();
  await writeLocalAiRuns(upsertRun(localRuns, run));
  try {
    await setDoc(doc(firestore, runsCollection, run.id), run, { merge: false });
  } catch {
    return;
  }
}

export async function readAiNotifications(): Promise<AiNotification[]> {
  try {
    const snapshot = await getDocs(query(collection(firestore, notificationsCollection), orderBy('createdAt', 'desc')));
    const notifications = snapshot.docs.flatMap((item) => parseNotification(item.data()));
    await writeLocalAiNotifications(notifications);
    return notifications;
  } catch {
    return readLocalAiNotifications();
  }
}

export async function saveAiNotification(notification: AiNotification) {
  const localNotifications = await readLocalAiNotifications();
  await writeLocalAiNotifications(upsertNotification(localNotifications, notification));
  try {
    await setDoc(doc(firestore, notificationsCollection, notification.id), notification, { merge: false });
  } catch {
    return;
  }
}

export async function markAiNotificationRead(id: string) {
  const notifications = await readLocalAiNotifications();
  const next = notifications.map((notification) => notification.id === id ? { ...notification, read: true } : notification);
  await writeLocalAiNotifications(next);
  const notification = next.find((item) => item.id === id);
  if (notification) await saveAiNotification(notification);
}

async function readLocalAiRuns() {
  try {
    const raw = await AsyncStorage.getItem(localRunsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.flatMap(parseRun) : [];
  } catch {
    return [];
  }
}

async function writeLocalAiRuns(runs: AiRunRecord[]) {
  await AsyncStorage.setItem(localRunsKey, JSON.stringify(runs));
}

async function readLocalAiNotifications() {
  try {
    const raw = await AsyncStorage.getItem(localNotificationsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.flatMap(parseNotification) : [];
  } catch {
    return [];
  }
}

async function writeLocalAiNotifications(notifications: AiNotification[]) {
  await AsyncStorage.setItem(localNotificationsKey, JSON.stringify(notifications));
}

function upsertRun(runs: AiRunRecord[], run: AiRunRecord) {
  return [run, ...runs.filter((item) => item.id !== run.id)].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function upsertNotification(notifications: AiNotification[], notification: AiNotification) {
  return [notification, ...notifications.filter((item) => item.id !== notification.id)].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function parseRun(value: unknown): AiRunRecord[] {
  if (!value || typeof value !== 'object') return [];
  const run = value as Partial<AiRunRecord>;
  if (!run.id || !run.type || !run.status || !run.title || !run.createdAt) return [];
  return [run as AiRunRecord];
}

function parseNotification(value: unknown): AiNotification[] {
  if (!value || typeof value !== 'object') return [];
  const notification = value as Partial<AiNotification>;
  if (!notification.id || !notification.runId || !notification.title || !notification.createdAt) return [];
  return [{
    id: notification.id,
    runId: notification.runId,
    title: notification.title,
    message: notification.message ?? '',
    createdAt: notification.createdAt,
    read: notification.read === true,
  }];
}
