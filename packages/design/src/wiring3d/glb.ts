// The electronics and harness as one binary glTF (GLB) at the home pose, in metres, Z up turned to glTF's Y up:
// a node per part (its meshes by material) and a node per wire (a tube of its insulation diameter in its colour).
// Opens in Blender, three.js editors, Windows 3D Viewer and most CAD viewers.
import type { RobotSpecification } from "@ttr/robot-schema";
import { fk } from "../kin.ts";
import type { Wiring3D } from "./wires.ts";
import { add, sub, scale, cross, unit, len, perp, type V3 } from "./geom.ts";

const PBR: Record<string, [number, number, number, number, number]> = {
  pcb_green: [0.12, 0.48, 0.23, 0.1, 0.55], pcb_blue: [0.11, 0.31, 0.66, 0.1, 0.55], pcb_red: [0.7, 0.15, 0.12, 0.1, 0.55], pcb_black: [0.11, 0.12, 0.13, 0.1, 0.5], pcb_purple: [0.36, 0.16, 0.53, 0.1, 0.55], pcb_teal: [0.06, 0.49, 0.55, 0.1, 0.55],
  ic: [0.09, 0.09, 0.09, 0.2, 0.45], gold: [0.83, 0.69, 0.22, 0.9, 0.28], silver: [0.79, 0.8, 0.82, 0.85, 0.3], header: [0.07, 0.07, 0.07, 0.05, 0.7], plastic_black: [0.1, 0.1, 0.1, 0.05, 0.6],
  plastic_white: [0.95, 0.95, 0.95, 0.05, 0.5], plastic_red: [0.84, 0.15, 0.24, 0.05, 0.5], plastic_orange: [0.95, 0.54, 0.1, 0.05, 0.5], plastic_blue: [0.18, 0.44, 0.82, 0.05, 0.5], plastic_yellow: [0.95, 0.76, 0, 0.05, 0.5],
  plastic_grey: [0.72, 0.74, 0.76, 0.05, 0.55], metal: [0.6, 0.63, 0.65, 0.8, 0.35], copper: [0.77, 0.42, 0.17, 0.9, 0.3], cell_blue: [0.16, 0.37, 0.65, 0.15, 0.4], cell_teal: [0.18, 0.66, 0.75, 0.15, 0.4],
  rubber: [0.13, 0.13, 0.13, 0, 0.9], lens: [0.13, 0.16, 0.2, 0.3, 0.1],
};
const WIRE: Record<string, [number, number, number]> = { red: [0.84, 0.15, 0.24], black: [0.15, 0.15, 0.15], yellow: [0.95, 0.76, 0], blue: [0.12, 0.44, 0.82], white: [0.95, 0.95, 0.95], green: [0.16, 0.62, 0.23], orange: [0.95, 0.54, 0.1], violet: [0.56, 0.27, 0.68], grey: [0.55, 0.55, 0.55], gray: [0.55, 0.55, 0.55], brown: [0.55, 0.35, 0.17] };

type Tf = { R: number[][]; p: V3 };
const toWorld = (T: Tf, p: V3): V3 => [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.p[i] * 1000) as V3;
/** robot Z up to glTF Y up, mm to m */
const gl = (p: V3): V3 => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];

/** a tube round a polyline: `sides` faces, radius r (mm) */
export function tube(pts: V3[], r: number, sides = 8): { v: number[]; f: number[] } {
  const v: number[] = [], f: number[] = [];
  if (pts.length < 2) return { v, f };
  let u = perp(unit(sub(pts[1], pts[0])));
  for (let i = 0; i < pts.length; i++) {
    const d = unit(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    // parallel transport of the frame along the wire, so the tube does not twist
    u = unit(sub(u, scale(d, u[0] * d[0] + u[1] * d[1] + u[2] * d[2]))); if (len(u) < 1e-6) u = perp(d);
    const w = cross(d, u);
    for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2; v.push(...add(pts[i], add(scale(u, Math.cos(a) * r), scale(w, Math.sin(a) * r)))); }
    if (i) for (let k = 0; k < sides; k++) { const a = (i - 1) * sides + k, b = (i - 1) * sides + ((k + 1) % sides); f.push(a, b, b + sides, a, b + sides, a + sides); }
  }
  return { v, f };
}

export function electronicsGlb(spec: RobotSpecification, h: Wiring3D): Uint8Array {
  const f = fk(spec);
  const bufs: Uint8Array[] = []; let off = 0;
  const accessors: unknown[] = [], views: unknown[] = [], meshes: unknown[] = [], nodes: unknown[] = [], materials: unknown[] = [];
  const matIx = new Map<string, number>();
  const material = (name: string, c: [number, number, number], metal: number, rough: number) => { if (!matIx.has(name)) { matIx.set(name, materials.length); materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: metal, roughnessFactor: rough } }); } return matIx.get(name)!; };
  const push = (data: Uint8Array, target: number) => { const pad = (4 - (data.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: data.length, target }); bufs.push(data); if (pad) bufs.push(new Uint8Array(pad)); off += data.length + pad; return views.length - 1; };
  const prim = (v: number[], fi: number[], mat: number) => {
    const pos = new Float32Array(v.length); const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    // to the micrometre first: the browser's and Node's trigonometry differ in the last bit, the file must not
    for (let i = 0; i < v.length; i += 3) { const q = gl([v[i], v[i + 1], v[i + 2]]).map((x) => Math.fround(Math.round(x * 1e6) / 1e6)); pos.set(q, i); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }
    const idx = new Uint32Array(fi);
    accessors.push({ bufferView: push(new Uint8Array(pos.buffer), 34962), componentType: 5126, count: v.length / 3, type: "VEC3", min: lo, max: hi });
    accessors.push({ bufferView: push(new Uint8Array(idx.buffer), 34963), componentType: 5125, count: fi.length, type: "SCALAR" });
    return { attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1, material: mat };
  };
  // parts at home: each model's vertices through its link frame and its frame in the link
  for (const p of h.parts) {
    const L = f.link[p.link]; if (!L) continue;
    const T = p.T, prims = [];
    for (const m of p.model.meshes) {
      const v: number[] = [];
      for (let i = 0; i < m.v.length; i += 3) { const x = m.v[i], y = m.v[i + 1], z = m.v[i + 2]; const q: V3 = [T[0] * x + T[1] * y + T[2] * z + T[3], T[4] * x + T[5] * y + T[6] * z + T[7], T[8] * x + T[9] * y + T[10] * z + T[11]]; v.push(...toWorld(L, q)); }
      const [r, g, b, metal, rough] = PBR[m.mat] ?? [0.5, 0.5, 0.5, 0.1, 0.6];
      prims.push(prim(v, m.f, material(m.mat, [r, g, b], metal, rough)));
    }
    if (!prims.length) continue;
    meshes.push({ name: p.inst, primitives: prims }); nodes.push({ name: p.inst, mesh: meshes.length - 1, extras: { key: p.key, link: p.link } });
  }
  for (const w of h.wires) {
    const pts = w.pts.map((q) => toWorld(f.link[q.link], q.p)), t = tube(pts, w.od_mm / 2, 8);
    if (!t.f.length) continue;
    meshes.push({ name: w.id, primitives: [prim(t.v, t.f, material(`wire_${w.color}`, WIRE[w.color] ?? [0.5, 0.5, 0.5], 0.05, 0.45))] });
    nodes.push({ name: `${w.id} ${w.net}`, mesh: meshes.length - 1, extras: { net: w.net, from: w.from, to: w.to, awg: w.awg, typical_a: w.typical_a, peak_a: w.peak_a, cut_mm: w.cut_mm } });
  }
  const bin = new Uint8Array(off); { let o = 0; for (const b of bufs) { bin.set(b, o); o += b.length; } }
  const json = { asset: { version: "2.0", generator: "Text to Robot electronics3d" }, scene: 0, scenes: [{ name: `${spec.robot_name} electronics and harness`, nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; if (jp) { const t = new Uint8Array(js.length + jp); t.set(js); t.fill(0x20, js.length); js = t; }
  const out = new Uint8Array(12 + 8 + js.length + 8 + bin.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); out.set(bin, 28 + js.length);
  return out;
}
