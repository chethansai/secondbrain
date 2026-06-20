import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors as tokenColors, spacing, typography } from '../../shared/design/tokens';
import { Button } from '../../shared/ui/Button';
import { ModalShell } from '../../shared/ui/ModalShell';
import { requestFloatingOverlayPermission } from './floatingOverlay';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPermissionGranted: () => void;
};

export function TeleprompterPermissionModal({ visible, onClose, onPermissionGranted }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  async function openSettings() {
    const granted = await requestFloatingOverlayPermission();
    if (granted) {
      onPermissionGranted();
      onClose();
    }
    // If not granted, user was taken to settings - they'll return and can retry
  }

  return (
    <ModalShell visible={visible} title="Overlay Permission Required" onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.message}>
          The teleprompter needs "Display over other apps" permission to show the scrolling ticker above other apps.
        </Text>
        <Text style={styles.subMessage}>
          This allows the ticker to appear on your screen even when the app is minimized or you're using other apps.
        </Text>
        <View style={styles.actions}>
          <Button label="Cancel" icon="close" variant="secondary" onPress={onClose} style={styles.action} />
          <Button
            label="Open Settings"
            icon="settings-outline"
            variant="primary"
            onPress={openSettings}
            style={styles.action}
          />
        </View>
        <Text style={styles.hint}>
          After granting permission in Android Settings, return here and tap Start Teleprompter again.
        </Text>
      </View>
    </ModalShell>
  );
}

function createStyles(colors: typeof tokenColors) {
  return StyleSheet.create({
    content: {
      gap: spacing.md,
    },
    message: {
      ...typography.bodyMd,
      color: colors.charcoal,
      lineHeight: 22,
    },
    subMessage: {
      ...typography.bodySm,
      color: colors.slate,
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    action: {
      flex: 1,
    },
    hint: {
      ...typography.caption,
      color: colors.muted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
  });
}
