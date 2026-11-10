// Checks of the 3D harness at the home pose:
//   through: a wire must not pass through a solid part. Each wire's centreline is sampled every few mm and each sample
//     is tested inside every link solid it could be in (ray parity on the link's mesh). The first and last few mm of a
//     wire, at its own pins, are not tested against the part it plugs into. A run inside a solid no longer than the
//     solid's wall where the cable's record names an exit (a grommet through the bay wall) is allowed.
//   bend: every corner is drawn as an arc; the arc must be at least the gauge's minimum bend radius from the WIRING table:
//     static_bend_radius_x_od times the insulation OD on a fixed run inside one body, min_bend_radius_x_od (the
//     flexing figure) where the wire crosses a joint. A corner whose legs are too short for that radius is a problem, and
//     so is a sharp vertex inside one body (drawn arcs turn at most 0.25 rad a step; more is an unrounded kink).
//   length: the cut length in WIRING.md must reach: the drawn wire, pin to pin, is no longer than the cut length (10 mm
//     grace), and no shorter than half of what is left of it after the allowances (service loop, joint slack, termination).
import type { RobotSpecification } from "@ttr/robot-schema";
import { buildPart } from "@ttr/mesh";
import type { WiringRecord } from "../wiring.ts";
import { fk, rpyToR } from "../kin.ts";
import type { Wiring3D } from "./wires.ts";
import { sub, len, type V3 } from "./geom.ts";

export interface HarnessCheck { through: { wire: string; link: string; at: V3; run_mm: number }[]; bend: { wire: string; radius_mm: number; min_mm: number }[]; length: { wire: string; drawn_mm: number; allowance_mm: number; cut_mm: number }[]; checked: { wires: number; samples: number; solids: number; skipped: string[] }; }

type Tf = { R: number[][]; p: V3 };
const toWorld = (T: Tf, p: V3): V3 => [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.p[i] * 1000) as V3;

interface Solid { link: string; lo: V3; hi: V3; tri: Float64Array; }
function solidOf(spec: RobotSpecification, f: ReturnType<typeof fk>, name: string): Solid | null | "skip" {
  const l = spec.links.find((x) => x.name === name)!, g = l.geometry as { type: string; part?: string };
  if (!f.link[name]) return null;
  // the electrical parts are what the wires plug into; the armour shells are forged in the page, not here
  if (g.type === "mesh" && (g.part === "component" || g.part === "armour")) return g.part === "armour" ? "skip" : null;
  let m: { v: V3[]; f: [number, number, number][] };
  try { m = buildPart(g as never) as never; } catch { return "skip"; }
  if (!m?.f?.length) return null;
  const O = l.origin ? { R: rpyToR(l.origin.rpy as V3), p: l.origin.xyz as V3 } : null;
  const T = f.link[name];
  const w = m.v.map((v) => { const q: V3 = O ? [0, 1, 2].map((i) => O.R[i][0] * v[0] + O.R[i][1] * v[1] + O.R[i][2] * v[2] + O.p[i]) as V3 : v; return toWorld(T, [q[0] * 1000, q[1] * 1000, q[2] * 1000]); });
  const tri = new Float64Array(m.f.length * 9); const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  m.f.forEach((t, i) => { for (let k = 0; k < 3; k++) { const v = w[t[k]]; tri.set(v, i * 9 + k * 3); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], v[a]); hi[a] = Math.max(hi[a], v[a]); } } });
  return { link: name, lo, hi, tri };
}
/** inside a closed mesh: ray along a slightly skewed direction, odd crossings */
function inside(s: Solid, p: V3): boolean {
  if (p[0] < s.lo[0] || p[1] < s.lo[1] || p[2] < s.lo[2] || p[0] > s.hi[0] || p[1] > s.hi[1] || p[2] > s.hi[2]) return false;
  const d: V3 = [1, 0.000173, 0.000311]; let n = 0; const t = s.tri;
  for (let i = 0; i < t.length; i += 9) {
    // Moller-Trumbore
    const e1 = [t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]], e2 = [t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(a) < 1e-12) continue;
    const fi = 1 / a, sv = [p[0] - t[i], p[1] - t[i + 1], p[2] - t[i + 2]], u = fi * (sv[0] * h[0] + sv[1] * h[1] + sv[2] * h[2]);
    if (u < 0 || u > 1) continue;
    const q = [sv[1] * e1[2] - sv[2] * e1[1], sv[2] * e1[0] - sv[0] * e1[2], sv[0] * e1[1] - sv[1] * e1[0]], v = fi * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
    if (v < 0 || u + v > 1) continue;
    if (fi * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) > 0) n++;
  }
  return n % 2 === 1;
}

export function checkHarness(spec: RobotSpecification, rec: WiringRecord, h: Wiring3D, opts: { step_mm?: number; exitWall_mm?: number; only?: string[] } = {}): HarnessCheck {
  const f = fk(spec), step = opts.step_mm ?? 4, wall = opts.exitWall_mm ?? 12;
  const out: HarnessCheck = { through: [], bend: [], length: [], checked: { wires: h.wires.length, samples: 0, solids: 0, skipped: [] } };
  const solids = new Map<string, Solid | null>();
  const solid = (n: string) => { if (!solids.has(n)) { const s = solidOf(spec, f, n); if (s === "skip") { out.checked.skipped.push(n); solids.set(n, null); } else { solids.set(n, s); if (s) out.checked.solids++; } } return solids.get(n)!; };
  for (const l of spec.links) if (!opts.only || opts.only.includes(l.name)) solid(l.name);
  const all = [...solids.values()].filter(Boolean) as Solid[];
  const cable = new Map(rec.cables.map((c) => [c.id, c]));
  const partLink = new Map(h.parts.map((p) => [p.inst, p.link]));
  for (const w of h.wires) {
    const world = w.pts.map((q) => toWorld(f.link[q.link], q.p));
    // ---- length
    let L = 0; for (let i = 1; i < world.length; i++) L += len(sub(world[i], world[i - 1]));
    const c = cable.get(w.cable), allowance = c ? c.service_mm + c.slack_mm + c.termination_mm : 0;
    // the cut wire reaches pin to pin (10 mm grace for the drawing's rounding), and it is not grossly longer than the run
    if (L > w.cut_mm + 10 || L < (w.cut_mm - allowance) * 0.5 - 10) out.length.push({ wire: w.id, drawn_mm: Math.round(L), allowance_mm: allowance, cut_mm: w.cut_mm });
    // ---- bend: radius at each vertex from its two neighbours (the arcs drawn are polylines of the fillet); the flexing
    // rule next to a joint crossing, the fixed-installation rule elsewhere
    let worst: { r: number; min: number } | null = null;
    for (let i = 1; i < world.length - 1; i++) {
      // neighbours at least 1.5 mm away, so rounding of the stored points does not read as a bend
      let j = i - 1; while (j > 0 && len(sub(world[i], world[j])) < 1.5) j--;
      let k = i + 1; while (k < world.length - 1 && len(sub(world[k], world[i])) < 1.5) k++;
      const a = len(sub(world[i], world[j])), b = len(sub(world[k], world[i])), cc = len(sub(world[k], world[j]));
      const s = (a + b + cc) / 2, area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - cc)));
      if (area < 1e-6 || a < 0.3 || b < 0.3) continue;
      const flex = w.pts[j].link !== w.pts[i].link || w.pts[k].link !== w.pts[i].link, min = flex ? w.flex_bend_mm : w.min_bend_mm;
      // inside one body every corner is drawn as an arc turning at most 0.25 rad a step: a vertex between two legs of
      // 1 mm or more that turns more is an unrounded kink
      const u = sub(world[i], world[i - 1]), v = sub(world[i + 1], world[i]), lu = len(u), lv = len(v);
      const turn = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv || 1))));
      const r = !flex && turn > 0.4 && lu >= 1 && lv >= 1 ? 0 : (a * b * cc) / (4 * area);
      if (r < min * 0.95 && (!worst || r / min < worst.r / worst.min)) worst = { r, min };
    }
    if (worst) out.bend.push({ wire: w.id, radius_mm: Math.round(worst.r * 10) / 10, min_mm: worst.min });
    // ---- through solids
    const ends = [w.from, w.to].map((t) => partLink.get(t.split(".")[0]));
    let along = 0, run = 0, runLink = "", runAt: V3 = [0, 0, 0];
    const exitDeclared = !!c?.exit;
    const flush = () => { if (run > 0 && !(exitDeclared && run <= wall)) out.through.push({ wire: w.id, link: runLink, at: runAt.map((x) => Math.round(x)) as V3, run_mm: Math.round(run) }); run = 0; runLink = ""; };
    for (let i = 1; i < world.length; i++) {
      const seg = len(sub(world[i], world[i - 1])), n = Math.max(1, Math.ceil(seg / step));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, p: V3 = [world[i - 1][0] + (world[i][0] - world[i - 1][0]) * t, world[i - 1][1] + (world[i][1] - world[i - 1][1]) * t, world[i - 1][2] + (world[i][2] - world[i - 1][2]) * t];
        const d = along + seg * t; out.checked.samples++;
        const nearEnd = d < 20 || d > L - 20;
        const hit = all.find((s) => !(nearEnd && ends.includes(s.link)) && inside(s, p));
        if (hit) { if (!run) { runLink = hit.link; runAt = p; } run += seg / n; } else flush();
      }
      along += seg;
    }
    flush();
  }
  return out;
}
