import { gameConfig } from '../../../config/gameConfig.ts';
import {
  inverseQuaternion,
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionAngle,
  quaternionFromAxisAngle,
  slerpQuaternion,
  rotateVector,
  type Quaternion,
} from './orientation.ts';

export type DeviceRotation = {
  alpha: number;
  beta: number;
  gamma: number;
};

export function deviceRotationToQuaternion(rotation: DeviceRotation): Quaternion {
  const aroundZ = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, rotation.alpha);
  const aroundX = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, rotation.beta);
  const aroundY = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, rotation.gamma);

  return multiplyQuaternions(multiplyQuaternions(aroundZ, aroundX), aroundY);
}

export function relativeDeviceRotation(previous: Quaternion, next: Quaternion): Quaternion {
  return multiplyQuaternions(inverseQuaternion(previous), next);
}

export function smoothOrientation(previous: Quaternion, next: Quaternion, factor: number): Quaternion {
  return slerpQuaternion(previous, next, factor);
}

export type DeviceMotionTracking = {
  referenceDevice: Quaternion;
  referenceCamera: Quaternion;
  filteredDevice: Quaternion;
  target: Quaternion;
  orientation: Quaternion;
};

export function createDeviceMotionTracking(device: Quaternion, camera: Quaternion): DeviceMotionTracking {
  return {
    referenceDevice: device,
    referenceCamera: camera,
    filteredDevice: device,
    target: camera,
    orientation: camera,
  };
}

export function createPortraitDeviceMotionTracking(device: Quaternion): DeviceMotionTracking {
  // DeviceMotion is Z-up; the sky is Y-up. The back camera looks along device -Z.
  const sensorToWorld = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, -Math.PI / 2);
  const worldPose = multiplyQuaternions(sensorToWorld, device);
  const forward = rotateVector(worldPose, { x: 0, y: 0, z: -1 });
  const right = rotateVector(worldPose, { x: 1, y: 0, z: 0 });
  const heading = Math.hypot(forward.x, forward.z) > 0.01
    ? Math.atan2(-forward.x, -forward.z)
    : Math.atan2(-right.z, right.x);
  // Anchor only heading. Cancelling initial pitch/roll would tilt the world's horizon.
  const camera = multiplyQuaternions(
    quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, -heading),
    worldPose,
  );
  return createDeviceMotionTracking(device, camera);
}

export function updateDeviceMotionTracking(
  tracking: DeviceMotionTracking,
  device: Quaternion,
): DeviceMotionTracking {
  const smoothed = smoothOrientation(
    tracking.filteredDevice,
    device,
    gameConfig.deviceMotion.smoothingFactor,
  );
  // Limit the displayed step, not the target. Unapplied rotation remains for the next update.
  const step = limitRotationStep(
    relativeDeviceRotation(tracking.filteredDevice, smoothed),
    gameConfig.deviceMotion.maxStepRadians,
  );
  const filteredDevice = multiplyQuaternions(tracking.filteredDevice, step);
  const toCamera = (pose: Quaternion) => multiplyQuaternions(
    tracking.referenceCamera,
    relativeDeviceRotation(tracking.referenceDevice, pose),
  );

  return {
    ...tracking,
    filteredDevice,
    target: toCamera(device),
    orientation: toCamera(filteredDevice),
  };
}

export function limitRotationStep(rotation: Quaternion, maxRadians: number): Quaternion {
  let shortestRotation = normalizeQuaternion(rotation);
  if (shortestRotation.w < 0) {
    shortestRotation = {
      x: -shortestRotation.x,
      y: -shortestRotation.y,
      z: -shortestRotation.z,
      w: -shortestRotation.w,
    };
  }
  const angle = quaternionAngle(shortestRotation);
  return angle > maxRadians
    ? quaternionFromAxisAngle(
        { x: shortestRotation.x, y: shortestRotation.y, z: shortestRotation.z },
        maxRadians,
      )
    : shortestRotation;
}

export function normalizeAngleDifference(next: number, previous: number): number {
  let difference = next - previous;

  while (difference > Math.PI) {
    difference -= Math.PI * 2;
  }

  while (difference < -Math.PI) {
    difference += Math.PI * 2;
  }

  return difference;
}
