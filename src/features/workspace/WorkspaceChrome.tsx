import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { formatPath } from '../categories/categoryTree';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath } from '../../shared/types/notes';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';

type WorkspaceHeaderProps = {
  title: string;
  path: CategoryPath;
  workspaceName: string;
  onBack: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenAiChat: () => void;
  onOpenAssistant: () => void;
  onOpenAiNotifications: () => void;
  onOpenAi: () => void;
  onOpenAiWorkspace: () => void;
  onOpenOcr?: () => void;
};

type PanelHeaderProps = {
  title: string;
  onBack: () => void;
};

type ActionGridProps = {
  discloseLabel?: 'Disclose' | 'Enclose';
  onDisclose?: () => void;
  onAddNote: () => void;
  onSubcategory: () => void;
  onCopy: () => void;
  onRename: () => void;
  onDelete: () => void;
  onScanText?: () => void;
};

type ErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};

export function WorkspaceHeader({ title, path, workspaceName, onBack, onOpenSearch, onOpenSettings, onOpenAiChat, onOpenAssistant, onOpenAiNotifications, onOpenAi, onOpenAiWorkspace }: WorkspaceHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      {path.length ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
          <Icon name="arrow-back" size={20} color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.eyebrow}>{path.length ? `${workspaceName} / ${formatPath(path)}` : workspaceName}</Text>
        <Text style={styles.heading}>{title}</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open AI Chat" onPress={onOpenAiChat} style={styles.headerIconButton}>
          <Icon name="sparkles-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Assistant" onPress={onOpenAssistant} style={styles.headerIconButton}>
          <Icon name="document-text-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open AI Review" onPress={onOpenAi} style={styles.headerIconButton}>
          <Icon name="sparkles-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open AI workspace" onPress={onOpenAiWorkspace} style={styles.headerIconButton}>
          <Icon name="albums-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open search" onPress={onOpenSearch} style={styles.headerIconButton}>
          <Icon name="search-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open AI notifications" onPress={onOpenAiNotifications} style={styles.headerIconButton}>
          <Icon name="notifications-outline" size={17} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={onOpenSettings} style={styles.headerIconButton}>
          <Icon name="settings-outline" size={17} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

export function PanelHeader({ title, onBack }: PanelHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to workspace" onPress={onBack} style={styles.backButton}>
        <Icon name="arrow-back" size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.eyebrow}>Workspace</Text>
        <Text style={styles.heading}>{title}</Text>
      </View>
    </View>
  );
}

export function ActionGrid({ discloseLabel, onDisclose, onAddNote, onSubcategory, onCopy, onRename, onDelete, onScanText }: ActionGridProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.actionGrid}>
      <Button label="Note" icon="add" onPress={onAddNote} style={styles.gridButton} />
      <Button label="Folder" icon="folder-outline" variant="secondary" onPress={onSubcategory} style={styles.gridButton} />
      {discloseLabel && onDisclose ? <Button label={discloseLabel} icon={discloseLabel === 'Enclose' ? 'chevron-up' : 'chevron-down'} variant="secondary" onPress={onDisclose} style={styles.gridButton} /> : null}
      {onScanText && <Button label="Scan Text" icon="camera" variant="secondary" onPress={onScanText} style={styles.gridButton} accessibilityLabel="OCR / Scan Text" />}
      <Button label="Copy" icon="copy-outline" variant="secondary" onPress={onCopy} style={styles.gridButton} />
      <Button label="Rename" icon="create-outline" variant="secondary" onPress={onRename} style={styles.gridButton} />
      <Button label="Delete" icon="trash-outline" variant="danger" onPress={onDelete} style={styles.gridButton} />
    </View>
  );
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onDismiss} style={styles.dismiss}><Icon name="close" size={18} color={colors.semanticError} /></Pressable>
    </View>
  );
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    backButton: { width: 40, height: 40, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    headerText: { flex: 1 },
    headerActions: { flexDirection: 'row', gap: spacing.xs },
    headerIconButton: { width: 38, height: 38, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
    eyebrow: { ...typography.captionBold, color: colors.primary },
    heading: { ...typography.heading2, color: colors.ink },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    gridButton: { flexGrow: 1, minWidth: 132 },
    errorBanner: { backgroundColor: colors.cardTintRose, borderRadius: rounded.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    errorText: { ...typography.bodySmMedium, color: colors.semanticError, flex: 1 },
    dismiss: { width: 32, height: 32, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center' },
  });
}
