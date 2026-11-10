// What a robot is for, read from its joints and links rather than from its family name, so a robot nobody has designed yet
// still gets the right motions: wheels are continuous joints that carry a wheel; feet are the lowest ends of leg chains;
// an arm is the chain to a tool point; a gripper is the joints that carry fingers; doors are servo hinges named in the
// design record; a wearable is a body whose limb joints are passive (the wearer moves them).
import type { RobotSpecification } from "@ttr/robot-schema";
import { type Model, type KJoint, fk, chain, linkBox, jointFrame, qVector, linkT } from "./model.ts";
import { type V3, apply, sub, norm, scale, add, ident, type T34 } from "./math.ts";

export interface Wheel { joint: number; link: number; radius: number; center: V3; axis: V3; mecanum: boolean; }
export interface Leg { foot: number; point: V3; contactDrop: number; joints: number[]; side: number; x: number; }
export interface Arm { tip: number; point: V3; joints: number[]; grip: number[]; side: number; reach: number; }
export interface Grip { joint: number; open: number; closed: number; }
export type Anat = "shoulder_flex" | "shoulder_abd" | "shoulder_rot" | "elbow_flex" | "wrist_flex" | "wrist_rot" | "hip_flex" | "hip_abd" | "hip_rot" | "knee_flex" | "ankle_flex" | "ankle_roll" | "neck_yaw" | "neck_pitch" | "waist_yaw" | "spine_flex";
/** a joint with an anatomical meaning: sign makes positive = flexion forward, abduction outward, yaw to the left */
export interface AnatJoint { joint: number; cls: Anat; side: number; sign: number; }
export interface Semantics {
  wheels: Wheel[]; legs: Leg[]; arms: Arm[]; grips: Grip[];
  doors: number[][]; latches: number[]; faceplate: number[];
  wearable: boolean; humanoid: boolean; mecanum: boolean;
  anatomy: AnatJoint[];
  /** what kind of thing it is, for the purpose demo */
  purpose: "wearable" | "humanoid" | "legged" | "wheeled" | "arm" | "gripper" | "other";
  home: Record<string, number>;
  /** world z of the floor when the robot stands at home with its root at the origin */
  ground: number;
  size: number;
}

const has = (s: string, re: RegExp) => re.test(s.toLowerCase());
const GRIP_RE = /grip|finger|claw|jaw|pinch/;
const WHEEL_RE = /wheel|sprocket|track|drive/;

export function analyze(m: Model): Semantics {
  const spec = m.spec, design = ((spec.metadata as any)?.design ?? {}) as Record<string, any>;
  const home: Record<string, number> = {};
  for (const [k, v] of Object.entries((design.home ?? {}) as Record<string, number>)) if (m.joint.has(k)) home[k] = v;
  const q0 = qVector(m, home), W = fk(m, q0);
  const role = (i: number) => (spec.links[i].role ?? "").toLowerCase(), lname = (i: number) => m.links[i];
  const box = (i: number) => linkBox(spec.links[i]);
  const worldBox = (i: number, Wx = W) => { const b = box(i); if (!b) return null; const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity]; for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) { const p = apply(Wx, [x, y, z], 12 * i); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } } return { lo, hi }; };
  let gz = Infinity, lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.links.length; i++) { const b = worldBox(i); if (!b) continue; gz = Math.min(gz, b.lo[2]); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.lo[k]); hi[k] = Math.max(hi[k], b.hi[k]); } }
  const size = Math.max(0.05, norm(sub(hi, lo)));
  const free = m.free.map((i) => m.joints[i]);

  // ---- wheels: continuous, motor-driven, carrying a wheel-like link (round about the axis)
  const wheels: Wheel[] = [];
  for (const j of free) {
    if (j.type !== "continuous" || j.passive) continue;
    const c = j.child, r = role(c);
    if (r === "caster") continue;
    const looksWheel = r === "wheel" || has(lname(c), WHEEL_RE) || has(j.name, WHEEL_RE);
    if (!looksWheel) continue;
    const b = box(c); if (!b) continue;
    // radius: half the extent across the axis (local frame, axis is the joint axis in the child frame)
    const ax = j.axis.map(Math.abs), k = ax.indexOf(Math.max(...ax));
    const ext = [0, 1, 2].filter((d) => d !== k).map((d) => (b.max[d] - b.min[d]) / 2);
    const radius = Math.max(...ext);
    const { p, a } = jointFrame(m, W, j);
    const g = spec.links[c].geometry as any, key = String(g?.params?.key ?? "");
    wheels.push({ joint: j.index, link: c, radius, center: p, axis: a, mecanum: /mecanum|omni/i.test(key + lname(c)) });
  }

  // ---- feet: links with role foot, else the lowest leaf of a chain of two or more revolute joints (not wheels)
  const wheelLinks = new Set(wheels.flatMap((w) => [...m.below(w.link)]));
  let footLinks = m.links.map((_, i) => i).filter((i) => role(i) === "foot" && !wheelLinks.has(i));
  if (!footLinks.length && !wheels.length) {
    const leaves = m.links.map((_, i) => i).filter((i) => !m.joints.some((j) => j.parent === i) && chain(m, i).filter((x) => m.joints[x].type === "revolute" && !m.joints[x].mimic).length >= 2);
    const low = leaves.filter((i) => { const b = worldBox(i); return b && b.lo[2] < gz + 0.01; });
    if (low.length >= 2) footLinks = low;
  }
  const legs: Leg[] = [];
  for (const f of footLinks) {
    const js = chain(m, f).filter((x) => { const j = m.joints[x]; return (j.type === "revolute" || j.type === "prismatic") && !j.mimic; });
    if (js.length < 2) continue;
    const l = spec.links[f], g = l.geometry;
    const point: V3 = g.type === "sphere" ? [...l.origin.xyz] as V3 : (() => { const b = box(f)!; return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] as V3; })();
    const wp = apply(W, point, 12 * f), wb = worldBox(f)!;
    legs.push({ foot: f, point, contactDrop: wp[2] - wb.lo[2], joints: js, side: Math.sign(wp[1]) || 1, x: wp[0] });
  }
  // legs share their first joints only when the tree branches below them; keep the joints no other leg uses
  if (legs.length > 1) for (const L of legs) L.joints = L.joints.filter((x) => legs.filter((o) => o.joints.includes(x)).length === 1);
  for (let k = legs.length - 1; k >= 0; k--) if (legs[k].joints.length < 2) legs.splice(k, 1);

  // ---- grippers: joints that carry fingers or jaws
  const grips: Grip[] = [];
  const gripLinks = new Set(m.links.map((_, i) => i).filter((i) => role(i) === "gripper" || has(lname(i), GRIP_RE)));
  for (const j of free) {
    if (j.passive || j.type === "continuous") continue;
    if (!(gripLinks.has(j.child) || has(j.name, GRIP_RE))) continue;
    // open is the end that spreads the fingers furthest from each other (or from the palm)
    const gap = (v: number) => {
      const q = qVector(m, { ...home, [j.name]: v }), Wv = fk(m, q);
      const pts = [...gripLinks].map((i) => { const b = box(i); return b ? apply(Wv, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], 12 * i) : null; }).filter(Boolean) as V3[];
      if (pts.length < 2) { const p = apply(Wv, [0, 0, 0], 12 * j.child), pp = apply(Wv, [0, 0, 0], 12 * j.parent); const b = box(j.child); const c = b ? apply(Wv, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], 12 * j.child) : p; return norm(sub(c, pp)) + norm(sub(c, p)) * 0; }
      let s = 0; for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) s += norm(sub(pts[a], pts[b]));
      return s;
    };
    const lo = Number.isFinite(j.lower) ? j.lower : -0.5, hi = Number.isFinite(j.upper) ? j.upper : 0.5;
    const gl = gap(lo), gh = gap(hi);
    let open = gh >= gl ? hi : lo, closed = gh >= gl ? lo : hi;
    if (Math.abs(gh - gl) < 1e-6) { open = Math.abs(hi) >= Math.abs(lo) ? hi : lo; closed = open === hi ? lo : hi; }
    grips.push({ joint: j.index, open, closed });
  }
  const gripSet = new Set(grips.map((g) => g.joint));

  // ---- doors, latches and the faceplate of a wearable (named in its design record)
  const doors: number[][] = ((design.door_sequence ?? []) as string[][]).map((st) => st.filter((n) => m.joint.has(n)).map((n) => m.joint.get(n)!)).filter((st) => st.length);
  const latches = free.filter((j) => /latch|pawl/.test(j.name)).map((j) => j.index);
  const faceplate = free.filter((j) => /faceplate|visor|mask/.test(j.name)).map((j) => j.index);

  // ---- anatomy: shoulder, elbow, hip, knee ... with the sense of each joint measured, not guessed
  const anatomy: AnatJoint[] = [];
  const legJoints = new Set(legs.flatMap((l) => l.joints));
  for (const j of free) {
    if (j.type !== "revolute" || gripSet.has(j.index) || doors.flat().includes(j.index) || latches.includes(j.index) || faceplate.includes(j.index)) continue;
    const n = j.name.toLowerCase(), { p, a } = jointFrame(m, W, j);
    const side = /(^|_)(l|left)(_|$)|^left|^l_/.test(n) ? 1 : /(^|_)(r|right)(_|$)|^right|^r_/.test(n) ? -1 : Math.abs(p[1]) > 0.02 ? Math.sign(p[1]) : 0;
    const ax = [Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])], dirn = ax.indexOf(Math.max(...ax)); // 0 roll, 1 pitch, 2 yaw
    let part: string | null = null;
    for (const [re, name] of [[/shoulder|upper_arm/, "shoulder"], [/elbow|forearm/, "elbow"], [/wrist|hand/, "wrist"], [/hip|thigh/, "hip"], [/knee|shin/, "knee"], [/ankle|foot/, "ankle"], [/neck|head/, "neck"], [/waist|torso|spine|chest/, "waist"]] as [RegExp, string][]) if (re.test(n)) { part = name; break; }
    if (!part) continue;
    if ((part === "hip" || part === "knee" || part === "ankle") && legs.length && !legJoints.has(j.index) && !j.passive) continue;
    const cls: Anat | null = ({
      shoulder: ["shoulder_abd", "shoulder_flex", "shoulder_rot"], elbow: ["elbow_flex", "elbow_flex", "elbow_flex"], wrist: ["wrist_rot", "wrist_flex", "wrist_rot"],
      hip: ["hip_abd", "hip_flex", "hip_rot"], knee: ["knee_flex", "knee_flex", "knee_flex"], ankle: ["ankle_roll", "ankle_flex", "ankle_roll"],
      neck: ["neck_pitch", "neck_pitch", "neck_yaw"], waist: ["spine_flex", "spine_flex", "waist_yaw"],
    } as Record<string, Anat[]>)[part][dirn];
    // sense: move the joint a little and watch the distal end of what it carries
    const tip = farthest(m, W, j);
    const d = 0.05, Wd = fk(m, qVector(m, { ...home, [j.name]: (home[j.name] ?? 0) + d }));
    const move = sub(apply(Wd, tip.local, 12 * tip.link), apply(W, tip.local, 12 * tip.link));
    let sign: number;
    if (cls === "knee_flex") sign = move[0] <= 0 ? 1 : -1;                       // the shin swings back
    else if (cls.endsWith("_flex") || cls === "neck_pitch") sign = move[0] + move[2] >= 0 ? 1 : -1;   // forward (and up)
    else if (cls.endsWith("_abd") || cls === "ankle_roll") sign = (side || 1) * move[1] >= 0 ? 1 : -1; // away from the body
    else sign = a[2] >= 0 ? 1 : -1;                                                 // turns to the left
    anatomy.push({ joint: j.index, cls, side, sign });
  }

  // ---- arms: chains to a tool point (design tcp, an end effector, a gripper or hand), without leg or wheel joints
  const arms: Arm[] = [];
  const tips: { link: number; point: V3 }[] = [];
  const tcp = design.tcp as { link: string; xyz: number[] } | undefined;
  if (tcp && m.link.has(tcp.link)) tips.push({ link: m.link.get(tcp.link)!, point: tcp.xyz as V3 });
  for (const ee of spec.end_effectors ?? []) if (m.link.has(ee.attach_link) && !tips.some((t) => t.link === m.link.get(ee.attach_link))) {
    const l = m.link.get(ee.attach_link)!;
    tips.push({ link: l, point: fingerPoint(m, W, l, gripLinks) });
  }
  for (let i = 0; i < m.links.length; i++) {
    const r = role(i);
    if (!(r === "hand" || r === "tool_link" || (r === "gripper" && !tips.length) || /hand|tool/.test(lname(i)) && !/thumb/.test(lname(i)))) continue;
    if (tips.some((t) => t.link === i || m.below(t.link).has(i) || m.below(i).has(t.link))) continue;
    const parentOfGrip = r === "gripper" && m.parentJoint[i] >= 0 ? m.joints[m.parentJoint[i]].parent : i;
    if (tips.some((t) => t.link === parentOfGrip)) continue;
    tips.push({ link: parentOfGrip, point: fingerPoint(m, W, parentOfGrip, gripLinks) });
  }
  const wheelJ = new Set(wheels.map((w) => w.joint));
  for (const t of tips) {
    const js = chain(m, t.link).filter((x) => { const j = m.joints[x]; return j.type !== "fixed" && !j.mimic && !j.passive && !wheelJ.has(x) && !legJoints.has(x) && !gripSet.has(x); });
    if (js.length < 1) continue;
    const wp = apply(W, t.point, 12 * t.link);
    const base = jointFrame(m, W, m.joints[js[0]]).p;
    const reach = Math.max(0.05, armReach(m, js, t, W));
    const grip = grips.filter((g) => m.below(t.link).has(m.joints[g.joint].child) || m.below(m.joints[js[js.length - 1]].child).has(m.joints[g.joint].child)).map((g) => g.joint);
    arms.push({ tip: t.link, point: t.point, joints: js, grip, side: Math.abs(wp[1] - base[1]) > 0.01 ? Math.sign(wp[1]) : Math.sign(base[1]) || 0, reach });
  }

  // a body whose legs are hip and knee only (a wearable): the foot is the lowest point under each knee
  if (!legs.length) for (const a of anatomy.filter((x) => x.cls === "knee_flex")) {
    const shin = m.joints[a.joint].child, js = chain(m, shin).filter((x) => sem0(m, x) && anatomy.some((y) => y.joint === x));
    let low: V3 | null = null, lz = Infinity;
    for (const i of m.below(shin)) { const b = worldBox(i); if (b && b.lo[2] < lz) { lz = b.lo[2]; low = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, b.lo[2]]; } }
    if (low && js.length >= 2) legs.push({ foot: shin, point: toLocal(linkT(W, shin), low), contactDrop: 0, joints: js, side: a.side || 1, x: low[0] });
  }
  // hands of a body (a wearable's or a humanoid's without a tool point): the far end of what each elbow carries
  for (const a of anatomy.filter((x) => x.cls === "elbow_flex")) {
    const J = m.joints[a.joint];
    if (arms.some((x) => x.joints.includes(a.joint) || m.below(J.child).has(x.tip))) continue;
    const t = farthest(m, W, J), js = chain(m, t.link).filter((x) => anatomy.some((y) => y.joint === x));
    if (js.length >= 1) arms.push({ tip: t.link, point: t.local, joints: js, grip: [], side: a.side, reach: armReach(m, js, { link: t.link, point: t.local }, W) });
  }
  const passiveAnat = anatomy.filter((a) => m.joints[a.joint].passive).length;
  const wearable = passiveAnat >= 4;
  const humanoid = !wearable && legs.length === 2 && anatomy.some((a) => a.cls === "knee_flex" || a.cls === "hip_flex");
  const purpose: Semantics["purpose"] = wearable ? "wearable" : humanoid ? "humanoid" : legs.length >= 3 ? "legged" : wheels.length >= 2 ? "wheeled" : arms.some((a) => a.joints.length >= 2) ? "arm" : grips.length ? "gripper" : "other";
  return { wheels, legs, arms, grips, doors, latches, faceplate, wearable, humanoid, mecanum: wheels.length >= 4 && wheels.every((w) => w.mecanum), anatomy, purpose, home, ground: Number.isFinite(gz) ? gz : 0, size };
}

const sem0 = (m: Model, x: number) => { const j = m.joints[x]; return j.type === "revolute" && !j.mimic; };
/** the point of a link's subtree furthest from a joint, in that link's frame */
function farthest(m: Model, W: Float64Array, j: KJoint): { link: number; local: V3 } {
  const { p } = jointFrame(m, W, j);
  let best = { link: j.child, local: [0, 0, 0] as V3 }, bd = -1;
  for (const i of m.below(j.child)) {
    const b = linkBox(m.spec.links[i]); if (!b) continue;
    const c: V3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const d = norm(sub(apply(W, c, 12 * i), p));
    if (d > bd) { bd = d; best = { link: i, local: c }; }
  }
  return best;
}

/** a tool point on a link: the middle of its finger links, or the far end of its own box */
function fingerPoint(m: Model, W: Float64Array, link: number, gripLinks: Set<number>): V3 {
  const fingers = [...m.below(link)].filter((i) => gripLinks.has(i) && i !== link);
  const T = linkT(W, link);
  if (fingers.length) {
    let c: V3 = [0, 0, 0];
    for (const f of fingers) { const b = linkBox(m.spec.links[f]); if (b) c = add(c, apply(W, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], 12 * f)); }
    c = scale(c, 1 / fingers.length);
    return toLocal(T, c);
  }
  const b = linkBox(m.spec.links[link]);
  if (!b) return [0, 0, 0];
  // the end of the box furthest from where the link hangs (its frame origin is its joint)
  const corners: V3[] = [];
  for (let k = 0; k < 3; k++) for (const s of [b.min[k], b.max[k]]) { const c: V3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; c[k] = s; corners.push(c); }
  return corners.reduce((x, y) => (norm(y) > norm(x) ? y : x));
}
export function toLocal(T: T34, p: readonly number[]): V3 {
  const d = sub(p, [T[3], T[7], T[11]]);
  return [T[0] * d[0] + T[4] * d[1] + T[8] * d[2], T[1] * d[0] + T[5] * d[1] + T[9] * d[2], T[2] * d[0] + T[6] * d[1] + T[10] * d[2]];
}
function armReach(m: Model, js: number[], t: { link: number; point: V3 }, W: Float64Array): number {
  // distance from the first joint to the tool point plus the slack the chain has: the sum of joint-to-joint lengths
  const pts = js.map((x) => jointFrame(m, W, m.joints[x]).p);
  pts.push(apply(W, t.point, 12 * t.link));
  let s = 0; for (let i = 1; i < pts.length; i++) s += norm(sub(pts[i], pts[i - 1]));
  return s;
}
export const identity = ident;
export type { RobotSpecification };
