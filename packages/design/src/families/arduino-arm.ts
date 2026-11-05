// Arduino desk arm: the small hobby-servo arm people actually build (MeArm / SG90-arm class). A yaw servo stands in a
// printed base; a turntable bolts to its horn and holds the shoulder servo; every link is a plate screwed to the
// driving servo's horn with the next servo in a cradle at its end; a one-servo claw closes a moving jaw against a
// fixed one. No bearings or metal hardware beyond the servos' own screws: the servo output bearing carries each joint,
// which is why link lengths are searched down to what each servo holds continuously at full stretch.
// Every printed part is an exact CAD solid (@ttr/kernel). Controller: Arduino Uno clone + PCA9685 clone, 5 V supply.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, hornRadiusMm, type Vec3 } from "@ttr/parts";
import { translation, type Mat4 } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { gravityTorques, totalMass, axisInertias, type PointLoad } from "../kin.ts";
import { DYNAMIC_FACTOR, MIN_SPEED, loadedSpeed } from "../sizing.ts";
import { limitsFromGeometry } from "./legkit.ts";

export interface ArduinoArmRequest {
  name?: string; prompt?: string; budget?: number;
  /** servos allowed, weakest first (the designer picks per joint) */
  servos?: string[];
  payloadKg?: number;
  gripper?: boolean;
  /** upper arm and forearm pivot-to-pivot lengths (mm); searched when omitted */
  lengths?: [number, number];
  /** controller board (default the Uno clone; the Nano drives the PCA9685 the same way over I2C) */
  board?: "arduino_uno_clone" | "arduino_nano_clone";
}

const WALL = 2.5, PLATE = 4, EDGE = 0.6;
const body = (k: string) => part(k).bbox_mm!;
/** servo frame placed by rotation columns (x, y, z) and origin, column-major mm */
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
/** output face height above the cradle floor for a servo whose body hangs below its output (servo -z) */
const depth = (k: string) => -body(k).min[2];

interface Built { spec: RobotSpecification; A: Assembly; reach: number; tcp: { link: string; at: Vec3 }; }

function build(req: ArduinoArmRequest, keys: { yaw: string; shoulder: string; elbow: string; grip: string }, L1: number, L2: number): Built {
  const A = new Assembly(req.name ?? "arduino_arm", "arduino_arm", req.prompt), gripper = req.gripper !== false;
  // ---------------- base: footed disc + yaw servo cradle (servo vertical, output up)
  const zY = depth(keys.yaw) + WALL + 1.5;
  const Ty = place([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, zY]);
  const baseOps: Op[] = [{ op: "box", min: [-55, -45, 0], max: [55, 45, 5], r: 10 }, { op: "cradle", key: keys.yaw, T: Ty, wall: WALL }];
  for (const x of [-45, 45]) for (const y of [-35, 35]) baseOps.push({ op: "hole", a: [x, y, -1], b: [x, y, 6], d: 4.3 });   // clamp / screw to the desk
  A.cadLink("base_link", { name: "base_link", edge: EDGE, ops: baseOps }, { role: "base", material: "printed_dark" });
  A.mount("base_link", keys.yaw, Ty, "yaw_servo", "base yaw servo");

  // ---------------- turntable: horn plate on the yaw servo + riser holding the shoulder servo (axis horizontal, along +y)
  const yo = 14, hS = body(keys.shoulder).max[0] + WALL + PLATE + 2;      // shoulder output face y, axis height
  const Ts = place([0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, yo, hS]);       // servo x down, y backwards, output towards +y
  const sb = body(keys.shoulder);
  const turntable: Op[] = [
    { op: "horn", key: keys.yaw, t: PLATE, extra: 4, channel: hS + 30 },   // the shoulder cradle stands on it: centre channel, horn screws from below
    { op: "box", min: [-sb.max[1] - WALL, yo + sb.min[2] - WALL, 0], max: [-sb.min[1] + WALL, yo - 1, hS - sb.max[0] + 0.5], r: 0 },   // riser
    { op: "cradle", key: keys.shoulder, T: Ts, wall: WALL },
  ];
  A.cadLink("turntable", { name: "turntable", edge: EDGE, ops: turntable });
  A.revolute("yaw", "base_link", "turntable", Ty, keys.yaw, -Math.PI / 2, Math.PI / 2);
  A.mount("turntable", keys.shoulder, Ts, "shoulder_servo", "shoulder servo");

  // ---------------- upper arm (shoulder output frame): horn plate, beam along -x (up at zero), elbow servo cradle
  const eb = body(keys.elbow), zE = PLATE + 0.8 + depth(keys.elbow);
  const Te = translation([-L1, 0, zE]);
  const hornR = (k: string) => hornRadiusMm(k) + 4;
  const upper: Op[] = [
    { op: "horn", key: keys.shoulder, t: PLATE, extra: 4 },
    { op: "beam", a: [0, 0, PLATE / 2], b: [-L1 - eb.min[0] * 0, 0, PLATE / 2], w: Math.min(16, 2 * hornR(keys.shoulder)), h: PLATE, up: [0, 0, 1] },
    { op: "box", min: [-L1 + eb.min[0] - WALL, eb.min[1] - WALL, 0], max: [-L1 + eb.max[0] + WALL, eb.max[1] + WALL, PLATE], r: 3 },  // pad under the cradle
    { op: "cradle", key: keys.elbow, T: Te, wall: WALL },
  ];
  A.cadLink("upper_arm", { name: "upper_arm", edge: EDGE, ops: upper });
  A.revolute("shoulder", "turntable", "upper_arm", Ts, keys.shoulder, -Math.PI / 2, Math.PI / 2);
  A.mount("upper_arm", keys.elbow, Te, "elbow_servo", "elbow servo");

  // ---------------- forearm (elbow output frame): horn plate, beam, claw servo + fixed jaw at the end
  const gb = body(keys.grip), zG = PLATE + 0.8 + depth(keys.grip), Tg = translation([-L2, 0, zG]);
  const fore: Op[] = [
    { op: "horn", key: keys.elbow, t: PLATE, extra: 4 },
    { op: "beam", a: [0, 0, PLATE / 2], b: [-L2, 0, PLATE / 2], w: 14, h: PLATE, up: [0, 0, 1] },
  ];
  let tipX = -L2 - 10;
  if (gripper) {
    fore.push({ op: "box", min: [-L2 + gb.min[0] - WALL, gb.min[1] - WALL, 0], max: [-L2 + gb.max[0] + WALL, gb.max[1] + WALL, PLATE], r: 3 },
      { op: "cradle", key: keys.grip, T: Tg, wall: WALL },
      // fixed jaw: a finger standing up to the moving jaw's plane, outside the claw horn's swing, bridged to the cradle pad
      { op: "box", min: [-L2 - 52, 22.5, 0], max: [-L2 - 24, 28.5, zG + PLATE], r: 0 },
      { op: "box", min: [-L2 - 30, 5, 0], max: [-L2 - 22, 23, PLATE], r: 0 });
    tipX = -L2 - 40;
  }
  A.cadLink("forearm", { name: "forearm", edge: EDGE, ops: fore });
  A.revolute("elbow", "upper_arm", "forearm", Te, keys.elbow, -2.1, 2.1);
  let tcp = { link: "forearm", at: [tipX / 1000, 0, (gripper ? zG : PLATE) / 1000] as Vec3 };
  if (gripper) {
    A.mount("forearm", keys.grip, Tg, "claw_servo", "claw servo");
    // moving jaw on the claw servo horn, swinging in the plane z = 0..PLATE of the claw output frame
    const jaw: Op[] = [{ op: "horn", key: keys.grip, t: PLATE, extra: 3 }, { op: "box", min: [-50, 15.5, 0], max: [-6, 21.5, PLATE], r: 0 }];
    A.cadLink("claw_jaw", { name: "claw_jaw", edge: EDGE, ops: jaw }, { material: "printed_accent" });
    A.revolute("claw", "forearm", "claw_jaw", Tg, keys.grip, -0.6, 0.35);
    tcp = { link: "forearm", at: [(-L2 - 40) / 1000, 0.022, (zG + PLATE / 2) / 1000] };
  }
  const reach = (L1 + L2 + (gripper ? 40 : 10)) / 1000;
  return { spec: A.spec, A, reach, tcp };
}

/** Desk arm on hobby servos. With `lengths` omitted the longest links (10 mm steps) that pass every check are used. */
export function designArduinoArm(req: ArduinoArmRequest = {}): RobotSpecification {
  const pool = req.servos ?? ["hobby_sg90"], payload = req.payloadKg ?? 0.02;
  const pick = (needNm: number) => pool.find((k) => rating(k).rated_nm >= needNm && rating(k).peak_nm >= needNm * DYNAMIC_FACTOR) ?? pool[pool.length - 1];
  const tries: [number, number][] = req.lengths ? [req.lengths] : [];
  if (!req.lengths) for (let L = 120; L >= 50; L -= 10) tries.push([L, L]);
  let best: { b: Built; worst: Record<string, number>; keys: Record<string, string>; ok: boolean } | undefined;
  for (const [L1, L2] of tries) {
    // size joint by joint: start from the weakest servo, grow where the load needs it (a bigger servo is heavier: repeat)
    let keys = { yaw: pool[0], shoulder: pool[0], elbow: pool[0], grip: pool[0] };
    let b = build(req, keys, L1, L2), worst: Record<string, number> = {};
    for (let it = 0; it < 4; it++) {
      const loads: PointLoad[] = [{ link: b.tcp.link, at: b.tcp.at, massKg: payload }];
      worst = {};
      // stretched out forwards and sideways at every shoulder / elbow combination that matters
      for (const sh of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) for (const el of [0, Math.PI / 2, -Math.PI / 2]) {
        for (const [k, v] of Object.entries(gravityTorques(b.spec, { shoulder: sh, elbow: el }, loads))) worst[k] = Math.max(worst[k] ?? 0, Math.abs(v));
      }
      const next = { yaw: keys.yaw, shoulder: pick(worst.shoulder ?? 0), elbow: pick(worst.elbow ?? 0), grip: keys.grip };
      if (next.shoulder === keys.shoulder && next.elbow === keys.elbow) break;
      keys = next; b = build(req, keys, L1, L2);
    }
    const ok = (["shoulder", "elbow"] as const).every((j) => rating(keys[j]).rated_nm >= (worst[j] ?? 0) && rating(keys[j]).peak_nm >= (worst[j] ?? 0) * DYNAMIC_FACTOR);
    best = { b, worst, keys, ok };
    if (ok) break;
  }
  const { b, worst, keys } = best!, A = b.A;

  // joint ranges from the geometry (nothing may collide through the range), then the checks
  limitsFromGeometry(A, ["yaw", "shoulder", "elbow"], [{ shoulder: -1.2, elbow: 1.5 }, { shoulder: 1.2, elbow: -1.5 }]);
  // joint speed limits: the speed each servo reaches carrying its load (not its no-load speed)
  const inertia = axisInertias(A.spec, { shoulder: 0, elbow: 0 }, [{ link: b.tcp.link, at: b.tcp.at, massKg: payload }]);
  for (const j of ["shoulder", "elbow"] as const) {
    const v = loadedSpeed(keys[j], worst[j] ?? 0, inertia[j] ?? 0), jt = A.spec.joints.find((x) => x.name === j)!;
    jt.limit!.velocity = +Math.max(v, 0.05).toFixed(3);
    A.check(`speed:${j}`, v >= MIN_SPEED, `${v.toFixed(2)} rad/s carrying the arm and payload (needs >= ${MIN_SPEED} rad/s)`);
  }
  for (const j of ["shoulder", "elbow"] as const) {
    const k = keys[j], r = rating(k), w = worst[j] ?? 0;
    A.design.joints.push({ joint: j, actuator: k, required_nm: +(w * DYNAMIC_FACTOR).toFixed(4), rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: +(r.peak_nm / Math.max(w * DYNAMIC_FACTOR, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: `worst static ${w.toFixed(4)} N·m, arm stretched with ${payload} kg` });
    A.check(`torque:${j}`, r.rated_nm >= w && r.peak_nm >= w * DYNAMIC_FACTOR, `holds ${w.toFixed(4)} N·m continuously (rated ${r.rated_nm}), peaks ${(w * DYNAMIC_FACTOR).toFixed(4)} N·m (stall ${r.peak_nm}) — ${part(k).name.split(" (")[0]}`);
  }
  // electronics: Arduino + PCA9685 on the desk next to the arm; servos on their own 5 V rail
  const servos = Object.values(keys).slice(0, req.gripper === false ? 3 : 4);
  const stall = servos.reduce((s, k) => s + Number(part(k).specs.stall_current_a ?? 1), 0), supplyA = stall <= 4 ? 4 : 10;
  A.buy(req.board ?? "arduino_uno_clone", 1, "controller (USB serial commands, I2C to the servo driver)");
  A.buy("pca9685_clone", 1, "16-channel PWM servo driver (I2C)");
  if (supplyA === 4) { A.buy("psu_5v4a_adapter", 1, "5 V 4 A servo supply"); A.buy("dc_jack_5521_panel", 1, "adapter socket"); }
  else A.buy("psu_5v_lrs50", 1, "5 V 10 A servo supply");
  A.check("power:supply", stall <= supplyA, `all ${servos.length} servos stalled together draw ${stall.toFixed(1)} A of the ${supplyA} A 5 V supply`);
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 2 * servos.length);
  A.fastener("M4 screws or desk clamps (base)", 4);
  const bom = A.bom();
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  const m = totalMass(A.spec);
  A.design.performance = { reach_m: +b.reach.toFixed(3), payload_kg: payload, mass_kg: +m.toFixed(3), cost_usd: bom.cost_usd, dof: 3, gripper: req.gripper !== false ? "one-servo claw" : "none",
    servos: [...new Set(servos.map((k) => part(k).name.split(" (")[0]))].join(" / ") };
  A.design.tcp = { link: b.tcp.link, xyz: b.tcp.at };
  A.design.home = { shoulder: 0.6, elbow: 1.2 };
  A.design.assumptions.push("each joint runs on its servo's own output bearing (no extra bearings), as in MeArm-class kits: links are kept short so the servo holds them continuously",
    "prices are typical single-unit marketplace prices and vary by seller");
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Arduino desk arm: 3 DOF${req.gripper !== false ? " + claw" : ""}, ${Math.round(b.reach * 1000)} mm reach, ${payload * 1000} g payload, ${m.toFixed(2)} kg, $${bom.cost_usd.toFixed(0)} of parts`);
}
