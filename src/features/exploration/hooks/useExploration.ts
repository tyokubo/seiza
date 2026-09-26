import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import { PanResponder, Platform } from 'react-native';

import { gameConfig } from '@/config/gameConfig';
import { getVisibleStars, type CameraMode, type ScreenSize } from '@/features/exploration/domain/camera';
import { createExplorationState, explorationReducer, type ExplorationAction } from '@/features/exploration/domain/explorationState';
import { getDowsingSignal } from '@/features/exploration/domain/dowsing';
import {
  deviceRotationToQuaternion,
  createPortraitDeviceMotionTracking,
  updateDeviceMotionTracking,
  relativeDeviceRotation,
  type DeviceMotionTracking,
  type DeviceRotation,
} from '@/features/exploration/domain/deviceMotion';
import { quaternionAngle, type Quaternion } from '@/features/exploration/domain/orientation';
import { getPinchDistance, getPinchModeChange } from '@/features/exploration/domain/pinch';
import { getSkyDensitySignal } from '@/features/exploration/domain/skyDensity';
import type { Sky } from '@/features/sky/domain/types';

const fallbackSize = { width: 1, height: 1 };

export type { SwipeDebugSample } from '@/features/exploration/domain/explorationState';

export type DeviceMotionDebugSample = {
  intervalMs: number;
  orientation: number;
  rotation: DeviceRotation | null;
  rotationTimestamp: number;
  rotationRate: DeviceRotation | null;
  rotationRateTimestamp: number | null;
  rawQuaternion: Quaternion | null;
  filteredQuaternion: Quaternion | null;
};

export function useExploration(sky: Sky, initialRegisteredStarIds: string[] = [], active = true) {
  const [state, dispatch] = useReducer(explorationReducer, initialRegisteredStarIds,
    (ids) => ({ ...createExplorationState(), discoveredStarIds: ids }));
  const activeRef = useRef(active);
  useLayoutEffect(() => { activeRef.current = active; }, [active]);
  const [canvasSize, setCanvasSize] = useState<ScreenSize>(fallbackSize);
  const [gyroStatus, setGyroStatus] = useState<'starting' | 'active' | 'unavailable' | 'denied'>('starting');
  const [gyroEnabled, setGyroEnabled] = useState(true);
  const gyroEnabledRef = useRef(true);
  const [lastGyroStepDegrees, setLastGyroStepDegrees] = useState(0);
  const [deviceMotionDebug, setDeviceMotionDebug] = useState<DeviceMotionDebugSample | null>(null);
  const [registrationNotice, setRegistrationNotice] = useState(false);
  const motionTrackingRef = useRef<DeviceMotionTracking | null>(null);
  const recenterFrameRef = useRef<number | null>(null);
  const recenterActiveRef = useRef(false);
  const lastDeviceMotionDebugAtRef = useRef(0);
  const { camera, discoveredStarIds } = state;

  const visibleStars = useMemo(
    () => getVisibleStars(camera, sky.stars, canvasSize),
    [camera, canvasSize, sky.stars],
  );
  const registeredStars = useMemo(
    () => sky.stars.filter((star) => discoveredStarIds.includes(star.id)),
    [discoveredStarIds, sky.stars],
  );
  const skyDensitySignal = useMemo(
    () => getSkyDensitySignal(camera, sky.stars, discoveredStarIds, canvasSize),
    [camera, canvasSize, discoveredStarIds, sky.stars],
  );
  const dowsingSignal = useMemo(() => {
    return getDowsingSignal(camera, sky.stars, discoveredStarIds);
  }, [camera, discoveredStarIds, sky.stars]);

  useEffect(() => {
    if (!registrationNotice) return;
    const timeout = setTimeout(() => setRegistrationNotice(false), 1400);
    return () => clearTimeout(timeout);
  }, [registrationNotice]);

  useEffect(() => {
    if (!state.focus) return;
    let frame: number;
    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      startTime ??= timestamp;
      const progress = Math.min(1, (timestamp - startTime) / gameConfig.starFocusDurationMs);
      dispatch({ type: 'focusProgress', progress, sky });
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [sky, state.focus]);

  const panResponder = useMemo(
    () => createExplorationPanResponder(dispatch, sky, camera.mode),
    [camera.mode, sky],
  );

  useEffect(() => {
    if (state.recenterStartOffset === null && recenterFrameRef.current !== null) {
      cancelAnimationFrame(recenterFrameRef.current);
      recenterFrameRef.current = null;
      recenterActiveRef.current = false;
    }
  }, [state.recenterStartOffset]);

  useEffect(() => {
    let isMounted = true;
    let subscription: { remove: () => void } | null = null;
    motionTrackingRef.current = null;
    lastDeviceMotionDebugAtRef.current = 0;

    function captureDeviceMotionDebug(
      measurement: DeviceMotionMeasurement,
      rotation: DeviceRotation | null,
      rawQuaternion: Quaternion | null,
      filteredQuaternion: Quaternion | null,
    ) {
      const now = Date.now();
      if (now - lastDeviceMotionDebugAtRef.current < 100) return;
      lastDeviceMotionDebugAtRef.current = now;

      const rotationRate = measurement.rotationRate
        ? {
            alpha: measurement.rotationRate.alpha,
            beta: measurement.rotationRate.beta,
            gamma: measurement.rotationRate.gamma,
          }
        : null;

      setDeviceMotionDebug({
        intervalMs: Platform.OS === 'ios' ? measurement.interval * 1000 : measurement.interval,
        orientation: measurement.orientation,
        rotation,
        rotationTimestamp: measurement.rotation.timestamp,
        rotationRate,
        rotationRateTimestamp: measurement.rotationRate?.timestamp ?? null,
        rawQuaternion,
        filteredQuaternion,
      });
    }

    async function subscribeDeviceMotion() {
      const isAvailable = await DeviceMotion.isAvailableAsync();

      if (!isAvailable || !isMounted) {
        if (isMounted) setGyroStatus('unavailable');
        return;
      }

      const permission = await DeviceMotion.getPermissionsAsync();
      const granted =
        permission.granted ||
        (permission.canAskAgain && (await DeviceMotion.requestPermissionsAsync()).granted);

      if (!granted || !isMounted) {
        if (isMounted) setGyroStatus('denied');
        return;
      }

      DeviceMotion.setUpdateInterval(gameConfig.deviceMotion.updateIntervalMs);
      subscription = DeviceMotion.addListener((measurement) => {
        if (!isMounted) return;
        const rotation = getDeviceRotation(measurement);

        if (!rotation) {
          captureDeviceMotionDebug(measurement, null, null, motionTrackingRef.current?.filteredDevice ?? null);
          return;
        }
        setGyroStatus('active');

        const orientation = deviceRotationToQuaternion(rotation);
        const previous = motionTrackingRef.current;
        const tracking = previous
          ? updateDeviceMotionTracking(previous, orientation)
          : createPortraitDeviceMotionTracking(orientation);
        motionTrackingRef.current = tracking;
        if (!activeRef.current || !gyroEnabledRef.current || recenterActiveRef.current) return;
        captureDeviceMotionDebug(measurement, rotation, orientation, tracking.filteredDevice);
        setLastGyroStepDegrees(previous
          ? quaternionAngle(relativeDeviceRotation(previous.orientation, tracking.orientation)) * 180 / Math.PI
          : 0);

        dispatch({
          type: 'deviceMotionOrientation',
          orientation: tracking.orientation,
          sky,
        });
      });
    }

    subscribeDeviceMotion().catch(() => {
      if (isMounted) setGyroStatus('unavailable');
    });

    return () => {
      isMounted = false;
      subscription?.remove();
      motionTrackingRef.current = null;
      if (recenterFrameRef.current !== null) {
        cancelAnimationFrame(recenterFrameRef.current);
        recenterFrameRef.current = null;
      }
      recenterActiveRef.current = false;
    };
  }, [sky]);

  useEffect(
    () => () => {
      if (recenterFrameRef.current !== null) {
        cancelAnimationFrame(recenterFrameRef.current);
      }
    },
    [],
  );

  function recenterGyro() {
    if (!gyroEnabledRef.current || !state.gyroOrientation || camera.mode !== 'normal') return;

    if (recenterFrameRef.current !== null) {
      cancelAnimationFrame(recenterFrameRef.current);
    }

    let startTime: number | null = null;
    let lastFrameTime = -Infinity;
    recenterActiveRef.current = true;
    dispatch({ type: 'beginRecenter' });

    const animate = (timestamp: number) => {
      startTime ??= timestamp;
      const progress = Math.min(1, (timestamp - startTime) / gameConfig.deviceMotion.recenterDurationMs);
      if (progress === 1 || timestamp - lastFrameTime >= 25) {
        lastFrameTime = timestamp;
        dispatch({ type: 'recenterProgress', progress, orientation: motionTrackingRef.current?.orientation, sky });
      }

      if (progress < 1) {
        recenterFrameRef.current = requestAnimationFrame(animate);
      } else {
        recenterFrameRef.current = null;
        recenterActiveRef.current = false;
      }
    };

    recenterFrameRef.current = requestAnimationFrame(animate);
  }

  return {
    camera,
    canvasSize,
    deviceMotionDebug,
    discoveredStarIds,
    foundStarId: state.foundStarId,
    focusingStarId: state.focus?.starId ?? null,
    isFocusing: state.focus !== null,
    focusStar: (starId: string) => {
      setRegistrationNotice(false);
      dispatch({ type: 'selectStar', starId, size: canvasSize, sky });
    },
    dowsingSignal,
    gyroStatus,
    gyroEnabled,
    lastGyroStepDegrees,
    lastSwipe: state.lastSwipe,
    panHandlers: panResponder.panHandlers,
    recenterGyro,
    setGyroEnabled: (enabled: boolean) => {
      gyroEnabledRef.current = enabled;
      setGyroEnabled(enabled);
      if (recenterFrameRef.current !== null) {
        cancelAnimationFrame(recenterFrameRef.current);
        recenterFrameRef.current = null;
      }
      recenterActiveRef.current = false;
      if (enabled && motionTrackingRef.current) dispatch({ type: 'resumeGyro', orientation: motionTrackingRef.current.orientation });
      else dispatch({ type: 'cancelRecenter' });
    },
    resetDiscoveredStars: (protectedIds: string[]) => {
      setRegistrationNotice(false);
      dispatch({ type: 'resetDiscoveredStars', protectedIds });
    },
    registerStar: () => {
      if (!state.foundStarId) return;
      dispatch({ type: 'registerStar', sky });
      setRegistrationNotice(true);
    },
    registeredStars,
    registrationNotice,
    setCanvasSize,
    setMode: (mode: typeof camera.mode) => {
      if (recenterFrameRef.current !== null) {
        cancelAnimationFrame(recenterFrameRef.current);
        recenterFrameRef.current = null;
      }
      recenterActiveRef.current = false;
      dispatch({ type: 'setMode', mode, sky });
    },
    skyDensitySignal,
    visibleStars,
  };
}

function getDeviceRotation(measurement: DeviceMotionMeasurement): DeviceRotation | null {
  const { rotation } = measurement;

  if (
    !Number.isFinite(rotation.alpha) ||
    !Number.isFinite(rotation.beta) ||
    !Number.isFinite(rotation.gamma)
  ) {
    return null;
  }

  return { alpha: rotation.alpha, beta: rotation.beta, gamma: rotation.gamma };
}

function createExplorationPanResponder(
  dispatch: (action: ExplorationAction) => void,
  sky: Sky,
  mode: CameraMode,
) {
  let pinchStartDistance: number | null = null;
  let pinching = false;
  let pinchTriggered = false;
  const endGesture = () => {
    pinchStartDistance = null;
    pinching = false;
    pinchTriggered = false;
    dispatch({ type: 'endDrag' });
  };

  return PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length === 2,
    onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponderCapture: (event, gestureState) =>
      event.nativeEvent.touches.length === 2 ||
      (event.nativeEvent.touches.length === 1 &&
        (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2)),
    onMoveShouldSetPanResponder: (event, gestureState) =>
      event.nativeEvent.touches.length === 2 ||
      (event.nativeEvent.touches.length === 1 &&
        (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2)),
    onPanResponderGrant: (event) => {
      pinchStartDistance = getPinchDistance(event.nativeEvent.touches);
      pinching = pinchStartDistance !== null;
      pinchTriggered = false;
      if (!pinching) dispatch({ type: 'beginDrag' });
    },
    onPanResponderMove: (event, gestureState) => {
      const distance = getPinchDistance(event.nativeEvent.touches);
      if (distance !== null) {
        if (!pinching) {
          pinching = true;
          dispatch({ type: 'endDrag' });
        }
        if (pinchStartDistance === null) {
          pinchStartDistance = distance;
        } else if (!pinchTriggered) {
          const nextMode = getPinchModeChange(mode, pinchStartDistance, distance);
          if (nextMode) {
            pinchTriggered = true;
            dispatch({ type: 'setMode', mode: nextMode, sky });
          }
        }
      } else if (!pinching) {
        dispatch({ type: 'dragTo', delta: { x: gestureState.dx, y: gestureState.dy }, sky });
      }
    },
    onPanResponderRelease: endGesture,
    onPanResponderTerminate: endGesture,
  });
}
