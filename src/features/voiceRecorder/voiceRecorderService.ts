import * as FileSystem from 'expo-file-system';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { VoiceRecording, VoiceRecorderSettings, VOICE_RECORDINGS_STORAGE_KEY, VOICE_RECORDER_SETTINGS_KEY, DEFAULT_VOICE_RECORDER_SETTINGS } from './voiceRecorderTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VOICE_RECORDING_TASK = 'voice-recording-task';
const RECORDINGS_DIR = FileSystem.documentDirectory + 'voice-recordings/';

export async function ensureRecordingsDir() {
  const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
}

export async function loadVoiceRecorderSettings(): Promise<VoiceRecorderSettings> {
  try {
    const json = await AsyncStorage.getItem(VOICE_RECORDER_SETTINGS_KEY);
    if (json) {
      return { ...DEFAULT_VOICE_RECORDER_SETTINGS, ...JSON.parse(json) };
    }
  } catch (e) {
    console.warn('Failed to load voice settings', e);
  }
  return { ...DEFAULT_VOICE_RECORDER_SETTINGS };
}

export async function saveVoiceRecorderSettings(settings: VoiceRecorderSettings) {
  try {
    await AsyncStorage.setItem(VOICE_RECORDER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save voice settings', e);
  }
}

export async function loadVoiceRecordings(): Promise<VoiceRecording[]> {
  try {
    const json = await AsyncStorage.getItem(VOICE_RECORDINGS_STORAGE_KEY);
    if (json) {
      return JSON.parse(json);
    }
  } catch (e) {
    console.warn('Failed to load recordings list', e);
  }
  return [];
}

export async function saveVoiceRecordings(recordings: VoiceRecording[]) {
  try {
    await AsyncStorage.setItem(VOICE_RECORDINGS_STORAGE_KEY, JSON.stringify(recordings));
  } catch (e) {
    console.warn('Failed to save recordings list', e);
  }
}

export async function addVoiceRecording(recording: Omit<VoiceRecording, 'id' | 'createdAt'>): Promise<VoiceRecording> {
  await ensureRecordingsDir();
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const createdAt = new Date().toISOString();
  const newRecording: VoiceRecording = {
    ...recording,
    id,
    createdAt,
  };

  const recordings = await loadVoiceRecordings();
  recordings.unshift(newRecording); // newest first
  await saveVoiceRecordings(recordings);
  return newRecording;
}

export async function deleteVoiceRecording(id: string): Promise<boolean> {
  const recordings = await loadVoiceRecordings();
  const recording = recordings.find(r => r.id === id);
  if (!recording) return false;

  try {
    await FileSystem.deleteAsync(recording.uri, { idempotent: true });
  } catch (e) {
    console.warn('Failed to delete file', e);
  }

  const filtered = recordings.filter(r => r.id !== id);
  await saveVoiceRecordings(filtered);
  return true;
}

export async function getRecordingsDir(): Promise<string> {
  await ensureRecordingsDir();
  return RECORDINGS_DIR;
}

// Background task for continuous recording (simplified - real impl would use expo-av Recording in background with limits)
export function registerVoiceRecordingTask() {
  if (TaskManager.isTaskDefined(VOICE_RECORDING_TASK)) return;

  TaskManager.defineTask(VOICE_RECORDING_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Voice recording task error', error);
      return;
    }
    // In real implementation, this would handle periodic recording segments using native modules or foreground service
    // For v1, we log that background recording is active (full implementation would require native Android/iOS code for persistent mic access)
    console.log('Voice recording background task triggered - duration segment complete');
    // Would call addVoiceRecording with new segment file
  });
}

export async function startVoiceRecordingBackground(settings: VoiceRecorderSettings) {
  if (!settings.enabled) return false;

  await registerVoiceRecordingTask();
  try {
    await BackgroundTask.registerTaskAsync(VOICE_RECORDING_TASK, {
      minimumInterval: settings.durationHours * 3600, // in seconds
    });
    console.log('Voice recording background task registered for duration', settings.durationHours, 'hours');
    return true;
  } catch (e) {
    console.warn('Failed to register voice background task', e);
    return false;
  }
}

export async function stopVoiceRecordingBackground() {
  try {
    await BackgroundTask.unregisterTaskAsync(VOICE_RECORDING_TASK);
    console.log('Voice recording background task stopped');
    return true;
  } catch (e) {
    console.warn('Failed to stop voice background task', e);
    return false;
  }
}
