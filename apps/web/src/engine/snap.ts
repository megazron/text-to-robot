// Placing a part: mate one of its mounts to a matching mount in the robot (shaft to hub, servo to its seat, board holes
// to standoffs), or set it down on a surface on a grid. Pure math on mount frames: usable on an editor's page while the
// pointer moves, with the mounts the engine reports (`partMounts`, `worldMounts`).
import type { Pose, Vec3 } from "@ttr/robot-schema";
import { mul, inv, matPose, unit, rotBetween, axisAngle, apply, rotate, type M4 } from "./edit.ts";
export type MountKind = "output" | "hub" | "case" | "seat" | "board" | "standoffs" | "base" | "face";
export interface Mount {
  id: string; kind: MountKind;
  /** metres, part frame */
  pos: Vec3;
  /** unit vector out of the part */
  axis: Vec3;
  /** unit vector across the axis that fixes the turn about it */
  ref: Vec3;
  /** hole centres (metres, relative to pos, in the mount plane) for board and standoff patterns */
  holes?: [number, number][];
  /** the catalog key a seat or standoff pattern was made for */
  fits?: string;
  label: string;
}
/** Kinds that mate. An output and a hub make a joint (the hub turns with the output). */
export const MATES: Record<MountKind, MountKind[]> = {
  output: ["hub"], hub: ["output"], case: ["seat"], seat: ["case"], board: ["standoffs", "face"], standoffs: ["board"], base: ["face"], face: ["base", "board"],
};

export interface WorldMount extends Mount { link: string; }

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Frame of a mount: z along its axis, x along its reference. */
export function mountFrame(m: { pos: Vec3; axis: Vec3; ref: Vec3 }): M4 {
  const z = unit(m.axis);
  let x = m.ref.map((v, i) => v - z[i] * dot(m.ref, z)) as Vec3;
  if (Math.hypot(...x) < 1e-6) x = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  x = unit(x.map((v, i) => v - z[i] * dot(x, z)) as Vec3);
  const y = cross(z, x);
  return [x[0], y[0], z[0], m.pos[0], x[1], y[1], z[1], m.pos[1], x[2], y[2], z[2], m.pos[2], 0, 0, 0, 1];
}
const FLIP: M4 = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];

/** World transform of a part's frame that puts its mount `mine` face to face on `target` (turned `turn` rad about the axis). */
export function mate(mine: Mount, target: { pos: Vec3; axis: Vec3; ref: Vec3 }, turn = 0): M4 {
  return mul(mul(mountFrame(target), mul(FLIP, axisAngle([0, 0, 1], turn))), inv(mountFrame(mine)));
}

/** Do two board/standoff hole patterns match (any order, any quarter turn), within `tol` metres? */
export function patternsMatch(a: [number, number][] | undefined, b: [number, number][] | undefined, tol = 0.0004): boolean {
  if (!a || !b || a.length !== b.length || !a.length) return false;
  for (const [c, s] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (const flip of [1, -1]) {
    if (a.every(([x, y]) => b.some(([u, v]) => Math.hypot(c * x - s * y * flip - u, s * x + c * y * flip - v) < tol))) return true;
  }
  return false;
}
export function compatible(mine: Mount, target: Mount): boolean {
  if (!MATES[mine.kind].includes(target.kind)) return false;
  if (mine.kind === "case" || target.kind === "case") return !!mine.fits && mine.fits === target.fits;
  if (mine.kind === "board" && target.kind === "standoffs") return mine.fits === target.fits || patternsMatch(mine.holes, target.holes);
  return true;
}

export interface Snap {
  /** world pose for the part's frame */
  world: Pose;
  /** how it was placed */
  how: "mate" | "surface" | "free";
  /** the link it attaches to (the one it was dropped on) */
  parent?: string;
  mine?: string; target?: string;
  /** an output mated to a hub: the editor should offer the joint (axis and point, world) */
  joint?: { axis: Vec3; at: Vec3; from: "output" | "hub" };
  label: string;
}

/**
 * Where a part goes when dropped at `hit` (world point on `link`, surface normal `normal`): mated to the nearest
 * compatible mount within `reach` metres of the hit, else on the surface with its base down and its position on a
 * `grid` (metres) in the surface plane.
 */
export function snapPart(mine: Mount[], targets: WorldMount[], hit: { point: Vec3; normal: Vec3; link?: string }, opts: { reach?: number; grid?: number; turn?: number } = {}): Snap {
  const reach = opts.reach ?? 0.03, grid = opts.grid ?? 0.005, turn = opts.turn ?? 0;
  let best: { m: Mount; t: WorldMount; d: number } | undefined;
  for (const t of targets) {
    if (t.kind === "face" || t.kind === "base") continue; // faces are surfaces: they take the grid below
    const d = Math.hypot(t.pos[0] - hit.point[0], t.pos[1] - hit.point[1], t.pos[2] - hit.point[2]);
    if (d > reach) continue;
    for (const m of mine) if (compatible(m, t) && (!best || d < best.d)) best = { m, t, d };
  }
  if (best) {
    const W = mate(best.m, best.t, turn), isOut = best.t.kind === "output" || best.m.kind === "output";
    return { world: matPose(W), how: "mate", parent: best.t.link, mine: best.m.id, target: best.t.id, label: `${best.m.label} on ${best.t.label}`,
      ...(isOut ? { joint: { axis: unit(best.t.kind === "output" ? best.t.axis : best.t.axis.map((x) => -x) as Vec3), at: best.t.pos, from: best.t.kind === "output" ? "output" as const : "hub" as const } } : {}) };
  }
  const base = mine.find((m) => m.kind === "base") ?? mine[0];
  const n = unit(hit.normal);
  // grid: snap the hit in the surface plane (two directions across the normal), keep it on the plane
  const u = unit(Math.abs(n[2]) > 0.9 ? [1, 0, 0] : cross([0, 0, 1], n)), v = cross(n, u);
  const snapTo = (x: number) => (grid > 0 ? Math.round(x / grid) * grid : x);
  const a = snapTo(dot(hit.point, u)), b = snapTo(dot(hit.point, v)), c = dot(hit.point, n);
  const p: Vec3 = [0, 1, 2].map((i) => u[i] * a + v[i] * b + n[i] * c) as Vec3;
  if (!base) return { world: { xyz: p, rpy: [0, 0, 0] }, how: "free", label: "free" };
  const target = { pos: p, axis: n, ref: Math.abs(n[2]) > 0.9 ? [1, 0, 0] as Vec3 : u };
  const W = mate(base, target, turn);
  return { world: matPose(W), how: "surface", ...(hit.link ? { parent: hit.link } : {}), mine: base.id, label: hit.link ? "on the surface" : "on the ground" };
}

/** World point and axis of a mount after moving its part by world transform W (for previews). */
export const movedMount = (m: Mount, W: M4) => ({ pos: apply(W, m.pos), axis: rotate(W, m.axis) });
export { rotBetween };
