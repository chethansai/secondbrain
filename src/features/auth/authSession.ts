import AsyncStorage from '@react-native-async-storage/async-storage';

export const defaultAuthTimeoutHours = 1;
export const authTimeoutOptions = [1, 2, 4, 8, 12, 24];

const authTimeoutHoursKey = 'rnnotetaking.auth.timeoutHours';
const lastUnlockAtKey = 'rnnotetaking.auth.lastUnlockAt';

export async function readAuthTimeoutHours(): Promise<number> {
  const raw = await AsyncStorage.getItem(authTimeoutHoursKey);
  const parsed = raw ? Number(raw) : defaultAuthTimeoutHours;
  return normalizeAuthTimeoutHours(parsed);
}

export async function writeAuthTimeoutHours(hours: number): Promise<number> {
  const normalized = normalizeAuthTimeoutHours(hours);
  await AsyncStorage.setItem(authTimeoutHoursKey, String(normalized));
  return normalized;
}

export async function markUnlocked(): Promise<void> {
  await AsyncStorage.setItem(lastUnlockAtKey, String(Date.now()));
}

export async function clearSavedUnlock(): Promise<void> {
  await AsyncStorage.removeItem(lastUnlockAtKey);
}

export async function readShouldStartUnlocked(): Promise<boolean> {
  const [timeoutHours, lastUnlockAtRaw] = await Promise.all([
    readAuthTimeoutHours(),
    AsyncStorage.getItem(lastUnlockAtKey),
  ]);
  return isUnlockStillValid(Number(lastUnlockAtRaw), timeoutHours);
}

export function isUnlockStillValid(lastUnlockAt: number, timeoutHours: number, now = Date.now()) {
  if (!Number.isFinite(lastUnlockAt) || lastUnlockAt <= 0) return false;
  const timeoutMs = normalizeAuthTimeoutHours(timeoutHours) * 60 * 60 * 1000;
  return now - lastUnlockAt < timeoutMs;
}

function normalizeAuthTimeoutHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return defaultAuthTimeoutHours;
  return Math.max(1, Math.min(24, Math.round(hours)));
}