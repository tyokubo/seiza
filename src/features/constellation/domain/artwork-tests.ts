import { buildDrawingRegion, clipPath, fitStampAt, inDrawingRegion, stampFits } from './drawingRegion.ts';
import { smoothBrush } from './brush.ts';
import { texturedStroke } from './brushTexture.ts';
import { availableStars, creationChoices, preferredCreationTarget, validateConnections } from './ownership.ts';
import { stampAt, touchPair, transformCanvas, transformStamp } from './touchTransform.ts';
import { gameConfig } from '../../../config/gameConfig.ts';
import { draftHistoryReducer, emptyArtwork, periodKey, planeStars, planeToScreen, projectPlanePath, projectPlaneRing, screenToPlane, stampProjectionIsSafe, type DraftHistory, type FaceStamp } from './artwork.ts';
import { quaternionFromAxisAngle } from '../../exploration/domain/orientation.ts';
import { createInitialCamera, moveCameraBySwipe } from '../../exploration/domain/camera.ts';
import { emptySkySave, parseSkySave, replaceFinished } from './saveData.ts';
import type { Connection } from './editor.ts';
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const points = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }, { id: 'c', x: 2, y: 2 }, { id: 'd', x: 1, y: 0.7 }, { id: 'e', x: 0, y: 2 }];
const loop: Connection[] = ['a', 'b', 'c', 'd', 'e'].map((from, i, ids) => ({ from, to: ids[(i + 1) % ids.length] }));
const concave = buildDrawingRegion(loop, points, 0.1);
assert(inDrawingRegion({ x: 0.5, y: 0.5 }, concave), 'Concave interior must fill');
assert(!inDrawingRegion({ x: 1, y: 1.7 }, concave), 'Concave notch must not use convex hull');
const line = buildDrawingRegion([loop[0]], points, 0.1);
assert(gameConfig.constellationEditor.bandRadius === 0.09, 'Drawing band is twice the previous radius');
assert(inDrawingRegion({ x: 1, y: 0.08 }, line), 'Band should include offset');
assert(!inDrawingRegion({ x: 1, y: 0.2 }, line), 'Single edge has no interior');
assert(inDrawingRegion({ x: -0.05, y: 0 }, line), 'Rounded endpoint');
const triangle = buildDrawingRegion([{ from: 'a', to: 'b' }, { from: 'b', to: 'e' }, { from: 'e', to: 'a' }], points, 0.1);
assert(inDrawingRegion({ x: 0.5, y: 0.5 }, triangle), 'Triangle interior');
const open = buildDrawingRegion([{ from: 'a', to: 'b' }, { from: 'b', to: 'e' }], points, 0.1);
assert(!inDrawingRegion({ x: 0.5, y: 0.5 }, open), 'Deleting an edge removes fill');
const spur = buildDrawingRegion([...loop, { from: 'd', to: 'f' }], [...points, { id: 'f', x: 1, y: 0.4 }], 0.1);
assert(inDrawingRegion({ x: 0.5, y: 0.5 }, spur), 'Internal spur must preserve closed face');
const crossed = buildDrawingRegion([{ from: 'a', to: 'c' }, { from: 'c', to: 'b' }, { from: 'b', to: 'e' }, { from: 'e', to: 'a' }], points, 0.04);
assert(!inDrawingRegion({ x: 0.15, y: 0.6 }, crossed), 'Self-crossing face must not invent fill');
const clipped = clipPath([{ x: -1, y: 0 }, { x: 3, y: 0 }], line);
assert(clipped.length === 1 && Math.abs(clipped[0][0].x + 0.1) < 1e-6 && Math.abs(clipped[0].at(-1)!.x - 2.1) < 1e-6, 'Clip outside entry and exit exactly');
const splits = clipPath([{ x: -1, y: 1.5 }, { x: 3, y: 1.5 }], concave);
assert(splits.length === 2, 'Notch must split a stroke');
assert(clipPath([{ x: -1, y: 4 }, { x: 3, y: 4 }], concave).length === 0, 'Outside-only stroke discarded');
const stamp: FaceStamp = { id: 'face-1', assetId: 'nikoniko', position: { x: 0.5, y: 0.5 }, size: 0.2, rotation: 0 };
assert(stampFits(stamp, triangle), 'Face within triangle');
assert(!stampFits({ ...stamp, position: { x: 1, y: 1.5 } }, concave), 'Face cannot bridge concavity');
assert(fitStampAt({ ...stamp, position: { x: 1, y: 0 }, size: 0.3 }, line) !== null, 'Drag placement shrinks to fit local band');
assert(fitStampAt({ ...stamp, position: { x: 3, y: 3 } }, triangle) === null, 'Outside stamp drop rejected');
let brush = { point: { x: 0, y: 0 }, time: 0 };
let jitter = 0;
for (let i = 1; i <= 60; i++) { brush = smoothBrush(brush, { x: i % 2 ? 1 : -1, y: 0 }, i * 16); jitter += Math.abs(brush.point.x); }
assert(jitter < 30, 'Brush reduces small oscillations');
const fast = smoothBrush({ point: { x: 0, y: 0 }, time: 0 }, { x: 30, y: 0 }, 16);
assert(fast.point.x > 25 && fast.point.x <= 30, 'Fast movement follows without overshoot');
const camera = createInitialCamera(), size = { width: 390, height: 844 }, p = { x: 0.1, y: -0.2 };
const partial = projectPlaneRing([{ x: -3, y: -1 }, { x: 3, y: -1 }, { x: 3, y: 1 }, { x: -3, y: 1 }], camera.orientation,
  { ...camera, orientation: quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2) }, size);
assert(partial.length >= 3 && partial.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'Partially visible region must not vanish at near plane');
const withinScreen = (point: { x: number; y: number }) => point.x >= -39 && point.x <= 429 && point.y >= -39 && point.y <= 883;
assert(partial.every(withinScreen), 'Near-plane polygons must be clipped before reaching SVG');
const tinyRing = [{ x: -0.01, y: -0.01 }, { x: 0.01, y: -0.01 }, { x: 0.01, y: 0.01 }, { x: -0.01, y: 0.01 }];
for (let degrees = 0; degrees < 360; degrees += 3) {
  const view = { ...camera, orientation: quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, degrees * Math.PI / 180) };
  for (const zoom of [1, 2, 5]) {
    const projected = projectPlaneRing(tinyRing, camera.orientation, { ...view, zoom }, size);
    assert(projected.every(withinScreen), 'Rotating a textured stroke must never produce oversized SVG coordinates');
  }
}
assert(!stampProjectionIsSafe([{ x: -100000, y: 0 }, { x: 1, y: 0 }], size), 'Oversized stamp projections are culled');
assert(stampProjectionIsSafe([{ x: 100, y: 100 }, { x: 120, y: 120 }], size), 'Visible stamps remain drawable');
assert(projectPlanePath([{ x: -1, y: 0 }, { x: 1, y: 0 }], camera.orientation,
  { ...camera, orientation: quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2) }, size).length === 1,
  'A stroke crossing the camera near plane retains its visible segment');
for (const view of [camera, { ...camera, zoom: 2 }, moveCameraBySwipe(camera, { x: 45, y: 30 })]) {
  const screen = planeToScreen(p, camera.orientation, view, size)!;
  const restored = screenToPlane(screen, view, size, camera.orientation)!;
  assert(Math.hypot(restored.x - p.x, restored.y - p.y) < 1e-8, 'World-plane projection roundtrip across pan/zoom');
}
const initial = { connections: [], artwork: emptyArtwork(camera.orientation) };
let history: DraftHistory = { present: initial, past: [], future: [] };
history = draftHistoryReducer(history, { type: 'commit', draft: { ...initial, artwork: { ...initial.artwork, stamps: [stamp] } } });
history = draftHistoryReducer(history, { type: 'undo' });
assert(history.present.artwork.stamps.length === 0, 'Undo stamp');
history = draftHistoryReducer(history, { type: 'redo' });
assert(history.present.artwork.stamps[0] === stamp, 'Redo stamp');
history = draftHistoryReducer(draftHistoryReducer(history, { type: 'undo' }), { type: 'commit', draft: { ...initial } });
assert(history.future.length === 0, 'New edits clear redo');
assert(periodKey(new Date(2026, 8, 30, 23, 59)) === '2026-09' && periodKey(new Date(2026, 9, 1)) === '2026-10', 'Month rollover');
const sky = { id: 'test', periodKey: 'test', generatorVersion: 1, stars: [
  { id: 'a', position: { x: 0, y: -20 }, brightness: 1 }, { id: 'b', position: { x: 40, y: -20 }, brightness: 1 },
] };
const old = JSON.stringify({ schemaVersion: 1, skyId: sky.id, registeredStarIds: ['a', 'b'], connections: [{ from: 'a', to: 'b' }], name: '旧星座' });
assert(parseSkySave(old, sky).artwork === null && parseSkySave(old, sky).name === '旧星座', 'Migration preserves old draft');
const oldPoints = planeStars(sky.stars, camera.orientation);
const oldCenter = { x: (oldPoints[0].x + oldPoints[1].x) / 2, y: (oldPoints[0].y + oldPoints[1].y) / 2 };
const tiny = parseSkySave(JSON.stringify({ ...JSON.parse(old), artwork: { frame: camera.orientation, strokes: [],
  stamp: { assetId: 'nikoniko', position: oldCenter, size: 0.012, rotation: 0 } } }), sky);
assert((tiny.artwork?.stamps[0]?.size ?? 0) >= gameConfig.constellationEditor.minStampSize, 'Old nearly invisible faces become visible when space allows');
assert(tiny.artwork?.stamps[0].id === 'legacy-face-0', 'Old single face migrates to stable ID');
const archive = { ...emptySkySave(sky.id), library: [{ id: 'saved', skyId: 'test:2026-09', periodKey: '2026-09', stars: sky.stars,
  starIds: ['a', 'b'], connections: [{ from: 'a', to: 'b' }], artwork: emptyArtwork(camera.orientation), name: '星座', createdAt: '2026-09-25T00:00:00Z' }] };
const loaded = parseSkySave(JSON.stringify(archive), sky);
assert(loaded.library.length === 1 && loaded.library[0].stars.length === 2, 'Archive restores independent star snapshot');
assert(loaded.library.filter((item) => item.periodKey === '2026-10').length === 0 && loaded.library.length === 1, 'Next month hides, never deletes archive');
const updated = { ...loaded.library[0], name: '更新した星座', artwork: { ...tiny.artwork!, stamps: [tiny.artwork!.stamps[0], { ...tiny.artwork!.stamps[0], id: 'face-2' }] } };
const replaced = replaceFinished([...loaded.library, { ...loaded.library[0], id: 'other' }], updated);
assert(replaced.length === 2 && replaced[0].name === updated.name && replaced[1].id === 'other', 'Editing replaces only the same ID');
const multi = parseSkySave(JSON.stringify({ ...tiny, library: replaced, editingId: updated.id, artwork: updated.artwork }), sky);
assert(multi.artwork?.stamps.length === 2 && multi.library[0].artwork.stamps.length === 2 && multi.editingId === updated.id, 'Multiple faces and edit target survive reload');
const owner = loaded.library[0];
assert(availableStars(sky.stars, [owner], owner.skyId).length === 0, 'Owned stars unavailable to a new constellation');
assert(availableStars(sky.stars, [owner], owner.skyId, owner.id).length === 2, 'Own stars remain editable');
assert(availableStars(sky.stars, [owner], 'test:2026-10').length === 2, 'Past-month ownership does not block this month');
let rejected = false;
try { validateConnections(owner, sky.stars, [owner], owner.skyId, null); } catch { rejected = true; }
assert(rejected, 'Save must reject ownership violations');
validateConnections(owner, sky.stars, [owner], owner.skyId, owner.id);
const choices = creationChoices(sky.stars, [owner], owner.skyId, camera, size);
assert(!choices.canCreate && choices.candidates.length === 1, 'Owned stars offer edit, not creation');
assert(preferredCreationTarget(choices, camera, size) === owner.id, 'Crafting opens the only editable constellation directly');
assert(preferredCreationTarget({ ...choices, canCreate: true }, camera, size) === null, 'New work takes priority when free stars are available');
assert(preferredCreationTarget({ canCreate: false, candidates: [] }, camera, size) === undefined, 'Crafting cannot open without a valid target');
const pair = touchPair({ x: -1, y: 0 }, { x: 1, y: 0 });
const turned = transformStamp(stamp, pair, touchPair({ x: 0, y: -1 }, { x: 0, y: 1 }));
assert(Math.abs(turned.rotation - Math.PI / 2) < 1e-8 && turned.position.x === stamp.position.x, 'Two fingers rotate stamp without translating it');
assert(stampAt(stamp.position, [turned])?.id === stamp.id && !stampAt({ x: 10, y: 10 }, [turned]), 'Rotated stamp hit test');
const moved = transformCanvas(camera, touchPair({ x: 100, y: 100 }, { x: 200, y: 100 }), touchPair({ x: 130, y: 120 }, { x: 230, y: 120 }));
assert(JSON.stringify(moved.orientation) !== JSON.stringify(camera.orientation) && moved.zoom === 1, 'Parallel fingers pan without zooming');
const textured = { id: 'stable', paths: [[{ x: 0, y: 0 }, { x: 0.1, y: 0.02 }]] };
assert(JSON.stringify(texturedStroke(textured)) === JSON.stringify(texturedStroke(JSON.parse(JSON.stringify(textured)))), 'Brush texture stable after saving');
assert(texturedStroke(textured).every((layer) => layer.rings.length > 0), 'Brush uses subtle in-line opacity variation');
console.log('Drawing regions, concavity, crossings, clipping, stamp containment, coordinates, undo/redo, migration and month archive passed.');
