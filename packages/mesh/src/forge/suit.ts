// The whole Mark 43 armour pack made from a prompt's parameters, in the browser or in Node: forge (fields, shells, cells), pack (overlaps,
// mask relief, collar, swing trims), doors (hinges, drives, latches, staged trims, room for servos), harness (seats, channels, neck range),
// measured sweeps and limits, tidy, then the pack's quantised storage. The result is what setArmourPack() takes.
import { forgePrint, NAMES, MASK_OPEN, type ForgeParams } from "./mark43.ts";
import { components, area, isWatertight, type TriMesh } from "./mc.ts";
import { useManifold, solidStats } from "./geo.ts";
import { intake, resolve, workingHelmet, trimNeck, trimSwings, finishShells, jointPositions, encode, measured, r2, HINGE, type Piece, type Row, type Tick } from "./pack.ts";
import { build, trimStages, relieveLimbs, finishDoors, measure, limbLimits, tidy } from "./doors.ts";
import { fitWiring } from "./wiring.ts";
import type { ArmourManifest } from "../armourpack.ts";

export { useManifold, type ForgeParams };
void NAMES;

export interface SuitProgress { stage: string; done: number; total: number; detail: string; }
/** the stages and their rough share of the work, for a progress bar */
const STAGES: [string, number][] = [["forge", 0.25], ["pack", 0.1], ["doors", 0.15], ["trims", 0.25], ["wiring", 0.08], ["measure", 0.15], ["store", 0.02]];

/** a normal to the plane a set of points lies closest to (smallest principal axis, Jacobi on the covariance) */
function thinAxis(v: Float64Array): [number, number, number] {
  const n = v.length / 3, m = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) m[k] += v[i * 3 + k] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (v[i * 3 + a] - m[a]) * (v[i * 3 + b] - m[b]);
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(C[p][q]) < 1e-12) continue;
    const th = 0.5 * Math.atan2(2 * C[p][q], C[q][q] - C[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const a = C[k][p], b = C[k][q]; C[k][p] = c * a - s * b; C[k][q] = s * a + c * b; }
    for (let k = 0; k < 3; k++) { const a = C[p][k], b = C[q][k]; C[p][k] = c * a - s * b; C[q][k] = s * a + c * b; }
    for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
  }
  const i = [0, 1, 2].reduce((a, b) => (C[b][b] < C[a][a] ? b : a));
  return [V[0][i], V[1][i], V[2][i]];
}

/** The armour pack for `params`. `mf` is the manifold-3d module (the kernel's). */
/** Somewhere to keep each finished stage, so a long run can pick up where it stopped (Node keeps them on disk). */
export interface Checkpoints { save(stage: string, value: unknown): void | Promise<void>; load(stage: string): unknown | Promise<unknown>; }
export async function forgeSuit(mf: unknown, params: ForgeParams = {}, onProgress: (p: SuitProgress) => void | Promise<void> = () => {}, log: (s: string) => void = () => {}, ck?: Checkpoints): Promise<{ manifest: ArmourManifest; bytes: Uint8Array; log: string[] }> {
  useManifold(mf);
  const lines: string[] = [], say = (s: string) => { lines.push(s); log(s); };
  let stage = 0, last = 0;
  const tick: Tick = async (what) => {

    const now = Date.now();
    if (now - last < 120) return;     // yield to the event loop and report at most ~8 times a second
    last = now;
    const before = STAGES.slice(0, stage).reduce((a, s) => a + s[1], 0);
    await onProgress({ stage: STAGES[stage][0], done: before, total: 1, detail: what });
    await new Promise((r) => setTimeout(r, 0));
  };
  const next = async (name: string) => { stage = STAGES.findIndex((s) => s[0] === name); last = 0; await tick(name); };
  const t0 = Date.now(), lap = (s: string) => say(`${s} at ${((Date.now() - t0) / 1000).toFixed(1)} s ${JSON.stringify(solidStats())}`);

  // a stage kept by `ck` is taken from it; otherwise it runs and is kept
  const stageOf = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const got = (await ck?.load(name)) as T | undefined;
    if (got !== undefined && got !== null) { say(`${name}: from the checkpoint`); return got; }
    const v = await run(); await ck?.save(name, v); return v;
  };
  await next("forge");
  const forged = await stageOf("forged", () => forgePrint(params, tick)); for (const s of forged.log) say(s); lap("forged");
  await next("pack");
  const jpos = jointPositions();
  const resolved = await stageOf("resolved", async () => resolve(intake(forged.pieces), tick, say));
  const relieved = await stageOf("relieved", async () => trimNeck(workingHelmet(resolved, jpos.neck_mount, say), jpos, say));
  const swung = await stageOf("swung", () => trimSwings(relieved, jpos, tick, say));
  const pieces = await stageOf("packed", async () => finishShells(swung, tick)); lap("packed");
  const faceGold = pieces.filter((p) => p.row.link === "helmet_faceplate" && p.row.material === "armour_gold");
  let minX = Infinity; for (const p of faceGold) for (let i = 0; i < p.mesh.v.length; i += 3) minX = Math.min(minX, p.mesh.v[i]);
  const faceRearX = minX - jpos.neck_mount[0];

  await next("doors");
  const built = await stageOf("hardware", async () => ({ ...(await build(pieces, forged.doors, tick, say)), pieces }));
  const { hw, recs, latches } = built; pieces.splice(0, pieces.length, ...built.pieces); lap("hardware");
  await next("trims");
  const trimmed = await stageOf("doors", async () => {
    await trimStages(pieces, hw, forged.doors, latches, tick, say);
    await relieveLimbs(pieces, hw, jpos, tick, say);
    finishDoors(pieces, hw, recs, latches, say);
    return { pieces, hw };
  });
  pieces.splice(0, pieces.length, ...trimmed.pieces); hw.splice(0, hw.length, ...trimmed.hw); lap("doors fitted");
  const all: Piece[] = [...pieces, ...hw.map((h) => ({ row: { name: h.name, link: h.link, material: "armour_silver", region: h.region, hardware: true, anchor: h.anchor.map(r2) as [number, number, number] } as Row, mesh: h.mesh }))];

  await next("wiring");
  const limits: Record<string, [number, number]> = { faceplate: [Math.round(-MASK_OPEN * 1000) / 1000, 0] };
  const wired = await fitWiring(all, recs, latches, limits, tick, say);
  all.push(...wired.added); lap("wired");

  await next("measure");
  const sequence = await measure(all, recs, latches, wired.bay_box, limits, tick, say);
  await limbLimits(all, recs, latches, jpos, limits, tick, say); lap("measured");

  await next("store");
  const t = tidy(all.map((p) => p.mesh), components, area, isWatertight); t.meshes.forEach((m, i) => { all[i].mesh = m; }); say(`crumbs dropped: ${t.dropped}`);
  const enc = all.map((p) => encode(p.mesh)), size = enc.reduce((a, e) => a + e.raw.length, 0), bytes = new Uint8Array(size), rows: ArmourManifest["pieces"] = [];
  let off = 0;
  all.forEach((p, i) => {
    const e = enc[i], nv = e.mesh.v.length / 3, nf = e.mesh.f.length / 3;
    bytes.set(e.raw, off);
    const row = { ...p.row, lo: e.lo, step: e.step, nv, nf, ov: off, of: off + nv * 6, ...measured(e.mesh) } as ArmourManifest["pieces"][number];
    if (p.row.material === "lens_glow" && p.row.region.endsWith("_hand")) {
      const v = e.mesh.v, n = thinAxis(v), mean = [0, 1, 2].map((k) => { let s = 0; for (let j = k; j < v.length; j += 3) s += v[j]; return s / nv; });
      const hs = all.filter((q, j) => q.row.region === p.row.region && q.row.material !== "lens_glow" && j !== i).map((q) => measured(q.mesh).centroid);
      const hc = [0, 1, 2].map((k) => hs.reduce((a, c) => a + c[k], 0) / hs.length), d = n[0] * (mean[0] - hc[0]) + n[1] * (mean[1] - hc[1]) + n[2] * (mean[2] - hc[2]);
      row.normal = (d > 0 ? n : n.map((x) => -x)).map((x) => Math.round(x * 1e4) / 1e4) as [number, number, number];
    }
    rows.push(row); off += e.raw.length;
  });
  const joints: Record<string, [number, number, number]> = {}; for (const [k, v] of Object.entries(jpos)) joints[k] = v.map(r2) as [number, number, number];
  const manifest = {
    source: "suit: designed by the forge (packages/mesh/src/forge, a TypeScript port of scripts/forge_mark43.py) from reference photos of the movie suit",
    wearer_height_m: 1.75, params: { voxel: params.voxel ?? 2, bulk: params.bulk ?? 1, shoulder: params.shoulder ?? 1, panels: params.panels ?? "film" },
    pieces: rows, limits, hinge: [HINGE[0], HINGE[2]], joints, face_rear_x: faceRearX,
    notes: ["shells made by the forge in the browser or in Node", "joint limits measured by sweeping each limb's armour against its parent's armour"],
    doors: recs, latches, channels: wired.channels, bays: wired.bays, bay_box: wired.bay_box, sequence,
  } as unknown as ArmourManifest;
  lap("stored");
  await onProgress({ stage: "done", done: 1, total: 1, detail: `${rows.length} pieces` });
  return { manifest, bytes, log: lines };
}
export type { TriMesh };
