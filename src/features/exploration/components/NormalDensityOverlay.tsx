import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import { gameConfig } from '@/config/gameConfig';
import { DensityIndicator, getDensityColor } from '@/features/exploration/components/DensityIndicator';
import { getApertureDiameter, type ScreenSize } from '@/features/exploration/domain/camera';
import type { SkyDensitySignal } from '@/features/exploration/domain/skyDensity';
import { getTelescopePreviewScale } from '@/features/exploration/domain/viewDirection';

type Props = { modeChromeProgress: Animated.Value; signal: SkyDensitySignal; size: ScreenSize };

export function NormalDensityOverlay({ modeChromeProgress, signal, size }: Props) {
  const config = gameConfig.densityEffect;
  const targetOpacity = signal.label === 'none' ? 0 : config.glowOpacity[signal.label];
  const [opacity] = useState(() => new Animated.Value(targetOpacity));
  const [lastColor, setLastColor] = useState(getDensityColor(signal.label));
  const color = getDensityColor(signal.label);
  const glowColor = signal.label === 'none' ? lastColor : color;
  if (signal.label !== 'none' && lastColor !== color) setLastColor(color);
  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: targetOpacity, duration: config.transitionMs, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [config.transitionMs, opacity, targetOpacity]);

  const aperture = getApertureDiameter(size);
  const radius = aperture / 2;
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const clearRadius = radius + config.clearPadding;
  const maskRadius = clearRadius + config.featherWidth;
  const preview = aperture * getTelescopePreviewScale();
  const edgeWidth = size.width * config.edgeSpanFraction;
  const edgeHeight = size.height * config.edgeSpanFraction;

  return <Animated.View pointerEvents="none" style={[styles.fill, {
    opacity: modeChromeProgress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.05, 1] }),
  }]}>
    <Animated.View pointerEvents="none" style={[styles.fill, { opacity }]} testID="density-edge-effect">
      <Svg width={size.width} height={size.height} pointerEvents="none">
        <Defs>
          <LinearGradient id="edge-x" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0" stopColor={glowColor} /><Stop offset="1" stopColor={glowColor} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="edge-y" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={glowColor} /><Stop offset="1" stopColor={glowColor} stopOpacity="0" />
          </LinearGradient>
          <RadialGradient id="clear-circle">
            <Stop offset="0" stopColor="black" />
            <Stop offset={clearRadius / maskRadius} stopColor="black" />
            <Stop offset="1" stopColor="white" />
          </RadialGradient>
          <Mask id="outside-circle" maskUnits="userSpaceOnUse" x={0} y={0} width={size.width} height={size.height}>
            <Rect width={size.width} height={size.height} fill="white" />
            <Circle cx={centerX} cy={centerY} r={maskRadius} fill="url(#clear-circle)" />
          </Mask>
        </Defs>
        <Rect width={edgeWidth} height={size.height} fill="url(#edge-x)" mask="url(#outside-circle)" />
        <Rect width={edgeWidth} height={size.height} fill="url(#edge-x)" transform={`translate(${size.width}, ${size.height}) rotate(180)`} mask="url(#outside-circle)" />
        <Rect width={size.width} height={edgeHeight} fill="url(#edge-y)" mask="url(#outside-circle)" />
        <Rect width={size.width} height={edgeHeight} fill="url(#edge-y)" transform={`translate(${size.width}, ${size.height}) rotate(180)`} mask="url(#outside-circle)" />
      </Svg>
    </Animated.View>
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
