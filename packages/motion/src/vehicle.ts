// Purpose demos for bodies that are not arms, wheels or legs, chosen from what their parts are: a multirotor flies on its
// propellers, a thruster vehicle swims, a Cartesian gantry draws with its tool, a hand closes its fingers.
import { type Model, fk, jointFrame, lowestZ } from "./model.ts";
import type { Semantics } from "./semantics.ts";
import type { Builder, Trajectory } from "./traj.ts";
import { type V3, clamp, cos, sin, minJerk, planar } from "./math.ts";

const ROTOR_RE = /prop|rotor/i, FINGER_RE = /index|middle|ring|little|pinky|thumb|finger/i;
const ground = (m: Model, q: Float64Array) => lowestZ(m, fk(m, q));
const far = (m: Model, i: number) => { const j = m.joints[i]; return Math.abs(j.lower) > Math.abs(j.upper) ? j.lower : j.upper; };

/** motor-driven continuous joints that carry a propeller */
export function rotorsOf(m: Model, sem: Semantics): number[] {
  if (sem.wheels.length || sem.legs.length) return [];
  return m.free.filter((i) => { const j = m.joints[i]; return j.type === "continuous" && !j.passive && (ROTOR_RE.test(j.name) || ROTOR_RE.test(m.spec.links[j.child]?.name ?? "")); });
}
/** a body pushed by thrusters, with nothing else that moves it */
export function swims(m: Model, sem: Semantics): boolean {
  if (sem.wheels.length || sem.legs.length || rotorsOf(m, sem).length) return false;
  return m.spec.links.filter((l) => /thruster/i.test(l.name) && l.role === "actuator").length >= 2;
}
/** two horizontal prismatic axes and a vertical one: a Cartesian gantry (the vertical axis lifts the tool) */
export function gantryAxes(m: Model): { x: number; y: number; z: number | null } | null {
  const W = fk(m, new Float64Array(m.joints.length)), pris = m.free.filter((i) => m.joints[i].type === "prismatic" && !m.joints[i].mimic);
  const axis = (i: number) => jointFrame(m, W, m.joints[i]).a;
  const flat = pris.filter((i) => Math.abs(axis(i)[2]) < 0.3), up = pris.filter((i) => Math.abs(axis(i)[2]) > 0.7);
  if (flat.length < 2) return null;
  const [x, y] = flat; if (Math.abs(axis(x)[0] * axis(y)[0] + axis(x)[1] * axis(y)[1]) > 0.3) return null;
  return { x, y, z: up[0] ?? null };
}
/** finger joints of a hand: motor-driven revolute joints named for fingers, at least three */
export function fingersOf(m: Model, sem: Semantics): number[] {
  if (sem.grips.length) return [];
  const f = m.free.filter((i) => { const j = m.joints[i]; return j.type === "revolute" && !j.passive && !j.mimic && FINGER_RE.test(j.name); });
  return f.length >= 3 ? f : [];
}

// ------------------------------------------------------------------------------------------------------------------ fly
export function fly(m: Model, sem: Semantics, b: Builder): Trajectory {
  const rotors = rotorsOf(m, sem), home = new Float64Array(b.q), z0 = -ground(m, home);
  const W = fk(m, home);
  // diagonal pairs turn the opposite way (an X quad: front left and rear right one way, the other pair the other)
  const dir = new Map(rotors.map((i) => { const p = jointFrame(m, W, m.joints[i]).p; return [i, p[0] * p[1] >= 0 ? 1 : -1]; }));
  const wTop = Math.min(6 * Math.PI, ...rotors.map((i) => 0.6 * m.joints[i].velocity));
  const h = clamp(2 * sem.size, 0.6, 1.5), d = clamp(3 * sem.size, 0.8, 2.0);
  let x = 0, y = 0, z = 0, yaw = 0, pitch = 0, w = 0;
  const angle = new Map(rotors.map((i) => [i, home[i]]));
  const place = () => {
    b.base = planar(x, y, z0 + z, yaw, pitch, 0);
    for (const i of rotors) { const a = angle.get(i)! + (dir.get(i)! * w) / b.fps; angle.set(i, a); b.q[i] = a; }
  };
  const seg = (label: string, T: number, fn: (s: number, u: number) => void) => b.segment(label, () => b.run(T, (t) => { const u = clamp(t / T, 0, 1); fn(minJerk(u), u); place(); }));
  place(); b.frames[0].base = new Float64Array(b.base!);
  seg("props spin up", 1.2, (s) => { w = wTop * s; });
  seg("take off", 2.2, (s) => { z = h * s; });
  seg("hover", 0.8, () => {});
  // forward flight: the body tilts nose down to accelerate and nose up to stop (the tilt that points the thrust: a / g)
  const leg = (label: string, sign: number) => {
    const x0 = x, y0 = y, T = 2.6;
    seg(label, T, (s, u) => {
      x = x0 + sign * d * s * cos(yaw); y = y0 + sign * d * s * sin(yaw);
      const acc = (sign * d * (60 * u - 180 * u * u + 120 * u * u * u)) / (T * T);
      pitch = Math.atan(acc / 9.81);
    });
    pitch = 0;
  };
  leg("fly forward", 1);
  seg("turn", 1.6, (s) => { yaw = Math.PI * s; });
  leg("fly back", 1);
  seg("turn", 1.6, (s) => { yaw = Math.PI * (1 + s); });
  seg("land", 2.2, (s) => { z = h * (1 - s); });
  seg("props stop", 1.0, (s) => { w = wTop * (1 - s); });
  const perf = ((m.spec.metadata as any)?.design?.performance ?? {}) as Record<string, number>;
  const tr = b.finish("fly", "Fly");
  tr.notes.push(`Takes off to ${h.toFixed(1)} m, flies ${d.toFixed(1)} m out and back, tilting into the acceleration, and lands. The propellers are drawn turning at ${(wTop / (2 * Math.PI)).toFixed(1)} rev/s so they can be seen; diagonal pairs turn opposite ways, which is what holds the heading.`);
  if (perf.hover_throttle) tr.notes.push(`Hover throttle about ${Math.round(perf.hover_throttle * 100)} % and ${perf.flight_time_min ?? "?"} min of flight on the pack (the design's numbers).`);
  return tr;
}

// ----------------------------------------------------------------------------------------------------------------- swim
export function swim(m: Model, sem: Semantics, b: Builder): Trajectory {
  const home = new Float64Array(b.q), z0 = -ground(m, home);
  const perf = ((m.spec.metadata as any)?.design?.performance ?? {}) as Record<string, number>;
  const v = clamp(0.5 * (perf.top_speed_m_s || 0.6), 0.2, 0.8), d = clamp(4 * sem.size, 1.0, 3.0), rise = clamp(sem.size, 0.25, 0.6);
  let x = 0, y = 0, z = 0, yaw = 0;
  const place = () => { b.base = planar(x, y, z0 + z, yaw); };
  const seg = (label: string, T: number, fn: (s: number) => void) => b.segment(label, () => b.run(T, (t) => { fn(minJerk(clamp(t / T, 0, 1))); place(); }));
  place(); b.frames[0].base = new Float64Array(b.base!);
  b.run(0.4, () => place());
  seg("vertical thrusters lift it off the bottom", 2.0, (s) => { z = rise * s; });
  const go = (label: string) => { const x0 = x, y0 = y; seg(label, Math.max(2, (1.875 * d) / v), (s) => { x = x0 + d * s * cos(yaw); y = y0 + d * s * sin(yaw); }); };
  go("forward on the side thrusters");
  seg("turn: one side thruster ahead, the other astern", 2.4, (s) => { yaw = Math.PI * s; });
  go("back");
  seg("turn", 2.4, (s) => { yaw = Math.PI * (1 + s); });
  seg("settles on the bottom", 2.0, (s) => { z = rise * (1 - s); });
  b.run(0.4, () => place());
  const tr = b.finish("swim", "Swim");
  tr.notes.push(`Lifts ${rise.toFixed(2)} m off the bottom, cruises ${d.toFixed(1)} m out and back at ${v.toFixed(2)} m/s (half its ${perf.top_speed_m_s ?? "?"} m/s top speed), turning on its side thrusters, and settles. The thrusters are fixed to the frame, so the vehicle moves as a whole.`);
  return tr;
}

// ----------------------------------------------------------------------------------------------------------------- plot
export function plot(m: Model, sem: Semantics, b: Builder): Trajectory {
  const ax = gantryAxes(m)!, home = new Float64Array(b.q), J = (i: number) => m.joints[i];
  const W = fk(m, home), zUp = ax.z !== null ? jointFrame(m, W, J(ax.z)).a[2] > 0 : true;
  const zj = ax.z, down = zj === null ? 0 : zUp ? J(zj).lower : J(zj).upper, up = zj === null ? 0 : zUp ? J(zj).upper : J(zj).lower;
  // the pen rests 1 mm short of the end of its travel, where it meets the paper with its spring
  const touch = zj === null ? 0 : down + Math.sign(up - down) * Math.min(0.001, Math.abs(up - down) * 0.1);
  const span = (i: number) => [J(i).lower, J(i).upper] as const;
  const [xl, xh] = span(ax.x), [yl, yh] = span(ax.y), cx = (xl + xh) / 2, cy = (yl + yh) / 2, rx = 0.3 * (xh - xl), ry = 0.3 * (yh - yl);
  const pen = (v: number) => { if (zj !== null) b.move({ [zj]: v }, { minT: 0.4 }); };
  const to = (px: number, py: number) => b.move({ [ax.x]: px, [ax.y]: py }, { minT: 0.4 });
  b.hold(0.3);
  if (zj !== null) b.segment("pen up", () => pen(up));
  b.segment("to the start", () => to(cx - rx, cy - ry));
  b.segment("pen down", () => pen(touch));
  b.segment("a square", () => { to(cx + rx, cy - ry); to(cx + rx, cy + ry); to(cx - rx, cy + ry); to(cx - rx, cy - ry); });
  b.segment("pen up", () => pen(up));
  const r = 0.6 * Math.min(rx, ry);
  b.segment("to the circle", () => to(cx + r, cy));
  b.segment("pen down", () => pen(touch));
  // a circle at a steady pen speed inside every axis's speed limit
  const vmax = 0.6 * Math.min(J(ax.x).velocity, J(ax.y).velocity), T = Math.max(2, (1.875 * 2 * Math.PI * r) / vmax);   // a minimum-jerk sweep peaks at 1.875 x its mean speed
  b.segment("a circle", () => b.run(T, (t) => { const a = 2 * Math.PI * minJerk(t / T); b.q[ax.x] = cx + r * cos(a); b.q[ax.y] = cy + r * sin(a); }));
  b.segment("pen up", () => pen(up));
  b.segment("home", () => b.move(new Map([ax.x, ax.y, ...(zj !== null ? [zj] : [])].map((i) => [i, home[i]])), { minT: 0.6 }));
  b.hold(0.3);
  const tr = b.finish("plot", "Draw");
  tr.notes.push(`Draws a ${(2 * rx * 1000).toFixed(0)} x ${(2 * ry * 1000).toFixed(0)} mm square and a ${(2 * r * 1000).toFixed(0)} mm circle; the pen lifts between them${zj === null ? " (no lift axis: it stays down)" : ""}. The circle peaks at ${(vmax * 1000).toFixed(0)} mm/s, inside every axis's speed.`);
  return tr;
}

// ---------------------------------------------------------------------------------------------------------------- grasp
export function grasp(m: Model, sem: Semantics, b: Builder): Trajectory {
  const f = fingersOf(m, sem), home = new Float64Array(b.q);
  const thumb = f.filter((i) => /thumb/i.test(m.joints[i].name)), fingers = f.filter((i) => !thumb.includes(i));
  const shut = (js: number[]) => new Map(js.map((i) => [i, far(m, i)])), open = (js: number[]) => new Map(js.map((i) => [i, home[i]]));
  const byName = (rx: RegExp) => fingers.filter((i) => rx.test(m.joints[i].name));
  const twoUp = byName(/index|middle/).length === 2 ? byName(/index|middle/) : fingers.slice(0, 2);
  b.hold(0.4);
  b.segment("fist: the fingers curl", () => b.move(shut(fingers), { minT: 0.5 }));
  if (thumb.length) b.segment("fist: the thumb wraps over", () => b.move(shut(thumb), { minT: 0.5 }));
  b.hold(0.4);
  b.segment("open hand", () => b.move(open(f), { minT: 0.6 }));
  b.hold(0.4);
  b.segment("two fingers up", () => b.move(shut(f.filter((i) => !twoUp.includes(i))), { minT: 0.6 }));
  b.hold(0.4);
  b.segment("open hand", () => b.move(open(f), { minT: 0.6 }));
  b.hold(0.4);
  const tr = b.finish("grasp", "Fist and open");
  tr.notes.push("Closes into a fist with the thumb last, opens, then holds two fingers up (rock, paper, scissors). Each finger is one servo pulling a tendon; the joints that follow it are drawn coupled.");
  return tr;
}

export type { V3 };
