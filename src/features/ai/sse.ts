import { AiUsage } from './types';

export type ParsedSseChunk = {
  content: string;
  done: boolean;
  usage?: AiUsage;
};

export function parseSseText(text: string): ParsedSseChunk {
  const lines = text.split(/\r?\n/);
  let content = '';
  let done = false;
  let usage: AiUsage | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    if (payload === '[DONE]') {
      done = true;
      continue;
    }

    try {
      const parsed = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
        usage?: AiUsage;
      };
      const deltaContent = parsed.choices?.[0]?.delta?.content;
      if (typeof deltaContent === 'string') content += deltaContent;
      if (parsed.choices?.[0]?.finish_reason) done = true;
      if (parsed.usage) usage = parsed.usage;
    } catch {
      continue;
    }
  }

  return { content, done, usage };
}

export function appendParsedSse(accumulated: string, text: string) {
  const parsed = parseSseText(text);
  return { text: accumulated + parsed.content, done: parsed.done, usage: parsed.usage };
}

export function splitCompleteSseText(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const lastNewline = normalized.lastIndexOf('\n');
  if (lastNewline === -1) return { complete: '', rest: normalized };
  return {
    complete: normalized.slice(0, lastNewline + 1),
    rest: normalized.slice(lastNewline + 1),
  };
}
