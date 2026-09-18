// Deterministic part registry: a MeshGeometry names a generator + params; anyone
// (server, exporters, CAD, tests) can rebuild the identical mesh from that recipe.
import { type Mesh, massProperties, bbox, translate, rotate, scale as scaleMesh, orient } from "./core.ts";
import { curvedPlate, limbShell, dome, disc, superArc, shelledLoft } from "./shapes.ts";
import * as helmet from "./helmet.ts";

export type Params = Record<string, number | string>;
type Gen = (p: Params) => Mesh;
const num = (p: Params, k: string, d: number) => (typeof p[k] === "number" ? (p[k] as number) : d);
const str = (p: Params, k: string, d: string) => (typeof p[k] === "string" ? (p[k] as string) : d);

/** curved chest/back/ab plate: a rounded-rectangle outline wrapped on a cylinder of radius R */
function armourPlate(p: Params): Mesh {
  const w = num(p, "w", 0.30), h = num(p, "h", 0.30), t = num(p, "t", 0.006), R = num(p, "R", 0.22), corner = num(p, "corner", 0.03), taper = num(p, "taper", 0.0);
  const pts: [number, number][] = []; const n = 6;
  const wTop = w * (1 - taper), wBot = w;
  const corners: [number, number, number][] = [[wBot / 2, -h / 2, 1], [wTop / 2, h / 2, 1], [-wTop / 2, h / 2, 1], [-wBot / 2, -h / 2, 1]];
  // rounded corners via arcs
  const arcs = [[-Math.PI / 2, 0], [0, Math.PI / 2], [Math.PI / 2, Math.PI], [Math.PI, 1.5 * Math.PI]];
  corners.forEach(([cx, cy], i) => { const sx = Math.sign(cx) || 1, sy = Math.sign(cy) || 1; for (let k = 0; k <= n; k++) { const a = arcs[i][0] + ((arcs[i][1] - arcs[i][0]) * k) / n; pts.push([cx - sx * corner + corner * Math.cos(a), cy - sy * corner + corner * Math.sin(a)]); } });
  return curvedPlate(pts, t, R, Math.min(0.004, t / 2), 0);
}

export const PARTS: Record<string, Gen> = {
  // ---- helmet (1:1, motorised-kit layout) ----
  helmet_cranium: () => helmet.cranium(), helmet_crown_panel: () => helmet.crownPanel(), helmet_forehead_plate: () => helmet.foreheadPlate(),
  helmet_faceplate: () => helmet.faceplate(), helmet_chin_guard: () => helmet.chinGuard(), helmet_neck_collar: () => helmet.neckCollar(),
  helmet_cheek_panel: (p) => helmet.cheekPanel(str(p, "side", "left") as "left" | "right"),
  helmet_eye_lens: (p) => helmet.eyeLens(str(p, "side", "left") as "left" | "right"),
  helmet_eye_socket: (p) => helmet.eyeSocket(str(p, "side", "left") as "left" | "right"),
  helmet_mouth_line: () => helmet.mouthLine(),
  helmet_ear_pod: (p) => helmet.earPod(str(p, "side", "left") as "left" | "right"),
  // ---- body armour ----
  armour_plate: armourPlate,
  limb_shell: (p) => limbShell(num(p, "length", 0.3), num(p, "rTop", 0.08), num(p, "rBottom", 0.06), {
    e: num(p, "e", 2.8), a0: num(p, "a0", -Math.PI), a1: num(p, "a1", Math.PI), thick: num(p, "thick", 0.005), bulge: num(p, "bulge", 0.06), rings: 7, n: 28, smooth: num(p, "smooth", 1) }),
  dome: (p) => dome(num(p, "radius", 0.09), num(p, "height", 0.06), 28, 6, num(p, "thick", 0.005)),
  disc: (p) => disc(num(p, "radius", 0.03), num(p, "depth", 0.012), num(p, "chamfer", 0.003)),
  /** chest plate: a pectoral shell lofted from angular sections (upper chest wider, tapering to the sternum) */
  chest_plate: (p) => {
    const w = num(p, "w", 0.36), h = num(p, "h", 0.30), d = num(p, "d", 0.10), t = num(p, "t", 0.006);
    const a0 = num(p, "a0", -1.25), a1 = num(p, "a1", 1.25);   // angular span: a half (0..1.25) makes a hinged chest door
    const rows: [number, number, number][] = [[0, 0.62, 0.55], [0.18, 0.85, 0.80], [0.38, 1.0, 1.0], [0.55, 1.0, 1.08], [0.72, 0.98, 1.06], [0.88, 0.90, 0.95], [1.0, 0.80, 0.85]]; // z-frac, width-frac, depth-frac (pectoral bulge at 0.55–0.72)
    const sections = rows.map(([zf, wf, df]) => superArc(d * df, (w / 2) * wf, -h / 2 + h * zf, a0, a1, 25, 2.6));
    return shelledLoft(sections, t, 1);
  },
};

export function buildPart(g: { part: string; params?: Params; scale?: [number, number, number] }): Mesh {
  const gen = PARTS[g.part]; if (!gen) throw new Error(`unknown mesh part '${g.part}'`);
  const m = orient(gen(g.params ?? {}));   // consistent outward winding for every part (renderers cull back faces)
  return g.scale ? scaleMesh(m, g.scale) : m;
}

/** Build a MeshGeometry recipe with precomputed mass properties (solid volume, unit-density inertia, bbox). */
export function meshGeometry(part: string, file: string, params: Params = {}, scale?: [number, number, number]) {
  const m = buildPart({ part, params, scale });
  const mp = massProperties(m); const bb = bbox(m);
  return { type: "mesh" as const, part, params, file, ...(scale ? { scale } : {}), volume: Math.max(mp.volume, 1e-9), inertia_unit: mp.inertia, bbox: bb, centroid: mp.centroid };
}

export const listParts = () => Object.keys(PARTS);
