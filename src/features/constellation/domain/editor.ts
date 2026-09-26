import { gameConfig } from '../../../config/gameConfig.ts';
import { getApertureDiameter, worldToScreen, type CameraState, type ScreenSize } from '../../exploration/domain/camera.ts';
import { isStarAboveHorizon } from '../../sky/domain/sphericalCoordinates.ts';
import type { Point2D, Star } from '../../sky/domain/types.ts';

export type Connection = { from: string; to: string };
export type ProjectedStar = Point2D & { id: string };
export type EditorState = { connections: Connection[]; history: Connection[][] };
export type EditorAction =
  | { type: 'connect'; from: string; to: string }
  | { type: 'remove'; connection: Connection }
  | { type: 'undo' };

export function connectionKey(connection: Connection): string {
  return JSON.stringify([connection.from, connection.to].sort());
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === 'undo') {
    const previous = state.history.at(-1);
    return previous ? { connections: previous, history: state.history.slice(0, -1) } : state;
  }
  let connections: Connection[];
  if (action.type === 'connect') {
    const connection = { from: action.from, to: action.to };
    if (action.from === action.to || state.connections.some((item) => connectionKey(item) === connectionKey(connection))) return state;
    connections = [...state.connections, connection];
  } else {
    connections = state.connections.filter((item) => connectionKey(item) !== connectionKey(action.connection));
    if (connections.length === state.connections.length) return state;
  }
  return { connections, history: [...state.history, state.connections].slice(-100) };
}

export function projectEditorStars(stars: Star[], camera: CameraState, size: ScreenSize): ProjectedStar[] {
  return stars.filter(isStarAboveHorizon).flatMap((star) => {
    const point = worldToScreen(star.position, camera, size);
    return point ? [{ id: star.id, ...point }] : [];
  });
}

export function getCraftableStars(stars: Star[], camera: CameraState, size: ScreenSize): Star[] {
  if (camera.mode !== 'normal') return [];
  const radius = getApertureDiameter(size) / 2;
  const ids = new Set(projectEditorStars(stars, camera, size)
    .filter((point) => Math.hypot(point.x - size.width / 2, point.y - size.height / 2) <= radius)
    .map((point) => point.id));
  return stars.filter((star) => ids.has(star.id));
}

export function nearestStar(point: Point2D, stars: ProjectedStar[], radius: number, excludeId?: string): ProjectedStar | null {
  let nearest: ProjectedStar | null = null;
  let distance = radius;
  for (const star of stars) {
    if (star.id === excludeId) continue;
    const nextDistance = Math.hypot(point.x - star.x, point.y - star.y);
    if (nextDistance <= distance) { nearest = star; distance = nextDistance; }
  }
  return nearest;
}

export function distanceToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

export function connectionAtPoint(point: Point2D, connections: Connection[], stars: ProjectedStar[]): Connection | null {
  let nearest: Connection | null = null;
  let distance: number = gameConfig.constellationEditor.lineHitRadius;
  for (const connection of connections) {
    const start = stars.find((star) => star.id === connection.from);
    const end = stars.find((star) => star.id === connection.to);
    if (!start || !end) continue;
    const nextDistance = distanceToSegment(point, start, end);
    if (nextDistance <= distance) { nearest = connection; distance = nextDistance; }
  }
  return nearest;
}

export function clampEditorZoom(zoom: number): number {
  return Math.max(gameConfig.constellationEditor.minZoom, Math.min(gameConfig.constellationEditor.maxZoom, zoom));
}
