import { Pressable, StyleProp, Text, TextStyle, ViewStyle } from 'react-native';
import { colors as designColors } from '../../shared/design/tokens';
import { Icon, IconName } from '../../shared/ui/Icon';

type Props = {
  label: string;
  icon: IconName;
  danger?: boolean;
  colors: typeof designColors;
  styles: {
    categoryActionItem: StyleProp<ViewStyle>;
    categoryActionItemDanger: StyleProp<ViewStyle>;
    categoryActionItemPressed: StyleProp<ViewStyle>;
    categoryActionText: StyleProp<TextStyle>;
    categoryActionTextDanger: StyleProp<TextStyle>;
  };
  onPress: () => void;
};

export function WorkspaceCategoryActionItem({ label, icon, danger, colors, styles, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.categoryActionItem, danger && styles.categoryActionItemDanger, pressed && styles.categoryActionItemPressed]}>
      <Icon name={icon} size={12} color={danger ? colors.semanticError : colors.steel} />
      <Text style={[styles.categoryActionText, danger && styles.categoryActionTextDanger]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
