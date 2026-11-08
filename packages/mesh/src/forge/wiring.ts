// The harness fitted into the finished armour, in the browser: a TypeScript port of scripts/fit_wiring.py. U-section cable channels on the
// inner faces of the fixed shells, saddles that seat the battery bay (on the left back door) and the driver bays (in the hollow of the
// waist), cable ports through the shells, and the neck's measured range.
import { cos, exp, hypot, sin } from "./dmath.ts";
import type { TriMesh } from "./mc.ts";
import { J, Frame } from "./mark43.ts";
import { Rays } from "./ray.ts";
import { asSolid, asMesh, scope, union, clipUnion, compose, hull, cube, cylinder, mat4, bbox, overlaps, inflated, biggest, meshBounds, linspace, type P3, type Solid } from "./geo.ts";
import { baseLink, type Piece, type Log, type Tick } from "./pack.ts";
import { bodyOf, type DoorOut, type LatchRec } from "./doors.ts";

const BAY = { z0: 1128.0, L: 150.0, W: 72.0, y0: 14.0, wall: 2.4 };
const PORT_Z = 1262.0, PORT_D = 11.0;
const PORTS: [number, number][] = [[1262.0, 26.0], [1262.0, 42.0], [1244.0, 26.0], [1244.0, 42.0], [1262.0, 58.0], [1244.0, 58.0]];
const DRIVE = { x0: 6.0, z0: 1116.0, L: 66.0, W: 44.0, wall: 2.4 }, DRIVE_SLOT: [number, number] = [40.0, 13.0];
const SADDLE_MIN = 7.0, STEP = 8.0, GAPS = [0.8, 1.2, 1.6, 2.0, 2.4];
const BASE_T = 2.0, RAIL_T = 1.8, LIP = 2.4, LIP_T = 1.6, LIP_EVERY = 6, MAX_RUN = 22, COLLIDE = 400.0;
const HARD = ["armour_red", "armour_gold", "armour_silver"];

const add = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: P3, s: number): P3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
/** numpy.interp */
function interp(x: number, xp: number[], fp: number[]): number {
  if (x <= xp[0]) return fp[0];
  if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
  let lo = 0, hi = xp.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xp[m] <= x) lo = m; else hi = m; }
  return xp[hi] === xp[lo] ? fp[lo] : fp[lo] + ((fp[hi] - fp[lo]) * (x - xp[lo])) / (xp[hi] - xp[lo]);
}
const cumlen = (a: number[][], sx = 1) => { const s = [0]; for (let i = 1; i < a.length; i++) s.push(s[i - 1] + hypot((a[i][0] - a[i - 1][0]) * sx, a[i][1] - a[i - 1][1])); return s; };
/** scipy gaussian_filter1d, mode "nearest" */
function gauss1d(a: number[], sigma: number): number[] {
  const R = Math.floor(4 * sigma + 0.5), k: number[] = []; let s = 0;
  for (let i = -R; i <= R; i++) { const w = exp((-0.5 * i * i) / (sigma * sigma)); k.push(w); s += w; }
  return a.map((_, i) => { let t = 0; for (let q = -R; q <= R; q++) t += (k[q + R] / s) * a[Math.min(a.length - 1, Math.max(0, i + q))]; return t; });
}
const maxf1d = (a: number[], size: number) => { const lo = Math.floor(size / 2), hi = size - 1 - lo; return a.map((_, i) => { let m = -Infinity; for (let q = -lo; q <= hi; q++) m = Math.max(m, a[Math.min(a.length - 1, Math.max(0, i + q))]); return m; }); };
/** numpy's round half to even */
const rint = (x: number) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1; };

type Rays2 = [P3[], P3[]];
function torsoRays(way: number[][], cx = 0): Rays2 {
  const s = cumlen(way, 2.0), u = linspace(0, s[s.length - 1], 240), th = u.map((x) => (interp(x, s, way.map((w) => w[0])) * Math.PI) / 180), z = u.map((x) => interp(x, s, way.map((w) => w[1])));
  return [u.map((_, i) => [cx, 0, z[i]] as P3), th.map((t) => [cos(t), sin(t), 0] as P3)];
}
function limbRays(a: P3, b: P3, way: number[][], side: number): Rays2 {
  const fr = new Frame(a, b, [1, 0, 0], side), s = cumlen(way), u = linspace(0, s[s.length - 1], 200);
  const t = u.map((x) => interp(x, s, way.map((w) => w[0]))), ph = u.map((x) => (interp(x, s, way.map((w) => w[1])) * Math.PI) / 180);
  return [t.map((x) => add(fr.A, scl(fr.u, x))), ph.map((p) => add(scl(fr.f, cos(p)), scl(fr.l, sin(p))))];
}
const len = (a: P3, b: P3) => hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** every channel: name, link, region, rays, trough width, rail height */
function paths(): [string, string, string, Rays2, number, number][] {
  const out: [string, string, string, Rays2, number, number][] = [["door_left", "back_door_left", "torso", torsoRays([[166, PORT_Z], [140, PORT_Z], [112, PORT_Z]]), 24.0, 8.0],
    ["belt", "pelvis", "torso", torsoRays([[84, 1084], [40, 1076], [0, 1076], [-40, 1076], [-84, 1084]]), 14.0, 6.0],
    ["chest", "pelvis", "torso", torsoRays([[70, 1412], [60, 1500], [14, 1548], [0, 1500], [0, 1418]]), 14.0, 5.0],
    ["collar", "pelvis", "torso", torsoRays([[42, 1520], [20, 1556]]), 14.0, 5.0]];
  for (const [sd, n] of [[1, "left"], [-1, "right"]] as const) {
    out.push([`${n}_flank_low`, "pelvis", "torso", torsoRays([[sd * 76, 1096], [sd * 76, 1236]]), 18.0, 7.0]);
    out.push([`${n}_flank_high`, "pelvis", "torso", torsoRays([[sd * 74, 1246], [sd * 72, 1404]]), 18.0, 7.0]);
    const m = (k: string): P3 => [J[k][0], J[k][1] * sd, J[k][2]], [sh, el, wr, hp, kn, an] = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"].map(m);
    const [Lu, Lf, Lt, Ls] = [len(el, sh), len(wr, el), len(kn, hp), len(an, kn)];
    out.push([`${n}_upper_arm`, `${n}_upper_arm`, `${n}_upper_arm`, limbRays(sh, el, [[132, -48], [Lu - 44, -48]], sd), 14.0, 5.0]);
    out.push([`${n}_forearm`, `${n}_forearm`, `${n}_forearm`, limbRays(el, wr, [[26, -48], [Lf - 36, -48]], sd), 14.0, 5.0]);
    out.push([`${n}_thigh`, `${n}_thigh`, `${n}_thigh`, limbRays(hp, kn, [[36, 46], [Lt - 36, 46]], sd), 14.0, 5.0]);
    out.push([`${n}_shin`, `${n}_shin`, `${n}_shin`, limbRays(kn, an, [[30, 46], [Ls - 56, 46]], sd), 14.0, 5.0]);
    out.push([`${n}_helmet`, "head", "head", torsoRays([[sd * 92, 1602], [sd * 88, 1680]], -10.0), 14.0, 5.0]);
  }
  return out;
}

/** distance along each ray to the first surface it meets past 1 mm, and that face's normal (NaN where none) */
function firstHit(R: Rays, O: P3[], D: P3[]): [number[], P3[]] {
  const d: number[] = [], n: P3[] = [];
  O.forEach((o, i) => { const h = R.hits(o, D[i]).find((x) => x.t > 1.0); d.push(h ? h.t : Number.NaN); n.push(h ? R.normal(h.tri) : [0, 0, 0]); });
  return [d, n];
}
const fillNan = (a: number[]) => { const i = a.map((_, k) => k), ok = i.filter((k) => Number.isFinite(a[k])); return i.map((k) => interp(k, ok, ok.map((q) => a[q]))); };

function channel(name: string, O: P3[], D: P3[], shell: Rays, w: number, h: number, gap: number) {
  const [d0, n0] = firstHit(shell, O, D), ok = d0.filter(Number.isFinite).length;
  if (ok < 8) throw new Error(`${name}: rays found no shell`);
  const dd = gauss1d(fillNan(d0), 3.0), okIdx = d0.map((x, k) => (Number.isFinite(x) ? k : -1)).filter((k) => k >= 0);
  const nn = [0, 1, 2].map((k) => gauss1d(d0.map((_, i) => interp(i, okIdx, okIdx.map((q) => n0[q][k]))), 16.0));
  const P0 = O.map((o, i) => add(o, scl(D[i], dd[i]))), s = [0]; for (let i = 1; i < P0.length; i++) s.push(s[i - 1] + len(P0[i], P0[i - 1]));
  const u: number[] = []; for (let x = 0; x < s[s.length - 1]; x += STEP) u.push(x);
  const P = u.map((x) => [0, 1, 2].map((k) => interp(x, s, P0.map((p) => p[k]))) as P3), Nn = u.map((x) => [0, 1, 2].map((k) => interp(x, s, nn[k])) as P3);
  const T = P.map((_, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], g = sub3(b, a), l = hypot(...g) || 1; return scl(g, 1 / l); });
  const N = Nn.map((x, i) => { const t = T[i], dt = x[0] * t[0] + x[1] * t[1] + x[2] * t[2], y = sub3(x, scl(t, dt)), l = hypot(...y) || 1; return scl(y, 1 / l); });
  const B = T.map((t, i) => cross(t, N[i]));
  let lift = P.map(() => -9.0);
  for (const a of linspace(-w / 2, w / 2, 7)) {
    const [dl] = firstHit(shell, P.map((p, i) => add(add(p, scl(B[i], a)), scl(N[i], 25))), N.map((x) => scl(x, -1)));
    lift = lift.map((v, i) => Math.max(v, Number.isFinite(dl[i]) ? 25 - dl[i] : -9.0));
  }
  lift = gauss1d(maxf1d(lift, 5), 2.0).map((x) => x + gap);
  const rect = (k: number, a0: number, a1: number, n0_: number, n1: number, t = 0): P3[] => { const o: P3[] = []; for (const a of [a0, a1]) for (const nn_ of [n0_, n1]) o.push(add(add(add(P[k], scl(T[k], t)), scl(B[k], a)), scl(N[k], lift[k] + nn_))); return o; };
  const slab = (k: number, b: [number, number, number, number], t0 = 0, t1 = 0) => hull([...rect(k, ...b, t0), ...rect(k + 1, ...b, t1)]);
  const top = BASE_T + h, trough = w / 2 - RAIL_T;
  const piece = (a: number, b: number): Solid => {
    const bar = union(Array.from({ length: b - a }, (_, i) => slab(a + i, [-w / 2, w / 2, 0, top]))), cut: Solid[] = [];
    for (let k = a; k < b; k++) {
      const t0 = k === a ? -1.0 : 0.0, t1 = k === b - 1 ? 1.0 : 0.0, lip = k % LIP_EVERY === Math.floor(LIP_EVERY / 2);
      cut.push(slab(k, [-trough, trough, BASE_T, lip ? top - LIP_T : top + 1], t0, t1));
      if (lip) cut.push(slab(k, [-trough + LIP, trough - LIP, BASE_T, top + 1], t0, t1));
    }
    return bar.subtract(union(cut));
  };
  const runs: [number, number][] = []; const k = 0, e = P.length - 1;
  if (e > k) { const n = Math.ceil((e - k) / MAX_RUN), cuts = linspace(k, e, n + 1).map(rint); for (let i = 0; i < n; i++) { const a = cuts[i] + (i ? 1 : 0), b = cuts[i + 1]; if (cuts[i + 1] - cuts[i] >= 3) runs.push([a, b]); } }
  return { pts: P.map((p, i) => add(p, scl(N[i], lift[i] + BASE_T + h / 2))), runs, piece };
}
const sub3 = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** A saddle under a compartment (fit_wiring.seat): cavity corner O, length along ex, width along ey, ez out of the suit */
function seat(shells: TriMesh[], O: P3, ex: P3, ey: P3, ez: P3, L: number, W: number, wall: number, ports: [number, number][], portD: number, slot?: [number, number]): [number, TriMesh, TriMesh[]] {
  return scope(() => {
    const to = [[ex[0], ex[1], ex[2], -(ex[0] * O[0] + ex[1] * O[1] + ex[2] * O[2])], [ey[0], ey[1], ey[2], -(ey[0] * O[0] + ey[1] * O[1] + ey[2] * O[2])], [ez[0], ez[1], ez[2], -(ez[0] * O[0] + ez[1] * O[1] + ez[2] * O[2])]];
    const back = [0, 1, 2].map((i) => [ex[i], ey[i], ez[i], O[i]]), lo = [-wall, -wall], hi = [L + wall, W + wall];
    const ls = shells.map((m) => asSolid(m).transform(mat4(to)));
    let hmax = -1e9;
    for (const x of ls) { const m = asMesh(x); for (let i = 0; i < m.v.length; i += 3) if (m.v[i] > lo[0] && m.v[i] < hi[0] && m.v[i + 1] > lo[1] && m.v[i + 1] < hi[1]) hmax = Math.max(hmax, m.v[i + 2]); }
    const h = hmax + SADDLE_MIN;
    const drill = (g: number) => slot ? union(ports.map(([u, v]) => cube([slot[0] + g, slot[1] + g, 80.0]).translate([u - (slot[0] + g) / 2, v - (slot[1] + g) / 2, h - 70])))
      : union(ports.map(([u, v]) => cylinder(80.0, (portD + g) / 2, 32).translate([u, v, h - 70])));
    let block = cube([L + 2 * wall - 6, W + 2 * wall - 6, 42.0]).translate([-wall + 3, -wall + 3, h - 42.0]);
    const under: Solid[] = [];
    for (const x of ls) for (let t = 0; t < 46.0; t += 2.4) for (const [a, b] of [[0, 0], [1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0]]) under.push(x.translate([a, b, 0.4 - t]));
    // only what lies in the block matters: each copy is cut to the block's box first (the result is the same, and far quicker)
    const bb = bbox(block), pad = 1;
    block = block.subtract(clipUnion(under, [[bb[0][0] - pad, bb[0][1] - pad, bb[0][2] - pad], [bb[1][0] + pad, bb[1][1] + pad, bb[1][2] + pad]])).subtract(drill(1.0));
    const parts = (block.decompose() as Solid[]).filter((c) => c.volume() > 500), best = parts.reduce((a, c) => (bbox(c)[1][2] > bbox(a)[1][2] ? c : a));
    return [h, asMesh(best.transform(mat4(back))), ls.map((x) => asMesh(x.subtract(drill(0.0)).transform(mat4(back))))] as unknown as [number, TriMesh, TriMesh[]];
  }) as unknown as [number, TriMesh, TriMesh[]];
}

export interface Wired { channels: unknown[]; bays: Record<string, unknown>; bay_box: { link: string; corners: P3[] }; added: Piece[]; }
/** fit_wiring.fit: seats, channels and the neck's range. `pieces` change in place (seats cut ports); the new pieces are returned. */
export async function fitWiring(pieces: Piece[], recs: DoorOut[], latches: LatchRec[], limits: Record<string, [number, number]>, tick: Tick, log: Log): Promise<Wired> {
  const added: Piece[] = [], bays: Record<string, { link: string; length_mm: number; width_mm: number; O: P3; ex: P3; ey: P3; ez: P3; ports: [number, number][] }> = {};
  const seated = (name: string, link: string, O: P3, ex: P3, ey: P3, ez: P3, L: number, W: number, wall: number, ports: [number, number][], portD: number, slot?: [number, number]) => {
    const foot: P3[] = []; for (const u of [0, L]) for (const v of [0, W]) foot.push(add(add(O, scl(ex, u)), scl(ey, v)));
    const lo = [0, 1, 2].map((k) => Math.min(...foot.map((p) => p[k])) - 12), hi = [0, 1, 2].map((k) => Math.max(...foot.map((p) => p[k])) + 12);
    const box: [P3, P3] = [[0, 1, 2].map((k) => (ez[k] !== 0 ? -1e4 : lo[k])) as P3, [0, 1, 2].map((k) => (ez[k] !== 0 ? 1e4 : hi[k])) as P3];
    const under = pieces.filter((p) => p.row.link === link && HARD.includes(p.row.material) && !p.row.hardware && overlaps(meshBounds(p.mesh), box));
    const [h, saddle, cut] = seat(under.map((p) => p.mesh), O, ex, ey, ez, L, W, wall, ports, portD, slot);
    under.forEach((p, i) => { p.mesh = cut[i]; p.dirty = true; });
    added.push({ row: { name: `${name}_saddle`, link, material: "armour_red", region: "torso", wiring: true }, mesh: saddle });
    log(`${name}: saddle face ${h.toFixed(1)} from the cavity corner`);
    return { link, length_mm: L, width_mm: W, O: add(O, scl(ez, h)).map((x) => r(x, 2)) as P3, ex, ey, ez, ports: ports.map(([u, v]) => [r(u, 2), r(v, 2)] as [number, number]) };
  };
  bays.back = seated("bay", "back_door_left", [-90.0, BAY.y0, BAY.z0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], BAY.L, BAY.W, BAY.wall, PORTS.map(([z, y]) => [z - BAY.z0, y - BAY.y0]), PORT_D);
  for (const [sd, n] of [[1, "left"], [-1, "right"]] as const) {
    let O: P3 = [DRIVE.x0, sd * 100.0, DRIVE.z0]; const ex: P3 = [1, 0, 0], ez: P3 = [0, sd, 0], ey = cross(ez, ex);
    if (ey[2] < 0) O = add(O, [0, 0, DRIVE.W]);
    bays[`drive_${n}`] = seated(`drive_${n}`, "pelvis", O, ex, ey, ez, DRIVE.L, DRIVE.W, DRIVE.wall, [[DRIVE.L / 2, 36.0]], 0.0, DRIVE_SLOT);
  }
  log("seats done"); await tick("seats");
  // channels
  const shellOf = new Map<string, TriMesh[]>();
  for (const p of pieces) if (!["armour_mech", "lens_glow"].includes(p.row.material) && !p.row.hardware) { const l = shellOf.get(p.row.link) ?? []; l.push(p.mesh); shellOf.set(p.row.link, l); }
  const chans: unknown[] = [], placed: [[P3, P3], TriMesh][] = [];
  const others: [[P3, P3], () => Solid][] = pieces.map((p) => [meshBounds(p.mesh), () => (p.row.material !== "armour_mech" ? inflated(p.mesh, 0.2) : asSolid(p.mesh))]);
  for (const a of added) others.push([meshBounds(a.mesh), () => asSolid(a.mesh)]);
  for (const [key, T] of [...recs.map((d) => [d.servo.key, d.servo.T] as const), ...latches.map((l) => [l.key, l.T] as const)]) { const m = scope(() => asMesh(bodyOf(key, T as number[][]))) as unknown as TriMesh; others.push([meshBounds(m), () => asSolid(m)]); }
  for (const [name, link, region, [O, D], w, h] of paths()) {
    const R = new Rays(shellOf.get(link) ?? []);
    let made: TriMesh[] = [], touched = 0, gap = GAPS[0], pts: P3[] = [], runs: [number, number][] = [];
    for (gap of GAPS) {
      const c = channel(name, O, D, R, w, h, gap); pts = c.pts; runs = c.runs; made = []; touched = 0;
      for (const [a, b] of runs) scope(() => {
        let x = c.piece(a, b); const bb = bbox(x);
        for (const [bo, q] of [...others, ...placed.map(([b_, m]) => [b_, () => asSolid(m)] as [[P3, P3], () => Solid])]) if (overlaps(bb, bo)) { const v0 = x.volume(); x = x.subtract(q()); touched += v0 - x.volume(); }
        made.push(asMesh(biggest(x)));
      });
      if (touched < 0.05) break;
    }
    made.forEach((t, i) => { added.push({ row: { name: `chan_${name}_${i}`, link, material: "armour_mech", region, wiring: true }, mesh: t }); placed.push([meshBounds(t), t]); });
    chans.push({ name, link, region, width_mm: w, depth_mm: h, pts: pts.map((p) => p.map((x) => r(x, 1))) });
    log(`${name} ${(pts.length * STEP).toFixed(0)} mm, ${runs.length} pieces, ${gap} mm off the shell, ${touched.toFixed(1)} mm3 trimmed`);
    await tick(`channel ${name}`);
  }
  // the neck: the helmet turned about the body axis against the torso, as the other joints are measured (seats and channels not counted)
  const rng: number[] = [], before = new Set(added);
  scope(() => {
    const old = pieces.filter((p) => !before.has(p) && !p.row.wiring && p.row.material !== "armour_mech");
    const cm = compose2(old.filter((p) => ["head", "helmet_faceplate"].includes(baseLink(p.row.link))).map((p) => p.mesh));
    const pm = compose2(old.filter((p) => baseLink(p.row.link) === "pelvis" && meshBounds(p.mesh)[1][2] > 1400).map((p) => p.mesh));
    const base = cm.intersect(pm).volume(), o = J.neck;
    for (const sign of [-1, 1]) {
      let a = 0;
      while (a < 1.3) {
        const ang = sign * (a + 0.05), c = cos(ang), s = sin(ang), M = [[c, -s, 0, o[0] - (c * o[0] - s * o[1])], [s, c, 0, o[1] - (s * o[0] + c * o[1])], [0, 0, 1, 0]];
        const v = scope(() => cm.transform(mat4(M)).intersect(pm).volume()) as unknown as number;
        if (v - base > COLLIDE) break;
        a += 0.05;
      }
      rng.push(r(sign * a, 3));
    }
  });
  limits.neck = rng as [number, number]; log(`neck ${JSON.stringify(rng)}`);
  const b = bays.back, corners: P3[] = [];
  for (const u of [-6, BAY.L + 6]) for (const v of [-6, BAY.W + 6]) for (const hh of [0, 36.0]) corners.push(add(add(add(b.O, scl(b.ex, u)), scl(b.ey, v)), scl(b.ez, hh)).map((x) => r(x, 2)) as P3);
  return { channels: chans, bays, bay_box: { link: b.link, corners }, added };
}
const compose2 = (ms: TriMesh[]): Solid => compose(ms.map(asSolid));
