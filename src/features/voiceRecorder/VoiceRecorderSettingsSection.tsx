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
  pauseVoiceRecording,
  stopVoiceRecordingPlayback,
  transcribeVoiceRecording,
  saveTranscription,
  currentPlaybackStatus,
} from './voiceRecorderService';
import { addNote, appendHistoryNote } from '../notes/noteMutations';
import { useNotesSync } from '../sync/useNotesSync';
import { copyText } from '../settings/clipboard';

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
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcriptionTexts, setTranscriptionTexts] = useState<Record<string, string>>({});
  const [selectedRecordings, setSelectedRecordings] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const { data, commit } = useNotesSync();

  useEffect(() => {
    refreshVoiceRecorder();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshRecordings();
    });
    return () => subscription.remove();
  }, []);

  // Playback completion synchronized via onComplete callback to playVoiceRecording (removes polling, handles finish event to reset to Play state)
  // Auto-transcribe as soon as new untranscribed voice recordings appear in the section
  useEffect(() => {
    const untranscribed = recordings.filter(
      (r) => !r.transcribedText && !transcriptionTexts[r.id]
    );
    if (untranscribed.length > 0 && transcribingId === null) {
      const rec = untranscribed[0];
      handleTranscribe(rec.id, rec.uri).catch(console.error);
    }
  }, [recordings, transcriptionTexts, transcribingId, handleTranscribe]);

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

  async function handleTranscribe(id: string, uri: string) {
    setTranscribingId(id);
    setStatus('Transcribing with Groq Whisper...');
    try {
      const text = await transcribeVoiceRecording(uri);
      if (text) {
        await saveTranscription(id, text);
        setTranscriptionTexts(prev => ({ ...prev, [id]: text }));
        setStatus('Transcription complete. Adding to VOICENOTES category...');

        // Add the transcribed note to VOICENOTES category
        const result = addNote(data, ['VOICENOTES'], text);
        const historyText = `Voice transcription from recording ${id} - VOICENOTES - ${new Date().toISOString()}`;
        const commitResult = await commit(appendHistoryNote(result.ok ? result.data : data, historyText));
        if (commitResult && result.ok) {
          setStatus('Transcription added to VOICENOTES category.');
        }
      } else {
        setStatus('Transcription failed or returned no text.');
      }
    } catch (e) {
      setStatus('Transcription error occurred.');
      console.error(e);
    } finally {
      setTranscribingId(null);
      await refreshRecordings();
    }
  }

  async function refreshRecordings() {
    const latest = await loadVoiceRecordings().catch(() => []);
    setRecordings(latest);
    // Clear selections when refreshing
    setSelectedRecordings(new Set());
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
      setTranscriptionTexts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSelectedRecordings(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedRecordings() {
    if (selectedRecordings.size === 0) return;
    setSaving(true);
    setShowDeleteConfirm(false);
    let deletedCount = 0;
    try {
      for (const id of selectedRecordings) {
        const deleted = await deleteVoiceRecording(id);
        if (deleted) deletedCount++;
        setTranscriptionTexts(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      await refreshRecordings();
      setStatus(`Deleted ${deletedCount} recording(s).`);
      setSelectedRecordings(new Set());
    } catch (e) {
      setStatus('Some recordings could not be deleted.');
    } finally {
      setSaving(false);
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedRecordings(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedRecordings.size === sortedRecordings.length) {
      setSelectedRecordings(new Set());
    } else {
      setSelectedRecordings(new Set(sortedRecordings.map(r => r.id)));
    }
  };

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

      {sortedRecordings.length > 0 && (
        <View style={styles.bulkActions}>
          <Button 
            label={selectedRecordings.size === sortedRecordings.length ? 'Deselect All' : 'Select All'} 
            icon="checkmark" 
            variant="secondary" 
            onPress={selectAll} 
            disabled={saving} 
            style={styles.bulkButton}
          />
          {selectedRecordings.size > 0 && (
            <Button 
              label={`Delete Selected (${selectedRecordings.size})`} 
              icon="trash-outline" 
              variant="danger" 
              onPress={() => setShowDeleteConfirm(true)} 
              disabled={saving} 
              style={styles.bulkButton}
            />
          )}
        </View>
      )}

      <View style={styles.recordingList}>
        {sortedRecordings.length === 0 ? (
          <Text style={styles.emptyText}>No recordings yet.</Text>
        ) : sortedRecordings.map((recording) => {
          const currentTranscription = recording.transcribedText || transcriptionTexts[recording.id] || '';
          const isSelected = selectedRecordings.has(recording.id);
          return (
            <View key={recording.id} style={[styles.recordingRow, isSelected && styles.selectedRow]}>
              {/* Refactored per requirements: single Play/Pause toggle (dynamic icon+label) + separate Delete.
                   When not playing: [▶ Play] [🗑 Delete]
                   When playing:     [❚❚ Pause] [🗑 Delete]
                   State auto-resets to Play on audio completion (via onComplete callback).
                   Compact responsive row on mobile. */}
              <Pressable 
                style={styles.checkbox} 
                onPress={() => toggleSelection(recording.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <Text style={styles.checkboxText}>{isSelected ? '☑' : '☐'}</Text>
              </Pressable>
              <View style={styles.recordingTextWrap}>
                <Text style={styles.recordingTitle} numberOfLines={1}>{recording.fileName ?? recording.id}</Text>
                <Text style={styles.recordingMeta} numberOfLines={1}>{formatRecordingMeta(recording)}</Text>
                {currentTranscription ? (
                  <View style={styles.transcriptionBox}>
                    <Text style={styles.transcriptionLabel}>Transcription:</Text>
                    <TextInputField
                      value={currentTranscription}
                      onChangeText={(newText) => setTranscriptionTexts(prev => ({ ...prev, [recording.id]: newText }))}
                      multiline
                      style={styles.transcriptionInput}
                    />
                    <View style={styles.transcriptionActions}>
                      <Button 
                        label="Copy" 
                        icon="copy-outline" 
                        variant="secondary" 
                        onPress={() => copyText(currentTranscription).then(copied => setStatus(copied ? 'Copied to clipboard.' : 'Copy failed.'))} 
                        style={styles.smallButton}
                      />
                      <Button 
                        label="Save to Notes" 
                        icon="add" 
                        variant="primary" 
                        onPress={async () => {
                          const result = addNote(data, ['VOICENOTES'], currentTranscription);
                          const historyText = `Edited voice transcription - VOICENOTES - ${new Date().toISOString()}`;
                          const commitResult = await commit(appendHistoryNote(result.ok ? result.data : data, historyText));
                          setStatus(commitResult ? 'Saved to VOICENOTES category.' : 'Save failed.');
                        }} 
                        style={styles.smallButton}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
              <View style={styles.audioControlsRow}>
                <Button
                  label={isPlaying ? 'Pause' : 'Play'}
                  icon={isPlaying ? 'pause' : 'play'}
                  variant="secondary"
                  onPress={async () => {
                    if (!isPlaying) {
                      // startPlayback - using the specific recording
                      const played = await playVoiceRecording(recording.uri, () => {
                        setIsPlaying(false);
                        setCurrentlyPlayingId(null);
                        setStatus('Playback finished.');
                      });
                      if (played) {
                        setIsPlaying(true);
                        setCurrentlyPlayingId(recording.id);
                        setStatus('Playing recording...');
                      }
                    } else {
                      const paused = await pauseVoiceRecording();
                      if (paused) {
                        setIsPlaying(false);
                        setCurrentlyPlayingId(null);
                        setStatus('Playback paused.');
                      }
                    }
                  }}
                  disabled={saving}
                  style={styles.playPauseButton}
                />
                <Button
                  label="Delete"
                  icon="trash-outline"
                  variant="danger"
                  onPress={() => removeRecording(recording.id)}
                  disabled={saving}
                  style={styles.deleteButton}
                />
              </View>
            </View>
          );
        })}
      </View>

      {showDeleteConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Delete {selectedRecordings.size} recording(s)?</Text>
            <Text style={styles.confirmText}>This action cannot be undone. All selected audio files will be permanently deleted from storage.</Text>
            <View style={styles.confirmButtons}>
              <Button 
                label="Cancel" 
                variant="secondary" 
                onPress={() => setShowDeleteConfirm(false)} 
                style={styles.confirmButton}
              />
              <Button 
                label="Delete All Selected" 
                variant="danger" 
                onPress={deleteSelectedRecordings} 
                disabled={saving}
                style={styles.confirmButton}
              />
            </View>
          </View>
        </View>
      )}
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
    panel: { position: 'relative', gap: spacing.sm, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.surfaceSoft, padding: spacing.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
    title: { ...typography.bodySmMedium, color: colors.ink },
    switchTrack: { minWidth: 82, minHeight: 36, borderRadius: rounded.full, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, padding: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
    switchTrackOn: { borderColor: colors.primary, backgroundColor: colors.cardTintLavender },
    switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.stone },
    switchThumbOn: { backgroundColor: colors.primary },
    switchText: { ...typography.micro, color: colors.slate, minWidth: 24, textAlign: 'center' },
    switchTextOn: { color: colors.ink },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    metaText: { ...typography.micro, color: colors.slate, flex: 1 },
    sortButton: { minHeight: 34, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.canvas },
    sortText: { ...typography.micro, color: colors.ink },
    recordingList: { gap: spacing.xs },
    recordingRow: { borderWidth: 1, borderColor: colors.hairlineSoft, borderRadius: rounded.md, backgroundColor: colors.canvas, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64 },
    selectedRow: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
    recordingTextWrap: { flex: 1, minWidth: 0, gap: 2 },
    recordingTitle: { ...typography.bodySmMedium, color: colors.ink },
    recordingMeta: { ...typography.micro, color: colors.slate },
    audioControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 0,
    },
    playPauseButton: {
      minWidth: 92,
      minHeight: 44,
      paddingHorizontal: spacing.md,
    },
    deleteButton: {
      minWidth: 52,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
    },
    emptyText: { ...typography.bodySmMedium, color: colors.slate },
    status: { ...typography.bodySmMedium, color: colors.slate },
    transcriptionBox: { marginTop: spacing.xs, padding: spacing.xs, backgroundColor: colors.surfaceSoft, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineStrong, width: '100%' },
    transcriptionLabel: { ...typography.micro, color: colors.slate, marginBottom: 2 },
    transcriptionInput: { minHeight: 60, fontSize: 14, backgroundColor: colors.canvas },
    transcriptionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs, width: '100%' },
    smallButton: { flex: 1, minWidth: 100, marginBottom: spacing.xs },
    bulkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
    bulkButton: { flex: 1, minWidth: 140 },
    checkbox: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', marginRight: spacing.xs },
    checkboxText: { fontSize: 18, color: colors.primary },
    confirmOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    confirmDialog: { backgroundColor: colors.canvas, padding: spacing.lg, borderRadius: rounded.lg, width: '85%', maxWidth: 340, alignItems: 'center' },
    confirmTitle: { ...typography.bodyMdMedium, color: colors.ink, marginBottom: spacing.sm, textAlign: 'center' },
    confirmText: { ...typography.bodySm, color: colors.slate, textAlign: 'center', marginBottom: spacing.lg },
    confirmButtons: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
    confirmButton: { flex: 1 },
  });
}
