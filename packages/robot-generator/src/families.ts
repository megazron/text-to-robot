// Robot-family vocabulary and template selection for the local prompt parser.
import type { RobotSpecification } from "@ttr/robot-schema";
import type { ArmourShape } from "@ttr/mesh";
import type { SuitPaint } from "./suit.ts";
import { designArm, designDiffDrive, designFourWheel, designMecanum, designRover, designEva, designBaymax, designArduinoWallE, designMark43Wearable, designArduinoCar, designArduinoArm, designQuadruped, designHexapod, designHumanoid, designBattleMech, designScara, designGripper, designDrone, designGantry, designRov, designSnake, designDelta, designHand, type LeggedRequest } from "@ttr/design";
import type { SensorType } from "@ttr/robot-schema";
import { nDofArm, scara, roverArm, wearableExosuit, attachParallelGripper, attachSuctionGripper } from "@ttr/robot-templates";
import { find, mentions, negates, isDirectlyNegated, extractDofMentions } from "./text.ts";
const planDof = (t: string) => extractDofMentions(t)[0]?.value;
import { armTip, replaceGripperWithSuction } from "./grippers.ts";
import { readKnowledge } from "./reading.ts";
import { PromptRefusal } from "./refusal.ts";
import type { ToolKind } from "./tools.ts";

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
  scara: /\bscara\b|selective[\s-]+compliance/,
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
  /** a hand named as the robot or its tool: "a humanoid hand", "a five-finger robotic hand", "bionic hands" */
  handRobot: /\b(?:humanoid|robot(?:ic)?|dexterous|bionic|prosthetic|anthropomorphic|mechanical|(?:three|four|five|3|4|5|multi)[\s-]?finger(?:ed)?)(?:\s+(?:robot(?:ic)?|dexterous|bionic|humanoid|mechanical))*\s+hands?\b/,
};
/** the arm a gripper or tool is meant for ("a gripper for my arm"): not a second robot */
export const ARM_IT_FITS = /\b(?:for|to\s+fit|that\s+fits)\s+(?:my|an?|the|your|our)?\s*(?:[\w-]+\s+){0,3}?arms?\b/;
export const HAND_REFUSAL = "A hand on its own is built as the five-finger tendon hand; on a robot it is a two-finger gripper.";

/** Weapons and robots meant to hurt: refused whatever body they would have (a glue gun or a heat gun is a tool, not a weapon). */
export const WEAPONS = /(?<!\b(?:glue|nail|spray|heat|massage|paint|staple|soldering|caulk|caulking|grease|rivet|hot[\s-]glue)\s)\b(?:guns?|rifles?|pistols?|firearms?)\b|\bweapon\w*|\bflame[\s-]?throwers?\b|\bbombs?\b|\bexplosives?\b|\bgrenades?\b|\bmissiles?\b|\btasers?\b|\b(?:kill|stab|shoot|attack|hurt|injure|harm)(?:s|ing)?\s+(?:people|humans?|someone|anyone|persons?|animals?|enemies)\b|\bto\s+(?:kill|stab)\b|\bthat\s+(?:can\s+|will\s+)?kills?\b/;
export const WEAPON_REFUSAL = "Text to Robot does not design weapons or robots meant to hurt people or animals.";

/** Families we do not generate; each says why and what to try instead. */
/** Robot types with their own designers that are found by name before the general rules (drones, ROVs, snakes, gantries, deltas). */
export const SPECIAL: { rx: RegExp; family: string; label: string; approx?: (t: string) => string | undefined; build: (ctx: DesignContext, t: string) => RobotSpecification }[] = [
  { rx: /\bdrones?\b|quad[\s-]?copter|multi[\s-]?rotor|\buav\b|hexa[\s-]?copter|octo[\s-]?copter|\bhelicopter\b|\baircraft\b|\bairplane\b|\baeroplane\b|\bflying\b|\bflies\b|\bfly\b/, family: "drone", label: "quadcopter (5 in props)",
    approx: (t) => /hexa|octo|helicopter|airplane|aeroplane|aircraft|fixed[\s-]?wing/.test(t) ? "built as a four-rotor quadcopter, the simplest machine that hovers" : undefined,
    build: (ctx) => designDrone({ name: "quadcopter", prompt: ctx.prompt, budget: ctx.budget, sensors: ctx.sensors, ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) }) },
  { rx: /underwater|\bauv\b|\brovs?\b|submarine|submersible|\bboats?\b|\bfish\s+robot|\brobot(?:ic)?\s+fish\b|\bswim(?:s|ming)?\b|\bdiv(?:e|es|ing)\b|\bocean\b|\bsea\s?bed\b|\bpool\s+inspection/, family: "rov", label: "tethered underwater ROV",
    approx: (t) => /\bboats?\b/.test(t) ? "a boat is built as a small underwater ROV that also runs on the surface" : /fish/.test(t) ? "a robot fish is built as a thruster ROV (fins are not designed)" : undefined,
    build: (ctx) => designRov({ name: "underwater_rov", prompt: ctx.prompt, budget: ctx.budget, ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) }) },
  { rx: /\bsnakes?(?:\s+robots?|\s+bot)?\b|\bserpentine\b|\bserpent\b|\bpipe\s+(?:crawler|inspection)/, family: "snake", label: "snake robot (yaw-pitch servo chain)",
    build: (ctx, t) => { const m = t.match(/\b(\d{1,2})\s+(?:segments?|joints?|links?)\b/); return designSnake({ name: "snake_robot", prompt: ctx.prompt, budget: ctx.budget, ...(m ? { segments: +m[1] } : {}) }); } },
  { rx: /\bgantry\b|\bcartesian\s+(?:robot|gantry)|\bxyz\s+(?:stage|robot|table|gantry)|\bplotter\b|\bpen\s+plotter|\bcnc\b|\b3d\s+printer\b|\blaser\s+(?:cutter|engraver)|\bdrawing\s+(?:robot|machine)/, family: "gantry", label: "Cartesian XYZ gantry",
    approx: (t) => /3d\s+printer|cnc|laser/.test(t) ? "built as the XYZ motion system with a tool plate; the hot end, spindle or laser is not designed" : undefined,
    build: (ctx, t) => designGantry({ name: "cartesian_gantry", prompt: ctx.prompt, budget: ctx.budget, sensors: ctx.sensors, tool: /\bpen\b|plot|draw|writ|sketch|portrait|letter/.test(t) ? "pen" : "plate", ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) }) },
  { rx: /\bdelta\s+(?:robot|arm|bot)|\bparallel\s+(?:robot|manipulator|kinematic\w*)|\bstewart\s+platform|\bhexapod\s+platform|\bpick[\s-]and[\s-]place\s+delta/, family: "delta", label: "delta robot (parallel arms)",
    approx: (t) => /stewart|hexapod\s+platform/.test(t) ? "a Stewart platform (six legs) is built as a three-arm delta robot, the other parallel robot" : undefined,
    build: (ctx) => designDelta({ name: "delta_robot", prompt: ctx.prompt, budget: ctx.budget, ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) }) },
];
/** Kept for tools that list the robot types still refused; every former entry now has a designer. */
export const UNSUPPORTED: [RegExp, string][] = [];

export const SUPPORTED_HINT = "Try an arm (\"6 DOF arm with a gripper\"), SCARA, gripper, robot hand, wheeled base (differential, four-wheel, mecanum), mobile manipulator, quadruped (with or without an arm), hexapod, humanoid, drone, underwater ROV, snake robot, Cartesian gantry or plotter, delta robot, wearable exosuit or a character (WALL-E, EVA, Baymax, Iron Man).";

export function gripperRequest(t: string): { kind: GripperKind; explicit: boolean; note?: string } {
  const noGripper = negates(t, /gripper|end[\s-]?effector|claw|hand/) && !mentions(t, /gripper|end[\s-]?effector|claw|suction/);
  if (noGripper) return { kind: "none", explicit: true };
  if (mentions(t, /suction|vacuum\s+(?:gripper|cup|tool)|\bvacuum\b(?!\s+(?:cleaner|robot))/) && !mentions(t, /robot(?:ic)?\s+vacuum|vacuum\s+(?:cleaner|robot)/)) return { kind: "suction", explicit: true };
  const hand = find(t, RX.handRobot);
  if (hand) return { kind: "parallel", explicit: true, note: `"${hand.text}" approximated by a two-finger parallel gripper on a robot (the five-finger hand is designed on its own: ask for "a robot hand")` };
  const multi = find(t, /\b(?:three|four|five|3|4|5|multi)[\s-]?finger(?:ed)?\b|dexterous/);
  if (multi) return { kind: "parallel", explicit: true, note: `"${multi.text}" gripper approximated by a two-finger parallel gripper` };
  return { kind: "parallel", explicit: mentions(t, RX.gripper) };
}

/** What the prompt asks for, known before the robot is designed. */
/** "SG90 servos", "MG996R", "Arduino": an Arduino + PCA9685 hobby-servo build, optionally limited to the named servos */
export interface HobbyServos { only?: string[] }
export interface DesignContext { hobby?: HobbyServos; prompt: string; budget?: number; payloadKg?: number; reachM?: number; segments?: { upper_arm: number; forearm: number }; sensors: SensorType[]; /** sensor types the prompt rules out ("no lidar") */ excludeSensors: SensorType[]; heightM?: number;
  /** the Mark 43's own shape (forged) and paint */ suit?: { shape: ArmourShape; paint: SuitPaint }; }
export interface Choice { family: string; label: string; matched: string; build: (ctx: DesignContext) => RobotSpecification; usesDof?: boolean; usesGripper?: boolean; approx?: string;
  /** built by the parts-first design engine (sized from real components) rather than a fixed template */
  designed?: boolean;
  /** task tools the body plan carries (tools.ts) */ tools?: ToolKind[];
  /** how the robot type was found: "rules" (default), "knowledge table", "similarity (...)" */ path?: string;
  /** the knowledge entry used */ knowledge?: string;
  /** the body plan in words, read for sensors as well as the prompt */ sensorWords?: string; }

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

let knowledgeDepth = 0;
const art = (label: string) => `${/^(?:[aeio]|u(?!ni))/i.test(label) ? "an" : "a"} ${label}`;
const handChoice = (matched: string): Choice => ({ family: "hand", label: "five-finger tendon hand", matched, designed: true, build: (ctx) => designHand({ name: "robot_hand", prompt: ctx.prompt, budget: ctx.budget }) });
export function chooseFamily(t: string, prompt: string, dof: number | undefined, g: GripperKind, heightM?: number, explicitGripper = false, knowledgeHint?: string): Choice {
  // "no camera on my quadruped" negates the camera, not the quadruped: only "not a quadruped" rejects a family
  const hit = (rx: RegExp) => find(t, rx)?.text ?? [...t.matchAll(new RegExp(rx.source, "g"))].find((m) => !isDirectlyNegated(t, m.index!))?.[0];
  let m: string | undefined;
  if (mentions(t, WEAPONS)) throw new PromptRefusal("harmful", WEAPON_REFUSAL);

  if ((m = hit(RX.suit))) {
    // a suit is WORN: build the wearable exoskeleton; "battle mech" (standalone robot) is a humanoid
    if (/\bmech\b(?!\s+suit)/.test(t) && !/iron[\s-]?man|exo|wearable|suit/.test(t)) return { family: "battle_mech", label: "humanoid battle mech", matched: m, usesDof: true, designed: true,
        build: (ctx) => designBattleMech({ name: "battle_mech", ...leggedReq(ctx), ...(dof ? { armDof: dof } : {}) }) };
    if (/iron[\s-]?man|mark\s*(?:[ivx]+|\d+)|armou?r|movie|ultron/.test(t)) {
      // worn armour built body first; "helmet" alone asks for the motorised helmet, chest / gauntlet words for the lights set
      const tier = /\bhelmet\b/.test(t) && !/\b(?:suit|armou?r|body|full)\b/.test(t) ? "helmet" as const : "suit" as const;
      return { family: "iron_man_mark_43", label: tier === "helmet" ? "Iron Man Mark 43 motorised helmet" : "Iron Man Mark 43 wearable suit", matched: m, designed: true,
        build: (ctx) => designMark43Wearable({ name: "iron_man_mark_43", prompt: ctx.prompt, budget: ctx.budget, tier, ...(heightM ? { heightM } : {}), ...(ctx.suit ? { shape: ctx.suit.shape, paint: ctx.suit.paint } : {}) }) };
    }
    return { family: "exosuit", label: "wearable exoskeleton", matched: m,
        build: () => wearableExosuit({ prompt, styled: false, name: "exosuit", ...(heightM ? { height_m: heightM } : {}) }) };
  }
  // "EVA from Wall-E": the film names where EVA comes from; the robot asked for is EVA
  const wallEIsTheFilm = /\b(?:from|in|of)\s+(?:the\s+)?(?:(?:movie|film|pixar)\s+)?wall[\s-]?e\b/.test(t) && !!hit(RX.eva);
  if (!wallEIsTheFilm && (m = hit(RX.wallE))) return { family: "wall_e", label: "WALL-E character", matched: m, designed: true, build: (ctx) => designArduinoWallE({ name: "wall_e", prompt: ctx.prompt, budget: ctx.budget }) };
  if ((m = hit(RX.eva))) return { family: "eva", label: "EVA character", matched: m, designed: true, build: (ctx) => designEva({ name: "eva", ...mobileReq(ctx) }) };
  if ((m = hit(RX.baymax))) return { family: "baymax", label: "Baymax character", matched: m, designed: true, build: (ctx) => designBaymax({ name: "baymax", ...mobileReq(ctx) }) };
  for (const sp of SPECIAL) if ((m = hit(sp.rx))) { const tt = t, a = sp.approx?.(tt); return { family: sp.family, label: sp.label, matched: m, designed: true, ...(a ? { approx: a } : {}), build: (ctx) => sp.build(ctx, tt) }; }
  // a hand is the robot asked for ("a humanoid hand"), or a part of one ("a humanoid with robotic hands", "an arm with a robot hand"):
  // without the hand words, whatever robot is left is the one to build; nothing left means a hand alone, which is refused
  const hand = find(t, RX.handRobot);
  if (hand) {
    const rest = `${t.slice(0, hand.index)} ${t.slice(hand.index + hand.text.length)}`.replace(/\s+/g, " ").trim();
    try { return chooseFamily(rest, prompt, dof, g, heightM, explicitGripper); }
    catch (e) { if (/not recognised/.test((e as Error).message)) return handChoice(hand.text); throw e; }
  }
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
  if ((m = hit(RX.quadruped))) {
    // "a robot dog with an arm", "Spot with an arm": the servo dog carries an arm on its back
    const withArm = mentions(t.replace(/\b(?:four|4)[\s-]?(?:legged|legs?)\b/g, " "), /\b(?:with|and|plus|carrying|has|having)\s+(?:an?\s+|one\s+)?(?:\d\s*(?:dof|axis)\s+)?(?:robot(?:ic)?\s+)?(?:arm|manipulator)\b/);
    if (withArm) return { family: "quadruped_arm", label: "quadruped with an arm", matched: m, usesDof: true, usesGripper: true, designed: true,
      build: (ctx) => designQuadruped({ name: "quadruped_arm", ...leggedReq(ctx), armDof: dof ?? 4, gripper: g !== "none" }) };
    return { family: "quadruped", label: "quadruped", matched: m, designed: true, build: (ctx) => designQuadruped({ name: "quadruped", ...leggedReq(ctx) }) };
  }
  if ((m = hit(RX.scara))) {
    // "selective compliance assembly robot arm" is the name, not an assembly task
    const task = /\bpick(?:s|ing)?\b|\bplace\b|\bsort(?:s|ing)?\b|\bgrab(?:s|bing)?\b|\bpackag(?:e|ing)\b|\bassembl(?:e|y|ing)\b/.test(t.replace(/selective[\s-]+compliance[\s-]+(?:assembly|articulated)\b/g, "scara"));
    // the designed SCARA carries a parallel gripper; a suction cup (named, or a pick task with no jaws asked for) keeps the template SCARA
    if (g === "suction" || (task && !explicitGripper)) return { family: "scara", label: "SCARA", matched: m, usesGripper: true,
      build: () => { const s = scara({ prompt }); const tip = armTip(s); if (tip) attachSuctionGripper(s, tip.link, tip.atZ); return s; } };
    return { family: "scara", label: "SCARA", matched: m, usesGripper: true, designed: true,
      build: (ctx) => designScara({ name: "scara", prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg, reachM: ctx.reachM, sensors: ctx.sensors }) };
  }
  if ((m = hit(RX.mecanum))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, designed: true, build: (ctx) => designMecanum({ name: "mecanum_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.omni))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, approx: "omni-directional drive built with mecanum wheels",
      designed: true, build: (ctx) => designMecanum({ name: "mecanum_robot", ...mobileReq(ctx) }) };
  // a car asked for on Arduino / TT motors / cheap parts: the Arduino car (4WD when four wheels are named)
  const cheapCar = /\barduino\b|\btt\s+(?:gear\s*)?motors?\b|\bcheap(?:est)?\b|\bbudget\s+(?:car|robot)\b/.test(t);
  if (cheapCar && (hit(RX.fourWheel) || hit(RX.diffDrive) || (hit(RX.wheels) && !mentions(t, RX.arm)))) {
    const four = !!hit(RX.fourWheel);
    return { family: "arduino_car", label: four ? "Arduino car (4WD)" : "Arduino car", matched: (hit(RX.fourWheel) ?? hit(RX.diffDrive) ?? hit(RX.wheels))!, designed: true,
      build: (ctx) => designArduinoCar({ name: "arduino_car", prompt: ctx.prompt, budget: ctx.budget, tier: four ? "stronger" : "cheapest", ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) }) };
  }
  if ((m = hit(RX.fourWheel))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m,
      designed: true, build: (ctx) => designFourWheel({ name: "four_wheel_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.tracked))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m, approx: "tracks approximated by a four-wheel skid-steer base",
      designed: true, build: (ctx) => designFourWheel({ name: "four_wheel_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.diffDrive))) return { family: "diff_drive", label: "differential-drive base", matched: m,
      // the rocker-bogie rover is designed carrying an arm; a rover asked for without one is the wheeled base, and says so
      ...(/\b(?:mars|planetary|lunar|moon|rocker[\s-]?bogie)\b/.test(t) ? { approx: "a rover without an arm is built as a differential-drive base (the rocker-bogie rover is designed with an arm: ask for \"a Mars rover with an arm\")" } : {}),
      designed: true, build: (ctx) => designDiffDrive({ name: "diff_drive_robot", ...mobileReq(ctx) }) };
  if ((m = hit(RX.legs))) return { family: "quadruped", label: "quadruped", matched: m, designed: true, build: (ctx) => designQuadruped({ name: "quadruped", ...leggedReq(ctx) }) };
  if ((m = hit(RX.wheels)) && !mentions(t, RX.arm)) return { family: "diff_drive", label: "differential-drive base", matched: m,
      designed: true, build: (ctx) => designDiffDrive({ name: "diff_drive_robot", ...mobileReq(ctx) }) };
  // "a gripper for my arm" asks for the gripper: the arm it goes on is not the robot to build
  if ((m = hit(RX.gripper)) && !mentions(t.replace(ARM_IT_FITS, " "), RX.arm)) return { family: "gripper", label: `standalone ${g === "suction" ? "suction" : "parallel"} gripper`, matched: m, usesGripper: true,
    ...(g === "suction" ? { build: () => standaloneGripper("suction", prompt) }
      : { designed: true, build: (ctx: DesignContext) => designGripper({ name: "parallel_gripper", prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg }) }) };
  if ((m = hit(RX.hand))) return handChoice(m);
  m = hit(RX.arm);
  if (!m && dof === undefined) {
    // no robot type named: a task, an object or an animal from the knowledge table, then the closest entry by meaning (said either way)
    const r = knowledgeDepth < 2 ? readKnowledge(t, knowledgeHint) : undefined;
    if (r) {
      // a body plan always names a robot type the rules know; the depth guard stops a bad table entry from looping
      knowledgeDepth++;
      let c: Choice;
      try { c = chooseFamily(r.entry.canonical, r.entry.canonical, dof ?? planDof(r.entry.canonical), g, heightM, explicitGripper); } finally { knowledgeDepth--; }
      const lead = r.entry.kind === "task" ? `"${r.matched}" is a task, not a robot type: built ${art(c.label)} (${r.entry.why})`
        : r.entry.kind === "object" ? `"${r.matched}" ${r.entry.why}: built ${art(c.label)}`
        : `"${r.matched}" ${r.entry.why}: built ${art(c.label)}`;
      const via = r.path === "keywords" ? "" : ` (no keyword matched; closest by meaning: "${r.entry.id.replace(/_/g, " ")}", similarity ${r.score} by the ${r.by})`;
      return { ...c, matched: r.matched, approx: `${lead}${via}${c.approx ? `; ${c.approx}` : ""}`, tools: [...new Set([...(c.tools ?? []), ...(r.entry.tools ?? [])])],
        path: r.path === "keywords" ? "knowledge table" : `similarity (${r.by})`, knowledge: r.entry.id, sensorWords: r.entry.canonical };
    }
    throw new Error(`Robot type not recognised. ${SUPPORTED_HINT}`);
  }
  // an Arduino / hobby-servo arm with no joint count (or 3): the desk arm designed for hobby servos
  if (/\barduino\b|\b(?:hobby|micro)\s+servos?\b|\bsg90\b|\bmg90s?\b|\bmg996r?\b|\bds3218\b/.test(t) && (dof === undefined || dof === 3) && g !== "suction")
    return { family: "arduino_arm", label: "Arduino desk arm (3 DOF + claw)", matched: m ?? "arm", usesDof: true, usesGripper: true, designed: true,
      build: (ctx) => designArduinoArm({ name: "arduino_arm", prompt: ctx.prompt, budget: ctx.budget, gripper: g !== "none",
        servos: ctx.hobby?.only ?? ["hobby_sg90", "hobby_mg90s", "hobby_mg996r", "hobby_ds3218"], ...(/\bnano\b/.test(t) && !/\buno\b/.test(t) ? { board: "arduino_nano_clone" as const } : {}), ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) }) };
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

export const ARM_FAMILIES = new Set(["serial_arm", "rover_arm", "scara"]);
/** templates with a generic structural material we may recolour (characters keep their livery) */
export const RECOLOURABLE = new Set(["serial_arm", "rover_arm", "scara", "humanoid", "quadruped", "hexapod", "diff_drive", "four_wheel", "mecanum", "gripper", "arduino_car", "arduino_arm"]);

export function standaloneGripper(kind: "parallel" | "suction", prompt: string): RobotSpecification {
  const spec = nDofArm(0, { name: kind === "suction" ? "suction_gripper" : "parallel_gripper", prompt, gripper: "none" });
  // nDofArm(0) is just a base; attach the gripper to it
  const attach = "base_link";
  if (kind === "suction") attachSuctionGripper(spec, attach, 0.12);
  else attachParallelGripper(spec, attach, 0.12);
  spec.metadata.notes.push("Standalone gripper on a mount.");
  return spec;
}
