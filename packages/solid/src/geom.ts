// Solid modelling on manifold-3d (exact, watertight CSG; WASM in Node and the browser).
// Everything here works in millimetres, like the parts catalog; meshes leave in metres.
import Module from "manifold-3d";
import type { Manifold as M, ManifoldToplevel } from "manifold-3d";
import { part, caseHoles, outputHoles, hornRadiusMm, type Hole, type Vec3 } from "@ttr/parts";

export type Manifold = M;
export type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

// In the browser build the wasm file is served next to the page (deploy/build-pages.sh copies it).
// a worker started from another site names the engine's address in TTR_ENGINE_BASE (its own is a blob: URL)
const g = globalThis as { document?: { baseURI: string }; TTR_ENGINE_BASE?: string }, wasmBase = g.TTR_ENGINE_BASE ?? g.document?.baseURI;
const wasm: ManifoldToplevel = await Module(wasmBase ? { locateFile: () => new URL("./manifold.wasm", wasmBase).href } : undefined);
wasm.setup();

// ---- memory: manifold objects live in WASM; track and free everything a build creates ----
const live: M[] = [];
// manifold-3d 3.5's Manifold.revolve builds a CrossSection from the outline and a polygon vector from that, and deletes
// neither: every revolve leaked WASM memory that a browser tab never gets back. Same call, both freed. (Booleans keep some
// memory too, inside the library: see apps/web/src/wasm-memory.ts.)
{
  const W = wasm as any;
  const outline = (polygons: any) => (typeof polygons?._ToPolygons === "function" ? { cs: polygons, own: false } : { cs: W.CrossSection(polygons, "Positive"), own: true });
  W.Manifold.revolve = (polygons: unknown, circularSegments = 0, revolveDegrees = 360) => {
    const { cs, own } = outline(polygons), vec = cs._ToPolygons();
    try { return W._Revolve(vec, circularSegments, revolveDegrees); } finally { vec.delete(); if (own) cs.delete(); }
  };
}
const STATIC = ["cube", "cylinder", "sphere", "extrude", "revolve", "union", "difference", "intersection", "hull", "ofMesh", "compose"] as const;
const MEMBER = ["add", "subtract", "intersect", "transform", "translate", "rotate", "scale", "mirror", "trimByPlane", "hull", "refine", "simplify"] as const;
for (const name of STATIC) { const fn = (wasm.Manifold as any)[name]; (wasm.Manifold as any)[name] = (...a: any[]) => { const r = fn(...a); live.push(r); return r; }; }
for (const name of MEMBER) { const fn = (wasm.Manifold.prototype as any)[name]; (wasm.Manifold.prototype as any)[name] = function (this: M, ...a: any[]) { const r = fn.apply(this, a); live.push(r); return r; }; }
export const Manifold = wasm.Manifold;
export const CrossSection = wasm.CrossSection;

/** How many solids are alive outside any finished build (each holds WASM memory until it is deleted). */
export const liveSolids = () => live.length;
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
  // near +-90 deg pitch roll and yaw are one rotation; below 1e-6 the general formula reads float noise
  if (Math.abs(Math.cos(pitch)) > 1e-6) { roll = Math.atan2(r21, r22); yaw = Math.atan2(r10, r00); }
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
/**
 * Where a DYNAMIXEL X430 / X540 takes its two bus plugs: a slot in each long side of its back case, 44 % of the body
 * length from the motor end, the cable leaving sideways (ROBOTIS e-manual, X-series, the figures "cable assembly" and
 * "wiring through back case"). x along the body and z in the servo frame; null for any other actuator.
 */
export function dxlPlug(key: string): { x: number; z: number; inset: number; z0: number; z1: number } | null {
  const { min, max } = bodyBox(key);
  // the window through the cradle wall: 4.5 mm under the socket to 5 mm over it, but never closer than 1.2 mm (3 lines)
  // to the cradle's open rim, or the rim over the window is a strip too thin to print
  const win = (x: number, z: number, inset: number) => ({ x, z, inset, z0: z - 4.5, z1: Math.min(z + 5, Math.min(max[2], -0.8) - 1.2 - 1.2) });
  if (/^dxl_x.(430|540)/.test(key)) return win(min[0] + 0.437 * (max[0] - min[0]), min[2] + 5, 10);
  // XL330: also one in each side face, in the half away from the horn and towards the front (ROBOTIS e-manual XL330
  // product photo; the drawing is behind a login: about +-4 mm), the 20 mm case leaving the header 6 mm deep
  if (/^dxl_xl330/.test(key)) return win(min[0] + 0.4 * (max[0] - min[0]), min[2] + 0.7 * (max[2] - min[2]), 6);
  return null;
}
export function cradleCuts(a: ActuatorPlacement, wall = 3): M[] {
  const { min, max } = bodyBox(a.key), top = Math.min(max[2], -0.8) - 1.2, rim = 5;
  // closed walls: the cradle is the structure that carries the joint load (no windows), with one cable slot at the bottom
  // case screws pass through the whole wall: a hole recessed into the case (the STS3250's rear M3s sit 1.7 mm inside its
  // face) is cut that much further, or a 0.2 mm skin is left over it; holes run on 12 mm past the cradle so any structure
  // behind it gets a clean screwdriver hole instead of a thin floor
  const inset = (h: Hole) => { const k = h.axis.findIndex((x) => Math.abs(x) > 0.9); return k < 0 ? 0 : Math.max(0, h.axis[k] > 0 ? max[k] - h.pos[k] : h.pos[k] - min[k]); };
  const cuts = [actuatorKeepout(a), ...caseHoles(a.key).flatMap((h) => screwCuts([h], a.T, wall + 12 + inset(h)))];
  // cable slot out of the side: run it well past the wall, or material around the cradle leaves a skin over it
  if (max[0] - min[0] > 3 * rim) cuts.push(box([min[0] + rim, max[1] - 1, min[2] + 1.5], [Math.min(max[0] - rim, min[0] + rim + 12), max[1] + wall + 20, min[2] + 9]).transform(a.T));
  // bus servos plug in where their sockets are: a window through the cradle there, with room for the plug (as plugWindowOps)
  if (a.key.startsWith("feetech_sts")) cuts.push(box([-20, -10, min[2] - 20], [-8, 10, min[2] + 6]).transform(a.T));   // through whatever lies on that face: the plug (10 mm) and its first bend
  // a CubeMars AK's connectors (XT30 power + CAN, the UART) are on its back cover: a window through the cradle's floor
  // there, inside the screw circle, and on through whatever lies behind it, for the plugs and their first bends
  if (a.key.startsWith("cubemars_")) cuts.push(box([-15, -15, min[2] - 30], [15, 15, min[2] + 1]).transform(a.T));
  const slot = dxlPlug(a.key);
  if (slot) cuts.push(box([slot.x - 7, min[1] - wall - 30, slot.z0], [slot.x + 7, max[1] + wall + 30, slot.z1]).transform(a.T));   // on out through any bracket round the cradle: the plug and its first bend, then a way out
  else if (a.key.startsWith("dxl_")) cuts.push(box([min[0] - 8, -11, min[2] + 0.5], [min[0] + 0.5, 11, min[2] + 12]).transform(a.T));
  void top;
  return cuts;
}
/** Disc that bolts to an actuator's rotating output (horn / hub), thickness t above the output face. */
export function hornPlate(key: string, t = 4, extra = 4): M {
  return cyl(hornRadiusMm(key) + extra, 0, t);
}
export function hornCuts(key: string, t = 4, channel?: number): M[] {
  // screw holes through the plate, then ONE round pocket above it over the whole screw circle (screwdriver access);
  // separate counterbores through thicker parts leave sub-millimetre webs between them
  const holes = outputHoles(key);
  const cuts = screwCuts(holes, I4(), t, 0);
  if (channel !== undefined) {
    // structure stands on the plate (a gear, a column): horn screws go in from the horn side, the spline screw
    // through a centre channel instead of a pocket that would carve the structure away
    cuts.push(cyl(key.startsWith("cubemars_") ? 8 : key.startsWith("hobby_") ? 2.4 : 3.3, -1, t + channel));
    return cuts;
  }
  if (holes.length) {
    const rMax = Math.max(...holes.map((h) => Math.hypot(h.pos[0], h.pos[1]))), dHead = (holes[0].thread ? Number(holes[0].thread.replace(/^M/, "")) + 0.4 : holes[0].dia_mm + 0.3) * 1.9;
    cuts.push(cyl(rMax + dHead / 2 + 0.6, t, t + 60));
  }
  // centre screw head (M3 socket head 5.5 mm) / hub boss: a larger hole leaves sub-1 mm webs to the horn screws
  cuts.push(cyl(key.startsWith("cubemars_") ? 8 : 3.3, -1, t + 1));
  return cuts;
}

// ---- mesh exchange ----
export interface TriMesh { v: Vec3[]; f: [number, number, number][]; }
/**
 * Zero-area "needle" triangles (three collinear vertices) survive CSG now and then; mesh consumers that
 * drop degenerate faces would see a hole. Split the neighbour across the needle's long edge at the middle
 * vertex and drop the needle: same surface, no degenerate face.
 */
function removeNeedles(v: Vec3[], f: [number, number, number][]) {
  const area2 = (t: [number, number, number]) => { const [a, b, c] = t.map((i) => v[i]); const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]); };
  const d2 = (i: number, j: number) => (v[i][0] - v[j][0]) ** 2 + (v[i][1] - v[j][1]) ** 2 + (v[i][2] - v[j][2]) ** 2;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let t = 0; t < f.length; t++) {
      const tri = f[t];
      if (area2(tri) > 1e-15) continue;
      // longest edge (a -> b) and the vertex c lying on it
      let k = 0, best = -1; for (let e = 0; e < 3; e++) { const L = d2(tri[e], tri[(e + 1) % 3]); if (L > best) { best = L; k = e; } }
      const a = tri[k], b = tri[(k + 1) % 3], c = tri[(k + 2) % 3];
      const n = f.findIndex((u, i) => i !== t && [0, 1, 2].some((e) => u[e] === b && u[(e + 1) % 3] === a));
      if (n < 0) continue;
      const u = f[n], e = [0, 1, 2].find((x) => u[x] === b && u[(x + 1) % 3] === a)!, d = u[(e + 2) % 3];
      f[n] = [b, c, d]; f[t] = [c, a, d]; changed = true; // replaces needle + neighbour by two proper triangles
    }
    if (!changed) break;
  }
}
export function toMesh(m: M, scale = 0.001): TriMesh {
  const g = m.getMesh(), n = g.numProp, v: Vec3[] = [], f: [number, number, number][] = [];
  // vertices split along property seams must be re-joined, or the mesh has open edges
  const to = new Map<number, number>();
  for (let i = 0; i < (g.mergeFromVert?.length ?? 0); i++) to.set(g.mergeFromVert[i], g.mergeToVert[i]);
  const remap = new Int32Array(g.vertProperties.length / n).fill(-1);
  for (let i = 0; i < remap.length; i++) {
    const src = to.get(i) ?? i;
    if (src !== i) continue;
    remap[i] = v.length;
    v.push([g.vertProperties[i * n] * scale, g.vertProperties[i * n + 1] * scale, g.vertProperties[i * n + 2] * scale]);
  }
  for (const [from, target] of to) remap[from] = remap[target];
  for (let i = 0; i < g.triVerts.length; i += 3) f.push([remap[g.triVerts[i]], remap[g.triVerts[i + 1]], remap[g.triVerts[i + 2]]]);
  removeNeedles(v, f);
  return { v, f };
}
