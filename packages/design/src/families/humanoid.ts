// Bipeds built from real actuators and printed brackets.
//  * Small humanoid (ToddlerBot / Robotis-OP class): Feetech STS legs (hip yaw/roll/pitch, knee,
//    ankle pitch/roll), DYNAMIXEL XL330-class arms, head pan/tilt with a camera, grippers.
//  * Battle mech (~1 m research biped): CubeMars AK legs on a 12S pack, DYNAMIXEL / AK arms,
//    thin printed armour panels that carry no load (counted in mass).
// Zero joint angles are the standing pose (knees slightly bent, soles flat on the ground plane).
// Actuators are sized from single-leg support with the centre of pressure anywhere on the sole,
// squatting and leaning poses (tau = J^T F at the sole), and from the arms lifting a payload.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, type Vec3 } from "@ttr/parts";
import { frame, invert, mul, apply, translation, build, evaluate, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass, pointWorld, contactTorques, gravityTorques, comWorld, type PointLoad } from "../kin.ts";
import { choose, DYNAMIC_FACTOR, GAIT_DUTY } from "../sizing.ts";
import {
  PLATE, WALL, G, add, sub, scale, norm, bodyMm, depth, bodyRadius, reframe, originOf, plate, horn, hornR, printed, mountAt,
  recordJoints, holdCurrent, walkPower, pickBattery, COMPUTE_W, SENSOR_W, addSensor, limitsFromGeometry, sum, type Frame, type PowerItem,
} from "./legkit.ts";
import { placeChain, bracketOps, cradleSamples, type ChainJoint, type PlacedJoint } from "./chain.ts";
import { gripperOps } from "./arm.ts";
import { hood, hoodAround, registerBay, enclosureChecks, exposed, worldBox as partBox, freeSpot, type Face } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { limbBuses, canTree, coreTree, actuatorsUnder, sensorsOnComputer } from "../netlist.ts";
const sensorsOnComputerFor = (H: Harness, s: Parameters<typeof sensorsOnComputer>[2]) => sensorsOnComputer(H, "computer", s);
import { supportMargin, keyOf, type LeggedRequest, type SensorKind } from "./legged.ts";

const LEG = ["hip_yaw", "hip_roll", "hip_pitch", "knee", "ankle_pitch", "ankle_roll"] as const;
type LegJ = (typeof LEG)[number];
const ARM_JOINTS: Record<number, string[]> = {
  1: ["shoulder_pitch"], 2: ["shoulder_pitch", "elbow"], 3: ["shoulder_pitch", "shoulder_roll", "elbow"],
  4: ["shoulder_pitch", "shoulder_roll", "upper_arm_yaw", "elbow"], 5: ["shoulder_pitch", "shoulder_roll", "upper_arm_yaw", "elbow", "wrist_pitch"],
  6: ["shoulder_pitch", "shoulder_roll", "upper_arm_yaw", "elbow", "wrist_pitch", "wrist_roll"],
  7: ["shoulder_pitch", "shoulder_roll", "upper_arm_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll"],
};
interface BipedCfg {
  mech: boolean; leg: Record<LegJ, string>; arm: Record<string, string>; grip: string; neck: [string, string];
  armDof: number; gripper: boolean; L1: number; L2: number; Yh: number; bend: number; upperArm: number;
  batt: string; nBatt: number; extraKg: number; t: number; bodyWall: number; footLen: number; footW: number; nDcdc?: number;
}
const SIDES = [{ p: "l", s: 1 }, { p: "r", s: -1 }];
const Y: Vec3 = [0, 1, 0], X: Vec3 = [1, 0, 0], Z: Vec3 = [0, 0, 1], DOWN: Vec3 = [0, 0, -1];

/** World bounding box of a printed program (mm). */
const boxCache = new Map<string, { lo: Vec3; hi: Vec3 }>();
function worldBox(ops: Op[]): { lo: Vec3; hi: Vec3 } {
  // the sizing loop rebuilds identical parts: cache their boxes by recipe
  const key = JSON.stringify(ops), hit = boxCache.get(key);
  if (hit) return { lo: [...hit.lo] as Vec3, hi: [...hit.hi] as Vec3 };
  const b = build(() => { const bb = evaluate({ name: "probe", ops }).boundingBox(); return { lo: [...bb.min] as Vec3, hi: [...bb.max] as Vec3 }; });
  if (boxCache.size > 500) boxCache.delete(boxCache.keys().next().value as string);
  boxCache.set(key, b);
  return { lo: [...b.lo] as Vec3, hi: [...b.hi] as Vec3 };
}
/** A printed part that is split into bed-sized pieces (each fixed to `parent`) when it is too big to print. */
function printedToBed(A: Assembly, f: Frame, parent: string | null, ops: Op[], opts: { role?: string; material?: string }, maxDim = [245, 205, 215]) {
  const b = worldBox(ops), size = sub(b.hi, b.lo);
  const sorted = [...size].sort((p, q) => q - p);
  if (sorted.every((x, i) => x <= [...maxDim].sort((p, q) => q - p)[i])) {
    printed(A, f, ops, opts);
    if (parent) A.fixed(`${f.name}_mount`, parent, f.name, mul(invert(framesOf(A, parent)), f.W));
    return [f.name];
  }
  // cut across the longest axis at the middle, with a 12 mm bolting flange on each side of the cut
  const k = size.indexOf(Math.max(...size)), mid = (b.lo[k] + b.hi[k]) / 2;
  const names: string[] = [];
  for (const side of [0, 1]) {
    const lo: Vec3 = [-1e4, -1e4, -1e4], hi: Vec3 = [1e4, 1e4, 1e4];
    if (side === 0) hi[k] = mid; else lo[k] = mid;
    const piece: Frame = { name: `${f.name}${side ? "_b" : ""}`, W: f.W };
    const cut: Op[] = [{ op: "at", T: translation([0, 0, 0]), of: ops }, { op: "cutbox", min: side === 0 ? (() => { const m = [...lo] as Vec3; m[k] = mid; return m; })() : [-1e4, -1e4, -1e4], max: side === 0 ? [1e4, 1e4, 1e4] : (() => { const m = [...hi] as Vec3; m[k] = mid; return m; })() }];
    names.push(...printedToBed(A, piece, side === 0 ? parent : (parent ?? f.name), cut, opts, maxDim));
  }
  A.fastener("M3 x 16 split-joint bolts + nuts", 6);
  return names;
}
const FRAMES = new WeakMap<Assembly, Map<string, Mat4>>();
function framesOf(A: Assembly, name: string): Mat4 { return FRAMES.get(A)?.get(name) ?? translation([0, 0, 0]); }
function setFrame(A: Assembly, name: string, W: Mat4) { if (!FRAMES.has(A)) FRAMES.set(A, new Map()); FRAMES.get(A)!.set(name, W); }

function legChain(cfg: BipedCfg, s: number, p: string): ChainJoint[] {
  const a = cfg.bend, d1: Vec3 = [Math.sin(a), 0, -Math.cos(a)], d2: Vec3 = [-Math.sin(a), 0, -Math.cos(a)], k = cfg.leg;
  const sy: Vec3 = [0, s, 0], my: Vec3 = [0, -s, 0];
  return [
    { name: `${p}_hip_yaw`, key: k.hip_yaw, axis: DOWN, xdir: X, dirIn: DOWN, centred: false, limit: [-0.6, 0.6] },
    { name: `${p}_hip_roll`, key: k.hip_roll, axis: X, xdir: Z, dirIn: DOWN, limit: [-0.45, 0.45] },
    { name: `${p}_hip_pitch`, key: k.hip_pitch, axis: sy, xdir: scale(d1, -1), dirIn: DOWN, limit: [-1.6, 1.6] },
    { name: `${p}_knee`, key: k.knee, axis: my, xdir: scale(d2, -1), dirIn: d1, minLen: cfg.L1, limit: [-2.2, 2.2] },
    { name: `${p}_ankle_pitch`, key: k.ankle_pitch, axis: sy, xdir: Z, dirIn: d2, minLen: cfg.L2, limit: [-1.2, 1.2] },
    { name: `${p}_ankle_roll`, key: k.ankle_roll, axis: X, xdir: Z, dirIn: DOWN, limit: [-0.5, 0.5] },
  ];
}
function armChain(cfg: BipedCfg, s: number, p: string): ChainJoint[] {
  const sy: Vec3 = [0, s, 0];
  const spec: Record<string, Omit<ChainJoint, "name" | "key">> = {
    shoulder_pitch: { axis: sy, xdir: Z, dirIn: sy, centred: false, limit: [-3.0, 3.0] },
    // the upper arm hangs far enough out that the elbow actuator clears the torso while the upper arm rotates
    shoulder_roll: { axis: X, xdir: Z, dirIn: sy, minLen: Math.hypot(depth(cfg.arm.elbow) / 2 + WALL + 1, bodyMm(cfg.arm.elbow).max[1] + WALL) + depth(cfg.arm.shoulder_pitch) * 0 + 6, limit: [-1.6, 1.6] },
    upper_arm_yaw: { axis: DOWN, xdir: X, dirIn: DOWN, centred: false, limit: [-2.0, 2.0] },
    elbow: { axis: sy, xdir: Z, dirIn: DOWN, minLen: cfg.upperArm, limit: [-2.3, 2.3] },
    wrist_yaw: { axis: DOWN, xdir: X, dirIn: DOWN, centred: false, limit: [-2.6, 2.6] },
    wrist_pitch: { axis: sy, xdir: Z, dirIn: DOWN, limit: [-1.6, 1.6] },
    wrist_roll: { axis: DOWN, xdir: X, dirIn: DOWN, centred: false, limit: [-2.8, 2.8] },
  };
  return ARM_JOINTS[cfg.armDof].map((n) => ({ name: `${p}_${n}`, key: cfg.arm[n], ...spec[n] }));
}
const linkName = (joint: string) => `${joint}_link`;

/** Build the chain's joints and brackets; the last link's ops come from `end`. */
function buildChain(A: Assembly, parent: Frame, chain: PlacedJoint[], end: (last: PlacedJoint, parentF: Frame) => { ops: Op[]; dir?: Vec3 }, mat: string[], t: number): Frame[] {
  let pf = parent; const frames: Frame[] = [];
  chain.forEach((j, i) => {
    const next = chain[i + 1];
    const e = next ? null : end(j, pf);
    const dir = next ? sub(next.P, j.P) : e!.dir ?? sub(originOf(j.W), j.P);
    const along = sub(dir, scale(j.axis, dir[0] * j.axis[0] + dir[1] * j.axis[1] + dir[2] * j.axis[2]));
    const childW = Math.hypot(...along) > 1 ? reframe(j.W, norm(along)) : j.W;
    A.mount(pf.name, j.key, mul(invert(pf.W), j.W), `${j.name}_actuator`, `joint ${j.name}`);
    A.revolute(j.name, pf.name, linkName(j.name), mul(invert(pf.W), childW), j.key, j.limit[0], j.limit[1]);
    A.fastener(j.key.startsWith("cubemars_") ? "M3 x 8 housing screws" : "M2/M2.5 x 6 case screws", j.key.startsWith("cubemars_") ? 6 : 4);
    A.fastener("horn / hub screws", 4);
    const f: Frame = { name: linkName(j.name), W: childW };
    const ops = next ? bracketOps(j, next.key, next.W, t) : e!.ops;
    setFrame(A, f.name, childW);
    printedToBed(A, f, null, ops, { role: "link", material: mat[i % mat.length] });
    frames.push(f); pf = f;
  });
  return frames;
}

function buildBiped(req: LeggedRequest, cfg: BipedCfg, sensors: SensorKind[]) {
  const A = new Assembly(req.name ?? (cfg.mech ? "battle_mech" : "humanoid"), cfg.mech ? "mech" : "humanoid", req.prompt);
  const BW = cfg.bodyWall, t = cfg.t;
  // ---- legs (placed first: the pelvis holds the hip yaw actuators) ----
  // leg spacing: the knees (widest pitch actuators) keep 60 mm apart so both legs can adduct together
  const Yh = Math.max(cfg.Yh, Math.max(depth(cfg.leg.knee), depth(cfg.leg.hip_pitch)) / 2 + WALL + 30);
  const legs = SIDES.map(({ p, s }) => ({ p, s, chain: placeChain([0, s * Yh, 0], legChain({ ...cfg, Yh }, s, p)) }));
  const yawKey = cfg.leg.hip_yaw, dYaw = depth(yawKey), bYaw = bodyMm(yawKey);
  const zPel = dYaw + WALL - 0.5;                   // underside of the pelvis plate
  const base: Frame = { name: "base_link", W: translation([0, 0, 0]) };
  setFrame(A, "base_link", base.W);
  const pelHalfX = Math.max(-bYaw.min[0], bYaw.max[0]) + WALL + 4, pelHalfY = Yh + Math.max(bYaw.max[1], bYaw.max[0]) + WALL + 4;
  const pelvis: Op[] = [{ op: "box", min: [-pelHalfX, -pelHalfY, zPel], max: [pelHalfX * 0.6, pelHalfY, zPel + BW + 3], r: 8 }];
  for (const L of legs) pelvis.push({ op: "cradle", key: yawKey, T: L.chain[0].W, wall: WALL });
  printedToBed(A, base, null, pelvis, { role: "base", material: "printed_dark" });
  // ---- torso: battery on the floor, electronics shelf, shoulder actuators at the top corners ----
  const battB = bodyMm(cfg.batt), bl = battB.max[0] - battB.min[0], bwid = battB.max[1] - battB.min[1], bh = battB.max[2];
  const compute = sensors.includes("depth") || sensors.includes("lidar") || cfg.mech ? "jetson_orin_nano_super" : "rpi5";
  const cb = bodyMm(compute), shKey = cfg.arm.shoulder_pitch, shB = bodyMm(shKey), dSh = depth(shKey);
  const Wt = Math.max(bl / 2 + BW + 4, Yh + 25, (cb.max[0] - cb.min[0]) / 2 + BW + 4, dSh + 22);
  const Dt = Math.max((Math.min(cfg.nBatt, 2) * (bwid + 2) + 36 + 2 * BW + 4) / 2, (cb.max[0] - cb.min[0]) / 2 + BW + 3, -shB.min[1] + WALL + BW, 34);
  // the shelf stands over the packs, and high enough over the boards in front of them for their jumpers to plug on from
  // above (Dupont housing 10 mm, first bend 1.25 x 6.4 mm)
  const boardH = Math.max(...["waveshare_bus_servo_adapter", "dxl_u2d2", "buck_5v_5a", ...(cfg.mech ? ["usb_can_adapter", "dcdc_48v_12v_sd50c12"] : [])].map((k) => bodyMm(k).max[2] - bodyMm(k).min[2]));
  // the torso floor stands a plenum over the pelvis: the hip yaw actuators' sockets face up (their case is above the
  // horn), and their plugs (10 mm) and the cables' first bends need that room before the cables run off to the floor's
  // cable hole or out past the pelvis's edge down to the legs; the torso's walls carry it down to the pelvis
  const PLEN = 22, zSk = zPel + BW + 3;
  // (a mech's converters ride in its backpack, its torso keeps the packs' height)
  const zT0 = zSk + PLEN, zShelf = Math.max(zT0 + bh * (cfg.nBatt > 2 ? 2 : 1) + 6, cfg.mech ? 0 : zT0 + BW + 3 + boardH + 21 + 1);
  const zSh = zShelf + 3 + 6 + (cb.max[2] - cb.min[2]) + 6 + (-shB.min[0]) + WALL; // shoulder axis: shoulder case hangs down to just above the computer
  const zTop = zSh + shB.max[0] + WALL + 3;
  const torso: Frame = { name: "torso", W: translation([0, 0, 0]) };
  const tOps: Op[] = [
    { op: "box", min: [-Dt, -Wt, zT0], max: [Dt, Wt, zT0 + BW], r: 6 },                  // floor (bolts to the pelvis)
    { op: "box", min: [-Dt, -Wt, zSk], max: [-Dt + BW, Wt, zTop] },                       // back
    { op: "box", min: [Dt - BW, -Wt, zSk], max: [Dt, Wt, zTop] },                         // chest
    { op: "box", min: [-Dt, -Wt, zTop - BW], max: [Dt, Wt, zTop] },                       // shoulder bar / top
    { op: "box", min: [-Dt, -Wt, zShelf], max: [Dt, Wt, zShelf + 3] },                    // electronics shelf
    // cable passes through the shelf along both side walls, past the computer: the boards and hubs under it reach the
    // arm and neck exits above it
    ...[1, -1].map((s): Op => ({ op: "cutbox", min: [-24, s > 0 ? Wt - BW - 15 : -Wt + BW + 1, zShelf - 1], max: [24, s > 0 ? Wt - BW - 1 : -Wt + BW + 15, zShelf + 4] })),
    { op: "box", min: [-Dt, Wt - BW, zSk], max: [Dt, Wt, zTop] }, { op: "box", min: [-Dt, -Wt, zSk], max: [Dt, -Wt + BW, zTop] },
    { op: "cutbox", min: [-Dt + 10, -Wt - 1, zT0 + 10], max: [Dt - 10, Wt + 1, zShelf - 6] }, // side windows: battery access
    { op: "cutbox", min: [Dt - BW - 1, -Wt + 18, zShelf + 12], max: [Dt + 1, Wt - 18, zSh - 30] }, // chest window: ports
  ];
  // ---- arms ----
  // the arms hang outside the hips: lateral extent of the hip actuators + the widest arm actuator
  const hipOuter = Math.max(...legs[0].chain.slice(0, 3).flatMap((j) => cradleSamples(j.key, j.W).map((p) => p[1])));
  const armR = Math.max(...ARM_JOINTS[cfg.armDof].slice(1).map((n) => bodyRadius(cfg.arm[n]))) + WALL + 8;
  const armIn = Math.max(0, hipOuter + armR - Wt);
  const arms = SIDES.map(({ p, s }) => ({ p, s, chain: placeChain([0, s * Wt, zSh], armChain(cfg, s, p).map((j) => (j.name.endsWith("shoulder_roll") ? { ...j, minLen: Math.max(j.minLen ?? 0, armIn) } : j))) }));
  for (const L of arms) tOps.push({ op: "cradle", key: L.chain[0].key, T: L.chain[0].W, wall: WALL });
  // ---- neck ----
  const neck = placeChain([0, 0, zTop], [
    { name: "neck_pan", key: cfg.neck[0], axis: Z, xdir: X, dirIn: Z, centred: false, limit: [-1.6, 1.6] },
    { name: "neck_tilt", key: cfg.neck[1], axis: Y, xdir: scale(Z, -1), dirIn: Z, minLen: cfg.mech ? 90 : 58, limit: [-0.7, 0.7] }, // a neck: the head can nod without hitting the shoulders
  ]);
  tOps.push({ op: "cradle", key: cfg.neck[0], T: neck[0].W, wall: WALL });
  // ---- electronics: packs at the back of the torso floor, computer at the back of the shelf, boards packed in front ----
  const along = (x: number, z: number) => mul(translation([x, 0, z]), [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as Mat4); // pack x -> world y
  const bx = (battB.max[0] + battB.min[0]) / 2, cols = Math.min(cfg.nBatt, 2);
  for (let i = 0; i < cfg.nBatt; i++) {
    const xi = -Dt + BW + 1 + bwid / 2 + (i % cols) * (bwid + 2), zi = zT0 + BW + Math.floor(i / cols) * (bh + 2);
    mountAt(A, torso, cfg.batt, mul(along(xi, zi), translation([-bx, 0, 0])), i ? `battery_${i + 1}` : "battery", cfg.nBatt > 1 ? `main battery (${cfg.nBatt === 2 ? "2 in series" : "2S2P"})` : "main battery");
  }
  const battFront = -Dt + BW + 1 + cols * (bwid + 2);
  const cx0 = -Dt + BW + 2, cTx = cx0 - cb.min[0], cTy = -(cb.max[1] + cb.min[1]) / 2;
  mountAt(A, torso, compute, translation([cTx, cTy, zShelf + 3 + 6]), "computer", "main computer");
  for (const h of part(compute).holes.filter((h) => h.axis[2] < -0.5)) tOps.push({ op: "box", min: [cTx + h.pos[0] - 3, cTy + h.pos[1] - 3, zShelf + 2], max: [cTx + h.pos[0] + 3, cTy + h.pos[1] + 3, zShelf + 9 + h.pos[2]], r: 2.9 });   // up to the board's mounting face
  const regions = [
    { x0: battFront + 2, x1: Dt - BW - 1, y0: -Wt + BW + 1, y1: Wt - BW - 1, z: zT0 + BW, zMax: zShelf - 1 },
    { x0: cx0 + cb.max[0] - cb.min[0] + 3, x1: Dt - BW - 1, y0: -Wt + BW + 1, y1: Wt - BW - 1, z: zShelf + 3, zMax: zSh - (-shB.min[0]) - WALL - 2 },
    { x0: -Dt - 215, x1: -Dt - 1, y0: -Wt + 5, y1: Wt - 5, z: zShelf + 3, zMax: zShelf + 85 }, // backpack shelf (its hood stands over the boards' jumpers)
  ];
  const items: [string, string, string][] = [[cfg.mech ? "usb_can_adapter" : "waveshare_bus_servo_adapter", "leg_bus", cfg.mech ? "USB-CAN bus (left leg)" : "USB to leg servo bus"], ["dxl_u2d2", "arm_bus", "USB to the arm / neck DYNAMIXEL bus"]];
  if (cfg.mech) items.push(["usb_can_adapter", "leg_bus_2", "USB-CAN bus (right leg)"], ...Array.from({ length: cfg.nDcdc ?? 1 }, (_, i) => ["dcdc_48v_12v_sd50c12", i ? `dcdc_12v_${i + 1}` : "dcdc_12v", "12 V for the DYNAMIXEL arms and the computer"] as [string, string, string]), ["buck_5v_5a", "regulator_5v", "5 V regulator (sensors)"]);
  else items.push(["buck_5v_5a", "regulator_5v", "5 V regulator (computer)"], ["buck_5v_5a", "regulator_5v_arms", "5 V regulator (arm / neck XL330 bus)"]);
  const cursor = regions.map((r) => ({ x: r.x0, y: r.y0, rowD: 0 }));
  let usedBackpack = false;
  for (const [key, name, use] of items) {
    const b = bodyMm(key), L = b.max[0] - b.min[0], Wd = b.max[1] - b.min[1], H = b.max[2] - b.min[2];
    let placed = false;
    for (let r = 0; r < regions.length; r++) {
      const R = regions[r], c = cursor[r];
      // a board's jumpers plug on from above: over its top the Dupont housing (10 mm) and the first bend (1.25 x 6.4 mm)
      if (H + 3 + 18 > R.zMax - R.z) continue;
      // boards lie with their length along y, packed in rows front to back
      if (c.y + L > R.y1) { c.y = R.y0; c.x += c.rowD + 2; c.rowD = 0; }
      if (c.x + Wd > R.x1 || c.y + L > R.y1) continue;
      const T = mul(translation([c.x + Wd, c.y, R.z + 3]), [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as Mat4); // board x -> world y
      mountAt(A, torso, key, mul(T, translation([-b.min[0], -b.min[1], -b.min[2]])), name, use);
      tOps.push({ op: "box", min: [c.x + 3, c.y + 3, R.z - 0.5], max: [c.x + Wd - 3, c.y + L - 3, R.z + 3], r: 2 });
      c.y += L + 2; c.rowD = Math.max(c.rowD, Wd);
      if (r === 2) usedBackpack = true;
      placed = true;
      break;
    }
    if (!placed) A.check(`packaging:${name}`, false, `${part(key).name} does not fit in the torso or the backpack`);
  }
  if (usedBackpack) {
    const R = regions[2];
    tOps.push({ op: "box", min: [R.x0, R.y0, R.z - BW], max: [-Dt + 1, R.y1, R.z], r: 6 }, { op: "box", min: [R.x0, R.y0, R.z - 40], max: [R.x0 + BW, R.y1, R.z] },
      { op: "hull", of: [{ op: "box", min: [-Dt - 2, R.y0, R.z - 50], max: [-Dt + 1, R.y1, R.z - 47] }, { op: "box", min: [-Dt - 30, R.y0, R.z - BW], max: [-Dt + 1, R.y1, R.z] }] });
  }
  // IMU under the pelvis plate between the hip yaw actuators (closest point to the floating base)
  // (hung 30 mm below the plate: its header points up, and its jumpers need the Dupont housing and a bend under the plate)
  mountAt(A, base, "bno085_breakout", translation([-12.8, -11.35, zPel - 30]), "imu", "IMU (pelvis)");
  addSensor(A, "imu", "imu", "base_link", [0, 0, (zPel - 28) / 1000], [0, 0, 0], { model: "BNO085" });
  // lidar on a mast behind the head
  if (sensors.includes("lidar")) {
    const key = "rplidar_c1", lb = bodyMm(key), zl = zTop + 120;
    tOps.push({ op: "box", min: [-Dt, -8, zTop - 1], max: [-Dt + 10, 8, zl], r: 3 }, { op: "box", min: [-Dt - 40 + lb.min[0], lb.min[1], zl - 3], max: [-Dt + 10, lb.max[1], zl], r: 5 });
    mountAt(A, torso, key, translation([-Dt - 40, 0, zl]), "lidar", "360 deg LiDAR (mast behind the head)");
    addSensor(A, "lidar", "lidar", "base_link", [(-Dt - 40) / 1000, 0, (zl + Number(part(key).specs.scan_plane_z_mm)) / 1000], [0, 0, 0], { model: part(key).name, range_m: 12 });
  }
  printedToBed(A, torso, "base_link", tOps, { role: "housing", material: cfg.mech ? "printed_dark" : "printed" });
  A.fastener("M3 x 12 torso-to-pelvis bolts", 4);
  // ---- legs: brackets + feet ----
  const feet: { link: string; sole: { lo: Vec3; hi: Vec3 }; side: string }[] = [];
  for (const L of legs) {
    const ankleRoll = L.chain[L.chain.length - 1];
    buildChain(A, base, L.chain, (j) => {
      // foot: plate down the front of the ankle roll actuator to a flat sole clear of its swept body
      const ar = originOf(j.W), zs = j.P[2] - (bodyRadius(j.key) + WALL + 2) - t;
      const sole = { lo: [j.P[0] - cfg.footLen * 0.42, j.P[1] - cfg.footW / 2, zs] as Vec3, hi: [j.P[0] + cfg.footLen * 0.58, j.P[1] + cfg.footW / 2, zs + t] as Vec3 };
      feet.push({ link: linkName(j.name), sole, side: L.p });
      return { ops: [horn(j.W, j.key, t), plate(j.W, [ar, [ar[0], ar[1], zs + hornR(j.key)]], hornR(j.key), 0, t), { op: "box", min: sole.lo, max: sole.hi, r: 8 }], dir: DOWN };
    }, ["printed", "printed_accent"], t);
    void ankleRoll;
    // rubber sole pad (2 mm, glued under the printed sole): the flat contact patch of the foot
    const f = feet[feet.length - 1], pad = 2;
    const c: Vec3 = [(f.sole.lo[0] + f.sole.hi[0]) / 2, (f.sole.lo[1] + f.sole.hi[1]) / 2, f.sole.lo[2] - pad / 2];
    const size: Vec3 = [(f.sole.hi[0] - f.sole.lo[0] - 4) / 1000, (f.sole.hi[1] - f.sole.lo[1] - 4) / 1000, pad / 1000];
    const footF = framesOf(A, f.link), padName = `${L.p}_sole_pad`;
    A.spec.links.push({ name: padName, role: "foot", geometry: { type: "box", size }, mass: +(size[0] * size[1] * size[2] * 1200).toFixed(4), material: "rubber", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
    A.fixed(`${padName}_mount`, f.link, padName, mul(invert(footF), translation(c)));
    f.sole = { lo: [f.sole.lo[0], f.sole.lo[1], f.sole.lo[2] - pad], hi: f.sole.hi };
  }
  // ---- arms: brackets + grippers ----
  const hands: { link: string; tcp: Vec3; p: string }[] = [];
  for (const L of arms) {
    buildChain(A, torso, L.chain, (j, pf) => {
      const U = frame(originOf(j.W), j.axis, Math.abs(j.axis[0]) > 0.9 ? Z : X); // local +z along the last output
      if (!cfg.gripper) {
        const r = hornR(j.key) + 2, tcp = apply(U, [0, 0, t + 20]);
        hands.push({ link: linkName(j.name), tcp, p: L.p });
        return { ops: [horn(j.W, j.key, t), { op: "at", T: U, of: [{ op: "box", min: [-r, -r, t], max: [r, r, t + 20], r: 6 }] }] };
      }
      const gb = bodyMm(cfg.grip), zg = PLATE + WALL - gb.min[0] + 2;
      const Gl = frame([depth(cfg.grip) / 2, 0, zg], [1, 0, 0], [0, 0, 1]), Gw = mul(U, Gl);
      const g = gripperOps(Gl, cfg.grip, cfg.mech ? 110 : 60);
      const ops: Op[] = [...bracketOps(j, cfg.grip, Gw, t), { op: "at", T: U, of: g.fixed }];
      const hand = linkName(j.name);
      // the gripper joint hangs off this hand link (added after the link exists)
      queueMicrotaskLike(() => {
        A.mount(hand, cfg.grip, mul(invert(framesOf(A, hand)), Gw), `${L.p}_gripper_actuator`, "gripper");
        A.revolute(`${L.p}_gripper`, hand, `${L.p}_gripper_jaw`, mul(invert(framesOf(A, hand)), Gw), cfg.grip, -0.35, +g.closeAngle.toFixed(3));
        A.printedLink(`${L.p}_gripper_jaw`, { name: `${L.p}_gripper_jaw`, ops: [{ op: "at", T: invert(Gw), of: [{ op: "at", T: U, of: g.jaw }] }] }, { role: "gripper", material: "printed_accent" });
        A.spec.end_effectors.push({ name: `${L.p}_gripper`, type: "two_finger_gripper", attach_link: hand });
      });
      hands.push({ link: hand, tcp: apply(U, g.tcp), p: L.p });
      void pf;
      return { ops };
    }, cfg.mech ? ["printed_dark", "printed_accent"] : ["printed_accent", "printed"], t);
    flushQueue();
  }
  // ---- head ----
  const zTopHead = zTop;
  buildChain(A, torso, neck, (j) => {
    const R = bodyRadius(j.key) + WALL + 3, o = originOf(j.W), c = j.P;
    const depthCam = sensors.includes("depth"), hw = Math.max(depthCam ? 50 : 36, Wt * (cfg.mech ? 0.6 : 0.45)), front = c[0] + R + (cfg.mech ? 60 : 36);
    const zb = Math.max(c[2] - 26, zTopHead + 6);
    const box: Op = { op: "box", min: [c[0] + R, c[1] - hw, zb], max: [front, c[1] + hw, Math.max(c[2] + 40, zb + (cfg.mech ? 110 : 60))], r: 8 };
    const visor: Op = { op: "box", min: [c[0] - 20, c[1] - hw, c[2] + R], max: [front, c[1] + hw, c[2] + R + 3], r: 6 };
    const ops: Op[] = [horn(j.W, j.key, t), plate(j.W, [o, [front - 4, o[1], c[2] + 30], [front - 4, o[1], Math.max(c[2] - 20, zTopHead + 6 + hornR(j.key))], [c[0], o[1], c[2] + R + 2]], hornR(j.key), 0, t), box, visor];
    if (depthCam) {
      ops.push({ op: "cutbox", min: [front - 26, c[1] - 46, c[2] - 13], max: [front + 1, c[1] + 46, c[2] + 13] });
      headCam = { key: "realsense_d435i", T: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, front - 12.5, c[1], c[2], 1] as Mat4, lens: [front, c[1], c[2]] };
    } else {
      const oz = c[2] + 12, ox = front - 12;
      ops.push({ op: "cutbox", min: [ox - 1, c[1] - 13.5, oz - 25], max: [front + 1, c[1] + 13.5, oz + 1] });
      ops.push({ op: "box", min: [ox - 4, c[1] - 13.5, oz - 25], max: [ox - 1 + 0.5, c[1] + 13.5, oz + 1] });
      // the camera's ribbon leaves its top edge (latch 3 mm, first bend 1.25 x 5 mm) and runs back out of the head over
      // the camera: a channel to the back of the head, where it goes down past the neck to the torso
      ops.push({ op: "cutbox", min: [c[0] + R - 1, c[1] - 10, oz - 1], max: [ox + 8, c[1] + 10, oz + 16] });
      headCam = { key: "rpi_camera_module_3", T: frame([ox + 2.2, c[1] + 12.5, oz], X, [0, -1, 0]), lens: [ox + 2.2 + 9.1, c[1], oz - 14.4] };
    }
    return { ops, dir: X };
  }, cfg.mech ? ["printed_dark", "printed_accent"] : ["printed", "printed_accent"], t);
  const head: Frame = { name: linkName("neck_tilt"), W: framesOf(A, linkName("neck_tilt")) };
  mountAt(A, head, headCam!.key, headCam!.T, headCam!.key === "realsense_d435i" ? "head_depth_camera" : "head_camera", "head camera");
  addSensor(A, headCam!.key === "realsense_d435i" ? "depth" : "camera", headCam!.key === "realsense_d435i" ? "head_depth_camera" : "head_camera", head.name,
    apply(invert(head.W), headCam!.lens).map((x) => x / 1000) as Vec3, [0, 0, 0], { model: part(headCam!.key).name });
  // armour (mech): thin cosmetic panels on the torso, thighs and shins
  if (cfg.mech) armour(A, zT0);
  A.spec.root = "base_link";
  return { A, feet, hands, legs, arms, neck, compute, zTop, Wt, Dt, BW, zT0, zShelf, zSh, zPel, battFront, usedBackpack, shelfZ: regions[2].z, backY: regions[2].y1 };
}
let headCam: { key: string; T: Mat4; lens: Vec3 } | null = null;
let pending: (() => void)[] = [];
const queueMicrotaskLike = (f: () => void) => pending.push(f);
const flushQueue = () => { const p = pending; pending = []; p.forEach((f) => f()); };

/**
 * Armour: 2.5 mm printed shells standing 3 mm off a link and everything bolted to it, screwed on through
 * printed standoffs. No structural role (mass counted). Each panel is cut back around the swept body of the
 * actuator that drives its link, so it never touches the parent while the joint moves.
 */
function armour(A: Assembly, torsoFloor: number) {
  const panels: { on: string; face: "front" | "back" | "out" }[] = [
    { on: "torso", face: "front" },
    ...["l", "r"].flatMap((p) => [{ on: `${p}_hip_pitch_link`, face: "front" as const }, { on: `${p}_knee_link`, face: "front" as const }, { on: `${p}_shoulder_roll_link`, face: "out" as const }]),
  ];
  for (const pn of panels) {
    const link = A.spec.links.find((l) => l.name === pn.on);
    if (!link || link.geometry.type !== "mesh") continue;
    const Wl = framesOf(A, pn.on);
    // world box of the link's printed solid and of every bought part fixed to it
    const prog = JSON.parse(String(link.geometry.params!.program));
    const b = worldBox([{ op: "at", T: Wl, of: prog.ops }]);
    for (const piece of A.spec.links.filter((l) => l.name.startsWith(`${pn.on}_b`) && l.geometry.type === "mesh")) {
      const pb = worldBox([{ op: "at", T: Wl, of: JSON.parse(String((piece.geometry as any).params.program)).ops }]);
      for (let k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], pb.lo[k]); b.hi[k] = Math.max(b.hi[k], pb.hi[k]); }
    }
    for (const j of A.spec.joints) {
      if (j.type !== "fixed" || j.parent !== pn.on) continue;
      const c = A.spec.links.find((l) => l.name === j.child)!;
      if (c.geometry.type !== "mesh" || c.geometry.part !== "component") continue;
      const bb = part(String(c.geometry.params!.key)).bbox_mm!;
      const T = mul(Wl, poseMat(j.origin));
      for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) {
        const p = apply(T, [x, y, z]); for (let k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], p[k]); b.hi[k] = Math.max(b.hi[k], p[k]); }
      }
    }
    // (the torso's panel covers the torso from its floor up, not the cable plenum under it)
    if (pn.on === "torso") b.lo[2] = Math.max(b.lo[2], torsoFloor);
    const side = pn.on.startsWith("r_") ? -1 : 1, ins = 6;
    let box: { min: Vec3; max: Vec3 };
    if (pn.face === "front") box = { min: [b.hi[0] + 3, b.lo[1] + ins, b.lo[2] + ins], max: [b.hi[0] + 5.5, b.hi[1] - ins, b.hi[2] - ins] };
    else if (pn.face === "back") box = { min: [b.lo[0] - 5.5, b.lo[1] + ins, b.lo[2] + ins], max: [b.lo[0] - 3, b.hi[1] - ins, b.hi[2] - ins] };
    else box = side > 0 ? { min: [b.lo[0] + ins, b.hi[1] + 3, b.lo[2] + ins], max: [b.hi[0] - ins, b.hi[1] + 5.5, b.hi[2] - ins] } : { min: [b.lo[0] + ins, b.lo[1] - 5.5, b.lo[2] + ins], max: [b.hi[0] - ins, b.lo[1] - 3, b.hi[2] - ins] };
    const ops: Op[] = [{ op: "box", min: box.min, max: box.max, r: 4 }];
    // a raised inner plate with a seam across it: a flat sheet reads as a sign, stepped panels read as armour
    const k = pn.face === "out" ? 1 : 0, sgn = (pn.face === "out" ? side : pn.face === "front" ? 1 : -1), u = k === 0 ? 1 : 0, v = 2, m = 9;
    if (box.max[u] - box.min[u] > 3 * m && box.max[v] - box.min[v] > 3 * m) {
      const lo = [...box.min] as Vec3, hi = [...box.max] as Vec3;
      lo[u] += m; hi[u] -= m; lo[v] += m; hi[v] -= m;
      if (sgn > 0) { lo[k] = box.max[k] - 0.2; hi[k] = box.max[k] + 1.6; } else { hi[k] = box.min[k] + 0.2; lo[k] = box.min[k] - 1.6; }
      ops.push({ op: "box", min: lo, max: hi, r: 0 });
      const zc = (lo[v] + hi[v]) / 2, cutLo = [...lo] as Vec3, cutHi = [...hi] as Vec3;
      cutLo[v] = zc - 0.8; cutHi[v] = zc + 0.8; cutLo[u] -= 1; cutHi[u] += 1;
      if (sgn > 0) { cutLo[k] = box.max[k]; cutHi[k] += 1; } else { cutHi[k] = box.min[k]; cutLo[k] -= 1; }
      ops.push({ op: "cutbox", min: cutLo, max: cutHi });
    }
    // standoffs back to the link at the four corners
    const mid = (k: number) => (box.min[k] + box.max[k]) / 2;
    void mid;
    // clear the driving actuator's swept body
    const drive = A.spec.joints.find((j) => j.child === pn.on && j.type === "revolute");
    if (drive) {
      const act = A.spec.links.find((l) => l.name === `${drive.name}_actuator`)!, key = String((act.geometry as any).params.key);
      const W = mul(framesOf(A, drive.parent), poseMat(drive.origin)), o = originOf(W), z: Vec3 = [W[8], W[9], W[10]], R = bodyRadius(key) + WALL + 4;
      ops.push({ op: "hole", a: add(o, scale(z, -200)), b: add(o, scale(z, 200)), d: 2 * R });
    }
    const name = `${pn.on.replace(/_link$/, "")}_armour_${pn.face}`;
    A.printedLink(name, { name, ops: [{ op: "at", T: invert(Wl), of: ops }] }, { role: "armour", material: "printed_accent" });
    A.fixed(`${name}_mount`, pn.on, name, translation([0, 0, 0]));
    A.fastener("M3 x 10 armour screws + printed standoffs", 4);
  }
}
const poseMat = (p: { xyz: Vec3; rpy: Vec3 }): Mat4 => {
  const [r, pp, y] = p.rpy, cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(pp), sp = Math.sin(pp), cy = Math.cos(y), sy = Math.sin(y);
  return [cy * cp, sy * cp, -sp, 0, cy * sp * sr - sy * cr, sy * sp * sr + cy * cr, cp * sr, 0, cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr, 0, p.xyz[0] * 1000, p.xyz[1] * 1000, p.xyz[2] * 1000, 1];
};

// ---------------------------------------------------------------- loads
function pitchSign(A: Assembly, joint: string): number {
  const j = A.spec.joints.find((x) => x.name === joint)!;
  // the joint axis in the world at home (parent frames are rigid chains from the root)
  const T = framesOf(A, j.child); return Math.sign(T[9]) || 1; // world y component of the child z axis
}
function legPoses(A: Assembly): Record<string, number>[] {
  const out: Record<string, number>[] = [{}];
  for (const sq of [0, 0.2, 0.4]) for (const lean of [-0.1, 0, 0.1]) for (const step of [-0.2, 0, 0.2]) {
    const q: Record<string, number> = {};
    for (const p of ["l", "r"]) {
      // squat: thigh forward, shin back (feet stay flat); lean: hip roll vs ankle roll; step: hip pitch
      q[`${p}_hip_pitch`] = pitchSign(A, `${p}_hip_pitch`) * (-sq - step);
      q[`${p}_knee`] = pitchSign(A, `${p}_knee`) * (2 * sq);
      q[`${p}_ankle_pitch`] = pitchSign(A, `${p}_ankle_pitch`) * (-sq + step);
      q[`${p}_hip_roll`] = lean; q[`${p}_ankle_roll`] = -lean;
    }
    out.push(q);
  }
  return out;
}
function bipedTorques(A: Assembly, feet: { link: string; sole: { lo: Vec3; hi: Vec3 } }[], hands: { link: string; tcp: Vec3 }[], payload: number) {
  const spec = A.spec, m = totalMass(spec) + payload * 2, worst: Record<string, number> = {};
  const put = (k: string, v: number) => { worst[k] = Math.max(worst[k] ?? 0, Math.abs(v)); };
  const poses = legPoses(A);
  for (const q of poses) {
    for (const f of feet) {
      const W = framesOf(A, f.link), iW = invert(W), c = scale(add(f.sole.lo, f.sole.hi), 0.5), hx = (f.sole.hi[0] - f.sole.lo[0]) / 2, hy = (f.sole.hi[1] - f.sole.lo[1]) / 2;
      // centre of pressure anywhere on the central 60 % of the sole (the balance controller keeps the ZMP
      // off the edges), single-leg support carries everything
      for (const [ux, uy] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
        const at = apply(iW, [c[0] + ux * hx, c[1] + uy * hy, f.sole.lo[2]]).map((x) => x / 1000) as Vec3;
        const Fz = m * G;
        for (const F of [[0, 0, Fz], [0.1 * Fz, 0, Fz], [-0.1 * Fz, 0, Fz], [0, 0.1 * Fz, Fz], [0, -0.1 * Fz, Fz]] as Vec3[]) {
          for (const [k, v] of Object.entries(contactTorques(spec, q, f.link, at, F))) put(k, v);
        }
      }
    }
  }
  // arms: payload held at the hand, arm stretched forward / sideways / up; head nodding
  const loads: PointLoad[] = hands.map((h) => ({ link: h.link, at: apply(invert(framesOf(A, h.link)), h.tcp).map((x) => x / 1000) as Vec3, massKg: payload }));
  const armPoses: Record<string, number>[] = [{}];
  for (const p of ["l", "r"]) {
    const sp = pitchSign(A, `${p}_shoulder_pitch`);
    armPoses.push({ [`${p}_shoulder_pitch`]: sp * -Math.PI / 2 }, { [`${p}_shoulder_pitch`]: sp * -Math.PI / 2, [`${p}_upper_arm_yaw`]: Math.PI / 2 }, { [`${p}_shoulder_roll`]: (p === "l" ? 1 : -1) * Math.PI / 2 });
  }
  armPoses.push({ neck_tilt: 0.7 }, { neck_tilt: -0.7 });
  for (const q of armPoses) for (const [k, v] of Object.entries(gravityTorques(spec, q, loads))) if (!/hip|knee|ankle/.test(k)) put(k, v);
  return worst;
}

function bipedPower(A: Assembly, torques: Record<string, number>, compute: string) {
  const items: PowerItem[] = [];
  const legs = sum(Object.entries(torques).filter(([k]) => /hip|knee|ankle/.test(k)).map(([k, v]) => walkPower(keyOf(A, k), v * 0.5)));
  const arms = sum(Object.entries(torques).filter(([k]) => !/hip|knee|ankle/.test(k)).map(([k, v]) => walkPower(keyOf(A, k), v * 0.3)));
  items.push({ what: "leg actuators (walking)", watts: legs }, { what: "arm / neck actuators", watts: arms }, { what: part(compute).name, watts: COMPUTE_W[compute] ?? 7 });
  for (const s of A.spec.links) { const g = s.geometry; if (g.type === "mesh" && g.part === "component") { const k = String(g.params!.key); if (SENSOR_W[k]) items.push({ what: part(k).name, watts: SENSOR_W[k] }); } }
  return { items, total: sum(items.map((i) => i.watts)) / 0.9 };
}

// ---------------------------------------------------------------- designers
/** Screw-on panels over the torso's side and chest windows, so the torso is a closed compartment; a hood on the backpack shelf; a small hood round the pelvis IMU. */
function boxBiped(A: Assembly, H: Harness, b: ReturnType<typeof buildBiped>, mech: boolean) {
  const { Dt, Wt, BW, zT0, zShelf, zSh, zTop, zPel } = b, torsos = A.spec.links.filter((l) => /^torso(_b)*$/.test(l.name)).map((l) => l.name), amend = (ops: Op[]) => { for (const n of torsos) A.amendProgram(n, ops); };
  const mat = mech ? "printed_dark" : "printed_accent";
  const panel = (name: string, axis: "y" | "x", s: number, a0: number, a1: number, z0: number, z1: number, cut: Op[] = []) => {
    // a plate 7 mm bigger than its window all round, four self-tapping screws, a block of vent slots
    const pos = axis === "y" ? Wt : Dt, lo = (u: number, v: number, n: number): Vec3 => (axis === "y" ? [u, s * n, v] : [s * n, u, v]);
    const bx = (u0: number, u1: number, v0: number, v1: number, n0: number, n1: number): { min: Vec3; max: Vec3 } => { const p = lo(u0, v0, n0), q = lo(u1, v1, n1); return { min: [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])], max: [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])] }; };
    const ops: Op[] = [{ op: "box", ...bx(a0 - 7, a1 + 7, z0 - 7, z1 + 7, pos, pos + 2.4) }];
    const screws: [number, number][] = [[a0 - 3.5, z0 - 3.5], [a1 + 3.5, z0 - 3.5], [a0 - 3.5, z1 + 3.5], [a1 + 3.5, z1 + 3.5]];
    for (const [u, v] of screws) ops.push({ op: "hole", a: lo(u, v, pos - 1), b: lo(u, v, pos + 3.4), d: 3.4 });
    let area = 0;
    for (let v = z0 + 5; v < z1 - 6; v += 5.6) { ops.push({ op: "cutbox", ...bx(a0 + 8, a1 - 8, v, v + 3.2, pos - 1, pos + 3.4) }); area += (a1 - a0 - 16) * 3.2; }
    ops.push(...cut);
    A.printedLink(name, { name, ops }, { material: mat });
    A.fixed(`${name}_mount`, torsos[0], name, translation([0, 0, 0]));
    amend(screws.map(([u, v]): Op => ({ op: "hole", a: lo(u, v, pos - BW - 1), b: lo(u, v, pos + 0.5), d: 2.6 })));
    A.fastener(`M3 x 8 self-tapping (${name})`, 4);
    return area;
  };
  const wx0 = -Dt + 10, wx1 = Dt - 10, wz0 = zT0 + 10, wz1 = zShelf - 6, cy = Wt - 18, cz0 = zShelf + 12, cz1 = zSh - 30;
  // the main switch stands in the left panel where nothing is behind it; a mech's battery switch in the backpack hood
  const zs = (wz0 + wz1) / 2, parts = ["battery", ...["battery_2", "battery_3", "battery_4"].filter((n) => A.spec.links.some((l) => l.name === n)), "computer", "leg_bus", "arm_bus", ...["leg_bus_2", "dcdc_12v", "dcdc_12v_2", "dcdc_12v_3", "regulator_5v", "regulator_5v_arms"].filter((n) => A.spec.links.some((l) => l.name === n))];
  // first a spot in the left panel with nothing behind it, else in the chest panel
  const clear = (lo: Vec3, hi: Vec3) => !A.spec.links.some((l) => l.geometry.type === "mesh" && l.geometry.part === "component" && (() => { const w = partBox(A, l.name); return [0, 1, 2].every((k) => w.hi[k] > lo[k] && w.lo[k] < hi[k]); })());
  let xs: number | null = null, ys: number | null = null;
  const hx = mech ? 30 : 17, hd = mech ? 60 : 30;
  for (let x = wx1 - hx; x > wx0 + hx && xs === null; x -= 4) if (clear([x - hx, Wt - hd, zs - hx + 3], [x + hx, Wt + 1, zs + hx - 3])) xs = x;
  const zc = (cz0 + cz1) / 2;
  if (!mech && xs === null && cz1 - cz0 > 24) for (let y = 0; Math.abs(y) < cy - 16 && ys === null; y = y <= 0 ? 4 - y : -y) if (clear([Dt - 30, y - 17, zc - 14], [Dt + 1, y + 17, zc + 14])) ys = y;
  const swKey = mech ? "switch_battery_6006" : "switch_kcd4";
  const cutSide: Op[] = xs === null ? [] : mech ? [{ op: "hole", a: [xs, Wt - 1, zs], b: [xs, Wt + 4, zs], d: 52.4 }] : [{ op: "cutbox", min: [xs - 15.2, Wt - 1, zs - 11.2], max: [xs + 15.2, Wt + 4, zs + 11.2] }];
  const cutChest: Op[] = ys !== null ? [{ op: "cutbox", min: [Dt - 1, ys - 15.2, zc - 11.2], max: [Dt + 4, ys + 15.2, zc + 11.2] }] : [];
  let vent = panel("side_panel_left", "y", 1, wx0, wx1, wz0, wz1, cutSide) + panel("side_panel_right", "y", -1, wx0, wx1, wz0, wz1);
  if (cz1 > cz0 + 10) vent += panel("chest_panel", "x", 1, -cy, cy, cz0, cz1, cutChest);
  if (xs !== null) A.mount("side_panel_left", swKey, frame([xs, Wt + 2.4, zs], [0, 1, 0], [0, 0, 1]), "main_switch", "main power switch");
  else if (ys !== null) A.mount("chest_panel", swKey, frame([Dt + 2.4, ys, zc], [1, 0, 0], [0, 0, 1]), "main_switch", "main power switch");
  // neither panel has room: a small case on the back of the torso holds the switch, in the battery bay's height
  const zb = (zT0 + zShelf) / 2, backCase = !mech && xs === null && ys === null;
  if (backCase) {
    const x = -Dt - 31;
    A.printedLink("switch_case", { name: "switch_case", ops: [{ op: "solid", of: [{ op: "box", min: [x, -20, zb - 16], max: [-Dt + 0.2, 20, zb + 16], r: 3 }, { op: "subtract", of: [{ op: "box", min: [x + 2.4, -17.6, zb - 13.6], max: [-Dt + 1, 17.6, zb + 13.6], r: 1.5 }] }] },
      { op: "cutbox", min: [x - 1, -15.2, zb - 11.2], max: [x + 3.4, 15.2, zb + 11.2] }] }, { material: mat });
    A.fixed("switch_case_mount", torsos[0], "switch_case", translation([0, 0, 0]));
    A.mount("switch_case", swKey, frame([x, 0, zb], [-1, 0, 0], [0, 0, 1]), "main_switch", "main power switch");
    amend([{ op: "hole", a: [-Dt - 1, 0, zb], b: [-Dt + BW + 1, 0, zb], d: 9.5 }]);
    A.fastener("M3 x 8 self-tapping (switch case to torso)", 2);
  }
  // USB of the computer through the back; cable exits: legs down through the floor, arms out at the sides, neck up
  const cb = partBox(A, "computer"), usbY = (cb.lo[1] + cb.hi[1]) / 2, usbZ = cb.lo[2] + 12;
  amend([{ op: "cutbox", min: [-Dt - 1, usbY - 22, usbZ - 8], max: [-Dt + BW + 1, usbY + 22, usbZ + 8] }]);
  // the computer's heat leaves through slots in the back wall above it
  const backSlots: Op[] = [], hw = Wt - 34;
  for (let z = usbZ + 16; z < zSh - 14 && hw > 10; z += 5.4) { backSlots.push({ op: "cutbox", min: [-Dt - 1, -hw, z], max: [-Dt + BW + 1, hw, z + 3.2] }); vent += 2 * hw * 3.2; }
  amend(backSlots);
  const floor = freeSpot(A, { x0: -Dt + BW + 2, x1: Dt - BW - 2, y0: -Wt + BW + 4, y1: Wt - BW - 4 }, [zT0, zT0 + 40], [14, 14]) ?? [Dt - 16, 0];
  const topX = -Dt + BW + 9, sideZ = zShelf + 9, sideX = Dt - BW - 8;
  amend([{ op: "hole", a: [floor[0], floor[1], zT0 - 1], b: [floor[0], floor[1], zT0 + BW + 1], d: 12 }, { op: "hole", a: [topX, 0, zTop - BW - 1], b: [topX, 0, zTop + 1], d: 9.5 },
    ...[1, -1].map((s): Op => ({ op: "hole", a: [sideX, s * (Wt - BW - 1), sideZ], b: [sideX, s * (Wt + 1), sideZ], d: 9.5 }))]);
  for (const n of A.spec.links.filter((l) => /^base_link(_b)*$/.test(l.name)).map((l) => l.name)) A.amendProgram(n, [{ op: "hole", a: [floor[0], floor[1], zPel - 1], b: [floor[0], floor[1], zT0 + 1], d: 12 }]);
  // the IMU's leads come up past the front of the pelvis into the torso by a floor hole in front of the boards
  const imuHole: Vec3 = [Dt - BW - 6, 0, zT0];
  amend([{ op: "hole", a: [imuHole[0], imuHole[1], zT0 - 1], b: [imuHole[0], imuHole[1], zT0 + BW + 1], d: 9.5 }]);
  registerBay(A, { name: "torso_bay", tub: torsos[0], lid: "side_panel_left", solids: [...torsos, "side_panel_left", "side_panel_right"], parent: torsos[0], T: translation([0, 0, 0]), min: [-Dt + BW, -Wt + BW, zT0 + BW - 3], max: [Dt - BW, Wt - BW, zTop - BW], parts: parts.filter((n) => { const w = partBox(A, n); return w.lo[0] > -Dt; }), screws: 8, vent_area_mm2: Math.round(vent), note: "the torso itself, closed by its panels",
    exits: [{ id: "torso_bay.legs", kind: "grommet", face: "floor" as Face, at: [floor[0], floor[1], zT0], normal: [0, 0, -1], hole_mm: 12 }, { id: "torso_bay.imu", kind: "grommet", face: "floor" as Face, at: imuHole, normal: [0, 0, -1], hole_mm: 9.5 }, { id: "torso_bay.neck", kind: "grommet", face: "lid" as Face, at: [topX, 0, zTop], normal: [0, 0, 1], hole_mm: 9.5 },
      ...[1, -1].map((s) => ({ id: `torso_bay.arm_${s > 0 ? "l" : "r"}`, kind: "grommet", face: (s > 0 ? "y+" : "y-") as Face, at: [sideX, s * Wt, sideZ] as Vec3, normal: [0, s, 0] as Vec3, hole_mm: 9.5 })), { id: "torso_bay.usb", kind: "usb", face: "x-" as Face, at: [-Dt, usbY, usbZ], normal: [-1, 0, 0], hole_mm: 16 }, ...(xs !== null ? [{ id: "torso_bay.switch", kind: "switch", face: "y+" as Face, at: [xs, Wt, zs] as Vec3, normal: [0, 1, 0] as Vec3, hole_mm: 22, part: "main_switch" }] : ys !== null ? [{ id: "torso_bay.switch", kind: "switch", face: "x+" as Face, at: [Dt, ys, zc] as Vec3, normal: [1, 0, 0] as Vec3, hole_mm: 22, part: "main_switch" }] : backCase ? [{ id: "torso_bay.switch", kind: "switch", face: "x-" as Face, at: [-Dt - 31, 0, zb] as Vec3, normal: [-1, 0, 0] as Vec3, hole_mm: 22, part: "main_switch" }] : [])] }, H);
  // backpack boards (the mech's converters) under their own hood, with the battery switch in it
  const pack = parts.filter((n) => partBox(A, n).lo[0] <= -Dt);
  if (pack.length) hoodAround(A, H, { name: "backpack_hood", deck: torsos[0], alsoHoles: torsos.slice(1), parts: pack, z0: b.shelfZ, z1: Math.max(...pack.map((n) => partBox(A, n).hi[2])) + 24, limit: { x0: -Dt - 225, x1: -Dt - 3, y0: -b.backY - 5, y1: b.backY + 5 }, material: "printed_dark", grommets: [{ id: "to_torso", face: "x+", u: 0 }] });
  // a mech's battery switch is big: it stands in the roof of a small case on the backpack, its body in the case
  if (mech && xs === null) {
    const r = (A.design.enclosures ?? []).find((x) => x.name === "backpack_hood")!, cx = r.min[0] + 45, z0 = r.max[2] + 2.8;
    hood(A, H, { name: "switch_case", deck: "backpack_hood", x0: cx - 33, x1: cx + 33, y0: -33, y1: 33, z0, z1: z0 + 60, parts: [], ventRows: 0, deckGrommets: [{ id: "down", x: cx - 22, y: 22 }], material: "printed_dark" });
    A.amendProgram("switch_case", [{ op: "cutbox", min: [cx - 26.3, -26.3, z0 + 58], max: [cx + 26.3, 26.3, z0 + 64] }]);
    A.mount("switch_case", swKey, frame([cx, 0, z0 + 62.8], [0, 0, 1], [1, 0, 0]), "main_switch", "main battery switch");
    // its terminals are inside the case: its leads, and the splices beside it, leave by the case's hole down into the backpack
    H.bayOf.set("main_switch", "switch_case");
  }
  // the IMU in a little hood under the pelvis
  const iw = partBox(A, "imu"), yy = 15;
  hood(A, H, { name: "imu_hood", deck: A.spec.links.find((l) => /^base_link/.test(l.name))!.name, x0: iw.lo[0] - 3, x1: iw.hi[0] + 3, y0: -yy, y1: yy, z0: -zPel, z1: -(iw.lo[2] - 3), parts: ["imu"], flip: true, ventRows: 0, grommets: [{ id: "out", face: "x+", u: 0 }] });
  // (its leads leave the little hood forwards and go up into the torso by the floor hole in front of the boards)
  H.exitOf.set("computer~imu", "torso_bay.imu");
  H.scan();
}
/** Netlist of a biped: humanoid on a 3S pack with a 5 V arm rail; mech on two 6S packs in series, CAN legs, 12 V DC-DC. */
function wireBiped(A: Assembly, H: Harness, compute: string, mech: boolean, nBatt: number) {
  const named: { name: string; kind: "lidar" | "depth" | "camera" | "imu" }[] = [];
  for (const [n, k] of [["lidar", "lidar"], ["depth_camera", "depth"], ["head_camera", "camera"], ["imu", "imu"]] as const) if (H.instances.has(n)) named.push({ name: n, kind: k });
  for (const x of ["lidar", "depth_camera", "head_camera"]) if (H.instances.has(x)) exposed(A, x, x === "lidar" ? "on a mast behind the head" : "in the head, looking out through its face", [20, 20]);
  const limb = (re: RegExp) => actuatorsUnder(H, re);
  const legs = ["l", "r"].map((p) => limb(new RegExp(`^${p}_(hip|knee|ankle).*_actuator$`))), arms = ["l", "r"].map((p) => limb(new RegExp(`^${p}_(shoulder|upper|elbow|wrist|gripper).*_actuator$`))), neck = limb(/^neck_.*_actuator$/);
  if (!mech) {
    coreTree(H, { batteries: ["battery"], regulators: ["regulator_5v", "regulator_5v_arms"], compute, sensors: named, simultaneous: 6, simNote: "one leg at peak, the rest at half load" });
    H.regulator("regulator_5v_arms", "VBAT", "5V_ARMS", { vin: "VIN", gin: "GND", vout: "VOUT", gout: "GND", volts: 5, efficiency: 0.9, simultaneous: 4, simNote: "four arm servos at peak at once" });
    limbBuses(H, [...legs, ...arms, neck], (k) => (k.startsWith("feetech") ? { adapter: "leg_bus", rail: "VBAT" } : k.includes("xl330") ? { adapter: "arm_bus", rail: "5V_ARMS" } : { adapter: "arm_bus", rail: "VBAT" }));
    H.spare("leg_bus.dc_in");
    H.bought("leg_bus.usb.VBUS", compute === "rpi5" ? "computer.usb_a.LINK" : "computer.usb_a_j6_j7.LINK", "USB", 0.05, 0.1, "LEG_BUS_USB");
  } else {
    const packs = ["battery", "battery_2", "battery_3", "battery_4"].filter((n) => H.instances.has(n)), volts = 22.2 * 2;
    for (const n of packs) H.spare(`${n}.balance`);
    // two packs in series make the 12S bus; a second pair sits in parallel
    H.net("MID_PACK", "power", 22.2); H.wire("MID_PACK", "battery.main.BAT-", "battery_2.main.BAT+", { typ: 20, peak: 60 });
    H.mainPower("VBAT", { source: "battery", pos: "main.BAT+", neg: "battery_2.main.BAT-", fuse: true, sw: "main_switch", volts, cont: 120, peakLimit: 240, simultaneous: 4, simNote: "four leg joints at peak at once, the rest walking (15 % of rated)", range: { min: 36, nom: 44.4, max: 50.4 } });
    H.regulator("dcdc_12v", "VBAT", "12V", { vin: "DC INPUT V+", gin: "DC INPUT V-", vout: "DC OUTPUT +V", gout: "DC OUTPUT -V", volts: 12, efficiency: 0.86, cont: 4.2 * A.spec.links.filter((l) => /^dcdc_12v/.test(l.name)).length, peakLimit: 4.4 * A.spec.links.filter((l) => /^dcdc_12v/.test(l.name)).length, simultaneous: 1, simNote: "one arm joint at peak, the rest holding (20 % of rated)" });
    H.spare("dcdc_12v.dc_in.FG");
    const nConv = A.spec.links.filter((l) => /^dcdc_12v/.test(l.name)).length;
    for (let i = 2; i <= nConv; i++) { const n = `dcdc_12v_${i}`; H.feed("VBAT", n, { v: "DC INPUT V+", g: "DC INPUT V-", typ: 0.5, peak: 2 }); H.wire("12V", `${n}.DC OUTPUT +V`, "dcdc_12v.DC OUTPUT +V", { typ: 2, peak: 4.2 }); H.wire("GND", `${n}.DC OUTPUT -V`, "dcdc_12v.DC OUTPUT -V", { typ: 2, peak: 4.2 }); H.spare(`${n}.dc_in.FG`); }
    H.regulator("regulator_5v", "12V", "5V", { vin: "VIN", gin: "GND", vout: "VOUT", gout: "GND", volts: 5, efficiency: 0.9 });
    H.spare("regulator_5v.power_and_control.VRP", "regulator_5v.power_and_control.EN", "regulator_5v.power_and_control.PG");
    H.feed("12V", "computer", { v: "dc_jack_j16.DC_IN", g: "dc_jack_j16.GND", typ: 1.3, peak: 2.1 });
    // the camera and IMU on the computer; their current is inside its own feed
    for (const s of named) void s;
    const can = (s: string) => H.instances.get(s)!.key.startsWith("cubemars");
    legs.forEach((l, i) => canTree(H, { adapter: i ? "leg_bus_2" : "leg_bus", motors: [...l, ...arms[i].filter(can)], rail: "VBAT", duty: 0.15 }));
    for (const a of ["leg_bus", "leg_bus_2"]) H.bought(`${a}.usb.VBUS`, "computer.usb_a_j6_j7.LINK", "USB", 0.1, 0.5, `${a}_USB`.toUpperCase());
    limbBuses(H, [...arms.map((a) => a.filter((s) => !can(s))), neck.filter((s) => !can(s))], () => ({ adapter: "arm_bus", rail: "12V", duty: 0.2 }));
    sensorsOnComputerFor(H, named);
  }
  H.bought("arm_bus.usb.VBUS", compute === "rpi5" ? "computer.usb_a.LINK" : "computer.usb_a_j6_j7.LINK", "USB", 0.05, 0.1, "ARM_BUS_USB");
  finishWiring(H, { noClips: /armour/ });
  enclosureChecks(A);
  void nBatt;
}

function designBiped(req: LeggedRequest, mech: boolean): RobotSpecification {
  // small servo humanoids (ROBOTIS OP3 class) carry 3-4 DOF arms: 7-DOF arms overload the hip and knee servos
  const armDof = Math.max(1, Math.min(7, Math.round(req.armDof ?? (mech ? 7 : 4))));
  const sensors = [...new Set<SensorKind>(["camera", "imu", ...(req.sensors ?? [])])];
  const legLadder = mech ? ["cubemars_ak60_6", "cubemars_ak70_10", "cubemars_ak80_9", "cubemars_ak80_64"] : ["feetech_sts3215_c047", "feetech_sts3250", "dxl_xh540_w270"];
  const armLadder = mech ? ["dxl_xm430_w350", "dxl_xh540_w270", "cubemars_ak60_6", "cubemars_ak70_10"] : ["dxl_xl330_m288", "dxl_xl430_w250", "dxl_xm430_w350"];
  const neckLadder = mech ? ["dxl_xl430_w250", "dxl_xm430_w350"] : ["dxl_xl330_m288", "dxl_xl430_w250"];
  const sc = mech ? Math.max(0.75, Math.min(1.3, (req.heightM ?? 1.0) / 1.0)) : Math.max(0.8, Math.min(1.3, (req.heightM ?? 0.6) / 0.6));
  const legKeys = (k: string) => Object.fromEntries(LEG.map((j) => [j, k])) as Record<LegJ, string>;
  const armKeys = (k: string) => Object.fromEntries(ARM_JOINTS[7].map((j) => [j, k]));
  const cfg: BipedCfg = mech
    ? { mech, leg: legKeys(legLadder[1]), arm: armKeys(armLadder[0]), grip: "dxl_xm430_w350", neck: [neckLadder[0], neckLadder[0]], armDof, gripper: req.gripper !== false,
      L1: 180 * sc, L2: 180 * sc, Yh: 95, bend: 0.12, upperArm: 110 * sc, batt: "lipo_6s_10000", nBatt: 2, extraKg: req.payloadKg ?? 0.5, t: 8, bodyWall: 5, footLen: 220 * sc, footW: 120 }
    : { mech, leg: legKeys(legLadder[0]), arm: armKeys(armLadder[0]), grip: "dxl_xl330_m288", neck: [neckLadder[0], neckLadder[0]], armDof, gripper: req.gripper !== false,
      L1: 90 * sc, L2: 90 * sc, Yh: 46, bend: 0.12, upperArm: 0, batt: "lipo_3s_2200", nBatt: 1, extraKg: req.payloadKg ?? 0.15, t: 4, bodyWall: 3, footLen: 120 * sc, footW: 62 };
  let built = buildBiped(req, cfg, sensors), torques: Record<string, number> = {};
  let batt = { key: cfg.batt, n: cfg.nBatt, wh: 0, minutes: 0 };
  for (let iter = 0; iter < 8; iter++) {
    torques = bipedTorques(built.A, built.feet, built.hands, cfg.extraKg);
    const grp = (suffix: string) => Math.max(0, ...Object.entries(torques).filter(([k]) => k.endsWith(suffix)).map(([, v]) => v));
    const leg = Object.fromEntries(LEG.map((j) => [j, choose(legLadder, grp(`_${j}`), 0, GAIT_DUTY).key])) as Record<LegJ, string>;
    // keep each leg joint pair on one family: the leg ladder only grows
    const arm = Object.fromEntries(ARM_JOINTS[7].map((j) => [j, choose(armLadder, grp(`_${j}`)).key]));
    const neck: [string, string] = [choose(neckLadder, grp("neck_pan")).key, choose(neckLadder, grp("neck_tilt")).key];
    const grip = choose(neckLadder, grp("_gripper")).key;
    const pw = bipedPower(built.A, torques, built.compute).total;
    batt = pickBattery(mech ? [["lipo_6s_10000", 2], ["lipo_6s_10000", 4]] : [["lipo_3s_2200", 1], ["lipo_3s_5000", 1]], pw, 20);
    const dxlA = mech ? sum(Object.entries(torques).filter(([k]) => !/hip|knee|ankle/.test(k) && keyOf(built.A, k).startsWith("dxl_")).map(([k, v]) => holdCurrent(keyOf(built.A, k), v))) : 0;
    const nDcdc = mech ? Math.max(2, Math.ceil((dxlA + 25 / 12) / (4.2 * 0.9))) : undefined;
    const same = nDcdc === cfg.nDcdc && LEG.every((j) => leg[j] === cfg.leg[j]) && ARM_JOINTS[7].every((j) => arm[j] === cfg.arm[j]) && neck[0] === cfg.neck[0] && neck[1] === cfg.neck[1] && batt.key === cfg.batt && batt.n === cfg.nBatt && (grip === cfg.grip || mech);
    if (same) break;
    Object.assign(cfg, { leg, arm, neck, batt: batt.key, nBatt: batt.n, grip: mech ? cfg.grip : grip, nDcdc });
    built = buildBiped(req, cfg, sensors);
  }
  const { A } = built;
  const m = totalMass(A.spec);
  recordJoints(A, torques, (j) => /hip|knee|ankle/.test(j) ? `single-leg support of ${(m + 2 * cfg.extraKg).toFixed(2)} kg, centre of pressure anywhere on the central 60 % of the sole, squat to 0.4 rad, lean ±0.1 rad, step ±0.2 rad, ±10 % traction` : j.startsWith("neck") ? "head nodding ±0.7 rad" : `arm stretched forward / sideways with ${cfg.extraKg} kg in the hand`);
  const pw = bipedPower(A, torques, built.compute);
  A.design.performance.average_power_w = +pw.total.toFixed(1);
  A.check("power:battery_runtime", batt.minutes >= 20, `${cfg.nBatt > 1 ? `${cfg.nBatt} x ` : ""}${part(cfg.batt).name}: ${batt.wh} Wh x 80 % usable at ${pw.total.toFixed(1)} W average (${pw.items.map((i) => `${i.what} ${i.watts.toFixed(1)} W`).join(", ")}) -> ${batt.minutes.toFixed(0)} min`);
  const peakA = sum(Object.entries(torques).filter(([k]) => /hip|knee|ankle/.test(k)).map(([k, v]) => holdCurrent(keyOf(A, k), v * DYNAMIC_FACTOR)));
  A.check("power:battery_current", peakA <= Number(part(cfg.batt).specs.max_current_a), `worst-case leg current ~${peakA.toFixed(1)} A vs ${part(cfg.batt).specs.max_current_a} A pack rating`);
  if (mech) {
    const arm12 = sum(Object.entries(torques).filter(([k]) => !/hip|knee|ankle/.test(k) && keyOf(A, k).startsWith("dxl_")).map(([k, v]) => holdCurrent(keyOf(A, k), v)));
    const n = cfg.nDcdc ?? 1;
    A.check("power:12v_converter", arm12 + 25 / 12 <= 4.2 * n * 0.9, `DYNAMIXEL arms holding the payload draw ~${arm12.toFixed(1)} A + Jetson ~2.1 A of ${n} x SD-50C-12 (${(4.2 * n).toFixed(1)} A, converters in parallel per bus)`);
  } else {
    const five = Object.entries(torques).filter(([k]) => !/hip|knee|ankle/.test(k) && part(keyOf(A, k)).specs.voltage_v <= 6);
    const xl = sum(five.map(([k, v]) => holdCurrent(keyOf(A, k), v)));
    A.check("power:5v_arm_bus", xl <= 5.5 * 0.8, `${five.length} XL330-class servos holding the payload draw ~${xl.toFixed(1)} A of the 5.5 A regulator (larger arm servos run on the 12 V bus)`);
  }
  // stability: COM over the sole(s)
  const c = comWorld(A.spec);
  const corners = (f: (typeof built.feet)[number]) => [[f.sole.lo[0], f.sole.lo[1]], [f.sole.hi[0], f.sole.lo[1]], [f.sole.hi[0], f.sole.hi[1]], [f.sole.lo[0], f.sole.hi[1]]].map(([x, y]) => [x / 1000, y / 1000, 0] as Vec3);
  const both = supportMargin(built.feet.flatMap(corners), c);
  A.check("stability:double_support", both >= 0.015, `COM projection ${(both * 1000).toFixed(0)} mm inside the two-foot support polygon (need 15 mm)`);
  const sole0 = built.feet[0].sole;
  A.design.performance.com_height_m = +(c[2] - sole0.lo[2] / 1000).toFixed(3);
  A.design.performance.com_x_over_sole_mm = +((c[0] * 1000) - (sole0.lo[0] + sole0.hi[0]) / 2).toFixed(1);
  // joint limits from geometry
  const H = new Harness(A);
  boxBiped(A, H, built, mech);
  const actuated = A.spec.joints.filter((j) => j.type === "revolute" && !j.name.endsWith("_gripper")).map((j) => j.name);
  const combos: Record<string, number>[] = [];
  for (const q of legPoses(A).filter((_, i) => i % 9 === 0)) combos.push(q);
  for (const y of [-0.15, 0.15]) combos.push(Object.fromEntries(["l", "r"].map((p) => [`${p}_hip_yaw`, p === "l" ? y : -y])));
  // legs are swept with the arms held 0.35 rad out to the side (walking posture), arms with the legs at home
  const armsOut = Object.fromEntries(["l", "r"].filter(() => armDof >= 3).map((p) => [`${p}_shoulder_roll`, (p === "l" ? 1 : -1) * 0.35]));
  for (const q of combos) Object.assign(q, armsOut);
  limitsFromGeometry(A, actuated, combos, 0.06, [], () => armsOut);
  A.design.assumptions.push("Joint ranges are swept with the arms held 0.35 rad out to the side (the walking posture); with the arms hanging straight the hands touch the thighs when a leg abducts or a wrist turns.");
  if (mech) A.design.assumptions.push("CubeMars actuators run on a 12S bus (two 6S packs in series, 44.4 V nominal) at their 48 V ratings; DYNAMIXEL arms and the computer run from the 12 V DC-DC converter.");
  wireBiped(A, H, built.compute, mech, cfg.nBatt);
  const bom = A.bom();
  const footZ = built.feet[0].sole.lo[2];
  // overall height: highest point of any part's box at home above the sole
  let top = -Infinity;
  for (const l of A.spec.links) {
    if (l.geometry.type !== "mesh") continue;
    const bb = l.geometry.bbox;
    for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) top = Math.max(top, pointWorld(A.spec, {}, l.name, [x, y, z])[2] * 1000);
  }
  const height = (top - footZ + 2) / 1000, headTop = 0;
  A.design.performance = {
    ...A.design.performance, mass_kg: +m.toFixed(3), height_m: +(Math.max(height, headTop)).toFixed(3), hip_height_m: +(-footZ / 1000).toFixed(3),
    dof: A.spec.joints.filter((j) => j.type === "revolute").length, arm_dof: armDof, payload_per_hand_kg: cfg.extraKg,
    leg_actuators: [...new Set(LEG.map((j) => part(cfg.leg[j]).name))].join(" / "), arm_actuators: [...new Set(ARM_JOINTS[armDof].map((j) => part(cfg.arm[j]).name))].join(" / "),
    runtime_min: +batt.minutes.toFixed(0), cost_usd: bom.cost_usd, sensors: sensors.join(", "),
  };
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `bought parts $${bom.cost_usd.toFixed(0)} vs budget $${req.budget}`);
  A.design.assumptions.push(
    "Zero joint angles are the standing pose (knees bent 0.25 rad, soles flat); the base origin is on the hip-yaw output plane.",
    `Leg loads are J^T F at the sole with the whole robot on one foot and the centre of pressure anywhere on the central 60 % of the sole, over squat / lean / step poses, ±10 % traction, x ${DYNAMIC_FACTOR} dynamic factor; continuous duty checked at ${Math.round(GAIT_DUTY * 100)} % of the worst stance load (RMS over a gait cycle with half of it in stance).`,
    "Soles carry a 2 mm rubber pad (silicone / neoprene sheet, glued) as the contact patch.",
    "Arm loads are exact gravity torques with the payload in each hand, arms stretched forward, sideways and rolled.",
    mech
      ? "Research-grade biped: it cannot walk, or even stand reliably, without a whole-body balance controller (torque-controlled QDD legs, IMU feedback, e.g. MPC or an RL policy). Armour panels are thin cosmetic shells with no structural role; their mass is counted."
      : "Small humanoid: walking needs a balance controller using the pelvis IMU (ZMP preview / RL policy); position-controlled standing is passively stable only while the COM stays over the soles.",
  );
  A.design.request = { ...req };
  const label = mech ? "Battle mech" : "Humanoid";
  return A.finish(`${label}, ${A.design.performance.height_m} m, ${m.toFixed(2)} kg, ${A.design.performance.dof} DOF (${armDof}-DOF arms${cfg.gripper ? " + grippers" : ""}), ${batt.minutes.toFixed(0)} min, $${bom.cost_usd.toFixed(0)} of parts`);
}

/** Small humanoid (ToddlerBot / Robotis-OP class) with 6-DOF legs, head pan/tilt + camera and N-DOF arms with grippers. */
export const designHumanoid = (req: LeggedRequest): RobotSpecification => designBiped(req, false);
/** ~1 m battle mech: CubeMars AK legs, DYNAMIXEL arms, head camera, IMU, printed armour panels. */
export const designBattleMech = (req: LeggedRequest): RobotSpecification => designBiped(req, true);
void [Y, mul];
