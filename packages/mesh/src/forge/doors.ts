// The forged door panels made into a working mechanism, in the browser: a TypeScript port of scripts/fit_doors.py. For every door it makes
// hinges (a fixed leaf with two knuckles, a door leaf with one between them, on a steel pin), a drive (a servo pod on the fixed half with
// its output on the hinge line, an arm to the door) and latches (a sprung pawl on a servo, hooking a ledge). Shells give way to the hardware
// and its swing; doors open in their staged order and give way to what they meet; `measure` sweeps every door with exact intersection.
import { CATALOG, componentMesh } from "@ttr/parts";
import type { TriMesh } from "./mc.ts";
import type { DoorRecord } from "./mark43.ts";
import { Rays } from "./ray.ts";
import {
  asSolid, asMesh, scope, scopeAsync, free, compose, union, hull, cube, cylinder, place, turn, sweep, bigger, biggest, bbox, overlaps, at, meshBounds, meshVolume, type P3, type M34, type Solid,
} from "./geo.ts";
import { baseLink, SWINGS, type Piece, type Log, type Tick } from "./pack.ts";
import { getPool, runAll, type Job } from "./pool.ts";
import { answerJob } from "./jobs.ts";

const R_BARREL = 6.0, R_SLOT = 7.5, BORE = 4.2, KNUCKLE = 5.6, FIXED_H = 19.0, POD_WALL = 2.4, POCKET = 0.3, AIR = 0.6;
export const PAWL_TRAVEL = 0.2;
const LATCH_SERVO = "hobby_mg90s", PAWL_H = 9.0, LATCH_BACK = 16.0, LATCH_REACH = 18.0, LATCH_IN = 9.5;
export const STAGES = [["forearm"], ["shin"], ["upper_arm"], ["thigh"], ["torso"], ["head"]];
const TOUCH = 2.0, CRUMB = 0.05, COLLIDE = 400.0;
export const HARD = ["armour_red", "armour_gold", "armour_silver"];

const add = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: P3, s: number): P3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: P3): P3 => scl(a, 1 / Math.hypot(a[0], a[1], a[2]));
const range = (a: number, b: number, s: number): number[] => { const o: number[] = []; const n = Math.ceil((b - a) / s); for (let i = 0; i < n; i++) o.push(a + i * s); return o; };
const lin = (a: number, b: number, n: number) => (n === 1 ? [a] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));
const ring = (n: number) => Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n);

interface Servo { v: P3[]; body: P3[]; all: P3[]; top: number; tab: number; holes: { pos: P3 }[]; horn: number; out: number; }
const servos = new Map<string, Servo>();
/** the servo's vertices (mm, output at the origin, +z out, case towards -x), its case top, tab plane, tab holes and horn radius */
export function servoBody(key: string): Servo {
  const got = servos.get(key); if (got) return got;
  const all = componentMesh(key).v.map((p) => [p[0] * 1000, p[1] * 1000, p[2] * 1000] as P3), c = CATALOG[key];
  const holes = (c.holes as { pos: P3; axis: P3 }[]).filter((h) => h.axis[2] < -0.5 && Math.abs(h.pos[2]) > 3), tab = holes[0].pos[2];
  const top = key === "hobby_mg90s" ? -5.95 : -6.05;
  const s: Servo = { v: all.filter((p) => p[2] <= top), body: all.filter((p) => p[2] < tab - 0.01), all, top, tab, holes, horn: Number(c.specs.horn_radius_mm), out: Math.max(...all.map((p) => p[2])) };
  servos.set(key, s); return s;
}
/** 3x4 from local (x towards the fixed half, z up the hinge) to world */
export function frame(n: P3, up: P3, c: P3): M34 {
  const z = up; let x = sub(n, scl(z, dot(n, z))); x = unit(x); const y = cross(z, x);
  return [0, 1, 2].map((i) => [x[i], y[i], z[i], c[i]]);
}
const cylAt = (M: M34, r: number, z0: number, z1: number): Solid => place(M, cylinder(z1 - z0, r, 40).translate([0, 0, z0]));
const boxAt = (M: M34, lo: P3, hi: P3): Solid => place(M, cube(sub(hi, lo)).translate(lo));
const corners = (M: M34, lo: P3, hi: P3): P3[] => { const o: P3[] = []; for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) o.push(at(M, [x, y, z])); return o; };
const minMax = (ps: P3[]): [P3, P3] => [[0, 1, 2].map((k) => Math.min(...ps.map((p) => p[k]))) as P3, [0, 1, 2].map((k) => Math.max(...ps.map((p) => p[k]))) as P3];

/** the pieces of one rigid group */
export class Shells {
  items: Piece[];
  constructor(pieces: Piece[], links: Set<string>) { this.items = pieces.filter((e) => links.has(e.row.link) && HARD.includes(e.row.material)); }
  near(c: P3, r = 150): Piece[] { const lo = sub(c, [r, r, r]), hi = add(c, [r, r, r]); return this.items.filter((e) => { const b = meshBounds(e.mesh); return [0, 1, 2].every((k) => b[0][k] < hi[k] && b[1][k] > lo[k]); }); }
  /** first surface along each ray from O in direction D (world), or null */
  hit(O: P3[], D: P3, c: P3): (P3 | null)[] {
    const ms = this.near(c); if (!ms.length) return O.map(() => null);
    const R = new Rays(ms.map((e) => e.mesh));
    return O.map((o) => { const h = R.hits(o, D); return h.length ? h[0].p : null; });
  }
  /** take a clearance body out of the shells it touches */
  cut(solid: Solid): number {
    const bb = bbox(solid); let lost = 0;
    for (const e of this.items) {
      if (!overlaps(meshBounds(e.mesh), bb)) continue;
      scope(() => { const x = asSolid(e.mesh).subtract(solid), v = meshVolume(e.mesh) - x.volume(); if (v > 0.01) { lost += v; e.mesh = asMesh(biggest(x)); e.dirty = true; } });
    }
    return lost;
  }
  minus(solid: Solid): Solid {
    const bb = bbox(solid);
    for (const e of this.items) if (overlaps(meshBounds(e.mesh), bb)) solid = solid.subtract(asSolid(e.mesh));
    return solid;
  }
}
const level = (out: P3, e: P3): P3 => unit(sub(out, scl(e, dot(out, e))));

/** points just inside the outer face of a shell at local (x, z); a ray that finds no shell near the hinge line went through an opening */
function contacts(sh: Shells, M: M34, out: P3, xs: number[], zs: number[], depth = 0.6, reach = 45.0): P3[] {
  const O: P3[] = []; for (const x of xs) for (const z of zs) O.push(add(at(M, [x, 0, z]), scl(out, 70)));
  const c = at(M, [0, 0, 0]), hs = sh.hit(O, scl(out, -1), c), res: P3[] = [];
  hs.forEach((p, i) => { if (p && Math.hypot(...sub(p, O[i])) < 70 + reach) res.push(sub(p, scl(out, depth))); });
  return res;
}

function hinge(d: DoorRecord, c: P3, fixed: Shells, door: Shells): [Solid, Solid] {
  const e = d.up, out = level(d.out, e), M = frame(d.normal, e, c);
  const rg = (h: number) => ring(16).flatMap((t) => [-h, h].map((z) => at(M, [R_BARREL * Math.cos(t), R_BARREL * Math.sin(t), z])));
  const pf = contacts(fixed, M, out, [12, 24, 34], [-FIXED_H, 0, FIXED_H]), pd = contacts(door, M, out, [-12, -24, -34], [-KNUCKLE, KNUCKLE]);
  if (pf.length < 3 || pd.length < 2) throw new Error(`${d.name}: no shell under a hinge at ${c.map(Math.round)}`);
  const bore = cylAt(M, BORE / 2, -40, 40), slot = cylAt(M, R_SLOT, -KNUCKLE - 0.5, KNUCKLE + 0.5);
  const lf = hull([...rg(FIXED_H), ...pf, ...pf.map((p) => add(p, scl(out, 2.4)))]).subtract(bore).subtract(slot).subtract(boxAt(M, [-60, -60, -KNUCKLE - 0.5], [0, 60, KNUCKLE + 0.5]));
  const ld = hull([...rg(KNUCKLE), ...pd, ...pd.map((p) => add(p, scl(out, 2.4)))]).subtract(bore).subtract(boxAt(M, [0.4, -60, -10], [60, 60, 10]).subtract(cylAt(M, R_BARREL + 0.2, -10, 10)));
  return [lf, ld];
}

const holesOf = (Ms: M34, S: Servo, r: number) => union(S.holes.map((h) => place(Ms, cylinder(9.0, r, 16).translate([h.pos[0], h.pos[1], S.tab - 8.5]))));
const pocketOf = (Ms: M34, S: Servo) => bigger(hull([...S.body.map((p) => at(Ms, p)), ...S.body.map((p) => at(Ms, [p[0], p[1], S.tab + 1]))]), POCKET);

function drive(d: DoorRecord, fixed: Shells, door: Shells): [Solid, Solid, Solid, M34] {
  const key = d.servo.key, S = servoBody(key), c = d.servo.at, e = d.up, n = d.normal, out = level(d.out, e);
  const Ms = frame(scl(n, -1), e, c), [lo, hi] = minMax(S.body);
  const lo2: P3 = [lo[0] - POD_WALL, lo[1] - POD_WALL, lo[2] - POD_WALL], hi2: P3 = [hi[0] + POD_WALL, hi[1] + POD_WALL, S.tab];
  fixed.cut(bigger(boxAt(Ms, lo2, hi2), 0.05));
  const M = frame(n, e, c), skirt = contacts(fixed, M, out, lin(4, -lo2[0] + 10, 5), lin(lo2[2] - 6, S.tab, 5));
  const blister = hull([...corners(Ms, lo2, hi2), ...skirt, ...skirt.map((p) => add(p, scl(out, 2.0)))]);
  const pod = blister.subtract(pocketOf(Ms, S)).subtract(holesOf(Ms, S, key.includes("mg90") ? 0.85 : 1.3)).subtract(boxAt(M, [-60, -60, S.tab], [60, 60, 80]));
  const z0 = S.out + 0.5, r = S.horn + 1.5, pd = contacts(door, M, out, [-r - 4, -r - 12, -r - 22], [z0, z0 + 6]);
  if (pd.length < 2) throw new Error(`${d.name}: no door under the drive arm`);
  const rg = ring(28).flatMap((t) => [z0, z0 + 6].map((z) => at(M, [r * Math.cos(t), r * Math.sin(t), z])));
  const arm = hull([...rg, ...pd, ...pd.map((p) => add(p, scl(out, 2.4)))]);
  const body = hull(S.v.map((p) => at(Ms, p))), horn = cylAt(M, S.horn + 0.8, S.top - 0.5, S.out + 0.2), keepOut = body.add(horn);
  fixed.cut(bigger(keepOut, POCKET));
  return [pod, arm, keepOut, Ms];
}

function latch(name: string, seam: P3, u0: P3, f0: P3, w0: P3, carrier: Shells, catcher: Shells): { block: Solid; pawl: Solid; ledge: Solid; Ms: M34; A: P3; u: P3; sign: number; depth: number } {
  const S = servoBody(LATCH_SERVO), u = unit(u0), f = unit(f0), w = unit(w0);
  let A: P3 = seam;
  for (let inset = LATCH_IN; inset < 40.0; inset += 1.0) {
    A = add(add(seam, scl(f, LATCH_BACK)), scl(w, inset));
    const ok = scope(() => { const whole = bigger(hull(S.all.map((p) => at(frame(scl(f, -1), u, A), p))), 0.4); return carrier.minus(whole).volume() > whole.volume() - 0.2; }) as unknown as boolean;
    if (ok) break;
  }
  const P = (x: number, y: number, z: number): P3 => add(add(add(A, scl(f, x)), scl(w, y)), scl(u, z));
  const Ms = frame(scl(f, -1), u, A), Ml = frame(f, u, A), [lo, hi] = minMax(S.body);
  const lo2: P3 = [lo[0] - POD_WALL, lo[1] - POD_WALL, lo[2] - POD_WALL], hi2: P3 = [hi[0] + POD_WALL, hi[1] + POD_WALL, S.tab];
  const O: P3[] = []; for (const x of [LATCH_BACK * 0.1, 8, 16, 24, 32]) for (const z of [lo2[2], (lo2[2] + S.tab) / 2, S.tab]) O.push(P(x, 0, z));
  const feet = carrier.hit(O, scl(w, -1), A).filter((p): p is P3 => !!p).map((p) => sub(p, scl(w, 0.6)));
  if (feet.length < 4) throw new Error(`${name}: no shell behind the latch`);
  let block = hull([...corners(Ms, lo2, hi2), ...feet]);
  block = carrier.minus(block.subtract(pocketOf(Ms, S)).subtract(holesOf(Ms, S, 0.85)).subtract(boxAt(Ml, [-60, -60, S.tab], [60, 60, 80])));
  const z0 = S.out + 0.6, L = LATCH_BACK + LATCH_REACH, ks = catcher.hit([2, 9, 15].map((dd) => P(-L + dd, 0, z0 + 3)), scl(w, -1), A);
  if (ks.some((k) => !k)) throw new Error(`${name}: no shell for the ledge`);
  const depth = Math.max(...ks.map((k) => dot(sub(A, k!), w))), tip = -(depth - 1.2);
  const hub = cylAt(Ml, 7.0, z0, z0 + PAWL_H);
  const pts = (xs: number[], ys: number[], zs: number[]) => xs.flatMap((x) => ys.flatMap((y) => zs.map((z) => P(x, y, z))));
  const arm = hull(pts([0, -L], [-3, 3], [z0, z0 + PAWL_H])), tooth = hull(pts([-L, -L + 6], [tip, 3], [z0, z0 + PAWL_H]));
  let pawl = hub.add(arm).add(tooth).subtract(cylAt(Ml, 1.6, z0 - 1, z0 + PAWL_H + 2));
  const top = tip + 2.2, fo: P3[] = []; for (const x of [-L + 6.7, -L + 12.7]) for (const z of [z0 - 3, z0 + PAWL_H + 3]) fo.push(P(x, 0, z));
  const foot = catcher.hit(fo, scl(w, -1), A).filter((p): p is P3 => !!p).map((p) => sub(p, scl(w, 0.6)));
  const ledge = catcher.minus(hull([...foot, ...pts([-L + 6.7, -L + 12.7], [top], [z0 - 3, z0 + PAWL_H + 3])]));
  pawl = carrier.minus(catcher.minus(pawl));
  const sign = dot(cross(u, scl(f, -1)), w) > 0 ? 1 : -1;
  return { block, pawl: biggest(pawl), ledge, Ms, A, u, sign, depth };
}

export interface Hardware { name: string; link: string; mesh: TriMesh; anchor: P3; region: string; }
export interface DoorOut extends Omit<DoorRecord, "servo"> { servo: { at: P3; key: string; T: number[][]; name: string }; measured_deg?: number; stopped_by?: string | null; alone_deg?: number; alone_stopped_by?: string | null; reach_mm?: number; }
export interface LatchRec { name: string; door: string; parent: string; link: string; joint: string; region: string; key: string; a: P3; up: P3; sign: number; travel: number; T: number[][]; room_mm: number; sweep_overlap_mm3?: number; }
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const T44 = (M: M34) => [...M.map((row) => row.map((x) => r(x, 9))), [0, 0, 0, 1]];

/** adds hinges, drives and latches: the new hardware and the mechanism records */
export async function build(pieces: Piece[], doors: DoorRecord[], tick: Tick, log: Log): Promise<{ hw: Hardware[]; recs: DoorOut[]; latches: LatchRec[] }> {
  const hw: Hardware[] = [], recs: DoorOut[] = [], latches: LatchRec[] = [], groups = (links: string[]) => new Shells(pieces, new Set(links));
  for (const d of doors) {
    scope(() => {
      const fixed = groups([d.parent]), door = groups([d.link]), e = d.up, o = d.a, sg = d.sign, open = d.open;
      const fixedHw: [string, Solid, P3][] = [], doorHw: [string, Solid, P3][] = [];
      d.hinges.forEach((c, i) => { const [lf, ld] = hinge(d, c, fixed, door); fixedHw.push([`hinge_${d.name}_${i}`, lf, c]); doorHw.push([`hinge_${d.name}_${i}_knuckle`, ld, c]); });
      const [pod, arm, keepOut, Ms] = drive(d, fixed, door);
      fixedHw.push([`pod_${d.name}`, pod, d.servo.at]); doorHw.push([`arm_${d.name}`, arm, d.servo.at]);
      // room: the fixed shell for the door's hardware through its whole swing, the door's shell for everything fixed
      for (const [, s] of doorHw) scope(() => { fixed.cut(bigger(sweep(s, o, e, 0, sg * (open + 0.05)), AIR)); });
      for (const [, s] of [...fixedHw, ["servo", keepOut, null] as unknown as [string, Solid, P3]]) scope(() => { door.cut(bigger(sweep(s, o, e, 0, -sg * (open + 0.05)), AIR)); });
      for (const [name, s, c] of fixedHw) hw.push({ name, link: d.parent, mesh: asMesh(biggest(fixed.minus(s))), anchor: c, region: d.region });
      for (const [name, s, c] of doorHw) hw.push({ name, link: d.link, mesh: asMesh(biggest(door.minus(s).subtract(bigger(keepOut, 0.2)))), anchor: c, region: d.region });
      recs.push({ ...d, servo: { ...d.servo, T: T44(Ms), name: `${d.name}_servo` } });
    });
    log(`${d.name} hardware done`); await tick(`${d.name} hardware`);
  }
  // latches: one per limb door on its free edge, between the back doors and the helmet doors on the centre line
  for (const d of doors) {
    let carrier: Shells, catcher: Shells, parent: string, f: P3, w: P3, u: P3; const seams: P3[] = [];
    if (d.part === "torso" || d.part === "head") {
      if (d.side === "right") continue;
      const other = doors.find((x) => x.part === d.part && x.side === "right")!;
      carrier = groups([d.link]); catcher = groups([other.link]); parent = d.link; f = [0, 1, 0]; w = [1, 0, 0]; u = [0, 0, 1];
      for (const t of d.latch_t) { const O: P3 = [-20.0, 3.0, t], h = carrier.hit([O], scl(w, -1), O)[0]!; seams.push([h[0], 0.0, t]); }
    } else {
      carrier = groups([d.parent]); catcher = groups([d.link]); parent = d.parent; f = d.normal; w = d.out; u = scl(d.seam_up, -1);
      for (const t of d.latch_t) { const c = add(d.base, scl(d.seam_up, t)), h = carrier.hit([add(c, scl(f, 3.0))], scl(w, -1), c)[0]!; seams.push(sub(h, scl(f, 3.0))); }
    }
    seams.forEach((seam, k) => scope(() => {
      const name = `latch_${d.name}_${k}`, L = latch(name, seam, u, f, w, carrier, catcher);
      hw.push({ name: `${name}_block`, link: parent, mesh: asMesh(biggest(L.block)), anchor: L.A, region: d.region });
      hw.push({ name: `${name}_ledge`, link: catcher.items[0].row.link, mesh: asMesh(biggest(L.ledge)), anchor: L.A, region: d.region });
      hw.push({ name: `${name}_pawl`, link: `${name}_pawl_link`, mesh: asMesh(L.pawl), anchor: L.A, region: d.region });
      latches.push({ name, door: d.link, parent, link: `${name}_pawl_link`, joint: `${name}_pawl`, region: d.region, key: LATCH_SERVO, a: L.A.map((x) => r(x, 3)) as P3, up: L.u.map((x) => r(x, 6)) as P3, sign: L.sign, travel: PAWL_TRAVEL,
        T: T44(L.Ms), room_mm: r(Math.hypot(...sub(L.A, seam)) + 6 + POD_WALL, 1) });
      log(`${name} depth ${L.depth.toFixed(1)}`);
    }));
    await tick("latches");
  }
  return { hw, recs, latches };
}

/** Doors open a left and right pair at a time, forearms first, back and helmet last. A door gives way along its edges to whatever it meets on its way,
 *  in the state the stage finds it; what its hardware meets gives way to the hardware. The right door takes the left door's cuts, mirrored. */
export async function trimStages(pieces: Piece[], hw: Hardware[], doors: DoorRecord[], latches: LatchRec[], tick: Tick, log: Log, fine = 0.0125): Promise<Record<string, number>> {
  const opened: Record<string, number> = {}, lostAll: Record<string, number> = {}, solids = new Map<string, Piece[]>();
  const ride = new Map(latches.map((l) => [l.link, l.parent])), lifted = new Map(latches.map((l) => [l.link, [l.a, l.up, l.sign * l.travel] as [P3, P3, number]]));
  for (const e of pieces) if (HARD.includes(e.row.material)) { const l = solids.get(e.row.link) ?? []; l.push(e); solids.set(e.row.link, l); }
  const hwBy = new Map<string, Hardware[]>(); for (const h of hw) { const l = hwBy.get(h.link) ?? []; l.push(h); hwBy.set(h.link, l); }
  const cuts = new Map<string, [string, TriMesh][]>();
  for (const stage of STAGES) {
    const moving = doors.filter((d) => stage.includes(d.part));
    for (const d of moving) {
      if (d.side === "right") {
        let lost = 0;
        for (const [link, tool] of cuts.get(d.name.replace("right", "left")) ?? []) scope(() => { lost += new Shells(pieces, new Set([link.replace("left", "right")])).cut(asSolid(tool).mirror([0, 1, 0])); });
        lostAll[d.name] = Math.round(lost); log(`${d.name} gave way ${Math.round(lost)} mm3 (mirrored)`); continue;
      }
      const done: [string, TriMesh][] = []; cuts.set(d.name, done);
      const t0 = Date.now(), o = d.a, e = d.up, sg = d.sign; let lost = 0;
      await scopeAsync(async () => {
        const mine = new Shells(pieces, new Set([d.link]));
        const light = (compose([...mine.items.map((x) => asSolid(x.mesh)), ...(hwBy.get(d.link) ?? []).map((h) => asSolid(h.mesh))]).simplify(0.3));
        const bb = bbox(sweep(light.simplify(2.0), o, e, 0, sg * d.open, 0.2));
        const posed = (link: string, x: Solid, way = 1): Solid => { if (!(link in opened)) return x; const st = doors.find((q) => q.link === link)!; return turn(x, st.a, st.up, way * st.sign * opened[link]); };
        const met: [string | null, Solid][] = [], steel = compose((hwBy.get(d.link) ?? []).map((h) => asSolid(h.mesh)));
        const angles = range(0.06, d.open + 0.03, 0.08), turned = angles.map((a) => turn(light, o, e, sg * a)), tbb = turned.map(bbox);
        for (const [link, es] of solids) {
          if (link === d.link) continue;
          for (const x of es) {
            const q = posed(link, asSolid(x.mesh).simplify(0.3)), qb = bbox(q);
            if (!overlaps(qb, bb)) continue;
            for (let i = 0; i < angles.length; i++) if (overlaps(tbb[i], qb) && scope(() => turned[i].intersect(q).volume()) > 0.05) { met.push([link, q]); break; }
          }
          await tick(`${d.name} meets`);
        }
        // hardware and servos on other parts stand where they stand: the door's shell gives way to them, pawls lifted as they are before a door moves
        for (const h of hw) {
          if (h.link === d.link || ride.get(h.link) === d.link) continue;
          let q = asSolid(h.mesh); const lf = lifted.get(h.link); if (lf) q = turn(q, ...lf);
          q = posed(ride.get(h.link) ?? h.link, q); const qb = bbox(q);
          if (overlaps(qb, bb) && turned.some((c, i) => overlaps(tbb[i], qb) && scope(() => c.intersect(q).volume()) > 0.05)) met.push([null, q]);
        }
        log(`${d.name} meets ${met.length} pieces ${Math.round((Date.now() - t0) / 1000)} s`);
        // what the door's shell meets is cut from the door; what its hardware meets is cut from the other part, since hardware cannot give way
        const hits: TriMesh[] = [], theirs = new Map<string, TriMesh[]>(), fineAngles = range(fine, d.open + 0.03, fine);
        const lightM = asMesh(light), steelM = asMesh(steel), parts = Math.max(1, Math.min(fineAngles.length, (getPool()?.size ?? 1) * 2));
        for (const [link, q] of met) {
          // the angles are shared out to the pool; each answer is what overlapped, swung back, and what the hardware met
          const st = link && link in opened ? doors.find((x) => x.link === link)! : undefined, qm = asMesh(q);
          const jobs: Job[] = Array.from({ length: parts }, (_, i) => ({ op: "trimHits", args: { light: lightM, steel: link ? steelM : undefined, q: qm, o, e, sg, angles: fineAngles.filter((_, k) => k % parts === i), unpose: st ? [st.a, st.up, -st.sign * opened[st.link]] : undefined } }));
          for (const r of await runAll<{ hits: TriMesh[]; theirs: TriMesh[] }>(jobs, (j) => answerJob(j) as Promise<{ hits: TriMesh[]; theirs: TriMesh[] }>)) {
            hits.push(...r.hits);
            if (link && r.theirs.length) { const l = theirs.get(link) ?? []; l.push(...r.theirs); theirs.set(link, l); }
          }
          await tick(`${d.name} trims`);
        }
        if (hits.length) scope(() => { const tool = bigger(union(hits.map(asSolid)), 0.6); lost = mine.cut(tool); done.push([d.link, asMesh(tool)]); });
        for (const [link, ms] of theirs) scope(() => { const tool = bigger(union(ms.map(asSolid)), AIR); lost += new Shells(pieces, new Set([link])).cut(tool); done.push([link, asMesh(tool)]); });
      });
      lostAll[d.name] = Math.round(lost); log(`${d.name} gave way ${Math.round(lost)} mm3 ${Math.round((Date.now() - t0) / 1000)} s`);
    }
    for (const d of moving) opened[d.link] = d.open;
  }
  log(`trimmed for the sequence (mm3): ${JSON.stringify(lostAll)}`);
  return lostAll;
}

/** a servo's solid where it stands */
export function bodyOf(key: string, T: number[][]): Solid {
  const S = servoBody(key), M = T.slice(0, 3);
  return hull(S.v.map((p) => at(M, p))).add(hull(S.all.filter((p) => p[2] > S.top).map((p) => at(M, p))));
}

/** Hardware on a body takes room from the limb that swings past it, and the other way round */
export async function relieveLimbs(pieces: Piece[], hw: Hardware[], jpos: Record<string, P3>, tick: Tick, log: Log): Promise<void> {
  let lost = 0; const links = [...new Set(pieces.map((e) => e.row.link))];
  for (const side of ["left", "right"]) for (const [j, child, parent, lo, hi] of SWINGS) {
    const o = jpos[`${side}_${j}`], cl = `${side}_${child}`, pl = parent === "pelvis" ? parent : `${side}_${parent}`, y: P3 = [0, 1, 0];
    const kids = new Shells(pieces, new Set(links.filter((l) => baseLink(l) === cl))), dads = new Shells(pieces, new Set(links.filter((l) => baseLink(l) === pl)));
    for (const h of hw) scope(() => {
      const bl = baseLink(h.link), b = meshBounds(h.mesh), c: P3 = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
      if (Math.hypot(...sub(c, o)) > 420) return;
      // a joint angle q turns the child by q about +y: in the child's frame the parent's hardware turns by -q
      if (bl === pl) lost += kids.cut(sweep(asSolid(h.mesh), o, y, -hi, -lo, 0.06));
      else if (bl === cl) lost += dads.cut(sweep(asSolid(h.mesh), o, y, lo, hi, 0.06));
    });
    await tick("relieve");
  }
  log(`relieved round the hardware ${Math.round(lost)} mm3`);
}

/** fit_doors.fit after build and the staged trims: room round every servo, sleeves give way to the hardware, cut shells simplified */
export function finishDoors(pieces: Piece[], hw: Hardware[], recs: DoorOut[], latches: LatchRec[], log: Log): void {
  const everything = new Shells(pieces, new Set(pieces.map((e) => e.row.link))); let lost = 0;
  for (const [key, T] of [...recs.map((d) => [d.servo.key, d.servo.T] as const), ...latches.map((l) => [l.key, l.T] as const)]) scope(() => { lost += everything.cut(bigger(bodyOf(key, T as number[][]), POCKET)); });
  log(`room round the servos ${Math.round(lost)} mm3`);
  for (const e of pieces) {
    if (e.row.material !== "armour_mech") continue;
    scope(() => {
      let x = asSolid(e.mesh), hit = false; const b = meshBounds(e.mesh);
      for (const h of hw) if (overlaps(b, meshBounds(h.mesh))) { x = x.subtract(asSolid(h.mesh)); hit = true; }
      if (hit && !x.isEmpty()) { e.mesh = asMesh(biggest(x)); e.dirty = true; }
    });
  }
  for (const e of pieces) if (e.dirty) scope(() => { e.mesh = asMesh(asSolid(e.mesh).simplify(0.2)); });
}

export interface Bay { link: string; corners: P3[]; }
/** Every door swept through its range in the order the suit opens, with exact intersection against everything else, servos included. */
export async function measure(rows: { row: { link: string; material: string; wiring?: boolean }; mesh: TriMesh }[], recs: DoorOut[], latches: LatchRec[], bayBox: Bay | undefined, limits: Record<string, [number, number]>, tick: Tick, log: Log): Promise<string[][]> {
  const solid = new Map<string, Solid[]>(), push = (k: string, s: Solid) => { const l = solid.get(k) ?? []; l.push(s); solid.set(k, l); };
  const all: Solid[] = [];
  try {
    for (const p of rows) if (p.row.material !== "lens_glow" && (p.row.material !== "armour_mech" || p.row.wiring)) push(p.row.link, asSolid(p.mesh));
    for (const d of recs) push(d.parent, bodyOf(d.servo.key, d.servo.T));
    for (const l of latches) push(l.parent, bodyOf(l.key, l.T));
    if (bayBox) push(bayBox.link, hull(bayBox.corners));
    for (const l of latches) solid.set(l.link, (solid.get(l.link) ?? []).map((s) => turn(s, l.a, l.up, l.sign * l.travel)));
    const S = new Map<string, Solid>(); for (const [k, v] of solid) S.set(k, compose(v));
    for (const x of S.values()) all.push(x);
    const ride = new Map(latches.map((l) => [l.link, l.parent])), byDoor = new Map(recs.map((d) => [d.link, d]));
    const pose = (link: string, opened: Record<string, number>): Solid => { const s = S.get(link)!, p = ride.get(link) ?? link; if (p in opened) { const d = byDoor.get(p)!; return turn(s, d.a, d.up, d.sign * opened[p]); } return s; };
    const clear = async (d: DoorOut, opened: Record<string, number>): Promise<[number, [string, number] | null]> => {
      const mine = [...S.keys()].filter((k) => k === d.link || ride.get(k) === d.link), step = (2 * Math.PI) / 180;
      let a = 0, hit: [string, number] | null = null;
      while (a + step <= d.open + 1e-6) {
        scope(() => {
          for (const k of mine) {
            const t = turn(S.get(k)!, d.a, d.up, d.sign * (a + step)), bb = bbox(t);
            for (const o of S.keys()) {
              if (mine.includes(o)) continue;
              const q = pose(o, opened);
              if (overlaps(bb, bbox(q))) { const v = t.intersect(q).volume(); if (v > TOUCH) { hit = [o, r(v, 1)]; break; } }
            }
            if (hit) break;
          }
        });
        if (hit) break;
        a += step; await tick(`${d.name} sweep`);
      }
      return [a, hit];
    };
    const opened: Record<string, number> = {}, res: Record<string, number> = {}, order: string[][] = [];
    for (const stage of STAGES) {
      const moving = recs.filter((d) => stage.includes(d.part)), centre = stage[0] === "torso" || stage[0] === "head";
      if (centre) moving.sort((x, y) => Number(x.side !== "right") - Number(y.side !== "right"));
      if (centre) for (const d of moving) order.push([d.joint]); else order.push(moving.map((d) => d.joint));
      for (const d of moving) {
        const [a, hit] = await clear(d, opened), [solo, shit] = await clear(d, {});
        if (centre) opened[d.link] = a;
        res[d.link] = a; limits[d.joint] = d.sign > 0 ? [0, r(a, 3)] : [r(-a, 3), 0];
        d.measured_deg = r((a * 180) / Math.PI, 1); d.stopped_by = hit ? hit[0] : null; d.alone_deg = r((solo * 180) / Math.PI, 1); d.alone_stopped_by = shit ? shit[0] : null;
        log(`${d.joint} ${d.measured_deg} ${JSON.stringify(hit)} alone ${d.alone_deg} ${JSON.stringify(shit)}`);
      }
      for (const d of moving) opened[d.link] = res[d.link];
    }
    for (const d of recs) {
      const e = d.up; let best = 0;
      const ms = asMesh(S.get(d.link)!);
      for (let i = 0; i < ms.v.length; i += 3) { const q = sub([ms.v[i], ms.v[i + 1], ms.v[i + 2]], d.a), t = dot(q, e); best = Math.max(best, Math.hypot(q[0] - t * e[0], q[1] - t * e[1], q[2] - t * e[2])); }
      d.reach_mm = r(best, 1);
    }
    for (const l of latches) {
      limits[l.joint] = l.sign > 0 ? [0, l.travel] : [-l.travel, 0];
      let worst = 0;
      scope(() => {
        const shut = turn(S.get(l.link)!, l.a, l.up, -l.sign * l.travel), bb = bbox(shut), sw = sweep(shut, l.a, l.up, 0, l.sign * l.travel, 0.05);
        for (const [k, q] of S) if (k !== l.link && overlaps(bb, bbox(q))) worst = Math.max(worst, sw.intersect(q).volume());
      });
      l.sweep_overlap_mm3 = r(worst, 1); log(`${l.name} pawl sweep overlap ${l.sweep_overlap_mm3}`);
    }
    return order;
  } finally { free(...all, ...[...solid.values()].flat()); }
}

/** The limb joints measured with all the hardware on, doors shut: child armour turned about the joint against the parent's; moving stops when overlap grows past COLLIDE */
export async function limbLimits(rows: { row: { link: string; material: string; wiring?: boolean }; mesh: TriMesh }[], recs: DoorOut[], latches: LatchRec[], jpos: Record<string, P3>, limits: Record<string, [number, number]>, tick: Tick, log: Log, step0 = 0.05): Promise<void> {
  const by = new Map<string, TriMesh[]>(), servo: [string, string, number[][]][] = [];
  const push = (k: string, m: TriMesh) => { const l = by.get(k) ?? []; l.push(m); by.set(k, l); };
  for (const p of rows) if (!["armour_mech", "lens_glow"].includes(p.row.material) || p.row.wiring) push(p.row.link.endsWith("_pawl_link") ? latches.find((l) => l.link === p.row.link)!.parent : baseLink(p.row.link), p.mesh);
  for (const d of recs) servo.push([baseLink(d.parent), d.servo.key, d.servo.T]);
  for (const l of latches) servo.push([baseLink(l.parent), l.key, l.T]);
  const y: P3 = [0, 1, 0], jobs: Job[] = [], names: string[] = [];
  const of = (k: string): TriMesh => scope(() => asMesh(compose([...(by.get(k) ?? []).map(asSolid), ...servo.filter((s) => s[0] === k).map((s) => bodyOf(s[1], s[2]))]))) as unknown as TriMesh;
  for (const side of ["left", "right"]) for (const [j, child, parent, lo, hi] of SWINGS) {
    const child_ = of(`${side}_${child}`), parent_ = of(parent === "pelvis" ? parent : `${side}_${parent}`);
    for (const lim of [lo, hi]) jobs.push({ op: "limit", args: { child: child_, parent: parent_, o: jpos[`${side}_${j}`], axis: y, lim, step: step0, collide: COLLIDE } });
    names.push(`${side}_${j}`);
  }
  const got = await runAll<number>(jobs, (jb) => answerJob(jb) as Promise<number>);
  names.forEach((n, i) => { const was = limits[n]; limits[n] = [r(got[2 * i], 3), r(got[2 * i + 1], 3)]; log(`${n} ${JSON.stringify(was)} -> ${JSON.stringify(limits[n])}`); });
  await tick("limits");
}

/** One printed part must be one solid: each piece keeps its body and drops crumbs joined to it only at a point (under CRUMB of its surface). */
export function tidy(meshes: TriMesh[], split: (m: TriMesh) => TriMesh[], area: (m: TriMesh) => number, watertight: (m: TriMesh) => boolean): { meshes: TriMesh[]; dropped: number } {
  let dropped = 0;
  const out = meshes.map((m) => {
    const parts = split(m); if (parts.length < 2) return m;
    const areas = parts.map(area), i = areas.indexOf(Math.max(...areas)), rest = areas.reduce((a, b) => a + b, 0) - areas[i];
    if (watertight(parts[i]) && rest < CRUMB * areas[i]) { dropped += parts.length - 1; return parts[i]; }
    return m;
  });
  return { meshes: out, dropped };
}
