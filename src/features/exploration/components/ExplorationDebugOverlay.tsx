import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { gameConfig } from '@/config/gameConfig';
import type { CameraState, ScreenSize } from '@/features/exploration/domain/camera';
import { cameraForward, projectDirectionToScreen } from '@/features/exploration/domain/camera';
import { getVerticalFovRadians } from '@/features/exploration/domain/viewDirection';
import { rotateVector } from '@/features/exploration/domain/orientation';
import type {
  DeviceMotionDebugSample,
  SwipeDebugSample,
} from '@/features/exploration/hooks/useExploration';
import type { Point2D, Vector3 } from '@/features/sky/domain/types';
import { mountainWorldToPanorama, worldDirectionToPanoramaUv } from '@/features/sky/domain/panorama';

export type MountainDebugMark = {
  tappedAt: Point2D;
  direction: Vector3;
};

type ExplorationDebugOverlayProps = {
  camera: CameraState;
  deviceMotionDebug: DeviceMotionDebugSample | null;
  gyroStatus: 'starting' | 'active' | 'unavailable' | 'denied';
  isMarkingMountain: boolean;
  lastGyroStepDegrees: number;
  lastSwipe: SwipeDebugSample;
  onClose: () => void;
  onToggleMountainMark: () => void;
  selectedMountainMark: MountainDebugMark | null;
  size: ScreenSize;
};

export function ExplorationDebugOverlay({
  camera,
  deviceMotionDebug,
  gyroStatus,
  isMarkingMountain,
  lastGyroStepDegrees,
  lastSwipe,
  onClose,
  onToggleMountainMark,
  selectedMountainMark,
  size,
}: ExplorationDebugOverlayProps) {
  const forward = cameraForward(camera);
  const centerUv = worldDirectionToPanoramaUv(forward);
  const mountainUv = worldDirectionToPanoramaUv(forward, mountainWorldToPanorama, gameConfig.panorama.mountainLongitudeOffsetTurns);
  const selectedDirection = selectedMountainMark?.direction ?? null;
  const selectedUv = selectedDirection ? worldDirectionToPanoramaUv(selectedDirection) : null;
  const selectedMountainUv = selectedDirection
    ? worldDirectionToPanoramaUv(selectedDirection, mountainWorldToPanorama, gameConfig.panorama.mountainLongitudeOffsetTurns)
    : null;
  const sensorLabel =
    gyroStatus === 'active'
      ? 'active'
      : gyroStatus === 'starting'
        ? 'starting'
        : gyroStatus === 'denied'
          ? 'permission denied'
          : 'unavailable';
  const projectedMountainMark = selectedDirection
    ? projectDirectionToScreen(selectedDirection, camera, size)
    : null;
  const markIsVisible =
    projectedMountainMark !== null &&
    projectedMountainMark.x >= 0 &&
    projectedMountainMark.x <= size.width &&
    projectedMountainMark.y >= 0 &&
    projectedMountainMark.y <= size.height;

  if (isMarkingMountain) {
    return (
      <View pointerEvents="box-none" style={styles.layer}>
        <View style={styles.markingBar}>
          <Text style={styles.markingText}>山と空の境目をタップして記録</Text>
          <Pressable accessibilityRole="button" onPress={onToggleMountainMark} style={styles.cancelButton}>
            <Text style={styles.buttonText}>キャンセル</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View style={styles.header}>
          <Text style={styles.title}>VIEW DEBUG</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.buttonText}>閉じる</Text>
          </Pressable>
        </View>

        <Text style={styles.line}>forward  {formatVector(forward)}</Text>
        <Text style={styles.line}>camera q {formatQuaternion(camera.orientation)}</Text>
        <Text style={styles.line}>
          heading {formatDegrees((Math.atan2(forward.x, -forward.z) * 180) / Math.PI)}°  elevation{' '}
          {formatDegrees((Math.asin(clamp(forward.y, -1, 1)) * 180) / Math.PI)}°
        </Text>
        <Text style={styles.line}>sky UV   {formatUv(centerUv.u, centerUv.v)}</Text>
        <Text style={styles.line}>
          mountain UV {formatUv(mountainUv.u, mountainUv.v)}  offset{' '}
          {gameConfig.panorama.mountainLongitudeOffsetTurns.toFixed(3)} turns
        </Text>
        <Text style={styles.line}>
          mountain rotation xyz {gameConfig.panorama.mountainRotationDegrees.x},{' '}
          {gameConfig.panorama.mountainRotationDegrees.y}, {gameConfig.panorama.mountainRotationDegrees.z}°
        </Text>
        <Text style={styles.line}>
          swipe px  x {lastSwipe.dx.toFixed(1)}  y {lastSwipe.dy.toFixed(1)}
        </Text>
        <Text style={styles.line}>
          swipe est yaw {formatDegrees(lastSwipe.yawDegrees)}°  pitch {formatDegrees(lastSwipe.pitchDegrees)}°
        </Text>
        <Text style={styles.line}>forward before {formatVector(lastSwipe.startForward)}</Text>
        <Text style={styles.line}>forward after  {formatVector(lastSwipe.endForward)}</Text>
        <Text style={styles.line}>delta xyz      {formatVector(lastSwipe.deltaForward)}</Text>
        <Text style={styles.line}>
          gyro {sensorLabel}  last step {lastGyroStepDegrees.toFixed(3)}°
        </Text>
        <Text style={styles.section}>DEVICE MOTION INPUT</Text>
        {camera.mode !== 'normal' ? (
          <Text style={styles.line}>paused in telescope mode</Text>
        ) : deviceMotionDebug ? (
          <>
            <Text style={styles.line}>
              screen {deviceMotionDebug.orientation}°  interval requested{' '}
              {gameConfig.deviceMotion.updateIntervalMs} / observed {deviceMotionDebug.intervalMs.toFixed(0)} ms
            </Text>
            <Text style={styles.line}>
              rotation API {formatDeviceRotation(deviceMotionDebug.rotation)}  t{' '}
              {deviceMotionDebug.rotationTimestamp.toFixed(0)}
            </Text>
            <Text style={styles.line}>
              rate deg/s {formatDeviceRotation(deviceMotionDebug.rotationRate)}  t{' '}
              {deviceMotionDebug.rotationRateTimestamp?.toFixed(0) ?? '--'}
            </Text>
            <Text style={styles.line}>q mapped {formatNullableQuaternion(deviceMotionDebug.rawQuaternion)}</Text>
            <Text style={styles.line}>
              device q smooth {formatNullableQuaternion(deviceMotionDebug.filteredQuaternion)}
            </Text>
          </>
        ) : (
          <Text style={styles.line}>waiting for sensor sample</Text>
        )}

        {selectedDirection && selectedMountainMark && selectedUv && selectedMountainUv ? (
          <>
            <Text style={styles.section}>MOUNTAIN MARK</Text>
            <Text style={styles.line}>
              tapped {selectedMountainMark.tappedAt.x.toFixed(0)}, {selectedMountainMark.tappedAt.y.toFixed(0)} px (
              {((selectedMountainMark.tappedAt.x / Math.max(size.width, 1)) * 100).toFixed(1)}%,{' '}
              {((selectedMountainMark.tappedAt.y / Math.max(size.height, 1)) * 100).toFixed(1)}%)
            </Text>
            <Text style={styles.line}>
              current screen{' '}
              {markIsVisible && projectedMountainMark
                ? `${projectedMountainMark.x.toFixed(0)}, ${projectedMountainMark.y.toFixed(0)} px`
                : 'outside view'}
            </Text>
            <Text style={styles.line}>ray xyz {formatVector(selectedDirection)}</Text>
            <Text style={styles.line}>
              sky UV {formatUv(selectedUv.u, selectedUv.v)}  mountain UV{' '}
              {formatUv(selectedMountainUv.u, selectedMountainUv.v)}
            </Text>
          </>
        ) : null}

        <Pressable accessibilityRole="button" onPress={onToggleMountainMark} style={styles.markButton}>
          <Text style={styles.buttonText}>山と空の境目をタップして記録</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export function screenPointToDirection(camera: CameraState, size: ScreenSize, point: Point2D): Vector3 {
  const halfHeight = Math.tan(getVerticalFovRadians(camera.mode) / 2);
  const aspect = size.height > 0 ? size.width / size.height : 1;
  const x = ((point.x / Math.max(size.width, 1)) * 2 - 1) * halfHeight * aspect;
  const y = (1 - (point.y / Math.max(size.height, 1)) * 2) * halfHeight;
  const length = Math.hypot(x, y, 1) || 1;

  return rotateVector(camera.orientation, { x: x / length, y: y / length, z: -1 / length });
}

function formatVector(vector: Vector3): string {
  return `(${vector.x.toFixed(4)}, ${vector.y.toFixed(4)}, ${vector.z.toFixed(4)})`;
}

function formatQuaternion(quaternion: CameraState['orientation']): string {
  return `(${quaternion.x.toFixed(4)}, ${quaternion.y.toFixed(4)}, ${quaternion.z.toFixed(4)}, ${quaternion.w.toFixed(4)})`;
}

function formatNullableQuaternion(quaternion: DeviceMotionDebugSample['rawQuaternion']): string {
  return quaternion ? formatQuaternion(quaternion) : '(unavailable)';
}

function formatDeviceRotation(rotation: DeviceMotionDebugSample['rotation']): string {
  return rotation
    ? `(${rotation.alpha.toFixed(3)}, ${rotation.beta.toFixed(3)}, ${rotation.gamma.toFixed(3)})`
    : '(unavailable)';
}

function formatUv(u: number, v: number): string {
  return `(${u.toFixed(4)}, ${v.toFixed(4)})`;
}

function formatDegrees(value: number): string {
  return value.toFixed(2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    maxHeight: 310,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(160, 205, 230, 0.4)',
    backgroundColor: 'rgba(3, 12, 24, 0.9)',
  },
  panelContent: {
    padding: 9,
    gap: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    color: '#9fe3ff',
    fontSize: 11,
    fontWeight: '700',
  },
  line: {
    color: '#f0f6fc',
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 14,
  },
  section: {
    color: '#ffcf72',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  markButton: {
    alignSelf: 'flex-start',
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(40, 150, 200, 0.34)',
  },
  buttonText: {
    color: '#f4fbff',
    fontSize: 11,
    fontWeight: '600',
  },
  hint: {
    color: '#ffcf72',
    fontSize: 10,
  },
  markingBar: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(160, 205, 230, 0.4)',
    backgroundColor: 'rgba(3, 12, 24, 0.9)',
  },
  markingText: {
    flex: 1,
    color: '#ffcf72',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
});
