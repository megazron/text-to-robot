// Human motion on a robot's joints, and the servo motions of a wearable. Clips are real motion capture (CC0, see clips.ts)
// as anatomical angles; they are retargeted onto whatever joints a robot has for each anatomical movement (semantics.ts),
// clamped to that joint's range, and every clamp is reported: on a wearable suit the range is the armour's (a move the
// plates cannot follow is "beyond the suit's range of motion"). A movement the robot has no joint for is listed as such.
import { type Model, fk, lowestZ, linkBox } from "./model.ts";
import type { Semantics, Anat } from "./semantics.ts";
import { Builder, type Trajectory, type Prop, round } from "./traj.ts";
import { type V3, planar, minJerk, sin, cos, clamp } from "./math.ts";
import { CLIPS, CLIP_CHANNELS } from "./clips.ts";

type Ch = (typeof CLIP_CHANNELS)[number];
export const HUMAN_MOTIONS = [
  { name: "idle", title: "Idle breathing", description: "standing, breathing, weight shifting" },
  { name: "walk", title: "Walk", description: "walking forward, feet planted in turn" },
  { name: "look", title: "Look around", description: "the head turns left and right" },
  { name: "wave", title: "Wave", description: "the right arm raises and waves" },
  { name: "squat", title: "Squat", description: "down into a squat and back up" },
  { name: "punch", title: "Punch", description: "a cross punch, twice" },
  { name: "arms_up", title: "Raise both arms", description: "both arms raise overhead" },
  { name: "hover", title: "Hover pose", description: "arms down, palms back, hovering" },
] as const;
const DEG = Math.PI / 180;

/** a clip's frames as channel -> value */
function clipFrames(key: string): Record<Ch, number>[] {
  const c = CLIPS[key], n = CLIP_CHANNELS.length, out: Record<Ch, number>[] = [];
  for (let k = 0; k < c.frames; k++) { const r = {} as Record<Ch, number>; CLIP_CHANNELS.forEach((ch, i) => { r[ch] = c.data[k * n + i] / 1000; }); out.push(r); }
  return out;
}
const mix = (a: Record<Ch, number>, b: Record<Ch, number>, s: number) => { const r = {} as Record<Ch, number>; for (const ch of CLIP_CHANNELS) r[ch] = a[ch] + (b[ch] - a[ch]) * s; return r; };
const loop = (fr: Record<Ch, number>[], times: number) => Array.from({ length: fr.length * times }, (_, k) => fr[k % fr.length]);
const withCh = (f: Record<Ch, number>, set: Partial<Record<Ch, number>>) => ({ ...f, ...set });
/** cross-fade from the end of a to the start of b over n frames */
function join(a: Record<Ch, number>[], b: Record<Ch, number>[], n = 9) {
  const out = a.slice(0, a.length - n);
  for (let k = 0; k < n; k++) out.push(mix(a[a.length - n + k], b[k], minJerk((k + 1) / n)));
  return out.concat(b.slice(n));
}
/** keyframed pose stretch from a base frame: minimum-jerk to `to` over n frames, hold h, back over n */
function there(base: Record<Ch, number>[], set: (f: Record<Ch, number>, s: number, k: number) => Record<Ch, number>) { return base.map((f, k) => set(f, 0, k)); }

function human(name: string): { frames: Record<Ch, number>[]; note: string } {
  const idle = clipFrames("idle");
  switch (name) {
    case "idle": return { frames: loop(idle, 3), note: "Motion capture: Idle_Loop." };
    case "walk": return { frames: loop(clipFrames("walk"), 5), note: "Motion capture: Walk_Loop." };
    case "look": {
      const fr = loop(idle, 3), n = fr.length;
      return { frames: fr.map((f, k) => { const u = k / (n - 1); const yaw = 0.75 * (u < 0.33 ? minJerk(u / 0.33) : u < 0.66 ? 1 - 2 * minJerk((u - 0.33) / 0.33) : -1 + minJerk((u - 0.66) / 0.34)); return withCh(f, { neck_yaw: f.neck_yaw + yaw, neck_pitch: f.neck_pitch + 0.12 * sin(u * Math.PI * 4) }); }), note: "Motion capture (Idle_Loop) with the head turn keyframed." };
    }
    case "wave": {
      const fr = loop(idle, 3), n = fr.length;
      return { frames: there(fr, (f, _s, k) => { const u = k / (n - 1), up = minJerk(u / 0.18) * (1 - minJerk((u - 0.82) / 0.18)), w = up * 0.45 * sin(((u - 0.18) / 0.64) * Math.PI * 8) * (u > 0.18 && u < 0.82 ? 1 : 0);
        return withCh(f, { shoulder_abd_r: f.shoulder_abd_r + (2.6 - f.shoulder_abd_r) * up, shoulder_flex_r: f.shoulder_flex_r + (0.35 - f.shoulder_flex_r) * up, elbow_flex_r: f.elbow_flex_r + (1.4 - f.elbow_flex_r) * up + w }); }), note: "Motion capture (Idle_Loop) with the waving arm keyframed: the library has no wave." };
    }
    case "squat": {
      const sq = clipFrames("squat_hold"), mean = (a: Ch, b: Ch) => (sq[0][a] + sq[0][b]) / 2;
      const target = withCh(idle[0], { hip_flex_l: mean("hip_flex_l", "hip_flex_r"), hip_flex_r: mean("hip_flex_l", "hip_flex_r"), knee_flex_l: mean("knee_flex_l", "knee_flex_r"), knee_flex_r: mean("knee_flex_l", "knee_flex_r"), hip_abd_l: 0.25, hip_abd_r: 0.25, ankle_flex_l: 0.5, ankle_flex_r: 0.5, spine_flex: sq[0].spine_flex, shoulder_flex_l: 1.2, shoulder_flex_r: 1.2, elbow_flex_l: 0.2, elbow_flex_r: 0.2, root_dz: sq[0].root_dz });
      const fr = loop(idle, 3), n = fr.length;
      return { frames: fr.map((f, k) => { const u = k / (n - 1), s = minJerk((u - 0.12) / 0.3) * (1 - minJerk((u - 0.6) / 0.3)); return mix(f, target, s); }), note: "Squat depth and the legs from motion capture (Crouch_Idle_Loop, made symmetric); arms keyframed forward for balance." };
    }
    case "punch": { const p = clipFrames("punch"), lead = idle.slice(0, 24); return { frames: join(join(join(lead, p, 8), p, 6), idle.slice(0, 30), 8), note: "Motion capture: Punch_Cross, twice." }; }
    case "arms_up": {
      const fr = loop(idle, 2), n = fr.length;
      return { frames: fr.map((f, k) => { const u = k / (n - 1), s = minJerk((u - 0.1) / 0.3) * (1 - minJerk((u - 0.65) / 0.3)); return withCh(f, { shoulder_flex_l: f.shoulder_flex_l + (2.9 - f.shoulder_flex_l) * s, shoulder_flex_r: f.shoulder_flex_r + (2.9 - f.shoulder_flex_r) * s, shoulder_abd_l: f.shoulder_abd_l * (1 - s) + 0.2 * s, shoulder_abd_r: f.shoulder_abd_r * (1 - s) + 0.2 * s, elbow_flex_l: f.elbow_flex_l * (1 - s) + 0.1 * s, elbow_flex_r: f.elbow_flex_r * (1 - s) + 0.1 * s }); }), note: "Motion capture (Idle_Loop) with both arms keyframed overhead." };
    }
    case "hover": {
      const fr = loop(idle, 2), n = fr.length;
      const pose: Partial<Record<Ch, number>> = { shoulder_flex_l: -0.2, shoulder_flex_r: -0.2, shoulder_abd_l: 0.22, shoulder_abd_r: 0.22, elbow_flex_l: 0.12, elbow_flex_r: 0.12, hip_flex_l: 0.08, hip_flex_r: 0.02, hip_abd_l: 0.05, hip_abd_r: 0.05, knee_flex_l: 0.15, knee_flex_r: 0.08, neck_yaw: 0, neck_pitch: -0.05, spine_flex: 0, ankle_flex_l: -0.35, ankle_flex_r: -0.3 };
      return { frames: fr.map((f, k) => { const u = k / (n - 1), s = minJerk(u / 0.25); const breathe = 0.01 * sin(u * Math.PI * 4); return mix(f, { ...f, ...pose, root_dz: 0.02 + breathe } as Record<Ch, number>, s); }), note: "Keyframed: the classic hover pose, arms down and back; a wrist that is not in the suit cannot turn the palms." };
    }
  }
  throw new Error(`no human motion '${name}'`);
}

const CH_OF: Record<string, Ch[]> = {
  shoulder_flex: ["shoulder_flex_l", "shoulder_flex_r"], shoulder_abd: ["shoulder_abd_l", "shoulder_abd_r"], elbow_flex: ["elbow_flex_l", "elbow_flex_r"],
  hip_flex: ["hip_flex_l", "hip_flex_r"], hip_abd: ["hip_abd_l", "hip_abd_r"], knee_flex: ["knee_flex_l", "knee_flex_r"], ankle_flex: ["ankle_flex_l", "ankle_flex_r"],
};
const NAMES: Partial<Record<Anat | string, string>> = { shoulder_flex: "shoulder flexion", shoulder_abd: "shoulder abduction", elbow_flex: "elbow flexion", hip_flex: "hip flexion", hip_abd: "hip abduction", knee_flex: "knee flexion", ankle_flex: "ankle flexion", neck_yaw: "head turn", neck_pitch: "head nod", spine_flex: "spine bend" };
function channel(cls: string, side: number): Ch | null {
  if (CH_OF[cls]) return CH_OF[cls][side < 0 ? 1 : 0];
  if (cls === "neck_yaw" || cls === "neck_pitch" || cls === "spine_flex") return cls as Ch;
  return null;
}

/** each anatomical joint's range in this robot, as the person would describe it */
export function rangeOfMotion(m: Model, sem: Semantics) {
  const rows = sem.anatomy.map((a) => {
    const j = m.joints[a.joint], lo = a.sign > 0 ? j.lower : -j.upper, hi = a.sign > 0 ? j.upper : -j.lower;
    return { joint: j.name, movement: NAMES[a.cls] ?? a.cls.replace("_", " "), side: a.side > 0 ? "left" : a.side < 0 ? "right" : "", min_deg: round(lo / DEG, 1), max_deg: round(hi / DEG, 1) };
  });
  const have = new Set(sem.anatomy.map((a) => `${a.cls}/${a.side}`));
  const missing = Object.keys(NAMES).filter((cls) => !sem.anatomy.some((a) => a.cls === cls)).map((cls) => NAMES[cls]!);
  void have;
  return { joints: rows, missing };
}

export function humanMotion(m: Model, sem: Semantics, b: Builder, name: string): Trajectory {
  const raw = human(name), note = raw.note;
  const by = new Map<number, { ch: Ch; sign: number }>();
  for (const a of sem.anatomy) { const ch = channel(a.cls, a.side); if (ch) by.set(a.joint, { ch, sign: a.sign }); }
  // a person may move faster than the joints are rated for: then the clip plays slower, never faster than any joint allows
  const speed = (fr: Record<Ch, number>[]) => {
    let r = 0;
    for (let k = 1; k < fr.length; k++) for (const [i, { ch, sign }] of by) {
      const j = m.joints[i], a = clamp(sign * fr[k - 1][ch], j.lower, j.upper), c = clamp(sign * fr[k][ch], j.lower, j.upper);
      r = Math.max(r, (Math.abs(c - a) * b.fps) / j.velocity);
    }
    return r;
  };
  const resample = (st: number) => Array.from({ length: Math.round((raw.frames.length - 1) * st) + 1 }, (_, k) => { const u = k / st, i0 = Math.min(raw.frames.length - 1, Math.floor(u)), i1 = Math.min(raw.frames.length - 1, i0 + 1); return mix(raw.frames[i0], raw.frames[i1], u - i0); });
  let stretch = 1, frames = raw.frames;
  for (let k = 0, r = speed(frames); k < 6 && r > 0.97; k++, r = speed(frames)) { stretch *= r / 0.95; frames = resample(stretch); }
  const clampLog = new Map<number, { frames: number; beyond: number }>();
  // the feet: the lowest point under each knee (or hip), so the clip stands on the floor and a walking foot stays put
  const knees = sem.anatomy.filter((a) => a.cls === "knee_flex").map((a) => m.joints[a.joint].child);
  const footSets = knees.map((k) => m.below(k));
  const H = (() => { const W = fk(m, b.q); return -lowestZ(m, W, footSets.length ? new Set(footSets.flatMap((s) => [...s])) : undefined); })();
  let x = 0, prevFoot: { i: number; x: number } | null = null;
  const desiredMax = new Map<Ch, number>();
  b.frames.length = 0;
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    for (const [i, { ch, sign }] of by) {
      const j = m.joints[i], want = sign * f[ch], got = clamp(want, j.lower, j.upper);
      if (Math.abs(want - got) > DEG) { const c = clampLog.get(i) ?? { frames: 0, beyond: 0 }; c.frames++; c.beyond = Math.max(c.beyond, Math.abs(want - got)); clampLog.set(i, c); }
      b.q[i] = got;
    }
    for (const ch of CLIP_CHANNELS) desiredMax.set(ch, Math.max(desiredMax.get(ch) ?? -Infinity, Math.abs(f[ch])));
    // stand on the floor: the root drops until the lowest foot touches it; on a walk the planted foot does not slide
    const W = fk(m, b.q);
    const lows = footSets.map((s) => lowestPoint(m, W, s));
    let z = H, foot = -1;
    if (lows.length) { foot = lows[0][2] <= (lows[1]?.[2] ?? Infinity) ? 0 : 1; z = -lows[foot][2]; }
    if (name === "walk" && foot >= 0) { if (prevFoot && prevFoot.i === foot) x -= lows[foot][0] - prevFoot.x; prevFoot = { i: foot, x: lows[foot][0] }; }
    b.base = planar(x, 0, z, 0);
    b.push();
  }
  const tr = b.finish(name, HUMAN_MOTIONS.find((h) => h.name === name)!.title);
  tr.notes.push(note);
  if (stretch > 1) tr.notes.push(`Played at ${(100 / stretch).toFixed(0)} % of the person's speed so no joint passes its speed limit.`);
  const sideOf = (i: number) => sem.anatomy.find((a) => a.joint === i)!;
  for (const [i, c] of clampLog) {
    const a = sideOf(i);
    tr.clamped.push({ joint: m.joints[i].name, frames: c.frames, beyond_deg: round(c.beyond / DEG, 1), note: `${a.side > 0 ? "left " : a.side < 0 ? "right " : ""}${NAMES[a.cls] ?? a.cls}: the person goes ${(c.beyond / DEG).toFixed(0)} deg further than ${sem.wearable ? "the suit's range of motion" : "this joint's limit"} (held at the limit for ${c.frames} frames)` });
  }
  const used = new Set([...by.values()].map((v) => v.ch.replace(/_[lr]$/, "")));
  for (const [ch, v] of desiredMax) {
    const base = ch.replace(/_[lr]$/, "");
    if (ch === "root_dz" || used.has(base) || v < 20 * DEG) continue;
    if (ch.endsWith("_r") && desiredMax.has(ch.replace(/_r$/, "_l") as Ch) && !ch.startsWith("x")) { /* reported once for both sides */ }
    if (ch.endsWith("_r")) continue;
    tr.warnings.push(`${NAMES[base] ?? base}: the person moves up to ${(v / DEG).toFixed(0)} deg; ${sem.wearable ? "the suit has no joint for it, so the armour cannot follow" : "this robot has no joint for it"}.`);
  }
  if (tr.clamped.length) tr.warnings.push(`${sem.wearable ? "Beyond the suit's range of motion" : "Beyond the joints' limits"}: ${tr.clamped.map((c) => `${c.joint} by ${c.beyond_deg} deg`).join(", ")}. The motion is held at the limit there.`);
  if (name === "walk") tr.notes.push("The planted foot does not slide: the body moves forward by what the foot on the ground pushes back.");
  return tr;
}
function lowestPoint(m: Model, W: Float64Array, links: Set<number>): V3 {
  let best: V3 = [0, 0, Infinity];
  for (const i of links) {
    const bx = m.spec.links[i] && boxOf(m, i); if (!bx) continue;
    for (const x of [bx.min[0], bx.max[0]]) for (const y of [bx.min[1], bx.max[1]]) for (const z of [bx.min[2], bx.max[2]]) {
      const o = 12 * i, p: V3 = [W[o] * x + W[o + 1] * y + W[o + 2] * z + W[o + 3], W[o + 4] * x + W[o + 5] * y + W[o + 6] * z + W[o + 7], W[o + 8] * x + W[o + 9] * y + W[o + 10] * z + W[o + 11]];
      if (p[2] < best[2]) best = p;
    }
  }
  return best;
}
const boxCache = new WeakMap<Model, Map<number, ReturnType<typeof linkBox>>>();
function boxOf(m: Model, i: number) { let c = boxCache.get(m); if (!c) { c = new Map(); boxCache.set(m, c); } if (!c.has(i)) c.set(i, linkBox(m.spec.links[i])); return c.get(i); }

// ------------------------------------------------------------------------------------------------- wearable servos
const far = (m: Model, i: number) => { const j = m.joints[i]; return Math.abs(j.lower) > Math.abs(j.upper) ? j.lower : j.upper; };
const tokens = (n: string) => new Set(n.replace(/_hinge$|_pawl$/, "").split("_").filter((t) => !/^(door|latch|\d+)$/.test(t)));
function latchesOf(m: Model, sem: Semantics, door: number) { const d = tokens(m.joints[door].name); return sem.latches.filter((l) => { const t = tokens(m.joints[l].name); return [...d].every((x) => t.has(x)); }); }
const stageT = (m: Model, b: Builder, ids: number[], target: (i: number) => number) => Math.max(1.2, b.duration(new Map(ids.map((i) => [i, target(i)])), 0, 0.6));

export function suitUp(m: Model, sem: Semantics, b: Builder): Trajectory {
  const home = new Float64Array(b.q), seq = sem.doors, ground = groundOf(m, b), wearerH = Number(((m.spec.metadata as any)?.design?.performance ?? {}).wearer_height_m) || 1.75;
  const wearer: (V3 | null)[] = [];
  const mark = () => { while (wearer.length < b.frames.length) wearer.push(null); };
  const stand = planar(0, 0, -ground, 0); b.base = stand; b.frames[0].base = stand;
  b.hold(0.5); mark();
  if (sem.latches.length) b.segment("latches lift", () => b.move(new Map(sem.latches.map((i) => [i, far(m, i)])), { minT: 0.5 })); mark();
  seq.forEach((st, k) => b.segment(`open: ${st.map((i) => m.joints[i].name.replace(/_hinge$/, "")).join(", ")}`, () => {
    const ids = [...st, ...(k === seq.length - 1 ? sem.faceplate : [])];
    b.move(new Map(ids.map((i) => [i, far(m, i)])), { T: stageT(m, b, ids, (i) => far(m, i)) });
  })); mark();
  // the wearer walks in from behind along the suit's own axis and stops inside
  const tIn = 3.2, x0 = -1.6;
  b.segment("the wearer steps in", () => {
    const n0 = b.frames.length;
    b.run(tIn, (t) => { const s = minJerk(t / tIn); wearer[b.frames.length] = [x0 * (1 - s), 0, round(0.012 * Math.abs(sin((t / tIn) * Math.PI * 6)) * (1 - s), 4)]; });
    b.hold(0.4); for (let k = n0; k < b.frames.length; k++) wearer[k] ??= [0, 0, 0];
  });
  [...seq].reverse().forEach((st, k) => b.segment(`close: ${st.map((i) => m.joints[i].name.replace(/_hinge$/, "")).join(", ")}`, () => {
    const ids = [...st, ...(k === 0 ? sem.faceplate : [])];
    b.move(new Map(ids.map((i) => [i, home[i]])), { T: stageT(m, b, ids, (i) => home[i]) });
  }));
  if (sem.latches.length) b.segment("latch", () => b.move(new Map(sem.latches.map((i) => [i, home[i]])), { minT: 0.5 }));
  b.hold(0.6);
  while (wearer.length < b.frames.length) wearer.push(wearer[wearer.length - 1] ?? null);
  const tr = b.finish("suit_up", "Suit up");
  const prop: Prop = { kind: "wearer", size: [0.36, 0.5, wearerH], path: wearer.map((p) => (p ? [p[0], p[1], round(ground + p[2], 4)] as V3 : null)) };
  tr.props.push(prop);
  tr.notes.push(servoTable(m, sem, tr));
  return tr;
}
export function doorsOnly(m: Model, sem: Semantics, b: Builder): Trajectory {
  const home = new Float64Array(b.q), ground = groundOf(m, b), stand = planar(0, 0, -ground, 0);
  b.base = stand; b.frames[0].base = stand; b.hold(0.4);
  for (const st of sem.doors) {
    const lat = [...new Set(st.flatMap((d) => latchesOf(m, sem, d)))];
    b.segment(st.map((i) => m.joints[i].name.replace(/_hinge$/, "")).join(", "), () => {
      if (lat.length) b.move(new Map(lat.map((i) => [i, far(m, i)])), { minT: 0.4 });
      b.move(new Map(st.map((i) => [i, far(m, i)])), { T: stageT(m, b, st, (i) => far(m, i)) });
      b.hold(0.4);
      b.move(new Map(st.map((i) => [i, home[i]])), { T: stageT(m, b, st, (i) => home[i]) });
      if (lat.length) b.move(new Map(lat.map((i) => [i, home[i]])), { minT: 0.4 });
      b.hold(0.2);
    });
  }
  if (sem.faceplate.length) b.segment("faceplate", () => { b.move(new Map(sem.faceplate.map((i) => [i, far(m, i)])), { minT: 1.0 }); b.hold(0.4); b.move(new Map(sem.faceplate.map((i) => [i, home[i]])), { minT: 1.0 }); });
  b.hold(0.4);
  const tr = b.finish("doors", "Doors only");
  tr.notes.push(servoTable(m, sem, tr));
  return tr;
}
function groundOf(m: Model, b: Builder) { return lowestZ(m, fk(m, b.q)); }
/** servo, travel and time of each door joint in this motion */
function servoTable(m: Model, sem: Semantics, tr: Trajectory): string {
  const doors = ((m.spec.metadata as any)?.design?.doors ?? []) as { joint: string; servo: string }[];
  const rows: string[] = [];
  for (const i of [...sem.doors.flat(), ...sem.faceplate]) {
    const col = tr.joints.indexOf(m.joints[i].name); if (col < 0) continue;
    const v = tr.q.map((r) => r[col]), lo = Math.min(...v), hi = Math.max(...v);
    let first = -1, last = -1; v.forEach((x, k) => { if (Math.abs(x - v[0]) > 1e-4) { if (first < 0) first = k; last = k; } });
    const servo = doors.find((d) => d.joint === m.joints[i].name)?.servo ?? (sem.faceplate.includes(i) ? "faceplate servos" : "servo");
    rows.push(`${m.joints[i].name} (${servo}): ${(lo / DEG).toFixed(0)} to ${(hi / DEG).toFixed(0)} deg, moving ${first < 0 ? "never" : `${(first / tr.fps).toFixed(1)} to ${(last / tr.fps).toFixed(1)} s`}`);
  }
  return `Servo timing: ${rows.join("; ")}.`;
}
export { cos };
