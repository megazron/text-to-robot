// Deterministic natural-language understanding for demo mode + a modification
// engine used by every provider. No ML; keyword + regex rules that cover the
// documented prompts and degrade gracefully.
import type { RobotSpecification, Geometry, Sensor, SensorType } from "@ttr/robot-schema";
import { safeName, pose } from "@ttr/robot-schema";
import { nDofArm, scara, humanoid, diffDrive, fourWheel, mecanum, quadruped, hexapod, roverArm, attachParallelGripper, attachSuctionGripper, cyl, box, link, joint } from "@ttr/robot-templates";

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function extractDof(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:-|\s)?\s*(?:dof|d\.o\.f|degrees?\s+of\s+freedom|axis|axes|joints?)/i);
  if (m) return Math.min(12, Math.max(1, parseInt(m[1], 10)));
  for (const [w, n] of Object.entries(WORD_NUM)) {
    if (new RegExp(`\\b${w}\\b[\\s-]*(?:dof|degrees?\\s+of\\s+freedom|axis|axes|joint)`, "i").test(text)) return n;
  }
  return undefined;
}

function gripperKind(text: string): "parallel" | "suction" | "none" {
  if (/suction|vacuum/.test(text)) return "suction";
  if (/no\s+gripper|without\s+.*gripper|no\s+end.?effector/.test(text)) return "none";
  return "parallel";
}

/** Deterministic NL -> RobotSpecification (demo mode / fallback). */
export function parsePrompt(prompt: string): RobotSpecification {
  const t = (prompt || "").toLowerCase();
  const dof = extractDof(t);
  const g = gripperKind(t);
  let spec: RobotSpecification;

  if (/humanoid|biped|torso.*arms|two\s+arms/.test(t)) {
    spec = humanoid({ armDof: dof ?? 7, gripper: g !== "none", prompt });
  } else if (/hexapod|six[\s-]?legged|6[\s-]?legged|spider|insect|ant[\s-]?bot/.test(t)) {
    spec = hexapod("hexapod", prompt);
  } else if (/(rover|mars|planetary|explorer|mobile\s+manipulator|loader).*(arm|manipulat)|(arm|manipulat).*(rover|mars|planetary|mobile\s+base)/.test(t)) {
    spec = roverArm("rover_arm", dof ?? 6, prompt, { gripper: g === "none" ? "none" : "parallel" });
  } else if (/quadruped|four[\s-]?legged|dog|legged/.test(t)) {
    spec = quadruped("quadruped", prompt);
  } else if (/scara/.test(t)) {
    spec = scara({ prompt });
  } else if (/mecanum/.test(t)) {
    spec = mecanum("mecanum_robot", prompt);
  } else if (/four[\s-]?wheel|4[\s-]?wheel/.test(t)) {
    spec = fourWheel("four_wheel_robot", prompt);
  } else if (/diff(?:erential)?[\s-]?drive|two[\s-]?wheel|mobile\s+base|rover/.test(t)) {
    spec = diffDrive("diff_drive_robot", prompt);
  } else if (/gripper|end.?effector/.test(t) && !/arm/.test(t)) {
    spec = standaloneGripper(g === "suction" ? "suction" : "parallel", prompt);
  } else {
    // default: robotic arm
    spec = nDofArm(dof ?? 6, { name: `arm_${dof ?? 6}dof`, prompt, gripper: g === "none" ? "none" : "parallel" });
    if (g === "suction") { replaceGripperWithSuction(spec); }
  }

  // name from prompt if the user seems to name it
  const nameMatch = t.match(/called\s+([a-z0-9_ ]{2,30})|named\s+([a-z0-9_ ]{2,30})/);
  if (nameMatch) spec.robot_name = safeName(nameMatch[1] ?? nameMatch[2], spec.robot_name);

  // inline size directives (e.g. "1 meter long", "small", "large")
  applySizeDirectives(spec, t);
  applyInlineSensors(spec, t);
  spec.metadata.source_prompt = prompt;
  spec.metadata.notes.push(`Interpreted by demo parser: type inferred, DOF=${dofOf(spec)}, gripper=${g}.`);
  return spec;
}

const dofOf = (s: RobotSpecification) => s.joints.filter((j) => j.type !== "fixed").length;

function standaloneGripper(kind: "parallel" | "suction", prompt: string): RobotSpecification {
  const spec = nDofArm(0, { name: kind === "suction" ? "suction_gripper" : "parallel_gripper", prompt, gripper: "none" });
  // nDofArm(0) is just a base; attach the gripper to it
  const attach = "base_link";
  if (kind === "suction") attachSuctionGripper(spec, attach, 0.12);
  else attachParallelGripper(spec, attach, 0.12);
  spec.metadata.notes.push("Standalone gripper on a mount.");
  return spec;
}

// ---------------- modification engine ----------------
export interface ModResult { spec: RobotSpecification; changes: string[]; }

const LINK_ALIASES: Record<string, string[]> = {
  forearm: ["forearm"],
  upper_arm: ["upper_arm", "upperarm", "upper arm"],
  base: ["base", "base_link"],
  wrist: ["wrist_1", "wrist_2", "wrist_3", "wrist"],
  arm: ["upper_arm", "forearm", "shoulder"],
  head: ["head"],
};

function scaleFactor(text: string): number | undefined {
  let m = text.match(/(\d+(?:\.\d+)?)\s*%\s*(longer|shorter|bigger|smaller|wider|larger)/);
  if (m) { const p = parseFloat(m[1]) / 100; return /shorter|smaller/.test(m[2]) ? 1 - p : 1 + p; }
  if (/twice|double|2x|two\s+times/.test(text)) return 2;
  if (/half|halve/.test(text)) return 0.5;
  m = text.match(/(\d+(?:\.\d+)?)\s*(?:x|times)\b/);
  if (m) return parseFloat(m[1]);
  return undefined;
}

/** scale a cylinder/box link's principal length by factor, extending the chain */
function scaleLinkLength(spec: RobotSpecification, linkName: string, f: number): boolean {
  const l = spec.links.find((x) => x.name === linkName);
  if (!l) return false;
  if (l.geometry.type === "cylinder" || l.geometry.type === "capsule") l.geometry.length *= f;
  else if (l.geometry.type === "box") l.geometry.size[2] *= f;
  else return false;
  l.origin.xyz = [l.origin.xyz[0], l.origin.xyz[1], l.origin.xyz[2] * f];
  l.mass *= f;            // volume (and mass at constant density) scales with length
  l.inertia = undefined; // force recompute in finalize
  for (const j of spec.joints) if (j.parent === linkName) j.origin.xyz = [j.origin.xyz[0], j.origin.xyz[1], j.origin.xyz[2] * f];
  return true;
}

function resolveLinks(spec: RobotSpecification, text: string): string[] {
  for (const [key, aliases] of Object.entries(LINK_ALIASES)) {
    if (aliases.some((a) => text.includes(a))) {
      const names = spec.links.filter((l) => aliases.includes(l.name) || aliases.includes(l.role ?? "")).map((l) => l.name);
      if (names.length) return names;
    }
  }
  return [];
}

function applySizeDirectives(spec: RobotSpecification, t: string) {
  if (/\bsmall\b|\bmini\b|\bcompact\b/.test(t)) for (const n of resolveLinks(spec, "arm")) scaleLinkLength(spec, n, 0.7);
  if (/\blarge\b|\bbig\b/.test(t)) for (const n of resolveLinks(spec, "arm")) scaleLinkLength(spec, n, 1.4);
  const meter = t.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|metre)s?\b(?:\s+(?:long|tall|reach))?/);
  if (meter) {
    const target = parseFloat(meter[1]);
    const segs = spec.links.filter((l) => ["upper_arm", "forearm"].includes(l.role ?? ""));
    if (segs.length) {
      const per = target / segs.length;
      for (const s of segs) {
        const cur = s.geometry.type === "cylinder" ? s.geometry.length : 1;
        if (cur > 0) scaleLinkLength(spec, s.name, per / cur);
      }
    }
  }
}

function addSensor(spec: RobotSpecification, type: SensorType, where: string): string[] {
  const changes: string[] = [];
  // choose attach link
  let parent = spec.links.find((l) => /head/.test(l.name))?.name;
  if (/wrist|gripper|hand/.test(where)) parent = spec.links.find((l) => /wrist|gripper|flange|tool/.test(l.name))?.name ?? parent;
  if (/front|base|chassis/.test(where)) parent = spec.links.find((l) => l.role === "base")?.name ?? parent;
  parent ??= spec.links.find((l) => l.role === "base")?.name ?? spec.links[0]?.name;
  if (!parent) return changes;
  const sname = `${type}_${spec.sensors.filter((s) => s.type === type).length + 1}`;
  const geom: Geometry = type === "lidar" ? cyl(0.03, 0.05) : box(0.04, 0.06, 0.03);
  const lname = `${sname}_link`;
  spec.links.push(link(lname, geom, { material: "sensor_mat", role: "sensor", origin: pose([0, 0, geom.type === "cylinder" ? geom.length / 2 : 0]) }));
  spec.joints.push(joint(`${sname}_joint`, "fixed", parent, lname, { origin: pose([0, 0, 0.05]) }));
  const sensor: Sensor = { name: sname, type, parent: lname, origin: pose(), params: {} };
  spec.sensors.push(sensor);
  changes.push(`+ Added link: ${lname}`);
  changes.push(`+ Added joint: ${sname}_joint`);
  changes.push(`+ Added ${type} sensor: ${sname} on ${parent}`);
  return changes;
}

function replaceGripperWithSuction(spec: RobotSpecification): string[] {
  const changes: string[] = [];
  const grip = spec.links.filter((l) => l.role === "gripper").map((l) => l.name);
  if (!grip.length) return changes;
  const attach = spec.joints.find((j) => grip.includes(j.child) && !grip.includes(j.parent))?.parent;
  spec.links = spec.links.filter((l) => !grip.includes(l.name));
  spec.joints = spec.joints.filter((j) => !grip.includes(j.child) && !grip.includes(j.parent));
  spec.end_effectors = spec.end_effectors.filter((e) => e.type !== "two_finger_gripper" && e.type !== "parallel_gripper");
  if (attach) { attachSuctionGripper(spec, attach, 0.05); changes.push("~ Replaced parallel gripper with suction gripper"); }
  return changes;
}

/** Apply a natural-language modification to a spec (mutates a clone). */
export function applyModification(specIn: RobotSpecification, instruction: string): ModResult {
  const spec = structuredClone(specIn);
  const t = instruction.toLowerCase();
  const changes: string[] = [];

  const f = scaleFactor(t);
  if (f !== undefined && /(long|short|arm|forearm|upper|wrist|size|scale|reach)/.test(t)) {
    const targets = resolveLinks(spec, t.includes("arm") && !/forearm|upper/.test(t) ? "arm" : t);
    const picked = targets.length ? targets : resolveLinks(spec, "arm");
    for (const n of picked) {
      const before = describeLen(spec, n);
      if (scaleLinkLength(spec, n, f)) changes.push(`~ ${n} length ${before} -> ${describeLen(spec, n)}`);
    }
  }
  if (/\bwider\b|\bwide\b/.test(t)) {
    const base = spec.links.find((l) => l.role === "base");
    if (base && base.geometry.type === "box") { base.geometry.size[0] *= 1.3; base.geometry.size[1] *= 1.3; base.inertia = undefined; changes.push("~ base widened by 30%"); }
    else if (base && base.geometry.type === "cylinder") { base.geometry.radius *= 1.3; base.inertia = undefined; changes.push("~ base radius +30%"); }
  }
  for (const [rx, type] of [[/camera/, "camera"], [/lidar|laser/, "lidar"], [/imu|gyro/, "imu"], [/depth|rgb-?d/, "depth"]] as const) {
    if (rx.test(t) && /add|mount|attach|put/.test(t)) changes.push(...addSensor(spec, type as SensorType, t));
  }
  if (/suction/.test(t) && /replace|change|swap|instead/.test(t)) changes.push(...replaceGripperWithSuction(spec));
  if (/prismatic/.test(t)) {
    const which = /elbow/.test(t) ? "forearm" : /wrist/.test(t) ? "wrist" : undefined;
    const cand = spec.joints.find((j) => which ? (j.child.includes(which) || j.parent.includes(which)) : false) ?? spec.joints.find((j) => j.type === "revolute");
    if (cand) { cand.type = "prismatic"; cand.limit = { lower: 0, upper: 0.2, effort: 80, velocity: 0.5 }; changes.push(`~ joint ${cand.name} changed to prismatic`); }
  }
  if (/add\s+wheels?/.test(t)) {
    const base = spec.links.find((l) => l.role === "base")?.name;
    if (base) {
      for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
        const w = `added_${side}_wheel`;
        spec.links.push(link(w, cyl(0.06, 0.04), { material: "wheel_mat", role: "wheel", origin: pose([0, 0, 0], [Math.PI / 2, 0, 0]) }));
        spec.joints.push(joint(`${w}_joint`, "continuous", base, w, { origin: pose([0, sign * 0.18, 0]), axis: [0, 1, 0] }));
        changes.push(`+ Added link: ${w}`);
      }
    }
  }

  if (!changes.length) changes.push(`(no structural change matched "${instruction}")`);
  return { spec, changes };
}

function applyInlineSensors(spec: RobotSpecification, t: string) {
  const wants: [RegExp, SensorType, string][] = [
    [/lidar|laser\s*scan|turret/, "lidar", /front|base/.test(t) ? "front" : "head"],
    [/depth|rgb-?d|stereo/, "depth", /wrist|gripper/.test(t) ? "wrist" : "head"],
    [/camera|vision|eye|optical/, "camera", /wrist|gripper/.test(t) ? "wrist" : "head"],
    [/imu|gyro|acceleromet/, "imu", "base"],
  ];
  for (const [rx, type, where] of wants) if (rx.test(t)) addSensor(spec, type, where);
}

/** parse a budget like "$500", "under 2000 dollars", "budget of 1.5k" */
export function extractBudget(text: string): number | undefined {
  const t = text.toLowerCase();
  let m = t.match(/\$\s*([\d,.]+)\s*(k)?/) || t.match(/([\d,.]+)\s*(k)?\s*(?:usd|dollars?|budget|rupees)/) || t.match(/(?:budget|under|below|max)\D{0,8}([\d,.]+)\s*(k)?/);
  if (!m) return undefined;
  let v = parseFloat(m[1].replace(/,/g, ""));
  if (m[2] === "k") v *= 1000;
  return v > 0 ? v : undefined;
}

function describeLen(spec: RobotSpecification, name: string): string {
  const l = spec.links.find((x) => x.name === name);
  if (!l) return "?";
  if (l.geometry.type === "cylinder" || l.geometry.type === "capsule") return `${l.geometry.length.toFixed(3)}m`;
  if (l.geometry.type === "box") return `${l.geometry.size[2].toFixed(3)}m`;
  return "?";
}
