// Solid modelling on manifold-3d (exact, watertight CSG; WASM in Node and the browser).
// Everything here works in millimetres, like the parts catalog; meshes leave in metres.
import Module from "manifold-3d";
import type { Manifold as M, ManifoldToplevel } from "manifold-3d";
import { part, caseHoles, outputHoles, hornRadiusMm, type Hole, type Vec3 } from "@ttr/parts";

export type Manifold = M;
export type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

// In the browser build the wasm file is served next to the page (deploy/build-pages.sh copies it).
const doc = (globalThis as { document?: { baseURI: string } }).document;
const wasm: ManifoldToplevel = await Module(doc ? { locateFile: () => new URL("./manifold.wasm", doc.baseURI).href } : undefined);
wasm.setup();

// ---- memory: manifold objects live in WASM; track and free everything a build creates ----
const live: M[] = [];
const STATIC = ["cube", "cylinder", "sphere", "extrude", "revolve", "union", "difference", "intersection", "hull", "ofMesh", "compose"] as const;
const MEMBER = ["add", "subtract", "intersect", "transform", "translate", "rotate", "scale", "mirror", "trimByPlane", "hull", "refine"] as const;
for (const name of STATIC) { const fn = (wasm.Manifold as any)[name]; (wasm.Manifold as any)[name] = (...a: any[]) => { const r = fn(...a); live.push(r); return r; }; }
for (const name of MEMBER) { const fn = (wasm.Manifold.prototype as any)[name]; (wasm.Manifold.prototype as any)[name] = function (this: M, ...a: any[]) { const r = fn.apply(this, a); live.push(r); return r; }; }
export const Manifold = wasm.Manifold;
export const CrossSection = wasm.CrossSection;

/** Run a solid-modelling build and free every intermediate solid afterwards. */
export function build<T>(fn: () => T): T {
  const mark = live.length;
  try { return fn(); }
  finally { for (const m of live.splice(mark)) m.delete(); }
}

// ---- transforms (column-major 4x4, mm) ----
export const I4 = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0) as Mat4;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
export function fromRt(R: number[][], t: Vec3): Mat4 {
  return [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, t[0], t[1], t[2], 1];
}
export function invert(m: Mat4): Mat4 {
  const R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const t: Vec3 = [m[12], m[13], m[14]];
  return fromRt(Rt, [-(Rt[0][0] * t[0] + Rt[0][1] * t[1] + Rt[0][2] * t[2]), -(Rt[1][0] * t[0] + Rt[1][1] * t[1] + Rt[1][2] * t[2]), -(Rt[2][0] * t[0] + Rt[2][1] * t[1] + Rt[2][2] * t[2])]);
}
export const apply = (m: Mat4, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
export const applyDir = (m: Mat4, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
/** Frame whose z axis is `z` and x axis is as close to `xHint` as possible. */
export function frame(origin: Vec3, z: Vec3, xHint: Vec3): Mat4 {
  const n = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const Z = n(z);
  let c = cross(Z, xHint);
  if (Math.hypot(...c) < 1e-6 * Math.hypot(...xHint)) c = cross(Z, Math.abs(Z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  const Y = n(c); const X = cross(Y, Z);
  return [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, origin[0], origin[1], origin[2], 1];
}
export const translation = (t: Vec3): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
/** URDF xyz (m) + rpy (rad) of a transform in mm. */
export function toPose(m: Mat4): { xyz: Vec3; rpy: Vec3 } {
  const r20 = m[2], r21 = m[6], r22 = m[10], r10 = m[1], r00 = m[0];
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r20)));
  let roll: number, yaw: number;
  if (Math.abs(Math.cos(pitch)) > 1e-9) { roll = Math.atan2(r21, r22); yaw = Math.atan2(r10, r00); }
  else { roll = 0; yaw = Math.atan2(-m[4], m[5]); }
  const c = (x: number) => (Math.abs(x) < 1e-12 ? 0 : +x.toFixed(9));
  return { xyz: [c(m[12] / 1000), c(m[13] / 1000), c(m[14] / 1000)], rpy: [c(roll), c(pitch), c(yaw)] };
}

// ---- primitives (mm) ----
export const box = (min: Vec3, max: Vec3) => Manifold.cube([max[0] - min[0], max[1] - min[1], max[2] - min[2]]).translate(min);
export const cyl = (r: number, z0: number, z1: number, x = 0, y = 0, seg = 48) => Manifold.cylinder(z1 - z0, r, r, seg).translate([x, y, z0]);
/** Cylinder of radius r from a to b. */
export function rod(a: Vec3, b: Vec3, r: number, seg = 32): M {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
  return Manifold.cylinder(len, r, r, seg).transform(frame(a, d, Math.abs(d[0]) < 0.9 * len ? [1, 0, 0] : [0, 1, 0]));
}
export function roundedBox(min: Vec3, max: Vec3, r: number): M {
  r = Math.min(r, (max[0] - min[0]) / 2 - 0.01, (max[1] - min[1]) / 2 - 0.01);
  if (r <= 0.2) return box(min, max);
  const pts: M[] = [];
  for (const x of [min[0] + r, max[0] - r]) for (const y of [min[1] + r, max[1] - r]) pts.push(cyl(r, min[2], max[2], x, y, 24));
  return Manifold.hull(pts);
}
export const unionAll = (ms: M[]) => (ms.length ? Manifold.union(ms) : Manifold.cube([0, 0, 0]));

/** Clearance holes for screws that enter along each hole's axis, plus head counterbores. */
export function screwCuts(holes: Hole[], into: Mat4, depth: number, head = 0): M[] {
  const cuts: M[] = [];
  for (const h of holes) {
    const d = h.thread ? Number(h.thread.replace(/^M/, "")) + 0.4 : h.dia_mm + 0.3;
    const p = apply(into, h.pos), a = applyDir(into, h.axis);
    // through the wall the screw comes from (outward of the component), and a little into it
    cuts.push(rod([p[0] - a[0], p[1] - a[1], p[2] - a[2]], [p[0] + a[0] * (depth + 0.5), p[1] + a[1] * (depth + 0.5), p[2] + a[2] * (depth + 0.5)], d / 2, 16));
    if (head > 0) {
      const hd = d * 1.9;
      cuts.push(rod([p[0] + a[0] * head, p[1] + a[1] * head, p[2] + a[2] * head], [p[0] + a[0] * (head + 40), p[1] + a[1] * (head + 40), p[2] + a[2] * (head + 40)], hd / 2, 16));
    }
  }
  return cuts;
}

// ---- actuator-aware features ----
export interface ActuatorPlacement { key: string; T: Mat4; }
/** Body bounding box of a component in its own frame (mm). */
export function bodyBox(key: string) { const b = part(key).bbox_mm!; return { min: b.min as Vec3, max: b.max as Vec3 }; }
/** Volume the printed structure must leave free around an actuator: its body (+clearance) and the swept output. */
export function actuatorKeepout(a: ActuatorPlacement, clearance = 0.4): M {
  const { min, max } = bodyBox(a.key), r = hornRadiusMm(a.key);
  const body = box([min[0] - clearance, min[1] - clearance, min[2] - clearance], [max[0] + clearance, max[1] + clearance, Math.min(max[2], -0.8) + clearance]);
  const output = cyl(r + 1.5, -3, 60);
  return Manifold.union([body, output]).transform(a.T);
}
/** Printed cradle that holds an actuator by its case screws: walls around the body, open towards the output side. */
export function cradle(a: ActuatorPlacement, wall = 3): M {
  const { min, max } = bodyBox(a.key), top = Math.min(max[2], -0.8) - 1.2;
  const shell = roundedBox([min[0] - wall, min[1] - wall, min[2] - wall], [max[0] + wall, max[1] + wall, top], wall);
  return shell.transform(a.T);
}
export function cradleCuts(a: ActuatorPlacement, wall = 3): M[] {
  const { min, max } = bodyBox(a.key), top = Math.min(max[2], -0.8) - 1.2, rim = 5;
  const cuts = [actuatorKeepout(a), ...screwCuts(caseHoles(a.key), a.T, wall + 1)];
  // windows through the long side walls: shows the actuator, saves filament, lets the case breathe
  if (max[0] - min[0] > 3 * rim && top - min[2] > 3 * rim)
    cuts.push(box([min[0] + rim, min[1] - wall - 1, min[2] + rim], [max[0] - rim, max[1] + wall + 1, top - rim]).transform(a.T));
  return cuts;
}
/** Disc that bolts to an actuator's rotating output (horn / hub), thickness t above the output face. */
export function hornPlate(key: string, t = 4, extra = 4): M {
  return cyl(hornRadiusMm(key) + extra, 0, t);
}
export function hornCuts(key: string, t = 4): M[] {
  const cuts = screwCuts(outputHoles(key), I4(), t, t);
  cuts.push(cyl(key.startsWith("cubemars_") ? 8 : 4.6, -1, t + 1)); // centre screw head / hub boss
  return cuts;
}

// ---- mesh exchange ----
export interface TriMesh { v: Vec3[]; f: [number, number, number][]; }
export function toMesh(m: M, scale = 0.001): TriMesh {
  const g = m.getMesh(), n = g.numProp, v: Vec3[] = [], f: [number, number, number][] = [];
  for (let i = 0; i < g.vertProperties.length; i += n) v.push([g.vertProperties[i] * scale, g.vertProperties[i + 1] * scale, g.vertProperties[i + 2] * scale]);
  for (let i = 0; i < g.triVerts.length; i += 3) f.push([g.triVerts[i], g.triVerts[i + 1], g.triVerts[i + 2]]);
  return { v, f };
}
