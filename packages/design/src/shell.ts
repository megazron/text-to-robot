// Shape shells: the look of a robot (a heart, a shoe, a teapot, a cartoon head) as a printed cover over a working robot.
// The robot underneath (deck, drive, electronics, sensors) is designed as always; the shell is a hollow solid with a 2 mm
// wall, made from a small library of parametric shapes (ellipsoids, capsules, rounded boxes and their hulls), sized round
// everything on the deck and checked not to touch it, cut where it is bigger than the print bed, with windows for the
// cameras. Its printed mass is part of the robot before the drive is sized and the tipping check is run. Deterministic.
import { part, type Vec3 } from "@ttr/parts";
import { Manifold, build, evaluate, invert, I4, printCheck, type Mat4, type Op } from "@ttr/solid";
import { fk } from "./kin.ts";
import { emojiShape, emojiDiscs } from "./emoji.ts";

export const SHAPES = ["heart", "star", "egg", "sphere", "cube", "capsule", "shoe", "car", "dog", "cat", "spider", "fish", "bird", "dragon", "teapot", "lamp", "toaster", "can", "burger", "pizza", "donut", "blob", "emoji"] as const;
export type Shape = typeof SHAPES[number];
export const STYLES = ["plain", "cartoon", "cute", "sleek", "boxy", "retro", "steampunk", "mecha"] as const;
export type Style = typeof STYLES[number];
export interface ShellRequest { shape: Shape; style?: Style; colour?: [number, number, number]; /** shape "emoji": the emoji whose outline is inflated (emoji.ts) */ emoji?: string }

/** The colour each shape is printed in unless the prompt names one. */
export const SHAPE_COLOUR: Record<Shape, [number, number, number]> = {
  heart: [0.86, 0.12, 0.25], star: [0.98, 0.78, 0.12], egg: [0.95, 0.92, 0.84], sphere: [0.3, 0.6, 0.95], cube: [0.55, 0.6, 0.66], capsule: [0.92, 0.92, 0.94],
  shoe: [0.95, 0.95, 0.97], car: [0.85, 0.15, 0.12], dog: [0.78, 0.58, 0.36], cat: [0.45, 0.45, 0.5], spider: [0.15, 0.15, 0.17], fish: [0.98, 0.55, 0.15],
  bird: [0.2, 0.55, 0.9], dragon: [0.2, 0.6, 0.3], teapot: [0.93, 0.93, 0.9], lamp: [0.95, 0.85, 0.5], toaster: [0.75, 0.77, 0.8], can: [0.85, 0.1, 0.1],
  burger: [0.8, 0.55, 0.25], pizza: [0.95, 0.75, 0.3], donut: [0.92, 0.55, 0.7], blob: [0.6, 0.85, 0.75], emoji: [0.98, 0.8, 0.2],
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
export function shapeOps(shape: Shape, style: Style, e: { cx: number; cy: number; a: number; b: number; h: number; z0: number }, w: number, emoji?: string): Op[] {
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
      case "emoji": {
        // the outline in the front view (u to +y, v down), 90 % of the envelope's width and as tall as it is wide, its foot a
        // little under the deck; each disc a cushion: as thick as the envelope at the middle, thinner towards the edge
        const em = emoji ? emojiShape(emoji) : undefined;
        if (!em) return [E(P(0, 0, 0.45), [a, b, 0.62 * h])];
        const { discs, links } = emojiDiscs(em), S = 1.8 * b, rMax = Math.max(...discs.map((d) => d.r));
        // a cushion about half as deep as it is wide (no deeper than the envelope), a little thinner towards its edges
        const deep = Math.min(a, 0.28 * S), at = (d: { u: number; v: number; r: number }) => E([cx, cy + (d.u - 0.5) * S, z0 - 0.06 * S + (1 - d.v) * S], [Math.max(deep * (0.6 + 0.4 * Math.sqrt(d.r / rMax)), Math.min(deep, d.r * S)), d.r * S, d.r * S]);
        const joined = new Set(links.flat());
        return [...links.map(([i, j]) => H(at(discs[i]), at(discs[j]))), ...discs.filter((_, i) => !joined.has(i)).map(at)];
      }
    }
  };
  // a cartoon or cute robot: a big round head on top of a short body (the body at half height, the wall the same)
  if ((style === "cartoon" || style === "cute") && !["heart", "star", "pizza", "burger", "donut", "can", "emoji"].includes(shape))
    return [...shapeOps(shape, "plain", { ...e, h: 0.55 * h }, w), E(P(0.05, 0, 0.8), [0.85 * a, 0.95 * b, 0.42 * h])];
  const ops = body();
  if (style === "boxy" || style === "mecha") return [H(...ops)];
  return ops;
}

/** Ops made in the shape's own frame, in world mm: standing (its front view facing +x, the default) or, with orient "top",
 *  lying on the deck (its front view seen from above, its top towards +x): a drone's canopy is seen from above. */
function oriented(e: Env, orient: "front" | "top" | undefined, make: (es: Env) => Op[]): Op[] {
  if (orient !== "top") return make(e);
  const es = { cx: 0, cy: 0, a: e.h, b: e.b, h: (2 * e.a) / 1.15, z0: 0 };
  // shape z (its height, -0.15 h to h) along world +x over the deck's length, shape x (its depth) down world z
  const T: Mat4 = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, e.cx - e.a + 0.15 * es.h, e.cy, e.z0, 1];
  return [{ op: "at", T, of: make(es) }];
}
export const shapeWorld = (shape: Shape, style: Style, e: Env, w: number, orient?: "front" | "top", emoji?: string): Op[] => oriented(e, orient, (es) => shapeOps(shape, style, es, w, emoji));

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

export type Env = { cx: number; cy: number; a: number; b: number; h: number; z0: number };
export interface FittedShell { ops: Op[]; envelope: { cx: number; cy: number; a: number; b: number; h: number; z0: number }; scale: number; overlapMm3: number; tries: number }
/** World boxes (mm) the shell must clear, windows (camera lenses) it must leave open, and where it sits. */
export interface ShellFit { boxes: { lo: Vec3; hi: Vec3 }[]; windows: { at: Vec3; dir: Vec3; d: number }[]; deck: { x0: number; x1: number; y0: number; y1: number; z0: number }; maxHalfWidth: number; wall?: number; grow?: boolean; wrap?: boolean; /** the most `grow` may scale it */ maxScale?: number; /** solids the shell's outside must not meet as it grows (it shrinks to 0.8 for them if it must) */ avoid?: Op[]; /** "top": the shape lies on the deck, its outline seen from above */ orient?: "front" | "top";
  /** the shape's own envelope, when the designer places it (a crest standing on a pack) */ envelope?: Env; /** where its open bottom is cut, when not at the envelope's foot */ floorZ?: number }

/** The shell over the bay: as long and wide as it (or the deck), tall enough for its shape and for what stands on it.
 *  A part that would meet the wall (a camera bracket at the deck's edge, a mast) gets a cut-out 3 mm clear round it.
 *  With `grow`, the shape is first made bigger (up to 1.5 times, its width no more than `maxHalfWidth`) until what it covers
 *  is (all but 8 %) inside its cavity, so a narrow shape (a heart's point, a star's arms) covers its parts instead of being cut open. */
export function fitShell(req: ShellRequest, fit: ShellFit): FittedShell {
  const wall = fit.wall ?? 2, style = req.style ?? "plain", d = fit.deck;
  const top = Math.max(d.z0, ...fit.boxes.map((q) => q.hi[2]));
  const a = (d.x1 - d.x0) / 2, b = Math.min((d.y1 - d.y0) / 2, fit.maxHalfWidth);
  let e = fit.envelope ?? { cx: (d.x0 + d.x1) / 2, cy: (d.y0 + d.y1) / 2, a, b, h: Math.max(top - d.z0 + 12, 0.6 * Math.min(2 * a, 2 * b)), z0: d.z0 }, scale = 1, tries = 1;
  if (fit.grow && fit.boxes.length) {
    const scaled = (s: number) => ({ ...e, a: e.a * s, b: Math.min(e.b * s, Math.max(e.b, fit.maxHalfWidth)), h: e.h * s });
    // the share of the covered parts' volume that lies outside the cavity, for an envelope scaled by s
    const outside = (s: number) => build(() => {
      const C = evaluate({ name: "cavity", ops: [{ op: "solid", of: shapeWorld(req.shape, style, scaled(s), wall, fit.orient, req.emoji) }] });
      let out = 0, all = 0;
      for (const q of fit.boxes) { const Bx = evaluate({ name: "b", ops: [{ op: "box", min: q.lo, max: q.hi }] }), v = Bx.volume(); all += v; out += v - Manifold.intersection(C, Bx).volume(); }
      return all > 0 ? out / all : 0;
    });
    // a scale whose outside meets what it must avoid (a prop's disc) is not taken
    const free = (s: number) => !fit.avoid?.length || build(() => Manifold.intersection(evaluate({ name: "outer", ops: [{ op: "solid", of: shapeWorld(req.shape, style, scaled(s), 0, fit.orient, req.emoji) }] }), evaluate({ name: "avoid", ops: fit.avoid! })).volume() < 1);
    const cands = [1, 1.15, 1.3, 1.5].filter((x) => x <= (fit.maxScale ?? 1.5));
    let best: { s: number; f: number } | undefined;
    for (const s of cands) {
      tries++;
      if (!free(s)) { if (s === 1) for (const t of [0.9, 0.8]) if (free(t)) { best = { s: t, f: outside(t) }; break; } break; }
      const f = outside(s);
      if (!best || f < best.f - 1e-9) best = { s, f };
      if (best.f < 0.08) break;
    }
    scale = best?.s ?? 1;
    e = scaled(scale);
  }
  const ops = shellProgram(req, style, e, wall, fit);
  for (const q of fit.boxes) ops.push({ op: "cutbox", min: [q.lo[0] - 3, q.lo[1] - 3, q.lo[2] - 3], max: [q.hi[0] + 3, q.hi[1] + 3, q.hi[2] + 3] });
  const overlap = build(() => {
    const S = evaluate({ name: "shell", ops });
    let v = 0;
    for (const q of fit.boxes) { const Bx = evaluate({ name: "b", ops: [{ op: "box", min: q.lo, max: q.hi }] }); v += Manifold.intersection(S, Bx).volume(); }
    return v;
  });
  return { ops, envelope: e, scale, overlapMm3: +overlap.toFixed(1), tries };
}

function shellProgram(req: ShellRequest, style: Style, e: FittedShell["envelope"], wall: number, fit: ShellFit): Op[] {
  // `wrap`: a part the shape does not cover gets a rounded bump of the shell round it (3 mm clear) instead of a hole
  // (not round what lies low on the deck, a plate or a board: the shell's foot is cut clear of those instead)
  const bumps = (w: number): Op[] => fit.wrap ? fit.boxes.filter((q) => q.hi[2] > e.z0 + 10).map((q) => ({ op: "box", min: [q.lo[0] - 3 - wall + w, q.lo[1] - 3 - wall + w, q.lo[2] - 3 - wall + w], max: [q.hi[0] + 3 + wall - w, q.hi[1] + 3 + wall - w, q.hi[2] + 3 + wall - w], r: Math.max(0.5, 8 - w) })) : [];
  const outer = [...shapeWorld(req.shape, style, e, 0, fit.orient, req.emoji), ...bumps(0)], inner = [...shapeWorld(req.shape, style, e, wall, fit.orient, req.emoji), ...bumps(wall)];
  const ops: Op[] = [{ op: "solid", of: [...outer, { op: "subtract", of: inner }] }, ...oriented(e, fit.orient, (es) => details(req.shape, style, es))];
  // the floor: everything below the deck top is cut away, so the cavity opens onto the deck
  const floor = fit.floorZ ?? e.z0;
  ops.push({ op: "cutbox", min: [e.cx - 4 * e.a - 400, e.cy - 4 * e.b - 400, floor - 2000], max: [e.cx + 4 * e.a + 400, e.cy + 4 * e.b + 400, floor] });
  // a donut keeps its hole, through the top
  if (req.shape === "donut" && fit.orient !== "top") ops.push({ op: "hole", a: [e.cx, e.cy, e.z0 + e.h * 0.55], b: [e.cx, e.cy, e.z0 + e.h * 2], d: Math.min(e.a, e.b) * 0.6 });
  // a toaster's two slots, open to the cavity: they are its vents
  if (req.shape === "toaster" && fit.orient !== "top") for (const y of [-0.35, 0.35]) ops.push({ op: "cutbox", min: [e.cx - 0.6 * e.a, e.cy + y * e.b - 6, e.z0 + e.h - 20], max: [e.cx + 0.6 * e.a, e.cy + y * e.b + 6, e.z0 + e.h + 40] });
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

// ---------------------------------------------------------------- a shell on any robot
// The same printed shell on a robot of any kind: over a wheeled deck, a legged robot's body, a drone's canopy, an arm's
// base, a humanoid's head and chest. It is fitted round what stands on one rigid body at the home pose, cut 3 mm clear of
// anything it would meet and of the volumes the robot's moving parts sweep (`keepouts`), and bolted to that body. The
// designer adds it before its own clearance sweeps and mass-dependent checks, so they see it.
export interface ShellBox { lo: Vec3; hi: Vec3 }
export interface PlaceShell extends ShellFit {
  /** the link it is bolted to; its ops are written in world mm at the home pose and moved into that link's frame */
  parent: string;
  /** name of the piece (or the first part of the names when it is cut to fit the bed); always starts with "shell" */
  name?: string;
  /** extra cuts, world mm: what the moving parts sweep, a turret's turning circle, a prop's disc */
  cuts?: Op[];
  /** how a piece is added (the wheeled designer adds its own way, so its parts keep their names and frames) */
  emit?: (name: string, ops: Op[]) => void;
}
type Asm = import("./assembly.ts").Assembly;
const mat4Of = (T: { R: number[][]; p: number[] }): Mat4 => [T.R[0][0], T.R[1][0], T.R[2][0], 0, T.R[0][1], T.R[1][1], T.R[2][1], 0, T.R[0][2], T.R[1][2], T.R[2][2], 0, T.p[0] * 1000, T.p[1] * 1000, T.p[2] * 1000, 1];
/** World boxes (mm, home pose) of the links that have a mesh, by name. */
export function linkBoxes(A: Asm, keep: (name: string) => boolean = () => true): Map<string, ShellBox> {
  const f = fk(A.spec), out = new Map<string, ShellBox>();
  for (const l of A.spec.links) {
    if (l.geometry.type !== "mesh" || !f.link[l.name] || !keep(l.name)) continue;
    // a bought part by its datasheet box (mm), a printed part by its mesh box (m)
    const g = l.geometry as unknown as { part?: string; params?: { key?: unknown }; bbox?: { min: number[]; max: number[] } }, T = f.link[l.name];
    const pb = g.part === "component" ? part(String(g.params?.key)).bbox_mm : undefined;
    const bb = pb ?? (g.bbox ? { min: g.bbox.min.map((v) => v * 1000), max: g.bbox.max.map((v) => v * 1000) } : undefined);
    if (!bb) continue;
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]])
      for (let i = 0; i < 3; i++) { const v = T.R[i][0] * x + T.R[i][1] * y + T.R[i][2] * z + T.p[i] * 1000; lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); }
    out.set(l.name, { lo, hi });
  }
  return out;
}
/** The links bolted (by fixed joints) to `link`, itself included. */
export function rigidWith(A: Asm, link: string): Set<string> {
  const parentOf = new Map(A.spec.joints.map((j) => [j.child, j] as const));
  const bodyOf = (n: string): string => { const j = parentOf.get(n); return j && j.type === "fixed" ? bodyOf(j.parent) : n; };
  const root = bodyOf(link);
  return new Set(A.spec.links.map((l) => l.name).filter((n) => bodyOf(n) === root));
}

/** Fit, cut, split and bolt on a shell. Returns its pieces and fit; the caller records what it means for its robot. */
export function placeShell(A: Asm, req: ShellRequest, o: PlaceShell): { pieces: { name: string; ops: Op[] }[]; fitted: FittedShell } {
  const fitted = fitShell(req, o);
  if (o.cuts?.length) fitted.ops.push(...o.cuts);
  const colour = req.colour ?? (req.shape === "emoji" && req.emoji ? emojiShape(req.emoji)?.colour : undefined) ?? SHAPE_COLOUR[req.shape];
  if (!A.spec.materials.some((m) => m.name === "shell")) A.spec.materials.push({ name: "shell", color: [colour[0], colour[1], colour[2], 1] });
  const base = o.name ?? "shell";
  const pieces = splitForBed(fitted.ops, fitted.envelope, (ops) => printCheck({ name: "probe", ops }).fits_bed).map((p) => ({ ...p, name: p.name.replace(/^shell/, base) }));
  const T = fk(A.spec).link[o.parent], inv = invert(mat4Of(T));
  const emit = o.emit ?? ((name: string, ops: Op[]) => { A.printedLink(name, { name, ops: [{ op: "at", T: inv, of: ops }] }, { role: "shell", material: "shell" }); A.fixed(`${name}_mount`, o.parent, name, I4()); });
  for (const p of pieces) emit(p.name, p.ops);
  return { pieces, fitted };
}

/**
 * A shell over what stands on a deck, the way a wheeled robot gets it: it sits on the electronics bay's lid (links named by
 * `lids`), as long and wide as the lid (else the deck), covers what stands above it, with a window for every camera and for
 * the bay's switch and USB port. `skip` names parts standing on the deck that are not covered (wheels, motors).
 */
export function deckShellFit(A: Asm, deck: { x0: number; x1: number; y0: number; y1: number; z0: number }, lids: RegExp, skip: RegExp = /wheel|motor|caster|bracket/, span = false): ShellFit {
  const f = fk(A.spec), boxes: ShellBox[] = [], windows: ShellFit["windows"] = [];
  const all = linkBoxes(A, (n) => n !== "base_link");
  for (const [name, q] of all) if (q.lo[2] >= deck.z0 - 3 && q.hi[2] > deck.z0 + 1 && !skip.test(name)) boxes.push(q);
  const lidBoxes = [...all].filter(([n]) => lids.test(n)).map(([, q]) => q);
  const bayTop = Math.max(deck.z0, ...lidBoxes.map((q) => q.hi[2]));
  const above = boxes.filter((q) => q.hi[2] > bayTop + 0.5).map((q) => ({ lo: [q.lo[0], q.lo[1], Math.max(q.lo[2], bayTop)] as Vec3, hi: q.hi }));
  // (with `span`, the footprint also takes in what overhangs the lid, 6 mm round it)
  const foot = span ? [...lidBoxes, ...above.map((q) => ({ lo: [q.lo[0] - 6, q.lo[1] - 6, q.lo[2]] as Vec3, hi: [q.hi[0] + 6, q.hi[1] + 6, q.hi[2]] as Vec3 }))] : lidBoxes;
  const d = foot.length ? { x0: Math.min(...foot.map((r) => r.lo[0])), x1: Math.max(...foot.map((r) => r.hi[0])), y0: Math.min(...foot.map((r) => r.lo[1])), y1: Math.max(...foot.map((r) => r.hi[1])), z0: bayTop } : { ...deck, z0: bayTop };
  for (const bay of (A.design as { enclosures?: { exits: { kind: string; at?: number[]; normal?: number[]; face?: string }[] }[] }).enclosures ?? []) for (const e of bay.exits)
    if ((e.kind === "switch" || e.kind === "usb") && e.at && e.normal && e.face !== "floor") windows.push({ at: e.at as Vec3, dir: e.normal as Vec3, d: e.kind === "switch" ? 40 : 34 });
  for (const sn of A.spec.sensors) if (sn.type === "camera" || sn.type === "depth") { const T = f.link[sn.parent]; if (T && T.p[2] * 1000 > d.z0) windows.push({ at: T.p.map((x) => x * 1000) as Vec3, dir: [1, 0, 0], d: sn.type === "depth" ? 60 : 26 }); }
  return { boxes: above, windows: windows.filter((w) => w.at[2] > d.z0 - 2), deck: d, maxHalfWidth: (d.y1 - d.y0) / 2 };
}

/** An estimate of a shell's printed mass from its envelope (an upper bound: the ellipsoid round the envelope, 1.3x), kg. */
export function shellMassEstimate(e: { a: number; b: number; h: number }, wall = 2): number {
  const p = 1.6075, A = 4 * Math.PI * (((e.a * e.b) ** p + (e.a * e.h) ** p + (e.b * e.h) ** p) / 3) ** (1 / p);
  return +(1.3 * A * wall * 1.0e-6).toFixed(3);
}

/**
 * A shell on a legged robot's body: over its electronics hood (`lids`) and all that stands on the body from the hood's foot
 * up, grown until it covers them, a rounded bump of the shell round anything its shape leaves out. `sizedKg` is what the
 * legs were sized to carry for it (shellMassEstimate before the design); the shell must weigh no more.
 */
export function bodyShell(A: Asm, req: ShellRequest, o: { lids: RegExp; sizedKg: number; skip?: RegExp }): number {
  // it covers the hood and everything on the body from the hood's foot up (the camera looks out through a window)
  const rigid = rigidWith(A, "base_link"), all = linkBoxes(A, (n) => rigid.has(n) && n !== "base_link");
  const z0 = Math.min(...[...all].filter(([n]) => o.lids.test(n)).map(([, q]) => q.lo[2]));
  const boxes = [...all].filter(([n, q]) => q.lo[2] >= z0 - 3 && !o.skip?.test(n)).map(([, q]) => q);
  const deck = { x0: Math.min(...boxes.map((q) => q.lo[0])) - 6, x1: Math.max(...boxes.map((q) => q.hi[0])) + 6, y0: Math.min(...boxes.map((q) => q.lo[1])) - 6, y1: Math.max(...boxes.map((q) => q.hi[1])) + 6, z0 };
  const windows: ShellFit["windows"] = [], f = fk(A.spec);
  for (const bay of (A.design as { enclosures?: { exits: { kind: string; at?: number[]; normal?: number[]; face?: string }[] }[] }).enclosures ?? []) for (const e of bay.exits)
    if ((e.kind === "switch" || e.kind === "usb") && e.at && e.normal && e.face !== "floor" && e.at[2] > z0 - 2) windows.push({ at: e.at as Vec3, dir: e.normal as Vec3, d: e.kind === "switch" ? 40 : 34 });
  for (const sn of A.spec.sensors) if (sn.type === "camera" || sn.type === "depth") { const T = f.link[sn.parent]; if (T && T.p[2] * 1000 > z0 - 2) windows.push({ at: T.p.map((x) => x * 1000) as Vec3, dir: [1, 0, 0], d: sn.type === "depth" ? 60 : 30 }); }
  const { pieces, fitted } = placeShell(A, req, { boxes, windows, deck, grow: true, wrap: true, maxHalfWidth: 1.5 * (deck.y1 - deck.y0) / 2, parent: "base_link" });
  const mass = pieces.reduce((s, p) => s + (A.spec.links.find((l) => l.name === p.name)?.mass ?? 0), 0);
  const style = req.style && req.style !== "plain" ? ` (${req.style})` : "";
  A.fastener(`M3 x 10 + insert (shell to the hood${pieces.length > 1 ? ", and the pieces to each other along the seams" : ""})`, 4 * pieces.length);
  A.check("shell:clearance", fitted.overlapMm3 < 1, `the ${shellName(req)} shell${style} touches no part on the body (overlap ${fitted.overlapMm3} mm^3; ${Math.round(2 * fitted.envelope.a)} x ${Math.round(2 * fitted.envelope.b)} x ${Math.round(fitted.envelope.h)} mm over the electronics hood); the legs' sweeps are checked with it on`);
  A.check("shell:mass", mass <= o.sizedKg + 1e-6, `the shell weighs ${Math.round(mass * 1000)} g; the legs were sized carrying ${Math.round(o.sizedKg * 1000)} g for it`);
  A.design.performance.shell = `${shellName(req)}${style}, ${pieces.length} printed piece${pieces.length > 1 ? "s" : ""}, ${Math.round(mass * 1000)} g`;
  A.design.assumptions.push(`Shell: a ${shellName(req)} shape${req.style && req.style !== "plain" ? ` in a ${req.style} style` : ""} over the body's electronics hood, ${pieces.length} printed piece${pieces.length > 1 ? "s" : ""} with a 2 mm wall (${Math.round(mass * 1000)} g, carried in the legs' sizing), open underneath and screwed to the hood; the legs swing clear of it (their sweeps are checked with it on). A LiDAR could not see out of it, so none is fitted. Print it upright on its open bottom.`);
  return mass;
}
/** The envelope a body shell will have at most (the deck it stands over, grown 1.5x), for shellMassEstimate. */
export function bodyEnvelope(A: Asm, lids: RegExp): { a: number; b: number; h: number } {
  const q = [...linkBoxes(A, (n) => lids.test(n)).values()];
  if (!q.length) return { a: 0, b: 0, h: 0 };
  const a = (Math.max(...q.map((x) => x.hi[0])) - Math.min(...q.map((x) => x.lo[0]))) / 2 + 12, b = (Math.max(...q.map((x) => x.hi[1])) - Math.min(...q.map((x) => x.lo[1]))) / 2 + 12;
  return { a: 1.5 * a, b: 1.5 * b, h: 1.5 * Math.max(60, 1.2 * Math.min(a, b)) };
}
/** what a shell's shape is called in the result: its shape ("heart"), or an emoji's name ("unicorn emoji") */
export const shellName = (req: ShellRequest) => (req.shape === "emoji" && req.emoji ? `${emojiShape(req.emoji)?.name ?? "emoji"} emoji` : req.shape);
