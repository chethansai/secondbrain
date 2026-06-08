export type VoiceRecording = {
  id: string;
  uri: string;
  durationMs: number;
  createdAt: string;
  completedAt?: string;
  fileName?: string;
  sizeBytes?: number;
  transcribedText?: string;
};

export type VoiceRecorderSettings = {
  enabled: boolean;
  durationSeconds: number;
};

export const VOICE_RECORDINGS_STORAGE_KEY = 'voiceRecordings';
export const VOICE_RECORDER_SETTINGS_KEY = 'voiceRecorderSettings';
export const MIN_VOICE_RECORDER_DURATION_SECONDS = 1;
export const MAX_VOICE_RECORDER_DURATION_SECONDS = 24 * 60 * 60;

export const DEFAULT_VOICE_RECORDER_SETTINGS: VoiceRecorderSettings = {
  enabled: false,
  durationSeconds: 5 * 60,
};

export type VoiceRecorderPlaybackStatus = 'idle' | 'playing' | 'paused' | 'error';
