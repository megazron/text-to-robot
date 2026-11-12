// Circuit solver for the electrical simulation: Modified Nodal Analysis with my own elements, no dependencies.
//
// Why not ngspice in WebAssembly (checked 2026-11-10):
// * Licence. ngspice is Modified BSD for most files, but its COPYING lists exceptions that end up in every build:
//   src/frontend/numparam is LGPLv2 or newer, src/maths/KLU is LGPLv2, src/xspice/icm/table is GPLv2 or newer and
//   src/osdi is MPL 2.0. A WebAssembly build links all of it into one binary, so shipping it from this MIT site would
//   bring the LGPL relinking duty for a blob nobody can relink in a browser.
// * Size. The maintained build, eecircuit-engine 1.9.0 on npm (MIT wrapper around ngspice), is one 20.3 MB module
//   with the binary inlined (43 MB unpacked with its device models), and it would be this repository's first runtime
//   dependency that I cannot read or rebuild here.
// * CSP and workers are not the obstacle: its glue has no eval, the site's engine worker is a same-origin file, and a
//   page that embeds the engine already allows 'unsafe-eval' for the CAD kernels, which covers compiling WebAssembly.
// * Fit. These circuits are resistive networks with behavioural parts (constant-power converters, current limits,
//   fuses, a battery that depends on charge). SPICE has none of them built in: each would be a B-source deck that I
//   generate, parse back and still have to test. A robot's harness is under a few hundred nodes, so a dense solver
//   written for exactly these parts is a few hundred lines and every number in it can be traced.
//
// The solver. Unknowns are the node voltages (node 0 is the reference) and one current per voltage source and per
// regulator output. Every element adds its currents to Kirchhoff's current law at its nodes and its own equation where
// it has one, with the exact derivative, and Newton's method solves F(x) = 0: dense LU with partial pivoting, a
// backtracking line search on the residual (the damping), a first pass with the loads removed to start from the
// no-load voltages (the upper branch of a constant-power load), and source stepping if that fails. Piecewise-linear
// parts (diode, current limits, dropout, a load that cannot draw its current) are continuous functions, so Newton
// lands on the right piece instead of guessing states. When it does not settle, `dc` says so and returns no numbers.
// A conductance of 1e-12 S from every node to the reference keeps a part cut off by an open wire or a blown fuse at
// a defined 0 V; its error is under a picoampere per volt.
//
// Transient: capacitors by the trapezoidal rule (or backward Euler), started from the operating point or from given
// initial voltages; fuses heat by a damage sum against their time-current curve and open when it reaches one.
//
// Units: volts, amperes, ohms, farads, seconds, watts.

/** A value that may change in time (a fault applied at t). The operating point is taken at t = Infinity. */
export type Tv<T> = T | ((t: number) => T);
const tv = <T>(p: Tv<T>, t: number): T => (typeof p === "function" ? (p as (t: number) => T)(t) : p);

export interface Ctx { mode: "dc" | "ic" | "tran"; t: number; dt: number; method: "trap" | "be"; scale: number; noLoad: boolean; }
const GMIN = 1e-12;
/** conductance that holds a capacitor at its initial voltage while the starting currents are solved */
const G_IC = 1e6;

class Stamp {
  n: number; f: Float64Array; J: Float64Array; mag = 0;
  constructor(n: number) { this.n = n; this.f = new Float64Array(n); this.J = new Float64Array(n * n); }
  clear() { this.f.fill(0); this.J.fill(0); this.mag = 0; }
  F(i: number, v: number) { if (i >= 0) { this.f[i] += v; const a = Math.abs(v); if (a > this.mag) this.mag = a; } }
  D(i: number, j: number, v: number) { if (i >= 0 && j >= 0) this.J[i * this.n + j] += v; }
  /** a current i from a to b with di/d(va - vb) = g */
  two(a: number, b: number, i: number, g: number) { this.F(a, i); this.F(b, -i); this.D(a, a, g); this.D(a, b, -g); this.D(b, a, -g); this.D(b, b, g); }
}
const V = (x: Float64Array, node: number) => (node === 0 ? 0 : x[node - 1]);

export abstract class Element {
  name: string; kind: string; nodes: number[];
  /** index of this element's own unknown (a source or regulator current), -1 when it has none */
  br = -1; nbr = 0;
  constructor(kind: string, name: string, nodes: number[]) { this.kind = kind; this.name = name; this.nodes = nodes; }
  abstract load(x: Float64Array, s: Stamp, c: Ctx): void;
  /** current flowing into the element at each of its nodes */
  abstract terminal(x: Float64Array, c: Ctx): number[];
  /** current from the first node to the second through the element */
  current(x: Float64Array, c: Ctx) { return this.terminal(x, c)[0]; }
  /** voltage from the first node to the second */
  volts(x: Float64Array) { return V(x, this.nodes[0]) - V(x, this.nodes[1]); }
  /** power the element takes from the circuit (negative for a source that delivers) */
  absorbed(x: Float64Array, c: Ctx) { const t = this.terminal(x, c); let p = 0; for (let k = 0; k < t.length; k++) p += t[k] * V(x, this.nodes[k]); return p; }
  /** which piece of its characteristic the element is on */
  state(_x: Float64Array, _c: Ctx): string { return ""; }
  accept(_x: Float64Array, _c: Ctx): void {}
  reset(): void {}
}

abstract class TwoTerminal extends Element {
  /** current a to b and its derivative to the voltage a - b */
  abstract iv(v: number, c: Ctx): [number, number];
  load(x: Float64Array, s: Stamp, c: Ctx) { const [i, g] = this.iv(this.volts(x), c); if (i !== 0 || g !== 0) s.two(this.nodes[0] - 1, this.nodes[1] - 1, i, g); }
  terminal(x: Float64Array, c: Ctx) { const i = this.iv(this.volts(x), c)[0]; return [i, -i]; }
}

export class Resistor extends TwoTerminal {
  ohm: number; open: Tv<boolean>;
  constructor(name: string, a: number, b: number, ohm: number, open: Tv<boolean> = false, kind = "resistor") { super(kind, name, [a, b]); if (!(ohm > 0)) throw new Error(`${name}: a resistor needs a positive resistance, got ${ohm}`); this.ohm = ohm; this.open = open; }
  isOpen(c: Ctx) { return tv(this.open, c.t); }
  iv(v: number, c: Ctx): [number, number] { return this.isOpen(c) ? [0, 0] : [v / this.ohm, 1 / this.ohm]; }
  state(_x: Float64Array, c: Ctx) { return this.isOpen(c) ? "open" : "closed"; }
}

/** A switch: `ohm` when closed, nothing when open. */
export class Switch extends Resistor {
  constructor(name: string, a: number, b: number, closed: Tv<boolean>, ohm: number) { super(name, a, b, ohm, typeof closed === "function" ? (t: number) => !closed(t) : !closed, "switch"); }
}

/** Opening time of a fuse against the multiple of its rating: the gates of its datasheet, least and most. */
export interface FuseCurve { hold: number; gates: { m: number; min_s: number; max_s: number }[]; }
/** The window a fuse opens in at `m` times its rating, null when the curve does not promise that it opens. */
export function fuseWindow(curve: FuseCurve, m: number): [number, number] | null {
  const g = curve.gates;
  if (!(m >= g[0].m)) return null;
  const last = g[g.length - 1];
  // past the last gate the element heats before it can shed anything: constant I^2 t
  if (m >= last.m) { const k = (last.m / m) ** 2; return [last.min_s * k, last.max_s * k]; }
  let k = 0; while (m >= g[k + 1].m) k++;
  const u = Math.log(m / g[k].m) / Math.log(g[k + 1].m / g[k].m), mix = (a: number, b: number) => Math.exp(Math.log(a) + u * (Math.log(b) - Math.log(a)));
  return [mix(g[k].min_s, g[k + 1].min_s), mix(g[k].max_s, g[k + 1].max_s)];
}
/**
 * A fuse: a resistor that opens. Rule: under the first gate of its curve (135 % for a blade fuse) it is not promised to
 * open and stays closed; from there it opens inside the window the datasheet gives for that overload. The operating
 * point treats such a fuse as open (the settled state). In a transient the fuse heats by the damage sum of dt / T(I),
 * with T the geometric mean of the window, and opens when the sum reaches one.
 */
export class Fuse extends Resistor {
  rating: number; curve: FuseCurve; blown = false; damage = 0; blown_at: number | null = null;
  constructor(name: string, a: number, b: number, rating: number, ohm: number, curve: FuseCurve) { super(name, a, b, ohm, false, "fuse"); this.rating = rating; this.curve = curve; }
  isOpen() { return this.blown; }
  window(amps: number) { return fuseWindow(this.curve, Math.abs(amps) / this.rating); }
  accept(x: Float64Array, c: Ctx) {
    if (c.mode !== "tran" || this.blown) return;
    const w = this.window(this.current(x, c)); if (!w) return;
    this.damage += c.dt / Math.sqrt(w[0] * w[1]);
    if (this.damage >= 1) { this.blown = true; this.blown_at = c.t; }
  }
  reset() { this.blown = false; this.damage = 0; this.blown_at = null; }
}

/**
 * A voltage source with series resistance: v(p) - v(n) = volts - ohm x i. With `i_max` it turns into a current source
 * at that current when the load asks for more (a supply in current limit).
 */
export class VSource extends Element {
  volts_: Tv<number>; ohm: number; i_max: number;
  constructor(name: string, p: number, n: number, volts: Tv<number>, ohm = 0, i_max = Infinity, kind = "vsource") { super(kind, name, [p, n]); this.nbr = 1; this.volts_ = volts; this.ohm = ohm; this.i_max = i_max; }
  emf(c: Ctx) { return tv(this.volts_, c.t) * c.scale; }
  /** conductance that weighs volts against amperes in the limit test: half the limit at the full voltage */
  private rho(c: Ctx) { return this.i_max / (2 * Math.max(Math.abs(this.emf(c)), 1e-3)); }
  /** in limit when the current the voltage equation asks for is past i_max (the projection form of "v = emf or i = i_max") */
  private limited(x: Float64Array, c: Ctx) { const i = x[this.br]; return Number.isFinite(this.i_max) && i + this.rho(c) * (this.emf(c) - this.volts(x) - this.ohm * i) > this.i_max; }
  load(x: Float64Array, s: Stamp, c: Ctx) {
    const p = this.nodes[0] - 1, n = this.nodes[1] - 1, k = this.br, i = x[k];
    s.F(p, -i); s.F(n, i); s.D(p, k, -1); s.D(n, k, 1);
    if (this.limited(x, c)) { s.F(k, this.i_max - i); s.D(k, k, -1); }
    else { s.F(k, this.emf(c) - this.volts(x) - this.ohm * i); s.D(k, p, -1); s.D(k, n, 1); s.D(k, k, -this.ohm); }
  }
  /** current out of the positive terminal */
  current(x: Float64Array) { return x[this.br]; }
  terminal(x: Float64Array) { const i = x[this.br]; return [-i, i]; }
  state(x: Float64Array, c: Ctx) { return this.limited(x, c) ? "limit" : "voltage"; }
  /** power lost in the series resistance */
  heat(x: Float64Array) { return this.ohm * x[this.br] ** 2; }
}

/** A current source: `amps` flows from node a through the source into node b. */
export class ISource extends Element {
  amps: Tv<number>;
  constructor(name: string, a: number, b: number, amps: Tv<number>) { super("isource", name, [a, b]); this.amps = amps; }
  load(x: Float64Array, s: Stamp, c: Ctx) { const i = tv(this.amps, c.t) * c.scale; s.F(this.nodes[0] - 1, i); s.F(this.nodes[1] - 1, -i); }
  terminal(_x: Float64Array, c: Ctx) { const i = tv(this.amps, c.t) * c.scale; return [i, -i]; }
}

/** A capacitor: open at the operating point; trapezoidal or backward Euler in a transient. */
export class Capacitor extends TwoTerminal {
  farad: number; ic: number | undefined; vp = 0; ip = 0;
  constructor(name: string, a: number, b: number, farad: number, ic?: number) { super("capacitor", name, [a, b]); this.farad = farad; this.ic = ic; }
  iv(v: number, c: Ctx): [number, number] {
    if (c.mode === "dc") return [0, 0];
    if (c.mode === "ic") return this.ic === undefined ? [0, 0] : [G_IC * (v - this.ic), G_IC];
    if (c.method === "be") { const g = this.farad / c.dt; return [g * (v - this.vp), g]; }
    const g = (2 * this.farad) / c.dt; return [g * (v - this.vp) - this.ip, g];
  }
  accept(x: Float64Array, c: Ctx) { const v = this.volts(x), i = this.iv(v, c)[0]; this.vp = c.mode === "ic" && this.ic !== undefined ? this.ic : v; this.ip = i; }
  reset() { this.vp = 0; this.ip = 0; }
}

/** A diode, piecewise linear: nothing below `vf`, then `r_on`. An ideal diode is vf = 0 with a small r_on. */
export class Diode extends TwoTerminal {
  vf: number; r_on: number;
  constructor(name: string, anode: number, cathode: number, vf: number, r_on: number, kind = "diode") { super(kind, name, [anode, cathode]); this.vf = vf; this.r_on = r_on; }
  iv(v: number): [number, number] { return v > this.vf ? [(v - this.vf) / this.r_on, 1 / this.r_on] : [0, 0]; }
  state(x: Float64Array) { return this.volts(x) > this.vf ? "on" : "off"; }
}

/**
 * A load that draws a set current while its voltage allows: `amps` above `v_knee`, and below it the current falls in
 * proportion to the voltage (a browned-out part does not keep drawing its full current from nothing).
 */
export class CurrentLoad extends TwoTerminal {
  amps: Tv<number>; v_knee: number;
  constructor(name: string, a: number, b: number, amps: Tv<number>, v_knee: number) { super("load_current", name, [a, b]); if (!(v_knee > 0)) throw new Error(`${name}: v_knee must be positive`); this.amps = amps; this.v_knee = v_knee; }
  iv(v: number, c: Ctx): [number, number] { if (c.noLoad) return [0, 0]; const I = tv(this.amps, c.t); return v >= this.v_knee ? [I, 0] : [(I * v) / this.v_knee, I / this.v_knee]; }
  state(x: Float64Array) { return this.volts(x) >= this.v_knee ? "current" : "starved"; }
}

/** A constant-power load (the input of a switching converter): i = P / v, and resistive below `v_min`. */
export class PowerLoad extends TwoTerminal {
  watts: Tv<number>; v_min: number;
  constructor(name: string, a: number, b: number, watts: Tv<number>, v_min: number) { super("load_power", name, [a, b]); if (!(v_min > 0)) throw new Error(`${name}: v_min must be positive`); this.watts = watts; this.v_min = v_min; }
  iv(v: number, c: Ctx): [number, number] { if (c.noLoad) return [0, 0]; const P = tv(this.watts, c.t); return v >= this.v_min ? [P / v, -P / (v * v)] : [(P * v) / this.v_min ** 2, P / this.v_min ** 2]; }
  state(x: Float64Array) { return this.volts(x) >= this.v_min ? "power" : "starved"; }
}

/**
 * A DC motor: v = ohm x i + k x omega. `ohm` is the winding resistance (rated voltage over stall current), `k` the
 * back-EMF constant in V per rad/s. Either the speed is given (`omega`), or the load is: the motor then draws
 * `load_a` (current is torque) and turns at the speed its voltage leaves, until the voltage cannot push that current
 * through the winding and it stops. `stalled` locks the rotor: omega = 0, i = v / ohm.
 */
export class Motor extends TwoTerminal {
  ohm: number; k: number; load_a: Tv<number>; stalled: Tv<boolean>; omega: number | undefined;
  constructor(name: string, a: number, b: number, o: { ohm: number; k: number; load_a?: Tv<number>; stalled?: Tv<boolean>; omega?: number }) { super("motor", name, [a, b]); this.ohm = o.ohm; this.k = o.k; this.load_a = o.load_a ?? 0; this.stalled = o.stalled ?? false; this.omega = o.omega; }
  isStalled(v: number, c: Ctx) { return tv(this.stalled, c.t) || (this.omega === undefined && v < tv(this.load_a, c.t) * this.ohm); }
  iv(v: number, c: Ctx): [number, number] {
    if (c.noLoad) return [0, 0];
    if (tv(this.stalled, c.t)) return [v / this.ohm, 1 / this.ohm];
    if (this.omega !== undefined) return [(v - this.k * this.omega) / this.ohm, 1 / this.ohm];
    const I = tv(this.load_a, c.t);
    return v >= I * this.ohm ? [I, 0] : [v / this.ohm, 1 / this.ohm];
  }
  /** shaft speed in rad/s */
  speed(x: Float64Array, c: Ctx) { const v = this.volts(x); if (this.isStalled(v, c)) return 0; return this.omega ?? (v - tv(this.load_a, c.t) * this.ohm) / this.k; }
  /** winding heat; the rest of the power it takes is mechanical */
  heat(x: Float64Array, c: Ctx) { return this.ohm * this.current(x, c) ** 2; }
  state(x: Float64Array, c: Ctx) { return this.isStalled(this.volts(x), c) ? "stalled" : "running"; }
}

export interface RegulatorSpec {
  type: "linear" | "buck";
  /** set output voltage */
  vout: number;
  /** least input minus output it regulates with; under that the output follows the input minus this */
  dropout: number;
  /** output current limit: at the limit the output turns into a current source and its voltage falls */
  i_limit: number;
  /** buck: output power over input power */
  efficiency?: number;
  /** buck: input voltage under which it stops (ramped over `uvlo_band` so the equations stay continuous) */
  uvlo?: number; uvlo_band?: number;
}
/**
 * A regulator on three nodes (in, out, ground). Its unknown is the output current i >= 0. One equation picks the
 * piece: out = target (regulating, or in dropout where the target is in - dropout), i = i_limit (current limit), or
 * i = 0 (output held above the target by something else). Input current: a linear regulator passes its output
 * current; a buck takes vout x i / (efficiency x vin), the constant-power input that draws more as its input sags.
 */
export class Regulator extends Element {
  spec: RegulatorSpec;
  constructor(name: string, vin: number, vout: number, gnd: number, spec: RegulatorSpec) {
    super(spec.type === "buck" ? "regulator_buck" : "regulator_linear", name, [vin, vout, gnd]); this.nbr = 1; this.spec = spec;
    if (spec.type === "buck" && !(spec.efficiency! > 0 && spec.efficiency! <= 1)) throw new Error(`${name}: a buck needs an efficiency in (0, 1]`);
  }
  private vi(x: Float64Array) { return V(x, this.nodes[0]) - V(x, this.nodes[2]); }
  private vo(x: Float64Array) { return V(x, this.nodes[1]) - V(x, this.nodes[2]); }
  /** target output and its derivative to the input voltage */
  target(vi: number, c: Ctx): [number, number] {
    const s = this.spec, set = s.vout * c.scale;
    if (c.noLoad) return [set, 0];
    let base = Math.min(set, vi - s.dropout), d = vi - s.dropout < set ? 1 : 0;
    if (base < 0) { base = 0; d = 0; }
    if (s.type !== "buck" || s.uvlo === undefined) return [base, d];
    const h = s.uvlo_band ?? 0.1, r = Math.min(1, Math.max(0, (vi - s.uvlo + h) / h)), dr = r > 0 && r < 1 ? 1 / h : 0;
    return [r * base, dr * base + r * d];
  }
  /**
   * The piece, by the projection form of the three cases: with a = i + rho x (target - out), regulating while
   * 0 < a < i_limit, in limit above and blocked below. rho weighs volts against amperes (half the limit at the set
   * voltage), so that far from the solution the regulating piece is the one Newton sees.
   */
  private piece(x: Float64Array, c: Ctx): "target" | "limit" | "blocked" {
    const lim = this.spec.i_limit, rho = Number.isFinite(lim) ? lim / (2 * Math.max(this.spec.vout, 1e-3)) : 1;
    const a = x[this.br] + rho * (this.target(this.vi(x), c)[0] - this.vo(x));
    return a <= 0 ? "blocked" : a >= lim ? "limit" : "target";
  }
  /** input current and its derivatives to (vin, vout, i), all against ground */
  private input(x: Float64Array, c: Ctx): [number, number, number, number] {
    const i = x[this.br];
    if (this.spec.type === "linear" || c.noLoad) return [c.noLoad ? 0 : i, 0, 0, c.noLoad ? 0 : 1];
    const vi = this.vi(x), vo = this.vo(x), floor = 0.05, den = this.spec.efficiency! * Math.max(vi, floor);
    return [(vo * i) / den, vi > floor ? -(vo * i) / (den * vi) : 0, i / den, vo / den];
  }
  load(x: Float64Array, s: Stamp, c: Ctx) {
    const [a, o, g] = this.nodes.map((n) => n - 1), k = this.br, i = x[k];
    const [iin, dvi, dvo, di] = this.input(x, c);
    s.F(o, -i); s.D(o, k, -1);
    s.F(a, iin); s.D(a, a, dvi); s.D(a, o, dvo); s.D(a, g, -dvi - dvo); s.D(a, k, di);
    s.F(g, i - iin); s.D(g, a, -dvi); s.D(g, o, -dvo); s.D(g, g, dvi + dvo); s.D(g, k, 1 - di);
    const p = this.piece(x, c);
    if (p === "target") { const [vt, dvt] = this.target(this.vi(x), c); s.F(k, vt - this.vo(x)); s.D(k, o, -1); s.D(k, a, dvt); s.D(k, g, 1 - dvt); }
    else if (p === "limit") { s.F(k, this.spec.i_limit - i); s.D(k, k, -1); }
    else { s.F(k, -i); s.D(k, k, -1); }
  }
  terminal(x: Float64Array, c: Ctx) { const i = x[this.br], iin = this.input(x, c)[0]; return [iin, -i, i - iin]; }
  out(x: Float64Array, c: Ctx) { const i = x[this.br], iin = this.input(x, c)[0], vin = this.vi(x), vout = this.vo(x); return { vin, vout, iin, iout: i, loss_w: vin * iin - vout * i }; }
  state(x: Float64Array, c: Ctx): "regulating" | "dropout" | "limit" | "off" | "blocked" {
    const p = this.piece(x, c), vt = this.target(this.vi(x), c)[0], set = this.spec.vout * c.scale;
    if (vt <= 1e-6 || (this.spec.uvlo !== undefined && this.vi(x) < this.spec.uvlo)) return "off";
    if (p !== "target") return p;
    return vt >= set - 1e-9 ? "regulating" : "dropout";
  }
}

/** LU with partial pivoting, in place; solves A x = b into b. False when the matrix is singular. */
function luSolve(A: Float64Array, b: Float64Array, n: number): boolean {
  for (let k = 0; k < n; k++) {
    let p = k, best = Math.abs(A[k * n + k]);
    for (let r = k + 1; r < n; r++) { const a = Math.abs(A[r * n + k]); if (a > best) { best = a; p = r; } }
    if (!(best > 1e-300)) return false;
    if (p !== k) { for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; } const t = b[k]; b[k] = b[p]; b[p] = t; }
    const piv = A[k * n + k];
    for (let r = k + 1; r < n; r++) {
      const m = A[r * n + k] / piv; if (m === 0) continue;
      for (let j = k + 1; j < n; j++) A[r * n + j] -= m * A[k * n + j];
      b[r] -= m * b[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) { let s = b[k]; for (let j = k + 1; j < n; j++) s -= A[k * n + j] * b[j]; b[k] = s / A[k * n + k]; }
  return true;
}

export interface Trip { fuse: string; rating_a: number; current_a: number; opens_s: [number, number]; }
export interface Solution {
  ok: boolean;
  /** why there are no numbers, when `ok` is false */
  reason?: string;
  iterations: number;
  x: Float64Array;
  /** largest sum of currents at any node (A): Kirchhoff's current law, checked from the elements' own currents */
  kcl_a: number;
  ctx: Ctx;
  /** fuses that opened on the way to this settled state, in order, and the solution before the first one opened */
  trips: Trip[]; before_trip?: Solution;
}
export interface TransientResult { ok: boolean; reason?: string; t: number[]; x: Float64Array[]; events: { t: number; kind: "fuse_blown"; element: string }[]; }

export class Circuit {
  private names = new Map<string, number>([["0", 0]]);
  nodeNames: string[] = ["0"];
  elements: Element[] = [];
  private byName = new Map<string, Element>();
  /** Node by name, made on first use. "0" is the reference. */
  node(name: string): number { let n = this.names.get(name); if (n === undefined) { n = this.nodeNames.length; this.nodeNames.push(name); this.names.set(name, n); } return n; }
  /** Give the reference node (or any node) a second name. */
  alias(name: string, node: number) { if (this.names.has(name) && this.names.get(name) !== node) throw new Error(`node ${name} already exists`); this.names.set(name, node); }
  has(name: string) { return this.names.has(name); }
  add<T extends Element>(e: T): T { if (this.byName.has(e.name)) throw new Error(`two elements are called ${e.name}`); this.elements.push(e); this.byName.set(e.name, e); return e; }
  el<T extends Element = Element>(name: string): T { const e = this.byName.get(name); if (!e) throw new Error(`no element ${name}`); return e as T; }
  resistor(name: string, a: string, b: string, ohm: number) { return this.add(new Resistor(name, this.node(a), this.node(b), ohm)); }
  vsource(name: string, p: string, n: string, volts: Tv<number>, o: { ohm?: number; i_max?: number } = {}) { return this.add(new VSource(name, this.node(p), this.node(n), volts, o.ohm ?? 0, o.i_max ?? Infinity)); }
  isource(name: string, a: string, b: string, amps: Tv<number>) { return this.add(new ISource(name, this.node(a), this.node(b), amps)); }
  capacitor(name: string, a: string, b: string, farad: number, ic?: number) { return this.add(new Capacitor(name, this.node(a), this.node(b), farad, ic)); }
  diode(name: string, anode: string, cathode: string, o: { vf?: number; r_on?: number } = {}) { return this.add(new Diode(name, this.node(anode), this.node(cathode), o.vf ?? 0, o.r_on ?? 1e-3)); }
  switch(name: string, a: string, b: string, closed: Tv<boolean>, ohm = 1e-3) { return this.add(new Switch(name, this.node(a), this.node(b), closed, ohm)); }
  fuse(name: string, a: string, b: string, rating: number, ohm: number, curve: FuseCurve) { return this.add(new Fuse(name, this.node(a), this.node(b), rating, ohm, curve)); }
  currentLoad(name: string, a: string, b: string, amps: Tv<number>, v_knee: number) { return this.add(new CurrentLoad(name, this.node(a), this.node(b), amps, v_knee)); }
  powerLoad(name: string, a: string, b: string, watts: Tv<number>, v_min: number) { return this.add(new PowerLoad(name, this.node(a), this.node(b), watts, v_min)); }
  motor(name: string, a: string, b: string, o: { ohm: number; k: number; load_a?: Tv<number>; stalled?: Tv<boolean>; omega?: number }) { return this.add(new Motor(name, this.node(a), this.node(b), o)); }
  regulator(name: string, vin: string, vout: string, gnd: string, spec: RegulatorSpec) { return this.add(new Regulator(name, this.node(vin), this.node(vout), this.node(gnd), spec)); }

  private size() { let n = this.nodeNames.length - 1; const nodes = n; for (const e of this.elements) { e.br = e.nbr ? n : -1; n += e.nbr; } return { n, nodes }; }
  private assemble(x: Float64Array, s: Stamp, c: Ctx, nodes: number) {
    s.clear();
    for (const e of this.elements) e.load(x, s, c);
    for (let i = 0; i < nodes; i++) { s.f[i] += GMIN * x[i]; s.J[i * s.n + i] += GMIN; }
    let r = 0; for (let i = 0; i < s.n; i++) { const a = Math.abs(s.f[i]); if (!(a <= r)) r = a; }
    return r;
  }
  /** Damped Newton from x (changed in place). */
  private newton(x: Float64Array, c: Ctx, maxIter: number): { ok: boolean; iterations: number; reason?: string } {
    const { n, nodes } = this.size(), s = new Stamp(n), trial = new Float64Array(n), dx = new Float64Array(n), A = new Float64Array(n * n);
    if (!n) return { ok: true, iterations: 0 };
    let res = this.assemble(x, s, c, nodes), uphill = 0;
    // no node moves more than half the largest source voltage in one iteration: a step computed on a flat piece of a
    // load or a limit (no slope but the 1e-12 S) would otherwise throw the voltages out by gigavolts
    let vmax = 0; for (const e of this.elements) { if (e instanceof VSource) vmax = Math.max(vmax, Math.abs(e.emf({ ...c, scale: 1 }))); if (e instanceof Regulator) vmax = Math.max(vmax, e.spec.vout); }
    const vstep = vmax > 0 ? Math.max(0.5, vmax / 2) : Infinity;
    const tol = () => 1e-12 + 1e-10 * Math.max(1, s.mag);
    for (let it = 1; it <= maxIter; it++) {
      if (Number.isNaN(res)) return { ok: false, iterations: it, reason: "the equations gave a value that is not a number" };
      if (res <= tol()) return { ok: true, iterations: it - 1 };
      A.set(s.J); for (let i = 0; i < n; i++) dx[i] = -s.f[i];
      if (!luSolve(A, dx, n)) return { ok: false, iterations: it, reason: "singular equations: a source loop or a current with no path" };
      let big = 0; for (let i = 0; i < nodes; i++) big = Math.max(big, Math.abs(dx[i]));
      const full = big > vstep ? vstep / big : 1;
      let step = full, got = false, r1 = res;
      for (let k = 0; k < 6; k++, step /= 2) {
        for (let i = 0; i < n; i++) trial[i] = x[i] + step * dx[i];
        r1 = this.assemble(trial, s, c, nodes);
        if (r1 < res * (1 - 1e-4 * step) || r1 <= tol()) { got = true; break; }
      }
      // no shorter step lowers the residual: across a kink the full step is the exact solution of the next piece
      if (!got) { if (++uphill > 40) return { ok: false, iterations: it, reason: this.stuck(x, dx, c) }; for (let i = 0; i < n; i++) trial[i] = x[i] + full * dx[i]; r1 = this.assemble(trial, s, c, nodes); }
      x.set(trial); res = r1;
    }
    if (res <= tol()) return { ok: true, iterations: maxIter };
    return { ok: false, iterations: maxIter, reason: this.stuck(x, dx, c) };
  }
  /** Names the parts that keep changing piece between two iterates: what a circuit with no steady state looks like. */
  private stuck(x: Float64Array, dx: Float64Array, c: Ctx) {
    const y = x.map((v, i) => v + dx[i]), flip = this.elements.filter((e) => e.state(x, c) !== e.state(y, c)).map((e) => `${e.name} (${e.state(x, c)} / ${e.state(y, c)})`);
    return `no steady operating point found${flip.length ? `: ${flip.slice(0, 6).join(", ")} keep${flip.length === 1 ? "s" : ""} switching` : ""}`;
  }
  private kcl(x: Float64Array, c: Ctx) {
    const sum = new Float64Array(this.nodeNames.length);
    for (const e of this.elements) { const t = e.terminal(x, c); for (let k = 0; k < t.length; k++) sum[e.nodes[k]] += t[k]; }
    let worst = 0; for (let i = 1; i < sum.length; i++) worst = Math.max(worst, Math.abs(sum[i]));
    return worst;
  }
  private solveAt(c: Ctx, start: Float64Array | undefined, maxIter: number): { ok: boolean; x: Float64Array; iterations: number; reason?: string } {
    const { n } = this.size();
    let x = new Float64Array(n), iterations = 0;
    if (start && start.length === n) {
      x = Float64Array.from(start);
      const r = this.newton(x, c, maxIter); iterations += r.iterations;
      if (r.ok) return { ok: true, x, iterations };
      x = new Float64Array(n);
    }
    // the no-load voltages first, then the loads
    const g = this.newton(x, { ...c, noLoad: true }, maxIter); iterations += g.iterations;
    if (!g.ok) x.fill(0);
    const r = this.newton(x, c, maxIter); iterations += r.iterations;
    if (r.ok) return { ok: true, x, iterations };
    // source stepping: bring the sources up in tenths
    const y = new Float64Array(n); let ok = true;
    for (let k = 1; k <= 10 && ok; k++) { const q = this.newton(y, { ...c, scale: k / 10 }, maxIter); iterations += q.iterations; ok = q.ok; }
    if (ok) return { ok: true, x: y, iterations };
    return { ok: false, x: new Float64Array(n), iterations, reason: r.reason };
  }
  /**
   * The DC operating point. With `fuses` (the default) a fuse loaded past the first gate of its curve opens, the one
   * that opens soonest first, and the circuit is solved again until none is; `trips` lists them and `before_trip` holds
   * the state before the first opened.
   */
  dc(o: { t?: number; fuses?: boolean; maxIter?: number; start?: Float64Array } = {}): Solution {
    const c: Ctx = { mode: "dc", t: o.t ?? Infinity, dt: 0, method: "trap", scale: 1, noLoad: false }, maxIter = o.maxIter ?? 200;
    for (const e of this.elements) e.reset();
    const trips: Trip[] = []; let before: Solution | undefined, start = o.start, iterations = 0;
    for (;;) {
      const r = this.solveAt(c, start, maxIter); iterations += r.iterations;
      if (!r.ok) return { ok: false, reason: r.reason, iterations, x: r.x, kcl_a: Number.NaN, ctx: c, trips, ...(before ? { before_trip: before } : {}) };
      const sol: Solution = { ok: true, iterations, x: r.x, kcl_a: this.kcl(r.x, c), ctx: c, trips, ...(before ? { before_trip: before } : {}) };
      if (o.fuses === false) return sol;
      let next: { f: Fuse; w: [number, number]; i: number } | undefined;
      for (const e of this.elements) if (e instanceof Fuse && !e.blown) { const i = e.current(r.x, c), w = e.window(i); if (w && (!next || w[1] < next.w[1])) next = { f: e, w, i }; }
      if (!next) return sol;
      if (!before) before = { ...sol, trips: [] };
      next.f.blown = true; trips.push({ fuse: next.f.name, rating_a: next.f.rating, current_a: next.i, opens_s: next.w });
      start = r.x;
    }
  }
  /**
   * Time stepping from the operating point at t = 0 (or, with `uic`, from the capacitors' initial voltages). Fixed step
   * `dt`; `method` is "trap" (second order: the error falls with dt squared) or "be" (first order, never rings).
   */
  transient(o: { t_end: number; dt: number; method?: "trap" | "be"; uic?: boolean; maxIter?: number }): TransientResult {
    if (!(o.dt > 0 && o.t_end > 0)) throw new Error("transient: t_end and dt must be positive");
    const steps = Math.round(o.t_end / o.dt); if (steps > 200000) throw new Error("transient: more than 200000 steps");
    for (const e of this.elements) e.reset();
    const method = o.method ?? "trap", maxIter = o.maxIter ?? 200;
    const c0: Ctx = { mode: o.uic ? "ic" : "dc", t: 0, dt: o.dt, method, scale: 1, noLoad: false };
    const first = this.solveAt(c0, undefined, maxIter), out: TransientResult = { ok: true, t: [0], x: [first.x], events: [] };
    if (!first.ok) return { ok: false, reason: `at t = 0: ${first.reason}`, t: [], x: [], events: [] };
    for (const e of this.elements) e.accept(first.x, c0);
    let x = first.x, afterEvent = false;
    for (let k = 1; k <= steps; k++) {
      // one backward Euler step after a fuse opens: the trapezoidal rule would ring on the jump
      const c: Ctx = { mode: "tran", t: k * o.dt, dt: o.dt, method: afterEvent ? "be" : method, scale: 1, noLoad: false };
      const y = Float64Array.from(x), r = this.newton(y, c, maxIter);
      let sol = y;
      if (!r.ok) { const again = this.solveAt(c, undefined, maxIter); if (!again.ok) return { ...out, ok: false, reason: `at t = ${c.t} s: ${again.reason}` }; sol = Float64Array.from(again.x); }
      afterEvent = false;
      for (const e of this.elements) { const was = e instanceof Fuse && e.blown; e.accept(sol, c); if (e instanceof Fuse && e.blown && !was) { out.events.push({ t: c.t, kind: "fuse_blown", element: e.name }); afterEvent = true; } }
      out.t.push(c.t); out.x.push(sol); x = sol;
    }
    return out;
  }
  /** Voltage of a node in a solution. */
  v(x: Float64Array, node: string): number { const n = this.names.get(node); if (n === undefined) throw new Error(`no node ${node}`); return V(x, n); }
}
