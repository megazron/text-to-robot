// Iron Man Mark 43 as armour a person can wear, built body first. A parametric wearer (1.75 m default, segment
// lengths and girths from standard anthropometric ratios) stands inside; every armour piece is a lofted shell 14 mm
// off the body (padding) with 3 mm walls, split into pieces that fit a 250 x 210 x 220 mm print bed and close round
// the limb with webbing straps through slots. The helmet's faceplate lifts on two MG90S servos in the ear pods; the
// eyes, arc reactor and palm repulsors are LEDs. An Arduino Nano, an LM2596 and a 2S 18650 pack sit in a box on the back.
// The wearer moves the joints (passive in the model); posed checks sweep every joint and record how far it moves before
// any armour piece touches another piece or the wearer.
//
// Tiers (Arduino mode): helmet (motorised helmet + LED eyes), lights (helmet + chest armour with arc reactor + gauntlets
// with repulsors), suit (every piece). A powered suit that moves the wearer cannot be built from hobby parts; asked
// for, the result says so.
import type { RobotSpecification, Joint } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { mul, translation, toPose, type Mat4 } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { totalMass, gravityTorques } from "../kin.ts";
import { DYNAMIC_FACTOR } from "../sizing.ts";
import { limitsFromGeometry } from "./legkit.ts";

export type Mark43Tier = "helmet" | "lights" | "suit";
export interface Mark43Request { name?: string; prompt?: string; budget?: number; heightM?: number; tier?: Mark43Tier; }

type Sec = [number, number, number, number?, number?];
const GAP = 14, T = 3, SERVO = "hobby_mg90s", FILAMENT_USD_PER_KG = 22;
const rotX = (a: number): Mat4 => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
/** armour sections: the body sections pushed out by the padding gap plus the wall */
const armour = (secs: Sec[], extra = 0): Sec[] => secs.map(([z, rx, ry, cx, cy]) => [z, rx + GAP + T + extra, ry + GAP + T + extra, cx, cy]);
const scaleSecs = (secs: Sec[], s: number): Sec[] => secs.map(([z, rx, ry, cx, cy]) => [z * s, rx * s, ry * s, (cx ?? 0) * s, (cy ?? 0) * s]);

/** Cells of a split: each keeps the part of the shell inside [x0,x1] x [y0,y1] x [z0,z1] (others cut away). */
function cells(xs: number[], ys: number[], zs: number[]): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = [];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) for (let k = 0; k + 1 < zs.length; k++) out.push([[xs[i], ys[j], zs[k]], [xs[i + 1], ys[j + 1], zs[k + 1]]]);
  return out;
}
const BIG = 3000;
/** cutboxes that remove everything outside the cell (faces at +-BIG are open: nothing to cut there) */
const keepOnly = ([lo, hi]: [Vec3, Vec3]): Op[] => {
  const ops: Op[] = [];
  for (let a = 0; a < 3; a++) {
    if (lo[a] > -BIG) { const mn: Vec3 = [-2 * BIG, -2 * BIG, -2 * BIG], mx: Vec3 = [2 * BIG, 2 * BIG, 2 * BIG]; mx[a] = lo[a]; ops.push({ op: "cutbox", min: mn, max: mx }); }
    if (hi[a] < BIG) { const mn: Vec3 = [-2 * BIG, -2 * BIG, -2 * BIG], mx: Vec3 = [2 * BIG, 2 * BIG, 2 * BIG]; mn[a] = hi[a]; ops.push({ op: "cutbox", min: mn, max: mx }); }
  }
  return ops;
};

export function designMark43Wearable(req: Mark43Request = {}): RobotSpecification {
  const tier = req.tier ?? "suit", H = (req.heightM ?? 1.75) * 1000, s = H / 1750;
  const A = new Assembly(req.name ?? "iron_man_mark_43", "mark43_wearable", req.prompt);
  const full = tier !== "helmet";
  const passive = (name: string, parent: string, child: string, Tj: Mat4, axis: Vec3, lower: number, upper: number) => {
    const j: Joint = { name, type: "revolute", parent, child, origin: toPose(Tj), axis, passive: true, limit: { lower, upper, effort: 200, velocity: 6 }, dynamics: { damping: 0.5, friction: 0.1 } };
    A.spec.joints.push(j);
  };
  const bodyLink = (name: string, secs: Sec[], massKg: number) => A.cadLink(name, { name, ops: [{ op: "loft", sections: secs }] }, { role: "wearer", material: "wearer", printed: false, massKg });
  let pieces = 0, straps = 0;
  /** one armour shell split into printable pieces, each fixed to `link` */
  const shell = (link: string, base: string, ops: Op[], split: [number[], number[], number[]], material: string, strapPairs = 0) => {
    for (const [k, c] of cells(...split).entries()) {
      const name = `${base}_${k + 1}`;
      A.cadLink(name, { name, edge: 0, ops: [...ops, ...keepOnly(c)] }, { material, role: "armour" });
      A.fixed(`${name}_mount`, link, name, translation([0, 0, 0]));
      pieces++;
    }
    straps += strapPairs;
  };

  // ---------------- wearer (standing, arms 15 deg out). World: z up from the floor, x forward, y left.
  const hipZ = 920 * s, kneeZ = 490 * s, ankleZ = 80 * s, shZ = 1420 * s, shY = 185 * s, neckZ = 1520 * s, ABD = 15 * Math.PI / 180;
  const upperL = 310 * s, foreL = 250 * s;
  const torsoSecs = scaleSecs([[900, 112, 165], [1000, 108, 150], [1100, 108, 150], [1200, 118, 165], [1300, 128, 172], [1400, 120, 170], [1460, 82, 120]], s);
  const headSecs: Sec[] = scaleSecs([[20, 75, 60, 15], [80, 95, 75, 5], [140, 100, 80], [200, 85, 70], [228, 30, 25]], s);
  // root on the floor between the feet, so the wearer stands on the ground in every viewer and simulator
  A.frameLink("base_link", "base");
  bodyLink("pelvis", torsoSecs.map(([z, rx, ry]) => [z - hipZ, rx, ry] as Sec), 0);   // torso mass is lumped below
  A.fixed("standing", "base_link", "pelvis", translation([0, 0, hipZ]));
  A.spec.links[A.spec.links.length - 1].mass = 38 * s ** 3;
  bodyLink("head", headSecs.map(([z, rx, ry, cx]) => [z, rx, ry, cx] as Sec), 5 * s ** 3);
  A.fixed("neck_mount", "pelvis", "head", translation([0, 0, neckZ - hipZ]));
  if (full) {
    for (const side of [1, -1] as const) {
      const L = side > 0 ? "left" : "right";
      // arm: shoulder frame turned out by the abduction angle; the limb runs down local -z
      const Tsh = mul(translation([0, side * shY, shZ - hipZ]), rotX(side * ABD));
      bodyLink(`${L}_upper_arm`, scaleSecs([[0, 50, 48], [-150, 46, 44], [-310, 40, 40]], s), 2.2 * s ** 3);
      passive(`${L}_shoulder`, "pelvis", `${L}_upper_arm`, Tsh, [0, 1, 0], -2.6, 0.6);
      bodyLink(`${L}_forearm`, scaleSecs([[0, 42, 40], [-120, 40, 38], [-250, 28, 25]], s), 1.4 * s ** 3);
      passive(`${L}_elbow`, `${L}_upper_arm`, `${L}_forearm`, translation([0, 0, -upperL]), [0, 1, 0], -2.4, 0);
      bodyLink(`${L}_hand`, scaleSecs([[0, 26, 14], [-90, 30, 14], [-170, 20, 11]], s), 0.45 * s ** 3);
      A.fixed(`${L}_wrist`, `${L}_forearm`, `${L}_hand`, translation([0, 0, -foreL]));
      bodyLink(`${L}_thigh`, scaleSecs([[-60, 80, 76], [-200, 75, 72], [-400, 55, 55]], s), 9 * s ** 3);   // top within the hip width
      passive(`${L}_hip`, "pelvis", `${L}_thigh`, translation([0, side * 90 * s, 0]), [0, 1, 0], -1.9, 0.4);
      bodyLink(`${L}_shin`, scaleSecs([[-20, 52, 50, -4], [-140, 56, 54, -10], [-300, 42, 40, -6], [-400, 33, 33]], s), 3.5 * s ** 3);
      passive(`${L}_knee`, `${L}_thigh`, `${L}_shin`, translation([0, 0, kneeZ - hipZ]), [0, 1, 0], 0, 2.2);
      // foot: a loft along x (local z -> world x), 80 mm down to the floor
      const footOps: Op[] = [{ op: "at", T: place([0, 0, -1], [0, 1, 0], [1, 0, 0], [0, 0, 0]), of: [{ op: "loft", sections: scaleSecs([[-60, 40, 38, 40], [60, 32, 45, 50], [190, 15, 40, 65]], s) }] }];
      A.cadLink(`${L}_foot`, { name: `${L}_foot`, ops: footOps }, { role: "wearer", material: "wearer", printed: false, massKg: 1.1 * s ** 3 });
      A.fixed(`${L}_ankle`, `${L}_shin`, `${L}_foot`, translation([0, 0, ankleZ - kneeZ]));
    }
  }

  // ---------------- helmet (head frame, origin at the neck joint): cranium with ear pods + faceplate
  const helm: Sec[] = armour(headSecs.map(([z, rx, ry, cx]) => [z, rx, ry, cx] as Sec), 1);
  helm.unshift([-25 * s, 82 * s + GAP, 72 * s + GAP, 12 * s]);
  helm.push([248 * s, 20 * s, 18 * s]);   // shell ends at a crown opening, closed by a solid cap below
  // hinge at the temples, a little back: every forehead point is nearer the hinge than the faceplate, so it swings clear
  const earX = -15 * s, earZ = 165 * s, earY = 120 * s;     // servo output face on the outside of the ear pod (hinge outside the shell)
  const faceX = 38 * s, faceZ0 = 40 * s, faceZ1 = 175 * s;
  const Tear = (side: 1 | -1): Mat4 => place([0, 0, 1], [side, 0, 0], [0, side, 0], [earX, side * earY, earZ]);   // output points outwards (right-handed: y = z x x)
  const cranium: Op[] = [{ op: "loft", sections: helm, t: T }, { op: "loft", sections: [[240 * s, 31 * s, 28 * s], [247 * s, 20 * s, 18 * s], [250 * s, 4, 4]] }   /* crown cap: above the head + padding, inside the shell wall */, { op: "cutbox", min: [faceX - 3, -BIG, faceZ0 - 3], max: [BIG, BIG, faceZ1 + 3] }];
  for (const side of [1, -1] as const) {
    cranium.push({ op: "rod", a: [earX, side * 88 * s, earZ], b: [earX, side * (earY - 1), earZ], r: 28 });   // ear pod housing the servo
    cranium.push({ op: "cradle", key: SERVO, T: Tear(side), wall: 2.2 });
  }
  for (const z of [faceZ0 + 15, faceZ1 - 40]) for (const side of [1, -1] as const) cranium.push({ op: "cutbox", min: [-60 * s, side * 60 - 12, z], max: [-40 * s, side * 60 + 12, z + 4] });  // padding strap slots
  // faceplate: its own loft 4 mm outside the cranium so it can swing up over the forehead; arms to both servo horns
  const faceSecs: Sec[] = armour(headSecs.map(([z, rx, ry, cx]) => [z, rx, ry, cx] as Sec), 10);   // a layered plate 9 mm outside the cranium: room to swing over the forehead
  const faceOps: Op[] = [{ op: "loft", sections: faceSecs.slice(0, 4), t: T }, ...keepOnly([[faceX, -BIG, faceZ0], [BIG, BIG, faceZ1]])];
  for (const z of [125 * s]) for (const side of [1, -1] as const) faceOps.push({ op: "cutbox", min: [80 * s, side * 34 * s - 17 * s, z - 4 * s], max: [BIG, side * 34 * s + 17 * s, z + 4 * s] });   // eye slits
  // the faceplate link is the left servo's output frame: write it in the head frame, then map with the inverse placement
  const TL = Tear(1), inv = invertRigid(TL);
  const facePlate: Op[] = [{ op: "at", T: inv, of: faceOps }];
  for (const side of [1, -1] as const) {
    const Th = Tear(side);
    // horn plate on each servo plus an arm forward inside the shell gap to the faceplate's edge
    // horn plate outside the pod, an arm forwards (servo y = side * world x) and a web in to the faceplate's side edge
    facePlate.push({ op: "at", T: mul(inv, Th), of: [{ op: "horn", key: SERVO, t: 3, extra: 3 }, { op: "box", min: [-6, side > 0 ? 0 : -(faceX - earX + 8), 0], max: [6, side > 0 ? faceX - earX + 8 : 0, 3], r: 0 }] });
    facePlate.push({ op: "at", T: inv, of: [{ op: "box", min: [faceX - 2, side > 0 ? 100 * s : -(earY + 3), earZ - 6], max: [faceX + 8, side > 0 ? earY + 3 : -100 * s, earZ + 6], r: 0 }] });
  }
  A.cadLink("helmet_faceplate", { name: "helmet_faceplate", ops: facePlate }, { material: "armour_gold" });
  pieces++;
  shell("head", "helmet_cranium", cranium, [[-BIG, 0, BIG], [-BIG, 0, BIG], [-BIG, 120 * s, BIG]], "armour_red");
  A.mount("helmet_cranium_5", SERVO, TL, "faceplate_servo_left", "faceplate servo (left ear)");
  A.mount("helmet_cranium_5", SERVO, Tear(-1), "faceplate_servo_right", "faceplate servo (right ear, mirrored)");
  A.revolute("faceplate", "helmet_cranium_5", "helmet_faceplate", TL, SERVO, -1.2, 0);   // servo axis +y: opening (front up) is negative
  // eye LEDs just behind the eye slits, in the padding gap in front of the face (LED axis forwards)
  const xLed = 100 * s + GAP + 10 - 9.5;
  for (const side of [1, -1] as const) A.mount("helmet_faceplate", "led_5mm_white", mul(inv, place([0, 0, -1], [0, 1, 0], [1, 0, 0], [xLed, side * 34 * s - 2.9, 125 * s + 2.9])), `eye_led_${side > 0 ? "left" : "right"}`, "eye light");

  if (full) {
    // ---------------- chest + back (pelvis frame): one shell, arm holes, arc reactor, split in 8 printable pieces
    const torsoArm = armour(torsoSecs.slice(1, 6).map(([z, rx, ry]) => [z - hipZ, rx, ry] as Sec));
    const chest: Op[] = [{ op: "loft", sections: torsoArm, t: T }];
    // armpit scoops: the chest is cut back round each arm (a cylinder along the arm, 95 mm radius)
    // (and a second scoop along the arm raised 45 deg forwards, so the arm can swing in front of the chest)
    const ryM = (a: number): Mat4 => { const c = Math.cos(a), sn = Math.sin(a); return [c, 0, -sn, 0, 0, 1, 0, 0, sn, 0, c, 0, 0, 0, 0, 1]; };
    for (const side of [1, -1] as const) for (const flex of [0, -0.8]) chest.push({ op: "at", T: mul(mul(translation([0, side * shY, shZ - hipZ]), rotX(side * ABD)), ryM(flex)), of: [{ op: "hole", a: [0, 0, 120 * s], b: [0, 0, -360 * s], d: 190 * s }] });
    const reactorZ = 1330 * s - hipZ, front = 128 * s + GAP + T;
    // cells run x (back, front) -> y (right, middle, left) -> z (low, mid, high): front-middle-high is cell 2*9... index below
    const reactorPiece = 1 * 9 + 1 * 3 + 2 + 1;
    chest.push({ op: "hole", a: [front - 40, 0, reactorZ], b: [front + 30, 0, reactorZ], d: 40 });
    const zs = [-BIG, 1150 * s - hipZ, 1290 * s - hipZ, BIG];
    shell("pelvis", "chest", chest, [[-BIG, 0, BIG], [-BIG, -60 * s, 40 * s, BIG], zs], "armour_red", 6);
    A.mount(`chest_${reactorPiece}`, "ws2812_ring_12", place([0, 1, 0], [0, 0, 1], [1, 0, 0], [front - T - 6, -18.5, reactorZ - 18.5]), "arc_reactor", "arc reactor ring (12 LEDs)");
    // electronics box on the back plate
    const back = -(128 * s + GAP + T), zb = 1150 * s - hipZ;
    const boxOps: Op[] = [{ op: "box", min: [back - 50, -55, zb], max: [back + 4, 55, zb + 95], r: 8 }, { op: "cutbox", min: [back - 47, -52, zb + 3], max: [back + 1, 52, zb + 96] }];
    A.cadLink("electronics_box", { name: "electronics_box", edge: 0.6, ops: boxOps }, { material: "armour_gold" });
    A.fixed("electronics_box_mount", "pelvis", "electronics_box", translation([0, 0, 0]));
    pieces++;
    A.mount("electronics_box", "pack_2s_18650", place([0, 0, 1], [0, 1, 0], [-1, 0, 0], [back - 26, 0, zb + 5]), "battery", "2S 18650 pack");
    // boards stand on the box's inner walls, components facing into the box (board y = -x, board z = -y)
    A.mount("electronics_box", "arduino_nano_clone", place([0, 0, 1], [-1, 0, 0], [0, -1, 0], [back - 4, -30, zb + 10]), "controller", "Arduino Nano");
    A.mount("electronics_box", "buck_lm2596", place([0, 0, 1], [-1, 0, 0], [0, -1, 0], [back - 4, 50, zb + 10]), "regulator", "LM2596 5 V for servos and LEDs");
    // ---------------- limbs
    for (const side of [1, -1] as const) {
      const L = side > 0 ? "left" : "right";
      const arm = (secs: Sec[], extra = 0): Op[] => [{ op: "loft", sections: armour(scaleSecs(secs, s), extra), t: T }];
      // shoulder bell and bicep cover the outside of the arm only: the inside hangs against the body (strap across)
      const lateral = side > 0 ? [-BIG, 18 * s, BIG] : [-BIG, -18 * s, BIG];
      shell(`${L}_upper_arm`, `${L}_shoulder_bell`, arm([[40, 60, 62], [-20, 66, 66], [-90, 58, 58]], 6), [[-BIG, 0, BIG], side > 0 ? lateral.slice(1) : lateral.slice(0, 2), [-BIG, BIG]], "armour_red", 1);
      const biLat = side > 0 ? [-10 * s, BIG] : [-BIG, 10 * s];
      shell(`${L}_upper_arm`, `${L}_bicep`, arm([[-100, 46, 44], [-175, 44, 42], [-228, 42, 41]]), [[-BIG, 0, BIG], biLat, [-BIG, BIG]], "armour_gold", 2);
      shell(`${L}_forearm`, `${L}_gauntlet`, arm([[-72, 42, 40], [-145, 40, 38], [-240, 30, 27]]), [[-BIG, 0, BIG], [-BIG, BIG], [-BIG, BIG]], "armour_red", 2);
      // hand: back-of-hand plate with the repulsor ring in a palm plate
      const hand: Op[] = [{ op: "loft", sections: armour(scaleSecs([[-5, 26, 14], [-85, 30, 14], [-150, 22, 12]], s)), t: T }, { op: "hole", a: [0, -side * 60, -85 * s], b: [0, -side * 10, -85 * s], d: 38 }];
      shell(`${L}_hand`, `${L}_hand_armour`, hand, [[-BIG, BIG], [-BIG, 0, BIG], [-BIG, BIG]], "armour_red", 1);
      A.mount(`${L}_hand_armour_${side > 0 ? 1 : 2}`, "ws2812_ring_12", place([1, 0, 0], [0, 0, 1], [0, -side, 0], [-18.5, -side * (14 * s + GAP + 1), -85 * s - 18.5]), `${L}_repulsor`, "palm repulsor ring");
      if (tier === "suit") {
        const leg = (secs: Sec[]): Op[] => [{ op: "loft", sections: armour(scaleSecs(secs, s)), t: T }];
        // thigh armour open on the inside (thighs touch): front, outside and back, strapped across the inner thigh
        const inner = side > 0 ? [-30 * s, BIG] : [-BIG, 30 * s];
        // the front starts 60 mm lower than the sides and back, so the thigh can swing up in front of the belt
        const thighOps = [...leg([[-90, 86, 83], [-200, 75, 72], [-335, 58, 57]]), { op: "cutbox" as const, min: [25 * s, -BIG, -150 * s] as Vec3, max: [BIG, BIG, BIG] as Vec3 }];
        shell(`${L}_thigh`, `${L}_thigh_armour`, thighOps, [[-BIG, 0, BIG], inner, [-BIG, -215 * s, BIG]], "armour_red", 2);
        // the back starts at the calf, so the knee can fold (the front still covers the knee)
        const shinOps = [...leg([[-55, 56, 54], [-150, 60, 56], [-300, 46, 42], [-380, 37, 36]]), { op: "cutbox" as const, min: [-BIG, -BIG, -120 * s] as Vec3, max: [-5 * s, BIG, BIG] as Vec3 }];
        shell(`${L}_shin`, `${L}_shin_armour`, shinOps, [[-BIG, 0, BIG], [-BIG, BIG], [-BIG, -210 * s, BIG]], "armour_red", 2);
        // boot cover over the foot (open sole), on the foot frame
        const boot: Op[] = [{ op: "at", T: place([0, 0, -1], [0, 1, 0], [1, 0, 0], [0, 0, 0]), of: [{ op: "loft", sections: armour(scaleSecs([[-75, 40, 38, 40], [60, 32, 45, 48], [205, 15, 40, 62]], s)), t: T }] },
          { op: "cutbox", min: [-BIG, -BIG, -BIG], max: [BIG, BIG, -ankleZ + 6 * s] },
          { op: "cutbox", min: [-BIG, -BIG, -12 * s], max: [BIG, BIG, BIG] }];        // top edge below the ankle
        shell(`${L}_foot`, `${L}_boot`, boot, [[-BIG, 70 * s, BIG], [-BIG, 0, BIG], [-BIG, BIG]], "armour_gold", 1);
      }
    }
    if (tier === "suit") {
      // belt: a band round the hips from 15 mm below the hip joints up to the chest's lower edge (so the thighs swing free)
      const belt: Op[] = [{ op: "loft", sections: armour([[-15 * s, 112 * s, 165 * s], [70 * s, 108 * s, 152 * s]]), t: T },
        { op: "cutbox", min: [-20 * s, -BIG, -BIG], max: [BIG, BIG, BIG] }];   // back and sides only: the front is left to the chest's lower edge, so the thighs can come up to 80 deg
      shell("pelvis", "belt", belt, [[-BIG, BIG], [-BIG, 0, BIG], [-BIG, BIG]], "armour_gold", 2);
    }
  }

  // ---------------- checks: posed clearance, faceplate servo, supply, printing, cost
  const moving = full ? ["faceplate", ...["left", "right"].flatMap((L) => [`${L}_shoulder`, `${L}_elbow`, ...(tier === "suit" ? [`${L}_hip`, `${L}_knee`] : [])])] : ["faceplate"];
  // the wearer's own segments meet at the joints (people are soft): body-body contacts are not armour collisions
  const bodies = A.spec.links.filter((l) => l.role === "wearer").map((l) => l.name), skip: [string, string][] = [];
  for (const a of bodies) for (const b of bodies) if (a < b) skip.push([a, b]);
  const before = Object.fromEntries(A.spec.joints.filter((j) => moving.includes(j.name)).map((j) => [j.name, [j.limit!.lower!, j.limit!.upper!]]));
  limitsFromGeometry(A, moving, [], 0.03, skip);
  const range = (n: string) => { const j = A.spec.joints.find((x) => x.name === n)!; return [j.limit!.lower!, j.limit!.upper!]; };
  const need: Record<string, [number, number]> = { faceplate: [-0.9, 0], left_elbow: [-1.8, 0], right_elbow: [-1.8, 0], left_shoulder: [-1.4, 0.3], right_shoulder: [-1.4, 0.3],
    left_hip: [-1.4, 0.2], right_hip: [-1.4, 0.2], left_knee: [0, 1.6], right_knee: [0, 1.6] };
  for (const n of moving) {
    const [lo, hi] = range(n), [nlo, nhi] = need[n] ?? [0, 0];
    A.check(`wearable:${n}`, lo <= nlo + 1e-6 && hi >= nhi - 1e-6, `moves ${(lo * 57.3).toFixed(0)} to ${(hi * 57.3).toFixed(0)} deg before armour touches armour or the wearer (needs ${(nlo * 57.3).toFixed(0)} to ${(nhi * 57.3).toFixed(0)}; anatomy allows ${(before[n][0] * 57.3).toFixed(0)} to ${(before[n][1] * 57.3).toFixed(0)})`);
  }
  let wFace = 0;
  for (const q of [0, -0.45, -0.9]) wFace = Math.max(wFace, Math.abs(gravityTorques(A.spec, { faceplate: q }).faceplate ?? 0));
  const r = rating(SERVO);
  A.design.joints.push({ joint: "faceplate", actuator: SERVO, required_nm: +(wFace * DYNAMIC_FACTOR).toFixed(4), rated_nm: 2 * r.rated_nm, peak_nm: 2 * r.peak_nm, margin: +((2 * r.peak_nm) / Math.max(wFace * DYNAMIC_FACTOR, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: "two MG90S share the faceplate" });
  A.check("torque:faceplate", 2 * r.rated_nm >= wFace, `two MG90S hold the faceplate open (${wFace.toFixed(3)} N·m vs ${(2 * r.rated_nm).toFixed(3)} N·m continuous)`);
  const leds = A.purchasedList().filter((p) => p.key === "ws2812_ring_12").reduce((n, p) => n + p.qty, 0);
  const amps = 2 * Number(part(SERVO).specs.stall_current_a) + leds * 12 * 0.02 + 0.1;
  if (full) A.check("power:supply", amps <= Number(part("buck_lm2596").specs.current_a), `servos stalled + LEDs at 1/3 white: ${amps.toFixed(2)} A of the LM2596's 3 A`);
  else { A.buy("arduino_nano_clone", 1, "Arduino Nano (in a belt pouch)"); A.buy("pack_2s_18650", 1, "2S 18650 pack (belt pouch)"); A.buy("buck_lm2596", 1, "LM2596 5 V"); }
  if (straps) A.buy("strap_50mm_velcro", straps, "webbing straps closing the split shells");
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 4);
  const printedKg = A.design.printed.reduce((m, p) => m + p.mass_kg, 0), filament = printedKg * 1.08 * FILAMENT_USD_PER_KG;
  const bom = A.bom(), cost = bom.cost_usd + filament;
  if (req.budget !== undefined) A.check("budget", cost <= req.budget, `$${cost.toFixed(2)} (parts $${bom.cost_usd.toFixed(2)} + filament $${filament.toFixed(2)}) vs $${req.budget}`);
  const armourKg = A.spec.links.filter((l) => l.role === "armour").reduce((m, l) => m + l.mass, 0);
  A.design.performance = { tier, tier_label: tier === "helmet" ? "motorised helmet" : tier === "lights" ? "helmet + chest + gauntlets" : "full wearable suit",
    wearer_height_m: +(H / 1000).toFixed(2), printed_pieces: pieces, armour_mass_kg: +armourKg.toFixed(2), filament_kg: +(printedKg * 1.08).toFixed(2), cost_usd: +cost.toFixed(2), mass_kg: +totalMass(A.spec).toFixed(2) };
  A.design.assumptions.push(`padding gap ${GAP} mm, PLA/PETG walls ${T} mm, 15 % gyroid infill (shells are mostly walls)`, `filament at $${FILAMENT_USD_PER_KG}/kg, 8 % waste`,
    "the suit is worn armour: the wearer moves every joint; nothing powers the limbs (hobby servos cannot move a person)",
    "wearer proportions from standard segment ratios scaled to the stated height; check against your own measurements before printing");
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Iron Man Mark 43 (${A.design.performance.tier_label}): ${pieces} printed pieces, ${(printedKg * 1.08).toFixed(1)} kg filament, motorised faceplate, $${cost.toFixed(0)} incl. filament`);
}

function invertRigid(m: Mat4): Mat4 {
  const R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t = [m[12], m[13], m[14]];
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const ti = [0, 1, 2].map((i) => -(Rt[i][0] * t[0] + Rt[i][1] * t[1] + Rt[i][2] * t[2]));
  return [Rt[0][0], Rt[1][0], Rt[2][0], 0, Rt[0][1], Rt[1][1], Rt[2][1], 0, Rt[0][2], Rt[1][2], Rt[2][2], 0, ti[0], ti[1], ti[2], 1];
}
