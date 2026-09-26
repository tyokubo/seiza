import { gameConfig } from '../../../config/gameConfig.ts';
import type { Point2D, Star, Vector3 } from './types.ts';

export function skyPointToDirection(point: Point2D): Vector3 {
  const radius = gameConfig.panorama.worldUnitsPerRadian * 2;
  const u = point.x / radius;
  const v = -point.y / radius;
  const denominator = 1 + u * u + v * v;

  return {
    x: (2 * u) / denominator,
    y: (2 * v) / denominator,
    z: (u * u + v * v - 1) / denominator,
  };
}

export function angularDistance(a: Vector3, b: Vector3): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

export function isStarAboveHorizon(star: Star): boolean {
  return skyPointToDirection(star.position).y >= 0;
}
