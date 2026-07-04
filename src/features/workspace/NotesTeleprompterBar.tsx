import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { formatPath } from '../categories/categoryTree';
import { HISTORY_CATEGORY } from '../notes/noteMutations';
import { useTheme } from '../../shared/design/ThemeProvider';
import { rounded, spacing, typography } from '../../shared/design/tokens';
import { FlatNote } from '../../shared/types/notes';

type Props = {
  notes: FlatNote[];
};

const MIN_SCROLL_DURATION_MS = 18000;
const PIXELS_PER_SECOND = 34;

export function NotesTeleprompterBar({ notes }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const promptText = useMemo(() => formatTeleprompterNotes(notes), [notes]);
  const animationRef = useRef<any>(null);

  const containerWidthRef = useRef(containerWidth);
  const contentWidthRef = useRef(contentWidth);
  const promptTextRef = useRef(promptText);

  useEffect(() => {
    containerWidthRef.current = containerWidth;
    contentWidthRef.current = contentWidth;
    promptTextRef.current = promptText;
  }, [containerWidth, contentWidth, promptText]);

  // Restart animation when app becomes active again (after background or close)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        const cw = containerWidthRef.current;
        const contW = contentWidthRef.current;
        if (cw > 0 && contW > 0) {
          translateX.stopAnimation();
          translateX.setValue(cw);
          const distance = cw + contW;
          const duration = Math.max(MIN_SCROLL_DURATION_MS, Math.round((distance / PIXELS_PER_SECOND) * 1000));
          const newAnimation = Animated.loop(
            Animated.sequence([
              Animated.timing(translateX, {
                toValue: -contW,
                duration,
                easing: Easing.linear,
                useNativeDriver: true,
                isInteraction: false,
              }),
              Animated.timing(translateX, {
                toValue: cw,
                duration: 0,
                easing: Easing.linear,
                useNativeDriver: true,
                isInteraction: false,
              }),
            ]),
          );
          newAnimation.start();
          animationRef.current = newAnimation;
        }
      }
    });

    return () => subscription.remove();
  }, [translateX]);

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(containerWidth);

    if (!containerWidth || !contentWidth) {
      animationRef.current = null;
      return undefined;
    }

    const distance = containerWidth + contentWidth;
    const duration = Math.max(MIN_SCROLL_DURATION_MS, Math.round((distance / PIXELS_PER_SECOND) * 1000));
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: -contentWidth,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(translateX, {
          toValue: containerWidth,
          duration: 0,
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    animationRef.current = animation;
    return () => {
      animation.stop();
      animationRef.current = null;
    };
  }, [containerWidth, contentWidth, promptText, translateX]);

  return (
    <View style={styles.bar} onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
      <View style={styles.viewport} accessibilityRole="text" accessibilityLabel="Scrolling notes teleprompter">
        <Animated.Text
          numberOfLines={1}
          onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
          style={[styles.promptText, { transform: [{ translateX }] }]}
        >
          {promptText}
        </Animated.Text>
      </View>
    </View>
  );
}

function formatTeleprompterNotes(notes: FlatNote[]) {
  const snippets = notes
    .filter((note) => note.path[0] !== HISTORY_CATEGORY)
    .map((note) => `${formatPath(note.path)}: ${note.note.replace(/\s+/g, ' ').trim()}`)
    .filter(Boolean);

  return snippets.length ? snippets.join('   |   ') : 'No notes yet';
}

function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.brandNavy,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    viewport: {
      height: 26,
      justifyContent: 'center',
      overflow: 'hidden',
      borderRadius: rounded.sm,
      marginHorizontal: Platform.OS === 'android' ? 100 : 0,
    },
    promptText: {
      ...typography.bodySmMedium,
      color: colors.onDark,
      minWidth: 1,
      position: 'absolute',
    },
  });
}