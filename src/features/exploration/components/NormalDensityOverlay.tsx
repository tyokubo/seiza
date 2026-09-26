import { Animated, StyleSheet, View } from 'react-native';

import { DensityIndicator, getDensityColor } from '@/features/exploration/components/DensityIndicator';
import { getApertureDiameter, type ScreenSize } from '@/features/exploration/domain/camera';
import type { SkyDensitySignal } from '@/features/exploration/domain/skyDensity';
import { getTelescopePreviewScale } from '@/features/exploration/domain/viewDirection';

type Props = { modeChromeProgress: Animated.Value; signal: SkyDensitySignal; size: ScreenSize };

export function NormalDensityOverlay({ modeChromeProgress, signal, size }: Props) {
  const color = getDensityColor(signal.label);

  const aperture = getApertureDiameter(size);
  const radius = aperture / 2;
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const preview = aperture * getTelescopePreviewScale();

  return <Animated.View pointerEvents="none" style={[styles.fill, {
    opacity: modeChromeProgress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.05, 1] }),
  }]}>
    <View style={[styles.circle, {
      left: centerX - radius, top: centerY - radius, width: aperture, height: aperture, borderRadius: radius, borderColor: color,
    }]} />
    <View style={{ position: 'absolute', left: centerX - 35, top: centerY - radius - 44 }}>
      <DensityIndicator signal={signal} />
    </View>
    <View style={[styles.circle, {
      left: centerX - preview / 2, top: centerY - preview / 2, width: preview, height: preview,
      borderRadius: preview / 2, borderColor: 'rgba(245, 250, 255, 0.58)',
    }]} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  circle: { position: 'absolute', borderWidth: 2, backgroundColor: 'transparent' },
});
