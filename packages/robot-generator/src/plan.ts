// The body plan: a robot described by its parts (how it moves, its arms, tools, sensors, payload), in a form a model
// can write and the rule parser can read. A model's plan is untrusted: every field is checked against a closed list
// and clamped to what the designers build, and anything left out or changed is said with the result.
import { TOOL_LABEL, type ToolKind } from "./tools.ts";

export const LOCOMOTION = ["fixed", "wheels", "tracks", "mecanum", "legs", "multirotor", "underwater", "snake", "gantry", "delta", "wearable"] as const;
export const EFFECTORS = ["none", "parallel", "suction", "hand"] as const;
export const SENSORS = ["camera", "depth", "lidar", "imu", "ultrasonic"] as const;
export type Locomotion = typeof LOCOMOTION[number];

export interface BodyPlan {
  locomotion: Locomotion;
  /** wheels or legs */
  count?: number;
  arms?: { count: number; dof?: number; reach_m?: number };
  effector?: typeof EFFECTORS[number];
  tools?: ToolKind[];
  sensors?: (typeof SENSORS)[number][];
  payload_kg?: number;
  budget_usd?: number;
  size?: "tiny" | "small" | "medium" | "large";
  /** one line: what the robot is for */
  task?: string;
}

/** JSON schema for structured output (Anthropic output_config.format, OpenAI response_format). */
export const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["locomotion", "count", "arms", "effector", "tools", "sensors", "payload_kg", "budget_usd", "size", "task"],
  properties: {
    locomotion: { type: "string", enum: [...LOCOMOTION] },
    count: { type: "integer", description: "number of wheels (2, 4 or 6) or legs (2, 4 or 6); 0 when not applicable" },
    arms: { type: "object", additionalProperties: false, required: ["count", "dof", "reach_m"], properties: { count: { type: "integer" }, dof: { type: "integer" }, reach_m: { type: "number" } } },
    effector: { type: "string", enum: [...EFFECTORS] },
    tools: { type: "array", items: { type: "string", enum: Object.keys(TOOL_LABEL) } },
    sensors: { type: "array", items: { type: "string", enum: [...SENSORS] } },
    payload_kg: { type: "number", description: "0 when not stated" },
    budget_usd: { type: "number", description: "0 when not stated" },
    size: { type: "string", enum: ["tiny", "small", "medium", "large"] },
    task: { type: "string" },
  },
} as const;

export const PLAN_SYSTEM_PROMPT = [
  "You turn a request for a robot into a body plan for a design engine that builds robots from real, purchasable parts and 3D-printed structure.",
  "Pick the simplest body that does the job. Locomotion: fixed (a bench arm, gripper or desk machine), wheels, tracks, mecanum, legs, multirotor (a drone), underwater (a thruster ROV), snake, gantry (Cartesian XYZ), delta, wearable.",
  "Tools are task attachments the robot carries; effector is what an arm holds with. Use only the listed values.",
  "If the request is for something harmful (a weapon, watching people without consent, hurting animals), set task to \"REFUSE: <reason>\" and use fixed locomotion.",
  "If it is physically impossible, plan the nearest buildable robot and say what was changed in task.",
  "Reply with the JSON object only.",
].join(" ");

const clampInt = (x: unknown, lo: number, hi: number) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined; };

/** A model's raw output -> a checked plan and the prompt the local parser builds from it, with notes on what was changed. */
export function planFromModel(raw: unknown): { plan: BodyPlan; prompt: string; notes: string[] } {
  const o = (typeof raw === "string" ? JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) : raw ?? {}) as Record<string, unknown>;
  const notes: string[] = [];
  const task = typeof o.task === "string" ? o.task.replace(/[<>]/g, "").slice(0, 200) : "";
  if (/^\s*refuse\b/i.test(task)) throw new Error(`the model declined: ${task.replace(/^\s*refuse:?\s*/i, "")}`);
  const loco = LOCOMOTION.includes(o.locomotion as Locomotion) ? o.locomotion as Locomotion : (notes.push(`model gave locomotion "${String(o.locomotion).slice(0, 30)}", not one the engine builds; used a fixed base`), "fixed");
  const arms = o.arms && typeof o.arms === "object" ? o.arms as Record<string, unknown> : {};
  const armCount = clampInt(arms.count, 0, 2) ?? 0, dof = clampInt(arms.dof, 1, 7);
  const reach = Number(arms.reach_m) > 0 ? Math.min(1.5, Number(arms.reach_m)) : undefined;
  const effector = EFFECTORS.includes(o.effector as never) ? o.effector as BodyPlan["effector"] : "none";
  const tools = (Array.isArray(o.tools) ? o.tools : []).filter((x): x is ToolKind => typeof x === "string" && x in TOOL_LABEL);
  const dropped = (Array.isArray(o.tools) ? o.tools : []).filter((x) => !(typeof x === "string" && x in TOOL_LABEL));
  if (dropped.length) notes.push(`model asked for tools the engine has no module for: ${dropped.map((x) => String(x).slice(0, 24)).join(", ")}`);
  const sensors = (Array.isArray(o.sensors) ? o.sensors : []).filter((x): x is BodyPlan["sensors"] extends (infer U)[] | undefined ? U : never => SENSORS.includes(x as never));
  const plan: BodyPlan = { locomotion: loco, count: clampInt(o.count, 0, 8), ...(armCount ? { arms: { count: armCount, ...(dof ? { dof } : {}), ...(reach ? { reach_m: reach } : {}) } } : {}),
    effector, tools, sensors, ...(Number(o.payload_kg) > 0 ? { payload_kg: Math.min(50, Number(o.payload_kg)) } : {}), ...(Number(o.budget_usd) > 0 ? { budget_usd: Math.round(Number(o.budget_usd)) } : {}),
    ...(["tiny", "small", "medium", "large"].includes(o.size as string) ? { size: o.size as BodyPlan["size"] } : {}), ...(task ? { task } : {}) };
  return { plan, prompt: planPrompt(plan), notes };
}

/** A plan in the words the rule parser reads. */
export function planPrompt(p: BodyPlan): string {
  const n = p.count ?? 0, arm = p.arms ? `${p.arms.dof ? `${p.arms.dof} dof ` : ""}arm${p.arms.reach_m ? ` with ${p.arms.reach_m.toFixed(2)} m reach` : ""}` : "";
  const base: Record<Locomotion, string> = {
    fixed: arm ? `${arm}` : p.effector === "hand" ? "robotic hand" : p.effector && p.effector !== "none" ? `${p.effector} gripper` : "4 dof robot arm",
    wheels: arm ? `${n === 4 ? "four wheel " : ""}rover with an ${arm}` : n === 4 || n === 6 ? "four wheel robot" : "differential drive robot",
    tracks: arm ? `tracked rover with an ${arm}` : "tracked robot",
    mecanum: arm ? `mecanum rover with an ${arm}` : "mecanum robot",
    legs: n === 2 ? "humanoid robot" : n === 6 ? "hexapod" : arm ? `quadruped with an ${arm}` : "quadruped",
    multirotor: "quadcopter drone", underwater: "underwater rov", snake: "snake robot", gantry: "cartesian gantry robot", delta: "delta robot", wearable: "wearable exoskeleton",
  };
  const parts = [p.size && p.size !== "medium" ? p.size : "", base[p.locomotion]];
  if (p.effector === "suction") parts.push("with a suction gripper"); else if (p.effector === "parallel" && p.locomotion !== "fixed") parts.push("with a gripper");
  if (p.effector === "none" && (p.arms || p.locomotion === "fixed")) parts.push("without a gripper");
  for (const t of p.tools ?? []) parts.push(`with a ${TOOL_LABEL[t]}`);
  for (const s of p.sensors ?? []) parts.push(`with ${s === "depth" ? "a depth camera" : s === "imu" ? "an imu" : s === "ultrasonic" ? "an ultrasonic sensor" : `a ${s}`}`);
  if (p.payload_kg) parts.push(`payload ${p.payload_kg} kg`);
  if (p.budget_usd) parts.push(`budget $${p.budget_usd}`);
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
