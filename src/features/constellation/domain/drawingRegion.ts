import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import { gameConfig } from '../../../config/gameConfig.ts';
import type { Point2D } from '../../sky/domain/types.ts';
import type { Connection, ProjectedStar } from './editor.ts';
import { stampCorners, type FaceStamp, type Stroke } from './artwork.ts';

const EPS = 1e-8;
const cross = (a: Point2D, b: Point2D) => a.x * b.y - a.y * b.x;
const sub = (a: Point2D, b: Point2D) => ({ x: a.x - b.x, y: a.y - b.y });
const lerp = (a: Point2D, b: Point2D, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const xy = ([x, y]: number[]): Point2D => ({ x, y });
const ringOf = (points: Point2D[]): Ring => [...points, points[0]].map((p) => [p.x, p.y]);

function intersection(a: Point2D, b: Point2D, c: Point2D, d: Point2D): number | null {
  const ab = sub(b, a), cd = sub(d, c), ac = sub(c, a), denominator = cross(ab, cd);
  if (Math.abs(denominator) < EPS) return null;
  const t = cross(ac, cd) / denominator, u = cross(ac, ab) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? Math.max(0, Math.min(1, t)) : null;
}

// Walk directed edges around planar faces. Reject an entire crossing component's
// interiors, retaining its capsules, rather than inventing a convex enclosure.
function closedFaces(edges: [ProjectedStar, ProjectedStar][]): Polygon[] {
  // Dangling branches do not change an existing closed face.
  for (;;) {
    const degrees = new Map<string, number>();
    for (const edge of edges) for (const p of edge) degrees.set(p.id, (degrees.get(p.id) ?? 0) + 1);
    const core = edges.filter(([a, b]) => degrees.get(a.id)! > 1 && degrees.get(b.id)! > 1);
    if (core.length === edges.length) break;
    edges = core;
  }
  const adjacent = new Map<string, ProjectedStar[]>();
  const vertices = new Map<string, ProjectedStar>();
  for (const [a, b] of edges) {
    vertices.set(a.id, a); vertices.set(b.id, b);
    adjacent.set(a.id, [...(adjacent.get(a.id) ?? []), b]);
    adjacent.set(b.id, [...(adjacent.get(b.id) ?? []), a]);
  }
  const invalid = new Set<string>();
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const [a, b] = edges[i], [c, d] = edges[j];
    if ([a.id, b.id].some((id) => id === c.id || id === d.id)) continue;
    const hit = intersection(a, b, c, d);
    const collinear = Math.abs(cross(sub(b, a), sub(c, a))) < EPS && Math.abs(cross(sub(b, a), sub(d, a))) < EPS;
    if (hit !== null || collinear) {
      const queue = [a.id, c.id];
      while (queue.length) {
        const id = queue.pop()!;
        if (invalid.has(id)) continue;
        invalid.add(id); queue.push(...(adjacent.get(id) ?? []).map((p) => p.id));
      }
    }
  }
  for (const [id, neighbors] of adjacent) {
    const center = vertices.get(id)!;
    neighbors.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  }
  const visited = new Set<string>(), faces: Polygon[] = [];
  for (const [a, b] of edges.flatMap(([a, b]) => [[a, b], [b, a]])) {
    if (invalid.has(a.id)) continue;
    let from = a, to = b;
    const points: ProjectedStar[] = [];
    for (let i = 0; i <= edges.length * 2; i++) {
      const key = JSON.stringify([from.id, to.id]);
      if (visited.has(key)) break;
      visited.add(key); points.push(from);
      const neighbors = adjacent.get(to.id)!;
      const next = neighbors[(neighbors.findIndex((p) => p.id === from.id) - 1 + neighbors.length) % neighbors.length];
      from = to; to = next;
      if (from.id === a.id && to.id === b.id) {
        const area = points.reduce((sum, p, index) => sum + cross(p, points[(index + 1) % points.length]), 0);
        if (area > EPS && new Set(points.map((p) => p.id)).size === points.length) faces.push([ringOf(points)]);
        break;
      }
    }
  }
  return faces;
}

export function buildDrawingRegion(connections: Connection[], stars: ProjectedStar[], radius: number = gameConfig.constellationEditor.bandRadius): MultiPolygon {
  const byId = new Map(stars.map((p) => [p.id, p]));
  const edges: [ProjectedStar, ProjectedStar][] = connections.flatMap((edge) => {
    const a = byId.get(edge.from), b = byId.get(edge.to);
    return a && b && Math.hypot(a.x - b.x, a.y - b.y) > EPS ? [[a, b] as [ProjectedStar, ProjectedStar]] : [];
  });
  const polygons: Polygon[] = edges.map(([a, b]) => {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const points: Point2D[] = [];
    for (const [center, start] of [[b, angle - Math.PI / 2], [a, angle + Math.PI / 2]] as const) {
      for (let i = 0; i <= 16; i++) points.push({ x: center.x + radius * Math.cos(start + i * Math.PI / 16), y: center.y + radius * Math.sin(start + i * Math.PI / 16) });
    }
    return [ringOf(points)];
  });
  polygons.push(...closedFaces(edges));
  return polygons.length ? polygonClipping.union(polygons[0], ...polygons.slice(1)) : [];
}
function insideRing(point: Point2D, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [px, py] = ring[j];
    if ((y > point.y) !== (py > point.y) && point.x < (px - x) * (point.y - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}
export function inDrawingRegion(point: Point2D, region: MultiPolygon): boolean {
  return region.some(([outer, ...holes]) => insideRing(point, outer) && !holes.some((hole) => insideRing(point, hole)));
}
export function clipPath(points: Point2D[], region: MultiPolygon): Point2D[][] {
  const result: Point2D[][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const ts = [0, 1];
    for (const polygon of region) for (const ring of polygon) for (let j = 1; j < ring.length; j++) {
      const t = intersection(a, b, xy(ring[j - 1]), xy(ring[j]));
      if (t !== null) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      if (ts[j] - ts[j - 1] < EPS || !inDrawingRegion(lerp(a, b, (ts[j] + ts[j - 1]) / 2), region)) continue;
      const start = lerp(a, b, ts[j - 1]), end = lerp(a, b, ts[j]);
      const last = result.at(-1), tail = last?.at(-1);
      if (tail && Math.hypot(tail.x - start.x, tail.y - start.y) < EPS) last!.push(end);
      else result.push([start, end]);
    }
  }
  return result;
}
export const clipStrokes = (strokes: Stroke[], region: MultiPolygon): Stroke[] => strokes.flatMap((stroke) => {
  const paths = stroke.paths.flatMap((path) => clipPath(path, region));
  return paths.length ? [{ ...stroke, paths }] : [];
});
export function stampFits(stamp: FaceStamp, region: MultiPolygon): boolean {
  // Polygon difference also detects concavities and holes inside the stamp rectangle.
  return polygonClipping.difference([ringOf(stampCorners(stamp))], region).length === 0;
}

export function fitStampAt(stamp: FaceStamp, region: MultiPolygon): FaceStamp | null {
  if (!inDrawingRegion(stamp.position, region)) return null;
  // Keep the chosen position; reduce size only when the local band is narrow.
  for (let size = stamp.size; size >= gameConfig.constellationEditor.minStampSize; size *= 0.85) {
    const candidate = { ...stamp, size };
    if (stampFits(candidate, region)) return candidate;
  }
  return null;
}
