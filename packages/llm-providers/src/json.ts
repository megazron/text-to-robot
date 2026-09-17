// Coerce untrusted model output into a RobotSpecification-shaped object.
// The generator still runs full validation + repair afterwards.
import type { RobotSpecification } from "@ttr/robot-schema";
import { emptySpec, safeName } from "@ttr/robot-schema";

export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object found in model output");
  return JSON.parse(body.slice(start, end + 1));
}

export function coerceSpec(raw: unknown, prompt: string): RobotSpecification {
  const o = (raw ?? {}) as Record<string, unknown>;
  const spec = emptySpec(safeName(String(o.robot_name ?? "robot")), prompt);
  spec.links = Array.isArray(o.links) ? (o.links as RobotSpecification["links"]) : [];
  spec.joints = Array.isArray(o.joints) ? (o.joints as RobotSpecification["joints"]) : [];
  spec.materials = Array.isArray(o.materials) ? (o.materials as RobotSpecification["materials"]) : [];
  spec.sensors = Array.isArray(o.sensors) ? (o.sensors as RobotSpecification["sensors"]) : [];
  spec.end_effectors = Array.isArray(o.end_effectors) ? (o.end_effectors as RobotSpecification["end_effectors"]) : [];
  spec.metadata.notes.push("Produced by an LLM provider; validated + repaired locally.");
  return spec;
}
