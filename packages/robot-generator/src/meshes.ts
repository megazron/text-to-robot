import type { RobotSpecification } from "@ttr/robot-schema";
import { buildPart, toStlBinary } from "@ttr/mesh";

/** Binary STL for every mesh part in the spec, keyed by filename (deterministic, regenerated from recipes). */
export function collectMeshFiles(spec: RobotSpecification): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const l of spec.links) {
    const g = l.geometry; if (g.type !== "mesh" || out[g.file]) continue;
    out[g.file] = toStlBinary(buildPart(g), 1);
  }
  return out;
}
export const hasMeshes = (spec: RobotSpecification) => spec.links.some((l) => l.geometry.type === "mesh");
