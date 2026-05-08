import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAiNotificationsSync } from '../sync/useAiNotificationsSync';
import { processDueAiNotifications, sendAiNotificationTestNotification, triggerAiNotificationBackgroundTaskForTesting } from '../sync/aiNotificationRunner';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { AiNotificationJob } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { NotesData } from '../../shared/types/notes';

type Props = {
  data: NotesData;
};

export function AiNotificationsPanel({ data }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { jobs, loading, saving, refreshing, error, localMode, setError, scheduleNotification, deleteNotification, refresh } = useAiNotificationsSync();
  const [title, setTitle] = useState('AI notification');
  const [scheduledAt, setScheduledAt] = useState(defaultDateTimeInputValue());
  const [prompt, setPrompt] = useState('Summarize what I should pay attention to next from this JSON.');
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatEveryHours, setRepeatEveryHours] = useState('24');
  const [testingTask, setTestingTask] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const scheduledCount = jobs.filter((job) => job.status === 'scheduled' || job.status === 'running').length;
  const sentCount = jobs.filter((job) => job.status === 'sent').length;
  const failedCount = jobs.filter((job) => job.status === 'failed').length;
  const scheduleHint = !prompt.trim() ? 'Enter a prompt before scheduling.' : null;

  async function submitSchedule() {
    setError(null);
    const ok = await scheduleNotification({
      title,
      prompt,
      scheduledAt: parseDateTimeInput(scheduledAt),
      repeatEveryHours: repeatEnabled ? normalizeRepeatHours(repeatEveryHours) : undefined,
    });
    if (ok) {
      setScheduledAt(defaultDateTimeInputValue());
      setPrompt('');
    }
  }

  async function runBackgroundTest() {
    setTestingTask(true);
    setError(null);
    setTestStatus(null);
    try {
      const result = await processDueAiNotifications();
      await refresh();
      if (result.processed > 0) {
        setTestStatus(`Processed ${result.processed} due AI notification${result.processed === 1 ? '' : 's'}.`);
        return;
      }
      const ok = await triggerAiNotificationBackgroundTaskForTesting();
      setTestStatus(ok ? 'Background worker triggered. No due AI notifications were found.' : 'No due AI notifications. Background trigger only works in native development builds.');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Background task test failed.');
    } finally {
      setTestingTask(false);
    }
  }

  async function sendTestNotification() {
    setTestingTask(true);
    setError(null);
    setTestStatus(null);
    try {
      const ok = await sendAiNotificationTestNotification();
      setTestStatus(ok ? 'Sent a native test notification.' : 'Native notifications are available only in Android/iOS builds with permission allowed.');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Native notification test failed.');
    } finally {
      setTestingTask(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Loading AI notifications</Text></View>;
  }

  return (
    <View style={styles.wrap}>
      {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification error" onPress={() => setError(null)} style={styles.dismissButton}><Icon name="close" size={16} color={colors.semanticError} /></Pressable></View> : null}

      <View style={styles.summaryRow}>
        <SummaryTile label="Scheduled" value={scheduledCount} tone="blue" styles={styles} />
        <SummaryTile label="Sent" value={sentCount} tone="mint" styles={styles} />
        <SummaryTile label="Failed" value={failedCount} tone="rose" styles={styles} />
        <Pressable accessibilityRole="button" accessibilityLabel="Reload AI notifications" disabled={refreshing} onPress={refresh} style={[styles.reloadButton, refreshing && styles.disabled]}>
          <Icon name="reload-outline" size={17} color={refreshing ? colors.stone : colors.ink} />
        </Pressable>
      </View>

      <View style={styles.form}>
        <View style={styles.contextRow}>
          <Icon name="document-text-outline" size={16} color={colors.primary} />
          <View style={styles.contextTextWrap}>
            <Text style={styles.contextTitle}>Main JSON</Text>
            <Text style={styles.contextMeta}>{Object.keys(data).length} root categories used as AI context</Text>
          </View>
        </View>

        <View style={styles.inputGrid}>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>Title</Text>
            <TextInput accessibilityLabel="AI notification title" value={title} onChangeText={setTitle} placeholder="AI notification" placeholderTextColor={colors.stone} style={styles.input} />
          </View>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>Time</Text>
            <View style={styles.timeInputRow}>
              <TextInput accessibilityLabel="AI notification time" value={scheduledAt} onChangeText={setScheduledAt} placeholder="YYYY-MM-DD HH:mm:ss" placeholderTextColor={colors.stone} autoCapitalize="none" autoCorrect={false} style={[styles.input, styles.timeInput]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Set notification time to now" onPress={() => setScheduledAt(defaultDateTimeInputValue())} style={styles.timeNowButton}>
                <Icon name="reload-outline" size={15} color={colors.ink} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Set notification time to ten seconds from now" onPress={() => setScheduledAt(formatDateTimeInput(new Date(Date.now() + 10 * 1000)))} style={styles.timePlusButton}>
                <Text style={styles.timePlusText}>+10s</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.inputWrap}>
          <Text style={styles.label}>Prompt</Text>
          <TextInput accessibilityLabel="AI notification prompt" value={prompt} onChangeText={setPrompt} placeholder="Ask AI what to send at this time" placeholderTextColor={colors.stone} multiline autoCapitalize="sentences" style={[styles.input, styles.promptInput]} />
        </View>

        <View style={styles.repeatRow}>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: repeatEnabled }} onPress={() => setRepeatEnabled((current) => !current)} style={styles.repeatToggle}>
            <View style={[styles.toggleTrack, repeatEnabled && styles.toggleTrackOn]}><View style={[styles.toggleThumb, repeatEnabled && styles.toggleThumbOn]} /></View>
            <Text style={styles.repeatLabel}>Repeat</Text>
          </Pressable>
          <View style={styles.repeatHoursWrap}>
            <TextInput accessibilityLabel="Repeat every hours" value={repeatEveryHours} onChangeText={setRepeatEveryHours} editable={repeatEnabled} keyboardType="numeric" placeholder="24" placeholderTextColor={colors.stone} style={[styles.input, styles.repeatHoursInput, !repeatEnabled && styles.repeatHoursDisabled]} />
            <Text style={styles.repeatUnit}>hours</Text>
          </View>
        </View>

        <View style={styles.formActions}>
          <Button label={saving ? 'Saving' : 'Schedule'} icon="notifications-outline" disabled={saving} onPress={submitSchedule} style={styles.scheduleButton} />
          <Button label="Test notification" icon="notifications-outline" variant="secondary" disabled={testingTask} onPress={sendTestNotification} style={styles.scheduleButton} />
          <Button label="Run due" icon="sparkles-outline" variant="secondary" disabled={testingTask} onPress={runBackgroundTest} style={styles.scheduleButton} />
          {saving ? <ActivityIndicator color={colors.primary} /> : null}
          {localMode ? <Text style={styles.statusText}>Local</Text> : <Text style={styles.statusText}>Synced</Text>}
        </View>
        {scheduleHint ? <Text style={styles.microText}>{scheduleHint}</Text> : null}
        {testStatus ? <Text style={styles.microText}>{testStatus}</Text> : null}
        {Platform.OS === 'web' ? <Text style={styles.microText}>Browser notification permission is requested when the first scheduled result is ready.</Text> : null}
      </View>

      {jobs.length ? (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
          {jobs.map((job) => <NotificationJobCard key={job.id} job={job} styles={styles} onDelete={() => deleteNotification(job.id)} />)}
        </ScrollView>
      ) : <EmptyState title="No AI notifications" message="Scheduled AI results will appear here." />}
    </View>
  );
}

function SummaryTile({ label, value, tone, styles }: { label: string; value: number; tone: 'blue' | 'mint' | 'rose'; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={[styles.summaryTile, tone === 'blue' && styles.summaryTileBlue, tone === 'mint' && styles.summaryTileMint, tone === 'rose' && styles.summaryTileRose]}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function NotificationJobCard({ job, styles, onDelete }: { job: AiNotificationJob; styles: ReturnType<typeof createStyles>; onDelete: () => void }) {
  return (
    <View style={[styles.notification, styles[`${job.status}Notification`]]}>
      <View style={styles.notificationHeader}>
        <View style={styles.notificationTitleWrap}>
          <Text style={styles.notificationTitle}>{job.title}</Text>
          <Text style={styles.notificationMeta}>{job.documentName} - {formatDateTime(job.scheduledAt)}</Text>
        </View>
        <View style={styles.cardActions}>
          <Text style={styles.statusPill}>{statusLabel(job)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${job.title}`} onPress={onDelete} style={styles.deleteButton}>
            <Icon name="trash-outline" size={13} color={styles.deleteIcon.color} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.promptText}>{job.prompt}</Text>
      {job.repeatEveryHours ? <Text style={styles.notificationMeta}>Repeats every {job.repeatEveryHours} hours{job.lastRunScheduledAt ? ` - last ${formatDateTime(job.lastRunScheduledAt)}` : ''}</Text> : null}
      {job.result ? <Text style={styles.resultText}>{job.result}</Text> : null}
      {job.error ? <Text style={styles.cardErrorText}>{job.error}</Text> : null}
    </View>
  );
}

function statusLabel(job: AiNotificationJob) {
  if (job.status === 'sent') return job.sentAt ? `Sent ${formatDateTime(job.sentAt)}` : 'Sent';
  if (job.status === 'running') return 'Running';
  if (job.status === 'failed') return 'Failed';
  return 'Scheduled';
}

function defaultDateTimeInputValue() {
  return formatDateTimeInput(new Date());
}

function formatDateTimeInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDateTimeInput(value: string) {
  const clean = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(clean) ? `${clean}:00` : clean;
  const normalizedDate = normalized.replace(' ', 'T');
  const date = new Date(normalizedDate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value.trim();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeRepeatHours(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.round(parsed));
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.md },
    loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
    loadingText: { ...typography.bodySm, color: colors.slate },
    summaryRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
    summaryTile: { flex: 1, minHeight: 74, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, padding: spacing.sm, justifyContent: 'center' },
    summaryTileBlue: { backgroundColor: colors.cardTintBlue, borderColor: colors.linkBlue },
    summaryTileMint: { backgroundColor: colors.cardTintMint, borderColor: colors.semanticSuccess },
    summaryTileRose: { backgroundColor: colors.cardTintRose, borderColor: colors.semanticError },
    summaryValue: { ...typography.heading3, color: colors.ink },
    summaryLabel: { ...typography.micro, color: colors.slate, textTransform: 'uppercase' },
    reloadButton: { width: 48, minHeight: 74, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
    disabled: { opacity: 0.55 },
    errorBanner: { backgroundColor: colors.cardTintRose, borderRadius: rounded.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    errorText: { ...typography.bodySmMedium, color: colors.semanticError, flex: 1 },
    dismissButton: { width: 32, height: 32, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center' },
    form: { gap: spacing.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, borderRadius: rounded.md, padding: spacing.md },
    contextRow: { minHeight: 54, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    contextTextWrap: { flex: 1, minWidth: 0 },
    contextTitle: { ...typography.bodySmMedium, color: colors.ink },
    contextMeta: { ...typography.micro, color: colors.slate },
    inputGrid: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    inputWrap: { flex: 1, minWidth: 220, gap: spacing.xs },
    label: { ...typography.bodySmMedium, color: colors.charcoal },
    input: { minHeight: 44, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.canvas, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.body },
    timeInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    timeInput: { flex: 1, minWidth: 0 },
    timeNowButton: { width: 44, height: 44, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairlineStrong },
    timePlusButton: { width: 58, height: 44, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairlineStrong },
    timePlusText: { ...typography.micro, color: colors.ink },
    promptInput: { minHeight: 132, textAlignVertical: 'top' },
    repeatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    repeatToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.sm },
    toggleTrack: { width: 42, height: 24, borderRadius: rounded.full, backgroundColor: colors.hairlineStrong, padding: 2, justifyContent: 'center' },
    toggleTrackOn: { backgroundColor: colors.primary },
    toggleThumb: { width: 20, height: 20, borderRadius: rounded.full, backgroundColor: colors.canvas },
    toggleThumbOn: { alignSelf: 'flex-end' },
    repeatLabel: { ...typography.bodySmMedium, color: colors.ink },
    repeatHoursWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    repeatHoursInput: { width: 86, textAlign: 'center' },
    repeatHoursDisabled: { opacity: 0.55 },
    repeatUnit: { ...typography.bodySm, color: colors.slate },
    formActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    scheduleButton: { minWidth: 150 },
    statusText: { ...typography.bodySmMedium, color: colors.primary },
    microText: { ...typography.micro, color: colors.slate },
    list: { maxHeight: 620 },
    listContent: { gap: spacing.sm, paddingBottom: spacing.lg },
    notification: { borderRadius: rounded.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
    scheduledNotification: { backgroundColor: colors.cardTintBlue, borderColor: colors.linkBlue },
    runningNotification: { backgroundColor: colors.cardTintYellow, borderColor: colors.brandYellow },
    sentNotification: { backgroundColor: colors.cardTintMint, borderColor: colors.semanticSuccess },
    failedNotification: { backgroundColor: colors.cardTintRose, borderColor: colors.semanticError },
    notificationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    notificationTitleWrap: { flex: 1, minWidth: 0, gap: 2 },
    notificationTitle: { ...typography.bodySmMedium, color: colors.ink },
    notificationMeta: { ...typography.micro, color: colors.slate },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 },
    statusPill: { ...typography.micro, color: colors.ink, backgroundColor: colors.canvas, borderRadius: rounded.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, overflow: 'hidden' },
    deleteButton: { width: 30, height: 30, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline },
    deleteIcon: { color: colors.semanticError },
    promptText: { ...typography.bodySm, color: colors.charcoal },
    resultText: { ...typography.bodySmMedium, color: colors.ink, backgroundColor: colors.canvas, borderRadius: rounded.md, padding: spacing.sm, overflow: 'hidden' },
    cardErrorText: { ...typography.bodySmMedium, color: colors.semanticError },
  });
}