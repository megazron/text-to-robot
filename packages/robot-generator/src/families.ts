// Robot-family vocabulary and template selection for the local prompt parser.
import type { RobotSpecification } from "@ttr/robot-schema";
import type { ArmourShape } from "@ttr/mesh";
import type { SuitPaint } from "./suit.ts";
import { designWorkcell, MAX_CELL_ARMS, designArm, designDiffDrive, designFourWheel, designMecanum, designRover, designEva, designBaymax, designArduinoWallE, designMark43Wearable, designArduinoCar, designArduinoArm, designQuadruped, designHexapod, designHumanoid, designBattleMech, designScara, designGripper, designDrone, designGantry, designRov, designSnake, designDelta, designHand, type LeggedRequest } from "@ttr/design";
import type { SensorType } from "@ttr/robot-schema";
import { nDofArm, scara, roverArm, wearableExosuit, attachParallelGripper, attachSuctionGripper } from "@ttr/robot-templates";
import { find, mentions, negates, isDirectlyNegated, extractDofMentions } from "./text.ts";
const planDof = (t: string) => extractDofMentions(t)[0]?.value;
import { armTip, replaceGripperWithSuction } from "./grippers.ts";
import { readKnowledge } from "./reading.ts";
import { readShape, type RequestShape } from "./request.ts";
import { readShell, NOT_WHEELED } from "./shape.ts";
import type { ShellRequest } from "@ttr/design";
import { PromptRefusal } from "./refusal.ts";
import type { ToolKind } from "./tools.ts";

export const MAX_ARM_DOF = 7; // the arm designer builds 1–7 DOF chains

export type GripperKind = "parallel" | "suction" | "none";

// ---------------- request vocabulary ----------------
export const RX = {
  suit: /iron[\s-]?man|exosuit|exo[\s-]?skeleton|wearable|power(?:ed)?\s+(?:armou?r|suit)|mech\s+suit|battle\s+(?:suit|mech)/,
  wallE: /wall[\s-]?e\b|trash[\s-]?compactor|garbage\s+robot/,
  eva: /\beva\b|probe\s+droid|hover(?:ing)?\s+(?:robot|droid|bot)/,
  baymax: /baymax|\binflatable\b|healthcare\s+companion/,
  humanoid: /humanoid|\bbiped(?:al)?\b|\b(?:two|2)[\s-]?legged\b|\b(?:two|2) legs\b|\btorso\b.*\b(?:head|legs?)\b|\bhead\b.*\btorso\b/,
  dualArm: /\bdual[\s-]?arm(?:ed)?\b|\bbimanual\b|\btwo[\s-]armed\b/,
  hexapod: /hexapod|\b(?:six|6)[\s-]?legged\b|\b(?:six|6) legs\b|spider|insect|ant[\s-]?bot/,
  octopod: /\b(?:eight|8)[\s-]?legged\b|\b(?:eight|8) legs\b|octopod/,
  // a wheeled/tracked base and an arm in either order, or "mobile manipulator"
  roverArm: new RegExp([
    String.raw`(rover|mars|planetary|explorer|loader|wheel(?:ed|s)|track(?:ed|s)|\btank\b|crawler|skid[\s-]?steer|\b4wd\b|mecanum|mobile\s+(?:base|robot|platform)).*\b(arms?|manipulat\w*)\b`,
    String.raw`\b(arms?|manipulat\w*)\b.*(rover|mars|planetary|mobile\s+(?:base|robot|platform|chassis)|wheels|wheeled|tracks|tracked|\bagv\b|\bamr\b|\bcart\b|\bvehicle\b)`,
    String.raw`mobile\s+manipulat`,
  ].join("|")),
  // ("my dog", "her dog": the visitor's own dog is what the robot is for, not the robot)
  quadruped: /quadruped|\b(?:four|4)[\s-]?legged\b|\b(?:four|4) legs\b|(?<!\b(?:my|our|your|his|her|their)\s)\bdog\b|robo[\s-]?dog|\blegged\b/,
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
export const ARM_IT_FITS = /\b(?:for|to\s+fit|that\s+fits)\s+(?:(?:my|an?|the|your|our)\s*)?(?:[\w-]+\s+){0,3}?arms?\b/;
export const HAND_REFUSAL = "A hand on its own is built as the five-finger tendon hand; on a robot it is a two-finger gripper.";

/** Weapons and robots meant to hurt: refused whatever body they would have (a glue gun or a heat gun is a tool, not a weapon). */
export const WEAPONS = /(?<!\b(?:glue|nail|spray|heat|massage|paint|staple|soldering|caulk|caulking|grease|rivet|hot[\s-]glue)\s)\b(?:guns?|rifles?|pistols?|firearms?)\b|\bweapon\w*|\bflame[\s-]?throwers?\b|\bbombs?\b|\bexplosives?\b|\bgrenades?\b|\bmissiles?\b|\btasers?\b|\b(?:kill|stab|shoot|attack|hurt|injure|harm)(?:s|ing)?\s+(?:people|humans?|someone|anyone|persons?|animals?|enemies)\b|\bto\s+(?:kill|stab)\b|\bthat\s+(?:can\s+|will\s+)?kills?\b/;
export const WEAPON_REFUSAL = "Text to Robot does not design weapons or robots meant to hurt people or animals.";

/** Families we do not generate; each says why and what to try instead. */
/** Robot types with their own designers that are found by name before the general rules (drones, ROVs, snakes, gantries, deltas). */
export const SPECIAL: { rx: RegExp; family: string; label: string; approx?: (t: string) => string | undefined; build: (ctx: DesignContext, t: string) => RobotSpecification }[] = [
  { rx: /(?<!\b(?:underwater|submarine|water|sea|lake|pool)\s)\bdrones?\b|quad[\s-]?copter|multi[\s-]?rotor|\buav\b|hexa[\s-]?copter|octo[\s-]?copter|\bhelicopter\b|\baircraft\b|\bairplane\b|\baeroplane\b|\bflying\b|\bflies\b|\bfly\b/, family: "drone", label: "quadcopter (5 in props)",
    approx: (t) => /hexa|octo|helicopter|airplane|aeroplane|aircraft|fixed[\s-]?wing/.test(t) ? "built as a four-rotor quadcopter, the simplest machine that hovers" : undefined,
    build: (ctx) => designDrone({ name: "quadcopter", prompt: ctx.prompt, budget: ctx.budget, sensors: ctx.sensors, ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}), ...(ctx.shell ? { shell: ctx.shell } : {}) }) },
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
export interface DesignContext { /** a shape shell over a wheeled base (shape.ts) */ shell?: ShellRequest; hobby?: HobbyServos; prompt: string; budget?: number; payloadKg?: number; reachM?: number; segments?: { upper_arm: number; forearm: number }; sensors: SensorType[]; /** sensor types the prompt rules out ("no lidar") */ excludeSensors: SensorType[]; heightM?: number;
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
const mobileReq = (ctx: DesignContext) => ({ ...(ctx.shell ? { shell: ctx.shell } : {}), prompt: ctx.prompt, budget: ctx.budget, sensors: ctx.sensors as never, ...(ctx.excludeSensors.length ? { excludeSensors: ctx.excludeSensors as never } : {}), ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) });

/** common inputs of the legged designers (they fit camera, depth, lidar and IMU parts) */
const leggedReq = (ctx: DesignContext, heightM = ctx.heightM): LeggedRequest => ({ ...(ctx.shell ? { shell: ctx.shell } : {}), prompt: ctx.prompt, budget: ctx.budget,
  sensors: ctx.sensors.filter((x) => ["camera", "depth", "lidar", "imu"].includes(x)) as LeggedRequest["sensors"],
  ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}), ...(heightM ? { heightM } : {}) });

let knowledgeDepth = 0;
const art = (label: string) => `${/^(?:[aeio]|u(?!ni))/i.test(label) ? "an" : "a"} ${label}`;
const handChoice = (matched: string): Choice => ({ family: "hand", label: "five-finger tendon hand", matched, designed: true, build: (ctx) => designHand({ name: "robot_hand", prompt: ctx.prompt, budget: ctx.budget }) });
/** A robot, machine or "something" with a job the knowledge table does not know, as the body that job needs: getting somewhere
 * (a wheeled base) or doing something with things (an arm with a gripper, the general-purpose manipulator). */
export function generalJob(t: string): { id: string; task: string; canonical: string; why: string } | undefined {
  const body = /\b(?:robots?|robotic|bots?|machines?|devices?|gadgets?|contraptions?|automat(?:on|a)|something|helpers?|assistants?)\b/;
  const clause = t.match(/\b(?:that|which|who|to|can|could|will|for)\s+((?:(?:can|could|will|help(?:s)?(?:\s+me)?|automatically|always)\s+)*([a-z]{3,}(?:s|es|ing)?)\b[^.!?]{0,60})/);
  if (!body.test(t) || !clause) return undefined;
  const task = clause[1].trim().replace(/\s+/g, " ").slice(0, 60), verb = clause[2];
  if (/^(?:is|are|be|was|has|have|do|does|looks?|sounds?|the|a|an|my|me|you|it|this|that|and|with|make(?:s)?\s+me)$/.test(verb)) return undefined;
  if (/^(?:go(?:es)?|travel\w*|roam\w*|wander\w*|ride\w*|drive\w*|move\w*|explor\w*|visit\w*|run(?:s)?|race\w*|patrol\w*|tow\w*|push(?:es)?|pull\w*)$/.test(verb))
    return { id: "general_mobile", task, canonical: "differential drive robot with a camera", why: "because the job is getting somewhere: a wheeled base with a camera carries whatever else it needs; the behaviour is software, written after the body exists" };
  return { id: "general_manipulator", task, canonical: "6 dof robot arm with a gripper",
    why: "the general-purpose body for a job done with things (reach, hold, move, use a tool); the skill itself is software, started from the training scaffold, so say more about the job and I can fit the body to it" };
}

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
    // what is left only names a task or an object ("a robot hand that plays rock paper scissors"): the hand is the robot
    try { const c = chooseFamily(rest, prompt, dof, g, heightM, explicitGripper); return c.knowledge ? handChoice(hand.text) : c; }
    catch (e) { if (/not recognised/.test((e as Error).message)) return handChoice(hand.text); throw e; }
  }
  // a look with no other body named ("a heart shaped robot", "a sneaker on wheels", "a cartoon robot"): a wheeled base under
  // a shell of that shape (the shell is added where the base is designed: DesignContext.shell)
  const look = readShell(t, prompt);
  if (look && !mentions(t, NOT_WHEELED) && !find(t, /\b(?:four|4)[\s-]?wheel|\b4wd\b|mecanum|omni|\b(?:two|2|three|3)[\s-]?wheel|diff(?:erential)?[\s-]?drive|track(?:ed|s)\b/)) {
    const four = /dragon|car|shoe|pizza|toaster/.test(look.shape);
    return { family: four ? "four_wheel" : "diff_drive", label: `${look.name}-shaped robot${look.style !== "plain" ? ` (${look.style})` : ""} on a ${four ? "four-wheel" : "differential-drive"} base`, matched: look.said, designed: true,
      approx: [`"${look.said}": a ${look.name} shell${look.style !== "plain" ? ` in a ${look.style} style` : ""} printed over a working ${four ? "four-wheel" : "differential-drive"} base (the look is the shell; the robot under it is the same as any other)`, look.note].filter(Boolean).join("; "),
      build: (ctx) => four ? designFourWheel({ name: `${look.name.replace(/\W+/g, "_")}_robot`, ...mobileReq(ctx) }) : designDiffDrive({ name: `${look.name.replace(/\W+/g, "_")}_robot`, ...mobileReq(ctx) }) };
  }
  // a torso is a body with arms and no legs ("a dual arm humanoid torso"): two arms on the shoulders of a fixed column
  const shape = readShape(t);
  if (shape.base?.kind === "torso" && !/\bwith\s+(?:an?\s+|the\s+)?torso\b/.test(t) && !/\blegs?\b|\bwalk/.test(t)) return composed(shape, "torso", dof, g, t);
  const humanoidOf = (matched: string, approx?: string): Choice => ({ family: "humanoid", label: "humanoid", matched, approx, usesDof: true, usesGripper: true, designed: true,
    // above ~0.9 m servo legs cannot carry the robot: full-size humanoids use the QDD (CubeMars) design
    build: (ctx) => (ctx.heightM ?? 0) > 0.9 ? designBattleMech({ name: "humanoid_robot", ...leggedReq(ctx), ...(dof ? { armDof: dof } : {}) })
      : designHumanoid({ name: "humanoid_robot", ...leggedReq(ctx), ...(dof ? { armDof: dof } : {}), gripper: g !== "none" }) });
  if ((m = hit(RX.humanoid))) return humanoidOf(m);
  if (hit(RX.hexapod) || hit(RX.octopod)) { /* a hexapod with arms says so below */ }
  // two or more arms: on a mobile base (a dual-arm mobile manipulator), on a legged base, or side by side on one plate
  else if (shape.arms && shape.arms.count >= 2) return composed(shape, shape.base?.kind === "quadruped" || shape.base?.kind === "legs" ? "quadruped" : shape.base && shape.base.kind !== "table" ? "mobile" : "cell", dof, g, t);
  if ((m = hit(RX.hexapod))) return { family: "hexapod", label: "hexapod", matched: m, designed: true, build: (ctx) => designHexapod({ name: "hexapod", ...leggedReq(ctx) }) };
  if ((m = hit(RX.octopod))) return { family: "hexapod", label: "hexapod", matched: m, approx: "eight legs approximated by the six-legged hexapod",
      designed: true, build: (ctx) => designHexapod({ name: "hexapod", ...leggedReq(ctx) }) };
  if ((m = hit(RX.roverArm)) && mentions(t, RX.arm)) return { family: "rover_arm", label: "mobile manipulator (wheeled rover + arm)", matched: m, usesDof: true, usesGripper: true,
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
  // a number of wheels said outright: three is two driven wheels and a rear caster, five or more the rocker-bogie rover
  const nWheels = wheelCount(t) ?? (/\btri(?:cycle|ke)\b/.test(t) ? 3 : undefined), wheelWords = find(t, /\b(?:one|two|three|four|five|six|seven|eight|ten|twelve|\d{1,3})[\s-]+wheel(?:s|ed)?\b|\btri(?:cycle|ke)\b/)?.text;
  if (wheelWords && !mentions(t, RX.mecanum) && !mentions(t, RX.omni) && !mentions(t, RX.tracked)) {
    if (nWheels === 3) return { family: "diff_drive", label: "three-wheel differential-drive base", matched: wheelWords, designed: true, build: (ctx) => designDiffDrive({ name: "three_wheel_robot", ...mobileReq(ctx), casters: 1 }) };
    if (nWheels !== undefined && nWheels >= 5) return { family: "rover", label: "6-wheel rocker-bogie rover", matched: wheelWords, designed: true,
      ...(nWheels !== 6 ? { approx: `${nWheels} wheels: built the 6-wheel rocker-bogie rover (the rover is designed with 4 or 6 wheels)` } : {}),
      build: (ctx) => designRover({ name: "six_wheel_rover", ...mobileReq(ctx), wheels: 6 }) };
    if (nWheels !== undefined && nWheels <= 1) return { family: "diff_drive", label: "differential-drive base", matched: wheelWords, designed: true,
      approx: `${nWheels === 1 ? "one wheel" : "no wheels"}: a robot cannot balance on ${nWheels === 1 ? "one wheel" : "none"} without a self-balancing controller; built the two-wheel differential-drive base with casters`,
      build: (ctx) => designDiffDrive({ name: "diff_drive_robot", ...mobileReq(ctx) }) };
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
  // "an arduino robot" with no body named: the Arduino car, the cheapest robot that moves (an Arduino arm needs "arm")
  if (/\barduino\b/.test(t) && !mentions(t, RX.arm) && dof === undefined && !/\bservos?\b|\bsg90\b|\bmg9\d/.test(t))
    return { family: "arduino_car", label: "Arduino car", matched: "arduino", designed: true, approx: "\"Arduino robot\" with no body named: built the Arduino car, the cheapest robot that moves (say \"arm\" for the Arduino desk arm)",
      build: (ctx) => designArduinoCar({ name: "arduino_car", prompt: ctx.prompt, budget: ctx.budget, tier: "cheapest", ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}) }) };
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
    // a job no table entry knows ("a robot that peels potatoes"): the general-purpose body for it, said plainly
    const job = knowledgeDepth < 2 ? generalJob(t) : undefined;
    if (job) {
      knowledgeDepth++;
      let c: Choice;
      try { c = chooseFamily(job.canonical, job.canonical, planDof(job.canonical), g, heightM, explicitGripper); } finally { knowledgeDepth--; }
      return { ...c, matched: job.task, approx: `"${job.task}" is a job I have no module for: built ${art(c.label)}, ${job.why}${c.approx ? `; ${c.approx}` : ""}`,
        path: "general job", knowledge: job.id, sensorWords: job.canonical };
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
      const s = designArm({ name: `arm_${n}dof`, dof: n, gripper: false, prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg, reachM: ctx.reachM, segments: ctx.segments, sensors: ctx.sensors, ...(ctx.shell ? { shell: ctx.shell } : {}),
        ...(ctx.hobby ? { ladder: "hobby" as const, ...(ctx.hobby.only ? { onlyActuators: ctx.hobby.only } : {}) } : {}) });
      const tool = (s.metadata as { design?: { tool?: { link: string; xyz_m: number[] } } }).design?.tool;
      if (tool) attachSuctionGripper(s, tool.link, tool.xyz_m[2]); else { const tip = armTip(s); if (tip) attachSuctionGripper(s, tip.link, tip.atZ); }
      return s; } };
  return { family: "serial_arm", label: `${n}-DOF serial arm`, matched: m ?? `${n} DOF`, usesDof: true, usesGripper: true, designed: true,
    build: (ctx) => designArm({ name: `arm_${n}dof`, dof: n, gripper: g !== "none", prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg, reachM: ctx.reachM, segments: ctx.segments, sensors: ctx.sensors, ...(ctx.shell ? { shell: ctx.shell } : {}),
      ...(ctx.hobby ? { ladder: "hobby" as const, ...(ctx.hobby.only ? { onlyActuators: ctx.hobby.only } : {}) } : {}) }) };
}

/** Several arms, or arms on something: a work cell, a dual-arm torso, a rover with two arms, a quadruped with its one arm.
 *  Every arm count, joint count and wheel count asked for is built, or the result says what was built instead and why. */
function composed(shape: RequestShape, on: "torso" | "cell" | "mobile" | "quadruped", dof: number | undefined, g: GripperKind, t: string): Choice {
  const asked = shape.arms?.count ?? 2, said = shape.arms?.said ?? (on === "torso" ? shape.base!.said : "arms");
  const notes: string[] = [];
  const dofs = (n: number) => Array.from({ length: n }, (_, i) => {
    const d = shape.arms?.dofs[i] ?? shape.arms?.dofs[0] ?? dof ?? 6, c = Math.min(MAX_ARM_DOF, Math.max(1, Math.round(d)));
    if (c !== d && !notes.some((x) => x.includes(`${d} DOF`))) notes.push(`${d} DOF per arm clamped to ${c} (the arm designer builds 1-${MAX_ARM_DOF} joints; a longer chain is a snake robot)`);
    return c;
  });
  if (shape.arms?.assumed) notes.push(`"${said}" with no number: built two arms`);
  if (g === "suction") notes.push("suction cups on several arms are not designed yet: each arm has a two-finger gripper");
  const grip = g !== "none";
  // "three small arms", "two big arms": the size word on the arms sets their reach (a reach said in numbers wins)
  const sizeReach = /\b(?:small|mini|tiny|compact|desktop|little|micro)\b/.test(said) ? 0.28 : /\b(?:big|large|long|huge|industrial)\b/.test(said) ? 0.6 : undefined;
  if (on === "quadruped") {
    notes.push(`${asked} arms on a quadruped: a robot dog carries one arm on its back, so one arm was built (ask for "a rover with two arms" for two arms on a mobile base)`);
    const d = dofs(1)[0];
    return { family: "quadruped_arm", label: "quadruped with an arm", matched: said, usesDof: true, usesGripper: true, designed: true, approx: notes.join("; "),
      build: (ctx) => designQuadruped({ name: "quadruped_arm", ...leggedReq(ctx), armDof: d, gripper: grip }) };
  }
  if (on === "mobile") {
    const n = Math.min(asked, 2), ds = dofs(n);
    if (asked > 2) notes.push(`${asked} arms on a mobile base: the rover's lid takes two side by side, so two were built (a work cell takes up to ${MAX_CELL_ARMS}: "${asked} arms on a table")`);
    const base = shape.base!;
    if (base.kind === "tracks") notes.push("tracks approximated by the wheeled rocker-bogie rover base, which carries the arms");
    else if (base.kind === "mecanum" || base.kind === "omni") notes.push("the arms are mounted on the wheeled rocker-bogie rover base, not a mecanum base");
    const wheels = wheelCount(t) ?? base.wheels;
    return { family: "rover_arm", label: `mobile manipulator (wheeled rover + ${n} arms)`, matched: `${said} ${base.said}`.trim(), usesDof: true, usesGripper: true, designed: true, approx: notes.join("; ") || undefined,
      build: (ctx) => designRover({ name: "rover_two_arms", ...mobileReq(ctx), payloadKg: undefined, wheels: wheels ?? 6, arms: ds.map((d) => ({ dof: d, gripper: grip, ...(ctx.payloadKg !== undefined ? { payloadKg: ctx.payloadKg } : {}), ...(ctx.reachM ?? sizeReach ? { reachM: ctx.reachM ?? sizeReach } : {}) })) }) };
  }
  const n = on === "torso" ? 2 : Math.min(asked, MAX_CELL_ARMS), ds = dofs(n);
  if (on === "torso" && asked !== 2) notes.push(`a torso has two shoulders: built two arms (${asked} asked)`);
  if (on === "cell" && asked > MAX_CELL_ARMS) notes.push(`${asked} arms: a work cell takes up to ${MAX_CELL_ARMS} side by side on one plate, so ${MAX_CELL_ARMS} were built`);
  if (on === "torso" && /\bhumanoid\b|\bandroid\b/.test(t)) notes.push("a humanoid torso is built as two arms on the shoulders of a fixed column (no legs or head)");
  if (on === "cell") notes.push(`${n} separate arms are built as one work cell: ${n} arms side by side on a shared aluminium base plate, one supply and one bus`);
  return { family: "arm_workcell", label: on === "torso" ? "dual-arm torso" : `${n}-arm work cell`, matched: said, usesDof: true, usesGripper: true, designed: true, approx: notes.join("; ") || undefined,
    build: (ctx) => designWorkcell({ prompt: ctx.prompt, budget: ctx.budget, payloadKg: ctx.payloadKg, reachM: ctx.reachM ?? sizeReach, segments: ctx.segments, sensors: ctx.sensors, layout: on === "torso" ? "torso" : "row", arms: ds.map((d) => ({ dof: d, gripper: grip })),
      ...(ctx.hobby ? { ladder: "hobby" as const, ...(ctx.hobby.only ? { onlyActuators: ctx.hobby.only } : {}) } : {}) }) };
}

export const ARM_FAMILIES = new Set(["serial_arm", "rover_arm", "scara", "arm_workcell"]);
/** templates with a generic structural material we may recolour (characters keep their livery) */
export const RECOLOURABLE = new Set(["drone", "rover", "quadruped_arm", "serial_arm", "rover_arm", "arm_workcell", "scara", "humanoid", "quadruped", "hexapod", "diff_drive", "four_wheel", "mecanum", "gripper", "arduino_car", "arduino_arm"]);

export function standaloneGripper(kind: "parallel" | "suction", prompt: string): RobotSpecification {
  const spec = nDofArm(0, { name: kind === "suction" ? "suction_gripper" : "parallel_gripper", prompt, gripper: "none" });
  // nDofArm(0) is just a base; attach the gripper to it
  const attach = "base_link";
  if (kind === "suction") attachSuctionGripper(spec, attach, 0.12);
  else attachParallelGripper(spec, attach, 0.12);
  spec.metadata.notes.push("Standalone gripper on a mount.");
  return spec;
}
