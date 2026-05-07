import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatPath } from '../categories/categoryTree';
import { useAiReviewSync } from '../sync/useAiReviewSync';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { AiReviewDecision } from './aiReviewTypes';

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  tone: 'pending' | 'accepted' | 'rejected' | 'undone';
};

export function AiNotificationsPanel() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { ledger, loading, refreshing, error, localMode, refresh } = useAiReviewSync();
  const notifications = useMemo(() => ledger.decisions.map(createNotificationItem), [ledger.decisions]);
  const pendingCount = notifications.filter((item) => item.tone === 'pending').length;

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Loading AI notifications</Text></View>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryValue}>{notifications.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryTileAccent}>
          <Text style={styles.summaryValue}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Reload AI notifications" disabled={refreshing} onPress={refresh} style={[styles.reloadButton, refreshing && styles.reloadButtonDisabled]}>
          <Icon name="reload-outline" size={17} color={refreshing ? colors.stone : colors.ink} />
        </Pressable>
      </View>

      {localMode ? <Text style={styles.statusText}>Local AI review history</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {notifications.length ? (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
          {notifications.map((item) => (
            <View key={item.id} style={[styles.notification, styles[`${item.tone}Notification`]]}>
              <View style={styles.notificationIcon}>
                <Icon name={item.tone === 'pending' ? 'sparkles-outline' : 'checkmark'} size={14} color={colors.ink} />
              </View>
              <View style={styles.notificationText}>
                <Text style={styles.notificationTitle}>{item.title}</Text>
                <Text style={styles.notificationDetail}>{item.detail}</Text>
                <Text style={styles.notificationMeta}>{item.meta}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : <EmptyState title="No AI notifications" message="AI review activity will appear here after notes are reviewed." />}
    </View>
  );
}

function createNotificationItem(decision: AiReviewDecision): NotificationItem {
  const target = formatPath(decision.targetPath);
  const source = formatPath(decision.sourcePath);
  const action = formatAction(decision);
  return {
    id: decision.simpleId,
    title: `${decision.simpleId} ${statusLabel(decision.status)}`,
    detail: `${action} ${target}`,
    meta: `${source} - score ${decision.score}/10 - ${previewText(decision.note)}`,
    tone: decision.status,
  };
}

function statusLabel(status: AiReviewDecision['status']) {
  if (status === 'accepted') return 'accepted';
  if (status === 'rejected') return 'rejected';
  if (status === 'undone') return 'undone';
  return 'needs review';
}

function formatAction(decision: AiReviewDecision) {
  if (decision.actionType === 'archive') return 'Archive to';
  if (decision.actionType === 'create_action_note') return 'Create action in';
  if (decision.actionType === 'create_category') return 'Create category at';
  return decision.autoMovedAt ? 'Auto-moved to' : 'Suggested move to';
}

function previewText(text: string) {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  return cleanText.length > 72 ? `${cleanText.slice(0, 69)}...` : cleanText;
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.md },
    loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
    loadingText: { ...typography.bodySm, color: colors.slate },
    summaryRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
    summaryTile: { flex: 1, minHeight: 74, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, padding: spacing.sm, justifyContent: 'center' },
    summaryTileAccent: { flex: 1, minHeight: 74, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.brandYellow, backgroundColor: colors.cardTintYellow, padding: spacing.sm, justifyContent: 'center' },
    summaryValue: { ...typography.heading3, color: colors.ink },
    summaryLabel: { ...typography.micro, color: colors.slate, textTransform: 'uppercase' },
    reloadButton: { width: 48, minHeight: 74, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
    reloadButtonDisabled: { opacity: 0.55 },
    statusText: { ...typography.bodySmMedium, color: colors.primary },
    errorText: { ...typography.bodySmMedium, color: colors.semanticError },
    list: { maxHeight: 560 },
    listContent: { gap: spacing.sm, paddingBottom: spacing.lg },
    notification: { borderRadius: rounded.md, borderWidth: 1, padding: spacing.sm, flexDirection: 'row', gap: spacing.sm },
    pendingNotification: { backgroundColor: colors.cardTintYellow, borderColor: colors.brandYellow },
    acceptedNotification: { backgroundColor: colors.cardTintMint, borderColor: colors.semanticSuccess },
    rejectedNotification: { backgroundColor: colors.cardTintRose, borderColor: colors.semanticError },
    undoneNotification: { backgroundColor: colors.surfaceSoft, borderColor: colors.hairlineStrong },
    notificationIcon: { width: 28, height: 28, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, flexShrink: 0 },
    notificationText: { flex: 1, minWidth: 0, gap: 2 },
    notificationTitle: { ...typography.bodySmMedium, color: colors.ink },
    notificationDetail: { ...typography.bodySm, color: colors.charcoal },
    notificationMeta: { ...typography.micro, color: colors.slate },
  });
}