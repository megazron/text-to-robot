// Robot-family vocabulary and template selection for the local prompt parser.
import type { RobotSpecification } from "@ttr/robot-schema";
import { designArm, designDiffDrive, designFourWheel, designMecanum, designRover, designWallE, designEva, designBaymax, designQuadruped, designHexapod, designHumanoid, designBattleMech, designScara, designGripper, type LeggedRequest } from "@ttr/design";
import type { SensorType } from "@ttr/robot-schema";
import { nDofArm, scara, roverArm, wearableExosuit, ironManMark43, attachParallelGripper, attachSuctionGripper } from "@ttr/robot-templates";
import { find, mentions, negates, isDirectlyNegated } from "./text.ts";
import { armTip, replaceGripperWithSuction } from "./grippers.ts";

export const MAX_ARM_DOF = 7; // the arm designer builds 1–7 DOF chains

export type GripperKind = "parallel" | "suction" | "none";

// ---------------- request vocabulary ----------------
export const RX = {
  suit: /iron[\s-]?man|exosuit|exo[\s-]?skeleton|wearable|power(?:ed)?\s+(?:armou?r|suit)|mech\s+suit|battle\s+(?:suit|mech)/,
  wallE: /wall[\s-]?e\b|trash[\s-]?compactor|garbage\s+robot/,
  eva: /\beva\b|probe\s+droid|egg[\s-]?shaped|hover(?:ing)?\s+(?:robot|droid|bot)/,
  baymax: /baymax|\binflatable\b|healthcare\s+companion/,
  humanoid: /humanoid|\bbiped(?:al)?\b|\b(?:two|2)[\s-]?legged\b|\b(?:two|2) legs\b|torso.*\barms\b|\btwo\s+arms\b/,
  dualArm: /\bdual[\s-]?arm(?:ed)?\b|\bbimanual\b|\btwo[\s-]armed\b/,
  hexapod: /hexapod|\b(?:six|6)[\s-]?legged\b|\b(?:six|6) legs\b|spider|insect|ant[\s-]?bot/,
  octopod: /\b(?:eight|8)[\s-]?legged\b|\b(?:eight|8) legs\b|octopod/,
  // a wheeled/tracked base and an arm in either order, or "mobile manipulator"
  roverArm: new RegExp([
    String.raw`(rover|mars|planetary|explorer|loader|wheel(?:ed|s)|track(?:ed|s)|\btank\b|crawler|skid[\s-]?steer|\b4wd\b|mecanum|mobile\s+(?:base|robot|platform)).*\b(arms?|manipulat\w*)\b`,
    String.raw`\b(arms?|manipulat\w*)\b.*(rover|mars|planetary|mobile\s+base|wheels|wheeled|tracks|tracked)`,
    String.raw`mobile\s+manipulat`,
  ].join("|")),
  quadruped: /quadruped|\b(?:four|4)[\s-]?legged\b|\b(?:four|4) legs\b|\bdog\b|robo[\s-]?dog|\blegged\b/,
  scara: /\bscara\b/,
  mecanum: /mecanum/,
  omni: /omni[\s-]?(?:wheels?|directional)|holonomic/,
  fourWheel: /\b(?:four|4)[\s-]?wheel(?:ed|s)?\b|\b4wd\b|skid[\s-]?steer/,
  tracked: /\btrack(?:ed|s)\b|\btank\b|\bcrawler\b|\btreads?\b/,
  diffDrive: /diff(?:erential)?[\s-]?drive|\b(?:two|2)[\s-]?wheel(?:ed|s)?\b|mobile\s+(?:base|robot|platform)|\brover\b|robot(?:ic)?\s+vacuum|vacuum\s+(?:cleaner|robot)|turtlebot|cleaning\s+robot|delivery\s+robot|wheeled\s+robot|\b(?:robot(?:ic)?\s+|rc\s+|smart\s+|arduino\s+)?cars?\b|\bbuggy\b|\bvehicle\b|line[\s-]?follow(?:er|ing)\b|obstacle[\s-]?avoid(?:er|ing|ance)\b/,
  legs: /\blegs\b|\bwalking\s+robot\b/,
  wheels: /\bwheels\b|\bwheeled\b/,
  gripper: /gripper|end[\s-]?effector|\bclaw\b|suction\s+cup/,
  arm: /\barms?\b|manipulator|\bcobot\b|industrial\s+robot|pick[\s-](?:and|&|n)[\s-]place/,
  hand: /robot(?:ic)?\s+hand|dexterous\s+hand|\bprosthetic\b/,
};

/** Families we do not generate; each says why and what to try instead. */
export const UNSUPPORTED: [RegExp, string][] = [
  [/\bdrones?\b|quad[\s-]?copter|multi[\s-]?rotor|\buav\b|hexacopter|\baircraft\b/, "Aerial robots (drones, multirotors) are not supported yet. Try a wheeled rover, legged robot or arm."],
  [/\bdelta\s+robot|parallel\s+(?:robot|manipulator|kinematic)|stewart\s+platform|\bhexapod\s+platform/, "Parallel-kinematics robots (delta, Stewart) are not supported yet. Try a SCARA or a serial arm."],
  [/\bgantry\b|\bcartesian\s+robot|\bxyz\s+(?:stage|robot)/, "Cartesian/gantry robots are not supported yet. Try a SCARA or a serial arm."],
  [/\bsnake\s+robot|\bserpentine\b/, "Snake robots are not supported yet. Try a hexapod or a serial arm."],
  [/underwater|\bauv\b|\brov\b|submarine|\bboat\b|\bfish\s+robot/, "Underwater and marine robots are not supported yet. Try a wheeled rover."],
];

export const SUPPORTED_HINT = "Try an arm (\"6 DOF arm with a gripper\"), SCARA, gripper, wheeled base (differential, four-wheel, mecanum), mobile manipulator, quadruped, hexapod, humanoid, wearable exosuit or a character (WALL-E, EVA, Baymax, Iron Man).";

export function gripperRequest(t: string): { kind: GripperKind; explicit: boolean; note?: string } {
  const noGripper = negates(t, /gripper|end[\s-]?effector|claw|hand/) && !mentions(t, /gripper|end[\s-]?effector|claw|suction/);
  if (noGripper) return { kind: "none", explicit: true };
  if (mentions(t, /suction|vacuum\s+(?:gripper|cup|tool)|\bvacuum\b(?!\s+(?:cleaner|robot))/) && !mentions(t, /robot(?:ic)?\s+vacuum|vacuum\s+(?:cleaner|robot)/)) return { kind: "suction", explicit: true };
  const multi = find(t, /\b(?:three|four|five|3|4|5|multi)[\s-]?finger(?:ed)?\b|dexterous/);
  if (multi) return { kind: "parallel", explicit: true, note: `"${multi.text}" gripper approximated by a two-finger parallel gripper` };
  return { kind: "parallel", explicit: mentions(t, RX.gripper) };
}

/** What the prompt asks for, known before the robot is designed. */
/** "SG90 servos", "MG996R", "Arduino": an Arduino + PCA9685 hobby-servo build, optionally limited to the named servos */
export interface HobbyServos { only?: string[] }
export interface DesignContext { hobby?: HobbyServos; prompt: string; budget?: number; payloadKg?: number; reachM?: number; segments?: { upper_arm: number; forearm: number }; sensors: SensorType[]; /** sensor types the prompt rules out ("no lidar") */ excludeSensors: SensorType[]; heightM?: number; }
export interface Choice { family: string; label: string; matched: string; build: (ctx: DesignContext) => RobotSpecification; usesDof?: boolean; usesGripper?: boolean; approx?: string;
  /** built by the parts-first design engine (sized from real components) rather than a fixed template */
  designed?: boolean; }

const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8 };
/** "four wheels", "6-wheeled" */
export function wheelCount(t: string): number | undefined {
  const m = t.match(/\b(two|three|four|five|six|eight|\d+)[\s-]+wheel(?:s|ed)?\b/);
  return m ? (NUM[m[1]] ?? parseInt(m[1], 10)) : undefined;
}
/** common inputs of every wheeled designer */
const mobileReq = (ctx: DesignContext) => ({ prompt: ctx.prompt, budget: ctx.budget, sensors: ctx.sensors as never, ...(ctx.excludeSensors.length ? { excludeSensors: ctx.excludeSensors as never } : {}), ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) });

/** common inputs of the legged designers (they fit camera, depth, lidar and IMU parts) */
const leggedReq = (ctx: DesignContext, heightM = ctx.heightM): LeggedRequest => ({ prompt: ctx.prompt, budget: ctx.budget,
  sensors: ctx.sensors.filter((x) => ["camera", "depth", "lidar", "imu"].includes(x)) as LeggedRequest["sensors"],
  ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}), ...(heightM ? { heightM } : {}) });

export function chooseFamily(t: string, prompt: string, dof: number | undefined, g: GripperKind, heightM?: number, explicitGripper = false): Choice {
  // "no camera on my quadruped" negates the camera, not the quadruped: only "not a quadruped" rejects a family
  const hit = (rx: RegExp) => find(t, rx)?.text ?? [...t.matchAll(new RegExp(rx.source, "g"))].find((m) => !isDirectlyNegated(t, m.index!))?.[0];
  let m: string | undefined;

  if ((m = hit(RX.suit))) {
    // a suit is WORN: build the wearable exoskeleton; "battle mech" (standalone robot) is a humanoid
    if (/\bmech\b(?!\s+suit)/.test(t) && !/iron[\s-]?man|exo|wearable|suit/.test(t)) return { family: "battle_mech", label: "humanoid battle mech", matched: m, usesDof: true, designed: true,
        build: (ctx) => designBattleMech({ name: "battle_mech", ...leggedReq(ctx), ...(dof ? { armDof: dof } : {}) }) };
    if (/iron[\s-]?man|mark\s*(?:[ivx]+|\d+)|armou?r|movie|ultron/.test(t)) return { family: "iron_man_mark_43", label: "Iron Man Mark 43 wearable suit", matched: m,
        build: () => ironManMark43({ prompt, ...(heightM ? { height_m: heightM } : {}) }) };
    return { family: "exosuit", label: "wearable exoskeleton", matched: m,
        build: () => wearableExosuit({ prompt, styled: false, name: "exosuit", ...(heightM ? { height_m: heightM } : {}) }) };
  }
  if ((m = hit(RX.wallE))) return { family: "wall_e", label: "WALL-E character", matched: m, designed: true, build: (ctx) => designWallE({ name: "wall_e", ...mobileReq(ctx) }) };
  if ((m = hit(RX.eva))) return { family: "eva", label: "EVA character", matched: m, designed: true, build: (ctx) => designEva({ name: "eva", ...mobileReq(ctx) }) };
  if ((m = hit(RX.baymax))) return { family: "baymax", label: "Baymax character", matched: m, designed: true, build: (ctx) => designBaymax({ name: "baymax", ...mobileReq(ctx) }) };
  for (const [rx, why] of UNSUPPORTED) if (mentions(t, rx)) throw new Error(why);
  const humanoidOf = (matched: string, approx?: string): Choice => ({ family: "humanoid", label: "humanoid", matched, approx, usesDof: true, usesGripper: true, designed: true,
    // above ~0.9 m servo legs cannot carry the robot: full-size humanoids use the QDD (CubeMars) design
    build: (ctx) => (ctx.heightM ?? 0) > 0.9 ? designBattleMech({ name: "humanoid_robot", ...leggedReq(ctx), ...(dof ? { armDof: dof } : {}) })
      : designHumanoid({ name: "humanoid_robot", ...leggedReq(ctx), ...(dof ? { armDof: dof } : {}), gripper: g !== "none" }) });
  if ((m = hit(RX.humanoid))) return humanoidOf(m);
  if ((m = hit(RX.dualArm))) return humanoidOf(m, "dual-arm robot built on the humanoid template (includes legs)");
  if ((m = hit(RX.hexapod))) return { family: "hexapod", label: "hexapod", matched: m, designed: true, build: (ctx) => designHexapod({ name: "hexapod", ...leggedReq(ctx) }) };
  if ((m = hit(RX.octopod))) return { family: "hexapod", label: "hexapod", matched: m, approx: "eight legs approximated by the six-legged hexapod",
      designed: true, build: (ctx) => designHexapod({ name: "hexapod", ...leggedReq(ctx) }) };
  if ((m = hit(RX.roverArm))) return { family: "rover_arm", label: "mobile manipulator (wheeled rover + arm)", matched: m, usesDof: true, usesGripper: true,
    approx: mentions(t, RX.tracked) ? "tracks approximated by the wheeled rover base" : mentions(t, RX.mecanum) || mentions(t, RX.omni) ? "the arm is mounted on the wheeled rover base, not a mecanum base" : undefined,
    ...(g === "suction" ? { build: () => { const s = roverArm("rover_arm", dof ?? 6, prompt, { gripper: "parallel" }); replaceGripperWithSuction(s); return s; } }
      : { designed: true, build: (ctx: DesignContext) => designRover({ name: "rover_arm", ...mobileReq(ctx), payloadKg: undefined, wheels: wheelCount(t) ?? 6, arm: { dof: dof ?? 6, ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) } }) }) };
  if ((m = hit(RX.quadruped))) return { family: "quadruped", label: "quadruped", matched: m, designed: true, build: (ctx) => designQuadruped({ name: "quadruped", ...leggedReq(ctx) }) };
  if ((m = hit(RX.scara))) {
    const task = /\bpick(?:s|ing)?\b|\bplace\b|\bsort(?:s|ing)?\b|\bgrab(?:s|bing)?\b|\bpackag(?:e|ing)\b|\bassembl(?:e|y|ing)\b/.test(t);
    // the designed SCARA carries a parallel gripper; a suction cup (named, or a pick task with no jaws asked for) keeps the template SCARA
    if (g === "suction" || (task && !explicitGripper)) return { family: "scara", label: "SCARA", matched: m, usesGripper: true,
      build: () => { const s = scara({ prompt }); const tip = armTip(s); if (tip) attachSuctionGripper(s, tip.link, tip.atZ); return s; } };
    return { family: "scara", label: "SCARA", matched: m, usesGripper: true, designed: true,
      build: (ctx) => designScara({ name: "scara", prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg, reachM: ctx.reachM, sensors: ctx.sensors }) };
  }
  if ((m = hit(RX.mecanum))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, designed: true, build: (ctx) => designMecanum({ name: "mecanum_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.omni))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, approx: "omni-directional drive built with mecanum wheels",
      designed: true, build: (ctx) => designMecanum({ name: "mecanum_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.fourWheel))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m,
      designed: true, build: (ctx) => designFourWheel({ name: "four_wheel_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.tracked))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m, approx: "tracks approximated by a four-wheel skid-steer base",
      designed: true, build: (ctx) => designFourWheel({ name: "four_wheel_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.diffDrive))) return { family: "diff_drive", label: "differential-drive base", matched: m,
      designed: true, build: (ctx) => designDiffDrive({ name: "diff_drive_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.legs))) return { family: "quadruped", label: "quadruped", matched: m, designed: true, build: (ctx) => designQuadruped({ name: "quadruped", ...leggedReq(ctx) }) };
  if ((m = hit(RX.wheels)) && !mentions(t, RX.arm)) return { family: "diff_drive", label: "differential-drive base", matched: m,
      designed: true, build: (ctx) => designDiffDrive({ name: "diff_drive_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.gripper)) && !mentions(t, RX.arm)) return { family: "gripper", label: `standalone ${g === "suction" ? "suction" : "parallel"} gripper`, matched: m, usesGripper: true,
    ...(g === "suction" ? { build: () => standaloneGripper("suction", prompt) }
      : { designed: true, build: (ctx: DesignContext) => designGripper({ name: "parallel_gripper", prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg }) }) };
  if (mentions(t, RX.hand)) throw new Error("Dexterous robot hands are not supported yet. Try \"two-finger parallel gripper\" or a humanoid.");
  m = hit(RX.arm);
  if (!m && dof === undefined) {
    // only a task was described: pick the robot type that does it, and say why
    for (const [rx, as, why] of TASKS) {
      const tm = t.match(rx);
      if (tm) { const c = chooseFamily(as, as, dof, g, heightM, explicitGripper); return { ...c, matched: tm[0], approx: `"${tm[0]}" is a task, not a robot type: built a ${c.label} (${why})${c.approx ? `; ${c.approx}` : ""}` }; }
    }
    throw new Error(`Robot type not recognised. ${SUPPORTED_HINT}`);
  }
  const n = dof ?? 6;
  if (g === "suction") return { family: "serial_arm", label: `${n}-DOF serial arm`, matched: m ?? `${n} DOF`, usesDof: true, usesGripper: true, designed: true,
    build: (ctx) => {
      // the designed arm without jaws, a suction cup on its tool flange
      const s = designArm({ name: `arm_${n}dof`, dof: n, gripper: false, prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg, reachM: ctx.reachM, segments: ctx.segments, sensors: ctx.sensors,
        ...(ctx.hobby ? { ladder: "hobby" as const, ...(ctx.hobby.only ? { onlyActuators: ctx.hobby.only } : {}) } : {}) });
      const tool = (s.metadata as { design?: { tool?: { link: string; xyz_m: number[] } } }).design?.tool;
      if (tool) attachSuctionGripper(s, tool.link, tool.xyz_m[2]); else { const tip = armTip(s); if (tip) attachSuctionGripper(s, tip.link, tip.atZ); }
      return s; } };
  return { family: "serial_arm", label: `${n}-DOF serial arm`, matched: m ?? `${n} DOF`, usesDof: true, usesGripper: true, designed: true,
    build: (ctx) => designArm({ name: `arm_${n}dof`, dof: n, gripper: g !== "none", prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg, reachM: ctx.reachM, segments: ctx.segments, sensors: ctx.sensors,
      ...(ctx.hobby ? { ladder: "hobby" as const, ...(ctx.hobby.only ? { onlyActuators: ctx.hobby.only } : {}) } : {}) }) };
}

/** Task words -> the robot that does the task (used only when no robot type is named). Most specific first. */
const TASKS: [RegExp, string, string][] = [
  [/\bwater(?:s|ing)?\b[\w\s]{0,20}\b(?:plants?|garden|flowers?|pots?)\b|\b(?:garden(?:ing)?|weed(?:s|ing)?|harvest(?:s|ing)?|fruit[\s-]?pick\w*)\b/, "mobile manipulator rover with an arm", "it drives to each plant and aims the tool with the arm"],
  [/\b(?:fetch(?:es|ing)?|tidy|tidies|tidying|clean(?:s|ing)? up|pick(?:s|ing)? up (?:toys|things|stuff|clothes|trash|litter)|serve(?:s|ing)? (?:drinks|food|tea|coffee))\b/, "mobile manipulator rover with an arm", "it moves around the room and picks things up"],
  [/\b(?:climb(?:s|ing)? stairs|stairs|rough terrain|hik(?:e|es|ing)|off[\s-]?road|rocky|uneven ground)\b/, "quadruped", "legs handle steps and rough ground"],
  [/\b(?:deliver(?:s|y|ing)?|carr(?:y|ies|ying)|transport(?:s|ing)?|haul(?:s|ing)?|patrol(?:s|ling)?|security|explor(?:e|es|ing)|map(?:s|ping)? (?:the |my )?(?:house|room|office|area)|follow(?:s|ing)? me|vacuum(?:s|ing)? (?:the )?floor|mow(?:s|ing)?)\b/, "four-wheel robot with a camera", "a wheeled base carries the load and covers distance"],
  [/\b(?:pick(?:s|ing)?(?:[\s-]+(?:and|&|n)[\s-]+place)?|sort(?:s|ing)?|stack(?:s|ing)?|assembl(?:e|es|y|ing)|pack(?:s|ing)?|solder(?:s|ing)?|paint(?:s|ing)?|draw(?:s|ing)?|writ(?:e|es|ing)|pour(?:s|ing)?|cook(?:s|ing)?|grab(?:s|bing)?|lift(?:s|ing)?|weld(?:s|ing)?|3d[\s-]?print\w*|play(?:s|ing)? chess)\b/, "6 dof robot arm with a gripper", "a fixed arm does precise work at a bench"],
  [/\b(?:walk(?:s|ing)?|run(?:s|ning)?|jump(?:s|ing)?|dance|dancing)\b/, "quadruped", "legged robots walk; a quadruped is the most stable"],
  [/\b(?:companion|pet|friend|talk(?:s|ing)? to me|greet(?:s|ing)?|reception(?:ist)?)\b/, "differential drive robot", "a small wheeled robot that can follow people around"],
];

export const ARM_FAMILIES = new Set(["serial_arm", "rover_arm", "scara"]);
/** templates with a generic structural material we may recolour (characters keep their livery) */
export const RECOLOURABLE = new Set(["serial_arm", "rover_arm", "scara", "humanoid", "quadruped", "hexapod", "diff_drive", "four_wheel", "mecanum", "gripper"]);

export function standaloneGripper(kind: "parallel" | "suction", prompt: string): RobotSpecification {
  const spec = nDofArm(0, { name: kind === "suction" ? "suction_gripper" : "parallel_gripper", prompt, gripper: "none" });
  // nDofArm(0) is just a base; attach the gripper to it
  const attach = "base_link";
  if (kind === "suction") attachSuctionGripper(spec, attach, 0.12);
  else attachParallelGripper(spec, attach, 0.12);
  spec.metadata.notes.push("Standalone gripper on a mount.");
  return spec;
}
