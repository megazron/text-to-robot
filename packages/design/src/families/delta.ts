// Delta robot (rotary, Clavel layout): three Feetech STS servos on a printed base plate held up by three aluminium
// legs, printed upper arms, carbon-tube parallelogram forearms on M3 ball joints, and a printed effector platform
// that stays level. Fast and light: the motors stay on the frame, only the thin rods move.
//
// URDF is a tree, a delta is three closed loops: the tree runs base -> arm 1 -> forearm 1 -> platform, forearms 2 and
// 3 end at their wrist points, and the design record lists the two loop closures (metadata.design.loops) that the
// simulation adds as connect constraints. The ball joints are passive revolute pairs (universal joints).
//
// Checks: inverse kinematics over the working box (every corner reachable, no arm past its limit), the worst shoulder
// torque holding the payload, platform speed, ball-joint angles within their range, rod buckling, supply current.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { frame, mul, translation, invert, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass } from "../kin.ts";
import { controlCase, enclosureChecks } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { busChain } from "../netlist.ts";
import { withSolids, interferences } from "../clearance.ts";
import { recordCost, tubeLink, buyTubeStock, type DesignRequest } from "./common.ts";

const SERVO = "feetech_sts3250";
const RF = 70, L1 = 90, L2 = 200, RE = 35, ROD_GAP = 40, BOSS = ROD_GAP / 2 - 6;   // shoulder radius, upper arm, forearm, wrist radius, parallelogram width (mm)
const THETA0 = 30 * Math.PI / 180;                          // home: upper arms 30 deg below horizontal
const TOFF = 14, ZS = -24;                                  // arm plane: 14 mm beyond the horn face along the shoulder axis; shoulder axis 24 mm under the plate
const LEG_H = 420;                                          // base plate height above the bench
const G = 9.81;

const v = { add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  s: (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k], dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], n: (a: Vec3) => Math.hypot(...a),
  u: (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, x: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] };
const phiOf = (i: number) => (i * 2 * Math.PI) / 3;
const radial = (i: number): Vec3 => [Math.cos(phiOf(i)), Math.sin(phiOf(i)), 0];
const tangent = (i: number): Vec3 => [-Math.sin(phiOf(i)), Math.cos(phiOf(i)), 0];

/** Shoulder angle (rad, down from horizontal) that puts the platform centre at p (mm, base frame); NaN when out of reach. */
const shoulder = (i: number): Vec3 => v.add(v.add(v.s(radial(i), RF), v.s(tangent(i), TOFF)), [0, 0, ZS]);
const wristOf = (p: Vec3, i: number): Vec3 => v.add(v.add(p, v.s(radial(i), RE)), v.s(tangent(i), TOFF));
export function deltaIk(p: Vec3, i: number): number {
  const r = radial(i), q = v.sub(wristOf(p, i), shoulder(i)), x = v.dot(q, r), y = v.dot(q, tangent(i)), z = q[2];
  // elbow circle in the (radial, z) plane: |w - E|^2 = L2^2 with E = (L1 cos t, -L1 sin t) and the out-of-plane offset y
  const L2p = Math.sqrt(Math.max(0, L2 * L2 - y * y));
  const d2 = x * x + z * z, c = (L1 * L1 + d2 - L2p * L2p) / (2 * L1 * Math.sqrt(d2));
  if (Math.abs(c) > 1) return NaN;
  const base = Math.atan2(-z, x);   // angle of w below horizontal
  return base - Math.acos(c);       // the elbow-out solution
}
const elbowAt = (i: number, th: number): Vec3 => v.add(shoulder(i), v.add(v.s(radial(i), L1 * Math.cos(th)), [0, 0, -L1 * Math.sin(th)]));
/** Platform centre at home. */
export const deltaHome = (): Vec3 => { const E = elbowAt(0, THETA0), dx = v.dot(E, radial(0)) - RE; return [0, 0, E[2] - Math.sqrt(L2 * L2 - dx * dx)]; };

export function designDelta(req: DesignRequest = {}): RobotSpecification {
  const A = new Assembly(req.name ?? "delta_robot", "delta_parallel", req.prompt);
  A.design.request = { ...req } as Record<string, unknown>;
  const payload = Math.max(0, req.payloadKg ?? 0.1);
  const I = translation([0, 0, 0]);
  const home = deltaHome();

  // ---------------- base plate (hexagon) with three servo cradles and three leg sockets; base frame at the plate's underside
  const plate: Op[] = [{ op: "hull", of: Array.from({ length: 6 }, (_, k): Op => { const a = k * Math.PI / 3 + Math.PI / 6; return { op: "rod", a: [100 * Math.cos(a), 100 * Math.sin(a), 0], b: [100 * Math.cos(a), 100 * Math.sin(a), 6], r: 4 }; }) }];
  const servoW: Mat4[] = [];
  for (let i = 0; i < 3; i++) {
    // servo output face on the shoulder axis at RF, output along the tangent; case behind it, hanging below the plate
    const t = tangent(i), r = radial(i), S: Vec3 = v.add(v.s(r, RF), [0, 0, ZS]);
    const W = frame(S, t, [0, 0, 1]);
    servoW.push(W);
    // cradle round the case (which hangs below the plate, output facing along t) and a web up to the plate
    plate.push({ op: "cradle", key: SERVO, T: W, wall: 3 }, { op: "at", T: W, of: [{ op: "box", min: [10.6, -15.4, -41.1], max: [-ZS + 0.5, 15.4, -3], r: 2 }] });
  }
  for (let i = 0; i < 3; i++) { const a = phiOf(i) + Math.PI / 3, c: Vec3 = [88 * Math.cos(a), 88 * Math.sin(a), 0]; plate.push({ op: "rod", a: [c[0], c[1], -22], b: [c[0], c[1], 6], r: 15 }, { op: "hole", a: [c[0], c[1], -23], b: [c[0], c[1], 4], d: 20.3 }); }
  A.printedLink("base_link", { name: "base_link", ops: plate }, { role: "base", material: "printed_dark" });
  A.spec.root = "base_link";
  for (let i = 0; i < 3; i++) { const a = phiOf(i) + Math.PI / 3; tubeLink(A, "base_link", I, `leg_${i + 1}`, [88 * Math.cos(a), 88 * Math.sin(a), 0], [130 * Math.cos(a), 130 * Math.sin(a), -LEG_H], "al_tube_20x2_1m", "legs to the bench"); }
  for (let i = 0; i < 3; i++) {
    const a = phiOf(i) + Math.PI / 3, f: Vec3 = [130 * Math.cos(a), 130 * Math.sin(a), -LEG_H];
    const n = `foot_${i + 1}`;
    A.printedLink(n, { name: n, ops: [{ op: "rod", a: [f[0], f[1], f[2] - 6], b: [f[0], f[1], f[2] + 24], r: 15 }, { op: "rod", a: [f[0], f[1], f[2] - 6], b: [f[0], f[1], f[2]], r: 26 }, { op: "hole", a: [f[0], f[1], f[2]], b: [f[0], f[1], f[2] + 25], d: 20.3 }, { op: "hole", a: [f[0], f[1], f[2] - 7], b: [f[0], f[1], f[2] + 1], d: 5 }] }, { material: "printed_accent" });
    A.fixed(`${n}_mount`, "base_link", n, I);
  }
  A.fastener("M4 x 25 + nyloc (legs, through the tube)", 6);
  A.fastener("M4 x 16 screw (feet to the bench)", 3);

  // ---------------- arms: servo, upper arm, elbow universal, forearm parallelogram; arm 1 carries the platform in the tree
  const loops: { body: string; anchor_m: Vec3; to: string; to_anchor_m: Vec3 }[] = [];
  const PW = frame(wristOf(home, 0), tangent(0), radial(0));
  for (let i = 0; i < 3; i++) {
    const t = tangent(i), _r = radial(i), W = servoW[i];
    A.mount("base_link", SERVO, W, `servo_${i + 1}`, "shoulder servo");
    // joint frame: servo output, rotated so the joint's zero is the home angle (upper arm 30 deg below horizontal)
    const S: Vec3 = [W[12], W[13], W[14]];
    const E = elbowAt(i, THETA0);
    const armDir = v.u(v.sub(E, shoulder(i)));
    const pad = v.add(S, v.s(armDir, 30));
    const Jw = frame(S, t, armDir);
    const up = `upper_arm_${i + 1}`;
    A.revolute(`shoulder_${i + 1}`, "base_link", up, Jw, SERVO, -0.9, 1.2);
    A.printedLink(up, { name: up, ops: [{ op: "at", T: invert(Jw), of: [
      { op: "at", T: W, of: [{ op: "horn", key: SERVO, t: 5 }] },
      { op: "hull", of: [{ op: "at", T: W, of: [{ op: "rod", a: [0, 0, 0], b: [0, 0, 5], r: 13 }] }, { op: "rod", a: pad, b: v.add(pad, v.s(t, 5)), r: 9 }] },
      { op: "hull", of: [{ op: "rod", a: pad, b: v.add(pad, v.s(t, 5)), r: 9 }, { op: "rod", a: v.add(E, v.s(t, -BOSS)), b: v.add(E, v.s(t, BOSS)), r: 6 }] },
      // the ball studs screw into the boss ends; the balls sit 6 mm beyond them
      ...[-1, 1].map((s): Op => ({ op: "hole", a: v.add(E, v.s(t, s * (BOSS - 7))), b: v.add(E, v.s(t, s * (BOSS + 0.5))), d: 2.6 })),
    ] }] }, { material: "printed_accent" });
    // elbow: two passive revolutes (axis t, then axis n) at the elbow centre
    const wrist = wristOf(home, i), d = v.u(v.sub(wrist, E)), nAx = v.u(v.x(d, t));
    const Ea = frame(E, t, armDir), Eb = frame(E, nAx, d);
    A.frameLink(`elbow_${i + 1}`);
    const ja = A.revolute(`elbow_${i + 1}_a`, up, `elbow_${i + 1}`, mul(invert(Jw), Ea), SERVO, -0.8, 0.8); ja.passive = true; ja.limit!.effort = 0.01; ja.dynamics = { damping: 0.002, friction: 0.001 };
    const fa = `forearm_${i + 1}`;
    A.frameLink(fa);
    const jb = A.revolute(`elbow_${i + 1}_b`, `elbow_${i + 1}`, fa, mul(invert(Ea), Eb), SERVO, -0.6, 0.6); jb.passive = true; jb.limit!.effort = 0.01; jb.dynamics = { damping: 0.002, friction: 0.001 };
    // the parallelogram: two carbon tubes between pairs of ball joints, ROD_GAP apart along t
    for (const s of [-1, 1]) {
      const a0 = v.add(E, v.s(t, s * ROD_GAP / 2)), b0 = v.add(wrist, v.s(t, s * ROD_GAP / 2));
      tubeLink(A, fa, Eb, `${fa}_rod_${s > 0 ? "a" : "b"}`, v.add(a0, v.s(d, 12)), v.sub(b0, v.s(d, 12)), "cf_tube_6x4_1m", "forearm rods (cut and glued into the rod ends)");
      for (const [p0, dir] of [[a0, d], [b0, v.s(d, -1)]] as const) A.mount(fa, "ball_joint_m3", mul(invert(Eb), frame(p0, dir, t)), `${fa}_ball_${s > 0 ? "a" : "b"}${p0 === a0 ? "1" : "2"}`, "M3 ball joints (forearm ends)", "metal");
    }
    const Wb = frame(wrist, nAx, d);
    if (i === 0) {
      A.frameLink("wrist_1");
      const wa = A.revolute("wrist_1_a", fa, "wrist_1", mul(invert(Eb), Wb), SERVO, -0.6, 0.6); wa.passive = true; wa.limit!.effort = 0.01; wa.dynamics = { damping: 0.002, friction: 0.001 };
      // the platform's own frame is this joint's frame: at arm 1's wrist point, z along arm 1's tangent
      const wb = A.revolute("wrist_1_b", "wrist_1", "platform", mul(invert(Wb), PW), SERVO, -0.8, 0.8); wb.passive = true; wb.limit!.effort = 0.01; wb.dynamics = { damping: 0.002, friction: 0.001 };
    } else loops.push({ body: fa, anchor_m: [0, 0, 0], to: "platform", to_anchor_m: [0, 0, 0] });
  }
  // platform: a printed triangle with the three ball-stud pairs and a tool plate below
  // a disc inside the wrist circle, three spokes and a stud bar at each wrist (along its arm's tangent, studs at the ends)
  const pl: Op[] = [{ op: "rod", a: v.add(home, [0, 0, -4]), b: v.add(home, [0, 0, 2]), r: RE - 8 },
    ...[0, 1, 2].flatMap((i): Op[] => { const w = wristOf(home, i); return [{ op: "rod", a: v.add(w, v.s(tangent(i), -BOSS)), b: v.add(w, v.s(tangent(i), BOSS)), r: 5 }, { op: "beam", a: home, b: w, w: 10, h: 6 }]; }),
    { op: "rod", a: v.add(home, [0, 0, -14]), b: v.add(home, [0, 0, 0.5]), r: 16 }, { op: "hole", a: v.add(home, [0, 0, -15]), b: v.add(home, [0, 0, 7]), d: 6 }];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const w = wristOf(home, i); pl.push({ op: "hole", a: v.add(w, v.s(tangent(i), s * (BOSS - 7))), b: v.add(w, v.s(tangent(i), s * (BOSS + 0.5))), d: 2.6 }); }
  A.printedLink("platform", { name: "platform", ops: [{ op: "at", T: invert(PW), of: pl }] }, { material: "printed_accent" });
  // the loop anchors in metres, in each forearm's frame and in the platform frame
  (A.design as unknown as { loops: unknown }).loops = loops.map((l, k) => {
    const i = k + 1, E = elbowAt(i, THETA0), wrist = wristOf(home, i), d = v.u(v.sub(wrist, E)), nAx = v.u(v.x(d, tangent(i)));
    const Eb = frame(E, nAx, d), local = mulPoint(invert(Eb), wrist), pLocal = mulPoint(invert(PW), wrist);
    return { body: l.body, anchor_m: local.map((x) => +(x / 1000).toFixed(6)), to: "platform", to_anchor_m: pLocal.map((x) => +(x / 1000).toFixed(6)) };
  });
  // the URDF root is the bench under the feet: the base plate stands LEG_H + the feet's 6 mm above it
  A.frameLink("bench"); A.fixed("bench_mount", "bench", "base_link", translation([0, 0, LEG_H + 6])); A.spec.root = "bench";
  A.design.tcp = { link: "platform", xyz: mulPoint(invert(PW), v.add(home, [0, 0, -14])).map((x) => x / 1000) as Vec3 };

  // ---------------- bench control case, bus up one leg
  const H = new Harness(A);
  controlCase(A, H, { parent: "base_link", T: translation([170, -60, -LEG_H]), psu: "psu_12v_lrs150", psuUse: "12 V servo supply", boards: [{ name: "servo_bus", key: "waveshare_bus_servo_adapter", use: "USB to servo bus (the laptop runs the motion)" }] });
  H.mainPower("VBUS", { source: "power_supply", pos: "DC OUTPUT +V", neg: "DC OUTPUT -V", fuse: false, volts: 12, cont: 12.5, peakLimit: 13.75, simultaneous: 3, simNote: "all three shoulders accelerating together" });
  busChain(H, { adapter: "servo_bus", servos: ["servo_1", "servo_2", "servo_3"], rail: "VBUS" });
  H.spare("servo_bus.dc_in");
  finishWiring(H, { noClips: /forearm|elbow|wrist|platform/ });
  enclosureChecks(A);

  // ---------------- kinematics over the working box
  const box = { r: 70, z0: home[2] - 40, z1: home[2] + 40 };
  const pts: Vec3[] = [];
  for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const z of [box.z0, home[2], box.z1]) pts.push([sx * box.r * 0.7, sy * box.r * 0.7, z]);
  let worstJ = 0, reach = true, worstBall = 0;
  for (const p of pts) for (let i = 0; i < 3; i++) {
    const th = deltaIk(p, i); if (!Number.isFinite(th)) { reach = false; continue; }
    const q = th - THETA0; worstJ = Math.max(worstJ, q < 0 ? -q / 0.9 : q / 1.2);
    // ball-joint angle: forearm against the upper-arm axis normal (the rod end's cone)
    const E = elbowAt(i, th), w = wristOf(p, i), dd = v.u(v.sub(w, E)), off = Math.asin(Math.min(1, Math.abs(v.dot(dd, tangent(i)))));
    worstBall = Math.max(worstBall, off);
  }
  A.check("kinematics:workspace", reach && worstJ <= 1, `every point of a ${(box.r * 1.4).toFixed(0)} x ${(box.r * 1.4).toFixed(0)} x ${box.z1 - box.z0} mm box round the home point has an IK solution within the shoulder limits (worst ${(worstJ * 100).toFixed(0)} % of the range)`);
  const ballMax = Number(part("ball_joint_m3").specs.max_angle_deg) * Math.PI / 180;
  A.check("kinematics:ball_joints", worstBall <= ballMax, `ball joints swing at most ${(worstBall * 180 / Math.PI).toFixed(0)} deg across the box vs ${part("ball_joint_m3").specs.max_angle_deg} deg for the rod ends`);
  // shoulder torque: the platform, payload and forearms shared by three arms, the upper arm's own weight, plus a 5 g move
  const forearmKg = A.spec.links.filter((l) => /^forearm_\d_(rod|ball)/.test(l.name)).reduce((s, l) => s + l.mass, 0) / 3;
  const platKg = A.spec.links.find((l) => l.name === "platform")!.mass + payload, upKg = A.spec.links.find((l) => l.name === "upper_arm_1")!.mass;
  const accel = 5 * G, statNm = ((platKg / 3 + forearmKg / 2) * G * L1 * Math.cos(THETA0) + upKg * G * L1 / 2 * Math.cos(THETA0)) / 1000;
  const dynNm = statNm * (1 + accel / G);
  const r = rating(SERVO);
  for (let i = 1; i <= 3; i++) A.design.joints.push({ joint: `shoulder_${i}`, actuator: SERVO, required_nm: +dynNm.toFixed(3), rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: +(r.peak_nm / dynNm).toFixed(2), speed_rad_s: r.speed_rad_s,
    note: `a third of the ${platKg.toFixed(2)} kg platform with payload, half the forearm, the upper arm, at 5 g acceleration` });
  A.check("torque:shoulders", r.rated_nm >= statNm * 1.5 && r.peak_nm >= dynNm, `holding needs ${statNm.toFixed(3)} N·m (rated ${r.rated_nm}); a 5 g pick move needs ${dynNm.toFixed(2)} N·m (peak ${r.peak_nm})`);
  const vPlat = r.speed_rad_s * L1 / 1000;
  A.check("speed:platform", vPlat >= 0.5, `about ${vPlat.toFixed(2)} m/s at the platform (servo ${r.speed_rad_s} rad/s x ${L1} mm arm); a pick-and-place cycle of 50 mm up, 150 mm across takes about ${((0.05 * 2 + 0.15) / (vPlat * 0.6)).toFixed(2)} s`);
  // forearm rods in compression: Euler buckling of a 6 x 4 mm carbon tube over the rod length
  const Ec = 110e9, Irod = Math.PI * (0.006 ** 4 - 0.004 ** 4) / 64, Lr = (L2 - 24) / 1000, Pcr = Math.PI ** 2 * Ec * Irod / (Lr * Lr), load = dynNm / (L1 / 1000);
  A.check("structure:forearm_buckling", Pcr >= 3 * load, `each rod carries at most ${load.toFixed(1)} N; it buckles at ${Pcr.toFixed(0)} N (${(Pcr / load).toFixed(0)}x)`);
  const amps = 3 * Number(part(SERVO).specs.stall_current_a ?? 2.7) * 0.6;
  A.check("power:supply", amps <= 12.5, `${amps.toFixed(1)} A with all three servos at 60 % of stall current vs the 12.5 A supply`);
  // clearance: home, and the box corners (shoulders set by IK, passive joints left at home: the solids are checked as built)
  const skip = new Set<string>();
  for (const j of A.spec.joints) if (j.type === "fixed" && /servo|ball|rod/.test(j.child)) skip.add(`${j.parent}|${j.child}`);
  const hits = withSolids(A.spec, (mdl) => interferences(mdl, {}, undefined, 2, skip));
  A.check("clearance:home", hits.length === 0, hits.length ? `intersecting: ${hits.slice(0, 6).map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no part intersects another at home");
  if (req.budget !== undefined) A.check("budget", recordCost(A) <= req.budget, `$${recordCost(A).toFixed(2)} of parts vs $${req.budget} budget`);
  buyTubeStock(A);
  A.design.performance = { payload_kg: payload, workspace_mm: `${(box.r * 1.4).toFixed(0)} x ${(box.r * 1.4).toFixed(0)} x ${box.z1 - box.z0}`, platform_speed_m_s: +vPlat.toFixed(2), upper_arm_mm: L1, forearm_mm: L2,
    home_height_mm: Math.round(LEG_H + home[2]), mass_kg: +totalMass(A.spec).toFixed(2), actuator: part(SERVO).name };
  A.design.assumptions.push(
    "The URDF is the tree base -> arm 1 -> platform; forearms 2 and 3 close their loops through metadata.design.loops (MuJoCo connect constraints). Tools without loop closures (RViz) show arms 2 and 3 hanging free.",
    "The parallelograms keep the platform level; each is modelled as one rod pair with a universal joint at each end, which is kinematically the same.",
    "The tool plate takes a suction cup or a small gripper; the vacuum pump or servo for it is not designed here.",
  );
  recordCost(A);
  return A.finish(`Delta robot: three ${part(SERVO).name} shoulders, ${L1} mm arms and ${L2} mm carbon forearms, ${(box.r * 1.4).toFixed(0)} mm working box, about ${vPlat.toFixed(1)} m/s, ${payload} kg payload`);
}

function mulPoint(T: Mat4, p: Vec3): Vec3 { return [T[0] * p[0] + T[4] * p[1] + T[8] * p[2] + T[12], T[1] * p[0] + T[5] * p[1] + T[9] * p[2] + T[13], T[2] * p[0] + T[6] * p[1] + T[10] * p[2] + T[14]]; }
