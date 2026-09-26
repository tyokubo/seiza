import { gameConfig } from '../../../config/gameConfig.ts';
import type { CameraMode } from './camera.ts';

type TouchPoint = { pageX: number; pageY: number };

export function getPinchDistance(touches: readonly TouchPoint[]): number | null {
  if (touches.length !== 2) return null;
  return Math.hypot(
    touches[0].pageX - touches[1].pageX,
    touches[0].pageY - touches[1].pageY,
  );
}

export function getPinchModeChange(
  mode: CameraMode,
  startDistance: number,
  currentDistance: number,
): CameraMode | null {
  const change = currentDistance - startDistance;
  if (mode === 'normal' && change >= gameConfig.pinchMinTravel &&
    currentDistance / startDistance >= gameConfig.pinchSwitchRatio) return 'telescope';
  if (mode === 'telescope' && change <= -gameConfig.pinchMinTravel &&
    currentDistance / startDistance <= 1 / gameConfig.pinchSwitchRatio) return 'normal';
  return null;
}
