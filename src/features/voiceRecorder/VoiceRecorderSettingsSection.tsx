import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { TextInputField } from '../../shared/ui/TextInputField';
import { VoiceRecording, VoiceRecorderSettings } from './voiceRecorderTypes';
import {
  clampDurationSeconds,
  isNativeVoiceRecorderAvailable,
  loadVoiceRecorderSettings,
  loadVoiceRecordings,
  saveVoiceRecorderSettings,
  startVoiceRecordingBackground,
  stopVoiceRecordingBackground,
  deleteVoiceRecording,
  playVoiceRecording,
} from './voiceRecorderService';

type SortOrder = 'desc' | 'asc';

export function VoiceRecorderSettingsSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState<VoiceRecorderSettings>({ enabled: false, durationSeconds: 300 });
  const [durationText, setDurationText] = useState('300');
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    refreshVoiceRecorder();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshRecordings();
    });
    return () => subscription.remove();
  }, []);

  const sortedRecordings = useMemo(() => {
    return [...recordings].sort((left, right) => {
      const diff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });
  }, [recordings, sortOrder]);

  async function refreshVoiceRecorder() {
    const stored = await loadVoiceRecorderSettings();
    setSettings(stored);
    setDurationText(String(stored.durationSeconds));
    await refreshRecordings();
  }

  async function refreshRecordings() {
    const latest = await loadVoiceRecordings().catch(() => []);
    setRecordings(latest);
  }

  async function saveRecorderSettings() {
    const durationSeconds = clampDurationSeconds(Number(durationText));
    const nextSettings = { ...settings, durationSeconds };
    setSaving(true);
    setStatus(null);
    try {
      await saveVoiceRecorderSettings(nextSettings);
      const ok = nextSettings.enabled
        ? await startVoiceRecordingBackground(nextSettings)
        : await stopVoiceRecordingBackground();
      setSettings(nextSettings);
      setDurationText(String(durationSeconds));
      await refreshRecordings();
      setStatus(ok ? (nextSettings.enabled ? 'Voice recorder is on.' : 'Voice recorder is off.') : 'Microphone permission is required.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Voice recorder could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRecording(id: string) {
    setSaving(true);
    try {
      const deleted = await deleteVoiceRecording(id);
      await refreshRecordings();
      setStatus(deleted ? 'Recording deleted.' : 'Recording could not be deleted.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Icon name="mic-outline" size={16} color={colors.primary} />
          <Text style={styles.title}>Voice recorder</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.enabled }}
          accessibilityLabel="Voice recorder mode"
          onPress={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
          style={[styles.switchTrack, settings.enabled && styles.switchTrackOn]}
        >
          <View style={[styles.switchThumb, settings.enabled && styles.switchThumbOn]} />
          <Text style={[styles.switchText, settings.enabled && styles.switchTextOn]}>{settings.enabled ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
      <TextInputField
        label="Duration in seconds"
        value={durationText}
        onChangeText={setDurationText}
        keyboardType="number-pad"
        accessibilityLabel="Voice recording duration in seconds"
      />
      <Button label="Save voice recorder" icon="checkmark" onPress={saveRecorderSettings} disabled={saving} />
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{isNativeVoiceRecorderAvailable() ? 'Android foreground recorder' : 'Recorder fallback'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle recording date sort" onPress={() => setSortOrder((current) => current === 'desc' ? 'asc' : 'desc')} style={styles.sortButton}>
          <Icon name={sortOrder === 'desc' ? 'chevron-down' : 'chevron-up'} size={14} color={colors.ink} />
          <Text style={styles.sortText}>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</Text>
        </Pressable>
      </View>
      <View style={styles.recordingList}>
        {sortedRecordings.length === 0 ? (
          <Text style={styles.emptyText}>No recordings yet.</Text>
        ) : sortedRecordings.map((recording) => (
          <View key={recording.id} style={styles.recordingRow}>
            <View style={styles.recordingTextWrap}>
              <Text style={styles.recordingTitle} numberOfLines={1}>{recording.fileName ?? recording.id}</Text>
              <Text style={styles.recordingMeta} numberOfLines={1}>{formatRecordingMeta(recording)}</Text>
            </View>
            <Button 
              label="Play" 
              icon="play" 
              variant="secondary" 
              onPress={async () => {
                const played = await playVoiceRecording(recording.uri);
                setStatus(played ? 'Playing recording...' : 'Failed to play recording.');
              }} 
              disabled={saving} 
              style={styles.playButton} 
            />
            <Button label="Delete" icon="trash-outline" variant="danger" onPress={() => removeRecording(recording.id)} disabled={saving} style={styles.deleteButton} />
          </View>
        ))}
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

function formatRecordingMeta(recording: VoiceRecording) {
  const createdAt = new Date(recording.createdAt);
  const date = Number.isNaN(createdAt.getTime()) ? recording.createdAt : createdAt.toLocaleString();
  return `${date} | ${formatDuration(recording.durationMs)} | ${formatSize(recording.sizeBytes)}`;
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${rest}s`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return 'size pending';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    panel: { gap: spacing.sm, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.surfaceSoft, padding: spacing.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
    title: { ...typography.bodySmMedium, color: colors.ink },
    switchTrack: { minWidth: 82, minHeight: 36, borderRadius: rounded.full, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, padding: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
    switchTrackOn: { borderColor: colors.primary, backgroundColor: colors.cardTintBlue },
    switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.stone },
    switchThumbOn: { backgroundColor: colors.primary },
    switchText: { ...typography.micro, color: colors.slate, minWidth: 24, textAlign: 'center' },
    switchTextOn: { color: colors.ink },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    metaText: { ...typography.micro, color: colors.slate, flex: 1 },
    sortButton: { minHeight: 34, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.canvas },
    sortText: { ...typography.micro, color: colors.ink },
    recordingList: { gap: spacing.xs },
    recordingRow: { minHeight: 58, borderWidth: 1, borderColor: colors.hairlineSoft, borderRadius: rounded.md, backgroundColor: colors.canvas, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    recordingTextWrap: { flex: 1, minWidth: 0, gap: 2 },
    recordingTitle: { ...typography.bodySmMedium, color: colors.ink },
    recordingMeta: { ...typography.micro, color: colors.slate },
    playButton: { minWidth: 72 },
    deleteButton: { minWidth: 82 },
    emptyText: { ...typography.bodySmMedium, color: colors.slate },
    status: { ...typography.bodySmMedium, color: colors.slate },
  });
}
