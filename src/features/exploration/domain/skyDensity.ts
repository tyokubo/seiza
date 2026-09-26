import { gameConfig } from '../../../config/gameConfig.ts';
import type { CameraState, ScreenSize } from './camera.ts';
import { getApertureDiameter, worldToScreen } from './camera.ts';
import type { Star } from '../../sky/domain/types.ts';
import { isStarAboveHorizon } from '../../sky/domain/sphericalCoordinates.ts';

export type SkyDensitySignal = {
  count: number;
  intensity: number;
  label: 'none' | 'few' | 'medium' | 'many';
};

export function getSkyDensitySignal(
  camera: CameraState,
  stars: Star[],
  discoveredStarIds: string[],
  size: ScreenSize,
): SkyDensitySignal {
  const radius = getApertureDiameter(size) / 2;
  const discoveredIds = new Set(discoveredStarIds);
  const count = stars.filter((star) => {
    if (!isStarAboveHorizon(star) || discoveredIds.has(star.id)) return false;
    const point = worldToScreen(star.position, camera, size);
    return point !== null && Math.hypot(point.x - size.width / 2, point.y - size.height / 2) <= radius;
  }).length;
  const intensity = Math.max(0, Math.min(1, count / gameConfig.densityThresholds.many));

  return {
    count,
    intensity,
    label: getDensityLabel(count),
  };
}

function getDensityLabel(count: number): SkyDensitySignal['label'] {
  if (count >= gameConfig.densityThresholds.many) {
    return 'many';
  }
  if (count >= gameConfig.densityThresholds.medium) {
    return 'medium';
  }
  if (count >= gameConfig.densityThresholds.few) {
    return 'few';
  }
  return 'none';
}
