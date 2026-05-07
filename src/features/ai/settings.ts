import AsyncStorage from '@react-native-async-storage/async-storage';
import { AiProviderConfig } from './types';

const settingsKey = 'rnnotetaking.ai.providers.v1';

export const defaultAiProvider: AiProviderConfig = {
  id: 'primary',
  name: 'Primary AI',
  endpoint: 'https://chethan.tailb6229f.ts.net/v1/responses',
  model: 'oca/gpt-5.4',
  token: 'dummy',
  enabled: true,
  streaming: true,
  timeoutMs: 120000,
};

export async function readAiProviders(): Promise<AiProviderConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(settingsKey);
    if (!raw) return [defaultAiProvider];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [defaultAiProvider];
    const providers = parsed.flatMap(parseProvider);
    return providers.length ? providers : [defaultAiProvider];
  } catch {
    return [defaultAiProvider];
  }
}

export async function writeAiProviders(providers: AiProviderConfig[]) {
  await AsyncStorage.setItem(settingsKey, JSON.stringify(providers));
}

function parseProvider(value: unknown): AiProviderConfig[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as Partial<AiProviderConfig>;
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '';
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  if (!endpoint || !model) return [];
  return [{
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : String(Date.now()),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'AI Provider',
    endpoint,
    model,
    token: typeof raw.token === 'string' ? raw.token : '',
    enabled: raw.enabled !== false,
    streaming: raw.streaming !== false,
    timeoutMs: typeof raw.timeoutMs === 'number' && raw.timeoutMs > 0 ? raw.timeoutMs : 120000,
  }];
}
