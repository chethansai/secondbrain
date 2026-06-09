import * as FileSystem from 'expo-file-system/legacy';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Audio } from 'expo-av';
import { NativeModules, Platform } from 'react-native';
import {
  VoiceRecording,
  VoiceRecorderSettings,
  VoiceRecorderPlaybackStatus,
  VOICE_RECORDINGS_STORAGE_KEY,
  VOICE_RECORDER_SETTINGS_KEY,
  DEFAULT_VOICE_RECORDER_SETTINGS,
  MIN_VOICE_RECORDER_DURATION_SECONDS,
  MAX_VOICE_RECORDER_DURATION_SECONDS,
} from './voiceRecorderTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VOICE_RECORDING_TASK = 'voice-recording-task';
const RECORDINGS_DIR = FileSystem.documentDirectory + 'voice-recordings/';

let currentSound: Audio.Sound | null = null;
let currentPlaybackStatus: VoiceRecorderPlaybackStatus = 'idle';

type NativeVoiceRecorderModule = {
  startRecording(settings: VoiceRecorderSettings): Promise<boolean>;
  stopRecording(): Promise<boolean>;
  listRecordings(): Promise<VoiceRecording[]>;
  deleteRecording(id: string): Promise<boolean>;
};

const NativeVoiceRecorder = Platform.OS === 'android'
  ? NativeModules.VoiceRecorderModule as NativeVoiceRecorderModule | undefined
  : undefined;

export function normalizeVoiceRecorderSettings(value: Partial<VoiceRecorderSettings> & { durationHours?: number } | null | undefined): VoiceRecorderSettings {
  const legacyDurationSeconds = typeof value?.durationHours === 'number' ? value.durationHours * 60 * 60 : undefined;
  return {
    enabled: Boolean(value?.enabled),
    durationSeconds: clampDurationSeconds(value?.durationSeconds ?? legacyDurationSeconds ?? DEFAULT_VOICE_RECORDER_SETTINGS.durationSeconds),
  };
}

export function clampDurationSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOICE_RECORDER_SETTINGS.durationSeconds;
  return Math.max(MIN_VOICE_RECORDER_DURATION_SECONDS, Math.min(MAX_VOICE_RECORDER_DURATION_SECONDS, Math.round(value)));
}

export function isNativeVoiceRecorderAvailable() {
  return Boolean(NativeVoiceRecorder);
}

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
      return normalizeVoiceRecorderSettings(JSON.parse(json));
    }
  } catch (e) {
    console.warn('Failed to load voice settings', e);
  }
  return { ...DEFAULT_VOICE_RECORDER_SETTINGS };
}

export async function saveVoiceRecorderSettings(settings: VoiceRecorderSettings) {
  try {
    await AsyncStorage.setItem(VOICE_RECORDER_SETTINGS_KEY, JSON.stringify(normalizeVoiceRecorderSettings(settings)));
  } catch (e) {
    console.warn('Failed to save voice settings', e);
  }
}

export async function loadVoiceRecordings(): Promise<VoiceRecording[]> {
  if (NativeVoiceRecorder) {
    return NativeVoiceRecorder.listRecordings();
  }
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
  if (NativeVoiceRecorder) {
    return NativeVoiceRecorder.deleteRecording(id);
  }
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
  const normalized = normalizeVoiceRecorderSettings(settings);
  if (!normalized.enabled) return false;

  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    return false;
  }

  await saveVoiceRecorderSettings(normalized);

  if (NativeVoiceRecorder) {
    return NativeVoiceRecorder.startRecording(normalized);
  }

  await registerVoiceRecordingTask();
  try {
    await BackgroundTask.registerTaskAsync(VOICE_RECORDING_TASK, {
      minimumInterval: normalized.durationSeconds,
    });
    console.log('Voice recording background task registered for duration', normalized.durationSeconds, 'seconds');
    return true;
  } catch (e) {
    console.warn('Failed to register voice background task', e);
    return false;
  }
}

export async function stopVoiceRecordingBackground() {
  if (NativeVoiceRecorder) {
    await saveVoiceRecorderSettings({ ...DEFAULT_VOICE_RECORDER_SETTINGS, enabled: false });
    return NativeVoiceRecorder.stopRecording();
  }
  try {
    await BackgroundTask.unregisterTaskAsync(VOICE_RECORDING_TASK);
    console.log('Voice recording background task stopped');
    return true;
  } catch (e) {
    console.warn('Failed to stop voice background task', e);
    return false;
  }
}

export async function playVoiceRecording(uri: string, onComplete?: () => void): Promise<boolean> {
  if (!uri) return false;

  // Stop any currently playing sound
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch (e) {
      console.warn('Failed to stop previous sound', e);
    }
    currentSound = null;
  }

  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 1.0, isLooping: false }
    );
    currentSound = sound;
    currentPlaybackStatus = 'playing';

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded) {
        if (status.didJustFinish) {
          currentPlaybackStatus = 'idle';
          onComplete?.();
          sound.unloadAsync().catch(console.warn);
          currentSound = null;
        } else if (status.isPlaying) {
          currentPlaybackStatus = 'playing';
        } else {
          currentPlaybackStatus = 'paused';
        }
      } else {
        currentPlaybackStatus = 'idle';
      }
    });

    console.log('Started playing recording from', uri);
    return true;
  } catch (e) {
    console.error('Failed to play voice recording', e);
    currentSound = null;
    return false;
  }
}

export async function pauseVoiceRecording(): Promise<boolean> {
  if (!currentSound) return false;
  try {
    await currentSound.pauseAsync();
    currentPlaybackStatus = 'paused';
    console.log('Paused current recording');
    return true;
  } catch (e) {
    console.error('Failed to pause voice recording', e);
    return false;
  }
}

export async function stopVoiceRecordingPlayback(): Promise<boolean> {
  if (!currentSound) {
    currentPlaybackStatus = 'idle';
    return false;
  }
  try {
    await currentSound.stopAsync();
    await currentSound.unloadAsync();
    currentSound = null;
    currentPlaybackStatus = 'idle';
    console.log('Stopped current recording playback');
    return true;
  } catch (e) {
    console.error('Failed to stop voice recording playback', e);
    currentSound = null;
    currentPlaybackStatus = 'idle';
    return false;
  }
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
// Always use valid Whisper model for transcription (ignore LLM model from .env)
const GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

export async function transcribeVoiceRecording(uri: string): Promise<string | null> {
  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set in environment');
    return null;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || !('size' in fileInfo)) {
      console.error('Recording file not found');
      return null;
    }

    const formData = new FormData();
    // @ts-ignore - RN FormData supports this
    formData.append('file', {
      uri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as any);
    formData.append('model', GROQ_TRANSCRIPTION_MODEL);
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: formData as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq transcription error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    return result.text || null;
  } catch (e) {
    console.error('Failed to transcribe voice recording', e);
    return null;
  }
}

export async function saveTranscription(id: string, text: string): Promise<boolean> {
  const recordings = await loadVoiceRecordings();
  const recordingIndex = recordings.findIndex(r => r.id === id);
  if (recordingIndex === -1) return false;

  recordings[recordingIndex].transcribedText = text;
  await saveVoiceRecordings(recordings);
  return true;
}

export { currentPlaybackStatus };
