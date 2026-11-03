// Serial arms built like real open-source servo arms (SO-101 / Koch / OpenManipulator class):
// every joint is a bought actuator, every link a printed bracket bolted to its horn and
// cradling the next actuator by its case screws. Actuators are sized from the exact
// worst-case gravity torque of the built arm, holding the payload fully stretched out.
import type { RobotSpecification, SensorType } from "@ttr/robot-schema";
import { part, rating, bboxM, hornRadiusMm, type Vec3 } from "@ttr/parts";
import { Assembly } from "../assembly.ts";
import { frame, invert, mul, apply, I4, translation, type Mat4, type Op } from "@ttr/solid";
export { linkOps as servoLinkOps, gripperOps as servoGripperOps };
import { worstTorques, axisInertias, pointWorld, totalMass, type PointLoad } from "../kin.ts";
import { LADDERS, choose, evaluate, passes, ladderFor, type Ladder, DYNAMIC_FACTOR } from "../sizing.ts";

export interface ArmRequest {
  name?: string; dof: number; reachM?: number; payloadKg?: number; gripper?: boolean; budget?: number; prompt?: string; ladder?: Ladder;
  /** fixed axis-to-axis lengths (m) that override the reach split */
  segments?: { upper_arm?: number; forearm?: number };
  /** wrist-mounted sensors (camera / depth); an IMU sits in the base */
  sensors?: SensorType[];
  /** joint sequence overriding the default for `dof` (Y = yaw about the stack, P = pitch, R = roll) */
  kinds?: Kind[];
  /** side of the square base plate (mm); default scales with reach (min 110) */
  basePlateMm?: number;
  /** highest voltage the actuator supply reaches (e.g. 12.6 V for a full 3S pack): actuators rated below it / 1.1 are not used */
  maxSupplyV?: number;
  /** gravity in the arm's base frame when it is mounted tilted or sideways (default: upright, [0, 0, -9.81]) */
  gravity?: Vec3;
  /** only these actuators may be used (e.g. the prompt named "SG90 servos"); a failing check then says what it would take */
  onlyActuators?: string[];
}
export type Kind = "Y" | "P" | "R";
const KINDS: Record<number, Kind[]> = { 1: ["Y"], 2: ["P", "P"], 3: ["Y", "P", "P"], 4: ["Y", "P", "P", "P"], 5: ["Y", "P", "P", "P", "R"], 6: ["Y", "P", "P", "R", "P", "R"], 7: ["Y", "P", "R", "P", "R", "P", "R"] };
const PLATE = 4; // horn plate thickness, mm
const WALL = 3;
// pitch joints are clevises: horn cheek + bearing cheek. The bearing (625ZZ, 5x16x5) turns on an M5 bolt that screws into
// a heat-set insert in a boss on the back of the servo's cradle, coaxial with the output.
const BOSS = 5, BOSS_D = 11, BEAR_D = 16.15, BEAR_W = 5, IDLER_T = 7, GAP = 1.2; // GAP holds an M5 washer
/** z (servo frame, output +z) of the bearing cheek's inner face for a pitch actuator */
const idlerZ = (key: string) => bodyMm(key).min[2] - WALL - BOSS - GAP;
/** boss on the back of a pitch actuator's cradle, coaxial with its output (servo frame) */
const bossOps = (key: string): Op[] => { const zb = bodyMm(key).min[2] - WALL;
  return [{ op: "rod", a: [0, 0, zb + 1], b: [0, 0, zb - BOSS], r: BOSS_D / 2 }, { op: "hole", a: [0, 0, zb - BOSS - 1], b: [0, 0, zb - BOSS + 9], d: 6.4 }]; };

const bodyMm = (key: string) => { const b = bboxM(key); return { min: b.min.map((x) => x * 1000) as Vec3, max: b.max.map((x) => x * 1000) as Vec3 }; };
/** Depth of the body behind the output face (mm, positive). */
const depth = (key: string) => -bodyMm(key).min[2];
/** Farthest body point from the output axis (mm). */
const bodyRadius = (key: string) => { const b = bodyMm(key); return Math.max(...[b.min[0], b.max[0]].flatMap((x) => [b.min[1], b.max[1]].map((y) => Math.hypot(x, y)))); };

interface JointPlan { kind: Kind; key: string; W: Mat4; side: number; limit: [number, number]; name: string; }

function plan(kinds: Kind[], keys: string[], lengths: number[], gripKey: string | null) {
  const joints: JointPlan[] = [];
  let z = 0, side = 1, prev: JointPlan | null = null;
  const names = nameJoints(kinds);
  kinds.forEach((kind, i) => {
    const key = keys[i], d = depth(key), b = bodyMm(key);
    if (!prev) z = 6 + WALL + (kind === "P" ? -b.min[0] : d) + 1;            // base plate + cradle floor
    else if (prev.kind !== "P") z += PLATE + WALL + (kind === "P" ? -b.min[0] : d) + 2; // stacked on an axial horn
    else {
      const sweep = bodyRadius(prev.key) + WALL + 3;                          // clear the previous actuator at any angle
      z += Math.max(lengths[i - 1] ?? 0, sweep + WALL + (kind === "P" ? -b.min[0] : d));
    }
    if (kind === "P") { side = prev?.kind === "P" ? -prev.side : 1; }
    const W = kind === "P" ? frame([0, side * d / 2, z], [0, side, 0], [0, 0, 1]) : frame([0, 0, z], [0, 0, 1], [1, 0, 0]);
    const lim: [number, number] = kind !== "P" ? [-2.97, 2.97] : i === kinds.indexOf("P") ? [-1.75, 1.75] : [-2.3, 2.3];
    joints.push({ kind, key, W, side, limit: lim, name: names[i] });
    prev = joints[joints.length - 1];
  });
  let G: Mat4 | null = null;
  if (gripKey && prev) {
    const p = prev as JointPlan, b = bodyMm(gripKey), d = depth(gripKey);
    const zg = p.kind === "P" ? z + Math.max(lengths[kinds.length - 1] ?? 0, bodyRadius(p.key) + WALL + 3 + WALL - b.min[0]) : z + PLATE + WALL - b.min[0] + 2;
    // gripper actuator: axis along +x, body centred on the arm, output end up
    G = frame([d / 2, 0, zg], [1, 0, 0], [0, 0, 1]);
  }
  // a pitch joint at the end of the chain carries a forearm out to a tool flange
  const last = joints[joints.length - 1];
  const tail: Vec3 | null = !gripKey && last?.kind === "P" && (lengths[kinds.length - 1] ?? 0) > 0
    ? [0, last.side * (depth(last.key) / 2 + 0.5), z + Math.max(lengths[kinds.length - 1], bodyRadius(last.key) + 12)] : null;
  return { joints, G, tail };
}

function nameJoints(kinds: Kind[]): string[] {
  const pitches = kinds.length === 2 ? ["shoulder_pitch", "elbow_pitch"] : ["shoulder_pitch", "elbow_pitch", "wrist_pitch"];
  const rolls = ["wrist_roll", "forearm_roll", "upper_arm_roll"]; // counted from the tool end
  const rCount = kinds.filter((k) => k === "R").length;
  let p = 0, r = 0;
  return kinds.map((k) => (k === "Y" ? "base_yaw" : k === "P" ? pitches[p++] : rolls[rCount - 1 - r++]));
}
const LINK_NAMES: Record<string, string> = { base_yaw: "turret", shoulder_pitch: "upper_arm", upper_arm_roll: "upper_arm_rotator", elbow_pitch: "forearm", forearm_roll: "forearm_rotator", wrist_pitch: "wrist", wrist_roll: "wrist_rotator" };

/** Printed structure between the output of joint `cur` and the cradle of the next actuator (world mm, home pose). */
function linkOps(cur: JointPlan, nextKey: string, nextT: Mat4, nextKind: Kind | "G", plateT: number, plateW: number): Op[] {
  const ops: Op[] = [{ op: "at", T: cur.W, of: [{ op: "horn", key: cur.key, t: PLATE }] }, { op: "cradle", key: nextKey, T: nextT, wall: WALL }];
  const nb = bodyMm(nextKey);
  // world bbox of the next cradle
  const corners: Vec3[] = []; for (const x of [nb.min[0] - WALL, nb.max[0] + WALL]) for (const y of [nb.min[1] - WALL, nb.max[1] + WALL]) for (const zz of [nb.min[2] - WALL, -2]) corners.push(apply(nextT, [x, y, zz]));
  const lo = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]))) as Vec3, hi = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]))) as Vec3;
  const o = apply(cur.W, [0, 0, 0]);
  if (cur.kind !== "P") {
    // axial joint: pedestal from the horn plate up to the underside of the next cradle
    const r = hornRadiusMm(cur.key) + 4;
    ops.push({ op: "hull", of: [{ op: "box", min: [o[0] - r * 0.8, o[1] - r * 0.8, o[2]], max: [o[0] + r * 0.8, o[1] + r * 0.8, o[2] + PLATE] }, { op: "box", min: [lo[0], lo[1], lo[2]], max: [hi[0], hi[1], lo[2] + WALL] }] });
  } else {
    // pitch joint: a clevis round the actuator (horn cheek + bearing cheek joined by a bridge outside its sweep),
    // then a solid link into the next cradle. Built in this actuator's frame (output axis +z).
    const Wi = invert(cur.W), nT = mul(Wi, nextT);
    const pN = apply(nT, [0, 0, 0]); let dx = pN[0], dy = pN[1];
    if (Math.hypot(dx, dy) < 1) { dx = 1; dy = 0; }
    const n = Math.hypot(dx, dy), dir: Vec3 = [dx / n, dy / n, 0];
    const R = bodyRadius(cur.key) + 4, Wb = Math.max(10, plateT + 4), wB = plateW;
    const zI = idlerZ(cur.key), zLo = zI - IDLER_T, zHi = plateT;
    const at = (r: number, z: number): Vec3 => [dir[0] * r, dir[1] * r, z];
    const rH = hornRadiusMm(cur.key) + 4, rI = BEAR_D / 2 + 3.5;
    const bridge = (z0: number, z1: number): Op => ({ op: "beam", a: at(R + Wb / 2, z0), b: at(R + Wb / 2, z1), w: wB, h: Wb, up: dir });
    const local: Op[] = [
      { op: "horn", key: cur.key, t: plateT },
      { op: "hull", of: [{ op: "rod", a: [0, 0, 0], b: [0, 0, plateT], r: rH }, bridge(0, plateT)] },          // horn cheek
      { op: "hull", of: [{ op: "rod", a: [0, 0, zLo], b: [0, 0, zI], r: rI }, bridge(zLo, zI)] },             // bearing cheek
      bridge(zLo, zHi),
      { op: "hole", a: [0, 0, zI + 0.5], b: [0, 0, zI - BEAR_W], d: BEAR_D },                                     // 625ZZ seat
      { op: "hole", a: [0, 0, zI - BEAR_W + 0.1], b: [0, 0, zLo - 1], d: 9 },                                      // lip: bolt head on the inner race
    ];
    ops.push({ op: "at", T: cur.W, of: local });
    // solid link from the bridge into the next cradle
    const nb = bodyMm(nextKey), cs: Vec3[] = [];
    for (const x of [nb.min[0] - WALL, nb.max[0] + WALL]) for (const y of [nb.min[1] - WALL, nb.max[1] + WALL]) for (const zz of [nb.min[2] - WALL, -2]) cs.push(apply(nextT, [x, y, zz]));
    const lo2 = [0, 1, 2].map((k) => Math.min(...cs.map((c) => c[k]))) as Vec3, hi2 = [0, 1, 2].map((k) => Math.max(...cs.map((c) => c[k]))) as Vec3;
    ops.push({ op: "hull", of: [{ op: "at", T: cur.W, of: [bridge(zLo, zHi)] }, { op: "box", min: lo2, max: hi2 }] });
    // truss: lightening holes through the link across the joint axis; the two side walls carry the bending
    const a0 = apply(cur.W, at(R + Wb + 14, (zLo + zHi) / 2)), c2: Vec3 = [(lo2[0] + hi2[0]) / 2, (lo2[1] + hi2[1]) / 2, (lo2[2] + hi2[2]) / 2];
    const toN: Vec3 = [c2[0] - a0[0], c2[1] - a0[1], c2[2] - a0[2]], dl = Math.hypot(...toN);
    // free length: from the bridge to where the line enters the next cradle (slab test), less a margin
    let tIn = 0;
    for (let k = 0; k < 3; k++) if (Math.abs(toN[k]) > 1e-9) { const t1 = (lo2[k] - a0[k]) / toN[k] * dl, t2 = (hi2[k] - a0[k]) / toN[k] * dl; tIn = Math.max(tIn, Math.min(t1, t2)); }
    const reach = tIn - 10;
    if (reach > 20) {
      const u: Vec3 = [toN[0] / dl, toN[1] / dl, toN[2] / dl], b0: Vec3 = [a0[0] + u[0] * reach, a0[1] + u[1] * reach, a0[2] + u[2] * reach];
      const axisW = apply(cur.W, [0, 0, 1]), oW = apply(cur.W, [0, 0, 0]);
      ops.push({ op: "lighten", a: a0, b: b0, r: Math.min(wB * 0.3, 10), n: Math.max(1, Math.round(reach / 26)), axis: [axisW[0] - oW[0], axisW[1] - oW[1], axisW[2] - oW[2]] });
    }
    // keep the next joint's own clevis free to turn: clear its horn side and the far side of its boss
    if (nextKind === "P") {
      const Rn = bodyRadius(nextKey) + 6;
      ops.push({ op: "at", T: nextT, of: [{ op: "hole", a: [0, 0, -1], b: [0, 0, 60], d: 2 * Rn }, { op: "hole", a: [0, 0, idlerZ(nextKey) + 0.6], b: [0, 0, idlerZ(nextKey) - 60], d: 2 * Rn }] });
    }
    // the gripper jaw's horn plate turns in front of the gripper servo: keep that disc clear
    if (nextKind === "G") ops.push({ op: "at", T: nextT, of: [{ op: "hole", a: [0, 0, -2.0], b: [0, 0, 10], d: 2 * Math.hypot(14, 13) + 2 }] }); // from the cradle top: no skin left
    void lo; void hi;
  }
  if (nextKind === "P") ops.push({ op: "at", T: nextT, of: bossOps(nextKey) });
  return ops;
}

function gripperOps(G: Mat4, gripKey: string, fingerLen: number): { fixed: Op[]; jaw: Op[]; tcp: Vec3; closeAngle: number } {
  const d = depth(gripKey), o = apply(G, [0, 0, 0]), zg = o[2], F = fingerLen;
  const xa = o[0] + 0.5, xb = o[0] + 8.5, gap = 34, half = gap / 2; // jaw plane on the horn side (8 mm jaws); opening at q = 0
  const fixed: Op[] = [
    // on top of the cradle, behind the jaw plane
    // root of the fixed finger: on top of the cradle, behind the jaw plane (the jaw never reaches x < o[0])
    { op: "box", min: [o[0] - d - WALL, -half - 8, zg + 9], max: [o[0] - 1, -8, zg + 25], r: 2 },
    // across into the jaw plane, outside the jaw's swept horn plate
    { op: "box", min: [o[0] - 3, -half - 8, zg + 14], max: [xb, -half, zg + 28], r: 2 },
    { op: "box", min: [xa, -half - 8, zg + 14], max: [xb, -half, zg + F], r: 2 },
  ];
  const jaw: Op[] = [
    { op: "at", T: G, of: [{ op: "horn", key: gripKey, t: PLATE }] },
    { op: "hull", of: [{ op: "box", min: [xa, -14, zg - 13], max: [xb, 14, zg + 13] }, { op: "box", min: [xa, half, zg + F * 0.45], max: [xb, half + 8, zg + F * 0.55] }] },
    { op: "box", min: [xa, half, zg + F * 0.45], max: [xb, half + 8, zg + F], r: 2 },
  ];
  // closing rotates the jaw about +x; find where its inner face meets the fixed finger's inner face
  let close = 0;
  for (let t = 0; t < 1.2; t += 0.002) { const yTip = half * Math.cos(t) - F * Math.sin(t); if (yTip <= -half + 1) { close = t; break; } }
  return { fixed, jaw, tcp: [xa + 3, 0, zg + F - 10], closeAngle: close };
}

function buildArm(req: ArmRequest, kinds: Kind[], keys: string[], gripKey: string | null, lengths: number[]) {
  const name = req.name ?? `arm_${req.dof}dof`;
  const A = new Assembly(name, "arm", req.prompt);
  const { joints, G, tail } = plan(kinds, keys, lengths, gripKey);
  // ---- base: plate with table-mount holes, pedestal and the first actuator's cradle ----
  const j0 = joints[0], side = req.basePlateMm ?? Math.max(110, Math.round((req.reachM ?? 0.3) * 1000 * 0.3));
  const baseOps: Op[] = [
    { op: "box", min: [-side / 2, -side / 2, 0], max: [side / 2, side / 2, 6], r: 8 },
    { op: "cradle", key: j0.key, T: j0.W, wall: WALL },
  ];
  { const nb = bodyMm(j0.key), c: Vec3[] = [];
    for (const x of [nb.min[0] - WALL, nb.max[0] + WALL]) for (const y of [nb.min[1] - WALL, nb.max[1] + WALL]) for (const zz of [nb.min[2] - WALL, -2]) c.push(apply(j0.W, [x, y, zz]));
    const lo = [0, 1].map((k) => Math.min(...c.map((p) => p[k]))), hi = [0, 1].map((k) => Math.max(...c.map((p) => p[k])));
    const zlo = Math.min(...c.map((p) => p[2]));
    baseOps.push({ op: "hull", of: [{ op: "box", min: [lo[0] - 6, lo[1] - 6, 0], max: [hi[0] + 6, hi[1] + 6, 6] }, { op: "box", min: [lo[0], lo[1], zlo], max: [hi[0], hi[1], zlo + WALL] }] });
    if (j0.kind === "P") baseOps.push({ op: "at", T: j0.W, of: bossOps(j0.key) });
    if (j0.kind === "P") baseOps.push({ op: "cutbox", min: [-100, j0.side > 0 ? j0.W[13] - 1 : -100, j0.W[14] - hornRadiusMm(j0.key) - 6], max: [100, j0.side > 0 ? 100 : j0.W[13] + 1, 400] });
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) baseOps.push({ op: "hole", a: [x * (side / 2 - 10), y * (side / 2 - 10), -1], b: [x * (side / 2 - 10), y * (side / 2 - 10), 8], d: 5.5 });
  A.printedLink("base_link", { name: "base_link", ops: baseOps }, { role: "base", material: "printed_dark" });
  A.fastener("M5 x 12 socket head (base to bench)", 4);

  // ---- joints and links ----
  let parent = "base_link", parentW = I4();
  const plateFor = (i: number) => { const tau = (lastTorques[joints[i].name] ?? 1) * 1000; return { t: Math.min(10, Math.max(5, (6 * tau * 2) / (12 * 30 * 30))), w: 30 }; };
  joints.forEach((j, i) => {
    const linkName = i === joints.length - 1 && !gripKey ? "tool_link" : LINK_NAMES[j.name] ?? `link_${i + 1}`;
    // actuator body mounted in the parent link
    A.mount(parent, j.key, mul(invert(parentW), j.W), `${j.name}_actuator`, `joint ${j.name}`);
    A.revolute(j.name, parent, linkName, mul(invert(parentW), j.W), j.key, j.limit[0], j.limit[1]);
    const next = joints[i + 1];
    const { t, w } = plateFor(i);
    let ops: Op[];
    if (next) ops = linkOps(j, next.key, next.W, next.kind, t, w);
    else if (G) {
      const g = gripperOps(G, gripKey!, 70);
      ops = [...linkOps(j, gripKey!, G, "G", t, w), ...g.fixed];
    } else if (tail) {
      // forearm side plate to a 4-hole M3 tool flange (ISO-style pattern on 25 mm)
      const o = apply(j.W, [0, 0, 0]), s = j.side, { t, w } = plateFor(i), y0 = o[1] + s * 0.5, y1 = o[1] + s * (t + 0.5);
      const [ya, yb] = s > 0 ? [y0, y1] : [y1, y0];
      ops = [{ op: "at", T: j.W, of: [{ op: "horn", key: j.key, t: PLATE }] },
        { op: "box", min: [o[0] - w / 2, ya, o[2]], max: [o[0] + w / 2, yb, tail[2]], r: 3 },
        { op: "box", min: [o[0] - 20, Math.min(ya, -20), tail[2] - 6], max: [o[0] + 20, Math.max(yb, 20), tail[2]], r: 4 }];
      for (const [dx, dy] of [[-12.5, -12.5], [12.5, -12.5], [-12.5, 12.5], [12.5, 12.5]]) ops.push({ op: "hole", a: [o[0] + dx, dy, tail[2] - 8], b: [o[0] + dx, dy, tail[2] + 1], d: 3.4 });
      const span = tail[2] - o[2];
      if (span > 120) ops.push({ op: "lighten", a: [o[0], y0, o[2] + 45], b: [o[0], y0, tail[2] - 40], r: Math.min(w * 0.28, 9), n: Math.max(1, Math.floor((span - 85) / 45)), axis: [0, 1, 0] });
    } else {
      // tool flange: wide enough that its 4 M3 holes sit clear of the horn-screw pocket
      const r = hornRadiusMm(j.key) + 10, o = apply(j.W, [0, 0, 0]);
      ops = [{ op: "at", T: j.W, of: [{ op: "horn", key: j.key, t: PLATE }, { op: "box", min: [-r, -r, PLATE], max: [r, r, PLATE + 6], r: 4 }] }];
      for (const a of [0, 1, 2, 3]) { const p = apply(j.W, [Math.cos(a * Math.PI / 2 + Math.PI / 4) * (r - 4), Math.sin(a * Math.PI / 2 + Math.PI / 4) * (r - 4), 0]); const q = apply(j.W, [Math.cos(a * Math.PI / 2 + Math.PI / 4) * (r - 4), Math.sin(a * Math.PI / 2 + Math.PI / 4) * (r - 4), PLATE + 7]); ops.push({ op: "hole", a: p, b: q, d: 3.4 }); }
      void o;
    }
    A.printedLink(linkName, { name: linkName, ops: [{ op: "at", T: invert(j.W), of: ops }] }, { role: linkName, material: i % 2 ? "printed" : "printed_accent" });
    A.fastener(`${part(j.key).specs.case_screw ? "M2 x 6" : "M2.5 x 6"} case screws`, 4);
    A.fastener("horn screws", outputHolesCount(j.key));
    if (j.kind === "P") {
      A.buy("bearing_625zz", 1, `clevis bearing, joint ${j.name}`);
      A.fastener("M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle)", 1);
    }
    parent = linkName; parentW = j.W;
  });
  let tcpLink = parent, tcp: Vec3 = apply(invert(parentW), tail ? [0, 0, tail[2]] : apply(joints[joints.length - 1].W, [0, 0, PLATE + 6]));
  if (G && gripKey) {
    const g = gripperOps(G, gripKey, 70);
    A.mount(parent, gripKey, mul(invert(parentW), G), "gripper_actuator", "gripper");
    A.revolute("gripper", parent, "gripper_jaw", mul(invert(parentW), G), gripKey, -0.35, +g.closeAngle.toFixed(3));
    A.printedLink("gripper_jaw", { name: "gripper_jaw", ops: [{ op: "at", T: invert(G), of: g.jaw }] }, { role: "gripper", material: "printed_accent" });
    A.spec.end_effectors.push({ name: "gripper", type: "two_finger_gripper", attach_link: parent });
    tcp = apply(invert(parentW), g.tcp);
    A.fastener("horn screws", outputHolesCount(gripKey));
  }
  mountSensors(A, req.sensors ?? [], parent, parentW, G, gripKey, joints[joints.length - 1]);
  A.spec.root = "base_link";
  return { A, joints, tcpLink, tcp };
}
/** Wrist camera / depth camera on a printed bracket behind the tool, IMU in the base. */
function mountSensors(A: Assembly, sensors: string[], parent: string, parentW: Mat4, G: Mat4 | null, gripKey: string | null, last: JointPlan) {
  const toLocal = invert(parentW);
  // world (home pose) point just behind the tool, on the -x side of the wrist
  const anchor: Vec3 = G && gripKey ? [apply(G, [0, 0, 0])[0] - depth(gripKey) - WALL, 0, apply(G, [0, 0, 0])[2] + 12] : apply(last.W, [0, 0, 0]).map((v, i) => v + (i === 2 ? 10 : i === 0 ? -hornRadiusMm(last.key) - 8 : 0)) as Vec3;
  let x = anchor[0];
  if (sensors.includes("depth")) {
    // eye-to-hand: D435i on a printed mast at the back of the base, looking down 35 deg at the workspace
    const key = "realsense_d435i", side = 110, h = 190, tilt = 35 * Math.PI / 180;
    const mx = -side / 2 + 12, my = side / 2 - 12;
    const lens: Vec3 = [Math.cos(tilt), 0, -Math.sin(tilt)];
    const T = frame([mx + 8, my, h + 22], [Math.sin(tilt), 0, Math.cos(tilt)], [0, 1, 0]); // lenses (-y) along `lens`
    void lens;
    A.printedLink("depth_mast", { name: "depth_mast", ops: [
      { op: "box", min: [mx - 9, my - 9, 0], max: [mx + 9, my + 9, h], r: 3 },
      { op: "hull", of: [{ op: "box", min: [mx - 9, my - 9, h - 10], max: [mx + 9, my + 9, h] }, { op: "at", T, of: [{ op: "box", min: [-20, -9, -18], max: [20, 9, -12.5] }] }] },
      { op: "at", T, of: [{ op: "keepout", key, T: I4() }, { op: "hole", a: [-7.5, 0, -30], b: [-7.5, 0, -12], d: 6.8 }] },
    ] }, { role: "sensor_mount", material: "printed_dark" });
    A.fixed("depth_mast_mount", "base_link", "depth_mast", I4());
    A.mount("depth_mast", key, T, "workspace_depth", "depth camera over the workspace");
    A.fastener("1/4-20 x 3/8 camera screw", 1);
    A.spec.sensors.push({ name: "workspace_depth", type: "depth", parent: "workspace_depth", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
  }
  for (const type of ["camera"] as const) {
    if (!sensors.includes(type)) continue;
    const key = "rpi_camera_module_3", b = bodyMm(key);
    const thick = b.max[1] - b.min[1];
    // stand the board on its edge facing +z (the tool direction): component +z -> world +z
    const T = frame([x - b.max[0] - 4, -(b.min[1] + b.max[1]) / 2, anchor[2] - b.min[2]], [0, 0, 1], [1, 0, 0]);
    const lo = apply(T, b.min), hi = apply(T, b.max);
    A.printedLink(`${type}_bracket`, { name: `${type}_bracket`, ops: [{ op: "at", T: toLocal, of: [
      { op: "box", min: [Math.min(lo[0], hi[0]) - 2, Math.min(lo[1], hi[1]) - 2, anchor[2] - 6], max: [anchor[0] + 2, Math.max(lo[1], hi[1]) + 2, anchor[2]], r: 2 },
    ] }] }, { role: "sensor_mount", material: "printed_dark" });
    A.fixed(`${type}_bracket_mount`, parent, `${type}_bracket`, mul(toLocal, I4()));
    A.mount(parent, key, mul(toLocal, T), `wrist_${type}`, `${type} on the wrist`);
    A.spec.sensors.push({ name: `wrist_${type}`, type, parent: `wrist_${type}`, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
    x -= thick + 6;
  }
  if (sensors.includes("imu")) {
    A.mount("base_link", "bno085_breakout", translation([-30, -12, 6]), "base_imu", "IMU in the base");
    A.spec.sensors.push({ name: "base_imu", type: "imu", parent: "base_imu", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
  }
}
/** Built pitch-axis distances (mm): upper arm = shoulder->elbow, forearm = elbow->wrist pitch (or tool on 2–3 DOF arms). */
function segmentsOf(b: ReturnType<typeof buildArm>, kinds: Kind[]): { upper_arm?: number; forearm?: number } {
  const pj = b.joints.filter((j) => j.kind === "P"), o = (j: JointPlan) => apply(j.W, [0, 0, 0]);
  const d = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[2] - q[2]);
  const out: { upper_arm?: number; forearm?: number } = {};
  if (pj.length >= 2) out.upper_arm = d(o(pj[1]), o(pj[0]));
  if (pj.length >= 3) out.forearm = d(o(pj[2]), o(pj[1]));
  else if (pj.length === 2 && kinds[kinds.length - 1] === "P") { const t = apply(pj[1].W, [0, 0, 0]), tool = pointWorld(b.A.spec, {}, b.tcpLink, b.tcp.map((x) => x / 1000) as Vec3).map((x) => x * 1000) as Vec3; out.forearm = d(tool, t); }
  return out;
}
/** Shoulder axis to tool centre point, arm stretched out (m). */
function reachOf(b: ReturnType<typeof buildArm>, kinds: Kind[]): number {
  const i = Math.max(0, kinds.indexOf("P")), sh = b.joints[i];
  const ext = kinds.indexOf("P") >= 0 ? { [sh.name]: Math.PI / 2 } : {};
  const sp = pointWorld(b.A.spec, ext, "base_link", apply(sh.W, [0, 0, 0]).map((x) => x / 1000) as Vec3);
  const tp = pointWorld(b.A.spec, ext, b.tcpLink, b.tcp.map((x) => x / 1000) as Vec3);
  return Math.hypot(tp[0] - sp[0], tp[1] - sp[1], tp[2] - sp[2]);
}
const outputHolesCount = (key: string) => part(key).holes.filter((h) => Math.abs(h.pos[2]) < 0.6 && h.axis[2] > 0.5).length;
let lastTorques: Record<string, number> = {};

/** Design an arm: choose lengths from the reach, size every actuator from the built arm's real loads. */
export function designArm(req: ArmRequest): RobotSpecification {
  const kinds = req.kinds ?? KINDS[Math.max(1, Math.min(7, Math.round(req.dof)))];
  const dof = kinds.length, payload = req.payloadKg ?? (req.ladder === "hobby" ? (req.onlyActuators?.every((k) => /sg90|mg90/.test(k)) ? 0.02 : 0.05) : 0.1); // desktop class: what a ~$150 servo arm holds stretched out continuously
  const hobby = (req.ladder ?? ladderFor(req.budget)) === "hobby";
  // hobby-servo arms are MeArm / EEZYbotARM class: short reach, light objects
  const micro = hobby && !!req.onlyActuators?.length && req.onlyActuators.every((k) => /sg90|mg90/.test(k));
  const reach = (req.reachM ?? (micro ? 0.15 : hobby ? (dof >= 5 ? 0.24 : 0.2) : dof >= 5 ? 0.42 : 0.35)) * 1000;
  // gripper actuator: fingertip force at 70 mm must hold the payload with friction 0.5 on both jaws, x1.5
  const gripNeedNm = (payload * 9.81 * 1.5) / (2 * 0.5) * 0.07;
  const gripKeyFor = (l: Ladder) => { const pool = l === "hobby" ? (req.onlyActuators ?? ["hobby_sg90", "hobby_mg90s", "hobby_mg996r", "hobby_ds3218"]) : l === "feetech" ? ["feetech_sts3215_c047", "feetech_sts3250"] : l === "dynamixel12" ? ["dxl_xm430_w350", "dxl_xh540_w270"] : ["dxl_xl430_w250", "dxl_xm430_w350", "dxl_xh540_w270"]; return pool.find((k) => rating(k).rated_nm >= gripNeedNm) ?? pool[pool.length - 1]; };
  // escalation path when the weakest family can't hold the load; a battery that peaks above 12 V rules out the 11.1 V XL430 and the 48 V CAN motors
  const path: Ladder[] = req.ladder === "hobby" ? ["hobby"] : req.maxSupplyV && req.maxSupplyV > 11.1 * 1.1 ? ["feetech", "dynamixel12"] : ["feetech", "dynamixel", "cubemars"];
  let ladder: Ladder = req.ladder ?? ladderFor(req.budget);
  let keys = kinds.map(() => (ladder === "hobby" && req.onlyActuators ? req.onlyActuators[0] : LADDERS[ladder].keys[0]) as string);
  const pitchCount = kinds.filter((k) => k === "P").length;
  const wristAllowance = hobby ? 45 : 150; // wrist servos + tool beyond the last main link
  const main = Math.max(0, reach - wristAllowance) / Math.max(1, Math.min(2, pitchCount));
  const lengths = kinds.map((k, i) => (k === "P" && (kinds.slice(i + 1).includes("P") || (i === kinds.length - 1 && pitchCount <= 2)) ? main : 0));
  if (pitchCount === 1) lengths[kinds.indexOf("P")] = main;
  const pIdx = kinds.map((k, i) => (k === "P" ? i : -1)).filter((i) => i >= 0);
  const fixedSeg = new Set<number>();
  if (req.segments?.upper_arm && pIdx.length >= 2) { lengths[pIdx[0]] = req.segments.upper_arm * 1000; fixedSeg.add(pIdx[0]); }
  if (req.segments?.forearm && pIdx.length >= 3) { lengths[pIdx[1]] = req.segments.forearm * 1000; fixedSeg.add(pIdx[1]); }
  // 2–3 DOF arms end on the elbow: its forearm runs out to the tool
  const tailP = pIdx.length && pIdx[pIdx.length - 1] === kinds.length - 1 && pitchCount <= 2 ? pIdx[pIdx.length - 1] : -1;
  if (req.segments?.forearm && tailP >= 0 && pIdx.length === 2) { lengths[tailP] = req.segments.forearm * 1000; fixedSeg.add(tailP); }
  // match the requested reach: a build tells how much the wrist and bodies add (redone whenever the actuators change size)
  // a pitch link must leave room for both clevises (this joint's bridge outside its sweep, the next joint's sweep)
  const minLen = (i: number) => { const nk = keys[i + 1] ?? keys[i];
    return kinds[i] === "P" ? bodyRadius(keys[i]) + 4 + 14 + bodyRadius(nk) + 8 : hobby ? 25 : 60; };
  const matchReach = () => {
    if (pitchCount < 1 || fixedSeg.size) return;
    for (let k = 0; k < 4; k++) {
      const probe = buildArm({ ...req, ladder, dof }, kinds, keys, req.gripper === false ? null : gripKeyFor(ladder), lengths);
      const err = reachOf(probe, kinds) * 1000 - reach;
      if (Math.abs(err) < 5) break;
      const adjustable = lengths.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);
      for (const i of adjustable) lengths[i] = Math.max(minLen(i), lengths[i] - err / adjustable.length);
    }
  };
  matchReach();
  // requested segments are pitch-axis to pitch-axis distances; offsets of joints in between are fixed, so correct
  // (redone whenever the actuators change size, like the reach)
  const fitSegments = () => {
    if (fixedSeg.size) for (let k = 0; k < 10; k++) {
    const probe = buildArm({ ...req, ladder, dof }, kinds, keys, req.gripper === false ? null : gripKeyFor(ladder), lengths);
    const m = segmentsOf(probe, kinds);
    let worst = 0;
    for (const [name, idx] of [["upper_arm", pIdx[0]], ["forearm", tailP >= 0 && pIdx.length === 2 ? tailP : pIdx[1]]] as const) {
      const want = req.segments?.[name]; if (!want || idx === undefined || !fixedSeg.has(idx) || m[name] === undefined) continue;
      const err = m[name]! - want * 1000; worst = Math.max(worst, Math.abs(err));
      lengths[idx] = Math.max(minLen(idx), lengths[idx] - err);
    }
    if (worst < 0.1) break;
  }
  };
  fitSegments();
  let built = null as ReturnType<typeof buildArm> | null, torques: Record<string, number> = {}, inertias: Record<string, number> = {};
  lastTorques = {};
  for (let iter = 0; iter < 8; iter++) {
    built = buildArm({ ...req, ladder, dof }, kinds, keys, req.gripper === false ? null : gripKeyFor(ladder), lengths);
    const loads: PointLoad[] = [{ link: built.tcpLink, at: built.tcp.map((x) => x / 1000) as Vec3, massKg: payload }];
    const firstP = kinds.indexOf("P");
    let poses: Record<string, number>[] = firstP < 0 ? [{}] : [-1, 1].flatMap((s) => [{ [built!.joints[firstP].name]: s * Math.PI / 2 }, { [built!.joints[firstP].name]: s * Math.PI / 2, ...(kinds[0] === "Y" ? { base_yaw: Math.PI / 2 } : {}) }]);
    if (req.gravity) {
      // mounted tilted: any joint can end up lifting, so search every joint at -90 / 0 / +90 deg within its limits
      poses = [{}];
      for (const j of built.A.spec.joints.filter((x) => x.type === "revolute" && x.name !== "gripper")) {
        const lim = (v: number) => Math.max(j.limit?.lower ?? -Math.PI, Math.min(j.limit?.upper ?? Math.PI, v));
        poses = poses.flatMap((q) => [...new Set([-Math.PI / 2, 0, Math.PI / 2].map(lim))].map((v) => ({ ...q, [j.name]: v })));
      }
    }
    torques = worstTorques(built.A.spec, poses, loads, req.gravity);
    // everything downstream swung about each axis with the arm stretched out (worst case for yaw too)
    inertias = {};
    for (const q of poses) for (const [k, v] of Object.entries(axisInertias(built.A.spec, q, loads))) inertias[k] = Math.max(inertias[k] ?? 0, v);
    lastTorques = torques;
    const ladderKeys = (ladder === "hobby" && req.onlyActuators ? req.onlyActuators : LADDERS[ladder].keys) as readonly string[];
    const next = built.joints.map((j) => choose(ladderKeys, torques[j.name] ?? 0, inertias[j.name] ?? 0).key);
    const failing = built.joints.some((j) => !passes(choose(ladderKeys, torques[j.name] ?? 0, inertias[j.name] ?? 0)));
    const step = path.indexOf(ladder);
    if (failing && step >= 0 && step < path.length - 1) { ladder = path[step + 1]; keys = kinds.map(() => LADDERS[ladder].keys[0] as string); matchReach(); fitSegments(); continue; }
    if (next.every((k, i) => k === keys[i])) break;
    keys = next;
    matchReach(); fitSegments();
  }
  const { A, joints } = built!;
  A.design.tool = { link: built!.tcpLink, xyz_m: built!.tcp.map((x) => +(x / 1000).toFixed(5)) as Vec3, payload_kg: payload };
  // ---- engineering record ----
  for (const j of joints) {
    const st = torques[j.name] ?? 0, c = evaluate(j.key, st, inertias[j.name] ?? 0), r = rating(j.key);
    A.design.joints.push({ joint: j.name, actuator: j.key, required_nm: c.required_nm, rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: c.margin, speed_rad_s: c.loaded_speed_rad_s,
      note: `worst static ${st.toFixed(3)} N·m (arm stretched out with ${payload} kg; held continuously within the rated torque) x ${DYNAMIC_FACTOR} for peaks; ${c.loaded_speed_rad_s} rad/s under that load with ${((inertias[j.name] ?? 0)).toFixed(4)} kg·m² swung` });
    A.check(`torque:${j.name}`, c.ok && c.continuous_ok, `holds ${st.toFixed(2)} N·m continuously (rated ${r.rated_nm}), peaks ${c.required_nm} N·m (peak ${r.peak_nm}, margin ${c.margin}x) — ${part(j.key).name}`);
    A.check(`speed:${j.name}`, c.speed_ok, `${c.loaded_speed_rad_s} rad/s with the payload stretched out (no-load ${r.speed_rad_s} rad/s)`);
    // the URDF velocity limit is the speed this joint actually reaches loaded
    const uj = A.spec.joints.find((x) => x.name === j.name);
    if (uj?.limit && c.loaded_speed_rad_s > 0) uj.limit.velocity = c.loaded_speed_rad_s;
  }
  const reachActual = reachOf(built!, kinds);
  A.design.tcp = { link: built!.tcpLink, xyz: built!.tcp.map((x) => +(x / 1000).toFixed(6)) as Vec3 };
  A.design.performance = { reach_m: +reachActual.toFixed(3), payload_kg: payload, mass_kg: +totalMass(A.spec).toFixed(3), actuators: LADDERS[ladder].label, max_joint_speed_rad_s: Math.min(...A.design.joints.map((j) => j.speed_rad_s)) };
  if (req.reachM && Math.abs(reachActual - req.reachM) > 0.05) A.design.assumptions.push(`requested reach ${req.reachM} m; built reach is ${reachActual.toFixed(3)} m (actuator bodies set the minimum spacing)`);
  if (A.spec.end_effectors.length) {
    const g = rating(gripKeyFor(ladder));
    const force = g.rated_nm / 0.07, holdKg = (2 * 0.5 * force) / 9.81;
    A.design.performance.grip_force_n = +force.toFixed(1);
    A.check("gripper:hold", holdKg >= payload * 1.5, `fingertip force ${force.toFixed(1)} N at 70 mm (rated torque), holds ${holdKg.toFixed(2)} kg with friction 0.5 vs payload ${payload} kg x 1.5`);
  }
  // supply: bus adapter and power; current estimated from load share of stall current
  const bus = LADDERS[ladder].bus;
  const amps = joints.reduce((s, j) => s + Number(part(j.key).specs.stall_current_a ?? part(j.key).specs.current_a ?? 1) * Math.min(1, (torques[j.name] ?? 0) / rating(j.key).peak_nm), 0);
  A.design.performance.holding_current_a = +amps.toFixed(2);
  if (ladder === "hobby") {
    // Arduino drives a PCA9685 over I2C; servos get their own 5 V rail (never the Arduino's 5 V pin)
    A.buy("arduino_uno_r3", 1, "controller (USB serial commands, I2C to the servo driver)");
    A.buy(bus, 1, "16-channel PWM servo driver (I2C)");
    A.buy("psu_5v_lrs50", 1, "5 V 10 A servo supply (V+ terminal of the PCA9685)");
    // a move can stall every servo at once for a moment: size for all stall currents
    const stall = joints.reduce((s, j) => s + Number(part(j.key).specs.stall_current_a ?? 1), 0);
    A.check("power:supply", stall <= 10, `all ${joints.length} servos stalled together draw ${stall.toFixed(1)} A of the 10 A 5 V supply; holding the payload draws ~${amps.toFixed(1)} A`);
    A.check("power:voltage", joints.every((j) => Number(part(j.key).specs.voltage_v) >= 4.8), `5 V rail is inside every servo's 4.8-6 V range (${[...new Set(joints.map((j) => part(j.key).name.split(" (")[0]))].join(", ")})`);
  } else {
    A.buy(bus, 1, "USB to actuator bus");
    if (ladder !== "cubemars") A.buy("psu_12v_lrs75", 1, "12 V actuator supply");
    if (ladder !== "cubemars") A.check("power:supply", amps <= 6 * 0.8, `holding the payload stretched out draws ~${amps.toFixed(1)} A of the 6 A supply`);
  }
  A.design.assumptions.push(
    "Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.",
    "Every pitch joint is a clevis: one cheek bolts to the servo horn, the other turns on a 625ZZ bearing on an M5 bolt screwed into a heat-set insert in a boss on the back of the servo's cradle, so the servo's own bearing carries no bending moment. An M5 washer sits between the boss and the bearing's inner race.",
    "Print the links in PETG or PLA+ with 4 perimeters and 30 % gyroid infill, cradle opening up; press the 625ZZ bearings into their seats (16.15 mm) and set the M5 inserts with a soldering iron.",
    `Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +${Math.round((DYNAMIC_FACTOR - 1) * 100)} %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.`,
  );
  const segs = segmentsOf(built!, kinds);
  for (const [nm, want] of Object.entries(req.segments ?? {})) {
    const got = (segs as Record<string, number | undefined>)[nm];
    if (want && got !== undefined && Math.abs(got - want * 1000) > 0.6) A.design.assumptions.push(`requested ${nm} ${want} m; built ${(got / 1000).toFixed(3)} m, the shortest these actuators allow`);
  }
  if (segs.upper_arm !== undefined) A.design.performance.upper_arm_m = +(segs.upper_arm / 1000).toFixed(3);
  if (segs.forearm !== undefined) A.design.performance.forearm_m = +(segs.forearm / 1000).toFixed(3);
  // ready pose: shoulder forward, elbow and wrist folded back (signs follow each pitch actuator's side)
  const pjs = joints.filter((j) => j.kind === "P"), sign = (j: JointPlan) => j.side;
  const ready = [0.7, 1.3, -0.8]; // physical bend; a pitch actuator mounted on the other side turns the other way
  A.design.home = Object.fromEntries(pjs.slice(0, 3).map((j, k) => [j.name, +(ready[k] * sign(j)).toFixed(3)]));
  A.design.request = { ...req, dof };
  return A.finish(`${dof}-DOF arm, ${(reachActual * 1000).toFixed(0)} mm reach, ${payload} kg payload, ${LADDERS[ladder].label}`);
}

/**
 * Graft a designed arm (or any designer's spec) onto `host`: every link and joint is copied with a
 * name prefix and its base is bolted to `parent` at T (mm, parent frame). The arm's engineering record
 * (purchases, printed parts, joint sizing, checks) moves with it; the bench PSU is left out because a
 * mobile host powers the arm from its own battery.
 */
export function graftArm(host: Assembly, arm: RobotSpecification, parent: string, T: Mat4, prefix: string) {
  const rec = (arm.metadata as any).design as Assembly["design"];
  const n = (s: string) => `${prefix}_${s}`;
  for (const l of arm.links) {
    const link = structuredClone(l); link.name = n(l.name);
    if (link.geometry.type === "mesh" && link.geometry.part === "printed") link.geometry.file = n(link.geometry.file);
    host.spec.links.push(link);
  }
  for (const j of arm.joints) host.spec.joints.push({ ...structuredClone(j), name: n(j.name), parent: n(j.parent), child: n(j.child) });
  host.fixed(n("mount"), parent, n(arm.root ?? "base_link"), T);
  for (const e of arm.end_effectors) host.spec.end_effectors.push({ ...e, name: n(e.name), attach_link: n(e.attach_link) });
  for (const p of rec.printed) host.design.printed.push({ ...p, name: n(p.name), link: n(p.link) });
  for (const j of rec.joints) host.design.joints.push({ ...j, joint: n(j.joint) });
  for (const c of rec.checks) if (!c.name.startsWith("print:") && !c.name.startsWith("power:")) host.check(`${prefix}:${c.name}`, c.pass, c.detail);
  for (const p of rec.purchased) if (p.key !== "psu_12v_lrs75") host.buy(p.key, p.qty, `${prefix}: ${p.uses.join(", ")}`);
  for (const [k, v] of Object.entries(rec.fasteners)) host.fastener(k, v);
  return { tool: rec.tool ? { ...rec.tool, link: n(rec.tool.link) } : undefined, performance: rec.performance, joints: rec.joints.map((j) => ({ ...j, joint: n(j.joint) })) };
}
