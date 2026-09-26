import { gameConfig } from '../../../config/gameConfig.ts';
import type { CameraState } from './camera.ts';
import { cameraForward } from './camera.ts';
import { angularDistance, isStarAboveHorizon, skyPointToDirection } from '../../sky/domain/sphericalCoordinates.ts';
import { inverseQuaternion, rotateVector } from './orientation.ts';
import type { Star } from '../../sky/domain/types.ts';

export type DowsingSignal = {
  targetStarId: string | null;
  distance: number | null;
  angleRadians: number;
  closeness: number;
  label: 'silent' | 'faint' | 'near' | 'hot';
};

export function getDowsingSignal(camera: CameraState, stars: Star[], registeredStarIds: readonly string[] = []): DowsingSignal {
  const eligibleStars = stars.filter((star) => isStarAboveHorizon(star) && !registeredStarIds.includes(star.id));

  if (eligibleStars.length === 0) {
    return {
      targetStarId: null,
      distance: null,
      angleRadians: 0,
      closeness: 0,
      label: 'silent',
    };
  }

  const forward = cameraForward(camera);
  const nearest = eligibleStars.reduce(
    (best, star) => {
      const direction = skyPointToDirection(star.position);
      const distance = angularDistance(forward, direction);
      return distance < best.distance ? { star, distance } : best;
    },
    { star: eligibleStars[0], distance: angularDistance(forward, skyPointToDirection(eligibleStars[0].position)) },
  );

  const maxDistanceRadians = gameConfig.dowsingMaxDistance / gameConfig.panorama.worldUnitsPerRadian;
  const closeness = Math.max(0, 1 - nearest.distance / maxDistanceRadians);
  const localDirection = rotateVector(
    inverseQuaternion(camera.orientation),
    skyPointToDirection(nearest.star.position),
  );
  const angleRadians = Math.atan2(-localDirection.y, localDirection.x);

  return {
    targetStarId: nearest.star.id,
    distance: nearest.distance * gameConfig.panorama.worldUnitsPerRadian,
    angleRadians,
    closeness,
    label: getSignalLabel(closeness),
  };
}

function getSignalLabel(closeness: number): DowsingSignal['label'] {
  if (closeness >= 0.82) {
    return 'hot';
  }
  if (closeness >= 0.58) {
    return 'near';
  }
  if (closeness > 0) {
    return 'faint';
  }
  return 'silent';
}
