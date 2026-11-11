// Hexapod (PhantomX / Hiwonder class): six 3-DOF legs on a round printed body, 18 serial-bus servos.
//   coxa  — vertical-axis servo in the body rim (case tangential), the leg yaws about it;
//   femur — horizontal servo stacked on the coxa horn (PhantomX layout), femur raised ~20 deg;
//   tibia — servo at the femur tip, tibia hanging almost vertical to a rubber foot.
// Zero joint angles are the standing pose. Servos are sized from tripod-gait ground reactions
// (three feet carry the robot), iterating because servo mass changes the load.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, type Vec3 } from "@ttr/parts";
import { frame, translation, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass, pointWorld } from "../kin.ts";
import { choose, DYNAMIC_FACTOR, GAIT_DUTY, LADDERS } from "../sizing.ts";
import {
  PLATE, WALL, add, scale, sub, bodyMm, depth, cradleCorners, aabb, reframe, originOf, plate, horn, hornR, joint, printed, mountAt,
  footPad, stanceTorques, recordJoints, holdCurrent, pickBattery, COMPUTE_W, addSensor, limitsFromGeometry, sum, type Frame, type Foot,
} from "./legkit.ts";
import { sensorsOf, keyOf, quadPower, stabilityCheck, type LeggedRequest } from "./legged.ts";
import { hood, hoodAround, enclosureChecks, exposed } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { busTree, coreTree, actuatorsUnder } from "../netlist.ts";

const LEGS6 = [
  { n: "lf", deg: 30 }, { n: "lm", deg: 90 }, { n: "lr", deg: 150 },
  { n: "rr", deg: -150 }, { n: "rm", deg: -90 }, { n: "rf", deg: -30 },
];
/** room the battery tray leaves at the pack's lead end: the XT60 (3 mm of rigid plug) and the first bend of 12 AWG (1.25 x 18 mm) */
const LEAD_ROOM = 26;
/** the top deck's pillars (deg): clear of the board hood that runs along x */
const PILLARS = [60, 180, 300];
const TRIPODS = [["lf_foot", "rm_foot", "lr_foot"], ["rf_foot", "lm_foot", "rr_foot"]];
interface HexCfg { keys: { coxa: string; femur: string; tibia: string }; Lf: number; Lt: number; footR: number; batt: string; extraKg: number; }

function buildHexapod(req: LeggedRequest, cfg: HexCfg, sensors: string[]) {
  const A = new Assembly(req.name ?? "hexapod", "hexapod", req.prompt);
  const { coxa: KC, femur: KF, tibia: KT } = cfg.keys;
  const bC = bodyMm(KC), dC = depth(KC), bF = bodyMm(KF), dF = depth(KF), dT = depth(KT);
  const Rc = 88;                                   // coxa axis radius
  const Rb = Rc + bC.max[1] + WALL;                // body plate radius (outer face of the coxa cradles)
  const zPlate = -dC - WALL;                       // top of the body plate (= cradle floor)
  const zf = PLATE + 2 + bF.max[1] + WALL;         // femur axis height above the coxa horn face (z = 0)
  const Rf = Rc + 20;                              // femur axis radius: femur servo sits over the coxa
  const lift = 0.35, splay = 0.26;                 // femur raised, tibia splayed outward (rad)
  const base: Frame = { name: "base_link", W: translation([0, 0, 0]) };
  // ---- body plate with the six coxa cradles ----
  const bodyOps: Op[] = [];
  const disc = (r: number, z0: number, z1: number): Op => ({ op: "hull", of: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => { const t = (k * Math.PI) / 6; return { op: "box" as const, min: [r * Math.cos(t) - 1, r * Math.sin(t) - 1, z0] as Vec3, max: [r * Math.cos(t) + 1, r * Math.sin(t) + 1, z1] as Vec3 }; }) });
  bodyOps.push(disc(Rb, zPlate - 4, zPlate));
  const coxaW: Record<string, Mat4> = {};
  for (const L of LEGS6) {
    const t = (L.deg * Math.PI) / 180, u: Vec3 = [Math.cos(t), Math.sin(t), 0], tg: Vec3 = [-Math.sin(t), Math.cos(t), 0];
    // the case lies along the rim, the way that puts its sockets (under the case, towards its far end) furthest from the
    // body's x axis: under the plate the battery tray runs along x, and the plugs then come down beside it, not on to it
    const far = (x: Vec3) => Math.abs(Rc * u[1] - 14 * x[1]);
    coxaW[L.n] = frame(scale(u, Rc), [0, 0, 1], far(tg) >= far(scale(tg, -1)) ? tg : scale(tg, -1));
    bodyOps.push({ op: "cradle", key: KC, T: coxaW[L.n], wall: WALL });
  }
  // battery under the plate (belly cradle: two side rails + strap slots), wiring holes
  // the pack's leads leave its +x end: the tray leaves them their plug and first bend there (LEAD_ROOM), so the pack sits
  // that much towards -x
  const battB = bodyMm(cfg.batt), bw = (battB.max[1] - battB.min[1]) / 2, bx0 = -(battB.max[0] + battB.min[0]) / 2 - (LEAD_ROOM - 3) / 2, bh = battB.max[2];
  const zBatt = zPlate - 4 - 0.5 - bh;
  for (const s of [-1, 1]) bodyOps.push({ op: "box", min: [bx0 + battB.min[0] + 14, s > 0 ? bw + 0.5 : -bw - 3.5, zBatt + 4], max: [bx0 + battB.max[0] - 14, s > 0 ? bw + 3.5 : -bw - 0.5, zPlate - 3.5] });
  for (const x of [-35, 35]) bodyOps.push({ op: "cutbox", min: [x - 10, -bw - 8, zPlate - 5], max: [x + 10, -bw - 4, zPlate + 1] }, { op: "cutbox", min: [x - 10, bw + 4, zPlate - 5], max: [x + 10, bw + 8, zPlate + 1] });
  for (const deg of PILLARS) { const t = (deg * Math.PI) / 180; bodyOps.push({ op: "hole", a: [52 * Math.cos(t), 52 * Math.sin(t), zPlate - 6], b: [52 * Math.cos(t), 52 * Math.sin(t), zPlate + 1], d: 3.4 }); }
  printed(A, base, bodyOps, { role: "base", material: "printed_dark" });
  mountAt(A, base, cfg.batt, translation([bx0, 0, zBatt]), "battery", "main battery (strapped under the body plate)");
  // small boards on the plate over the battery tray, on the -y side of the board hood and at its -x end, low: the hood
  // keeps the space over them for their jumpers to come up and turn, and the +y side and the space above for the harness
  // (fuse, star ground, splices) and the switch
  const board = (key: string, x: number, y: number, name: string, use: string) => { const b = bodyMm(key); mountAt(A, base, key, translation([x - b.min[0], y - b.min[1], zPlate + 3]), name, use); };
  board("waveshare_bus_servo_adapter", -40, -31, "actuator_bus", "USB to servo bus");
  board("buck_5v_5a", 5, -31, "regulator_5v", "5 V regulator (sensors)");
  board("bno085_breakout", -12, 5, "imu", "IMU (body attitude, near the middle)");
  addSensor(A, "imu", "imu", "base_link", [0.0008, 0.0164, (zPlate + 5) / 1000], [0, 0, 0], { model: "BNO085" });
  // ---- top deck on three pillars: computer, LiDAR turret, camera ----
  const zDeck = zf + bF.max[1] + WALL + 6;         // above the femur cradles
  const Rd = Rf - (-bF.min[0]) - WALL - 6;          // inside the femur cradles' inner ends
  const deck: Frame = { name: "top_deck", W: translation([0, 0, 0]) };
  const deckOps: Op[] = [disc(Rd, zDeck, zDeck + 3)];
  // three pillars of their own: the deck then prints flat, with the computer's bosses standing up from it
  PILLARS.forEach((deg, i) => {
    const t = (deg * Math.PI) / 180, p: Vec3 = [52 * Math.cos(t), 52 * Math.sin(t), 0], name = `deck_pillar_${i + 1}`;
    deckOps.push({ op: "hole", a: [p[0], p[1], zDeck - 1], b: [p[0], p[1], zDeck + 4], d: 3.4 });
    printed(A, { name, W: base.W }, [{ op: "box", min: [p[0] - 5, p[1] - 5, zPlate], max: [p[0] + 5, p[1] + 5, zDeck], r: 4.9 }, { op: "hole", a: [p[0], p[1], zPlate - 1], b: [p[0], p[1], zPlate + 12], d: 2.6 }, { op: "hole", a: [p[0], p[1], zDeck - 12], b: [p[0], p[1], zDeck + 1], d: 2.6 }], { role: "structure", material: "printed_dark" });
    A.fixed(`${name}_mount`, "base_link", name, translation([0, 0, 0]));
  });
  const compute = sensors.includes("depth") || sensors.includes("lidar") ? "jetson_orin_nano_super" : "rpi5";
  const cb = bodyMm(compute), cl = cb.max[0] - cb.min[0], cw = cb.max[1] - cb.min[1];
  const cx = -cl / 2 - cb.min[0] - 6, cy = -cw / 2 - cb.min[1], zc = zDeck + 3 + 5;
  mountAt(A, deck, compute, translation([cx, cy, zc]), "computer", "main computer");
  for (const h of part(compute).holes.filter((h) => h.axis[2] < -0.5)) { const p = add([cx, cy, 0], [h.pos[0], h.pos[1], 0]); deckOps.push({ op: "box", min: [p[0] - 3, p[1] - 3, zDeck + 2], max: [p[0] + 3, p[1] + 3, zc + h.pos[2]], r: 2.9 })   /* up to the board's mounting face */; }
  let top = zc + cb.max[2];
  // underside of the computer hood's roof: over its tallest part, room for the jumpers on its header to come up out of
  // its box and turn (connector 10 mm is in the box; the first bend, 1.25 x 6.4 mm, and the wire above it)
  const zRoof = top + 15;
  if (sensors.includes("lidar")) {
    // the computer's hood is the turret: the LiDAR stands on its roof, above everything
    const key = "rplidar_c1", lb = bodyMm(key), zT = zRoof + 2.8 - 3 + 0.05;
    mountAt(A, deck, key, translation([0, 0, zT + 3]), "lidar", "360 deg LiDAR turret");
    addSensor(A, "lidar", "lidar", "base_link", [0, 0, (zT + 3 + Number(part(key).specs.scan_plane_z_mm)) / 1000], [0, 0, 0], { model: part(key).name, range_m: 12 });
    top = zT + 3 + lb.max[2];
  }
  // forward camera on a tab at the deck front edge
  const camKey = sensors.includes("depth") ? "realsense_d435i" : "rpi_camera_module_3";
  const xf = Rd - 4;
  if (camKey === "rpi_camera_module_3") {
    const h = 28, xb = xf + 3, Tc = frame([xb, 12.5, zDeck + h], [1, 0, 0], [0, -1, 0]);   // its connector edge clears the deck top
    mountAt(A, deck, camKey, Tc, "camera", "forward camera");
    deckOps.push({ op: "box", min: [xf - 4, -14, zDeck], max: [xf - 1, 14, zDeck + h + 1], r: 1 });
    for (const [hx, hy] of [[2, 2], [23, 2], [2, 14.5], [23, 14.5]]) { const yw = 12.5 - hx, zw = zDeck + h - hy; deckOps.push({ op: "box", min: [xf - 2, yw - 2.2, zw - 2.2], max: [xb, yw + 2.2, zw + 2.2] }); }
    addSensor(A, "camera", "camera", "base_link", [(xb + 9.1) / 1000, 0, (zDeck + h - 14.4) / 1000], [0, 0, 0], { model: part(camKey).name, hfov_deg: 66 });
  } else {
    const h = 24, Tc = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, xf + 12.5, 0, zDeck + 3 + h, 1] as Mat4;
    mountAt(A, deck, camKey, Tc, "depth_camera", "forward depth camera");
    deckOps.push({ op: "box", min: [xf - 4, -10, zDeck], max: [xf, 10, zDeck + 3 + h - 12.5], r: 2 }, { op: "box", min: [xf - 4, -30, zDeck + 3 + h - 16.5], max: [xf + 24, 30, zDeck + 3 + h - 12.5], r: 2 });
    addSensor(A, "depth", "depth_camera", "base_link", [(xf + 25) / 1000, 0, (zDeck + 3 + h) / 1000], [0, 0, 0], { model: part(camKey).name, fov_deg: 87 });
  }
  printed(A, deck, deckOps, { role: "housing", material: "printed" });
  A.fixed("top_deck_mount", "base_link", "top_deck", translation([0, 0, 0]));
  A.fastener("M3 x 12 deck pillar screws", 3);
  // ---- legs ----
  const feet: Foot[] = [];
  for (const L of LEGS6) {
    const t = (L.deg * Math.PI) / 180, u: Vec3 = [Math.cos(t), Math.sin(t), 0], tg: Vec3 = [-Math.sin(t), Math.cos(t), 0];
    const Wc = coxaW[L.n];
    // femur servo: axis tangential (output +tg), case towards the body, stacked on the coxa horn
    const femC: Vec3 = [Rf * u[0], Rf * u[1], zf];
    const Wf = frame(add(femC, scale(tg, dF / 2)), tg, u);
    const df: Vec3 = add(scale(u, Math.cos(lift)), [0, 0, Math.sin(lift)]);
    const kneeC = add(femC, scale(df, cfg.Lf));
    const Wt = frame(sub(kneeC, scale(tg, dT / 2)), scale(tg, -1), df);
    const dt: Vec3 = add(scale(u, Math.sin(splay)), [0, 0, -Math.cos(splay)]);
    const footC = add(sub(kneeC, scale(tg, dT / 2 + 3)), scale(dt, cfg.Lt));
    // coxa link: pedestal from the coxa horn to the femur cradle
    const coxa = joint(A, `${L.n}_coxa`, base, KC, Wc, `${L.n}_coxa_link`, reframe(Wc, u), [-0.6, 0.6]);
    const fc = cradleCorners(KF, Wf), fcb = aabb(fc);
    const footprint = fc.map((p) => [p[0], p[1], 0] as Vec3);
    printed(A, coxa, [horn(Wc, KC), plate(Wc, [originOf(Wc)], hornR(KC), 0, fcb.lo[2] + 1), plate(Wc, footprint, 1, PLATE, fcb.lo[2] + 1), { op: "cradle", key: KF, T: Wf, wall: WALL }], { role: "link", material: "printed_accent" });
    // femur: side plate on the +tg horn face out to the tibia servo cradle
    const femur = joint(A, `${L.n}_femur`, coxa, KF, Wf, `${L.n}_femur_link`, reframe(Wf, df), [-1.2, 1.2]);
    const tc = cradleCorners(KT, Wt);
    const kOut = add(kneeC, scale(tg, dF / 2));
    printed(A, femur, [horn(Wf, KF), plate(Wf, [originOf(Wf), kOut], hornR(KF)), plate(Wf, tc, 1), { op: "cradle", key: KT, T: Wt, wall: WALL }], { role: "link", material: "printed" });
    // tibia: plate on the -tg horn face down to the foot
    const tib = joint(A, `${L.n}_tibia`, femur, KT, Wt, `${L.n}_tibia_link`, reframe(Wt, dt), [-1.2, 1.2]);
    const kO = originOf(Wt), fEnd = sub(footC, scale(dt, 6));
    const mid = add(kO, scale(sub(fEnd, kO), 0.45));
    printed(A, tib, [horn(Wt, KT, PLATE + 1), plate(Wt, [kO, mid], hornR(KT) * 0.8, 0, PLATE + 1), plate(Wt, [mid, fEnd], cfg.footR * 0.6, 0, PLATE + 1)], { role: "link", material: "printed_accent" });
    footPad(A, tib, `${L.n}_foot`, footC, cfg.footR);
    feet.push({ link: `${L.n}_foot`, leg: L.n });
  }
  A.spec.root = "base_link";
  const footZ = pointWorld(A.spec, {}, "lf_foot")[2] * 1000;
  return { A, feet, compute, H: -footZ + cfg.footR, Rb, top, zPlate, zBatt, zDeck, zRoof, Rd, bw, bx0, battB };
}

/** Hexapod with three servo joints per leg, LiDAR turret and camera. */
/** Three compartments: a hood over the computer on the top deck, a hood over the boards on the plate, a tray under the plate for the battery. */
function boxHex(A: Assembly, H: Harness, b: ReturnType<typeof buildHexapod>) {
  // the computer fills its hood: a 14 mm strip on its connector side takes the hole down to the plate beside the ports
  hoodAround(A, H, { name: "computer_hood", deck: "top_deck", parts: ["computer"], z0: b.zDeck + 3, z1: b.zRoof, usbFor: "computer", usbFace: "y-", extend: { "y-": 14 } });
  // The board hood stands over the battery tray between the pillars, as high as the swing of the front coxa links allows
  // (their femur servos reach in to x = 70 at the home height). The pack's leads come up out of the tray's end at the
  // plate's +x rim, turn and run back level into the hood by a grommet in its +x wall, straight into the inline fuse;
  // from the fuse's far end on to the switch in the -x wall. The boards sit low on the -y side and at the -x end. The coxa
  // servos plug in under the plate (their sockets are under the case): each side's leg cables leave by a grommet in the
  // hood's side wall over the boards and go down through a hole in the plate just outside it, clear of the tray. The computer's leads
  // (USB, power, the IMU's jumpers) come in by a grommet in the -y wall under its hood's hole.
  const lead = 12, zLead = -2;   // the pack's leads run across at y = 12 and level with the switch's IN tab (3 mm over its middle)
  const hb = hoodAround(A, H, { name: "board_hood", deck: "base_link", parts: ["actuator_bus", "regulator_5v", "imu"], z0: b.zPlate, z1: 31, rocker: true, rockerFace: "x-", rockerAt: lead, noDeckHole: true,
    limit: { x0: -43, x1: 52, y0: -34, y1: 34 }, extend: { "x+": 40, "y+": 3 },
    grommets: [{ id: "usb", face: "y-", u: -24, z: -15 }, { id: "legs_left", face: "y+", u: 0, z: -15 }, { id: "legs_right", face: "y-", u: 0, z: -15 }, { id: "power", face: "x+", u: lead, z: zLead }] });
  const fb = part("fuse_holder_atm_inline").bbox_mm!;
  H.spot.set("main_fuse", { by: "actuator_bus", at: [hb.max[0] - 4 - (fb.max[0] - fb.min[0]) / 2, lead, zLead], turned: true });
  // the star ground over the fuse, turned so the pack's negative lead runs straight on into it; the rail's splice past
  // the switch's OUT tab on the -y side, its levers facing back the way the lead comes and most branches go
  H.spot.set("star_ground", { by: "actuator_bus", at: [7, lead, zLead + 16], turned: true });
  // (its first lever level with the OUT tab and 2.3 bend radii towards -y: the lead turns once each way)
  H.spot.set("splice_vbat", { by: "actuator_bus", at: [41, lead - 42 + 7.4, zLead - 5] });
  for (const s of [1, -1]) { const y = s > 0 ? hb.max[1] + 12 : hb.min[1] - 12; A.amendProgram("base_link", [{ op: "hole", a: [0, y, b.zPlate - 6], b: [0, y, b.zPlate + 1], d: 12 }]); }
  for (const c of ["computer~lidar", "camera~computer", "actuator_bus~computer"]) H.exitOf.set(c, "computer_hood.usb");
  for (const n of ["lf", "lm", "lr", "rr", "rm", "rf"]) for (const c of [`actuator_bus_hub~${n}_coxa_actuator`, `VBAT~${n}_coxa_actuator`]) H.exitOf.set(c, `board_hood.legs_${n[0] === "l" ? "left" : "right"}`);
  for (const c of ["main_feed_a", "main_return"]) H.exitOf.set(c, "board_hood.power");
  const bb = b.battB, x0 = b.bx0 + bb.min[0] - 3, x1 = b.bx0 + bb.max[0] + LEAD_ROOM, y = b.bw + 4.4;
  // the tray hangs from the plate: bounds in the frame turned about x, so z runs downwards
  hood(A, H, { name: "battery_tray", deck: "base_link", x0, x1, y0: -y, y1: y, z0: -(b.zPlate - 4), z1: -(b.zBatt - 3), parts: ["battery"], flip: true, ventRows: 0, deckGrommets: [{ id: "up", x: x1 - 6, y: 0 }] });   // straight over the pack's leads   // where the leads have turned up (inside the board hood)
  H.scan();
}
function wireHex(A: Assembly, H: Harness, compute: string) {
  const named: { name: string; kind: "lidar" | "depth" | "camera" | "imu" }[] = [];
  for (const [n, k] of [["lidar", "lidar"], ["depth_camera", "depth"], ["camera", "camera"], ["imu", "imu"]] as const) if (H.instances.has(n)) named.push({ name: n, kind: k });
  for (const x of ["lidar", "depth_camera", "camera"]) if (H.instances.has(x)) exposed(A, x, x === "lidar" ? "on the roof of the computer hood, above everything" : "on the front edge of the top deck, looking forward", [20, 20]);
  coreTree(H, { batteries: ["battery"], regulators: ["regulator_5v"], compute, sensors: named, simultaneous: 6, simNote: "six joints at peak at once, the rest at half load" });
  const legs = [...new Set(A.spec.links.filter((l) => /_coxa_actuator$/.test(l.name)).map((l) => l.name.split("_")[0]))].map((n) => actuatorsUnder(H, new RegExp(`^${n}_.*_actuator$`)));
  busTree(H, { adapter: "actuator_bus", chains: legs, rail: "VBAT" }); H.spare("actuator_bus.dc_in");
  H.bought("actuator_bus.usb.VBUS", compute === "rpi5" ? "computer.usb_a.LINK" : "computer.usb_a_j6_j7.LINK", "USB", 0.05, 0.1, "BUS_USB");
  finishWiring(H);
  enclosureChecks(A);
}

export function designHexapod(req: LeggedRequest): RobotSpecification {
  const sensors = sensorsOf(req, ["camera", "lidar"]);
  const ladder = [...LADDERS.feetech.keys] as string[];
  const cfg: HexCfg = { keys: { coxa: ladder[0], femur: ladder[0], tibia: ladder[0] }, Lf: 85, Lt: 160, footR: 10, batt: "lipo_3s_2200", extraKg: req.payloadKg ?? 0.2 };
  let built = buildHexapod(req, cfg, sensors), torques: Record<string, number> = {};
  const poses: Record<string, number>[] = [{}];
  for (const c of [-0.3, 0, 0.3]) for (const f of [-0.3, 0, 0.3]) for (const t of [-0.25, 0, 0.25]) {
    const q: Record<string, number> = {};
    for (const L of LEGS6) { q[`${L.n}_coxa`] = c; q[`${L.n}_femur`] = f; q[`${L.n}_tibia`] = t; }
    poses.push(q);
  }
  let batt = { key: cfg.batt, n: 1, wh: 0, minutes: 0 };
  for (let iter = 0; iter < 8; iter++) {
    torques = stanceTorques(built.A, built.feet, TRIPODS, poses, cfg.extraKg);
    const group = (g: string) => Math.max(...Object.entries(torques).filter(([k]) => k.endsWith(g)).map(([, v]) => v));
    const next = { coxa: choose(ladder, group("_coxa"), 0, GAIT_DUTY).key, femur: choose(ladder, group("_femur"), 0, GAIT_DUTY).key, tibia: choose(ladder, group("_tibia"), 0, GAIT_DUTY).key };
    const power = quadPower(built.A, torques, built.compute, sensors as any, "servo").total;
    batt = pickBattery([["lipo_3s_2200", 1], ["lipo_3s_5000", 1]], power, 20);
    if (next.coxa === cfg.keys.coxa && next.femur === cfg.keys.femur && next.tibia === cfg.keys.tibia && batt.key === cfg.batt) break;
    cfg.keys = next; cfg.batt = batt.key;
    built = buildHexapod(req, cfg, sensors);
  }
  const { A } = built;
  const m = totalMass(A.spec);
  recordJoints(A, torques, () => `tripod gait: three feet carry ${(m + cfg.extraKg).toFixed(2)} kg, gait envelope coxa ±0.3 / femur ±0.3 / tibia ±0.25 rad, ±15 % traction`);
  const pw = quadPower(A, torques, built.compute, sensors as any, "servo");
  A.design.performance.average_power_w = +pw.total.toFixed(1);
  A.check("power:battery_runtime", batt.minutes >= 20, `${part(cfg.batt).name}: ${batt.wh} Wh x 80 % usable at ${pw.total.toFixed(1)} W average (${pw.items.map((i) => `${i.what} ${i.watts.toFixed(1)} W`).join(", ")}) -> ${batt.minutes.toFixed(0)} min`);
  const peakA = sum(Object.entries(torques).map(([k, v]) => holdCurrent(keyOf(A, k), v * DYNAMIC_FACTOR)));
  A.check("power:battery_current", peakA <= Number(part(cfg.batt).specs.max_current_a), `worst-case gait current ~${peakA.toFixed(1)} A vs ${part(cfg.batt).specs.max_current_a} A pack rating`);
  A.check("power:regulator", true, built.compute === "jetson_orin_nano_super" ? "Jetson Orin Nano takes the 3S pack directly (9-20 V input); the 5 V regulator feeds the LiDAR, camera and IMU (< 2 A of 5.5 A)" : `${part(built.compute).name} draws ${((COMPUTE_W[built.compute] ?? 7) / 5).toFixed(1)} A of the 5.5 A regulator`);
  stabilityCheck(A, [{ name: "tripod A", feet: TRIPODS[0] }, { name: "tripod B", feet: TRIPODS[1] }, { name: "standing (6 feet)", feet: built.feet.map((f) => f.link) }], 0.03);
  const actuated = A.spec.joints.filter((j) => j.type === "revolute").map((j) => j.name);
  const combos: Record<string, number>[] = [];
  for (const s of [-1, 1]) for (const f of [-1, 1]) {
    const q: Record<string, number> = {};
    LEGS6.forEach((L, i) => { q[`${L.n}_coxa`] = (i % 2 ? s : -s) * 0.45; q[`${L.n}_femur`] = f * 0.45; q[`${L.n}_tibia`] = -f * 0.45; });
    combos.push(q);
  }
  // neighbours swinging towards each other
  for (const s of [-1, 1]) { const q: Record<string, number> = {}; for (const L of LEGS6) q[`${L.n}_coxa`] = s * 0.45; combos.push(q); }
  const H = new Harness(A);
  boxHex(A, H, built);
  limitsFromGeometry(A, actuated, combos);
  wireHex(A, H, built.compute);
  const bom = A.bom();
  A.design.performance = {
    ...A.design.performance, mass_kg: +m.toFixed(3), standing_height_m: +((built.H + built.top) / 1000).toFixed(3), belly_clearance_m: +((built.H + built.zBatt) / 1000).toFixed(3),
    body_diameter_m: +(2 * built.Rb / 1000).toFixed(3), payload_kg: cfg.extraKg, legs: 6, dof: 18, actuators: `${part(cfg.keys.coxa).name} x18`,
    runtime_min: +batt.minutes.toFixed(0), cost_usd: bom.cost_usd, sensors: sensors.join(", "),
  };
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `bought parts $${bom.cost_usd.toFixed(0)} vs budget $${req.budget}`);
  A.design.assumptions.push(
    "Zero joint angles are the standing pose (femurs raised 20 deg, tibias near vertical); the base origin is on the coxa horn plane.",
    `Servo loads are J^T F at the stance feet of a tripod gait (three feet carry robot + payload), ±15 % traction, over a gait envelope, x ${DYNAMIC_FACTOR} dynamic factor; continuous duty checked at ${Math.round(GAIT_DUTY * 100)} % of the worst stance load (RMS over a gait cycle with half of it in stance).`,
    "Tripod gait keeps three feet down at all times: statically stable walking with open-loop position control.",
    "Feet are moulded / TPU-printed rubber spheres pushed over the tibia tips.",
    "The battery rides in a strapped cradle under the body plate (a 3S 5000 mAh pack is longer than the space between the coxa servos).",
    "The body plate and the top deck each print in one piece on a 250 x 210 mm bed; the deck stands on three printed pillars screwed into the plate.",
  );
  A.design.request = { ...req };
  return A.finish(`Hexapod, 18 x ${part(cfg.keys.femur).name}, ${m.toFixed(2)} kg, ${(2 * built.Rb).toFixed(0)} mm body, ${sensors.join(" + ")}, ${batt.minutes.toFixed(0)} min, $${bom.cost_usd.toFixed(0)} of parts`);
}
void [frame, reframe];
