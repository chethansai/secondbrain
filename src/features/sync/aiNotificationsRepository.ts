import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, getDocFromServer, onSnapshot, runTransaction, setDoc, Unsubscribe } from 'firebase/firestore';
import { AiNotificationJob, AiNotificationState, AiNotificationStatus } from '../../shared/types/notes';
import { firestore } from './firebase';

export function getUserAiNotificationsRef(uid: string) {
  return doc(firestore, 'users', uid, 'reactnativecollection', 'ainotifications');
}

const localAiNotificationsKey = 'rnnotetaking.aiNotifications.state.v1';

export function subscribeToAiNotifications(uid: string, onChange: (state: AiNotificationState) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(
    getUserAiNotificationsRef(uid),
    (snapshot) => onChange(parseAiNotificationState(snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined)),
    (error) => onError(error.message),
  );
}

export async function readAiNotifications(uid: string): Promise<AiNotificationState> {
  const snapshot = await getDoc(getUserAiNotificationsRef(uid));
  return parseAiNotificationState(snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined);
}

export async function readLatestAiNotifications(uid: string): Promise<AiNotificationState> {
  const snapshot = await getDocFromServer(getUserAiNotificationsRef(uid));
  return parseAiNotificationState(snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined);
}

export async function writeAiNotifications(uid: string, state: AiNotificationState): Promise<void> {
  await setDoc(getUserAiNotificationsRef(uid), serializeAiNotificationState(state), { merge: false });
}

export async function addAiNotificationJob(uid: string, job: AiNotificationJob): Promise<AiNotificationState> {
  console.log('[aiNotifications] add job request', { jobId: job.id, scheduledAt: job.scheduledAt, title: job.title });
  const nextState = await runNotificationTransaction(uid, (remoteState) => ({
    jobs: [job, ...remoteState.jobs],
    version: remoteState.version + 1,
  }), { source: 'addAiNotificationJob' });
  console.log('[aiNotifications] add job committed', { version: nextState.version, jobIds: nextState.jobs.map((item) => item.id) });
  await writeLocalAiNotifications(nextState);
  return nextState;
}

export async function removeAiNotificationJob(uid: string, jobId: string): Promise<AiNotificationState> {
  const nextState = await runNotificationTransaction(uid, (remoteState) => {
    return { jobs: remoteState.jobs.filter((job) => job.id !== jobId), version: remoteState.version + 1 };
  }, { deleteJobId: jobId, source: 'removeAiNotificationJob' });
  await writeLocalAiNotifications(nextState);
  return nextState;
}

export async function mergeAndWriteAiNotifications(uid: string, state: AiNotificationState): Promise<AiNotificationState> {
  const nextState = await runNotificationTransaction(uid, (remoteState) => mergeNotificationStates(remoteState, state), { source: 'mergeAndWriteAiNotifications' });
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

export async function writeLocalAiNotifications(state: AiNotificationState): Promise<void> {
  await AsyncStorage.setItem(localAiNotificationsKey, JSON.stringify(serializeAiNotificationState(state)));
}

export function createAiNotificationJob(input: { title: string; prompt: string; documentId: string; documentName: string; scheduledAt: string; repeatEveryHours?: number }, createdAt = new Date().toISOString()): AiNotificationJob {
  const job: AiNotificationJob = {
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
  console.log('[aiNotifications] created job', { jobId: job.id, createdAt: job.createdAt, scheduledAt: job.scheduledAt });
  return job;
}

export function parseAiNotificationState(raw: Record<string, unknown> | undefined): AiNotificationState {
  if (!raw) return defaultAiNotificationState();
  const jobs = Array.isArray(raw.jobs) ? raw.jobs.flatMap(parseAiNotificationJob) : [];
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? Math.floor(raw.version) : 1;
  return { jobs: jobs.sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)), version };
}

export function serializeAiNotificationState(state: AiNotificationState) {
  return {
    jobs: state.jobs.map(serializeAiNotificationJob),
    version: state.version,
  };
}

export function serializeAiNotificationJob(job: AiNotificationJob) {
  return {
    jobId: job.id,
    title: job.title,
    prompt: job.prompt,
    documentId: job.documentId,
    documentName: job.documentName,
    scheduledAt: job.scheduledAt,
    timeToRun: job.scheduledAt,
    durationMinutes: job.repeatEveryHours ? job.repeatEveryHours * 60 : null,
    repeatEveryHours: job.repeatEveryHours ?? null,
    status: job.status,
    result: job.result ?? null,
    error: job.error ?? null,
    nativeNotificationId: job.nativeNotificationId ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    sentAt: job.sentAt ?? null,
    notifiedAt: job.notifiedAt ?? null,
    lastRunScheduledAt: job.lastRunScheduledAt ?? null,
  };
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
  return {
    jobs: [...jobsById.values()].sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)),
    version,
  };
}

async function runNotificationTransaction(uid: string, update: (remoteState: AiNotificationState) => AiNotificationState, options: { deleteJobId?: string; source?: string } = {}) {
  const ref = getUserAiNotificationsRef(uid);
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const remoteState = parseAiNotificationState(snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined);
    console.log('[aiNotifications] transaction remote state', { source: options.source, version: remoteState.version, jobIds: remoteState.jobs.map((job) => job.id), deleteJobId: options.deleteJobId });
    const nextState = update(remoteState);
    console.log('[aiNotifications] transaction next state', { source: options.source, version: nextState.version, jobIds: nextState.jobs.map((job) => job.id) });
    transaction.set(ref, serializeAiNotificationState(nextState));
    return nextState;
  });
}

function parseAiNotificationJob(value: unknown): AiNotificationJob[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = value as Record<string, unknown>;
  const jobId = typeof raw.jobId === 'string' ? raw.jobId : typeof raw.id === 'string' ? raw.id : undefined;
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : undefined;
  const documentId = typeof raw.documentId === 'string' && raw.documentId.trim() ? raw.documentId : 'main';
  const scheduledAt = typeof raw.scheduledAt === 'string' ? raw.scheduledAt : typeof raw.timeToRun === 'string' ? raw.timeToRun : undefined;
  if (!jobId || !prompt || !scheduledAt) return [];
  const status = parseStatus(raw.status);
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : scheduledAt;
  const repeatEveryHours = normalizeRepeatHours(
    typeof raw.repeatEveryHours === 'number'
      ? raw.repeatEveryHours
      : typeof raw.durationMinutes === 'number'
        ? raw.durationMinutes / 60
        : undefined,
  );
  return [{
    id: jobId,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'AI notification',
    prompt,
    documentId,
    documentName: typeof raw.documentName === 'string' && raw.documentName.trim() ? raw.documentName.trim() : documentId,
    scheduledAt,
    repeatEveryHours,
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

function parseStatus(value: unknown): AiNotificationStatus {
  if (value === 'scheduled' || value === 'running' || value === 'sent' || value === 'failed') return value;
  return 'scheduled';
}

function normalizeRepeatHours(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const hours = Math.max(1, Math.round(value));
  return hours > 0 ? hours : undefined;
}

