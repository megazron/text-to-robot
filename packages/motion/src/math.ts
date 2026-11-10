// Rigid transforms as row-major 3x4 matrices [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz] and the few vector and
// quaternion helpers the motions need. The trigonometry is @ttr/mesh's deterministic maths, so a motion computed in a
// browser is the same bytes as one computed in Node (exports are compared byte for byte by the site check).
import { sin, cos, atan2 } from "@ttr/mesh/dmath";

export { sin, cos, atan2 };
export type V3 = [number, number, number];
export type T34 = Float64Array;

export const PI = Math.PI;
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, s: number) => a + (b - a) * s;

export function ident(): T34 { const m = new Float64Array(12); m[0] = m[5] = m[10] = 1; return m; }

/** URDF roll-pitch-yaw: R = Rz(y) Ry(p) Rx(r) */
export function fromXyzRpy(xyz: readonly number[], rpy: readonly number[]): T34 {
  const [r, p, y] = rpy, cr = cos(r), sr = sin(r), cp = cos(p), sp = sin(p), cy = cos(y), sy = sin(y);
  return Float64Array.of(cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, xyz[0], sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, xyz[1], -sp, cp * sr, cp * cr, xyz[2]);
}

/** out = a * b (out may not alias a or b) */
export function mulInto(out: T34, a: T34, b: T34, ao = 0, bo = 0, oo = 0): T34 {
  for (let i = 0; i < 3; i++) {
    const a0 = a[ao + i * 4], a1 = a[ao + i * 4 + 1], a2 = a[ao + i * 4 + 2], a3 = a[ao + i * 4 + 3];
    out[oo + i * 4] = a0 * b[bo] + a1 * b[bo + 4] + a2 * b[bo + 8];
    out[oo + i * 4 + 1] = a0 * b[bo + 1] + a1 * b[bo + 5] + a2 * b[bo + 9];
    out[oo + i * 4 + 2] = a0 * b[bo + 2] + a1 * b[bo + 6] + a2 * b[bo + 10];
    out[oo + i * 4 + 3] = a0 * b[bo + 3] + a1 * b[bo + 7] + a2 * b[bo + 11] + a3;
  }
  return out;
}
export const mul = (a: T34, b: T34) => mulInto(new Float64Array(12), a, b);

export function inv(m: T34): T34 {
  const o = new Float64Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 4 + j] = m[j * 4 + i];
  for (let i = 0; i < 3; i++) o[i * 4 + 3] = -(o[i * 4] * m[3] + o[i * 4 + 1] * m[7] + o[i * 4 + 2] * m[11]);
  return o;
}

/** rotation about a unit axis */
export function axisAngle(a: readonly number[], ang: number, out: T34 = new Float64Array(12)): T34 {
  const [x, y, z] = a, c = cos(ang), s = sin(ang), t = 1 - c;
  out[0] = t * x * x + c; out[1] = t * x * y - s * z; out[2] = t * x * z + s * y; out[3] = 0;
  out[4] = t * x * y + s * z; out[5] = t * y * y + c; out[6] = t * y * z - s * x; out[7] = 0;
  out[8] = t * x * z - s * y; out[9] = t * y * z + s * x; out[10] = t * z * z + c; out[11] = 0;
  return out;
}

export const pos = (m: T34, o = 0): V3 => [m[o + 3], m[o + 7], m[o + 11]];
export const apply = (m: T34, p: readonly number[], o = 0): V3 => [
  m[o] * p[0] + m[o + 1] * p[1] + m[o + 2] * p[2] + m[o + 3],
  m[o + 4] * p[0] + m[o + 5] * p[1] + m[o + 6] * p[2] + m[o + 7],
  m[o + 8] * p[0] + m[o + 9] * p[1] + m[o + 10] * p[2] + m[o + 11],
];
export const rot = (m: T34, v: readonly number[], o = 0): V3 => [
  m[o] * v[0] + m[o + 1] * v[1] + m[o + 2] * v[2], m[o + 4] * v[0] + m[o + 5] * v[1] + m[o + 6] * v[2], m[o + 8] * v[0] + m[o + 9] * v[1] + m[o + 10] * v[2],
];
export const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: readonly number[], b: readonly number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: readonly number[], s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: readonly number[]) => Math.sqrt(dot(a, a));
export const unit = (a: readonly number[]): V3 => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
export const dist = (a: readonly number[], b: readonly number[]) => norm(sub(a, b));

/** orientation error (axis * angle, world) taking frame a to frame b */
export function rotErr(a: T34, b: T34, ao = 0, bo = 0): V3 {
  // R = Rb * Ra^T
  const R = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = b[bo + i * 4] * a[ao + j * 4] + b[bo + i * 4 + 1] * a[ao + j * 4 + 1] + b[bo + i * 4 + 2] * a[ao + j * 4 + 2];
  const v: V3 = [R[7] - R[5], R[2] - R[6], R[3] - R[1]], s = norm(v) / 2, c = (R[0] + R[4] + R[8] - 1) / 2;
  const ang = atan2(s, c);
  if (s < 1e-9) {
    if (c > 0) return [0, 0, 0];
    // a half turn: the axis is the column of R + I with the largest norm
    const cols = [0, 1, 2].map((k) => [R[k] + (k === 0 ? 1 : 0), R[3 + k] + (k === 1 ? 1 : 0), R[6 + k] + (k === 2 ? 1 : 0)]);
    const best = cols.reduce((x, y) => (norm(y) > norm(x) ? y : x));
    return scale(unit(best), Math.PI);
  }
  return scale(v, ang / (2 * s));
}

/** a pose [x, y, z, qx, qy, qz, qw] as a transform */
export function fromPose7(p: readonly number[]): T34 {
  const [x, y, z, qx, qy, qz, qw] = p;
  return Float64Array.of(1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy), x, 2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx), y, 2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy), z);
}
export function toPose7(m: T34): number[] {
  const t = m[0] + m[5] + m[10];
  let qx: number, qy: number, qz: number, qw: number;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; qw = s / 4; qx = (m[9] - m[6]) / s; qy = (m[2] - m[8]) / s; qz = (m[4] - m[1]) / s; }
  else if (m[0] > m[5] && m[0] > m[10]) { const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2; qw = (m[9] - m[6]) / s; qx = s / 4; qy = (m[1] + m[4]) / s; qz = (m[2] + m[8]) / s; }
  else if (m[5] > m[10]) { const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2; qw = (m[2] - m[8]) / s; qx = (m[1] + m[4]) / s; qy = s / 4; qz = (m[6] + m[9]) / s; }
  else { const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2; qw = (m[4] - m[1]) / s; qx = (m[2] + m[8]) / s; qy = (m[6] + m[9]) / s; qz = s / 4; }
  if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
  return [m[3], m[7], m[11], qx, qy, qz, qw];
}
/** a planar base pose: position and heading about z, with optional roll and pitch */
export function planar(x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0): T34 { return fromXyzRpy([x, y, z], [roll, pitch, yaw]); }

/** minimum-jerk blend 0..1 (zero velocity and acceleration at both ends) */
export const minJerk = (s: number) => { const x = clamp(s, 0, 1); return x * x * x * (10 + x * (-15 + 6 * x)); };
/** its peak speed and acceleration, per unit of travel and duration */
export const MJ_VMAX = 1.875, MJ_AMAX = 5.7735;

/** a small seeded generator (mulberry32): motions are reproducible */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
