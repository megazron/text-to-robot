import type { RobotSpecification, Link, Joint, Geometry, Pose, JointType, Inertia } from "@ttr/robot-schema";
import { emptySpec, pose } from "@ttr/robot-schema";
import { parseXml, findAll, findFirst, type XmlNode } from "./xml.ts";

const nums = (s: string | undefined, n: number): number[] => {
  const a = (s ?? "").trim().split(/\s+/).map(Number).filter((x) => !Number.isNaN(x));
  while (a.length < n) a.push(0);
  return a.slice(0, n);
};
const readOrigin = (node?: XmlNode): Pose => {
  const o = node && findFirst(node, "origin");
  return pose(nums(o?.attrs.xyz, 3) as [number, number, number], nums(o?.attrs.rpy, 3) as [number, number, number]);
};
function readGeometry(node?: XmlNode): Geometry {
  const g = node && findFirst(node, "geometry");
  const box = g && findFirst(g, "box");
  const cyl = g && findFirst(g, "cylinder");
  const sph = g && findFirst(g, "sphere");
  if (box) { const [x, y, z] = nums(box.attrs.size, 3); return { type: "box", size: [x, y, z] }; }
  if (cyl) return { type: "cylinder", radius: Number(cyl.attrs.radius) || 0.01, length: Number(cyl.attrs.length) || 0.01 };
  if (sph) return { type: "sphere", radius: Number(sph.attrs.radius) || 0.01 };
  const mesh = g && findFirst(g, "mesh");
  if (mesh) return { type: "box", size: [0.05, 0.05, 0.05] };   // meshes are opaque to the parser; kept as a placeholder box
  return { type: "box", size: [0.05, 0.05, 0.05] };
}

/** Parse a URDF string into a RobotSpecification (best-effort, for inspect/round-trip). */
export function parseUrdf(xml: string): RobotSpecification {
  const root = parseXml(xml);
  const robot = findFirst(root, "robot");
  const spec = emptySpec(robot?.attrs.name ?? "parsed_robot");
  spec.metadata.notes.push("Parsed from URDF.");
  if (!robot) return spec;

  for (const m of findAll(robot, "material")) {
    const c = findFirst(m, "color");
    if (m.attrs.name) spec.materials.push({ name: m.attrs.name, color: nums(c?.attrs.rgba, 4) as [number, number, number, number] });
  }
  for (const l of findAll(robot, "link")) {
    const vis = findFirst(l, "visual");
    const inert = findFirst(l, "inertial");
    const mass = Number(findFirst(inert ?? l, "mass")?.attrs.value) || 0.1;
    let inertia: Inertia | undefined;
    const iel = inert && findFirst(inert, "inertia");
    if (iel) inertia = {
      ixx: Number(iel.attrs.ixx) || 0, iyy: Number(iel.attrs.iyy) || 0, izz: Number(iel.attrs.izz) || 0,
      ixy: Number(iel.attrs.ixy) || 0, ixz: Number(iel.attrs.ixz) || 0, iyz: Number(iel.attrs.iyz) || 0,
    };
    const link: Link = {
      name: l.attrs.name ?? "link",
      geometry: readGeometry(vis),
      mass, inertia,
      material: vis && findFirst(vis, "material")?.attrs.name,
      origin: readOrigin(vis),
    };
    spec.links.push(link);
  }
  for (const j of findAll(robot, "joint")) {
    const limitEl = findFirst(j, "limit");
    const dynEl = findFirst(j, "dynamics");
    const joint: Joint = {
      name: j.attrs.name ?? "joint",
      type: (j.attrs.type as JointType) ?? "fixed",
      parent: findFirst(j, "parent")?.attrs.link ?? "",
      child: findFirst(j, "child")?.attrs.link ?? "",
      origin: readOrigin(j),
      axis: nums(findFirst(j, "axis")?.attrs.xyz ?? "0 0 1", 3) as [number, number, number],
    };
    if (limitEl) joint.limit = {
      lower: Number(limitEl.attrs.lower) || 0, upper: Number(limitEl.attrs.upper) || 0,
      effort: Number(limitEl.attrs.effort) || 0, velocity: Number(limitEl.attrs.velocity) || 0,
    };
    if (dynEl) joint.dynamics = { damping: Number(dynEl.attrs.damping) || 0, friction: Number(dynEl.attrs.friction) || 0 };
    spec.joints.push(joint);
  }
  return spec;
}
