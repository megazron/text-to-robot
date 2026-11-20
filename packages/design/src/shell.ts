// Shape shells: the look of a robot (a heart, a shoe, a teapot, a cartoon head) as a printed cover over a working robot.
// The robot underneath (deck, drive, electronics, sensors) is designed as always; the shell is a hollow solid with a 2 mm
// wall, made from a small library of parametric shapes (ellipsoids, capsules, rounded boxes and their hulls), sized round
// everything on the deck and checked not to touch it, cut where it is bigger than the print bed, with windows for the
// cameras. Its printed mass is part of the robot before the drive is sized and the tipping check is run. Deterministic.
import { part, type Vec3 } from "@ttr/parts";
import { Manifold, build, evaluate, invert, I4, printCheck, programBounds, type Mat4, type Op } from "@ttr/solid";
import { linkSolid } from "./clearance.ts";
import { fk } from "./kin.ts";
import { emojiShape, emojiDiscs } from "./emoji.ts";
import { FAIRINGS, PALETTES, PROPORTION, ROOF, badgeOps, lightOps, type Fairing, type FairingShape } from "./styling.ts";

export const SHAPES = ["heart", "star", "egg", "sphere", "cube", "capsule", "shoe", "car", "dog", "cat", "spider", "fish", "bird", "dragon", "teapot", "lamp", "toaster", "can", "burger", "pizza", "donut", "blob", "emoji", ...FAIRINGS] as const;
export type Shape = typeof SHAPES[number];
export const STYLES = ["plain", "cartoon", "cute", "sleek", "boxy", "retro", "steampunk", "mecha", "scifi", "rugged", "industrial", "minimal"] as const;
export type Style = typeof STYLES[number];
export interface ShellRequest { shape: Shape; style?: Style; colour?: [number, number, number]; /** shape "emoji": the emoji whose outline is inflated (emoji.ts) */ emoji?: string;
  /** an industrial fairing (styling.ts): panel lines, vents, a light bar or eyes, a badge, a two-tone skirt; a LiDAR keeps its view */ fairing?: Fairing }

/** The colour each shape is printed in unless the prompt names one. */
export const SHAPE_COLOUR: Record<Shape, [number, number, number]> = {
  heart: [0.86, 0.12, 0.25], star: [0.98, 0.78, 0.12], egg: [0.95, 0.92, 0.84], sphere: [0.3, 0.6, 0.95], cube: [0.55, 0.6, 0.66], capsule: [0.92, 0.92, 0.94],
  shoe: [0.95, 0.95, 0.97], car: [0.85, 0.15, 0.12], dog: [0.78, 0.58, 0.36], cat: [0.45, 0.45, 0.5], spider: [0.15, 0.15, 0.17], fish: [0.98, 0.55, 0.15],
  bird: [0.2, 0.55, 0.9], dragon: [0.2, 0.6, 0.3], teapot: [0.93, 0.93, 0.9], lamp: [0.95, 0.85, 0.5], toaster: [0.75, 0.77, 0.8], can: [0.85, 0.1, 0.1],
  burger: [0.8, 0.55, 0.25], pizza: [0.95, 0.75, 0.3], donut: [0.92, 0.55, 0.7], blob: [0.6, 0.85, 0.75], emoji: [0.98, 0.8, 0.2],
  pod: [0.92, 0.93, 0.95], wedge: [0.92, 0.93, 0.95], cab: [0.92, 0.93, 0.95], dome: [0.92, 0.93, 0.95], slab: [0.92, 0.93, 0.95], drum: [0.92, 0.93, 0.95],
  truck: [0.92, 0.93, 0.95], buggy: [0.92, 0.93, 0.95], tower: [0.92, 0.93, 0.95], skate: [0.92, 0.93, 0.95],
};
/** a fairing silhouette, not a thing's shape */
export const isFairing = (s: Shape): s is FairingShape => (FAIRINGS as readonly string[]).includes(s);

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
      // fairings (styling.ts): soft, chamfered and sloped bodies that read as designed products
      case "pod": { const r = Math.min(0.42 * Math.min(a, b, 0.575 * h), 34);
        return [H(B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.72 * h], r), B([cx - 0.9 * a, cy - 0.88 * b, zb], [cx + 0.9 * a, cy + 0.88 * b, z0 + h], r))]; }
      case "wedge": return [H(B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.55 * h], Math.min(12, 0.2 * h)), B([cx - a, cy - 0.94 * b, zb], [cx + 0.1 * a, cy + 0.94 * b, z0 + h], Math.min(16, 0.25 * h)))];
      case "cab": return [B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.56 * h], Math.min(12, 0.2 * h)),
        H(B([cx - 0.86 * a, cy - 0.86 * b, z0 + 0.4 * h], [cx + 0.2 * a, cy + 0.86 * b, z0 + h], Math.min(16, 0.22 * h)), B([cx - 0.9 * a, cy - 0.9 * b, z0 + 0.4 * h], [cx + 0.5 * a, cy + 0.9 * b, z0 + 0.52 * h], 6))];
      case "dome": return [H(B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.55 * h], Math.min(14, 0.2 * h)), E(P(0, 0, 0.4), [0.94 * a, 0.92 * b, 0.6 * h]))];
      case "slab": return [H(B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.8 * h], 5), B([cx - 0.88 * a, cy - 0.84 * b, zb], [cx + 0.88 * a, cy + 0.84 * b, z0 + h], 5))];
      case "drum": return [H(E(P(0, 0, 0.0), [a, b, 0.16 * h]), E(P(0, 0, 0.9), [0.84 * a, 0.84 * b, 0.1 * h]))];
      // a cab-forward truck: a low load bed behind a cab that stands at the nose
      case "truck": return [B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.5 * h], Math.min(10, 0.15 * h)),
        H(B([cx + 0.3 * a, cy - 0.92 * b, z0 + 0.3 * h], [cx + 0.96 * a, cy + 0.92 * b, z0 + h], Math.min(14, 0.2 * h)), B([cx + 0.16 * a, cy - 0.92 * b, z0 + 0.3 * h], [cx + a, cy + 0.92 * b, z0 + 0.5 * h], 6))];
      // an open buggy: a low tub with a cowl at the nose (its roll cage is added solid, fairingExtras)
      case "buggy": return [B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.5 * h], Math.min(14, 0.2 * h)),
        H(B([cx + 0.3 * a, cy - 0.8 * b, z0 + 0.3 * h], [cx + a, cy + 0.8 * b, z0 + 0.5 * h], 6), B([cx + 0.48 * a, cy - 0.66 * b, z0 + 0.3 * h], [cx + 0.9 * a, cy + 0.66 * b, z0 + 0.66 * h], Math.min(10, 0.12 * h)))];
      // a tall tower that narrows upward from a wide foot
      case "tower": { const r = Math.min(30, 0.3 * Math.min(a, b));
        return [H(B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.3 * h], Math.min(14, 0.1 * h)), B([cx - 0.84 * a, cy - 0.86 * b, zb], [cx + 0.84 * a, cy + 0.86 * b, z0 + h], r))]; }
      // a low skate: a flat deck with a raised spine down its middle
      case "skate": return [B([cx - a, cy - b, zb], [cx + a, cy + b, z0 + 0.72 * h], Math.min(18, 0.3 * h)),
        H(B([cx - 0.7 * a, cy - 0.3 * b, z0 + 0.5 * h], [cx + 0.55 * a, cy + 0.3 * b, z0 + h], 8), B([cx - 0.8 * a, cy - 0.38 * b, z0 + 0.5 * h], [cx + 0.75 * a, cy + 0.38 * b, z0 + 0.72 * h], 4))];
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
/** The share of these boxes' volume that lies outside a shape's cavity (0: all covered). */
export function outsideShare(req: ShellRequest, e: Env, boxes: { lo: Vec3; hi: Vec3 }[], wall: number): number {
  if (!boxes.length) return 0;
  return build(() => {
    const C = evaluate({ name: "cavity", ops: [{ op: "solid", of: shapeWorld(req.shape, req.style ?? "plain", e, wall, undefined, req.emoji) }] });
    let out = 0, all = 0;
    for (const q of boxes) { const Bx = evaluate({ name: "b", ops: [{ op: "box", min: q.lo, max: q.hi }] }), v = Bx.volume(); all += v; out += v - Manifold.intersection(C, Bx).volume(); }
    return all > 0 ? out / all : 0;
  });
}
/** The volume (mm^3) of these boxes, each grown `clear` mm up (and sideways, or drawn in by `inset` mm from its sides to
 *  look only at its top), that lies outside a shape's cavity: what would stand through its roof (0: all covered). */
export function outsideVolume(req: ShellRequest, e: Env, boxes: { lo: Vec3; hi: Vec3 }[], wall: number, clear = 3, inset = 0): number {
  if (!boxes.length) return 0;
  return build(() => {
    const C = evaluate({ name: "cavity", ops: [{ op: "solid", of: shapeWorld(req.shape, req.style ?? "plain", e, wall, undefined, req.emoji) }] });
    let out = 0;
    for (const q of boxes.filter((b) => b.hi[0] - b.lo[0] > 2 * inset + 1 && b.hi[1] - b.lo[1] > 2 * inset + 1)) { const Bx = evaluate({ name: "b", ops: [{ op: "box", min: [q.lo[0] - (inset ? -inset : clear), q.lo[1] - (inset ? -inset : clear), Math.max(q.lo[2], e.z0 + 0.5)], max: [q.hi[0] + (inset ? -inset : clear), q.hi[1] + (inset ? -inset : clear), q.hi[2] + clear] }] }); out += Bx.volume() - Manifold.intersection(C, Bx).volume(); }
    return out;
  });
}
export interface FittedShell { /** the rounded bumps the shell wraps round parts it does not cover (their outsides) */ bumps?: Op[]; ops: Op[]; envelope: { cx: number; cy: number; a: number; b: number; h: number; z0: number }; scale: number; overlapMm3: number; tries: number }
/** World boxes (mm) the shell must clear, windows (camera lenses) it must leave open, and where it sits. */
export interface ShellFit { boxes: { lo: Vec3; hi: Vec3 }[]; windows: { at: Vec3; dir: Vec3; d: number }[]; deck: { x0: number; x1: number; y0: number; y1: number; z0: number }; maxHalfWidth: number; wall?: number; grow?: boolean; wrap?: boolean; /** the most `grow` may scale it */ maxScale?: number; /** solids the shell's outside must not meet as it grows (it shrinks to 0.8 for them if it must) */ avoid?: Op[]; /** "top": the shape lies on the deck, its outline seen from above */ orient?: "front" | "top";
  /** a wheeled body's wheels (world mm: centre x, the tyre's outer face y, its top z, its radius): wheel-arch flares stand over them */ wheels?: { x: number; y: number; top: number; r: number }[]; /** how far (mm) anything may stand above the envelope (a LiDAR looks out over it); no limit when not given */ headroom?: number;
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
  const note: { bumps?: Op[] } = {};
  const ops = shellProgram(req, style, e, wall, fit, note);
  for (const q of fit.boxes) ops.push({ op: "cutbox", min: [q.lo[0] - 3, q.lo[1] - 3, q.lo[2] - 3], max: [q.hi[0] + 3, q.hi[1] + 3, q.hi[2] + 3] });
  const overlap = build(() => {
    const S = evaluate({ name: "shell", ops });
    let v = 0;
    for (const q of fit.boxes) { const Bx = evaluate({ name: "b", ops: [{ op: "box", min: q.lo, max: q.hi }] }); v += Manifold.intersection(S, Bx).volume(); }
    return v;
  });
  return { ops, bumps: note.bumps, envelope: e, scale, overlapMm3: +overlap.toFixed(1), tries };
}

function shellProgram(req: ShellRequest, style: Style, e: FittedShell["envelope"], wall: number, fit: ShellFit, note?: { bumps?: Op[] }): Op[] {
  // `wrap`: a part the shape does not cover gets a rounded bump of the shell round it (3 mm clear) instead of a hole
  // (not round what lies low on the deck, a plate or a board: the shell's foot is cut clear of those instead)
  const bumps = (w: number): Op[] => fit.wrap ? fit.boxes.filter((q) => q.hi[2] > e.z0 + 10).map((q) => ({ op: "box", min: [q.lo[0] - 3 - wall + w, q.lo[1] - 3 - wall + w, q.lo[2] - 3 - wall + w], max: [q.hi[0] + 3 + wall - w, q.hi[1] + 3 + wall - w, q.hi[2] + 3 + wall - w], r: Math.max(0.5, 8 - w) })) : [];
  if (note) note.bumps = bumps(-0.1);
  const outer = [...shapeWorld(req.shape, style, e, 0, fit.orient, req.emoji), ...bumps(0)], inner = [...shapeWorld(req.shape, style, e, wall, fit.orient, req.emoji), ...bumps(wall)];
  const ops: Op[] = [{ op: "solid", of: [...outer, { op: "subtract", of: inner }] }, ...oriented(e, fit.orient, (es) => details(req.shape, style, es))];
  if (req.fairing && isFairing(req.shape) && fit.orient !== "top" && wall >= 2.4) {
    // solid details standing on the body (a roll cage, flares, a rack...): whatever of them would lie inside the cavity is left out
    const extra = fairingExtras(req.shape, req.fairing, e, fit);
    if (extra.length) ops.push({ op: "solid", of: [...extra, { op: "subtract", of: inner }] });
    ops.push(...fairingDetails(req.shape, req.fairing, e, (w) => [...shapeWorld(req.shape, style, e, w, fit.orient), ...bumps(w)], fit));
  }
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

/** Where a fairing's two-tone seam runs (world z, mm). */
export const skirtZ = (shape: FairingShape, e: Env) => e.z0 + PROPORTION[shape].skirt * e.h;
/** The height of a fairing's accent band, printed in the accent over the skirt's seam (mm; 0: none, the minimal look). */
export const bandH = (f: Fairing, e: Env) => (f.preset === "minimal" ? 0 : Math.round(Math.min(12, Math.max(6, 0.08 * e.h))));
/**
 * A fairing's industrial details, all printable in the shell's own wall (2.4 mm): panel lines 1.2 mm wide and 0.9 mm deep
 * (1.5 mm of wall left under them), a belt line, rows of vent slots through the flanks, and a bumper rail on the skirt's nose.
 * The grooves stay above the two-tone seam, so the skirt and its bumper are never cut through.
 */
function fairingDetails(shape: FairingShape, f: Fairing, e: Env, at: (w: number) => Op[], fit?: ShellFit): Op[] {
  const { cx, cy, a, b, h, z0 } = e, zs = skirtZ(shape, e) + bandH(f, e), out: Op[] = [], BIG = 4 * Math.max(a, b, h) + 50, depth = 0.9;
  // (a groove with no room, on a body lower than its seam, is not cut)
  const groove = (min: Vec3, max: Vec3): Op[] => ([0, 1, 2].some((k) => max[k] - min[k] < 0.5) ? [] : [{ op: "subtract", of: [{ op: "box", min, max }, { op: "subtract", of: at(depth) }] }]);
  // (grooves stop at the roof, and on an open buggy at its tub, so the solid details standing on the body are left whole)
  const zTop = shape === "buggy" ? z0 + 0.5 * h + 0.3 : z0 + h + 0.3, sh = PROPORTION[shape].shoulder;
  // panel lines across the body, front to back pattern by count
  for (const u of [-0.5, 0.42, -0.08].slice(0, f.panels)) out.push(...groove([cx + u * a - 0.6, cy - b - 0.5, zs + 3], [cx + u * a + 0.6, cy + b + 0.5, zTop]));
  // a belt line round the body, high on the flank (clear of the light bar)
  const zl = z0 + PROPORTION[shape].light * h;
  if (f.belt) { const zb = z0 + 0.8 * sh * h; if (Math.abs(zb - zl) > 8 && zb > zs + 6) out.push(...groove([cx - a - 0.5, cy - b - 0.5, zb - 0.6], [cx + a + 0.5, cy + b + 0.5, zb + 0.6])); }
  // vents: four slots 3 mm high through each flank, behind the middle
  if (f.vents) for (let k = 0; k < 4; k++) {
    const z = zs + 6 + k * 6;
    if (z + 3 > z0 + 0.62 * h) break;
    for (const s of [-1, 1]) out.push({ op: "cutbox", min: [cx - 0.72 * a, s > 0 ? cy + 0.5 * b : cy - BIG, z], max: [cx - 0.38 * a, s > 0 ? cy + BIG : cy - 0.5 * b, z + 3] });
  }
  // a grille: up to four fine lines across the nose, under the light line (over it where there is no room under)
  if (f.extras?.includes("grille") && fit?.wheels) {
    const lo = zs + 3, under = Math.floor((zl - 8 - lo) / 4), z0g = under >= 2 ? lo : zl + 8, n = Math.min(4, under >= 2 ? under : Math.floor((z0 + 0.86 * h - z0g) / 4));
    for (let k = 0; k < n; k++) out.push(...groove([cx + 0.5 * a, cy - 0.42 * b, z0g + 4 * k], [cx + a + 1.5, cy + 0.42 * b, z0g + 4 * k + 1.4]));
  }
  // a robot that carries things: a lid line round its roof (the fairing lifts off there to load it)
  const roof = ROOF[shape];
  if (f.cargo && roof && fit?.wheels) {
    const x0 = cx + roof.x0 * a, x1 = cx + roof.x1 * a, y1 = roof.y * b, zr = z0 + 0.7 * h;
    for (const x of [x0, x1]) out.push(...groove([x - 0.6, cy - y1, zr], [x + 0.6, cy + y1, zTop]));
    for (const y of [-y1, y1]) out.push(...groove([x0, cy + y - 0.6, zr], [x1, cy + y + 0.6, zTop]));
  }
  // a bumper rail on the skirt's nose (and its tail when there is room), solid, sunk into the wall (a bull bar stands in its place at the nose)
  if (f.bumper) for (const s of [1, -1]) {
    if (s > 0 && f.extras?.includes("bullbar") && fit?.wheels) continue;
    const zt = Math.min(skirtZ(shape, e) - 2, z0 + 0.16 * h), zb = Math.max(z0 + 2, zt - 12);
    if (zt - zb < 5) continue;
    out.push({ op: "box", min: [s > 0 ? cx + a - 16 : cx - a - 5, cy - 0.7 * b, zb], max: [s > 0 ? cx + a + 5 : cx - a + 16, cy + 0.7 * b, zt], r: 2 });
  }
  return out;
}

/**
 * Solid details that stand on a wheeled fairing, printed with it: a buggy's roll cage, flares over the wheels, a roof rack,
 * an antenna, a beacon's boss, tail fins, a bull bar, a lid's handle. Tubes are 7 to 8 mm, blades 3.2 mm. Nothing stands
 * above the body when a LiDAR looks out over it (`capTop`).
 */
export function fairingExtras(shape: FairingShape, f: Fairing, e: Env, fit: ShellFit): Op[] {
  if (!fit.wheels) return [];
  const { cx, cy, a, b, h, z0 } = e, out: Op[] = [], X = new Set(f.extras ?? []), roof = ROOF[shape], top = z0 + h, room = fit.headroom ?? Infinity;
  const rod = (p: Vec3, q: Vec3, r: number): Op => ({ op: "rod", a: p, b: q, r });
  // (a tube's end and elbow: a short stub of the same tube across it, cheap to union)
  const ball = (p: Vec3, r: number): Op => ({ op: "rod", a: [p[0], p[1], p[2] - 0.7 * r], b: [p[0], p[1], p[2] + 0.7 * r], r });
  if (shape === "buggy") {
    // two hoops over the tub, two bars along their tops, two braces down to the cowl
    const r = 4, zt = z0 + 0.5 * h - 2, zc = top - r, yb = 0.82 * b, yt = 0.7 * b, xs = [cx - 0.6 * a, cx + 0.16 * a];
    for (const x of xs) { for (const s of [-1, 1]) out.push(rod([x, cy + s * yb, zt], [x, cy + s * yt, zc], r), ball([x, cy + s * yt, zc], r)); out.push(rod([x, cy - yt, zc], [x, cy + yt, zc], r)); }
    for (const s of [-1, 1]) out.push(rod([xs[0], cy + s * yt, zc], [xs[1], cy + s * yt, zc], r), rod([xs[1], cy + s * yt, zc], [cx + 0.62 * a, cy + s * 0.6 * b, z0 + 0.6 * h], r));
  }
  if (X.has("fenders")) for (const w of fit.wheels) {
    const s = Math.sign(w.y - cy) || 1, z1 = Math.max(w.top + 3.5, z0 + 1), yIn = cy + s * (b - 3), yOut = cy + s * Math.min(Math.abs(w.y - cy) + 2, 123.5);   // (the body with its flares still prints in halves: 248 mm across)
    if (Math.abs(yOut - cy) < b + 4 || z1 + 8 > z0 + 0.5 * h || Math.abs(w.x - cx) + w.r > a + 12) continue;
    const y0 = Math.min(yIn, yOut), y1 = Math.max(yIn, yOut);
    out.push({ op: "hull", of: [{ op: "box", min: [w.x - w.r - 7, y0, z1], max: [w.x + w.r + 7, y1, z1 + 3.4], r: 1.2 }, { op: "box", min: [w.x - 0.55 * w.r, y0, z1], max: [w.x + 0.55 * w.r, y1, z1 + 7.5], r: 1.2 }] });
  }
  if (X.has("rack") && roof && room >= 12 && (roof.x1 - roof.x0) * a > 50 && roof.y * b > 22) {
    const x0 = cx + roof.x0 * a + 6, x1 = cx + roof.x1 * a - 6, zr = top + 9;
    for (const s of [-1, 1]) { const y = cy + s * roof.y * b; out.push(rod([x0, y, zr], [x1, y, zr], 3), ball([x0, y, zr], 3), ball([x1, y, zr], 3)); for (const x of [x0, (x0 + x1) / 2, x1]) out.push(rod([x, y, top - 3], [x, y, zr], 3)); }
    for (const x of [x0, x1]) out.push(rod([x, cy - roof.y * b, zr], [x, cy + roof.y * b, zr], 3));
  }
  if (X.has("antenna") && roof && room >= 50) { const p: Vec3 = [cx + roof.x0 * a + 8, cy - 0.8 * roof.y * b, top - 3]; const up = Math.min(46, room - 5); out.push(rod(p, [p[0], p[1], top + up], 2.2), ball([p[0], p[1], top + up + 1], 3.6)); }
  if (X.has("beacon") && roof && room >= 17) { const x = cx + ((roof.x0 + roof.x1) / 2) * a; out.push(rod([x, cy, top - 3], [x, cy, top + 3], 13)); }
  if (X.has("fins") && shape !== "buggy") for (const s of [-1, 1]) {
    const y = cy + s * 0.78 * b, zb = z0 + 0.5 * h - 2, zt = top + Math.min(0.14 * h, Math.max(0, room));
    out.push({ op: "hull", of: [{ op: "box", min: [cx - a + 3, y - 1.6, zb], max: [cx - 0.56 * a, y + 1.6, zb + 2] }, { op: "box", min: [cx - a + 3, y - 1.6, zb], max: [cx - a + 14, y + 1.6, zt] }] });
  }
  if (X.has("bullbar")) {
    const x = cx + a + 8, zl = Math.max(z0 + 4, z0 + 0.07 * h), zu = Math.min(z0 + Math.max(0.2 * h, 16), z0 + PROPORTION[shape].light * h - 9), r = 3.5, y1 = 0.62 * b, yu = 0.4 * b;
    for (const z of [zl, zu]) out.push(rod([x, cy - y1, z], [x, cy + y1, z], r), ball([x, cy - y1, z], r), ball([x, cy + y1, z], r));
    for (const s of [-1, 1]) { out.push(rod([x, cy + s * yu, zl], [x, cy + s * yu, zu], r)); for (const z of [zl, zu]) out.push(rod([cx + a - 3, cy + s * yu, z], [x, cy + s * yu, z], r)); }
  }
  if (f.cargo && roof && room >= 10 && !X.has("beacon")) {
    // the lid's handle: a bar on two posts across the roof
    const x = cx + ((roof.x0 + roof.x1) / 2) * a, y1 = Math.min(18, 0.4 * roof.y * b);
    out.push(rod([x, cy - y1, top + 7], [x, cy + y1, top + 7], 2.6)); for (const s of [-1, 1]) out.push(rod([x, cy + s * y1, top - 3], [x, cy + s * y1, top + 7], 2.6), ball([x, cy + s * y1, top + 7], 2.6));
  }
  return out;
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
  emit?: (name: string, ops: Op[], material?: string) => void;
  /** a fairing's skirt in the trim colour (default on when it has the wall for its details) */
  twoTone?: boolean;
  /** a fairing's lamp and badge, parts of their own standing proud of it (default on; off where a folded arm sweeps past) */
  trims?: boolean;
  /** paint panels a designer asks for on a fairing (a helmet's visor, a canopy's screen): thin parts lying on its surface in
   *  a material of the look, each within a box given in the fitted envelope; layer 1 lies on a layer 0 panel */
  panels?: (e: Env) => { name: string; lo: Vec3; hi: Vec3; material: "shell_trim" | "badge" | "trim_light"; layer?: 0 | 1 }[];
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

/** Cut boxes (3 mm clear) round where a shell program still meets the exact solids of the parts rigid with `parent`. */
function exactClearance(A: Asm, parent: string, ops: Op[]): Op[] {
  const rigid = rigidWith(A, parent), f = fk(A.spec), out: Op[] = [];
  const S0 = programBounds(ops);
  const near = [...linkBoxes(A, (n) => rigid.has(n) && !/^shell/.test(n))].filter(([, q]) => [0, 1, 2].every((k) => q.lo[k] < S0.hi[k] + 1 && q.hi[k] > S0.lo[k] - 1));
  if (!near.length) return out;
  build(() => {
    const S = evaluate({ name: "shell", ops });
    for (const [n] of near) {
      const l = A.spec.links.find((x) => x.name === n), T = f.link[n];
      if (!l || !T) continue;
      const solid = linkSolid(l);
      if (!solid) continue;
      const I = Manifold.intersection(S, solid.transform(mat4Of(T)));
      if (I.volume() < 0.01) continue;
      const bb = I.boundingBox();
      out.push({ op: "cutbox", min: [bb.min[0] - 3, bb.min[1] - 3, bb.min[2] - 3], max: [bb.max[0] + 3, bb.max[1] + 3, bb.max[2] + 3] });
    }
  });
  return out;
}

/** Fit, cut, split and bolt on a shell. Returns its pieces and fit; the caller records what it means for its robot.
 *  A fairing (req.fairing) is also split at its two-tone seam (the skirt printed in the trim colour) and gets its light
 *  lenses and its badge as parts of their own, each in a pocket of the wall that leaves at least 1.2 mm behind it. */
export function placeShell(A: Asm, req: ShellRequest, o: PlaceShell): { pieces: { name: string; ops: Op[] }[]; fitted: FittedShell; trims: string[] } {
  const fitted = fitShell(req, o);
  if (o.cuts?.length) fitted.ops.push(...o.cuts);
  const f = req.fairing && isFairing(req.shape) ? req.fairing : undefined, pal = f ? PALETTES[f.palette] : undefined;
  // a fairing is also cut 3 mm clear of the exact solid of anything on its body it would still meet (a part whose box the
  // fit did not take in: a bracket rising out of a deck that lies under the fairing's floor)
  if (f) fitted.ops.push(...exactClearance(A, o.parent, fitted.ops));
  const colour = req.colour ?? pal?.primary ?? (req.shape === "emoji" && req.emoji ? emojiShape(req.emoji)?.colour : undefined) ?? SHAPE_COLOUR[req.shape];
  if (!A.spec.materials.some((m) => m.name === "shell")) A.spec.materials.push({ name: "shell", color: [colour[0], colour[1], colour[2], 1] });
  const base = o.name ?? "shell", trims: string[] = [];
  const T = fk(A.spec).link[o.parent], inv = invert(mat4Of(T));
  const emit = o.emit ?? ((name: string, ops: Op[], material = "shell") => { A.printedLink(name, { name, ops: [{ op: "at", T: inv, of: ops }] }, { role: "shell", material }); A.fixed(`${name}_mount`, o.parent, name, I4()); });
  const detailed = !!f && o.orient !== "top" && (o.wall ?? 2) >= 2.4;
  if (f && pal && detailed) for (const [name, c] of [["shell_trim", pal.trim], ["badge", pal.accent]] as const)
    if (!A.spec.materials.some((m) => m.name === name)) A.spec.materials.push({ name, color: [c[0], c[1], c[2], 1] });
  if (f && pal && detailed && o.trims !== false) {
    for (const [name, c] of [["shell_trim", pal.trim], ["trim_light", [0.86, 0.95, 1] as const], ["badge", pal.accent], ...(f.extras?.includes("rear") ? [["trim_light_red", [0.95, 0.12, 0.1]] as const] : []), ...(f.extras?.includes("beacon") ? [["trim_light_amber", [1, 0.62, 0.05]] as const] : [])] as const)
      if (!A.spec.materials.some((m) => m.name === name)) A.spec.materials.push({ name, color: [c[0], c[1], c[2], 1] });
    const e = fitted.envelope, shape = req.shape as FairingShape, zs = skirtZ(shape, e);
    const free = (lo: Vec3, hi: Vec3) => !o.boxes.some((q) => q.lo[0] - 4 < hi[0] && lo[0] < q.hi[0] + 4 && q.lo[1] - 4 < hi[1] && lo[1] < q.hi[1] + 4 && q.lo[2] - 4 < hi[2] && lo[2] < q.hi[2] + 4)
      && !o.windows.some((w) => Math.abs(w.at[1] - (lo[1] + hi[1]) / 2) < (hi[1] - lo[1]) / 2 + w.d / 2 + 2 && Math.abs(w.at[2] - (lo[2] + hi[2]) / 2) < (hi[2] - lo[2]) / 2 + w.d / 2 + 2 && Math.sign(w.dir[0]) === Math.sign((lo[0] + hi[0]) / 2 - e.cx) && Math.abs(w.dir[0]) > 0.5)
      && !(o.cuts ?? []).some((c) => c.op === "hole" ? Math.abs(c.a[1] - (lo[1] + hi[1]) / 2) < (hi[1] - lo[1]) / 2 + c.d / 2 + 2 && Math.abs(c.a[0] - (lo[0] + hi[0]) / 2) < (hi[0] - lo[0]) / 2 + c.d / 2 + 2
        : c.op === "cutbox" && [0, 1, 2].every((k) => c.min[k] - 3 < hi[k] && lo[k] < c.max[k] + 3));
    // the outside surface along x at (y, z) and its width there: where a lens or a badge sits (measured in one pass)
    const place = build(() => {
      const S = evaluate({ name: "outer", ops: shapeWorld(req.shape, req.style ?? "plain", e, 0, o.orient) });
      const at = (y: number, z: number, dir: 1 | -1) => { const bb = Manifold.intersection(S, evaluate({ name: "ray", ops: [{ op: "box", min: [e.cx - 4 * e.a - 50, y - 0.5, z - 0.5], max: [e.cx + 4 * e.a + 50, y + 0.5, z + 0.5] }] })).boundingBox(); return bb.min[0] > bb.max[0] ? undefined : dir > 0 ? bb.max[0] : bb.min[0]; };
      const width = (x: number, z: number) => { const bb = Manifold.intersection(S, evaluate({ name: "ray", ops: [{ op: "box", min: [x - 0.5, e.cy - 4 * e.b - 50, z - 0.5], max: [x + 0.5, e.cy + 4 * e.b + 50, z + 0.5] }] })).boundingBox(); return bb.min[1] > bb.max[1] ? 0 : bb.max[1] - bb.min[1]; };
      const atY = (x: number, z: number, dir: 1 | -1) => { const bb = Manifold.intersection(S, evaluate({ name: "ray", ops: [{ op: "box", min: [x - 0.5, e.cy - 4 * e.b - 50, z - 0.5], max: [x + 0.5, e.cy + 4 * e.b + 50, z + 0.5] }] })).boundingBox(); return bb.min[1] > bb.max[1] ? undefined : dir > 0 ? bb.max[1] : bb.min[1]; };
      const X = new Set(o.wheels ? f.extras ?? [] : []), rear: { x: number; y: number; z: number }[] = [], strips: { y: number; z: number; s: 1 | -1 }[] = [];
      let light: { x: number; z: number; span: number; kind: "bar" | "eyes" } | undefined, badge: { x: number; y: number; z: number } | undefined;
      // the light: a bar (or two eyes) on the nose, at the silhouette's light line or the nearest free height above the seam
      if (f.light !== "none") for (const dz of [0, 0.1, -0.08, 0.2, 0.3]) {
        const z = e.z0 + (PROPORTION[shape].light + dz) * e.h;
        if (z < zs + bandH(f, e) + 7 || z > e.z0 + 0.92 * e.h) continue;
        const x = at(e.cy, z, 1); if (x === undefined) continue;
        const span = Math.min(0.62 * width(x - 2.5, z), 1.2 * e.b, 150);
        if (span < 24) continue;
        if (free([x - 2, e.cy - span / 2 - 2, z - 6], [x + 3, e.cy + span / 2 + 2, z + 6])) { light = { x, z, span, kind: f.light }; break; }
        // a camera window in the middle: two lamps either side of it instead
        if (f.light === "bar" && free([x - 2, e.cy + span / 4 - 11, z - 10], [x + 3, e.cy + span / 2 + 2, z + 10]) && free([x - 2, e.cy - span / 2 - 2, z - 10], [x + 3, e.cy - span / 4 + 11, z + 10])) { light = { x, z, span, kind: "eyes" }; break; }
      }
      // the badge: on the tail, a little above the seam
      for (const [dy, dz] of [[0, 0.45], [0, 0.6], [0.4, 0.45], [-0.4, 0.45]] as const) {
        const z = e.z0 + dz * e.h, y = e.cy + dy * e.b;
        if (z < zs + bandH(f, e) + 10 || z > e.z0 + 0.9 * e.h) continue;
        const x = at(y, z, -1); if (x === undefined || width(x + 2.5, z) < 44 || !free([x - 3, y - 20, z - 10], [x + 2, y + 20, z + 10])) continue;
        badge = { x, y, z }; break;
      }
      // tail lamps: two round red lenses either side of the badge
      if (X.has("rear")) for (const s of [-1, 1]) {
        const z = Math.max(e.z0 + 0.45 * e.h, zs + bandH(f, e) + 9), y = e.cy + s * 0.62 * e.b;
        if (z > e.z0 + 0.9 * e.h) continue;
        const x = at(y, z, -1); if (x === undefined || !free([x - 3, y - 7, z - 7], [x + 2, y + 7, z + 7])) continue;
        rear.push({ x, y, z });
      }
      // light strips along the flanks, where the flank is flat
      if (X.has("strips")) for (const s of [-1, 1] as const) {
        const z = Math.max(e.z0 + Math.min(0.42, 0.8 * PROPORTION[shape].shoulder) * e.h, zs + bandH(f, e) + 7);
        const ys = [-0.5, 0, 0.5].map((u) => atY(e.cx + u * e.a, z, s));
        if (ys.some((y) => y === undefined) || Math.max(...(ys as number[])) - Math.min(...(ys as number[])) > 0.4) continue;
        const y = s > 0 ? Math.min(...(ys as number[])) : Math.max(...(ys as number[]));
        if (!free([e.cx - 0.5 * e.a, Math.min(y - 2 * s, y + 3 * s), z - 4], [e.cx + 0.5 * e.a, Math.max(y - 2 * s, y + 3 * s), z + 4])) continue;
        strips.push({ y, z, s });
      }
      return { light, badge, rear, strips };
    });
    for (const [i, r] of place.rear.entries()) {
      fitted.ops.push({ op: "hole", a: [r.x + 1.2, r.y, r.z], b: [r.x - 40, r.y, r.z], d: 10.6 });
      emit(`${base}_tail_${i ? "left" : "right"}`, [{ op: "hull", of: [{ op: "rod", a: [r.x + 1.0, r.y, r.z], b: [r.x - 0.8, r.y, r.z], r: 5 }, { op: "rod", a: [r.x + 1.0, r.y, r.z], b: [r.x - 2.0, r.y, r.z], r: 3.6 }] }], "trim_light_red"); trims.push(`${base}_tail_${i ? "left" : "right"}`);
    }
    for (const t of place.strips) {
      const e = fitted.envelope, x0 = e.cx - 0.5 * e.a, x1 = e.cx + 0.5 * e.a, yi = t.y - t.s * 1.0, yo = t.y + t.s * 1.4, name = `${base}_strip_${t.s > 0 ? "left" : "right"}`;
      fitted.ops.push({ op: "cutbox", min: [x0 - 0.3, Math.min(t.y - t.s * 1.2, t.y + t.s * 40), t.z - 2.8], max: [x1 + 0.3, Math.max(t.y - t.s * 1.2, t.y + t.s * 40), t.z + 2.8] });
      emit(name, [{ op: "box", min: [x0, Math.min(yi, yo), t.z - 2.5], max: [x1, Math.max(yi, yo), t.z + 2.5], r: 1 }], "trim_light"); trims.push(name);
    }
    // a beacon: an amber lens on its boss on the roof
    const roof = ROOF[shape];
    if (o.wheels && f.extras?.includes("beacon") && roof && (o.headroom ?? Infinity) >= 17) {
      const x = e.cx + ((roof.x0 + roof.x1) / 2) * e.a, top = e.z0 + e.h;
      emit(`${base}_beacon`, [{ op: "hull", of: [{ op: "rod", a: [x, e.cy, top + 3.15], b: [x, e.cy, top + 13], r: 11 }, { op: "rod", a: [x, e.cy, top + 3.15], b: [x, e.cy, top + 17], r: 6.5 }] }], "trim_light_amber"); trims.push(`${base}_beacon`);
    }
    if (place.light) { const L = lightOps(place.light.kind, place.light.x, e.cy, place.light.z, place.light.span); fitted.ops.push(...L.pocket); emit(`${base}_light`, L.lens, "trim_light"); trims.push(`${base}_light`); }
    if (place.badge) { const B = badgeOps([place.badge.x, place.badge.y, place.badge.z], -1); fitted.ops.push(B.pocket); emit(`${base}_badge`, B.plate, "badge"); trims.push(`${base}_badge`); }
  }
  const fits = (ops: Op[]) => printCheck({ name: "probe", ops }).fits_bed;
  // paint breaks that follow the body: panels 1.2 mm thick lying on the fairing's surface, printed in the accent and bonded
  // on (a centre stripe, twin stripes, a bonnet panel or flank panels), cut wherever the fairing itself is cut
  if (f && pal && detailed && o.trims !== false && !o.wrap && f.paint && f.paint !== "none") {
    const e = fitted.envelope, shape = req.shape as FairingShape, style = req.style ?? "plain", BIG = 5000;
    const zlo = skirtZ(shape, e) + bandH(f, e) + 3, cuts = fitted.ops.filter((x) => x.op === "cutbox" || x.op === "hole");
    const extra = fairingExtras(shape, f, e, o);
    const skin: Op = { op: "solid", of: [...shapeWorld(req.shape, style, e, -1.3, o.orient), { op: "subtract", of: [...shapeWorld(req.shape, style, e, -0.1, o.orient), ...extra] }] };
    const only = (lo: Vec3, hi: Vec3): Op[] => [0, 1, 2].flatMap((k) => { const a: Vec3 = [-BIG, -BIG, -BIG], b: Vec3 = [BIG, BIG, BIG], c: Vec3 = [-BIG, -BIG, -BIG], d: Vec3 = [BIG, BIG, BIG]; b[k] = lo[k]; c[k] = hi[k]; return [{ op: "cutbox", min: a, max: b }, { op: "cutbox", min: c, max: d }] as Op[]; });
    const zl = e.z0 + (PROPORTION[shape].light + 0.14) * e.h, zst = f.light === "none" ? zlo : Math.max(zlo, zl - 0.06 * e.h);   // (stripes start over the light line)
    // (a lid's handle stands on the centre line: its robot wears its paint on the flanks)
    const paint = f.cargo && (f.paint === "centre" || f.paint === "twin") ? "flank" : f.paint;
    const regions: [Vec3, Vec3][] = paint === "centre" ? [[[-BIG, e.cy - 0.2 * e.b, zst], [BIG, e.cy + 0.2 * e.b, BIG]]]
      : paint === "twin" ? [-1, 1].map((s) => [[-BIG, e.cy + Math.min(s * 0.12, s * 0.3) * e.b, zst], [BIG, e.cy + Math.max(s * 0.12, s * 0.3) * e.b, BIG]] as [Vec3, Vec3])
      : paint === "bonnet" ? (zl < e.z0 + 0.85 * e.h ? [[[e.cx + 0.3 * e.a, e.cy - 0.8 * e.b, Math.max(zl, zlo)], [BIG, e.cy + 0.8 * e.b, BIG]]] : [])
      : [-1, 1].map((s) => [[e.cx - 0.55 * e.a, s > 0 ? e.cy + e.b - 6 : -BIG, zlo], [e.cx + 0.55 * e.a, s > 0 ? BIG : e.cy - e.b + 6, Math.max(zlo + 8, e.z0 + 0.6 * PROPORTION[shape].shoulder * e.h)]] as [Vec3, Vec3]);
    let k = 0;
    for (const [lo, hi] of regions) for (const p of splitForBed([skin, ...only(lo, hi), ...cuts], e, fits)) {
      if (printCheck({ name: "probe", ops: p.ops }).volume_cm3 < 0.3) continue;
      const name = `${base}_paint_${++k}`; emit(name, p.ops, "badge"); trims.push(name);
    }
  }
  if (f && pal && o.panels) {
    for (const [name, c] of [["shell_trim", pal.trim], ["trim_light", [0.86, 0.95, 1] as const], ["badge", pal.accent]] as const)
      if (!A.spec.materials.some((m) => m.name === name)) A.spec.materials.push({ name, color: [c[0], c[1], c[2], 1] });
    const e = fitted.envelope, style = req.style ?? "plain", BIG = 5000, cuts = fitted.ops.filter((x) => x.op === "cutbox" || x.op === "hole");
    const only = (lo: Vec3, hi: Vec3): Op[] => [0, 1, 2].flatMap((k) => { const a: Vec3 = [-BIG, -BIG, -BIG], b: Vec3 = [BIG, BIG, BIG], c: Vec3 = [-BIG, -BIG, -BIG], d: Vec3 = [BIG, BIG, BIG]; b[k] = lo[k]; c[k] = hi[k]; return [{ op: "cutbox", min: a, max: b }, { op: "cutbox", min: c, max: d }] as Op[]; });
    for (const q of o.panels(e)) {
      // (0.1 mm off the surface under it, and off any bump the shell wraps round a part there)
      const [t0, t1] = q.layer ? [1.4, 2.4] : [0.1, 1.3];
      const ops: Op[] = [{ op: "solid", of: [...shapeWorld(req.shape, style, e, -t1, o.orient), { op: "subtract", of: [...shapeWorld(req.shape, style, e, -t0, o.orient), ...(fitted.bumps ?? [])] }] }, ...only(q.lo, q.hi), ...cuts];
      if (printCheck({ name: "probe", ops }).volume_cm3 < 0.05) continue;
      emit(`${base}_${q.name}`, ops, q.material); trims.push(`${base}_${q.name}`);
    }
  }
  let pieces: { name: string; ops: Op[]; material?: string }[];
  if (detailed && o.twoTone !== false) {
    // two tones: the upper body in the body colour, the skirt under the seam in the trim colour, each cut to the bed
    const zs = skirtZ(req.shape as FairingShape, fitted.envelope), BIG = 5000;
    // (and, but in the minimal look, an accent band over the seam: a ring of the wall printed in the accent)
    const bh = f ? bandH(f, fitted.envelope) : 0, zu = zs + bh;
    const upper = splitForBed([...fitted.ops, { op: "cutbox", min: [-BIG, -BIG, -BIG], max: [BIG, BIG, zu] }], fitted.envelope, fits).map((p) => ({ ...p, name: p.name.replace(/^shell/, base) }));
    const band = bh ? splitForBed([...fitted.ops, { op: "cutbox", min: [-BIG, -BIG, -BIG], max: [BIG, BIG, zs] }, { op: "cutbox", min: [-BIG, -BIG, zu], max: [BIG, BIG, BIG] }], fitted.envelope, fits).map((p) => ({ ...p, name: p.name.replace(/^shell/, `${base}_band`), material: "badge" })) : [];
    const skirt = splitForBed([...fitted.ops, { op: "cutbox", min: [-BIG, -BIG, zs], max: [BIG, BIG, BIG] }], fitted.envelope, fits).map((p) => ({ ...p, name: p.name.replace(/^shell/, `${base}_skirt`), material: "shell_trim" }));
    pieces = [...upper, ...band, ...skirt];
  } else pieces = splitForBed(fitted.ops, fitted.envelope, fits).map((p) => ({ ...p, name: p.name.replace(/^shell/, base) }));
  // (a piece the cuts left empty, an arm's base under a turret as wide as it, is not printed)
  pieces = pieces.filter((p) => printCheck({ name: "probe", ops: p.ops }).volume_cm3 > 0.05);
  for (const p of pieces) emit(p.name, p.ops, p.material ?? "shell");
  return { pieces: [...pieces, ...trims.map((name) => ({ name, ops: [] }))], fitted, trims };
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
  const kept = [...all].filter(([n, q]) => q.lo[2] >= z0 - 3 && !o.skip?.test(n)), boxes = kept.map(([, q]) => q), names = kept.map(([n]) => n);
  const inBody = req.fairing ? boxes.filter((_, i) => !/^lidar/.test(names[i])) : boxes;
  const deck = { x0: Math.min(...inBody.map((q) => q.lo[0])) - 6, x1: Math.max(...inBody.map((q) => q.hi[0])) + 6, y0: Math.min(...inBody.map((q) => q.lo[1])) - 6, y1: Math.max(...inBody.map((q) => q.hi[1])) + 6, z0 };
  const windows: ShellFit["windows"] = [], f = fk(A.spec);
  for (const bay of (A.design as { enclosures?: { exits: { kind: string; at?: number[]; normal?: number[]; face?: string }[] }[] }).enclosures ?? []) for (const e of bay.exits)
    if ((e.kind === "switch" || e.kind === "usb") && e.at && e.normal && e.face !== "floor" && e.at[2] > z0 - 2) windows.push({ at: e.at as Vec3, dir: e.normal as Vec3, d: e.kind === "switch" ? 40 : 34 });
  for (const sn of A.spec.sensors) if (sn.type === "camera" || sn.type === "depth") { const T = f.link[sn.parent]; if (T && T.p[2] * 1000 > z0 - 2) windows.push({ at: T.p.map((x) => x * 1000) as Vec3, dir: [1, 0, 0], d: sn.type === "depth" ? 60 : 30 }); }
  let placed: ReturnType<typeof placeShell>;
  if (req.fairing && isFairing(req.shape)) {
    // a fairing: sized from its silhouette's proportion of the body's length, at least 10 mm over what it covers, taller
    // until no part shows through its roof, always under a LiDAR's scan plane (the LiDAR and its mast stand in a well)
    const lidar = A.spec.sensors.find((x) => x.type === "lidar"), scanZ = lidar ? f.link[lidar.parent].p[2] * 1000 + lidar.origin.xyz[2] * 1000 : Infinity;
    const cover = boxes.filter((q, i) => !/^lidar/.test(names[i]));
    const top = Math.max(z0, ...cover.map((q) => q.hi[2])), a = (deck.x1 - deck.x0) / 2 + 4, b = (deck.y1 - deck.y0) / 2 + 4;
    const env: Env = { cx: (deck.x0 + deck.x1) / 2, cy: (deck.y0 + deck.y1) / 2, a, b, h: Math.min(Math.max(top - z0 + 12, PROPORTION[req.shape as FairingShape].toLength * 2 * a), lidar ? scanZ - 7 - z0 : Infinity), z0 };
    for (let k = 0; k < 6 && outsideShare(req, env, cover, 2.4) > 0.03; k++) { const n = Math.min(env.h * 1.1, lidar ? scanZ - 7 - z0 : Infinity); if (n <= env.h + 0.5) break; env.h = n; }
    // (no bumper rails on a walking body: the legs swing close under its skirt)
    // the LiDAR's well goes down to the deck: its mast (part of the deck, under the LiDAR) stands in it
    const wells: Op[] = boxes.filter((_, i) => /^lidar$/.test(names[i])).map((q) => ({ op: "cutbox", min: [q.lo[0] - 6, q.lo[1] - 6, z0 - 50], max: [q.hi[0] + 6, q.hi[1] + 6, q.hi[2] + 50] }));
    placed = placeShell(A, { ...req, fairing: { ...req.fairing, bumper: false } }, { boxes, windows, deck, envelope: env, wall: 2.4, maxHalfWidth: env.b, parent: "base_link", cuts: wells });
    if (lidar) A.check("look:lidar_view", env.z0 + env.h <= scanZ - 6, `the fairing's top (${Math.round(env.z0 + env.h)} mm) is ${Math.round(scanZ - env.z0 - env.h)} mm under the LiDAR's scan plane: it sees all round over the body`);
  } else placed = placeShell(A, req, { boxes, windows, deck, grow: true, wrap: true, maxHalfWidth: 1.5 * (deck.y1 - deck.y0) / 2, parent: "base_link" });
  const { pieces, fitted } = placed;
  const mass = pieces.reduce((s, p) => s + (A.spec.links.find((l) => l.name === p.name)?.mass ?? 0), 0);
  const style = req.style && req.style !== "plain" ? ` (${req.style})` : "";
  A.fastener(`M3 x 10 + insert (shell to the hood${pieces.length > 1 ? ", and the pieces to each other along the seams" : ""})`, 4 * pieces.length);
  A.check("shell:clearance", fitted.overlapMm3 < 1, `the ${shellName(req)} shell${style} touches no part on the body (overlap ${fitted.overlapMm3} mm^3; ${Math.round(2 * fitted.envelope.a)} x ${Math.round(2 * fitted.envelope.b)} x ${Math.round(fitted.envelope.h)} mm over the electronics hood); the legs' sweeps are checked with it on`);
  A.check("shell:mass", mass <= o.sizedKg + 1e-6, `the shell weighs ${Math.round(mass * 1000)} g; the legs were sized carrying ${Math.round(o.sizedKg * 1000)} g for it`);
  A.design.performance.shell = `${shellName(req)}${style}, ${pieces.length} printed piece${pieces.length > 1 ? "s" : ""}, ${Math.round(mass * 1000)} g`;
  if (req.fairing) A.design.assumptions.push(`Fairing: a ${shellName(req)} body${req.fairing.preset !== "studio" ? ` in the ${req.fairing.preset} style` : ""} over the electronics hood, ${pieces.length} printed piece${pieces.length > 1 ? "s" : ""} with a 2.4 mm wall (${Math.round(mass * 1000)} g, carried in the legs' sizing): the upper body and a skirt under the seam in the trim colour, panel lines 0.9 mm deep (1.5 mm of wall under them), the light lens and badge in 1.2 mm pockets. Open underneath and screwed to the hood; the legs swing clear of it (their sweeps are checked with it on)${A.spec.sensors.some((x) => x.type === "lidar") ? ", and the LiDAR on its mast looks out over it" : ""}. Print the pieces upright on their open bottoms with supports under the roof.`);
  else A.design.assumptions.push(`Shell: a ${shellName(req)} shape${req.style && req.style !== "plain" ? ` in a ${req.style} style` : ""} over the body's electronics hood, ${pieces.length} printed piece${pieces.length > 1 ? "s" : ""} with a 2 mm wall (${Math.round(mass * 1000)} g, carried in the legs' sizing), open underneath and screwed to the hood; the legs swing clear of it (their sweeps are checked with it on). A LiDAR could not see out of it, so none is fitted. Print it upright on its open bottom.`);
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
