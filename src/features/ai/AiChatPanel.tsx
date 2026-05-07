import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryPath } from '../../shared/types/notes';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { TextInputField } from '../../shared/ui/TextInputField';
import { AiContextScope, AiNotification, AiRunRecord } from './types';
import { AiRunHistory } from './AiRunHistory';

type Props = {
  currentPath: CategoryPath;
  answer: string;
  status: string | null;
  busy: boolean;
  runs: AiRunRecord[];
  notifications: AiNotification[];
  unreadCount: number;
  onAsk: (question: string, scope: AiContextScope) => Promise<boolean>;
  onGenerateWorkspace: (goal: string) => Promise<boolean>;
  onCategoryRequest: (request: string, parentPath: CategoryPath) => Promise<boolean>;
  onStop: () => void;
  onOpenNotification: (notificationId: string) => Promise<void> | void;
  onOpenWorkspace: (workspaceId: string) => void;
};

const scopes: Array<{ value: AiContextScope; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'current_category', label: 'Category' },
  { value: 'workspace', label: 'Workspace' },
];

export function AiChatPanel({ currentPath, answer, status, busy, runs, notifications, unreadCount, onAsk, onGenerateWorkspace, onCategoryRequest, onStop, onOpenNotification, onOpenWorkspace }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [question, setQuestion] = useState('');
  const [workspaceGoal, setWorkspaceGoal] = useState('');
  const [categoryRequest, setCategoryRequest] = useState('');
  const [scope, setScope] = useState<AiContextScope>('workspace');

  async function submitQuestion() {
    const ok = await onAsk(question, scope);
    if (ok) setQuestion('');
  }

  async function submitWorkspace() {
    const ok = await onGenerateWorkspace(workspaceGoal);
    if (ok) setWorkspaceGoal('');
  }

  async function submitCategoryRequest() {
    const ok = await onCategoryRequest(categoryRequest, currentPath);
    if (ok) setCategoryRequest('');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.statusBand}>
        <View style={styles.statusTextBlock}>
          <Text style={styles.kicker}>AI Assistant</Text>
          <Text style={styles.statusText}>{status ?? 'Ready'}{unreadCount ? ` · ${unreadCount} new` : ''}</Text>
        </View>
        {busy ? <Button label="Stop" icon="close" variant="secondary" onPress={onStop} /> : null}
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Ask chatbot</Text>
        <View style={styles.scopeRow}>
          {scopes.map((item) => (
            <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`Use ${item.label} context`} onPress={() => setScope(item.value)} style={[styles.scopeButton, scope === item.value && styles.scopeButtonActive]}>
              <Text style={[styles.scopeText, scope === item.value && styles.scopeTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInputField value={question} onChangeText={setQuestion} multiline placeholder="Ask about your notes, patterns, actions, or categories" accessibilityLabel="Ask AI question" autoCapitalize="sentences" />
        <Button label="Ask" icon="sparkles-outline" onPress={submitQuestion} disabled={busy || !question.trim()} />
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Generate AI workspace</Text>
        <TextInputField value={workspaceGoal} onChangeText={setWorkspaceGoal} multiline placeholder="Goal for the generated workspace" accessibilityLabel="AI workspace goal" autoCapitalize="sentences" />
        <Button label="Generate workspace" icon="folder-outline" variant="dark" onPress={submitWorkspace} disabled={busy} />
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>New category request</Text>
        <Text style={styles.helper}>Parent: {currentPath.length ? currentPath.join(' > ') : 'root'}</Text>
        <TextInputField value={categoryRequest} onChangeText={setCategoryRequest} multiline placeholder="Ask AI to create a category and pull related notes" accessibilityLabel="AI category request" autoCapitalize="sentences" />
        <Button label="Create request" icon="add" variant="secondary" onPress={submitCategoryRequest} disabled={busy || !categoryRequest.trim()} />
      </View>

      {answer ? (
        <View style={styles.answerBox}>
          <Text style={styles.groupTitle}>Answer</Text>
          <ScrollView style={styles.answerScroll}>
            <Text style={styles.answer}>{answer}</Text>
          </ScrollView>
        </View>
      ) : null}

      <AiRunHistory runs={runs} notifications={notifications} onOpenNotification={onOpenNotification} onOpenWorkspace={onOpenWorkspace} />
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.md },
    statusBand: { borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statusTextBlock: { flex: 1, gap: 2 },
    kicker: { ...typography.captionBold, color: colors.primary },
    statusText: { ...typography.bodySmMedium, color: colors.ink },
    group: { gap: spacing.sm, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.md },
    groupTitle: { ...typography.bodySmMedium, color: colors.ink },
    helper: { ...typography.bodySm, color: colors.slate },
    scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    scopeButton: { minHeight: 34, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineStrong, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    scopeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    scopeText: { ...typography.bodySmMedium, color: colors.ink },
    scopeTextActive: { color: colors.onPrimary },
    answerBox: { gap: spacing.sm, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.cardTintBlue, padding: spacing.md },
    answerScroll: { maxHeight: 260 },
    answer: { ...typography.body, color: colors.charcoal },
  });
}
