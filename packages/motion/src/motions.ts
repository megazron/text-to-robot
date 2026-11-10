// The motion library. Every robot gets a joint tour; the purpose demo is chosen from what its joints are for (semantics.ts):
// pick and place for arms, open and close for grippers, a drive for wheels, a gait for legs, a step cycle and a wave for
// humanoids, suit-up and human motion for a wearable. Unknown robots get the tour as their demo.
import type { RobotSpecification } from "@ttr/robot-schema";
import { type Model, compile, fk, qVector, resolve, jointFrame, linkBox, linkT, lowestZ } from "./model.ts";
import { type Semantics, type Arm, analyze, toLocal } from "./semantics.ts";
import { Builder, type Trajectory, type Prop, checkTorques, round } from "./traj.ts";
import { solveIk, type IkGoal } from "./ik.ts";
import { type T34, type V3, apply, sub, add, scale, unit, norm, cross, dot, planar, cos, sin, atan2, minJerk, ident, mul, axisAngle, clamp } from "./math.ts";
import { gait, gaitAvailable } from "./gait.ts";
import { HUMAN_MOTIONS, humanMotion, suitUp, doorsOnly, } from "./human.ts";
import { checkCollisions, countCollisions, groundOf, type CollisionModel } from "./collision.ts";

export interface MotionInfo {
  name: string; title: string; description: string;
  kind: "tour" | "demo" | "human" | "servo";
  moves_base: boolean;
  /** the one the site plays first */
  default?: boolean;
}
export interface MotionOptions { fps?: number; collision?: CollisionModel | null; /** a gait: walk this far (m, robot frame) instead of the demo path */ to?: [number, number]; }

export interface Robot { m: Model; sem: Semantics; }
const cache = new WeakMap<RobotSpecification, Robot>();
export function robotOf(spec: RobotSpecification): Robot {
  let r = cache.get(spec);
  if (!r) { const m = compile(spec); r = { m, sem: analyze(m) }; cache.set(spec, r); }
  return r;
}

export function motions(spec: RobotSpecification): MotionInfo[] {
  const { m, sem } = robotOf(spec), out: MotionInfo[] = [];
  const tour: MotionInfo = { name: "tour", title: "Joint tour", description: sem.wearable ? "every limb joint through the range the armour allows, then every door and latch" : "every joint through its full limits, one after another, then all together", kind: "tour", moves_base: false };
  if (sem.wearable) {
    out.push({ name: "suit_up", title: "Suit up", description: "latches lift, the doors open on their servos stage by stage, the wearer steps in from behind, and it all closes and latches", kind: "servo", moves_base: false, default: true });
    out.push({ name: "doors", title: "Doors only", description: "each door group opens and closes on its servos, with angles and timing", kind: "servo", moves_base: false });
    for (const h of HUMAN_MOTIONS) out.push({ name: h.name, title: h.title, description: `${h.description} (human motion: the wearer moves the limbs)`, kind: "human", moves_base: h.name === "walk" });
    out.push(tour);
    return out;
  }
  if (sem.purpose === "humanoid") {
    if (gaitAvailable(m, sem)) out.push({ name: "step", title: "Step cycle", description: "walks forward and back with the body shifting over the planted foot", kind: "demo", moves_base: true, default: true });
    if (waveArm(sem)) out.push({ name: "wave", title: "Wave", description: "raises an arm and waves", kind: "demo", moves_base: false, default: !out.length });
  } else if (sem.purpose === "legged") {
    if (gaitAvailable(m, sem)) out.push({ name: "gait", title: sem.legs.length === 6 ? "Tripod gait" : sem.legs.length === 4 ? "Trot" : "Walk", description: "walks forward, turns round and walks back, feet planted while they carry the body", kind: "demo", moves_base: true, default: true });
  }
  if (sem.wheels.length >= 2 && !sem.legs.length) out.push({ name: "drive", title: "Drive", description: sem.mecanum ? "forward, reverse, a turn on the spot and a sideways strafe, wheels turning at the ground speed" : "forward, reverse and a turn on the spot, wheels turning at the ground speed", kind: "demo", moves_base: true, default: !out.length });
  const arm = pickArm(sem);
  if (arm && arm.grip.length) out.push({ name: "pick_place", title: "Pick and place", description: "reaches, closes the gripper on a block, lifts it and puts it down elsewhere", kind: "demo", moves_base: false, default: !out.length });
  else if (sem.purpose !== "humanoid" && waveArm(sem)) out.push({ name: "wave", title: "Wave", description: "raises an arm and waves", kind: "demo", moves_base: false, default: !out.length });
  if (sem.grips.length) out.push({ name: "grip", title: "Open and close", description: "the gripper opens and closes", kind: "demo", moves_base: false, default: !out.length });
  out.push({ ...tour, default: !out.length });
  return out;
}

export function motion(spec: RobotSpecification, name: string, o: MotionOptions = {}): Trajectory {
  const { m, sem } = robotOf(spec), fps = o.fps ?? 30;
  const list = motions(spec);
  if (name === "demo" || name === "default") name = (list.find((x) => x.default) ?? list[0]).name;
  const info = list.find((x) => x.name === name);
  if (!info) throw new Error(`no motion '${name}' for ${spec.robot_name}: ${list.map((x) => x.name).join(", ")}`);
  const b = new Builder(m, qVector(m, sem.home), fps);
  let tr: Trajectory;
  switch (name) {
    case "tour": tr = tour(m, sem, b, o.collision ?? null); break;
    case "pick_place": tr = pickPlace(m, sem, b, o.collision ?? null); break;
    case "grip": tr = grip(m, sem, b); break;
    case "drive": tr = drive(m, sem, b); break;
    case "wave": tr = wave(m, sem, b); break;
    case "gait": case "step": tr = gait(m, sem, b, name, info.title, o.to); break;
    case "suit_up": tr = suitUp(m, sem, b); break;
    case "doors": tr = doorsOnly(m, sem, b); break;
    default: tr = humanMotion(m, sem, b, name);
  }
  tr.title = info.title;
  if (sem.wearable) tr.notes.unshift("Wearable: limbs follow the wearer (human motion); only the doors are motorised.");
  // torque: the stretches where the robot's base is held (arms, the suit's servos); legs and wheels carry the body, which the design's sizing covers
  const skip = new Set<number>([...sem.legs.flatMap((l) => l.joints), ...sem.wheels.map((w) => w.joint)]);
  checkTorques(m, tr, b.frames, skip);
  if (o.collision) {
    // feet and wheels touch the floor by design; a tour on a stand has no floor
    const exempt = new Set<number>([...sem.legs.flatMap((l) => [...m.below(l.foot)]), ...sem.wheels.flatMap((w) => [...m.below(w.link)])]);
    checkCollisions(o.collision, tr, b.frames, { floor: !(name === "tour" && tr.base), ground: tr.base ? 0 : undefined, exempt });
  }
  return tr;
}

// ---------------------------------------------------------------------------------------------------------------- tour
function tourJoints(m: Model, sem: Semantics): number[] {
  return m.free.filter((i) => {
    const j = m.joints[i];
    if (!j.passive) return true;
    return sem.anatomy.some((a) => a.joint === i);   // a wearable's limbs are passive but they are what moves
  });
}
function tour(m: Model, sem: Semantics, b: Builder, cm: CollisionModel | null): Trajectory {
  const home = new Float64Array(b.q), joints = tourJoints(m, sem);
  const latchOpen = new Map(sem.latches.map((i) => [i, far(m, i)]));
  const doorSet = new Set([...sem.doors.flat(), ...sem.faceplate]);
  const mobile = sem.legs.length > 0 || sem.wheels.length > 0;
  // with the parts' solids at hand, each joint sweeps from the pose of the others that keeps it clear of the robot (and of the
  // floor for a robot fixed to it): home first, then the arm raised, all at zero, all mid-range
  const exempt = new Set<number>([...sem.legs.flatMap((l) => [...m.below(l.foot)]), ...sem.wheels.flatMap((w) => [...m.below(w.link)])]);
  const floor0 = mobile || !cm ? undefined : groundOf(cm, { q: home, base: null });
  const contexts = cm ? [home, raised(m, home, joints), resolve(m, new Float64Array(m.joints.length)), mid(m, home, joints)] : [home];
  const sweepHits = (from: Float64Array, ctx: Float64Array, i: number) => {
    const j = m.joints[i], lo = Number.isFinite(j.lower) ? j.lower : -Math.PI, hi = Number.isFinite(j.upper) ? j.upper : Math.PI;
    // getting there (every joint that changes), then the sweep itself
    const path = Array.from({ length: 7 }, (_, k) => { const q = new Float64Array(from); for (let x = 0; x < q.length; x++) q[x] = from[x] + (ctx[x] - from[x]) * minJerk(k / 6); return { q: resolve(m, q), base: null }; });
    const frames = Array.from({ length: 13 }, (_, k) => { const q = new Float64Array(ctx); q[i] = lo + ((hi - lo) * k) / 12; return { q: resolve(m, q), base: null }; });
    return (path.some((f, k) => k && f.q.some((v, x) => v !== path[0].q[x])) ? countCollisions(cm!, path, { ground: floor0, exempt }) : 0) + countCollisions(cm!, frames, { ground: floor0, exempt });
  };
  // a context changes only the joints on the swept joint's own chain (above it and what it carries)
  const onChain = (i: number) => { const s = new Set<number>(); for (let x = m.parentJoint[m.joints[i].parent]; x >= 0; x = m.parentJoint[m.joints[x].parent]) s.add(x); for (const l of m.below(m.joints[i].child)) if (m.parentJoint[l] >= 0) s.add(m.parentJoint[l]); return s; };
  const localise = (base: Float64Array, cand: Float64Array, i: number) => { const keep = onChain(i), q = new Float64Array(base); for (const x of keep) q[x] = cand[x]; return resolve(m, q); };
  b.hold(0.4);
  if (latchOpen.size) b.segment("latches lift", () => b.move(latchOpen, { minT: 0.5 }));
  let ctxNow: Float64Array = home;
  const unclear: string[] = [];
  for (const i of joints) {
    if (latchOpen.has(i)) continue;
    const j = m.joints[i];
    let ctx: Float64Array = ctxNow;
    if (cm && j.type !== "continuous" && !doorSet.has(i)) {
      let best = Infinity;
      for (const c0 of [ctxNow, home, ...contexts, folded(m, raised(m, home, joints), i, joints), folded(m, home, i, joints)]) { const c = c0 === ctxNow ? c0 : localise(ctxNow, c0, i); const n = sweepHits(ctxNow, c, i); if (n < best) { best = n; ctx = c; } if (n === 0) break; }
      if (best > 0) unclear.push(j.name);
    }
    if (ctx !== ctxNow) { b.segment(`ready for ${j.name}`, () => b.move(new Map(joints.filter((x) => x !== i && !latchOpen.has(x)).map((x) => [x, ctx[x]])), { minT: 0.8 })); ctxNow = ctx; }
    const h = b.q[i];
    b.focus = i;
    b.segment(j.name, () => {
      if (j.type === "continuous") { b.move({ [i]: h + Math.PI * 2 }, { minT: 1.4 }); b.move({ [i]: h }, { minT: 1.4 }); return; }
      if (doorSet.has(i)) { b.move({ [i]: far(m, i) }, { minT: 0.9 }); b.hold(0.2); b.move({ [i]: h }, { minT: 0.9 }); return; }
      b.move({ [i]: j.lower }, { minT: 0.55 }); b.hold(0.1); b.move({ [i]: j.upper }, { minT: 0.75 }); b.hold(0.1); b.move({ [i]: h }, { minT: 0.55 });
    });
    b.focus = -1;
  }
  if (ctxNow !== home) b.segment("home", () => b.move(new Map(joints.filter((x) => !latchOpen.has(x)).map((x) => [x, home[x]])), { minT: 0.8 }));
  if (latchOpen.size) b.segment("latches close", () => b.move(new Map(sem.latches.map((i) => [i, home[i]])), { minT: 0.5 }));
  const together = joints.filter((i) => !latchOpen.has(i) && !doorSet.has(i));
  if (together.length > 1) {
    const at = (k: number, amp: number) => new Map(together.map((i) => { const j = m.joints[i]; return [i, j.type === "continuous" ? home[i] + k * Math.PI : home[i] + amp * ((k < 0 ? j.lower : j.upper) - home[i])]; }));
    // as far as all of them can go together without the robot meeting itself
    let amp = 0.55;
    if (cm) for (const a of [0.55, 0.4, 0.28, 0.18, 0.1]) {
      amp = a;
      const frames = [-1, -0.5, 0.5, 1].map((k) => { const q = new Float64Array(home); for (const [i, v] of at(k < 0 ? -1 : 1, a * Math.abs(k))) q[i] = v; return { q: resolve(m, q), base: null }; });
      if (countCollisions(cm, frames, { ground: floor0, exempt }) === 0) break;
    }
    b.segment("all together", () => { b.move(at(-1, amp), { minT: 1.2 }); b.hold(0.2); b.move(at(1, amp), { minT: 1.6 }); b.hold(0.2); b.move(new Map(together.map((i) => [i, home[i]])), { minT: 1.2 }); });
  }
  b.hold(0.4);
  const tr = b.finish("tour", "Joint tour");
  if (unclear.length) tr.notes.push(`No pose of the other joints lets ${unclear.join(", ")} sweep its full range clear of the robot${mobile ? "" : " and the floor"}: those frames are marked.`);
  if (mobile) standOff(m, b, tr, "On a stand: the tour holds the body still and clear of the floor so every joint can swing freely.");
  return tr;
}
/** the joints with a level axis set to lift what they carry as high as they can, from the base out */
function raised(m: Model, home: Float64Array, joints: number[]): Float64Array {
  const q = new Float64Array(home);
  for (const i of joints) {
    const j = m.joints[i]; if (j.type !== "revolute") continue;
    const f = jointFrame(m, fk(m, resolve(m, q)), j); if (Math.abs(f.a[2]) > 0.7) continue;
    let best = q[i], bz = -Infinity;
    for (let k = 0; k <= 8; k++) { const v = j.lower + ((j.upper - j.lower) * k) / 8; q[i] = v; const z = lowestZ(m, fk(m, resolve(m, q)), m.below(j.child)); if (z > bz + 1e-4) { bz = z; best = v; } }
    q[i] = best;
  }
  return resolve(m, q);
}
/** what joint i carries folded in as close to it as the joints after it allow */
function folded(m: Model, ctx: Float64Array, i: number, joints: number[]): Float64Array {
  const q = new Float64Array(ctx), J = m.joints[i], kids = m.below(J.child);
  const at = () => jointFrame(m, fk(m, resolve(m, q)), J).p;
  for (const x of joints) {
    const j = m.joints[x]; if (x === i || j.type !== "revolute" || !kids.has(j.child)) continue;
    let best = q[x], bd = Infinity;
    for (let k = 0; k <= 8; k++) {
      q[x] = j.lower + ((j.upper - j.lower) * k) / 8;
      const W = fk(m, resolve(m, q)), o = at(); let d = 0;
      for (const l of m.below(j.child)) { const bx = linkBox(m.spec.links[l]); if (bx) for (const c of [bx.min, bx.max]) { const p = apply(W, c, 12 * l); d = Math.max(d, norm(sub(p, o))); } }
      if (d < bd - 1e-4) { bd = d; best = q[x]; }
    }
    q[x] = best;
  }
  return resolve(m, q);
}
function mid(m: Model, home: Float64Array, joints: number[]): Float64Array {
  const q = new Float64Array(home);
  for (const i of joints) { const j = m.joints[i]; if (j.type === "revolute" || j.type === "prismatic") q[i] = (j.lower + j.upper) / 2; }
  return resolve(m, q);
}
/** the far end of a joint's travel from zero (a door's open position) */
const far = (m: Model, i: number) => { const j = m.joints[i]; return Math.abs(j.lower) > Math.abs(j.upper) ? j.lower : j.upper; };
/** lift a fixed-base motion so nothing goes through the floor (the robot is held on a stand) */
function standOff(m: Model, b: Builder, tr: Trajectory, note: string) {
  const g = robotGround(m, b.frames[0].q);
  let low = Infinity;
  const step = Math.max(1, Math.floor(b.frames.length / 200));
  for (let k = 0; k < b.frames.length; k += step) low = Math.min(low, lowestZ(m, fk(m, b.frames[k].q)));
  const lift = Math.max(0, g - low) + 0.01 * (g > low ? 1 : 0);
  const base = planar(0, 0, -g + lift, 0);
  for (const f of b.frames) f.base = base;
  tr.base = b.frames.map(() => [0, 0, round(-g + lift), 0, 0, 0, 1]);
  if (lift > 0) tr.notes.push(note);
}
/** world z of the lowest point at a pose: where the floor is when the robot stands */
export const robotGround = (m: Model, q: Float64Array) => lowestZ(m, fk(m, q));

// ---------------------------------------------------------------------------------------------------- pick and place
export function pickArm(sem: Semantics): Arm | undefined {
  const withGrip = sem.arms.filter((a) => a.grip.length && a.joints.length >= 2);
  const pool = withGrip.length ? withGrip : sem.arms.filter((a) => a.joints.length >= 2);
  return pool.sort((a, b) => b.joints.length - a.joints.length || Math.abs(a.side) - Math.abs(b.side))[0];
}
function pickPlace(m: Model, sem: Semantics, b: Builder, cm: CollisionModel | null): Trajectory {
  const arm = pickArm(sem)!, home = new Float64Array(b.q), W0 = fk(m, home);
  const tip0 = apply(W0, arm.point, 12 * arm.tip), first = jointFrame(m, W0, m.joints[arm.joints[0]]);
  const ground = robotGround(m, home);
  const R = arm.reach, yaw = arm.joints.some((i) => { const a = jointFrame(m, W0, m.joints[i]).a; return Math.abs(a[2]) > 0.9 && m.joints[i].type === "revolute"; });
  let dir = sub(tip0, first.p); dir[2] = 0; dir = norm(dir) < 1e-3 ? [1, 0, 0] : unit(dir);
  if (!yaw) {
    // no turning joint: the arm works in the plane its first joint turns in
    const n = unit(cross(first.a, [0, 0, 1]));
    if (norm(cross(first.a, [0, 0, 1])) > 0.5) dir = dot(n, sub(tip0, first.p)) >= 0 ? n : scale(n, -1);
  }
  const rotz = (v: V3, a: number): V3 => [v[0] * cos(a) - v[1] * sin(a), v[0] * sin(a) + v[1] * cos(a), v[2]];
  const size = clamp(0.09 * R, 0.015, 0.05);
  const down = arm.joints.length >= 6 ? toolDown(m, arm, W0) : undefined;
  const solve = (p: V3, seed: Float64Array, rot?: T34) => {
    const goal: IkGoal = { link: arm.tip, point: arm.point, pos: p, rot, rotWeight: 0.6 };
    let r = solveIk(m, goal, { joints: arm.joints, seed, restarts: 6, rest: 0.3 });
    if (rot && !r.reached) { const r2 = solveIk(m, { ...goal, rot: undefined }, { joints: arm.joints, seed, restarts: 6, rest: 0.3 }); if (r2.reached) r = r2; }
    return r;
  };
  // the work spots: in front of the first joint, on the floor the robot stands on; the best pair this arm reaches
  const plans: { pick: V3; place: V3 }[] = [];
  for (const f of [0.62, 0.52, 0.72, 0.42, 0.82, 0.34]) {
    const hz = [ground + size / 2, first.p[2] - 0.15 * R, first.p[2], tip0[2], tip0[2] - 0.08 * R];
    for (const z of hz) {
      if (yaw) plans.push({ pick: add(first.p, scale(rotz(dir, 0.6), f * R)).map((x, k) => (k === 2 ? z : x)) as V3, place: add(first.p, scale(rotz(dir, -0.6), f * R)).map((x, k) => (k === 2 ? z : x)) as V3 });
      else {
        // no turning joint: the arm works in the plane through its tool point
        const o = sub(tip0, scale(dir, dot(sub(tip0, first.p), dir)));
        plans.push({ pick: add(o, scale(dir, f * R)).map((x, k) => (k === 2 ? z : x)) as V3, place: add(o, scale(dir, f * R * 0.72)).map((x, k) => (k === 2 ? z : x)) as V3 });
      }
    }
  }
  type Plan = { pick: V3; place: V3; qs: Float64Array[]; lift: number };
  let plan: Plan | null = null, firstBad: Plan | null = null;
  for (const pl of plans) {
    const lift = Math.max(0.05, 0.28 * R), qs: Float64Array[] = [];
    const pts = [add(pl.pick, [0, 0, lift]), pl.pick, add(pl.pick, [0, 0, lift]), add(pl.place, [0, 0, lift]), pl.place, add(pl.place, [0, 0, lift])];
    let seed: Float64Array = home, ok = true;
    for (const p of pts) {
      let r = solve(p, seed, down);
      // keep the fingers off the floor: raise the grasp by what the lowest finger box dips below it
      if (r.reached) {
        const dip = ground + 0.002 - lowestZ(m, fk(m, r.q), m.below(m.joints[arm.joints[arm.joints.length - 1]].child));
        if (dip > 0) { p[2] += dip; r = solve(p, r.q, down); }
      }
      if (!r.reached) { ok = false; break; }
      qs.push(r.q); seed = r.q;
    }
    // with the solids at hand: a plan whose moves (joint space, between its key poses) run the arm into the robot is passed over
    if (ok && cm) {
      const keys = [home, ...qs, home], frames: { q: Float64Array; base: null }[] = [];
      for (let k = 1; k < keys.length; k++) for (let u = 0; u <= 6; u++) { const q = new Float64Array(keys[k - 1]); for (const x of arm.joints) q[x] = keys[k - 1][x] + (keys[k][x] - keys[k - 1][x]) * minJerk(u / 6); frames.push({ q: resolve(m, q), base: null }); }
      if (countCollisions(cm, frames, { ground: groundOf(cm, { q: home, base: null }), exempt: new Set() }) > 0) { firstBad ??= { ...pl, qs, lift }; ok = false; }
    }
    if (ok) { plan = { ...pl, qs, lift }; break; }
  }
  if (!plan && firstBad) { plan = firstBad; b.notes.push("Every pick and place spot this arm reaches makes it touch the robot on the way: the frames are marked."); }
  const open = new Map(arm.grip.map((i) => [i, sem.grips.find((g) => g.joint === i)!.open]));
  const shut = new Map(arm.grip.map((i) => [i, closeOn(m, sem, i, size)]));
  if (!plan) {
    b.notes.push("No pick and place spot this arm reaches was found: showing the gripper and the arm's reach instead.");
    b.segment("open", () => b.move(open)); b.segment("close", () => b.move(shut)); b.segment("home", () => b.move(new Map(arm.grip.map((i) => [i, home[i]]))));
    return b.finish("pick_place", "Pick and place");
  }
  const armMove = (q: Float64Array, extra?: Map<number, number>, minT = 0.6) => { const t = new Map(arm.joints.map((i) => [i, q[i]])); if (extra) for (const [k, v] of extra) t.set(k, v); b.move(t, { minT }); };
  b.hold(0.4);
  b.segment("reach", () => { armMove(plan!.qs[0], open, 1.0); armMove(plan!.qs[1], undefined, 0.7); });
  const grasp = b.frames.length;
  b.segment("close gripper", () => { b.move(shut, { minT: 0.5 }); b.hold(0.2); });
  const carried = b.frames.length;
  b.segment("lift", () => armMove(plan!.qs[2], undefined, 0.6));
  b.segment("carry", () => armMove(plan!.qs[3], undefined, 1.0));
  b.segment("place", () => armMove(plan!.qs[4], undefined, 0.7));
  const release = b.frames.length;
  b.segment("open gripper", () => { b.move(open, { minT: 0.4 }); b.hold(0.15); });
  b.segment("retreat", () => armMove(plan!.qs[5], undefined, 0.6));
  b.segment("home", () => armMove(home, new Map(arm.grip.map((i) => [i, home[i]])), 1.0));
  b.hold(0.4);
  const tr = b.finish("pick_place", "Pick and place");
  // the block: on the floor, then carried with the gripper from the moment it closes, then left where it was put down
  const path: (V3 | null)[] = [];
  const at = (k: number) => apply(fk(m, b.frames[k].q), arm.point, 12 * arm.tip);
  const spot0: V3 = [plan.pick[0], plan.pick[1], plan.pick[2]];
  const off = sub(spot0, at(grasp));
  const T0 = linkT(fk(m, b.frames[carried].q), arm.tip), local = toLocal(T0, add(at(carried), off));
  let dropped: V3 | null = null;
  for (let k = 0; k < b.frames.length; k++) {
    if (k < carried) path.push(spot0);
    else if (k < release + 3) path.push(apply(fk(m, b.frames[k].q), local, 12 * arm.tip).map((x) => round(x, 5)) as V3);
    else { dropped ??= [path[k - 1]![0], path[k - 1]![1], plan.place[2]]; path.push(dropped); }
  }
  const prop: Prop = { kind: "box", size: [size, size, size], path };
  tr.props.push(prop);
  // a block picked above the floor sits on a table
  const top = Math.min(plan.pick[2], plan.place[2]) - size / 2;
  if (top > ground + 0.01) {
    // a small stand under each spot, not a table under the robot
    for (const spot of [plan.pick, plan.place]) tr.props.push({ kind: "table", size: [2.4 * size, 2.4 * size, top - ground], path: b.frames.map(() => [round(spot[0], 5), round(spot[1], 5), round(ground, 5)] as V3) });
    for (const p of path) if (p && Math.abs(p[2] - (ground + size / 2)) < 1e-9) p[2] = top + size / 2;
    spot0[2] = top + size / 2;
  }
  tr.notes.push(`The block is ${(size * 1000).toFixed(0)} mm; it is picked ${(norm(sub(plan.pick, first.p)) * 1000).toFixed(0)} mm from the first joint.`);
  return tr;
}
/** where a gripper joint closes on a block of this size: the closed end, or as far as the block lets the fingers come */
function closeOn(m: Model, sem: Semantics, i: number, size: number): number {
  const g = sem.grips.find((x) => x.joint === i)!, j = m.joints[i];
  if (j.type === "prismatic") { const travel = Math.abs(g.open - g.closed); const stop = g.open + Math.sign(g.closed - g.open) * Math.max(0, travel - size / 2); return clamp(stop, Math.min(g.open, g.closed), Math.max(g.open, g.closed)); }
  return g.open + (g.closed - g.open) * 0.7;
}
/** the tool pointing straight down: the home orientation turned so the wrist-to-tool direction points at the floor */
function toolDown(m: Model, arm: Arm, W: Float64Array): T34 | undefined {
  const last = jointFrame(m, W, m.joints[arm.joints[arm.joints.length - 1]]).p, tip = apply(W, arm.point, 12 * arm.tip);
  let a = sub(tip, last); if (norm(a) < 1e-4) return undefined; a = unit(a);
  const want: V3 = [0, 0, -1], ax = cross(a, want), s = norm(ax), c = dot(a, want);
  const R = s < 1e-6 ? (c > 0 ? ident() : axisAngle([1, 0, 0], Math.PI)) : axisAngle(unit(ax), atan2(s, c));
  const T = new Float64Array(linkT(W, arm.tip)), out = mul(R, T);
  return out;
}

// ------------------------------------------------------------------------------------------------------------ gripper
function grip(m: Model, sem: Semantics, b: Builder): Trajectory {
  const home = new Float64Array(b.q);
  const open = new Map(sem.grips.map((g) => [g.joint, g.open])), shut = new Map(sem.grips.map((g) => [g.joint, g.closed]));
  b.hold(0.3);
  for (let k = 0; k < 2; k++) { b.segment("open", () => { b.move(open, { minT: 0.6 }); b.hold(0.3); }); b.segment("close", () => { b.move(shut, { minT: 0.6 }); b.hold(0.3); }); }
  b.segment("home", () => b.move(new Map(sem.grips.map((g) => [g.joint, home[g.joint]])), { minT: 0.5 }));
  b.hold(0.3);
  return b.finish("grip", "Open and close");
}

// -------------------------------------------------------------------------------------------------------------- drive
function drive(m: Model, sem: Semantics, b: Builder): Trajectory {
  const perf = ((m.spec.metadata as any)?.design?.performance ?? {}) as Record<string, number>;
  const W0 = fk(m, b.q), wheels = sem.wheels.map((w) => ({ ...w, c: jointFrame(m, W0, m.joints[w.joint]).p, a: jointFrame(m, W0, m.joints[w.joint]).a }));
  const groundZ = Math.min(...wheels.map((w) => w.c[2] - w.radius));
  const z0 = -groundZ;
  const { v, w: wTop } = driveLimits(m, sem);
  void perf;
  const d = clamp(2.2 * sem.size, 0.35, 2.0);
  let x = 0, y = 0, yaw = 0;
  const angle = new Map(wheels.map((w) => [w.joint, b.q[w.joint]]));
  const prev = new Map(wheels.map((w) => [w.joint, add(w.c, [0, 0, z0])]));
  const place = () => {
    b.base = planar(x, y, z0, yaw);
    const c = cos(yaw), s = sin(yaw);
    for (const w of wheels) {
      const cw: V3 = [x + c * w.c[0] - s * w.c[1], y + s * w.c[0] + c * w.c[1], z0 + w.c[2]], aw: V3 = [c * w.a[0] - s * w.a[1], s * w.a[0] + c * w.a[1], w.a[2]];
      const ds = sub(cw, prev.get(w.joint)!), f = unit(cross(aw, [0, 0, 1]));
      let dth = dot(ds, f) / w.radius;
      if (w.mecanum) {
        // rollers at 45 degrees ("X" layout seen from above): the sideways part of the hub's motion turns the wheel too
        const lat: V3 = [-s, c, 0], sgn = -Math.sign(w.c[0] * w.c[1]) || 1, fx = dot(f, [c, s, 0]);
        dth += (sgn * fx * dot(ds, lat)) / w.radius;
      }
      angle.set(w.joint, angle.get(w.joint)! + dth); b.q[w.joint] = angle.get(w.joint)!; prev.set(w.joint, cw);
    }
  };
  const go = (label: string, dx: number, dy: number, dyaw: number) => b.segment(label, () => {
    const x0 = x, y0 = y, yaw0 = yaw, dist = Math.sqrt(dx * dx + dy * dy);
    const T = Math.max(1.0, (1.875 * dist) / v, (1.875 * Math.abs(dyaw)) / wTop);
    b.run(T, (t) => { const s = minJerk(t / T); const c = cos(yaw0), sn = sin(yaw0); x = x0 + (c * dx - sn * dy) * s; y = y0 + (sn * dx + c * dy) * s; yaw = yaw0 + dyaw * s; place(); });
    b.run(0.3, () => place());
  });
  place(); b.frames[0].base = new Float64Array(b.base!); b.run(0.3, () => place());
  go("forward", d, 0, 0);
  go("reverse", -d, 0, 0);
  go("turn left", 0, 0, Math.PI / 2);
  go("turn right", 0, 0, -Math.PI / 2);
  if (sem.mecanum) { go("strafe left", 0, d / 2, 0); go("strafe right", 0, -d / 2, 0); }
  const tr = b.finish("drive", "Drive");
  tr.notes.push(`Cruise ${v.toFixed(2)} m/s over ${d.toFixed(2)} m; turns at up to ${wTop.toFixed(2)} rad/s. Wheels turn by the ground distance their hubs travel over their radius.`);
  if (!sem.mecanum && wheels.length >= 4) tr.notes.push("Four or more fixed wheels skid sideways when the robot turns on the spot (skid steering); their turn is the rolling part of that motion.");
  // measured: wheel rolling against the ground the hub covers, independently of how it was made
  tr.measures.wheel_speed_error_mm = round(wheelSlip(m, wheels.filter((w) => !w.mecanum), tr) * 1000, 3);
  return tr;
}
/** cruise speed and turn rate a drive uses: 60 % of the design's top speed and turn rate, within the wheels' motor speed */
export function driveLimits(m: Model, sem: Semantics): { v: number; w: number } {
  const perf = ((m.spec.metadata as any)?.design?.performance ?? {}) as Record<string, number>;
  const W0 = fk(m, qVector(m, sem.home));
  const vWheel = Math.min(...sem.wheels.map((w) => m.joints[w.joint].velocity * w.radius));
  const vTop = Math.min(perf.top_speed_m_s > 0 ? perf.top_speed_m_s : 0.6, 0.8 * vWheel);
  const half = Math.max(...sem.wheels.map((w) => { const p = jointFrame(m, W0, m.joints[w.joint]).p; return Math.sqrt(p[0] * p[0] + p[1] * p[1]); }));
  return { v: Math.min(vTop * 0.6, 0.5), w: Math.min(perf.turn_rate_rad_s > 0 ? perf.turn_rate_rad_s : 2, (0.8 * vWheel) / half) * 0.6 };
}
/** limits and collisions of a trajectory made elsewhere (a recorded drag session) */
export function checkTrajectory(spec: RobotSpecification, input: Pick<Trajectory, "name" | "title" | "fps" | "joints" | "q"> & { base?: number[][] | null }, cm?: CollisionModel | null): Trajectory {
  const { m, sem } = robotOf(spec), b = new Builder(m, qVector(m, sem.home), input.fps);
  b.frames.length = 0;
  const cols = input.joints.map((n) => m.joint.get(n));
  input.q.forEach((row, k) => {
    for (let c = 0; c < cols.length; c++) { const i = cols[c]; if (i !== undefined) b.q[i] = row[c]; }
    resolve(m, b.q);
    const bp = input.base?.[k]; b.base = bp ? basePose({ base: [bp] } as Trajectory, 0) : null;
    b.push();
  });
  const tr = b.finish(input.name, input.title);
  const skip = new Set<number>([...sem.legs.flatMap((l) => l.joints), ...sem.wheels.map((w) => w.joint)]);
  checkTorques(m, tr, b.frames, skip);
  if (cm) checkCollisions(cm, tr, b.frames, { floor: false });
  return tr;
}
/** worst gap (m per frame) between a wheel's rolling distance and its hub's travel along its rolling direction */
export function wheelSlip(m: Model, wheels: { joint: number; radius: number }[], tr: Trajectory): number {
  if (!tr.base) return 0;
  let worst = 0;
  for (const w of wheels) {
    const col = tr.joints.indexOf(m.joints[w.joint].name);
    for (let k = 1; k < tr.t.length; k++) {
      const q0 = qVector(m, Object.fromEntries(tr.joints.map((n, c) => [n, tr.q[k - 1][c]]))), q1 = qVector(m, Object.fromEntries(tr.joints.map((n, c) => [n, tr.q[k][c]])));
      const B0 = basePose(tr, k - 1), B1 = basePose(tr, k);
      const W0 = fk(m, q0, B0), W1 = fk(m, q1, B1), f0 = jointFrame(m, W0, m.joints[w.joint]), f1 = jointFrame(m, W1, m.joints[w.joint]);
      const fdir = unit(cross(add(f0.a, f1.a), [0, 0, 1]));
      const hub = dot(sub(f1.p, f0.p), fdir), roll = (tr.q[k][col] - tr.q[k - 1][col]) * w.radius;
      worst = Math.max(worst, Math.abs(hub - roll));
    }
  }
  return worst;
}
export function basePose(tr: Trajectory, k: number): T34 {
  if (!tr.base) return ident();
  const [x, y, z, qx, qy, qz, qw] = tr.base[k];
  return Float64Array.of(1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy), x, 2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx), y, 2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy), z);
}

// --------------------------------------------------------------------------------------------------------------- wave
function waveArm(sem: Semantics) {
  const right = sem.anatomy.filter((a) => a.side < 0 && (a.cls.startsWith("shoulder") || a.cls === "elbow_flex"));
  if (right.some((a) => a.cls === "shoulder_flex" || a.cls === "shoulder_abd")) return true;
  return sem.arms.some((a) => a.joints.length >= 2);
}
function wave(m: Model, sem: Semantics, b: Builder): Trajectory {
  const home = new Float64Array(b.q), side = sem.anatomy.some((a) => a.side < 0 && a.cls.startsWith("shoulder")) ? -1 : 1;
  const A = (cls: string) => sem.anatomy.find((a) => a.side === side && a.cls === cls);
  const flex = A("shoulder_flex"), abd = A("shoulder_abd"), elbow = A("elbow_flex"), rotj = A("shoulder_rot");
  const up = new Map<number, number>();
  const set = (a: typeof flex, v: number) => { if (a) up.set(a.joint, clampJ(m, a.joint, home[a.joint] + a.sign * v)); };
  if (abd) { set(abd, 1.35); set(flex, 0.25); } else set(flex, 2.4);
  set(elbow, 1.2);
  let osc = elbow ?? rotj, amp = 0.35;
  if (!flex && !abd) {
    // an arm without anatomy names: lift its second joint halfway and wave with the last
    const arm = pickArm(sem)!; const j1 = arm.joints[Math.min(1, arm.joints.length - 1)], jl = arm.joints[arm.joints.length - 1];
    const J1 = m.joints[j1]; up.set(j1, home[j1] + 0.5 * ((Math.abs(J1.upper - home[j1]) > Math.abs(J1.lower - home[j1]) ? J1.upper : J1.lower) - home[j1]));
    osc = { joint: jl, cls: "elbow_flex", side, sign: 1 }; amp = 0.3;
  }
  b.hold(0.3);
  b.segment("raise", () => b.move(up, { minT: 1.0 }));
  const base = osc ? (up.get(osc.joint) ?? home[osc.joint]) : 0;
  if (osc) b.segment("wave", () => { for (let k = 0; k < 3; k++) { b.move({ [osc!.joint]: clampJ(m, osc!.joint, base + amp) }, { minT: 0.35 }); b.move({ [osc!.joint]: clampJ(m, osc!.joint, base - amp) }, { minT: 0.35 }); } b.move({ [osc!.joint]: base }, { minT: 0.3 }); });
  b.segment("lower", () => b.move(new Map([...up.keys()].map((i) => [i, home[i]])), { minT: 1.0 }));
  b.hold(0.3);
  const tr = b.finish("wave", "Wave");
  if (sem.legs.length || sem.wheels.length) {
    const g = robotGround(m, home); tr.base = b.frames.map(() => [0, 0, round(-g), 0, 0, 0, 1]); for (const f of b.frames) f.base = planar(0, 0, -g, 0);
  }
  return tr;
}
export const clampJ = (m: Model, i: number, v: number) => clamp(v, m.joints[i].lower, m.joints[i].upper);
export { resolve, linkBox };
