// Cartesian (XYZ) robot built from three printed linear modules, the cheap way such robots are built from bought
// "linear modules": each module is two hardened 8 mm rods between printed end blocks, a carriage on LM8UU bushings
// driven by a NEMA17 through a 5-to-8 mm coupler and a Tr8x8 lead screw (608 bearing at the far end).
// The Y module lies on the bench; the X module stands on the Y carriage by its end block (a cantilever, as in
// cantilever-type Cartesian robots); the Z module hangs from the X carriage with the tool plate on its carriage.
// An ESP32-S3 runs three TMC2209 drivers from a 24 V supply in a printed control case; each axis homes on a switch.
//
// Checks: the thrust each screw gives against the load it moves (mass x acceleration + friction, + weight on Z),
// screw speed, Z holding against back-drive, the cantilevered X rods' deflection, resolution, supply power.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, } from "@ttr/parts";
import { frame, mul, translation, invert, apply, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass, descendants } from "../kin.ts";
import { controlCase, enclosureChecks, } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { withSolids, interferences } from "../clearance.ts";
import { recordCost, mountSensors, type DesignRequest } from "./common.ts";

export interface GantryRequest extends DesignRequest {
  /** tool on the Z carriage: a pen clamp (plotting, drawing) or a plain tool plate (default) */
  tool?: "pen" | "plate";
}

const MOTOR = "nema17_42x40", DRIVER = "tmc2209_stepstick";
const ROD_GAP = 25;            // rods at local y = +-25
const BLOCK = { x0: -22, x1: 22, y0: -36, y1: 36 };
const CARRIAGE_TOP = 19;       // carriage mounting face, local x
const G = 9.81;
const DYN = { accel: 1.0, frictionN: 3, speedMm: 40 };    // design move: 1 m/s^2, bushing + seal friction, 40 mm/s cruise

interface Module { name: string; W: Mat4; rods: string; screw: string; L: number; carLen: number; zMin: number; zMax: number; bushings: number; }
/** Rod, screw and carriage layout of a module along its local +z. */
function layout(rods: string, screw: string, carLen: number): Omit<Module, "name" | "W"> {
  const L = Number(part(rods).bbox_mm!.max[2]);
  const zB0 = 6 + L - 10;
  // home: the lead nut's flange clear of the coupler (11-36 mm)
  return { rods, screw, L, carLen, zMin: 41, zMax: zB0 - carLen - 2, bushings: carLen >= 60 ? 2 : 1 };
}

const endAOps = (): Op[] => {
  const ops: Op[] = [{ op: "box", min: [BLOCK.x0, BLOCK.y0, 0], max: [BLOCK.x1, BLOCK.y1, 16], r: 3 }];
  for (const s of [-1, 1]) ops.push({ op: "hole", a: [0, s * ROD_GAP, 6], b: [0, s * ROD_GAP, 17], d: 8.4 }, { op: "hole", a: [-23, s * ROD_GAP, 11], b: [-12, s * ROD_GAP, 11], d: 2.9 });
  ops.push({ op: "hole", a: [0, 0, -1], b: [0, 0, 17], d: 23 });                      // motor boss, coupler
  for (const [x, y] of [[15.5, 15.5], [15.5, -15.5], [-15.5, 15.5], [-15.5, -15.5]]) ops.push({ op: "hole", a: [x, y, -1], b: [x, y, 17], d: 3.4 });
  return ops;
};
const endBOps = (z0: number, z1: number, zBear: number): Op[] => {
  const ops: Op[] = [{ op: "box", min: [BLOCK.x0, BLOCK.y0, z0], max: [BLOCK.x1, BLOCK.y1, z1], r: 3 }];
  for (const s of [-1, 1]) ops.push({ op: "hole", a: [0, s * ROD_GAP, z0 - 1], b: [0, s * ROD_GAP, z0 + 10], d: 8.4 }, { op: "hole", a: [-23, s * ROD_GAP, z0 + 5], b: [-12, s * ROD_GAP, z0 + 5], d: 2.9 });
  ops.push({ op: "hole", a: [0, 0, z0 - 1], b: [0, 0, z1 + 1], d: 10 }, { op: "hole", a: [0, 0, zBear - 3.6], b: [0, 0, z1 + 1], d: 22.15 });   // screw clearance, 608 pocket from the far side
  return ops;
};
/** Carriage at local z from 0 to len: LM8UU pockets round both rods, the nut bore, a mounting face at x = CARRIAGE_TOP. */
function carriageOps(len: number, bushings: number): Op[] {
  const ops: Op[] = [{ op: "box", min: [-13, -38, 0], max: [CARRIAGE_TOP, 38, len], r: 3 }];
  const zs = bushings === 2 ? [13, len - 13] : [len / 2];
  for (const s of [-1, 1]) {
    ops.push({ op: "hole", a: [0, s * ROD_GAP, -1], b: [0, s * ROD_GAP, len + 1], d: 9 });
    for (const z of zs) ops.push({ op: "hole", a: [0, s * ROD_GAP, z - 12.1], b: [0, s * ROD_GAP, z + 12.1], d: 15.1 });
  }
  ops.push({ op: "hole", a: [0, 0, -1], b: [0, 0, len + 1], d: 10.6 });
  for (const [x, y] of [[5.66, 5.66], [-5.66, 5.66], [-5.66, -5.66], [5.66, -5.66]]) ops.push({ op: "hole", a: [x, y, -1], b: [x, y, 12], d: 2.9 });
  // four M4 heat-set inserts in the mounting face for whatever rides on the carriage
  for (const [y, z] of [[-24, 10], [24, 10], [-24, len - 10], [24, len - 10]]) ops.push({ op: "hole", a: [CARRIAGE_TOP - 8, y, z], b: [CARRIAGE_TOP + 1, y, z], d: 5.6 });
  return ops;
}

/** Build one module on `parent` at module frame W (world mm): blocks, rods, motor, coupler, screw, bearing, and its carriage on a prismatic joint. */
function module(A: Assembly, m: Module, parent: string, parentW: Mat4, axisName: string, end: string, force: number, speed: number): { carriage: string; carW: Mat4 } {
  const rel = (T: Mat4) => mul(invert(parentW), mul(m.W, T));
  // motor face on the block's underside; shaft (23 mm) 12 mm into the coupler, screw 12 mm into its other end, its far end in the 608
  const zB0 = 6 + m.L - 10, zScrew = 11 + 13, screwEnd = zScrew + Number(part(m.screw).bbox_mm!.max[2]), zBear = screwEnd - 4.5, zB1 = Math.max(zB0 + 22, zBear + 3.5);
  A.printedLink(`${m.name}_end_a`, { name: `${m.name}_end_a`, ops: [{ op: "at", T: rel(translation([0, 0, 0])), of: endAOps() }] }, { material: "printed_dark" });
  A.fixed(`${m.name}_end_a_mount`, parent, `${m.name}_end_a`, translation([0, 0, 0]));
  A.printedLink(`${m.name}_end_b`, { name: `${m.name}_end_b`, ops: [{ op: "at", T: rel(translation([0, 0, 0])), of: endBOps(zB0, zB1, zBear) }] }, { material: "printed_dark" });
  A.fixed(`${m.name}_end_b_mount`, parent, `${m.name}_end_b`, translation([0, 0, 0]));
  for (const s of [-1, 1]) A.mount(parent, m.rods, rel(translation([0, s * ROD_GAP, 6])), `${m.name}_rod_${s > 0 ? "a" : "b"}`, `${axisName} guide rods`, "metal");
  A.mount(parent, MOTOR, rel(frame([0, 0, 0], [0, 0, 1], [0, 1, 0])), `${axisName}_motor`, `${axisName} axis motor`);
  A.mount(parent, "coupler_5x8", rel(translation([0, 0, 11])), `${m.name}_coupler`, "motor to lead screw", "metal");
  A.mount(parent, m.screw, rel(translation([0, 0, zScrew])), `${m.name}_screw`, `${axisName} lead screw`, "metal");
  A.mount(parent, "bearing_608zz", rel(translation([0, 0, zBear])), `${m.name}_bearing`, "lead screw end bearing", "metal");
  // the home switch lies on the end block's top face and reaches back over the motor; the carriage's lug strikes its lever
  A.mount(parent, "endstop_microswitch", rel(frame([BLOCK.x1, -8, -24], [1, 0, 0], [0, 0, 1])), `${axisName}_endstop`, `${axisName} home switch`);
  // the carriage: printed body, bushings, nut; its frame at the bottom of its travel
  const carW = mul(m.W, translation([0, 0, m.zMin]));
  const car = `${m.name}_carriage`;
  A.printedLink(car, { name: car, ops: carriageOps(m.carLen, m.bushings) }, { material: "printed_accent" });
  const j = A.prismatic(`${axisName}_axis`, parent, car, mul(invert(parentW), carW), 0, (m.zMax - m.zMin) / 1000, +force.toFixed(0), +speed.toFixed(3), [0, 0, 1]);
  j.dynamics = { damping: 20, friction: DYN.frictionN };
  const zs = m.bushings === 2 ? [13, m.carLen - 13] : [m.carLen / 2];
  for (const s of [-1, 1]) for (const z of zs) A.mount(car, "lm8uu", translation([0, s * ROD_GAP, z]), `${m.name}_bushing_${s > 0 ? "a" : "b"}${z === zs[0] ? 1 : 2}`, `${axisName} carriage bushings`, "metal");
  A.mount(car, "leadnut_t8_brass", translation([0, 0, 0]), `${m.name}_nut`, `${axisName} lead nut`, "metal");
  A.fastener("M3 x 12 self-tapping (lead nut)", 4);
  void end;
  return { carriage: car, carW };
}

/** Pen clamp on the Z carriage face: a plate on the four inserts and an arm past the carriage's lower end holding the pen upright. */
const penOps = (len: number): Op[] => [
  { op: "box", min: [0, -30, 0], max: [6, 30, len], r: 2 },
  { op: "box", min: [0, -10, len - 4], max: [22, 10, len + 26], r: 2 },
  { op: "hole", a: [14, 0, len - 5], b: [14, 0, len + 27], d: 12.5 },
  { op: "hole", a: [14, -11, len + 12], b: [14, -5, len + 12], d: 2.9 },
  ...[[-24, 10], [24, 10], [-24, len - 10], [24, len - 10]].map(([y, z]): Op => ({ op: "hole", a: [-1, y, z], b: [7, y, z], d: 4.4 })),
];

export function designGantry(req: GantryRequest = {}): RobotSpecification {
  const A = new Assembly(req.name ?? "cartesian_gantry", "gantry_xyz", req.prompt);
  A.design.request = { ...req } as Record<string, unknown>;
  const payload = Math.max(0, req.payloadKg ?? 0.2), tool = req.tool ?? "plate";
  A.frameLink("base_link", "base"); A.spec.root = "base_link";
  const I = translation([0, 0, 0]);
  const scr = part("leadscrew_t8x8_300").specs, lead = Number(scr.lead_mm) / 1000, eta = Number(scr.efficiency), etaBack = Number(scr.backdrive_efficiency);
  const r = rating(MOTOR), Fmax = (2 * Math.PI * eta * r.rated_nm) / lead, vmax = (r.speed_rad_s * lead) / (2 * Math.PI);

  // Y module flat on the bench along +y (local x = up); X module on the Y carriage along +x; Z module hanging from the X carriage, local z down
  const Y: Module = { name: "y_module", W: frame([0, -170, 22], [0, 1, 0], [0, 0, 1]), ...layout("rod_8mm_h8_300", "leadscrew_t8x8_300", 70) };
  const y = module(A, Y, "base_link", I, "y", "front", Fmax, vmax);
  // X module: its end A on an adapter plate bolted to the Y carriage top (world z = 22 + 19 = 41)
  const yTop = 22 + CARRIAGE_TOP, xW = frame([0, -170 + Y.zMin + Y.carLen / 2, yTop + 22 + 4], [1, 0, 0], [0, 0, 1]);
  const X: Module = { name: "x_module", W: xW, ...layout("rod_8mm_h8_300", "leadscrew_t8x8_300", 70) };
  // the adapter: a plate on the Y carriage face carrying the X end block (bolted with four M4 into the carriage inserts)
  const adW = y.carW, ad: Op[] = [{ op: "at", T: invert(adW), of: [{ op: "box", min: [-45, -170 + Y.zMin, yTop], max: [30, -170 + Y.zMin + Y.carLen, yTop + 4], r: 3 },
    ...[[-24, 10], [24, 10], [-24, Y.carLen - 10], [24, Y.carLen - 10]].map(([xx, zz]): Op => ({ op: "hole", a: [xx, -170 + Y.zMin + zz, yTop - 1], b: [xx, -170 + Y.zMin + zz, yTop + 5], d: 4.4 }))] }];
  A.printedLink("x_adapter", { name: "x_adapter", ops: ad }, { material: "printed" });
  A.fixed("x_adapter_mount", y.carriage, "x_adapter", I);
  A.fastener("M4 x 12 socket head (adapter to Y carriage)", 4);
  const x = module(A, X, y.carriage, y.carW, "x", "left", Fmax, vmax);
  // Z module: hangs from the X carriage face (world +z face at x carriage) on a bracket, its local z pointing down
  const xTop = (apply(x.carW, [CARRIAGE_TOP, 0, X.carLen / 2]));
  const Z: Module = { name: "z_module", W: frame([xTop[0], xTop[1] - 60, xTop[2] + 4 + 22 + 140], [0, 0, -1], [0, -1, 0]), ...layout("rod_8mm_h8_130", "leadscrew_t8x8_150", 34) };
  // the pen arm reaches 26 mm past the carriage: it stops short of the far end block
  if (tool === "pen") Z.zMax -= 26;
  const zb: Op[] = [{ op: "at", T: invert(x.carW), of: [{ op: "box", min: [xTop[0] - 35, xTop[1] - 38, xTop[2]], max: [xTop[0] + 35, xTop[1] + 38, xTop[2] + 4], r: 3 },
    { op: "box", min: [xTop[0] - 35, xTop[1] - 38, xTop[2]], max: [xTop[0] + 35, xTop[1] - 34, xTop[2] + 180], r: 2 }] }];
  A.printedLink("z_bracket", { name: "z_bracket", ops: zb }, { material: "printed" });
  A.fixed("z_bracket_mount", x.carriage, "z_bracket", I);
  A.fastener("M4 x 12 socket head (Z bracket to X carriage)", 4);
  const z = module(A, Z, x.carriage, x.carW, "z", "top", Fmax, vmax);
  // tool on the Z carriage face
  if (tool === "pen") {
    A.printedLink("pen_holder", { name: "pen_holder", ops: [{ op: "at", T: frame([CARRIAGE_TOP, 0, 0], [0, 0, 1], [1, 0, 0]), of: penOps(Z.carLen) }] }, { material: "printed_accent" });
    A.fixed("pen_holder_mount", z.carriage, "pen_holder", I);
    A.fastener("M3 x 10 thumb screw (pen clamp)", 1);
  }
  A.design.tcp = { link: z.carriage, xyz: [(CARRIAGE_TOP + 20) / 1000, 0, (Z.carLen + 30) / 1000] };
  mountSensors(A, req.sensors, {});

  // ---------------- control case beside the Y module, harness
  const H = new Harness(A);
  controlCase(A, H, { parent: "base_link", T: translation([-100, -380, 0]), psu: "psu_24v_lrs150", psuUse: "24 V stepper supply",
    boards: [{ name: "controller", key: "esp32_s3_devkitc1", use: "ESP32-S3 motion controller (runs the generated firmware)" }, ...["x", "y", "z"].map((n) => ({ name: `driver_${n}`, key: DRIVER, use: `${n.toUpperCase()} stepper driver` }))] });
  H.mainPower("V24", { source: "power_supply", pos: "DC OUTPUT +V", neg: "DC OUTPUT -V", fuse: false, volts: 24, cont: 6.5, peakLimit: 7.1, simNote: "all three steppers at full current" });
  const pins = ["4", "5", "6", "7", "15", "16", "17", "18", "8"];
  H.rail("3V3", { source: "controller", out: "3V3", gnd: "G", volts: 3.3, cont: 0.5, peakLimit: 0.6 });
  (["x", "y", "z"] as const).forEach((n, i) => {
    const d = `driver_${n}`, m = `${n}_motor`, rr = H.rec(m).current_a.v;
    H.feed("V24", d, { v: "VM", g: "GND", typ: rr.typical * 0.6, peak: rr.peak });
    H.net(`${n}_VIO`.toUpperCase(), "power", 3.3); H.wire(`${n}_VIO`.toUpperCase(), "controller.3V3", `${d}.VIO`, { typ: 0.02 });
    H.signals("controller", d, [[pins[i * 3], "STEP", `${n}_STEP`.toUpperCase()], [pins[i * 3 + 1], "DIR", `${n}_DIR`.toUpperCase()], [pins[i * 3 + 2], "EN", `${n}_EN`.toUpperCase()]]);
    for (const [c, pin] of [["M1A", "A (black)"], ["M1B", "A\\ (green)"], ["M2A", "B (red)"], ["M2B", "B\\ (blue)"]] as const) { const nn = `${n}_${c}`.toUpperCase(); H.net(nn, "signal"); H.wire(nn, `${d}.${c}`, `${m}.${pin}`, { typ: rr.typical * 0.6, peak: rr.peak }); }
    H.feed("3V3", `${n}_endstop`, { v: "VCC", g: "GND" });
    H.signals(`${n}_endstop`, "controller", [["SIG", ["10", "11", "12"][i], `${n}_HOME`.toUpperCase()]]);
  });
  H.notes.push("The ESP32-S3 runs from its USB lead to the PC; its 3V3 feeds the drivers' logic and the home switches. Motor and switch leads run in drag chain or spiral wrap along each module.");
  H.wire("GND", "controller.G", "driver_x.GND", { typ: 0.02 });
  H.spare("controller.j1.5V");
  finishWiring(H);
  enclosureChecks(A);

  // ---------------- clearance at both ends of every axis (the carriages run along their rods, by design)
  const skip = new Set<string>();   // every pair is checked: round parts carry their bores (clearance.ts)
  const pairsOk = (q: Record<string, number>) => withSolids(A.spec, (mdl) => interferences(mdl, q, undefined, 2, skip));
  const qs: Record<string, number>[] = [{}, ...["x_axis", "y_axis", "z_axis"].map((jn) => ({ [jn]: A.spec.joints.find((j) => j.name === jn)!.limit!.upper! }))];
  const hits = qs.flatMap((q) => pairsOk(q).map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3${Object.keys(q).length ? ` at ${Object.keys(q)[0]} end` : ""}`));
  A.check("clearance:travel", hits.length === 0, hits.length ? `intersecting: ${[...new Set(hits)].slice(0, 6).join(", ")}` : "no part intersects another at either end of each axis (rods run through their bushings by design)");

  // ---------------- axis loads and checks
  const moved = (joint: string) => { const j = A.spec.joints.find((x) => x.name === joint)!, d = descendants(A.spec, j.child); return A.spec.links.filter((l) => d.has(l.name)).reduce((s, l) => s + l.mass, 0) + payload; };
  const toolNote = tool === "pen" ? "pen holder" : "tool plate";
  for (const [axis, vertical] of [["x", false], ["y", false], ["z", true]] as const) {
    const m = moved(`${axis}_axis`), F = m * DYN.accel + DYN.frictionN + (vertical ? m * G : 0);
    const margin = Fmax / F;
    A.design.joints.push({ joint: `${axis}_axis`, actuator: MOTOR, required_nm: +F.toFixed(1), rated_nm: +Fmax.toFixed(0), peak_nm: +Fmax.toFixed(0), margin: +margin.toFixed(2), speed_rad_s: +vmax.toFixed(3), unit: "N",
      note: `${m.toFixed(2)} kg moved (with the ${payload} kg payload) at ${DYN.accel} m/s^2 + ${DYN.frictionN} N bushing friction${vertical ? " + its weight" : ""}; thrust = 2 pi x ${eta} x ${r.rated_nm} N·m / ${lead * 1000} mm lead` });
    A.check(`thrust:${axis}`, margin >= 2, `needs ${F.toFixed(1)} N; the NEMA17 on a Tr8x8 screw gives ${Fmax.toFixed(0)} N (${margin.toFixed(1)}x; steppers want 2x or more to never skip)`);
  }
  A.check("speed:axes", vmax * 1000 >= DYN.speedMm, `${(vmax * 1000).toFixed(0)} mm/s at the motor's rated ${r.speed_rad_s} rad/s on an 8 mm lead (plotting and pick-and-place run at ${DYN.speedMm} mm/s)`);
  const zLoad = (moved("z_axis")) * G, holdNm = (zLoad * lead * etaBack) / (2 * Math.PI), holdTorque = Number(part(MOTOR).specs.holding_torque_nm) * 0.5;
  A.check("z:holding", holdTorque >= 3 * holdNm, `the 8 mm-lead screw back-drives (efficiency ${etaBack}): ${zLoad.toFixed(1)} N on Z puts ${holdNm.toFixed(3)} N·m on the motor; energised at half current it holds ${holdTorque.toFixed(2)} N·m. Unpowered, Z drops: park it at the bottom`);
  // the X module is held at its end A: its two rods are cantilevers carrying the X carriage, the Z module and the payload
  const Lc = (X.zMax + X.carLen) / 1000, Pz = moved("x_axis") * G / 2, E = 200e9, Irod = Math.PI * 0.008 ** 4 / 64;
  const defl = (Pz * Lc ** 3) / (3 * E * Irod) * 1000;
  A.check("structure:x_cantilever", defl <= 1.5, `X carriage at the far end: ${(Pz * 2).toFixed(1)} N on two 8 mm rods ${(Lc * 1000).toFixed(0)} mm out: ${defl.toFixed(2)} mm sag. It is static and repeats, so the firmware's height map (probed once, as a 3D printer levels its bed) takes it out: the sag depends on the X position only, so a map along X corrects it`);
  const steps = 200 * 16 / (lead * 1000);
  A.check("resolution", true, `${steps} microsteps per mm (${(1000 / steps).toFixed(1)} um) on every axis; repeatability is set by the nut's backlash (about 0.05-0.1 mm on a plain brass nut)`);
  const watts = 3 * 24 * 0.6 * Number(H.rec("x_motor").current_a.v.peak) + 1;
  A.check("power:supply", watts <= Number(part("psu_24v_lrs150").specs.power_w), `${watts.toFixed(0)} W with all three drivers at 60 % of 2 A vs the ${part("psu_24v_lrs150").specs.power_w} W supply`);
  if (req.budget !== undefined) A.check("budget", recordCost(A) <= req.budget, `$${recordCost(A).toFixed(2)} of parts vs $${req.budget} budget`);
  const strokes = Object.fromEntries((["x", "y", "z"] as const).map((n) => [`${n}_stroke_mm`, Math.round(A.spec.joints.find((j) => j.name === `${n}_axis`)!.limit!.upper! * 1000)]));
  A.design.performance = { ...strokes, payload_kg: payload, axis_thrust_n: +Fmax.toFixed(0), max_speed_mm_s: +(vmax * 1000).toFixed(0), resolution_um: +(1000 / steps).toFixed(1), mass_kg: +totalMass(A.spec).toFixed(2), tool: toolNote, x_sag_mm: +defl.toFixed(2) };
  A.design.assumptions.push(
    "The three modules are the same design at two lengths; the frame is screwed to a flat board (12 mm plywood or MDF, about 450 x 350 mm, not in the parts list).",
    "Lead screws are plain Tr8x8 with brass nuts: cheap and quiet, with some backlash; anti-backlash nuts are a drop-in upgrade.",
    "Clearance is checked with every rod, lead screw, bearing, bushing, coupler and lead nut as its round body with its bore, so each rod through its bushings and each screw through its nut is checked as built; no pair is left out.",
    "Speeds and thrust use the NEMA17's rated torque; at high step rates a stepper's torque falls, so the firmware limits speed to the checked value.",
    tool === "pen" ? "The pen clamp takes pens and markers up to 12 mm; Z lifts the pen between strokes." : "The tool plate takes four M3 screws for a pen clamp, a suction cup or a small spindle (the tool itself is not designed here).",
  );
  recordCost(A);
  return A.finish(`Cartesian XYZ robot on three lead-screw modules: ${strokes.x_stroke_mm} x ${strokes.y_stroke_mm} x ${strokes.z_stroke_mm} mm, ${Fmax.toFixed(0)} N per axis, ${(vmax * 1000).toFixed(0)} mm/s, ${toolNote}`);
}
