// Inverse kinematics by damped least squares on the URDF chain, with joint limits held by clamping (a joint pinned at a
// limit and pushed further leaves the solve), mimic joints folded into their leaders, and restarts from several seeds.
// It answers honestly: the closest pose it found, how far that is from the target, and whether that counts as reached.
import { type Model, fk, jointFrame, resolve } from "./model.ts";
import { type T34, type V3, apply, sub, cross, rotErr, norm, rng, clamp } from "./math.ts";

export interface IkGoal {
  link: number;
  /** point on the link (link frame) to bring to `pos` */
  point?: V3;
  pos: V3;
  /** world orientation for the link frame (only its rotation is used) */
  rot?: T34;
  /** 0..1: how much the orientation counts when `rot` is given (1 = as much as 0.1 m of position) */
  rotWeight?: number;
}
export interface IkOptions {
  /** joints the solve may move (default: every free joint on the chain to the link) */
  joints?: number[];
  base?: T34;
  /** start values (a full vector over model.joints) */
  seed: Float64Array;
  iterations?: number;
  /** extra starting points tried when the first does not reach */
  restarts?: number;
  /** pull towards the seed in the null space, 0..1 */
  rest?: number;
  tolPos?: number;
  tolRot?: number;
}
export interface IkResult { q: Float64Array; reached: boolean; error_m: number; error_rad: number; iterations: number; atLimit: number[]; }

const LEN = 0.1;  // metres per radian of orientation error

/** solve for one goal; `joints` must be on the goal link's chain */
export function solveIk(m: Model, goal: IkGoal, o: IkOptions): IkResult {
  const joints = o.joints ?? defaultJoints(m, goal.link);
  const tolPos = o.tolPos ?? 5e-4, tolRot = o.tolRot ?? 0.008;
  const seeds: Float64Array[] = [o.seed];
  const R = rng(1234 + joints.length);
  for (let k = 0; k < (o.restarts ?? 0); k++) {
    const s = new Float64Array(o.seed);
    for (const i of joints) { const j = m.joints[i]; const lo = Number.isFinite(j.lower) ? j.lower : -Math.PI, hi = Number.isFinite(j.upper) ? j.upper : Math.PI; s[i] = k === 0 ? (lo + hi) / 2 : lo + (hi - lo) * R(); }
    seeds.push(resolve(m, s));
  }
  let best: IkResult | null = null;
  for (const s of seeds) {
    const r = descend(m, goal, joints, s, o);
    const score = (x: IkResult) => x.error_m + (goal.rot ? x.error_rad * LEN * (goal.rotWeight ?? 1) : 0);
    if (!best || score(r) < score(best)) best = r;
    if (best.error_m <= tolPos && (!goal.rot || best.error_rad <= tolRot)) break;
  }
  best!.reached = best!.error_m <= tolPos && (!goal.rot || best!.error_rad <= tolRot);
  return best!;
}

export function defaultJoints(m: Model, link: number): number[] {
  const out: number[] = [];
  for (let j = m.parentJoint[link]; j >= 0; j = m.parentJoint[m.joints[j].parent]) {
    const J = m.joints[j];
    if (J.type !== "fixed") out.unshift(J.mimic ? J.mimic.leader : j);
  }
  return [...new Set(out)].filter((i) => m.joints[i].type !== "fixed" && !m.joints[i].mimic);
}

function descend(m: Model, goal: IkGoal, joints: number[], seed: Float64Array, o: IkOptions): IkResult {
  const q = new Float64Array(seed), n = joints.length, wantRot = !!goal.rot, rw = (goal.rotWeight ?? 1) * LEN;
  const rows = wantRot ? 6 : 3, point = goal.point ?? [0, 0, 0];
  const iters = o.iterations ?? 120, rest = o.rest ?? 0;
  const chainSet = new Set<number>();
  for (let j = m.parentJoint[goal.link]; j >= 0; j = m.parentJoint[m.joints[j].parent]) chainSet.add(j);
  const owners = joints.map((i) => [...chainSet].filter((c) => c === i || m.joints[c].mimic?.leader === i).map((c) => ({ c, k: c === i ? 1 : m.joints[c].mimic!.mult })));
  let W = fk(m, resolve(m, q), o.base), err = 0, errR = 0, it = 0;
  const J = new Float64Array(rows * n), e = new Float64Array(rows);
  const measure = () => {
    const p = apply(W, point, 12 * goal.link), d = sub(goal.pos, p);
    e[0] = d[0]; e[1] = d[1]; e[2] = d[2]; err = norm(d);
    if (wantRot) { const r = rotErr(W.subarray(12 * goal.link, 12 * goal.link + 12) as T34, goal.rot!); e[3] = r[0] * rw; e[4] = r[1] * rw; e[5] = r[2] * rw; errR = norm(r); }
    return p;
  };
  let p = measure();
  let lambda = 0.02;
  for (; it < iters; it++) {
    if (err <= (o.tolPos ?? 5e-4) * 0.2 && (!wantRot || errR <= (o.tolRot ?? 0.008) * 0.2)) break;
    J.fill(0);
    for (let c = 0; c < n; c++) {
      const jt = m.joints[joints[c]];
      // a joint pinned at a limit that the error pushes further is left out of this step
      for (const { c: ci, k } of owners[c]) {
        const J2 = m.joints[ci], f = jointFrame(m, W, J2);
        if (J2.type === "prismatic") { J[c] += f.a[0] * k; J[n + c] += f.a[1] * k; J[2 * n + c] += f.a[2] * k; }
        else { const v = cross(f.a, sub(p, f.p)); J[c] += v[0] * k; J[n + c] += v[1] * k; J[2 * n + c] += v[2] * k; if (wantRot) { J[3 * n + c] += f.a[0] * k * rw; J[4 * n + c] += f.a[1] * k * rw; J[5 * n + c] += f.a[2] * k * rw; } }
      }
      let g = 0; for (let r = 0; r < rows; r++) g += J[r * n + c] * e[r];
      const v = q[joints[c]];
      if ((v <= jt.lower + 1e-9 && g < 0) || (v >= jt.upper - 1e-9 && g > 0)) for (let r = 0; r < rows; r++) J[r * n + c] = 0;
    }
    const dq = dls(J, e, rows, n, lambda);
    // a pull towards the seed in the null space of the task keeps poses natural (the elbow stays where it was)
    if (rest > 0) {
      const z = new Float64Array(n); for (let c = 0; c < n; c++) z[c] = rest * (seed[joints[c]] - q[joints[c]]);
      const Jz = new Float64Array(rows); for (let r = 0; r < rows; r++) { let sum = 0; for (let c = 0; c < n; c++) sum += J[r * n + c] * z[c]; Jz[r] = sum; }
      const back = dls(J, Jz, rows, n, lambda);
      for (let c = 0; c < n; c++) dq[c] += z[c] - back[c];
    }
    let mx = 0; for (const d of dq) mx = Math.max(mx, Math.abs(d));
    const s = mx > 0.25 ? 0.25 / mx : 1;
    const before = new Float64Array(q), e0 = err + (wantRot ? errR * rw : 0);
    for (let c = 0; c < n; c++) { const jt = m.joints[joints[c]]; q[joints[c]] = clamp(q[joints[c]] + dq[c] * s, jt.lower, jt.upper); }
    W = fk(m, resolve(m, q), o.base); p = measure();
    const e1 = err + (wantRot ? errR * rw : 0);
    if (e1 > e0 * 1.0001) { q.set(before); W = fk(m, resolve(m, q), o.base); p = measure(); lambda = Math.min(1, lambda * 3); if (lambda >= 1 && it > 20) break; }
    else lambda = Math.max(1e-4, lambda * 0.6);
  }
  const atLimit = joints.filter((i) => { const j = m.joints[i]; return Number.isFinite(j.lower) && (q[i] <= j.lower + 1e-6 || q[i] >= j.upper - 1e-6); });
  return { q: resolve(m, q), reached: false, error_m: err, error_rad: errR, iterations: it, atLimit };
}

/** dq = J^T (J J^T + l^2 I)^-1 e */
function dls(J: Float64Array, e: Float64Array, rows: number, n: number, l: number): Float64Array {
  const A = new Float64Array(rows * rows);
  for (let i = 0; i < rows; i++) for (let k = 0; k < rows; k++) { let s = 0; for (let c = 0; c < n; c++) s += J[i * n + c] * J[k * n + c]; A[i * rows + k] = s + (i === k ? l * l : 0); }
  const y = solve(A, Float64Array.from(e), rows);
  const dq = new Float64Array(n);
  for (let c = 0; c < n; c++) { let s = 0; for (let i = 0; i < rows; i++) s += J[i * n + c] * y[i]; dq[c] = s; }
  return dq;
}
function solve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } const t = b[c]; b[c] = b[p]; b[p] = t; }
    const d = A[c * n + c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = A[r * n + c] / d; if (!f) continue; for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]; b[r] -= f * b[c]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k]; x[r] = s / (A[r * n + r] || 1e-12); }
  return x;
}
