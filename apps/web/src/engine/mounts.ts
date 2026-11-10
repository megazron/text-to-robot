// Mounting points of catalog parts and of the engine's parametric printed parts. A mount is a frame on a part (position
// in metres, the axis pointing out of the part, a reference direction across it) and a kind; two mounts of matching kinds
// mate face to face (see snap.ts). Parts are described from the catalog's own data: an actuator's output frame, the
// holes on its case, a board's mounting holes (the electrical record's drawing where the catalog has none), a wheel's
// bore. Every part also has a base for plain surface placement: its lowest face, so that set down on a surface it
// touches it and nothing of it is inside (a servo's tabs are screwed down in a servo bracket, not through the surface).
import { part, CATALOG, ELECTRICAL, type Vec3 } from "@ttr/parts";
import type { RobotSpecification } from "@ttr/robot-schema";
import type { PrintedParams } from "./edit.ts";
import { worldFrames, poseMat, mul, apply, rotate, kindOf } from "./edit.ts";
import type { Mount, WorldMount } from "./snap.ts";
export type { Mount, MountKind, WorldMount } from "./snap.ts";

const mm = (v: number[]): Vec3 => [v[0] / 1000, v[1] / 1000, v[2] / 1000];
const perp = (a: Vec3): Vec3 => (Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]).map((x, i, r) => x - a[i] * (r[0] * a[0] + r[1] * a[1] + r[2] * a[2])) as Vec3;
const unitV = (v: Vec3): Vec3 => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

/** Board mounting holes (component frame, mm, z of the hole face): the catalog's, else the electrical record's drawing. */
function boardHoles(key: string): { pos: Vec3 }[] {
  const c = part(key), down = c.holes.filter((h) => h.axis[2] < -0.5);
  if (down.length >= 2) return down.map((h) => ({ pos: h.pos as Vec3 }));
  const d = ELECTRICAL[key]?.dimensions?.holes?.v ?? [];
  return d.length >= 2 ? d.map((h) => ({ pos: [h.x, h.y, 0] as Vec3 })) : [];
}

const cache = new Map<string, Mount[]>();
/** Mounting points of a catalog part (component frame). */
export function partMounts(key: string): Mount[] {
  const hit = cache.get(key); if (hit) return hit;
  const c = part(key), b = c.bbox_mm ?? { min: [-10, -10, 0], max: [10, 10, 10] }, out: Mount[] = [];
  const centre: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2]];
  if (c.output_frame) {
    const [p, a] = c.output_frame, axis = unitV(a as Vec3);
    out.push({ id: "output", kind: "output", pos: mm(p), axis, ref: perp(axis), label: c.category === "actuator" && /hobby|feetech|dxl/.test(key) ? "servo horn" : "shaft" });
    // the case: the servo's own frame, facing the way its output does, sits in a seat made for it
    out.push({ id: "case", kind: "case", pos: [0, 0, 0], axis, ref: perp(axis), label: "servo case", fits: key });
    // a gearmotor whose shaft runs through its body (the TT motor's two ends) lies on its side, the shaft level
    const body = c.specs.body_mm as { min: number[]; max: number[] } | undefined;
    if (body && Math.abs(axis[2]) > 0.9 && b.min[2] < body.min[2] - 0.5 && b.max[2] > body.max[2] + 0.5)
      out.push({ id: "base", kind: "base", pos: mm([(body.min[0] + body.max[0]) / 2, body.min[1], (body.min[2] + body.max[2]) / 2]), axis: [0, -1, 0], ref: [1, 0, 0], label: "side of the gearbox" });
  }
  if (c.category === "wheel" || c.category === "horn" || key.startsWith("coupler")) {
    const bore = c.holes.find((h) => Math.hypot(h.pos[0], h.pos[1]) < 0.5) ?? (c.category === "wheel" && !c.specs.ball_d_mm ? { pos: [0, 0, b.min[2]], axis: [0, 0, -1] } : undefined);
    if (bore) out.push({ id: "hub", kind: "hub", pos: mm([bore.pos[0], bore.pos[1], c.category === "horn" ? b.min[2] : bore.pos[2]]), axis: c.category === "horn" ? [0, 0, -1] : unitV(bore.axis as Vec3).map((x, i) => (i === 2 ? -Math.abs(x) : x)) as Vec3, ref: [1, 0, 0], label: c.category === "wheel" ? "wheel hub" : c.category === "horn" ? "horn spline" : "coupler bore" });
    if (c.category === "horn") out.push({ id: "output", kind: "output", pos: [0, 0, b.max[2] / 1000], axis: [0, 0, 1], ref: [1, 0, 0], label: "horn face" });
  }
  if (["compute", "motor_driver", "sensor"].includes(c.category) || /^(buck|psu)_/.test(key)) {
    const holes = boardHoles(key);
    if (holes.length >= 2) {
      const cx = holes.reduce((s, h) => s + h.pos[0], 0) / holes.length, cy = holes.reduce((s, h) => s + h.pos[1], 0) / holes.length, z = Math.min(...holes.map((h) => h.pos[2]));
      out.push({ id: "board", kind: "board", pos: mm([cx, cy, z]), axis: [0, 0, -1], ref: [1, 0, 0], holes: holes.map((h) => [(h.pos[0] - cx) / 1000, (h.pos[1] - cy) / 1000]), fits: key, label: `${holes.length} mounting holes` });
    }
  }
  // long stock (a tube, a rod, a rail standing a metre tall in its own frame) lies down
  const dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], dz = b.max[2] - b.min[2];
  if (!out.length && dz > 4 * Math.max(dx, dy)) out.push({ id: "base", kind: "base", pos: mm([(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2]), axis: [0, -1, 0], ref: [0, 0, 1], label: "side" });
  if (!out.some((m) => m.kind === "base")) out.push({ id: "base", kind: "base", pos: mm(centre), axis: [0, 0, -1], ref: [1, 0, 0], label: "underside" });
  cache.set(key, out);
  return out;
}

// ------------------------------------------------------------------------------------------- printed parts
/** Program of a parametric printed part (CAD-kernel ops, mm). The part's frame is the middle of its underside. */
export function printedProgram(p: PrintedParams, name: string): { name: string; ops: unknown[]; edge?: number } {
  const [x, y, z] = p.size_mm.map((v) => Math.max(2, Math.min(400, v))), w = Math.max(1.2, Math.min(p.wall_mm ?? 3, Math.min(x, y) / 2 - 0.5));
  const f = Math.max(0, Math.min(p.fillet_mm ?? 0.8, w / 2 - 0.05)), d = Math.max(0, p.hole_mm ?? 3.2), n = Math.max(0, Math.round(p.holes ?? 4));
  const ops: unknown[] = [];
  const cornerHoles = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => {
    if (!d || !n) return;
    const pts: [number, number][] = n === 2 ? [[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]] : [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    for (const [hx, hy] of pts.slice(0, Math.max(n, 2))) ops.push({ op: "hole", a: [hx, hy, z0 - 1], b: [hx, hy, z1 + 1], d });
  };
  const inset = Math.max(d, 4);
  switch (p.shape) {
    case "plate": ops.push({ op: "box", min: [-x / 2, -y / 2, 0], max: [x / 2, y / 2, z], r: Math.min(6, x / 4, y / 4) }); cornerHoles(-x / 2 + inset, -y / 2 + inset, x / 2 - inset, y / 2 - inset, 0, z); break;
    case "disc": ops.push({ op: "rod", a: [0, 0, 0], b: [0, 0, z], r: x / 2 }); if (p.key) ops.push({ op: "horn", key: p.key, t: z, extra: 0 }); break;
    case "beam": {
      ops.push({ op: "box", min: [-Math.min(y / 2, 12), -y / 2, 0], max: [x, y / 2, z], r: Math.min(y / 2 - 0.1, 8) });
      if (p.key) ops.push({ op: "horn", key: p.key, t: z, extra: 0 });
      if (d) ops.push({ op: "hole", a: [x - inset, 0, -1], b: [x - inset, 0, z + 1], d });
      break;
    }
    case "bracket": {
      ops.push({ op: "box", min: [-x / 2, -y / 2, 0], max: [x / 2, y / 2, w], r: 0 }, { op: "box", min: [-x / 2, -y / 2, 0], max: [-x / 2 + w, y / 2, z], r: 0 });
      cornerHoles(-x / 2 + w + inset, -y / 2 + inset, x / 2 - inset, y / 2 - inset, 0, w);
      if (d) for (const hy of [-y / 4, y / 4]) ops.push({ op: "hole", a: [-x / 2 - 1, hy, z - inset], b: [-x / 2 + w + 1, hy, z - inset], d });
      break;
    }
    case "housing": {
      ops.push({ op: "box", min: [-x / 2, -y / 2, 0], max: [x / 2, y / 2, z], r: Math.min(5, x / 4, y / 4) }, { op: "cutbox", min: [-x / 2 + w, -y / 2 + w, w], max: [x / 2 - w, y / 2 - w, z + 1] });
      cornerHoles(-x / 2 + w + inset, -y / 2 + w + inset, x / 2 - w - inset, y / 2 - w - inset, 0, w);
      break;
    }
    case "standoff_plate": {
      ops.push({ op: "box", min: [-x / 2, -y / 2, 0], max: [x / 2, y / 2, w], r: Math.min(6, x / 4, y / 4) });
      const top = standoffTop(p);
      for (const [hx, hy] of standoffPattern(p)) { ops.push({ op: "rod", a: [hx * 1000, hy * 1000, 0], b: [hx * 1000, hy * 1000, top], r: 3 }); ops.push({ op: "hole", a: [hx * 1000, hy * 1000, w], b: [hx * 1000, hy * 1000, top + 1], d: 2.5 }); }
      break;
    }
    case "servo_bracket": {
      if (!p.key) throw new Error("a servo bracket needs the servo it holds (key)");
      const bb = part(p.key).bbox_mm!;
      ops.push({ op: "cradle", key: p.key, T: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2] + w, 1], wall: w });
      break;
    }
    default: throw new Error(`unknown printed shape '${(p as { shape: string }).shape}'`);
  }
  return { name, ops, ...(f > 0 ? { edge: +f.toFixed(2) } : {}) };
}
/**
 * Height (mm) of a standoff plate's posts above its underside: the height asked for, or more when the board it is made
 * for hangs lower than that under its mounting holes (a Nano's header pins, a sensor's body): 1.5 mm clear of the floor.
 */
export function standoffTop(p: PrintedParams): number {
  const z = Math.max(2, Math.min(400, p.size_mm[2])), w = Math.max(1.2, p.wall_mm ?? 3);
  if (!p.key || !CATALOG[p.key]) return z;
  const m = partMounts(p.key).find((x) => x.kind === "board"), b = part(p.key).bbox_mm;
  return m && b ? Math.max(z, +(w + (m.pos[2] * 1000 - b.min[2]) + 1.5).toFixed(2)) : z;
}
/** Board hole pattern a standoff plate carries (metres, centred). */
function standoffPattern(p: PrintedParams): [number, number][] {
  if (!p.key) { const [x, y] = p.size_mm; return [[-x / 2 + 6, -y / 2 + 6], [x / 2 - 6, -y / 2 + 6], [-x / 2 + 6, y / 2 - 6], [x / 2 - 6, y / 2 - 6]].map(([a, b]) => [a / 1000, b / 1000]); }
  return partMounts(p.key).find((m) => m.kind === "board")?.holes ?? [];
}
/** Mounting points of a printed part made from parameters (part frame). */
export function printedMounts(p: PrintedParams): Mount[] {
  const [x, , z] = p.size_mm.map((v) => v / 1000), w = (p.wall_mm ?? 3) / 1000, out: Mount[] = [];
  out.push({ id: "base", kind: "base", pos: [0, 0, 0], axis: [0, 0, -1], ref: [1, 0, 0], label: "underside" });
  switch (p.shape) {
    case "plate": out.push({ id: "top", kind: "face", pos: [0, 0, z], axis: [0, 0, 1], ref: [1, 0, 0], label: "top face" }); break;
    case "housing": out.push({ id: "floor", kind: "face", pos: [0, 0, w], axis: [0, 0, 1], ref: [1, 0, 0], label: "inside floor" }); break;
    case "bracket": out.push({ id: "top", kind: "face", pos: [w / 2, 0, w], axis: [0, 0, 1], ref: [1, 0, 0], label: "foot" }, { id: "wall", kind: "face", pos: [-x / 2 + w, 0, z / 2], axis: [1, 0, 0], ref: [0, 0, 1], label: "upright" }); break;
    case "disc": case "beam":
      out[0] = { id: "hub", kind: "hub", pos: [0, 0, 0], axis: [0, 0, -1], ref: [1, 0, 0], label: p.key ? "horn coupling" : "centre" };
      out.push({ id: "top", kind: "face", pos: p.shape === "beam" ? [x / 2, 0, z] : [0, 0, z], axis: [0, 0, 1], ref: [1, 0, 0], label: "top face" });
      if (p.shape === "beam") out.push({ id: "end", kind: "face", pos: [x - Math.max((p.hole_mm ?? 3.2) / 1000, 0.004), 0, z], axis: [0, 0, 1], ref: [1, 0, 0], label: "far end" });
      break;
    case "standoff_plate": out.push({ id: "standoffs", kind: "standoffs", pos: [0, 0, standoffTop(p) / 1000], axis: [0, 0, 1], ref: [1, 0, 0], holes: standoffPattern(p), ...(p.key ? { fits: p.key } : {}), label: p.key ? `standoffs for ${part(p.key).name}` : "standoffs" }); break;
    case "servo_bracket": { const bb = part(p.key!).bbox_mm!; out.push({ id: "seat", kind: "seat", pos: [-(bb.min[0] + bb.max[0]) / 2000, -(bb.min[1] + bb.max[1]) / 2000, (-bb.min[2]) / 1000 + w], axis: [0, 0, -1], ref: [1, 0, 0], fits: p.key, label: `seat for ${part(p.key!).name}` }); break; }
  }
  return out;
}

/** Every mount of a robot in world coordinates at the zero pose. */
export function worldMounts(spec: RobotSpecification): WorldMount[] {
  const W = worldFrames(spec), printed = ((spec.metadata as { studio?: { printed?: Record<string, PrintedParams> } }).studio?.printed) ?? {}, out: WorldMount[] = [];
  for (const l of spec.links) {
    const k = kindOf(l), F = W.get(l.name); if (!F) continue;
    const local = k.kind === "part" && k.key && CATALOG[k.key] ? partMounts(k.key) : printed[l.name] ? printedMounts(printed[l.name]) : [];
    const T = mul(F, poseMat(l.origin));
    for (const m of local) out.push({ ...m, link: l.name, pos: apply(T, m.pos), axis: rotate(T, m.axis), ref: rotate(T, m.ref), ...(m.holes ? { holes: m.holes } : {}) });
  }
  return out;
}
