// 4x4 homogeneous transforms as row-major number[16]; minimal + dependency-free.
import type { Pose, Vec3 } from "@ttr/robot-schema";

export type Mat4 = number[]; // length 16, row-major

export const identity = (): Mat4 => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

export function fromRPY(r: number, p: number, y: number): Mat4 {
  const cr = Math.cos(r), sr = Math.sin(r);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cy = Math.cos(y), sy = Math.sin(y);
  // R = Rz(y) * Ry(p) * Rx(r)  (URDF convention)
  const r00 = cy * cp, r01 = cy * sp * sr - sy * cr, r02 = cy * sp * cr + sy * sr;
  const r10 = sy * cp, r11 = sy * sp * sr + cy * cr, r12 = sy * sp * cr - cy * sr;
  const r20 = -sp,     r21 = cp * sr,                r22 = cp * cr;
  return [r00, r01, r02, 0, r10, r11, r12, 0, r20, r21, r22, 0, 0, 0, 0, 1];
}

export function translation(t: Vec3): Mat4 {
  const m = identity(); m[3] = t[0]; m[7] = t[1]; m[11] = t[2]; return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        out[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return out;
}

export const poseToMat = (pose: Pose): Mat4 =>
  multiply(translation(pose.xyz), fromRPY(pose.rpy[0], pose.rpy[1], pose.rpy[2]));

export function axisAngle(axis: Vec3, angle: number): Mat4 {
  const n = Math.hypot(...axis) || 1;
  const [x, y, z] = [axis[0] / n, axis[1] / n, axis[2] / n];
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    t*x*x + c,   t*x*y - s*z, t*x*z + s*y, 0,
    t*x*y + s*z, t*y*y + c,   t*y*z - s*x, 0,
    t*x*z - s*y, t*y*z + s*x, t*z*z + c,   0,
    0, 0, 0, 1,
  ];
}

export const position = (m: Mat4): Vec3 => [m[3], m[7], m[11]];
