// Deterministic part registry: a MeshGeometry names a generator + params; anyone
// (server, exporters, CAD, tests) can rebuild the identical mesh from that recipe.
import { type Mesh, massProperties, bbox, translate, rotate, scale as scaleMesh, orient } from "./core.ts";
import { curvedPlate, limbShell, dome, disc, ring, superArc, shelledLoft } from "./shapes.ts";
import { torsoSide, limbInset, chestSurfacePanel, armourPanel, sculptedLimb, shoulderShell, bootShell } from "./mark43.ts";
import { mountingPlate } from "./mechanical.ts";
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
  mounting_plate: p => mountingPlate(num(p,"width",.16),num(p,"height",.12),num(p,"thickness",.003),num(p,"bore",.0034),num(p,"inset",.01),num(p,"vents",0)),
  mark43_torso_side: p => torsoSide(num(p,"side",1)),
  mark43_chest: p => chestSurfacePanel(num(p,"side",1),str(p,"section","lower")==="upper"),
  mark43_boot: p => bootShell(p.section==="inset"),
  mark43_panel: p => armourPanel(str(p,"style","sternum"),num(p,"w",.1),num(p,"h",.1),num(p,"t",.004),num(p,"R",.3)),
  mark43_limb_inset: p => limbInset(num(p,"length",.3),num(p,"rTop",.1),num(p,"rBottom",.08),str(p,"style","thigh"),num(p,"a0",-.6),num(p,"a1",.6),num(p,"u0",.1),num(p,"u1",.9),num(p,"offset",.002)),
  mark43_limb: p => sculptedLimb(num(p,"length",.3),num(p,"rTop",.1),num(p,"rBottom",.08),num(p,"a0",-1),num(p,"a1",3.6),num(p,"thick",.005),str(p,"style","thigh")),
  mark43_shoulder: p => shoulderShell(num(p,"side",1),p.section==="edge"),
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
  ring: (p) => ring(num(p,"outer",.08),num(p,"inner",.07),num(p,"height",.03)),
  /** chest plate: a pectoral shell lofted from angular sections (upper chest wider, tapering to the sternum) */
  chest_plate: (p) => {
    const w = num(p, "w", 0.36), h = num(p, "h", 0.30), d = num(p, "d", 0.10), t = num(p, "t", 0.006);
    const a0 = num(p, "a0", -1.25), a1 = num(p, "a1", 1.25);   // angular span: a half (0..1.25) makes a hinged chest door
    const rows: [number, number, number][] = [[0, 0.62, 0.74], [0.18, 0.73, 0.88], [0.38, 0.85, 0.98], [0.55, 0.96, 1.02], [0.72, 1.0, 1.0], [0.88, 0.97, 0.95], [1.0, 0.82, 0.85]];
    const sections = rows.map(([zf, wf, df]) => superArc(d * df, (w / 2) * wf, -h / 2 + h * zf, a0, a1, 25, 3.6));
    return shelledLoft(sections, t, 0);
  },
};

export function buildPart(g: { part: string; params?: Params; scale?: [number, number, number]; vertices?: Mesh["v"]; triangles?: Mesh["f"] }): Mesh {
  if(g.part==="indexed_mesh") {
    if(!Array.isArray(g.vertices)||!Array.isArray(g.triangles)||g.vertices.length<4||g.vertices.length>50000||g.triangles.length<4||g.triangles.length>100000)
      throw new Error("indexed_mesh requires 4–50000 vertices and 4–100000 triangles");
    if(g.vertices.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)) ||
      g.triangles.some(f=>!Array.isArray(f)||f.length!==3||f.some(i=>!Number.isInteger(i)||i<0||i>=g.vertices!.length)))
      throw new Error("invalid indexed_mesh coordinates or triangle indices");
    const m=orient({v:g.vertices,f:g.triangles});
    return g.scale ? scaleMesh(m,g.scale) : m;
  }
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
