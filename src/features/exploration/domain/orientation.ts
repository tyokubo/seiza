import type { Vector3 } from '../../sky/domain/types.ts';

export type Quaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type { Vector3 } from '../../sky/domain/types.ts';

export const identityQuaternion: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  return normalizeQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

export function inverseQuaternion(value: Quaternion): Quaternion {
  const normalized = normalizeQuaternion(value);
  return { x: -normalized.x, y: -normalized.y, z: -normalized.z, w: normalized.w };
}

export function rotateVector(rotation: Quaternion, vector: Vector3): Vector3 {
  const q = normalizeQuaternion(rotation);
  const ix = q.w * vector.x + q.y * vector.z - q.z * vector.y;
  const iy = q.w * vector.y + q.z * vector.x - q.x * vector.z;
  const iz = q.w * vector.z + q.x * vector.y - q.y * vector.x;
  const iw = -q.x * vector.x - q.y * vector.y - q.z * vector.z;

  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

export function quaternionFromAxisAngle(axis: Vector3, angle: number): Quaternion {
  const halfAngle = angle / 2;
  const scale = Math.sin(halfAngle);
  const length = Math.hypot(axis.x, axis.y, axis.z) || 1;

  return normalizeQuaternion({
    x: (axis.x / length) * scale,
    y: (axis.y / length) * scale,
    z: (axis.z / length) * scale,
    w: Math.cos(halfAngle),
  });
}

export function slerpQuaternion(from: Quaternion, to: Quaternion, amount: number): Quaternion {
  const start = normalizeQuaternion(from);
  let end = normalizeQuaternion(to);
  let cosine = start.x * end.x + start.y * end.y + start.z * end.z + start.w * end.w;

  if (cosine < 0) {
    end = { x: -end.x, y: -end.y, z: -end.z, w: -end.w };
    cosine = -cosine;
  }

  if (cosine > 0.9995) {
    return normalizeQuaternion({
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
      z: start.z + (end.z - start.z) * amount,
      w: start.w + (end.w - start.w) * amount,
    });
  }

  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  const sine = Math.sin(angle);
  const startWeight = Math.sin((1 - amount) * angle) / sine;
  const endWeight = Math.sin(amount * angle) / sine;

  return normalizeQuaternion({
    x: start.x * startWeight + end.x * endWeight,
    y: start.y * startWeight + end.y * endWeight,
    z: start.z * startWeight + end.z * endWeight,
    w: start.w * startWeight + end.w * endWeight,
  });
}

export function quaternionAngle(value: Quaternion): number {
  return 2 * Math.acos(Math.max(-1, Math.min(1, Math.abs(normalizeQuaternion(value).w))));
}

export function normalizeQuaternion(value: Quaternion): Quaternion {
  const length = Math.hypot(value.x, value.y, value.z, value.w) || 1;
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
    w: value.w / length,
  };
}
