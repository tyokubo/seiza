import { gameConfig } from '../../../config/gameConfig.ts';
import type { Point2D } from '../../sky/domain/types.ts';

export type BrushSample = { point: Point2D; time: number };
export function smoothBrush(previous: BrushSample, input: Point2D, time: number): BrushSample {
  const config = gameConfig.constellationEditor.brushSmoothing;
  const dt = Math.max(1, Math.min(64, time - previous.time));
  const distance = Math.hypot(input.x - previous.point.x, input.y - previous.point.y);
  const speed = Math.min(1, distance / config.fastDistancePx);
  const tau = config.slowTimeMs + (config.fastTimeMs - config.slowTimeMs) * speed;
  const alpha = config.enabled ? 1 - Math.exp(-dt / tau) : 1;
  return { point: { x: previous.point.x + (input.x - previous.point.x) * alpha,
    y: previous.point.y + (input.y - previous.point.y) * alpha }, time };
}
