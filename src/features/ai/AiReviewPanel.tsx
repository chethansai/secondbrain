import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { buildActionPrompt, buildScorePrompt, createDecisionFromSuggestion, defaultActionPromptTemplate, defaultScorePromptTemplate, formatAiReviewRequestError, listPendingSeekNotes, requestAiReview } from './aiReviewService';
import { acceptAutoMovedDecision, applyAiReviewDecision, autoMoveAiReviewDecision, rejectAiReviewDecision, undoAiReviewDecision } from './aiReviewMutations';
import { AiReviewDecision, ARCHIVE_CATEGORY, SEEK_CATEGORY } from './aiReviewTypes';
import { useAiReviewSync } from '../sync/useAiReviewSync';
import { HISTORY_CATEGORY } from '../notes/noteMutations';
import { CategoryPath, FlatNote, MutationResult, NotesData } from '../../shared/types/notes';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';

type ReviewMutationData = { data: NotesData; decision: AiReviewDecision };
type AiReviewLogEntry = { id: string; time: string; message: string; tone: 'info' | 'success' | 'error' };
type HistoryFilter = 'all' | 'below_taken' | 'below_not_taken' | 'above_taken' | 'above_not_taken';
type RunQueueItem = FlatNote & { status: 'queued' | 'processing' | 'done' | 'error'; decision?: AiReviewDecision; error?: string };
const aiReviewConfigKey = 'rnnotetaking.aiReview.config.v1';

type Props = {
  data: NotesData;
  commit: (result: MutationResult) => Promise<boolean>;
  onIncludeCategory: (categoryName: string) => Promise<boolean>;
};

export function AiReviewPanel({ data, commit, onIncludeCategory }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { ledger, settings, loading, saving, refreshing, error, localMode, setError, setSettings, upsertDecision, refresh } = useAiReviewSync();
  const [running, setRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [logs, setLogs] = useState<AiReviewLogEntry[]>([]);
  const [runQueue, setRunQueue] = useState<RunQueueItem[]>([]);
  const [delaySeconds, setDelaySeconds] = useState('60');
  const [scorePromptTemplate, setScorePromptTemplate] = useState(defaultScorePromptTemplate);
  const [actionPromptTemplate, setActionPromptTemplate] = useState(defaultActionPromptTemplate);
  const [showConfig, setShowConfig] = useState(false);
  const stopBatchRef = useRef(false);
  const seekNotes = useMemo(() => listPendingSeekNotes(data, ledger), [data, ledger]);
  const historyDecisions = useMemo(() => filterHistoryDecisions(ledger.decisions, historyFilter, settings.threshold), [historyFilter, ledger.decisions, settings.threshold]);

  useEffect(() => {
    let mounted = true;
    readSavedReviewConfig().then((config) => {
      if (!mounted) return;
      setDelaySeconds(config.delaySeconds);
      setScorePromptTemplate(config.scorePromptTemplate);
      setActionPromptTemplate(config.actionPromptTemplate);
    });
    return () => { mounted = false; };
  }, []);

  async function reloadAndReviewSeekNotes() {
    if (running || seekNotes.length === 0) return;
    stopBatchRef.current = false;
    setRunning(true);
    setError(null);
    setShowHistory(false);
    setLogs([]);
    setRunQueue([]);
    const delayMs = normalizedDelaySeconds(delaySeconds) * 1000;
    addLog('info', `Reload started. ${seekNotes.length} SEEK notes queued for AI review. Delay: ${normalizedDelaySeconds(delaySeconds)} seconds.`);
    await refresh();
    const notesToReview = [...seekNotes];
    setRunQueue(notesToReview.map((note) => ({ ...note, status: 'queued' })));
    setBatchProgress({ done: 0, total: notesToReview.length });
    try {
      for (let index = 0; index < notesToReview.length; index += 1) {
        if (stopBatchRef.current) break;
        const currentNote = notesToReview[index];
        updateRunQueueItem(currentNote, { status: 'processing' });
        addLog('info', `Sent ${index + 1}/${notesToReview.length}: ${previewText(currentNote.note)}`);
        const decision = await reviewSeekNote(currentNote, ledger.decisions.length + index);
        updateRunQueueItem(currentNote, { status: 'done', decision });
        addLog('success', `Result ${decision.simpleId}: ${decision.score}/10 -> ${actionLabel(decision)} in ${decision.targetPath.join(' > ')}`);
        addLog('success', `Saved ${decision.simpleId} to AI Review History${localMode ? ' locally' : ' in Firestore'}.`);
        setBatchProgress({ done: index + 1, total: notesToReview.length });
        if (index < notesToReview.length - 1 && !stopBatchRef.current) await delay(delayMs);
      }
      addLog(stopBatchRef.current ? 'info' : 'success', stopBatchRef.current ? 'Reload stopped.' : 'Reload finished. All queued SEEK notes have AI actions.');
    } catch (reviewError) {
      const message = formatAiReviewRequestError(reviewError);
      setError(message);
      addLog('error', message);
      setRunQueue((current) => current.map((item) => item.status === 'processing' ? { ...item, status: 'error', error: message } : item));
    } finally {
      setRunning(false);
      stopBatchRef.current = false;
      setBatchProgress(null);
      setShowHistory(true);
    }
  }

  async function reviewSeekNote(note: ReturnType<typeof listPendingSeekNotes>[number], sequenceOffset: number) {
    const suggestion = await requestAiReview(data, note, { scorePromptTemplate, actionPromptTemplate });
    const decision = createDecisionFromSuggestion(note, suggestion, nextSimpleReviewIdFromOffset(ledger, sequenceOffset));
    if (settings.autoMoveHighConfidence && decision.score > settings.threshold && (decision.actionType === 'move_to_existing' || decision.actionType === 'archive')) {
      const result = autoMoveAiReviewDecision(data, decision);
      await commitReviewResult(result, false);
      return result.ok ? result.data.decision : decision;
    }
    await upsertDecision(decision);
    return decision;
  }

  function addLog(tone: AiReviewLogEntry['tone'], message: string) {
    setLogs((current) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, time: formatLogTime(), message, tone }, ...current].slice(0, 80));
  }

  function updateRunQueueItem(note: FlatNote, patch: Partial<RunQueueItem>) {
    setRunQueue((current) => current.map((item) => item.path.join('\u001f') === note.path.join('\u001f') && item.index === note.index && item.note === note.note ? { ...item, ...patch } : item));
  }

  async function saveDelayConfig() {
    const nextDelay = String(normalizedDelaySeconds(delaySeconds));
    setDelaySeconds(nextDelay);
    await writeSavedReviewConfig({ delaySeconds: nextDelay, scorePromptTemplate, actionPromptTemplate });
    addLog('success', `Saved delay: ${nextDelay} seconds.`);
  }

  async function saveScorePromptConfig() {
    await writeSavedReviewConfig({ delaySeconds: String(normalizedDelaySeconds(delaySeconds)), scorePromptTemplate, actionPromptTemplate });
    addLog('success', 'Saved score prompt template.');
  }

  async function saveActionPromptConfig() {
    await writeSavedReviewConfig({ delaySeconds: String(normalizedDelaySeconds(delaySeconds)), scorePromptTemplate, actionPromptTemplate });
    addLog('success', 'Saved action prompt template.');
  }

  async function saveThresholdConfig(value: string) {
    const threshold = normalizedThreshold(value);
    await setSettings({ ...settings, threshold });
    addLog('success', `Saved auto-action threshold: greater than ${threshold}.`);
  }

  async function resetPromptConfig() {
    setScorePromptTemplate(defaultScorePromptTemplate);
    setActionPromptTemplate(defaultActionPromptTemplate);
    await writeSavedReviewConfig({ delaySeconds: String(normalizedDelaySeconds(delaySeconds)), scorePromptTemplate: defaultScorePromptTemplate, actionPromptTemplate: defaultActionPromptTemplate });
    addLog('success', 'Reset and saved prompt templates.');
  }

  async function acceptDecision(decision: AiReviewDecision) {
    const result = decision.autoMovedAt ? acceptAutoMovedDecision(data, decision) : applyAiReviewDecision(data, decision);
    return commitReviewResult(result, true);
  }

  async function rejectDecision(decision: AiReviewDecision) {
    return commitReviewResult(rejectAiReviewDecision(data, decision), true);
  }

  async function undoDecision(decision: AiReviewDecision) {
    return commitReviewResult(undoAiReviewDecision(data, decision), true);
  }

  async function commitReviewResult(result: MutationResult<ReviewMutationData>, finalDecision: boolean) {
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    const ok = await commit({ ok: true, data: result.data.data });
    if (!ok) return false;
    await includeReviewCategories(result.data.decision);
    await upsertDecision(finalDecision ? result.data.decision : { ...result.data.decision, status: 'pending' });
    return true;
  }

  async function includeReviewCategories(decision: AiReviewDecision) {
    await onIncludeCategory(HISTORY_CATEGORY);
    await onIncludeCategory(decision.targetPath[0]);
    if (decision.actionType === 'archive') await onIncludeCategory(ARCHIVE_CATEGORY);
    await onIncludeCategory(SEEK_CATEGORY);
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.mutedText}>Loading AI review</Text></View>;
  }

  return (
    <View style={styles.wrap}>
      {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setError(null)} style={styles.iconButton}><Icon name="close" size={16} color={colors.semanticError} /></Pressable></View> : null}
      <View style={styles.toolbar}>
        <Button label={running ? 'Processing' : 'Reload'} icon="reload-outline" disabled={running || saving || refreshing || seekNotes.length === 0} onPress={reloadAndReviewSeekNotes} style={styles.toolbarButton} />
        <Button label="Config" icon="settings-outline" variant="secondary" disabled={running} onPress={() => setShowConfig((current) => !current)} style={styles.toolbarButton} />
      </View>
      {showConfig ? <PromptConfigPanel data={data} delaySeconds={delaySeconds} threshold={settings.threshold} scorePromptTemplate={scorePromptTemplate} actionPromptTemplate={actionPromptTemplate} seekNotes={seekNotes} styles={styles} onDelaySecondsChange={setDelaySeconds} onThresholdSave={saveThresholdConfig} onScorePromptChange={setScorePromptTemplate} onActionPromptChange={setActionPromptTemplate} onSaveDelay={saveDelayConfig} onSaveScorePrompt={saveScorePromptConfig} onSaveActionPrompt={saveActionPromptConfig} onResetPrompts={resetPromptConfig} /> : null}
      {batchProgress ? <View style={styles.batchRow}><ActivityIndicator color={colors.primary} /><Text style={styles.mutedText}>Reviewed {batchProgress.done} of {batchProgress.total}. Next request waits {normalizedDelaySeconds(delaySeconds)} seconds.</Text><Button label="Stop" icon="close" variant="secondary" onPress={() => { stopBatchRef.current = true; }} style={styles.stopButton} /></View> : null}
      <View style={styles.statusRow}>
        <StatusPill label={`${seekNotes.length} not processed`} />
        <StatusPill label={`${runQueue.length} queued`} />
        <StatusPill label={`${ledger.decisions.length} history`} />
        <StatusPill label={localMode ? 'Local' : 'Synced'} />
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: settings.autoMoveHighConfidence }} onPress={() => setSettings({ ...settings, autoMoveHighConfidence: !settings.autoMoveHighConfidence })} style={styles.toggleRow}>
        <View style={[styles.toggleTrack, settings.autoMoveHighConfidence && styles.toggleTrackOn]}><View style={[styles.toggleThumb, settings.autoMoveHighConfidence && styles.toggleThumbOn]} /></View>
        <View style={styles.toggleCopy}>
          <Text style={styles.toggleTitle}>Auto-move score {`>`} {settings.threshold}</Text>
          <Text style={styles.mutedText}>High-confidence existing-category matches move first, then wait for accept or undo.</Text>
        </View>
      </Pressable>
      <View style={styles.segmentRow}>
        <Pressable onPress={() => setShowHistory(false)} style={[styles.segment, !showHistory && styles.segmentActive]}><Text style={[styles.segmentText, !showHistory && styles.segmentTextActive]}>Queue</Text></Pressable>
        <Pressable onPress={() => setShowHistory(true)} style={[styles.segment, showHistory && styles.segmentActive]}><Text style={[styles.segmentText, showHistory && styles.segmentTextActive]}>History</Text></Pressable>
      </View>
      {showHistory ? (
        <>
          <HistoryFilterBar activeFilter={historyFilter} styles={styles} onChange={setHistoryFilter} />
          <ReviewTable decisions={historyDecisions} styles={styles} />
          <DecisionList decisions={historyDecisions} history styles={styles} onAccept={acceptDecision} onReject={rejectDecision} onUndo={undoDecision} />
        </>
      ) : runQueue.length ? (
        <>
          <RunQueueTable items={runQueue} styles={styles} />
          <LogSpace logs={logs} styles={styles} />
        </>
      ) : (
        <>
          <LogSpace logs={logs} styles={styles} />
          <EmptyState title={seekNotes.length ? 'Ready to reload' : 'No SEEK notes waiting'} message={seekNotes.length ? 'Press Reload to process every not-processed SEEK note with AI.' : 'All SEEK notes have already been processed, or there are no SEEK notes.'} />
        </>
      )}
    </View>
  );
}

function nextSimpleReviewIdFromOffset(ledger: { decisions: AiReviewDecision[] }, offset: number) {
  const highest = ledger.decisions.reduce((max, decision) => {
    const match = /^R-(\d+)$/.exec(decision.simpleId);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextNumber = highest + offset + 1;
  return `R-${String(nextNumber).padStart(4, '0')}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatLogTime() {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function previewText(text: string) {
  return text.length > 72 ? `${text.slice(0, 72).trim()}...` : text;
}

function actionLabel(decision: AiReviewDecision) {
  if (decision.actionType === 'archive') return 'Archive';
  if (decision.actionType === 'create_action_note') return 'Action note';
  if (decision.actionType === 'create_category') return 'New category';
  return 'Move';
}

function actionTaken(decision: AiReviewDecision) {
  return decision.status === 'accepted' || !!decision.autoMovedAt;
}

function filterHistoryDecisions(decisions: AiReviewDecision[], filter: HistoryFilter, threshold: number) {
  const sorted = [...decisions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (filter === 'below_taken') return sorted.filter((decision) => decision.score <= threshold && actionTaken(decision));
  if (filter === 'below_not_taken') return sorted.filter((decision) => decision.score <= threshold && !actionTaken(decision));
  if (filter === 'above_taken') return sorted.filter((decision) => decision.score > threshold && actionTaken(decision));
  if (filter === 'above_not_taken') return sorted.filter((decision) => decision.score > threshold && !actionTaken(decision));
  return sorted;
}

function normalizedDelaySeconds(value: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(0, Math.min(3600, Math.round(parsed)));
}

function normalizedThreshold(value: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

async function readSavedReviewConfig() {
  const fallback = { delaySeconds: '60', scorePromptTemplate: defaultScorePromptTemplate, actionPromptTemplate: defaultActionPromptTemplate };
  const raw = await AsyncStorage.getItem(aiReviewConfigKey);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      delaySeconds: typeof parsed.delaySeconds === 'string' ? parsed.delaySeconds : fallback.delaySeconds,
      scorePromptTemplate: typeof parsed.scorePromptTemplate === 'string' ? parsed.scorePromptTemplate : fallback.scorePromptTemplate,
      actionPromptTemplate: typeof parsed.actionPromptTemplate === 'string' ? parsed.actionPromptTemplate : fallback.actionPromptTemplate,
    };
  } catch {
    return fallback;
  }
}

async function writeSavedReviewConfig(config: { delaySeconds: string; scorePromptTemplate: string; actionPromptTemplate: string }) {
  await AsyncStorage.setItem(aiReviewConfigKey, JSON.stringify(config));
}

function PromptConfigPanel({ data, delaySeconds, threshold, scorePromptTemplate, actionPromptTemplate, seekNotes, styles, onDelaySecondsChange, onThresholdSave, onScorePromptChange, onActionPromptChange, onSaveDelay, onSaveScorePrompt, onSaveActionPrompt, onResetPrompts }: { data: NotesData; delaySeconds: string; threshold: number; scorePromptTemplate: string; actionPromptTemplate: string; seekNotes: ReturnType<typeof listPendingSeekNotes>; styles: ReturnType<typeof createStyles>; onDelaySecondsChange: (value: string) => void; onThresholdSave: (value: string) => Promise<void>; onScorePromptChange: (value: string) => void; onActionPromptChange: (value: string) => void; onSaveDelay: () => Promise<void>; onSaveScorePrompt: () => Promise<void>; onSaveActionPrompt: () => Promise<void>; onResetPrompts: () => Promise<void> }) {
  const previewNote = seekNotes[0];
  const [thresholdInput, setThresholdInput] = useState(String(threshold));
  const scorePreview = previewNote ? buildScorePrompt(data, previewNote, scorePromptTemplate) : scorePromptTemplate;
  const actionPreview = previewNote ? buildActionPrompt(data, previewNote, 5, actionPromptTemplate) : actionPromptTemplate;
  return (
    <View style={styles.configWrap}>
      <View style={styles.configHeaderRow}>
        <Text style={styles.configTitle}>Configuration</Text>
        <Button label="Reset" icon="reload-outline" variant="secondary" onPress={onResetPrompts} style={styles.stopButton} />
      </View>
      <View style={styles.configField}>
        <Text style={styles.configLabel}>Delay seconds</Text>
        <View style={styles.configSaveRow}>
          <TextInput value={delaySeconds} onChangeText={onDelaySecondsChange} keyboardType="numeric" style={[styles.configInput, styles.configInputGrow]} />
          <Button label="Save" icon="checkmark" variant="secondary" onPress={onSaveDelay} style={styles.saveButton} />
        </View>
      </View>
      <View style={styles.configField}>
        <Text style={styles.configLabel}>Auto-action threshold</Text>
        <View style={styles.configSaveRow}>
          <TextInput value={thresholdInput} onChangeText={setThresholdInput} keyboardType="numeric" style={[styles.configInput, styles.configInputGrow]} />
          <Button label="Save" icon="checkmark" variant="secondary" onPress={() => onThresholdSave(thresholdInput)} style={styles.saveButton} />
        </View>
        <Text style={styles.mutedText}>Auto actions run only when auto-move is on and score is greater than this value.</Text>
      </View>
      <PromptEditor title="Score prompt template" value={scorePromptTemplate} onChange={onScorePromptChange} onSave={onSaveScorePrompt} styles={styles} />
      <PromptEditor title="Action prompt template" value={actionPromptTemplate} onChange={onActionPromptChange} onSave={onSaveActionPrompt} styles={styles} />
      <Text style={styles.configLabel}>Filled score prompt preview</Text>
      <Text style={styles.promptPreview}>{scorePreview}</Text>
      <Text style={styles.configLabel}>Filled action prompt preview</Text>
      <Text style={styles.promptPreview}>{actionPreview}</Text>
    </View>
  );
}

function PromptEditor({ title, value, onChange, onSave, styles }: { title: string; value: string; onChange: (value: string) => void; onSave: () => Promise<void>; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.configField}>
      <View style={styles.configSaveRow}>
        <Text style={[styles.configLabel, styles.configLabelGrow]}>{title}</Text>
        <Button label="Save" icon="checkmark" variant="secondary" onPress={onSave} style={styles.saveButton} />
      </View>
      <TextInput value={value} onChangeText={onChange} multiline textAlignVertical="top" style={styles.promptInput} />
    </View>
  );
}

function ReviewTable({ decisions, styles }: { decisions: AiReviewDecision[]; styles: ReturnType<typeof createStyles> }) {
  if (!decisions.length) return null;
  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderText, styles.tableNoteCell]}>Note</Text>
        <Text style={[styles.tableHeaderText, styles.tablePathCell]}>From</Text>
        <Text style={[styles.tableHeaderText, styles.tablePathCell]}>To</Text>
        <Text style={[styles.tableHeaderText, styles.tableActionCell]}>Action</Text>
        <Text style={[styles.tableHeaderText, styles.tableScoreCell]}>Score</Text>
      </View>
      {decisions.map((decision) => (
        <View key={`table-${decision.simpleId}`} style={styles.tableRow}>
          <Text style={[styles.tableText, styles.tableNoteCell]} numberOfLines={2}>{decision.note}</Text>
          <Text style={[styles.tablePathText, styles.tablePathCell]} numberOfLines={2}>{decision.sourcePath.join(' > ')}</Text>
          <Text style={[styles.tablePathText, styles.tablePathCell, styles.tableToText]} numberOfLines={2}>{decision.targetPath.join(' > ')}</Text>
          <Text style={[styles.tableText, styles.tableActionCell]} numberOfLines={2}>{actionLabel(decision)}</Text>
          <Text style={[styles.tableScoreText, styles.tableScoreCell]}>{decision.score}/10</Text>
        </View>
      ))}
    </View>
  );
}

function RunQueueTable({ items, styles }: { items: RunQueueItem[]; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderText, styles.tableNoteCell]}>Note</Text>
        <Text style={[styles.tableHeaderText, styles.tablePathCell]}>From</Text>
        <Text style={[styles.tableHeaderText, styles.tableActionCell]}>Status</Text>
        <Text style={[styles.tableHeaderText, styles.tableScoreCell]}>Score</Text>
      </View>
      {items.map((item, index) => (
        <View key={`${item.path.join('/')}-${item.index}-${index}`} style={styles.tableRow}>
          <Text style={[styles.tableText, styles.tableNoteCell]} numberOfLines={2}>{item.note}</Text>
          <Text style={[styles.tablePathText, styles.tablePathCell]} numberOfLines={2}>{item.path.join(' > ')}</Text>
          <Text style={[styles.tableText, styles.tableActionCell]} numberOfLines={2}>{runQueueStatusLabel(item)}</Text>
          <Text style={[styles.tableScoreText, styles.tableScoreCell]}>{item.decision ? `${item.decision.score}/10` : '-'}</Text>
        </View>
      ))}
    </View>
  );
}

function runQueueStatusLabel(item: RunQueueItem) {
  if (item.status === 'done' && item.decision) return `${actionLabel(item.decision)} -> ${item.decision.targetPath.join(' > ')}`;
  if (item.status === 'error') return item.error ?? 'Error';
  if (item.status === 'processing') return 'Processing';
  return 'Queued';
}

function HistoryFilterBar({ activeFilter, styles, onChange }: { activeFilter: HistoryFilter; styles: ReturnType<typeof createStyles>; onChange: (filter: HistoryFilter) => void }) {
  const options: Array<{ value: HistoryFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'below_taken', label: 'Below action taken' },
    { value: 'below_not_taken', label: 'Below action not taken' },
    { value: 'above_taken', label: 'Above action taken' },
    { value: 'above_not_taken', label: 'Above action not taken' },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {options.map((option) => (
        <Pressable key={option.value} accessibilityRole="button" onPress={() => onChange(option.value)} style={[styles.filterButton, activeFilter === option.value && styles.filterButtonActive]}>
          <Text style={[styles.filterButtonText, activeFilter === option.value && styles.filterButtonTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function LogSpace({ logs, styles }: { logs: AiReviewLogEntry[]; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.logWrap}>
      <Text style={styles.logTitle}>Processing log</Text>
      {logs.length ? logs.map((log) => (
        <View key={log.id} style={styles.logRow}>
          <Text style={styles.logTime}>{log.time}</Text>
          <Text style={[styles.logText, log.tone === 'error' && styles.logError, log.tone === 'success' && styles.logSuccess]}>{log.message}</Text>
        </View>
      )) : <Text style={styles.emptyText}>Reload activity will appear here.</Text>}
    </View>
  );
}

function DecisionList({ decisions, history, styles, onAccept, onReject, onUndo }: { decisions: AiReviewDecision[]; history?: boolean; styles: ReturnType<typeof createStyles>; onAccept: (decision: AiReviewDecision) => Promise<boolean>; onReject: (decision: AiReviewDecision) => Promise<boolean>; onUndo: (decision: AiReviewDecision) => Promise<boolean> }) {
  if (!decisions.length) return <Text style={styles.emptyText}>{history ? 'No decision history yet.' : 'No pending decisions.'}</Text>;
  return (
    <ScrollView nestedScrollEnabled contentContainerStyle={styles.decisionList}>
      {decisions.map((decision) => (
        <View key={decision.simpleId} style={styles.decisionCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardId}>{decision.simpleId}</Text>
            <Text style={styles.score}>{decision.score}/10</Text>
          </View>
          <Text style={styles.noteText}>{decision.note}</Text>
          <CategoryRoute sourcePath={decision.sourcePath} targetPath={decision.targetPath} styles={styles} />
          {decision.suggestedActionNote ? <Text style={styles.actionNote}>{decision.suggestedActionNote}</Text> : null}
          {decision.suggestedNewCategoryPath ? <Text style={styles.metaText}>New category: {decision.suggestedNewCategoryPath.join(' > ')}</Text> : null}
          {decision.reason ? <Text style={styles.reason}>{decision.reason}</Text> : null}
          <View style={styles.actionRow}>
            {decision.status === 'pending' ? <Button label={decision.actionType === 'create_action_note' || decision.actionType === 'create_category' ? 'Approve' : 'Accept'} icon="checkmark" onPress={() => onAccept(decision)} style={styles.actionButton} /> : null}
            {decision.status === 'pending' && decision.autoMovedAt ? <Button label="Undo" icon="arrow-back" variant="secondary" onPress={() => onUndo(decision)} style={styles.actionButton} /> : null}
            {decision.status === 'pending' && !decision.autoMovedAt ? <Button label="Reject" icon="close" variant="secondary" onPress={() => onReject(decision)} style={styles.actionButton} /> : null}
            {decision.status !== 'pending' && decision.undo ? <Button label="Undo" icon="arrow-back" variant="secondary" onPress={() => onUndo(decision)} style={styles.actionButton} /> : null}
            {decision.status !== 'pending' ? <Text style={styles.statusText}>{decision.status.toUpperCase()}</Text> : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function CategoryRoute({ sourcePath, targetPath, styles }: { sourcePath: CategoryPath; targetPath: CategoryPath; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.routeWrap}>
      <View style={styles.routeColumn}>
        <Text style={styles.routeLabel}>From</Text>
        <Text style={styles.routeValue} numberOfLines={2}>{sourcePath.join(' > ')}</Text>
      </View>
      <View style={styles.routeArrowWrap}><Icon name="arrow-forward" size={16} color={styles.routeArrow.color} /></View>
      <View style={styles.routeColumn}>
        <Text style={styles.routeLabel}>To</Text>
        <Text style={[styles.routeValue, styles.routeValueStrong]} numberOfLines={2}>{targetPath.join(' > ')}</Text>
      </View>
    </View>
  );
}

function StatusPill({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.statusPill}><Text style={styles.statusPillText}>{label}</Text></View>;
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    wrap: { gap: spacing.md },
    loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
    toolbarButton: { flex: 1, minWidth: 90, maxWidth: '100%' },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
    batchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, padding: spacing.sm, backgroundColor: colors.surfaceSoft },
    stopButton: { flex: 1, minWidth: 80 },
    configWrap: { borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceSoft },
    configHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    configTitle: { ...typography.captionBold, color: colors.ink },
    configField: { gap: spacing.xs },
    configSaveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    configLabel: { ...typography.micro, color: colors.primary },
    configLabelGrow: { flex: 1 },
    configInput: { borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, color: colors.ink, backgroundColor: colors.canvas, ...typography.bodySm },
    configInputGrow: { flex: 1 },
    saveButton: { flex: 1, minWidth: 90 }, 
    promptInput: { minHeight: 132, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.sm, padding: spacing.sm, color: colors.ink, backgroundColor: colors.canvas, ...typography.bodySm },
    promptPreview: { maxHeight: 180, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.sm, padding: spacing.sm, color: colors.slate, backgroundColor: colors.canvas, ...typography.micro },
    tableWrap: { borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, overflow: 'hidden' },
    tableHeaderRow: { flexDirection: 'row', backgroundColor: colors.surfaceSoft, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.hairlineSoft, minHeight: 54 },
    tableHeaderText: { ...typography.micro, color: colors.primary, padding: spacing.sm },
    tableText: { ...typography.bodySm, color: colors.charcoal, padding: spacing.sm },
    tablePathText: { ...typography.micro, color: colors.slate, padding: spacing.sm },
    tableToText: { color: colors.primary, fontWeight: '600' },
    tableScoreText: { ...typography.captionBold, color: colors.semanticSuccess, padding: spacing.sm },
    tableNoteCell: { flex: 1.4 },
    tablePathCell: { flex: 0.95 },
    tableActionCell: { flex: 0.8 },
    tableScoreCell: { width: 72, textAlign: 'right' },
    filterRow: { gap: spacing.xs, paddingRight: spacing.sm },
    filterButton: { minHeight: 34, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, justifyContent: 'center', backgroundColor: colors.canvas },
    filterButtonActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    filterButtonText: { ...typography.micro, color: colors.slate },
    filterButtonTextActive: { color: colors.onPrimary },
    logWrap: { borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, backgroundColor: colors.surfaceSoft, padding: spacing.md, gap: spacing.xs, maxHeight: 220 },
    logTitle: { ...typography.captionBold, color: colors.ink },
    logRow: { flexDirection: 'row', gap: spacing.sm },
    logTime: { ...typography.micro, color: colors.steel, width: 58 },
    logText: { ...typography.micro, color: colors.slate, flex: 1 },
    logError: { color: colors.semanticError },
    logSuccess: { color: colors.semanticSuccess },
    statusPill: { borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, borderRadius: rounded.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
    statusPillText: { ...typography.micro, color: colors.slate },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, padding: spacing.md, backgroundColor: colors.surfaceSoft },
    toggleTrack: { width: 44, height: 24, borderRadius: rounded.full, backgroundColor: colors.hairlineStrong, padding: 3 },
    toggleTrackOn: { backgroundColor: colors.primary },
    toggleThumb: { width: 18, height: 18, borderRadius: rounded.full, backgroundColor: colors.canvas },
    toggleThumbOn: { marginLeft: 20 },
    toggleCopy: { flex: 1, gap: spacing.xxs },
    toggleTitle: { ...typography.bodySmMedium, color: colors.ink },
    mutedText: { ...typography.bodySm, color: colors.slate },
    segmentRow: { flexDirection: 'row', borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, overflow: 'hidden' },
    segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.canvas },
    segmentActive: { backgroundColor: colors.ink },
    segmentText: { ...typography.bodySmMedium, color: colors.slate },
    segmentTextActive: { color: colors.onPrimary },
    decisionList: { gap: spacing.sm },
    decisionCard: { borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.md, backgroundColor: colors.canvas, padding: spacing.md, gap: spacing.sm },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    cardId: { ...typography.captionBold, color: colors.primary },
    score: { ...typography.captionBold, color: colors.semanticSuccess },
    noteText: { ...typography.bodySmMedium, color: colors.ink },
    metaText: { ...typography.micro, color: colors.slate },
    routeWrap: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, borderWidth: 1, borderColor: colors.hairline, borderRadius: rounded.sm, padding: spacing.sm, backgroundColor: colors.surfaceSoft },
    routeColumn: { flex: 1, gap: spacing.xxs },
    routeLabel: { ...typography.micro, color: colors.steel },
    routeValue: { ...typography.bodySmMedium, color: colors.charcoal },
    routeValueStrong: { color: colors.primary },
    routeArrowWrap: { width: 24, alignItems: 'center', justifyContent: 'center' },
    routeArrow: { color: colors.stone },
    actionNote: { ...typography.bodySm, color: colors.charcoal, backgroundColor: colors.cardTintYellow, borderRadius: rounded.sm, padding: spacing.sm },
    reason: { ...typography.bodySm, color: colors.charcoal },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
    actionButton: { flex: 1, minWidth: 90 },
    statusText: { ...typography.captionBold, color: colors.slate, marginLeft: 'auto' },
    emptyText: { ...typography.bodySm, color: colors.slate, textAlign: 'center', padding: spacing.lg },
    errorBanner: { backgroundColor: colors.cardTintRose, borderRadius: rounded.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    errorText: { ...typography.bodySmMedium, color: colors.semanticError, flex: 1 },
    iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  });
}
