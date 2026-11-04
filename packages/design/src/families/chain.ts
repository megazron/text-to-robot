// Serial chains of real actuators with printed brackets between them, in any direction (legs hang
// down, arms hang from the shoulders). Each joint is placed as close to the previous one as the
// geometry allows: the next actuator's cradle must stay outside the swept body of the previous
// actuator (or sit beyond its horn plate), and never closer than a requested link length.
import type { Vec3 } from "@ttr/parts";
import { frame, invert, apply, type Mat4, type Op } from "@ttr/solid";
import { PLATE, WALL, add, sub, scale, depth, bodyMm, bodyRadius, plate, horn, hornR, cradleCorners } from "./legkit.ts";

export interface ChainJoint {
  name: string; key: string;
  /** output direction of the actuator (joint axis, world, unit) */
  axis: Vec3;
  /** actuator x axis (world): the case extends towards -xdir from the output axis */
  xdir: Vec3;
  /** direction from the previous joint's chain point to this one */
  dirIn: Vec3;
  /** minimum distance from the previous chain point (link length) */
  minLen?: number;
  /** centre the actuator body on the chain line (side-plate joints) instead of putting its output face on it */
  centred?: boolean;
  limit: [number, number];
}
export interface PlacedJoint extends ChainJoint { W: Mat4; P: Vec3; }

/** Points of the cradle box (corners, edge midpoints, face centres) around an actuator at W. */
export function cradleSamples(key: string, W: Mat4, wall = WALL): Vec3[] {
  const b = bodyMm(key), xs = [b.min[0] - wall, (b.min[0] + b.max[0]) / 2, b.max[0] + wall], ys = [b.min[1] - wall, 0, b.max[1] + wall], zs = [b.min[2] - wall, (b.min[2] - 2) / 2, -2];
  const out: Vec3[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) out.push(apply(W, [x, y, z]));
  return out;
}
export const jointFrame = (P: Vec3, j: ChainJoint): Mat4 => frame(j.centred === false ? P : add(P, scale(j.axis, depth(j.key) / 2)), j.axis, j.xdir);

/** True when the cradle of `next` (at Wn) clears the swept body of `prev` (at Wp). */
export function clears(prevKey: string, Wp: Mat4, nextKey: string, Wn: Mat4, gap = 2): boolean {
  const iW = invert(Wp), R = bodyRadius(prevKey) + WALL + gap;
  return cradleSamples(nextKey, Wn).every((p) => { const l = apply(iW, p); return l[2] >= PLATE + 1 || Math.hypot(l[0], l[1]) >= R; });
}

/** Place a chain: the first joint at P0 (its chain point), every next one as close as it clears. */
export function placeChain(P0: Vec3, joints: ChainJoint[]): PlacedJoint[] {
  const out: PlacedJoint[] = [];
  joints.forEach((j, i) => {
    if (i === 0) { out.push({ ...j, P: P0, W: jointFrame(P0, j) }); return; }
    const prev = out[i - 1];
    let s = j.minLen ?? 0, P = add(prev.P, scale(j.dirIn, s)), W = jointFrame(P, j);
    while (!clears(prev.key, prev.W, j.key, W) && s < 600) { s += 0.5; P = add(prev.P, scale(j.dirIn, s)); W = jointFrame(P, j); }
    out.push({ ...j, P, W });
  });
  return out;
}

/** Bracket from the output of `cur` to the cradle of an actuator `nextKey` at Wn (world mm ops). */
export function bracketOps(cur: PlacedJoint, nextKey: string, Wn: Mat4, t = PLATE, r = hornR(cur.key)): Op[] {
  const ops: Op[] = [horn(cur.W, cur.key, t), { op: "cradle", key: nextKey, T: Wn, wall: WALL }];
  ops.push(...bridge(cur.W, cradleCorners(nextKey, Wn), t, r));
  return ops;
}
/** Plate in the horn plane of W reaching over a set of points, bridged down/up to them. */
export function bridge(W: Mat4, pts0: Vec3[], t: number, r: number): Op[] {
  // pull the target points 1.3 mm into the part they reach (hull faces through exact cradle edges make non-manifold seams)
  const c = scale(pts0.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / pts0.length);
  const pts = pts0.map((p) => { const d = sub(c, p), l = Math.hypot(...d) || 1; return add(p, scale(d, 1.3 / l)); });
  const iW = invert(W), loc = pts.map((p) => apply(iW, p));
  const zmax = Math.max(...loc.map((l) => l[2])), zmin = Math.min(...loc.map((l) => l[2]));
  if (zmin >= t - 0.01) {
    // stacked beyond the horn: pedestal from the horn disc to the near face
    const near = pts.filter((_, k) => loc[k][2] <= zmin + WALL);
    return [{ op: "hull", of: [plate(W, [apply(W, [0, 0, 0])], r, 0, t), ...near.map((p) => ({ op: "box" as const, min: [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5] as Vec3, max: [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5] as Vec3 }))] }];
  }
  // beside the horn plane: side plate over the footprint, then down to the face nearest the plate
  const face = pts.filter((_, k) => loc[k][2] >= zmax - WALL);
  return [
    { op: "hull", of: [plate(W, [apply(W, [0, 0, 0])], r, 0, t), plate(W, face, 1.5, 0, t)] },
    { op: "hull", of: [plate(W, face, 1, 0, t), ...face.map((p) => ({ op: "box" as const, min: [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5] as Vec3, max: [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5] as Vec3 }))] },
  ];
}
