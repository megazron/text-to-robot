// Fill computed fields (inertia, collision) and collate inferred markers.
import type { RobotSpecification, Geometry } from "@ttr/robot-schema";
import { inertiaOf } from "@ttr/kinematics";

const clone = <T>(x: T): T => structuredClone(x);

export function finalizeSpec(spec: RobotSpecification): RobotSpecification {
  const inferred = new Set<string>(spec.metadata.inferred_fields);
  const materialNames = new Set(spec.materials.map((m) => m.name));

  for (const l of spec.links) {
    if (!l.inertia) { l.inertia = inertiaOf(l.geometry, l.mass); (l.inferred ??= []).push("inertia"); }
    // physics engines reject degenerate tensors: floor the principal moments of very small parts
    for (const k of ["ixx", "iyy", "izz"] as const) if (l.inertia[k] < 1e-7) l.inertia[k] = 1e-7;
    if (!l.collision) l.collision = clone(l.geometry) as Geometry;
    for (const f of l.inferred ?? []) inferred.add(`links.${l.name}.${f}`);
    if (l.material && !materialNames.has(l.material)) {
      spec.materials.push({ name: l.material, color: [0.7, 0.7, 0.72, 1] });
      materialNames.add(l.material);
    }
  }
  for (const j of spec.joints) for (const f of j.inferred ?? []) inferred.add(`joints.${j.name}.${f}`);

  spec.metadata.inferred_fields = [...inferred].sort();
  return spec;
}

/** total actuated DOF (revolute/continuous/prismatic) */
export const dofCount = (spec: RobotSpecification): number =>
  spec.joints.filter((j) => j.type !== "fixed" && !j.passive).length;
