// Serial arms built like real open-source servo arms (SO-101 / Koch / OpenManipulator class):
// every joint is a bought actuator, every link a printed bracket bolted to its horn and
// cradling the next actuator by its case screws. Actuators are sized from the exact
// worst-case gravity torque of the built arm, holding the payload fully stretched out.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, bboxM, hornRadiusMm, type Vec3 } from "@ttr/parts";
import { Assembly } from "../assembly.ts";
import { frame, invert, mul, apply, I4, type Mat4, type Op } from "@ttr/solid";
export { linkOps as servoLinkOps, gripperOps as servoGripperOps };
import { worstTorques, pointWorld, totalMass, type PointLoad } from "../kin.ts";
import { LADDERS, choose, evaluate, ladderFor, type Ladder, DYNAMIC_FACTOR } from "../sizing.ts";

export interface ArmRequest {
  name?: string; dof: number; reachM?: number; payloadKg?: number; gripper?: boolean; budget?: number; prompt?: string; ladder?: Ladder;
  /** joint sequence overriding the default for `dof` (Y = yaw about the stack, P = pitch, R = roll) */
  kinds?: Kind[];
  /** side of the square base plate (mm); default scales with reach (min 110) */
  basePlateMm?: number;
}
export type Kind = "Y" | "P" | "R";
const KINDS: Record<number, Kind[]> = { 1: ["Y"], 2: ["P", "P"], 3: ["Y", "P", "P"], 4: ["Y", "P", "P", "P"], 5: ["Y", "P", "P", "P", "R"], 6: ["Y", "P", "P", "R", "P", "R"], 7: ["Y", "P", "R", "P", "R", "P", "R"] };
const PLATE = 4; // horn plate thickness, mm
const WALL = 3;

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
    const zg = p.kind === "P" ? z + bodyRadius(p.key) + WALL + 3 + WALL - b.min[0] : z + PLATE + WALL - b.min[0] + 2;
    // gripper actuator: axis along +x, body centred on the arm, output end up
    G = frame([d / 2, 0, zg], [1, 0, 0], [0, 0, 1]);
  }
  return { joints, G };
}

function nameJoints(kinds: Kind[]): string[] {
  const p = kinds.map((k, i) => (k === "P" ? i : -1)).filter((i) => i >= 0);
  return kinds.map((k, i) => {
    if (k === "Y") return "base_yaw";
    if (k === "R") return kinds.slice(0, i).includes("R") ? "wrist_roll_2" : "wrist_roll";
    const n = p.indexOf(i);
    return kinds.length === 2 ? ["shoulder_pitch", "elbow_pitch"][n] : ["shoulder_pitch", "elbow_pitch", "wrist_pitch", "wrist_pitch_2"][n] ?? `pitch_${n}`;
  });
}
const LINK_NAMES: Record<string, string> = { base_yaw: "turret", shoulder_pitch: "upper_arm", elbow_pitch: "forearm", wrist_pitch: "wrist", wrist_roll: "wrist_rotator", wrist_pitch_2: "wrist_2", wrist_roll_2: "tool_rotator" };

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
    // pitch joint: side plate on the horn side, then a bridge into the next cradle's wall on that side
    const s = cur.side, y0 = o[1] + s * 0.5, y1 = o[1] + s * (plateT + 0.5);
    const [ya, yb] = s > 0 ? [y0, y1] : [y1, y0];
    const top = Math.min(hi[2], nextKind === "P" ? hi[2] : lo[2] + (hi[2] - lo[2]) * 0.9);
    ops.push({ op: "box", min: [o[0] - plateW / 2, ya, o[2]], max: [o[0] + plateW / 2, yb, top], r: 3 });
    const face = s > 0 ? hi[1] : lo[1];
    ops.push({ op: "hull", of: [
      { op: "box", min: [Math.max(lo[0], o[0] - plateW / 2), ya, Math.max(lo[2], o[2])], max: [Math.min(hi[0], o[0] + plateW / 2), yb, top] },
      { op: "box", min: [lo[0], s > 0 ? face - WALL : face, Math.max(lo[2], o[2])], max: [hi[0], s > 0 ? face : face + WALL, top] },
    ] });
    // keep clear of the previous actuator's body as this link swings
    const span = top - o[2];
    if (span > 120) ops.push({ op: "lighten", a: [o[0], 0, o[2] + 45], b: [o[0], 0, top - 45], r: Math.min(plateW * 0.28, 9), n: Math.max(1, Math.floor((span - 90) / 45)) });
  }
  return ops;
}

function gripperOps(G: Mat4, gripKey: string, fingerLen: number): { fixed: Op[]; jaw: Op[]; tcp: Vec3; closeAngle: number } {
  const d = depth(gripKey), o = apply(G, [0, 0, 0]), zg = o[2], F = fingerLen;
  const xa = o[0] + 0.5, xb = o[0] + 6.5, gap = 34, half = gap / 2; // jaw plane on the horn side; opening at q = 0
  const fixed: Op[] = [
    // on top of the cradle, behind the jaw plane
    { op: "box", min: [o[0] - d - WALL, -half - 8, zg + 9], max: [o[0] - 1, -8, zg + 20], r: 2 },
    // across into the jaw plane, outside the jaw's swept horn plate
    { op: "box", min: [o[0] - 3, -half - 8, zg + 9], max: [xb, -half, zg + 24], r: 2 },
    { op: "box", min: [xa, -half - 6, zg + 9], max: [xb, -half, zg + F], r: 2 },
  ];
  const jaw: Op[] = [
    { op: "at", T: G, of: [{ op: "horn", key: gripKey, t: PLATE }] },
    { op: "hull", of: [{ op: "box", min: [xa, -7, zg - 7], max: [xb, 7, zg + 7] }, { op: "box", min: [xa, half, zg + F * 0.45], max: [xb, half + 6, zg + F * 0.55] }] },
    { op: "box", min: [xa, half, zg + F * 0.45], max: [xb, half + 6, zg + F], r: 2 },
  ];
  // closing rotates the jaw about +x; find where its inner face meets the fixed finger's inner face
  let close = 0;
  for (let t = 0; t < 1.2; t += 0.002) { const yTip = half * Math.cos(t) - F * Math.sin(t); if (yTip <= -half + 1) { close = t; break; } }
  return { fixed, jaw, tcp: [xa + 3, 0, zg + F - 10], closeAngle: close };
}

function buildArm(req: ArmRequest, kinds: Kind[], keys: string[], gripKey: string | null, lengths: number[]) {
  const name = req.name ?? `arm_${req.dof}dof`;
  const A = new Assembly(name, "arm", req.prompt);
  const { joints, G } = plan(kinds, keys, lengths, gripKey);
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
    } else {
      const r = hornRadiusMm(j.key) + 6, o = apply(j.W, [0, 0, 0]);
      ops = [{ op: "at", T: j.W, of: [{ op: "horn", key: j.key, t: PLATE }, { op: "box", min: [-r, -r, PLATE], max: [r, r, PLATE + 6], r: 4 }] }];
      for (const a of [0, 1, 2, 3]) { const p = apply(j.W, [Math.cos(a * Math.PI / 2 + Math.PI / 4) * (r - 5), Math.sin(a * Math.PI / 2 + Math.PI / 4) * (r - 5), 0]); const q = apply(j.W, [Math.cos(a * Math.PI / 2 + Math.PI / 4) * (r - 5), Math.sin(a * Math.PI / 2 + Math.PI / 4) * (r - 5), PLATE + 7]); ops.push({ op: "hole", a: p, b: q, d: 3.4 }); }
      void o;
    }
    A.printedLink(linkName, { name: linkName, ops: [{ op: "at", T: invert(j.W), of: ops }] }, { role: j.kind === "P" ? "link" : "joint_housing", material: i % 2 ? "printed" : "printed_accent" });
    A.fastener(`${part(j.key).specs.case_screw ? "M2 x 6" : "M2.5 x 6"} case screws`, 4);
    A.fastener("horn screws", outputHolesCount(j.key));
    parent = linkName; parentW = j.W;
  });
  let tcpLink = parent, tcp: Vec3 = apply(invert(parentW), apply(joints[joints.length - 1].W, [0, 0, PLATE + 6]));
  if (G && gripKey) {
    const g = gripperOps(G, gripKey, 70);
    A.mount(parent, gripKey, mul(invert(parentW), G), "gripper_actuator", "gripper");
    A.revolute("gripper", parent, "gripper_jaw", mul(invert(parentW), G), gripKey, -0.35, +g.closeAngle.toFixed(3));
    A.printedLink("gripper_jaw", { name: "gripper_jaw", ops: [{ op: "at", T: invert(G), of: g.jaw }] }, { role: "gripper", material: "printed_accent" });
    A.spec.end_effectors.push({ name: "gripper", type: "two_finger_gripper", attach_link: parent });
    tcp = apply(invert(parentW), g.tcp);
    A.fastener("horn screws", outputHolesCount(gripKey));
  }
  A.spec.root = "base_link";
  return { A, joints, tcpLink, tcp };
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
  const dof = kinds.length, payload = req.payloadKg ?? (req.gripper === false ? 0.2 : 0.25);
  const reach = (req.reachM ?? 0.35) * 1000;
  const gripKeyFor = (l: Ladder) => (l === "feetech" ? "feetech_sts3215_c047" : "dxl_xl430_w250");
  let ladder: Ladder = req.ladder ?? ladderFor(req.budget);
  let keys = kinds.map(() => LADDERS[ladder].keys[0] as string);
  const pitchCount = kinds.filter((k) => k === "P").length;
  const wristAllowance = 150;
  const main = Math.max(0, reach - wristAllowance) / Math.max(1, Math.min(2, pitchCount));
  const lengths = kinds.map((k, i) => (k === "P" && kinds.slice(i + 1).includes("P") ? main : 0));
  if (pitchCount === 1) lengths[kinds.indexOf("P")] = main;
  // match the requested reach: the first build tells how much the wrist and bodies add
  if (req.reachM && pitchCount >= 1) for (let k = 0; k < 3; k++) {
    const probe = buildArm({ ...req, ladder, dof }, kinds, keys, req.gripper === false ? null : gripKeyFor(ladder), lengths);
    const err = reachOf(probe, kinds) * 1000 - reach;
    if (Math.abs(err) < 5) break;
    const adjustable = lengths.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);
    for (const i of adjustable) lengths[i] = Math.max(60, lengths[i] - err / adjustable.length);
  }
  let built = null as ReturnType<typeof buildArm> | null, torques: Record<string, number> = {};
  lastTorques = {};
  for (let iter = 0; iter < 8; iter++) {
    built = buildArm({ ...req, ladder, dof }, kinds, keys, req.gripper === false ? null : gripKeyFor(ladder), lengths);
    const loads: PointLoad[] = [{ link: built.tcpLink, at: built.tcp.map((x) => x / 1000) as Vec3, massKg: payload }];
    const firstP = kinds.indexOf("P");
    const poses = firstP < 0 ? [{}] : [-1, 1].flatMap((s) => [{ [built!.joints[firstP].name]: s * Math.PI / 2 }, { [built!.joints[firstP].name]: s * Math.PI / 2, ...(kinds[0] === "Y" ? { base_yaw: Math.PI / 2 } : {}) }]);
    torques = worstTorques(built.A.spec, poses, loads);
    lastTorques = torques;
    const ladderKeys = LADDERS[ladder].keys as readonly string[];
    const next = built.joints.map((j) => choose(ladderKeys, torques[j.name] ?? 0).key);
    const failing = built.joints.some((j) => { const c = choose(ladderKeys, torques[j.name] ?? 0); return !(c.ok && c.continuous_ok); });
    if (failing && ladder !== "cubemars") { ladder = ladder === "feetech" ? "dynamixel" : "cubemars"; keys = kinds.map(() => LADDERS[ladder].keys[0] as string); continue; }
    if (next.every((k, i) => k === keys[i])) break;
    keys = next;
  }
  const { A, joints } = built!;
  A.design.tool = { link: built!.tcpLink, xyz_m: built!.tcp.map((x) => +(x / 1000).toFixed(5)) as Vec3, payload_kg: payload };
  // ---- engineering record ----
  for (const j of joints) {
    const c = evaluate(j.key, torques[j.name] ?? 0), r = rating(j.key);
    A.design.joints.push({ joint: j.name, actuator: j.key, required_nm: c.required_nm, rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: c.margin, speed_rad_s: r.speed_rad_s,
      note: `worst static ${(torques[j.name] ?? 0).toFixed(3)} N·m (arm stretched horizontally with ${payload} kg) x ${DYNAMIC_FACTOR} dynamic factor` });
    A.check(`torque:${j.name}`, c.ok && c.continuous_ok, `needs ${c.required_nm} N·m peak, ${part(j.key).name} gives ${r.peak_nm} N·m peak / ${r.rated_nm} N·m rated (margin ${c.margin}x)`);
  }
  const reachActual = reachOf(built!, kinds);
  A.design.performance = { reach_m: +reachActual.toFixed(3), payload_kg: payload, mass_kg: +totalMass(A.spec).toFixed(3), actuators: LADDERS[ladder].label, max_joint_speed_rad_s: Math.min(...joints.map((j) => rating(j.key).speed_rad_s)) };
  if (req.reachM && Math.abs(reachActual - req.reachM) > 0.05) A.design.assumptions.push(`requested reach ${req.reachM} m; built reach is ${reachActual.toFixed(3)} m (actuator bodies set the minimum spacing)`);
  if (A.spec.end_effectors.length) {
    const g = rating(gripKeyFor(ladder));
    const force = g.rated_nm / 0.07, holdKg = (2 * 0.5 * force) / 9.81;
    A.design.performance.grip_force_n = +force.toFixed(1);
    A.check("gripper:hold", holdKg >= payload * 1.5, `fingertip force ${force.toFixed(1)} N at 70 mm (rated torque), holds ${holdKg.toFixed(2)} kg with friction 0.5 vs payload ${payload} kg x 1.5`);
  }
  // supply: bus adapter and power; current estimated from load share of stall current
  const bus = LADDERS[ladder].bus;
  A.buy(bus, 1, "USB to actuator bus");
  if (ladder !== "cubemars") A.buy("psu_12v_lrs75", 1, "12 V actuator supply");
  const amps = joints.reduce((s, j) => s + Number(part(j.key).specs.stall_current_a ?? part(j.key).specs.current_a ?? 1) * Math.min(1, (torques[j.name] ?? 0) / rating(j.key).peak_nm), 0);
  A.design.performance.holding_current_a = +amps.toFixed(2);
  if (ladder !== "cubemars") A.check("power:supply", amps <= 6 * 0.8, `holding the payload stretched out draws ~${amps.toFixed(1)} A of the 6 A supply`);
  A.design.assumptions.push(
    "Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.",
    "Links are cantilevered from one side of each horn (as on SO-101 / Koch arms); add an idler bearing on the far side for heavy use.",
    `Torques are exact static gravity loads of this geometry plus ${Math.round((DYNAMIC_FACTOR - 1) * 100)} % for acceleration; continuous duty is checked at ${Math.round(0.5 * 100)} % of the worst pose.`,
  );
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
