// Interference check: every pair of solids (printed programs and catalog component bodies) at the
// home pose, intersected exactly with manifold-3d. Moving parts are not swept; this is the static check.
import type { RobotSpecification } from "@ttr/robot-schema";
import { build, Manifold, evaluate, componentMesh, type Mat4, type Program } from "@ttr/solid";
import { fk } from "./kin.ts";

export interface Overlap { a: string; b: string; volume_mm3: number; min: number[]; max: number[] }

/** Component meshes are stored per face; weld coincident vertices so manifold accepts them. */
function componentSolid(key: string) {
  const cm = componentMesh(key), seen = new Map<string, number>(), verts: number[] = [], remap: number[] = [];
  for (const v of cm.v) {
    const k = v.map((x) => Math.round(x * 1e5)).join(",");
    if (!seen.has(k)) { seen.set(k, verts.length / 3); verts.push(v[0] * 1000, v[1] * 1000, v[2] * 1000); }
    remap.push(seen.get(k)!);
  }
  return Manifold.ofMesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(cm.f.flat().map((i) => remap[i])) } as any);
}

/** Pairs of links whose solids overlap by more than `minMm3` at the home pose. Links that cannot be made solid are listed in `skipped`. */
export function interference(spec: RobotSpecification, minMm3 = 20): { overlaps: Overlap[]; skipped: string[]; solids: number } {
  const f = fk(spec);
  return build(() => {
    const solids: { name: string; m: any; lo: number[]; hi: number[] }[] = [], skipped: string[] = [];
    for (const l of spec.links) {
      const g = l.geometry;
      if (g.type !== "mesh" || !g.params) continue;
      let m: any;
      try {
        if (g.part === "printed") m = evaluate(JSON.parse(String(g.params.program)) as Program);
        else if (g.part === "component") m = componentSolid(String(g.params.key));
        else continue;
      } catch { skipped.push(l.name); continue; }
      const T = f.link[l.name], R = T.R, p = T.p.map((x) => x * 1000);
      const M: Mat4 = [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, p[0], p[1], p[2], 1];
      const w = m.transform(M), bb = w.boundingBox();
      solids.push({ name: l.name, m: w, lo: bb.min, hi: bb.max });
    }
    const overlaps: Overlap[] = [];
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if ([0, 1, 2].some((k) => a.hi[k] < b.lo[k] || b.hi[k] < a.lo[k])) continue;
      const I = Manifold.intersection(a.m, b.m), v = I.volume();
      if (v > minMm3) { const bb = I.boundingBox(); overlaps.push({ a: a.name, b: b.name, volume_mm3: Math.round(v), min: bb.min.map(Math.round), max: bb.max.map(Math.round) }); }
    }
    return { overlaps: overlaps.sort((x, y) => y.volume_mm3 - x.volume_mm3), skipped, solids: solids.length };
  });
}
