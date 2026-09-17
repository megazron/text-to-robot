import type { RobotSpecification } from "@ttr/robot-schema";
import { findRoot, pose } from "@ttr/robot-schema";
import { finalizeSpec } from "./finalize.ts";

export interface RepairReport { actions: string[]; }

/** Best-effort structural repair. Conservative; never invents kinematics. */
export function repair(spec: RobotSpecification): RepairReport {
  const actions: string[] = [];
  const linkNames = new Set(spec.links.map((l) => l.name));

  // drop joints that reference missing links
  const before = spec.joints.length;
  spec.joints = spec.joints.filter((j) => {
    const ok = linkNames.has(j.parent) && linkNames.has(j.child) && j.parent !== j.child;
    if (!ok) actions.push(`removed dangling joint '${j.name}'`);
    return ok;
  });
  if (spec.joints.length !== before) { /* recorded above */ }

  // de-duplicate link names
  const seenL = new Set<string>();
  for (const l of spec.links) {
    let n = l.name, k = 2;
    while (seenL.has(n)) { n = `${l.name}_${k++}`; }
    if (n !== l.name) { actions.push(`renamed duplicate link '${l.name}' -> '${n}'`); l.name = n; }
    seenL.add(n);
  }
  // de-duplicate joint names
  const seenJ = new Set<string>();
  for (const j of spec.joints) {
    let n = j.name, k = 2;
    while (seenJ.has(n)) { n = `${j.name}_${k++}`; }
    if (n !== j.name) { actions.push(`renamed duplicate joint '${j.name}' -> '${n}'`); j.name = n; }
    seenJ.add(n);
  }

  // enforce single root: attach extra roots to the primary root with a fixed joint
  const childSet = new Set(spec.joints.map((j) => j.child));
  const roots = spec.links.map((l) => l.name).filter((n) => !childSet.has(n));
  if (roots.length > 1) {
    const primary = roots[0];
    for (const extra of roots.slice(1)) {
      spec.joints.push({ name: `${extra}_attach`, type: "fixed", parent: primary, child: extra, origin: pose([0, 0, 0]), axis: [0, 0, 1] });
      actions.push(`attached extra root '${extra}' to '${primary}' with a fixed joint`);
    }
  }

  // fix invalid limits
  for (const j of spec.joints) {
    if ((j.type === "revolute" || j.type === "prismatic")) {
      if (!j.limit) { j.limit = { lower: -Math.PI, upper: Math.PI, effort: 50, velocity: 2 }; actions.push(`added default limits to '${j.name}'`); }
      else if (j.limit.lower !== undefined && j.limit.upper !== undefined && j.limit.lower > j.limit.upper) {
        [j.limit.lower, j.limit.upper] = [j.limit.upper, j.limit.lower]; actions.push(`swapped inverted limits on '${j.name}'`);
      }
    }
    const norm = Math.hypot(...j.axis);
    if ((j.type === "revolute" || j.type === "continuous" || j.type === "prismatic") && norm < 1e-9) { j.axis = [0, 0, 1]; actions.push(`fixed zero axis on '${j.name}'`); }
  }

  // clamp non-positive masses / dims
  for (const l of spec.links) {
    if (!(l.mass > 0)) { l.mass = 0.1; actions.push(`set positive mass on '${l.name}'`); }
  }

  finalizeSpec(spec);
  return { actions };
}
