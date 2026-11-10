// Self-collision over a motion, fast enough to run on every frame in the browser. Each part's real mesh (the solids the
// design checks use) becomes a narrow-band signed distance grid in its own frame and a cloud of points on its surface.
// Two parts collide in a frame when points of one are inside the other by more than `tol`, beyond what they already share
// with every joint at zero (a shaft in its bearing, a plate lapping over the next one by design). Parts bolted together are
// one body and never tested against each other. Points below the floor are reported too. Nothing is hidden: a frame that
// collides is listed with its pairs and depth.
import { type Model, fk, resolve } from "./model.ts";
import type { Trajectory } from "./traj.ts";
import { type T34, type V3, rng, ident } from "./math.ts";

export interface LinkMesh { positions: ArrayLike<number>; triangles: ArrayLike<number>; }
interface Part {
  link: number; h: number; lo: V3; n: [number, number, number];
  /** signed distance (m) at voxel centres; +band outside the band, -band deep inside */
  sdf: Float32Array; band: number;
  pts: Float32Array;
  box: { min: V3; max: V3 };
}
export interface CollisionModel {
  m: Model; parts: (Part | null)[]; tol: number; voxel: number;
  /** links merged into one rigid body by fixed joints */
  body: Int32Array;
  /** the parent and child link of each moving joint: a hinge's two halves are made to fit round each other (not tested, as MoveIt's adjacent links) */
  adjacent: Set<string>;
  baseline: Map<string, { count: number; depth: number }>;
  skipped: string[];
  ground: number;
}
export interface CollisionPair { a: string; b: string; frames: number; first_s: number; last_s: number; depth_mm: number; }
export interface CollisionReport {
  checked: boolean; voxel_mm: number; tol_mm: number;
  /** per frame: true when any pair collides (self) or a part is under the floor */
  frames: boolean[];
  colliding_frames: number;
  pairs: CollisionPair[];
  floor: { link: string; frames: number; depth_mm: number }[];
  skipped: string[];
  note: string;
}

const MAX_VOX = 3_000_000, MAX_PTS = 3000;

export function collisionModel(m: Model, meshOf: (link: number) => LinkMesh | null, o: { voxel?: number; tol?: number; skip?: (link: number) => boolean } = {}): CollisionModel {
  const span = (() => { const W = fk(m, resolve(m, new Float64Array(m.joints.length))); let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < m.links.length; i++) { lo = lo.map((v, k) => Math.min(v, W[12 * i + 3 + 4 * k])); hi = hi.map((v, k) => Math.max(v, W[12 * i + 3 + 4 * k])); } return Math.max(0.05, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])); })();
  const voxel = o.voxel ?? Math.min(0.004, Math.max(0.0012, span / 350));
  const tol = o.tol ?? 0.0015;
  const parts: (Part | null)[] = [], skipped: string[] = [];
  for (let i = 0; i < m.links.length; i++) {
    // a frame marker (a few millimetres, a gram) is not a part
    const L = m.spec.links[i], g = L.geometry as { type: string; radius?: number };
    if (o.skip?.(i) || (L.mass <= 0.002 && g.type === "sphere" && (g.radius ?? 1) < 0.006)) { parts.push(null); continue; }
    let mesh: LinkMesh | null = null;
    try { mesh = meshOf(i); } catch (e) { skipped.push(`${m.links[i]} (${(e as Error).message.slice(0, 80)})`); }
    parts.push(mesh && mesh.triangles.length >= 3 ? buildPart(i, mesh, voxel) : null);
  }
  // rigid bodies: links joined by fixed joints
  const body = new Int32Array(m.links.length).map((_, i) => i);
  const find = (i: number): number => (body[i] === i ? i : (body[i] = find(body[i])));
  for (const j of m.joints) if (j.type === "fixed") body[find(j.child)] = find(j.parent);
  for (let i = 0; i < body.length; i++) body[i] = find(i);
  const adjacent = new Set<string>();
  for (const j of m.joints) if (j.type !== "fixed") { const a = j.parent, b = j.child; adjacent.add(a < b ? `${a}|${b}` : `${b}|${a}`); }
  const cm: CollisionModel = { m, parts, tol, voxel, body, adjacent, baseline: new Map(), skipped, ground: 0 };
  // what parts share at zero: their designed overlap
  const q0 = resolve(m, new Float64Array(m.joints.length)), W0 = fk(m, q0);
  for (const [a, b, r] of pairsAt(cm, W0, null)) cm.baseline.set(`${a}|${b}`, r);
  return cm;
}

function buildPart(link: number, mesh: LinkMesh, voxel: number): Part | null {
  const P = mesh.positions, T = mesh.triangles, nt = Math.floor(T.length / 3);
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < P.length; k += 3) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], P[k + d]); hi[d] = Math.max(hi[d], P[k + d]); }
  if (!Number.isFinite(lo[0])) return null;
  // a thin shell (an armour plate, a sheet bracket) gets a finer grid: about half its thickness (2 x volume / area), so its
  // inside is resolved; a solid part keeps the robot's grid
  let vol = 0, ar = 0;
  for (let t = 0; t < nt; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    ar += Math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2) / 2;
  }
  const thick = ar > 0 ? (2 * Math.abs(vol)) / ar : voxel;
  let h = Math.min(voxel, Math.max(0.001, 0.6 * thick));
  const dims = () => [0, 1, 2].map((d) => Math.max(1, Math.ceil((hi[d] - lo[d]) / h) + 4)) as [number, number, number];
  let n = dims();
  while (n[0] * n[1] * n[2] > MAX_VOX) { h *= 1.25; n = dims(); }
  const o: V3 = [lo[0] - 2 * h, lo[1] - 2 * h, lo[2] - 2 * h];
  const band = 2 * h, N = n[0] * n[1] * n[2];
  const dist = new Float32Array(N).fill(band);
  // unsigned distance in a band round every triangle: only voxels near the triangle's plane are measured
  for (let t = 0; t < nt; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const x0 = Math.max(0, Math.floor((Math.min(P[a], P[b], P[c]) - band - o[0]) / h)), x1 = Math.min(n[0] - 1, Math.ceil((Math.max(P[a], P[b], P[c]) + band - o[0]) / h));
    const y0 = Math.max(0, Math.floor((Math.min(P[a + 1], P[b + 1], P[c + 1]) - band - o[1]) / h)), y1 = Math.min(n[1] - 1, Math.ceil((Math.max(P[a + 1], P[b + 1], P[c + 1]) + band - o[1]) / h));
    const z0 = Math.max(0, Math.floor((Math.min(P[a + 2], P[b + 2], P[c + 2]) - band - o[2]) / h)), z1 = Math.min(n[2] - 1, Math.ceil((Math.max(P[a + 2], P[b + 2], P[c + 2]) + band - o[2]) / h));
    for (let z = z0; z <= z1; z++) { const pz = o[2] + (z + 0.5) * h; for (let y = y0; y <= y1; y++) { const py = o[1] + (y + 0.5) * h; for (let x = x0; x <= x1; x++) {
      const px = o[0] + (x + 0.5) * h, plane = Math.abs((px - P[a]) * nx + (py - P[a + 1]) * ny + (pz - P[a + 2]) * nz), id = x + n[0] * (y + n[1] * z);
      if (plane >= dist[id]) continue;
      const d = pointTri(px, py, pz, P, a, b, c); if (d < dist[id]) dist[id] = d;
    } } }
  }
  // inside by parity along z through each column of voxel centres
  const inside = new Uint8Array(N), cols = new Map<number, number[]>();
  for (let t = 0; t < nt; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-18) continue;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - o[0]) / h - 0.5)), x1 = Math.min(n[0] - 1, Math.ceil((Math.max(ax, bx, cx) - o[0]) / h - 0.5));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - o[1]) / h - 0.5)), y1 = Math.min(n[1] - 1, Math.ceil((Math.max(ay, by, cy) - o[1]) / h - 0.5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = o[0] + (x + 0.5) * h + 1e-9 * 1.37, py = o[1] + (y + 0.5) * h + 1e-9 * 0.71;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2], key = x + n[0] * y;
      let col = cols.get(key); if (!col) cols.set(key, (col = [])); col.push(z);
    }
  }
  for (const [key, zs] of cols) {
    zs.sort((p, q) => p - q);
    const x = key % n[0], y = Math.floor(key / n[0]);
    for (let k = 0; k + 1 < zs.length; k += 2) {
      const z0 = Math.max(0, Math.ceil((zs[k] - o[2]) / h - 0.5)), z1 = Math.min(n[2] - 1, Math.floor((zs[k + 1] - o[2]) / h - 0.5));
      for (let z = z0; z <= z1; z++) inside[x + n[0] * (y + n[1] * z)] = 1;
    }
  }
  const sdf = new Float32Array(N);
  for (let i = 0; i < N; i++) sdf[i] = inside[i] ? -dist[i] : dist[i];
  // surface points: every vertex and area-weighted samples on the triangles, at about the voxel spacing
  const R = rng(9137 + link), pts: number[] = [];
  let area = 0; const areas = new Float64Array(nt);
  for (let t = 0; t < nt; t++) { const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2]; const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]; const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; areas[t] = Math.hypot(cr[0], cr[1], cr[2]) / 2; area += areas[t]; }
  const want = Math.min(MAX_PTS, Math.max(60, Math.ceil(area / (h * h))));
  for (let t = 0; t < nt && pts.length / 3 < want * 2; t++) {
    const k = (areas[t] / area) * want; let cnt = Math.floor(k) + (R() < k - Math.floor(k) ? 1 : 0);
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    while (cnt-- > 0) { let u = R(), v = R(); if (u + v > 1) { u = 1 - u; v = 1 - v; } for (let d = 0; d < 3; d++) pts.push(P[a + d] + u * (P[b + d] - P[a + d]) + v * (P[c + d] - P[a + d])); }
  }
  return { link, h, lo: o, n, sdf, band, pts: Float32Array.from(pts), box: { min: lo, max: hi } };
}

/** distance from a point to a triangle (Ericson, Real-Time Collision Detection 5.1.5), without allocating */
function pointTri(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number): number {
  const ax = P[a], ay = P[a + 1], az = P[a + 2];
  const abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az, acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - P[b], bpy = py - P[b + 1], bpz = pz - P[b + 2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = px - P[c], cpy = py - P[c + 1], cpz = pz - P[c + 2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) { qx = P[b]; qy = P[b + 1]; qz = P[b + 2]; }
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
    else if (d6 >= 0 && d5 <= d6) { qx = P[c]; qy = P[c + 1]; qz = P[c + 2]; }
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = P[b] + w * (P[c] - P[b]); qy = P[b + 1] + w * (P[c + 1] - P[b + 1]); qz = P[b + 2] + w * (P[c + 2] - P[b + 2]); }
    else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sample(P: Part, x: number, y: number, z: number): number {
  const fx = (x - P.lo[0]) / P.h - 0.5, fy = (y - P.lo[1]) / P.h - 0.5, fz = (z - P.lo[2]) / P.h - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= P.n[0] - 1 || iy >= P.n[1] - 1 || iz >= P.n[2] - 1) return P.band;
  const tx = fx - ix, ty = fy - iy, tz = fz - iz, nx = P.n[0], nxy = P.n[0] * P.n[1], i = ix + nx * iy + nxy * iz, s = P.sdf;
  const c00 = s[i] * (1 - tx) + s[i + 1] * tx, c10 = s[i + nx] * (1 - tx) + s[i + nx + 1] * tx, c01 = s[i + nxy] * (1 - tx) + s[i + nxy + 1] * tx, c11 = s[i + nxy + nx] * (1 - tx) + s[i + nxy + nx + 1] * tx;
  return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
}

/** world box of a part */
function wbox(P: Part, W: Float64Array): { lo: V3; hi: V3 } {
  const o = 12 * P.link, lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [P.box.min[0], P.box.max[0]]) for (const y of [P.box.min[1], P.box.max[1]]) for (const z of [P.box.min[2], P.box.max[2]]) {
    const p = [W[o] * x + W[o + 1] * y + W[o + 2] * z + W[o + 3], W[o + 4] * x + W[o + 5] * y + W[o + 6] * z + W[o + 7], W[o + 8] * x + W[o + 9] * y + W[o + 10] * z + W[o + 11]];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }
  return { lo, hi };
}
/** points of a inside b: how many and how deep */
function penetration(A: Part, B: Part, W: Float64Array, tol0: number): { count: number; depth: number } {
  // what B's grid resolves: a point counts as inside when it is more than one and a half of B's voxels in (at least 1.5 mm);
  // two surfaces that graze within that are not told apart from a mesh sampled on a grid
  const tol = Math.max(tol0, 1.5 * B.h, 0.0015);
  // a's points into b's frame: Wb^-1 Wa
  const a = 12 * A.link, b = 12 * B.link, M = new Float64Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 3; k++) s += W[b + k * 4 + i] * (W[a + k * 4 + j] - (j === 3 ? W[b + k * 4 + 3] : 0));
    M[i * 4 + j] = s;
  }
  const lo = B.lo, hiX = lo[0] + B.n[0] * B.h, hiY = lo[1] + B.n[1] * B.h, hiZ = lo[2] + B.n[2] * B.h;
  let count = 0, depth = 0; const p = A.pts;
  for (let k = 0; k < p.length; k += 3) {
    const x = M[0] * p[k] + M[1] * p[k + 1] + M[2] * p[k + 2] + M[3], y = M[4] * p[k] + M[5] * p[k + 1] + M[6] * p[k + 2] + M[7], z = M[8] * p[k] + M[9] * p[k + 1] + M[10] * p[k + 2] + M[11];
    if (x < lo[0] || y < lo[1] || z < lo[2] || x > hiX || y > hiY || z > hiZ) continue;
    const d = sample(B, x, y, z);
    if (d < -tol) { count++; if (-d > depth) depth = -d; }
  }
  return { count, depth };
}

/** colliding pairs at one pose (world FK result); `moving` limits the pairs to those whose bodies move relative to each other */
function pairsAt(cm: CollisionModel, W: Float64Array, moving: ((a: number, b: number) => boolean) | null): [string, string, { count: number; depth: number }][] {
  const out: [string, string, { count: number; depth: number }][] = [];
  const live = cm.parts.filter((p): p is Part => !!p), boxes = live.map((p) => wbox(p, W)), m = cm.m;
  for (let i = 0; i < live.length; i++) for (let k = i + 1; k < live.length; k++) {
    const A = live[i], B = live[k];
    const ba = cm.body[A.link], bb = cm.body[B.link];
    if (ba === bb || cm.adjacent.has(A.link < B.link ? `${A.link}|${B.link}` : `${B.link}|${A.link}`)) continue;
    if (moving && !moving(cm.body[A.link], cm.body[B.link])) continue;
    const a = boxes[i], b = boxes[k];
    if (a.lo[0] > b.hi[0] || b.lo[0] > a.hi[0] || a.lo[1] > b.hi[1] || b.lo[1] > a.hi[1] || a.lo[2] > b.hi[2] || b.lo[2] > a.hi[2]) continue;
    const r1 = penetration(A, B, W, cm.tol), r2 = penetration(B, A, W, cm.tol);
    const r = { count: r1.count + r2.count, depth: Math.max(r1.depth, r2.depth) };
    if (r.count) out.push([m.links[A.link], m.links[B.link], r]);
  }
  return out;
}
const beyond = (cm: CollisionModel, a: string, b: string, r: { count: number; depth: number }) => {
  const base = cm.baseline.get(`${a}|${b}`) ?? cm.baseline.get(`${b}|${a}`);
  if (!base) return r.count >= 2 ? r.depth : 0;
  return r.count > base.count * 1.5 + 4 && r.depth > base.depth + cm.tol ? r.depth - base.depth : 0;
};

/** collisions at one pose, for interactive posing: pairs (beyond their designed overlap) */
export function poseCollisions(cm: CollisionModel, q: Float64Array, base: T34 = ident()): { a: string; b: string; depth_mm: number }[] {
  const W = fk(cm.m, resolve(cm.m, new Float64Array(q)), base);
  return pairsAt(cm, W, null).map(([a, b, r]) => ({ a, b, depth_mm: +(beyond(cm, a, b, r) * 1000).toFixed(1) })).filter((x) => x.depth_mm > 0);
}

/** how many of these poses collide (self, or below the floor when `ground` is given), checking only bodies that move between them */
export function countCollisions(cm: CollisionModel, frames: { q: Float64Array; base: T34 | null }[], o: { ground?: number; exempt?: Set<number> } = {}): number {
  const tr = { fps: 30, warnings: [], notes: [], collisions: null } as unknown as Trajectory;
  return checkCollisions(cm, tr, frames, { floor: o.ground !== undefined, ground: o.ground, exempt: o.exempt }).colliding_frames;
}

/** check every frame of a motion; marks colliding frames and writes the report into the trajectory */
export function checkCollisions(cm: CollisionModel, tr: Trajectory, frames: { q: Float64Array; base: T34 | null }[], o: { floor?: boolean; ground?: number; exempt?: Set<number> } = {}): CollisionReport {
  const m = cm.m;
  // which bodies move relative to which: two bodies are still relative to each other when every joint between them is still
  const movingJoint = new Set<number>();
  for (const j of m.joints) if (j.type !== "fixed") { const v0 = frames[0].q[j.index]; if (frames.some((f) => Math.abs(f.q[j.index] - v0) > 1e-6)) movingJoint.add(j.index); }
  const path = (l: number) => { const s = new Set<number>(); for (let j = m.parentJoint[l]; j >= 0; j = m.parentJoint[m.joints[j].parent]) s.add(j); return s; };
  const pathCache = new Map<number, Set<number>>(), pc = (l: number) => { let s = pathCache.get(l); if (!s) pathCache.set(l, (s = path(l))); return s; };
  const relCache = new Map<string, boolean>();
  const moving = (a: number, b: number) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`; let r = relCache.get(key);
    if (r === undefined) { const pa = pc(a), pb = pc(b); r = false; for (const j of pa) if (!pb.has(j) && movingJoint.has(j)) { r = true; break; } if (!r) for (const j of pb) if (!pa.has(j) && movingJoint.has(j)) { r = true; break; } relCache.set(key, r); }
    return r;
  };
  const pairs = new Map<string, CollisionPair>(), floor = new Map<string, { link: string; frames: number; depth_mm: number }>();
  const flags = new Array(frames.length).fill(false);
  const doFloor = o.floor ?? true, ground = o.ground ?? groundOf(cm, frames[0]);
  const exempt = o.exempt ?? new Set<number>();
  for (let k = 0; k < frames.length; k++) {
    const W = fk(m, frames[k].q, frames[k].base ?? undefined);
    for (const [a, b, r] of pairsAt(cm, W, moving)) {
      const d = beyond(cm, a, b, r); if (d <= 0) continue;
      flags[k] = true;
      const key = `${a}|${b}`, p = pairs.get(key) ?? { a, b, frames: 0, first_s: k / tr.fps, last_s: 0, depth_mm: 0 };
      p.frames++; p.last_s = round3(k / tr.fps); p.depth_mm = Math.max(p.depth_mm, +(d * 1000).toFixed(1)); p.first_s = round3(p.first_s); pairs.set(key, p);
    }
    if (doFloor) for (const P of cm.parts) {
      if (!P || exempt.has(P.link)) continue;
      const o12 = 12 * P.link; let low = Infinity;
      const bx = wbox(P, W); if (bx.lo[2] > ground - 0.002) continue;
      for (let i = 0; i < P.pts.length; i += 3) low = Math.min(low, W[o12 + 8] * P.pts[i] + W[o12 + 9] * P.pts[i + 1] + W[o12 + 10] * P.pts[i + 2] + W[o12 + 11]);
      if (low < ground - 0.002) { flags[k] = true; const n = m.links[P.link], f = floor.get(n) ?? { link: n, frames: 0, depth_mm: 0 }; f.frames++; f.depth_mm = Math.max(f.depth_mm, +((ground - low) * 1000).toFixed(1)); floor.set(n, f); }
    }
  }
  const rep: CollisionReport = {
    checked: true, voxel_mm: +(cm.voxel * 1000).toFixed(2), tol_mm: +(cm.tol * 1000).toFixed(2), frames: flags, colliding_frames: flags.filter(Boolean).length,
    pairs: [...pairs.values()].sort((a, b) => b.frames - a.frames), floor: [...floor.values()], skipped: cm.skipped,
    note: `Every frame, every pair of parts that move relative to each other (except the two sides of one hinge, made to fit round each other): real meshes as ${(cm.voxel * 1000).toFixed(1)} mm distance grids, flagged when one goes more than one and a half grid cells (at least ${(cm.tol * 1000).toFixed(1)} mm) into the other beyond the overlap they have with every joint at zero. The exact solids are the reference for anything smaller.`,
  };
  tr.collisions = rep;
  if (rep.pairs.length) tr.warnings.push(`Self-collision in ${rep.colliding_frames} of ${frames.length} frames: ${rep.pairs.slice(0, 4).map((p) => `${p.a} and ${p.b} (${p.depth_mm} mm, ${p.first_s.toFixed(1)}-${p.last_s.toFixed(1)} s)`).join("; ")}${rep.pairs.length > 4 ? `, and ${rep.pairs.length - 4} more pairs` : ""}.`);
  if (rep.floor.length) tr.warnings.push(`Below the floor: ${rep.floor.slice(0, 4).map((f) => `${f.link} by ${f.depth_mm} mm`).join(", ")}.`);
  if (rep.skipped.length) tr.notes.push(`Not checked for collision (no mesh loaded): ${rep.skipped.length} parts.`);
  return rep;
}
const round3 = (x: number) => Math.round(x * 1000) / 1000;
export function groundOf(cm: CollisionModel, f: { q: Float64Array; base: T34 | null }): number {
  const W = fk(cm.m, f.q, f.base ?? undefined); let low = Infinity;
  for (const P of cm.parts) { if (!P) continue; const o = 12 * P.link; for (let i = 0; i < P.pts.length; i += 3) low = Math.min(low, W[o + 8] * P.pts[i] + W[o + 9] * P.pts[i + 1] + W[o + 10] * P.pts[i + 2] + W[o + 11]); }
  return Number.isFinite(low) ? low : 0;
}
