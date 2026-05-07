import { Platform } from 'react-native';
import { NotesData } from '../../shared/types/notes';
import { formatPath } from '../categories/categoryTree';
import { flattenNotes } from '../notes/noteMutations';
import { ChatMessage } from './aiChatStorage';

const model = 'oca/gpt-5.4';
const directEndpoint = 'https://chethan.tailb6229f.ts.net/v1/responses';
const webProxyEndpoint = 'http://localhost:8787';

type StreamChatOptions = {
  data: NotesData;
  messages: ChatMessage[];
  prompt: string;
  onToken: (token: string) => void;
};

export async function streamChatResponse({ data, messages, prompt, onToken }: StreamChatOptions): Promise<string> {
  const input = buildChatInput(data, messages, prompt);
  try {
    return await requestStream(directEndpoint, input, onToken);
  } catch (error) {
    if (Platform.OS !== 'web') throw error;
    return requestStream(webProxyEndpoint, input, onToken);
  }
}

function buildChatInput(data: NotesData, messages: ChatMessage[], prompt: string) {
  const documentContext = buildDocumentContext(data);
  const recentMessages = messages
    .filter((message) => message.content.trim())
    .slice(-10)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
  return [
    'You are a helpful assistant inside a note-taking app. Answer using the main document context when it is relevant.',
    'The user expects a ChatGPT-style conversation, so keep continuity with recent messages.',
    'Keep responses concise and practical.',
    '',
    'Main document context:',
    documentContext,
    '',
    recentMessages ? `Conversation so far:\n${recentMessages}\n` : '',
    `user: ${prompt}`,
  ].filter(Boolean).join('\n');
}

function buildDocumentContext(data: NotesData) {
  const notes = flattenNotes(data);
  if (!notes.length) return 'No notes in the main document.';
  return notes.slice(0, 80).map((note) => `- ${formatPath(note.path)}: ${compactText(note.note)}`).join('\n');
}

async function requestStream(endpoint: string, input: string, onToken: (token: string) => void) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer dummy',
    },
    body: JSON.stringify({ model, input }),
  });

  if (!response.ok) {
    const details = await safeReadResponseText(response);
    throw new Error(`AI request failed with status ${response.status}${details ? `: ${details}` : '.'}`);
  }

  const body = response.body;
  if (body && 'getReader' in body) {
    return readStream(body as ReadableStream<Uint8Array>, onToken);
  }

  const text = await response.text();
  return parseEventStream(text, onToken);
}

async function readStream(stream: ReadableStream<Uint8Array>, onToken: (token: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = consumeCompleteEvents(buffer, onToken);
    buffer = parsed.remaining;
    reply += parsed.content;
  }

  if (buffer.trim()) reply += parseEventStream(`${buffer}\n`, onToken);
  return reply;
}

function parseEventStream(text: string, onToken: (token: string) => void) {
  return consumeCompleteEvents(text, onToken).content;
}

function consumeCompleteEvents(text: string, onToken: (token: string) => void) {
  const lines = text.split(/\r?\n/);
  const hasCompleteLastLine = text.endsWith('\n');
  const completeLines = hasCompleteLastLine ? lines : lines.slice(0, -1);
  const remaining = hasCompleteLastLine ? '' : lines[lines.length - 1] ?? '';
  let content = '';

  completeLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.replace(/^data:\s*/, '');
    if (!payload || payload === '[DONE]') return;
    try {
      const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown } }> };
      const token = parsed.choices?.[0]?.delta?.content;
      if (typeof token !== 'string' || !token) return;
      content += token;
      onToken(token);
    } catch {
      undefined;
    }
  });

  return { content, remaining };
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220);
}

async function safeReadResponseText(response: Response) {
  try {
    return (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 180);
  } catch {
    return '';
  }
}