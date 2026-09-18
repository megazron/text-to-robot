// Procedural polygon meshes: the geometry engine behind "proper polygons".
// Triangle meshes in metres; deterministic; no dependencies.
export type V3 = [number, number, number];
export interface Mesh { v: V3[]; f: [number, number, number][]; }

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const empty = (): Mesh => ({ v: [], f: [] });

/** Weld coincident vertices and discard zero-area/duplicate triangles. Never fills holes. */
export function cleanMesh(m: Mesh, tolerance = 1e-9): Mesh {
  const vertices: V3[] = [], ids = new Map<string, number>();
  const remap = m.v.map((p) => {
    if (!p.every(Number.isFinite)) throw new Error("mesh contains non-finite vertices");
    const key = p.map((x) => Math.round(x / tolerance)).join(",");
    if (!ids.has(key)) { ids.set(key, vertices.length); vertices.push([...p]); }
    return ids.get(key)!;
  });
  const faces: Mesh["f"] = [], seen = new Set<string>();
  for (const triangle of m.f) {
    const f = triangle.map((i) => remap[i]) as Mesh["f"][number];
    if (new Set(f).size < 3) continue;
    const [a,b,c] = f.map((i) => vertices[i]);
    if (len(cross(sub(b,a),sub(c,a))) <= tolerance*tolerance) continue;
    const key = [...f].sort((a,b) => a-b).join(",");
    if (!seen.has(key)) { faces.push(f); seen.add(key); }
  }
  const used = [...new Set(faces.flat())], compact = new Map(used.map((v,i) => [v,i]));
  return {v: used.map((i) => vertices[i]), f: faces.map((f) => f.map((i) => compact.get(i)!) as Mesh["f"][number])};
}

/** Edge manifoldness is necessary, but does not detect self-intersections. */
export function meshTopology(m: Mesh) {
  const edges = new Map<string, {count: number; direction: number}>();
  for (const f of m.f) for (let i=0;i<3;i++) {
    const a=f[i], b=f[(i+1)%3], key=a<b ? `${a}:${b}` : `${b}:${a}`;
    const e=edges.get(key) ?? {count:0,direction:0}; e.count++; e.direction += a<b ? 1 : -1; edges.set(key,e);
  }
  const boundary_edges=[...edges.values()].filter((e) => e.count===1).length;
  const nonmanifold_edges=[...edges.values()].filter((e) => e.count>2).length;
  const inconsistent_edges=[...edges.values()].filter((e) => e.count===2 && e.direction!==0).length;
  return {boundary_edges,nonmanifold_edges,inconsistent_edges,closed: m.f.length>0 && boundary_edges===0 && nonmanifold_edges===0 && inconsistent_edges===0};
}

/** Split triangle edges where a clipping operation placed another vertex on them. */
export function stitchTJunctions(input: Mesh, tolerance = 1e-8): Mesh {
  const m=cleanMesh(input), out:Mesh={v:[...m.v],f:[]};
  for(const face of m.f) {
    const ring:number[]=[];
    for(let k=0;k<3;k++) {
      const a=face[k],b=face[(k+1)%3],edge=sub(m.v[b],m.v[a]),length2=dot(edge,edge);
      const points:{id:number;t:number}[]=[{id:a,t:0}];
      for(let i=0;i<m.v.length;i++) {
        if(i===a || i===b)continue;
        const t=dot(sub(m.v[i],m.v[a]),edge)/length2;
        if(t>tolerance && t<1-tolerance && len(sub(m.v[i],add(m.v[a],mul(edge,t))))<tolerance)points.push({id:i,t});
      }
      points.sort((a,b)=>a.t-b.t);ring.push(...points.map((p)=>p.id));
    }
    if(ring.length===3) {out.f.push(face);continue;}
    const center=out.v.length;out.v.push(centroid(face.map((i)=>m.v[i])));
    for(let i=0;i<ring.length;i++)out.f.push([center,ring[i],ring[(i+1)%ring.length]]);
  }
  return cleanMesh(out);
}

export function merge(...ms: Mesh[]): Mesh {
  const out = empty();
  for (const m of ms) { const o = out.v.length; out.v.push(...m.v); for (const [a, b, c] of m.f) out.f.push([a + o, b + o, c + o]); }
  return out;
}
export function transform(m: Mesh, fn: (p: V3) => V3): Mesh { return { v: m.v.map(fn), f: m.f.map((t) => [...t] as [number, number, number]) }; }
export const translate = (m: Mesh, t: V3) => transform(m, (p) => add(p, t));
export const scale = (m: Mesh, s: V3 | number) => { const k: V3 = typeof s === "number" ? [s, s, s] : s; return transform(m, (p) => [p[0] * k[0], p[1] * k[1], p[2] * k[2]]); };
/** mirror across the XZ plane (y -> -y), flipping winding so normals stay outward */
export function mirrorY(m: Mesh): Mesh { return { v: m.v.map((p) => [p[0], -p[1], p[2]] as V3), f: m.f.map(([a, b, c]) => [a, c, b] as [number, number, number]) }; }
export function rotate(m: Mesh, axis: "x" | "y" | "z", ang: number): Mesh {
  const c = Math.cos(ang), s = Math.sin(ang);
  return transform(m, (p) => axis === "x" ? [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]
    : axis === "y" ? [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]] : [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]);
}
export const flip = (m: Mesh): Mesh => ({ v: m.v.map((p) => [...p] as V3), f: m.f.map(([a, b, c]) => [a, c, b] as [number, number, number]) });

/** Loft closed cross-sections (each an array of points with the same count) into a tube surface; optional caps. */
export function loft(sections: V3[][], opts: { capStart?: boolean; capEnd?: boolean; closed?: boolean } = {}): Mesh {
  const n = sections[0].length; const m = empty();
  for (const s of sections) { if (s.length !== n) throw new Error("loft: sections must have equal point counts"); m.v.push(...s); }
  const rings = sections.length; const closed = opts.closed ?? true;
  for (let r = 0; r < rings - 1; r++) {
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = (i + 1) % n; const a = r * n + i, b = r * n + j, c = (r + 1) * n + j, d = (r + 1) * n + i;
      m.f.push([a, b, c], [a, c, d]);
    }
  }
  if (opts.capStart) { const cIdx = m.v.length; m.v.push(centroid(sections[0])); for (let i = 0; i < n; i++) m.f.push([cIdx, (i + 1) % n, i]); }
  if (opts.capEnd) { const base = (rings - 1) * n; const cIdx = m.v.length; m.v.push(centroid(sections[rings - 1])); for (let i = 0; i < n; i++) m.f.push([cIdx, base + i, base + (i + 1) % n]); }
  return m;
}
export const centroid = (pts: V3[]): V3 => mul(pts.reduce((a, p) => add(a, p), [0, 0, 0] as V3), 1 / pts.length);

/** Revolve a 2D profile (r, z) around Z. */
export function revolve(profile: [number, number][], segments = 32, sweep = 2 * Math.PI, caps = true): Mesh {
  const sections: V3[][] = []; const full = Math.abs(sweep - 2 * Math.PI) < 1e-9;
  const segs = full ? segments : segments; const count = full ? segs : segs + 1;
  for (const [r, z] of profile) {
    const ring: V3[] = []; for (let i = 0; i < count; i++) { const a = (sweep * i) / segs; ring.push([r * Math.cos(a), r * Math.sin(a), z]); }
    sections.push(ring);
  }
  // transpose: loft along the profile with rings as sections
  const m = loft(sections, { closed: full, capStart: caps && profile[0][0] > 1e-6, capEnd: caps && profile[profile.length - 1][0] > 1e-6 });
  return m;
}

/** Ellipse-ish superellipse ring in a plane: rx, ry semi-axes, exponent e (2 = ellipse, higher = boxier), centre c, tilt about x. */
export function superRing(rx: number, ry: number, n: number, e = 2, c: V3 = [0, 0, 0], phase = 0): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n + phase; const ct = Math.cos(t), st = Math.sin(t);
    const x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / e) * rx, y = Math.sign(st) * Math.pow(Math.abs(st), 2 / e) * ry;
    pts.push([c[0] + x, c[1] + y, c[2]]);
  }
  return pts;
}

/** Vertex normals (area weighted). */
export function vertexNormals(m: Mesh): V3[] {
  const nrm: V3[] = m.v.map(() => [0, 0, 0]);
  for (const [a, b, c] of m.f) { const n = cross(sub(m.v[b], m.v[a]), sub(m.v[c], m.v[a])); for (const i of [a, b, c]) nrm[i] = add(nrm[i], n); }
  return nrm.map(norm);
}

/** Give an open surface a thickness: offset along vertex normals (inward) and stitch the boundary. */
export function shell(surface: Mesh, thickness: number): Mesh {
  surface = cleanMesh(surface);
  const n = vertexNormals(surface); const off = surface.v.length;
  const inner: V3[] = surface.v.map((p, i) => sub(p, mul(n[i], thickness)));
  const out: Mesh = { v: [...surface.v, ...inner], f: [...surface.f] };
  for (const [a, b, c] of surface.f) out.f.push([a + off, c + off, b + off]);
  // boundary edges: appear in exactly one face
  const count = new Map<string, [number, number]>();
  for (const [a, b, c] of surface.f) for (const [p, q] of [[a, b], [b, c], [c, a]] as [number, number][]) {
    const k = p < q ? `${p}-${q}` : `${q}-${p}`; if (count.has(k)) count.delete(k); else count.set(k, [p, q]);
  }
  for (const [p, q] of count.values()) out.f.push([p, q, q + off], [p, q + off, p + off]);
  return out;
}

/** Loop subdivision (one pass) for smooth organic surfaces; keeps the mesh closed if it was. */
export function subdivide(m: Mesh, passes = 1): Mesh {
  let cur = m;
  for (let p = 0; p < passes; p++) {
    const V = cur.v.map((x) => [...x] as V3); const F = cur.f; const edgeMid = new Map<string, number>();
    const adj = new Map<number, Set<number>>(); const edgeFaces = new Map<string, number[]>();
    const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    F.forEach(([a, b, c], fi) => { for (const [p1, p2] of [[a, b], [b, c], [c, a]]) { const k = key(p1, p2); (edgeFaces.get(k) ?? edgeFaces.set(k, []).get(k)!).push(fi); (adj.get(p1) ?? adj.set(p1, new Set()).get(p1)!).add(p2); (adj.get(p2) ?? adj.set(p2, new Set()).get(p2)!).add(p1); } });
    const nv: V3[] = [...V];
    const mid = (a: number, b: number): number => {
      const k = key(a, b); if (edgeMid.has(k)) return edgeMid.get(k)!;
      const faces = edgeFaces.get(k) ?? []; let pt: V3;
      if (faces.length === 2) { const opp: number[] = []; for (const fi of faces) for (const x of F[fi]) if (x !== a && x !== b) opp.push(x); pt = add(mul(add(V[a], V[b]), 3 / 8), mul(add(V[opp[0]], V[opp[1]]), 1 / 8)); }
      else pt = mul(add(V[a], V[b]), 0.5);
      nv.push(pt); edgeMid.set(k, nv.length - 1); return nv.length - 1;
    };
    // move old vertices
    const isBoundary = (a: number) => [...(adj.get(a) ?? [])].some((b) => (edgeFaces.get(key(a, b)) ?? []).length === 1);
    for (let i = 0; i < V.length; i++) {
      const nb = [...(adj.get(i) ?? [])]; const k = nb.length; if (!k) continue;
      if (isBoundary(i)) { const bn = nb.filter((b) => (edgeFaces.get(key(i, b)) ?? []).length === 1); if (bn.length === 2) nv[i] = add(mul(V[i], 3 / 4), mul(add(V[bn[0]], V[bn[1]]), 1 / 8)); continue; }
      const beta = k === 3 ? 3 / 16 : 3 / (8 * k); const sum = nb.reduce((s, b) => add(s, V[b]), [0, 0, 0] as V3);
      nv[i] = add(mul(V[i], 1 - k * beta), mul(sum, beta));
    }
    const nf: [number, number, number][] = [];
    for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    cur = { v: nv, f: nf };
  }
  return cur;
}

/** Exact uniform-solid tetrahedral integrals for a closed, consistently wound mesh.
 * Inertia is about the solid centroid, at density 1 kg/m³. Does not certify that
 * disconnected components do not overlap; such components must be boolean-unioned.
 */
export function massProperties(input: Mesh) {
  const m = orient(input);
  if (!meshTopology(m).closed) throw new Error("mass properties require a closed manifold mesh");
  const ref = centroid(m.v);
  let volume=0, area=0; const first: V3=[0,0,0];
  const second=Array.from({length:3},()=>[0,0,0]);
  for (const [a,b,c] of m.f) {
    const p=sub(m.v[a],ref), q=sub(m.v[b],ref), r=sub(m.v[c],ref);
    const dv=dot(p,cross(q,r))/6;
    volume+=dv; area+=len(cross(sub(q,p),sub(r,p)))/2;
    const sum=add(add(p,q),r);
    for(let i=0;i<3;i++) {
      first[i]+=dv*sum[i]/4;
      for(let j=0;j<3;j++) second[i][j]+=dv*(sum[i]*sum[j]+p[i]*p[j]+q[i]*q[j]+r[i]*r[j])/20;
    }
  }
  if (!(volume>1e-15)) throw new Error("mesh has no positive enclosed volume");
  const local=mul(first,1/volume), center=add(ref,local);
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) second[i][j]-=volume*local[i]*local[j];
  const inertia={ixx:second[1][1]+second[2][2],iyy:second[0][0]+second[2][2],izz:second[0][0]+second[1][1],
    ixy:-second[0][1],ixz:-second[0][2],iyz:-second[1][2]};
  return {volume,area,centroid:center,inertia};
}

/**
 * Make triangle winding consistent across the whole mesh and outward-facing. Adjacent triangles are
 * found by welding coincident vertices (so merged sub-meshes count as connected), oriented by flood
 * fill so every shared edge is traversed in opposite directions, then each connected component is
 * flipped if its signed volume is negative. Renderers cull back faces, so this is what keeps a plate's
 * front visible no matter how its rings were built.
 */
export function orient(m: Mesh): Mesh {
  m = cleanMesh(m);
  const cid = m.v.map((_, i) => i); // cleanMesh already welded at the declared tolerance
  const edgeTris = new Map<string, number[]>(); const ek = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  m.f.forEach((f, t) => { for (let i = 0; i < 3; i++) { const k = ek(cid[f[i]], cid[f[(i + 1) % 3]]); (edgeTris.get(k) ?? edgeTris.set(k, []).get(k)!).push(t); } });
  const faces = m.f.map((f) => [...f] as [number, number, number]); const seen = new Array(faces.length).fill(false);
  const hasDirected = (f: [number, number, number], a: number, b: number) => { for (let i = 0; i < 3; i++) if (cid[f[i]] === a && cid[f[(i + 1) % 3]] === b) return true; return false; };
  for (let s0 = 0; s0 < faces.length; s0++) {
    if (seen[s0]) continue; const comp: number[] = []; const stack = [s0]; seen[s0] = true;
    while (stack.length) {
      const t = stack.pop()!; comp.push(t); const f = faces[t];
      for (let i = 0; i < 3; i++) {
        const a = cid[f[i]], b = cid[f[(i + 1) % 3]];
        for (const u of edgeTris.get(ek(a, b)) ?? []) {
          if (seen[u]) continue; seen[u] = true;
          if (hasDirected(faces[u], a, b)) faces[u] = [faces[u][0], faces[u][2], faces[u][1]];   // neighbour must run the edge b->a
          stack.push(u);
        }
      }
    }
    let vol = 0; for (const t of comp) { const [a, b, c] = faces[t]; vol += dot(m.v[a], cross(m.v[b], m.v[c])) / 6; }
    if (vol < 0) for (const t of comp) faces[t] = [faces[t][0], faces[t][2], faces[t][1]];
  }
  return { v: m.v, f: faces };
}

export function bbox(m: Mesh): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of m.v) for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
  return { min, max };
}

/** ASCII STL (metres or any unit the caller scaled to). */
export function toStlAscii(m: Mesh, name = "part", unitScale = 1): string {
  const out = [`solid ${name}`];
  for (const [a, b, c] of m.f) {
    const n = norm(cross(sub(m.v[b], m.v[a]), sub(m.v[c], m.v[a])));
    out.push(`  facet normal ${n[0].toFixed(6)} ${n[1].toFixed(6)} ${n[2].toFixed(6)}`, `    outer loop`);
    for (const i of [a, b, c]) out.push(`      vertex ${(m.v[i][0] * unitScale).toFixed(5)} ${(m.v[i][1] * unitScale).toFixed(5)} ${(m.v[i][2] * unitScale).toFixed(5)}`);
    out.push(`    endloop`, `  endfacet`);
  }
  out.push(`endsolid ${name}`); return out.join("\n") + "\n";
}
/** Binary STL as a Buffer (compact; what we ship in repos and load in MuJoCo/three). */
export function toStlBinary(m: Mesh, unitScale = 1): Uint8Array {
  const buf = new ArrayBuffer(84 + m.f.length * 50); const dv = new DataView(buf);
  dv.setUint32(80, m.f.length, true); let o = 84;
  for (const [a, b, c] of m.f) {
    const n = norm(cross(sub(m.v[b], m.v[a]), sub(m.v[c], m.v[a])));
    for (const x of n) { dv.setFloat32(o, x, true); o += 4; }
    for (const i of [a, b, c]) for (const x of m.v[i]) { dv.setFloat32(o, x * unitScale, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}
