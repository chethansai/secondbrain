export type VoiceRecording = {
  id: string;
  uri: string;
  durationMs: number;
  createdAt: string;
  sizeBytes?: number;
};

export type VoiceRecorderSettings = {
  enabled: boolean;
  durationHours: number; // 1 to 24
};

export const VOICE_RECORDINGS_STORAGE_KEY = 'voiceRecordings';
export const VOICE_RECORDER_SETTINGS_KEY = 'voiceRecorderSettings';

export const DEFAULT_VOICE_RECORDER_SETTINGS: VoiceRecorderSettings = {
  enabled: false,
  durationHours: 1,
};
