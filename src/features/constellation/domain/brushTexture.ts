import { gameConfig } from '../../../config/gameConfig.ts';
import type { Point2D } from '../../sky/domain/types.ts';
import type { Stroke } from './artwork.ts';

// Fixed arc-length samples and a stroke seed keep the grain identical after save/zoom.
export function texturedStroke(stroke: Stroke): { opacity: number; rings: Point2D[][] }[] {
  const config = gameConfig.constellationEditor.brushTexture;
  let seed = 2166136261;
  for (const char of stroke.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const noise = (index: number) => {
    let value = Math.imul(seed ^ index, 1597334677);
    value = Math.imul(value ^ (value >>> 16), 2246822519);
    return (value >>> 0) / 4294967295;
  };
  const layers = [0, 1, 2, 3].map((level) => ({ opacity: config.minimumOpacity + (1 - config.minimumOpacity) * level / 3, rings: [] as Point2D[][] }));
  stroke.paths.forEach((path, pathIndex) => {
    if (path.length < 2) return;
    const points: Point2D[] = [path[0]];
    let remaining = config.spacing;
    for (let i = 1; i < path.length; i++) {
      let a = path[i - 1];
      const b = path[i];
      let distance = Math.hypot(b.x - a.x, b.y - a.y);
      while (distance >= remaining) {
        const t = remaining / distance;
        a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        points.push(a); distance -= remaining; remaining = config.spacing;
      }
      remaining -= distance;
    }
    if (Math.hypot(points.at(-1)!.x - path.at(-1)!.x, points.at(-1)!.y - path.at(-1)!.y) > 1e-8) points.push(path.at(-1)!);
    const edges = points.map((point, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const width = config.width / 2 * (1 - config.edgeRoughness + noise(i + pathIndex * 7919) * config.edgeRoughness * 2);
      const dx = -(b.y - a.y) / length * width, dy = (b.x - a.x) / length * width;
      return [{ x: point.x + dx, y: point.y + dy }, { x: point.x - dx, y: point.y - dy }];
    });
    for (let i = 1; i < edges.length; i++) {
      const bucket = Math.min(3, Math.floor(noise(i * 17 + pathIndex * 6151) * 4));
      layers[bucket].rings.push([edges[i - 1][0], edges[i][0], edges[i][1], edges[i - 1][1]]);
    }
  });
  return layers;
}
