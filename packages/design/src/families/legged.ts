// Multi-legged robots built like proven open designs.
//  * Quadruped, servo class (SpotMicro / Petoi class): Feetech STS serial-bus servos, 3 DOF per leg
//    (hip abduction in the body, hip flexion on the shoulder bracket, knee at the knee), 3S LiPo.
//  * Quadruped, QDD class (Mini Cheetah / Solo class): CubeMars AK quasi-direct-drive actuators, 6S LiPo, CAN.
//  * Hexapod (PhantomX class): 18 bus servos, coxa / femur / tibia, round printed body, LiDAR turret.
// The zero pose of every joint is the standing pose (knees bent, feet on the ground plane z = 0
// when the base sits at its standing height). Actuators are sized from the ground reaction forces
// of the robot as built (tau = J^T F at each stance foot), iterating because actuator mass changes
// the load.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, type Vec3 } from "@ttr/parts";
import { frame, translation, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass, pointWorld, comWorld } from "../kin.ts";
import { choose, DYNAMIC_FACTOR, DUTY } from "../sizing.ts";
import {
  PLATE, WALL, G, add, sub, scale, norm, len, bodyMm, depth, cradleCorners, aabb, reframe, originOf, plate, horn, hornR,
  joint, printed, mountAt, footPad, stanceTorques, recordJoints, holdCurrent, walkPower, bodyRadius, pickBattery, COMPUTE_W, SENSOR_W,
  addSensor, limitsFromGeometry, sum, type Frame, type Foot, type PowerItem,
} from "./legkit.ts";

export type SensorKind = "camera" | "depth" | "lidar" | "imu";
export interface LeggedRequest {
  name?: string; prompt?: string; budget?: number; payloadKg?: number; sensors?: SensorKind[];
  armDof?: number; gripper?: boolean; heightM?: number;
}

// ---------------------------------------------------------------- shared body electronics
interface Electronics { battery: string; cells: number; nBatt: number; compute: string; bus: string; busQty: number; buck: string[]; }
interface Deck { lo: Vec3; hi: Vec3; } // top deck (world mm): x/y extent and z of its top face

/** Sensors + compute + regulators on a top deck; returns the deck ops (bosses, masts) to merge into the deck part. */
function deckElectronics(A: Assembly, deck: Frame, d: Deck, e: Electronics, sensors: SensorKind[], front: number, rearDeck: Frame = deck): Op[] {
  const ops: Op[] = [], zt = d.hi[2];
  // compute at the rear of the deck on 6 mm bosses
  const c = part(e.compute), bb = bodyMm(e.compute), cl = bb.max[0] - bb.min[0], cw = bb.max[1] - bb.min[1];
  const cx0 = d.lo[0] + 6, cy0 = -cw / 2 - bb.min[1];
  const Tc = translation([cx0 - bb.min[0], cy0, zt + 6]);
  mountAt(A, cx0 + cl > 0 ? deck : rearDeck, e.compute, Tc, "computer", "main computer");
  for (const h of c.holes.filter((h) => h.axis[2] < -0.5)) { const p = add([cx0 - bb.min[0], cy0, zt], [h.pos[0], h.pos[1], 0]); ops.push({ op: "box", min: [p[0] - 3, p[1] - 3, zt - 1], max: [p[0] + 3, p[1] + 3, zt + 6], r: 2.9 }); }
  A.fastener("M2.5 x 10 board screws", 4);
  let xFree = cx0 + cl + 8;
  // bus adapter and 5 V regulator side by side, IMU next to them (all on 4 mm bosses)
  const small = (key: string, x: number, y: number, name: string, use: string) => {
    const b = bodyMm(key); mountAt(A, deck, key, translation([x - b.min[0], y - b.min[1], zt + 4]), name, use);
    ops.push({ op: "box", min: [x + 2, y + 2, zt - 1], max: [x + b.max[0] - b.min[0] - 2, y + b.max[1] - b.min[1] - 2, zt + 4], r: 2 });
    return b.max[0] - b.min[0];
  };
  const wBus = small(e.bus, xFree, -(d.hi[1] - 4), "actuator_bus", e.bus === "usb_can_adapter" ? "USB-CAN bus to the actuators" : "USB to servo bus");
  const wBuck = small(e.buck[0], xFree, 6, "regulator_5v", "5 V regulator (computer, sensors)");
  xFree += Math.max(wBus, wBuck) + 6;
  const wImu = small("bno085_breakout", xFree, -11.35, "imu", "IMU (body attitude)");
  addSensor(A, "imu", "imu", "base_link", [(xFree + 12.8) / 1000, 0, (zt + 6) / 1000], [0, 0, 0], { model: "BNO085" });
  xFree += wImu + 6;
  // lidar: on a mast so its scan plane clears the computer and the legs
  if (sensors.includes("lidar")) {
    const key = "rplidar_c1", lb = bodyMm(key), mast = 30;
    const lx = Math.max(xFree - lb.min[0] + 2, (d.lo[0] + d.hi[0]) / 2);
    const T = translation([lx, 0, zt + mast]);
    mountAt(A, deck, key, T, "lidar", "360 deg LiDAR");
    ops.push({ op: "box", min: [lx + lb.min[0], lb.min[1], zt - 1], max: [lx + lb.max[0], lb.max[1], zt + mast], r: 6 });
    ops.push({ op: "cutbox", min: [lx - 14, -14, zt + 3], max: [lx + 14, 14, zt + mast - 3] });
    addSensor(A, "lidar", "lidar", "base_link", [lx / 1000, 0, (zt + mast + Number(part(key).specs.scan_plane_z_mm)) / 1000], [0, 0, 0], { range_m: 12, model: part(key).name });
    xFree = lx + lb.max[0] + 4;
  }
  // front camera (or depth camera) on a mast at the front edge, looking forward
  const camKey = sensors.includes("depth") ? "realsense_d435i" : "rpi_camera_module_3";
  if (camKey === "realsense_d435i") {
    const h = 34, T = frame([front - 2, 0, zt + h], [0, -1, 0], [0, -1, 0]); // lenses (-y of the part) face +x
    const Tc = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, front + 10.5, 0, zt + h, 1] as Mat4; // rotate +90 deg about z: -y -> +x
    void T;
    mountAt(A, deck, camKey, Tc, "depth_camera", "forward depth camera");
    ops.push({ op: "box", min: [front - 6, -10, zt - 1], max: [front - 2 + 0.5, 10, zt + h - 12.5], r: 2 });
    ops.push({ op: "box", min: [front - 6, -30, zt + h - 12.5 - 4], max: [front + 22, 30, zt + h - 12.5], r: 2 });
    addSensor(A, "depth", "depth_camera", "base_link", [(front + 23) / 1000, 0, (zt + h) / 1000], [0, 0, 0], { model: part(camKey).name, fov_deg: 87 });
  } else {
    const h = 30, xb = front + 3; // board plane, lens looking +x
    const Tc = frame([xb, 12.5, zt + h], [1, 0, 0], [0, -1, 0]);
    mountAt(A, deck, camKey, Tc, "camera", "forward camera");
    ops.push({ op: "box", min: [front - 4, -14, zt - 1], max: [front - 1, 14, zt + h + 1], r: 1 });
    for (const [hx, hy] of [[2, 2], [23, 2], [2, 14.5], [23, 14.5]]) { const yw = 12.5 - hx, zw = zt + h - hy; ops.push({ op: "box", min: [front - 2, yw - 2.2, zw - 2.2], max: [xb, yw + 2.2, zw + 2.2] }); }
    addSensor(A, "camera", "camera", "base_link", [(xb + 9.1) / 1000, 0, (zt + h - 14.4) / 1000], [0, 0, 0], { model: part(camKey).name, hfov_deg: 66 });
  }
  return ops;
}

// ================================================================= QUADRUPED
interface QuadCfg { cls: "servo" | "qdd"; keys: { abd: string; hip: string; knee: string }; L1: number; L2: number; footR: number; batt: string; nBatt: number; extraKg: number; }
const LEGS4 = [{ n: "fl", sx: 1, sy: 1 }, { n: "fr", sx: 1, sy: -1 }, { n: "rl", sx: -1, sy: 1 }, { n: "rr", sx: -1, sy: -1 }];

/** Standing leg angles: thigh back from vertical by a, shin forward by b, foot under the hip at depth h. */
function standingAngles(L1: number, L2: number, h: number): [number, number] {
  // L1 sin a = L2 sin b, L1 cos a + L2 cos b = h
  let lo = 0, hi = Math.PI / 2;
  for (let k = 0; k < 60; k++) { const a = (lo + hi) / 2, b = Math.asin(Math.min(1, (L1 * Math.sin(a)) / L2)); if (L1 * Math.cos(a) + L2 * Math.cos(b) > h) lo = a; else hi = a; }
  const a = (lo + hi) / 2; return [a, Math.asin(Math.min(1, (L1 * Math.sin(a)) / L2))];
}

function buildQuadruped(req: LeggedRequest, cfg: QuadCfg, sensors: SensorKind[]) {
  const name = req.name ?? (cfg.cls === "servo" ? "servo_quadruped" : "qdd_quadruped");
  const A = new Assembly(name, "quadruped", req.prompt);
  const { abd: KA, hip: KH, knee: KK } = cfg.keys;
  const bA = bodyMm(KA), dA = depth(KA), bH = bodyMm(KH), dH = depth(KH), dK = depth(KK);
  const qdd = cfg.cls === "qdd", BW = qdd ? 5 : WALL; // body wall
  const battB = bodyMm(cfg.batt);
  // ---- body layout ----
  const Ya = -bA.min[0] + 1.5;                                    // abduction axis: case reaches the mid-plane
  const Wo = Ya + bA.max[0] + WALL;                               // body half width (outer)
  const zHalf = Math.max(bA.max[1] + WALL, (battB.max[2] + 4) / 2 + BW); // tub half height
  const battLen = battB.max[0] - battB.min[0];
  const Xa = Math.max(battLen / 2 + 6 + dA + WALL, 95);            // abduction output face
  const Xb = Xa - 2;                                              // body end = cradle rim
  const Xh = Xa + PLATE + 1.5 + (-bH.min[0]) + WALL;             // hip axis
  const Yl = (qdd ? 40 : 20) + dH / 2 + PLATE;                    // leg plane (hip/knee actuator centres)
  // ---- leg stance geometry ----
  const h = 0.76 * (cfg.L1 + cfg.L2);
  const [a, b] = standingAngles(cfg.L1, cfg.L2, h);
  const H = h + cfg.footR;                                        // hip axis (= base origin) above the ground
  const base: Frame = { name: "base_link", W: translation([0, 0, 0]) };
  const zLo = -zHalf, zHi = zHalf;
  // ---- body tub ----
  const tub: Op[] = [
    { op: "box", min: [-Xb, -Wo, zLo - BW], max: [Xb, Wo, zLo], r: 6 },
    { op: "box", min: [-Xb, Wo - BW, zLo - BW], max: [Xb, Wo, zHi] },
    { op: "box", min: [-Xb, -Wo, zLo - BW], max: [Xb, -Wo + BW, zHi] },
    { op: "box", min: [Xb - BW, -Wo, zLo - BW], max: [Xb, Wo, zHi] },
    { op: "box", min: [-Xb, -Wo, zLo - BW], max: [-Xb + BW, Wo, zHi] },
  ];
  const abdW: Record<string, Mat4> = {};
  for (const L of LEGS4) {
    abdW[L.n] = frame([L.sx * Xa, L.sy * Ya, 0], [L.sx, 0, 0], [0, L.sy, 0]);
    tub.push({ op: "cradle", key: KA, T: abdW[L.n], wall: WALL });
  }
  // battery fence on the floor
  const bx0 = -(battB.max[0] + battB.min[0]) / 2, bw = (battB.max[1] - battB.min[1]) / 2;
  for (const s of [-1, 1]) tub.push({ op: "box", min: [bx0 + battB.min[0] + 12, s > 0 ? bw + 0.5 : -bw - 3.5, zLo - 0.5], max: [bx0 + battB.max[0] - 12, s > 0 ? bw + 3.5 : -bw - 0.5, zLo + 6] });
  for (const s of [-1, 1]) tub.push({ op: "hole", a: [s * Xb * 0.5, 0, zLo - BW - 1], b: [s * Xb * 0.5, 0, zLo + 1], d: 14 }, { op: "hole", a: [0, s * Wo + s, 0], b: [0, s * Wo - s * 8, 0], d: 10 });
  // split long bodies into two halves that bolt together (printer bed)
  const halves = 2 * Xb > 240;
  if (halves) {
    const front: Op[] = [...tub, { op: "cutbox", min: [-Xb - 50, -Wo - 50, -200], max: [0, Wo + 50, 200] }];
    const rear: Op[] = [...tub, { op: "cutbox", min: [0, -Wo - 50, -200], max: [Xb + 50, Wo + 50, 200] }];
    // bolting flanges at the split
    for (const s of [1, -1]) for (const ops of [front, rear]) ops.splice(ops.length - 1, 0, { op: "box", min: [-8, s > 0 ? Wo - BW - 10 : -Wo + BW, zLo - BW], max: [8, s > 0 ? Wo - BW : -Wo + BW + 10, zHi] });
    printed(A, base, front, { role: "base", material: "printed_dark" });
    printed(A, { name: "body_rear", W: base.W }, rear, { role: "housing", material: "printed_dark" });
    A.fixed("body_rear_mount", "base_link", "body_rear", translation([0, 0, 0]));
    A.fastener("M3 x 16 body split bolts + nuts", 8);
  } else printed(A, base, tub, { role: "base", material: "printed_dark" });
  // electronics inside the tub
  mountAt(A, base, cfg.batt, translation([bx0, 0, zLo + 0.5]), "battery", "main battery");
  if (cfg.nBatt > 1) A.buy(cfg.batt, cfg.nBatt - 1, "main battery (series)");
  const buckKey = "buck_5v_5a";
  const busKey = qdd ? "usb_can_adapter" : "waveshare_bus_servo_adapter";
  // ---- top deck (lid) with computer and sensors ----
  const deck: Frame = { name: "top_deck", W: translation([0, 0, 0]) };
  const compute = sensors.includes("depth") || sensors.includes("lidar") ? "jetson_orin_nano_super" : "rpi5";
  const deckOps: Op[] = [{ op: "box", min: [-Xb + 2, -Wo + 0.5, zHi], max: [Xb - 2, Wo - 0.5, zHi + 3], r: 6 }];
  for (const s of [-1, 1]) for (const t of [-1, 1]) deckOps.push({ op: "hole", a: [s * (Xb - 12), t * (Wo - 8), zHi - 1], b: [s * (Xb - 12), t * (Wo - 8), zHi + 4], d: 3.4 });
  const e: Electronics = { battery: cfg.batt, cells: Number(part(cfg.batt).specs.cells), nBatt: cfg.nBatt, compute, bus: busKey, busQty: 1, buck: [buckKey] };
  const deckLink = A.spec.links.length;
  const extra = deckElectronics(A, deck, { lo: [-Xb + 2, -Wo, zHi], hi: [Xb - 2, Wo, zHi + 3] }, e, sensors, Xb - 2, halves ? { name: "top_deck_rear", W: deck.W } : deck);
  const allDeck = [...deckOps, ...extra];
  if (halves) {
    for (const s of [1, -1]) allDeck.push({ op: "box", min: [-10, s > 0 ? 8 : -24, zHi - 8], max: [10, s > 0 ? 24 : -8, zHi] }); // splice tabs under the joint
    printed(A, deck, [...allDeck, { op: "cutbox", min: [-400, -200, -200], max: [0, 200, 200] }], { role: "housing", material: "printed" });
    printed(A, { name: "top_deck_rear", W: deck.W }, [...allDeck, { op: "cutbox", min: [0, -200, -200], max: [400, 200, 200] }], { role: "housing", material: "printed" });
    A.fixed("top_deck_rear_mount", "base_link", "top_deck_rear", translation([0, 0, 0]));
    A.fastener("M3 x 10 deck splice screws", 4);
  } else printed(A, deck, allDeck, { role: "housing", material: "printed" });
  // printed() appended the deck link(s) last; keep the tree order readable (deck before its parts)
  const dls = A.spec.links.splice(A.spec.links.length - (halves ? 2 : 1)); A.spec.links.splice(deckLink, 0, ...dls);
  A.fixed("top_deck_mount", "base_link", "top_deck", translation([0, 0, 0]));
  A.fastener("M3 x 10 deck screws", 4);
  // ---- legs ----
  const feet: Foot[] = [];
  for (const L of LEGS4) {
    const { sx, sy } = L;
    const Wabd = abdW[L.n];
    const hipO: Vec3 = [sx * Xh, sy * (Yl - dH / 2), 0];
    const Wh = frame(hipO, [0, -sy, 0], [sx, 0, 0]);
    // knees point away from the body (front knees forward, rear knees back): the thighs never swing into it
    const d1: Vec3 = [sx * Math.sin(a), 0, -Math.cos(a)], d2: Vec3 = [-sx * Math.sin(b), 0, -Math.cos(b)];
    const hipC: Vec3 = [sx * Xh, sy * Yl, 0];
    const kneeC = add(hipC, scale(d1, cfg.L1));
    const Wk = frame([kneeC[0], sy * (Yl + dK / 2), kneeC[2]], [0, sy, 0], d1);
    const footC: Vec3 = add([kneeC[0], sy * (Yl + dK / 2 + 3), kneeC[2]], scale(d2, cfg.L2));
    // abduction: shoulder bracket from the abduction horn, around the outboard side of the hip actuator
    const outward = sx * sy > 0 ? 1 : -1;  // + rotation about the abduction axis swings the foot outward
    const lim = (out: number, inn: number): [number, number] => (outward > 0 ? [-inn, out] : [-out, inn]);
    // inward abduction: both legs of a pair may adduct together; keep their knees apart
    const inward = Math.min(0.25, (0.9 * (Yl - dK / 2 - WALL)) / (Math.abs(kneeC[2]) + bodyRadius(KK)));
    const shoulder = joint(A, `${L.n}_hip_abduction`, base, KA, Wabd, `${L.n}_shoulder`, Wabd, lim(0.6, inward));
    const hc = aabb(cradleCorners(KH, Wh));
    const yOut = sy > 0 ? hc.hi[1] : hc.lo[1];               // outboard face of the hip cradle
    const zc = Math.max(Math.abs(hc.lo[2]), Math.abs(hc.hi[2]));
    const yInner = sy * (Ya - hornR(KA));
    const ys = [yInner, yOut + sy * PLATE].sort((p, q) => p - q), xs = [sx * Xa, sx * (Xa + PLATE)].sort((p, q) => p - q);
    const xe = [sx * (Xa), sx * (Xh + bH.max[0] + WALL)].sort((p, q) => p - q);
    const sOps: Op[] = [
      horn(Wabd, KA),
      { op: "box", min: [xs[0], ys[0], -zc], max: [xs[1], ys[1], zc], r: 0 },
      { op: "box", min: [xe[0], Math.min(yOut, yOut + sy * PLATE) - (sy > 0 ? 1 : 0), -zc], max: [xe[1], Math.max(yOut, yOut + sy * PLATE) + (sy < 0 ? 1 : 0), zc] },
      { op: "cradle", key: KH, T: Wh, wall: WALL },
    ];
    printed(A, shoulder, sOps, { role: "link", material: "printed_accent" });
    // hip flexion -> thigh: plate on the inboard horn face down to the knee cradle
    const thighW = reframe(Wh, d1);
    const thigh = joint(A, `${L.n}_hip_pitch`, shoulder, KH, Wh, `${L.n}_thigh`, thighW, [-1.4, 1.4]);
    const kc = cradleCorners(KK, Wk);
    const kIn: Vec3 = [kneeC[0], sy * (Yl - dH / 2), kneeC[2]];
    const tOps: Op[] = [horn(Wh, KH), plate(Wh, [hipO, kIn], hornR(KH)), plate(Wh, kc, 1), { op: "cradle", key: KK, T: Wk, wall: WALL }];
    printed(A, thigh, tOps, { role: "link", material: "printed" });
    // knee -> shin: plate on the outboard horn face to the foot
    const shinW = reframe(Wk, d2);
    const shin = joint(A, `${L.n}_knee`, thigh, KK, Wk, `${L.n}_shin`, shinW, [-1.3, 1.3]);
    const kO = originOf(Wk), fEnd = sub(footC, scale(d2, 6));
    const sh: Op[] = [horn(Wk, KK, PLATE + 2), plate(Wk, [kO], hornR(KK), 0, PLATE + 2), plate(Wk, [kO, lerp3(kO, fEnd, 0.5)], hornR(KK) * 0.75, 0, PLATE + 2), plate(Wk, [lerp3(kO, fEnd, 0.5), fEnd], cfg.footR * 0.65, 0, PLATE + 2)];
    printed(A, shin, sh, { role: "link", material: "printed_accent" });
    footPad(A, shin, `${L.n}_foot`, footC, cfg.footR);
    feet.push({ link: `${L.n}_foot`, leg: L.n });
  }
  A.spec.root = "base_link";
  return { A, feet, H, h, a, b, Xh, Yl, Xb, Wo, zHi, zLo, compute };
}
const lerp3 = (p: Vec3, q: Vec3, t: number): Vec3 => add(p, scale(sub(q, p), t));

function sensorsOf(req: LeggedRequest, dflt: SensorKind[]): SensorKind[] {
  const s = new Set<SensorKind>([...dflt, ...(req.sensors ?? [])]); s.add("imu"); return [...s];
}

/** Quadruped: servo dog by default, QDD (CubeMars) when the request implies a big or load-carrying robot. */
export function designQuadruped(req: LeggedRequest): RobotSpecification {
  const text = (req.prompt ?? "").toLowerCase();
  const big = (req.heightM ?? 0) >= 0.32 || (req.payloadKg ?? 0) >= 1.5 || /\b(big|large|heavy|cheetah|qdd|quasi.direct|spot.?size|payload|research.grade)\b/.test(text) || (req.budget ?? 0) >= 6000;
  const sensors = sensorsOf(req, ["camera"]);
  const payload = req.payloadKg ?? (big ? 2 : 0.3);
  const ladder = big ? ["cubemars_ak60_6", "cubemars_ak70_10", "cubemars_ak80_9", "cubemars_ak80_64"] : ["feetech_sts3215_c047", "feetech_sts3250"];
  const scaleL = big ? Math.max(0.7, Math.min(1.4, (req.heightM ?? 0.38) / 0.38)) : Math.max(0.8, Math.min(1.3, (req.heightM ?? 0.2) / 0.2));
  const cfg: QuadCfg = big
    ? { cls: "qdd", keys: { abd: ladder[0], hip: ladder[1], knee: ladder[1] }, L1: 170 * scaleL, L2: 210 * scaleL, footR: 22, batt: "lipo_6s_10000", nBatt: 1, extraKg: payload }
    : { cls: "servo", keys: { abd: ladder[0], hip: ladder[0], knee: ladder[0] }, L1: 105 * scaleL, L2: 115 * scaleL, footR: 13, batt: "lipo_3s_2200", nBatt: 1, extraKg: payload };
  let built = buildQuadruped(req, cfg, sensors), torques: Record<string, number> = {};
  const poses = gaitPoses(["fl", "fr", "rl", "rr"], { abd: 0.12, hip: 0.35, knee: 0.3 });
  const trot = [["fl_foot", "rr_foot"], ["fr_foot", "rl_foot"]];
  let power = 0, batt = { key: cfg.batt, n: 1, wh: 0, minutes: 0 };
  for (let iter = 0; iter < 8; iter++) {
    torques = stanceTorques(built.A, built.feet, trot, poses, cfg.extraKg);
    const group = (g: string) => Math.max(...Object.entries(torques).filter(([k]) => k.endsWith(g)).map(([, v]) => v));
    const next = { abd: choose(ladder, group("hip_abduction")).key, hip: choose(ladder, group("hip_pitch")).key, knee: choose(ladder, group("knee")).key };
    // battery from the average power of this build
    power = quadPower(built.A, torques, built.compute, sensors, cfg.cls).total;
    const cands: [string, number][] = cfg.cls === "servo" ? [["lipo_3s_2200", 1], ["lipo_3s_5000", 1]] : [["lipo_6s_10000", 1], ["lipo_6s_10000", 2]];
    batt = pickBattery(cands, power, 20);
    const same = next.abd === cfg.keys.abd && next.hip === cfg.keys.hip && next.knee === cfg.keys.knee && batt.key === cfg.batt && batt.n === cfg.nBatt;
    if (same) break;
    cfg.keys = next; cfg.batt = batt.key; cfg.nBatt = batt.n;
    built = buildQuadruped(req, cfg, sensors);
  }
  const { A } = built;
  const m = totalMass(A.spec);
  // ---- engineering record ----
  recordJoints(A, torques, (j) => j.endsWith("abduction") ? "trot: two diagonal feet carry the robot + payload, ±15 % traction, abduction ±0.12 rad" : `trot: two diagonal feet carry ${(m + cfg.extraKg).toFixed(2)} kg, gait envelope hip ±0.35 / knee ±0.3 rad, ±15 % traction`);
  const pw = quadPower(A, torques, built.compute, sensors, cfg.cls);
  A.design.performance.average_power_w = +pw.total.toFixed(1);
  A.check("power:battery_runtime", batt.minutes >= 20, `${cfg.nBatt > 1 ? `${cfg.nBatt} x (parallel) ` : ""}${part(cfg.batt).name}: ${batt.wh} Wh x 80 % usable at ${pw.total.toFixed(1)} W average (${pw.items.map((i) => `${i.what} ${i.watts.toFixed(1)} W`).join(", ")}) -> ${batt.minutes.toFixed(0)} min`);
  const peakA = sum(Object.entries(torques).map(([k, v]) => holdCurrent(keyOf(A, k), v * DYNAMIC_FACTOR)));
  A.check("power:battery_current", peakA <= Number(part(cfg.batt).specs.max_current_a), `worst-case gait current ~${peakA.toFixed(1)} A vs ${part(cfg.batt).specs.max_current_a} A pack rating`);
  A.check("power:regulator", (COMPUTE_W[built.compute] ?? 7) / 5 <= 5.5 * 0.9 || built.compute === "jetson_orin_nano_super", built.compute === "jetson_orin_nano_super" ? "Jetson takes the pack voltage directly (9-20 V input); the 5 V regulator feeds the sensors" : `${part(built.compute).name} draws ${((COMPUTE_W[built.compute] ?? 7) / 5).toFixed(1)} A of the 5.5 A regulator`);
  quadStability(A, built.feet, built.h);
  // joint limits from exact solid sweeps
  const actuated = A.spec.joints.filter((j) => j.type === "revolute").map((j) => j.name);
  limitsFromGeometry(A, actuated, gaitCombos(["fl", "fr", "rl", "rr"]));
  if (cfg.cls === "qdd") derateSpeed(A, 24 / 48, "6S pack (24 V)");
  const bom = A.bom();
  A.design.performance = {
    ...A.design.performance, mass_kg: +m.toFixed(3), standing_height_m: +((built.H + built.zHi + 3) / 1000).toFixed(3), hip_height_m: +(built.H / 1000).toFixed(3),
    payload_kg: cfg.extraKg, legs: 4, dof: 12, actuators: `${part(cfg.keys.abd).name} (abduction), ${part(cfg.keys.hip).name} (hip), ${part(cfg.keys.knee).name} (knee)`,
    runtime_min: +batt.minutes.toFixed(0), cost_usd: bom.cost_usd, stance_width_m: +(2 * Math.abs(pointWorld(A.spec, {}, "fl_foot")[1])).toFixed(3), wheelbase_m: +(2 * built.Xh / 1000).toFixed(3),
  };
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `bought parts $${bom.cost_usd.toFixed(0)} vs budget $${req.budget}`);
  A.design.assumptions.push(
    "Zero joint angles are the standing pose (knees bent); the base origin is at hip-axis height with the feet on the ground plane.",
    `Joint loads are J^T F at the stance feet for a trot (two diagonal feet carry the whole robot + payload) over a gait envelope, plus ±15 % traction forces, x ${DYNAMIC_FACTOR} dynamic factor; continuous duty checked at ${DUTY * 100} % of the worst pose.`,
    "Feet are moulded / TPU-printed rubber spheres (contact pads) bolted to the shin tip.",
    cfg.cls === "qdd" ? "Research-grade QDD quadruped: needs a torque-controlled locomotion controller (MPC / RL policy) running on the computer over CAN." : "Servo dog: position-controlled gaits (open-loop trot / creep) run on the computer through the serial servo bus.",
    "Battery is strapped into the printed fence on the body floor; never screw into a pack.",
  );
  return A.finish(`${cfg.cls === "qdd" ? "QDD" : "Servo"} quadruped, ${(m).toFixed(2)} kg, hip height ${(built.H / 1000).toFixed(2)} m, 12 DOF, ${batt.minutes.toFixed(0)} min runtime, $${bom.cost_usd.toFixed(0)} of parts`);
}

const keyOf = (A: Assembly, joint: string) => { const g = A.spec.links.find((l) => l.name === `${joint}_actuator`)!.geometry; return g.type === "mesh" ? String(g.params!.key) : ""; };

/** Gait envelope: each leg's joints displaced around the standing pose (one leg group at a time is enough: legs are independent). */
function gaitPoses(legs: string[], amp: { abd: number; hip: number; knee: number }): Record<string, number>[] {
  const out: Record<string, number>[] = [{}];
  for (const sa of [-1, 0, 1]) for (const sh of [-1, 0, 1]) for (const sk of [-1, 0, 1]) {
    const q: Record<string, number> = {};
    for (const l of legs) { q[`${l}_hip_abduction`] = sa * amp.abd; q[`${l}_hip_pitch`] = sh * amp.hip; q[`${l}_knee`] = sk * amp.knee; }
    out.push(q);
  }
  return out;
}
function gaitCombos(legs: string[]): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    const q: Record<string, number> = {};
    legs.forEach((l, i) => { q[`${l}_hip_pitch`] = (i % 2 ? s : -s) * 0.6; q[`${l}_knee`] = t * 0.6; q[`${l}_hip_abduction`] = (l.endsWith("l") ? 1 : -1) * t * 0.15; });
    out.push(q);
  }
  return out;
}

function quadPower(A: Assembly, torques: Record<string, number>, compute: string, sensors: SensorKind[], cls: string) {
  const items: PowerItem[] = [];
  // walking: on average a joint carries about half of its worst trot load
  const act = sum(Object.entries(torques).map(([k, v]) => { const key = keyOf(A, k); return walkPower(key, v * 0.5); }));
  items.push({ what: "actuators (walking)", watts: act });
  items.push({ what: part(compute).name, watts: COMPUTE_W[compute] ?? 7 });
  for (const s of A.spec.links) { const g = s.geometry; if (g.type === "mesh" && g.part === "component") { const k = String(g.params!.key); if (SENSOR_W[k]) items.push({ what: part(k).name, watts: SENSOR_W[k] }); } }
  void sensors;
  return { items, total: sum(items.map((i) => i.watts)) / 0.9 }; // 90 % regulator / wiring efficiency
}
function quadStability(A: Assembly, feet: Foot[], h: number) {
  const c = comWorld(A.spec), P = feet.map((f) => pointWorld(A.spec, {}, f.link));
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const mx = Math.min(c[0] - Math.min(...xs), Math.max(...xs) - c[0]), my = Math.min(c[1] - Math.min(...ys), Math.max(...ys) - c[1]);
  A.check("stability:com_inside_support", mx > 0 && my > 0, `centre of mass ${(c[0] * 1000).toFixed(0)}, ${(c[1] * 1000).toFixed(0)} mm; support margin ${(mx * 1000).toFixed(0)} mm fore/aft, ${(my * 1000).toFixed(0)} mm lateral; COM ${((c[2] + h / 1000) * 1000).toFixed(0)} mm above the foot centres`);
  A.design.performance.com_height_m = +(c[2] - Math.min(...P.map((p) => p[2]))).toFixed(3);
}
function derateSpeed(A: Assembly, f: number, why: string) {
  for (const j of A.spec.joints) if (j.limit && j.type === "revolute") j.limit.velocity = +(j.limit.velocity * f).toFixed(3);
  A.design.assumptions.push(`Actuator speed limits derated x${f} for the ${why}: CubeMars ratings are quoted at 48 V.`);
}

export { len, norm, G };
