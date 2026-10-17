// Small structural queries over a RobotSpecification shared by the parser modules.
import type { RobotSpecification, Geometry, Joint } from "@ttr/robot-schema";

export const dofOf = (s: RobotSpecification) => s.joints.filter((j) => j.type !== "fixed").length;

export const len3 = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

export function geometryLength(g: Geometry): number | undefined {
  if (g.type === "cylinder" || g.type === "capsule") return g.length;
  if (g.type === "box") return g.size[2];
  if (g.type === "mesh") return g.bbox.max[2] - g.bbox.min[2];
  return undefined;
}


/** Joints from the root to `linkName`, in order. */
export function chainTo(spec: RobotSpecification, linkName: string): Joint[] {
  const byChild = new Map(spec.joints.map((j) => [j.child, j]));
  const out: Joint[] = [];
  for (let j = byChild.get(linkName); j; j = byChild.get(j.parent)) out.unshift(j);
  return out;
}

export function subtreeLinks(spec: RobotSpecification, root: string): Set<string> {
  const out = new Set<string>([root]);
  let grew = true;
  while (grew) { grew = false; for (const j of spec.joints) if (out.has(j.parent) && !out.has(j.child)) { out.add(j.child); grew = true; } }
  return out;
}

export function linksByRoles(spec: RobotSpecification, roles: string[]): string[] {
  return spec.links.filter((l) => roles.includes(l.role ?? "") || roles.includes(l.name)).map((l) => l.name);
}
