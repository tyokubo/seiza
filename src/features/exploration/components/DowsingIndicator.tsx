import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { DowsingSignal } from '@/features/exploration/domain/dowsing';

type DowsingIndicatorProps = {
  diameter: number;
  signal: DowsingSignal;
};

const labelText: Record<DowsingSignal['label'], string> = {
  silent: '反応なし',
  faint: 'かすかな反応',
  near: '近い',
  hot: 'すぐ近く',
};

export function DowsingIndicator({ diameter, signal }: DowsingIndicatorProps) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (signal.label === 'silent') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, signal.label]);
  const radius = diameter / 2 + 10;
  const markerSize = 32;
  const color = signal.label === 'hot' ? '#fff1a6' : '#8bd7ff';

  return (
    <View pointerEvents="none" style={[styles.container, { width: diameter, height: diameter }]}>
      <View style={styles.labelContainer}>
        <ThemedText type="smallBold" style={styles.label}>{labelText[signal.label]}</ThemedText>
      </View>
      {signal.label !== 'silent' && (
        <Animated.View style={[
          styles.marker,
          {
            left: diameter / 2 + Math.cos(signal.angleRadians) * radius - markerSize / 2,
            top: diameter / 2 + Math.sin(signal.angleRadians) * radius - markerSize / 2,
            width: markerSize,
            height: markerSize,
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.62 + signal.closeness * 0.25, 0.72 + signal.closeness * 0.28],
            }),
            transform: [
              { rotate: `${signal.angleRadians}rad` },
              { scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.84 + signal.closeness * 0.12, 0.96 + signal.closeness * 0.4],
              }) },
            ],
          },
        ]}>
          <View style={[styles.arrowShaft, { backgroundColor: color }]} />
          <View style={[styles.arrowHead, { borderLeftColor: color }]} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
  labelContainer: {
    position: 'absolute',
    top: -66,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  label: {
    color: '#f4fbff',
    backgroundColor: 'rgba(4, 12, 28, 0.68)',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 14,
  },
  marker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  arrowShaft: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
