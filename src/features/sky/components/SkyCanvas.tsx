import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { gameConfig } from '@/config/gameConfig';
import { NormalDensityOverlay } from '@/features/exploration/components/NormalDensityOverlay';
import { HorizonCompass } from '@/features/exploration/components/HorizonCompass';
import type { CameraState, ScreenSize } from '@/features/exploration/domain/camera';
import { getApertureDiameter, worldToScreen } from '@/features/exploration/domain/camera';
import type { SkyDensitySignal } from '@/features/exploration/domain/skyDensity';
import { SkyPanoramaView } from '@/features/sky/components/SkyPanoramaView';
import type { Star } from '@/features/sky/domain/types';
import { ConstellationsInSky } from '@/features/constellation/components/ConstellationsInSky';
import type { FinishedConstellation } from '@/features/constellation/domain/artwork';

type SkyCanvasProps = {
  camera: CameraState;
  discoveredStarIds: string[];
  focusingStarId: string | null;
  modeChromeProgress: Animated.Value;
  onLayoutChange: (size: ScreenSize) => void;
  onStarPress: (starId: string) => void;
  registeredStars: Star[];
  size: ScreenSize;
  skyDensitySignal: SkyDensitySignal;
  visibleStars: Star[];
  constellations: FinishedConstellation[];
};

export function SkyCanvas({
  camera,
  discoveredStarIds,
  focusingStarId,
  modeChromeProgress,
  onLayoutChange,
  onStarPress,
  registeredStars,
  size,
  skyDensitySignal,
  visibleStars,
  constellations,
}: SkyCanvasProps) {
  const renderedStars = camera.mode === 'telescope' ? visibleStars : registeredStars;
  const aperture = getApertureLayout(size);
  const tapRadius = camera.mode === 'telescope' ? gameConfig.telescopeStarTapRadius : gameConfig.starTapRadius;
  const focusingStar = visibleStars.find((star) => star.id === focusingStarId);
  const ripplePoint = focusingStar ? worldToScreen(focusingStar.position, camera, size) : null;

  return (
    <View
      style={styles.canvas}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        onLayoutChange({ width, height });
      }}>
      <SkyPanoramaView camera={camera} discoveredStarIds={discoveredStarIds} size={size} stars={renderedStars} />
      <ConstellationsInSky items={constellations} camera={camera} size={size} />
      {camera.mode === 'normal' && <HorizonCompass camera={camera} size={size} />}
      {camera.mode === 'normal' && <NormalDensityOverlay modeChromeProgress={modeChromeProgress} signal={skyDensitySignal} size={size} />}
      {camera.mode === 'telescope' && <TelescopeMask aperture={aperture} size={size} />}
      {camera.mode === 'telescope' && (
        <Animated.View pointerEvents="none" style={[styles.chrome, {
          opacity: modeChromeProgress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.05, 1] }),
        }]}>
          <TelescopeRim aperture={aperture} />
          <TelescopeReticle aperture={aperture} />
        </Animated.View>
      )}
      {camera.mode === 'telescope' && ripplePoint && (
        <View pointerEvents="none" style={{
          position: 'absolute', overflow: 'hidden',
          left: aperture.left, top: aperture.top,
          width: aperture.diameter, height: aperture.diameter,
          borderRadius: aperture.diameter / 2,
        }}>
          <DiscoveryRipple key={focusingStarId} x={ripplePoint.x - aperture.left} y={ripplePoint.y - aperture.top} />
        </View>
      )}
      {camera.mode === 'telescope' ? (
        <View pointerEvents="box-none" style={styles.starTargets}>
          {visibleStars.filter((star) => !discoveredStarIds.includes(star.id)).map((star) => {
            const point = worldToScreen(star.position, camera, size);
            if (!point) return null;
            return (
              <Pressable
                key={star.id}
                accessibilityRole="button"
                accessibilityLabel="星を発見"
                onPress={(event) => {
                  const x = point.x - tapRadius + event.nativeEvent.locationX;
                  const y = point.y - tapRadius + event.nativeEvent.locationY;
                  if (Math.hypot(x - aperture.centerX, y - aperture.centerY) <= aperture.diameter / 2) onStarPress(star.id);
                }}
                style={[styles.starTouchTarget, {
                  left: point.x - tapRadius,
                  top: point.y - tapRadius,
                  width: tapRadius * 2,
                  height: tapRadius * 2,
                }]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function DiscoveryRipple({ x, y }: { x: number; y: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 1, duration: 350, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress]);
  return <Animated.View style={{
    position: 'absolute', left: x - 12, top: y - 12,
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#ffffff',
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2] }) }],
  }} />;
}

type ApertureLayout = {
  diameter: number;
  left: number;
  top: number;
  centerX: number;
  centerY: number;
};

function getApertureLayout(size: ScreenSize): ApertureLayout {
  const diameter = getApertureDiameter(size);
  const centerX = size.width / 2;
  const centerY = size.height / 2;

  return {
    diameter,
    left: centerX - diameter / 2,
    top: centerY - diameter / 2,
    centerX,
    centerY,
  };
}

function TelescopeMask({ aperture, size }: { aperture: ApertureLayout; size: ScreenSize }) {
  const maskWidth = Math.max(size.width, size.height);
  const outerDiameter = aperture.diameter + maskWidth * 2;

  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.telescopeMaskRing,
          {
            left: aperture.left - maskWidth,
            top: aperture.top - maskWidth,
            width: outerDiameter,
            height: outerDiameter,
            borderRadius: outerDiameter / 2,
            borderWidth: maskWidth,
          },
        ]}
      />
    </>
  );
}

function TelescopeRim({ aperture }: { aperture: ApertureLayout }) {
  return <View style={[styles.scope, {
    left: aperture.left,
    top: aperture.top,
    width: aperture.diameter,
    height: aperture.diameter,
    borderRadius: aperture.diameter / 2,
  }]} />;
}

function TelescopeReticle({ aperture }: { aperture: ApertureLayout }) {
  const centerStyle = {
    left: aperture.centerX,
    top: aperture.centerY,
  };

  return (
    <>
      <View style={[styles.reticleLine, styles.reticleTop, centerStyle]} />
      <View style={[styles.reticleLine, styles.reticleRight, centerStyle]} />
      <View style={[styles.reticleLine, styles.reticleBottom, centerStyle]} />
      <View style={[styles.reticleLine, styles.reticleLeft, centerStyle]} />
    </>
  );
}

const styles = StyleSheet.create({
  chrome: {
    ...StyleSheet.absoluteFill,
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#020510',
  },
  starTargets: {
    ...StyleSheet.absoluteFill,
  },
  starTouchTarget: {
    position: 'absolute',
  },
  scope: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(230, 245, 255, 0.56)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  telescopeMaskRing: {
    position: 'absolute',
    borderColor: 'rgba(0, 0, 0, 0.78)',
  },
  reticleLine: {
    position: 'absolute',
    backgroundColor: 'rgba(225, 248, 255, 0.62)',
    borderRadius: 1,
  },
  reticleTop: {
    width: 2,
    height: 30,
    marginLeft: -1,
    marginTop: -52,
  },
  reticleRight: {
    width: 30,
    height: 2,
    marginLeft: 22,
    marginTop: -1,
  },
  reticleBottom: {
    width: 2,
    height: 30,
    marginLeft: -1,
    marginTop: 22,
  },
  reticleLeft: {
    width: 30,
    height: 2,
    marginLeft: -52,
    marginTop: -1,
  },
});
