import { useRef, useState, type ReactNode } from 'react';
import { GestureResponderEvent, Platform, View, type DimensionValue } from 'react-native';

type Props = {
  index: number;
  styles: {
    cardSlot: object;
    cardSlotLeft: object;
    cardSlotRight: object;
    cardSlotZoomed: object;
  };
  children: (zoom: number) => ReactNode;
};

const minCategoryZoom = 1;
const maxCategoryZoom = 2.4;

export function ZoomableCategorySlot({ index, styles, children }: Props) {
  const [zoom, setZoom] = useState(minCategoryZoom);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const zoomed = zoom > minCategoryZoom + 0.02;
  const width: DimensionValue = zoomed ? `${Math.min(100, 50 * zoom)}%` : '50%';
  const webWheelProps = Platform.OS === 'web' ? {
    onWheel: (event: { ctrlKey?: boolean; metaKey?: boolean; deltaY: number; preventDefault?: () => void }) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault?.();
      const direction = event.deltaY < 0 ? 1 : -1;
      setZoom((current) => snapCategoryZoom(clampCategoryZoom(current + direction * 0.14)));
    },
  } : null;

  function hasPinch(event: GestureResponderEvent) {
    return (event.nativeEvent.touches?.length ?? 0) >= 2;
  }

  function startPinch(event: GestureResponderEvent) {
    const distance = touchDistance(event);
    if (distance > 0) pinch.current = { distance, zoom };
  }

  function movePinch(event: GestureResponderEvent) {
    if (!pinch.current) startPinch(event);
    if (!pinch.current) return;
    const distance = touchDistance(event);
    if (distance <= 0) return;
    setZoom(snapCategoryZoom(clampCategoryZoom(pinch.current.zoom * (distance / pinch.current.distance))));
  }

  function endPinch() {
    pinch.current = null;
    setZoom((current) => snapCategoryZoom(current));
  }

  return (
    <View
      {...(webWheelProps as object)}
      onStartShouldSetResponderCapture={hasPinch}
      onMoveShouldSetResponderCapture={hasPinch}
      onResponderGrant={startPinch}
      onResponderMove={movePinch}
      onResponderRelease={endPinch}
      onResponderTerminate={endPinch}
      style={[
        styles.cardSlot,
        index % 2 === 0 ? styles.cardSlotLeft : styles.cardSlotRight,
        zoomed && styles.cardSlotZoomed,
        { width },
      ]}
    >
      {children(zoom)}
    </View>
  );
}

function touchDistance(event: GestureResponderEvent) {
  const touches = event.nativeEvent.touches;
  if (!touches || touches.length < 2) return 0;
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function clampCategoryZoom(zoom: number) {
  return Math.min(maxCategoryZoom, Math.max(minCategoryZoom, zoom));
}

function snapCategoryZoom(zoom: number) {
  return zoom < minCategoryZoom + 0.04 ? minCategoryZoom : zoom;
}
