// Shape shells: the look of a robot (a heart, a shoe, a teapot, a cartoon head) as a printed cover over a working robot.
// The robot underneath (deck, drive, electronics, sensors) is designed as always; the shell is a hollow solid with a 2 mm
// wall, made from a small library of parametric shapes (ellipsoids, capsules, rounded boxes and their hulls), sized round
// everything on the deck and checked not to touch it, cut where it is bigger than the print bed, with windows for the
// cameras. Its printed mass is part of the robot before the drive is sized and the tipping check is run. Deterministic.
import type { Vec3 } from "@ttr/parts";
import { Manifold, build, evaluate, type Mat4, type Op } from "@ttr/solid";

export const SHAPES = ["heart", "star", "egg", "sphere", "cube", "capsule", "shoe", "car", "dog", "cat", "spider", "fish", "bird", "dragon", "teapot", "lamp", "toaster", "can", "burger", "pizza", "donut", "blob"] as const;
export type Shape = typeof SHAPES[number];
export const STYLES = ["plain", "cartoon", "cute", "sleek", "boxy", "retro", "steampunk", "mecha"] as const;
export type Style = typeof STYLES[number];
export interface ShellRequest { shape: Shape; style?: Style; colour?: [number, number, number] }

/** The colour each shape is printed in unless the prompt names one. */
export const SHAPE_COLOUR: Record<Shape, [number, number, number]> = {
  heart: [0.86, 0.12, 0.25], star: [0.98, 0.78, 0.12], egg: [0.95, 0.92, 0.84], sphere: [0.3, 0.6, 0.95], cube: [0.55, 0.6, 0.66], capsule: [0.92, 0.92, 0.94],
  shoe: [0.95, 0.95, 0.97], car: [0.85, 0.15, 0.12], dog: [0.78, 0.58, 0.36], cat: [0.45, 0.45, 0.5], spider: [0.15, 0.15, 0.17], fish: [0.98, 0.55, 0.15],
  bird: [0.2, 0.55, 0.9], dragon: [0.2, 0.6, 0.3], teapot: [0.93, 0.93, 0.9], lamp: [0.95, 0.85, 0.5], toaster: [0.75, 0.77, 0.8], can: [0.85, 0.1, 0.1],
  burger: [0.8, 0.55, 0.25], pizza: [0.95, 0.75, 0.3], donut: [0.92, 0.55, 0.7], blob: [0.6, 0.85, 0.75],
};

const D = Math.PI / 180;
/** unit sphere, turned from a half circle */
const SPHERE: Op = { op: "revolve", pts: [...Array.from({ length: 19 }, (_, i) => [Math.sin(i * 10 * D), -Math.cos(i * 10 * D)] as [number, number])], seg: 40 };
const scaleAt = (c: Vec3, s: Vec3): Mat4 => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, c[0], c[1], c[2], 1];

/** Primitives offset inward by w (0 for the outside, the wall for the cavity), in world mm. */
function prims(w: number) {
  const E = (c: Vec3, r: Vec3): Op => ({ op: "at", T: scaleAt(c, [Math.max(1, r[0] - w), Math.max(1, r[1] - w), Math.max(1, r[2] - w)]), of: [SPHERE] });
  const C = (a: Vec3, b: Vec3, r: number): Op => ({ op: "hull", of: [E(a, [r, r, r]), E(b, [r, r, r])] });
  const B = (min: Vec3, max: Vec3, r = 8): Op => ({ op: "box", min: [min[0] + w, min[1] + w, min[2] + w], max: [max[0] - w, max[1] - w, max[2] - w], r: Math.max(0.5, r - w) });
  const H = (...of: Op[]): Op => ({ op: "hull", of });
  return { E, C, B, H };
}

/**
 * The solid of a shape (outside when w = 0, cavity when w = wall) round an envelope: centre (cx, cy), half lengths a (x,
 * forward) and b (y, sideways), height h above the deck at z0. Every shape reaches a little below z0 so its cavity opens
 * onto the deck once the floor is cut.
 */
export function shapeOps(shape: Shape, style: Style, e: { cx: number; cy: number; a: number; b: number; h: number; z0: number }, w: number): Op[] {
  const { E, C, B, H } = prims(w), { cx, cy, a, b, h, z0 } = e, zb = z0 - 0.15 * h;
  const P = (x: number, y: number, z: number): Vec3 => [cx + x * a, cy + y * b, z0 + z * h];
  const body = (): Op[] => {
    switch (shape) {
      case "heart": return [H(E(P(0, -0.42, 0.66), [a, 0.58 * b, 0.36 * h]), E(P(0, 0, -0.1), [0.6 * a, 0.12 * b, 0.12 * h])), H(E(P(0, 0.42, 0.66), [a, 0.58 * b, 0.36 * h]), E(P(0, 0, -0.1), [0.6 * a, 0.12 * b, 0.12 * h]))];
      case "star": { const out: Op[] = [], core = E(P(0, 0, 0.48), [a, 0.42 * b, 0.36 * h]);
        for (let k = 0; k < 5; k++) { const t = (90 + k * 72) * D; out.push(H(core, E(P(0, 0.98 * Math.cos(t), 0.48 + 0.6 * Math.sin(t)), [0.6 * a, 0.08 * b, 0.08 * h]))); }
        return out; }
      case "egg": return [E(P(0, 0, 0.45), [a, b, 0.62 * h])];
      case "sphere": return [E(P(0, 0, 0.42), [a, b, 0.62 * h])];
      case "blob": return [H(E(P(0.2, 0, 0.4), [0.85 * a, b, 0.55 * h]), E(P(-0.25, 0, 0.5), [0.8 * a, 0.9 * b, 0.55 * h]))];
      case "cube": return [B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + h], 14)];
      case "capsule": return [C(P(0.45, 0, 0.45), P(-0.45, 0, 0.45), Math.min(0.55 * a, b, 0.6 * h))];
      case "shoe": return [H(B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.35 * h], 18), E(P(0.62, 0, 0.3), [0.4 * a, 0.95 * b, 0.42 * h])), B([cx - a, cy - 0.92 * b, zb], [cx - 0.1 * a, cy + 0.92 * b, z0 + h], 24)];
      case "car": return [B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.5 * h], 22), H(B([cx - 0.55 * a, cy - 0.85 * b, z0 + 0.4 * h], [cx + 0.3 * a, cy + 0.85 * b, z0 + h], 20), B([cx - 0.7 * a, cy - 0.85 * b, z0 + 0.4 * h], [cx + 0.5 * a, cy + 0.85 * b, z0 + 0.5 * h], 8))];
      case "dog": case "cat": return [E(P(-0.15, 0, 0.42), [0.85 * a, b, 0.55 * h]), E(P(0.62, 0, 0.82), [0.42 * a, 0.5 * b, 0.3 * h])];
      case "spider": return [E(P(-0.2, 0, 0.42), [0.8 * a, b, 0.55 * h]), E(P(0.6, 0, 0.35), [0.4 * a, 0.55 * b, 0.35 * h])];
      case "fish": return [E(P(0.05, 0, 0.45), [0.95 * a, 0.8 * b, 0.6 * h])];
      case "bird": return [E(P(-0.1, 0, 0.42), [0.9 * a, b, 0.55 * h]), E(P(0.55, 0, 0.85), [0.38 * a, 0.45 * b, 0.28 * h])];
      case "dragon": return [E(P(-0.1, 0, 0.42), [0.9 * a, b, 0.55 * h]), C(P(0.4, 0, 0.6), P(0.72, 0, 1.0), Math.min(0.2 * a, 0.25 * b)), E(P(0.8, 0, 1.05), [0.3 * a, 0.35 * b, 0.2 * h])];
      case "teapot": return [E(P(0, 0, 0.42), [0.85 * a, b, 0.55 * h])];
      case "lamp": return [E(P(0, 0, 0.2), [a, b, 0.35 * h]), C(P(0, 0, 0.3), P(0, 0, 0.75), Math.min(0.18 * a, 0.18 * b)), E(P(0, 0, 0.88), [0.7 * a, 0.7 * b, 0.2 * h])];
      case "toaster": return [B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + h], 26)];
      case "can": return [H(E(P(0, 0, 0.02), [Math.min(a, b), Math.min(a, b), 0.12 * h]), E(P(0, 0, 0.92), [Math.min(a, b), Math.min(a, b), 0.12 * h]))];
      case "burger": return [E(P(0, 0, 0.12), [a, b, 0.28 * h]), E(P(0, 0, 0.42), [1.02 * a, 1.02 * b, 0.16 * h]), E(P(0, 0, 0.6), [a, b, 0.42 * h])];
      case "pizza": return [H(B([cx - a, cy - b, zb], [cx - 0.75 * a, cy + b, z0 + 0.5 * h], 18), E(P(0.92, 0, 0.18), [0.12 * a, 0.12 * b, 0.33 * h])), C(P(-0.88, -0.95, 0.45), P(-0.88, 0.95, 0.45), Math.min(0.14 * a, 0.12 * h))];
      case "donut": return [E(P(0, 0, 0.32), [a, b, 0.5 * h])];
    }
  };
  // a cartoon or cute robot: a big round head on top of a short body (the body at half height, the wall the same)
  if ((style === "cartoon" || style === "cute") && !["heart", "star", "pizza", "burger", "donut", "can"].includes(shape))
    return [...shapeOps(shape, "plain", { ...e, h: 0.55 * h }, w), E(P(0.05, 0, 0.8), [0.85 * a, 0.95 * b, 0.42 * h])];
  const ops = body();
  if (style === "boxy" || style === "mecha") return [H(...ops)];
  return ops;
}

/** Outside details that are not hollowed: eyes, ears, a spout, a handle, a tail, antennae, rivets. */
function details(shape: Shape, style: Style, e: { cx: number; cy: number; a: number; b: number; h: number; z0: number }): Op[] {
  const { E, C } = prims(0), { cx, cy, a, b, h, z0 } = e;
  const P = (x: number, y: number, z: number): Vec3 => [cx + x * a, cy + y * b, z0 + z * h];
  const out: Op[] = [];
  const eyes = (x: number, z: number, s = 1) => { for (const y of [-0.3, 0.3]) out.push(E(P(x, y, z), [6 * s, 0.14 * b * s, 0.12 * h * s])); };
  switch (shape) {
    case "dog": out.push(E(P(0.62, -0.42, 1.0), [0.12 * a, 0.08 * b, 0.16 * h]), E(P(0.62, 0.42, 1.0), [0.12 * a, 0.08 * b, 0.16 * h]), C(P(-0.95, 0, 0.6), P(-1.15, 0, 0.95), 7)); eyes(1.0, 0.88, 0.5); break;
    case "cat": out.push(E(P(0.62, -0.32, 1.08), [0.08 * a, 0.08 * b, 0.14 * h]), E(P(0.62, 0.32, 1.08), [0.08 * a, 0.08 * b, 0.14 * h]), C(P(-0.95, 0, 0.5), P(-1.1, 0.2, 1.05), 6)); eyes(1.0, 0.88, 0.5); break;
    case "bird": out.push(E(P(0.95, 0, 0.82), [0.18 * a, 0.08 * b, 0.06 * h])); eyes(0.85, 0.92, 0.45); break;
    case "fish": out.push(E(P(-0.98, 0, 0.5), [0.12 * a, 0.06 * b, 0.4 * h]), E(P(0, 0, 1.02), [0.35 * a, 0.05 * b, 0.12 * h])); eyes(0.85, 0.6, 0.5); break;
    case "dragon": for (let k = 0; k < 4; k++) out.push(E(P(-0.7 + k * 0.32, 0, 0.98 - Math.abs(k - 1.5) * 0.04), [0.08 * a, 0.04 * b, 0.12 * h]));
      out.push(C(P(-0.95, 0, 0.45), P(-1.2, 0, 0.3), 8), E(P(1.08, 0, 1.0), [0.12 * a, 0.12 * b, 0.08 * h])); eyes(0.95, 1.12, 0.35); break;
    case "spider": eyes(0.95, 0.45, 0.4); break;
    case "teapot": out.push(C(P(0.75, 0, 0.35), P(1.12, 0, 0.7), Math.min(0.08 * a, 10)), C(P(-0.78, 0, 0.7), P(-1.05, 0, 0.5), 7), C(P(-1.05, 0, 0.5), P(-0.78, 0, 0.2), 7), E(P(0, 0, 1.0), [0.12 * a, 0.12 * b, 0.07 * h])); break;
    case "car": for (const y of [-0.7, 0.7]) out.push(E(P(1.0, y, 0.3), [4, 0.12 * b, 0.07 * h])); break;
    case "shoe": for (let k = 0; k < 3; k++) out.push(E(P(0.15 + k * 0.16, 0, 0.62 - k * 0.08), [0.04 * a, 0.7 * b, 3])); break;
    default: break;
  }
  if (style === "cartoon" || style === "cute") eyes(0.82, 0.88, 1.2);
  if (style === "retro") for (const y of [-0.4, 0.4]) out.push(C(P(0, y, 0.95), P(0, y * 1.3, 1.3), 3), E(P(0, y * 1.3, 1.32), [6, 6, 6]));
  if (style === "steampunk") for (let k = 0; k < 6; k++) out.push(E(P(0.6 - k * 0.24, 0.98, 0.3), [3, 3, 3]), E(P(0.6 - k * 0.24, -0.98, 0.3), [3, 3, 3]));
  return out;
}

export interface FittedShell { ops: Op[]; envelope: { cx: number; cy: number; a: number; b: number; h: number; z0: number }; scale: number; overlapMm3: number; tries: number }
/** World boxes (mm) the shell must clear, windows (camera lenses) it must leave open, and where it sits. */
export interface ShellFit { boxes: { lo: Vec3; hi: Vec3 }[]; windows: { at: Vec3; dir: Vec3; d: number }[]; deck: { x0: number; x1: number; y0: number; y1: number; z0: number }; maxHalfWidth: number; wall?: number }

/** The shell over the bay: as long and wide as it (or the deck), tall enough for its shape and for what stands on it.
 *  A part that would meet the wall (a camera bracket at the deck's edge, a mast) gets a cut-out 3 mm clear round it. */
export function fitShell(req: ShellRequest, fit: ShellFit): FittedShell {
  const wall = fit.wall ?? 2, style = req.style ?? "plain", d = fit.deck;
  const top = Math.max(d.z0, ...fit.boxes.map((q) => q.hi[2]));
  const a = (d.x1 - d.x0) / 2, b = Math.min((d.y1 - d.y0) / 2, fit.maxHalfWidth);
  const e = { cx: (d.x0 + d.x1) / 2, cy: (d.y0 + d.y1) / 2, a, b, h: Math.max(top - d.z0 + 12, 0.6 * Math.min(2 * a, 2 * b)), z0: d.z0 };
  const ops = shellProgram(req, style, e, wall, fit);
  for (const q of fit.boxes) ops.push({ op: "cutbox", min: [q.lo[0] - 3, q.lo[1] - 3, q.lo[2] - 3], max: [q.hi[0] + 3, q.hi[1] + 3, q.hi[2] + 3] });
  const overlap = build(() => {
    const S = evaluate({ name: "shell", ops });
    let v = 0;
    for (const q of fit.boxes) { const Bx = evaluate({ name: "b", ops: [{ op: "box", min: q.lo, max: q.hi }] }); v += Manifold.intersection(S, Bx).volume(); }
    return v;
  });
  return { ops, envelope: e, scale: 1, overlapMm3: +overlap.toFixed(1), tries: 1 };
}

function shellProgram(req: ShellRequest, style: Style, e: FittedShell["envelope"], wall: number, fit: ShellFit): Op[] {
  const outer = shapeOps(req.shape, style, e, 0), inner = shapeOps(req.shape, style, e, wall);
  const ops: Op[] = [{ op: "solid", of: [...outer, { op: "subtract", of: inner }] }, ...details(req.shape, style, e)];
  // the floor: everything below the deck top is cut away, so the cavity opens onto the deck
  ops.push({ op: "cutbox", min: [e.cx - 4 * e.a - 400, e.cy - 4 * e.b - 400, e.z0 - 2000], max: [e.cx + 4 * e.a + 400, e.cy + 4 * e.b + 400, e.z0] });
  // a donut keeps its hole, through the top
  if (req.shape === "donut") ops.push({ op: "hole", a: [e.cx, e.cy, e.z0 + e.h * 0.55], b: [e.cx, e.cy, e.z0 + e.h * 2], d: Math.min(e.a, e.b) * 0.6 });
  // a toaster's two slots, open to the cavity: they are its vents
  if (req.shape === "toaster") for (const y of [-0.35, 0.35]) ops.push({ op: "cutbox", min: [e.cx - 0.6 * e.a, e.cy + y * e.b - 6, e.z0 + e.h - 20], max: [e.cx + 0.6 * e.a, e.cy + y * e.b + 6, e.z0 + e.h + 40] });
  // a window in front of every camera, through the wall along its view
  for (const wdw of fit.windows) ops.push({ op: "hole", a: wdw.at, b: [wdw.at[0] + wdw.dir[0] * 4 * e.a, wdw.at[1] + wdw.dir[1] * 4 * e.a, wdw.at[2] + wdw.dir[2] * 4 * e.a], d: wdw.d });
  // four lugs at the foot of the wall, an M3 down into the deck through each
  return ops;
}

/** Split a shell program into pieces that each fit the bed (250 x 210 x 220 mm, any orientation): halves, then quarters. */
export function splitForBed(ops: Op[], e: FittedShell["envelope"], fits: (o: Op[]) => boolean): { name: string; ops: Op[] }[] {
  if (fits(ops)) return [{ name: "shell", ops }];
  const BIG = 5000;
  const halfX = (front: boolean): Op => ({ op: "cutbox", min: front ? [e.cx - BIG, e.cy - BIG, e.z0 - BIG] : [e.cx, e.cy - BIG, e.z0 - BIG], max: front ? [e.cx, e.cy + BIG, e.z0 + BIG] : [e.cx + BIG, e.cy + BIG, e.z0 + BIG] });
  const halfY = (left: boolean): Op => ({ op: "cutbox", min: left ? [e.cx - BIG, e.cy - BIG, e.z0 - BIG] : [e.cx - BIG, e.cy, e.z0 - BIG], max: left ? [e.cx + BIG, e.cy, e.z0 + BIG] : [e.cx + BIG, e.cy + BIG, e.z0 + BIG] });
  const halves = [{ name: "shell_front", ops: [...ops, halfX(true)] }, { name: "shell_rear", ops: [...ops, halfX(false)] }];
  if (halves.every((p) => fits(p.ops))) return halves;
  const out: { name: string; ops: Op[] }[] = [];
  for (const p of halves) for (const left of [true, false]) out.push({ name: `${p.name}_${left ? "left" : "right"}`, ops: [...p.ops, halfY(left)] });
  return out;
}
