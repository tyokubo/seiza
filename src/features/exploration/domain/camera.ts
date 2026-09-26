import { gameConfig } from '../../../config/gameConfig.ts';
import { skyPointToDirection } from '../../sky/domain/sphericalCoordinates.ts';
import type { Point2D, Star, Vector3 } from '../../sky/domain/types.ts';
import {
  identityQuaternion,
  inverseQuaternion,
  multiplyQuaternions,
  quaternionFromAxisAngle,
  rotateVector,
  type Quaternion,
} from './orientation.ts';
import { getCameraVerticalFovRadians } from './viewDirection.ts';

export type CameraMode = 'normal' | 'telescope';

export type CameraState = {
  orientation: Quaternion;
  mode: CameraMode;
  zoom?: number;
};

export type ScreenSize = {
  width: number;
  height: number;
};

export function createInitialCamera(): CameraState {
  return { orientation: identityQuaternion, mode: 'normal' };
}

export function setCameraMode(camera: CameraState, mode: CameraMode): CameraState {
  return { ...camera, mode };
}

export function getSwipeSensitivity(mode: CameraMode): number {
  return mode === 'normal'
    ? gameConfig.normalSwipeSensitivity
    : gameConfig.telescopeSwipeSensitivity;
}

export function moveCameraBySwipe(camera: CameraState, delta: Point2D): CameraState {
  const scale = getSwipeSensitivity(camera.mode) / gameConfig.panorama.worldUnitsPerRadian;
  const yaw = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, delta.x * scale);
  const pitch = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, delta.y * scale);

  return {
    ...camera,
    orientation: multiplyQuaternions(camera.orientation, multiplyQuaternions(yaw, pitch)),
  };
}

export function cameraForward(camera: CameraState): Vector3 {
  return rotateVector(camera.orientation, { x: 0, y: 0, z: -1 });
}

export function projectDirectionToScreen(
  direction: Vector3,
  camera: CameraState,
  size: ScreenSize,
  center: Point2D = { x: size.width / 2, y: size.height / 2 },
): Point2D | null {
  const local = rotateVector(inverseQuaternion(camera.orientation), direction);

  if (local.z >= -0.0001 || size.height <= 0) {
    return null;
  }

  const focalLength = size.height / (2 * Math.tan(getCameraVerticalFovRadians(camera) / 2));
  const depth = -local.z;

  return {
    x: center.x + (local.x / depth) * focalLength,
    y: center.y - (local.y / depth) * focalLength,
  };
}

export function worldToScreen(
  point: Point2D,
  camera: CameraState,
  size: ScreenSize,
  center: Point2D = { x: size.width / 2, y: size.height / 2 },
): Point2D | null {
  return projectDirectionToScreen(skyPointToDirection(point), camera, size, center);
}

export function getApertureDiameter(size: ScreenSize): number {
  return Math.min(size.width * 0.8, size.height * 0.4);
}

export function isPointInView(camera: CameraState, point: Point2D, size: ScreenSize): boolean {
  if (camera.mode !== 'telescope') {
    return false;
  }

  const direction = skyPointToDirection(point);
  if (direction.y < 0) {
    return false;
  }

  const screenPoint = projectDirectionToScreen(direction, camera, size);
  const radius = getApertureDiameter(size) / 2;

  return screenPoint !== null && Math.hypot(screenPoint.x - size.width / 2, screenPoint.y - size.height / 2) <= radius;
}

export function getVisibleStars(camera: CameraState, stars: Star[], size: ScreenSize): Star[] {
  if (camera.mode !== 'telescope') {
    return [];
  }

  return stars.filter((star) => isPointInView(camera, star.position, size));
}

export function cameraOrientationToward(camera: CameraState, direction: Vector3): Quaternion {
  const from = cameraForward(camera);
  const cross = {
    x: from.y * direction.z - from.z * direction.y,
    y: from.z * direction.x - from.x * direction.z,
    z: from.x * direction.y - from.y * direction.x,
  };
  const sinAngle = Math.hypot(cross.x, cross.y, cross.z);
  const cosAngle = Math.max(-1, Math.min(1, from.x * direction.x + from.y * direction.y + from.z * direction.z));
  if (sinAngle < 1e-8 && cosAngle > 0) return camera.orientation;
  const axis = sinAngle < 1e-8 ? { x: 0, y: 1, z: 0 } : cross;
  return multiplyQuaternions(quaternionFromAxisAngle(axis, Math.atan2(sinAngle, cosAngle)), camera.orientation);
}
