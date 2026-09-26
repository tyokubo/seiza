import { gameConfig } from '../../../config/gameConfig.ts';
import type { CameraMode, CameraState, ScreenSize } from './camera.ts';

export function getCameraVerticalFovRadians(camera: CameraState): number {
  return 2 * Math.atan(Math.tan(getVerticalFovRadians(camera.mode) / 2) / Math.max(0.1, camera.zoom ?? 1));
}

export function getVerticalFovRadians(mode: CameraMode = 'normal'): number {
  const zoom = mode === 'telescope' ? gameConfig.panorama.telescopeZoom : 1;
  return 2 * Math.atan(Math.tan((gameConfig.panorama.verticalFovDegrees * Math.PI) / 360) / zoom);
}

export function getTelescopePreviewScale(): number {
  return Math.tan(getVerticalFovRadians('telescope') / 2) / Math.tan(getVerticalFovRadians('normal') / 2);
}

export function getHorizontalFovRadians(size: ScreenSize, mode: CameraMode = 'normal'): number {
  if (size.height <= 0) {
    return getVerticalFovRadians(mode);
  }

  return 2 * Math.atan(Math.tan(getVerticalFovRadians(mode) / 2) * (size.width / size.height));
}
