import { cameraOrientationToward, createInitialCamera, worldToScreen } from '../../exploration/domain/camera.ts';
import type { Sky } from '../../sky/domain/types.ts';
import { phaseOneSky } from '../../sky/domain/sampleSky.ts';
import { isStarAboveHorizon, skyPointToDirection } from '../../sky/domain/sphericalCoordinates.ts';
import { clampEditorZoom, connectionAtPoint, editorReducer, getCraftableStars, nearestStar, type EditorState } from './editor.ts';
import { normalizeConstellationName, parseSkySave } from './saveData.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected structure');
  },
  ok(condition: boolean) { if (!condition) throw new Error('Assertion failed'); },
  throws(run: () => unknown) {
    try { run(); } catch { return; }
    throw new Error('Expected an error');
  },
};

let state: EditorState = { connections: [], history: [] };
for (const prefix of ['west-arc-', 'north-loop-']) {
  const cluster = phaseOneSky.stars.filter((star) => star.id.startsWith(prefix));
  assert.equal(cluster.length, 4);
  assert.ok(cluster.every(isStarAboveHorizon));
  const camera = createInitialCamera();
  const pointed = { ...camera, orientation: cameraOrientationToward(camera, skyPointToDirection(cluster[0].position)) };
  const craftable = new Set(getCraftableStars(cluster, pointed, { width: 390, height: 844 }).map((star) => star.id));
  assert.ok(cluster.every((star) => craftable.has(star.id)));
}
state = editorReducer(state, { type: 'connect', from: 'a', to: 'b' });
assert.equal(editorReducer(state, { type: 'connect', from: 'b', to: 'a' }), state);
assert.equal(editorReducer(state, { type: 'connect', from: 'a', to: 'a' }), state);
state = editorReducer(state, { type: 'connect', from: 'a', to: 'c' });
assert.equal(state.connections.length, 2);
state = editorReducer(state, { type: 'remove', connection: { from: 'b', to: 'a' } });
assert.deepEqual(state.connections, [{ from: 'a', to: 'c' }]);
state = editorReducer(state, { type: 'undo' });
assert.equal(state.connections.length, 2);
state = editorReducer(state, { type: 'undo' });
assert.deepEqual(state.connections, [{ from: 'a', to: 'b' }]);

const points = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 80, y: 40 }];
assert.equal(nearestStar({ x: 91, y: 3 }, points, 34, 'a')?.id, 'b');
assert.equal(nearestStar({ x: 40, y: 70 }, points, 34), null);
assert.equal(connectionAtPoint({ x: 50, y: 12 }, state.connections, points)?.from, 'a');
assert.equal(connectionAtPoint({ x: 50, y: 20 }, state.connections, points), null);

const camera = createInitialCamera();
const size = { width: 390, height: 844 };
const sky: Sky = { id: 'editor-test', periodKey: 'test', generatorVersion: 1, stars: [
  { id: 'a', position: { x: 20, y: -10 }, brightness: 1 },
  { id: 'b', position: { x: 80, y: -30 }, brightness: 1 },
  { id: 'far', position: { x: 1000, y: -1000 }, brightness: 1 },
  { id: 'below', position: { x: 0, y: 10 }, brightness: 1 },
] };
assert.deepEqual(getCraftableStars(sky.stars, camera, size).map((star) => star.id), ['a', 'b']);
assert.equal(getCraftableStars(sky.stars, { ...camera, mode: 'telescope' }, size).length, 0);
const before = worldToScreen(sky.stars[0].position, camera, size)!;
const after = worldToScreen(sky.stars[0].position, { ...camera, zoom: 2 }, size)!;
assert.ok(Math.abs(after.x - size.width / 2 - 2 * (before.x - size.width / 2)) < 1e-8);
assert.ok(Math.abs(after.y - size.height / 2 - 2 * (before.y - size.height / 2)) < 1e-8);
assert.equal(clampEditorZoom(0), 0.7);
assert.equal(clampEditorZoom(20), 4);

const saved = parseSkySave(JSON.stringify({ schemaVersion: 1, skyId: sky.id,
  registeredStarIds: ['a', 'b', 'a', 'unknown', 'below'],
  connections: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'unknown' }, { from: 'a', to: 'a' }],
}), sky);
assert.deepEqual(saved.registeredStarIds, ['a', 'b']);
assert.deepEqual(saved.connections, [{ from: 'a', to: 'b' }]);
assert.deepEqual(parseSkySave(JSON.stringify(saved), sky), saved);
assert.equal(saved.name, '');
assert.equal(normalizeConstellationName('  夏の   三角  '), '夏の 三角');
assert.equal(normalizeConstellationName('   '), '');
assert.equal(Array.from(normalizeConstellationName('星'.repeat(50))).length, 40);
assert.equal(parseSkySave(JSON.stringify({ ...saved, name: '夜の手紙' }), sky).name, '夜の手紙');
assert.throws(() => parseSkySave('{bad', sky));
assert.throws(() => parseSkySave('{"schemaVersion":2}', sky));
console.log('Constellation edges, undo, hit testing, projection, eligibility and save validation passed.');
