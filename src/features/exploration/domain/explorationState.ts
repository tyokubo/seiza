import { gameConfig } from '../../../config/gameConfig.ts';
import type { Point2D, Sky, Vector3 } from '../../sky/domain/types.ts';
import {
  cameraForward,
  cameraOrientationToward,
  createInitialCamera,
  getSwipeSensitivity,
  moveCameraBySwipe,
  isPointInView,
  setCameraMode,
  type CameraMode,
  type CameraState,
} from './camera.ts';
import { mergeDiscoveredStarIds } from './discovery.ts';
import { skyPointToDirection } from '../../sky/domain/sphericalCoordinates.ts';
import {
  identityQuaternion,
  inverseQuaternion,
  multiplyQuaternions,
  slerpQuaternion,
  type Quaternion,
} from './orientation.ts';

export type SwipeDebugSample = {
  dx: number;
  dy: number;
  yawDegrees: number;
  pitchDegrees: number;
  startForward: Vector3;
  endForward: Vector3;
  deltaForward: Vector3;
};

export type ExplorationState = {
  camera: CameraState;
  discoveredStarIds: string[];
  focus: { starId: string; from: Quaternion; to: Quaternion } | null;
  foundStarId: string | null;
  gyroOrientation: Quaternion | null;
  swipeOffset: Quaternion;
  dragStartCamera: CameraState | null;
  dragStartGyro: Quaternion | null;
  recenterStartOffset: Quaternion | null;
  lastSwipe: SwipeDebugSample;
};

export type ExplorationAction =
  | { type: 'beginDrag' }
  | { type: 'dragTo'; delta: Point2D; sky: Sky }
  | { type: 'deviceMotionOrientation'; orientation: Quaternion; sky: Sky }
  | { type: 'beginRecenter' }
  | { type: 'cancelRecenter' }
  | { type: 'resumeGyro'; orientation: Quaternion }
  | { type: 'recenterProgress'; progress: number; orientation?: Quaternion; sky: Sky }
  | { type: 'endDrag' }
  | { type: 'setMode'; mode: CameraMode; sky: Sky }
  | { type: 'selectStar'; starId: string; size: { width: number; height: number }; sky: Sky }
  | { type: 'focusProgress'; progress: number; sky: Sky }
  | { type: 'registerStar'; sky: Sky }
  | { type: 'resetDiscoveredStars'; protectedIds: string[] };

export function createExplorationState(): ExplorationState {
  const camera = createInitialCamera();
  return {
    camera,
    discoveredStarIds: [],
    focus: null,
    foundStarId: null,
    gyroOrientation: null,
    swipeOffset: identityQuaternion,
    dragStartCamera: null,
    dragStartGyro: null,
    recenterStartOffset: null,
    lastSwipe: createSwipeDebugSample(camera, { x: 0, y: 0 }),
  };
}

export function explorationReducer(state: ExplorationState, action: ExplorationAction): ExplorationState {
  switch (action.type) {
    case 'beginDrag':
      if (state.focus || state.foundStarId) return state;
      return {
        ...state,
        dragStartCamera: state.camera,
        dragStartGyro: state.gyroOrientation,
        recenterStartOffset: null,
        lastSwipe: createSwipeDebugSample(state.camera, { x: 0, y: 0 }),
      };
    case 'endDrag':
      return { ...state, dragStartCamera: null, dragStartGyro: null };
    case 'beginRecenter':
      if (!state.gyroOrientation || state.camera.mode !== 'normal') return state;
      return {
        ...state,
        recenterStartOffset: state.swipeOffset,
        dragStartCamera: null,
        dragStartGyro: null,
        lastSwipe: createSwipeDebugSample(state.camera, { x: 0, y: 0 }),
      };
    case 'cancelRecenter':
      return { ...state, recenterStartOffset: null };
    case 'resumeGyro':
      return { ...state, gyroOrientation: action.orientation,
        swipeOffset: multiplyQuaternions(state.camera.orientation, inverseQuaternion(action.orientation)),
        recenterStartOffset: null, dragStartCamera: null, dragStartGyro: null };
    case 'recenterProgress': {
      const gyroOrientation = action.orientation ?? state.gyroOrientation;
      if (!state.recenterStartOffset || !gyroOrientation) return state;
      const progress = Math.max(0, Math.min(1, action.progress));
      const swipeOffset = slerpQuaternion(state.recenterStartOffset, identityQuaternion, 1 - (1 - progress) ** 3);
      return updateCamera({
        ...state,
        gyroOrientation,
        swipeOffset,
        recenterStartOffset: progress === 1 ? null : state.recenterStartOffset,
      }, { ...state.camera, orientation: multiplyQuaternions(swipeOffset, gyroOrientation) }, action.sky);
    }
    case 'deviceMotionOrientation': {
      // Tracking continues in telescope mode, but only normal mode follows the device.
      const next = { ...state, gyroOrientation: action.orientation };
      if (state.camera.mode !== 'normal' || state.recenterStartOffset) return next;
      return updateCamera(next, {
        ...state.camera,
        orientation: multiplyQuaternions(state.swipeOffset, action.orientation),
      }, action.sky);
    }
    case 'dragTo': {
      if (state.focus || state.foundStarId) return state;
      const start = state.dragStartCamera ?? state.camera;
      const swiped = moveCameraBySwipe(start, action.delta);
      const gyroAtStart = state.dragStartGyro ?? state.gyroOrientation;
      // A fixed world-space offset preserves device motion even while dragging.
      const swipeOffset = gyroAtStart
        ? multiplyQuaternions(swiped.orientation, inverseQuaternion(gyroAtStart))
        : identityQuaternion;
      const camera = state.camera.mode === 'normal' && state.gyroOrientation
        ? { ...swiped, orientation: multiplyQuaternions(swipeOffset, state.gyroOrientation) }
        : swiped;
      return updateCamera({
        ...state,
        swipeOffset: state.camera.mode === 'normal' ? swipeOffset : state.swipeOffset,
        lastSwipe: createSwipeDebugSample(start, action.delta),
      }, camera, action.sky);
    }
    case 'setMode': {
      if (state.camera.mode === action.mode) return state;
      // The telescope is held steady for precise swipes. Normal mode resumes the
      // live device direction with the offset it had before entering the scope.
      const orientation = action.mode === 'normal' && state.gyroOrientation
        ? multiplyQuaternions(state.swipeOffset, state.gyroOrientation)
        : state.camera.orientation;
      return updateCamera({
        ...state,
        dragStartCamera: null,
        dragStartGyro: null,
        recenterStartOffset: null,
        focus: null,
        foundStarId: null,
      }, { ...setCameraMode(state.camera, action.mode), orientation }, action.sky);
    }
    case 'selectStar': {
      if (state.camera.mode !== 'telescope' || state.focus || state.foundStarId ||
        state.discoveredStarIds.includes(action.starId)) return state;
      const star = action.sky.stars.find((candidate) => candidate.id === action.starId);
      if (!star || !isPointInView(state.camera, star.position, action.size)) return state;
      return {
        ...state,
        focus: {
          starId: star.id,
          from: state.camera.orientation,
          to: cameraOrientationToward(state.camera, skyPointToDirection(star.position)),
        },
        dragStartCamera: null,
        dragStartGyro: null,
      };
    }
    case 'focusProgress': {
      if (!state.focus) return state;
      const progress = Math.max(0, Math.min(1, action.progress));
      const camera = {
        ...state.camera,
        orientation: slerpQuaternion(state.focus.from, state.focus.to, 1 - (1 - progress) ** 3),
      };
      return updateCamera({
        ...state,
        focus: progress === 1 ? null : state.focus,
        foundStarId: progress === 1 ? state.focus.starId : null,
      }, camera, action.sky);
    }
    case 'registerStar': {
      if (!state.foundStarId || !action.sky.stars.some((star) => star.id === state.foundStarId)) return state;
      return {
        ...state,
        discoveredStarIds: mergeDiscoveredStarIds(
          state.discoveredStarIds,
          action.sky.stars.filter((star) => star.id === state.foundStarId),
        ),
        foundStarId: null,
      };
    }
    case 'resetDiscoveredStars': {
      const protectedIds = new Set(action.protectedIds);
      return { ...state, discoveredStarIds: state.discoveredStarIds.filter((id) => protectedIds.has(id)),
        focus: null, foundStarId: null };
    }
  }
}

function updateCamera(state: ExplorationState, camera: CameraState, _sky: Sky): ExplorationState {
  return {
    ...state,
    camera,
  };
}

function createSwipeDebugSample(camera: CameraState, delta: Point2D): SwipeDebugSample {
  const endCamera = moveCameraBySwipe(camera, delta);
  const startForward = cameraForward(camera);
  const endForward = cameraForward(endCamera);
  const radiansPerPixel = getSwipeSensitivity(camera.mode) / gameConfig.panorama.worldUnitsPerRadian;

  return {
    dx: delta.x,
    dy: delta.y,
    yawDegrees: (delta.x * radiansPerPixel * 180) / Math.PI,
    pitchDegrees: (delta.y * radiansPerPixel * 180) / Math.PI,
    startForward,
    endForward,
    deltaForward: {
      x: endForward.x - startForward.x,
      y: endForward.y - startForward.y,
      z: endForward.z - startForward.z,
    },
  };
}
