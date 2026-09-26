import type { CameraState } from './camera.ts';
import { moveCameraBySwipe } from './camera.ts';
import type { Point2D } from '../../sky/domain/types.ts';
import type { Quaternion } from './orientation.ts';
import { multiplyQuaternions } from './orientation.ts';

export type ExplorationInput =
  | {
      source: 'swipe';
      delta: Point2D;
    }
  | {
      source: 'deviceMotion';
      rotation: Quaternion;
    };

export function moveCameraByInput(camera: CameraState, input: ExplorationInput): CameraState {
  if (input.source === 'deviceMotion') {
    return {
      ...camera,
      orientation: multiplyQuaternions(camera.orientation, input.rotation),
    };
  }

  return moveCameraBySwipe(camera, input.delta);
}
