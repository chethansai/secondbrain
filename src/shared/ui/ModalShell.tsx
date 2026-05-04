import { ReactNode, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../design/ThemeProvider';
import { colors, rounded, spacing, typography, shadows } from '../design/tokens';
import { Icon } from './Icon';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function ModalShell({ visible, title, onClose, children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: typeof import('../design/tokens').colors) {
  return StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7, 15, 36, 0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.canvas,
    borderTopLeftRadius: rounded.lg,
    borderTopRightRadius: rounded.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.mockup,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { ...typography.heading3, color: colors.ink, flex: 1 },
  close: { width: 40, height: 40, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center' },
  });
}