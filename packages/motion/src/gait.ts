// Gaits with planted feet: trot (four legs), tripod (six), a wave gait for other counts, and a quasi-static step cycle for
// two legs. The body follows a planned path; each foot stays where it touched down for the whole of its stance and swings
// to its next foothold on a smooth arc; every frame solves each leg's inverse kinematics against those footholds. A foot
// that cannot hold its foothold is measured and reported (stance drift), never hidden.
import { type Model, fk, qVector, resolve, jointFrame, linkT } from "./model.ts";
import type { Semantics, Leg } from "./semantics.ts";
import { Builder, type Trajectory, round } from "./traj.ts";
import { solveIk } from "./ik.ts";
import { type T34, type V3, apply, sub, norm, planar, cos, sin, minJerk, clamp, mul, axisAngle, toPose7 } from "./math.ts";

export function gaitAvailable(m: Model, sem: Semantics) { return sem.legs.length >= 2 && sem.legs.every((l) => l.joints.length >= 2); }

interface Stance { h: number; neutral: V3[]; q: Float64Array; S: number; lift: number; rot: (T34 | null)[]; sway: number; }
const legLen = (m: Model, W: Float64Array, L: Leg) => norm(sub(apply(W, L.point, 12 * L.foot), jointFrame(m, W, m.joints[L.joints[0]]).p));

/** find a body height, foot spread and stride every leg can hold */
function findStance(m: Model, sem: Semantics, legs: Leg[], home: Float64Array, duty: number, biped: boolean): Stance | null {
  const W0 = fk(m, home), Lm = legs.reduce((s, L) => s + legLen(m, W0, L), 0) / legs.length;
  const feet = legs.map((L) => apply(W0, L.point, 12 * L.foot)), hips = legs.map((L) => jointFrame(m, W0, m.joints[L.joints[0]]).p);
  const contact0 = Math.min(...legs.map((L, i) => feet[i][2] - L.contactDrop));
  const h0 = -contact0;  // root height above the floor when the home pose stands on it
  const crouches = [0.08, 0.12, 0.05, 0.16, 0.2, 0.03, 0.25, -0.1, -0.2, -0.3, -0.4, -0.5];
  const spreads = biped ? [1] : [1, 0.9, 1.1, 0.8];
  const strides = biped ? [0.36, 0.28, 0.2, 0.13] : [0.55, 0.45, 0.36, 0.28, 0.2, 0.13];
  const rot = legs.map((L) => (L.joints.length >= 5 ? new Float64Array(linkT(W0, L.foot)) as T34 : null));
  // every knee bends the same way (a straight leg could fold either way): knees behind the feet on four legs (as most
  // robot dogs), in front on two (as people); the start pose is bent that way so every solve stays on that side
  const seed = new Float64Array(home);
  if (legs.length <= 4) for (const L of legs) {
    const knee = [...L.joints].reverse().find((i) => { const j = m.joints[i]; return j.type === "revolute" && Math.abs(jointFrame(m, W0, j).a[2]) < 0.7; });
    if (knee === undefined || knee === L.joints[0]) continue;
    // only a leg that is straight at home is ambiguous; a bent one keeps the way its design bends it
    const hip = jointFrame(m, W0, m.joints[L.joints[0]]).p, foot = apply(W0, L.point, 12 * L.foot);
    if (Math.abs(foot[0] - hip[0]) > 0.012) continue;
    const j = m.joints[knee], fx = (v: number) => { const q = new Float64Array(home); q[knee] = v; return apply(fk(m, q), L.point, 12 * L.foot)[0]; };
    const want = biped ? -1 : 1, base = fx(home[knee]);
    for (const v of [0.5, -0.5]) { const t = clamp(home[knee] + v, j.lower, j.upper); if (Math.sign(fx(t) - base) === want && Math.abs(t - home[knee]) > 0.2) { seed[knee] = t; break; } }
  }
  for (const c of crouches) {
    const h = h0 - c * Lm; if (h <= 0.2 * Lm * 0) { if (h <= 0) continue; }
    for (const rho of spreads) {
      const neutral = legs.map((L, i) => {
        const f = feet[i], hp = hips[i];
        return [hp[0] + (f[0] - hp[0]) * rho, hp[1] + (f[1] - hp[1]) * rho, -h + L.contactDrop] as V3;
      });
      const base = planar(0, 0, h, 0);
      let q: Float64Array = new Float64Array(seed), ok = true;
      for (let i = 0; i < legs.length && ok; i++) {
        const r = solveIk(m, { link: legs[i].foot, point: legs[i].point, pos: apply(base, neutral[i]), rot: rot[i] ?? undefined, rotWeight: 0.5 }, { joints: legs[i].joints, seed: q, base, restarts: 4, tolPos: 1e-3, tolRot: 0.02 });
        if (!r.reached) ok = false; else q = r.q;
      }
      if (!ok) continue;
      const lift = clamp(0.14 * Lm, 0.01, 0.06);
      const reach = (i: number, d: V3, tries = 2) => solveIk(m, { link: legs[i].foot, point: legs[i].point, pos: apply(base, [neutral[i][0] + d[0], neutral[i][1] + d[1], neutral[i][2] + d[2]]), rot: rot[i] ?? undefined, rotWeight: 0.5 }, { joints: legs[i].joints, seed: q, base, restarts: tries, tolPos: 1e-3, tolRot: 0.02 }).reached;
      for (const sf of strides) {
        const S = sf * Lm, ex = (S * duty) / 2 + 0.003;
        let good = true;
        for (let i = 0; i < legs.length && good; i++) {
          const n = neutral[i];
          for (const d of [[ex, 0, 0], [-ex, 0, 0], [0, 0, lift], [ex * 0.5, 0, lift * 0.7], [-ex * 0.5, 0, lift * 0.7], ...(biped ? [] : [[0, ex * 0.7, 0], [0, -ex * 0.7, 0]])] as V3[]) if (!reach(i, d)) { good = false; break; }
          void n;
        }
        if (!good) continue;
        // a biped shifts its body over the planted foot: as far as both hips let it (the foot moves to the body's middle, relative)
        let sway = 0;
        if (biped) for (const a of [0.8, 0.6, 0.45, 0.3, 0.15]) {
          if (legs.every((_, i) => [[0, -a * neutral[i][1], 0], [ex, -a * neutral[i][1], 0], [-ex, -a * neutral[i][1], 0], [0, a * neutral[i][1], lift], [ex * 0.5, a * neutral[i][1], lift * 0.7]].every((d) => reach(i, d as V3)))) { sway = a; break; }
        }
        if (biped && sway === 0) continue;
        return { h, neutral, q, S, lift, rot, sway };
      }
    }
  }
  return null;
}

export function gait(m: Model, sem: Semantics, b: Builder, name: string, title: string, to?: [number, number]): Trajectory {
  const legs = sem.legs, biped = legs.length === 2, home = new Float64Array(b.q);
  const duty = biped ? 0.66 : legs.length === 4 ? 0.62 : legs.length === 6 ? 0.56 : 1 - 1 / legs.length + 0.05;
  const st = findStance(m, sem, legs, home, duty, biped);
  if (!st) { b.notes.push("No standing pose every leg can hold was found; no gait."); b.hold(1); return b.finish(name, title); }
  const W0 = fk(m, home), Lm = legs.reduce((s, L) => s + legLen(m, W0, L), 0) / legs.length;
  // phases: diagonal pairs (trot), alternating tripods, left-right for two legs, a wave from the back otherwise
  const order = legs.map((L, i) => ({ i, L })), phase = new Array(legs.length).fill(0);
  const midX = legs.reduce((s, L) => s + L.x, 0) / legs.length;
  if (biped) legs.forEach((L, i) => { phase[i] = L.side > 0 ? 0 : 0.5; });
  else if (legs.length === 4) legs.forEach((L, i) => { phase[i] = (L.x > midX) === (L.side > 0) ? 0 : 0.5; });
  else if (legs.length === 6) for (const side of [1, -1]) order.filter((o) => o.L.side === side).sort((a, c) => c.L.x - a.L.x).forEach((o, k) => { phase[o.i] = (k + (side > 0 ? 0 : 1)) % 2 ? 0.5 : 0; });
  else order.sort((a, c) => a.L.x - c.L.x).forEach((o, k) => { phase[o.i] = k / legs.length; });
  let T = biped ? clamp(3.0 * Math.sqrt(Lm), 1.2, 2.2) : clamp(2.4 * Math.sqrt(Lm), 0.55, 1.6);
  const tries = 4;
  let out: Trajectory | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const bb = new Builder(m, home, b.fps);
    out = walk(m, sem, bb, name, title, st, phase, duty, T, biped, Lm, to);
    if (out.limits.velocity_ok) { b.frames = bb.frames; b.segments = bb.segments; break; }
    T *= 1.25 * Math.min(2, out.limits.max_velocity_ratio);
    b.frames = bb.frames; b.segments = bb.segments;
  }
  return out!;
}

function walk(m: Model, sem: Semantics, b: Builder, name: string, title: string, st: Stance, phase: number[], duty: number, T: number, biped: boolean, Lm: number, to?: [number, number]): Trajectory {
  const legs = sem.legs, home = new Float64Array(b.q), S = st.S, v = S / T;
  const reachR = Math.max(...st.neutral.map((n) => Math.sqrt(n[0] * n[0] + n[1] * n[1])));
  const wTurn = (0.8 * S) / (reachR * T);
  // the body's path: a list of stretches with a pose (x, y, yaw) for s in 0..1
  type Leg2 = { t0: number; t1: number; at: (s: number) => [number, number, number] };
  const path: Leg2[] = []; let t = 0, cx = 0, cy = 0, cyaw = 0;
  // speed ramps up over one cycle, cruises, ramps down over one cycle (minimum-jerk ramps)
  const trap = (A: number, rate: number) => { const Ta = T, Tc = Math.max(0, Math.abs(A) / rate - Ta), Tn = Tc + 2 * Ta, tot = Tc + Ta;
    const at = (tt: number) => { const ramp = (u: number) => Ta * (2.5 * u ** 4 - 3 * u ** 5 + u ** 6); const d = tt < Ta ? ramp(tt / Ta) : tt < Ta + Tc ? 0.5 * Ta + (tt - Ta) : tot - ramp((Tn - tt) / Ta); return (Math.sign(A) * d * Math.abs(A)) / tot; };
    return { Tn, at }; };
  const straight = (D: number) => { const { Tn, at } = trap(D, v), x0 = cx, y0 = cy, a = cyaw; path.push({ t0: t, t1: t + Tn, at: (s) => { const k = at(s * Tn); return [x0 + cos(a) * k, y0 + sin(a) * k, a]; } }); t += Tn; cx += cos(a) * D; cy += sin(a) * D; };
  const turn = (A: number) => { const { Tn, at } = trap(A, wTurn), x0 = cx, y0 = cy, a = cyaw; path.push({ t0: t, t1: t + Tn, at: (s) => [x0, y0, a + at(s * Tn)] }); t += Tn; cyaw += A; };
  const pause = (Tn: number) => { const x0 = cx, y0 = cy, a = cyaw; path.push({ t0: t, t1: t + Tn, at: () => [x0, y0, a] }); t += Tn; };
  // a walk to a point: crab-walk there without turning (a biped steps forward or back only)
  const shift = (dx: number, dy: number) => { const D = Math.sqrt(dx * dx + dy * dy); if (D < 1e-4) return; const { Tn, at } = trap(D, v), x0 = cx, y0 = cy, a = cyaw; path.push({ t0: t, t1: t + Tn, at: (s) => { const k = at(s * Tn) / D; return [x0 + dx * k, y0 + dy * k, a]; } }); t += Tn; cx += dx; cy += dy; };
  pause(T * 0.5);
  if (to) { biped ? shift(to[0], 0) : shift(to[0], to[1]); }
  else if (biped) { straight(3 * S); pause(T * 0.5); straight(-3 * S); }
  else { straight(4 * S); turn(Math.PI / 2); pause(T * 0.25); turn(-Math.PI / 2); straight(-4 * S); }
  pause(T * 0.5);
  const tGaitEnd = t - T * 0.5, tEnd = t + T * 1.2;
  const poseAt = (tt: number): [number, number, number] => { if (tt <= 0) return path[0].at(0); for (const p of path) if (tt <= p.t1) return p.at((tt - p.t0) / (p.t1 - p.t0)); return path[path.length - 1].at(1); };
  const sway = (tt: number) => {
    if (!biped) return 0;
    const env = minJerk(tt / T) * (1 - minJerk((tt - (tGaitEnd - T)) / T));
    // over the left foot while the right one swings, over the right while the left swings
    const iL = legs[0].side > 0 ? 0 : 1, yL = st.neutral[iL][1], mid = duty + (1 - duty) / 2;
    return st.sway * yL * env * cos(2 * Math.PI * (tt / T + phase[1 - iL] - mid));
  };
  const bodyAt = (tt: number) => { const [x, y, a] = poseAt(tt), s = sway(tt); return planar(x - sin(a) * s, y + cos(a) * s, st.h, a); };
  // footholds: each leg's swings in time order; a swing starts only while the gait runs
  const holds = legs.map((L, i) => {
    const B = bodyAt(0), start = apply(B, st.neutral[i]);
    const swings: { lo: number; td: number; from: V3; to: V3; yaw0: number; yaw1: number }[] = [];
    let cur = start, yaw = poseAt(0)[2];
    for (let k = 0; ; k++) {
      const lo = (k - phase[i] + duty) * T; if (lo < T * 0.5) continue; if (lo > tGaitEnd + T) break;
      const td = lo + (1 - duty) * T;
      const ahead = td + (duty * T) / 2, [x, y, a] = poseAt(ahead), Bh = planar(x, y, st.h, a);
      const to = apply(Bh, st.neutral[i]); to[2] = st.neutral[i][2] + st.h;
      swings.push({ lo, td, from: cur, to, yaw0: yaw, yaw1: a }); cur = to; yaw = a;
    }
    return { start, swings };
  });
  const footAt = (i: number, tt: number): { p: V3; stance: boolean; yaw: number } => {
    const H = holds[i]; let p = H.start, yaw = poseAt(0)[2];
    for (const s of H.swings) {
      if (tt < s.lo) break;
      if (tt <= s.td) {
        const u = (tt - s.lo) / (s.td - s.lo), e = minJerk(u), up = sin(Math.PI * u);
        return { p: [s.from[0] + (s.to[0] - s.from[0]) * e, s.from[1] + (s.to[1] - s.from[1]) * e, s.from[2] + (s.to[2] - s.from[2]) * e + st.lift * up * up], stance: false, yaw: s.yaw0 + (s.yaw1 - s.yaw0) * e };
      }
      p = s.to; yaw = s.yaw1;
    }
    return { p, stance: true, yaw };
  };
  // arms swing against the legs on a biped
  const armSwing = sem.anatomy.filter((a) => a.cls === "shoulder_flex");
  const legOfSide = (side: number) => legs.findIndex((L) => L.side === side);

  // stand: from the home pose into the stance, the body on the floor throughout
  const W0 = fk(m, home);
  const contact0 = Math.min(...legs.map((L) => apply(W0, L.point, 12 * L.foot)[2] - L.contactDrop));
  const hHome = -contact0, B0 = bodyAt(0);
  let q: Float64Array = new Float64Array(st.q);
  // solve the first frame exactly at its footholds so the stand ends where the walk starts
  for (let i = 0; i < legs.length; i++) q = solveIk(m, { link: legs[i].foot, point: legs[i].point, pos: footAt(i, 0).p, rot: rotFor(st, i, poseAt(0)[2]) ?? undefined, rotWeight: 0.5 }, { joints: legs[i].joints, seed: q, base: B0, restarts: 3 }).q;
  const qStance = new Float64Array(q);
  b.frames[0].base = planar(0, 0, hHome, 0);
  // stand and rest: the body rises or settles with each foot solved onto the floor (a foot that must move sideways steps over)
  const settle = (Tn: number, from: V3[], to: V3[], z0: number, z1: number, xy: [number, number, number], qFrom: Float64Array, qTo: Float64Array) => {
    let qs: Float64Array = new Float64Array(qFrom);
    b.run(Tn, (tt) => {
      const s = minJerk(tt / Tn), B = planar(xy[0], xy[1], z0 + (z1 - z0) * s, xy[2]);
      b.base = B;
      for (let i = 0; i < legs.length; i++) {
        const a = from[i], c = to[i], dxy = Math.sqrt((c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2), up = dxy > 0.003 ? st.lift * sin(Math.PI * s) : 0;
        const p: V3 = [a[0] + (c[0] - a[0]) * s, a[1] + (c[1] - a[1]) * s, Math.max(a[2] + (c[2] - a[2]) * s, Math.min(a[2], c[2])) + up];
        const r = solveIk(m, { link: legs[i].foot, point: legs[i].point, pos: p, rot: rotFor(st, i, xy[2]) ?? undefined, rotWeight: 0.5 }, { joints: legs[i].joints, seed: qs, base: B, iterations: 60, restarts: 0, tolPos: 2e-4 });
        if (r.error_m < 0.002) qs = r.q; else for (const j of legs[i].joints) qs[j] = qFrom[j] + (qTo[j] - qFrom[j]) * s;
      }
      for (const L of legs) for (const j of L.joints) b.q[j] = qs[j];
    });
  };
  const homeFeet = (x: number, y: number, a: number) => legs.map((L) => { const p = apply(planar(x, y, hHome, a), apply(W0, L.point, 12 * L.foot)); return p; });
  b.segment("stand", () => settle(Math.max(0.8, T * 0.8), homeFeet(0, 0, 0), legs.map((_, i) => footAt(i, 0).p), hHome, st.h, [0, 0, 0], home, qStance));
  const tWalk0 = b.t;
  let slip = 0, slipFrames = 0, worstLeg = "";
  b.segment(biped ? "step cycle" : name === "gait" ? (legs.length === 6 ? "tripod gait" : legs.length === 4 ? "trot" : "wave gait") : "walk", () => {
    b.run(tEnd, (tt) => {
      const B = bodyAt(tt); b.base = B;
      for (let i = 0; i < legs.length; i++) {
        const f = footAt(i, tt), r = solveIk(m, { link: legs[i].foot, point: legs[i].point, pos: f.p, rot: rotFor(st, i, f.yaw) ?? undefined, rotWeight: 0.5 }, { joints: legs[i].joints, seed: q, base: B, iterations: 60, restarts: 0, tolPos: 2e-4 });
        q = r.q;
        if (f.stance && tt > 0) { if (r.error_m > slip) { slip = r.error_m; worstLeg = `${m.links[legs[i].foot]} at ${tt.toFixed(2)} s`; } if (r.error_m > 0.002) slipFrames++; }
      }
      for (const L of legs) for (const j of L.joints) b.q[j] = q[j];
      if (biped) for (const a of armSwing) {
        const li = legOfSide(-a.side); if (li < 0) continue;
        const fx = footAt(li, tt).p, [x, y, yaw] = poseAt(tt), along = cos(yaw) * (fx[0] - x) + sin(yaw) * (fx[1] - y) - st.neutral[li][0];
        b.q[a.joint] = clamp(home[a.joint] + a.sign * clamp(along / (S * 0.5), -1, 1) * 0.3, m.joints[a.joint].lower, m.joints[a.joint].upper);
      }
    });
  });
  const tWalk1 = b.t;
  const Bend = b.base!;
  b.segment("rest", () => {
    const Tn = Math.max(0.8, T * 0.8), qa = new Float64Array(b.q), z1 = toPose7(Bend), arms0 = armSwing.map((A) => b.q[A.joint]);
    const [x, y, a] = poseAt(tEnd), n0 = b.frames.length;
    settle(Tn, legs.map((_, i) => footAt(i, tEnd).p), homeFeet(x, y, a), z1[2], hHome, [x, y, a], qa, home);
    // the arms come home over the same frames
    for (let k = n0; k < b.frames.length; k++) { const s = minJerk((k - n0 + 1) / (b.frames.length - n0)); armSwing.forEach((A, i) => { b.frames[k].q[A.joint] = arms0[i] + (home[A.joint] - arms0[i]) * s; }); }
    armSwing.forEach((A) => { b.q[A.joint] = home[A.joint]; });
  });
  resolve(m, b.q);
  const tr = b.finish(name, title);
  tr.measures.stance_drift_mm = round(slip * 1000, 3);
  tr.measures.stride_m = round(S, 4); tr.measures.cycle_s = round(T, 3); tr.measures.speed_m_s = round(v, 3); tr.measures.body_height_m = round(st.h, 4);
  tr.measures.walk_t0 = round(tWalk0, 3); tr.measures.walk_t1 = round(tWalk1, 3);
  tr.notes.push(`${biped ? "Step cycle" : legs.length === 6 ? "Tripod gait" : legs.length === 4 ? "Trot" : "Wave gait"}: stride ${(S * 1000).toFixed(0)} mm, cycle ${T.toFixed(2)} s, ${legs.length} feet, each planted for ${(duty * 100).toFixed(0)} % of the cycle; body at ${(st.h * 1000).toFixed(0)} mm.`);
  if (biped) tr.notes.push("The body sways over the planted foot before the other one lifts (a slow, statically balanced walk), not a dynamic walk.");
  if (slip > 0.002) tr.warnings.push(`A planted foot drifts by up to ${(slip * 1000).toFixed(1)} mm (${worstLeg}, ${slipFrames} leg-frames): that leg cannot hold its foothold there.`);
  void mul; void axisAngle; void qVector;
  return tr;
}
function rotFor(st: Stance, i: number, yaw: number): T34 | null {
  const R = st.rot[i]; if (!R) return null;
  const c = cos(yaw), s = sin(yaw);
  return Float64Array.of(c * R[0] - s * R[4], c * R[1] - s * R[5], c * R[2] - s * R[6], 0, s * R[0] + c * R[4], s * R[1] + c * R[5], s * R[2] + c * R[6], 0, R[8], R[9], R[10], 0);
}
