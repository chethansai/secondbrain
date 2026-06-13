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
import { CategoryPicker } from '../categories/CategoryPicker';
import { NotesData, CategoryPath, MutationResult } from '../../shared/types/notes';

type SortOrder = 'desc' | 'asc';

type Props = {
  data: NotesData;
  commit: (result: any) => Promise<boolean>;
};

export function VoiceRecorderSettingsSection({ data, commit }: Props) {
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
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saveTargetRecording, setSaveTargetRecording] = useState<{ id: string; text: string } | null>(null);

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
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  }

  async function confirmDeleteRecording() {
    if (!deleteTargetId) return;
    setSaving(true);
    setShowDeleteConfirm(false);
    try {
      const deleted = await deleteVoiceRecording(deleteTargetId);
      await refreshRecordings();
      setStatus(deleted ? 'Recording deleted.' : 'Recording could not be deleted.');
      setTranscriptionTexts(prev => {
        const next = { ...prev };
        delete next[deleteTargetId];
        return next;
      });
      setSelectedRecordings(prev => {
        const next = new Set(prev);
        next.delete(deleteTargetId);
        return next;
      });
      // Stop playback if deleting currently playing recording
      if (currentlyPlayingId === deleteTargetId) {
        await stopVoiceRecordingPlayback();
        setCurrentlyPlayingId(null);
      }
    } finally {
      setSaving(false);
      setDeleteTargetId(null);
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
      // Stop playback if deleting currently playing recording
      if (currentlyPlayingId && selectedRecordings.has(currentlyPlayingId)) {
        await stopVoiceRecordingPlayback();
        setCurrentlyPlayingId(null);
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

  const handleSaveTo = (recording: VoiceRecording) => {
    const textToSave = recording.transcribedText || transcriptionTexts[recording.id] || '';
    if (!textToSave) {
      setStatus('No transcription available to save.');
      return;
    }
    setSaveTargetRecording({ id: recording.id, text: textToSave });
    setShowCategoryPicker(true);
  };

  const handleCategorySelected = async (paths: CategoryPath[]) => {
    if (!saveTargetRecording || paths.length === 0) {
      setShowCategoryPicker(false);
      setSaveTargetRecording(null);
      return;
    }

    setSaving(true);
    setShowCategoryPicker(false);

    try {
      let savedCount = 0;
      for (const path of paths) {
        const result: MutationResult = addNote(data, path, saveTargetRecording.text);
        if (result.ok) {
          const historyText = `Voice transcription saved - ${path.join(' > ')} - ${new Date().toISOString()}`;
          const commitResult = appendHistoryNote(result.data, historyText);
          if (commitResult.ok) {
            const ok = await commit(commitResult);
            if (ok) savedCount++;
          }
        }
      }
      setStatus(`Saved to ${savedCount} categor${savedCount === 1 ? 'y' : 'ies'}.`);
    } catch (e) {
      setStatus('Failed to save to category.');
    } finally {
      setSaving(false);
      setSaveTargetRecording(null);
    }
  };

  const isRecordingPlaying = (recordingId: string): boolean => {
    return currentlyPlayingId === recordingId;
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
          const isThisPlaying = isRecordingPlaying(recording.id);
          return (
            <View key={recording.id} style={[styles.recordingRow, isSelected && styles.selectedRow]}>
              {/* Required layout: [✓] [Play/Pause] [Save To] [Delete] - single horizontal row, fixed widths */}
              <View style={styles.actionContainer}>
                <Pressable
                  style={styles.checkbox}
                  onPress={() => toggleSelection(recording.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={styles.checkboxText}>{isSelected ? '☑' : '☐'}</Text>
                </Pressable>

                <Button
                  label={isThisPlaying ? 'Pause' : 'Play'}
                  icon={isThisPlaying ? 'pause' : 'play'}
                  variant="secondary"
                  onPress={async () => {
                    if (!isThisPlaying) {
                      // Stop any currently playing recording first
                      if (currentlyPlayingId) {
                        await stopVoiceRecordingPlayback();
                      }
                      // Start playback for THIS specific recording
                      const played = await playVoiceRecording(recording.uri, () => {
                        setCurrentlyPlayingId(null);
                        setStatus('Playback finished.');
                      });
                      if (played) {
                        setCurrentlyPlayingId(recording.id);
                        setStatus('Playing recording...');
                      }
                    } else {
                      // Pause THIS recording
                      const paused = await pauseVoiceRecording();
                      if (paused) {
                        setCurrentlyPlayingId(null);
                        setStatus('Playback paused.');
                      }
                    }
                  }}
                  disabled={saving}
                  style={styles.playButton}
                />

                <Button
                  label="Save To"
                  icon="add"
                  variant="primary"
                  onPress={() => handleSaveTo(recording)}
                  disabled={!currentTranscription}
                  style={styles.saveButton}
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

              {/* Transcription text below action row when present */}
              {currentTranscription ? (
                <View style={styles.transcriptionBox}>
                  <Text style={styles.transcriptionLabel}>Transcription:</Text>
                  <TextInputField
                    value={currentTranscription}
                    onChangeText={(newText) => setTranscriptionTexts(prev => ({ ...prev, [recording.id]: newText }))}
                    multiline
                    style={styles.transcriptionInput}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Single recording delete confirmation */}
      {showDeleteConfirm && deleteTargetId && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Delete Recording?</Text>
            <Text style={styles.confirmText}>This action cannot be undone. The audio file and transcription will be permanently deleted.</Text>
            <View style={styles.confirmButtons}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTargetId(null);
                }}
                style={styles.confirmButton}
              />
              <Button
                label="Delete"
                variant="danger"
                onPress={confirmDeleteRecording}
                disabled={saving}
                style={styles.confirmButton}
              />
            </View>
          </View>
        </View>
      )}

      {/* Bulk delete confirmation */}
      {showDeleteConfirm && !deleteTargetId && selectedRecordings.size > 0 && (
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

      {/* Category Picker Modal for Save To */}
      {showCategoryPicker && saveTargetRecording && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Save to Category</Text>
            <Text style={styles.modalSubtitle}>Select a category to save the transcription</Text>
            <CategoryPicker
              data={data}
              selectedPath={null}
              onSelect={(path) => {
                handleCategorySelected([path]);
              }}
              disabled={saving}
            />
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowCategoryPicker(false);
                  setSaveTargetRecording(null);
                }}
                disabled={saving}
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

function createStyles(colors: typeof import('../../shared/design/tokens').colors, screenWidth: number = 400) {
  const isNarrow = screenWidth < 360;
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
    recordingRow: { borderWidth: 1, borderColor: colors.hairlineSoft, borderRadius: rounded.md, backgroundColor: colors.canvas, padding: spacing.sm, flexDirection: 'column', gap: spacing.sm, minHeight: 64 },
    selectedRow: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
    actionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      flexWrap: 'nowrap',
      width: '100%',
    },
    playButton: {
      width: 80,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    saveButton: {
      width: 80,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    deleteButton: {
      width: 80,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    checkbox: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', marginRight: spacing.xs },
    checkboxText: { fontSize: 18, color: colors.primary },
    emptyText: { ...typography.bodySmMedium, color: colors.slate },
    status: { ...typography.bodySmMedium, color: colors.slate },
    transcriptionBox: { padding: spacing.xs, backgroundColor: colors.surfaceSoft, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineStrong, width: '100%' },
    transcriptionLabel: { ...typography.micro, color: colors.slate, marginBottom: 2 },
    transcriptionInput: { minHeight: 60, fontSize: 14, backgroundColor: colors.canvas },
    bulkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
    bulkButton: { flex: 1, minWidth: 140 },
    confirmOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    confirmDialog: { backgroundColor: colors.canvas, padding: spacing.lg, borderRadius: rounded.lg, width: '85%', maxWidth: 340, alignItems: 'center' },
    confirmTitle: { ...typography.bodyMdMedium, color: colors.ink, marginBottom: spacing.sm, textAlign: 'center' },
    confirmText: { ...typography.bodySm, color: colors.slate, textAlign: 'center', marginBottom: spacing.lg },
    confirmButtons: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
    confirmButton: { flex: 1 },
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 20 },
    modalContent: { backgroundColor: colors.canvas, borderRadius: rounded.lg, padding: spacing.lg, width: '90%', maxWidth: 400, maxHeight: '80%' },
    modalTitle: { ...typography.bodyMdMedium, color: colors.ink, marginBottom: spacing.xs },
    modalSubtitle: { ...typography.bodySm, color: colors.slate, marginBottom: spacing.md },
    modalActions: { marginTop: spacing.md },
  });
}