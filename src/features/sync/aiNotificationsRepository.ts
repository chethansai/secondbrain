import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDoc, getDocFromServer, getDocs, onSnapshot, runTransaction, setDoc, Unsubscribe } from 'firebase/firestore';
import { AiNotificationJob, AiNotificationState, AiNotificationStatus } from '../../shared/types/notes';
import { firestore } from './firebase';

const aiNotificationsCollection = 'reactnativecollection_notifications';
const aiNotificationsStateId = 'ainotifications';
const aiNotificationJobDocPrefix = 'job_';
const aiNotificationsCollectionRef = collection(firestore, aiNotificationsCollection);
const aiNotificationsStateRef = doc(firestore, aiNotificationsCollection, aiNotificationsStateId);
const localAiNotificationsKey = 'rnnotetaking.aiNotifications.state.v1';

export function subscribeToAiNotifications(onChange: (state: AiNotificationState) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(
    aiNotificationsCollectionRef,
    (snapshot) => onChange(parseAiNotificationCollection(snapshot.docs.map((item) => ({ id: item.id, data: item.data() })))),
    (error) => onError(error.message),
  );
}

export async function readAiNotifications(): Promise<AiNotificationState> {
  const [snapshot, jobsSnapshot] = await Promise.all([getDoc(aiNotificationsStateRef), getDocs(aiNotificationsCollectionRef)]);
  return mergeNotificationStates(
    parseAiNotificationState(snapshot.exists() ? snapshot.data() : undefined),
    parseAiNotificationCollection(jobsSnapshot.docs.map((item) => ({ id: item.id, data: item.data() }))),
  );
}

export async function readLatestAiNotifications(): Promise<AiNotificationState> {
  const [snapshot, jobsSnapshot] = await Promise.all([getDocFromServer(aiNotificationsStateRef), getDocs(aiNotificationsCollectionRef)]);
  return mergeNotificationStates(
    parseAiNotificationState(snapshot.exists() ? snapshot.data() : undefined),
    parseAiNotificationCollection(jobsSnapshot.docs.map((item) => ({ id: item.id, data: item.data() }))),
  );
}

export async function writeAiNotifications(state: AiNotificationState): Promise<void> {
  await setDoc(aiNotificationsStateRef, serializeAiNotificationState(state), { merge: false });
  await Promise.all(state.jobs.map((job) => setDoc(aiNotificationJobRef(job.id), serializeAiNotificationJob(job), { merge: false })));
}

export async function addAiNotificationJob(job: AiNotificationJob): Promise<AiNotificationState> {
  const localState = await readLocalAiNotifications().catch(() => defaultAiNotificationState());
  const jobsState = await readAiNotificationJobDocuments().catch(() => defaultAiNotificationState());
  const nextState = await runNotificationTransaction((remoteState) => mergeNotificationStates(remoteState, jobsState, localState, { jobs: [job], version: 1 }));
  await writeLocalAiNotifications(nextState);
  return nextState;
}

export async function removeAiNotificationJob(jobId: string): Promise<AiNotificationState> {
  const localState = await readLocalAiNotifications().catch(() => defaultAiNotificationState());
  const jobsState = await readAiNotificationJobDocuments().catch(() => defaultAiNotificationState());
  const nextState = await runNotificationTransaction((remoteState) => {
    const merged = mergeNotificationStates(remoteState, jobsState, localState);
    return { jobs: merged.jobs.filter((job) => job.id !== jobId), version: merged.version + 1 };
  }, { deleteJobId: jobId });
  await writeLocalAiNotifications(nextState);
  return nextState;
}

export async function mergeAndWriteAiNotifications(state: AiNotificationState): Promise<AiNotificationState> {
  const localState = await readLocalAiNotifications().catch(() => defaultAiNotificationState());
  const jobsState = await readAiNotificationJobDocuments().catch(() => defaultAiNotificationState());
  const nextState = await runNotificationTransaction((remoteState) => mergeNotificationStates(remoteState, jobsState, localState, state));
  await writeLocalAiNotifications(nextState);
  return nextState;
}

export async function readLocalAiNotifications(): Promise<AiNotificationState> {
  const raw = await AsyncStorage.getItem(localAiNotificationsKey);
  if (!raw) return defaultAiNotificationState();
  try {
    return parseAiNotificationState(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return defaultAiNotificationState();
  }
}

async function readAiNotificationJobDocuments(): Promise<AiNotificationState> {
  const snapshot = await getDocs(aiNotificationsCollectionRef);
  return parseAiNotificationCollection(snapshot.docs.map((item) => ({ id: item.id, data: item.data() })));
}

export async function writeLocalAiNotifications(state: AiNotificationState): Promise<void> {
  await AsyncStorage.setItem(localAiNotificationsKey, JSON.stringify(serializeAiNotificationState(state)));
}

export function createAiNotificationJob(input: { title: string; prompt: string; documentId: string; documentName: string; scheduledAt: string; repeatEveryHours?: number }, createdAt = new Date().toISOString()): AiNotificationJob {
  return {
    id: `ain-${createdAt.replace(/[^0-9]/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim() || 'AI notification',
    prompt: input.prompt.trim(),
    documentId: input.documentId,
    documentName: input.documentName,
    scheduledAt: input.scheduledAt,
    repeatEveryHours: normalizeRepeatHours(input.repeatEveryHours),
    status: 'scheduled',
    createdAt,
    updatedAt: createdAt,
  };
}

export function parseAiNotificationState(raw: Record<string, unknown> | undefined): AiNotificationState {
  if (!raw) return defaultAiNotificationState();
  const jobs = Array.isArray(raw.jobs) ? raw.jobs.flatMap(parseAiNotificationJob) : [];
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? Math.floor(raw.version) : 1;
  return { jobs: jobs.sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)), version };
}

export function serializeAiNotificationState(state: AiNotificationState) {
  return {
    jobs: state.jobs,
    version: state.version,
  };
}

export function serializeAiNotificationJob(job: AiNotificationJob) {
  return job;
}

export function defaultAiNotificationState(): AiNotificationState {
  return { jobs: [], version: 1 };
}

export function mergeNotificationStates(...states: AiNotificationState[]): AiNotificationState {
  const jobsById = new Map<string, AiNotificationJob>();
  let version = 1;
  for (const state of states) {
    version = Math.max(version, state.version);
    for (const job of state.jobs) {
      const current = jobsById.get(job.id);
      if (!current || job.updatedAt.localeCompare(current.updatedAt) >= 0) jobsById.set(job.id, job);
    }
  }
  return { jobs: [...jobsById.values()].sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)), version: version + 1 };
}

async function runNotificationTransaction(update: (remoteState: AiNotificationState) => AiNotificationState, options: { deleteJobId?: string } = {}) {
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(aiNotificationsStateRef);
    const remoteState = parseAiNotificationState(snapshot.exists() ? snapshot.data() : undefined);
    const nextState = update(remoteState);
    transaction.set(aiNotificationsStateRef, serializeAiNotificationState(nextState));
    for (const job of nextState.jobs) transaction.set(aiNotificationJobRef(job.id), serializeAiNotificationJob(job));
    if (options.deleteJobId) transaction.delete(aiNotificationJobRef(options.deleteJobId));
    return nextState;
  });
}

function parseAiNotificationJob(value: unknown): AiNotificationJob[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = value as Partial<AiNotificationJob>;
  if (typeof raw.id !== 'string' || typeof raw.prompt !== 'string' || typeof raw.documentId !== 'string' || typeof raw.scheduledAt !== 'string') return [];
  const status = parseStatus(raw.status);
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : raw.scheduledAt;
  return [{
    id: raw.id,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'AI notification',
    prompt: raw.prompt,
    documentId: raw.documentId,
    documentName: typeof raw.documentName === 'string' && raw.documentName.trim() ? raw.documentName.trim() : raw.documentId,
    scheduledAt: raw.scheduledAt,
    repeatEveryHours: normalizeRepeatHours(raw.repeatEveryHours),
    status,
    result: typeof raw.result === 'string' ? raw.result : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    nativeNotificationId: typeof raw.nativeNotificationId === 'string' ? raw.nativeNotificationId : undefined,
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
    sentAt: typeof raw.sentAt === 'string' ? raw.sentAt : undefined,
    notifiedAt: typeof raw.notifiedAt === 'string' ? raw.notifiedAt : undefined,
    lastRunScheduledAt: typeof raw.lastRunScheduledAt === 'string' ? raw.lastRunScheduledAt : undefined,
  }];
}

function parseAiNotificationCollection(documents: { id: string; data: Record<string, unknown> }[]): AiNotificationState {
  const jobs = documents.flatMap((item) => item.id.startsWith(aiNotificationJobDocPrefix) ? parseAiNotificationJob(item.data) : []);
  return { jobs: jobs.sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)), version: 1 };
}

function parseStatus(value: unknown): AiNotificationStatus {
  if (value === 'scheduled' || value === 'running' || value === 'sent' || value === 'failed') return value;
  return 'scheduled';
}

function normalizeRepeatHours(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const hours = Math.max(1, Math.round(value));
  return hours > 0 ? hours : undefined;
}

function aiNotificationJobRef(jobId: string) {
  return doc(firestore, aiNotificationsCollection, `${aiNotificationJobDocPrefix}${sanitizeJobId(jobId)}`);
}

function sanitizeJobId(jobId: string) {
  return jobId.trim().replace(/[\/]/g, '_') || 'unknown';
}
