// For custom LlmProvider implementations only (see index.ts); unused by the shipped generator.
// Coerce untrusted model output into a RobotSpecification-shaped object.
// The generator still runs full validation + repair afterwards.
import type { RobotSpecification } from "@ttr/robot-schema";
import { emptySpec, safeName } from "@ttr/robot-schema";

export function extractJson(text: string): unknown {
  // the first ``` fenced block (an optional "json" after the opening fence), found by position: one pass over the text
  let body = text;
  const open = text.indexOf("```");
  if (open >= 0) {
    let from = open + 3;
    if (text.startsWith("json", from)) from += 4;
    while (from < text.length && /\s/.test(text[from])) from++;
    const close = text.indexOf("```", from);
    if (close >= 0) body = text.slice(from, close);
  }
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
