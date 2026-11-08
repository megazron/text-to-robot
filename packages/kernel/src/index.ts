// CAD kernel for printed parts: the same serializable part programs as @ttr/solid, built as exact
// B-rep solids on OpenCascade (Replicad, WASM in Node and the browser). Real fillets, STEP export for
// Fusion / FreeCAD / Onshape, and print meshes welded and validated by manifold-3d (closed, one solid).
//   await initKernel();  const { stl, step, volume_mm3 } = exportPart(program);
import opencascade from "replicad-opencascadejs";
import { setOC, getOC, cast, measureShapeVolumeProperties, measureVolume, makeBox, makeCylinder, makePolygon, makeSolid, makeSphere, makePlane, drawEllipse, draw, type Shape3D, type AnyShape } from "replicad";
import Manifold from "manifold-3d";
import { part, caseHoles, outputHoles, hornRadiusMm, type Hole, type Vec3 } from "@ttr/parts";

export type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
export type Op =
  | { op: "horn"; key: string; t?: number; extra?: number; channel?: number }  // channel: no screwdriver pocket above; a centre channel this tall instead
  | { op: "cradle"; key: string; T: Mat4; wall?: number }
  | { op: "beam"; a: Vec3; b: Vec3; w: number; h: number; up?: Vec3 }
  | { op: "rod"; a: Vec3; b: Vec3; r: number }
  | { op: "box"; min: Vec3; max: Vec3; r?: number }
  | { op: "hull"; of: Op[]; cut?: boolean }                                     // convex hull (subtracted when cut)
  | { op: "keepout"; key: string; T: Mat4 }
  | { op: "hole"; a: Vec3; b: Vec3; d: number }
  | { op: "cutbox"; min: Vec3; max: Vec3 }
  | { op: "lighten"; a: Vec3; b: Vec3; r: number; n: number; axis?: Vec3 }
  | { op: "revolve"; pts: [number, number][]; seg?: number }
  | { op: "sphere"; c: Vec3; r: number; cut?: boolean }                      // ball (or a spherical socket when cut)
  | { op: "ploft"; sections: PSec[]; t?: number; open?: "both" | "start" | "end"; smooth?: boolean }  // polygon sections along +z, faceted (ruled) unless smooth; t: shell
  | { op: "loft"; sections: [number, number, number, number?, number?][]; t?: number; open?: "both" | "start" | "end"; rim?: number }  // ellipses [z, rx, ry, cx, cy] along +z; t: shell of that wall, open at both ends (or one)
  | { op: "subtract"; of: Op[] }                                              // remove the finished solid of a sub-program
  | { op: "solid"; of: Op[] }                                                 // add the finished solid of a sub-program: its cuts stay inside it
  | { op: "at"; T: Mat4; of: Op[] };
/** `edge`: radius (mm) of the fillet that breaks every outer edge after the booleans (0 = sharp). */
/** A closed polygon outline at height z (counter-clockwise seen from +z, the same vertex count in every section). */
export interface PSec { z: number; pts: [number, number][] }
export interface Program { name: string; ops: Op[]; edge?: number; }

// ---------------------------------------------------------------- initialisation
let ready: Promise<void> | undefined;
let mf: Awaited<ReturnType<typeof Manifold>> | undefined;
/** Load both WASM kernels once. In a browser pass the URLs the .wasm files are served from. */
export function initKernel(urls: { occt?: string; manifold?: string } = {}): Promise<void> {
  ready ??= (async () => {
    const node = typeof process !== "undefined" && !!process.versions?.node;
    const occtPath = urls.occt ?? (node ? new URL(import.meta.resolve("replicad-opencascadejs")).pathname.replace(/[^/]+$/, "replicad_single.wasm") : "./replicad_single.wasm");
    const OC = await (opencascade as unknown as (o: object) => Promise<unknown>)({ locateFile: () => occtPath });
    setOC(OC as never);
    mf = await Manifold(urls.manifold ? { locateFile: () => urls.manifold! } : undefined);
    mf.setup();
  })();
  return ready;
}
const oc = () => getOC() as any;
/** The manifold-3d module, loaded (the armour forge works on it). */
export async function manifoldModule(): Promise<NonNullable<typeof mf>> { await initKernel(); return mf!; }

// ---------------------------------------------------------------- memory scope
// OpenCascade objects live in WASM memory: every shape made while building one part is deleted at the end.
let scope: AnyShape[] | undefined;
const keep = <T extends AnyShape>(s: T): T => { scope?.push(s); return s; };
function scoped<T>(fn: () => T, survivors: AnyShape[] = []): T {
  const outer = scope, mine: AnyShape[] = [];
  scope = mine;
  try { return fn(); }
  finally {
    scope = outer;
    for (const s of mine) if (!survivors.includes(s)) { try { s.delete(); } catch { /* already freed */ } }
  }
}

// ---------------------------------------------------------------- transforms (column-major 4x4, mm)
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
function transformed(s: Shape3D, m: Mat4): Shape3D {
  const O = oc();
  const c0 = len([m[0], m[1], m[2]]), c1 = len([m[4], m[5], m[6]]), c2 = len([m[8], m[9], m[10]]);
  const uniform = Math.abs(c0 - c1) < 1e-9 * c0 && Math.abs(c0 - c2) < 1e-9 * c0;
  // this OpenCascade build has no BRepBuilderAPI_GTransform: non-uniform scaling is not supported for B-rep parts
  if (!uniform) throw new Error(`non-uniform scale in a part transform (${c0.toFixed(3)}, ${c1.toFixed(3)}, ${c2.toFixed(3)})`);
  const t = new O.gp_Trsf();
  t.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]);
  const api = new O.BRepBuilderAPI_Transform(s.wrapped, t, true);
  const out = api.Shape(); api.delete(); t.delete();
  return keep(cast(out) as Shape3D);
}
/** Frame whose z axis is `z` and x axis is as close to `xHint` as possible (column-major, mm). */
export function frame(origin: Vec3, z: Vec3, xHint: Vec3): Mat4 {
  const n = (v: Vec3): Vec3 => { const l = len(v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const Z = n(z);
  let c = cross(Z, xHint);
  if (len(c) < 1e-6 * len(xHint)) c = cross(Z, Math.abs(Z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  const Y = n(c), X = cross(Y, Z);
  return [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, origin[0], origin[1], origin[2], 1];
}
const apply = (m: Mat4, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const applyDir = (m: Mat4, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
const I4 = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// ---------------------------------------------------------------- primitives (mm)
/** Fillet with fallback: OpenCascade rejects radii that consume a face; try smaller, then leave the edge sharp. */
function tryFillet(s: Shape3D, r: number, filter?: (e: any) => any): Shape3D {
  for (const k of [1, 0.6, 0.35]) {
    if (r * k < 0.2) break;
    try { return keep(filter ? s.fillet(r * k, filter) : s.fillet(r * k)); } catch { /* try a smaller radius */ }
  }
  return s;
}
export function box(min: Vec3, max: Vec3, r = 0): Shape3D {
  const s = keep(makeBox(min, max) as Shape3D);
  const rr = Math.min(r, (max[0] - min[0]) / 2 - 0.05, (max[1] - min[1]) / 2 - 0.05);
  return rr > 0.2 ? tryFillet(s, rr, (e) => e.inDirection("Z")) : s;
}
export function rod(a: Vec3, b: Vec3, r: number): Shape3D {
  const d = sub(b, a), l = len(d);
  return keep(makeCylinder(r, l, a, [d[0] / l, d[1] / l, d[2] / l]) as Shape3D);
}
function beam(a: Vec3, b: Vec3, w: number, h: number, up: Vec3 = [0, 0, 1]): Shape3D {
  const d = sub(b, a);
  return transformed(box([-h / 2, -w / 2, 0], [h / 2, w / 2, len(d)], Math.min(w, h) * 0.18), frame(a, d, up));
}
function revolveOutline(pts: [number, number][]): Shape3D {
  const p = pts.map(([r, z]) => [Math.max(0, r), z] as [number, number]);
  let d = draw(p[0]);
  for (const q of p.slice(1)) d = d.lineTo(q);
  // the XZ sketch plane maps sketch x -> world X and sketch y -> world Z; revolve about world Z
  return keep(d.close().sketchOnPlane("XZ").revolve([0, 0, 1]) as Shape3D);
}
/** Smooth solid through elliptical sections stacked along +z (each [z, rx, ry, cx, cy]). */
function loftOf(secs: [number, number, number, number?, number?][]): Shape3D {
  const sk = ([z, rx, ry, cx, cy]: [number, number, number, number?, number?]) => {
    const e = rx >= ry ? drawEllipse(rx, ry) : drawEllipse(ry, rx).rotate(90);
    return e.translate([cx ?? 0, cy ?? 0]).sketchOnPlane(makePlane("XY", [0, 0, z]));
  };
  const [first, ...rest] = secs;
  return keep((sk(first) as any).loftWith(rest.map(sk), { ruled: false }) as Shape3D);
}
/** Solid through polygon sections: flat facets between them (hard-surface armour), or a smooth skin. */
function ploftOf(secs: PSec[], smooth = false): Shape3D {
  const sk = (p: PSec) => { let d = draw(p.pts[0]); for (const q of p.pts.slice(1)) d = d.lineTo(q); return d.close().sketchOnPlane(makePlane("XY", [0, 0, p.z])); };
  const [first, ...rest] = secs;
  return keep((sk(first) as any).loftWith(rest.map(sk), { ruled: !smooth }) as Shape3D);
}
/** Each vertex moved inwards by d along its angle bisector (a 2-D offset of a convex-ish outline). */
function insetPoly(pts: [number, number][], d: number): [number, number][] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];   // left normals (inwards for CCW)
    const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(m[0], m[1]) || 1, cos = (m[0] * n1[0] + m[1] * n1[1]) / ml;
    const k = d / Math.max(cos, 0.35);
    return [p[0] + (m[0] / ml) * k, p[1] + (m[1] / ml) * k] as [number, number];
  });
}
function ploftShell(secs: PSec[], t: number, open: "both" | "start" | "end" = "both", smooth = false): Shape3D {
  const outer = ploftOf(secs, smooth), n = secs.length, z0 = secs[0].z, z1 = secs[n - 1].z;
  try {
    const finder = (f: any) => open === "start" ? f.inPlane("XY", z0) : open === "end" ? f.inPlane("XY", z1) : f.either([(g: any) => g.inPlane("XY", z0), (g: any) => g.inPlane("XY", z1)]);
    const sh = keep((outer as any).shell(-t, finder) as Shape3D);
    const v = volOf(sh), vo = volOf(outer);
    if (v > 0 && v < vo) return sh;
  } catch { /* fall through */ }
  // fallback: subtract the inset outline (walls t thick measured in each section's plane)
  const inner = secs.map((p) => ({ z: p.z, pts: insetPoly(p.pts, t) })), dir = Math.sign(z1 - z0) || 1;
  if (open !== "end") inner.unshift({ z: z0 - dir * 10, pts: inner[0].pts });
  else inner[0] = { z: z0 + dir * t, pts: inner[0].pts };
  if (open !== "start") inner.push({ z: z1 + dir * 10, pts: inner[inner.length - 1].pts });
  else inner[inner.length - 1] = { z: z1 - dir * t, pts: inner[inner.length - 1].pts };
  return keep(outer.cut(ploftOf(inner, smooth)) as Shape3D);
}
/** Shell of wall t (a true normal offset, so the wall is t thick even where the surface is nearly flat), open at the
 *  chosen ends. Falls back to shrinking the sections when OpenCascade cannot offset a surface. */
function loftShell(secs: [number, number, number, number?, number?][], t: number, open: "both" | "start" | "end" = "both", rim = 0): Shape3D {
  const shell = loftShellRaw(secs, t, open);
  if (!(rim > 0)) return shell;
  // rolled rim: the wall is doubled over the last `rim` mm of every open end (no knife edge where a flared shell meets
  // its opening at a shallow angle, and a stiffer edge), without changing the outside
  type S = [number, number, number, number?, number?];
  const at = (a: S, b: S, z: number): S => { const u = (z - a[0]) / (b[0] - a[0]); const l = (i: number) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * u; return [z, l(1), l(2), l(3), l(4)]; };
  const n = secs.length, ends: [S, S][] = [];
  if (open !== "end") ends.push([secs[0], secs[1]]);
  if (open !== "start") ends.push([secs[n - 1], secs[n - 2]]);
  let out = shell;
  for (const [e, next] of ends) {
    const dir = Math.sign(next[0] - e[0]) || 1, far = at(e, next, e[0] + dir * rim);
    const inset = (x: S, d: number): S => [x[0], Math.max(x[1] - d, 1), Math.max(x[2] - d, 1), x[3], x[4]];
    try {
      const band = keep(loftOf([inset(e, 0.3), inset(far, 0.3)]).cut(loftOf([[e[0] - dir, ...inset(e, 2 * t).slice(1)] as S, [far[0] + dir, ...inset(far, 2 * t).slice(1)] as S])) as Shape3D);
      out = safeFuse(out, band);
    } catch { /* keep the plain edge */ }
  }
  return out;
}
function loftShellRaw(secs: [number, number, number, number?, number?][], t: number, open: "both" | "start" | "end"): Shape3D {
  const outer = loftOf(secs), n = secs.length, z0 = secs[0][0], z1 = secs[n - 1][0];
  try {
    const finder = (f: any) => open === "start" ? f.inPlane("XY", z0) : open === "end" ? f.inPlane("XY", z1) : f.either([(g: any) => g.inPlane("XY", z0), (g: any) => g.inPlane("XY", z1)]);
    const sh = keep((outer as any).shell(-t, finder) as Shape3D);
    // OpenCascade occasionally returns an inside-out or empty offset without an error: only keep a sane shell
    const vol = (x: Shape3D) => { const p = measureShapeVolumeProperties(x as never); try { return p.volume; } finally { (p as any).delete?.(); } };
    const v = vol(sh), vo = vol(outer);
    if (v > 0 && v < vo) return sh;
  } catch { /* fall through */ }
  const shrink = ([z, rx, ry, cx, cy]: [number, number, number, number?, number?]) => [z, Math.max(rx - t, 1), Math.max(ry - t, 1), cx, cy] as [number, number, number, number?, number?];
  const inner = secs.map(shrink), a = inner[0], b = inner[n - 1], dir = Math.sign(z1 - z0) || 1;
  const plug = (s0: typeof a, from: number, to: number) => loftOf([[from, ...s0.slice(1)] as typeof a, [to, ...s0.slice(1)] as typeof a]);
  let hollow = loftOf(inner);
  if (open !== "end") hollow = keep(hollow.fuse(plug(a, a[0] - dir * 10, a[0] + dir * 0.5)));
  if (open !== "start") hollow = keep(hollow.fuse(plug(b, b[0] - dir * 0.5, b[0] + dir * 10)));
  return keep(outer.cut(hollow) as Shape3D);
}

/** Convex hull of solids as an exact convex polyhedron (coplanar facets merged). */
function hullOf(parts: Shape3D[]): Shape3D {
  const pts: number[][] = [];
  for (const p of parts) { const m = p.mesh({ tolerance: 0.05, angularTolerance: 0.15 }); for (let i = 0; i < m.vertices.length; i += 3) pts.push([m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]]); }
  // manifold-3d computes the hull; each hull triangle becomes a planar face and simplify() merges coplanar ones
  const h = mf!.Manifold.hull(pts as [number, number, number][]), g = h.getMesh(); h.delete();
  const P = (i: number): Vec3 => [g.vertProperties[i * g.numProp], g.vertProperties[i * g.numProp + 1], g.vertProperties[i * g.numProp + 2]];
  const polys: Shape3D[] = [];
  for (let i = 0; i < g.triVerts.length; i += 3) polys.push(keep(makePolygon([P(g.triVerts[i]), P(g.triVerts[i + 1]), P(g.triVerts[i + 2])]) as unknown as Shape3D));
  const solid = keep(makeSolid(polys as never) as Shape3D);
  try { return keep(solid.simplify() as Shape3D); } catch { return solid; }
}

// ---------------------------------------------------------------- fasteners and actuator features
function screwCuts(holes: Hole[], into: Mat4, depth: number, head = 0): Shape3D[] {
  const cuts: Shape3D[] = [];
  for (const h of holes) {
    const d = h.thread ? Number(h.thread.replace(/^M/, "")) + 0.4 : h.dia_mm + 0.3;
    const p = apply(into, h.pos), a = applyDir(into, h.axis);
    cuts.push(rod(sub(p, a), [p[0] + a[0] * (depth + 0.5), p[1] + a[1] * (depth + 0.5), p[2] + a[2] * (depth + 0.5)], d / 2));
    if (head > 0) cuts.push(rod([p[0] + a[0] * head, p[1] + a[1] * head, p[2] + a[2] * head], [p[0] + a[0] * (head + 40), p[1] + a[1] * (head + 40), p[2] + a[2] * (head + 40)], d * 0.95));
  }
  return cuts;
}
const bodyBox = (key: string) => { const b = part(key).bbox_mm!; return { min: b.min as Vec3, max: b.max as Vec3 }; };
function keepoutOf(key: string, T: Mat4, c = 0.4): Shape3D {
  const { min, max } = bodyBox(key), r = hornRadiusMm(key);
  const body = box([min[0] - c, min[1] - c, min[2] - c], [max[0] + c, max[1] + c, Math.min(max[2], -0.8) + c]);
  return transformed(keep(body.fuse(rod([0, 0, -3], [0, 0, 60], r + 1.5))), T);
}
function cradleOf(key: string, T: Mat4, wall: number): { add: Shape3D[]; cut: Shape3D[] } {
  const { min, max } = bodyBox(key), top = Math.min(max[2], -0.8) - 1.2, rim = 5;
  const shell = transformed(box([min[0] - wall, min[1] - wall, min[2] - wall], [max[0] + wall, max[1] + wall, top], wall), T);
  // case screws pass through the whole wall: a hole recessed into the case (the STS3250's rear M3s sit 1.7 mm inside its
  // face) is cut that much further, or a 0.2 mm skin is left over it; holes run on 12 mm past the cradle so any structure
  // behind it gets a clean screwdriver hole instead of a thin floor
  const inset = (h: Hole) => { const a = h.axis, k = a.findIndex((x) => Math.abs(x) > 0.9); return k < 0 ? 0 : Math.max(0, a[k] > 0 ? max[k] - h.pos[k] : h.pos[k] - min[k]); };
  const cut = [keepoutOf(key, T), ...caseHoles(key).flatMap((h) => screwCuts([h], T, wall + 12 + inset(h)))];
  // cable slot out of the side: run it well past the wall, or material around the cradle leaves a skin over it
  if (max[0] - min[0] > 3 * rim) cut.push(transformed(box([min[0] + rim, max[1] - 1, min[2] + 1.5], [Math.min(max[0] - rim, min[0] + rim + 12), max[1] + wall + 20, min[2] + 9]), T));
  return { add: [shell], cut };
}
function hornOf(key: string, t: number, extra: number, channel?: number): { add: Shape3D[]; cut: Shape3D[] } {
  // hobby servos ship with a plastic horn on the spline: the plate takes it in a matching pocket (cross or disc, 0.3 mm
  // clearance) that also locates it, and stays at least 1.6 mm thick over the pocket
  const pocket: Shape3D[] = [];
  if (key.startsWith("hobby_")) {
    const sp = part(key).specs, h = (part(key).bbox_mm?.max[2] ?? 0) + 0.2, r = Number(sp.horn_radius_mm ?? hornRadiusMm(key)) + 0.3;
    t = Math.max(t, h + 1.6);
    if (sp.horn === "cross") pocket.push(box([-r, -3.6, -1], [r, 3.6, h]), box([-3.6, -r, -1], [3.6, r, h]), rod([0, 0, -1], [0, 0, h], 4.1));
    else pocket.push(rod([0, 0, -1], [0, 0, h], r));
  }
  const holes = outputHoles(key), cut = [...pocket, ...screwCuts(holes, I4(), t, 0)];
  if (channel !== undefined) {
    // structure stands on the plate: horn screws go in from the horn side, the spline screw through a centre channel
    cut.push(rod([0, 0, -1], [0, 0, t + channel], centreHoleR(key)));
    return { add: [rod([0, 0, 0], [0, 0, t], hornRadiusMm(key) + extra)], cut };
  }
  if (holes.length) {
    const rMax = Math.max(...holes.map((h) => Math.hypot(h.pos[0], h.pos[1]))), dHead = (holes[0].thread ? Number(holes[0].thread.replace(/^M/, "")) + 0.4 : holes[0].dia_mm + 0.3) * 1.9;
    cut.push(rod([0, 0, t], [0, 0, t + 60], rMax + dHead / 2 + 0.6));
  }
  cut.push(rod([0, 0, -1], [0, 0, t + 1], centreHoleR(key)));
  return { add: [rod([0, 0, 0], [0, 0, t], hornRadiusMm(key) + extra)], cut };
}
/** clearance for the spline screw's head: M3 socket head on bus servos, M2 / M2.5 pan head (4.5 mm) on hobby servos */
const centreHoleR = (key: string) => (key.startsWith("cubemars_") ? 8 : key.startsWith("hobby_") ? 2.4 : 3.3);

// ---------------------------------------------------------------- programs
function solidOf(o: Op): { add: Shape3D[]; cut: Shape3D[] } {
  switch (o.op) {
    case "horn": return hornOf(o.key, o.t ?? 4, o.extra ?? 4, o.channel);
    case "cradle": return cradleOf(o.key, o.T, o.wall ?? 3);
    case "beam": return { add: [beam(o.a, o.b, o.w, o.h, o.up)], cut: [] };
    case "rod": return { add: [rod(o.a, o.b, o.r)], cut: [] };
    case "box": return { add: [box(o.min, o.max, o.r ?? 0)], cut: [] };
    case "hull": { const ps = o.of.map(solidOf), h = hullOf(ps.flatMap((p) => p.add)); return o.cut ? { add: [], cut: [h] } : { add: [h], cut: ps.flatMap((p) => p.cut) }; }
    case "revolve": return { add: [revolveOutline(o.pts)], cut: [] };
    case "subtract": return { add: [], cut: [evaluate({ name: "subtract", ops: o.of })] };
    case "solid": return { add: [evaluate({ name: "solid", ops: o.of })], cut: [] };
    case "ploft": return { add: [o.t ? ploftShell(o.sections, o.t, o.open, o.smooth) : ploftOf(o.sections, o.smooth)], cut: [] };
    case "loft": return { add: [o.t ? loftShell(o.sections, o.t, o.open, o.rim) : loftOf(o.sections)], cut: [] };
    case "sphere": { const b = keep(makeSphere(o.r) as Shape3D), s = keep(b.translate(o.c) as Shape3D); return o.cut ? { add: [], cut: [s] } : { add: [s], cut: [] }; }
    case "keepout": return { add: [], cut: [keepoutOf(o.key, o.T)] };
    // holes print about 0.15 mm small on FDM: cut them that much over size
    case "hole": return { add: [], cut: [rod(o.a, o.b, o.d / 2 + 0.075)] };
    case "cutbox": return { add: [], cut: [box(o.min, o.max)] };
    case "at": { const ps = o.of.map(solidOf); return { add: ps.flatMap((p) => p.add.map((s) => transformed(s, o.T))), cut: ps.flatMap((p) => p.cut.map((s) => transformed(s, o.T))) }; }
    case "lighten": {
      const ax = o.axis ?? [0, 0, 1], cut: Shape3D[] = [];
      for (let i = 1; i <= o.n; i++) {
        const t = i / (o.n + 1), c: Vec3 = [o.a[0] + (o.b[0] - o.a[0]) * t, o.a[1] + (o.b[1] - o.a[1]) * t, o.a[2] + (o.b[2] - o.a[2]) * t];
        cut.push(rod([c[0] - ax[0] * 200, c[1] - ax[1] * 200, c[2] - ax[2] * 200], [c[0] + ax[0] * 200, c[1] + ax[1] * 200, c[2] + ax[2] * 200], o.r));
      }
      return { add: [], cut };
    }
  }
}
// OpenCascade booleans occasionally return an inside-out or truncated solid without raising: every result is checked
// against what a union / difference can be, and retried another way when it is impossible.
const volOf = (x: Shape3D) => { try { return measureVolume(x as never); } catch { return Number.NaN; } };
function safeFuse(a: Shape3D, b: Shape3D): Shape3D {
  const va = volOf(a), vb = volOf(b), floor = Math.max(va, vb) * 0.999, ceil = (va + vb) * 1.001;
  const ok = (r: Shape3D) => { const v = volOf(r); return Number.isFinite(v) && v >= floor && v <= ceil; };
  const attempts: (() => Shape3D)[] = [() => a.fuse(b), () => b.fuse(a), () => a.fuse(keep(b.translate([1e-3, 1e-3, 1e-3]) as Shape3D))];
  for (const f of attempts) { try { const r = keep(f()); if (ok(r)) return r; } catch { /* next */ } }
  throw new Error(`union failed (${va.toFixed(0)} + ${vb.toFixed(0)} mm^3)`);
}
function safeCut(a: Shape3D, tools: Shape3D[]): Shape3D {
  const try1 = (x: Shape3D, t: Shape3D) => { const vx = volOf(x), vt = volOf(t), r = keep(x.cut(t)), v = volOf(r); return Number.isFinite(v) && v >= 0 && v <= vx * 1.001 && v >= vx - vt * 1.001 - 1e-6 ? r : undefined; };
  // all tools at once (one boolean), else one tool at a time
  try { const r = try1(a, unionAll(tools)); if (r) return r; } catch { /* one by one */ }
  let x = a;
  for (const t of tools) {
    let r: Shape3D | undefined;
    try { r = try1(x, t); } catch { r = undefined; }
    if (!r) { try { r = try1(x, keep(t.translate([1e-3, 1e-3, 1e-3]) as Shape3D)); } catch { r = undefined; } }
    if (!r) throw new Error("cut failed");
    x = r;
  }
  return x;
}
/** Union of many solids: a balanced tree (fewer, smaller booleans); when OpenCascade fails on that order, grow the
 *  union piece by piece, always adding a piece that touches what is already built (fusing disjoint pieces first leaves a
 *  multi-solid that later booleans can trip over). */
function unionAll(s: Shape3D[]): Shape3D {
  if (!s.length) throw new Error("program adds no material");
  try {
    let level = s;
    while (level.length > 1) {
      const next: Shape3D[] = [];
      for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? safeFuse(level[i], level[i + 1]) : level[i]);
      level = next;
    }
    return level[0];
  } catch {
    const box = (x: Shape3D) => x.boundingBox.bounds as [number[], number[]];
    const touch = (a: [number[], number[]], b: [number[], number[]]) => [0, 1, 2].every((k) => a[0][k] <= b[1][k] + 0.01 && b[0][k] <= a[1][k] + 0.01);
    let acc = s[0];
    const rest = s.slice(1);
    while (rest.length) {
      const ab = box(acc);
      const order = [...rest.keys()].sort((i, j) => Number(touch(box(rest[j]), ab)) - Number(touch(box(rest[i]), ab)));
      let done = false;
      for (const i of order) {
        try { acc = safeFuse(acc, rest[i]); rest.splice(i, 1); done = true; break; } catch { /* try another piece */ }
      }
      if (!done) throw new Error(`union failed with ${rest.length} pieces left`);
    }
    return acc;
  }
}
function evaluate(p: Program): Shape3D {
  const ps = p.ops.map(solidOf);
  let s = unionAll(ps.flatMap((x) => x.add));
  const cuts = ps.flatMap((x) => x.cut);
  if (cuts.length) s = safeCut(s, cuts);
  if (p.edge) s = tryFillet(s, p.edge);
  return s;
}

// ---------------------------------------------------------------- outputs
export interface TriMesh { v: Vec3[]; f: [number, number, number][]; }
export interface PartFiles {
  /** binary STL (mm), welded into one closed solid */
  stl: Uint8Array;
  /** STEP AP214 text (mm): the exact solid for CAD tools */
  step: string;
  /** the same mesh in metres (URDF / MuJoCo / browser) */
  mesh: TriMesh;
  volume_mm3: number;
  bbox_mm: { min: Vec3; max: Vec3 };
  /** number of separate solids (a printable part is 1) and whether the weld closed the surface */
  bodies: number; watertight: boolean;
  /** through-holes of the solid (manifold genus) */
  genus: number;
}
function weld(vertices: ArrayLike<number>, triangles: ArrayLike<number>) {
  const M = mf!;
  const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(triangles) });
  mesh.merge();
  return summarise(new M.Manifold(mesh));
}
/** The mesh, volume and topology of a manifold solid (consumes it). */
function summarise(solid: InstanceType<NonNullable<typeof mf>["Manifold"]>) {
  try {
    const watertight = solid.status() === "NoError" && !solid.isEmpty();
    const g = solid.getMesh(), v: Vec3[] = [], f: [number, number, number][] = [];
    for (let i = 0; i < g.vertProperties.length; i += g.numProp) v.push([g.vertProperties[i], g.vertProperties[i + 1], g.vertProperties[i + 2]]);
    for (let i = 0; i < g.triVerts.length; i += 3) f.push([g.triVerts[i], g.triVerts[i + 1], g.triVerts[i + 2]]);
    const parts = solid.decompose(), bodies = parts.length;
    for (const p of parts) p.delete();
    return { v, f, watertight, bodies, volume: solid.volume(), genus: solid.genus() };
  } finally { solid.delete(); }
}
function binaryStl(v: Vec3[], f: [number, number, number][], name: string): Uint8Array {
  const buf = new ArrayBuffer(84 + f.length * 50), dv = new DataView(buf), u8 = new Uint8Array(buf);
  u8.set(new TextEncoder().encode(`ttr ${name}`.slice(0, 79)));
  dv.setUint32(80, f.length, true);
  f.forEach(([a, b, c], i) => {
    const o = 84 + i * 50, A = v[a], B = v[b], C = v[c];
    const u = sub(B, A), w = sub(C, A), n: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = len(n) || 1;
    [n[0] / l, n[1] / l, n[2] / l, ...A, ...B, ...C].forEach((x, k) => dv.setFloat32(o + k * 4, x, true));
  });
  return u8;
}
/** Build a part program into its exact solid and every file a maker needs. Call initKernel() first. */
export function exportPart(p: Program, quality: { tolerance?: number; angular?: number } = {}): PartFiles {
  if (!mf) throw new Error("initKernel() has not finished");
  // OpenCascade's mesher occasionally leaves a surface the weld cannot close (tangent fillets, near-coincident faces):
  // retry finer, then without the finishing fillet, then on a cleaned-up shape
  // mesh tolerance grows with the part: 0.05 mm on a servo bracket, up to 0.25 mm on a 40 cm armour shell (a 0.4 mm
  // nozzle cannot show the difference, and the files stay small enough to ship)
  const attempts: { tol: number; ang: number; edge: boolean; clean: boolean }[] = [
    { tol: quality.tolerance ?? 0, ang: quality.angular ?? 0.25, edge: true, clean: false },   // tol 0: scaled to the part
    { tol: 0.02, ang: 0.1, edge: true, clean: false },
    { tol: 0.05, ang: 0.2, edge: false, clean: false },
    { tol: 0.02, ang: 0.1, edge: false, clean: true },
  ];
  let last: unknown, leaky: PartFiles | undefined;
  for (const a of attempts) {
    try {
      const r = scoped(() => {
        let s = evaluate(a.edge ? p : { ...p, edge: 0 });
        if (a.clean) { try { s = keep(s.simplify() as Shape3D); } catch { /* keep the raw shape */ } }
        const bb0 = s.boundingBox.bounds, diag = Math.hypot(bb0[1][0] - bb0[0][0], bb0[1][1] - bb0[0][1], bb0[1][2] - bb0[0][2]);
        const tol = a.tol > 0 ? a.tol : Math.min(0.25, Math.max(0.05, diag / 1600));
        const m = s.mesh({ tolerance: tol, angularTolerance: a.ang });
        const w = weld(m.vertices, m.triangles);
        const bb = s.boundingBox;
        return {
          stl: binaryStl(w.v, w.f, p.name), step: stepText(s),
          mesh: { v: w.v.map((x) => [x[0] / 1000, x[1] / 1000, x[2] / 1000] as Vec3), f: w.f },
          volume_mm3: w.volume, bbox_mm: { min: [...bb.bounds[0]] as Vec3, max: [...bb.bounds[1]] as Vec3 }, bodies: w.bodies, watertight: w.watertight, genus: w.genus,
        };
      });
      if (r.watertight) return r;
      leaky ??= r; last = new Error("surface not closed");
    } catch (e) { last = e; }
  }
  // last resort: mesh every primitive on its own (always clean) and do the booleans on meshes, where coincident faces
  // (a hull face lying on a filleted beam) are handled exactly; the STEP is still the OpenCascade solid when it builds
  try { const r = scoped(() => meshBoolean(p)); if (r.watertight || !leaky) return r; } catch (e) { last = e; }
  if (leaky) return leaky;   // reported as not watertight by the print check, never hidden
  throw new Error(`part "${p.name}" could not be meshed into a closed solid: ${(last as Error)?.message ?? last}`);
}
function meshBoolean(p: Program): PartFiles {
  const M = mf!, ps = p.ops.map(solidOf), live: { delete(): void }[] = [];
  const toM = (sh: Shape3D) => {
    const b = sh.boundingBox.bounds, diag = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]);
    const m = sh.mesh({ tolerance: Math.min(0.25, Math.max(0.03, diag / 1600)), angularTolerance: 0.2 });
    const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(m.vertices), triVerts: new Uint32Array(m.triangles) });
    mesh.merge();
    const x = new M.Manifold(mesh); live.push(x); return x;
  };
  try {
    const adds = ps.flatMap((x) => x.add).map(toM), cuts = ps.flatMap((x) => x.cut).map(toM);
    let solid = M.Manifold.union(adds); live.push(solid);
    if (cuts.length) { const c = M.Manifold.union(cuts); live.push(c); solid = solid.subtract(c); }
    if (solid.status() !== "NoError" || solid.isEmpty()) throw new Error(`mesh boolean failed: ${solid.status()}`);
    // summarise() deletes the result: take it out of the clean-up list so it is never deleted twice (that corrupts the heap)
    const i = live.indexOf(solid); if (i >= 0) live.splice(i, 1);
    const w = summarise(solid);
    let step = "";
    try { step = stepText(evaluate({ ...p, edge: 0 })); } catch { /* mesh only */ }
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const v of w.v) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
    return { stl: binaryStl(w.v, w.f, p.name), step, mesh: { v: w.v.map((x) => [x[0] / 1000, x[1] / 1000, x[2] / 1000] as Vec3), f: w.f },
      volume_mm3: w.volume, bbox_mm: { min: lo, max: hi }, bodies: w.bodies, watertight: w.watertight, genus: w.genus };
  } finally { for (const x of live) x.delete(); }
}
function stepText(s: Shape3D): string {
  const O = oc(), writer = new O.STEPControl_Writer(), progress = new O.Message_ProgressRange();
  try {
    writer.Transfer(s.wrapped, O.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    const file = `/tmp_${Math.random().toString(36).slice(2)}.step`;
    writer.Write(file);
    const text = O.FS.readFile(file, { encoding: "utf8" }) as string;
    O.FS.unlink(file);
    return text;
  } finally { progress.delete(); writer.delete(); }
}

// Designers rebuild identical parts many times (sizing loops, edits): keep the last builds by recipe.
const built = new Map<string, PartFiles>();
/** exportPart with a bounded cache keyed by the program JSON (results are shared: do not mutate them). */
export function partFiles(programJson: string): PartFiles {
  const hit = built.get(programJson);
  if (hit) return hit;
  const r = exportPart(JSON.parse(programJson) as Program);
  if (built.size >= 300) built.delete(built.keys().next().value as string);
  built.set(programJson, r);
  return r;
}
