// Small four-legged walker on eight micro servos (the classic "SG90 quadruped"): a hip servo stands at each corner of a
// printed body with its horn up; a thigh on the horn reaches out to the knee servo, whose horn carries the shin down to a
// rubber-tipped foot. The board, servo driver, regulator and battery ride in a compartment between the hips.
// Creep gait: one leg lifts at a time, so three feet always carry the body.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, electrical, type Vec3 } from "@ttr/parts";
import { mul, translation, type Mat4 } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { totalMass, comWorld, pointWorld } from "../kin.ts";
import { DYNAMIC_FACTOR } from "../sizing.ts";
import { withSolids, interferences } from "../clearance.ts";
import { bay, enclosureChecks, type BayPart, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { item, packBest, placeT, roomForSwitch, switchColumn, CY_BAY, type Item } from "./parts-car.ts";
import { boardProfile, PinPlan, regulatorFor, type FirmwareRecord } from "./parts-pins.ts";

export interface WalkerRequest { name?: string; prompt?: string; budget?: number; board?: string; servoCounts?: Record<string, number>; battery?: string; servoDriver?: string; }

const PLATE = 4, WALL = 2.5, LT = 42, BB = "breadboard_400", END = 11;
const bbox = (k: string) => part(k).bbox_mm!;
const plugIn = (k: string) => bbox(k).min[2] < -3 && !part(k).holes.some((h) => h.axis[2] < -0.5);
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
const rotZ = (a: number): Mat4 => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };

export function designServoWalker(req: WalkerRequest = {}): RobotSpecification {
  const board = req.board ?? "arduino_nano_clone", battery = req.battery ?? "pack_2s_18650", drvKey = req.servoDriver ?? "pca9685_clone";
  const counts = req.servoCounts ?? { hobby_mg90s: 4, hobby_sg90: 4 };
  // knees carry the body: the strongest four go there
  const servos = Object.entries(counts).flatMap(([k, q]) => Array(q).fill(k) as string[]).sort((a, b) => rating(b).rated_nm - rating(a).rated_nm);
  const knees = servos.slice(0, 4), hips = servos.slice(4, 8);
  const bp = boardProfile(board), A = new Assembly(req.name ?? "servo_walker", "servo_walker", req.prompt);
  const pv = electrical(battery)!.voltage_v.v, needBuck = pv.max > 6.3;

  // ---------------- compartment contents and the body around them
  const items: Item[] = [item("battery", battery, part(battery).name.split(":")[0], "battery")];
  // the servo regulator carries all eight servos running and two at their peak
  const sc = servos.map((k) => electrical(k)!.current_a.v), reg = regulatorFor(sc.reduce((a, r) => a + r.typical, 0), sc.reduce((a, r) => a + r.typical, 0) + 2 * Math.max(...sc.map((r) => r.peak - r.typical)));
  if (needBuck) items.push(item("servo_regulator", reg.key, `${reg.label} for the servos`, "board", 4));
  if (drvKey !== "direct") items.push(item("servo_driver", drvKey, "16-channel servo driver (I2C)", "board", 4));
  if (plugIn(board)) { const it = item("breadboard", BB, "plug-in wiring for the board", "plain"); it.carried = [{ name: "controller", key: board, use: "controller (runs the generated gait)", at: [4, 31] }]; items.push(it); }
  else items.push(item("controller", board, "controller (runs the generated gait)", "board", 5));
  const P = packBest(items); roomForSwitch(P);
  const CY = CY_BAY, CL = P.length + 2 * END;
  const FLOOR = 2.4, CH = Math.max(26, Math.ceil(Math.max(...items.map((i) => i.H + (i.carried ? 8.5 + bbox(board).max[2] : 0))) + 8));
  const ZB = 24;                                    // body underside above the ground
  // hips at the four corners with their legs out to the sides: the servo's short end (output side) against the compartment
  const hb = bbox(hips[0]), hy = CY + 2 + hb.max[0] + WALL + 8, hx = CL / 2 - (hb.max[1] - hb.min[1]) / 2 - WALL;
  const zo = ZB + PLATE + 2 - hb.min[2] + WALL;     // hip output face height
  const corners: { tag: string; x: number; y: number; a: number }[] = [
    { tag: "front_left", x: hx, y: hy, a: Math.PI / 2 }, { tag: "front_right", x: hx, y: -hy, a: -Math.PI / 2 },
    { tag: "rear_left", x: -hx, y: hy, a: Math.PI / 2 }, { tag: "rear_right", x: -hx, y: -hy, a: -Math.PI / 2 }];
  // ---------------- body plate with the four hip cradles; each hip servo's body points out along its leg, output inboard
  const body: Op[] = [];
  const reach = -hb.min[0] + WALL + 2;
  const pmin: Vec3 = [-CL / 2 - 6, -hy - reach, ZB], pmax: Vec3 = [CL / 2 + 6, hy + reach, ZB + PLATE];
  const hipT: Mat4[] = [];
  for (const c of corners) {
    const T = mul(translation([c.x, c.y, zo]), rotZ(c.a + Math.PI));    // servo x points inboard, so its body lies outboard
    hipT.push(T);
    body.push({ op: "at", T: mul(translation([c.x, c.y, 0]), rotZ(c.a + Math.PI)), of: [{ op: "box", min: [hb.min[0] - WALL, hb.min[1] - WALL, ZB + PLATE - 0.5], max: [hb.max[0] + WALL, hb.max[1] + WALL, zo + hb.min[2] - WALL + 0.2], r: 2 }] } as Op);
    body.push({ op: "cradle", key: hips[corners.indexOf(c)], T, wall: WALL });
  }
  body.unshift({ op: "box", min: pmin, max: pmax, r: 10 });
  A.cadLink("base_link", { name: "base_link", edge: 0.8, ops: body }, { role: "base", material: "printed_dark" });

  // ---------------- legs
  const kb = bbox(knees[0]), footR = 6, KZ = PLATE + 0.5 + kb.max[0];
  const R180: Mat4 = rotZ(Math.PI);
  const hipJ: string[] = [], kneeJ: string[] = [], feet: string[] = [];
  corners.forEach((c, i) => {
    A.mount("base_link", hips[i], hipT[i], `${c.tag}_hip_servo`, "hip servo (swings the leg forward and back)");
    // thigh, drawn in a leg frame (+x out along the leg) and turned into the hip output frame (x inboard)
    // knee output along +y of the leg; the servo stands on the thigh pad, its axis above it
    const kneeT: Mat4 = place([0, 0, -1], [-1, 0, 0], [0, 1, 0], [LT, 0, KZ]);
    const thigh: Op[] = [{ op: "beam", a: [0, 0, PLATE / 2], b: [LT - 9, 0, PLATE / 2], w: 14, h: PLATE, up: [0, 0, 1] },
      { op: "box", min: [LT - 12, kb.min[2] - WALL, 0], max: [LT + 12, -1, PLATE], r: 2 }, { op: "cradle", key: knees[i], T: kneeT, wall: WALL }];
    A.cadLink(`${c.tag}_thigh`, { name: `${c.tag}_thigh`, edge: 0.6, ops: [{ op: "horn", key: hips[i], t: PLATE, extra: 4 }, { op: "at", T: R180, of: thigh } as Op] }, { material: "printed_accent" });
    A.revolute(`${c.tag}_hip`, "base_link", `${c.tag}_thigh`, hipT[i], hips[i], -0.6, 0.6);
    const Tk = mul(R180, kneeT);
    A.mount(`${c.tag}_thigh`, knees[i], Tk, `${c.tag}_knee_servo`, "knee servo (lifts the leg)");
    // shin in the knee output frame: +x points down to the foot
    const Ls = zo + KZ - footR;
    const shin: Op[] = [{ op: "horn", key: knees[i], t: PLATE, extra: 3 }, { op: "beam", a: [0, 0, PLATE / 2], b: [Ls, 0, PLATE / 2], w: 10, h: PLATE, up: [0, 0, 1] }, { op: "sphere", c: [Ls, 0, PLATE / 2], r: footR }];
    A.cadLink(`${c.tag}_shin`, { name: `${c.tag}_shin`, edge: 0.6, ops: shin }, { material: "printed_accent" });
    A.revolute(`${c.tag}_knee`, `${c.tag}_thigh`, `${c.tag}_shin`, Tk, knees[i], -0.8, 0.8);
    A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 4);
    A.fastener("rubber foot cap 12 mm (or a dab of hot glue)", 1);
    hipJ.push(`${c.tag}_hip`); kneeJ.push(`${c.tag}_knee`); feet.push(`${c.tag}_shin`);
    void Ls;
  });

  // ---------------- compartment
  const H = new Harness(A);
  const posOf = (n: string) => { const c = P.cols.find((c) => c.items.some((e) => e.it.name === n))!, e = c.items.find((x) => x.it.name === n)!; return { x: END + c.x0 + (c.L - e.it.L) / 2, y: e.y0 + CY }; };
  const parts: BayPart[] = items.map((it) => { const p = posOf(it.name); return { name: it.name, key: it.key, T: placeT(it, p.x, p.y, it.standoff), use: it.use, kind: it.kind, ...(it.kind === "board" ? {} : { standoff: false }) }; });
  const ci = items.find((i) => i.name === (plugIn(board) ? "breadboard" : "controller"))!, cp = posOf(ci.name);
  const exits: ExitSpec[] = [{ id: "usb", face: "y-", u: cp.x + ci.L / 2, v: 10, kind: "usb", w: 14, h: 10 },
    { id: "switch", face: "y+", u: END + switchColumn(P).x0 + Math.max(switchColumn(P).L, 18) / 2, v: CH / 2, kind: "switch", w: 19.2, h: 13, part: { name: "main_switch", key: "switch_kcd1", use: "main power switch" } },
    { id: "front_leads", face: "x+", u: CY, v: CH - 8, kind: "grommet", d: 8, noAnchor: true }, { id: "rear_leads", face: "x-", u: CY, v: CH - 8, kind: "grommet", d: 8, noAnchor: true }];
  bay(A, { name: "electronics_bay", parent: "base_link", T: translation([-CL / 2, -CY, ZB + PLATE + FLOOR]), size: [CL, 2 * CY, CH], cad: true, corner: 5, floor: FLOOR, wall: 2, lidT: 2.2, material: "printed_dark", lidMaterial: "printed_accent", parts, exits,
    vents: [{ face: "lid", a0: 8, a1: CL - 8, b0: 14, b1: 2 * CY - 14 }] }, H);
  const it = items.find((i) => i.carried);
  for (const c of it?.carried ?? []) { A.mount("breadboard", c.key, translation([c.at[0], c.at[1], 8.5]), c.name, c.use); H.bayOf.set(c.name, "electronics_bay"); }

  // ---------------- wiring: battery -> switch -> (LM2596) -> servo rail; board from the battery (VIN) or USB
  const pins = new PinPlan(bp, true), fw: FirmwareRecord = { board, fqbn: bp.fqbn, language: bp.language, mission: "walker", sensors: {}, servos: {}, notes: [] };
  H.mainPower("VBAT", { source: "battery", pos: "@power", neg: "@ground", sw: "main_switch", fuse: electrical(battery)!.current_a.v.peak > 5, simultaneous: 4, simNote: "two servos at their peak, the rest holding (the gait moves one joint at a time)" });
  let servoRail = "VBAT";
  if (needBuck) { H.spare(...reg.spare.map((x) => `servo_regulator.${x}`)); H.regulator("servo_regulator", "VBAT", "5V_SERVO", { ...reg.pins, volts: 5, simultaneous: 4, simNote: "two servos at their peak, the rest holding (the gait moves one joint at a time)" }); servoRail = "5V_SERVO"; }
  const logic = bp.io === 5 && pv.min >= bp.minIn ? bp.powerFrom(H, "VBAT") : (() => { H.rail("USB_5V", { source: "controller", out: bp.io === 5 ? "5V" : bp.logicPin, gnd: bp.gnd, volts: bp.io, cont: 0.45, peakLimit: 0.5 }); return "USB_5V"; })();
  if (logic === "USB_5V") fw.notes.push(`the ${part(board).name.split(" (")[0]} runs from USB or a power bank; the battery feeds only the servos`);
  H.spare("controller.janalog.VIN", "controller.power_jack", "controller.j2_analog_side.VIN", "controller.header_left.VIN", "controller.jpower.VIN");
  const names = corners.flatMap((c) => [`${c.tag}_hip_servo`, `${c.tag}_knee_servo`]);
  if (drvKey !== "direct") {
    H.feed(servoRail, "servo_driver", { v: "v_plus.V+", g: "v_plus.GND", typ: 0.01, peak: 0.01 });
    H.feed(logic, "servo_driver", { v: "control_in.VCC", g: "control_in.GND", typ: 0.01, peak: 0.01 });
    const [sda, scl] = pins.i2c(); H.signals("controller", "servo_driver", [[sda, "SDA", "I2C_SDA"], [scl, "SCL", "I2C_SCL"]]);
    fw.servo_driver = { key: drvKey, sda, scl, address: "0x40" };
  }
  names.forEach((s, ch) => {
    const r = H.rec(s).current_a.v, key = H.instances.get(s)!.key, joint = s.replace(/_servo$/, "");
    if (drvKey === "direct") { H.feed(servoRail, s, { v: "@power", g: "@ground" }); const p = pins.servo(); H.signals("controller", s, [[p, "@pwm"]]); fw.servos[joint] = { pin: p, key, centre_deg: 90, range_deg: [55, 125] }; }
    else {
      const d = H.rails.get(servoRail)!.feeds.find((f) => f.inst === "servo_driver")!; d.typ += r.typical; d.peak += r.peak;
      H.net(`SERVO${ch}_PWM`, "signal"); H.net(`SERVO${ch}_V`, "power", 5);
      H.wire(`SERVO${ch}_PWM`, `servo_driver.ch${ch}.PWM${ch}`, `${s}.@pwm`); H.wire(`SERVO${ch}_V`, `servo_driver.ch${ch}.V+`, `${s}.@power`, { typ: r.typical, peak: r.peak }); H.wire("GND", `servo_driver.ch${ch}.GND`, `${s}.@ground`, { typ: r.typical, peak: r.peak });
      fw.servos[joint] = { pin: `PCA9685 ch${ch}`, channel: ch, key, centre_deg: 90, range_deg: [55, 125] };
    }
  });
  // the gait moves one joint at a time: at most two servos at their peak together (the one moving and one starting), the rest at their running current
  if (drvKey !== "direct") { const d = H.rails.get(servoRail)!.feeds.find((f) => f.inst === "servo_driver")!, pk = names.map((n) => H.rec(n).current_a.v).sort((a, b) => b.peak - a.peak); d.peak = +(0.01 + pk.slice(0, 2).reduce((s, r) => s + r.peak, 0) + pk.slice(2).reduce((s, r) => s + r.typical, 0)).toFixed(3); }
  if (logic === "USB_5V") H.wire("GND", `controller.${bp.gnd}`, "battery.@ground", { typ: 0.01 });
  H.notes.push("Servo leads leave the compartment by the grommets at the front and the back, two legs each side.");
  finishWiring(H);
  enclosureChecks(A);

  // ---------------- checks: standing and stepping on three legs, clearance at home
  const carried = new Set(["battery", "main_switch", "breadboard", "controller", "servo_regulator", "servo_driver"]);
  const skip = new Set<string>();
  for (const j of A.spec.joints) if (j.type === "fixed" && carried.has(j.child)) skip.add(`${j.parent}|${j.child}`);
  const hits = withSolids(A.spec, (mdl) => interferences(mdl, {}, undefined, 2, skip));
  A.check("clearance:home", hits.length === 0, hits.length ? `intersecting: ${hits.map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no printed part or component intersects another");
  const m = totalMass(A.spec), g = 9.81;
  // feet on the ground at home
  const footZ = feet.map((f) => pointWorld(A.spec, {}, f, [(zo + KZ - footR) / 1000, 0, PLATE / 2000])[2]);
  A.check("stance:feet", footZ.every((z) => Math.abs(z - footR / 1000) < 0.004), `feet ${footZ.map((z) => (z * 1000).toFixed(1)).join(", ")} mm up (foot radius ${footR} mm): the body stands level on all four`);
  // three feet carry the body while one leg swings; the knee holds the shin at up to 0.5 rad from vertical
  const Ls = (zo + KZ - footR) / 1000, F = (m * g) / 3, kneeNm = F * Ls * Math.sin(0.2), hipNm = 0.5 * F * (LT / 1000);
  const kr = rating(knees[0]), hr = rating(hips[0]);
  A.check("torque:knee", kneeNm <= kr.rated_nm && kneeNm * DYNAMIC_FACTOR <= kr.peak_nm, `${(m).toFixed(2)} kg on three feet: ${kneeNm.toFixed(4)} N·m at a knee with the shin 0.2 rad off vertical (stance: the hips swing the legs, the knees only lift them) (rated ${kr.rated_nm}, stall ${kr.peak_nm} N·m, ${part(knees[0]).name.split(" (")[0]})`);
  A.check("torque:hip", hipNm <= hr.rated_nm, `dragging a loaded foot (friction 0.5): ${hipNm.toFixed(4)} N·m at a hip vs ${hr.rated_nm} N·m rated (${part(hips[0]).name.split(" (")[0]})`);
  for (const [j, k, need] of [...hipJ.map((j, i) => [j, hips[i], hipNm] as const), ...kneeJ.map((j, i) => [j, knees[i], kneeNm] as const)]) {
    const r = rating(k);
    A.design.joints.push({ joint: j, actuator: k, required_nm: +(need * DYNAMIC_FACTOR).toFixed(4), rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: +(r.peak_nm / Math.max(need * DYNAMIC_FACTOR, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: "creep gait, three feet down" });
  }
  const com = comWorld(A.spec, {}), sup = corners.map((c) => [c.x / 1000 + Math.cos(c.a) * LT / 1000, c.y / 1000 + Math.sin(c.a) * LT / 1000]);
  const inner = Math.min(...sup.map((p) => Math.abs(p[1]))) - Math.abs(com[1]);
  A.check("stability:com", inner > 0.02, `centre of mass ${(com[0] * 1000).toFixed(0)}, ${(com[1] * 1000).toFixed(0)} mm; feet ${Math.round(Math.min(...sup.map((p) => Math.abs(p[1]))) * 1000)} mm out to the side: the gait shifts the body over the three feet before each step`);
  const bom = A.bom(); bom.cost_usd = +(bom.cost_usd + (A.design.wiring?.cost_usd ?? 0)).toFixed(2);
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  const step = 2 * LT / 1000 * Math.sin(0.44), cycle = 8 * (0.7 / hr.speed_rad_s + 0.3);
  A.design.performance = { mission: "four-legged walker", legs: 4, servos: 8, mass_kg: +m.toFixed(3), speed_m_s: +(step / cycle).toFixed(3), cost_usd: bom.cost_usd, controller: part(board).name };
  A.design.assumptions.push("creep gait: one leg in the air at a time, the body shifted over the other three first; the shins stay within 0.2 rad of vertical while they carry the body", "speeds from the servo datasheet no-load speed with 0.3 s settling per move", "prices are typical single-unit marketplace prices and vary by seller");
  (A.design as { firmware?: FirmwareRecord }).firmware = fw;
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Four-legged walker on ${servos.length} micro servos: ${m.toFixed(2)} kg, about ${(step / cycle * 100).toFixed(1)} cm/s, ${part(board).name.split(" (")[0]}${drvKey !== "direct" ? " + PCA9685" : ""}, $${bom.cost_usd.toFixed(0)} of parts`);
}
