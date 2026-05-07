import { AiClientResult, AiProviderConfig, AiRequest, AiUsage } from './types';
import { parseSseText, splitCompleteSseText } from './sse';

type StreamCallbacks = {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
};

export async function sendAiRequest(providers: AiProviderConfig[], request: AiRequest, callbacks: StreamCallbacks = {}): Promise<AiClientResult> {
  const enabledProviders = providers.filter((provider) => provider.enabled);
  let lastError: unknown;

  for (const provider of enabledProviders) {
    try {
      const text = await sendToProvider(provider, request, callbacks);
      return { providerId: provider.id, ...text };
    } catch (error) {
      if (callbacks.signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No AI provider could complete the request.');
}

async function sendToProvider(provider: AiProviderConfig, request: AiRequest, callbacks: StreamCallbacks): Promise<{ text: string; usage?: AiUsage }> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), provider.timeoutMs);
  const signal = callbacks.signal ?? timeoutController.signal;

  try {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.token}`,
      },
      body: JSON.stringify({
        model: provider.model,
        input: request.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n'),
        temperature: request.temperature ?? 0.2,
        response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      }),
      signal,
    });

    if (!response.ok) throw new Error(`AI request failed with ${response.status}.`);

    const reader = provider.streaming ? response.body?.getReader?.() : undefined;
    if (!reader) {
      const rawText = await response.text();
      const parsed = parseSseText(rawText);
      callbacks.onToken?.(parsed.content);
      return { text: parsed.content || rawText, usage: parsed.usage };
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let pendingText = '';
    let usage: AiUsage | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pendingText += decoder.decode(value, { stream: true });
      const { complete, rest } = splitCompleteSseText(pendingText);
      pendingText = rest;
      if (!complete) continue;
      const parsed = parseSseText(complete);
      if (parsed.content) {
        fullText += parsed.content;
        callbacks.onToken?.(parsed.content);
      }
      if (parsed.usage) usage = parsed.usage;
      if (parsed.done) break;
    }

    if (pendingText) {
      const parsed = parseSseText(pendingText);
      if (parsed.content) {
        fullText += parsed.content;
        callbacks.onToken?.(parsed.content);
      }
      if (parsed.usage) usage = parsed.usage;
    }

    return { text: fullText, usage };
  } finally {
    clearTimeout(timeout);
  }
}
