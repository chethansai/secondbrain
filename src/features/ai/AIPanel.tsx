import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { NotesData } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { TextInputField } from '../../shared/ui/TextInputField';
import { streamChatResponse } from './aiChatClient';
import { ChatConversation, createChatConversation, createChatMessage, deleteChatConversation, readChatConversations, upsertChatConversation, writeChatConversations } from './aiChatStorage';

type Props = {
  data: NotesData;
};

export function AIPanel({ data }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null;
  const latestConversationsRef = useRef<ChatConversation[]>([]);
  const activeConversationRef = useRef<ChatConversation | null>(null);

  useEffect(() => {
    let mounted = true;
    readChatConversations().then((loadedConversations) => {
      if (!mounted) return;
      latestConversationsRef.current = loadedConversations;
      setConversations(loadedConversations);
      setActiveConversationId(loadedConversations[0]?.id ?? null);
    }).finally(() => {
      if (mounted) setLoadingHistory(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  async function sendPrompt() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || sending) return;

    setPrompt('');
    setError(null);
    setSending(true);

    const baseConversation = activeConversation ?? createChatConversation(cleanPrompt);
    const userMessage = createChatMessage('user', cleanPrompt);
    const assistantMessage = createChatMessage('assistant', '');
    const pendingConversation = {
      ...baseConversation,
      title: baseConversation.messages.length ? baseConversation.title : createConversationTitle(cleanPrompt),
      messages: [...baseConversation.messages, userMessage, assistantMessage],
      updatedAt: Date.now(),
    };

    activeConversationRef.current = pendingConversation;
    setActiveConversationId(pendingConversation.id);
    applyConversations(upsertChatConversation(latestConversationsRef.current, pendingConversation));

    let assistantContent = '';
    try {
      assistantContent = await streamChatResponse({
        data,
        messages: baseConversation.messages,
        prompt: cleanPrompt,
        onToken: (token) => {
          assistantContent += token;
          updateAssistantMessage(pendingConversation.id, assistantMessage.id, assistantContent);
        },
      });

      const finalConversation = updateConversationMessage(activeConversationRef.current ?? pendingConversation, assistantMessage.id, assistantContent || 'No response received.');
      const nextConversations = upsertChatConversation(latestConversationsRef.current, finalConversation);
      applyConversations(nextConversations);
      await writeChatConversations(nextConversations);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'AI request failed.';
      setError(message);
      const failedConversation = updateConversationMessage(activeConversationRef.current ?? pendingConversation, assistantMessage.id, `Request failed: ${message}`);
      const nextConversations = upsertChatConversation(latestConversationsRef.current, failedConversation);
      applyConversations(nextConversations);
      await writeChatConversations(nextConversations);
    } finally {
      setSending(false);
    }
  }

  function updateAssistantMessage(conversationId: string, messageId: string, content: string) {
    const conversation = latestConversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) return;
    const nextConversation = updateConversationMessage(conversation, messageId, content);
    activeConversationRef.current = nextConversation;
    applyConversations(upsertChatConversation(latestConversationsRef.current, nextConversation));
  }

  function applyConversations(nextConversations: ChatConversation[]) {
    latestConversationsRef.current = nextConversations;
    setConversations(nextConversations);
  }

  function startNewChat() {
    setActiveConversationId(null);
    setPrompt('');
    setError(null);
  }

  async function removeConversation(conversationId: string) {
    const nextConversations = await deleteChatConversation(conversationId);
    applyConversations(nextConversations);
    setActiveConversationId((current) => current === conversationId ? nextConversations[0]?.id ?? null : current);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Chat</Text>
        <Button label="New" icon="add" variant="secondary" onPress={startNewChat} style={styles.newButton} />
      </View>

      {loadingHistory ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.mutedText}>Loading chats</Text></View>
      ) : null}

      {!loadingHistory && conversations.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyRow}>
          {conversations.map((conversation) => (
            <View key={conversation.id} style={[styles.historyPill, activeConversation?.id === conversation.id && styles.historyPillSelected]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${conversation.title}`} onPress={() => setActiveConversationId(conversation.id)} style={styles.historyTitleButton}>
                <Text style={[styles.historyText, activeConversation?.id === conversation.id && styles.historyTextSelected]} numberOfLines={1}>{conversation.title}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${conversation.title}`} onPress={() => removeConversation(conversation.id)} style={styles.deleteButton}>
                <Icon name="trash-outline" size={14} color={activeConversation?.id === conversation.id ? colors.onPrimary : colors.semanticError} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.chatBox}>
        {activeConversation?.messages.length ? activeConversation.messages.map((message) => (
          <View key={message.id} style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.roleLabel, message.role === 'user' ? styles.userRoleLabel : styles.assistantRoleLabel]}>{message.role === 'user' ? 'You' : 'Assistant'}</Text>
            <Text style={[styles.messageText, message.role === 'user' ? styles.userMessageText : styles.assistantMessageText]}>{message.content || (sending ? 'Thinking...' : '')}</Text>
          </View>
        )) : (
          <View style={styles.emptyState}>
            <Icon name="sparkles-outline" size={22} color={colors.primary} />
            <Text style={styles.emptyTitle}>Ask about your notes</Text>
            <Text style={styles.emptyText}>The main document is included as context for each conversation.</Text>
          </View>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TextInputField
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Message AI"
        accessibilityLabel="Message AI"
        multiline
        style={styles.promptInput}
      />
      <View style={styles.actionRow}>
        <Button label={sending ? 'Sending' : 'Send'} icon="arrow-forward" onPress={sendPrompt} disabled={sending || !prompt.trim()} style={styles.sendButton} />
      </View>
    </View>
  );
}

function updateConversationMessage(conversation: ChatConversation, messageId: string, content: string): ChatConversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => message.id === messageId ? { ...message, content } : message),
    updatedAt: Date.now(),
  };
}

function createConversationTitle(value: string) {
  const title = value.replace(/\s+/g, ' ').trim();
  return title.length > 42 ? `${title.slice(0, 39)}...` : title || 'New chat';
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  wrap: { gap: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.heading5, color: colors.ink, flex: 1 },
  newButton: { minWidth: 92 },
  loading: { minHeight: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  mutedText: { ...typography.bodySm, color: colors.slate },
  historyRow: { gap: spacing.xs, paddingVertical: spacing.xs },
  historyPill: { height: 40, maxWidth: 220, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, flexDirection: 'row', alignItems: 'center' },
  historyPillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  historyTitleButton: { flex: 1, minWidth: 96, paddingLeft: spacing.md, paddingRight: spacing.xs, justifyContent: 'center' },
  historyText: { ...typography.bodySmMedium, color: colors.ink },
  historyTextSelected: { color: colors.onPrimary },
  deleteButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  chatBox: { minHeight: 300, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, padding: spacing.md, gap: spacing.sm },
  messageBubble: { maxWidth: '94%', borderRadius: rounded.md, padding: spacing.md, gap: spacing.xxs },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline },
  roleLabel: { ...typography.micro },
  userRoleLabel: { color: colors.onPrimary },
  assistantRoleLabel: { color: colors.primary },
  messageText: { ...typography.bodySm },
  userMessageText: { color: colors.onPrimary },
  assistantMessageText: { color: colors.charcoal },
  emptyState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.lg },
  emptyTitle: { ...typography.heading5, color: colors.ink, textAlign: 'center' },
  emptyText: { ...typography.bodySm, color: colors.slate, textAlign: 'center' },
  errorText: { ...typography.bodySmMedium, color: colors.semanticError },
  promptInput: { minHeight: 92 },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  sendButton: { minWidth: 120 },
  });
}