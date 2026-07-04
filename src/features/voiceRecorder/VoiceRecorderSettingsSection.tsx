import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  isForegroundRecordingActive,
  loadVoiceRecorderSettings,
  loadVoiceRecordings,
  saveVoiceRecorderSettings,
  startVoiceRecordingBackground,
  stopVoiceRecordingBackground,
  startForegroundRecording,
  stopForegroundRecording,
  getForegroundRecordingElapsedMs,
  deleteVoiceRecording,
  playVoiceRecording,
  pauseVoiceRecording,
  stopVoiceRecordingPlayback,
  transcribeVoiceRecording,
  saveTranscription,
  saveDetectedLanguage,
  addVoiceRecording,
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

// ─── Language code → display name map (common Whisper-returned codes) ─────────
const LANGUAGE_DISPLAY: Record<string, string> = {
  en: 'English', hi: 'Hindi', ar: 'Arabic', es: 'Spanish', fr: 'French',
  de: 'German', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ru: 'Russian', it: 'Italian', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
  kn: 'Kannada', mr: 'Marathi', bn: 'Bengali', ur: 'Urdu', pa: 'Punjabi',
  tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', nl: 'Dutch',
  pl: 'Polish', sv: 'Swedish', no: 'Norwegian', fi: 'Finnish', da: 'Danish',
  cs: 'Czech', ro: 'Romanian', hu: 'Hungarian', uk: 'Ukrainian', fa: 'Persian',
};

function displayLanguage(code: string | null | undefined): string {
  if (!code) return '';
  return LANGUAGE_DISPLAY[code] ?? code.toUpperCase();
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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

  // Foreground recording state
  const [isRecordingNow, setIsRecordingNow] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Collected segment URIs during a JS foreground session
  const sessionSegmentUris = useRef<string[]>([]);

  useEffect(() => {
    refreshVoiceRecorder();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshRecordings();
    });
    return () => {
      subscription.remove();
      stopElapsedTimer();
    };
  }, []);

  // Auto-transcribe newly appeared untranscribed recordings
  const handleTranscribe = useCallback(
    async (id: string, uri: string, extraSegmentUris?: string[]) => {
      setTranscribingId(id);
      setStatus('Transcribing… Whisper is detecting language automatically');
      let detectedLang: string | null = null;
      try {
        const result = await transcribeVoiceRecording(uri, extraSegmentUris, (partial, idx, total) => {
          if (total > 1) {
            setStatus(`Transcribing segment ${idx + 1} of ${total}…`);
          }
          setTranscriptionTexts((prev) => ({ ...prev, [id]: partial }));
        });

        if (result && result.text) {
          detectedLang = result.detectedLanguage;
          await saveTranscription(id, result.text);
          if (detectedLang) await saveDetectedLanguage(id, detectedLang);
          setTranscriptionTexts((prev) => ({ ...prev, [id]: result.text }));

          const langLabel = detectedLang ? ` (${displayLanguage(detectedLang)})` : '';
          setStatus(`Transcription complete${langLabel}. Adding to VOICENOTES…`);

          const mutResult = addNote(data, ['VOICENOTES'], result.text);
          const historyText = `Voice transcription${langLabel} — ${new Date().toISOString()}`;
          const commitResult = await commit(
            appendHistoryNote(mutResult.ok ? mutResult.data : data, historyText),
          );
          if (commitResult && mutResult.ok) {
            setStatus(`Saved to VOICENOTES${langLabel}.`);
          }
        } else {
          setStatus('Transcription returned no text. Try speaking more clearly.');
        }
      } catch (e) {
        setStatus('Transcription error — check your network connection.');
        console.error(e);
      } finally {
        setTranscribingId(null);
        await refreshRecordings();
      }
    },
    [data, commit],
  );

  useEffect(() => {
    const untranscribed = recordings.filter(
      (r) => !r.transcribedText && !transcriptionTexts[r.id],
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

  // ─── Elapsed timer ──────────────────────────────────────────────────────────

  function startElapsedTimer() {
    stopElapsedTimer();
    setElapsedMs(0);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(getForegroundRecordingElapsedMs());
    }, 500);
  }

  function stopElapsedTimer() {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setElapsedMs(0);
  }

  // ─── Data loading ───────────────────────────────────────────────────────────

  async function refreshVoiceRecorder() {
    const stored = await loadVoiceRecorderSettings();
    setSettings(stored);
    setDurationText(String(stored.durationSeconds));
    await refreshRecordings();
    // Sync isRecordingNow with actual state (e.g. after hot-reload)
    setIsRecordingNow(isForegroundRecordingActive());
  }

  async function refreshRecordings() {
    const latest = await loadVoiceRecordings().catch(() => []);
    setRecordings(latest);
    setSelectedRecordings(new Set());
  }

  // ─── Foreground recorder controls ──────────────────────────────────────────

  async function handleStartRecording() {
    if (isRecordingNow) return;
    const durationSeconds = clampDurationSeconds(Number(durationText));
    const nextSettings: VoiceRecorderSettings = { enabled: true, durationSeconds };
    setSaving(true);
    setStatus(null);
    try {
      await saveVoiceRecorderSettings(nextSettings);
      setSettings(nextSettings);

      const started = await startForegroundRecording(nextSettings);
      if (started) {
        setIsRecordingNow(true);
        sessionSegmentUris.current = [];
        startElapsedTimer();
        setStatus('Recording… Speak in any language. Whisper will detect it automatically.');
      } else {
        setStatus('Microphone permission is required or recording could not start.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Recording could not start.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStopRecording() {
    if (!isRecordingNow) return;
    setSaving(true);
    stopElapsedTimer();
    setIsRecordingNow(false);
    setStatus('Stopping recording…');
    try {
      const result = await stopForegroundRecording();
      if (!result || result.uris.length === 0) {
        setStatus('No audio was captured.');
        return;
      }

      // The first URI is the canonical recording URI; rest are extra segments
      const [primaryUri, ...extraUris] = result.uris;
      const newRec = await addVoiceRecording({
        uri: primaryUri,
        durationMs: result.durationMs,
        fileName: primaryUri.split('/').pop(),
      });

      sessionSegmentUris.current = extraUris;

      await refreshRecordings();
      setStatus('Recording saved. Transcribing…');

      // Immediately kick off transcription with all segments
      handleTranscribe(newRec.id, primaryUri, extraUris).catch(console.error);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Failed to stop recording.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Settings save (toggle + duration) ─────────────────────────────────────

  async function saveRecorderSettings() {
    const durationSeconds = clampDurationSeconds(Number(durationText));
    const nextSettings = { ...settings, durationSeconds };
    setSaving(true);
    setStatus(null);
    try {
      await saveVoiceRecorderSettings(nextSettings);

      // For native module path, use legacy background recorder start/stop
      if (isNativeVoiceRecorderAvailable()) {
        const ok = nextSettings.enabled
          ? await startVoiceRecordingBackground(nextSettings)
          : await stopVoiceRecordingBackground();
        setSettings(nextSettings);
        setDurationText(String(durationSeconds));
        await refreshRecordings();
        setStatus(
          ok
            ? nextSettings.enabled ? 'Native recorder is on.' : 'Native recorder is off.'
            : 'Microphone permission required.',
        );
      } else {
        setSettings(nextSettings);
        setDurationText(String(durationSeconds));
        setStatus('Duration saved. Use the Record/Stop button to capture audio.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Recording management ───────────────────────────────────────────────────

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
      setTranscriptionTexts((prev) => {
        const next = { ...prev };
        delete next[deleteTargetId];
        return next;
      });
      setSelectedRecordings((prev) => {
        const next = new Set(prev);
        next.delete(deleteTargetId);
        return next;
      });
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
        setTranscriptionTexts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
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
    setSelectedRecordings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedRecordings.size === sortedRecordings.length) {
      setSelectedRecordings(new Set());
    } else {
      setSelectedRecordings(new Set(sortedRecordings.map((r) => r.id)));
    }
  };

  // ─── Save to category ───────────────────────────────────────────────────────

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
          const historyText = `Voice transcription saved — ${path.join(' > ')} — ${new Date().toISOString()}`;
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

  const isRecordingPlaying = (recordingId: string): boolean => currentlyPlayingId === recordingId;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.panel}>
      {/* Header row: title + ON/OFF toggle */}
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Icon name="mic-outline" size={16} color={isRecordingNow ? '#e03131' : colors.primary} />
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
          <Text style={[styles.switchText, settings.enabled && styles.switchTextOn]}>
            {settings.enabled ? 'On' : 'Off'}
          </Text>
        </Pressable>
      </View>

      {/* Duration input */}
      <TextInputField
        label="Max recording duration (seconds)"
        value={durationText}
        onChangeText={setDurationText}
        keyboardType="number-pad"
        accessibilityLabel="Voice recording duration in seconds"
      />

      {/* Save settings button */}
      <Button label="Save duration" icon="checkmark" onPress={saveRecorderSettings} disabled={saving || isRecordingNow} />

      {/* ── Live foreground recorder controls ─────────────────────────── */}
      {!isNativeVoiceRecorderAvailable() && (
        <View style={styles.recorderControls}>
          {isRecordingNow ? (
            <View style={styles.recordingActiveRow}>
              {/* Pulsing red dot */}
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTimer}>{formatElapsed(elapsedMs)}</Text>
              <Text style={styles.recordingHint}>Recording… any language</Text>
              <Button
                label="Stop & Transcribe"
                icon="stop"
                variant="danger"
                onPress={handleStopRecording}
                disabled={saving}
                style={styles.stopButton}
              />
            </View>
          ) : (
            <Button
              label="Start Recording"
              icon="mic"
              variant="primary"
              onPress={handleStartRecording}
              disabled={saving}
            />
          )}
        </View>
      )}

      {/* Language support hint */}
      <Text style={styles.langHint}>
        🌐 Supports 99+ languages — Whisper detects language automatically
      </Text>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {isNativeVoiceRecorderAvailable() ? 'Android foreground recorder' : 'JS foreground recorder'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle recording date sort"
          onPress={() => setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
          style={styles.sortButton}
        >
          <Icon name={sortOrder === 'desc' ? 'chevron-down' : 'chevron-up'} size={14} color={colors.ink} />
          <Text style={styles.sortText}>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</Text>
        </Pressable>
      </View>

      {/* Bulk actions */}
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

      {/* Recordings list */}
      <View style={styles.recordingList}>
        {sortedRecordings.length === 0 ? (
          <Text style={styles.emptyText}>No recordings yet. Tap "Start Recording" to begin.</Text>
        ) : (
          sortedRecordings.map((recording) => {
            const currentTranscription = recording.transcribedText || transcriptionTexts[recording.id] || '';
            const isSelected = selectedRecordings.has(recording.id);
            const isThisPlaying = isRecordingPlaying(recording.id);
            const isThisTranscribing = transcribingId === recording.id;
            const lang = recording.detectedLanguage;

            return (
              <View key={recording.id} style={[styles.recordingRow, isSelected && styles.selectedRow]}>
                {/* Meta line */}
                <Text style={styles.recordingMeta}>{formatRecordingMeta(recording)}</Text>

                {/* Detected language badge */}
                {lang && (
                  <View style={styles.langBadge}>
                    <Text style={styles.langBadgeText}>🌐 {displayLanguage(lang)}</Text>
                  </View>
                )}

                {/* Transcribing indicator */}
                {isThisTranscribing && (
                  <Text style={styles.transcribingLabel}>Transcribing… please wait</Text>
                )}

                {/* Action row: [✓] [Play/Pause] [Save To] [Delete] */}
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
                        if (currentlyPlayingId) await stopVoiceRecordingPlayback();
                        const played = await playVoiceRecording(recording.uri, () => {
                          setCurrentlyPlayingId(null);
                          setStatus('Playback finished.');
                        });
                        if (played) {
                          setCurrentlyPlayingId(recording.id);
                          setStatus('Playing recording…');
                        }
                      } else {
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

                {/* Transcription text */}
                {currentTranscription ? (
                  <View style={styles.transcriptionBox}>
                    <Text style={styles.transcriptionLabel}>Transcript:</Text>
                    <TextInputField
                      value={currentTranscription}
                      onChangeText={(newText) =>
                        setTranscriptionTexts((prev) => ({ ...prev, [recording.id]: newText }))
                      }
                      multiline
                      style={styles.transcriptionInput}
                    />
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {/* Single recording delete confirmation */}
      {showDeleteConfirm && deleteTargetId && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Delete Recording?</Text>
            <Text style={styles.confirmText}>
              This action cannot be undone. The audio file and transcription will be permanently deleted.
            </Text>
            <View style={styles.confirmButtons}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
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
            <Text style={styles.confirmText}>
              This action cannot be undone. All selected audio files will be permanently deleted.
            </Text>
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

      {/* Category Picker Modal */}
      {showCategoryPicker && saveTargetRecording && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Save to Category</Text>
            <Text style={styles.modalSubtitle}>Select a category to save the transcription</Text>
            <CategoryPicker
              data={data}
              selectedPath={null}
              onSelect={(path) => { handleCategorySelected([path]); }}
              disabled={saving}
            />
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => { setShowCategoryPicker(false); setSaveTargetRecording(null); }}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    panel: {
      position: 'relative', gap: spacing.sm, borderWidth: 1,
      borderColor: colors.hairlineStrong, borderRadius: rounded.md,
      backgroundColor: colors.surfaceSoft, padding: spacing.md,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
    title: { ...typography.bodySmMedium, color: colors.ink },
    switchTrack: {
      minWidth: 82, minHeight: 36, borderRadius: rounded.full, borderWidth: 1,
      borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, padding: 4,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs,
    },
    switchTrackOn: { borderColor: colors.primary, backgroundColor: colors.cardTintLavender },
    switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.stone },
    switchThumbOn: { backgroundColor: colors.primary },
    switchText: { ...typography.micro, color: colors.slate, minWidth: 24, textAlign: 'center' },
    switchTextOn: { color: colors.ink },

    // Foreground recorder controls
    recorderControls: { gap: spacing.xs },
    recordingActiveRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: '#fff0f0', borderRadius: rounded.md, padding: spacing.sm,
      borderWidth: 1, borderColor: '#ffc0c0', flexWrap: 'wrap',
    },
    recordingDot: {
      width: 12, height: 12, borderRadius: 6, backgroundColor: '#e03131',
    },
    recordingTimer: { ...typography.bodySmMedium, color: '#e03131', fontVariant: ['tabular-nums'], minWidth: 52 },
    recordingHint: { ...typography.micro, color: '#7a2222', flex: 1 },
    stopButton: { minWidth: 140 },

    langHint: { ...typography.micro, color: colors.slate, textAlign: 'center', paddingVertical: 2 },

    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    metaText: { ...typography.micro, color: colors.slate, flex: 1 },
    sortButton: {
      minHeight: 34, borderWidth: 1, borderColor: colors.hairlineStrong,
      borderRadius: rounded.md, paddingHorizontal: spacing.sm,
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.canvas,
    },
    sortText: { ...typography.micro, color: colors.ink },

    recordingList: { gap: spacing.xs },
    recordingRow: {
      borderWidth: 1, borderColor: colors.hairlineSoft, borderRadius: rounded.md,
      backgroundColor: colors.canvas, padding: spacing.sm, flexDirection: 'column', gap: spacing.sm,
    },
    selectedRow: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
    recordingMeta: { ...typography.micro, color: colors.slate },

    langBadge: {
      alignSelf: 'flex-start', backgroundColor: colors.cardTintLavender,
      borderRadius: rounded.sm, paddingHorizontal: spacing.xs, paddingVertical: 2,
    },
    langBadgeText: { ...typography.micro, color: colors.ink },
    transcribingLabel: { ...typography.micro, color: colors.semanticWarning, fontStyle: 'italic' },

    actionContainer: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: spacing.xs, flexWrap: 'nowrap', width: '100%',
    },
    playButton: { width: 80, height: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    saveButton: { width: 80, height: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    deleteButton: { width: 80, height: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    checkbox: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', marginRight: spacing.xs },
    checkboxText: { fontSize: 18, color: colors.primary },

    emptyText: { ...typography.bodySmMedium, color: colors.slate },
    status: { ...typography.bodySmMedium, color: colors.slate },

    transcriptionBox: {
      padding: spacing.xs, backgroundColor: colors.surfaceSoft, borderRadius: rounded.sm,
      borderWidth: 1, borderColor: colors.hairlineStrong, width: '100%',
    },
    transcriptionLabel: { ...typography.micro, color: colors.slate, marginBottom: 2 },
    transcriptionInput: { minHeight: 60, fontSize: 14, backgroundColor: colors.canvas },

    bulkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
    bulkButton: { flex: 1, minWidth: 140 },

    confirmOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 10,
    },
    confirmDialog: {
      backgroundColor: colors.canvas, padding: spacing.lg, borderRadius: rounded.lg,
      width: '85%', maxWidth: 340, alignItems: 'center',
    },
    confirmTitle: { ...typography.bodyMdMedium, color: colors.ink, marginBottom: spacing.sm, textAlign: 'center' },
    confirmText: { ...typography.bodySm, color: colors.slate, textAlign: 'center', marginBottom: spacing.lg },
    confirmButtons: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
    confirmButton: { flex: 1 },

    modalOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 20,
    },
    modalContent: {
      backgroundColor: colors.canvas, borderRadius: rounded.lg, padding: spacing.lg,
      width: '90%', maxWidth: 400, maxHeight: '80%',
    },
    modalTitle: { ...typography.bodyMdMedium, color: colors.ink, marginBottom: spacing.xs },
    modalSubtitle: { ...typography.bodySm, color: colors.slate, marginBottom: spacing.md },
    modalActions: { marginTop: spacing.md },
  });
}