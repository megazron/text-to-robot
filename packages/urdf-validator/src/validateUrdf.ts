import type { ValidationResult, ValidationIssue } from "@ttr/robot-schema";
import { JOINT_TYPES } from "@ttr/robot-schema";
import { parseXml, XmlParseError, findAll, findFirst } from "./xml.ts";

export function validateUrdf(xml: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const checks: string[] = [];
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message });

  let root: ReturnType<typeof parseXml>;
  try { root = parseXml(xml); }
  catch (e) {
    const msg = e instanceof XmlParseError ? e.message : String(e);
    return { valid: false, issues: [{ severity: "error", code: "xml_parse", message: `URDF is not well-formed XML: ${msg}` }], checks: ["✗ URDF XML parse failed"] };
  }

  const robot = findFirst(root, "robot");
  if (!robot) return { valid: false, issues: [{ severity: "error", code: "no_robot", message: "no <robot> root element" }], checks: ["✗ No <robot> element"] };

  const links = findAll(robot, "link");
  const joints = findAll(robot, "joint");
  const linkNames = new Set<string>();
  for (const l of links) {
    const name = l.attrs.name;
    if (!name) { err("link_no_name", "a <link> is missing a name"); continue; }
    if (linkNames.has(name)) err("dup_link", `duplicate link name '${name}'`);
    linkNames.add(name);
    const inertial = findFirst(l, "inertial");
    if (!inertial) warn("no_inertial", `link '${name}' has no <inertial>`);
    else {
      // a physical inertia: positive mass, positive principal moments that satisfy the triangle inequality (MuJoCo refuses others)
      const mass = Number(findFirst(inertial, "mass")?.attrs.value), I = findFirst(inertial, "inertia")?.attrs ?? {};
      const [a, b, c] = ["ixx", "iyy", "izz"].map((k) => Number(I[k]));
      if (!(mass > 0)) err("bad_mass", `link '${name}' has mass ${findFirst(inertial, "mass")?.attrs.value}`);
      else if (!(a > 0 && b > 0 && c > 0)) err("bad_inertia", `link '${name}' has a non-positive principal inertia (${a}, ${b}, ${c})`);
      else if (a + b < c || a + c < b || b + c < a) err("inertia_triangle", `link '${name}' inertia breaks A + B >= C (${a}, ${b}, ${c})`);
    }
  }
  if (links.length === 0) err("no_links", "URDF has no links");

  const jointNames = new Set<string>();
  for (const j of joints) {
    const name = j.attrs.name ?? "(unnamed)";
    if (jointNames.has(name)) err("dup_joint", `duplicate joint name '${name}'`);
    jointNames.add(name);
    const type = j.attrs.type;
    if (!type || !(JOINT_TYPES as readonly string[]).includes(type)) err("bad_type", `joint '${name}' has invalid type '${type}'`);
    const parent = findFirst(j, "parent")?.attrs.link;
    const child = findFirst(j, "child")?.attrs.link;
    if (!parent) err("no_parent", `joint '${name}' has no <parent>`);
    else if (!linkNames.has(parent)) err("bad_parent", `joint '${name}' parent '${parent}' is not a defined link`);
    if (!child) err("no_child", `joint '${name}' has no <child>`);
    else if (!linkNames.has(child)) err("bad_child", `joint '${name}' child '${child}' is not a defined link`);
    if ((type === "revolute" || type === "prismatic") && !findFirst(j, "limit")) err("no_limit", `${type} joint '${name}' has no <limit>`);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const valid = errors.length === 0;
  checks.push(valid ? "✓ URDF validation passed" : "✗ URDF validation failed");
  checks.push(`✓ ${links.length} links, ${joints.length} joints parsed`);
  return { valid, issues, checks };
}
