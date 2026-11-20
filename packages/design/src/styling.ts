// Industrial design for every designed robot: a silhouette (a fairing shape chosen per family), a preset (what the style
// words mean: panel lines, vents, a light bar or eyes, a badge, a bumper, two-tone shells, styled hub caps) and a palette
// (primary, accent and dark trim, each named the way its filament is sold). Chosen deterministically from what the prompt
// means, so the same prompt gives the same robot and different prompts different-looking ones. Everything here is printed
// geometry the designers fit, check and weigh like any other part: walls stay at least 1.2 mm under every groove and pocket,
// the pieces are cut to the bed, and their mass is in the drive, leg and flight sizing.
import type { Vec3 } from "@ttr/parts";
import type { Op } from "@ttr/solid";

export type RGB = [number, number, number];
export interface Palette { id: string; primary: RGB; accent: RGB; trim: RGB; names: { primary: string; accent: string; trim: string } }

/** Palettes, each a body colour, an accent and a dark trim, named as the filament is sold. */
export const PALETTES: Record<string, Palette> = Object.fromEntries(([
  ["arctic", [0.92, 0.93, 0.95], [0.96, 0.45, 0.1], [0.17, 0.18, 0.2], "arctic white", "signal orange", "graphite"],
  ["cobalt", [0.13, 0.33, 0.74], [0.66, 0.86, 0.2], [0.13, 0.14, 0.17], "cobalt blue", "lime green", "charcoal"],
  ["signal", [0.97, 0.75, 0.09], [0.12, 0.12, 0.13], [0.36, 0.38, 0.41], "signal yellow", "jet black", "slate grey"],
  ["forest", [0.37, 0.43, 0.31], [0.95, 0.52, 0.12], [0.15, 0.16, 0.14], "olive green", "safety orange", "dark olive"],
  ["coral", [0.95, 0.44, 0.38], [0.96, 0.92, 0.84], [0.13, 0.17, 0.29], "coral", "cream", "navy"],
  ["teal", [0.1, 0.55, 0.57], [0.92, 0.84, 0.63], [0.15, 0.17, 0.19], "teal", "sand", "graphite"],
  ["graphite", [0.25, 0.26, 0.29], [0.1, 0.78, 0.9], [0.08, 0.08, 0.09], "graphite grey", "electric cyan", "black"],
  ["ruby", [0.72, 0.1, 0.17], [0.8, 0.81, 0.84], [0.09, 0.09, 0.1], "ruby red", "silver", "black"],
  ["lilac", [0.7, 0.61, 0.88], [0.55, 0.9, 0.76], [0.21, 0.15, 0.27], "lilac", "mint", "plum"],
  ["sky", [0.47, 0.73, 0.95], [0.97, 0.97, 0.97], [0.22, 0.27, 0.33], "sky blue", "white", "slate"],
  ["tangerine", [0.98, 0.56, 0.13], [0.95, 0.95, 0.95], [0.16, 0.17, 0.19], "tangerine", "white", "graphite"],
  ["sage", [0.62, 0.72, 0.6], [0.8, 0.43, 0.29], [0.18, 0.2, 0.18], "sage green", "terracotta", "dark green"],
  ["ivory", [0.93, 0.89, 0.78], [0.12, 0.5, 0.52], [0.24, 0.2, 0.17], "ivory", "teal", "espresso"],
  ["midnight", [0.12, 0.15, 0.27], [0.98, 0.76, 0.2], [0.06, 0.07, 0.1], "midnight blue", "amber", "black"],
] as [string, RGB, RGB, RGB, string, string, string][]).map(([id, primary, accent, trim, p, a, t]) => [id, { id, primary, accent, trim, names: { primary: p, accent: a, trim: t } }]));

/** The silhouettes a fairing can have (shell.ts draws them). */
export const FAIRINGS = ["pod", "wedge", "cab", "dome", "slab", "drum", "truck", "buggy", "tower", "skate"] as const;
export type FairingShape = typeof FAIRINGS[number];
export type BodyKind = "wheeled" | "legged" | "arm" | "drone" | "humanoid";
export type HubStyle = "spoke" | "turbine" | "dish";
/** What a style word means. "studio" is the look a robot gets when no style is said. */
export const PRESETS = ["studio", "sleek", "scifi", "rugged", "retro", "industrial", "minimal"] as const;
export type Preset = typeof PRESETS[number];
/** Details a preset adds to a wheeled body: wheel-arch flares, a grille, tail lamps, a roof rack, an antenna, a roof
 *  beacon, tail fins, flank light strips, a bull bar. Each is fitted only where it has room (a LiDAR keeps its view). */
export type Extra = "fenders" | "grille" | "rear" | "rack" | "antenna" | "beacon" | "fins" | "strips" | "bullbar";
/** Paint breaks in the accent that follow the body's surface: a centre stripe, twin stripes, a bonnet panel, flank panels. */
export const PAINTS = ["centre", "twin", "bonnet", "flank", "none"] as const;
export type Paint = typeof PAINTS[number];
interface PresetSpec { shapes: Record<BodyKind, FairingShape[]>; palettes: string[]; panels: number; belt: boolean; vents: boolean; light: "bar" | "eyes" | "none"; bumper: boolean; hubs: HubStyle[]; extras: Extra[]; paints: Paint[] }
const ALL: Record<BodyKind, FairingShape[]> = { wheeled: ["pod", "wedge", "cab", "dome", "slab", "truck", "buggy", "tower", "skate"], legged: ["pod", "wedge", "dome"], arm: ["drum", "pod", "dome", "slab"], drone: ["pod", "dome", "wedge"], humanoid: ["pod", "dome", "slab"] };
export const PRESET: Record<Preset, PresetSpec> = {
  studio: { shapes: ALL, palettes: ["arctic", "cobalt", "signal", "coral", "teal", "graphite", "ruby", "sky", "tangerine", "sage", "lilac", "midnight"], panels: 2, belt: false, vents: true, light: "bar", bumper: true, hubs: ["spoke", "turbine", "dish"], extras: ["fenders", "grille", "rear"], paints: ["centre", "twin", "bonnet", "flank", "none"] },
  sleek: { shapes: { wheeled: ["wedge", "skate", "dome"], legged: ["wedge", "dome"], arm: ["dome", "pod"], drone: ["wedge", "dome"], humanoid: ["dome", "pod"] }, palettes: ["arctic", "graphite", "sky", "midnight"], panels: 1, belt: false, vents: false, light: "bar", bumper: false, hubs: ["dish", "turbine"], extras: ["rear"], paints: ["centre", "twin"] },
  scifi: { shapes: { wheeled: ["wedge", "skate", "tower"], legged: ["wedge", "dome"], arm: ["dome", "drum"], drone: ["wedge", "dome"], humanoid: ["dome", "slab"] }, palettes: ["arctic", "graphite", "midnight", "cobalt"], panels: 3, belt: true, vents: false, light: "bar", bumper: false, hubs: ["turbine"], extras: ["strips", "fins", "rear"], paints: ["flank", "bonnet"] },
  rugged: { shapes: { wheeled: ["buggy", "truck", "slab"], legged: ["pod", "wedge"], arm: ["slab", "drum"], drone: ["pod"], humanoid: ["slab"] }, palettes: ["forest", "signal", "graphite", "tangerine"], panels: 3, belt: true, vents: true, light: "bar", bumper: true, hubs: ["spoke"], extras: ["fenders", "bullbar", "rack", "grille", "antenna", "rear"], paints: ["none", "bonnet"] },
  retro: { shapes: { wheeled: ["dome", "cab", "pod"], legged: ["pod", "dome"], arm: ["drum", "dome"], drone: ["dome"], humanoid: ["pod", "dome"] }, palettes: ["ivory", "teal", "coral", "sage"], panels: 1, belt: true, vents: true, light: "eyes", bumper: true, hubs: ["dish"], extras: ["fins", "grille", "rear", "fenders", "antenna"], paints: ["twin", "flank"] },
  industrial: { shapes: { wheeled: ["truck", "slab", "tower"], legged: ["pod"], arm: ["slab", "drum"], drone: ["pod"], humanoid: ["slab"] }, palettes: ["signal", "tangerine", "arctic", "graphite"], panels: 2, belt: true, vents: true, light: "bar", bumper: true, hubs: ["spoke", "turbine"], extras: ["beacon", "rack", "grille", "rear", "fenders"], paints: ["flank", "none"] },
  minimal: { shapes: { wheeled: ["pod", "skate"], legged: ["pod"], arm: ["drum", "pod"], drone: ["pod"], humanoid: ["pod"] }, palettes: ["arctic", "graphite", "sage", "ivory"], panels: 0, belt: false, vents: false, light: "none", bumper: false, hubs: ["dish"], extras: [], paints: ["none"] },
};

/** The fairing a robot gets: carried in its request (ShellRequest.fairing), so a redesign gives the same one. */
export interface Fairing { preset: Preset; palette: string; hub: HubStyle; panels: number; belt: boolean; vents: boolean; light: "bar" | "eyes" | "none"; bumper: boolean; extras?: Extra[]; paint?: Paint; /** a robot that carries things: a lid line and a handle on its roof */ cargo?: boolean }

/** FNV-1a, the hash every choice here is made with (stable across engines). */
export function fnv(s: string): number { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; } return h; }
/** A second, independent pick from the same key (so silhouette, palette and hubs do not move together). */
const pick = <T,>(xs: readonly T[], key: string, salt: string): T => xs[fnv(`${salt}|${key}`) % xs.length];

/**
 * The silhouette and the details for a robot of this kind: `key` is what the prompt means (its structure, its job, its style,
 * its colour), so prompts said another way give the same robot. A palette named by the caller (a colour or a job's palette
 * is applied over it) is kept.
 */
export function chooseFairing(kind: BodyKind, key: string, preset: Preset = "studio", palette?: string, cargo = false): { shape: FairingShape; fairing: Fairing } {
  const p = PRESET[preset];
  // a robot that carries things gets a body with somewhere to carry them, where its preset has one
  const carriers = p.shapes[kind].filter((x) => x === "truck" || x === "tower" || x === "cab");
  const shape = pick(cargo && carriers.length ? carriers : p.shapes[kind], key, "shape"), pal = palette && PALETTES[palette] ? palette : pick(p.palettes, key, "palette");
  // (a dome has no flat roof for a rack; a buggy's cage is its roof)
  const extras = p.extras.filter((x) => !(x === "rack" && (shape === "dome" || shape === "buggy" || shape === "skate")) && !(x === "fins" && shape === "buggy"));
  const paint = shape === "buggy" || extras.includes("rack") ? pick(p.paints.filter((x) => x === "flank" || x === "none").concat("none"), key, "paint") : pick(p.paints, key, "paint");
  return { shape, fairing: { preset, palette: pal, hub: pick(p.hubs, key, "hub"), panels: p.panels, belt: p.belt, vents: p.vents, light: p.light, bumper: p.bumper, extras, paint, ...(cargo ? { cargo: true } : {}) } };
}

/**
 * Proportions that make a body read as designed rather than as a box on wheels: the fairing's height as a multiple of the
 * wheel's diameter (wheeled) or of the body's length (legged, arm, drone), per silhouette, and how far it may overhang the
 * deck. The designers size the fairing from these, never smaller than what it must cover, never above what must see out.
 */
export const PROPORTION: Record<FairingShape, { toWheel: number; toLength: number; overhang: number; skirt: number; light: number; shoulder: number }> = {
  // toWheel: body height over the deck / wheel diameter; toLength: height / length; skirt: two-tone split (share of the
  // height); light: where the light bar sits (share of the height)
  pod: { toWheel: 0.95, toLength: 0.42, overhang: 6, skirt: 0.24, light: 0.58, shoulder: 1 },
  wedge: { toWheel: 0.85, toLength: 0.36, overhang: 10, skirt: 0.2, light: 0.3, shoulder: 0.55 },
  cab: { toWheel: 1.1, toLength: 0.48, overhang: 4, skirt: 0.26, light: 0.38, shoulder: 0.56 },
  dome: { toWheel: 1.0, toLength: 0.46, overhang: 4, skirt: 0.22, light: 0.3, shoulder: 1 },
  slab: { toWheel: 0.75, toLength: 0.34, overhang: 8, skirt: 0.3, light: 0.6, shoulder: 1 },
  drum: { toWheel: 0.9, toLength: 0.6, overhang: 0, skirt: 0.25, light: 0.5, shoulder: 1 },
  // a cab-forward truck (a load bed behind the cab), an open buggy (a low tub under a roll cage), a tall tower (a delivery
  // body) and a low skate (a flat deck with a spine)
  truck: { toWheel: 1.25, toLength: 0.5, overhang: 6, skirt: 0.2, light: 0.3, shoulder: 0.5 },
  buggy: { toWheel: 1.2, toLength: 0.5, overhang: 8, skirt: 0.2, light: 0.3, shoulder: 0.5 },
  tower: { toWheel: 1.7, toLength: 0.7, overhang: 2, skirt: 0.14, light: 0.62, shoulder: 1 },
  skate: { toWheel: 0.6, toLength: 0.3, overhang: 10, skirt: 0.32, light: 0.56, shoulder: 0.72 },
};
/** The body-height-to-wheel-diameter range a wheeled robot's fairing is held to (a check says where it landed). */
export const WHEELED_RATIO: [number, number] = [0.45, 2.2];

/** A wheel's printed hub cap in the wheel's own frame (hub face z = 0, outer face at zFar, axis +z), world-free. */
export function hubCapOps(style: HubStyle, r: number, zFar: number): Op[] {
  const z0 = zFar + 0.3, t = 3.2, ops: Op[] = [];
  const rot = (deg: number, of: Op[]): Op => { const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180); return { op: "at", T: [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], of }; };
  if (style === "dish") {
    // a shallow dish with a raised centre boss
    ops.push({ op: "hull", of: [{ op: "rod", a: [0, 0, z0], b: [0, 0, z0 + 1.4], r }, { op: "rod", a: [0, 0, z0], b: [0, 0, z0 + t], r: 0.62 * r }] });
    ops.push({ op: "rod", a: [0, 0, z0 + t - 0.5], b: [0, 0, z0 + t + 1.6], r: 0.22 * r });
  } else {
    ops.push({ op: "rod", a: [0, 0, z0], b: [0, 0, z0 + t], r }, { op: "rod", a: [0, 0, z0 + t - 0.5], b: [0, 0, z0 + t + 1.4], r: 0.26 * r });
    const n = style === "spoke" ? 5 : 9;
    for (let k = 0; k < n; k++) {
      // spokes: five 1.2 mm deep slots between the rim and the boss; turbine: nine angled vanes cut 1.2 mm deep
      const w = style === "spoke" ? 0.2 * r : 0.09 * r;
      ops.push(rot((360 / n) * k + (style === "turbine" ? 0 : 36), [style === "turbine"
        ? { op: "at", T: [Math.cos(0.5), Math.sin(0.5), 0, 0, -Math.sin(0.5), Math.cos(0.5), 0, 0, 0, 0, 1, 0, 0.6 * r, 0, 0, 1], of: [{ op: "cutbox", min: [-0.32 * r, -w / 2, z0 + t - 1.2], max: [0.32 * r, w / 2, z0 + t + 3] }] }
        : { op: "cutbox", min: [0.36 * r, -w / 2, z0 + t - 1.2], max: [0.84 * r, w / 2, z0 + t + 3] }]));
    }
  }
  return ops;
}

/** The brand's own mark (the prompt chevron ">" and a cursor bar) raised 0.8 mm on a badge plate lying in the y-z plane,
 *  facing -x (a rear badge) or +x, at `c` (world mm). */
export function badgeOps(c: Vec3, facing: 1 | -1, w = 34, h = 14): { plate: Op[]; pocket: Op } {
  const x0 = c[0] - facing * 1.0, x1 = c[0] + facing * 1.4, xs = [Math.min(x0, x1), Math.max(x0, x1)];
  const plate: Op[] = [{ op: "box", min: [xs[0], c[1] - w / 2, c[2] - h / 2], max: [xs[1], c[1] + w / 2, c[2] + h / 2], r: 0.6 }];
  const xr = facing > 0 ? [xs[1] - 0.1, xs[1] + 0.8] : [xs[0] - 0.8, xs[0] + 0.1];
  // the chevron's two strokes and the cursor, each 2 mm wide
  const stroke = (y0: number, z0: number, y1: number, z1: number): Op => ({ op: "hull", of: [{ op: "box", min: [xr[0], c[1] + y0 - 1, c[2] + z0 - 1], max: [xr[1], c[1] + y0 + 1, c[2] + z0 + 1] }, { op: "box", min: [xr[0], c[1] + y1 - 1, c[2] + z1 - 1], max: [xr[1], c[1] + y1 + 1, c[2] + z1 + 1] }] });
  const s = facing > 0 ? 1 : -1;   // read the right way round from outside
  plate.push(stroke(s * -9, 4, s * -3, 0), stroke(s * -3, 0, s * -9, -4), { op: "box", min: [xr[0], c[1] + s * 1 - 1, c[2] - 4.5], max: [xr[1], c[1] + s * 1 + 1, c[2] - 2.5] });
  plate.push({ op: "box", min: [xr[0], c[1] + Math.min(s * 3, s * 11), c[2] - 4.5], max: [xr[1], c[1] + Math.max(s * 3, s * 11), c[2] - 2.5] });
  const pocket: Op = { op: "cutbox", min: [facing > 0 ? c[0] - 1.2 : c[0] - 40, c[1] - w / 2 - 0.3, c[2] - h / 2 - 0.3], max: [facing > 0 ? c[0] + 40 : c[0] + 1.2, c[1] + w / 2 + 0.3, c[2] + h / 2 + 0.3] };
  return { plate, pocket };
}

/** A light bar (one long diffuser) or two round eye lenses on a front face at x (world mm), centred at (y, z). */
export function lightOps(kind: "bar" | "eyes", x: number, y: number, z: number, span: number): { lens: Op[]; pocket: Op[] } {
  if (kind === "bar") {
    const w = span, h = 7;
    return { lens: [{ op: "box", min: [x - 1.0, y - w / 2, z - h / 2], max: [x + 1.6, y + w / 2, z + h / 2], r: 1.2 }],
      pocket: [{ op: "cutbox", min: [x - 1.2, y - w / 2 - 0.3, z - h / 2 - 0.3], max: [x + 40, y + w / 2 + 0.3, z + h / 2 + 0.3] }] };
  }
  const d = Math.min(18, Math.max(9, span / 4)), lens: Op[] = [], pocket: Op[] = [];
  for (const s of [-1, 1]) {
    const yc = y + s * span / 4;
    lens.push({ op: "hull", of: [{ op: "rod", a: [x - 1.0, yc, z], b: [x + 0.8, yc, z], r: d / 2 }, { op: "rod", a: [x - 1.0, yc, z], b: [x + 2.2, yc, z], r: d / 2 - 1.5 }] });
    pocket.push({ op: "hole", a: [x - 1.2, yc, z], b: [x + 40, yc, z], d: d + 0.6 });
  }
  return { lens, pocket };
}

/** The names a robot's colours are bought by, for the BOM. */
export const paletteNames = (id: string) => PALETTES[id]?.names;

/** Where a silhouette's roof is flat enough to carry a rack, a beacon or a lid (x in half lengths, y in half widths). */
export const ROOF: Record<FairingShape, { x0: number; x1: number; y: number } | undefined> = {
  pod: { x0: -0.6, x1: 0.6, y: 0.62 }, wedge: { x0: -0.82, x1: -0.08, y: 0.66 }, cab: { x0: -0.66, x1: 0.02, y: 0.6 }, dome: { x0: -0.16, x1: 0.16, y: 0.2 },
  slab: { x0: -0.72, x1: 0.72, y: 0.62 }, drum: undefined, truck: { x0: 0.42, x1: 0.84, y: 0.62 }, buggy: undefined, tower: { x0: -0.5, x1: 0.5, y: 0.56 }, skate: { x0: -0.55, x1: 0.55, y: 0.24 },
};

/** How far (mm) a fairing's roof details stand above it: a LiDAR's mast is raised by as much, so it sees over them. */
export function crownOf(f: Fairing, shape: FairingShape): number {
  const X = new Set(f.extras ?? []), roof = ROOF[shape];
  if (!roof) return 0;
  return Math.max(X.has("beacon") ? 18 : 0, X.has("rack") ? 13 : 0, f.cargo ? 11 : 0);
}
