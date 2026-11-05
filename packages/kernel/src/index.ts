// CAD kernel for printed parts: the same serializable part programs as @ttr/solid, built as exact
// B-rep solids on OpenCascade (Replicad, WASM in Node and the browser). Real fillets, STEP export for
// Fusion / FreeCAD / Onshape, and print meshes welded and validated by manifold-3d (closed, one solid).
//   await initKernel();  const { stl, step, volume_mm3 } = exportPart(program);
import opencascade from "replicad-opencascadejs";
import { setOC, getOC, cast, makeBox, makeCylinder, makePolygon, makeSolid, makeSphere, draw, type Shape3D, type AnyShape } from "replicad";
import Manifold from "manifold-3d";
import { part, caseHoles, outputHoles, hornRadiusMm, type Hole, type Vec3 } from "@ttr/parts";

export type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
export type Op =
  | { op: "horn"; key: string; t?: number; extra?: number }
  | { op: "cradle"; key: string; T: Mat4; wall?: number }
  | { op: "beam"; a: Vec3; b: Vec3; w: number; h: number; up?: Vec3 }
  | { op: "rod"; a: Vec3; b: Vec3; r: number }
  | { op: "box"; min: Vec3; max: Vec3; r?: number }
  | { op: "hull"; of: Op[] }
  | { op: "keepout"; key: string; T: Mat4 }
  | { op: "hole"; a: Vec3; b: Vec3; d: number }
  | { op: "cutbox"; min: Vec3; max: Vec3 }
  | { op: "lighten"; a: Vec3; b: Vec3; r: number; n: number; axis?: Vec3 }
  | { op: "revolve"; pts: [number, number][]; seg?: number }
  | { op: "sphere"; c: Vec3; r: number; cut?: boolean }                      // ball (or a spherical socket when cut)
  | { op: "at"; T: Mat4; of: Op[] };
/** `edge`: radius (mm) of the fillet that breaks every outer edge after the booleans (0 = sharp). */
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
  const cut = [keepoutOf(key, T), ...screwCuts(caseHoles(key), T, wall + 1)];
  if (max[0] - min[0] > 3 * rim) cut.push(transformed(box([min[0] + rim, max[1] - 1, min[2] + 1.5], [Math.min(max[0] - rim, min[0] + rim + 12), max[1] + wall + 1, min[2] + 9]), T));
  return { add: [shell], cut };
}
function hornOf(key: string, t: number, extra: number): { add: Shape3D[]; cut: Shape3D[] } {
  const holes = outputHoles(key), cut = screwCuts(holes, I4(), t, 0);
  if (holes.length) {
    const rMax = Math.max(...holes.map((h) => Math.hypot(h.pos[0], h.pos[1]))), dHead = (holes[0].thread ? Number(holes[0].thread.replace(/^M/, "")) + 0.4 : holes[0].dia_mm + 0.3) * 1.9;
    cut.push(rod([0, 0, t], [0, 0, t + 60], rMax + dHead / 2 + 0.6));
  }
  cut.push(rod([0, 0, -1], [0, 0, t + 1], key.startsWith("cubemars_") ? 8 : 3.3));
  return { add: [rod([0, 0, 0], [0, 0, t], hornRadiusMm(key) + extra)], cut };
}

// ---------------------------------------------------------------- programs
function solidOf(o: Op): { add: Shape3D[]; cut: Shape3D[] } {
  switch (o.op) {
    case "horn": return hornOf(o.key, o.t ?? 4, o.extra ?? 4);
    case "cradle": return cradleOf(o.key, o.T, o.wall ?? 3);
    case "beam": return { add: [beam(o.a, o.b, o.w, o.h, o.up)], cut: [] };
    case "rod": return { add: [rod(o.a, o.b, o.r)], cut: [] };
    case "box": return { add: [box(o.min, o.max, o.r ?? 0)], cut: [] };
    case "hull": { const ps = o.of.map(solidOf); return { add: [hullOf(ps.flatMap((p) => p.add))], cut: ps.flatMap((p) => p.cut) }; }
    case "revolve": return { add: [revolveOutline(o.pts)], cut: [] };
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
/** Union of many solids as a balanced tree (fewer, smaller booleans than a chain). */
function unionAll(s: Shape3D[]): Shape3D {
  if (!s.length) throw new Error("program adds no material");
  let level = s;
  while (level.length > 1) {
    const next: Shape3D[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? keep(level[i].fuse(level[i + 1])) : level[i]);
    level = next;
  }
  return level[0];
}
function evaluate(p: Program): Shape3D {
  const ps = p.ops.map(solidOf);
  let s = unionAll(ps.flatMap((x) => x.add));
  const cuts = ps.flatMap((x) => x.cut);
  if (cuts.length) s = keep(s.cut(unionAll(cuts)));
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
  const solid = new M.Manifold(mesh);
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
  return scoped(() => {
    const s = evaluate(p);
    const m = s.mesh({ tolerance: quality.tolerance ?? 0.05, angularTolerance: quality.angular ?? 0.2 });
    const w = weld(m.vertices, m.triangles);
    const bb = s.boundingBox;
    const step = stepText(s);
    return {
      stl: binaryStl(w.v, w.f, p.name), step,
      mesh: { v: w.v.map((x) => [x[0] / 1000, x[1] / 1000, x[2] / 1000] as Vec3), f: w.f },
      volume_mm3: w.volume, bbox_mm: { min: [...bb.bounds[0]] as Vec3, max: [...bb.bounds[1]] as Vec3 }, bodies: w.bodies, watertight: w.watertight, genus: w.genus,
    };
  });
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
