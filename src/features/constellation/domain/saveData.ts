import type { Sky, Point2D, Star } from '../../sky/domain/types.ts';
import { isStarAboveHorizon } from '../../sky/domain/sphericalCoordinates.ts';
import { connectionKey, type Connection } from './editor.ts';
import { gameConfig } from '../../../config/gameConfig.ts';
import { planeStars, type Artwork, type Draft, type FinishedConstellation } from './artwork.ts';
import { buildDrawingRegion, clipStrokes, fitStampAt, stampFits } from './drawingRegion.ts';

export type SkySaveData = {
  schemaVersion: 1;
  skyId: string;
  registeredStarIds: string[];
  connections: Connection[];
  name: string;
  artwork: Artwork | null;
  library: FinishedConstellation[];
  editingId: string | null;
};

export function emptySkySave(skyId: string): SkySaveData {
  return { schemaVersion: 1, skyId, registeredStarIds: [], connections: [], name: '', artwork: null, library: [], editingId: null };
}

export function normalizeConstellationName(value: string): string {
  return Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, gameConfig.constellationEditor.maxNameLength).join('');
}

export function parseSkySave(raw: string | null, sky: Sky): SkySaveData {
  if (raw === null) return emptySkySave(sky.id);
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1 ||
    !('skyId' in value) || value.skyId !== sky.id || !('registeredStarIds' in value) || !Array.isArray(value.registeredStarIds) ||
    !('connections' in value) || !Array.isArray(value.connections)) throw new Error('Unsupported sky save');
  const knownIds = new Set(sky.stars.filter(isStarAboveHorizon).map((star) => star.id));
  const registeredStarIds = [...new Set(value.registeredStarIds.filter((id): id is string => typeof id === 'string' && knownIds.has(id)))];
  const registered = new Set(registeredStarIds);
  const keys = new Set<string>();
  const connections: Connection[] = [];
  for (const item of value.connections) {
    if (!item || typeof item !== 'object' || typeof item.from !== 'string' || typeof item.to !== 'string' ||
      item.from === item.to || !registered.has(item.from) || !registered.has(item.to)) continue;
    const connection = { from: item.from, to: item.to };
    const key = connectionKey(connection);
    if (!keys.has(key)) { connections.push(connection); keys.add(key); }
  }
  const name = 'name' in value && typeof value.name === 'string' ? normalizeConstellationName(value.name) : '';
  const artwork = 'artwork' in value && value.artwork != null ? parseArtwork(value.artwork) : null;
  const library = 'library' in value ? list(value.library).map(parseFinished) : [];
  const sanitized = artwork ? sanitizeDraft({ connections, artwork }, sky.stars) : null;
  const editingId = 'editingId' in value && library.some((item) => item.id === value.editingId) && artwork
    ? value.editingId as string : null;
  return { schemaVersion: 1, skyId: sky.id, registeredStarIds, connections, name, artwork: sanitized?.artwork ?? null, library, editingId };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid artwork record');
  return value as Record<string, unknown>;
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid artwork coordinate');
  return value;
}
function point(value: unknown): Point2D {
  const p = record(value);
  return { x: finite(p.x), y: finite(p.y) };
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid artwork array');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid artwork text');
  return value;
}
function parseArtwork(raw: unknown): Artwork {
  const value = record(raw), q = record(value.frame);
  const frame = { x: finite(q.x), y: finite(q.y), z: finite(q.z), w: finite(q.w) };
  const length = Math.hypot(frame.x, frame.y, frame.z, frame.w);
  if (Math.abs(length - 1) > 0.001) throw new Error('Invalid artwork frame');
  const strokes = list(value.strokes).map((raw) => {
    const stroke = record(raw);
    return { id: text(stroke.id), paths: list(stroke.paths).map((path) => list(path).map(point)) };
  });
  const stamps = (value.stamps !== undefined ? list(value.stamps) : value.stamp != null ? [value.stamp] : []).map((raw, index) => {
    const s = record(raw);
    if (s.assetId !== 'nikoniko' || finite(s.size) <= 0) throw new Error('Invalid stamp');
    return { id: typeof s.id === 'string' ? s.id : `legacy-face-${index}`, assetId: 'nikoniko' as const,
      position: point(s.position), size: finite(s.size), rotation: finite(s.rotation) };
  });
  if (new Set(stamps.map((stamp) => stamp.id)).size !== stamps.length) throw new Error('Duplicate stamp ID');
  return { frame, strokes, stamps };
}
export function sanitizeDraft(draft: Draft, stars: Star[]): Draft {
  const region = buildDrawingRegion(draft.connections, planeStars(stars, draft.artwork.frame));
  const stamps = draft.artwork.stamps.map((stamp) => stamp.size < gameConfig.constellationEditor.minStampSize
    ? fitStampAt({ ...stamp, size: gameConfig.constellationEditor.minStampSize }, region) ?? stamp
    : stamp).filter((stamp) => stampFits(stamp, region));
  return { ...draft, artwork: { ...draft.artwork,
    strokes: clipStrokes(draft.artwork.strokes, region),
    stamps,
  } };
}

export function replaceFinished(library: FinishedConstellation[], finished: FinishedConstellation) {
  return library.some((item) => item.id === finished.id)
    ? library.map((item) => item.id === finished.id ? finished : item)
    : [...library, finished];
}
function parseFinished(raw: unknown): FinishedConstellation {
  const value = record(raw);
  const stars = list(value.stars).map((raw) => {
    const star = record(raw);
    return { id: text(star.id), position: point(star.position), brightness: finite(star.brightness) };
  });
  const ids = new Set(stars.map((star) => star.id));
  const connections = list(value.connections).map((raw) => {
    const edge = record(raw), from = text(edge.from), to = text(edge.to);
    if (!ids.has(from) || !ids.has(to) || from === to) throw new Error('Invalid archived edge');
    return { from, to };
  });
  const draft = sanitizeDraft({ connections, artwork: parseArtwork(value.artwork) }, stars);
  const createdAt = text(value.createdAt), month = text(value.periodKey);
  if (!Number.isFinite(Date.parse(createdAt)) || !/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid archive date');
  return { ...draft, id: text(value.id), skyId: text(value.skyId), periodKey: month,
    starIds: [...new Set(connections.flatMap((edge) => [edge.from, edge.to]))], stars,
    name: normalizeConstellationName(text(value.name)), createdAt };
}
