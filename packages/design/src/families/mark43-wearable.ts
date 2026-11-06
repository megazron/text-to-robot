// Iron Man Mark 43 as armour a person can wear, built body first. A parametric wearer (1.75 m default, segment lengths
// and girths from standard ratios, 89 cm chest) stands inside. The armour is not lofted from primitives: it comes from a
// sculpted figure of the suit (see scripts/armour_from_reference.py), mapped bone to bone onto the wearer, hollowed to a
// 3 mm shell under the sculpt's skin, kept off the body, cut back wherever a limb swings, and split into pieces that fit
// a 250 x 210 x 220 mm bed with panel-line seams. The result ships as a pack (packages/parts/data/mark43_pack.*); this
// designer places it on the wearer and adds what makes it work: the faceplate lifted by two MG996R in the ear pods, LEDs
// behind translucent eye, chest and palm lenses, and an Arduino Nano, an LM2596 and a 2S 18650 pack in a back box.
// The wearer moves the joints (passive in the model); the limits are measured by sweeping armour against armour.
//
// Tiers (Arduino mode): helmet (motorised helmet + LED eyes), lights (helmet + torso with arc reactor + arms with
// repulsors), suit (every piece). A powered suit that moves the wearer cannot be built from hobby parts; asked for, the
// result says so.
import type { RobotSpecification, Joint } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { mul, translation, toPose, type Mat4 } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { armourManifest } from "@ttr/mesh";
import { Assembly } from "../assembly.ts";
import { totalMass, gravityTorques } from "../kin.ts";
import { DYNAMIC_FACTOR } from "../sizing.ts";

export type Mark43Tier = "helmet" | "lights" | "suit";
export interface Mark43Request { name?: string; prompt?: string; budget?: number; heightM?: number; tier?: Mark43Tier; }

type Sec = [number, number, number, number?, number?];
const T = 3, SERVO = "hobby_mg996r", FILAMENT_USD_PER_KG = 22, SLIM = 0.94;
const rotX = (a: number): Mat4 => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
const scaleSecs = (secs: Sec[], s: number): Sec[] => secs.map(([z, rx, ry, cx, cy]) => [z * s, rx * s, ry * s, (cx ?? 0) * s, (cy ?? 0) * s]);
const apply = (m: Mat4, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const I4: Mat4 = translation([0, 0, 0]);

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
  const bodyLink = (name: string, secs: Sec[], massKg: number) => A.cadLink(name, { name, ops: [{ op: "loft", sections: secs }] }, { role: "wearer", material: "wearer", printed: false, massKg });

  // ---------------- wearer (standing, arms 15 deg out). World: z up from the floor, x forward, y left.
  const hipZ = 920 * s, kneeZ = 490 * s, ankleZ = 80 * s, shZ = 1420 * s, shY = 185 * s, neckZ = 1520 * s, ABD = 15 * Math.PI / 180;
  const upperL = 310 * s, foreL = 250 * s;
  const torsoSecs = scaleSecs(([[900, 112, 165], [1000, 108, 150], [1100, 108, 150], [1200, 118, 165], [1300, 128, 172], [1400, 120, 170], [1460, 82, 120]] as Sec[]).map(([z, rx, ry]) => [z, rx * SLIM, ry * SLIM] as Sec), s);
  const headSecs: Sec[] = scaleSecs([[20, 75, 60, 15], [80, 95, 75, 5], [140, 100, 80], [200, 85, 70], [228, 30, 25]], s);
  // root on the floor between the feet, so the wearer stands on the ground in every viewer and simulator
  A.frameLink("base_link", "base");
  bodyLink("pelvis", torsoSecs.map(([z, rx, ry]) => [z - hipZ, rx, ry] as Sec), 0);   // torso mass is lumped below
  fixed("standing", "base_link", "pelvis", translation([0, 0, hipZ]));
  A.spec.links[A.spec.links.length - 1].mass = 38 * s ** 3;
  bodyLink("head", headSecs.map(([z, rx, ry, cx]) => [z, rx, ry, cx] as Sec), 5 * s ** 3);
  fixed("neck_mount", "pelvis", "head", translation([0, 0, neckZ - hipZ]));
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
      fixed(`${L}_wrist`, `${L}_forearm`, `${L}_hand`, translation([0, 0, -foreL]));
      bodyLink(`${L}_thigh`, scaleSecs([[-60, 80, 76], [-200, 75, 72], [-400, 55, 55]], s), 9 * s ** 3);   // top within the hip width
      passive(`${L}_hip`, "pelvis", `${L}_thigh`, translation([0, side * 90 * s, 0]), [0, 1, 0], -1.9, 0.4);
      bodyLink(`${L}_shin`, scaleSecs([[-20, 52, 50, -4], [-140, 56, 54, -10], [-300, 42, 40, -6], [-400, 33, 33]], s), 3.5 * s ** 3);
      passive(`${L}_knee`, `${L}_thigh`, `${L}_shin`, translation([0, 0, kneeZ - hipZ]), [0, 1, 0], 0, 2.2);
      // foot: a loft along x (local z -> world x), 80 mm down to the floor
      const footOps: Op[] = [{ op: "at", T: place([0, 0, -1], [0, 1, 0], [1, 0, 0], [0, 0, 0]), of: [{ op: "loft", sections: scaleSecs([[-60, 40, 38, 40], [60, 32, 45, 50], [190, 15, 40, 65]], s) }] }];
      A.cadLink(`${L}_foot`, { name: `${L}_foot`, ops: footOps }, { role: "wearer", material: "wearer", printed: false, massKg: 1.1 * s ** 3 });
      fixed(`${L}_ankle`, `${L}_shin`, `${L}_foot`, translation([0, 0, ankleZ - kneeZ]));
    }
  }

  // ---------------- faceplate mechanism (head frame): servos in the ear pods, pivot where the faceplate opens furthest (found when the pack is made)
  const earX = man.hinge[0] * s, earZ = man.hinge[1] * s, earY = 128 * s, faceX = Math.max(man.face_rear_x * s, earX + 31);   // the bar stands clear of the horn pocket
  const Tear = (side: 1 | -1): Mat4 => place([0, 0, 1], [side, 0, 0], [0, side, 0], [earX, side * earY, earZ]);   // output points outwards (right-handed: y = z x x)
  const TL = Tear(1), inv = invertRigid(TL), pods: Record<number, string> = {};
  for (const side of [1, -1] as const) {
    const name = `ear_pod_${side > 0 ? "left" : "right"}`;
    A.cadLink(name, { name, edge: 0.6, ops: [{ op: "rod", a: [earX, side * 96 * s, earZ], b: [earX, side * (earY - 1), earZ], r: 28 * s }, { op: "cradle", key: SERVO, T: Tear(side), wall: 2.2 }] }, { material: "armour_red", role: "armour" });
    fixed(`${name}_mount`, "head", name, I4);
    pods[side] = name;
  }
  // the arms: a horn on each servo, a strap forward along the cheek and a bar into the faceplate's side edge
  const reach = faceX - earX + 8;
  A.frameLink("helmet_faceplate", "armour");
  const armNames: string[] = [];
  for (const side of [1, -1] as const) {
    const name = `faceplate_arm_${side > 0 ? "left" : "right"}`;
    const ops: Op[] = [{ op: "at", T: mul(inv, Tear(side)), of: [{ op: "horn", key: SERVO, t: 3, extra: 3 }, { op: "box", min: [-10, side > 0 ? 0 : -reach, 0], max: [10, side > 0 ? reach : 0, 8], r: 0 }] },
      { op: "at", T: inv, of: [{ op: "box", min: [faceX - 2, side > 0 ? 98 * s : -(earY + 8), earZ - 6], max: [faceX + 8, side > 0 ? earY + 8 : -98 * s, earZ + 6], r: 0 }] }];
    A.cadLink(name, { name, ops }, { material: "armour_gold", role: "armour" });
    A.fixed(`${name}_mount`, "helmet_faceplate", name, I4);
    armNames.push(name);
  }
  const fpLim = man.limits.faceplate ?? [-1, 0];
  A.mount(pods[1], SERVO, TL, "faceplate_servo_left", "faceplate servo (left ear)");
  A.mount(pods[-1], SERVO, Tear(-1), "faceplate_servo_right", "faceplate servo (right ear, mirrored)");
  A.revolute("faceplate", pods[1], "helmet_faceplate", TL, SERVO, fpLim[0], 0);   // servo axis +y: opening (front up) is negative
  W.helmet_faceplate = mul(W.head, TL);

  // ---------------- armour: the fitted pieces, each fixed to the link it rides on
  const pieces = man.pieces.filter((p) => TIER_REGIONS[tier].test(p.region));
  const toLink = (link: string): number[] => { const m = invertRigid(W[link]).slice(); m[12] /= 1000; m[13] /= 1000; m[14] /= 1000; return m; };
  const bonded: [string, string][] = [];
  for (const p of pieces) {
    const name = p.name === p.link ? `${p.name}_shell` : p.name;   // the faceplate's shell rides on the link of the same name
    A.armourLink(name, p.name, s, toLink(p.link), { material: p.material });
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
      A.mount(p.name, "ws2812_ring_12", place([1, 0, 0], [0, 0, 1], [0, -side, 0], [c[0] - 6, c[1] + side * 4, c[2] - 8]), `${p.region.split("_")[0]}_repulsor`, "palm repulsor ring");
    }
  }

  if (full) {
    // ---------------- electronics box against the lower back
    const lumbar = pieces.filter((p) => p.region === "torso" && Math.abs(p.centroid[2] - 1150) < 130 && Math.abs(p.centroid[1]) < 110);
    const back = (lumbar.length ? Math.min(...lumbar.map((p) => p.lo[0])) : -170) * s, zb = 1120 * s - hipZ;
    const boxOps: Op[] = [{ op: "box", min: [back - 56, -55, zb], max: [back - 0.5, 55, zb + 95], r: 8 }, { op: "subtract", of: [{ op: "box", min: [back - 53, -52, zb + 3], max: [back - 3.5, 52, zb + 96], r: 5 }] }];
    A.cadLink("electronics_box", { name: "electronics_box", ops: boxOps }, { material: "armour_red", role: "armour" });
    fixed("electronics_box_mount", "pelvis", "electronics_box", I4);
    A.mount("electronics_box", "pack_2s_18650", place([0, 0, 1], [0, 1, 0], [-1, 0, 0], [back - 28, 0, zb + 5]), "battery", "2S 18650 pack");
    // boards stand on the box's inner walls, components facing into the box (board y = -x, board z = -y)
    A.mount("electronics_box", "arduino_nano_clone", place([0, 0, 1], [-1, 0, 0], [0, -1, 0], [back - 4, -30, zb + 10]), "controller", "Arduino Nano");
    A.mount("electronics_box", "buck_lm2596", place([0, 0, 1], [-1, 0, 0], [0, -1, 0], [back - 4, 50, zb + 10]), "regulator", "LM2596 5 V for servos and LEDs");
  }

  // ---------------- checks: measured joint ranges, faceplate servo, supply, printing, cost
  const moving = full ? ["faceplate", ...["left", "right"].flatMap((L) => [`${L}_shoulder`, `${L}_elbow`, ...(tier === "suit" ? [`${L}_hip`, `${L}_knee`] : [])])] : ["faceplate"];
  const range = (n: string) => { const j = A.spec.joints.find((x) => x.name === n)!; return [j.limit!.lower!, j.limit!.upper!]; };
  // walking, stairs, reaching forward, bending the arm: what the suit is required to allow
  const need: Record<string, [number, number]> = { faceplate: [-0.9, 0], left_elbow: [-1.8, 0], right_elbow: [-1.8, 0], left_shoulder: [-1.0, 0.2], right_shoulder: [-1.0, 0.2],
    left_hip: [-1.0, 0.2], right_hip: [-1.0, 0.2], left_knee: [0, 1.6], right_knee: [0, 1.6] };
  for (const n of moving) {
    const [lo, hi] = range(n), [nlo, nhi] = need[n] ?? [0, 0];
    A.check(`wearable:${n}`, lo <= nlo + 1e-6 && hi >= nhi - 1e-6, `moves ${(lo * 57.3).toFixed(0)} to ${(hi * 57.3).toFixed(0)} deg, measured by sweeping its armour against the armour it hangs from (needs ${(nlo * 57.3).toFixed(0)} to ${(nhi * 57.3).toFixed(0)})`);
  }
  let wFace = 0;
  for (const q of [0, -0.45, -0.9]) wFace = Math.max(wFace, Math.abs(gravityTorques(A.spec, { faceplate: q }).faceplate ?? 0));
  const r = rating(SERVO);
  A.design.joints.push({ joint: "faceplate", actuator: SERVO, required_nm: +(wFace * DYNAMIC_FACTOR).toFixed(4), rated_nm: 2 * r.rated_nm, peak_nm: 2 * r.peak_nm, margin: +((2 * r.peak_nm) / Math.max(wFace * DYNAMIC_FACTOR, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: "two MG996R share the faceplate" });
  A.check("torque:faceplate", 2 * r.rated_nm >= wFace, `two MG996R hold the faceplate open (${wFace.toFixed(3)} N·m vs ${(2 * r.rated_nm).toFixed(3)} N·m continuous)`);
  const leds = A.purchasedList().filter((p) => p.key === "ws2812_ring_12").reduce((n, p) => n + p.qty, 0);
  // the servos are never stalled for long: holding the plate draws its share of stall current; a travel surge is fused
  const holdA = 2 * Number(part(SERVO).specs.stall_current_a) * (wFace / (2 * r.peak_nm)), amps = holdA + leds * 12 * 0.02 + 0.2;
  if (full) A.check("power:supply", amps <= Number(part("buck_lm2596").specs.current_a), `servos holding the faceplate open + LEDs at 1/3 white: ${amps.toFixed(2)} A of the LM2596's 3 A`);
  else { A.buy("arduino_nano_clone", 1, "Arduino Nano (in a belt pouch)"); A.buy("pack_2s_18650", 1, "2S 18650 pack (belt pouch)"); A.buy("buck_lm2596", 1, "LM2596 5 V"); }
  const straps = full ? (tier === "suit" ? 22 : 10) : 0;
  if (straps) A.buy("strap_50mm_velcro", straps, "webbing straps closing the shells round each limb");
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 4);
  const printedKg = A.design.printed.reduce((m, p) => m + p.mass_kg, 0), filament = printedKg * 1.08 * FILAMENT_USD_PER_KG;
  const bom = A.bom(), cost = bom.cost_usd + filament;
  if (req.budget !== undefined) A.check("budget", cost <= req.budget, `$${cost.toFixed(2)} (parts $${bom.cost_usd.toFixed(2)} + filament $${filament.toFixed(2)}) vs $${req.budget}`);
  const armourKg = A.spec.links.filter((l) => l.role === "armour").reduce((m, l) => m + l.mass, 0);
  const printedCount = A.design.printed.length;
  A.design.performance = { tier, tier_label: tier === "helmet" ? "motorised helmet" : tier === "lights" ? "helmet + chest + gauntlets" : "full wearable suit",
    wearer_height_m: +(H / 1000).toFixed(2), printed_pieces: printedCount, armour_mass_kg: +armourKg.toFixed(2), filament_kg: +(printedKg * 1.08).toFixed(2), cost_usd: +cost.toFixed(2), mass_kg: +totalMass(A.spec).toFixed(2) };
  A.design.assumptions.push(`armour shape from: ${man.source}; 3 mm walls, 2 mm faceplate, 15 % gyroid infill (shells are mostly walls)`, `filament at $${FILAMENT_USD_PER_KG}/kg, 8 % waste`,
    "the suit is worn armour over a black undersuit: the wearer moves every joint; nothing powers the limbs (hobby servos cannot move a person)",
    "the wearer is 89 cm chest at 1.75 m and the pieces scale evenly with height; check against your own measurements before printing",
    "gaps at the groin, armpits and elbows are cut on purpose so the joints move; the undersuit shows through them, as on real builds");
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Iron Man Mark 43 (${A.design.performance.tier_label}): ${printedCount} printed pieces, ${(printedKg * 1.08).toFixed(1)} kg filament, motorised faceplate, $${cost.toFixed(0)} incl. filament`);
}

function invertRigid(m: Mat4): Mat4 {
  const R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t = [m[12], m[13], m[14]];
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const ti = [0, 1, 2].map((i) => -(Rt[i][0] * t[0] + Rt[i][1] * t[1] + Rt[i][2] * t[2]));
  return [Rt[0][0], Rt[1][0], Rt[2][0], 0, Rt[0][1], Rt[1][1], Rt[2][1], 0, Rt[0][2], Rt[1][2], Rt[2][2], 0, ti[0], ti[1], ti[2], 1];
}
