import { gameConfig } from '../../../config/gameConfig.ts';
import { projectDirectionToScreen, type CameraState, type ScreenSize } from '../../exploration/domain/camera.ts';
import { inverseQuaternion, rotateVector, type Quaternion } from '../../exploration/domain/orientation.ts';
import { getCameraVerticalFovRadians } from '../../exploration/domain/viewDirection.ts';
import { skyPointToDirection } from '../../sky/domain/sphericalCoordinates.ts';
import type { Point2D, Star, Vector3 } from '../../sky/domain/types.ts';
import type { Connection } from './editor.ts';

export type Stroke = { id: string; paths: Point2D[][] };
export type FaceStamp = { id: string; assetId: 'nikoniko'; position: Point2D; size: number; rotation: number };
export type Artwork = { frame: Quaternion; strokes: Stroke[]; stamps: FaceStamp[] };
export type Draft = { connections: Connection[]; artwork: Artwork };
export type FinishedConstellation = Draft & {
  id: string; skyId: string; periodKey: string; starIds: string[]; stars: Star[];
  name: string; createdAt: string;
};
export const emptyArtwork = (frame: Quaternion): Artwork => ({ frame, strokes: [], stamps: [] });
export const periodKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
export const artworkId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function directionToPlane(direction: Vector3, frame: Quaternion): Point2D | null {
  const local = rotateVector(inverseQuaternion(frame), direction);
  // A draft occupies one tangent hemisphere; do not wrap strokes through its back.
  return local.z < -0.15 ? { x: local.x / -local.z, y: -local.y / -local.z } : null;
}
export function planeToDirection(point: Point2D, frame: Quaternion): Vector3 {
  const length = Math.hypot(point.x, point.y, 1);
  return rotateVector(frame, { x: point.x / length, y: -point.y / length, z: -1 / length });
}
export function screenToPlane(point: Point2D, camera: CameraState, size: ScreenSize, frame: Quaternion) {
  const focal = size.height / (2 * Math.tan(getCameraVerticalFovRadians(camera) / 2));
  return directionToPlane(rotateVector(camera.orientation, {
    x: (point.x - size.width / 2) / focal, y: -(point.y - size.height / 2) / focal, z: -1,
  }), frame);
}
export const planeToScreen = (point: Point2D, frame: Quaternion, camera: CameraState, size: ScreenSize) =>
  projectDirectionToScreen(planeToDirection(point, frame), camera, size);

const projectionMargin = (size: ScreenSize) => Math.max(32, Math.min(size.width, size.height) * 0.1);

function clipScreenRing(points: Point2D[], size: ScreenSize): Point2D[] {
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return [];
  const margin = projectionMargin(size);
  let ring = points;
  for (const [axis, limit, keepGreater] of [
    ['x', -margin, true], ['x', size.width + margin, false],
    ['y', -margin, true], ['y', size.height + margin, false],
  ] as const) {
    const next: Point2D[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const insideA = keepGreater ? a[axis] >= limit : a[axis] <= limit;
      const insideB = keepGreater ? b[axis] >= limit : b[axis] <= limit;
      if (insideA !== insideB) {
        const t = (limit - a[axis]) / (b[axis] - a[axis]);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, [axis]: limit });
      }
      if (insideB) next.push(b);
    }
    ring = next;
    if (ring.length < 3) return [];
  }
  return ring;
}

export function stampProjectionIsSafe(corners: (Point2D | null)[], size: ScreenSize): boolean {
  if (corners.length !== 4 || corners.some((point) => point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  const [topLeft, topRight, bottomRight, bottomLeft] = corners as Point2D[];
  const centerX = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
  const centerY = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;
  const width = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const height = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const margin = Math.max(size.width, size.height) * 2;
  return centerX >= -margin && centerX <= size.width + margin && centerY >= -margin && centerY <= size.height + margin &&
    width <= margin * 2 && height <= margin * 2;
}

export function projectPlaneRing(points: Point2D[], frame: Quaternion, camera: CameraState, size: ScreenSize): Point2D[] {
  const local = points.map((point) => rotateVector(inverseQuaternion(camera.orientation),
    rotateVector(frame, { x: point.x, y: -point.y, z: -1 })));
  const clipped: Vector3[] = [];
  const near = -0.001;
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length];
    if (a.z <= near) clipped.push(a);
    if ((a.z <= near) !== (b.z <= near)) {
      const t = (near - a.z) / (b.z - a.z);
      clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near });
    }
  }
  const focal = size.height / (2 * Math.tan(getCameraVerticalFovRadians(camera) / 2));
  return clipScreenRing(clipped.map((p) => ({ x: size.width / 2 + p.x / -p.z * focal,
    y: size.height / 2 - p.y / -p.z * focal })), size);
}

export function projectPlanePath(points: Point2D[], frame: Quaternion, camera: CameraState, size: ScreenSize): Point2D[][] {
  const local = points.map((point) => rotateVector(inverseQuaternion(camera.orientation),
    rotateVector(frame, { x: point.x, y: -point.y, z: -1 })));
  const result: Point2D[][] = [];
  const focal = size.height / (2 * Math.tan(getCameraVerticalFovRadians(camera) / 2));
  const project = (p: Vector3) => ({ x: size.width / 2 + p.x / -p.z * focal, y: size.height / 2 - p.y / -p.z * focal });
  const near = -0.001;
  let previousVisible = false;
  for (let i = 1; i < local.length; i++) {
    let a = local[i - 1], b = local[i];
    const startVisible = a.z <= near, endVisible = b.z <= near;
    if (!startVisible && !endVisible) { previousVisible = false; continue; }
    if (startVisible !== endVisible) {
      const t = (near - a.z) / (b.z - a.z);
      const crossing = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near };
      if (startVisible) b = crossing; else a = crossing;
    }
    if (previousVisible && startVisible) result.at(-1)!.push(project(b));
    else result.push([project(a), project(b)]);
    previousVisible = endVisible;
  }
  return result;
}
export function planeStars(stars: Star[], frame: Quaternion) {
  return stars.flatMap((star) => {
    const point = directionToPlane(skyPointToDirection(star.position), frame);
    return point ? [{ ...point, id: star.id }] : [];
  });
}
export function stampCorners(stamp: FaceStamp): Point2D[] {
  const c = Math.cos(stamp.rotation), s = Math.sin(stamp.rotation);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
    x: stamp.position.x + (x * c - y * s) * stamp.size / 2,
    y: stamp.position.y + (x * s + y * c) * stamp.size / 2,
  }));
}
export function clampStampSize(size: number) {
  return Math.max(gameConfig.constellationEditor.minStampSize, Math.min(gameConfig.constellationEditor.maxStampSize, size));
}
export type DraftHistory = { present: Draft; past: Draft[]; future: Draft[] };
export function draftHistoryReducer(state: DraftHistory, action: { type: 'commit'; draft: Draft } | { type: 'undo' } | { type: 'redo' }): DraftHistory {
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous ? { present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future] } : state;
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next ? { present: next, past: [...state.past, state.present], future: state.future.slice(1) } : state;
  }
  return action.draft === state.present ? state : { present: action.draft, past: [...state.past, state.present].slice(-100), future: [] };
}
