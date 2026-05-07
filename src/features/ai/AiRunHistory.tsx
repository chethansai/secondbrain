import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { ModalShell } from '../../shared/ui/ModalShell';
import { AiNotification, AiRunRecord } from './types';

type Props = {
  runs: AiRunRecord[];
  notifications: AiNotification[];
  onOpenWorkspace: (workspaceId: string) => void;
  onOpenNotification: (notificationId: string) => Promise<void> | void;
};

export function AiRunHistory({ runs, notifications, onOpenWorkspace, onOpenNotification }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Notifications</Text>
      {notifications.length ? notifications.slice(0, 8).map((notification) => {
        const run = runs.find((item) => item.id === notification.runId);
        return (
          <Pressable key={notification.id} accessibilityRole="button" accessibilityLabel={`Open ${notification.title}`} onPress={() => { setSelectedRunId(notification.runId); onOpenNotification(notification.id); }} style={[styles.row, !notification.read && styles.rowUnread]}>
            <View style={styles.rowIcon}><Icon name="sparkles-outline" size={15} color={colors.primary} /></View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{notification.title}</Text>
              <Text style={styles.rowMessage} numberOfLines={2}>{notification.message || run?.title || 'AI update'}</Text>
            </View>
          </Pressable>
        );
      }) : <Text style={styles.muted}>No AI notifications yet.</Text>}

      <Text style={styles.sectionTitle}>Runs</Text>
      {runs.length ? runs.map((run) => (
        <Pressable key={run.id} accessibilityRole="button" accessibilityLabel={`Open ${run.title}`} onPress={() => setSelectedRunId(run.id)} style={styles.row}>
          <View style={styles.rowIcon}><Icon name={run.status === 'completed' ? 'cloud-done-outline' : 'document-text-outline'} size={15} color={run.status === 'failed' ? colors.semanticError : colors.primary} /></View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{run.title}</Text>
            <Text style={styles.rowMessage}>{run.status} · {formatDate(run.createdAt)}</Text>
          </View>
        </Pressable>
      )) : <Text style={styles.muted}>No AI runs yet.</Text>}

      <ModalShell visible={selectedRun !== null} title={selectedRun?.title ?? 'AI run'} onClose={() => setSelectedRunId(null)}>
        {selectedRun ? (
          <ScrollView style={styles.detailScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailText}>{selectedRun.status}{selectedRun.error ? ` · ${selectedRun.error}` : ''}</Text>
            </View>
            {selectedRun.generatedWorkspaceId ? <Button label="Open workspace" icon="folder-outline" onPress={() => { onOpenWorkspace(selectedRun.generatedWorkspaceId ?? ''); setSelectedRunId(null); }} /> : null}
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Prompt</Text>
              <Text style={styles.code}>{selectedRun.prompt || 'No prompt saved.'}</Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Response</Text>
              <Text style={styles.code}>{selectedRun.responseText || 'No response saved.'}</Text>
            </View>
            {selectedRun.generatedJson ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Generated JSON</Text>
                <Text style={styles.code}>{JSON.stringify(selectedRun.generatedJson, null, 2)}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </ModalShell>
    </View>
  );
}

function formatDate(value: string) {
  return value.replace('T', ' ').slice(0, 16);
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.sm },
    sectionTitle: { ...typography.captionBold, color: colors.primary, marginTop: spacing.sm },
    row: { minHeight: 58, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowUnread: { borderColor: colors.primary, backgroundColor: colors.cardTintBlue },
    rowIcon: { width: 30, height: 30, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { ...typography.bodySmMedium, color: colors.ink },
    rowMessage: { ...typography.bodySm, color: colors.slate },
    muted: { ...typography.bodySm, color: colors.slate },
    detailScroll: { maxHeight: 560 },
    detailBlock: { gap: spacing.xs, marginBottom: spacing.md },
    detailLabel: { ...typography.captionBold, color: colors.primary },
    detailText: { ...typography.bodySm, color: colors.ink },
    code: { ...typography.bodySm, color: colors.charcoal, backgroundColor: colors.surfaceSoft, borderRadius: rounded.md, padding: spacing.sm },
  });
}
