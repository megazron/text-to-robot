// Robot-family vocabulary and template selection for the local prompt parser.
import type { RobotSpecification } from "@ttr/robot-schema";
import { nDofArm, scara, humanoid, diffDrive, fourWheel, mecanum, quadruped, hexapod, roverArm, ironManSuit, wearableExosuit, ironManMark43, wallE, eva, baymax, attachParallelGripper, attachSuctionGripper } from "@ttr/robot-templates";
import { find, mentions, negates, isDirectlyNegated } from "./text.ts";
import { armTip, replaceGripperWithSuction } from "./grippers.ts";

export const MAX_ARM_DOF = 12;

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
  diffDrive: /diff(?:erential)?[\s-]?drive|\b(?:two|2)[\s-]?wheel(?:ed|s)?\b|mobile\s+(?:base|robot|platform)|\brover\b|robot(?:ic)?\s+vacuum|vacuum\s+(?:cleaner|robot)|turtlebot|cleaning\s+robot|delivery\s+robot|wheeled\s+robot/,
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

export interface Choice { family: string; label: string; matched: string; build: () => RobotSpecification; usesDof?: boolean; usesGripper?: boolean; approx?: string; }

export function chooseFamily(t: string, prompt: string, dof: number | undefined, g: GripperKind, heightM?: number, explicitGripper = false): Choice {
  // "no camera on my quadruped" negates the camera, not the quadruped: only "not a quadruped" rejects a family
  const hit = (rx: RegExp) => find(t, rx)?.text ?? [...t.matchAll(new RegExp(rx.source, "g"))].find((m) => !isDirectlyNegated(t, m.index!))?.[0];
  let m: string | undefined;

  if ((m = hit(RX.suit))) {
    // a suit is WORN: build the wearable exoskeleton; "battle mech" (standalone robot) is a humanoid
    if (/\bmech\b(?!\s+suit)/.test(t) && !/iron[\s-]?man|exo|wearable|suit/.test(t)) return { family: "battle_mech", label: "humanoid battle mech", matched: m,
        build: () => ironManSuit("battle_mech", prompt) };
    if (/iron[\s-]?man|mark\s*(?:[ivx]+|\d+)|armou?r|movie|ultron/.test(t)) return { family: "iron_man_mark_43", label: "Iron Man Mark 43 wearable suit", matched: m,
        build: () => ironManMark43({ prompt, ...(heightM ? { height_m: heightM } : {}) }) };
    return { family: "exosuit", label: "wearable exoskeleton", matched: m,
        build: () => wearableExosuit({ prompt, styled: false, name: "exosuit", ...(heightM ? { height_m: heightM } : {}) }) };
  }
  if ((m = hit(RX.wallE))) return { family: "wall_e", label: "WALL-E character", matched: m, build: () => wallE("wall_e", prompt) };
  if ((m = hit(RX.eva))) return { family: "eva", label: "EVA character", matched: m, build: () => eva("eva", prompt) };
  if ((m = hit(RX.baymax))) return { family: "baymax", label: "Baymax character", matched: m, build: () => baymax("baymax", prompt) };
  for (const [rx, why] of UNSUPPORTED) if (mentions(t, rx)) throw new Error(why);
  const humanoidOf = (matched: string, approx?: string): Choice => ({ family: "humanoid", label: "humanoid", matched, approx, usesDof: true, usesGripper: true,
    build: () => humanoid({ armDof: dof ?? 7, gripper: g !== "none", prompt }) });
  if ((m = hit(RX.humanoid))) return humanoidOf(m);
  if ((m = hit(RX.dualArm))) return humanoidOf(m, "dual-arm robot built on the humanoid template (includes legs)");
  if ((m = hit(RX.hexapod))) return { family: "hexapod", label: "hexapod", matched: m, build: () => hexapod("hexapod", prompt) };
  if ((m = hit(RX.octopod))) return { family: "hexapod", label: "hexapod", matched: m, approx: "eight legs approximated by the six-legged hexapod",
      build: () => hexapod("hexapod", prompt) };
  if ((m = hit(RX.roverArm))) return { family: "rover_arm", label: "mobile manipulator (wheeled rover + arm)", matched: m, usesDof: true, usesGripper: true,
    approx: mentions(t, RX.tracked) ? "tracks approximated by the wheeled rover base" : mentions(t, RX.mecanum) || mentions(t, RX.omni) ? "the arm is mounted on the wheeled rover base, not a mecanum base" : undefined,
    build: () => { const s = roverArm("rover_arm", dof ?? 6, prompt, { gripper: g === "none" ? "none" : "parallel" }); if (g === "suction") replaceGripperWithSuction(s); return s; } };
  if ((m = hit(RX.quadruped))) return { family: "quadruped", label: "quadruped", matched: m, build: () => quadruped("quadruped", prompt) };
  if ((m = hit(RX.scara))) return { family: "scara", label: "SCARA", matched: m, usesGripper: true,
    build: () => { const s = scara({ prompt }); const tip = explicitGripper && g !== "none" ? armTip(s) : undefined;
      if (tip) (g === "suction" ? attachSuctionGripper : attachParallelGripper)(s, tip.link, tip.atZ); return s; } };
  if ((m = hit(RX.mecanum))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, build: () => mecanum("mecanum_robot", prompt) };
  if ((m = hit(RX.omni))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, approx: "omni-directional drive built with mecanum wheels",
      build: () => mecanum("mecanum_robot", prompt) };
  if ((m = hit(RX.fourWheel))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m,
      build: () => fourWheel("four_wheel_robot", prompt) };
  if ((m = hit(RX.tracked))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m, approx: "tracks approximated by a four-wheel skid-steer base",
      build: () => fourWheel("four_wheel_robot", prompt) };
  if ((m = hit(RX.diffDrive))) return { family: "diff_drive", label: "differential-drive base", matched: m,
      build: () => diffDrive("diff_drive_robot", prompt) };
  if ((m = hit(RX.legs))) return { family: "quadruped", label: "quadruped", matched: m, build: () => quadruped("quadruped", prompt) };
  if ((m = hit(RX.wheels)) && !mentions(t, RX.arm)) return { family: "diff_drive", label: "differential-drive base", matched: m,
      build: () => diffDrive("diff_drive_robot", prompt) };
  if ((m = hit(RX.gripper)) && !mentions(t, RX.arm)) return { family: "gripper", label: `standalone ${g === "suction" ? "suction" : "parallel"} gripper`, matched: m, usesGripper: true,
    build: () => standaloneGripper(g === "suction" ? "suction" : "parallel", prompt) };
  if (mentions(t, RX.hand)) throw new Error("Dexterous robot hands are not supported yet. Try \"two-finger parallel gripper\" or a humanoid.");
  m = hit(RX.arm);
  if (!m && dof === undefined) throw new Error(`Robot type not recognised. ${SUPPORTED_HINT}`);
  const n = dof ?? 6;
  return { family: "serial_arm", label: `${n}-DOF serial arm`, matched: m ?? `${n} DOF`, usesDof: true, usesGripper: true,
    build: () => { const s = nDofArm(n, { name: `arm_${n}dof`, prompt, gripper: g === "none" ? "none" : "parallel" }); if (g === "suction") replaceGripperWithSuction(s); return s; } };
}

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
