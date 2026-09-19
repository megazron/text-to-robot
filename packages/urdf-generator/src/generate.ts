// Deterministic URDF generator. Pure functions; the LLM never builds XML.
import type { RobotSpecification, Link, Joint, Geometry, Material, Pose, Sensor } from "@ttr/robot-schema";
import { inertiaOf, poseToMat } from "@ttr/kinematics";
import { num, vec, xmlName } from "./format.ts";

const originTag = (p: Pose): string => `<origin xyz="${vec(p.xyz)}" rpy="${vec(p.rpy)}"/>`;

let MESH_PREFIX = "package://robot/meshes/";
/** exporters set this so mesh paths resolve as package://<pkg>/meshes/<file> (ROS) or a relative dir (simulators) */
export function setMeshPackage(pkg: string) { MESH_PREFIX = `package://${xmlName(pkg)}/meshes/`; }
export function setMeshPrefix(prefix: string) { MESH_PREFIX = prefix; }

export function generateGeometry(g: Geometry): string {
  switch (g.type) {
    // buildPart already bakes recipe.scale into the exported vertices.
    case "mesh": return `<geometry><mesh filename="${MESH_PREFIX}${xmlName(g.file.replace(/\.stl$/i, ""))}.stl"/></geometry>`;
    case "box": return `<geometry><box size="${vec(g.size)}"/></geometry>`;
    case "cylinder": return `<geometry><cylinder radius="${num(g.radius)}" length="${num(g.length)}"/></geometry>`;
    case "sphere": return `<geometry><sphere radius="${num(g.radius)}"/></geometry>`;
    // URDF has no capsule primitive -> approximate with a cylinder (documented).
    case "capsule": return `<geometry><cylinder radius="${num(g.radius)}" length="${num(g.length)}"/></geometry>`;
  }
}

export function generateMaterial(m: Material): string {
  return `<material name="${xmlName(m.name)}"><color rgba="${vec(m.color)}"/></material>`;
}

export function generateVisual(l: Link): string {
  const mat = l.material ? `\n  <material name="${xmlName(l.material)}"/>` : "";
  if (l.geometry.type === "capsule") return capsuleElements("visual",l.geometry,l.origin,mat);
  return `<visual>\n  ${originTag(l.origin)}\n  ${generateGeometry(l.geometry)}${mat}\n</visual>`;
}

export function generateCollision(l: Link, meshCollisions = false): string {
  const g = l.collision ?? l.geometry;
  if (g.type === "capsule") return capsuleElements("collision",g,l.origin);
  if (g.type === "mesh" && g.part === "arm_spar" && !meshCollisions && (!g.scale || g.scale[0]===g.scale[1])) {
    const radial=g.scale?.[0]??1, axial=g.scale?.[2]??1;
    const dimension=(key:string,fallback:number)=>{const value=g.params?.[key];return typeof value==="number"?value:fallback;};
    const length=dimension('length',.25)*axial, radius=dimension('radius',.025)*radial, neck=dimension('neck',.010)*radial;
    const gap=dimension('gap',.04)*axial, bevel=Math.min(dimension('gap',.04)*.3,.006)*axial;
    // Conservative union covers the bevels without filling the narrow ends.
    return [neck,radius].map((r,i)=>`<collision>\n  ${originTag(l.origin)}\n  ${generateGeometry({type:"cylinder",radius:r,length:i===0?length:length-2*gap+2*bevel})}\n</collision>`).join("\n");
  }
  if (g.type === "mesh" && !meshCollisions) {
    // collision fallback for meshes: their bounding box (cheap, stable in every physics engine)
    const size = [g.bbox.max[0] - g.bbox.min[0], g.bbox.max[1] - g.bbox.min[1], g.bbox.max[2] - g.bbox.min[2]].map((d) => Math.max(d, 1e-3));
    const c = [(g.bbox.max[0] + g.bbox.min[0]) / 2, (g.bbox.max[1] + g.bbox.min[1]) / 2, (g.bbox.max[2] + g.bbox.min[2]) / 2];
    const origin = offsetOrigin(l.origin, c);
    return `<collision>\n  ${originTag(origin)}\n  <geometry><box size="${vec(size)}"/></geometry>\n</collision>`;
  }
  return `<collision>\n  ${originTag(l.origin)}\n  ${generateGeometry(g)}\n</collision>`;
}

/** URDF has no capsule primitive: its exact occupied shape is a cylinder plus
 * end spheres. Explicit inertial remains that of their union, not their sum. */
function capsuleElements(tag: string,g: Extract<Geometry,{type:"capsule"}>,origin:Pose,material=""):string {
  const parts:{geometry:Geometry;origin:Pose}[]=[{geometry:{type:"cylinder",radius:g.radius,length:g.length},origin},
    ...[-1,1].map((sign)=>({geometry:{type:"sphere" as const,radius:g.radius},origin:offsetOrigin(origin,[0,0,sign*g.length/2])}))];
  return parts.map((p)=>`<${tag}>\n  ${originTag(p.origin)}\n  ${generateGeometry(p.geometry)}${material}\n</${tag}>`).join("\n");
}

export function generateInertial(l: Link): string {
  const I = l.inertia ?? inertiaOf(l.geometry, l.mass);
  const origin = l.geometry.type === "mesh" && l.geometry.centroid
    ? offsetOrigin(l.origin, l.geometry.centroid) : l.origin;
  return `<inertial>\n  ${originTag(origin)}\n  <mass value="${num(l.mass)}"/>\n` +
    `  <inertia ixx="${num(I.ixx)}" ixy="${num(I.ixy)}" ixz="${num(I.ixz)}" iyy="${num(I.iyy)}" iyz="${num(I.iyz)}" izz="${num(I.izz)}"/>\n</inertial>`;
}

/** Translate a point expressed in the geometry frame into the link frame. */
function offsetOrigin(origin: Pose, point: number[]): Pose {
  const m = poseToMat(origin);
  return { xyz: [0, 1, 2].map((r) => m[4*r] * point[0] + m[4*r+1] * point[1] + m[4*r+2] * point[2] + m[4*r+3]) as Pose["xyz"], rpy: origin.rpy };
}

export function generateLink(l: Link, meshCollisions = false): string {
  const body = [generateVisual(l), generateCollision(l,meshCollisions), generateInertial(l)]
    .map((s) => s.split("\n").map((x) => "  " + x).join("\n")).join("\n");
  return `<link name="${xmlName(l.name)}">\n${body}\n</link>`;
}

export function generateLimits(j: Joint): string {
  if (j.type === "continuous" && j.limit) return `  <limit effort="${num(j.limit.effort)}" velocity="${num(j.limit.velocity)}"/>\n`;
  if (j.type !== "revolute" && j.type !== "prismatic") return "";
  const L = j.limit!;
  const lo = L.lower ?? 0, up = L.upper ?? 0;
  return `  <limit lower="${num(lo)}" upper="${num(up)}" effort="${num(L.effort)}" velocity="${num(L.velocity)}"/>\n`;
}

export function generateJoint(j: Joint): string {
  const needsAxis = j.type === "revolute" || j.type === "continuous" || j.type === "prismatic";
  const axis = needsAxis ? `  <axis xyz="${vec(j.axis)}"/>\n` : "";
  const limits = generateLimits(j);
  const dyn = j.dynamics ? `  <dynamics damping="${num(j.dynamics.damping)}" friction="${num(j.dynamics.friction)}"/>\n` : "";
  return `<joint name="${xmlName(j.name)}" type="${j.type}"${j.passive ? ' passive="true"' : ""}>\n` +
    `  <parent link="${xmlName(j.parent)}"/>\n  <child link="${xmlName(j.child)}"/>\n` +
    `  ${originTag(j.origin)}\n${axis}${limits}${dyn}</joint>`;
}

function header(spec: RobotSpecification): string {
  const inf = spec.metadata.inferred_fields.length;
  return `<!-- Generated by text-to-robot (https://github.com/megazron/text-to-robot)\n` +
    `     robot: ${spec.robot_name}\n` +
    (spec.metadata.source_prompt ? `     prompt: ${spec.metadata.source_prompt.replace(/-->/g, "--")}\n` : "") +
    `     ${spec.links.length} links, ${spec.joints.length} joints, ${inf} inferred values\n-->`;
}

export function generateUrdf(spec: RobotSpecification, opts: { meshPrefix?: string; meshCollisions?: boolean } = {}): string {
  if (opts.meshPrefix !== undefined) setMeshPrefix(opts.meshPrefix); else setMeshPackage(spec.robot_name);
  const parts: string[] = [];
  parts.push(`<?xml version="1.0"?>`);
  parts.push(header(spec));
  parts.push(`<robot name="${xmlName(spec.robot_name)}">`);
  for (const m of spec.materials) parts.push("  " + generateMaterial(m));
  for (const l of spec.links) parts.push(indentBlock(generateLink(l,opts.meshCollisions)));
  for (const j of spec.joints) parts.push(indentBlock(generateJoint(j)));
  parts.push(`</robot>`);
  return parts.join("\n") + "\n";
}

function indentBlock(s: string): string {
  return s.split("\n").map((l) => (l ? "  " + l : l)).join("\n");
}
