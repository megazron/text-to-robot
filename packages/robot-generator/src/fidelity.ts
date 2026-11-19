// What a built robot has, counted from its joints: arms (and the joints of each), wheels, legs. Compared with what the
// prompt asked for (request.ts), so a count that was not built is always said with the result, never dropped.
import type { RobotSpecification } from "@ttr/robot-schema";
import type { RequestShape } from "./request.ts";

export interface BuiltShape {
  /** joints per arm, one entry per arm, in the robot's order */
  arms: { prefix: string; dof: number }[];
  /** driven wheels plus casters */
  wheels: number;
  /** wheels on a motor (or a passive rocker), casters left out */
  driven: number;
  legs: number;
  family: string;
}

// Joint names are read as "_"-separated words (a regular expression with "(?:^|_)...(?:_\w+)?$" takes quadratic time on
// a long adversarial name). The prefix is what comes before the earliest word where the joint's own name starts.
const word = (x: string) => /^\w+$/.test(x);
const LEG_WORDS = new Set(["hip", "knee", "ankle", "coxa", "femur", "tibia", "thigh", "shin"]);
/** the name's prefix when it ends in a leg joint ("fl_hip_pitch" -> "fl"), else undefined */
function legPrefix(name: string): string | undefined {
  const w = name.split("_");
  for (let i = 0; i < w.length; i++) if (LEG_WORDS.has(w[i]) && w.slice(i + 1).every(word)) return w.slice(0, i).join("_");
  return undefined;
}
/** the name's prefix when it ends in an arm joint ("arm_1_shoulder_pitch" -> "arm_1"), else undefined */
function armPrefix(name: string): string | undefined {
  const w = name.split("_"), n = w.length, rest = (i: number) => w.slice(i).every(word);
  for (let i = 0; i < n; i++) {
    const a = w[i], tail = n - i;
    if ((a === "shoulder" || a === "elbow" || a === "wrist") && rest(i + 1)) return w.slice(0, i).join("_");
    if (tail === 2 && ((a === "base" && w[i + 1] === "yaw") || (a === "forearm" && w[i + 1] === "roll") || (a === "turret" && w[i + 1] === "yaw"))) return w.slice(0, i).join("_");
    if (tail === 3 && a === "upper" && w[i + 1] === "arm" && (w[i + 2] === "roll" || w[i + 2] === "yaw")) return w.slice(0, i).join("_");
  }
  return undefined;
}
/** a joint that roots an arm: a shoulder (any shoulder joint), a base yaw or a turret yaw */
const rootsArm = (name: string) => { const w = name.split("_"), n = w.length, i = w.findIndex((x) => x.startsWith("shoulder")); return (i >= 0 && w.slice(i).every(word)) || (n >= 2 && (w[n - 2] === "base" || w[n - 2] === "turret") && w[n - 1] === "yaw"); };

export function builtShape(spec: RobotSpecification): BuiltShape {
  const moving = spec.joints.filter((j) => (j.type === "revolute" || j.type === "continuous" || j.type === "prismatic") && !j.mimic && !j.passive);
  const arms = new Map<string, number>(), legs = new Set<string>();
  for (const j of moving) {
    if (/gripper|finger|jaw|thumb|wheel|steer|rocker|bogie|neck|head|eye|lid|door|tail|prop|rotor|thruster/.test(j.name)) continue;
    const leg = legPrefix(j.name);
    if (leg !== undefined) { legs.add(leg || "leg"); continue; }
    const arm = armPrefix(j.name);
    if (arm !== undefined) { const p = arm || "arm"; arms.set(p, (arms.get(p) ?? 0) + 1); }
  }
  // a hand's wrist or a humanoid's head yaw is not an arm: an arm has at least a shoulder or a base and one more joint
  const rooted = new Set(moving.filter((j) => rootsArm(j.name) && armPrefix(j.name) !== undefined).map((j) => armPrefix(j.name) || "arm"));
  const armList = [...arms].filter(([p]) => rooted.has(p)).map(([prefix, dof]) => ({ prefix, dof }));
  const wheelJoints = spec.joints.filter((j) => /wheel/.test(j.name) && !/steer/.test(j.name) && j.type !== "fixed").length;
  const casters = new Set(spec.joints.filter((j) => /caster/.test(j.name) && j.type !== "fixed").map((j) => j.name.replace(/_(?:roll|spin|swivel|wheel|pivot|ball)$/, ""))).size;
  const family = String((spec.metadata as { design?: { family?: string }; family?: string }).design?.family ?? (spec.metadata as { family?: string }).family ?? "");
  return { arms: armList, wheels: wheelJoints + casters, driven: wheelJoints, legs: legs.size, family };
}

/** Counts asked for and not built, in words; empty when the robot has what was asked. */
export function shapeGaps(asked: RequestShape, built: BuiltShape): string[] {
  const out: string[] = [];
  if (asked.arms) {
    if (built.arms.length !== asked.arms.count) out.push(`${asked.arms.count} arms asked ("${asked.arms.said}"), ${built.arms.length} built`);
    asked.arms.dofs.forEach((d, i) => { const b = built.arms[i]; if (d !== undefined && b && b.dof !== d) out.push(`arm ${i + 1}: ${d} DOF asked, ${b.dof} built`); });
  }
  if (asked.wheels && built.wheels && asked.wheels.count !== built.wheels && asked.wheels.count !== built.driven) out.push(`${asked.wheels.count} wheels asked, ${built.wheels} built`);
  if (asked.legs && built.legs && asked.legs.count !== built.legs) out.push(`${asked.legs.count} legs asked, ${built.legs} built`);
  return out;
}
