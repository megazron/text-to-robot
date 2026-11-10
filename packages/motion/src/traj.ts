// Sampled joint trajectories: a builder that moves joints with minimum-jerk blends timed from each actuator's speed and
// torque, and the checks every motion gets afterwards (position, velocity and torque limits).
import { type Model, fk, resolve, linkCom, jointFrame } from "./model.ts";
import { type T34, type V3, ident, minJerk, MJ_VMAX, MJ_AMAX, toPose7, apply, sub, cross, dot } from "./math.ts";

export interface Prop { kind: "box" | "wearer" | "table"; size: V3; /** per frame [x y z] (world), null while hidden */ path: (V3 | null)[]; }
export interface Segment { t0: number; t1: number; label: string; }
export interface LimitReport {
  position_ok: boolean; velocity_ok: boolean; torque_ok: boolean | null;
  /** largest |velocity| / limit over the motion */
  max_velocity_ratio: number; max_torque_ratio: number | null;
  violations: string[];
}
export interface Trajectory {
  name: string; title: string; robot: string; fps: number; duration_s: number;
  /** columns: every joint the motion sets (not fixed, not mimic) */
  joints: string[];
  /** the ones with a motor: what a ROS 2 JointTrajectory drives */
  actuated: string[];
  t: number[];
  /** q[frame][column] */
  q: number[][];
  /** root pose per frame [x y z qx qy qz qw], or null when the root stays at the origin */
  base: number[][] | null;
  /** per frame: the joint a tour is moving, or null */
  focus: (string | null)[] | null;
  props: Prop[];
  segments: Segment[];
  limits: LimitReport;
  warnings: string[];
  notes: string[];
  /** filled by checkCollisions */
  collisions: import("./collision.ts").CollisionReport | null;
  /** joints a motion wanted to take past their limits (clamped), e.g. a human move beyond a suit's range */
  clamped: { joint: string; frames: number; beyond_deg: number; note: string }[];
  /** measured on the result: foot drift in stance (legged), wheel speed against ground speed (wheeled) */
  measures: Record<string, number>;
}

export class Builder {
  readonly m: Model; readonly fps: number;
  q: Float64Array; base: T34 | null = null;
  frames: { q: Float64Array; base: T34 | null; focus: number }[] = [];
  segments: Segment[] = []; notes: string[] = []; warnings: string[] = [];
  focus = -1;
  inertia: Map<number, number> | null = null;
  constructor(m: Model, start: Float64Array, fps = 30) { this.m = m; this.fps = fps; this.q = resolve(m, new Float64Array(start)); this.push(); }
  get t() { return (this.frames.length - 1) / this.fps; }
  push() { this.frames.push({ q: new Float64Array(this.q), base: this.base ? new Float64Array(this.base) : null, focus: this.focus }); }
  segment(label: string, fn: () => void) { const t0 = this.t; fn(); this.segments.push({ t0, t1: this.t, label }); }
  /** how long a minimum-jerk move of these joints must take: speed (with headroom) and torque (inertia about the axis) */
  duration(target: Map<number, number>, minT = 0.6, speedUse = 0.7): number {
    let T = minT;
    for (const [i, v] of target) {
      const j = this.m.joints[i], d = Math.abs(v - this.q[i]); if (d < 1e-9) continue;
      T = Math.max(T, (MJ_VMAX * d) / (j.velocity * speedUse));
      if (j.type === "revolute" || j.type === "continuous") {
        const I = this.inertiaOf(i), spare = Math.max(j.peak - j.required, 0.25 * j.peak);
        if (Number.isFinite(spare) && spare > 0 && I > 0) T = Math.max(T, Math.sqrt((MJ_AMAX * d * I) / (0.6 * spare)));
      }
    }
    return T;
  }
  inertiaOf(i: number): number { this.inertia ??= axisInertias(this.m, this.q); return this.inertia.get(i) ?? 0; }
  /** joint-space minimum-jerk move */
  move(target: Record<number, number> | Map<number, number>, o: { minT?: number; T?: number; speedUse?: number } = {}) {
    const tg = target instanceof Map ? target : new Map(Object.entries(target).map(([k, v]) => [Number(k), v]));
    for (const [i, v] of tg) { const j = this.m.joints[i]; tg.set(i, Math.min(j.upper, Math.max(j.lower, v))); }
    const T = o.T ?? this.duration(tg, o.minT, o.speedUse), n = Math.max(1, Math.round(T * this.fps));
    const from = new Map([...tg.keys()].map((i) => [i, this.q[i]]));
    for (let k = 1; k <= n; k++) {
      const s = minJerk(k / n);
      for (const [i, v] of tg) this.q[i] = from.get(i)! + (v - from.get(i)!) * s;
      resolve(this.m, this.q); this.push();
    }
    return T;
  }
  hold(seconds: number) { const n = Math.round(seconds * this.fps); for (let k = 0; k < n; k++) this.push(); }
  /** a sampled stretch: fn sets this.q / this.base for time t (s from its start) */
  run(seconds: number, fn: (t: number, k: number) => void) {
    const n = Math.max(1, Math.round(seconds * this.fps));
    for (let k = 1; k <= n; k++) { fn(k / this.fps, k); resolve(this.m, this.q); this.push(); }
  }

  finish(name: string, title: string, extra: Partial<Trajectory> = {}): Trajectory {
    const m = this.m, cols = m.free, fps = this.fps;
    if (!this.frames.length) this.push();
    // a motion that places the root later in its first frames: the frames before take the first pose it set
    const firstBase = this.frames.find((f) => f.base)?.base ?? null;
    if (firstBase) { let last = firstBase; for (const f of this.frames) { if (f.base) last = f.base; else f.base = new Float64Array(last); } }
    const q = this.frames.map((f) => cols.map((i) => round(f.q[i])));
    const anyBase = this.frames.some((f) => f.base);
    const tr: Trajectory = {
      name, title, robot: m.spec.robot_name, fps, duration_s: round((this.frames.length - 1) / fps, 4),
      joints: cols.map((i) => m.joints[i].name), actuated: m.actuated.map((i) => m.joints[i].name),
      t: this.frames.map((_, k) => round(k / fps, 4)), q,
      base: anyBase ? this.frames.map((f) => toPose7(f.base ?? ident()).map((x) => round(x))) : null,
      focus: this.frames.some((f) => f.focus >= 0) ? this.frames.map((f) => (f.focus >= 0 ? m.joints[f.focus].name : null)) : null,
      props: [], segments: this.segments.map((s) => ({ ...s, t0: round(s.t0, 4), t1: round(s.t1, 4) })),
      limits: { position_ok: true, velocity_ok: true, torque_ok: null, max_velocity_ratio: 0, max_torque_ratio: null, violations: [] },
      warnings: this.warnings, notes: this.notes, collisions: null, clamped: [], measures: {}, ...extra,
    };
    tr.limits = checkLimits(m, tr, this.frames);
    return tr;
  }
}
export const round = (x: number, d = 6) => { const k = 10 ** d, v = Math.round(x * k) / k; return v === 0 ? 0 : v; };

/** inertia about each revolute joint's axis of everything it carries (point masses at link centres of mass, +15 % for the links' own) */
export function axisInertias(m: Model, q: Float64Array, base?: T34): Map<number, number> {
  const W = fk(m, q, base), out = new Map<number, number>();
  const com = m.spec.links.map((l, i) => apply(W, linkCom(l), 12 * i));
  for (const j of m.joints) {
    if (j.type !== "revolute" && j.type !== "continuous") continue;
    const { p, a } = jointFrame(m, W, j);
    let I = 0;
    for (const l of m.below(j.child)) { const r = sub(com[l], p), along = dot(r, a); I += m.spec.links[l].mass * Math.max(0, dot(r, r) - along * along); }
    out.set(j.index, I * 1.15);
  }
  return out;
}
/** gravity torque about each actuated revolute joint (N m), for joints whose subtree hangs free (no feet or wheels on it) */
export function gravityTorques(m: Model, q: Float64Array, skip: Set<number>, base?: T34): Map<number, number> {
  const W = fk(m, q, base), out = new Map<number, number>();
  const com = m.spec.links.map((l, i) => apply(W, linkCom(l), 12 * i));
  for (const i of m.actuated) {
    const j = m.joints[i]; if (j.type !== "revolute" || skip.has(i)) continue;
    const { p, a } = jointFrame(m, W, j);
    let tau = 0;
    for (const l of m.below(j.child)) { const F: V3 = [0, 0, -9.81 * m.spec.links[l].mass]; tau += dot(cross(sub(com[l], p), F), a); }
    out.set(i, Math.abs(tau));
  }
  return out;
}

function checkLimits(m: Model, tr: Trajectory, frames: { q: Float64Array; base: T34 | null }[]): LimitReport {
  const v: string[] = []; let pos = true, vel = true, maxV = 0;
  const dt = 1 / tr.fps;
  for (const i of m.free) {
    const j = m.joints[i]; let worstP = 0, worstV = 0;
    for (let k = 0; k < frames.length; k++) {
      const x = frames[k].q[i];
      if (x < j.lower - 1e-6 || x > j.upper + 1e-6) worstP = Math.max(worstP, Math.max(j.lower - x, x - j.upper));
      if (k) worstV = Math.max(worstV, Math.abs(x - frames[k - 1].q[i]) / dt);
    }
    if (worstP > 0) { pos = false; v.push(`${j.name}: ${worstP.toFixed(4)} past its limit`); }
    // a sampled velocity may read 1-2 % over a peak that lands between samples; 3 % is the honest margin of a 30 Hz sample
    const ratio = worstV / j.velocity; maxV = Math.max(maxV, ratio);
    if (ratio > 1.03) { vel = false; v.push(`${j.name}: ${worstV.toFixed(2)} ${j.type === "prismatic" ? "m/s" : "rad/s"} over its ${j.velocity.toFixed(2)} limit`); }
  }
  return { position_ok: pos, velocity_ok: vel, torque_ok: null, max_velocity_ratio: round(maxV, 3), max_torque_ratio: null, violations: v };
}

/** torque check over a fixed-base stretch: gravity plus inertia (I alpha) against each actuator's peak */
export function checkTorques(m: Model, tr: Trajectory, frames: { q: Float64Array; base: T34 | null }[], skip: Set<number>) {
  if (frames.length < 3) return;
  const dt = 1 / tr.fps, worst = new Map<number, number>();
  const step = Math.max(1, Math.floor(frames.length / 120));
  for (let k = 1; k < frames.length - 1; k += step) {
    const g = gravityTorques(m, frames[k].q, skip, frames[k].base ?? undefined), I = axisInertias(m, frames[k].q, frames[k].base ?? undefined);
    for (const [i, tg] of g) {
      const j = m.joints[i]; if (!Number.isFinite(j.peak) || j.peak <= 0) continue;
      const acc = (frames[k + 1].q[i] - 2 * frames[k].q[i] + frames[k - 1].q[i]) / (dt * dt);
      const r = (tg + (I.get(i) ?? 0) * Math.abs(acc)) / j.peak;
      worst.set(i, Math.max(worst.get(i) ?? 0, r));
    }
  }
  let mx = 0; const bad: string[] = [];
  for (const [i, r] of worst) { mx = Math.max(mx, r); if (r > 1) bad.push(`${m.joints[i].name}: needs ${(r * 100).toFixed(0)} % of its actuator's peak torque`); }
  tr.limits.max_torque_ratio = round(mx, 3); tr.limits.torque_ok = bad.length === 0; tr.limits.violations.push(...bad);
}
