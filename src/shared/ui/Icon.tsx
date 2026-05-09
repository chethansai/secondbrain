import { StyleSheet, Text } from 'react-native';

export type IconName =
  | 'add'
  | 'albums-outline'
  | 'arrow-back'
  | 'arrow-forward'
  | 'checkmark'
  | 'close'
  | 'cloud-done-outline'
  | 'cloud-upload-outline'
  | 'copy-outline'
  | 'create-outline'
  | 'document-text-outline'
  | 'ellipsis-vertical'
  | 'folder-outline'
  | 'git-branch-outline'
  | 'log-out-outline'
  | 'lock-open-outline'
  | 'notifications-outline'
  | 'pin-outline'
  | 'reload-outline'
  | 'search-outline'
  | 'settings-outline'
  | 'sparkles-outline'
  | 'sunny-outline'
  | 'trash-outline'
  | 'chevron-down'
  | 'chevron-forward';

type Props = {
  name: IconName;
  size?: number;
  color: string;
};

const labels: Record<IconName, string> = {
  add: '+',
  'albums-outline': '▤',
  'arrow-back': '<',
  'arrow-forward': '>',
  checkmark: '✓',
  close: 'x',
  'cloud-done-outline': '✓',
  'cloud-upload-outline': '^',
  'copy-outline': '□',
  'create-outline': '✎',
  'document-text-outline': 'N',
  'ellipsis-vertical': '⋮',
  'folder-outline': 'F',
  'git-branch-outline': '↗',
  'log-out-outline': 'L',
  'lock-open-outline': 'U',
  'notifications-outline': 'N',
  'pin-outline': 'P',
  'reload-outline': 'R',
  'search-outline': '?',
  'settings-outline': '*',
  'sparkles-outline': '*',
  'sunny-outline': '☼',
  'trash-outline': '!',
  'chevron-down': 'v',
  'chevron-forward': '>',
};

export function Icon({ name, size = 18, color }: Props) {
  return <Text style={[styles.icon, { color, fontSize: size, lineHeight: size + 2 }]}>{labels[name]}</Text>;
}

const styles = StyleSheet.create({
  icon: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});