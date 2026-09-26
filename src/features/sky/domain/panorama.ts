import { gameConfig } from '../../../config/gameConfig.ts';
import {
  identityQuaternion,
  inverseQuaternion,
  multiplyQuaternions,
  quaternionFromAxisAngle,
  rotateVector,
  type Quaternion,
} from '../../exploration/domain/orientation.ts';
import type { Vector3 } from './types.ts';

const degrees = gameConfig.panorama.mountainRotationDegrees;
const radians = Math.PI / 180;

// Sampling needs the inverse of the asset-to-world placement (X, then Y, then Z).
export const mountainWorldToPanorama = inverseQuaternion(
  multiplyQuaternions(
    quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, degrees.z * radians),
    multiplyQuaternions(
      quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, degrees.y * radians),
      quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, degrees.x * radians),
    ),
  ),
);

// UV uses the vertically flipped texture convention shared with the GL shader.
export function worldDirectionToPanoramaUv(
  direction: Vector3,
  worldToPanorama: Quaternion = identityQuaternion,
  longitudeOffsetTurns = 0,
) {
  const local = rotateVector(worldToPanorama, direction);
  const longitude = Math.atan2(local.x, -local.z);
  const latitude = Math.asin(Math.max(-1, Math.min(1, local.y)));
  const u = longitude / (2 * Math.PI) + 0.5 + longitudeOffsetTurns;

  return { u: u - Math.floor(u), v: latitude / Math.PI + 0.5 };
}
