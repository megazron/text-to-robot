// Checks of the 3D harness at the home pose:
//   through: a wire must not pass through a solid. Each wire's centreline is sampled every few mm and each sample is
//     tested inside every link's solid (ray parity on its closed mesh: printed, fabricated and plain links alike) and inside
//     the body box of every bought part and harness part. Only the two parts a wire plugs into are let off, and only over
//     the wire's first and last 25 mm (its connector and the pin it sits on). There is no allowance for walls: a cable
//     crosses a wall through the hole of its exit or it is a finding.
//   bend: every corner is drawn as an arc; the arc must be at least the wire's bend radius: the fixed-installation
//     figure of the WIRING table inside one body, the flexing figure where the wire crosses a joint. A corner whose legs
//     are too short for that radius is a finding, and so is a sharp vertex inside one body (drawn arcs turn at most
//     0.25 rad a step; more is an unrounded kink).
//   length: the cut length in WIRING.md is the drawn wire, pin to pin, plus its allowances (service loop, joint slack,
//     termination), rounded up to 5 mm: a cut length shorter than that, or more than 5 mm longer, is a finding. (A record
//     from before the router has no laid wires: there the cut length must only reach.)
import type { RobotSpecification } from "@ttr/robot-schema";
import type { WiringRecord } from "../wiring.ts";
import { fk } from "../kin.ts";
import type { Wiring3D } from "./wires.ts";
import { linkTriangles, partBox, componentLinks } from "./solids.ts";
import { bodyBox } from "./place.ts";
import { roundWire } from "./route.ts";
import { polyLen } from "./curve.ts";
import { sub, len, type V3 } from "./geom.ts";

export interface HarnessCheck { through: { wire: string; link: string; at: V3; run_mm: number }[]; bend: { wire: string; radius_mm: number; min_mm: number }[]; length: { wire: string; drawn_mm: number; allowance_mm: number; cut_mm: number }[]; checked: { wires: number; samples: number; solids: number; skipped: string[] }; }

type Tf = { R: number[][]; p: V3 };
const toWorld = (T: Tf, p: V3): V3 => [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.p[i] * 1000) as V3;

interface Solid { link: string; lo: V3; hi: V3; tri: Float64Array; }
function solidOf(spec: RobotSpecification, f: ReturnType<typeof fk>, name: string): Solid | null | "skip" {
  const l = spec.links.find((x) => x.name === name)!;
  if (!f.link[name]) return null;
  const tri = linkTriangles(l, f.link[name]);
  if (!tri || tri === "skip") return tri;
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], tri[i + a]); hi[a] = Math.max(hi[a], tri[i + a]); }
  return { link: name, lo, hi, tri };
}
/** a bought part or a harness part as a box in a frame; `own` is the instance a wire may plug into */
interface PartSolid { name: string; own: string[]; R: number[][]; p: V3; min: V3; max: V3; }
const inPart = (b: PartSolid, w: V3, shrink = 0.3) => { const d = sub(w, b.p); for (let a = 0; a < 3; a++) { const x = b.R[0][a] * d[0] + b.R[1][a] * d[1] + b.R[2][a] * d[2]; if (x < b.min[a] + shrink || x > b.max[a] - shrink) return false; } return true; };
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

export function checkHarness(spec: RobotSpecification, rec: WiringRecord, h: Wiring3D, opts: { step_mm?: number; only?: string[] } = {}): HarnessCheck {
  const f = fk(spec), step = opts.step_mm ?? 3;
  const out: HarnessCheck = { through: [], bend: [], length: [], checked: { wires: h.wires.length, samples: 0, solids: 0, skipped: [] } };
  const solids = new Map<string, Solid | null>();
  const solid = (n: string) => { if (!solids.has(n)) { const s = solidOf(spec, f, n); if (s === "skip") { out.checked.skipped.push(n); solids.set(n, null); } else { solids.set(n, s); if (s) out.checked.solids++; } } return solids.get(n)!; };
  for (const l of spec.links) if (!opts.only || opts.only.includes(l.name)) solid(l.name);
  const all = [...solids.values()].filter(Boolean) as Solid[];
  // bought parts on their links, harness parts where the record puts them
  const boxes: PartSolid[] = [];
  const instOn = new Map<string, string[]>(); for (const p of h.parts) if (!p.harness) instOn.set(p.link, [...(instOn.get(p.link) ?? []), p.inst]);
  if (!opts.only) {
    for (const { link, key } of componentLinks(spec)) { const T = f.link[link], b = partBox(key); if (T && b) { boxes.push({ name: link, own: [link, ...(instOn.get(link) ?? [])], R: T.R, p: toWorld(T, [0, 0, 0]), min: b.min, max: b.max }); out.checked.solids++; } }
    for (const p of h.parts) if (p.harness && !/^branch_fuse_/.test(p.inst)) {
      const L = f.link[p.link], b = bodyBox(p.model); if (!L || !b) continue;
      const M = p.T, Rl = [[M[0], M[1], M[2]], [M[4], M[5], M[6]], [M[8], M[9], M[10]]], R = [0, 1, 2].map((r) => [0, 1, 2].map((c) => L.R[r][0] * Rl[0][c] + L.R[r][1] * Rl[1][c] + L.R[r][2] * Rl[2][c]));
      boxes.push({ name: p.inst, own: [p.inst], R, p: toWorld(L, [M[3], M[7], M[11]]), min: b.min, max: b.max }); out.checked.solids++;
    }
  }
  const cable = new Map(rec.cables.map((c) => [c.id, c]));
  const laid = new Set(rec.cables.flatMap((c) => c.wires.filter((x) => x.pts).map((x) => x.id)));
  const drawn = new Map<string, number>();
  for (const w of h.wires) {
    const world = w.pts.map((q) => toWorld(f.link[q.link], q.p));
    // ---- length
    let L = 0; for (let i = 1; i < world.length; i++) L += len(sub(world[i], world[i - 1]));
    drawn.set(w.id, L);
    const c = cable.get(w.cable), allowance = c ? c.service_mm + c.slack_mm + c.termination_mm : 0;
    const base = w.id.replace(/[ab]$/, ""), half = base !== w.id && laid.has(base);
    if (laid.has(w.id)) { if (L > w.cut_mm - allowance + 0.6 || L < w.cut_mm - allowance - 5.6) out.length.push({ wire: w.id, drawn_mm: Math.round(L), allowance_mm: allowance, cut_mm: w.cut_mm }); }
    // the cut wire reaches pin to pin (10 mm grace for the drawing's rounding), and it is not grossly longer than the run
    else if (!half && (L > w.cut_mm + 10 || L < (w.cut_mm - allowance) * 0.5 - 10)) out.length.push({ wire: w.id, drawn_mm: Math.round(L), allowance_mm: allowance, cut_mm: w.cut_mm });
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
    const ends = [w.from.split(".")[0], w.to.split(".")[0]];
    let along = 0, run = 0, runLink = "", runAt: V3 = [0, 0, 0];
    const flush = () => { if (run > 0) out.through.push({ wire: w.id, link: runLink, at: runAt.map((x) => Math.round(x)) as V3, run_mm: Math.round(run) }); run = 0; runLink = ""; };
    for (let i = 1; i < world.length; i++) {
      const seg = len(sub(world[i], world[i - 1])), n = Math.max(1, Math.ceil(seg / step));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, p: V3 = [world[i - 1][0] + (world[i][0] - world[i - 1][0]) * t, world[i - 1][1] + (world[i][1] - world[i - 1][1]) * t, world[i - 1][2] + (world[i][2] - world[i - 1][2]) * t];
        const d = along + seg * t; out.checked.samples++;
        const nearA = d < 25, nearB = d > L - 25;
        const hit = all.find((s) => inside(s, p))?.link ?? boxes.find((b) => !((nearA && b.own.includes(ends[0])) || (nearB && b.own.includes(ends[1]))) && inPart(b, p))?.name;
        if (hit) { if (!run) { runLink = hit; runAt = p; } run += seg / n; } else flush();
      }
      along += seg;
    }
    flush();
  }
  // a lead cut in two by a branch fuse: its two halves and the fuse between them against the lead's cut length
  for (const c of rec.cables) for (const x of c.wires) if (x.pts && drawn.has(`${x.id}a`) && drawn.has(`${x.id}b`)) {
    const full = roundedLength(x), allowance = c.service_mm + c.slack_mm + c.termination_mm;
    if (drawn.get(`${x.id}a`)! + drawn.get(`${x.id}b`)! > full + 0.6 || full > x.length_mm - allowance + 0.6 || full < x.length_mm - allowance - 5.6) out.length.push({ wire: x.id, drawn_mm: Math.round(full), allowance_mm: allowance, cut_mm: x.length_mm });
  }
  return out;
}
const roundedLength = (x: { pts?: V3[]; on?: [string, number][]; bend_mm?: number }) => polyLen(roundWire(x.pts!, x.on!.flatMap(([l, n]) => Array.from({ length: n }, () => l)), x.bend_mm ?? 5).pts);
