import { Asset } from 'expo-asset';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { gameConfig } from '@/config/gameConfig';
import type { CameraState, ScreenSize } from '@/features/exploration/domain/camera';
import { getCameraVerticalFovRadians } from '@/features/exploration/domain/viewDirection';
import { identityQuaternion, multiplyQuaternions, type Quaternion } from '@/features/exploration/domain/orientation';
import { mountainWorldToPanorama } from '@/features/sky/domain/panorama';
import { skyPointToDirection } from '@/features/sky/domain/sphericalCoordinates';
import type { Star } from '@/features/sky/domain/types';
import { createEdgeGlowPass, drawEdgeGlow, type EdgeGlow, type EdgeGlowPass } from '@/features/exploration/rendering/edgeGlow';

const panoramaAsset = require('@/assets/images/sky-panorama.png');
const mountainPanoramaAsset = require('@/assets/images/mountain_new.png');

type SkyPanoramaViewProps = {
  camera: CameraState;
  discoveredStarIds: string[];
  size: ScreenSize;
  stars: Star[];
  edgeGlow?: EdgeGlow;
};

type PanoramaPass = {
  program: WebGLProgram;
  orientationLocation: WebGLUniformLocation | null;
  fovLocation: WebGLUniformLocation | null;
  aspectLocation: WebGLUniformLocation | null;
  textureLocation: WebGLUniformLocation | null;
  longitudeOffsetLocation: WebGLUniformLocation | null;
};

type PanoramaRenderer = {
  gl: ExpoWebGLRenderingContext;
  skyPass: PanoramaPass;
  mountainPass: PanoramaPass;
  starProgram: WebGLProgram;
  starOrientationLocation: WebGLUniformLocation | null;
  starFovLocation: WebGLUniformLocation | null;
  starAspectLocation: WebGLUniformLocation | null;
  starPixelRatioLocation: WebGLUniformLocation | null;
  starScaleLocation: WebGLUniformLocation | null;
  vertexBuffer: WebGLBuffer;
  starBuffer: WebGLBuffer;
  skyTexture: WebGLTexture;
  mountainTexture: WebGLTexture;
  edgeGlowPass: EdgeGlowPass;
};

export function SkyPanoramaView({ camera, discoveredStarIds, size, stars, edgeGlow }: SkyPanoramaViewProps) {
  const rendererRef = useRef<PanoramaRenderer | null>(null);
  const latest = useRef({ camera, discoveredStarIds, size, stars });
  const glowRef = useRef<EdgeGlow>({ color: edgeGlow?.color ?? '#ffffff', opacity: 0 });
  const mounted = useRef(true);
  useLayoutEffect(() => { latest.current = { camera, discoveredStarIds, size, stars }; }, [camera, discoveredStarIds, size, stars]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (rendererRef.current) disposeRenderer(rendererRef.current);
      rendererRef.current = null;
    };
  }, []);

  const render = useCallback((nextCamera: CameraState, nextSize: ScreenSize, nextStars: Star[], nextDiscoveredIds: string[]) => {
    const renderer = rendererRef.current;

    if (!renderer) {
      return;
    }

    renderPanorama(renderer, nextCamera, nextSize, nextStars, nextDiscoveredIds, glowRef.current);
  }, []);

  useEffect(() => {
    render(camera, size, stars, discoveredStarIds);
  }, [camera, discoveredStarIds, render, size, stars]);

  useEffect(() => {
    const from = glowRef.current.opacity;
    const target = edgeGlow?.opacity ?? 0;
    glowRef.current.color = edgeGlow?.color ?? glowRef.current.color;
    const repaint = () => {
      const current = latest.current;
      render(current.camera, current.size, current.stars, current.discoveredStarIds);
    };
    if (Math.abs(from - target) < 0.001) {
      glowRef.current.opacity = target;
      repaint();
      return;
    }
    let frame: number;
    let started: number | null = null;
    const animate = (timestamp: number) => {
      started ??= timestamp;
      const progress = Math.min(1, (timestamp - started) / gameConfig.densityEffect.transitionMs);
      glowRef.current.opacity = from + (target - from) * progress;
      repaint();
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [edgeGlow?.color, edgeGlow?.opacity, render]);

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      const renderer = await createPanoramaRenderer(gl);
      if (!mounted.current) { disposeRenderer(renderer); return; }
      rendererRef.current = renderer;
      const current = latest.current;
      render(current.camera, current.size, current.stars, current.discoveredStarIds);
    },
    [render],
  );

  return <GLView style={styles.glView} onContextCreate={onContextCreate} />;
}

function disposeRenderer(renderer: PanoramaRenderer) {
  const { gl } = renderer;
  gl.deleteTexture(renderer.skyTexture);
  gl.deleteTexture(renderer.mountainTexture);
  gl.deleteBuffer(renderer.vertexBuffer);
  gl.deleteBuffer(renderer.starBuffer);
  gl.deleteProgram(renderer.skyPass.program);
  gl.deleteProgram(renderer.mountainPass.program);
  gl.deleteProgram(renderer.starProgram);
  gl.deleteProgram(renderer.edgeGlowPass.program);
}

async function createPanoramaRenderer(gl: ExpoWebGLRenderingContext): Promise<PanoramaRenderer> {
  const skyPass = createPanoramaPass(gl);
  const mountainPass = createPanoramaPass(gl);
  const starProgram = createProgram(gl, starVertexShaderSource, starFragmentShaderSource);
  const vertexBuffer = createFullscreenBuffer(gl);
  const starBuffer = createStarBuffer(gl);
  const edgeGlowPass = createEdgeGlowPass(gl);
  const [skyTexture, mountainTexture] = await Promise.all([
    createPanoramaTexture(gl, panoramaAsset),
    createPanoramaTexture(gl, mountainPanoramaAsset),
  ]);

  return {
    gl,
    skyPass,
    mountainPass,
    starProgram,
    starOrientationLocation: gl.getUniformLocation(starProgram, 'u_cameraOrientation'),
    starFovLocation: gl.getUniformLocation(starProgram, 'u_verticalFov'),
    starAspectLocation: gl.getUniformLocation(starProgram, 'u_aspect'),
    starPixelRatioLocation: gl.getUniformLocation(starProgram, 'u_pixelRatio'),
    starScaleLocation: gl.getUniformLocation(starProgram, 'u_starScale'),
    vertexBuffer,
    starBuffer,
    skyTexture,
    mountainTexture,
    edgeGlowPass,
  };
}

function createPanoramaPass(gl: ExpoWebGLRenderingContext): PanoramaPass {
  const program = createProgram(gl, vertexShaderSource, panoramaFragmentShaderSource);

  return {
    program,
    orientationLocation: gl.getUniformLocation(program, 'u_cameraOrientation'),
    fovLocation: gl.getUniformLocation(program, 'u_verticalFov'),
    aspectLocation: gl.getUniformLocation(program, 'u_aspect'),
    textureLocation: gl.getUniformLocation(program, 'u_panorama'),
    longitudeOffsetLocation: gl.getUniformLocation(program, 'u_longitudeOffset'),
  };
}

function renderPanorama(
  renderer: PanoramaRenderer,
  camera: CameraState,
  size: ScreenSize,
  stars: Star[],
  discoveredStarIds: string[],
  edgeGlow: EdgeGlow,
) {
  const { gl } = renderer;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  drawPanoramaPass(renderer, renderer.skyPass, renderer.skyTexture, camera, size, 0);
  drawStars(renderer, stars, discoveredStarIds, camera, size);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawPanoramaPass(
    renderer,
    renderer.mountainPass,
    renderer.mountainTexture,
    camera,
    size,
    gameConfig.panorama.mountainLongitudeOffsetTurns,
    mountainWorldToPanorama,
  );
  gl.disable(gl.BLEND);

  drawEdgeGlow(gl, renderer.edgeGlowPass, renderer.vertexBuffer, size, edgeGlow);

  gl.flush();
  gl.endFrameEXP();
}

function drawPanoramaPass(
  renderer: PanoramaRenderer,
  pass: PanoramaPass,
  texture: WebGLTexture,
  camera: CameraState,
  size: ScreenSize,
  longitudeOffsetTurns: number,
  worldToPanorama: Quaternion = identityQuaternion,
) {
  const { gl } = renderer;
  const aspect = size.height > 0 ? size.width / size.height : 1;
  const orientation = multiplyQuaternions(worldToPanorama, camera.orientation);

  gl.useProgram(pass.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.vertexBuffer);
  const positionLocation = gl.getAttribLocation(pass.program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(pass.textureLocation, 0);
  gl.uniform4f(pass.orientationLocation, orientation.x, orientation.y, orientation.z, orientation.w);
  gl.uniform1f(pass.fovLocation, getCameraVerticalFovRadians(camera));
  gl.uniform1f(pass.aspectLocation, aspect);
  gl.uniform1f(pass.longitudeOffsetLocation, longitudeOffsetTurns);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawStars(
  renderer: PanoramaRenderer,
  stars: Star[],
  discoveredStarIds: string[],
  camera: CameraState,
  size: ScreenSize,
) {
  if (stars.length === 0 || size.height <= 0) {
    return;
  }

  const { gl } = renderer;
  const starData = new Float32Array(stars.length * 5);
  const discoveredIds = new Set(discoveredStarIds);

  stars.forEach((star, index) => {
    const direction = skyPointToDirection(star.position);
    const offset = index * 5;
    starData[offset] = direction.x;
    starData[offset + 1] = direction.y;
    starData[offset + 2] = direction.z;
    starData[offset + 3] = star.brightness;
    starData[offset + 4] = camera.mode === 'telescope' && discoveredIds.has(star.id) ? 1 : 0;
  });

  const program = renderer.starProgram;
  const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.starBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, starData, gl.DYNAMIC_DRAW);

  const directionLocation = gl.getAttribLocation(program, 'a_direction');
  const brightnessLocation = gl.getAttribLocation(program, 'a_brightness');
  const discoveredLocation = gl.getAttribLocation(program, 'a_discovered');
  gl.enableVertexAttribArray(directionLocation);
  gl.vertexAttribPointer(directionLocation, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(brightnessLocation);
  gl.vertexAttribPointer(brightnessLocation, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(discoveredLocation);
  gl.vertexAttribPointer(discoveredLocation, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);

  gl.uniform4f(renderer.starOrientationLocation, camera.orientation.x, camera.orientation.y, camera.orientation.z, camera.orientation.w);
  gl.uniform1f(renderer.starFovLocation, getCameraVerticalFovRadians(camera));
  gl.uniform1f(renderer.starAspectLocation, size.width / size.height);
  gl.uniform1f(renderer.starPixelRatioLocation, gl.drawingBufferWidth / size.width);
  gl.uniform1f(renderer.starScaleLocation, camera.mode === 'telescope' ? gameConfig.telescopeStarScale : 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.drawArrays(gl.POINTS, 0, stars.length);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.BLEND);
}

function createFullscreenBuffer(gl: ExpoWebGLRenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();

  if (!buffer) {
    throw new Error('Failed to create panorama vertex buffer');
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  return buffer;
}

function createStarBuffer(gl: ExpoWebGLRenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();

  if (!buffer) {
    throw new Error('Failed to create star buffer');
  }

  return buffer;
}

async function createPanoramaTexture(
  gl: ExpoWebGLRenderingContext,
  moduleId: number,
): Promise<WebGLTexture> {
  const [asset] = await Asset.loadAsync(moduleId);
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error('Failed to create panorama texture');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as unknown as TexImageSource);

  return texture;
}

function createProgram(
  gl: ExpoWebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error('Failed to create panorama program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(String(gl.getProgramInfoLog(program)));
  }

  return program;
}

function createShader(
  gl: ExpoWebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error('Failed to create panorama shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(String(gl.getShaderInfoLog(shader)));
  }

  return shader;
}

const vertexShaderSource = `
attribute vec2 a_position;
varying vec2 v_position;

void main() {
  v_position = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const panoramaFragmentShaderSource = `
precision highp float;

uniform sampler2D u_panorama;
uniform vec4 u_cameraOrientation;
uniform float u_verticalFov;
uniform float u_aspect;
uniform float u_longitudeOffset;
varying vec2 v_position;

const float PI = 3.141592653589793;

vec3 rotateByQuaternion(vec4 q, vec3 value) {
  return value + 2.0 * cross(q.xyz, cross(q.xyz, value) + q.w * value);
}

void main() {
  float halfHeight = tan(u_verticalFov * 0.5);
  vec3 ray = normalize(vec3(
    v_position.x * halfHeight * u_aspect,
    v_position.y * halfHeight,
    -1.0
  ));
  ray = rotateByQuaternion(u_cameraOrientation, ray);

  float longitude = atan(ray.x, -ray.z);
  float latitude = asin(clamp(ray.y, -1.0, 1.0));
  float u = fract(longitude / (2.0 * PI) + 0.5 + u_longitudeOffset);
  float v = latitude / PI + 0.5;

  gl_FragColor = texture2D(u_panorama, vec2(u, v));
}
`;

const starVertexShaderSource = `
attribute vec3 a_direction;
attribute float a_brightness;
attribute float a_discovered;
uniform vec4 u_cameraOrientation;
uniform float u_verticalFov;
uniform float u_aspect;
uniform float u_pixelRatio;
uniform float u_starScale;
varying float v_brightness;
varying float v_discovered;

vec3 rotateByQuaternion(vec4 q, vec3 value) {
  return value + 2.0 * cross(q.xyz, cross(q.xyz, value) + q.w * value);
}

void main() {
  vec4 inverseOrientation = vec4(-u_cameraOrientation.xyz, u_cameraOrientation.w);
  vec3 local = rotateByQuaternion(inverseOrientation, a_direction);
  float depth = -local.z;
  float halfHeight = tan(u_verticalFov * 0.5);
  vec2 projected = vec2(
    local.x / max(depth, 0.0001) / (halfHeight * u_aspect),
    local.y / max(depth, 0.0001) / halfHeight
  );
  gl_Position = depth > 0.0 ? vec4(projected, 0.0, 1.0) : vec4(3.0, 3.0, 0.0, 1.0);
  gl_PointSize = u_pixelRatio * u_starScale * (8.0 + a_brightness * 8.0 + a_discovered * 22.0);
  v_brightness = a_brightness;
  v_discovered = a_discovered;
}
`;

const starFragmentShaderSource = `
precision mediump float;
varying float v_brightness;
varying float v_discovered;

float distanceToSegment(vec2 point, vec2 start, vec2 end) {
  vec2 segment = end - start;
  float t = clamp(dot(point - start, segment) / dot(segment, segment), 0.0, 1.0);
  return length(point - start - t * segment);
}

void main() {
  float coreRadius = 4.0 + v_brightness * 4.0;
  vec2 point = (gl_PointCoord - vec2(0.5)) * (coreRadius * 2.0 + v_discovered * 22.0);
  float distance = length(point);
  float glow = 1.0 - smoothstep(0.15, 1.0, distance / coreRadius);
  float ring = v_discovered * (1.0 - smoothstep(0.5, 1.2, abs(distance - coreRadius - 3.0)));
  vec2 badgePoint = point - vec2(coreRadius + 5.0, -coreRadius - 5.0);
  float badge = v_discovered * (1.0 - smoothstep(3.3, 4.2, length(badgePoint)));
  float tick = v_discovered * (1.0 - smoothstep(0.55, 1.15, min(
    distanceToSegment(badgePoint, vec2(-2.1, 0.0), vec2(-0.5, 1.6)),
    distanceToSegment(badgePoint, vec2(-0.5, 1.6), vec2(2.3, -1.8))
  )));
  vec3 color = vec3(1.0, 0.92, 0.58) * (0.65 + v_brightness * 0.35);
  color = mix(color, vec3(1.0, 0.48, 0.12), ring);
  color = mix(color, vec3(0.08, 0.11, 0.17), badge);
  color = mix(color, vec3(1.0, 0.48, 0.12), tick);
  gl_FragColor = vec4(color, max(max(glow * (0.55 + v_brightness * 0.4), ring * 0.9),
    max(badge * 0.95, tick)));
}
`;

const styles = StyleSheet.create({
  glView: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
