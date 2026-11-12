// @ttr/motion: motions for any robot (joint tour, purpose demos, gaits, human motion on a wearable), inverse kinematics,
// self-collision over a motion, and trajectory exports. Pure TypeScript: it runs in Node, in the engine's Web Worker and
// in tests, and gives the same bytes in each.
import type { RobotSpecification } from "@ttr/robot-schema";
import { robotOf, driveLimits } from "./motions.ts";
import { solveIk, defaultJoints } from "./ik.ts";
import { fk, qVector, qRecord, jointFrame, linkT } from "./model.ts";
import { type V3, type T34, fromXyzRpy, fromPose7, apply, ident } from "./math.ts";
import { rangeOfMotion as rom } from "./human.ts";

export { motions, motion, robotOf, checkTrajectory, driveLimits, type MotionInfo, type MotionOptions, wheelSlip, basePose } from "./motions.ts";
export type { Trajectory, Prop, Segment, LimitReport } from "./traj.ts";
export { collisionModel, checkCollisions, poseCollisions, type CollisionModel, type CollisionReport, type LinkMesh } from "./collision.ts";
export { toCsv, baseCsv, toJointTrajectoryYaml, replayScript, toBvh } from "./export.ts";
export { compile, fk, qVector, qRecord, type Model } from "./model.ts";
export { analyze, type Semantics } from "./semantics.ts";
export { HUMAN_MOTIONS } from "./human.ts";

export interface IkTarget { xyz: V3; rpy?: V3; quat?: [number, number, number, number]; }
export interface IkOpts {
  /** point on the link (link frame); default: the robot's tool point when `link` is its tool link, else the link origin */
  point?: V3;
  /** start from these joint values (default: the design's home pose) */
  seed?: Record<string, number>;
  /** joints the solve may move (default: every motor-driven joint on the chain to the link; a wearable's limb joints too) */
  joints?: string[];
  /** root pose [x y z qx qy qz qw] (default: at the origin) */
  base?: number[];
  /** match the target's orientation too (needs rpy or quat) */
  orientation?: boolean;
  restarts?: number;
  iterations?: number;
}
export interface IkAnswer {
  values: Record<string, number>;
  reached: boolean;
  error_mm: number; error_deg: number;
  /** where the point ended up (world) */
  position: V3;
  at_limit: string[];
}

/** Inverse kinematics: joint values that bring a point on `link` to a world pose, within joint limits, and whether it got there. */
export function ik(spec: RobotSpecification, link: string, target: IkTarget, o: IkOpts = {}): IkAnswer {
  const { m, sem } = robotOf(spec);
  const li = m.link.get(link); if (li === undefined) throw new Error(`no link '${link}'`);
  const arm = sem.arms.find((a) => a.tip === li), leg = sem.legs.find((l) => l.foot === li);
  const point = o.point ?? arm?.point ?? leg?.point ?? [0, 0, 0];
  const allowed = (i: number) => !m.joints[i].passive || sem.anatomy.some((a) => a.joint === i);
  const joints = o.joints ? o.joints.map((n) => { const i = m.joint.get(n); if (i === undefined) throw new Error(`no joint '${n}'`); return i; }) : defaultJoints(m, li).filter(allowed);
  const base = o.base ? fromPose7(o.base) : ident();
  const seed = qVector(m, { ...sem.home, ...(o.seed ?? {}) });
  const rot = o.orientation ? (target.quat ? fromPose7([0, 0, 0, ...target.quat]) : target.rpy ? fromXyzRpy([0, 0, 0], target.rpy) : undefined) : undefined;
  const r = solveIk(m, { link: li, point, pos: target.xyz, rot, rotWeight: 1 }, { joints, seed, base, restarts: o.restarts ?? 8, iterations: o.iterations ?? 150, rest: 0.05 });
  const W = fk(m, r.q, base), p = apply(W, point, 12 * li);
  return {
    values: qRecord(m, r.q, joints), reached: r.reached, error_mm: +(r.error_m * 1000).toFixed(3), error_deg: +((r.error_rad * 180) / Math.PI).toFixed(3),
    position: p.map((x) => +x.toFixed(6)) as V3, at_limit: r.atLimit.map((i) => m.joints[i].name),
  };
}

/** Move the body with the feet planted: leg joints for a root pose, each foot held where it is at `seed` and `seedBase` (or given in `feet`). */
export function bodyIk(spec: RobotSpecification, base: number[], o: { seed?: Record<string, number>; seedBase?: number[]; feet?: Record<string, V3> } = {}) {
  const { m, sem } = robotOf(spec), q = qVector(m, { ...sem.home, ...(o.seed ?? {}) });
  const W0 = fk(m, q, o.seedBase ? fromPose7(o.seedBase) : ident()), B = fromPose7(base);
  let worst = 0, reached = true, cur = q;
  const at: string[] = [];
  for (const L of sem.legs) {
    const hold = o.feet?.[m.links[L.foot]] ?? apply(W0, L.point, 12 * L.foot);
    const rot = L.joints.length >= 5 ? new Float64Array(linkT(W0, L.foot)) as T34 : undefined;
    const r = solveIk(m, { link: L.foot, point: L.point, pos: hold as V3, rot, rotWeight: 0.5 }, { joints: L.joints, seed: cur, base: B, restarts: 0, iterations: 60, tolPos: 1e-3 });
    cur = r.q; worst = Math.max(worst, r.error_m); if (!r.reached) reached = false; at.push(...r.atLimit.map((i) => m.joints[i].name));
  }
  return { values: qRecord(m, cur, sem.legs.flatMap((l) => l.joints)), reached, error_mm: +(worst * 1000).toFixed(3), at_limit: at };
}

/** What a robot's joints are for, as the site needs it for dragging: tool points, feet, wheels, the anatomy of a body. */
export function kinematics(spec: RobotSpecification) {
  const { m, sem } = robotOf(spec), W = fk(m, qVector(m, sem.home));
  return {
    purpose: sem.purpose, wearable: sem.wearable, humanoid: sem.humanoid, mecanum: sem.mecanum, root: m.links[m.root], home: sem.home,
    tips: sem.arms.map((a) => ({ link: m.links[a.tip], point: a.point, joints: a.joints.map((i) => m.joints[i].name), grip: a.grip.map((i) => m.joints[i].name), reach_m: +a.reach.toFixed(4) })),
    feet: sem.legs.map((l) => ({ link: m.links[l.foot], point: l.point, joints: l.joints.map((i) => m.joints[i].name) })),
    wheels: sem.wheels.map((w) => ({ joint: m.joints[w.joint].name, radius_m: +w.radius.toFixed(5), center: w.center.map((x) => +x.toFixed(5)), axis: w.axis.map((x) => +x.toFixed(5)), mecanum: w.mecanum })),
    anatomy: sem.anatomy.map((a) => ({ joint: m.joints[a.joint].name, movement: a.cls, side: a.side, sign: a.sign })),
    doors: sem.doors.map((st) => st.map((i) => m.joints[i].name)),
    ground_z: +sem.ground.toFixed(5),
    span: +sem.size.toFixed(4),
    drive: sem.wheels.length >= 2 ? (({ v, w }) => ({ speed_m_s: +v.toFixed(4), turn_rad_s: +w.toFixed(4) }))(driveLimits(m, sem)) : null,
    range_of_motion: sem.anatomy.length ? rom(m, sem) : null,
    joints: m.free.map((i) => { const j = m.joints[i], f = jointFrame(m, W, j); return { name: j.name, type: j.type, lower: j.lower, upper: j.upper, velocity: +j.velocity.toFixed(4), passive: j.passive, axis: f.a.map((x) => +x.toFixed(5)) }; }),
  };
}
export const rangeOfMotion = (spec: RobotSpecification) => { const { m, sem } = robotOf(spec); return rom(m, sem); };
