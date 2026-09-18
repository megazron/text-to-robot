// Deterministic validation of a RobotSpecification: shape, physics and topology.
// Never throws on bad data -- returns a structured result with a checklist.
import type {
  RobotSpecification, Link, Joint, Geometry, ValidationIssue, ValidationResult,
} from "./types.ts";
import { JOINT_TYPES } from "./types.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function geometryDims(g: Geometry): number[] {
  switch (g.type) {
    case "box": return g.size;
    case "cylinder": return [g.radius, g.length];
    case "sphere": return [g.radius];
    case "capsule": return [g.radius, g.length];
    case "mesh": return [g.volume, g.bbox.max[0] - g.bbox.min[0], g.bbox.max[1] - g.bbox.min[1], g.bbox.max[2] - g.bbox.min[2]];
  }
}

export function findRoot(spec: RobotSpecification): { root?: string; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const childSet = new Set(spec.joints.map((j) => j.child));
  const roots = spec.links.map((l) => l.name).filter((n) => !childSet.has(n));
  if (roots.length === 0) {
    issues.push({ severity: "error", code: "no_root", message: "no root link (every link is a child of some joint -> cycle)" });
    return { issues };
  }
  if (roots.length > 1) {
    issues.push({ severity: "error", code: "multiple_roots", message: `expected exactly one root link, found ${roots.length}: ${roots.join(", ")}` });
    return { root: roots[0], issues };
  }
  return { root: roots[0], issues };
}

export function validateSpec(spec: RobotSpecification): ValidationResult {
  const issues: ValidationIssue[] = [];
  const checks: string[] = [];
  const err = (code: string, message: string, path?: string) =>
    issues.push({ severity: "error", code, message, path });
  const warn = (code: string, message: string, path?: string) =>
    issues.push({ severity: "warning", code, message, path });

  // --- names ---
  const linkNames = new Set<string>();
  for (const l of spec.links) {
    if (linkNames.has(l.name)) err("dup_link", `duplicate link name '${l.name}'`, `links.${l.name}`);
    linkNames.add(l.name);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(l.name)) err("bad_link_name", `link name '${l.name}' is not a valid identifier`);
  }
  const jointNames = new Set<string>();
  for (const j of spec.joints) {
    if (jointNames.has(j.name)) err("dup_joint", `duplicate joint name '${j.name}'`, `joints.${j.name}`);
    jointNames.add(j.name);
  }

  // --- per-link physics/geometry ---
  for (const l of spec.links) {
    if (!(l.mass > 0)) err("bad_mass", `link '${l.name}' must have positive mass (got ${l.mass})`, `links.${l.name}.mass`);
    for (const d of geometryDims(l.geometry)) {
      if (!(d > 0)) err("bad_dim", `link '${l.name}' has a non-positive geometry dimension (${d})`, `links.${l.name}.geometry`);
    }
    if (l.inertia) {
      checkInertia(l, err, warn);
    } else {
      warn("no_inertia", `link '${l.name}' has no inertia (will be computed from geometry)`, `links.${l.name}.inertia`);
    }
  }

  // --- per-joint checks ---
  for (const j of spec.joints) {
    if (!JOINT_TYPES.includes(j.type)) err("bad_joint_type", `joint '${j.name}' has invalid type '${j.type}'`, `joints.${j.name}.type`);
    if (!linkNames.has(j.parent)) err("missing_parent", `joint '${j.name}' references missing parent link '${j.parent}'`, `joints.${j.name}.parent`);
    if (!linkNames.has(j.child)) err("missing_child", `joint '${j.name}' references missing child link '${j.child}'`, `joints.${j.name}.child`);
    if (j.parent === j.child) err("self_loop", `joint '${j.name}' has parent === child ('${j.parent}')`, `joints.${j.name}`);
    if (j.type === "revolute" || j.type === "continuous" || j.type === "prismatic") {
      const [ax, ay, az] = j.axis;
      const norm = Math.hypot(ax, ay, az);
      if (near(norm, 0)) err("bad_axis", `joint '${j.name}' has a zero axis`, `joints.${j.name}.axis`);
    }
    if (j.type === "revolute" || j.type === "prismatic") {
      if (!j.limit) err("no_limit", `${j.type} joint '${j.name}' must define limits`, `joints.${j.name}.limit`);
      else {
        if (j.limit.lower === undefined || j.limit.upper === undefined)
          err("no_range", `joint '${j.name}' needs lower and upper limits`, `joints.${j.name}.limit`);
        else if (j.limit.lower > j.limit.upper)
          err("bad_range", `joint '${j.name}' has lower > upper (${j.limit.lower} > ${j.limit.upper})`, `joints.${j.name}.limit`);
        if (!(j.limit.effort > 0)) warn("bad_effort", `joint '${j.name}' effort should be positive`, `joints.${j.name}.limit.effort`);
        if (!(j.limit.velocity > 0)) warn("bad_velocity", `joint '${j.name}' velocity should be positive`, `joints.${j.name}.limit.velocity`);
      }
    }
  }

  // --- topology: single parent per child ---
  const parentCount = new Map<string, number>();
  for (const j of spec.joints) parentCount.set(j.child, (parentCount.get(j.child) ?? 0) + 1);
  for (const [child, n] of parentCount) if (n > 1) err("multi_parent", `link '${child}' has ${n} parents (must be exactly one)`);

  // --- root + reachability + cycles ---
  const { root, issues: rootIssues } = findRoot(spec);
  issues.push(...rootIssues);
  if (root) {
    const childrenOf = new Map<string, string[]>();
    for (const j of spec.joints) {
      if (!childrenOf.has(j.parent)) childrenOf.set(j.parent, []);
      childrenOf.get(j.parent)!.push(j.child);
    }
    const seen = new Set<string>();
    const stack = [root];
    let cyclic = false;
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) { cyclic = true; continue; }
      seen.add(n);
      for (const c of childrenOf.get(n) ?? []) stack.push(c);
    }
    if (cyclic) err("cycle", "kinematic tree contains a cycle");
    const unreachable = spec.links.map((l) => l.name).filter((n) => !seen.has(n));
    if (unreachable.length) err("unreachable", `links not connected to root: ${unreachable.join(", ")}`);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const valid = errors.length === 0;

  // checklist
  checks.push(valid ? "✓ Robot topology valid" : "✗ Robot topology INVALID");
  checks.push(`✓ ${spec.links.length} links`);
  checks.push(`✓ ${spec.joints.length} joints`);
  checks.push((spec.links.every((l) => l.inertia) ? "✓" : "⚠") + " Inertia present on all links");
  checks.push((spec.links.every((l) => l.collision ?? l.geometry) ? "✓" : "✗") + " Collision geometry present");
  if (root) checks.push(`✓ Root link: ${root}`);

  return { valid, issues, checks };
}

function checkInertia(l: Link, err: (c: string, m: string, p?: string) => void, warn: (c: string, m: string, p?: string) => void) {
  const I = l.inertia!;
  const path = `links.${l.name}.inertia`;
  const diag = [I.ixx, I.iyy, I.izz];
  if (diag.some((v) => !(v > 0))) { err("bad_inertia", `link '${l.name}' has non-positive principal inertia`, path); return; }
  // triangle inequalities for a valid rigid-body inertia (principal, ignoring products)
  const [a, b, c] = diag;
  if (a + b < c - 1e-9 || b + c < a - 1e-9 || a + c < b - 1e-9)
    warn("inertia_triangle", `link '${l.name}' inertia violates the triangle inequality (physically unusual)`, path);
}
