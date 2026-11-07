// Iron Man Mark 43 as printable armour, designed directly from reference photos of the movie suit with no body or scanned model
// underneath (scripts/forge_mark43.py: every part is a signed field, plates and panel lines are polygons added to it). It ships as a
// pack (packages/parts/data/mark43_pack.*) of hollow 3 mm shells cut to a 250 x 210 x 220 mm bed; this designer places them and adds
// what makes it work: the mask lifted by two MG90S beside the ears, LEDs behind the eye, chest and palm lenses, and an Arduino Nano,
// regulators and a 2S 18650 pack in a compartment on the back. A person moves the limbs (passive in the model); limits are measured by
// sweeping armour against armour.
//
// The suit opens from behind for a person to step in. The back splits on its centre line and the rear shells of the helmet, upper arms,
// forearms, thighs and shins swing out about 80 degrees on hinges along their flanks. scripts/fit_doors.py makes the hinges, servo pods,
// drive arms and latches from the finished shells and measures each door's range; here each door becomes a revolute joint on its servo,
// and the servos hang on two PCA9685 boards in the hollow of the waist. Only the servos move the doors: the wearer's limbs stay free of
// them, and a sprung pawl with a hand cord holds each door shut, powered or not.
//
// The harness runs inside the shells: scripts/fit_wiring.py adds cable channels on the inner faces of the fixed halves and saddles that
// seat the compartments on the curved shell. The battery bay rides on the left back door, clear of the centre seam; cables cross a door
// only in a service loop at its hinge.
//
// Tiers (Arduino mode): helmet (motorised helmet + LED eyes), lights (helmet + torso with arc reactor + arms with
// repulsors), suit (every piece). A powered suit that moves the wearer cannot be built from hobby parts; asked for, the
// result says so.
import type { RobotSpecification, Joint } from "@ttr/robot-schema";
import { part, rating, WIRING, type Vec3 } from "@ttr/parts";
import { mul, translation, toPose, type Mat4, type Op as SolidOp } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { armourManifest, type ArmourManifest } from "@ttr/mesh";
import { Assembly } from "../assembly.ts";
import { totalMass, gravityTorques, descendants, fk, linkCom } from "../kin.ts";
import { inertiaOf } from "@ttr/kinematics";
import { bay, enclosureChecks, tieAnchor, type BayPart, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring, type WiringRecord } from "../wiring.ts";
import { evaluate } from "../sizing.ts";

export type Mark43Tier = "helmet" | "lights" | "suit";
export interface Mark43Request { name?: string; prompt?: string; budget?: number; heightM?: number; tier?: Mark43Tier; }

const T = 3, FACE_SERVO = "hobby_mg90s", FILAMENT_USD_PER_KG = 22;
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
const apply = (m: Mat4, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const I4: Mat4 = translation([0, 0, 0]);
const unit = (v: Vec3): Vec3 => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };

/** the compartments: cavity depths, floor, and the gap to the saddle (cavity length and width come from the pack) */
const BAY_DEPTH = 30, DRIVE_DEPTH = 18, BAY_FLOOR = 2.4, BAY_GAP = 0.3, GROMMET = 9.5;
/** what the pack's capacity gives: Samsung INR18650-25R, 2.5 Ah (datasheet) */
const PACK_AH = 2.5;
/** what the mask's servos must cope with: the head tipped, a full lift in this time (smoothstep: peak acceleration 6 theta / t^2), and the pins' friction (estimate) */
const HEAD_TILT = 0.35, FACE_LIFT_S = 1.5, FACE_FRICTION_NM = 0.02;
/** A door: the suit may stand this far off plumb in any direction while one moves (rad), one swing takes this long (s; smoothstep, peak acceleration 6 theta / t^2).
 *  Friction of the hinges is the door's weight on 4 mm steel pins in printed bores (mu 0.3); the cable loop's stiffness is an estimate. */
const DOOR_LEAN = 0.17, DOOR_SWING_S = 3.0, PIN_MU = 0.3, PIN_R_M = 0.002, LOOP_NM = 0.03;
/** Safety targets. The clutch between horn and door slips above this multiple of the worst working torque, so a closing door cannot press harder on a person
 *  than PINCH_N at its edge (design target, estimate), and a hand opens it with no power. LATCH_LOAD_N: a person leaning or falling against a door (estimate). */
const CLUTCH_FACTOR = 1.3, PINCH_N = 40, HAND_N = 40, LATCH_LOAD_N = 400;
/** Pawl: 9 x 6 mm section in PETG, shear strength across layers taken as 15 MPa (estimate, not tested). Spring 0.05 N·m; cord on the pawl at 26 mm. */
const PAWL_SHEAR_N = 9 * 6 * 15, PAWL_SPRING_NM = 0.05, CORD_ARM_M = 0.026, CORD_MU = 0.25, PAWL_TIP_M = 0.034;

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
  const hipC = P("standing"), neck = P("neck_mount");
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

  // ---------------- the doors: each turns on its own servo, whose output lies on the hinge line
  const doors = man.doors.filter((d) => TIER_REGIONS[tier].test(d.region)), latches = man.latches.filter((l) => TIER_REGIONS[tier].test(l.region));
  // the frames come from the pack rounded: square them up again, the CAD kernel takes only true rotations
  const atScale = (T: number[][]): Mat4 => {
    const z = unit([T[0][2], T[1][2], T[2][2]]), x0: Vec3 = [T[0][0], T[1][0], T[2][0]], k = x0[0] * z[0] + x0[1] * z[1] + x0[2] * z[2], x = unit([x0[0] - k * z[0], x0[1] - k * z[1], x0[2] - k * z[2]]);
    return place(x, [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]], z, [T[0][3] * s, T[1][3] * s, T[2][3] * s]);
  };
  for (const d of doors) {
    const Tw = atScale(d.servo.T), Tp = mul(invertRigid(W[d.parent]), Tw), [lo, hi] = man.limits[d.joint];
    A.mount(d.parent, d.servo.key, Tp, d.servo.name, `door drive (${d.name.replace(/_/g, " ")})`);
    A.frameLink(d.link, "armour");
    A.revolute(d.joint, d.parent, d.link, Tp, d.servo.key, lo, hi);
    W[d.link] = Tw;
  }
  for (const l of latches) {
    const Tw = atScale(l.T), Tp = mul(invertRigid(W[l.parent]), Tw), [lo, hi] = man.limits[l.joint];
    A.mount(l.parent, l.key, Tp, `${l.name}_servo`, `latch release (${l.door.replace(/_/g, " ")})`);
    A.frameLink(l.link, "armour");
    A.revolute(l.joint, l.parent, l.link, Tp, l.key, lo, hi);
    W[l.link] = Tw;
  }

  // ---------------- armour: the fitted pieces, each fixed to the link it rides on
  const pieces = man.pieces.filter((p) => p.region !== "wearer" && TIER_REGIONS[tier].test(p.region) && !(p.wiring && !full && /^(bay|drive_)/.test(p.name)) && (W[p.link] !== undefined));
  const toLink = (link: string): number[] => { const m = invertRigid(W[link]).slice(); m[12] /= 1000; m[13] /= 1000; m[14] /= 1000; return m; };
  // hinges, pods and pawls keep their size at every suit height: they hold real servos and pins, so they move with their station and do not scale
  const hardwareToLink = (link: string, at: number[]): number[] => { const m = mul(invertRigid(W[link]), translation([at[0] * (s - 1), at[1] * (s - 1), at[2] * (s - 1)])).slice(); m[12] /= 1000; m[13] /= 1000; m[14] /= 1000; return m; };
  const bonded: [string, string][] = [];
  for (const p of pieces) {
    const name = p.name === p.link ? `${p.name}_shell` : p.name;   // the faceplate's shell rides on the link of the same name
    // the joint sleeves are bought fabric; the cable channels share their colour but are printed
    if (p.hardware) A.armourLink(name, p.name, 1, hardwareToLink(p.link, p.anchor!), { material: p.material });
    else A.armourLink(name, p.name, s, toLink(p.link), p.material === "armour_mech" && !p.wiring ? { material: p.material, printed: false, density: 1150 } : { material: p.material });
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
  const harness = backBay(A, { tier, s, W, invert: invertRigid, seats: man.bays });
  for (const c of man.channels.filter((x) => TIER_REGIONS[tier].test(x.region) && W[x.link] !== undefined)) harness.channel(c.link, c.pts.map((p) => [p[0] * s, p[1] * s, p[2] * s] as Vec3));
  wireSuit(harness, full, doors.map((d) => d.servo.name), latches.map((l) => `${l.name}_servo`));

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
  const sway = checkDoors(A, doors, latches, s);
  const wiring = finishSuitWiring(harness, full);
  enclosureChecks(A);
  // a door's latch has a second line of defence: a strap over the door that a hand undoes
  const straps = doors.filter((d) => d.part !== "head").length;
  if (straps) A.buy("strap_50mm_velcro", straps, "backup strap over each door, undone by hand");
  if (doors.length) {
    const pins = doors.reduce((n, d) => n + d.hinges.length, 0);
    A.fastener("M4 x 40 stainless shoulder pin with nyloc nut (door hinge)", pins);
    A.fastener("M3 x 10 screw and washer (hinge leaf through the shell)", pins * 4);
    A.fastener("M6 ball-nose spring plunger, 20 N (clutch between servo horn and drive arm)", doors.length * 2);
    A.fastener("torsion spring, 0.05 N·m (latch pawl, sprung shut)", latches.length);
    A.fastener("1.5 mm braided cord in 2 mm PTFE sleeve, 1 m (hand release, one per latch)", latches.length);
  }
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 4);
  const printedKg = A.design.printed.reduce((m, p) => m + p.mass_kg, 0), filament = printedKg * 1.08 * FILAMENT_USD_PER_KG;
  const bom = A.bom(), cost = bom.cost_usd + wiring.cost_usd + filament;
  if (req.budget !== undefined) A.check("budget", cost <= req.budget, `$${cost.toFixed(2)} (parts $${(bom.cost_usd + wiring.cost_usd).toFixed(2)} + filament $${filament.toFixed(2)}) vs $${req.budget}`);
  const armourKg = A.spec.links.filter((l) => l.role === "armour").reduce((m, l) => m + l.mass, 0);
  const printedCount = A.design.printed.length;
  A.design.performance = { tier, tier_label: tier === "helmet" ? "motorised helmet" : tier === "lights" ? "helmet + chest + gauntlets" : "full wearable suit",
    wearer_height_m: +(H / 1000).toFixed(2), printed_pieces: printedCount, armour_mass_kg: +armourKg.toFixed(2), filament_kg: +(printedKg * 1.08).toFixed(2), cost_usd: +cost.toFixed(2), mass_kg: +totalMass(A.spec).toFixed(2) };
  A.design.assumptions.push(`armour shape from: ${man.source}; 3 mm walls, 2 mm faceplate, 15 % gyroid infill (shells are mostly walls)`, `filament at $${FILAMENT_USD_PER_KG}/kg, 8 % waste`,
    "the suit is worn armour over a black undersuit: the wearer moves every joint; nothing powers the limbs (hobby servos cannot move a person); the servos only open and close the doors",
    "the wearer is an average adult male body at 1.75 m and the pieces scale evenly with height; check against your own measurements before printing",
    "gaps at the groin, armpits and elbows are cut on purpose so the joints move; the undersuit shows through them, as on real builds",
    `cable channels are 7 to 10 mm deep on the inside of the shells and the latch servos stand up to ${Math.max(0, ...latches.map((l) => l.room_mm)).toFixed(0)} mm off them: there is no body model, so their room against a real wearer is not checked; fit the suit before bonding them`,
    "NOTHING HERE HAS BEEN BUILT OR TESTED. Door torques, the clutch setting, pawl strength and pinch force are calculations with estimated inputs; none has been measured on hardware",
    "gloves and boots are not part of the opening: their mouths are smaller than a hand or a foot, so they are put on separately and are not designed to come on through the suit");
  Object.assign(A.design, { doors: sway, door_sequence: man.sequence.map((st) => st.filter((j) => doors.some((d) => d.joint === j))).filter((st) => st.length) });
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
 * The battery bay: cavity x up the back, y from the centre line outwards, z straight out behind the wearer, floor on its saddle on the left back door. Column by the
 * centre line: the battery, then the door regulator. Outer column: the two LM2596s, then the Nano with its USB in the top wall, beside the switch. The cable ports lie
 * under the top of the bay. Its floor screws into the saddle; the lid has its own four screws. The cavity keeps its size at every suit height (the parts do), the ports
 * follow the shell. Two driver bays, one in the hollow of the waist on each side, hold a PCA9685 each, so servo leads never cross a door.
 */
function backBay(A: Assembly, o: { tier: Mark43Tier; s: number; W: Record<string, Mat4>; invert: (m: Mat4) => Mat4; seats: ArmourManifest["bays"] }): Harness {
  const { s, W, seats } = o, full = o.tier !== "helmet", H = new Harness(A), seat = seats.back, L = seat.length_mm, Wd = seat.width_mm, link = full ? seat.link : "pelvis";
  const cavity = (b: typeof seat, L_: number, W_: number): Mat4 => {
    const c = [0, 1, 2].map((i) => (b.O[i] + b.ex[i] * L_ / 2 + b.ey[i] * W_ / 2) * s - b.ex[i] * L_ / 2 - b.ey[i] * W_ / 2 + b.ez[i] * (BAY_GAP + BAY_FLOOR)) as Vec3;
    return place(b.ex as Vec3, b.ey as Vec3, b.ez as Vec3, c);
  };
  const T = mul(o.invert(W[link]), cavity(seat, L, Wd));
  const parts: BayPart[] = [{ name: "battery", key: "pack_2s_18650", T: translation([4, 24, 4]), use: "2S 18650 pack", kind: "board" },
    { name: "regulator", key: "buck_lm2596", T: translation([4, 47, 5]), use: "LM2596 set to 5 V for the faceplate servos" },
    ...(full ? [{ name: "regulator_lights", key: "buck_lm2596", T: translation([50, 47, 5]), use: "second LM2596 set to 5 V for the LED rings" },
      { name: "regulator_doors", key: "buck_5v_5a", T: translation([84, 4, 5]), use: "5 V 5.5 A regulator for the door and latch servos alone" }] : []),
    // USB end against the x+ wall
    { name: "controller", key: "arduino_nano_clone", T: place([1, 0, 0], [0, 1, 0], [0, 0, 1], [L - 2.1 - 44, 50, 13]), use: "Arduino Nano" }];
  const ports = seat.ports.slice(0, 6).map(([u, v]) => [(u - L / 2) * s + L / 2, (v - Wd / 2) * s + Wd / 2] as const);
  const exits: ExitSpec[] = [...ports.map(([u, v], i): ExitSpec => ({ id: `leads_${i + 1}`, face: "floor", u, v, kind: "grommet", d: GROMMET, noAnchor: true })),
    { id: "usb", face: "x+", u: 59, v: 16, kind: "usb", w: 14, h: 13 },
    { id: "switch", face: "x+", u: 22, v: BAY_DEPTH / 2, kind: "switch", w: 19.4, h: 13.4, part: { name: "main_switch", key: "switch_kcd1", use: "main power switch" } }];
  const screws: [number, number][] = [[6, 8], [L - 6, 8], [6, Wd - 8], [L - 6, Wd - 8]];
  const tubOps: SolidOp[] = [...screws.map(([x, y]): SolidOp => ({ op: "hole", a: [x, y, -BAY_FLOOR - 1], b: [x, y, 1], d: 3.4 })),
    // strain relief where the harness turns down through the floor
    ...tieAnchor([100, 40, 0])];
  bay(A, { name: "back_bay", parent: link, T, size: [L, Wd, BAY_DEPTH], cad: true, corner: 5, floor: BAY_FLOOR, bolted: false, material: "armour_red", lidMaterial: "armour_red",
    parts, exits, tubOps, vents: [{ face: "lid", a0: 22, a1: 132, b0: 8, b1: Wd - 8 }], note: full ? "on the left back door, clear of the centre seam, seated on its saddle" : "worn on a belt, leads up under the clothes to the helmet" }, H);
  A.fastener(full ? "M3 x 16 self-tapping (compartment floor into the saddle, from inside the compartment)" : "M3 x 16 self-tapping (compartment floor to a belt plate, from inside the compartment)", screws.length);
  if (full) for (const side of ["left", "right"] as const) {
    const b = seats[`drive_${side}`], name = `drive_${side}`, Lb = b.length_mm, Wb = b.width_mm, Tb = mul(o.invert(W[b.link]), cavity(b, Lb, Wb));
    const [u, v] = b.ports[0], sc: [number, number][] = [[6, 6], [Lb - 6, 6]];
    bay(A, { name, parent: b.link, T: Tb, size: [Lb, Wb, DRIVE_DEPTH], cad: true, corner: 4, floor: BAY_FLOOR, bolted: false, material: "armour_red", lidMaterial: "armour_red",
      parts: [{ name: `servo_driver_${side}`, key: "pca9685_clone", T: translation([1.9, 1.5, 3]), use: "16-channel servo driver for the doors and latches (I2C)" }],
      exits: [{ id: "leads", face: "floor", u, v, kind: "slot", w: 40, h: 13, noAnchor: true }],
      tubOps: sc.map(([x, y]): SolidOp => ({ op: "hole", a: [x, y, -BAY_FLOOR - 1], b: [x, y, 1], d: 3.4 })), note: "in the hollow of the waist, on the fixed half, seated on its saddle" }, H);
    A.fastener("M3 x 16 self-tapping (driver bay floor into its saddle)", sc.length);
  }
  return H;
}

/** Each load's power and signal share one cable, and each grommet of the battery bay takes the six wires its 4.8 mm bore passes. */
function wireSuit(H: Harness, full: boolean, drives: string[], latches: string[]) {
  H.home = "controller";   // fuse, splices and the star ground stay in the compartment, in the row above the board
  H.mainPower("VBAT", { source: "battery", pos: "leads.BAT+", neg: "leads.BAT-", sw: "main_switch", volts: 7.2, cont: 6, peakLimit: 10, simNote: "every load on the 5 V rails at its peak, through the regulators" });
  H.regulator("regulator", "VBAT", "5V_SERVO", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, simultaneous: full ? undefined : 3, simNote: full ? "both faceplate servos stalled" : "three of the helmet's servos stalled at once (the sketch moves them in turn)" });
  H.feed("VBAT", "controller", { v: "VIN", g: "GND", typ: 0.065, peak: 0.1 });   // the board plus the two eye LEDs on its pins
  const seats = new Map<number, number>(), port = (wires: number) => { for (let i = 1; i <= 6; i++) if ((seats.get(i) ?? 0) + wires <= 6) { seats.set(i, (seats.get(i) ?? 0) + wires); return i; } throw new Error("no grommet left"); };
  const load = (rail: string, inst: string, pin: string, net: string, tail: string) => { const cable = `${rail}~${inst}`; H.feed(rail, inst); H.net(net, "signal"); H.wire(net, `controller.${pin}`, `${inst}.${tail}`, { cable }); H.exitFor(cable, `back_bay.leads_${port(3)}`); };
  load("5V_SERVO", "faceplate_servo_left", "D9", "FACEPLATE_LEFT_PWM", "Signal");
  load("5V_SERVO", "faceplate_servo_right", "D10/SS", "FACEPLATE_RIGHT_PWM", "Signal");
  for (const [side, pin] of [["left", "D3"], ["right", "D5"]] as const) {
    const led = `eye_led_${side}`, net = H.net(led.toUpperCase(), "signal");
    H.wire(net, `controller.${pin}`, `${led}.ANODE`, { typ: 0.02 }); H.wire("GND", "controller.GND", `${led}.CATHODE`, { typ: 0.02 }); H.exitFor(["controller", led].sort().join("~"), `back_bay.leads_${port(2)}`);
  }
  if (!full) {
    // the helmet alone: three door and latch servos straight on the Nano's free pins, on the faceplate's rail, one at a time
    [...drives, ...latches].forEach((inst, i) => load("5V_SERVO", inst, ["D6", "D7", "D8"][i], `${inst}_PWM`.toUpperCase(), "Signal"));
    return;
  }
  H.regulator("regulator_lights", "VBAT", "5V_LIGHTS", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, simNote: "all three rings at full white" });
  for (const [ring, pin] of [["arc_reactor", "D6"], ["left_repulsor", "D7"], ["right_repulsor", "D8"]] as const) { load("5V_LIGHTS", ring, pin, `${ring}_DATA`.toUpperCase(), "DIN"); H.spare(`${ring}.pads.DOUT`); }
  // the doors have their own regulator: a stalled door never browns out the Nano or the lights. Left doors on one board, right doors on the other, so a left and right pair
  // moves one servo on each. The sketch moves one pair at a time.
  H.regulator("regulator_doors", "VBAT", "5V_DOORS", { vin: "VIN", gin: "GND", vout: "VOUT", gout: "GND", volts: 5, simultaneous: 2, simNote: "a left and right door stalled together, the rest idle" });
  const all = [...drives, ...latches], sideOf = (n: string) => (/right/.test(n) ? "right" : "left"), idle = 0.01;
  for (const side of ["left", "right"] as const) {
    const board = `servo_driver_${side}`, mine = all.filter((n) => sideOf(n) === side), r = (n: string) => H.rec(n).current_a.v;
    const worst = Math.max(...mine.map((n) => r(n).peak)), run = Math.max(...mine.map((n) => r(n).typical));
    H.feed("5V_DOORS", board, { v: "v_plus.V+", g: "v_plus.GND", typ: run + mine.length * idle, peak: worst + mine.length * idle });
    H.exitFor(`5V_DOORS~${board}`, `back_bay.leads_${port(2)}`);
    H.net(`I2C_SDA_${side}`.toUpperCase(), "bus"); H.net(`I2C_SCL_${side}`.toUpperCase(), "bus");
    const i2c = `i2c~${board}`;
    H.net(`LOGIC_5V_${side}`.toUpperCase(), "power", 5);
    H.wire(`I2C_SDA_${side}`.toUpperCase(), "controller.A4/SDA", `${board}.control_in.SDA`, { cable: i2c }); H.wire(`I2C_SCL_${side}`.toUpperCase(), "controller.A5/SCL", `${board}.control_in.SCL`, { cable: i2c });
    H.wire(`LOGIC_5V_${side}`.toUpperCase(), "controller.5V", `${board}.control_in.VCC`, { cable: i2c, typ: 0.01 }); H.exitFor(i2c, `back_bay.leads_${port(3)}`);
    H.spare(`${board}.control_in.OE`, `${board}.control_out`);
    mine.forEach((inst, ch) => {
      const cable = `${board}~${inst}`, net = H.net(`${inst}_PWM`.toUpperCase(), "signal"), cur = { typ: r(inst).typical, peak: r(inst).peak, cable };
      H.wire(net, `${board}.ch${ch}.PWM${ch}`, `${inst}.Signal`, { cable }); H.wire("5V_DOORS", `${board}.ch${ch}.V+`, `${inst}.V+`, cur); H.wire("GND", `${board}.ch${ch}.GND`, `${inst}.GND`, cur);
    });
    for (let ch = mine.length; ch < 16; ch++) H.spare(`${board}.ch${ch}`);
  }
}

/** Route, size and check; then what only this suit needs: every cable through its grommet, disconnects where the suit comes apart, ring capacitors. */
function finishSuitWiring(H: Harness, full: boolean): WiringRecord {
  // movement the model has no joint for: nodding, the shoulder lifting sideways, the wrist
  H.flex.set("neck", 60);
  if (full) for (const L of ["left", "right"]) { H.flex.set(`${L}_shoulder`, 100); H.flex.set(`${L}_wrist`, 40); }
  H.notes.push("No cable shows from outside: every lead leaves its compartment through its floor, through a port in the shell, and lies in the channels bonded inside the shells. Press the wires in one at a time past the snap lips.",
    "A door's cables cross its hinge in a service loop close to the hinge line, in braided sleeving, so opening the door rolls the loop and never pulls a wire: only the left back door carries cables, the limbs' leads stay on their fixed halves.",
    "Set both LM2596 outputs to 5.0 V with a meter before wiring anything to them.",
    "The cells have no protection board: charge them out of the suit at 4.2 V per cell, and stop at 3.2 V per cell (6.4 V at the pack): the regulators fall out of 5 V at about that point.",
    "The Nano runs from VIN, so USB and the pack can be connected together.",
    "Eye LEDs hang on D3 and D5 through the 100 ohm resistor of the part: 20 mA each is an AVR pin's stated limit, so run them under full PWM for long stretches.");
  if (full) H.notes.push("Set the right servo board to I2C address 0x41 (bridge A0); the left stays at 0x40. Fit 1000 uF across V+ and GND at each board.",
    "The sketch must lift the pawls, then move one left and right pair at a time: forearms, shins, upper arms, thighs, then right back door, left back door, right helmet door, left helmet door. Shut in reverse. The doors have no position or contact sensing, and no sketch is supplied yet.");
  if (full) H.notes.push("WS2812 data: fit a 330 ohm resistor in series at the Nano pin of each ring and a 1000 uF capacitor across 5 V and GND at each ring. The run to a palm is over a metre of unscreened data: test it on the bench before closing the shells.",
    "All three rings at full white load their LM2596 past its 2 A continuous rating (2.16 A; 3 A peak): limit brightness to 90 % in the sketch for anything longer than a burst.");
  const rec = finishWiring(H, { noClips: /^(ear_pod|faceplate_arm)/ }), A = H.A;
  const seen = new Map<string, number>(), bore = WIRING.grommet_bore_mm[String(GROMMET)];
  for (const c of rec.cables) for (const e of (c.exit ?? "").split(" + ").filter(Boolean)) seen.set(e, (seen.get(e) ?? 0) + c.wires.length);
  for (const [e, n] of seen) {
    const od = 1.5 * Math.sqrt(n) * 1.25, slot = e.startsWith("drive_");
    A.check(`wiring:exit:${e.replace(".", ":")}`, od <= (slot ? 13 : bore), `${n} wires bundle to ${od.toFixed(1)} mm through ${slot ? "the 40 x 13 mm slot in the driver bay's floor" : `the ${bore} mm bore of a ${GROMMET} mm grommet`}`);
  }
  // the span across each joint or hinge is the cable's loop: by design it lies free, so it is not counted against the channels
  const routed = rec.cables.filter((c) => c.joints.length), lined = routed.reduce((n, c) => n + (c.channel_mm ?? 0), 0), total = routed.reduce((n, c) => n + c.route_mm - c.joints.reduce((m, j) => m + j.home_mm, 0), 0);
  A.check("wiring:channels", routed.every((c) => (c.channel_mm ?? 0) > 0) && (!full || lined / total > 0.5), `${(lined / 1000).toFixed(1)} of ${(total / 1000).toFixed(1)} m of cable leaving the compartment, outside the loops at joints and hinges, lies in the shells' channels`);
  // the suit comes apart at the neck, the shoulders and the hips, and the bay lifts off its door: each lead has an inline plug there
  const splits = routed.reduce((n, c) => n + c.joints.filter((j) => /neck|shoulder|hip$|back_door/.test(j.joint)).length, 0), jst = WIRING.connectors.jst_xh_2_5;
  // the harness prices a 9.5 mm grommet by a key with a dot in it and so falls back to a smaller one: these are the right part
  const rubber = WIRING.consumables.grommet_9_5;
  for (const l of rec.bom) if (/^Rubber grommet/.test(l.item)) Object.assign(l, { item: rubber.name, unit_usd: rubber.unit_usd, subtotal_usd: +(l.qty * rubber.unit_usd).toFixed(2) });
  const add = (item: string, qty: number, usd: number, spec: string) => rec.bom.push({ item, qty, unit: "pc", unit_usd: usd, subtotal_usd: +(qty * usd).toFixed(2), spec, source: "estimated" });
  add(`${jst.name} inline plug and socket, 3 way`, splits, +(2 * (jst.housing_usd ?? 0) + 6 * jst.unit_usd).toFixed(2), "one on each lead at the neck, the shoulders, the hips and the back door's hinge, so helmet, limbs and battery bay come off");
  if (full) { const cap = WIRING.consumables.capacitor_1000uf; add(cap.name, 3, cap.unit_usd, "across 5 V and GND at each ring"); add("330 ohm resistor, 1/4 W", 3, 0.02, "in series with each ring's data line, at the Nano"); }
  rec.cost_usd = +rec.bom.reduce((n, l) => n + l.subtotal_usd, 0).toFixed(2);
  const load = rec.rails.find((r) => r.name === "VBAT")!;
  H.notes.push(`Run time from the ${PACK_AH} Ah pack at the typical ${load.typical_a} A: about ${(0.8 * PACK_AH / load.typical_a).toFixed(1)} h, keeping 20 % back (estimate; lights and faceplate never all run like that for hours).`);
  return rec;
}

/** What each door needs, from the armour and parts on it: inertia and centre of mass come from the spec, friction and clutch as above. */
function checkDoors(A: Assembly, doors: ArmourManifest["doors"], latches: ArmourManifest["latches"], s: number) {
  const out: Record<string, unknown>[] = [], spec = A.spec, tilts: [number, number][] = [[0, 0], [DOOR_LEAN, 0], [-DOOR_LEAN, 0], [0, DOOR_LEAN], [0, -DOOR_LEAN]];
  for (const d of doors) {
    const j = spec.joints.find((x) => x.name === d.joint)!, lo = j.limit!.lower!, hi = j.limit!.upper!, range = hi - lo, key = d.servo.key, I = swingInertia(spec, d.joint), carried = [...descendants(spec, d.link)].map((n) => spec.links.find((l) => l.name === n)!.mass).reduce((a, b) => a + b, 0);
    let hold = 0;
    for (const q of [0, 0.25, 0.5, 0.75, 1]) for (const [a, b] of tilts) hold = Math.max(hold, gravityTorques(spec, { [d.joint]: lo + (hi - lo) * q }, [], [9.81 * Math.sin(a), 9.81 * Math.sin(b), -9.81 * Math.cos(a) * Math.cos(b)])[d.joint] ?? 0);
    const accel = I * 6 * range / DOOR_SWING_S ** 2, friction = PIN_MU * carried * 9.81 * PIN_R_M * 2 + LOOP_NM, work = hold + friction, peak = work + accel;
    // the rail is 5 V: the servo's stall torque is read at 5 V from its datasheet points, its continuous rating scaled with it
    const r = rating(key), at = stallAt5V(key), k = at / r.peak_nm, edge = (d.reach_mm * s) / 1000, clutch = CLUTCH_FACTOR * peak, pinch = clutch / edge, hand = (clutch + friction) / edge;
    const e = evaluate(key, work, I), name = d.joint.replace("_hinge", "");
    A.design.joints.push({ joint: d.joint, actuator: key, required_nm: +peak.toFixed(3), rated_nm: +(r.rated_nm * k).toFixed(3), peak_nm: +at.toFixed(3), margin: +(at / peak).toFixed(2), speed_rad_s: +e.rating.speed_rad_s.toFixed(2), note: `${carried.toFixed(2)} kg, ${I.toFixed(4)} kg m2 about the hinge` });
    A.check(`door:${name}:range`, range >= 1.22 - 1e-6, `opens ${(range * 57.3).toFixed(0)} deg, measured by sweeping its armour, hardware and servos against everything else in the order the suit opens (needs 70)${d.stopped_by ? `; stopped by ${d.stopped_by}` : ""}`);
    A.check(`door:${name}:torque`, r.rated_nm * k >= work && at >= 1.5 * peak, `${carried.toFixed(2)} kg, ${I.toFixed(4)} kg m2 about the hinge: holds with ${work.toFixed(3)} N·m (gravity ${(DOOR_LEAN * 57.3).toFixed(0)} deg off plumb ${hold.toFixed(3)}, pins and cable loop ${friction.toFixed(3)}), peak ${peak.toFixed(3)} N·m to swing in ${DOOR_SWING_S} s; ${key} gives ${(r.rated_nm * k).toFixed(3)} continuous, ${at.toFixed(3)} stall at 5 V`);
    A.check(`door:${name}:clutch`, pinch <= PINCH_N && hand <= HAND_N, `clutch slips at ${clutch.toFixed(2)} N·m: a closing edge ${(edge * 1000).toFixed(0)} mm from the hinge presses at most ${pinch.toFixed(1)} N (target ${PINCH_N}, estimate), and a hand opens the door with no power at ${hand.toFixed(1)} N`);
    const mine = latches.filter((l) => l.door === d.link || (d.part === "head" || d.part === "torso") && l.region === d.region);
    const load = LATCH_LOAD_N / 2 / Math.max(mine.length, 1), pull = PAWL_SPRING_NM / CORD_ARM_M + (CORD_MU * load * PAWL_TIP_M) / CORD_ARM_M;
    A.check(`door:${name}:latch`, mine.length >= 1 && PAWL_SHEAR_N >= 2 * load, `${mine.length} sprung pawl(s) hold it shut with no power: ${LATCH_LOAD_N} N on the door, shared between its hinges and its free edge, puts ${load.toFixed(0)} N on a pawl that shears at about ${PAWL_SHEAR_N} N (estimate, not tested)`);
    A.check(`door:${name}:hand_release`, pull <= 2.5 * HAND_N, `a cord on each pawl lifts it by hand with no power: ${(PAWL_SPRING_NM / CORD_ARM_M).toFixed(1)} N free, ${pull.toFixed(0)} N with ${load.toFixed(0)} N pressing on the pawl (estimate)`);
    out.push({ joint: d.joint, link: d.link, parent: d.parent, servo: key, range_deg: +(range * 57.3).toFixed(1), alone_deg: d.alone_deg, mass_kg: +carried.toFixed(3), inertia_kg_m2: +I.toFixed(5), hold_nm: +work.toFixed(3), peak_nm: +peak.toFixed(3), stall_5v_nm: +at.toFixed(3), clutch_nm: +clutch.toFixed(3), pinch_n: +pinch.toFixed(1), hand_n: +hand.toFixed(1) });
  }
  return out;
}

/** Stall torque (N·m) at 5 V, between the datasheet's two voltage points. */
function stallAt5V(key: string): number {
  const pts = Object.entries(part(key).specs.stall_torque_kgcm_at_v as Record<string, number>).map(([v, t]) => [Number(v), t * 0.0980665]).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return pts[0][1];
  const [a, b] = pts; return a[1] + ((b[1] - a[1]) * Math.min(Math.max(5 - a[0], 0), b[0] - a[0])) / (b[0] - a[0]);
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
