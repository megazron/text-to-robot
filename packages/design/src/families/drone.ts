// Quadcopter (X layout, 5 in props): a one-piece printed frame (centre plate + four arms with motor pads), four
// 2207 brushless motors with tri-blade props, a 4-in-1 ESC and an F405 flight controller stacked under a printed
// canopy, an ExpressLRS receiver, an optional micro FPV camera in a printed tilt cradle, and a 4S pack strapped on top.
//
// Sized like a drone is sized: total mass against the motors' static thrust curve (thrust-to-weight, hover throttle),
// hover and full-throttle current against the ESC, the pack's C rating and the XT60, flight time from the pack,
// arm bending at full thrust, prop-to-prop clearance and the centre of mass under the centre of thrust.
// The rotor joints are real continuous joints in the URDF; the simulation applies each motor's thrust at its hub.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, type Vec3 } from "@ttr/parts";
import { frame, mul, translation, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass, comWorld } from "../kin.ts";
import { bay, enclosureChecks, exposed, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { withSolids, interferences } from "../clearance.ts";
import { recordCost, fmt } from "./common.ts";

export interface DroneRequest {
  name?: string; prompt?: string; budget?: number;
  /** carried under the frame, kg */
  payloadKg?: number;
  /** "camera" fits the FPV camera; other sensor names are reported as not fitted */
  sensors?: string[];
}

const MOTOR = "bldc_2207_1750kv", PROP = "prop_5x4_3x3", ESC = "esc_4in1_45a", FC = "fc_f405_30x30", RX = "elrs_receiver_nano", CAM = "fpv_camera_micro", PACK = "lipo_4s_1500";
const WHEELBASE = 225;                 // motor to motor across the diagonal, mm
const R = WHEELBASE / 2;               // centre to motor axis
const PLATE_T = 4, ARM_W = 16, ARM_T = 6, PAD_R = 16;
const CAM_X = 45, CAM_Z = PLATE_T + 15;   // camera side-screw axis
const G = 9.81;
const BURST_LIMIT_A = 60;              // Betaflight current limit, set to the XT60's continuous rating
/** PETG across layers (the weakest direction), MPa; the frame prints flat so arm bending loads the layers in plane */
const PETG_ALLOW_MPA = 20;

/** Thrust (g) and current (A) of one motor at a throttle, by linear interpolation of the motor's thrust table. */
export function motorAt(throttle: number): { thrust_g: number; current_a: number } {
  const tab = [[0, 0, 0.5], ...(part(MOTOR).specs.thrust_table as number[][])];
  const x = Math.min(1, Math.max(0, throttle));
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const [t0, f0, i0] = tab[i - 1], [t1, f1, i1] = tab[i], s = (x - t0) / (t1 - t0);
    return { thrust_g: f0 + s * (f1 - f0), current_a: i0 + s * (i1 - i0) };
  }
  const l = tab[tab.length - 1]; return { thrust_g: l[1], current_a: l[2] };
}
/** One motor's thrust and current at the most current it is allowed (the flight controller's limit). */
export function motorAtCurrent(amps: number): { thrust_g: number; current_a: number; throttle: number } {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (motorAt(m).current_a > amps) hi = m; else lo = m; }
  return { ...motorAt(lo), throttle: lo };
}
/** Throttle at which one motor gives `grams` of thrust (Infinity when it cannot). */
export function throttleFor(grams: number): number {
  const tab = [[0, 0], ...(part(MOTOR).specs.thrust_table as number[][])];
  for (let i = 1; i < tab.length; i++) if (grams <= tab[i][1]) { const [t0, f0] = tab[i - 1], [t1, f1] = tab[i]; return t0 + (t1 - t0) * (grams - f0) / (f1 - f0); }
  return Infinity;
}

/** The printed frame: centre plate with the 30.5 mm stack holes, four arms, a motor pad with the 16 mm M3 pattern at each end. */
function frameOps(): Op[] {
  const ops: Op[] = [{ op: "box", min: [-40, -40, 0], max: [40, 40, PLATE_T], r: 6 }, { op: "box", min: [20, -16, 0], max: [55, 16, PLATE_T], r: 6 }];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a), x = R * c, y = R * s;
    // arms start outside the canopy and its corner screw lugs (r 62): inside that the plate is the frame
    ops.push({ op: "hull", of: [{ op: "rod", a: [c * 62, s * 62, 0], b: [c * 62, s * 62, ARM_T], r: ARM_W * 0.75 }, { op: "rod", a: [x, y, 0], b: [x, y, ARM_T], r: PAD_R }] });
    // motor screws from below, a centre hole for the motor's circlip, a lead channel along the arm top
    for (const [dx, dy] of [[8, 8], [-8, 8], [8, -8], [-8, -8]]) ops.push({ op: "hole", a: [x + dx, y + dy, -1], b: [x + dx, y + dy, ARM_T + 1], d: 3.3 });
    ops.push({ op: "hole", a: [x, y, -1], b: [x, y, ARM_T + 1], d: 7 });
    ops.push({ op: "lighten", a: [c * 66, s * 66, ARM_T / 2], b: [c * (R - 26), s * (R - 26), ARM_T / 2], r: 3.2, n: 3, axis: [0, 0, 1] });
  }
  // 30.5 mm stack holes (M3 through), strap slots for the battery strap at the plate edges, camera cradle screws at the front
  // the stack stands on four posts on the plate (4 mm: room for the ESC's underside parts and the motor leads)
  for (const [x, y] of [[-15.25, -15.25], [15.25, -15.25], [-15.25, 15.25], [15.25, 15.25]]) ops.push({ op: "rod", a: [x, y, PLATE_T - 0.1], b: [x, y, PLATE_T + 4 - 0.15], r: 3.4 });
  for (const [x, y] of [[-15.25, -15.25], [15.25, -15.25], [-15.25, 15.25], [15.25, 15.25]]) ops.push({ op: "hole", a: [x, y, -1], b: [x, y, PLATE_T + 5], d: 3.3 });
  for (const y of [-36, 36]) ops.push({ op: "cutbox", min: [-11, y - 1.6, -1], max: [11, y + 1.6, PLATE_T + 1] });
  for (const y of [-6, 6]) ops.push({ op: "hole", a: [48, y, -1], b: [48, y, PLATE_T + 1], d: 3.3 });
  return ops;
}

/** Camera cradle: two cheeks holding the 19 mm camera by its side screws, tilted up 25 deg, on a foot screwed to the plate front. */
function cradleOps(): Op[] {
  return [
    { op: "box", min: [37, -14, PLATE_T], max: [52, 14, PLATE_T + 3], r: 2 },
    ...[-1, 1].map((s): Op => ({ op: "box", min: [37, s > 0 ? 10.2 : -12.2, PLATE_T], max: [54, s > 0 ? 12.2 : -10.2, PLATE_T + 26], r: 1 })),
    ...[-1, 1].map((s): Op => ({ op: "hole", a: [CAM_X, s * 13.2, CAM_Z], b: [CAM_X, s * 9.2, CAM_Z], d: 2.2 })),
    ...[-6, 6].map((y): Op => ({ op: "hole", a: [48, y, PLATE_T - 1], b: [48, y, PLATE_T + 4], d: 3.3 })),
  ];
}

export function designDrone(req: DroneRequest = {}): RobotSpecification {
  const A = new Assembly(req.name ?? "quadcopter", "drone_quad", req.prompt);
  A.design.request = { ...req } as Record<string, unknown>;
  const payload = Math.max(0, req.payloadKg ?? 0);
  const wantCam = (req.sensors ?? []).some((s) => /cam|vision|video|photo/.test(s));
  const other = (req.sensors ?? []).filter((s) => !/cam|vision|video|photo/.test(s));

  // ---------------- frame
  A.printedLink("base_link", { name: "base_link", ops: frameOps() }, { role: "base", material: "printed_dark" });
  A.spec.root = "base_link";

  // ---------------- motors and props (CCW front-right / rear-left, CW the other two: props in, yaw balanced)
  const rotors: { joint: string; motor: string; at: Vec3; spin: 1 | -1 }[] = [];
  const names = ["front_left", "rear_left", "rear_right", "front_right"];
  const zMotor = ARM_T + 18.5;   // motor base sits on the pad top
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, x = R * Math.cos(a), y = R * Math.sin(a), tag = names[k];
    const Tm = mul(translation([x, y, zMotor]), frame([0, 0, 0], [0, 0, 1], [Math.cos(a), Math.sin(a), 0]));
    A.mount("base_link", MOTOR, Tm, `${tag}_motor`, "drive motor (2207 1750 KV)");
    A.fastener("M3 x 8 socket head (motor to arm, from below)", 4);
    // the prop seats on the bell top (the motor output face) and turns about the shaft: a continuous joint driven by the motor
    const Tp = mul(Tm, translation([0, 0, 0.5]));
    A.mount("base_link", PROP, Tp, `${tag}_prop`, "propeller (2 CW + 2 CCW per set)");
    A.spec.joints.pop();
    const spin: 1 | -1 = k % 2 === 0 ? 1 : -1;
    A.continuous(`${tag}_rotor`, "base_link", `${tag}_prop`, Tp, MOTOR, [0, 0, spin]);
    A.fastener("M5 nyloc prop nut", 1);
    rotors.push({ joint: `${tag}_rotor`, motor: `${tag}_motor`, at: [x / 1000, y / 1000, (zMotor + 4) / 1000], spin });
  }

  // ---------------- stack under the canopy: ESC on standoffs, FC above it on 8 mm nylon spacers, receiver taped on top
  const H = new Harness(A);
  const S: Vec3 = [58, 58, 30], o: Vec3 = [-29, -29, PLATE_T], c = 29;
  const exits: ExitSpec[] = [
    // one grommet per arm for the motor leads, the XT60 lead out of the back, the antenna and the camera lead
    { id: "leads_fl", face: "x+", u: 48, v: 6, kind: "grommet", d: 6.5, noAnchor: true }, { id: "leads_fr", face: "x+", u: 10, v: 6, kind: "grommet", d: 6.5, noAnchor: true },
    { id: "leads_rl", face: "x-", u: 48, v: 6, kind: "grommet", d: 6.5, noAnchor: true }, { id: "leads_rr", face: "x-", u: 10, v: 6, kind: "grommet", d: 6.5, noAnchor: true },
    { id: "battery", face: "x-", u: c, v: 16, kind: "grommet", d: 8.5, noAnchor: true },
    { id: "antenna", face: "lid", u: c, v: 46, kind: "grommet", d: 4 },
    { id: "usb", face: "y-", u: c, v: 20, kind: "usb", w: 12, h: 7, noAnchor: true },
    ...(wantCam ? [{ id: "camera", face: "x+", u: c, v: 16, kind: "grommet", d: 5, noAnchor: true } as ExitSpec] : []),
  ];
  const escT = translation([c - 20.5, c - 20.5, 5]), fcT = translation([c - 20.5, c - 19.25, 5 + 5.8 + 8]);   // the ESC on the plate's posts with a 1 mm silicone grommet under each corner
  bay(A, { name: "canopy", parent: "base_link", T: translation(o), size: S, floor: 0, wall: 2, lidT: 2.8, corner: 6, material: "printed_accent", lidMaterial: "printed_accent",
    parts: [{ name: "esc", key: ESC, T: escT, use: "4-in-1 ESC (motor drive)", standoff: false }, { name: "controller", key: FC, T: fcT, use: "flight controller (runs Betaflight / INAV)", standoff: false },
      { name: "receiver", key: RX, T: translation([c - 9, c - 5.5, 5 + 5.8 + 8 + 4.8 + 0.6]), use: "radio receiver (taped on the FC)", kind: "plain" }],
    // the pack covers the lid: vents in the two long walls, where the propwash blows past
    exits, vents: [{ face: "y-", a0: 3, a1: 28, b0: 7, b1: 51 }, { face: "y+", a0: 3, a1: 28, b0: 7, b1: 51 }, { face: "x+", a0: 21, a1: 28, b0: 14, b1: 44 }], bolted: false,
    note: "the canopy is screwed to the frame by its four towers through the plate; the stack screws pass through the plate into the ESC standoffs" }, H);
  A.fastener("M3 x 25 socket head + 8 mm nylon spacers (flight-controller stack)", 4);

  // ---------------- battery strapped on the canopy lid, camera in its cradle
  const zLid = o[2] + S[2] + 0.2 + 2.8;
  A.mount("canopy_lid", PACK, translation([-37, 0, zLid + 1]), "battery", "4S 1500 mAh pack (strapped on top)");
  A.buy("strap_50mm_velcro", 1, "battery strap through the frame slots");
  exposed(A, "battery", "strapped on top of the canopy, as every FPV quad carries it: the pack is swapped each flight", [74, 35]);
  if (wantCam) {
    A.printedLink("camera_cradle", { name: "camera_cradle", ops: cradleOps() }, { material: "printed_accent" });
    A.fixed("camera_cradle_mount", "base_link", "camera_cradle", translation([0, 0, 0]));
    A.fastener("M3 x 10 + nut (camera cradle)", 2);
    // camera frame: lens along +z; tilted 25 deg up from the flight direction about its side-screw axis
    const tilt = 25 * Math.PI / 180, lens: Vec3 = [Math.cos(tilt), 0, Math.sin(tilt)];
    const Tc = frame([CAM_X + 7 * lens[0], 0, CAM_Z + 7 * lens[2]], lens, [0, 1, 0]);   // side screws (camera x, 7 mm behind the lens face) on the cradle's screw axis
    A.mount("camera_cradle", CAM, Tc, "fpv_camera", "FPV camera, tilted up 25 deg for forward flight");
    A.fastener("M2 x 4 (camera side screws)", 2);
    exposed(A, "fpv_camera", "looks forward from its cradle on the frame nose", [19, 19]);
    A.spec.sensors.push({ name: "fpv_camera", type: "camera", parent: "fpv_camera", origin: { xyz: [0, 0, 0.008], rpy: [0, 0, 0] }, params: { part: CAM, fov_deg: 165, output: "analog live video" } });
  }
  for (const s of other) A.check(`sensor:${s}`, false, `a ${s} was requested; this quadcopter carries only the FPV camera and the flight controller's IMU and barometer (a lidar or depth camera needs a larger drone)`);
  A.spec.sensors.push({ name: "flight_imu", type: "imu", parent: "controller", origin: { xyz: [0.02, 0.019, 0.003], rpy: [0, 0, 0] }, params: { part: "BMI270 on the F405 board" } });

  // ---------------- harness: the pack's XT60 is the switch; the FC is fed through the stack cable, the receiver and camera from its BECs
  // currents the wires carry: cruise at twice the hover current, bursts capped at 60 A (Betaflight's current limit, set to the XT60's rating)
  const estHoverA = motorAt(throttleFor(((totalMass(A.spec) + payload + 0.05) * 1000) / 4)).current_a, cruiseA = Math.min(2 * estHoverA, 15), burstA = BURST_LIMIT_A / 4;
  H.plugSwitch = "no switch: the XT60 plug is the switch, as on every FPV quad (plug in last, unplug first; props off on the bench)";
  H.mainPower("VBAT", { source: "battery", pos: "BAT+", neg: "BAT-", fuse: false, volts: 14.8, cont: 60, peakLimit: 150, simultaneous: 4, simNote: `four motors at the ${BURST_LIMIT_A} A current limit in a punch-out` });
  H.feed("VBAT", "esc", { v: "VBAT+", g: "GND", typ: 0.1, peak: 0.1 });
  for (let k = 0; k < 4; k++) {
    const m = rotors[k].motor, feed = H.rails.get("VBAT")!.feeds.find((f) => f.inst === "esc")!;
    // phase currents: the RMS of each of the three leads is about the DC current / 1.22 for a sinusoidal-ish drive
    for (const ph of ["A", "B", "C"]) { const n = `${m}_${ph}`.toUpperCase(); H.net(n, "signal"); H.wire(n, `esc.M${k + 1}${ph}`, `${m}.${ph}`, { typ: cruiseA / 1.22, peak: burstA / 1.22 }); }
    feed.typ += cruiseA; feed.peak += burstA;
  }
  H.bought("esc.fc.VBAT", "controller.esc.VBAT", "8-pin JST-SH stack cable (supplied with the ESC)", 0.4, 0.8);
  H.rail("5V_FC", { source: "controller", out: "5V", gnd: "GND_RX", volts: 5, cont: 2, peakLimit: 2 });
  H.feed("5V_FC", "receiver", { v: "5V", g: "GND" });
  H.signals("controller", "receiver", [["TX2", "RX"], ["RX2", "TX"]]);
  if (wantCam) {
    H.rail("VCAM", { source: "controller", out: "VCAM", gnd: "GND_CAM", volts: 9, cont: 2, peakLimit: 2 });
    H.feed("VCAM", "fpv_camera", { v: "VIN", g: "GND" });
    H.signals("fpv_camera", "controller", [["VIDEO", "VIDEO_IN"]]);
  } else H.spare("controller.cam");
  H.spare("controller.usb", "battery.balance");
  H.notes.push("Motor leads are cut to length and soldered straight to the ESC pads; the XT60 pigtail carries a 470 uF low-ESR capacitor across the pads.");
  finishWiring(H, { noClips: /prop|rotor/ });
  enclosureChecks(A);

  // ---------------- clearance: nothing intersects anything at rest (stack parts sit on their spacers by design)
  const carried = new Set(["esc", "controller", "receiver", "battery", "fpv_camera"]);
  const skip = new Set<string>();
  for (const j of A.spec.joints) if (j.type === "fixed" && carried.has(j.child)) skip.add(`${j.parent}|${j.child}`);
  const hits = withSolids(A.spec, (mdl) => interferences(mdl, {}, undefined, 2, skip));
  A.check("clearance:home", hits.length === 0, hits.length ? `intersecting: ${hits.map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no printed part or component intersects another");

  // ---------------- flight checks
  const mass = totalMass(A.spec), all = mass + payload, perMotorG = (all * 1000) / 4;
  const full = motorAtCurrent(BURST_LIMIT_A / 4), raw = motorAt(1), maxThrustG = 4 * full.thrust_g, twr = maxThrustG / (all * 1000);
  const hoverThr = throttleFor(perMotorG), hover = motorAt(hoverThr);
  A.check("flight:thrust_to_weight", twr >= 2, `${(maxThrustG / 1000).toFixed(2)} kg of static thrust (4 x ${full.thrust_g.toFixed(0)} g at the ${BURST_LIMIT_A} A current limit, ${(full.throttle * 100).toFixed(0)} % throttle; 5 x 4.3 x 3 props on 4S) lifts ${all.toFixed(3)} kg: thrust-to-weight ${twr.toFixed(2)} (2.0 is the least that flies with control margin; 4+ is a racer)`);
  A.check("flight:hover_throttle", hoverThr <= 0.6, Number.isFinite(hoverThr) ? `hovers at ${(hoverThr * 100).toFixed(0)} % throttle (${perMotorG.toFixed(0)} g per motor), leaving ${((1 - hoverThr) * 100).toFixed(0)} % for control` : "cannot hover: each motor would need more than its full-throttle thrust");
  const escA = Number(part(ESC).specs.current_a);
  A.check("power:esc_current", raw.current_a <= escA, `even without the current limit, full throttle is ${raw.current_a} A per motor vs ${escA} A per ESC channel`);
  const hoverA = 4 * hover.current_a + 0.6, fullA = 4 * raw.current_a;
  const packC = Number(part(PACK).specs.max_current_a), xt60 = 60;
  A.check("power:pack_current", fullA <= packC && hoverA <= xt60, `hover ${hoverA.toFixed(1)} A (XT60 rated ${xt60} A continuous); unlimited full throttle would draw ${fullA.toFixed(0)} A of the pack's ${packC} A (100C), and the flight controller's current limit holds bursts to ${BURST_LIMIT_A} A`);
  const usableAh = (Number(part(PACK).specs.capacity_mah) / 1000) * 0.8, flightMin = (usableAh / hoverA) * 60;
  A.check("power:flight_time", flightMin >= 3, `${flightMin.toFixed(1)} min of hover on ${(usableAh * 1000).toFixed(0)} mAh (80 % of the pack, landing at 3.5 V per cell)`);
  // arm root bending at full thrust: the thrust acts at the motor axis, the root is where the arm meets the plate
  const lever = (R - 30) / 1000, F = (raw.thrust_g / 1000) * G, M = F * lever, w = ARM_W * 1.5 / 1000, h = ARM_T / 1000;
  const sigma = (6 * M) / (w * h * h) / 1e6;
  A.check("structure:arm_bending", sigma <= PETG_ALLOW_MPA, `full thrust ${F.toFixed(1)} N at ${(lever * 1000).toFixed(0)} mm bends the ${fmt(w * 1000, 0)} x ${ARM_T} mm arm root to ${sigma.toFixed(1)} MPa vs ${PETG_ALLOW_MPA} MPa (PETG); crashes are not covered: printed arms are the part that breaks, print spares`);
  const propR = Number(part(PROP).specs.diameter_mm) / 2, gap = Math.SQRT2 * R - 2 * propR;
  A.check("flight:prop_clearance", gap >= 10, `${gap.toFixed(0)} mm between neighbouring prop tips (motor spacing ${(Math.SQRT2 * R).toFixed(0)} mm, ${2 * propR} mm props)`);
  const com = comWorld(A.spec), off = Math.hypot(com[0], com[1]) * 1000;
  A.check("flight:centre_of_mass", off <= 8, `centre of mass ${off.toFixed(1)} mm from the centre of thrust (the flight controller trims a few mm; more costs throttle on one side)`);
  if (payload > 0) A.design.assumptions.push(`The ${payload} kg payload hangs under the centre plate (strap or a printed mount); it is counted in every flight check.`);
  if (req.budget !== undefined) A.check("budget", recordCost(A) <= req.budget, `$${recordCost(A).toFixed(2)} of parts vs $${req.budget} budget`);

  A.design.tcp = { link: "base_link", xyz: [0, 0, 0] };
  (A.design as unknown as { rotors: typeof rotors }).rotors = rotors;
  A.design.performance = {
    mass_kg: +mass.toFixed(3), payload_kg: payload, takeoff_mass_kg: +all.toFixed(3), max_thrust_kg: +(maxThrustG / 1000).toFixed(2), thrust_to_weight: +twr.toFixed(2),
    hover_throttle: Number.isFinite(hoverThr) ? +hoverThr.toFixed(3) : "cannot hover", hover_thrust_per_motor_n: +(perMotorG / 1000 * G).toFixed(2), max_thrust_per_motor_n: +(full.thrust_g / 1000 * G).toFixed(2),
    hover_current_a: +hoverA.toFixed(1), burst_current_a: BURST_LIMIT_A, unlimited_full_throttle_a: +fullA.toFixed(0), flight_time_min: +flightMin.toFixed(1), wheelbase_mm: WHEELBASE, prop: part(PROP).name, motor: part(MOTOR).name,
  };
  A.design.assumptions.push(
    "Thrust and current come from a typical 2207 1750 KV static thrust table with 5 x 4.3 x 3 props on a full 4S pack (estimated; real motors vary by about 10 %). Thrust falls as the pack sags and in forward flight.",
    "The frame is printed flat in PETG (or better, CF-nylon). It is stiff enough for gentle flying; it does not survive crashes like a carbon frame. Balance the props.",
    "The flight controller runs Betaflight, INAV or ArduPilot: it does the stabilisation. Configure motor order, direction (props in), failsafe and the 60 A current limit before the first flight, without props.",
    "Fly where it is legal: in most countries a drone over 250 g must be registered and flown within sight, away from people.",
  );
  recordCost(A);
  return A.finish(`Quadcopter, 5 in props on 2207 motors: ${all.toFixed(2)} kg take-off, thrust-to-weight ${twr.toFixed(1)}, hover at ${Number.isFinite(hoverThr) ? (hoverThr * 100).toFixed(0) : ">100"} % throttle, about ${flightMin.toFixed(0)} min`);
}
