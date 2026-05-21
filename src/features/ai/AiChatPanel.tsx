import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { collapseExactNameCategories, listAllCategories } from '../categories/categoryTree';
import { listNotesAtPath } from '../notes/noteMutations';
import { sortPinnedNotesFirst } from '../notes/pinnedNotes';
import { WorkspaceCategoryCard } from '../workspace/WorkspaceCategoryCard';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, FlatNote, NotesData, PinnedNoteRef } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { consumeAiResponseText } from './aiReviewService';

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
  pinnedNotes: PinnedNoteRef[];
  onAddNote: (path: CategoryPath, text: string) => Promise<boolean> | boolean;
  onCreateSubcategory: (path: CategoryPath) => void;
  onCopyCategory: (path: CategoryPath) => void;
  onSetSubcategoryPriority: (path: CategoryPath, priority: number) => void;
  onRenameCategory: (path: CategoryPath) => void;
  onDeleteCategory: (path: CategoryPath) => void;
  onEditNote: (note: FlatNote) => void;
  onMoveNote: (note: FlatNote) => void;
  onCopyNote: (note: FlatNote) => void;
  onCopyNoteText: (note: FlatNote) => void;
  onSetNotePriority: (note: FlatNote, priority: number) => void;
  onToggleNotePin: (note: FlatNote) => void;
  onDeleteNote: (note: FlatNote) => void;
};

const aiChatHistoryKey = 'rnnotetaking.ai.conversations.v1';
const promptCategoryName = 'notetakingprompts';

export function AiChatPanel({ data, pinnedNotes, onAddNote, onCreateSubcategory, onCopyCategory, onSetSubcategoryPriority, onRenameCategory, onDeleteCategory, onEditNote, onMoveNote, onCopyNote, onCopyNoteText, onSetNotePriority, onToggleNotePin, onDeleteNote }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [conversations, setConversations] = useState<AiChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0] ?? null;
  const scrollRef = useRef<ScrollView | null>(null);
  const conversationsRef = useRef<AiChatConversation[]>([]);
  const rawCategories = useMemo(() => listAllCategories(data), [data]);
  const promptCategory = useMemo(() => findPromptCategory(rawCategories), [rawCategories]);
  const promptNotes = useMemo(() => promptCategory ? sortPinnedNotesFirst(listNotesAtPath(data, promptCategory.path), pinnedNotes) : [], [data, pinnedNotes, promptCategory]);
  const notesByCategoryKey = useMemo(() => new Map(rawCategories.map((category) => [pathKey(category.path), sortPinnedNotesFirst(listNotesAtPath(data, category.path), pinnedNotes)])), [data, pinnedNotes, rawCategories]);

  function fillPrompt(noteText: string) {
    setInput(noteText);
  }

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

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  async function persist(nextConversations: AiChatConversation[], nextActiveId?: string | null) {
    const sorted = [...nextConversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    conversationsRef.current = sorted;
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
        setConversations((current) => {
          const next = updateAssistantMessage(current, pendingConversation.id, assistantMessage.id, assistantText);
          conversationsRef.current = next;
          return next;
        });
      });
    } catch (requestError) {
      assistantText = formatAiRequestError(requestError);
      setError(assistantText);
    }

    const finishedAt = new Date().toISOString();
    const finishedContent = assistantText || 'No response.';
    const finishedConversations = upsertConversationFromLatest(conversationsRef.current, pendingConversation.id, (current) => ({
      ...current,
      updatedAt: finishedAt,
      messages: current.messages.map((message) => message.id === assistantMessage.id ? { ...message, content: finishedContent } : message),
    }), pendingConversation);
    await persist(finishedConversations, pendingConversation.id);
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
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {activeConversation?.messages.length ? activeConversation.messages.map((message) => (
          <View key={message.id} style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.messageRole, message.role === 'user' ? styles.userRole : styles.assistantRole]}>{message.role === 'user' ? 'You' : 'Assistant'}</Text>
            <Text selectable style={[styles.messageText, message.role === 'user' ? styles.userText : styles.assistantText]}>{message.content || (busy ? 'Thinking' : '')}</Text>
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
        <TextInput accessibilityLabel="AI chat message" value={input} onChangeText={setInput} placeholder="Message AI" placeholderTextColor={colors.stone} multiline selectionColor={colors.primary} contextMenuHidden={false} style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send AI chat message" disabled={busy || !input.trim()} onPress={submit} style={[styles.sendButton, (busy || !input.trim()) && styles.sendButtonDisabled]}>
          <Icon name="arrow-forward" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
      {promptCategory ? (
        <View style={styles.promptArea}>
          <View style={styles.promptHeader}>
            <Text style={styles.promptTitle}>Saved AI prompts</Text>
            <Text style={styles.promptHint}>Tap a card or note to fill the chat box, then edit before sending.</Text>
          </View>
          {promptNotes.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptCardList} keyboardShouldPersistTaps="handled">
              {promptNotes.map((note, index) => (
                <Pressable key={`${note.path.join('/')}-${note.index}-${index}`} accessibilityRole="button" accessibilityLabel="Fill AI chat with saved prompt" onPress={() => fillPrompt(note.note)} style={styles.promptCard}>
                  <Text style={styles.promptCardText}>{note.note}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.promptEmptyText}>Add notes to notetakingprompts to create reusable AI prompt cards.</Text>
          )}
          <WorkspaceCategoryCard
            category={promptCategory}
            allCategories={rawCategories}
            notesByCategoryKey={notesByCategoryKey}
            notes={promptNotes}
            pinnedNotes={pinnedNotes}
            priority={1}
            workspaceName="AI Chat"
            showWorkspaceIntro={false}
            onOpen={() => undefined}
            onOpenCategory={() => undefined}
            onAddNote={onAddNote}
            onCreateSubcategory={onCreateSubcategory}
            onCopyCategory={onCopyCategory}
            onSetSubcategoryPriority={onSetSubcategoryPriority}
            onRenameCategory={onRenameCategory}
            onDeleteCategory={onDeleteCategory}
            onEditNote={onEditNote}
            onMoveNote={onMoveNote}
            onCopyNote={onCopyNote}
            onCopyNoteText={onCopyNoteText}
            onSetNotePriority={onSetNotePriority}
            onToggleNotePin={onToggleNotePin}
            onDeleteNote={onDeleteNote}
            onPressNote={(note) => fillPrompt(note.note)}
          />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function findPromptCategory(categories: ReturnType<typeof listAllCategories>) {
  const visibleCategories = collapseExactNameCategories(categories);
  return visibleCategories.find((category) => category.name.toLowerCase() === promptCategoryName) ?? null;
}

function pathKey(path: CategoryPath) {
  return path.join('\u001f');
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
  return consumeAiResponseText(text, onToken);
}

function formatAiRequestError(error: unknown) {
  if (Platform.OS === 'web' && error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return 'AI endpoint blocked this browser request. Open the app on Android/iOS, or enable CORS and OPTIONS on the AI server for this web origin.';
  }
  return error instanceof Error ? error.message : 'AI request failed.';
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

function upsertConversationFromLatest(conversations: AiChatConversation[], conversationId: string, update: (conversation: AiChatConversation) => AiChatConversation, fallback: AiChatConversation) {
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index === -1) return upsertConversation(conversations, update(fallback));
  const next = [...conversations];
  next[index] = update(next[index]);
  return next;
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
    promptArea: { gap: spacing.sm },
    promptHeader: { gap: spacing.xs },
    promptTitle: { ...typography.bodySmMedium, color: colors.ink },
    promptHint: { ...typography.micro, color: colors.slate },
    promptEmptyText: { ...typography.micro, color: colors.slate },
    promptCardList: { gap: spacing.sm, paddingRight: spacing.sm },
    promptCard: { width: 240, minHeight: 112, maxHeight: 180, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.surfaceSoft, padding: spacing.md, justifyContent: 'center' },
    promptCardText: { ...typography.bodySmMedium, color: colors.charcoal },
  });
}
