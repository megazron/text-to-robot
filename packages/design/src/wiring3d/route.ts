// The router: lays every wire of a harness through free space at the robot's home pose.
//   The solids (solids.ts) are rasterised into small cubes (voxel.ts). A cable's centreline is searched through free cubes
//   leg by leg: from its first part to the wall exit of that part's compartment, through the hole, to each joint it
//   crosses (an anchor on each side of the joint), and on to its last part. A leg inside a compartment stays inside it:
//   the only way through a wall is a declared exit. Each wire leaves its pin straight through its connector, takes room
//   for its first bend, joins the cable (its own place in the bundle) and leaves it the same way at the far end. Corners
//   are rounded to the wire's bend radius and the rounded line is tested against the cubes again; what cannot be laid
//   clear is reported, never drawn as if it were.
//   Harness parts with no link of their own (lever splices, the star ground, an inline fuse) are put down in the nearest
//   free space beside the part they serve, inside its compartment.
import type { RobotSpecification, Joint } from "@ttr/robot-schema";
import type { Fk } from "../kin.ts";
import { partModel, type PartModel, type PinAt } from "./models.ts";
import { Grid, inBox, type Box } from "./voxel.ts";
import { apply, rotate, linkBox, bodyBox, pinOf, pinWorld, connectorLen, wireSize, type Tf } from "./place.ts";
import { linkTriangles, partBox, componentLinks } from "./solids.ts";
import { fillet, polyLen } from "./curve.ts";
import { add, sub, scale, dot, cross, len, unit, lerp, perp, type V3 } from "./geom.ts";

export interface ExitAt { id: string; at: V3; n: V3; hole_mm: number; }
export interface CableIn {
  key: string; a: string; b: string; od: number;
  /** `ai` / `bi`: the part a wire's end is on when it is not `a` / `b` (a return from the star ground in a feed's cable) */
  wires: { from: [string, string]; to: [string, string]; awg: number | null; ai?: string; bi?: string }[];
  /** the moving joints between the two parts, in order from a to b */
  crossing: Joint[];
  exitA: ExitAt | null; exitB: ExitAt | null; bayA?: string; bayB?: string;
  /** compartments the cable passes through on its way, after leaving a's: in by one exit, out by another (before any joint) */
  via?: { bay: string; enter: ExitAt; leave: ExitAt }[];
}
export interface WireOut { pts: V3[]; on: string[]; drawn_mm: number; }
export interface CableOut {
  trunk: V3[]; trunkOn: string[]; wires: WireOut[];
  anchors: { joint: string; aIn: V3; aOut: V3 }[]; problems: string[];
}
export interface Placed { link: string; world: Tf; model: PartModel; id: number; harness: boolean; }

const r1 = (p: V3): V3 => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 10) / 10];
const dist = (a: V3, b: V3) => len(sub(a, b));

export class Router {
  spec: RobotSpecification; f: Fk; grid: Grid; groups: Record<string, string> = {};
  placed = new Map<string, Placed>(); bays = new Map<string, Box>(); skipped: string[] = [];
  private nextId = 2; private dirty = true; private kept = new Set<number>();
  constructor(spec: RobotSpecification, f: Fk, opts: { bays?: { name: string; link: string; T: number[]; min: V3; max: V3 }[]; voxel_mm?: number } = {}) {
    this.spec = spec; this.f = f;
    const parentJ = new Map(spec.joints.map((j) => [j.child, j]));
    const groupOf = (n: string): string => { const j = parentJ.get(n); return j && j.type === "fixed" ? groupOf(j.parent) : n; };
    for (const l of spec.links) this.groups[l.name] = groupOf(l.name);
    // the grid: round everything, with room for a cable to pass outside
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const l of spec.links) { const b = f.link[l.name] && linkBox(l, f.link[l.name]); if (b) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); } }
    if (!Number.isFinite(lo[0])) { lo.fill(0); hi.fill(10); }
    const pad = 40, vol = (hi[0] - lo[0] + 2 * pad) * (hi[1] - lo[1] + 2 * pad) * (hi[2] - lo[2] + 2 * pad);
    const s = opts.voxel_mm ?? Math.min(4, Math.max(2, Math.ceil(Math.cbrt(vol / 24e6) * 4) / 4));
    this.grid = new Grid([lo[0] - pad, lo[1] - pad, lo[2] - pad], [hi[0] + pad, hi[1] + pad, hi[2] + pad], s);
    for (const l of spec.links) {
      const T = f.link[l.name]; if (!T) continue;
      const tri = linkTriangles(l, T);
      if (tri === "skip") this.skipped.push(l.name); else if (tri) this.grid.addMesh(tri, 1);
    }
    for (const { link, key } of componentLinks(spec)) {
      const T = f.link[link]; if (!T) continue;
      let model: PartModel | null = null; try { model = partModel(key); } catch { model = null; }
      const id = Math.min(255, this.nextId++), b = partBox(key);
      if (b) this.grid.addBox(T.R, scale(T.p as V3, 1000), b.min, b.max, id);
      if (model) this.placed.set(link, { link, world: T, model, id, harness: false });
    }
    // the floor (or the desk a bench robot stands on) under the robot's lowest solid at the home pose: no cable runs under
    // it (a robot whose base stands at z = 0 has the floor there; a legged robot's base hangs over its feet)
    { const g = this.grid, plane = g.nx * g.ny; let k1 = Math.min(g.nz, Math.max(0, Math.ceil(-g.o[2] / g.s - 0.5)));
      for (let k = 0; k < k1; k++) for (let n = k * plane; n < (k + 1) * plane; n++) if (g.occ[n]) { k1 = k; break; }
      for (let k = 0; k < k1; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const n = g.id(i, j, k); if (!g.occ[n]) g.occ[n] = 1; } }
    for (const b of opts.bays ?? []) {
      const T = f.link[b.link]; if (!T) continue;
      const M = b.T, inLink = (p: V3): V3 => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
      const bl: V3 = [Infinity, Infinity, Infinity], bh: V3 = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < 8; k++) { const w = apply(T, inLink([(k & 1 ? b.max : b.min)[0], (k & 2 ? b.max : b.min)[1], (k & 4 ? b.max : b.min)[2]])); for (let i = 0; i < 3; i++) { bl[i] = Math.min(bl[i], w[i]); bh[i] = Math.max(bh[i], w[i]); } }
      this.bays.set(b.name, { min: bl, max: bh });
    }
    this.ready();
  }
  /** a slice of the grid as text, for debugging: axis 0/1/2 is the slice normal */
  slice(c: V3, axis: number, half: number): string {
    const g = this.grid, [ci, cj, ck] = g.ix(c), n = Math.ceil(half / g.s), rows: string[] = [];
    const u = axis === 0 ? 1 : 0, v = axis === 2 ? 1 : 2;
    for (let b = n; b >= -n; b--) { let row = ""; for (let a = -n; a <= n; a++) { const q = [ci, cj, ck]; q[u] += a; q[v] += b; const o = g.inb(q[0], q[1], q[2]) ? g.occ[g.id(q[0], q[1], q[2])] : 0; row += a === 0 && b === 0 ? "+" : o === 0 ? "." : o === 1 ? "#" : String.fromCharCode(97 + ((o - 2) % 26)); } rows.push(row); }
    return rows.join("\n");
  }
  /** what blocks a point: a bought part by name, else a printed part */
  nameAt(p: V3): string { const o = this.grid.at(p); for (const [n, pl] of this.placed) if (pl.id === o) return n; return o === 1 ? "a printed part" : "a part"; }
  private ready() { if (this.dirty) { this.grid.finish(); this.dirty = false; } }
  /** a part riding a link under another name (a part carried in a bay with no link of its own is placed like a harness part) */
  alias(inst: string, link: string, key: string) { const p = this.placed.get(link); if (p && !this.placed.has(inst)) this.placed.set(inst, { ...p, model: partModel(key) }); }

  /**
   * Put a harness part down beside `home` (world mm) on rigid body `group`: the nearest spot where its body is clear, the
   * pins in use have room for their connectors, and something is close by to tie it to. Returns its body centre.
   */
  placeHarness(inst: string, key: string, home: V3, group: string, pins: [string, string][], bay?: string, partner?: (port: string, pin: string) => V3 | null, given = false, turn?: number): { at: V3; turn: number } | null {
    const model = partModel(key), bb = bodyBox(model), L = this.f.link[group];
    if (!bb || !L) return null;
    this.ready();
    const c = lerp(bb.min, bb.max, 0.5), within = bay ? this.bays.get(bay) : undefined, g = this.grid;
    const half = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) / 2;
    // the part lies with the body's axes turned `turn` quarter turns about the body's z where the design says so; else with
    // the body's axes or half a turn round, whichever way its pins face the pins they are wired to (a wire that has to come
    // round to a pin facing away from it needs a U-turn it may have no room for)
    const Rq = (n: number) => { const q4 = ((n % 4) + 4) % 4, cs = [1, 0, -1, 0][q4], sn = [0, 1, 0, -1][q4]; return L.R.map((r) => [r[0] * cs + r[1] * sn, r[1] * cs - r[0] * sn, r[2]]); };
    const frameOf = (R: number[][], q: V3): Tf => ({ R, p: scale(sub(q, rotate({ R, p: [0, 0, 0] }, c)), 0.001) as V3 });
    // (the mean over its pins; `least` is the worst of them, which counts for a part with a lead at each end)
    let least = 1;
    const facing = (T: Tf) => { let sum = 0, n = 0; least = 1; for (const [port, pin] of pins) { const pa = pinOf(model, port, pin), to = partner?.(port, pin); if (!pa || !to) continue; const w = pinWorld(T, pa), d = sub(to, w.p); if (len(d) < 1) continue; const k = dot(w.out, unit(d)); sum += k; least = Math.min(least, k); n++; } return n ? sum / n : 0; };
    const outs = pins.map(([port, pin]) => pinOf(model, port, pin)?.out).filter((o): o is V3 => !!o), twoEnded = outs.length > 1 && len(outs.reduce((a, o) => add(a, o), [0, 0, 0] as V3)) / outs.length < 0.5;
    const qt = turn ?? (!!partner && facing(frameOf(Rq(2), home)) > facing(frameOf(L.R, home)) + 0.2 ? 2 : 0), Rp = Rq(qt);
    const frame = (p: V3): Tf => frameOf(Rp, p);
    const fits = (q: V3, near: boolean, face = false) => {
      const T = frame(q);
      if (face && (facing(T) < 0.3 || (twoEnded && least < 0.5))) return false;
      if (near && g.dist(q) > Math.ceil(half / g.s) + 2) return false;
      if (!g.boxFree(T.R, scale(T.p as V3, 1000), bb.min, bb.max, 1)) return false;
      // not in front of anyone's pins: the corners, edge middles and centre of the body against the kept cells
      if (this.kept.size) { const h = [0, 1, 2].map((a) => (bb.max[a] - bb.min[a]) / 2 + 1.5), st = [0, 1, 2].map((a) => Math.max(1, Math.ceil((2 * h[a]) / g.s)));
        for (let a = 0; a <= st[0]; a++) for (let b = 0; b <= st[1]; b++) for (let cc = 0; cc <= st[2]; cc++) { const l: V3 = [c[0] - h[0] + (2 * h[0] * a) / st[0], c[1] - h[1] + (2 * h[1] * b) / st[1], c[2] - h[2] + (2 * h[2] * cc) / st[2]]; if (this.kept.has(this.cellOf(apply(T, l)))) return false; } }
      for (const [port, pin] of pins) {
        const pa = pinOf(model, port, pin); if (!pa) continue;
        const w = pinWorld(T, pa), n = connectorLen(pa.kind) + 8;
        for (let t = 2; t <= n; t += g.s / 2) if (g.at(add(w.p, scale(w.out, t)))) return false;
      }
      return true;
    };
    // (`given`: the design chose `home` itself, so the nearest place that fits is taken as it is)
    const at = (partner && !given ? g.nearest(home, 1, 90, within, (q) => fits(q, true, true)) : null) ?? g.nearest(home, 1, 90, within, (q) => fits(q, true)) ?? g.nearest(home, 1, 140, within, (q) => fits(q, false)) ?? (within ? g.nearest(home, 1, 140, undefined, (q) => fits(q, false)) : null);
    if (!at) return null;
    const T = frame(at), id = Math.min(255, this.nextId++);
    g.addBox(T.R, scale(T.p as V3, 1000), bb.min, bb.max, id);
    this.placed.set(inst, { link: group, world: T, model, id, harness: true });
    this.dirty = true;
    return { at, turn: ((qt % 4) + 4) % 4 };
  }
  /** where a placed part's pin is in the world, or null */
  pinAt(inst: string, port: string, pin: string): V3 | null { return this.pin(inst, port, pin)?.p ?? null; }

  /** Keep the space in front of a part's pins free of harness parts: the connector and the first bend of every wire to come. */
  reserve(inst: string, pins: [string, string][]) {
    const pl = this.placed.get(inst); if (!pl) return;
    for (const [port, pin] of pins) {
      const pa = pinOf(pl.model, port, pin); if (!pa) continue;
      const w = pinWorld(pl.world, pa), n = connectorLen(pa.kind) + 12;
      for (let t = 0; t <= n; t += this.grid.s / 2) this.kept.add(this.cellOf(add(w.p, scale(w.out, t))));
    }
  }
  private cellOf(p: V3) { const [i, j, k] = this.grid.ix(p); return this.grid.inb(i, j, k) ? this.grid.id(i, j, k) : -1; }
  private pin(inst: string, port: string, pin: string): { p: V3; out: V3; kind: PinAt["kind"]; id: number; group: string } | null {
    const pl = this.placed.get(inst); if (!pl) return null;
    const pa = pinOf(pl.model, port, pin); if (!pa) return null;
    return { ...pinWorld(pl.world, pa), kind: pa.kind, id: pl.id, group: this.groups[pl.link] ?? pl.link };
  }
  /** out of a pin: the end of the rigid connector (S) and the point the first bend turns about (V), in free space */
  private leadOut(e: { p: V3; out: V3; kind: PinAt["kind"]; id: number }, R: number, problems: string[], what: string): { S: V3; V: V3 } {
    const g = this.grid, own = (q: V3) => { const o = g.at(q); return o === 0 || o === e.id; };
    let conn = connectorLen(e.kind);
    // a pin inside its own part's body box (a header between taller components): straight out until it is clear of the box
    for (let t = conn; t < conn + 40; t += 1) if (g.at(add(e.p, scale(e.out, t))) !== e.id) { conn = t; break; }
    const S = add(e.p, scale(e.out, conn));
    for (let t = 2; t <= conn; t += 1) if (!own(add(e.p, scale(e.out, t)))) { problems.push(`${what}: its connector (${Math.round(conn)} mm) meets ${this.nameAt(add(e.p, scale(e.out, t)))} ${Math.round(t)} mm from the pin`); return { S, V: S }; }
    // a quarter more than the radius: a turn a little over a right angle still rounds fully
    for (const k of [1.25, 1.1, 1, 0.75, 0.5]) {
      const V = add(S, scale(e.out, R * k)); let ok = g.at(V) === 0;
      for (let t = 0; ok && t <= R * k; t += 1) if (!own(add(S, scale(e.out, t)))) ok = false;
      if (ok) { if (k < 1) problems.push(`${what}: ${Math.round(R * k)} mm for the first bend, the wire wants ${R.toFixed(1)} mm`); return { S, V }; }
    }
    problems.push(`${what}: no room for a bend beyond the connector`);
    return { S, V: S };
  }
  /** a free point with clearance `need` at or near p (reachable from p in a straight line), else p itself if it is free */
  private snap(p: V3, need: number, within?: Box): V3 | null {
    const g = this.grid;
    if (g.dist(p) >= need && (!within || inBox(within, p))) return p;
    return g.nearest(p, need, 30, within, (q) => g.line(p, q, 1) >= 0) ?? g.nearest(p, need, 60, within);
  }
  /** a to b through free space, at the best clearance there is from `need` down; null if there is no way */
  private connect(a: V3, b: V3, need: number, within?: Box): V3[] | null {
    const g = this.grid;
    for (let n = need; n >= 1; n--) {
      const a2 = g.dist(a) >= n ? a : g.nearest(a, n, 16, within, (q) => g.line(a, q, 1, within) >= 0), b2 = g.dist(b) >= n ? b : g.nearest(b, n, 16, within, (q) => g.line(b, q, 1, within) >= 0);
      if (!a2 || !b2) continue;
      const p = g.path(a2, b2, n, within); if (!p) continue;
      // a long way round for the sake of room: a much shorter way with less room (through a hole made for it) wins
      const L = polyLen(p), direct = dist(a2, b2);
      let pp = p;
      if (n > 2 && L > 2 * direct + 20) {
        const a3 = g.dist(a) >= 2 ? a : g.nearest(a, 2, 16, within, (q) => g.line(a, q, 1, within) >= 0), b3 = g.dist(b) >= 2 ? b : g.nearest(b, 2, 16, within, (q) => g.line(b, q, 1, within) >= 0);
        const q = a3 && b3 ? g.path(a3, b3, 2, within) : null;
        if (q && polyLen(q) < 0.6 * L) pp = q;
      }
      // the search starts and ends at the nearest cube with the clearance: where the line past that cube is clear, the short hop to it goes
      const out = dedupe([a, ...pp, b]);
      if (out.length > 2 && dist(out[out.length - 2], b) < 8 && g.line(out[out.length - 3], b, 1, within) >= 0) out.splice(out.length - 2, 1);
      if (out.length > 2 && dist(out[1], a) < 8 && g.line(a, out[2], 1, within) >= 0) out.splice(1, 1);
      return out;
    }
    return null;
  }
  /** through a wall exit: a free point on the hole's axis on each side */
  private pierce(e: ExitAt, need: number, bay: Box | undefined, run: number, toIn?: V3, toOut?: V3): { inner: V3; outer: V3 } | null {
    const g = this.grid;
    // the first free point each side of the wall, then on along the axis while it stays free, up to `run`: room to turn on to
    // the hole's line. Where the cable comes from a known point (or goes to its part inside the compartment), it runs on along the axis until it is level
    // with it and turns off there: one corner, not one short of it and another right after
    const along = (sgn: number, box?: Box, to?: V3) => {
      const want = to ? sgn * dot(sub(to, e.at), e.n) : Infinity;
      // (not past the point it is going to: there it settles for less clearance)
      for (const n of [need, 1]) for (let t = 2; t <= (n === need ? Math.min(40, want) : 40); t += 1) {
        const q = add(e.at, scale(e.n, sgn * t)); if (g.dist(q) < n || (box && !inBox(box, q, -g.s))) continue;
        let best = q;
        for (let u = 1; u <= (Number.isFinite(want) ? Math.max(run, want) : run) && t + u <= want + 0.5; u += 1) {
          const q2 = add(q, scale(e.n, sgn * u)); if (g.dist(q2) < n || (box && !inBox(box, q2, -g.s))) break; best = q2;
        }
        return best;
      }
      return null;
    };
    const inner = along(-1, bay, toIn), outer = along(1, undefined, toOut);
    return inner && outer ? { inner, outer } : null;
  }

  /**
   * Lay one cable. `awg` per wire gives the bend radius; call again if the gauges change. Through a wall exit the run is
   * laid both ways (turning off the hole's axis level with where it comes from, and after the plain run) and the way with
   * fewer problems is kept.
   */
  cable(c: CableIn): CableOut {
    const a = this.cableOnce(c, true);
    if (!a.problems.length || (!c.exitA && !c.exitB)) return a;
    const b = this.cableOnce(c, false);
    return b.problems.length < a.problems.length ? b : a;
  }
  private cableOnce(c: CableIn, level: boolean): CableOut {
    this.ready();
    const g = this.grid, s = g.s, problems: string[] = [], n = c.wires.length;
    const ends = c.wires.map((w, i) => {
      const a = this.pin(w.ai ?? c.a, w.from[0], w.from[1]), b = this.pin(w.bi ?? c.b, w.to[0], w.to[1]);
      if (!a || !b) return null;
      const R = wireSize(w.awg).bend;
      return { a, b, R, la: this.leadOut(a, R, problems, `${w.ai ?? c.a}.${w.from[1]}`), lb: this.leadOut(b, R, problems, `${w.bi ?? c.b}.${w.to[1]}`), i };
    });
    if (ends.some((e) => !e)) return { trunk: [], trunkOn: [], wires: [], anchors: [], problems: [`${c.key}: an end has no place`] };
    const E = ends as NonNullable<(typeof ends)[number]>[];
    // two pins facing each other on one line (a pack's lead straight into the fuse): the wire runs straight between the
    // connectors and turns nowhere, so their lead-outs meet half way
    if (n === 1) { const x = E[0], u = x.a.out, d = sub(x.lb.S, x.la.S), along = dot(d, u), lat = len(sub(d, scale(u, along)));
      if (dot(u, x.b.out) < -0.995 && along > 1 && lat < 1.5 && dot(sub(x.lb.V, x.la.V), u) < 0 && g.line(x.la.S, x.lb.S, 1) >= 0) { const m = lerp(x.la.S, x.lb.S, 0.5); x.la.V = m; x.lb.V = m; } }
    const ga = E[0].a.group, gb = E[0].b.group;
    // clearance asked of the search: the bundle's half width and a bend radius beside it, so a path round an edge leaves the
    // room its corners need to be rounded; it settles for less, down to the wire's own width, where there is not that much
    const Rmax = Math.max(...E.map((x) => x.R)), ringNeed = 1 + Math.ceil((c.od / 2 + 0.5) / s), needT = 1 + Math.ceil((c.od / 2 + Rmax) / s), needW = 1 + Math.ceil(Rmax / s);
    // a plug that stands out through its compartment's wall (a USB plug in the wall's cut-out) leaves the compartment
    // itself: that end is laid as outside it, with no exit to pass
    const outside = (box: Box | undefined, pts: V3[]) => !!box && pts.every((p) => !inBox(box, p));
    if (outside(c.bayA ? this.bays.get(c.bayA) : undefined, E.map((e) => e.la.V))) c = { ...c, bayA: undefined, exitA: null };
    if (outside(c.bayB ? this.bays.get(c.bayB) : undefined, E.map((e) => e.lb.V))) c = { ...c, bayB: undefined, exitB: null };
    const boxA = c.bayA ? this.bays.get(c.bayA) : undefined, boxB = c.bayB ? this.bays.get(c.bayB) : undefined;
    const sameBay = !!c.bayA && c.bayA === c.bayB;
    const centroid = (ps: V3[]) => scale(ps.reduce((a, p) => add(a, p), [0, 0, 0] as V3), 1 / ps.length);
    // two pins facing each other on one line, nothing between and no wall or joint to pass: the wire runs straight across
    // (each end's room for a first bend is not wanted where there is no bend)
    if (n === 1 && !c.crossing.length && (sameBay || (!c.exitA && !c.exitB))) {
      const e0 = E[0], Sa = e0.la.S, Sb = e0.lb.S, d = sub(Sb, Sa), L = len(d);
      if (L > 1 && dot(unit(d), e0.a.out) > Math.cos(0.17) && dot(unit(d), e0.b.out) < -Math.cos(0.17) && g.line(Sa, Sb, 1) >= 0 && !problems.some((x) => !/first bend|no room for a bend/.test(x))) {
        const pts = [e0.a.p, Sa, Sb, e0.b.p].map(r1), on = [ga, ga, gb, gb], F = roundWire(pts, on, e0.R);
        if (!F.tight) return { trunk: [Sa, Sb].map(r1), trunkOn: [ga, gb], wires: [{ pts, on, drawn_mm: polyLen(F.pts) }], anchors: [], problems: problems.filter((x) => !/first bend|no room for a bend/.test(x)) };
      }
    }
    // where the bundle starts and ends: over the middle of its pins
    const JA = n === 1 ? E[0].la.V : this.snap(centroid(E.map((e) => e.la.V)), needT, boxA) ?? E[0].la.V;
    const JB = n === 1 ? E[0].lb.V : this.snap(centroid(E.map((e) => e.lb.V)), needT, boxB) ?? E[0].lb.V;
    // ---- the trunk, leg by leg: to the wall exit, towards each joint in turn, to the far part
    const trunk: V3[] = [JA], pinned: boolean[] = [true], pierced: [V3, V3][] = [];
    let cur = JA, within: Box | undefined = boxA, tight = false;
    const go = (to: V3, w: Box | undefined, what: string, pin: boolean) => {
      const p = this.connect(cur, to, needT, w);
      if (!p) { problems.push(`${c.key}: no free way ${what} (${cur.map(Math.round)} to ${to.map(Math.round)}${w ? `, inside ${w.min.map(Math.round)}..${w.max.map(Math.round)}` : ""})`); trunk.push(to); pinned.push(pin); cur = to; return; }
      for (let i = 1; i < p.length; i++) { trunk.push(p[i]); pinned.push(pin && i === p.length - 1); if (g.dist(p[i]) < ringNeed) tight = true; }
      cur = to;
    };
    // (`box`: the compartment the hole's inner side is in; `approach`: the box the run to it stays in; `inTo`: where the run
    // goes on to inside, when it is the cable's end)
    const through = (e: ExitAt, outward: boolean, box = outward ? boxA : boxB, approach = outward ? within : undefined, inTo: V3 | undefined = outward ? undefined : JB) => {
      const pr = this.pierce(e, needT, box, 1.6 * Math.max(...E.map((x) => x.R)), level ? (outward ? cur : inTo) : undefined, outward ? undefined : cur);
      if (!pr) { problems.push(`${c.key}: exit ${e.id} is blocked`); return; }
      let [first, second] = outward ? [pr.inner, pr.outer] : [pr.outer, pr.inner];
      // the run already stands on the hole's axis just short of its first point: straight on through from where it is
      // (a hop of a few mm on to that point is a kink no wire can follow)
      const offAxis = (p: V3) => { const v = sub(p, e.at); return len(sub(v, scale(e.n, dot(v, e.n)))); };
      const Rm = Math.max(...E.map((x) => x.R));
      // (within the hole's own opening, less the cable's half width: a USB cut-out or a slot passes a run a little off its axis)
      const inHole = (p: V3) => offAxis(p) < Math.max(2, e.hole_mm / 2 - c.od / 2 - 1);
      if (outward && dist(cur, first) < 1.5 * Rm && inHole(cur) && g.line(cur, second, 1) >= 0) { trunk.push(second); pinned.push(true); pierced.push([cur, second]); cur = second; return; }
      // coming in on the hole's own line, nearer the wall than its outer point (out of one hole straight into the next, a
      // lid under a deck): straight on, not out to that point and back
      if (!outward) { const d = sub(cur, e.at), t = dot(d, e.n); if (t > 0 && t < dot(sub(pr.outer, e.at), e.n) && len(sub(d, scale(e.n, t))) < 1) first = cur; }
      if (first !== cur) go(first, approach, `to exit ${e.id}`, true);
      // coming in, the same for the part's end just inside the hole: straight on to it from outside
      if (!outward && inTo && dist(inTo, second) < 1.5 * Rm && inHole(inTo) && g.line(first, inTo, 1) >= 0) { trunk.push(inTo); pinned.push(true); pierced.push([first, inTo]); cur = inTo; return; }
      trunk.push(second); pinned.push(true); pierced.push([first, second]); cur = second;
    };
    if (c.exitA && !sameBay) { through(c.exitA, true); within = undefined; }
    else if (!sameBay) within = undefined;
    // through a compartment on the way: in at one exit, across inside it, out at another
    for (const v of sameBay ? [] : c.via ?? []) { const box = this.bays.get(v.bay); through(v.enter, false, box, undefined, undefined); through(v.leave, true, box, box); within = undefined; }
    const centres: V3[] = [];
    for (let q = 0; q < c.crossing.length; q++) {
      const j = c.crossing[q], jw = this.f.joint[j.name], cen = scale(jw.p as V3, 1000), ax = unit(jw.axis as V3);
      const target = q + 1 < c.crossing.length ? scale(this.f.joint[c.crossing[q + 1].name].p as V3, 1000) : c.exitB && !sameBay ? c.exitB.at : JB;
      // past the joint a little off its axis, on the side the cable comes from and goes to
      const stand = Math.max(14, c.od * 3 + 8), v = sub(lerp(cur, target, 0.5), cen), r = sub(v, scale(ax, dot(v, ax)));
      const want = len(r) > 1 ? add(cen, scale(unit(r), Math.min(stand, Math.max(len(r) * 0.8, 6)))) : add(cen, scale(perp(ax), stand));
      const pass = this.snap(want, needT) ?? want;
      go(pass, undefined, `to joint ${j.name}`, false); centres.push(cen);
    }
    if (c.exitB && !sameBay) { through(c.exitB, false); within = boxB; }
    else within = sameBay ? boxA : undefined;
    go(JB, within, `to ${c.b}`, true);
    // pull the whole run straight between its fixed points (the passes by the joints are not fixed: only near)
    const T0: V3[] = [];
    for (let i = 0, from = 0; i < trunk.length; i++) if (i > from && pinned[i]) {
      const isPierce = pierced.some(([p1, p2]) => p1 === trunk[from] && p2 === trunk[i]);
      const seg = isPierce ? [trunk[from], trunk[i]] : g.pull(dedupe(trunk.slice(from, i + 1)), tight ? 1 : ringNeed, from === 0 && boxA && (sameBay || c.exitA) ? boxA : undefined);
      T0.push(...(T0.length ? seg.slice(1) : seg)); from = i;
    }
    if (!T0.length) T0.push(...trunk);
    // each joint is crossed where the run comes nearest to it; the cable is anchored a stand-off each side of that point
    const on: string[] = T0.map(() => ga), anchors: CableOut["anchors"] = [];
    { let body = ga, start = 0;
      for (let q = 0; q < c.crossing.length; q++) {
        const j = c.crossing[q], gp = this.groups[j.parent], gc = this.groups[j.child], next = body === gp ? gc : gp, cen = centres[q];
        let bi = -1, bt = 0, bd = Infinity;
        for (let i = Math.max(1, start); i < T0.length; i++) {
          const ab = sub(T0[i], T0[i - 1]), t = Math.max(0, Math.min(1, dot(sub(cen, T0[i - 1]), ab) / (dot(ab, ab) || 1))), d = dist(cen, lerp(T0[i - 1], T0[i], t));
          if (d < bd - 1e-6) { bd = d; bi = i; bt = t; }
        }
        if (bi < 0) { for (let i = start; i < T0.length; i++) on[i] = next; body = next; continue; }
        // the crossing is straight at home: the corners at the ends of its segment are rounded inside one body each, so it
        // keeps clear of them by their tangents (where the segment is long enough), not just where the run comes nearest
        const seg = dist(T0[bi], T0[bi - 1]), e = Math.min(0.5, seg / 4) / (seg || 1);
        // (at the trunk's ends the corner is the one on to the wires' first bends)
        const Va = centroid(E.map((x) => dist(x.la.V, JA) < 1 ? x.la.S : x.la.V)), Vb = centroid(E.map((x) => dist(x.lb.V, JB) < 1 ? x.lb.S : x.lb.V)), at = (k: number) => (k < 0 ? Va : k >= T0.length ? Vb : T0[k]);
        const tanAt = (k: number) => { if (dist(at(k - 1), at(k)) < 0.5 || dist(at(k + 1), at(k)) < 0.5) return 0; const a = unit(sub(at(k), at(k - 1))), b = unit(sub(at(k + 1), at(k))); return 1.1 * Rmax * Math.tan(Math.min(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))), 2.6) / 2); };
        const lo = Math.min(0.5, (tanAt(bi - 1) + 0.5) / (seg || 1)), hi = Math.max(0.5, 1 - (tanAt(bi) + 0.5) / (seg || 1));
        const t = Math.max(e, Math.min(1 - e, Math.max(lo, Math.min(hi, bt))));
        const x0 = lerp(T0[bi - 1], T0[bi], t - e), x1 = lerp(T0[bi - 1], T0[bi], t + e);
        T0.splice(bi, 0, x0, x1); on.splice(bi, 0, body, next);
        for (let i = bi + 1; i < T0.length; i++) on[i] = next;
        const stand = Math.max(14, c.od * 3 + 8), acc = (from: number, dir: 1 | -1) => { let left = stand, p = T0[from]; for (let i = from + dir; i >= 0 && i < T0.length; i += dir) { const d = dist(T0[i], p); if (d >= left) return lerp(p, T0[i], left / d); left -= d; p = T0[i]; } return p; };
        anchors.push({ joint: j.name, aIn: acc(bi, -1), aOut: acc(bi + 1, 1) });
        body = next; start = bi + 2;
      }
    }
    const fixed = new Set<V3>([...pierced.flat()]);
    // ---- each wire: out of its pin, on to its place in the bundle, off again to its pin
    const hole = Math.min(...[c.exitA, c.exitB, ...(c.via ?? []).flatMap((v) => [v.enter, v.leave])].filter((e): e is ExitAt => !!e && !sameBay).map((e) => e.hole_mm), 1e9);
    const T = { pts: T0, on };
    const wires: WireOut[] = E.map((e, k) => {
      const od = wireSize(c.wires[k].awg).od;
      let ring = n > 1 && !tight ? Math.max(od * 0.6, c.od / 2 - od / 2) : 0;
      if (ring && hole < 1e9) ring = Math.max(0, Math.min(ring, hole / 2 - od / 2 - 0.4));
      const tryRing = (r: number, further = true): { pts: V3[]; on: string[] } | null => {
        let Ti = offsetRoute(T.pts, r, (k / Math.max(1, n)) * Math.PI * 2), Ton = T.on;
        // a wire leaves the bundle where it passes nearest its pin's lead-out (a pin behind the bundle's end would have the
        // wire run on past it and turn back): within the last stretch on the same body, clear of the holes it passes
        if (n > 1) for (const end of [0, 1] as const) {
          const V = end ? e.lb.V : e.la.V, idx = (j: number) => (end ? Ti.length - 1 - j : j);
          let bestD = dist(V, Ti[idx(0)]), cut = -1, at: V3 | null = null, run = 0;
          for (let j = 1; j < Ti.length && run < 120; j++) {
            const p0 = Ti[idx(j - 1)], p1 = Ti[idx(j)];
            if (Ton[idx(j)] !== Ton[idx(0)] || fixed.has(T.pts[idx(j)]) || fixed.has(T.pts[idx(j - 1)])) break;
            const ab = sub(p1, p0), tt = Math.max(0, Math.min(1, dot(sub(V, p0), ab) / (dot(ab, ab) || 1))), q = lerp(p0, p1, tt), d = dist(V, q);
            if (d < bestD - 2 && g.line(V, q, 1, end ? boxB : boxA) >= 0) { bestD = d; cut = j; at = q; }
            run += len(ab);
          }
          if (cut > 0 && at) {
            if (end) { Ti = [...Ti.slice(0, Ti.length - cut), at]; Ton = [...Ton.slice(0, Ton.length - cut), Ton[Ton.length - cut]]; }
            else { Ti = [at, ...Ti.slice(cut)]; Ton = [Ton[cut - 1], ...Ton.slice(cut)]; }
          }
        }
        // a wire whose first bend is right by the bundle's end joins it further along its first leg, where a whole bend fits
        // between (else it would turn on to the bundle and along it in less than its radius)
        if (further && n > 1) for (const [V, i0, i1] of [[e.la.V, 0, 1], [e.lb.V, Ti.length - 1, Ti.length - 2]] as [V3, number, number][]) {
          if (Ti.length < 3 || Ton[i0] !== Ton[i1] || dist(V, Ti[i0]) >= 2 * e.R) continue;
          const L = dist(Ti[i0], Ti[i1]);
          for (let t = 1; t < L - 2 * e.R; t += 1) { const q = lerp(Ti[i0], Ti[i1], t / L); if (dist(V, q) >= 2 * e.R && g.line(V, q, 1) >= 0) { Ti[i0] = q; break; } }
        }
        // on to its place in the bundle: straight where that line is free, else round what is in the way
        const join = (V: V3, to: V3, box?: Box) => (g.line(V, to, 1, box) >= 0 ? [V, to] : this.connect(V, to, needW, box));
        const la = n === 1 ? [e.la.V] : join(e.la.V, Ti[0], boxA), lb = n === 1 ? [e.lb.V] : join(e.lb.V, Ti[Ti.length - 1], boxB);
        if (!la || !lb) return null;
        const pts: V3[] = [e.a.p, e.la.S, ...la.slice(0, n === 1 ? 0 : -1), ...Ti, ...lb.slice(0, n === 1 ? 0 : -1).reverse(), e.lb.S, e.b.p];
        const o: string[] = [ga, ga, ...la.slice(0, n === 1 ? 0 : -1).map(() => ga), ...Ton, ...lb.slice(0, n === 1 ? 0 : -1).map(() => gb), gb, gb];
        return { pts, on: o };
      };
      let w = tryRing(ring), bad = w ? this.finishWire(w, e.R, e, pierced, fixed, needW) : null;
      // joining further along is not always the better shape: where the wire still has a tight bend, the plain join is tried
      if (w && bad!.tight && n > 1) { const w3 = tryRing(ring, false), b3 = w3 ? this.finishWire(w3, e.R, e, pierced, fixed, needW) : null; if (w3 && b3!.hits <= bad!.hits && (!b3!.tight || b3!.tight > bad!.tight)) { w = w3; bad = b3; } }
      // its place in the bundle gives it a hit or a bend too tight (a hop beside a hole): it lies on the centreline instead where that is better
      if ((!w || bad!.hits || bad!.tight) && ring) { const w2 = tryRing(0), b2 = w2 ? this.finishWire(w2, e.R, e, pierced, fixed, needW) : null; if (w2 && (!w || b2!.hits < bad!.hits || (b2!.hits === bad!.hits && !b2!.tight && bad!.tight))) { w = w2; bad = b2; } }
      if (!w) { problems.push(`${c.key}: wire ${k + 1} has no free way from its pin to the cable`); const pts = [e.a.p, e.la.S, ...T.pts, e.lb.S, e.b.p].map(r1); return { pts, on: [ga, ga, ...T.on, gb, gb], drawn_mm: polyLen(pts) }; }
      if (bad!.hits) problems.push(`${c.key}: wire ${k + 1} passes ${bad!.hits} mm through a solid (from ${bad!.at})`);
      if (bad!.tight) problems.push(`${c.key}: wire ${k + 1} has a bend of ${bad!.tight.toFixed(1)} mm, under its ${e.R.toFixed(1)} mm`);
      return { pts: bad!.pts, on: bad!.on, drawn_mm: bad!.drawn };
    });
    return { trunk: T.pts.map(r1), trunkOn: T.on, wires, anchors, problems };
  }

  /**
   * Round a wire's corners and test the rounded line: returns the corner points as stored (0.1 mm), how many mm of it
   * are inside something and its tightest bend if one is under the radius.
   */
  private finishWire(w: { pts: V3[]; on: string[] }, R: number, e: { a: { id: number; kind: PinAt["kind"] }; b: { id: number; kind: PinAt["kind"] } }, pierced: [V3, V3][], fixed: Set<V3>, need: number): { pts: V3[]; on: string[]; hits: number; tight: number; drawn: number; at: string } {
    const g = this.grid;
    // pull the wire straight between the points it must keep: its lead-outs, the holes it passes, the places it changes body
    const keep = w.pts.map((p, i) => i <= 2 || i >= w.pts.length - 3 || fixed.has(p) || (i > 0 && w.on[i] !== w.on[i - 1]) || (i + 1 < w.pts.length && w.on[i] !== w.on[i + 1]) || pierced.some(([a, b]) => dist(p, a) < 4 || dist(p, b) < 4));
    const pulled: V3[] = [], pon: string[] = [];
    for (let i = 0, from = 0; i < w.pts.length; i++) if (i > from && keep[i]) {
      const run = w.pts.slice(from, i + 1), same = w.on[from] === w.on[i];
      let seg = run;
      // the runs at the two ends start in the tight space by a connector: pulled at the wire's own width
      if (same && run.length > 2) { const end = from <= 2 || i >= w.pts.length - 3; seg = g.pull(dedupe(run), end ? 1 : need); if (!end && seg.length >= run.length) seg = g.pull(dedupe(run), 1); }
      for (let k = pulled.length ? 1 : 0; k < seg.length; k++) { pulled.push(seg[k]); pon.push(k === seg.length - 1 ? w.on[i] : w.on[from]); }
      from = i;
    }
    // a point that leaves a leg too short to round (a hop on to the bundle beside a connector) goes, where the line past it is clear
    for (let changed = true, passes = 0; changed && passes < 4 * pulled.length; passes++) {
      changed = false;
      for (let i = 3; i < pulled.length - 3; i++) {
        if (pon[i - 1] !== pon[i] || pon[i + 1] !== pon[i] || pierced.some(([a, b]) => dist(pulled[i], a) < 4 || dist(pulled[i], b) < 4)) continue;
        // too short: under 1.3 radii, or not holding the tangents of the two corners at its ends
        const tg = (q: number) => { if (q <= 0 || q >= pulled.length - 1) return 0; const a = unit(sub(pulled[q], pulled[q - 1])), b = unit(sub(pulled[q + 1], pulled[q])); return 1.03 * R * Math.tan(Math.min(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))), 2.6) / 2); };
        const short = dist(pulled[i], pulled[i - 1]) < tg(i) + tg(i - 1) || dist(pulled[i], pulled[i + 1]) < tg(i) + tg(i + 1);
        if (!short && Math.min(dist(pulled[i], pulled[i - 1]), dist(pulled[i], pulled[i + 1])) > 1.3 * R) continue;
        if (g.line(pulled[i - 1], pulled[i + 1], 1) >= 0) { pulled.splice(i, 1); pon.splice(i, 1); changed = true; i--; continue; }
        // beside a lead-out: join the run further back instead, where the line to the lead-out is clear
        const first = i === 3, last = i === pulled.length - 4;
        if (!first && !last) continue;
        const V = pulled[first ? i - 1 : i + 1], far = pulled[first ? i + 1 : i - 1], leg = dist(pulled[i], far);
        let moved = false;
        for (const back of [4 * R, 6 * R, 2.5 * R]) {
          if (back > leg * 0.8) continue;
          const q = lerp(pulled[i], far, back / leg);
          if (g.line(V, q, 1) >= 0 && dist(V, q) > Math.max(1.3 * R, dist(V, pulled[i]) + 0.5)) { pulled[i] = q; changed = moved = true; break; }
        }
        // or straight on out of the connector a little further, and turn there for the run
        if (!moved) {
          const S = pulled[first ? i - 2 : i + 2], dir = unit(sub(V, S));
          for (const k of [2.5 * R, 4 * R, 6 * R]) { const q = add(V, scale(dir, k)); if (dist(q, pulled[i]) > 0.5 && g.at(q) === 0 && g.line(V, q, 1) >= 0 && g.line(q, far, 1) >= 0) { pulled[i] = r1(q); changed = true; break; } }
        }
      }
    }
    let P = dedupeOn(pulled.map(r1), pon);
    P = this.soften(P, R);
    // a part's own body is let off over the wire's first 25 mm, or over its connector where that runs on up out of the
    // part's box (a header among taller components) and a cell for the grid's rounding
    const endA = Math.max(25, dist(w.pts[0], w.pts[1]) + g.s), endB = Math.max(25, dist(w.pts[w.pts.length - 1], w.pts[w.pts.length - 2]) + g.s);
    const test = (Q: { pts: V3[]; on: string[] }) => {
      const F = roundWire(Q.pts, Q.on, R), L = polyLen(F.pts);
      let hits = 0, along = 0, at: V3 | null = null;
      for (let i = 1; i < F.pts.length; i++) {
        const seg = dist(F.pts[i], F.pts[i - 1]), m = Math.max(1, Math.ceil(seg));
        for (let q = 0; q < m; q++) {
          const p = lerp(F.pts[i - 1], F.pts[i], (q + 0.5) / m), d = along + (seg * (q + 0.5)) / m, o = g.at(p);
          // the first 2 mm are the pin itself, standing in what it plugs into (a jumper in a breadboard's tie point): leadOut tests the connector from there on
          if (!o || d < 2 || d > L - 2 || (d < endA && o === e.a.id) || (d > L - endB && o === e.b.id)) continue;
          if (pierced.some(([a, b]) => { const ab = sub(b, a), t = dot(sub(p, a), ab) / (dot(ab, ab) || 1); return t > -0.05 && t < 1.05 && dist(p, lerp(a, b, Math.max(0, Math.min(1, t)))) < 3.5; })) continue;
          hits += seg / m; at ??= p;
        }
        along += seg;
      }
      return { hits: Math.round(hits), tight: F.tight, drawn: L, F, at };
    };
    let best = test(P);
    // a leg too short for the corners at its two ends: drop one of them, or meet the legs beyond in one corner, where the
    // straight lines that leaves are clear; kept when the tightest bend gets wider and nothing more is hit
    const fixedAt = (Q: { pts: V3[] }, k: number) => k <= 2 || k >= Q.pts.length - 3 || fixed.has(Q.pts[k]) || pierced.some(([a, b]) => dist(Q.pts[k], a) < 4 || dist(Q.pts[k], b) < 4);
    for (let pass = 0; pass < 10 && best.tight; pass++) {
      const Q = P.pts, O = P.on, n = Q.length, wantAt = (k: number) => { if (k <= 0 || k >= n - 1 || O[k - 1] !== O[k] || O[k + 1] !== O[k]) return 0; const a = unit(sub(Q[k - 1], Q[k])), c = unit(sub(Q[k + 1], Q[k])), th = Math.acos(Math.max(-1, Math.min(1, dot(a, c)))); return th > Math.PI - 0.02 ? 0 : (R * 1.02) / Math.tan(th / 2); };
      const bad: [number, number][] = [];
      for (let k = 0; k + 1 < n; k++) { const need = wantAt(k) + wantAt(k + 1); if (need > 0) { const r = (dist(Q[k], Q[k + 1]) * 0.98) / need; if (r < 1) bad.push([k, r]); } }
      bad.sort((x, y) => x[1] - y[1]);
      let took = false;
      for (const [k] of bad) {
        const cands: { pts: V3[]; on: string[] }[] = [];
        for (const q of [k, k + 1]) if (!fixedAt(P, q) && O[q - 1] === O[q] && O[q + 1] === O[q] && g.line(Q[q - 1], Q[q + 1], 1) >= 0) cands.push({ pts: Q.filter((_, j) => j !== q), on: O.filter((_, j) => j !== q) });
        if (k >= 1 && k + 2 < n && !fixedAt(P, k) && !fixedAt(P, k + 1) && O[k - 1] === O[k] && O[k + 2] === O[k]) {
          // the nearest points of the two outer legs' lines
          const d1 = unit(sub(Q[k], Q[k - 1])), d2 = unit(sub(Q[k + 1], Q[k + 2])), w0 = sub(Q[k - 1], Q[k + 2]), bb = dot(d1, d2), den = 1 - bb * bb;
          if (den > 1e-3) { const s1 = (bb * dot(d2, w0) - dot(d1, w0)) / den, s2 = (dot(d2, w0) - bb * dot(d1, w0)) / den;
            if (s1 > 0 && s2 > 0) { const m = r1(lerp(add(Q[k - 1], scale(d1, s1)), add(Q[k + 2], scale(d2, s2)), 0.5)); if (g.line(Q[k - 1], m, 1) >= 0 && g.line(m, Q[k + 2], 1) >= 0) cands.push({ pts: [...Q.slice(0, k), m, ...Q.slice(k + 2)], on: [...O.slice(0, k), O[k], ...O.slice(k + 2)] }); } }
        }
        // the turn at a lead-out's end is over a right angle: the point after it moves out of the way back along the lead
        for (const [v, sIdx, nx] of [[2, 1, 3], [n - 3, n - 2, n - 4]] as const) {
          if (nx <= 2 || nx >= n - 3 || (k !== Math.min(v, nx) && k + 1 !== v) || fixedAt(P, nx) || O[nx] !== O[v]) continue;
          const dir = unit(sub(Q[v], Q[sIdx])), back = dot(sub(Q[nx], Q[v]), dir);
          // or the leg from the lead-out on is too short for its two corners: the point goes further out along that leg
          { const L0 = dist(Q[v], Q[nx]), need = ((wantAt(v) + wantAt(nx)) / 0.98) + 0.5;
            if (L0 > 0.5 && need > L0 && need < 3 * L0 + 30) { const m = r1(add(Q[v], scale(sub(Q[nx], Q[v]), need / L0))); if (g.at(m) === 0 && g.line(Q[v], m, 1) >= 0 && g.line(m, Q[nx + (nx > v ? 1 : -1)], 1) >= 0) cands.push({ pts: Q.map((p, j) => (j === nx ? m : p)), on: O }); } }
          if (back >= 0) continue;
          const m = r1(add(Q[nx], scale(dir, -back + 0.5)));
          if (g.at(m) === 0 && g.line(Q[v], m, 1) >= 0 && g.line(m, Q[nx + (nx > v ? 1 : -1)], 1) >= 0) cands.push({ pts: Q.map((p, j) => (j === nx ? m : p)), on: O });
        }
        // the two lead-outs face away from each other close by (a short wire between neighbours): both run on further
        // before the wire turns, which opens the loop between them
        if (k === 2 && k + 1 === n - 3 && O[2] === O[3]) for (const ext of [R, 2 * R]) {
          const da = unit(sub(Q[2], Q[1])), db = unit(sub(Q[3], Q[4])), ma = r1(add(Q[2], scale(da, ext))), mb = r1(add(Q[3], scale(db, ext)));
          if (g.at(ma) === 0 && g.at(mb) === 0 && g.line(Q[2], ma, 1) >= 0 && g.line(ma, mb, 1) >= 0 && g.line(mb, Q[3], 1) >= 0) cands.push({ pts: [...Q.slice(0, 3), ma, mb, ...Q.slice(3)], on: [...O.slice(0, 3), O[2], O[3], ...O.slice(3)] });
        }
        for (const c of cands) { const t = test(c); if (t.hits <= best.hits && (!t.tight || t.tight > best.tight + 0.05)) { best = t; P = c; took = true; break; } }
        if (took) break;
      }
      if (!took) break;
    }
    // a rounded corner that cuts into a solid: move the corner out by what the rounding took off, and test again
    for (let pass = 0; pass < 3 && best.hits; pass++) {
      const Q = { pts: P.pts.map((p) => [...p] as V3), on: P.on }; let moved = false;
      for (let i = 2; i < Q.pts.length - 2; i++) {
        const a = unit(sub(P.pts[i - 1], P.pts[i])), b = unit(sub(P.pts[i + 1], P.pts[i])), th = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
        if (th > Math.PI - 0.1) continue;
        const bis = unit(add(a, b)), dev = R * (1 / Math.sin(th / 2) - 1), mid = add(P.pts[i], scale(bis, dev));
        if (!g.at(mid) && !g.at(add(P.pts[i], scale(bis, dev / 2)))) continue;
        const q = r1(add(P.pts[i], scale(bis, -Math.min(dev + 0.5, 6))));
        if (g.line(Q.pts[i - 1], q, 1) >= 0 && g.line(q, P.pts[i + 1], 1) >= 0) { Q.pts[i] = q; moved = true; }
      }
      if (!moved) break;
      const t = test(Q); if (t.hits < best.hits) { best = t; P = Q; } else break;
    }
    return { pts: P.pts, on: P.on, hits: best.hits, tight: best.tight, drawn: best.drawn, at: best.at ? `${best.at.map(Math.round)}, ${this.nameAt(best.at)}` : "" };
  }
  /**
   * A corner that turns back on itself cannot be rounded to the bend radius inside its legs. Where there is room, it is
   * opened into two gentler corners: cut across (both legs long enough), or a step sideways out of a connector.
   */
  private soften(P: { pts: V3[]; on: string[] }, R: number): { pts: V3[]; on: string[] } {
    const g = this.grid, pts = P.pts.slice(), on = P.on.slice();
    for (let i = 1; i < pts.length - 1; i++) {
      if (on[i - 1] !== on[i] || on[i + 1] !== on[i]) continue;
      const A = pts[i - 1], B = pts[i], C = pts[i + 1], u = unit(sub(A, B)), v = unit(sub(C, B)), la = dist(A, B), lc = dist(B, C);
      if (la < 0.3 || lc < 0.3 || dot(u, v) < 0.2) continue;   // turns of up to about 100 degrees round as they are
      const rigid = i === 2 || i === pts.length - 3;   // the leg behind it is the connector's lead-out
      // the cut leaves two corners of half the turn each: the chord between them must hold both their tangents, and each leg
      // what is left for its new corner and for the corner at its far end (half the leg, or all but the tangents if that is more);
      // the tangents are taken a little long, as the drawn arcs are (roundWire) and for the 0.1 mm the stored corners are rounded to
      const turn = Math.acos(Math.max(-1, Math.min(1, -dot(u, v)))), Rf = R * 1.06, t4 = Rf * Math.tan(turn / 4), want = (1.03 * t4) / Math.max(0.05, Math.cos(turn / 2));
      const tangent = (k: number) => { if (k <= 0 || k >= pts.length - 1) return 0; const a = unit(sub(pts[k], pts[k - 1])), b = unit(sub(pts[k + 1], pts[k])); return Rf * Math.tan(Math.min(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))), 2.6) / 2); };
      const cut = Math.min(Math.max(2.2 * R, want), Math.max(la / 2, la - tangent(i - 1) - t4), Math.max(lc / 2, lc - tangent(i + 1) - t4));
      if (!rigid && cut >= R) {
        const p1 = r1(add(B, scale(u, cut))), p2 = r1(add(B, scale(v, cut)));
        if (g.line(p1, p2, 1) >= 0) { pts.splice(i, 1, p1, p2); on.splice(i, 1, on[i], on[i]); i++; continue; }
      }
      // sideways: a step square to the way it came (two radii and a little: its two corners, each a little over a right
      // angle, round fully), then on
      const fixed = i === 2 ? u : i === pts.length - 3 ? v : u, other = fixed === u ? v : u, far = fixed === u ? C : A;
      let w = sub(other, scale(fixed, dot(other, fixed)));
      const cands: V3[] = len(w) > 0.05 ? [unit(w)] : [];
      const p0 = perp(fixed); cands.push(p0, scale(p0, -1), cross(fixed, p0), scale(cross(fixed, p0), -1));
      for (const dir of cands) {
        w = dir; const q = r1(add(B, scale(w, 2.3 * R)));
        if (g.line(B, q, 1) < 0 || g.line(q, far, 1) < 0) continue;
        if (dot(unit(sub(far, q)), scale(w, -1)) > 0.2) continue;
        if (fixed === u) { pts.splice(i + 1, 0, q); on.splice(i + 1, 0, on[i]); } else { pts.splice(i, 0, q); on.splice(i, 0, on[i]); }
        // the point it was going to, now just past the step, goes where the line past it is clear (else two corners crowd)
        const at = fixed === u ? i + 2 : i - 1, past = fixed === u ? i + 3 : i - 2, qi = fixed === u ? i + 1 : i;
        if (past > 0 && past < pts.length - 1 && on[at] === on[qi] && on[past] === on[qi] && dist(pts[at], q) < 2 * R && g.line(q, pts[past], 1) >= 0) { pts.splice(at, 1); on.splice(at, 1); if (at < qi) i--; }
        i++; break;
      }
    }
    return { pts, on };
  }
}

/** drop points that repeat the one before (same place, same body) */
function dedupe(pts: V3[]): V3[] { const out: V3[] = []; for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > 0.25) out.push(p); return out; }
function dedupeOn(pts: V3[], on: string[]): { pts: V3[]; on: string[] } {
  const P: V3[] = [], O: string[] = [];
  pts.forEach((p, i) => { if (!P.length || dist(P[P.length - 1], p) > 0.25 || O[O.length - 1] !== on[i]) { P.push(p); O.push(on[i]); } });
  return { pts: P, on: O };
}
/** a wire's place in its bundle: offset from the cable centreline by `r` at angle `ang` round the local direction */
export function offsetRoute(pts: V3[], r: number, ang: number): V3[] {
  if (!r || pts.length < 2) return pts;
  return pts.map((p, i) => {
    const d = unit(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    const u = Math.abs(d[2]) < 0.9 ? unit(cross(d, [0, 0, 1])) : unit(cross(d, [1, 0, 0])), v = cross(d, u);
    return add(p, add(scale(u, Math.cos(ang) * r), scale(v, Math.sin(ang) * r)));
  });
}
/**
 * The drawn wire from its stored corners: every corner inside one body rounded to the bend radius (the stretch across a
 * joint is straight at the home pose). `tight` is the smallest radius a corner got when its legs were too short, else 0.
 */
export function roundWire(pts: V3[], on: string[], R: number): { pts: V3[]; on: string[]; tight: number } {
  const F = fillet(pts, on, R * 1.02);
  let tight = 0;
  for (const r of F.radii) if (r < R * 0.99 && (!tight || r < tight)) tight = r;
  return { pts: F.pts, on: F.body, tight };
}
