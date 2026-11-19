// Small helpers for building specs in a readable, consistent way.
import type { Pose, Vec3, RobotSpecification } from "./types.ts";

export const pose = (xyz: Vec3 = [0, 0, 0], rpy: Vec3 = [0, 0, 0]): Pose => ({ xyz, rpy });
export const originAtEnd = (length: number): Vec3 => [0, 0, length];

export function emptySpec(name: string, prompt?: string): RobotSpecification {
  return {
    robot_name: name,
    links: [],
    joints: [],
    materials: [],
    sensors: [],
    end_effectors: [],
    metadata: {
      generator: "text-to-robot",
      created: new Date().toISOString(),
      inferred_fields: [],
      notes: [],
      source_prompt: prompt,
    },
  };
}

/** clamp/sanitize a robot or file name to a safe identifier */
export function safeName(raw: string, fallback = "robot"): string {
  const s = (raw || "").toString().trim().toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_{2,}/g, "_");
  // (the trailing "_" by hand: an unanchored /_+$/ tries every start in a long run of underscores)
  const t = s.endsWith("_") ? s.slice(0, -1) : s;
  if (!t || !/^[a-z_]/.test(t)) return fallback;
  return t.slice(0, 64);
}
