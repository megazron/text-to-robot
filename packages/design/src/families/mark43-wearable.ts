// Iron Man Mark 43 as printable armour, designed directly from reference photos of the movie suit with no body or scanned model
// underneath (scripts/forge_mark43.py: every part is a signed field, plates and panel lines are polygons added to it). It ships as a
// pack (packages/parts/data/mark43_pack.*) of hollow 3 mm shells cut to a 250 x 210 x 220 mm bed; this designer places them and adds
// what makes it work: the mask lifted by two MG90S beside the ears, LEDs behind the eye, chest and palm lenses, and an Arduino Nano,
// LM2596 regulators and a 2S 18650 pack in a compartment on the back. A person moves the joints (passive in the model); limits are
// measured by sweeping armour against armour.
//
// The harness runs inside the shells: scripts/fit_wiring.py adds cable channels on their inner faces, a saddle that seats the
// compartment on the curved back and two ports through the shell behind it, so no cable shows and the outside of the suit is unchanged.
//
// Tiers (Arduino mode): helmet (motorised helmet + LED eyes), lights (helmet + torso with arc reactor + arms with
// repulsors), suit (every piece). A powered suit that moves the wearer cannot be built from hobby parts; asked for, the
// result says so.
import type { RobotSpecification, Joint } from "@ttr/robot-schema";
import { rating, WIRING, type Vec3 } from "@ttr/parts";
import { mul, translation, toPose, type Mat4, type Op as SolidOp } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { armourManifest, type ArmourManifest } from "@ttr/mesh";
import { Assembly } from "../assembly.ts";
import { totalMass, gravityTorques, descendants, fk, linkCom } from "../kin.ts";
import { inertiaOf } from "@ttr/kinematics";
import { bay, enclosureChecks, tieAnchor, type BayPart, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring, type WiringRecord } from "../wiring.ts";

export type Mark43Tier = "helmet" | "lights" | "suit";
export interface Mark43Request { name?: string; prompt?: string; budget?: number; heightM?: number; tier?: Mark43Tier; }

const T = 3, FACE_SERVO = "hobby_mg90s", FILAMENT_USD_PER_KG = 22;
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
const apply = (m: Mat4, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const I4: Mat4 = translation([0, 0, 0]);

/** the back compartment: cavity depth, floor, and the gap to the saddle (cavity length and width come from the pack) */
const BAY_DEPTH = 30, BAY_FLOOR = 2.4, BAY_GAP = 0.3, GROMMET = 9.5;
/** what the pack's capacity gives: Samsung INR18650-25R, 2.5 Ah (datasheet) */
const PACK_AH = 2.5;
/** what the mask's servos must cope with: the head tipped, a full lift in this time (smoothstep: peak acceleration 6 theta / t^2), and the pins' friction (estimate) */
const HEAD_TILT = 0.35, FACE_LIFT_S = 1.5, FACE_FRICTION_NM = 0.02;

const TIER_REGIONS: Record<Mark43Tier, RegExp> = { helmet: /^head$/, lights: /^(head|torso|(left|right)_(upper_arm|forearm|hand))$/, suit: /./ };

export function designMark43Wearable(req: Mark43Request = {}): RobotSpecification {
  const tier = req.tier ?? "suit", H = (req.heightM ?? 1.75) * 1000, s = H / 1750;
  const A = new Assembly(req.name ?? "iron_man_mark_43", "mark43_wearable", req.prompt);
  const full = tier !== "helmet", man = armourManifest();
  const W: Record<string, Mat4> = { base_link: I4 };   // world pose of every link at home (mm)
  const track = (child: string, parent: string, Tj: Mat4) => { W[child] = mul(W[parent], Tj); };
  const measured = (name: string, lower: number, upper: number): [number, number] => { const m = man.limits[name]; return m ? [Math.max(lower, m[0]), Math.min(upper, m[1])] : [lower, upper]; };
  const passive = (name: string, parent: string, child: string, Tj: Mat4, axis: Vec3, lower: number, upper: number) => {
    const [lo, hi] = measured(name, lower, upper);
    const j: Joint = { name, type: "revolute", parent, child, origin: toPose(Tj), axis, passive: true, limit: { lower: lo, upper: hi, effort: 200, velocity: 6 }, dynamics: { damping: 0.5, friction: 0.1 } };
    A.spec.joints.push(j); track(child, parent, Tj);
  };
  const fixed = (name: string, parent: string, child: string, Tj: Mat4) => { A.fixed(name, parent, child, Tj); track(child, parent, Tj); };
  /** a link of the suit itself: its armour pieces are added below */
  const bodyLink = (name: string, _frame: Vec3) => { A.frameLink(name, "armour"); };

  // ---------------- the suit's joints at the requested height. World: z up from the floor, x forward, y left.
  const P = (k: string): Vec3 => { const j = man.joints[k]; return [j[0] * s, j[1] * s, j[2] * s]; };
  const rel = (a: Vec3, b: Vec3): Mat4 => translation([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
  // root on the floor between the feet, so the suit stands on the ground in every viewer and simulator
  A.frameLink("base_link", "base");
  const hipC = P("standing"), neck = P("neck_mount"), hipZ = hipC[2];
  bodyLink("pelvis", hipC);
  fixed("standing", "base_link", "pelvis", translation(hipC));
  bodyLink("head", neck);
  passive("neck", "pelvis", "head", rel(neck, hipC), [0, 0, 1], -1.2, 1.2);   // the helmet turns with the wearer's head
  if (full) {
    for (const side of [1, -1] as const) {
      const L = side > 0 ? "left" : "right";
      const sh = P(`${L}_shoulder`), el = P(`${L}_elbow`), wr = P(`${L}_wrist`), hp = P(`${L}_hip`), kn = P(`${L}_knee`), an = P(`${L}_ankle`);
      bodyLink(`${L}_upper_arm`, sh);
      passive(`${L}_shoulder`, "pelvis", `${L}_upper_arm`, rel(sh, hipC), [0, 1, 0], -2.6, 0.6);
      bodyLink(`${L}_forearm`, el);
      passive(`${L}_elbow`, `${L}_upper_arm`, `${L}_forearm`, rel(el, sh), [0, 1, 0], -2.4, 0);
      bodyLink(`${L}_hand`, wr);
      fixed(`${L}_wrist`, `${L}_forearm`, `${L}_hand`, rel(wr, el));
      bodyLink(`${L}_thigh`, hp);
      passive(`${L}_hip`, "pelvis", `${L}_thigh`, rel(hp, hipC), [0, 1, 0], -1.9, 0.4);
      bodyLink(`${L}_shin`, kn);
      passive(`${L}_knee`, `${L}_thigh`, `${L}_shin`, rel(kn, hp), [0, 1, 0], 0, 2.2);
      bodyLink(`${L}_foot`, an);
      fixed(`${L}_ankle`, `${L}_shin`, `${L}_foot`, rel(an, kn));
    }
  }

  // ---------------- faceplate mechanism (head frame): servos in the ear pods, pivot where the faceplate opens furthest (found when the pack is made)
  const earX = man.hinge[0] * s, earZ = man.hinge[1] * s, earY = 66 * s, faceX = Math.max(man.face_rear_x * s, earX + 31);   // the bar stands clear of the horn pocket
  const Tear = (side: 1 | -1): Mat4 => place([0, 0, 1], [side, 0, 0], [0, side, 0], [earX, side * earY, earZ]);   // output points outwards (right-handed: y = z x x)
  // the servo itself sits in the ear disc with its output facing in: the arm then runs inside the shell and needs no slot in it
  const Tin = (side: 1 | -1): Mat4 => place([0, 0, 1], [-side, 0, 0], [0, -side, 0], [earX, side * earY, earZ]);
  const TL = Tear(1), inv = invertRigid(TL), pods: Record<number, string> = {};
  for (const side of [1, -1] as const) {
    const name = `ear_pod_${side > 0 ? "left" : "right"}`;
    A.cadLink(name, { name, edge: 0.6, ops: [{ op: "rod", a: [earX, side * (earY + 3), earZ - 6 * s], b: [earX, side * (earY + 28 * s), earZ - 6 * s], r: 19 * s }, { op: "cradle", key: FACE_SERVO, T: Tin(side), wall: 2.2 }] }, { material: "armour_red", role: "armour" });
    fixed(`${name}_mount`, "head", name, I4);
    pods[side] = name;
  }
  // the arms: a horn on each servo, a strap forward along the cheek and a bar into the faceplate's side edge
  const reach = faceX - earX + 8;
  A.frameLink("helmet_faceplate", "armour");
  const armNames: string[] = [];
  for (const side of [1, -1] as const) {
    const name = `faceplate_arm_${side > 0 ? "left" : "right"}`;
    const ops: Op[] = [{ op: "at", T: mul(inv, Tin(side)), of: [{ op: "horn", key: FACE_SERVO, t: 3, extra: 3 }, { op: "box", min: [-10, side > 0 ? -reach : 0, 0], max: [10, side > 0 ? 0 : reach, 8], r: 0 }] },
      { op: "at", T: inv, of: [{ op: "box", min: [faceX - 2, side > 0 ? earY - 8 : -96 * s, earZ - 6], max: [faceX + 8, side > 0 ? 96 * s : -(earY - 8), earZ + 6], r: 0 }] }];
    A.cadLink(name, { name, ops }, { material: "armour_gold", role: "armour" });
    A.fixed(`${name}_mount`, "helmet_faceplate", name, I4);
    armNames.push(name);
  }
  const fpLim = man.limits.faceplate ?? [-1, 0];
  A.mount(pods[1], FACE_SERVO, Tin(1), "faceplate_servo_left", "faceplate servo (left ear)");
  A.mount(pods[-1], FACE_SERVO, Tin(-1), "faceplate_servo_right", "faceplate servo (right ear, mirrored)");
  A.revolute("faceplate", pods[1], "helmet_faceplate", TL, FACE_SERVO, fpLim[0], 0);   // servo axis +y: opening (front up) is negative
  W.helmet_faceplate = mul(W.head, TL);

  // ---------------- armour: the fitted pieces, each fixed to the link it rides on
  const pieces = man.pieces.filter((p) => p.region !== "wearer" && TIER_REGIONS[tier].test(p.region));
  const toLink = (link: string): number[] => { const m = invertRigid(W[link]).slice(); m[12] /= 1000; m[13] /= 1000; m[14] /= 1000; return m; };
  const bonded: [string, string][] = [];
  for (const p of pieces) {
    const name = p.name === p.link ? `${p.name}_shell` : p.name;   // the faceplate's shell rides on the link of the same name
    // the joint sleeves are bought fabric; the cable channels share their colour but are printed
    A.armourLink(name, p.name, s, toLink(p.link), p.material === "armour_mech" && !p.wiring ? { material: p.material, printed: false, density: 1150 } : { material: p.material });
    A.fixed(`${name}_mount`, p.link, name, I4);
    if (p.link === "helmet_faceplate") for (const n of armNames) bonded.push([n, name]);
  }
  A.design.bonded = bonded;
  // lights go behind the lenses: a lens centre in its link's frame
  const inLink = (p: { link: string; centroid: number[] }): Vec3 => apply(invertRigid(W[p.link]), [p.centroid[0] * s, p.centroid[1] * s, p.centroid[2] * s]);
  // (a lens can come out in more than one piece: the light sits behind the largest)
  const largest = new Map<string, (typeof pieces)[number]>();
  for (const p of pieces.filter((x) => x.material === "lens_glow")) {
    const k = p.region === "head" ? p.name : p.region;
    if ((largest.get(k)?.volume_mm3 ?? 0) < p.volume_mm3) largest.set(k, p);
  }
  for (const p of largest.values()) {
    const c = inLink(p);
    if (p.region === "head") {
      const h = apply(invertRigid(W.head), [p.centroid[0] * s, p.centroid[1] * s, p.centroid[2] * s]), side = h[1] > 0 ? "left" : "right";
      A.mount("helmet_faceplate", "led_5mm_white", mul(inv, place([0, 0, -1], [0, 1, 0], [1, 0, 0], [h[0] - 13, h[1] - 2.9, h[2] + 2.9])), `eye_led_${side}`, "eye light");
    } else if (p.region === "torso") A.mount(p.name, "ws2812_ring_12", place([0, 1, 0], [0, 0, 1], [1, 0, 0], [c[0] - T - 13, c[1] - 18.5, c[2] - 18.5]), "arc_reactor", "arc reactor ring (12 LEDs)");
    else if (p.region.endsWith("_hand")) {
      const side = p.region.startsWith("left") ? 1 : -1;
      // the ring lies behind the palm lens, facing out along the lens's own normal (the glove is posed on the wearer's hand)
      const o = p.normal ?? [0, -side, 0], R0 = invertRigid(W[p.link]);
      const z: Vec3 = [R0[0] * o[0] + R0[4] * o[1] + R0[8] * o[2], R0[1] * o[0] + R0[5] * o[1] + R0[9] * o[2], R0[2] * o[0] + R0[6] * o[1] + R0[10] * o[2]];
      const h0 = Math.abs(z[2]) < 0.9 ? [z[1], -z[0], 0] : [0, z[2], -z[1]], hl = Math.hypot(h0[0], h0[1], h0[2]);
      const x: Vec3 = [h0[0] / hl, h0[1] / hl, h0[2] / hl], y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const d = T + 5;
      A.mount(p.name, "ws2812_ring_12", place(x, y, z, [0, 1, 2].map((i) => c[i] - z[i] * d - x[i] * 18.5 - y[i] * 18.5) as Vec3), `${p.region.split("_")[0]}_repulsor`, "palm repulsor ring");
    }
  }

  // ---------------- electronics: the compartment on the back (on a belt for the helmet alone), its harness up the shells
  const harness = backBay(A, { tier, s, hipZ, seat: man.bay });
  for (const c of man.channels.filter((x) => TIER_REGIONS[tier].test(x.region))) harness.channel(c.link, c.pts.map((p) => [p[0] * s, p[1] * s, p[2] * s] as Vec3));
  wireSuit(harness, full);

  // ---------------- checks: measured joint ranges, faceplate servo, supply, printing, cost
  const moving = full ? ["faceplate", "neck", ...["left", "right"].flatMap((L) => [`${L}_shoulder`, `${L}_elbow`, ...(tier === "suit" ? [`${L}_hip`, `${L}_knee`] : [])])] : ["faceplate"];
  const range = (n: string) => { const j = A.spec.joints.find((x) => x.name === n)!; return [j.limit!.lower!, j.limit!.upper!]; };
  // walking, stairs, reaching forward, bending the arm: what the suit is required to allow
  const need: Record<string, [number, number]> = { faceplate: [-0.9, 0], neck: [-0.7, 0.7], left_elbow: [-1.8, 0], right_elbow: [-1.8, 0], left_shoulder: [-1.0, 0.2], right_shoulder: [-1.0, 0.2],
    left_hip: [-1.0, 0.2], right_hip: [-1.0, 0.2], left_knee: [0, 1.6], right_knee: [0, 1.6] };
  for (const n of moving) {
    const [lo, hi] = range(n), [nlo, nhi] = need[n] ?? [0, 0];
    A.check(`wearable:${n}`, lo <= nlo + 1e-6 && hi >= nhi - 1e-6, `moves ${(lo * 57.3).toFixed(0)} to ${(hi * 57.3).toFixed(0)} deg, measured by sweeping its armour against the armour it hangs from (needs ${(nlo * 57.3).toFixed(0)} to ${(nhi * 57.3).toFixed(0)})`);
  }
  // the mask at every angle of its travel, with the head tipped forward or back
  let wFace = 0;
  for (const q of [0, -0.25, -0.5, -0.75, -1.0]) for (const lean of [-HEAD_TILT, 0, HEAD_TILT]) wFace = Math.max(wFace, Math.abs(gravityTorques(A.spec, { faceplate: q }, [], [9.81 * Math.sin(lean), 0, -9.81 * Math.cos(lean)]).faceplate ?? 0));
  const r = rating(FACE_SERVO), iFace = swingInertia(A.spec, "faceplate"), lift = iFace * 6 * 1.0 / FACE_LIFT_S ** 2 + FACE_FRICTION_NM, peakFace = wFace + lift;
  A.design.joints.push({ joint: "faceplate", actuator: FACE_SERVO, required_nm: +peakFace.toFixed(4), rated_nm: 2 * r.rated_nm, peak_nm: 2 * r.peak_nm, margin: +((2 * r.peak_nm) / Math.max(peakFace, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: `two MG90S share the faceplate; ${iFace.toFixed(4)} kg m2 about the ear` });
  A.check("torque:faceplate", 2 * r.rated_nm >= wFace && 2 * r.peak_nm >= 1.5 * peakFace, `the mask with its forehead and crown: ${wFace.toFixed(3)} N·m to hold it at the worst angle with the head tipped ${(HEAD_TILT * 57.3).toFixed(0)} deg, against ${(2 * r.rated_nm).toFixed(3)} N·m continuous from two MG90S; ${peakFace.toFixed(3)} N·m to lift it in ${FACE_LIFT_S} s with friction, against ${(2 * r.peak_nm).toFixed(3)} N·m stall`);
  const wiring = finishSuitWiring(harness, full);
  enclosureChecks(A);
  const straps = full ? (tier === "suit" ? 22 : 10) : 0;
  if (straps) A.buy("strap_50mm_velcro", straps, "webbing straps closing the shells round each limb");
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 4);
  const printedKg = A.design.printed.reduce((m, p) => m + p.mass_kg, 0), filament = printedKg * 1.08 * FILAMENT_USD_PER_KG;
  const bom = A.bom(), cost = bom.cost_usd + wiring.cost_usd + filament;
  if (req.budget !== undefined) A.check("budget", cost <= req.budget, `$${cost.toFixed(2)} (parts $${(bom.cost_usd + wiring.cost_usd).toFixed(2)} + filament $${filament.toFixed(2)}) vs $${req.budget}`);
  const armourKg = A.spec.links.filter((l) => l.role === "armour").reduce((m, l) => m + l.mass, 0);
  const printedCount = A.design.printed.length;
  A.design.performance = { tier, tier_label: tier === "helmet" ? "motorised helmet" : tier === "lights" ? "helmet + chest + gauntlets" : "full wearable suit",
    wearer_height_m: +(H / 1000).toFixed(2), printed_pieces: printedCount, armour_mass_kg: +armourKg.toFixed(2), filament_kg: +(printedKg * 1.08).toFixed(2), cost_usd: +cost.toFixed(2), mass_kg: +totalMass(A.spec).toFixed(2) };
  A.design.assumptions.push(`armour shape from: ${man.source}; 3 mm walls, 2 mm faceplate, 15 % gyroid infill (shells are mostly walls)`, `filament at $${FILAMENT_USD_PER_KG}/kg, 8 % waste`,
    "the suit is worn armour over a black undersuit: the wearer moves every joint; nothing powers the limbs (hobby servos cannot move a person)",
    "the wearer is an average adult male body at 1.75 m and the pieces scale evenly with height; check against your own measurements before printing",
    "gaps at the groin, armpits and elbows are cut on purpose so the joints move; the undersuit shows through them, as on real builds",
    "cable channels are 7 to 10 mm deep on the inside of the shells: there is no body model, so their room against a real wearer is not checked; fit the suit before bonding them");
  A.design.request = { ...req } as Record<string, unknown>;
  // the suit's own paint, from the reference photo: bright candy red, tarnished gold, bare steel (the shared palette serves every robot)
  for (const m of A.spec.materials) {
    if (m.name === "armour_red") m.color = [0.56, 0.03, 0.05, 1];
    if (m.name === "armour_gold") m.color = [0.72, 0.56, 0.3, 1];
  }
  A.spec.materials.push({ name: "armour_silver", color: [0.62, 0.63, 0.66, 1] });
  A.spec.materials.push({ name: "armour_mech", color: [0.12, 0.12, 0.14, 1] });
  return A.finish(`Iron Man Mark 43 (${A.design.performance.tier_label}): ${printedCount} printed pieces, ${(printedKg * 1.08).toFixed(1)} kg filament, motorised faceplate, $${cost.toFixed(0)} incl. filament`);
}

/**
 * The compartment: cavity x up the back, y across it, z straight out behind the wearer, floor on the saddle. Rows from the bottom:
 * the battery, the regulators, the Nano beside the switch, then room for the fuse and splices with the two cable ports under it.
 * Its floor screws into the saddle; the lid has its own four screws. The cavity keeps its size at every suit height (the parts do),
 * the ports follow the shell.
 */
function backBay(A: Assembly, o: { tier: Mark43Tier; s: number; hipZ: number; seat: ArmourManifest["bay"] }): Harness {
  const { s, hipZ, seat } = o, L = seat.length_mm, Wd = seat.width_mm, full = o.tier !== "helmet", H = new Harness(A);
  const z0 = (seat.z0 + L / 2) * s - L / 2;
  const T = place([0, 0, 1], [0, 1, 0], [-1, 0, 0], [seat.rear_x * s - BAY_GAP - BAY_FLOOR, -Wd / 2, z0 - hipZ]);
  const across = (x: number, y: number, z: number): Mat4 => place([0, 1, 0], [-1, 0, 0], [0, 0, 1], [x, y, z]);      // a part's length runs across the back
  const parts: BayPart[] = [{ name: "battery", key: "pack_2s_18650", T: across(23.5, 13.5, 4), use: "2S 18650 pack", kind: "board" },
    { name: "regulator", key: "buck_lm2596", T: across(68, 6, 5), use: "LM2596 set to 5 V for the faceplate servos" },
    ...(full ? [{ name: "regulator_lights", key: "buck_lm2596", T: across(68, 54, 5), use: "second LM2596 set to 5 V for the LED rings" }] : []),
    // USB end against the y+ wall (board x runs towards -y)
    { name: "controller", key: "arduino_nano_clone", T: place([0, -1, 0], [1, 0, 0], [0, 0, 1], [71, Wd - 2.1, 13]), use: "Arduino Nano" }];
  const ports = seat.ports.slice(0, full ? 4 : 2).map(([z, y]) => [z * s - z0, y * s + Wd / 2] as const);
  const exits: ExitSpec[] = [...ports.map(([u, v], i): ExitSpec => ({ id: `leads_${i + 1}`, face: "floor", u, v, kind: "grommet", d: GROMMET, noAnchor: true })),
    { id: "usb", face: "y+", u: 80, v: 16, kind: "usb", w: 14, h: 13 },
    { id: "switch", face: "y-", u: 80, v: BAY_DEPTH / 2, kind: "switch", w: 19.4, h: 13.4, part: { name: "main_switch", key: "switch_kcd1", use: "main power switch" } }];
  const screws: [number, number][] = [[6, 8], [L - 6, 8], [6, Wd - 8], [L - 6, Wd - 8]];
  const tubOps: SolidOp[] = [...screws.map(([x, y]): SolidOp => ({ op: "hole", a: [x, y, -BAY_FLOOR - 1], b: [x, y, 1], d: 3.4 })),
    // strain relief beside the ports, where the harness turns down through the floor
    ...[Wd / 2 - 18, Wd / 2 + 18].flatMap((v) => tieAnchor([ports[0][0] - 9, v, 0]))];
  bay(A, { name: "back_bay", parent: "pelvis", T, size: [L, Wd, BAY_DEPTH], cad: true, corner: 5, floor: BAY_FLOOR, bolted: false, material: "armour_red", lidMaterial: "armour_red",
    parts, exits, tubOps, vents: [{ face: "lid", a0: 40, a1: 80, b0: 8, b1: Wd - 8 }], note: full ? "on the back, seated on the saddle" : "worn on a belt, leads up under the clothes to the helmet" }, H);
  A.fastener(full ? "M3 x 16 self-tapping (compartment floor into the saddle, from inside the compartment)" : "M3 x 16 self-tapping (compartment floor to a belt plate, from inside the compartment)", screws.length);
  return H;
}

/** The netlist. Nano on the pack through its own regulator; one LM2596 per kind of load, so a stalled faceplate never dims a ring or resets the board. */
function wireSuit(H: Harness, full: boolean) {
  H.home = "controller";   // fuse, splices and the star ground stay in the compartment, in the row above the board
  H.mainPower("VBAT", { source: "battery", pos: "leads.BAT+", neg: "leads.BAT-", sw: "main_switch", volts: 7.2, cont: 4, peakLimit: 5, simNote: "every load on the 5 V rails at its peak, through the regulators" });
  H.regulator("regulator", "VBAT", "5V_SERVO", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, simNote: "both faceplate servos stalled" });
  H.feed("VBAT", "controller", { v: "VIN", g: "GND", typ: 0.065, peak: 0.1 });   // the board plus the two eye LEDs on its pins
  // each load's power and signal share one cable; each grommet takes the six wires its 4.8 mm bore passes
  const load = (rail: string, inst: string, pin: string, net: string, tail: string, exit: number) => { const cable = `${rail}~${inst}`; H.feed(rail, inst); H.net(net, "signal"); H.wire(net, `controller.${pin}`, `${inst}.${tail}`, { cable }); H.exitFor(cable, `back_bay.leads_${exit}`); };
  load("5V_SERVO", "faceplate_servo_left", "D9", "FACEPLATE_LEFT_PWM", "Signal", 1);
  load("5V_SERVO", "faceplate_servo_right", "D10/SS", "FACEPLATE_RIGHT_PWM", "Signal", 2);
  for (const [side, pin, exit] of [["left", "D3", 1], ["right", "D5", 2]] as const) {
    const led = `eye_led_${side}`, net = H.net(led.toUpperCase(), "signal");
    H.wire(net, `controller.${pin}`, `${led}.ANODE`, { typ: 0.02 }); H.wire("GND", "controller.GND", `${led}.CATHODE`, { typ: 0.02 }); H.exitFor(["controller", led].sort().join("~"), `back_bay.leads_${exit}`);
  }
  if (full) {
    H.regulator("regulator_lights", "VBAT", "5V_LIGHTS", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, simNote: "all three rings at full white" });
    for (const [ring, pin, exit] of [["arc_reactor", "D6", 3], ["left_repulsor", "D7", 3], ["right_repulsor", "D8", 4]] as const) { load("5V_LIGHTS", ring, pin, `${ring}_DATA`.toUpperCase(), "DIN", exit); H.spare(`${ring}.pads.DOUT`); }
  }
}

/** Route, size and check; then what only this suit needs: every cable through its grommet, disconnects where the suit comes apart, ring capacitors. */
function finishSuitWiring(H: Harness, full: boolean): WiringRecord {
  // movement the model has no joint for: nodding, the shoulder lifting sideways, the wrist
  H.flex.set("neck", 60);
  if (full) for (const L of ["left", "right"]) { H.flex.set(`${L}_shoulder`, 100); H.flex.set(`${L}_wrist`, 40); }
  H.notes.push("No cable shows from outside: every lead leaves the compartment through its floor, through a port in the back shell, and lies in the channels bonded inside the shells. Press the wires in one at a time past the snap lips.",
    "Set both LM2596 outputs to 5.0 V with a meter before wiring anything to them.",
    "The cells have no protection board: charge them out of the suit at 4.2 V per cell, and stop at 3.2 V per cell (6.4 V at the pack): the regulators fall out of 5 V at about that point.",
    "The Nano runs from VIN, so USB and the pack can be connected together.",
    "Eye LEDs hang on D3 and D5 through the 100 ohm resistor of the part: 20 mA each is an AVR pin's stated limit, so run them under full PWM for long stretches.");
  if (full) H.notes.push("WS2812 data: fit a 330 ohm resistor in series at the Nano pin of each ring and a 1000 uF capacitor across 5 V and GND at each ring. The run to a palm is over a metre of unscreened data: test it on the bench before closing the shells.",
    "All three rings at full white load their LM2596 past its 2 A continuous rating (2.16 A; 3 A peak): limit brightness to 90 % in the sketch for anything longer than a burst.");
  const rec = finishWiring(H, { noClips: /^(ear_pod|faceplate_arm)/ }), A = H.A;
  const seen = new Map<string, number>(), bore = WIRING.grommet_bore_mm[String(GROMMET)];
  for (const c of rec.cables) for (const e of (c.exit ?? "").split(" + ").filter(Boolean)) seen.set(e, (seen.get(e) ?? 0) + c.wires.length);
  for (const [e, n] of seen) { const od = 1.5 * Math.sqrt(n) * 1.25; A.check(`wiring:exit:${e.split(".").pop()}`, od <= bore, `${n} wires bundle to ${od.toFixed(1)} mm through the ${bore} mm bore of a ${GROMMET} mm grommet`); }
  const routed = rec.cables.filter((c) => c.joints.length), lined = routed.reduce((n, c) => n + (c.channel_mm ?? 0), 0), total = routed.reduce((n, c) => n + c.route_mm, 0);
  A.check("wiring:channels", routed.every((c) => (c.channel_mm ?? 0) > 0) && (!full || lined / total > 0.5), `${(lined / 1000).toFixed(1)} of ${(total / 1000).toFixed(1)} m of cable leaving the compartment lies in the shells' channels`);
  // the suit comes apart at the neck, the shoulders and the chest seam: each lead has an inline plug there
  const splits = routed.reduce((n, c) => n + c.joints.filter((j) => /neck|shoulder/.test(j.joint)).length, 0) + (full ? 1 : 0), jst = WIRING.connectors.jst_xh_2_5;
  // the harness prices a 9.5 mm grommet by a key with a dot in it and so falls back to a smaller one: these are the right part
  const rubber = WIRING.consumables.grommet_9_5;
  for (const l of rec.bom) if (/^Rubber grommet/.test(l.item)) Object.assign(l, { item: rubber.name, unit_usd: rubber.unit_usd, subtotal_usd: +(l.qty * rubber.unit_usd).toFixed(2) });
  const add = (item: string, qty: number, usd: number, spec: string) => rec.bom.push({ item, qty, unit: "pc", unit_usd: usd, subtotal_usd: +(qty * usd).toFixed(2), spec, source: "estimated" });
  add(`${jst.name} inline plug and socket, 3 way`, splits, +(2 * (jst.housing_usd ?? 0) + 6 * jst.unit_usd).toFixed(2), "one on each lead at the neck, the shoulders and the chest seam, so helmet, arms and chest come off");
  if (full) { const cap = WIRING.consumables.capacitor_1000uf; add(cap.name, 3, cap.unit_usd, "across 5 V and GND at each ring"); add("330 ohm resistor, 1/4 W", 3, 0.02, "in series with each ring's data line, at the Nano"); }
  rec.cost_usd = +rec.bom.reduce((n, l) => n + l.subtotal_usd, 0).toFixed(2);
  const load = rec.rails.find((r) => r.name === "VBAT")!;
  H.notes.push(`Run time from the ${PACK_AH} Ah pack at the typical ${load.typical_a} A: about ${(0.8 * PACK_AH / load.typical_a).toFixed(1)} h, keeping 20 % back (estimate; lights and faceplate never all run like that for hours).`);
  return rec;
}

/** Moment of inertia (kg m2) of everything a joint carries, about its own axis, from each link's mass, centre and inertia tensor. */
function swingInertia(spec: RobotSpecification, joint: string): number {
  const j = spec.joints.find((x) => x.name === joint)!, f = fk(spec), { p, axis } = f.joint[joint], links = new Map(spec.links.map((l) => [l.name, l]));
  let I = 0;
  for (const n of descendants(spec, j.child)) {
    const l = links.get(n)!, T = f.link[n], c = linkCom(l), w = [0, 1, 2].map((i) => T.R[i][0] * c[0] + T.R[i][1] * c[1] + T.R[i][2] * c[2] + T.p[i] - p[i]);
    const along = w[0] * axis[0] + w[1] * axis[1] + w[2] * axis[2], r2 = w[0] ** 2 + w[1] ** 2 + w[2] ** 2 - along ** 2;
    const t = inertiaOf(l.geometry, l.mass), a = [0, 1, 2].map((k) => T.R[0][k] * axis[0] + T.R[1][k] * axis[1] + T.R[2][k] * axis[2]);
    I += l.mass * r2 + t.ixx * a[0] ** 2 + t.iyy * a[1] ** 2 + t.izz * a[2] ** 2 + 2 * (t.ixy * a[0] * a[1] + t.ixz * a[0] * a[2] + t.iyz * a[1] * a[2]);
  }
  return I;
}

function invertRigid(m: Mat4): Mat4 {
  const R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t = [m[12], m[13], m[14]];
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const ti = [0, 1, 2].map((i) => -(Rt[i][0] * t[0] + Rt[i][1] * t[1] + Rt[i][2] * t[2]));
  return [Rt[0][0], Rt[1][0], Rt[2][0], 0, Rt[0][1], Rt[1][1], Rt[2][1], 0, Rt[0][2], Rt[1][2], Rt[2][2], 0, ti[0], ti[1], ti[2], 1];
}
