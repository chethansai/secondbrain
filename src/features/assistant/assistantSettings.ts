import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@assistant:preferences';

export type AssistantPreferences = {
  enabled: boolean;
  voiceEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWord?: string;
  overlayEnabled: boolean;
};

export const defaultPrefs: AssistantPreferences = {
  enabled: false,
  voiceEnabled: false,
  wakeWordEnabled: false,
  wakeWord: 'Hey Preethi',
  overlayEnabled: false,
};

export async function loadPreferences(): Promise<AssistantPreferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultPrefs;
    return JSON.parse(raw) as AssistantPreferences;
  } catch (e) {
    return defaultPrefs;
  }
}

export async function savePreferences(p: AssistantPreferences): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
}

export default { loadPreferences, savePreferences, defaultPrefs };
