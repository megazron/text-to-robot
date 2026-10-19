// Printed parts as small, serializable CSG programs. A robot spec stores the program; anyone
// (exporters, browser, MuJoCo) rebuilds the identical watertight solid from it.
import { componentMesh, type Vec3 } from "@ttr/parts";
import {
  build, box, cyl, rod, roundedBox, unionAll, frame, Manifold, toMesh, cradle, cradleCuts, hornPlate, hornCuts,
  actuatorKeepout, type Mat4, type Manifold as M,
} from "./geom.ts";
export type { Mat4 } from "./geom.ts";

export type Op =
  | { op: "horn"; key: string; t?: number; extra?: number }                    // plate bolted to an actuator output at the origin (+z)
  | { op: "cradle"; key: string; T: Mat4; wall?: number }                      // holds an actuator by its case screws
  | { op: "beam"; a: Vec3; b: Vec3; w: number; h: number; up?: Vec3 }         // rectangular strut a->b, h along `up`
  | { op: "rod"; a: Vec3; b: Vec3; r: number }
  | { op: "box"; min: Vec3; max: Vec3; r?: number }
  | { op: "hull"; of: Op[] }
  | { op: "keepout"; key: string; T: Mat4 }                                   // subtract an actuator's body + swept output
  | { op: "hole"; a: Vec3; b: Vec3; d: number }                               // subtract a cylinder
  | { op: "cutbox"; min: Vec3; max: Vec3 }
  | { op: "lighten"; a: Vec3; b: Vec3; r: number; n: number; axis?: Vec3 }    // row of lightening holes along a->b, drilled along `axis`
  | { op: "at"; T: Mat4; of: Op[] };                                           // sub-program placed by T

export interface Program { name: string; ops: Op[]; }

function beam(a: Vec3, b: Vec3, w: number, h: number, up: Vec3 = [0, 0, 1]): M {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
  const F = frame(a, d, up); // z along the beam, x towards `up`
  return roundedBox([-h / 2, -w / 2, 0], [h / 2, w / 2, len], Math.min(w, h) * 0.18).transform(F);
}

function solidOf(o: Op): { add: M[]; cut: M[] } {
  switch (o.op) {
    case "horn": return { add: [hornPlate(o.key, o.t ?? 4, o.extra ?? 4)], cut: hornCuts(o.key, o.t ?? 4) };
    case "cradle": return { add: [cradle({ key: o.key, T: o.T }, o.wall ?? 3)], cut: cradleCuts({ key: o.key, T: o.T }, o.wall ?? 3) };
    case "beam": return { add: [beam(o.a, o.b, o.w, o.h, o.up)], cut: [] };
    case "rod": return { add: [rod(o.a, o.b, o.r)], cut: [] };
    case "box": return { add: [o.r ? roundedBox(o.min, o.max, o.r) : box(o.min, o.max)], cut: [] };
    case "hull": { const parts = o.of.map(solidOf); return { add: [Manifold.hull(parts.flatMap((p) => p.add))], cut: parts.flatMap((p) => p.cut) }; }
    case "keepout": return { add: [], cut: [actuatorKeepout({ key: o.key, T: o.T })] };
    case "hole": return { add: [], cut: [rod(o.a, o.b, o.d / 2, 24)] };
    case "cutbox": return { add: [], cut: [box(o.min, o.max)] };
    case "at": { const parts = o.of.map(solidOf); return { add: parts.flatMap((p) => p.add.map((m) => m.transform(o.T))), cut: parts.flatMap((p) => p.cut.map((m) => m.transform(o.T))) }; }
    case "lighten": {
      const cuts: M[] = [];
      const ax = o.axis ?? [0, 0, 1];
      for (let i = 1; i <= o.n; i++) { const t = i / (o.n + 1); const c: Vec3 = [o.a[0] + (o.b[0] - o.a[0]) * t, o.a[1] + (o.b[1] - o.a[1]) * t, o.a[2] + (o.b[2] - o.a[2]) * t]; cuts.push(rod([c[0] - ax[0] * 200, c[1] - ax[1] * 200, c[2] - ax[2] * 200], [c[0] + ax[0] * 200, c[1] + ax[1] * 200, c[2] + ax[2] * 200], o.r, 24)); }
      return { add: [], cut: cuts };
    }
  }
}

/** Evaluate a program to a solid (mm). Caller must be inside build(). */
export function evaluate(p: Program): M {
  const parts = p.ops.map(solidOf);
  const pos = unionAll(parts.flatMap((x) => x.add));
  const neg = parts.flatMap((x) => x.cut);
  return neg.length ? pos.subtract(Manifold.union(neg)) : pos;
}

export interface PrintCheck { volume_cm3: number; bbox_mm: Vec3; fits_bed: boolean; watertight: boolean; min_feature_ok: boolean; genus: number; }
const BED: Vec3 = [250, 210, 220]; // Prusa MK4 / Bambu-class build volume

export function printCheck(p: Program): PrintCheck {
  return build(() => {
    const s = evaluate(p), bb = s.boundingBox();
    const size: Vec3 = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
    const sorted = [...size].sort((a, b) => b - a), bed = [...BED].sort((a, b) => b - a);
    return { volume_cm3: +(s.volume() / 1000).toFixed(2), bbox_mm: size.map((x) => +x.toFixed(1)) as Vec3, fits_bed: sorted.every((x, i) => x <= bed[i]),
      watertight: s.status() === "NoError" && !s.isEmpty(), min_feature_ok: s.volume() > 50, genus: s.genus() };
  });
}

/** Triangle mesh (metres) of a serialized program, as stored in a spec's mesh params. */
export const programMesh = (program: string) => build(() => toMesh(evaluate(JSON.parse(program) as Program)));
export { componentMesh };
