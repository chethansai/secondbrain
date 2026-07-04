/**
 * Voice Recorder Service
 *
 * Handles recording, playback, and transcription via Groq Whisper API.
 * Key design decisions:
 *  - Foreground JS recorder uses expo-av Audio.Recording with HIGH_QUALITY preset
 *  - Transcription sends audio WITHOUT a language lock so Whisper auto-detects
 *    any of 99+ languages (Hindi, Arabic, Spanish, Tamil, French, Chinese, etc.)
 *  - temperature=0 forces the most deterministic/accurate transcription
 *  - Long recordings are split into ≤60s segments; transcripts are concatenated
 *  - Native Android module (NativeVoiceRecorder) is used when available for
 *    background/foreground-service recording
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Audio } from 'expo-av';
import { NativeModules, Platform } from 'react-native';
import {
  VoiceRecording,
  VoiceRecorderSettings,
  VoiceRecorderPlaybackStatus,
  RecordingSegment,
  VOICE_RECORDINGS_STORAGE_KEY,
  VOICE_RECORDER_SETTINGS_KEY,
  DEFAULT_VOICE_RECORDER_SETTINGS,
  MIN_VOICE_RECORDER_DURATION_SECONDS,
  MAX_VOICE_RECORDER_DURATION_SECONDS,
} from './voiceRecorderTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_RECORDING_TASK = 'voice-recording-task';
const RECORDINGS_DIR = FileSystem.documentDirectory + 'voice-recordings/';

/**
 * Maximum bytes Groq Whisper accepts per request (25 MB).
 * We aim for segments well under this limit.
 */
const GROQ_MAX_BYTES = 24 * 1024 * 1024; // 24 MB safety margin

/**
 * Maximum segment duration in milliseconds for chunked recording.
 * 90 s chunks give clean Whisper context without approaching the file-size limit.
 */
const SEGMENT_DURATION_MS = 90_000;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
// Always use Whisper for transcription (ignore LLM model from .env)
const GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

// ─── Native module bridge ─────────────────────────────────────────────────────

type NativeVoiceRecorderModule = {
  startRecording(settings: VoiceRecorderSettings): Promise<boolean>;
  stopRecording(): Promise<boolean>;
  listRecordings(): Promise<VoiceRecording[]>;
  deleteRecording(id: string): Promise<boolean>;
};

const NativeVoiceRecorder =
  Platform.OS === 'android'
    ? (NativeModules.VoiceRecorderModule as NativeVoiceRecorderModule | undefined)
    : undefined;

// ─── Foreground JS recorder state ─────────────────────────────────────────────

let activeRecording: Audio.Recording | null = null;
/** Segment URIs collected during a chunked foreground session */
let segmentUris: string[] = [];
/** Timer handle for segment rotation */
let segmentTimer: ReturnType<typeof setTimeout> | null = null;
/** Whether a foreground recording session is running */
let foregroundRecordingActive = false;
/** Start time of the current foreground session */
let sessionStartMs = 0;

// ─── Playback state ───────────────────────────────────────────────────────────

let currentSound: Audio.Sound | null = null;
let currentPlaybackStatus: VoiceRecorderPlaybackStatus = 'idle';

// ─── Settings helpers ─────────────────────────────────────────────────────────

export function normalizeVoiceRecorderSettings(
  value: (Partial<VoiceRecorderSettings> & { durationHours?: number }) | null | undefined,
): VoiceRecorderSettings {
  const legacyDurationSeconds =
    typeof value?.durationHours === 'number' ? value.durationHours * 60 * 60 : undefined;
  return {
    enabled: Boolean(value?.enabled),
    durationSeconds: clampDurationSeconds(
      value?.durationSeconds ??
        legacyDurationSeconds ??
        DEFAULT_VOICE_RECORDER_SETTINGS.durationSeconds,
    ),
  };
}

export function clampDurationSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOICE_RECORDER_SETTINGS.durationSeconds;
  return Math.max(
    MIN_VOICE_RECORDER_DURATION_SECONDS,
    Math.min(MAX_VOICE_RECORDER_DURATION_SECONDS, Math.round(value)),
  );
}

export function isNativeVoiceRecorderAvailable() {
  return Boolean(NativeVoiceRecorder);
}

export function isForegroundRecordingActive() {
  return foregroundRecordingActive;
}

// ─── File-system helpers ──────────────────────────────────────────────────────

export async function ensureRecordingsDir() {
  const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
}

export async function getRecordingsDir(): Promise<string> {
  await ensureRecordingsDir();
  return RECORDINGS_DIR;
}

// ─── Persistent settings ──────────────────────────────────────────────────────

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
    await AsyncStorage.setItem(
      VOICE_RECORDER_SETTINGS_KEY,
      JSON.stringify(normalizeVoiceRecorderSettings(settings)),
    );
  } catch (e) {
    console.warn('Failed to save voice settings', e);
  }
}

// ─── Recordings list ──────────────────────────────────────────────────────────

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

export async function addVoiceRecording(
  recording: Omit<VoiceRecording, 'id' | 'createdAt'>,
): Promise<VoiceRecording> {
  await ensureRecordingsDir();
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const createdAt = new Date().toISOString();
  const newRecording: VoiceRecording = { ...recording, id, createdAt };

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
  const recording = recordings.find((r) => r.id === id);
  if (!recording) return false;

  try {
    await FileSystem.deleteAsync(recording.uri, { idempotent: true });
  } catch (e) {
    console.warn('Failed to delete file', e);
  }

  const filtered = recordings.filter((r) => r.id !== id);
  await saveVoiceRecordings(filtered);
  return true;
}

export async function saveTranscription(id: string, text: string): Promise<boolean> {
  const recordings = await loadVoiceRecordings();
  const idx = recordings.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  recordings[idx].transcribedText = text;
  await saveVoiceRecordings(recordings);
  return true;
}

export async function saveDetectedLanguage(id: string, language: string): Promise<boolean> {
  const recordings = await loadVoiceRecordings();
  const idx = recordings.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  recordings[idx].detectedLanguage = language;
  await saveVoiceRecordings(recordings);
  return true;
}

// ─── Background task (stub for native fallback) ───────────────────────────────

export function registerVoiceRecordingTask() {
  if (TaskManager.isTaskDefined(VOICE_RECORDING_TASK)) return;

  TaskManager.defineTask(VOICE_RECORDING_TASK, async ({ error }) => {
    if (error) {
      console.error('Voice recording task error', error);
      return;
    }
    console.log('Voice recording background task triggered');
  });
}

// ─── Foreground JS recorder ───────────────────────────────────────────────────

/**
 * Audio recording options that produce a high-quality m4a/AAC file
 * recognised by Groq Whisper with accurate transcription.
 * Using HIGH_QUALITY preset as base and overriding critical speech parameters.
 */
const SPEECH_RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  android: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1, // mono is better for Whisper speech recognition
    bitRate: 128000,
  },
  ios: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

/**
 * Start a new audio segment recording. Returns the Recording instance.
 */
async function startSegment(): Promise<Audio.Recording> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording } = await Audio.Recording.createAsync(SPEECH_RECORDING_OPTIONS);
  return recording;
}

/**
 * Stop the current segment recording, save it to the recordings dir, and
 * return its URI. Returns null if nothing was recording.
 */
async function stopSegment(recording: Audio.Recording): Promise<string | null> {
  try {
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (!uri) return null;

    // Move to our recordings dir with a unique name
    await ensureRecordingsDir();
    const destName = `seg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.m4a`;
    const destUri = RECORDINGS_DIR + destName;
    await FileSystem.moveAsync({ from: uri, to: destUri });
    return destUri;
  } catch (e) {
    console.warn('Failed to stop segment', e);
    return null;
  }
}

/**
 * Start a foreground in-app recording session.
 * Records in SEGMENT_DURATION_MS chunks until stopForegroundRecording() is called
 * or the total durationSeconds limit is reached.
 *
 * @returns true if started successfully
 */
export async function startForegroundRecording(settings: VoiceRecorderSettings): Promise<boolean> {
  if (foregroundRecordingActive) return false;

  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) return false;

  foregroundRecordingActive = true;
  segmentUris = [];
  sessionStartMs = Date.now();
  const maxDurationMs = settings.durationSeconds * 1000;

  const rotateSegment = async () => {
    if (!foregroundRecordingActive) return;

    // Stop current segment
    if (activeRecording) {
      const uri = await stopSegment(activeRecording);
      if (uri) segmentUris.push(uri);
      activeRecording = null;
    }

    const elapsed = Date.now() - sessionStartMs;
    if (elapsed >= maxDurationMs) {
      // Time limit reached — auto stop
      foregroundRecordingActive = false;
      return;
    }

    // Start next segment
    try {
      activeRecording = await startSegment();
    } catch (e) {
      console.error('Failed to start next recording segment', e);
      foregroundRecordingActive = false;
      return;
    }

    // Schedule next rotation
    const remaining = maxDurationMs - (Date.now() - sessionStartMs);
    const nextInterval = Math.min(SEGMENT_DURATION_MS, remaining);
    if (nextInterval > 0 && foregroundRecordingActive) {
      segmentTimer = setTimeout(rotateSegment, nextInterval);
    }
  };

  // Start the first segment immediately
  try {
    activeRecording = await startSegment();
  } catch (e) {
    console.error('Failed to start first recording segment', e);
    foregroundRecordingActive = false;
    return false;
  }

  // Schedule first rotation
  const firstInterval = Math.min(SEGMENT_DURATION_MS, maxDurationMs);
  segmentTimer = setTimeout(rotateSegment, firstInterval);

  console.log('Foreground recording started, max duration:', settings.durationSeconds, 's');
  return true;
}

/**
 * Stop the foreground recording session.
 * Finalises the current segment and returns all collected segment URIs.
 * Returns null if no recording was active.
 */
export async function stopForegroundRecording(): Promise<{ uris: string[]; durationMs: number } | null> {
  if (!foregroundRecordingActive) return null;

  foregroundRecordingActive = false;
  const totalDurationMs = Date.now() - sessionStartMs;

  if (segmentTimer !== null) {
    clearTimeout(segmentTimer);
    segmentTimer = null;
  }

  // Finalise the last segment
  if (activeRecording) {
    const uri = await stopSegment(activeRecording);
    if (uri) segmentUris.push(uri);
    activeRecording = null;
  }

  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

  const result = { uris: [...segmentUris], durationMs: totalDurationMs };
  segmentUris = [];
  console.log('Foreground recording stopped. Segments:', result.uris.length, 'Duration:', totalDurationMs, 'ms');
  return result;
}

/**
 * Get the elapsed recording time in ms. Returns 0 if not recording.
 */
export function getForegroundRecordingElapsedMs(): number {
  if (!foregroundRecordingActive) return 0;
  return Date.now() - sessionStartMs;
}

// ─── Legacy background recorder (for native module or background task) ────────

export async function startVoiceRecordingBackground(
  settings: VoiceRecorderSettings,
): Promise<boolean> {
  const normalized = normalizeVoiceRecorderSettings(settings);
  if (!normalized.enabled) return false;

  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) return false;

  await saveVoiceRecorderSettings(normalized);

  if (NativeVoiceRecorder) {
    return NativeVoiceRecorder.startRecording(normalized);
  }

  registerVoiceRecordingTask();
  try {
    await BackgroundTask.registerTaskAsync(VOICE_RECORDING_TASK, {
      minimumInterval: normalized.durationSeconds,
    });
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
    return true;
  } catch (e) {
    console.warn('Failed to stop voice background task', e);
    return false;
  }
}

// ─── Playback ─────────────────────────────────────────────────────────────────

export async function playVoiceRecording(
  uri: string,
  onComplete?: () => void,
): Promise<boolean> {
  if (!uri) return false;

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
      { shouldPlay: true, volume: 1.0, isLooping: false },
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
    return true;
  } catch (e) {
    console.error('Failed to stop voice recording playback', e);
    currentSound = null;
    currentPlaybackStatus = 'idle';
    return false;
  }
}

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * Transcription result returned from Groq Whisper.
 */
export type TranscriptionResult = {
  text: string;
  /** BCP-47 language code Whisper detected (e.g. 'en', 'hi', 'ar') */
  detectedLanguage: string | null;
};

/**
 * Transcribe a single audio file via Groq Whisper.
 *
 * IMPORTANT: No `language` parameter is sent — this lets Whisper auto-detect
 * the spoken language from the audio. Supports 99+ languages including
 * Hindi, Arabic, Spanish, French, Tamil, Chinese, Japanese, etc.
 *
 * `temperature: 0` forces the most deterministic (accurate) output.
 */
export async function transcribeAudioFile(uri: string): Promise<TranscriptionResult | null> {
  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set in environment');
    return null;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || !('size' in fileInfo)) {
      console.error('Recording file not found:', uri);
      return null;
    }

    const fileSizeBytes = (fileInfo as { size: number }).size ?? 0;
    if (fileSizeBytes > GROQ_MAX_BYTES) {
      console.warn('File exceeds Groq size limit, skipping segment:', uri, fileSizeBytes);
      return null;
    }

    const formData = new FormData();
    // @ts-ignore — React Native FormData supports this shape
    formData.append('file', {
      uri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as any);
    formData.append('model', GROQ_TRANSCRIPTION_MODEL);
    // Use verbose_json to get the detected language back from Whisper
    formData.append('response_format', 'verbose_json');
    // temperature=0 → deterministic, most accurate transcription
    formData.append('temperature', '0');
    // NO language parameter → Whisper auto-detects any language

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq transcription error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    return {
      text: (result.text as string | undefined) || '',
      // verbose_json includes the detected language code
      detectedLanguage: (result.language as string | undefined) || null,
    };
  } catch (e) {
    console.error('Failed to transcribe audio file', e);
    return null;
  }
}

/**
 * Transcribe a voice recording — handles both single-file and multi-segment recordings.
 *
 * For single files: sends to Groq directly.
 * For multi-segment sessions: transcribes each segment, joins text in order.
 *
 * @param uri  URI of the primary audio file (or first segment if segments provided)
 * @param segmentUrisToTranscribe  Additional segment URIs (for chunked sessions)
 * @param onProgress  Called with incremental text as each segment completes
 */
export async function transcribeVoiceRecording(
  uri: string,
  segmentUrisToTranscribe?: string[],
  onProgress?: (text: string, segmentIndex: number, total: number) => void,
): Promise<TranscriptionResult | null> {
  const allUris = segmentUrisToTranscribe && segmentUrisToTranscribe.length > 0
    ? segmentUrisToTranscribe
    : [uri];

  const parts: string[] = [];
  let detectedLanguage: string | null = null;

  for (let i = 0; i < allUris.length; i++) {
    const segUri = allUris[i];
    const result = await transcribeAudioFile(segUri);
    if (result) {
      const trimmed = result.text.trim();
      if (trimmed) parts.push(trimmed);
      // Use the first detected language (they should all match for one speaker)
      if (!detectedLanguage && result.detectedLanguage) {
        detectedLanguage = result.detectedLanguage;
      }
    }
    if (onProgress) {
      onProgress(parts.join(' '), i, allUris.length);
    }
  }

  if (parts.length === 0) return null;

  return {
    text: parts.join(' '),
    detectedLanguage,
  };
}

export { currentPlaybackStatus };
