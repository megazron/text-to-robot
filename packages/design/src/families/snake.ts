// Snake robot: a chain of Feetech STS serial-bus servos with alternating yaw and pitch joints (the classic ACM / CMU
// layout). Each printed segment carries the next servo in a cradle, bolts to the previous servo's horn, and rolls on a
// pair of passive wheels (608 bearings on printed pegs): the wheels slide sideways but roll forwards, the friction
// difference that turns a travelling wave in the yaw joints into forward motion. The head carries an FPV camera;
// power and the servo bus come down a tether from a bench control case (a snake has no room for a pack and a computer).
//
// Checks: yaw joints against the side friction of the wheels, pitch joints lifting the head and two segments off the
// ground, the bus current, the wave's expected speed, segment printability.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { frame, mul, translation, invert, apply, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass, descendants, fk } from "../kin.ts";
import { controlCase, enclosureChecks, exposed } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { busChain } from "../netlist.ts";
import { withSolids, interferences } from "../clearance.ts";
import { bracketOps, type PlacedJoint } from "./chain.ts";
import { recordCost, plugWindowOps, type DesignRequest } from "./common.ts";

export interface SnakeRequest extends DesignRequest { segments?: number; }

const H0 = 34;            // chain axis height above the ground, mm
const PITCH = 82;         // joint spacing along the body
const WHEEL_Y = 31, WHEEL_R = 11;
const G = 9.81;

export function designSnake(req: SnakeRequest = {}): RobotSpecification {
  const n = Math.max(4, Math.min(12, Math.round(req.segments ?? 8)));
  const A = new Assembly(req.name ?? "snake_robot", "snake", req.prompt);
  A.design.request = { ...req } as Record<string, unknown>;
  const servo = (req.budget ?? 9999) < 200 + n * 20 ? "feetech_sts3215_c047" : "feetech_sts3215_c047";
  const depth = 38.1, mid = (depth - 1.5) / 2;   // the servo is centred on the chain axis along its own output axis

  // joint k (1..n) at x = -k * PITCH; odd joints yaw (axis z), even joints pitch (axis y); case towards +x (into the link ahead)
  const joints: PlacedJoint[] = [];
  for (let k = 1; k <= n; k++) {
    const yaw = k % 2 === 1, axis: Vec3 = yaw ? [0, 0, 1] : [0, 1, 0];
    const P: Vec3 = [-k * PITCH, 0, H0], W = frame([P[0] + axis[0] * mid, P[1] + axis[1] * mid, P[2] + axis[2] * mid], axis, [-1, 0, 0]);
    joints.push({ name: `j${k}`, key: servo, axis, xdir: [-1, 0, 0], dirIn: [-1, 0, 0], limit: yaw ? [-0.45, 0.45] : [-0.4, 0.4], P, W } as PlacedJoint);
  }
  // segment frames: the head (root) at the origin, segment k's frame at joint k
  const segW = (k: number) => (k === 0 ? translation([0, 0, H0]) : joints[k - 1].W);
  const segName = (k: number) => (k === 0 ? "base_link" : k === n ? "tail" : `segment_${k}`);
  // wheels sit in the gap between the servo behind a joint and the next servo's case
  const wheelX = (k: number) => (k === 0 ? -20 : k < n ? joints[k - 1].P[0] - 30 : joints[n - 1].P[0] - 32);

  for (let k = 0; k <= n; k++) {
    const W = segW(k), name = segName(k), ops: Op[] = [];
    if (k > 0 && k < n) ops.push(...bracketOps(joints[k - 1], servo, joints[k].W));
    else if (k === 0) ops.push({ op: "cradle", key: servo, T: joints[0].W, wall: 3 }, { op: "hull", of: [{ op: "box", min: [-PITCH + 30, -16, H0 - 16], max: [-PITCH + 34, 16, H0 + 16] }, { op: "box", min: [-2, -14, H0 - 14], max: [8, 14, H0 + 14], r: 4 }] });
    else ops.push({ op: "horn", key: servo, t: 4 } as Op);
    if (k === n) {
      // the tail: horn plate, a tube to a cable boss where the tether is tied off
      const J = joints[n - 1];
      ops.length = 0;
      // in the servo frame: x points back along the body, z along the joint axis (the horn face at z 0, the body's axis line at z -mid)
      const m0 = -mid;
      ops.push({ op: "at", T: J.W, of: [{ op: "horn", key: servo, t: 4 },
        { op: "box", min: [0, -12, 0], max: [64, 12, 4], r: 2 },
        { op: "box", min: [56, -12, m0 - 6], max: [64, 12, 4], r: 2 },
        { op: "rod", a: [60, 0, m0], b: [80, 0, m0], r: 9 }, { op: "hole", a: [55, 0, m0], b: [81, 0, m0], d: 7 }] });
    }
    // wheel pegs either side of the link, reached by a cross beam under the servo
    const wx = wheelX(k), zc = WHEEL_R;
    ops.push({ op: "box", min: [wx - 6, -WHEEL_Y + 5, zc - 4], max: [wx + 6, WHEEL_Y - 5, zc + 4], r: 2 });
    for (const s of [-1, 1]) ops.push({ op: "rod", a: [wx, s * (WHEEL_Y - 6), zc], b: [wx, s * (WHEEL_Y + 3.4), zc], r: 3.9 }, { op: "box", min: [wx - 6, s > 0 ? WHEEL_Y - 14 : -WHEEL_Y + 5, zc], max: [wx + 6, s > 0 ? WHEEL_Y - 5 : -WHEEL_Y + 14, H0 - 6] });
    if (k > 0 && k < n) ops.push(...plugWindowOps(servo, joints[k].W));
    if (k === 0) ops.push(...plugWindowOps(servo, joints[0].W));
    A.printedLink(name, { name, ops: [{ op: "at", T: invert(W), of: ops }] }, { material: k % 2 ? "printed_accent" : "printed_dark", role: k === 0 ? "base" : "link" });
    for (const s of [-1, 1]) {
      const Tw = mul(invert(W), frame([wx, s * (WHEEL_Y - 0.0), zc], [0, s, 0], [1, 0, 0]));
      A.mount(name, "bearing_608zz", Tw, `${name}_wheel_${s > 0 ? "l" : "r"}`, "passive wheels (608 bearings on printed pegs)", "rubber");
      A.spec.joints.pop();
      A.continuous(`${name}_wheel_${s > 0 ? "l" : "r"}_spin`, name, `${name}_wheel_${s > 0 ? "l" : "r"}`, Tw, null, [0, 0, 1]);
    }
    A.fastener("M3 x 10 + washer (wheel retainer)", 2);
  }
  // servos and the joints between segments
  for (let k = 1; k <= n; k++) {
    const J = joints[k - 1], parent = segName(k - 1), Wp = segW(k - 1);
    A.mount(parent, servo, mul(invert(Wp), J.W), `j${k}_servo`, `${J.axis[2] ? "yaw" : "pitch"} joint ${k}`);
    A.revolute(`j${k}`, parent, segName(k), mul(invert(Wp), J.W), servo, J.limit[0], J.limit[1]);
    A.fastener("M2 x 6 case screws", 4); A.fastener("horn screws", 4);
  }
  // head camera on a nose cradle
  const camT = mul(translation([22, 0, H0]), frame([0, 0, 0], [1, 0, 0], [0, 0, 1]));
  A.printedLink("nose", { name: "nose", ops: [{ op: "at", T: invert(segW(0)), of: [
    { op: "box", min: [8, -14, H0 - 14], max: [14, 14, H0 + 14], r: 3 }, { op: "box", min: [14, -12.2, H0 - 12], max: [30, -10.2, H0 + 12] }, { op: "box", min: [14, 10.2, H0 - 12], max: [30, 12.2, H0 + 12] },
    { op: "hole", a: [23, -13.2, H0], b: [23, -9.2, H0], d: 2.2 }, { op: "hole", a: [23, 9.2, H0], b: [23, 13.2, H0], d: 2.2 }] }] }, { material: "printed_accent" });
  A.fixed("nose_mount", "base_link", "nose", translation([0, 0, 0]));
  // camera: lens forward (+x), side screws (camera x) across the cheeks, 7 mm behind its lens face
  A.mount("nose", "fpv_camera_micro", mul(invert(segW(0)), frame([30, 0, H0], [1, 0, 0], [0, 1, 0])), "camera", "head camera (live video up the tether)");
  exposed(A, "camera", "looks forward from the nose cradle", [19, 19]);
  void camT;
  A.spec.sensors.push({ name: "head_camera", type: "camera", parent: "camera", origin: { xyz: [0, 0, 0.008], rpy: [0, 0, 0] }, params: { part: "fpv_camera_micro", output: "analog video over the tether" } });
  A.spec.root = "base_link";

  // ---------------- bench control case and harness down the tether
  const Hh = new Harness(A);
  controlCase(A, Hh, { parent: "base_link", T: translation([-n * PITCH - 260, 120, -H0]), psu: "psu_12v_lrs150", psuUse: "12 V servo supply", boards: [{ name: "servo_bus", key: "waveshare_bus_servo_adapter", use: "USB to servo bus (laptop runs the gait)" }] });
  Hh.mainPower("VBUS", { source: "power_supply", pos: "DC OUTPUT +V", neg: "DC OUTPUT -V", fuse: false, volts: 12, cont: 12.5, peakLimit: 13.75, simultaneous: 2, simNote: "the two pitch joints behind the head at stall while it looks over an edge, the rest moving" });
  busChain(Hh, { adapter: "servo_bus", servos: Array.from({ length: n }, (_, k) => `j${n - k}_servo`), rail: "VBUS" });
  Hh.spare("servo_bus.dc_in");
  Hh.feed("VBUS", "camera", { v: "VIN", g: "GND", typ: 0.15, peak: 0.2 });
  Hh.spare("camera.main.VIDEO");
  Hh.notes.push("The tether runs from the control case to the tail: servo bus (3 wires), 12 V for the camera and its video lead, which ends in an RCA plug for a USB video grabber on the laptop.");
  finishWiring(Hh, { noClips: /wheel/ });
  enclosureChecks(A);

  // ---------------- clearance at rest and with the body curled
  const skip = new Set<string>();
  for (const j of A.spec.joints) if ((j.type === "fixed" && /servo|camera|nose/.test(j.child)) || /_wheel_[lr]$/.test(j.child)) skip.add(`${j.parent}|${j.child}`);   // wheels turn on their pegs
  const curl = Object.fromEntries(joints.map((J, i) => [J.name, (i % 2 === 0 ? 0.45 : 0.4) * (i % 4 < 2 ? 1 : -1)]));
  const mirror = Object.fromEntries(Object.entries(curl).map(([k, v]) => [k, -v]));
  const hits = [{}, curl, mirror].flatMap((q) => withSolids(A.spec, (mdl) => interferences(mdl, q, undefined, 2, skip)).map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`));
  A.check("clearance:curl", hits.length === 0, hits.length ? `intersecting: ${[...new Set(hits)].slice(0, 6).join(", ")}` : "no segment intersects another straight or curled to its limits (0.45 rad yaw, 0.4 rad pitch, alternating: a serpentine wave needs 0.3-0.5)");

  // ---------------- loads
  const mass = totalMass(A.spec), segMass = mass / (n + 1), r = rating(servo);
  // yaw: the wave drags every wheel sideways a little; the worst joint (mid-body) pushes half the body's side friction at half a body length
  const muSide = 0.3, yawNm = muSide * (mass / 2) * G * (n * PITCH / 1000 / 4);
  // pitch: the second joint lifts the head segment and the first segment clear of the ground (camera periscope)
  const liftLever = (PITCH * 1.0 + PITCH * 0.5) / 1000, pitchNm = 2 * segMass * G * liftLever * 0.75 + 0.4 * 0.05;
  for (const J of joints) {
    const need = J.axis[2] ? yawNm : pitchNm, m = r.rated_nm / Math.max(need, 1e-6);
    A.design.joints.push({ joint: J.name, actuator: servo, required_nm: +need.toFixed(3), rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: +m.toFixed(2), speed_rad_s: r.speed_rad_s,
      note: J.axis[2] ? `side friction ${muSide} of half the ${mass.toFixed(2)} kg body at a quarter body length` : `lifts the head and one segment (${(2 * segMass).toFixed(2)} kg) about ${(liftLever * 1000).toFixed(0)} mm out` });
  }
  A.check("torque:yaw", r.rated_nm >= yawNm * 1.3, `the travelling wave needs about ${yawNm.toFixed(2)} N·m at mid-body (wheels slide sideways at mu ${muSide}); ${part(servo).name} gives ${r.rated_nm} N·m rated`);
  A.check("torque:pitch", r.rated_nm >= pitchNm * 1.3, `lifting the head to look over a step needs ${pitchNm.toFixed(2)} N·m at joint 2; rated ${r.rated_nm} N·m`);
  // serpenoid speed estimate: about a quarter of the wave speed for wheeled snakes on hard floors
  const waveHz = 0.5, wavelength = (n * PITCH / 1000) / 1.5, vEst = 0.25 * waveHz * wavelength;
  A.check("gait:speed", vEst >= 0.03, `a ${waveHz} Hz wave with a ${(wavelength * 100).toFixed(0)} cm wavelength: about ${(vEst * 100).toFixed(0)} cm/s on a hard floor (wheels roll forwards, slide sideways)`);
  const busA = Number(part(servo).specs.stall_current_a ?? 2.7) * Math.ceil(n / 2) * 0.5 + 0.2;
  A.check("power:bus", busA <= 12.5, `${busA.toFixed(1)} A with half the servos at half stall (lifting) vs the 12.5 A supply`);
  if (req.budget !== undefined) A.check("budget", recordCost(A) <= req.budget, `$${recordCost(A).toFixed(2)} of parts vs $${req.budget} budget`);
  A.design.tcp = { link: "base_link", xyz: [0.02, 0, 0] };
  A.design.performance = { segments: n, joints: n, length_m: +((n + 1) * PITCH / 1000).toFixed(2), mass_kg: +mass.toFixed(2), est_speed_m_s: +vEst.toFixed(3), wave_hz: waveHz, wavelength_m: +wavelength.toFixed(2),
    yaw_joints: Math.ceil(n / 2), pitch_joints: Math.floor(n / 2), actuator: part(servo).name };
  A.design.assumptions.push(
    "Gaits (serpentine, sidewinding with the pitch joints, rolling) run on the laptop through the servo bus; the speed estimate is for a hard, flat floor.",
    "Passive wheels make lateral undulation work on smooth floors; on grass or gravel the wheels dig in and it slows to a crawl.",
    "It is not waterproof: the servos and the camera must stay dry.",
  );
  recordCost(A);
  return A.finish(`Snake robot: ${n} STS servos in alternating yaw and pitch joints, ${((n + 1) * PITCH / 1000).toFixed(2)} m long, ${mass.toFixed(2)} kg, about ${(vEst * 100).toFixed(0)} cm/s, tethered`);
}

/** Pose -> column-major matrix (mm). */
export function poseMat(p: { xyz: number[]; rpy: number[] }): Mat4 {
  const [r, pi, y] = p.rpy, cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(pi), sp = Math.sin(pi), cy = Math.cos(y), sy = Math.sin(y);
  const R = [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr], [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr], [-sp, cp * sr, cp * cr]];
  return [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, p.xyz[0] * 1000, p.xyz[1] * 1000, p.xyz[2] * 1000, 1];
}
void apply; void descendants; void fk;
