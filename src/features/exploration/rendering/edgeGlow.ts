import type { ExpoWebGLRenderingContext } from 'expo-gl';

import { gameConfig } from '../../../config/gameConfig';
import { getApertureDiameter, type ScreenSize } from '../domain/camera';

export type EdgeGlow = { color: string; opacity: number };

export type EdgeGlowPass = {
  program: WebGLProgram;
  size: WebGLUniformLocation | null;
  color: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  edgeSpan: WebGLUniformLocation | null;
  clearRadius: WebGLUniformLocation | null;
  featherWidth: WebGLUniformLocation | null;
};

export function createEdgeGlowPass(gl: ExpoWebGLRenderingContext): EdgeGlowPass {
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) throw new Error('Failed to create edge glow shaders');
  gl.shaderSource(vertex, vertexSource);
  gl.shaderSource(fragment, fragmentSource);
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
    throw new Error('Failed to compile edge glow shader');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Failed to link edge glow shader');
  return {
    program,
    size: gl.getUniformLocation(program, 'u_size'),
    color: gl.getUniformLocation(program, 'u_color'),
    opacity: gl.getUniformLocation(program, 'u_opacity'),
    edgeSpan: gl.getUniformLocation(program, 'u_edgeSpan'),
    clearRadius: gl.getUniformLocation(program, 'u_clearRadius'),
    featherWidth: gl.getUniformLocation(program, 'u_featherWidth'),
  };
}

export function drawEdgeGlow(gl: ExpoWebGLRenderingContext, pass: EdgeGlowPass, vertexBuffer: WebGLBuffer,
  size: ScreenSize, glow: EdgeGlow) {
  if (glow.opacity <= 0 || size.width <= 0 || size.height <= 0) return;
  const red = Number.parseInt(glow.color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(glow.color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(glow.color.slice(5, 7), 16) / 255;
  const config = gameConfig.densityEffect;

  gl.useProgram(pass.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  const position = gl.getAttribLocation(pass.program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(pass.size, size.width, size.height);
  gl.uniform3f(pass.color, red, green, blue);
  gl.uniform1f(pass.opacity, glow.opacity);
  gl.uniform2f(pass.edgeSpan, size.width * config.edgeSpanFraction, size.height * config.edgeSpanFraction);
  gl.uniform1f(pass.clearRadius, getApertureDiameter(size) / 2 + config.clearPadding);
  gl.uniform1f(pass.featherWidth, config.featherWidth);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.disable(gl.BLEND);
}

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_position;
void main() {
  v_position = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentSource = `
precision mediump float;
uniform vec2 u_size;
uniform vec3 u_color;
uniform float u_opacity;
uniform vec2 u_edgeSpan;
uniform float u_clearRadius;
uniform float u_featherWidth;
varying vec2 v_position;

void main() {
  vec2 pixel = (v_position * 0.5 + 0.5) * u_size;
  vec2 edgeDistance = min(pixel, u_size - pixel);
  float xGlow = clamp(1.0 - edgeDistance.x / u_edgeSpan.x, 0.0, 1.0);
  float yGlow = clamp(1.0 - edgeDistance.y / u_edgeSpan.y, 0.0, 1.0);
  float outside = smoothstep(u_clearRadius, u_clearRadius + u_featherWidth, length(pixel - u_size * 0.5));
  float strength = min(1.0, xGlow + yGlow) * outside * u_opacity;
  gl_FragColor = vec4(u_color, strength);
}
`;
