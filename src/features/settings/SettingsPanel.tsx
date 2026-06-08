import { useEffect, useMemo, useState } from 'react';
import { AppState, GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { TextInputField } from '../../shared/ui/TextInputField';
import { NotesData, NoteItem } from '../../shared/types/notes';
import { authTimeoutOptions, formatAuthTimeout } from '../auth/authSession';
import { cloneItems, isCategoryNode } from '../categories/categoryTree';
import { validateNotesData } from '../sync/validation';
import { VoiceRecorderSettingsSection } from '../voiceRecorder/VoiceRecorderSettingsSection';
import { copyText } from './clipboard';
import { overlayActionLabels, overlayTapActions, isFloatingOverlayAvailable, readFloatingOverlaySettings, requestFloatingOverlayPermission, resetFloatingOverlayPlacement, startFloatingOverlay, stopFloatingOverlay, updateFloatingOverlaySettings } from './floatingOverlay';

type Props = {
  data: NotesData;
  authTimeoutHours: number;
  onAuthTimeoutChange: (hours: number) => Promise<void> | void;
  onImport: (data: NotesData) => Promise<boolean> | boolean;
};

export function SettingsPanel({ data, authTimeoutHours, onAuthTimeoutChange, onImport }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.86);
  const [overlaySize, setOverlaySize] = useState(58);
  const [overlayTapAction, setOverlayTapAction] = useState<keyof typeof overlayActionLabels>('openTextInput');
  const [overlayTapMenuOpen, setOverlayTapMenuOpen] = useState(false);
  const [overlaySaving, setOverlaySaving] = useState(false);
  const overlayAvailable = isFloatingOverlayAvailable();

  useEffect(() => {
    refreshOverlayPermission();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshOverlayPermission();
    });
    return () => subscription.remove();
  }, []);

  async function exportJson() {
    const copied = await copyText(JSON.stringify(data, null, 2));
    setStatus(copied ? 'Export copied.' : 'Copy is available in the web browser.');
  }

  async function importJson() {
    try {
      const parsed = JSON.parse(importText);
      const validation = parseImportNotesData(parsed);
      if (!validation.ok) {
        setStatus(validation.message);
        return;
      }
      const ok = await onImport(normalizeDuplicateCategoryNames(validation.data));
      setStatus(ok ? 'Import saved.' : 'Import failed.');
    } catch {
      setStatus('Import JSON could not be parsed.');
    }
  }

  async function refreshOverlayPermission() {
    if (!isFloatingOverlayAvailable()) {
      setOverlayPermissionGranted(false);
      return;
    }
    const settings = await readFloatingOverlaySettings().catch(() => null);
    setOverlayPermissionGranted(Boolean(settings?.permissionGranted));
    if (settings) {
      setOverlayOpacity(settings.opacity);
      setOverlaySize(settings.size);
      setOverlayTapAction(settings.tapAction);
    }
  }

  async function enableFloatingIcon() {
    if (!overlayAvailable) {
      setStatus('Floating icon is available only in the Android APK.');
      return;
    }
    setOverlaySaving(true);
    try {
      const settings = await readFloatingOverlaySettings();
      if (!settings.permissionGranted) {
        const granted = await requestFloatingOverlayPermission();
        setOverlayPermissionGranted(granted);
        if (!granted) {
          setStatus('Allow display over other apps, then return and start the floating icon.');
          return;
        }
      }
      await startFloatingOverlay();
      setOverlayPermissionGranted(true);
      setStatus('Floating icon started.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Floating icon could not start.');
    } finally {
      setOverlaySaving(false);
    }
  }

  async function stopFloatingIcon() {
    setOverlaySaving(true);
    try {
      await stopFloatingOverlay();
      setStatus('Floating icon stopped.');
    } catch {
      setStatus('Floating icon could not stop.');
    } finally {
      setOverlaySaving(false);
    }
  }

  async function resetFloatingIcon() {
    setOverlaySaving(true);
    try {
      await resetFloatingOverlayPlacement();
      setStatus('Floating icon position reset.');
    } catch {
      setStatus('Floating icon position could not be reset.');
    } finally {
      setOverlaySaving(false);
    }
  }

  async function changeOverlayOpacity(value: number) {
    const opacity = Math.max(0.25, Math.min(1, value));
    setOverlayOpacity(opacity);
    await updateFloatingOverlaySettings({ opacity }).catch(() => undefined);
  }

  async function changeOverlaySize(value: number) {
    const size = Math.round(Math.max(42, Math.min(86, value)));
    setOverlaySize(size);
    await updateFloatingOverlaySettings({ size }).catch(() => undefined);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.settingGroup}>
        <Text style={styles.settingLabel}>Ask for password after</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose password timeout" onPress={() => setAuthMenuOpen((current) => !current)} style={styles.dropdownButton}>
          <Text style={styles.dropdownValue}>{formatAuthTimeout(authTimeoutHours)}</Text>
          <Icon name="chevron-down" size={16} color={colors.ink} />
        </Pressable>
        {authMenuOpen ? (
          <View style={styles.dropdownMenu}>
            {authTimeoutOptions.map((hours) => (
              <Pressable
                key={hours}
                accessibilityRole="button"
                accessibilityLabel={`Set password timeout to ${formatAuthTimeout(hours)}`}
                onPress={async () => {
                  await onAuthTimeoutChange(hours);
                  setAuthMenuOpen(false);
                  setStatus(hours === 0 ? 'Password will not be asked again automatically.' : `Password will be asked again after ${formatAuthTimeout(hours)}.`);
                }}
                style={[styles.dropdownOption, hours === authTimeoutHours && styles.dropdownOptionSelected]}
              >
                <Text style={[styles.dropdownOptionText, hours === authTimeoutHours && styles.dropdownOptionTextSelected]}>{formatAuthTimeout(hours)}</Text>
                {hours === authTimeoutHours ? <Icon name="checkmark" size={16} color={colors.onPrimary} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.settingGroup}>
        <Text style={styles.settingLabel}>Floating icon</Text>
        <View style={styles.overlayPanel}>
          <View style={styles.overlayStatusRow}>
            <Icon name="pin-outline" size={16} color={colors.primary} />
            <Text style={styles.overlayStatusText}>{overlayAvailable ? overlayPermissionGranted ? 'Permission granted' : 'Permission needed' : 'Android APK only'}</Text>
          </View>
          <LineControl label="Transparency" value={overlayOpacity} min={0.25} max={1} formatter={(value) => `${Math.round(value * 100)}%`} disabled={!overlayAvailable} colors={colors} styles={styles} onChange={changeOverlayOpacity} />
          <LineControl label="Size" value={overlaySize} min={42} max={86} formatter={(value) => `${Math.round(value)}px`} disabled={!overlayAvailable} colors={colors} styles={styles} onChange={changeOverlaySize} />
          <Text style={styles.settingLabel}>Tap action</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose floating icon tap action"
            onPress={() => overlayAvailable && setOverlayTapMenuOpen((current) => !current)}
            disabled={!overlayAvailable}
            style={[styles.dropdownButton, !overlayAvailable && styles.dropdownButtonDisabled]}
          >
            <Text style={styles.dropdownValue}>{overlayActionLabels[overlayTapAction]}</Text>
            <Icon name="chevron-down" size={16} color={colors.ink} />
          </Pressable>
          {overlayTapMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {overlayTapActions.map((action) => (
                <Pressable
                  key={action}
                  accessibilityRole="button"
                  accessibilityLabel={`Set floating icon tap action to ${overlayActionLabels[action]}`}
                  onPress={async () => {
                    setOverlayTapAction(action);
                    setOverlayTapMenuOpen(false);
                    await updateFloatingOverlaySettings({ tapAction: action }).catch(() => undefined);
                  }}
                  style={[styles.dropdownOption, action === overlayTapAction && styles.dropdownOptionSelected]}
                >
                  <Text style={[styles.dropdownOptionText, action === overlayTapAction && styles.dropdownOptionTextSelected]}>{overlayActionLabels[action]}</Text>
                  {action === overlayTapAction ? <Icon name="checkmark" size={16} color={colors.onPrimary} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.buttonRow}>
            <Button label={overlayPermissionGranted ? 'Start floating icon' : 'Allow permission'} icon="pin-outline" onPress={enableFloatingIcon} disabled={overlaySaving || !overlayAvailable} style={styles.rowButton} />
            <Button label="Stop" icon="close" variant="secondary" onPress={stopFloatingIcon} disabled={overlaySaving || !overlayAvailable} style={styles.rowButton} />
          </View>
          <Button label="Reset floating icon position" icon="reload-outline" variant="secondary" onPress={resetFloatingIcon} disabled={overlaySaving || !overlayAvailable} />
        </View>
      </View>
      <View style={styles.settingGroup}>
        <VoiceRecorderSettingsSection />
      </View>
      <Button label="Copy export JSON" icon="copy-outline" onPress={exportJson} />
      <TextInputField value={importText} onChangeText={setImportText} multiline placeholder="Paste simple nested JSON" accessibilityLabel="Import JSON" autoCapitalize="none" autoCorrect={false} />
      <Button label="Import JSON" icon="cloud-upload-outline" variant="dark" onPress={importJson} disabled={!importText.trim()} />
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

function parseImportNotesData(value: unknown) {
  const direct = validateNotesData(value);
  if (direct.ok) return direct;

  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) {
    const wrapped = validateNotesData((value as { data?: unknown }).data);
    if (wrapped.ok) return wrapped;
  }

  return direct;
}

function normalizeDuplicateCategoryNames(data: NotesData): NotesData {
  const latestItemsByName = new Map<string, NoteItem[]>();

  Object.entries(data).forEach(([name, items]) => collectLatestCategoryItems(name, items, latestItemsByName));

  const normalized: NotesData = {};
  Object.entries(data).forEach(([name]) => {
    normalized[name] = cloneItems(latestItemsByName.get(name) ?? []);
  });

  Object.entries(normalized).forEach(([name, items]) => {
    normalized[name] = replaceDuplicateCategoryItems(items, latestItemsByName, new Set([name]));
  });

  return normalized;
}

function collectLatestCategoryItems(name: string, items: NoteItem[], latestItemsByName: Map<string, NoteItem[]>) {
  latestItemsByName.set(name, cloneItems(items));
  items.forEach((item) => {
    if (!isCategoryNode(item)) return;
    const [childName, childItems] = Object.entries(item)[0];
    collectLatestCategoryItems(childName, childItems, latestItemsByName);
  });
}

function replaceDuplicateCategoryItems(items: NoteItem[], latestItemsByName: Map<string, NoteItem[]>, parents: Set<string>): NoteItem[] {
  return items.map((item) => {
    if (!isCategoryNode(item)) return item;

    const [name, childItems] = Object.entries(item)[0];
    const sourceItems = latestItemsByName.get(name) ?? childItems;
    if (parents.has(name)) return { [name]: cloneItems(sourceItems) };

    const nextParents = new Set(parents);
    nextParents.add(name);
    return { [name]: replaceDuplicateCategoryItems(cloneItems(sourceItems), latestItemsByName, nextParents) };
  });
}

function LineControl({ label, value, min, max, formatter, disabled, colors, styles, onChange }: { label: string; value: number; min: number; max: number; formatter: (value: number) => string; disabled?: boolean; colors: typeof import('../../shared/design/tokens').colors; styles: ReturnType<typeof createStyles>; onChange: (value: number) => void | Promise<void> }) {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const [trackWidth, setTrackWidth] = useState(1);

  function updateFromEvent(event: GestureResponderEvent) {
    if (disabled) return;
    const locationX = event.nativeEvent.locationX;
    const nextRatio = Math.max(0, Math.min(1, locationX / trackWidth));
    onChange(min + (max - min) * nextRatio);
  }

  return (
    <View style={styles.lineControl}>
      <View style={styles.lineControlHeader}>
        <Text style={styles.lineControlLabel}>{label}</Text>
        <Text style={styles.lineControlValue}>{formatter(value)}</Text>
      </View>
      <Pressable accessibilityRole="adjustable" accessibilityLabel={`${label} ${formatter(value)}`} disabled={disabled} onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))} onPress={updateFromEvent} onResponderMove={updateFromEvent} onStartShouldSetResponder={() => !disabled} style={[styles.sliderTrack, disabled && styles.sliderTrackDisabled]}>
        <View style={[styles.sliderFill, { width: `${ratio * 100}%`, backgroundColor: disabled ? colors.hairlineStrong : colors.primary }]} />
        <View style={[styles.sliderThumb, { left: `${ratio * 100}%`, backgroundColor: disabled ? colors.stone : colors.primary }]} />
      </Pressable>
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  wrap: { gap: spacing.md },
  settingGroup: { gap: spacing.xs },
  settingLabel: { ...typography.bodySmMedium, color: colors.charcoal },
  overlayPanel: { gap: spacing.sm, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.surfaceSoft, padding: spacing.md },
  overlayStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  overlayStatusText: { ...typography.bodySmMedium, color: colors.ink, flex: 1 },
  lineControl: { gap: spacing.xs },
  lineControlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  lineControlLabel: { ...typography.micro, color: colors.slate },
  lineControlValue: { ...typography.micro, color: colors.ink },
  sliderTrack: { height: 32, borderRadius: rounded.full, backgroundColor: colors.hairline, justifyContent: 'center', overflow: 'visible' },
  sliderTrackDisabled: { opacity: 0.55 },
  sliderFill: { position: 'absolute', left: 0, height: 4, borderRadius: rounded.full },
  sliderThumb: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 2, borderColor: colors.canvas },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowButton: { flex: 1, minWidth: 130 },
  dropdownButton: { minHeight: 44, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.canvas, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dropdownButtonDisabled: { opacity: 0.55 },
  dropdownValue: { ...typography.body, color: colors.ink, flex: 1 },
  dropdownMenu: { borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: rounded.md, backgroundColor: colors.canvas, overflow: 'hidden' },
  dropdownOption: { minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.hairlineSoft },
  dropdownOptionSelected: { backgroundColor: colors.primary },
  dropdownOptionText: { ...typography.bodySmMedium, color: colors.ink },
  dropdownOptionTextSelected: { color: colors.onPrimary },
  status: { ...typography.bodySmMedium, color: colors.slate },
  });
}
