import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type ChatConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

const chatStorageKey = 'rnnotetaking.ai.chats.v1';

export async function readChatConversations(): Promise<ChatConversation[]> {
  const raw = await AsyncStorage.getItem(chatStorageKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(parseConversation).sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export async function writeChatConversations(conversations: ChatConversation[]): Promise<void> {
  await AsyncStorage.setItem(chatStorageKey, JSON.stringify(conversations));
}

export async function deleteChatConversation(conversationId: string): Promise<ChatConversation[]> {
  const conversations = await readChatConversations();
  const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId);
  await writeChatConversations(nextConversations);
  return nextConversations;
}

export function createChatConversation(firstMessage: string): ChatConversation {
  const now = Date.now();
  return {
    id: createId('chat'),
    title: createTitle(firstMessage),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createChatMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: createId(role),
    role,
    content,
    createdAt: Date.now(),
  };
}

export function upsertChatConversation(conversations: ChatConversation[], conversation: ChatConversation) {
  const withoutCurrent = conversations.filter((item) => item.id !== conversation.id);
  return [conversation, ...withoutCurrent].sort((left, right) => right.updatedAt - left.updatedAt);
}

function parseConversation(value: unknown): ChatConversation[] {
  if (!value || typeof value !== 'object') return [];
  const item = value as Partial<ChatConversation>;
  if (typeof item.id !== 'string' || typeof item.title !== 'string' || !Array.isArray(item.messages)) return [];
  const messages = item.messages.flatMap(parseMessage);
  return [{
    id: item.id,
    title: item.title.trim() || 'New chat',
    messages,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
  }];
}

function parseMessage(value: unknown): ChatMessage[] {
  if (!value || typeof value !== 'object') return [];
  const item = value as Partial<ChatMessage>;
  if (item.role !== 'user' && item.role !== 'assistant') return [];
  if (typeof item.id !== 'string' || typeof item.content !== 'string') return [];
  return [{
    id: item.id,
    role: item.role,
    content: item.content,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
  }];
}

function createTitle(value: string) {
  const title = value.replace(/\s+/g, ' ').trim();
  return title.length > 42 ? `${title.slice(0, 39)}...` : title || 'New chat';
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}