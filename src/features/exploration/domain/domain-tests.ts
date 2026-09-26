import { gameConfig } from '../../../config/gameConfig.ts';
import type { Sky, Star } from '../../sky/domain/types.ts';
import {
  cameraForward,
  cameraOrientationToward,
  createInitialCamera,
  getVisibleStars,
  moveCameraBySwipe,
  setCameraMode,
  worldToScreen,
} from './camera.ts';
import { getDowsingSignal } from './dowsing.ts';
import { createDeviceMotionTracking, createPortraitDeviceMotionTracking, normalizeAngleDifference, relativeDeviceRotation, updateDeviceMotionTracking } from './deviceMotion.ts';
import { createExplorationState, explorationReducer } from './explorationState.ts';
import { moveCameraByInput } from './input.ts';
import { identityQuaternion, multiplyQuaternions, quaternionAngle, quaternionFromAxisAngle, rotateVector, type Quaternion } from './orientation.ts';
import { mountainWorldToPanorama, worldDirectionToPanoramaUv } from '../../sky/domain/panorama.ts';
import { getSkyDensitySignal } from './skyDensity.ts';
import { getTelescopePreviewScale, getVerticalFovRadians } from './viewDirection.ts';
import { getPinchDistance, getPinchModeChange } from './pinch.ts';
import { angularDistance, isStarAboveHorizon, skyPointToDirection } from '../../sky/domain/sphericalCoordinates.ts';
import { phaseOneSky } from '../../sky/domain/sampleSky.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertNear(actual: number, expected: number, message: string) {
  assert(Math.abs(actual - expected) < 1e-10, `${message}: expected ${expected}, got ${actual}`);
}

const groundDirection = rotateVector(mountainWorldToPanorama, { x: 0, y: -1, z: 0 });
assertNear(groundDirection.x, 0, 'world down should sample the mountain ground cap');
assertNear(groundDirection.y, 0, 'mountain ground cap should lie on the texture equator');
assertNear(groundDirection.z, 1, 'mountain ground cap is centered on texture +Z');
const zenithUv = worldDirectionToPanoramaUv({ x: 0, y: 1, z: 0 }, mountainWorldToPanorama);
assertNear(zenithUv.u, 0.5, 'world up should sample the transparent opposite cap');
assertNear(zenithUv.v, 0.5, 'world up should sample the texture equator');
const skyForwardUv = worldDirectionToPanoramaUv({ x: 0, y: 0, z: -1 });
assertNear(skyForwardUv.u, 0.5, 'sky longitude should remain unchanged');
assertNear(skyForwardUv.v, 0.5, 'sky latitude should remain unchanged');

const rolledCamera = multiplyQuaternions(
  quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 1.2),
  multiplyQuaternions(
    quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.3),
    quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, -0.7),
  ),
);
const offCenterRay = { x: 0.6, y: 0, z: -0.8 };
const worldRay = rotateVector(rolledCamera, offCenterRay);
const debugUv = worldDirectionToPanoramaUv(worldRay, mountainWorldToPanorama, 0.1);
const shaderRay = rotateVector(multiplyQuaternions(mountainWorldToPanorama, rolledCamera), offCenterRay);
const shaderUv = worldDirectionToPanoramaUv(shaderRay, undefined, 0.1);
assertNear(debugUv.u, shaderUv.u, 'debug and renderer longitude should agree under yaw, pitch and roll');
assertNear(debugUv.v, shaderUv.v, 'debug and renderer latitude should agree under yaw, pitch and roll');
for (const offset of [-2.5, -1, 0, 1, 2.5]) {
  const uv = worldDirectionToPanoramaUv({ x: 0, y: -1, z: 0 }, mountainWorldToPanorama, offset);
  assert(uv.u >= 0 && uv.u < 1, 'panorama seam and longitude offsets should wrap');
}

const size = { width: 1000, height: 1000 };
const stars: Star[] = [
  { id: 'near', position: { x: 25, y: 0 }, brightness: 1 },
  { id: 'far', position: { x: 900, y: 0 }, brightness: 1 },
];
const lowerStar: Star = { id: 'lower', position: { x: 0, y: 100 }, brightness: 1 };

assert(!isStarAboveHorizon(lowerStar), 'stars below the celestial equator should be excluded');

const initialCamera = createInitialCamera();
assert(getVerticalFovRadians('telescope') < getVerticalFovRadians('normal') / 1.8,
  'telescope mode should have a substantially narrower view');
assertEqual(phaseOneSky.stars[0].position.x, 360 * gameConfig.prototypeStarSpacingScale,
  'prototype spacing should be adjustable without changing authored coordinates');
assertEqual(initialCamera.mode, 'normal', 'initial mode should be normal');
assertEqual(getVisibleStars(initialCamera, stars, size).length, 0, 'normal mode should hide stars');

const normalMoved = moveCameraBySwipe(initialCamera, { x: -100, y: 0 });
const swipeRightCamera = moveCameraBySwipe(initialCamera, { x: 100, y: 0 });
const starScreenBeforeSwipe = worldToScreen(stars[0].position, initialCamera, size);
const starScreenAfterSwipe = worldToScreen(stars[0].position, swipeRightCamera, size);
assert(starScreenBeforeSwipe && starScreenAfterSwipe, 'front-facing stars should project to the screen');
assert(
  starScreenAfterSwipe.x > starScreenBeforeSwipe.x,
  'swipe should feel like grabbing the sky and moving it with the finger',
);

const normalMovedByInput = moveCameraByInput(initialCamera, {
  source: 'swipe',
  delta: { x: -100, y: 0 },
});
assertEqual(
  quaternionAngle(normalMovedByInput.orientation),
  quaternionAngle(normalMoved.orientation),
  'swipe input should map to camera rotation',
);

const gyroRotation = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.1);
const deviceMotionMoved = moveCameraByInput(initialCamera, {
  source: 'deviceMotion',
  rotation: gyroRotation,
});
assert(
  quaternionAngle(deviceMotionMoved.orientation) > 0,
  'device motion should apply a three-axis camera rotation',
);

const telescopeCamera = setCameraMode(initialCamera, 'telescope');
const telescopeMoved = moveCameraBySwipe(telescopeCamera, { x: -100, y: 0 });
assert(
  quaternionAngle(normalMoved.orientation) > quaternionAngle(telescopeMoved.orientation),
  'normal mode should move farther than telescope mode',
);
assertEqual(telescopeMoved.mode, 'telescope', 'telescope mode should be preserved after movement');
assert(
  Math.abs(normalizeAngleDifference(Math.PI - 0.1, -Math.PI + 0.1) + 0.2) < 0.0001,
  'angle difference should wrap across the panorama seam',
);

const visibleCamera = setCameraMode(initialCamera, 'telescope');
assertEqual(
  getVisibleStars(visibleCamera, stars, size).map((star) => star.id).join(','),
  'near',
  'telescope mode should only show stars inside its circular view',
);
assertEqual(
  getVisibleStars(visibleCamera, [...stars, lowerStar], size).map((star) => star.id).join(','),
  'near',
  'stars below the horizon should not render in the telescope view',
);
const visibleStarScreenPoint = worldToScreen(stars[0].position, visibleCamera, size);
assert(visibleStarScreenPoint &&
  Math.hypot(visibleStarScreenPoint.x - size.width / 2, visibleStarScreenPoint.y - size.height / 2) <=
    Math.min(size.width * 0.8, size.height * 0.4) / 2,
  'the projected tap target should stay inside the telescope circle');
assert(angularDistance(cameraForward({ ...visibleCamera, orientation: cameraOrientationToward(visibleCamera,
  skyPointToDirection(stars[0].position)) }), skyPointToDirection(stars[0].position)) < 1e-8,
  'focusing should place the selected star at the center');

const signal = getDowsingSignal(visibleCamera, stars);
assertEqual(signal.targetStarId, 'near', 'dowsing should choose the nearest star');
assert(
  signal.closeness > 1 - 50 / gameConfig.dowsingMaxDistance - 0.001,
  'dowsing should report angular closeness',
);
assertEqual(signal.angleRadians, 0, 'dowsing should point toward the star');
assertEqual(
  getDowsingSignal(visibleCamera, [lowerStar]).targetStarId,
  null,
  'dowsing should ignore stars below the horizon',
);

const richDensity = getSkyDensitySignal(initialCamera, stars, [], size);
const turnedAwayCamera = moveCameraBySwipe(initialCamera, { x: 1000, y: 0 });
const quietDensity = getSkyDensitySignal(turnedAwayCamera, stars, [], size);
assertEqual(richDensity.count, 1, 'density should count stars inside the exploration circle');
assert(richDensity.intensity > quietDensity.intensity, 'density should follow the camera direction');
assertEqual(
  getSkyDensitySignal(initialCamera, stars, ['near'], size).count,
  0,
  'density should ignore discovered stars',
);
assertEqual(
  getSkyDensitySignal(initialCamera, [lowerStar], [], size).count,
  0,
  'density should ignore stars below the horizon',
);
const clusteredStars: Star[] = [
  { id: 'cluster-a', position: { x: 40, y: 0 }, brightness: 1 },
  { id: 'cluster-b', position: { x: 80, y: -20 }, brightness: 1 },
  { id: 'cluster-c', position: { x: 100, y: -30 }, brightness: 1 },
  { id: 'cluster-d', position: { x: 130, y: -40 }, brightness: 1 },
];
assertEqual(
  getSkyDensitySignal(initialCamera, clusteredStars, [], size).label,
  'many',
  'four stars in one patch should trigger the three-star density icon',
);

function assertOrientation(actual: Quaternion, expected: Quaternion, message: string) {
  const error = quaternionAngle(relativeDeviceRotation(expected, actual));
  assert(error < 1e-6, `${message}: error ${error * 180 / Math.PI} degrees`);
}

// Same pose, different speeds: both the dead-zone loss and capped-step loss used to accumulate.
const portraitDevice = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
for (const axis of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
  for (const [outSteps, backSteps] of [[900, 100], [4, 100], [100, 4]]) {
    let tracking = createDeviceMotionTracking(portraitDevice, rolledCamera);
    for (let cycle = 0; cycle < 3; cycle++) {
      const angles = [
        ...Array.from({ length: outSteps }, (_, i) => Math.PI / 2 * (i + 1) / outSteps),
        ...Array<number>(60).fill(Math.PI / 2),
        ...Array.from({ length: backSteps }, (_, i) => Math.PI / 2 * (1 - (i + 1) / backSteps)),
        ...Array<number>(100).fill(0),
      ];
      for (const angle of angles) {
        const device = multiplyQuaternions(portraitDevice, quaternionFromAxisAngle(axis, angle));
        const previous = tracking.orientation;
        tracking = updateDeviceMotionTracking(tracking, device);
        assert(
          quaternionAngle(relativeDeviceRotation(previous, tracking.orientation)) <= gameConfig.deviceMotion.maxStepRadians + 1e-8,
          'sudden device changes should still respect the displayed rotation limit',
        );
        assertOrientation(tracking.target, multiplyQuaternions(rolledCamera, quaternionFromAxisAngle(axis, angle)),
          'the full target angle must survive smoothing and rate limiting');
      }
      assertOrientation(tracking.orientation, rolledCamera, 'mixed-speed round trips must return to the original pose');
    }
  }
}

let tracking = createDeviceMotionTracking(portraitDevice, identityQuaternion);
const tinyRotation = multiplyQuaternions(portraitDevice, quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.001));
for (let i = 0; i < 100; i++) tracking = updateDeviceMotionTracking(tracking, tinyRotation);
assertOrientation(tracking.orientation, quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.001),
  'small sustained movements must not be discarded');
const jitter = 0.002;
for (let i = 0; i < 100; i++) {
  tracking = updateDeviceMotionTracking(tracking, multiplyQuaternions(portraitDevice,
    quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, i % 2 ? jitter : -jitter)));
}
assert(quaternionAngle(tracking.orientation) < jitter / 2, 'smoothing should still attenuate small alternating jitter');
for (let i = 0; i < 150; i++) {
  const yaw = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, i * 0.12);
  const pitch = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.sin(i * 0.05));
  const roll = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, i * 0.08);
  const device = multiplyQuaternions(portraitDevice, multiplyQuaternions(yaw, multiplyQuaternions(pitch, roll)));
  tracking = updateDeviceMotionTracking(tracking, i % 2
    ? { x: -device.x, y: -device.y, z: -device.z, w: -device.w }
    : device);
}
for (let i = 0; i < 150; i++) tracking = updateDeviceMotionTracking(tracking, portraitDevice);
assertOrientation(tracking.orientation, identityQuaternion, 'multi-axis turns and quaternion sign changes must not cause drift');

const testSky: Sky = { id: 'test', periodKey: 'test', generatorVersion: 1, stars };
let exploration = createExplorationState();
exploration = explorationReducer(exploration, { type: 'beginRecenter' });
assertEqual(exploration.recenterStartOffset, null, 'recenter without a sensor should be a no-op');
exploration = explorationReducer(exploration, { type: 'beginDrag' });
exploration = explorationReducer(exploration, { type: 'dragTo', delta: { x: 40, y: -20 }, sky: testSky });
const fallbackCamera = exploration.camera;
assertOrientation(fallbackCamera.orientation, moveCameraBySwipe(initialCamera, { x: 40, y: -20 }).orientation,
  'swipe should still work without sensors');
exploration = explorationReducer(exploration, { type: 'endDrag' });
exploration = explorationReducer(exploration, { type: 'deviceMotionOrientation', orientation: fallbackCamera.orientation, sky: testSky });
assertOrientation(exploration.camera.orientation, fallbackCamera.orientation, 'initial sensor activation should preserve the view');
exploration = explorationReducer(exploration, { type: 'beginDrag' });
const swipe = { x: 80, y: 30 };
exploration = explorationReducer(exploration, { type: 'dragTo', delta: swipe, sky: testSky });
const swipedCamera = exploration.camera;
const offset = exploration.swipeOffset;
exploration = explorationReducer(exploration, { type: 'deviceMotionOrientation', orientation: rolledCamera, sky: testSky });
assertOrientation(exploration.camera.orientation, multiplyQuaternions(offset, rolledCamera),
  'sensor motion during dragging must not be lost');
exploration = explorationReducer(exploration, { type: 'dragTo', delta: swipe, sky: testSky });
assertOrientation(exploration.camera.orientation, multiplyQuaternions(offset, rolledCamera),
  'repeated gesture totals must not double-count motion');
exploration = explorationReducer(exploration, { type: 'endDrag' });
exploration = explorationReducer(exploration, { type: 'deviceMotionOrientation', orientation: fallbackCamera.orientation, sky: testSky });
assertOrientation(exploration.camera.orientation, swipedCamera.orientation, 'a device round trip should preserve only the intentional swipe');

exploration = explorationReducer(exploration, { type: 'beginRecenter' });
const startRecenterCamera = exploration.camera;
exploration = explorationReducer(exploration, { type: 'recenterProgress', progress: 0, sky: testSky });
assertOrientation(exploration.camera.orientation, startRecenterCamera.orientation, 'recenter should not jump at its first frame');
exploration = explorationReducer(exploration, { type: 'recenterProgress', progress: 0.5, sky: testSky });
assert(quaternionAngle(exploration.swipeOffset) < quaternionAngle(offset), 'recenter should progressively remove swipe');
const duringRecenter = exploration.camera.orientation;
exploration = explorationReducer(exploration, { type: 'deviceMotionOrientation', orientation: rolledCamera, sky: testSky });
assertOrientation(exploration.camera.orientation, duringRecenter, 'sensor samples must not trigger extra panorama frames during recenter');
exploration = explorationReducer(exploration, { type: 'recenterProgress', progress: 1, orientation: rolledCamera, sky: testSky });
assertOrientation(exploration.camera.orientation, rolledCamera, 'recenter must finish at the latest device pose');
assertOrientation(exploration.swipeOffset, identityQuaternion, 'recenter must remove all swipe offset');
let resumed = exploration;
const beforeResume = resumed.camera.orientation;
const resumedPose = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.42);
resumed = explorationReducer(resumed, { type: 'resumeGyro', orientation: resumedPose });
assertOrientation(resumed.camera.orientation, beforeResume, 'enabling gyro must preserve the current view');
resumed = explorationReducer(resumed, { type: 'deviceMotionOrientation', orientation: resumedPose, sky: testSky });
assertOrientation(resumed.camera.orientation, beforeResume, 'first live sensor sample must not jump');

exploration = explorationReducer(exploration, { type: 'setMode', mode: 'telescope', sky: testSky });
const telescopeStart = exploration.camera;
const loweredDevice = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, -0.65);
exploration = explorationReducer(exploration, { type: 'deviceMotionOrientation', orientation: loweredDevice, sky: testSky });
assertOrientation(exploration.camera.orientation, telescopeStart.orientation, 'telescope should not move with gyro');
exploration = explorationReducer(exploration, { type: 'beginDrag' });
exploration = explorationReducer(exploration, { type: 'dragTo', delta: swipe, sky: testSky });
assertOrientation(exploration.camera.orientation, moveCameraBySwipe(telescopeStart, swipe).orientation,
  'telescope swipe sensitivity should remain unchanged');
exploration = explorationReducer(exploration, { type: 'setMode', mode: 'normal', sky: testSky });
assertOrientation(exploration.camera.orientation, loweredDevice, 'normal mode should resume the current device direction');
assertOrientation(exploration.swipeOffset, identityQuaternion, 'telescope swipes must not become normal-mode offsets');
exploration = explorationReducer(exploration, { type: 'deviceMotionOrientation', orientation: loweredDevice, sky: testSky });
assertOrientation(exploration.camera.orientation, loweredDevice, 'the next sensor sample should not jump after a mode change');
exploration = explorationReducer(exploration, { type: 'beginRecenter' });
exploration = explorationReducer(exploration, { type: 'recenterProgress', progress: 1, sky: testSky });
assertOrientation(exploration.camera.orientation, loweredDevice, 'mode changes must not recalibrate the original gyro reference');

let swipeOnly = createExplorationState();
swipeOnly = explorationReducer(swipeOnly, { type: 'setMode', mode: 'telescope', sky: testSky });
swipeOnly = explorationReducer(swipeOnly, { type: 'beginDrag' });
swipeOnly = explorationReducer(swipeOnly, { type: 'dragTo', delta: swipe, sky: testSky });
const swipeOnlyView = swipeOnly.camera.orientation;
swipeOnly = explorationReducer(swipeOnly, { type: 'setMode', mode: 'normal', sky: testSky });
assertOrientation(swipeOnly.camera.orientation, swipeOnlyView, 'without a gyro, returning to normal keeps the visible direction');

let pointed = createExplorationState();
pointed = explorationReducer(pointed, { type: 'deviceMotionOrientation', orientation: identityQuaternion, sky: testSky });
pointed = explorationReducer(pointed, { type: 'beginDrag' });
pointed = explorationReducer(pointed, { type: 'dragTo', delta: { x: 40, y: -20 }, sky: testSky });
const normalOffset = pointed.swipeOffset;
pointed = explorationReducer(pointed, { type: 'setMode', mode: 'telescope', sky: testSky });
pointed = explorationReducer(pointed, { type: 'deviceMotionOrientation', orientation: loweredDevice, sky: testSky });
pointed = explorationReducer(pointed, { type: 'beginDrag' });
pointed = explorationReducer(pointed, { type: 'dragTo', delta: { x: -40, y: 20 }, sky: testSky });
pointed = explorationReducer(pointed, { type: 'setMode', mode: 'normal', sky: testSky });
assertOrientation(pointed.camera.orientation, multiplyQuaternions(normalOffset, loweredDevice),
  'returning to normal should keep its original swipe offset over the current device pose');

let focusedWithGyro = createExplorationState();
focusedWithGyro = explorationReducer(focusedWithGyro, { type: 'deviceMotionOrientation', orientation: identityQuaternion, sky: testSky });
focusedWithGyro = explorationReducer(focusedWithGyro, { type: 'setMode', mode: 'telescope', sky: testSky });
focusedWithGyro = explorationReducer(focusedWithGyro, { type: 'selectStar', starId: 'near', size, sky: testSky });
assert(focusedWithGyro.focus, 'the nearby star should be selectable');
focusedWithGyro = explorationReducer(focusedWithGyro, { type: 'focusProgress', progress: 1, sky: testSky });
focusedWithGyro = explorationReducer(focusedWithGyro, { type: 'deviceMotionOrientation', orientation: loweredDevice, sky: testSky });
focusedWithGyro = explorationReducer(focusedWithGyro, { type: 'setMode', mode: 'normal', sky: testSky });
assertOrientation(focusedWithGyro.camera.orientation, loweredDevice,
  'returning after star focus should look where the device is pointed');
exploration = explorationReducer(exploration, { type: 'beginRecenter' });
exploration = explorationReducer(exploration, { type: 'beginDrag' });
exploration = explorationReducer(exploration, { type: 'dragTo', delta: swipe, sky: testSky });
const interruptedRecenter = exploration;
exploration = explorationReducer(exploration, { type: 'recenterProgress', progress: 1, sky: testSky });
assertEqual(exploration, interruptedRecenter, 'stale recenter frames must not overwrite a new swipe');

const discoverySky: Sky = { id: 'discovery', periodKey: 'test', generatorVersion: 1, stars: [stars[0], lowerStar] };
let discovery = createExplorationState();
discovery = explorationReducer(discovery, { type: 'selectStar', starId: 'near', size, sky: discoverySky });
assertEqual(discovery.focus, null, 'normal mode must not select a hidden star');
discovery = explorationReducer(discovery, { type: 'setMode', mode: 'telescope', sky: discoverySky });
discovery = explorationReducer(discovery, { type: 'selectStar', starId: 'lower', size, sky: discoverySky });
assertEqual(discovery.focus, null, 'below-horizon stars must not be selectable');
discovery = explorationReducer(discovery, { type: 'selectStar', starId: 'near', size, sky: discoverySky });
assertEqual(discovery.focus?.starId, 'near', 'tapping a visible star should begin centering');
assertEqual(discovery.discoveredStarIds.length, 0, 'entering the view must not register a star');
const beforeFocus = discovery.camera.orientation;
discovery = explorationReducer(discovery, { type: 'focusProgress', progress: 0, sky: discoverySky });
assertOrientation(discovery.camera.orientation, beforeFocus, 'focus should start without a jump');
discovery = explorationReducer(discovery, { type: 'focusProgress', progress: 1, sky: discoverySky });
assertEqual(discovery.foundStarId, 'near', 'focus completion should reveal the discovery action');
assertEqual(discovery.discoveredStarIds.length, 0, 'found stars should remain unregistered until confirmation');
assert(angularDistance(cameraForward(discovery.camera), skyPointToDirection(stars[0].position)) < 1e-8,
  'focus completion should center the star');
const lockedCamera = discovery.camera.orientation;
discovery = explorationReducer(discovery, { type: 'beginDrag' });
discovery = explorationReducer(discovery, { type: 'dragTo', delta: { x: 200, y: 0 }, sky: discoverySky });
assertOrientation(discovery.camera.orientation, lockedCamera, 'drag should not dismiss the registration prompt');
discovery = explorationReducer(discovery, { type: 'registerStar', sky: discoverySky });
assertEqual(discovery.discoveredStarIds.join(','), 'near', 'register should persist the star in session state');
assertEqual(discovery.foundStarId, null, 'register should dismiss the discovery prompt');
discovery = explorationReducer(discovery, { type: 'registerStar', sky: discoverySky });
assertEqual(discovery.discoveredStarIds.length, 1, 'registering twice must not duplicate the star');
const resetDiscovery = explorationReducer({ ...discovery, discoveredStarIds: ['near', 'other'] },
  { type: 'resetDiscoveredStars', protectedIds: ['near'] });
assertEqual(resetDiscovery.discoveredStarIds.join(','), 'near', 'debug reset must preserve stars owned by saved constellations');
assertEqual(getDowsingSignal(discovery.camera, discoverySky.stars.filter(
  (star) => !discovery.discoveredStarIds.includes(star.id))).label, 'silent',
  'radar must go silent once all eligible stars are registered');
discovery = explorationReducer(discovery, { type: 'setMode', mode: 'normal', sky: discoverySky });
assertEqual(discovery.discoveredStarIds.join(','), 'near', 'registered stars should remain available in normal mode');

assertEqual(getDowsingSignal(discovery.camera, discoverySky.stars, ['near']).label, 'silent',
  'radar must exclude registered IDs at its domain boundary');
assertNear(getTelescopePreviewScale(), 1 / gameConfig.panorama.telescopeZoom,
  'preview circle should match the telescope perspective footprint');
assertNear(getPinchDistance([{ pageX: 0, pageY: 0 }, { pageX: 0, pageY: 100 }]) ?? 0, 100,
  'two-finger distance should be measured from touch positions');
assertEqual(getPinchDistance([{ pageX: 0, pageY: 0 }]), null,
  'a single finger must never start a pinch');
assertEqual(getPinchModeChange('normal', 100, 125), null,
  'small outward gestures must not switch modes');
assertEqual(getPinchModeChange('normal', 100, 135), 'telescope',
  'large outward gestures should enter the telescope');
assertEqual(getPinchModeChange('telescope', 140, 100), 'normal',
  'large inward gestures should leave the telescope');
assertEqual(getPinchModeChange('telescope', 140, 120), null,
  'small inward gestures must not switch modes');
assertEqual(getPinchModeChange('normal', 100, 65), null,
  'inward gestures must not enter the telescope');

const portrait = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
for (const tilt of [-Math.PI / 6, 0, Math.PI / 6]) {
  const tiltedDevice = multiplyQuaternions(portrait,
    multiplyQuaternions(
      quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, tilt),
      quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, 0.3),
    ));
  let uprightTracking = createPortraitDeviceMotionTracking(tiltedDevice);
  for (let frame = 0; frame < 150; frame++) uprightTracking = updateDeviceMotionTracking(uprightTracking, portrait);
  assertNear(rotateVector(uprightTracking.orientation, { x: 0, y: 0, z: -1 }).y, 0,
    'upright forward must remain horizontal regardless of startup pitch and roll');
  assertNear(rotateVector(uprightTracking.orientation, { x: 0, y: 1, z: 0 }).y, 1,
    'upright horizon must be level regardless of startup pitch and roll');
}
let flatTracking = createPortraitDeviceMotionTracking(identityQuaternion);
assertNear(rotateVector(flatTracking.orientation, { x: 0, y: 0, z: -1 }).y, -1,
  'screen-up phone must look down even when started flat');
for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2, 0]) {
  const spun = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, angle);
  for (let frame = 0; frame < 150; frame++) flatTracking = updateDeviceMotionTracking(flatTracking, spun);
  assertNear(rotateVector(flatTracking.orientation, { x: 0, y: 0, z: -1 }).y, -1,
    'spinning a flat phone must retain the downwards view');
}
console.log('Portrait gravity alignment, telescope preview and registered radar tests passed.');

for (const heading of [0, Math.PI / 2, -Math.PI / 2]) {
  const sensorYaw = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, heading);
  const startup = multiplyQuaternions(sensorYaw, portrait);
  for (const pitch of [-Math.PI / 6, 0, Math.PI / 6]) {
    const pitched = multiplyQuaternions(startup, quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch));
    const rolled = multiplyQuaternions(pitched, quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, 0.5));
    let pose = createPortraitDeviceMotionTracking(startup);
    for (let frame = 0; frame < 150; frame++) pose = updateDeviceMotionTracking(pose, rolled);
    const forward = rotateVector(pose.orientation, { x: 0, y: 0, z: -1 });
    assertNear(forward.x, 0, 'portrait roll must not steer the view sideways');
    assertNear(forward.y, Math.sin(pitch), 'portrait pitch must retain its physical elevation');
  }
  let pose = createPortraitDeviceMotionTracking(startup);
  const turned = multiplyQuaternions(quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2), startup);
  for (let frame = 0; frame < 150; frame++) pose = updateDeviceMotionTracking(pose, turned);
  const forward = rotateVector(pose.orientation, { x: 0, y: 0, z: -1 });
  assertNear(forward.x, -1, 'turning left 90 degrees must turn the camera left 90 degrees');
  assertNear(forward.y, 0, 'horizontal turns must retain the horizon');
}
