// Edit operations on a RobotSpecification, for editors that work on robots the engine designed (or start from nothing).
// Pure functions without DOM or WASM: the same code runs in the engine worker, in Node tests and in an editor's page.
// Edits keep the spec a valid kinematic tree: a link's world pose is set through the joint that carries it, a joint is
// created by re-basing the child's frame onto the pivot so nothing moves on screen, and deleting a link removes the
// links it carries. Parts that need geometry (catalog parts, printed parts) come from a provider the caller passes in.
import type { RobotSpecification, Link, Joint, Pose, Vec3, JointType, Geometry } from "@ttr/robot-schema";

// ------------------------------------------------------------------------------------------- rigid transforms
/** Row-major 4x4 rigid transform (metres). */
export type M4 = number[];
export const I4 = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function poseMat(p: Pose): M4 {
  const [r, pt, y] = p.rpy, cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(pt), sp = Math.sin(pt), cy = Math.cos(y), sy = Math.sin(y);
  return [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, p.xyz[0], sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, p.xyz[1], -sp, cp * sr, cp * cr, p.xyz[2], 0, 0, 0, 1];
}
const clean = (x: number) => { const v = Math.abs(x) < 1e-12 ? 0 : +x.toPrecision(12); return Object.is(v, -0) ? 0 : v; };
export function matPose(m: M4): Pose {
  const p = -Math.asin(Math.max(-1, Math.min(1, m[8])));
  let r: number, y: number;
  if (Math.abs(m[8]) < 1 - 1e-9) { r = Math.atan2(m[9], m[10]); y = Math.atan2(m[4], m[0]); }
  else { r = 0; y = Math.atan2(-m[1], m[5]); }
  return { xyz: [clean(m[3]), clean(m[7]), clean(m[11])], rpy: [clean(r), clean(p), clean(y)] };
}
export function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return o;
}
export function inv(m: M4): M4 {
  const t = [m[3], m[7], m[11]];
  const R = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  return [R[0], R[1], R[2], -(R[0] * t[0] + R[1] * t[1] + R[2] * t[2]), R[3], R[4], R[5], -(R[3] * t[0] + R[4] * t[1] + R[5] * t[2]), R[6], R[7], R[8], -(R[6] * t[0] + R[7] * t[1] + R[8] * t[2]), 0, 0, 0, 1];
}
export const apply = (m: M4, p: Vec3): Vec3 => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
export const rotate = (m: M4, d: Vec3): Vec3 => [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
export const unrotate = (m: M4, d: Vec3): Vec3 => [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
export const unit = (v: Vec3): Vec3 => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Rotation that turns unit vector a onto unit vector b (row-major 4x4, no translation). */
export function rotBetween(a: Vec3, b: Vec3): M4 {
  a = unit(a); b = unit(b);
  const c = dot(a, b);
  if (c > 1 - 1e-12) return I4();
  let k = cross(a, b);
  if (c < -1 + 1e-12) k = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
  return axisAngle(unit(k), Math.acos(Math.max(-1, Math.min(1, c))));
}
export function axisAngle(k: Vec3, t: number): M4 {
  const [x, y, z] = unit(k), c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, 0, y * x * C + z * s, c + y * y * C, y * z * C - x * s, 0, z * x * C - y * s, z * y * C + x * s, c + z * z * C, 0, 0, 0, 0, 1];
}
export const translate = (t: Vec3): M4 => [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2], 0, 0, 0, 1];

// ------------------------------------------------------------------------------------------- tree queries
export function rootLink(spec: RobotSpecification): string | undefined {
  const children = new Set(spec.joints.map((j) => j.child));
  return spec.root && spec.links.some((l) => l.name === spec.root) ? spec.root : spec.links.find((l) => !children.has(l.name))?.name;
}
export const parentJoint = (spec: RobotSpecification, link: string) => spec.joints.find((j) => j.child === link);
export function subtree(spec: RobotSpecification, link: string): Set<string> {
  const out = new Set([link]);
  for (let grew = true; grew;) { grew = false; for (const j of spec.joints) if (out.has(j.parent) && !out.has(j.child)) { out.add(j.child); grew = true; } }
  return out;
}
/** World transform of every link frame in configuration q (zero pose by default). */
export function worldFrames(spec: RobotSpecification, q: Record<string, number> = {}): Map<string, M4> {
  const out = new Map<string, M4>(), root = rootLink(spec);
  if (!root) return out;
  out.set(root, I4());
  const byParent = new Map<string, Joint[]>();
  for (const j of spec.joints) byParent.set(j.parent, [...(byParent.get(j.parent) ?? []), j]);
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    for (const j of byParent.get(n) ?? []) {
      if (out.has(j.child)) continue;
      const v = q[j.name] ?? 0;
      const motion = j.type === "prismatic" ? translate(unit(j.axis).map((x) => x * v) as Vec3) : j.type === "revolute" || j.type === "continuous" ? axisAngle(j.axis, v) : I4();
      out.set(j.child, mul(mul(out.get(n)!, poseMat(j.origin)), motion));
      stack.push(j.child);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- scene graph
export type NodeKind = "part" | "printed" | "body" | "frame";
export interface SceneNode {
  /** link name: unique in the robot */
  name: string;
  kind: NodeKind;
  /** catalog key of a bought part */
  key?: string;
  link: Link;
  /** the joint that carries this link (null for the root) */
  joint: Joint | null;
  children: string[];
}
/** The spec as an editable tree of links (bought parts, printed bodies, plain bodies, frames) joined by joints. */
export interface Scene {
  root: string | null;
  nodes: Record<string, SceneNode>;
  /** link and joint order of the spec, kept so an unedited scene writes back the identical spec */
  linkOrder: string[];
  jointOrder: string[];
  /** everything else in the spec (materials, sensors, end effectors, metadata, name, root) */
  rest: Omit<RobotSpecification, "links" | "joints">;
}
export function kindOf(l: Link): { kind: NodeKind; key?: string } {
  const g = l.geometry;
  if (g.type === "mesh" && g.part === "component") return { kind: "part", key: String(g.params?.key) };
  if (g.type === "mesh" && (g.part === "printed" || g.part === "cad")) return { kind: "printed" };
  if (l.role === "frame") return { kind: "frame" };
  return { kind: "body" };
}
export function toScene(spec: RobotSpecification): Scene {
  const { links, joints, ...rest } = spec;
  const nodes: Record<string, SceneNode> = {};
  for (const l of links) nodes[l.name] = { name: l.name, ...kindOf(l), link: l, joint: null, children: [] };
  for (const j of joints) { if (nodes[j.child]) nodes[j.child].joint = j; nodes[j.parent]?.children.push(j.child); }
  return { root: rootLink(spec) ?? null, nodes, linkOrder: links.map((l) => l.name), jointOrder: joints.map((j) => j.name), rest };
}
export function fromScene(s: Scene): RobotSpecification {
  const links = s.linkOrder.filter((n) => s.nodes[n]).map((n) => s.nodes[n].link);
  const byName = new Map<string, Joint>();
  for (const n of Object.values(s.nodes)) if (n.joint) byName.set(n.joint.name, n.joint);
  const joints = s.jointOrder.filter((n) => byName.has(n)).map((n) => byName.get(n)!);
  const { robot_name, root, ...more } = s.rest;
  return { robot_name, ...(root !== undefined ? { root } : {}), links, joints, ...more } as RobotSpecification;
}

// ------------------------------------------------------------------------------------------- edit operations
export interface PrintedParams { shape: "plate" | "bracket" | "housing" | "beam" | "servo_bracket" | "standoff_plate" | "disc"; size_mm: Vec3; wall_mm?: number; fillet_mm?: number; hole_mm?: number; holes?: number; key?: string; }
export type EditOp =
  | { op: "pose"; link: string; world: Pose }
  | { op: "translate"; link: string; by: Vec3 }
  | { op: "rotate"; link: string; axis: Vec3; angle: number; about?: Vec3 }
  | { op: "delete"; link: string }
  | { op: "duplicate"; link: string; offset?: Vec3; name?: string }
  | { op: "rename"; link?: string; joint?: string; to: string }
  | { op: "attach"; link: string; parent: string }
  | { op: "joint"; child: string; parent?: string; type: JointType; axis: Vec3; at: Vec3; lower?: number; upper?: number; effort?: number; velocity?: number; name?: string }
  | { op: "limits"; joint: string; lower?: number; upper?: number; effort?: number; velocity?: number }
  | { op: "color"; link: string; rgba: [number, number, number, number] }
  | { op: "material"; link: string; material: string }
  | { op: "add"; key?: string; printed?: PrintedParams; parent?: string; world: Pose; name?: string }
  | { op: "printed"; link: string; params: PrintedParams }
  | { op: "swap"; link: string; key: string }
  | { op: "robot_name"; to: string };

/** Geometry for parts an edit adds: a catalog part by key, or a printed part from its parameters. */
export interface PartProvider {
  component(key: string, file: string): { geometry: Geometry; mass: number; material: string; role: string };
  printed(params: PrintedParams, name: string): { geometry: Geometry; mass: number; material: string; role: string };
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function freeName(spec: RobotSpecification, base: string): string {
  const taken = new Set([...spec.links.map((l) => l.name), ...spec.joints.map((j) => j.name)]);
  const b = (base.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^([^A-Za-z_])/, "_$1") || "part").slice(0, 60);
  if (!taken.has(b)) return b;
  for (let i = 2; ; i++) if (!taken.has(`${b}_${i}`)) return `${b}_${i}`;
}
const linkOf = (spec: RobotSpecification, name: string) => { const l = spec.links.find((x) => x.name === name); if (!l) throw new Error(`no link '${name}'`); return l; };

/** Move a link (and what it carries) so its frame sits at world transform W (zero pose). */
function placeLink(spec: RobotSpecification, link: string, W: M4) {
  const j = parentJoint(spec, link);
  if (!j) throw new Error(`${link} is the root: it stays at the origin`);
  const P = worldFrames(spec).get(j.parent)!;
  j.origin = matPose(mul(inv(P), W));
}
/** Move a link's frame to world transform F without moving anything on screen: its body, joints and sensors are re-based. */
function rebase(spec: RobotSpecification, link: string, F: M4) {
  const W = worldFrames(spec).get(link)!, D = mul(inv(F), W);
  const l = linkOf(spec, link);
  l.origin = matPose(mul(D, poseMat(l.origin)));
  for (const j of spec.joints) if (j.parent === link) j.origin = matPose(mul(D, poseMat(j.origin)));
  for (const s of spec.sensors) if (s.parent === link) s.origin = matPose(mul(D, poseMat(s.origin)));
  return D;
}
const studioMeta = (spec: RobotSpecification) => ((spec.metadata as { studio?: StudioMeta }).studio ??= { edited: true, printed: {}, actuators: {} });
export interface StudioMeta { edited: boolean; printed: Record<string, PrintedParams>; /** joint -> actuator link driving it */ actuators: Record<string, string>; }

function addLink(spec: RobotSpecification, l: Link, parent: string | undefined, W: M4) {
  spec.links.push(l);
  const root = rootLink({ ...spec, links: spec.links.slice(0, -1) });
  if (!root) { l.origin = matPose(mul(W, poseMat(l.origin))); return; } // the first link of an empty robot: body at W, frame at the origin
  const p = parent ?? root, P = worldFrames(spec).get(p);
  if (!P) throw new Error(`no link '${p}' to attach to`);
  spec.joints.push({ name: freeName(spec, `${l.name}_mount`), type: "fixed", parent: p, child: l.name, origin: matPose(mul(inv(P), W)), axis: [0, 0, 1] });
}

/**
 * Apply edits to a copy of `spec`; the input is never changed. Edits are applied in order; an invalid edit throws and
 * nothing is returned. A spec that went through any edit carries `metadata.studio` (edited: true).
 */
export function applyEdits(input: RobotSpecification, ops: EditOp[], parts?: PartProvider): RobotSpecification {
  const spec = structuredClone(input);
  for (const o of ops) {
    switch (o.op) {
      case "pose": placeLink(spec, o.link, poseMat(o.world)); break;
      case "translate": { const W = worldFrames(spec).get(o.link); if (!W) throw new Error(`no link '${o.link}'`); placeLink(spec, o.link, mul(translate(o.by), W)); break; }
      case "rotate": {
        const W = worldFrames(spec).get(o.link); if (!W) throw new Error(`no link '${o.link}'`);
        const c = o.about ?? [W[3], W[7], W[11]];
        placeLink(spec, o.link, mul(translate(c), mul(axisAngle(o.axis, o.angle), mul(translate([-c[0], -c[1], -c[2]]), W)))); break;
      }
      case "delete": {
        linkOf(spec, o.link);
        const gone = subtree(spec, o.link);
        spec.links = spec.links.filter((l) => !gone.has(l.name));
        spec.joints = spec.joints.filter((j) => !gone.has(j.child) && !gone.has(j.parent));
        spec.sensors = spec.sensors.filter((s) => !gone.has(s.parent));
        spec.end_effectors = spec.end_effectors.filter((e) => !gone.has(e.attach_link));
        if (spec.root && gone.has(spec.root)) delete spec.root;
        const m = studioMeta(spec);
        for (const n of gone) delete m.printed[n];
        for (const [k, v] of Object.entries(m.actuators)) if (gone.has(v) || !spec.joints.some((j) => j.name === k)) delete m.actuators[k];
        break;
      }
      case "duplicate": {
        const j = parentJoint(spec, o.link);
        if (!j) throw new Error("the root cannot be duplicated");
        const names = new Map<string, string>(), sub = subtree(spec, o.link);
        for (const n of sub) names.set(n, freeName({ ...spec, links: [...spec.links, ...[...names.values()].map((x) => ({ name: x }) as Link)] }, n === o.link && o.name ? o.name : n));
        const m = studioMeta(spec);
        for (const l of spec.links.filter((x) => sub.has(x.name))) {
          const c = structuredClone(l); c.name = names.get(l.name)!;
          if (c.geometry.type === "mesh" && c.geometry.part !== "component") c.geometry.file = `${c.name}.stl`;
          if (c.collision?.type === "mesh" && c.collision.part !== "component") c.collision.file = `${c.name}.stl`;
          spec.links.push(c);
          if (m.printed[l.name]) m.printed[c.name] = structuredClone(m.printed[l.name]);
        }
        const W = worldFrames(spec).get(o.link)!, P = worldFrames(spec).get(j.parent)!;
        for (const x of spec.joints.filter((x) => sub.has(x.child))) {
          const c = structuredClone(x); c.name = freeName(spec, x.name); c.child = names.get(x.child)!; c.parent = names.get(x.parent) ?? x.parent;
          if (x === j) c.origin = matPose(mul(inv(P), mul(translate(o.offset ?? [0.05, 0, 0]), W)));
          if (c.mimic && names.has(c.mimic.joint)) c.mimic = { ...c.mimic, joint: names.get(c.mimic.joint)! };
          spec.joints.push(c);
          if (m.actuators[x.name]) m.actuators[c.name] = names.get(m.actuators[x.name]) ?? m.actuators[x.name];
        }
        for (const s of spec.sensors.filter((s) => sub.has(s.parent))) spec.sensors.push({ ...structuredClone(s), name: freeName({ ...spec, links: [...spec.links, ...spec.sensors.map((x) => ({ name: x.name }) as Link)] }, s.name), parent: names.get(s.parent)! });
        break;
      }
      case "rename": {
        if (!NAME.test(o.to)) throw new Error(`'${o.to}' is not a valid name (letters, digits and _)`);
        if (spec.links.some((l) => l.name === o.to) || spec.joints.some((j) => j.name === o.to)) throw new Error(`'${o.to}' is already used`);
        const m = studioMeta(spec);
        if (o.link) {
          const l = linkOf(spec, o.link); l.name = o.to;
          for (const j of spec.joints) { if (j.parent === o.link) j.parent = o.to; if (j.child === o.link) j.child = o.to; }
          for (const s of spec.sensors) if (s.parent === o.link) s.parent = o.to;
          for (const e of spec.end_effectors) if (e.attach_link === o.link) e.attach_link = o.to;
          if (spec.root === o.link) spec.root = o.to;
          if (m.printed[o.link]) { m.printed[o.to] = m.printed[o.link]; delete m.printed[o.link]; }
          for (const k of Object.keys(m.actuators)) if (m.actuators[k] === o.link) m.actuators[k] = o.to;
        } else if (o.joint) {
          const j = spec.joints.find((x) => x.name === o.joint); if (!j) throw new Error(`no joint '${o.joint}'`);
          j.name = o.to;
          for (const x of spec.joints) if (x.mimic?.joint === o.joint) x.mimic.joint = o.to;
          if (m.actuators[o.joint]) { m.actuators[o.to] = m.actuators[o.joint]; delete m.actuators[o.joint]; }
        }
        break;
      }
      case "attach": {
        const j = parentJoint(spec, o.link); if (!j) throw new Error("the root cannot be attached to another link");
        linkOf(spec, o.parent);
        if (subtree(spec, o.link).has(o.parent)) throw new Error(`${o.parent} is carried by ${o.link}: that would make a loop`);
        const W = worldFrames(spec), P = W.get(o.parent)!;
        j.parent = o.parent; j.type = "fixed"; j.origin = matPose(mul(inv(P), W.get(o.link)!)); j.axis = [0, 0, 1];
        delete j.limit; delete j.dynamics; delete j.mimic; delete j.passive;
        break;
      }
      case "joint": {
        const old = parentJoint(spec, o.child);
        if (!old && !o.parent) throw new Error(`${o.child} is the root: pick the body it turns on`);
        const parent = o.parent ?? old!.parent;
        linkOf(spec, parent); linkOf(spec, o.child);
        if (subtree(spec, o.child).has(parent)) throw new Error(`${parent} is carried by ${o.child}: that would make a loop`);
        if (!old && spec.root === o.child) delete spec.root;
        const W = worldFrames(spec), Wc = W.get(o.child)!;
        // pivot frame: at the picked point, oriented like the child; the child's frame moves onto it
        const F = [...Wc]; F[3] = o.at[0]; F[7] = o.at[1]; F[11] = o.at[2];
        if (old) rebase(spec, o.child, F); else { const D = mul(inv(F), Wc), l = linkOf(spec, o.child); l.origin = matPose(mul(D, poseMat(l.origin))); for (const j of spec.joints) if (j.parent === o.child) j.origin = matPose(mul(D, poseMat(j.origin))); }
        const P = worldFrames(spec).get(parent) ?? I4();
        const axis = unit(unrotate(F, unit(o.axis))).map(clean) as Vec3;
        const moving = o.type !== "fixed";
        const lower = o.lower ?? (o.type === "prismatic" ? 0 : -Math.PI / 2), upper = o.upper ?? (o.type === "prismatic" ? 0.05 : Math.PI / 2);
        const j: Joint = {
          name: o.name ?? (old && old.parent === parent && old.type !== "fixed" ? old.name : freeName({ ...spec, joints: spec.joints.filter((x) => x !== old) }, `${o.child}_joint`)),
          type: o.type, parent, child: o.child, origin: matPose(mul(inv(P), F)), axis: moving ? axis : [0, 0, 1],
          ...(moving ? { limit: { ...(o.type !== "continuous" ? { lower, upper } : {}), effort: o.effort ?? old?.limit?.effort ?? 1, velocity: o.velocity ?? old?.limit?.velocity ?? 2 }, dynamics: old?.dynamics ?? { damping: 0.05, friction: 0.01 } } : {}),
        };
        if (old) spec.joints[spec.joints.indexOf(old)] = j; else spec.joints.push(j);
        if (old && old.name !== j.name) { const m = studioMeta(spec); delete m.actuators[old.name]; }
        break;
      }
      case "limits": {
        const j = spec.joints.find((x) => x.name === o.joint); if (!j) throw new Error(`no joint '${o.joint}'`);
        if (j.type === "fixed") throw new Error(`${o.joint} is fixed: it has no limits`);
        const l = (j.limit ??= { effort: 1, velocity: 2 });
        for (const k of ["lower", "upper", "effort", "velocity"] as const) if (o[k] !== undefined) l[k] = o[k]!;
        if (j.type !== "continuous" && l.lower !== undefined && l.upper !== undefined && l.lower > l.upper) throw new Error("the lower limit is above the upper limit");
        break;
      }
      case "color": {
        const l = linkOf(spec, o.link), hex = o.rgba.slice(0, 3).map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0")).join("");
        const name = `colour_${hex}`;
        if (!spec.materials.some((m) => m.name === name)) spec.materials.push({ name, color: [...o.rgba] as [number, number, number, number] });
        l.material = name; break;
      }
      case "material": { if (!spec.materials.some((m) => m.name === o.material)) throw new Error(`no material '${o.material}'`); linkOf(spec, o.link).material = o.material; break; }
      case "add": {
        if (!parts) throw new Error("adding parts needs the engine's part provider");
        const name = freeName(spec, o.name ?? o.key ?? o.printed?.shape ?? "part");
        const made = o.key ? parts.component(o.key, `${o.key}.stl`) : o.printed ? parts.printed(o.printed, name) : null;
        if (!made) throw new Error("add: give a catalog key or printed parameters");
        const l: Link = { name, role: made.role, geometry: made.geometry, mass: made.mass, material: made.material, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
        if (!spec.materials.some((m) => m.name === made.material)) spec.materials.push({ name: made.material, color: [0.75, 0.77, 0.8, 1] });
        addLink(spec, l, o.parent, poseMat(o.world));
        if (o.printed) studioMeta(spec).printed[name] = structuredClone(o.printed);
        break;
      }
      case "printed": {
        if (!parts) throw new Error("printed parts need the engine's part provider");
        const l = linkOf(spec, o.link), made = parts.printed(o.params, l.name);
        l.geometry = made.geometry; delete l.collision; delete l.inertia; l.mass = made.mass;
        studioMeta(spec).printed[l.name] = structuredClone(o.params);
        break;
      }
      case "swap": {
        if (!parts) throw new Error("swapping parts needs the engine's part provider");
        const l = linkOf(spec, o.link), made = parts.component(o.key, `${o.key}.stl`);
        l.geometry = made.geometry; delete l.collision; delete l.inertia; l.mass = made.mass; l.role = made.role;
        break;
      }
      case "robot_name": { if (!NAME.test(o.to)) throw new Error(`'${o.to}' is not a valid robot name`); spec.robot_name = o.to; break; }
      default: throw new Error(`unknown edit '${(o as { op: string }).op}'`);
    }
  }
  if (ops.length) {
    studioMeta(spec).edited = true;
    const d = (spec.metadata as { design?: { request?: unknown } }).design;
    // an edited robot is no longer what its designer made: "modify" must not re-run the designer over the edits
    if (d) delete d.request;
  }
  return spec;
}

/** An empty robot to build from scratch. */
export function emptyRobot(name = "my_robot"): RobotSpecification {
  return { robot_name: name, links: [], joints: [], materials: [], sensors: [], end_effectors: [],
    metadata: { generator: "text-to-robot engine (built by hand)", created: new Date().toISOString(), inferred_fields: [], notes: [], studio: { edited: true, printed: {}, actuators: {} } } as RobotSpecification["metadata"] };
}
