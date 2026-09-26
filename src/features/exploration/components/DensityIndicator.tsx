import { StyleSheet, Text, View } from 'react-native';

import { gameConfig } from '@/config/gameConfig';
import type { SkyDensitySignal } from '@/features/exploration/domain/skyDensity';

type DensityIndicatorProps = {
  signal: SkyDensitySignal;
};

const densityConfig = {
  none: {
    color: gameConfig.densityEffect.colors.none,
    stars: [{ left: 25, top: 8 }],
  },
  few: {
    color: gameConfig.densityEffect.colors.few,
    stars: [{ left: 25, top: 8 }],
  },
  medium: {
    color: gameConfig.densityEffect.colors.medium,
    stars: [
      { left: 14, top: 8 },
      { left: 36, top: 8 },
    ],
  },
  many: {
    color: gameConfig.densityEffect.colors.many,
    stars: [
      { left: 25, top: 0 },
      { left: 14, top: 17 },
      { left: 36, top: 17 },
    ],
  },
} as const;

export function getDensityColor(label: SkyDensitySignal['label']): string {
  return densityConfig[label].color;
}

export function DensityIndicator({ signal }: DensityIndicatorProps) {
  const config = densityConfig[signal.label];

  return (
    <View pointerEvents="none" style={styles.container}>
      {config.stars.map((star, index) => (
        <Text
          key={`${signal.label}-${index}`}
          style={[
            styles.star,
            {
              color: config.color,
              left: star.left,
              top: star.top,
            },
          ]}>
          ★
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 70,
    height: 40,
  },
  star: {
    position: 'absolute',
    width: 20,
    height: 22,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 22,
    includeFontPadding: false,
    textShadowColor: 'rgba(255, 255, 255, 0.28)',
    textShadowRadius: 6,
  },
});
