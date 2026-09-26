import { moveCameraBySwipe, type CameraState } from '../../exploration/domain/camera.ts';
import type { Point2D } from '../../sky/domain/types.ts';
import { clampStampSize, type FaceStamp } from './artwork.ts';
import { clampEditorZoom } from './editor.ts';

export function touchPair(a: Point2D, b: Point2D) {
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(0.00001, Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
export type TouchPair = ReturnType<typeof touchPair>;
export function transformStamp(stamp: FaceStamp, start: TouchPair, next: TouchPair): FaceStamp {
  return { ...stamp, size: clampStampSize(stamp.size * next.distance / start.distance),
    rotation: stamp.rotation + Math.atan2(Math.sin(next.angle - start.angle), Math.cos(next.angle - start.angle)),
    position: { x: stamp.position.x + next.center.x - start.center.x, y: stamp.position.y + next.center.y - start.center.y } };
}
export function transformCanvas(camera: CameraState, start: TouchPair, next: TouchPair): CameraState {
  const moved = moveCameraBySwipe(camera, { x: (next.center.x - start.center.x) / (camera.zoom ?? 1), y: (next.center.y - start.center.y) / (camera.zoom ?? 1) });
  return { ...moved, zoom: clampEditorZoom((camera.zoom ?? 1) * next.distance / start.distance) };
}
export function stampAt(point: Point2D | null, stamps: FaceStamp[]) {
  if (!point) return null;
  return [...stamps].reverse().find((stamp) => {
    const dx = point.x - stamp.position.x, dy = point.y - stamp.position.y;
    return Math.abs(dx * Math.cos(stamp.rotation) + dy * Math.sin(stamp.rotation)) <= stamp.size / 2 &&
      Math.abs(-dx * Math.sin(stamp.rotation) + dy * Math.cos(stamp.rotation)) <= stamp.size / 2;
  }) ?? null;
}
