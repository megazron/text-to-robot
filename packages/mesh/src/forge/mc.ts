// Marching cubes on a field (negative inside) and the mesh bookkeeping the forge needs: closed components split by shared edges,
// small holes closed, signed volume, consistent outward orientation. Vertices are shared along grid edges, so a closed field
// gives a closed mesh without welding.
import { hypot } from "./dmath.ts";
import { TRI } from "./mctable.ts";

/** A triangle mesh in mm: xyz per vertex, three vertex ids per triangle. */
export interface TriMesh { v: Float64Array; f: Uint32Array; }

// The table separates the corners whose bit is set where a face is ambiguous: the bit marks the outside here, so thin walls stay joined
// across a saddle, as scikit-image's Lewiner method mostly keeps them (the shells are one voxel thick in places).
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const EDGE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const TRI_EDGES = TRI.map((s) => Array.from(s, (c) => Number.parseInt(c, 16)));

/**
 * The surface `field == level` of a grid (C order, shape n), as if padded by one voxel of `pad` all round (scikit-image's
 * marching_cubes on numpy.pad(g, 1, constant_values=pad)). Vertex positions: origin + (index - 1) * v for padded indices,
 * i.e. origin + index * v for the unpadded grid. Winding is consistent; callers orient each closed piece by its volume.
 */
export function marchingCubes(g: Float32Array, n: [number, number, number], level: number, v: number, origin: [number, number, number], pad = 9.0): TriMesh {
  const [nx, ny, nz] = n, px = nx + 2, py = ny + 2, pz = nz + 2;
  const at = (i: number, j: number, k: number): number => {
    i -= 1; j -= 1; k -= 1;
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? pad : g[(i * ny + j) * nz + k];
  };
  // vertex ids on grid edges: per padded point, one per axis
  const ids = new Map<number, number>(), pos: number[] = [], tris: number[] = [];
  const vert = (i: number, j: number, k: number, axis: number, a: number, b: number): number => {
    const key = ((i * py + j) * pz + k) * 3 + axis, got = ids.get(key);
    if (got !== undefined) return got;
    const t = Math.abs(b - a) < 1e-30 ? 0.5 : (level - a) / (b - a), p = [i, j, k];
    p[axis] += t;
    const id = pos.length / 3;
    pos.push(origin[0] + (p[0] - 1) * v, origin[1] + (p[1] - 1) * v, origin[2] + (p[2] - 1) * v);
    ids.set(key, id);
    return id;
  };
  const val = new Float64Array(8);
  // a slab of values per x keeps the lookups cheap
  for (let i = 0; i < px - 1; i++) for (let j = 0; j < py - 1; j++) for (let k = 0; k < pz - 1; k++) {
    let c = 0;
    for (let q = 0; q < 8; q++) { const o = CORNER[q], x = at(i + o[0], j + o[1], k + o[2]); val[q] = x; if (x >= level) c |= 1 << q; }
    if (c === 0 || c === 255) continue;
    const es = TRI_EDGES[c];
    const ev: number[] = [];
    for (let t = 0; t < es.length; t++) {
      const [a, b] = EDGE[es[t]], ca = CORNER[a], cb = CORNER[b];
      // the edge from its lower corner along one axis
      const axis = ca[0] !== cb[0] ? 0 : ca[1] !== cb[1] ? 1 : 2, lo = ca[axis] < cb[axis] ? ca : cb, hi = lo === ca ? cb : ca;
      ev.push(vert(i + lo[0], j + lo[1], k + lo[2], axis, val[lo === ca ? a : b], val[hi === ca ? a : b]));
    }
    for (let t = 0; t < ev.length; t += 3) tris.push(ev[t], ev[t + 1], ev[t + 2]);
  }
  const m: TriMesh = { v: Float64Array.from(pos), f: Uint32Array.from(tris) };
  return m;
}

export function signedVolume(m: TriMesh): number {
  let s = 0; const { v, f } = m;
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3;
    s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return s / 6;
}

export function area(m: TriMesh): number {
  let s = 0; const { v, f } = m;
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    s += 0.5 * hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  return s;
}

export function flip(m: TriMesh): TriMesh {
  const f = m.f.slice();
  for (let t = 0; t < f.length; t += 3) { const x = f[t + 1]; f[t + 1] = f[t + 2]; f[t + 2] = x; }
  return { v: m.v, f };
}

const edgeKey = (a: number, b: number) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);

/** Connected components by shared edges (trimesh's split), each with its own vertex ids. */
export function components(m: TriMesh): TriMesh[] {
  const nf = m.f.length / 3, parent = new Int32Array(nf);
  for (let i = 0; i < nf; i++) parent[i] = i;
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const first = new Map<number, number>();
  for (let t = 0; t < nf; t++) for (let e = 0; e < 3; e++) {
    const k = edgeKey(m.f[t * 3 + e], m.f[t * 3 + ((e + 1) % 3)]), o = first.get(k);
    if (o === undefined) first.set(k, t);
    else { const a = find(o), b = find(t); if (a !== b) parent[a] = b; }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < nf; t++) { const r = find(t); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(t); }
  const out: TriMesh[] = [];
  for (const ts of groups.values()) {
    const map = new Map<number, number>(), v: number[] = [], f = new Uint32Array(ts.length * 3);
    ts.forEach((t, q) => {
      for (let e = 0; e < 3; e++) {
        const id = m.f[t * 3 + e]; let n = map.get(id);
        if (n === undefined) { n = v.length / 3; map.set(id, n); v.push(m.v[id * 3], m.v[id * 3 + 1], m.v[id * 3 + 2]); }
        f[q * 3 + e] = n;
      }
    });
    out.push({ v: Float64Array.from(v), f });
  }
  return out;
}

/** Directed edges used once: a closed, consistently wound mesh has none. */
function openEdges(m: TriMesh): Map<number, number> {
  const dir = new Map<number, number>();   // key a*2^32+b -> b for each directed edge without its twin
  for (let t = 0; t < m.f.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = m.f[t + e], b = m.f[t + ((e + 1) % 3)], twin = b * 4294967296 + a;
    if (dir.has(twin)) dir.delete(twin); else dir.set(a * 4294967296 + b, b);
  }
  return dir;
}

export function isWatertight(m: TriMesh): boolean {
  if (openEdges(m).size) return false;
  // every undirected edge exactly twice
  const c = new Map<number, number>();
  for (let t = 0; t < m.f.length; t += 3) for (let e = 0; e < 3; e++) { const k = edgeKey(m.f[t + e], m.f[t + ((e + 1) % 3)]); c.set(k, (c.get(k) ?? 0) + 1); }
  for (const x of c.values()) if (x !== 2) return false;
  return true;
}

/** Closes holes of three or four edges, as trimesh.repair.fill_holes does. */
export function fillHoles(m: TriMesh): TriMesh {
  const open = openEdges(m); if (!open.size) return m;
  const next = new Map<number, number>();
  for (const [k, b] of open) next.set(Math.floor(k / 4294967296), b);
  const add: number[] = [], seen = new Set<number>();
  for (const a0 of next.keys()) {
    if (seen.has(a0)) continue;
    const loop = [a0]; let a = next.get(a0)!;
    while (a !== a0 && loop.length < 6 && next.has(a)) { loop.push(a); a = next.get(a)!; }
    for (const x of loop) seen.add(x);
    if (a !== a0) continue;
    // the hole runs a -> b on the mesh: the patch runs the other way
    if (loop.length === 3) add.push(loop[2], loop[1], loop[0]);
    else if (loop.length === 4) add.push(loop[2], loop[1], loop[0], loop[3], loop[2], loop[0]);
  }
  if (!add.length) return m;
  const f = new Uint32Array(m.f.length + add.length); f.set(m.f); f.set(add, m.f.length);
  return { v: m.v, f };
}

export function bounds(m: TriMesh): [[number, number, number], [number, number, number]] {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.v.length; i += 3) for (let a = 0; a < 3; a++) { const x = m.v[i + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; }
  return [lo, hi];
}

/** The mesh mirrored in y (left to right), still facing out. */
export function mirrorY(m: TriMesh): TriMesh {
  const v = m.v.slice(); for (let i = 1; i < v.length; i += 3) v[i] = -v[i];
  return flip({ v, f: m.f });
}
