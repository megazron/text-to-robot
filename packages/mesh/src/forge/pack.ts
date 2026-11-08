// The pack steps of the forged Mark 43, in the browser: a TypeScript port of scripts/pack_armour.py. Every overlap is trimmed, the
// mask's sweep is relieved from the helmet, the collar gives way to the turning helmet, each limb gives way to its parent across the
// joint's range, the shells are simplified, and the pieces are quantised into the pack the designer reads (ArmourManifest + bytes).
import type { TriMesh } from "./mc.ts";
import { J, EAR, MASK_OPEN, type ForgedPiece } from "./mark43.ts";
import { asSolid, asMesh, scope, compose, union, clipUnion, boundsOf, rot, place, bodies, meshBounds, meshVolume, meshCentroid, overlaps, linspace, vertexNormals, type P3 } from "./geo.ts";

export interface Row { name: string; link: string; material: string; region: string; wiring?: boolean; hardware?: boolean; anchor?: P3; normal?: P3; [k: string]: unknown; }
export interface Piece { row: Row; mesh: TriMesh; dirty?: boolean; }
export type Log = (s: string) => void;
export type Tick = (what: string) => void | Promise<void>;

export const RANK = ["head", "torso", "upper_arm", "thigh", "forearm", "shin", "foot", "hand"];
export const SWINGS: [string, string, string, number, number][] = [["shoulder", "upper_arm", "pelvis", -1.04, 0.24], ["hip", "thigh", "pelvis", -1.04, 0.24], ["elbow", "forearm", "upper_arm", -1.95, 0.0], ["knee", "shin", "thigh", 0.0, 1.75]];
export const MESH_TOL = 0.2;
export const HINGE: P3 = [EAR[0], 0.0, EAR[1] - 1580.0];
export const NECK_TURN = 0.8;

/** the rigid body a door closes onto */
export const baseLink = (link: string): string =>
  ({ back_door_left: "pelvis", back_door_right: "pelvis", helmet_door_left: "head", helmet_door_right: "head" } as Record<string, string>)[link] ?? (link.endsWith("_door") ? link.slice(0, -5) : link);

/** joint centres, world mm at the reference height */
export function jointPositions(): Record<string, P3> {
  const j: Record<string, P3> = { standing: J.hip_c, neck_mount: J.neck };
  for (const [sd, n] of [[1, "left"], [-1, "right"]] as const) for (const k of ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"]) j[`${n}_${k}`] = [J[k][0], J[k][1] * sd, J[k][2]];
  return j;
}

const splitInto = (p: Piece, x: unknown, keep: number, tag: string): Piece[] =>
  bodies(x, keep).map((c, i) => ({ row: { ...p.row, name: p.row.name + (i ? `${tag}${i}` : "") }, mesh: asMesh(c) }));

/** one printed part is one solid: bodies that only touch become their own pieces, crumbs are dropped */
export function intake(forged: ForgedPiece[]): Piece[] {
  const out: Piece[] = [];
  for (const f of forged) scope(() => {
    const row: Row = { name: f.name, link: f.link, material: f.material, region: f.region };
    out.push(...splitInto({ row, mesh: f.mesh }, asSolid(f.mesh).simplify(0.2), f.material === "lens_glow" ? 150 : 500, "b"));
  });
  return out;
}

/** Nothing intersects at rest: every piece is trimmed against every piece ranked above it. */
export async function resolve(pieces: Piece[], tick: Tick, log: Log): Promise<Piece[]> {
  const rank = (p: Piece) => { const i = RANK.findIndex((k) => p.row.region.endsWith(k)); return i < 0 ? 9 : i; };
  const order = pieces.map((p, i) => [p, i] as [Piece, number]).sort((a, b) => rank(a[0]) - rank(b[0]) || Number(a[0].row.material !== "lens_glow") - Number(b[0].row.material !== "lens_glow") || a[1] - b[1]).map(([p]) => p);
  const done: { p: Piece; bb: [P3, P3] }[] = [];
  for (const p of order) {
    const bb = meshBounds(p.mesh);
    scope(() => {
      let x = asSolid(p.mesh);
      for (const e of done) if (overlaps(bb, e.bb)) x = x.subtract(asSolid(e.p.mesh));
      for (const q of splitInto(p, x, p.row.material === "lens_glow" ? 150 : 500, "p")) done.push({ p: q, bb: meshBounds(q.mesh) });
    });
    await tick("resolve");
  }
  log(`resolved ${pieces.length} -> ${done.length} pieces`);
  return done.map((e) => e.p);
}

/** solid of the pieces matching `pick`, simplified by `tol` if given */
const solidOf = (ps: Piece[], pick: (p: Piece) => boolean, tol?: number) => { const c = compose(ps.filter(pick).map((p) => asSolid(p.mesh))); return tol ? c.simplify(tol) : c; };
/** `pieces` that `pick` selects lose the solid `cut`; the rest stay as they are */
function cutAll(pieces: Piece[], pick: (p: Piece) => boolean, cut: unknown, tag: string): [Piece[], number] {
  const out: Piece[] = []; let lost = 0;
  for (const p of pieces) {
    if (!pick(p)) { out.push(p); continue; }
    scope(() => {
      const v0 = meshVolume(p.mesh), x = asSolid(p.mesh).subtract(cut); lost += v0 - x.volume();
      out.push(...splitInto(p, x, 500, tag));
    });
  }
  return [out, lost];
}

/** The mask swings about the ear: what is left to relieve on the helmet is the rest round its edges. */
export function workingHelmet(pcs: Piece[], neck: P3, log: Log): Piece[] {
  const h: P3 = [neck[0] + HINGE[0], neck[1] + HINGE[1], neck[2] + HINGE[2]];
  return scope(() => {
    const plate = solidOf(pcs, (p) => p.row.link === "helmet_faceplate");
    const sweep = union(linspace(-0.04, -MASK_OPEN, 32).map((a) => place(rot(h, [0, 1, 0], a), plate)));
    const [out, lost] = cutAll(pcs, (p) => baseLink(p.row.link) === "head", sweep, "r");
    log(`helmet relief ${Math.round(lost)} mm3`);
    return out;
  }) as unknown as Piece[];
}

/** The collar's front lip gives way to the helmet turned NECK_TURN each way. */
export function trimNeck(pcs: Piece[], jpos: Record<string, P3>, log: Log): Piece[] {
  const o = jpos.neck_mount;
  return scope(() => {
    const helmet = solidOf(pcs, (p) => ["head", "helmet_faceplate"].includes(baseLink(p.row.link)), 0.4);
    const pick = (p: Piece) => p.row.region === "torso" && p.row.material !== "lens_glow" && meshBounds(p.mesh)[1][2] >= 1500;
    const n = Math.floor((2 * NECK_TURN) / 0.04) + 1, sweep = clipUnion(linspace(-NECK_TURN, NECK_TURN, n).map((a) => place(rot(o, [0, 0, 1], a), helmet)), boundsOf(pcs.filter(pick).map((p) => p.mesh)));
    const [out, lost] = cutAll(pcs, pick, sweep, "n");
    log(`collar relief ${Math.round(lost)} mm3`);
    return out;
  }) as unknown as Piece[];
}

/** Each limb piece near a joint loses whatever its parent would run into across the joint's whole range. */
export async function trimSwings(pcs: Piece[], jpos: Record<string, P3>, tick: Tick, log: Log): Promise<Piece[]> {
  for (const side of ["left", "right"]) for (const [j, child, parent, lo, hi] of SWINGS) {
    const o = jpos[`${side}_${j}`], cl = `${side}_${child}`, pl = parent === "pelvis" ? parent : `${side}_${parent}`;
    const near = (m: TriMesh) => { const b = meshBounds(m); return [0, 1, 2].every((k) => b[0][k] - 300 < o[k] && b[1][k] + 300 > o[k]); };
    const hard = (p: Piece) => !["armour_mech", "lens_glow"].includes(p.row.material);
    pcs = scope(() => {
      const par = solidOf(pcs, (p) => baseLink(p.row.link) === pl && hard(p) && near(p.mesh), 0.4);
      // python: rotation by -ang about +y, written out as [[c, 0, s], [0, 1, 0], [-s, 0, c]] with c, s of -ang
      const pick = (p: Piece) => baseLink(p.row.link) === cl && hard(p) && near(p.mesh), box = boundsOf(pcs.filter(pick).map((p) => p.mesh));
      const n = Math.max(12, Math.floor((hi - lo) / 0.03)), sweep = clipUnion(linspace(lo, hi, n).map((a) => place(rot(o, [0, 1, 0], -a), par)), box);
      return cutAll(pcs, pick, sweep, "w")[0];
    }) as unknown as Piece[];
    log(`trimmed ${side} ${j}`); await tick("swings");
  }
  return pcs;
}

/** pack_armour.py main(): the shells, trimmed, simplified, with the joint sleeves giving way to the armour once more. */
export async function packShells(forged: ForgedPiece[], tick: Tick, log: Log): Promise<{ pieces: Piece[]; jpos: Record<string, P3> }> {
  const jpos = jointPositions();
  let pcs = intake(forged); await tick("intake");
  pcs = await resolve(pcs, tick, log);
  pcs = workingHelmet(pcs, jpos.neck_mount, log); await tick("helmet");
  pcs = trimNeck(pcs, jpos, log); await tick("collar");
  pcs = await trimSwings(pcs, jpos, tick, log);
  pcs = pcs.map((p) => scope(() => ({ row: p.row, mesh: asMesh(asSolid(p.mesh).simplify(MESH_TOL)) })) as unknown as Piece);
  await tick("simplify");
  const hard = pcs.filter((p) => p.row.material !== "armour_mech").map((p) => ({ bb: meshBounds(p.mesh), p }));
  const out: Piece[] = [];
  for (const p of pcs) {
    if (p.row.material !== "armour_mech") { out.push(p); continue; }
    scope(() => {
      let x = asSolid(p.mesh); const bb = meshBounds(p.mesh);
      for (const h of hard) if (overlaps(bb, h.bb)) x = x.subtract(asSolid(h.p.mesh));
      out.push(...splitInto(p, x, 500, "m"));
    });
  }
  await tick("sleeves");
  return { pieces: out, jpos };
}

// ------------------------------------------------------------------ the pack's storage
/** a deterministic normal(0, sd) stream (numpy's generator cannot be matched; only its scale matters) */
function gauss(seed: number): () => number {
  let s = seed >>> 0;
  const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}
export interface Encoded { lo: P3; step: P3; raw: Uint8Array; mesh: TriMesh; }
/** The pack's storage (uint16 per coordinate in the piece's own box, uint16 indices), with sheets that meet at a point parted so the
 *  quantised mesh stays closed (fit_wiring.encode). */
export function encode(m: TriMesh): Encoded {
  const v = Float64Array.from(m.v), nv = v.length / 3, nrm = vertexNormals(m), rnd = gauss(1);
  const box = () => { const lo: P3 = [Infinity, Infinity, Infinity], hi: P3 = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < v.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], v[i + a]); hi[a] = Math.max(hi[a], v[i + a]); } return [lo, [0, 1, 2].map((a) => Math.max((hi[a] - lo[a]) / 65535, 1e-6)) as P3] as const; };
  for (let it = 0; it < 8; it++) {
    const [lo, step] = box(), seen = new Map<string, number[]>();
    for (let i = 0; i < nv; i++) { const k = [0, 1, 2].map((a) => Math.round((v[i * 3 + a] - lo[a]) / step[a])).join(","); const l = seen.get(k); if (l) l.push(i); else seen.set(k, [i]); }
    let dup = false;
    for (const l of seen.values()) if (l.length > 1) { dup = true; for (const i of l) for (let a = 0; a < 3; a++) v[i * 3 + a] += nrm[i * 3 + a] * -0.03 + rnd() * 0.012; }
    if (!dup) break;
  }
  if (nv > 65535) throw new Error("too many vertices for one piece");
  const [lo, step] = box(), raw = new Uint8Array(nv * 6 + m.f.length * 2), dv = new DataView(raw.buffer);
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) dv.setUint16((i * 3 + a) * 2, Math.round((v[i * 3 + a] - lo[a]) / step[a]), true);
  for (let i = 0; i < m.f.length; i++) dv.setUint16(nv * 6 + i * 2, m.f[i], true);
  return { lo: lo.map((x) => Math.round(x * 1e4) / 1e4) as P3, step, raw, mesh: { v, f: m.f } };
}
/** the mesh the pack gives back for a piece */
export function decode(raw: Uint8Array, lo: P3, step: P3, nv: number, nf: number): TriMesh {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), v = new Float64Array(nv * 3), f = new Uint32Array(nf * 3);
  for (let i = 0; i < nv * 3; i++) v[i] = lo[i % 3] + dv.getUint16(i * 2, true) * step[i % 3];
  for (let i = 0; i < nf * 3; i++) f[i] = dv.getUint16(nv * 6 + i * 2, true);
  return { v, f };
}
export const r2 = (x: number) => Math.round(x * 100) / 100;
/** a row's measured fields from its mesh */
export function measured(m: TriMesh): { volume_mm3: number; centroid: P3 } { return { volume_mm3: Math.round(meshVolume(m) * 10) / 10, centroid: meshCentroid(m).map(r2) as P3 }; }
