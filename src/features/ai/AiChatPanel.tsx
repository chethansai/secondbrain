import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { NotesData } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';

type AiChatRole = 'user' | 'assistant';

type AiChatMessage = {
  id: string;
  role: AiChatRole;
  content: string;
  createdAt: string;
};

type AiChatConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AiChatMessage[];
};

type Props = {
  data: NotesData;
};

const aiChatHistoryKey = 'rnnotetaking.ai.conversations.v1';

export function AiChatPanel({ data }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [conversations, setConversations] = useState<AiChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0] ?? null;
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    let mounted = true;
    readAiChatConversations().then((stored) => {
      if (!mounted) return;
      setConversations(stored);
      setActiveId(stored[0]?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [activeConversation?.messages.length, busy]);

  async function persist(nextConversations: AiChatConversation[], nextActiveId?: string | null) {
    const sorted = [...nextConversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    setConversations(sorted);
    if (nextActiveId !== undefined) setActiveId(nextActiveId);
    await AsyncStorage.setItem(aiChatHistoryKey, JSON.stringify(sorted));
  }

  async function startConversation() {
    const now = new Date().toISOString();
    const conversation = { id: createId('chat'), title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
    await persist([conversation, ...conversations], conversation.id);
  }

  async function deleteConversation(conversationId: string) {
    const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId);
    const nextActiveId = activeId === conversationId ? nextConversations[0]?.id ?? null : activeId;
    await persist(nextConversations, nextActiveId);
  }

  async function submit() {
    const cleanInput = input.trim();
    if (!cleanInput || busy) return;
    setBusy(true);
    setError(null);
    setInput('');

    const now = new Date().toISOString();
    const conversation = activeConversation ?? { id: createId('chat'), title: titleFromInput(cleanInput), createdAt: now, updatedAt: now, messages: [] };
    const userMessage = createMessage('user', cleanInput);
    const assistantMessage = createMessage('assistant', '');
    const pendingConversation = {
      ...conversation,
      title: conversation.messages.length ? conversation.title : titleFromInput(cleanInput),
      updatedAt: now,
      messages: [...conversation.messages, userMessage, assistantMessage],
    };

    await persist(upsertConversation(conversations, pendingConversation), pendingConversation.id);

    let assistantText = '';
    try {
      assistantText = await requestAiChat(data, conversation.messages, cleanInput, (token) => {
        assistantText += token;
        setConversations((current) => updateAssistantMessage(current, pendingConversation.id, assistantMessage.id, assistantText));
      });
    } catch (requestError) {
      assistantText = requestError instanceof Error ? requestError.message : 'AI request failed.';
      setError(assistantText);
    }

    const finishedConversation = {
      ...pendingConversation,
      updatedAt: new Date().toISOString(),
      messages: pendingConversation.messages.map((message) => message.id === assistantMessage.id ? { ...message, content: assistantText || 'No response.' } : message),
    };
    await persist(upsertConversation(conversations, finishedConversation), finishedConversation.id);
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.sidebar}>
        <Button label="New chat" icon="add" onPress={startConversation} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.conversationList}>
          {conversations.map((conversation) => (
            <Pressable key={conversation.id} accessibilityRole="button" accessibilityLabel={`Open ${conversation.title}`} onPress={() => setActiveId(conversation.id)} style={[styles.conversationChip, conversation.id === activeConversation?.id && styles.conversationChipActive]}>
              <Text style={[styles.conversationTitle, conversation.id === activeConversation?.id && styles.conversationTitleActive]} numberOfLines={1}>{conversation.title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${conversation.title}`} onPress={() => deleteConversation(conversation.id)} style={styles.deleteChipButton}>
                <Icon name="trash-outline" size={12} color={conversation.id === activeConversation?.id ? colors.onPrimary : colors.semanticError} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messageContent} keyboardShouldPersistTaps="handled">
        {activeConversation?.messages.length ? activeConversation.messages.map((message) => (
          <View key={message.id} style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.messageRole, message.role === 'user' ? styles.userRole : styles.assistantRole]}>{message.role === 'user' ? 'You' : 'Assistant'}</Text>
            <Text style={[styles.messageText, message.role === 'user' ? styles.userText : styles.assistantText]}>{message.content || (busy ? 'Thinking' : '')}</Text>
          </View>
        )) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>AI Chat</Text>
            <Text style={styles.emptyText}>Ask about your current notes.</Text>
          </View>
        )}
      </ScrollView>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput accessibilityLabel="AI chat message" value={input} onChangeText={setInput} placeholder="Message AI" placeholderTextColor={colors.stone} multiline style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send AI chat message" disabled={busy || !input.trim()} onPress={submit} style={[styles.sendButton, (busy || !input.trim()) && styles.sendButtonDisabled]}>
          <Icon name="arrow-forward" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

async function readAiChatConversations(): Promise<AiChatConversation[]> {
  const raw = await AsyncStorage.getItem(aiChatHistoryKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(parseConversation).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

async function requestAiChat(data: NotesData, messages: AiChatMessage[], input: string, onToken: (token: string) => void) {
  const response = await fetch('https://chethan.tailb6229f.ts.net/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dummy' },
    body: JSON.stringify({ model: 'oca/gpt-5.4', input: buildPrompt(data, messages, input) }),
  });
  if (!response.ok) throw new Error(`AI request failed with ${response.status}.`);
  const text = await response.text();
  return consumeSseText(text, onToken);
}

function parseConversation(value: unknown): AiChatConversation[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as Partial<AiChatConversation>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string' || !Array.isArray(raw.messages)) return [];
  const messages = raw.messages.flatMap((message) => {
    if (!message || typeof message !== 'object') return [];
    const rawMessage = message as Partial<AiChatMessage>;
    if (typeof rawMessage.id !== 'string' || typeof rawMessage.content !== 'string' || typeof rawMessage.createdAt !== 'string') return [];
    if (rawMessage.role !== 'user' && rawMessage.role !== 'assistant') return [];
    return [{ id: rawMessage.id, role: rawMessage.role, content: rawMessage.content, createdAt: rawMessage.createdAt }];
  });
  return [{ id: raw.id, title: raw.title, createdAt: raw.createdAt, updatedAt: raw.updatedAt, messages }];
}

function buildPrompt(data: NotesData, messages: AiChatMessage[], input: string) {
  const recentMessages = messages.slice(-8).map((message) => `${message.role}: ${message.content}`).join('\n');
  return [
    'You are an AI notes assistant inside a React Native note-taking app.',
    'Use the main document JSON as context. Be concise, practical, and do not invent notes that are not present.',
    'Main document JSON:',
    JSON.stringify(data, null, 2),
    recentMessages ? `Recent chat history:\n${recentMessages}` : '',
    `User: ${input}`,
  ].filter(Boolean).join('\n\n');
}

function consumeSseText(text: string, onToken: (token: string) => void) {
  let fullText = '';
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
      const token = parsed.choices?.[0]?.delta?.content ?? '';
      if (!token) continue;
      fullText += token;
      onToken(token);
    } catch {
      continue;
    }
  }
  return fullText;
}

function upsertConversation(conversations: AiChatConversation[], conversation: AiChatConversation) {
  const withoutConversation = conversations.filter((item) => item.id !== conversation.id);
  return [conversation, ...withoutConversation];
}

function updateAssistantMessage(conversations: AiChatConversation[], conversationId: string, messageId: string, content: string) {
  return conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    return { ...conversation, messages: conversation.messages.map((message) => message.id === messageId ? { ...message, content } : message) };
  });
}

function createMessage(role: AiChatRole, content: string): AiChatMessage {
  return { id: createId(role), role, content, createdAt: new Date().toISOString() };
}

function titleFromInput(input: string) {
  return input.length > 32 ? `${input.slice(0, 32).trim()}...` : input;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.md },
    sidebar: { gap: spacing.sm },
    conversationList: { gap: spacing.sm, paddingRight: spacing.sm },
    conversationChip: { maxWidth: 220, minHeight: 38, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairlineStrong, paddingLeft: spacing.md, paddingRight: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    conversationChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    conversationTitle: { ...typography.bodySmMedium, color: colors.ink, flex: 1 },
    conversationTitleActive: { color: colors.onPrimary },
    deleteChipButton: { width: 28, height: 28, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center' },
    messages: { minHeight: 320, maxHeight: 520, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, backgroundColor: colors.surfaceSoft },
    messageContent: { gap: spacing.sm, padding: spacing.md, flexGrow: 1 },
    messageBubble: { maxWidth: '92%', borderRadius: rounded.md, padding: spacing.md, gap: spacing.xs },
    userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary },
    assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline },
    messageRole: { ...typography.micro },
    userRole: { color: colors.onPrimary },
    assistantRole: { color: colors.primary },
    messageText: { ...typography.bodySm },
    userText: { color: colors.onPrimary },
    assistantText: { color: colors.ink },
    emptyState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
    emptyTitle: { ...typography.heading5, color: colors.ink },
    emptyText: { ...typography.bodySm, color: colors.slate },
    errorText: { ...typography.captionBold, color: colors.semanticError },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    input: { flex: 1, minHeight: 48, maxHeight: 132, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, backgroundColor: colors.canvas, ...typography.bodySm },
    sendButton: { width: 48, height: 48, borderRadius: rounded.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    sendButtonDisabled: { backgroundColor: colors.muted },
  });
}
