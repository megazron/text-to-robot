// Native STL mesh generation (no OpenSCAD needed). Triangulates the primitive
// geometry of every link, in millimetres, and writes ASCII STL: one file per
// part plus a full assembly placed at the zero pose. Also a printability report.
import type { RobotSpecification, Geometry, Link } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { forwardKinematics, poseToMat, multiply, type Mat4 } from "@ttr/kinematics";
import { buildPart } from "@ttr/mesh";

type V3 = [number, number, number];
type Tri = [V3, V3, V3];

const xf = (m: Mat4, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
  m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
  m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
];

function boxTris(sx: number, sy: number, sz: number): Tri[] {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const P: V3[] = [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
  const F: [number, number, number, number][] = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,4,7,3]];
  const out: Tri[] = [];
  for (const [a, b, c, d] of F) { out.push([P[a], P[b], P[c]]); out.push([P[a], P[c], P[d]]); }
  return out;
}
function cylTris(r: number, h: number, n = 32): Tri[] {
  const out: Tri[] = []; const z0 = -h / 2, z1 = h / 2;
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
    const p0: V3 = [r * Math.cos(a0), r * Math.sin(a0), z0], p1: V3 = [r * Math.cos(a1), r * Math.sin(a1), z0];
    const q0: V3 = [p0[0], p0[1], z1], q1: V3 = [p1[0], p1[1], z1];
    out.push([p0, p1, q1], [p0, q1, q0]);            // side
    out.push([[0, 0, z0], p1, p0]);                  // bottom cap
    out.push([[0, 0, z1], q0, q1]);                  // top cap
  }
  return out;
}
function sphereTris(r: number, seg = 24, rings = 12, zOff = 0, phiStart = 0, phiEnd = Math.PI): Tri[] {
  const out: Tri[] = [];
  const pt = (t: number, p: number): V3 => [r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p) + zOff];
  for (let i = 0; i < rings; i++) {
    const p0 = phiStart + ((phiEnd - phiStart) * i) / rings, p1 = phiStart + ((phiEnd - phiStart) * (i + 1)) / rings;
    for (let j = 0; j < seg; j++) {
      const t0 = (2 * Math.PI * j) / seg, t1 = (2 * Math.PI * (j + 1)) / seg;
      out.push([pt(t0, p0), pt(t0, p1), pt(t1, p1)], [pt(t0, p0), pt(t1, p1), pt(t1, p0)]);
    }
  }
  return out;
}
function capsuleTris(r: number, h: number): Tri[] {
  return [...cylTris(r, h), ...sphereTris(r, 24, 6, h / 2, 0, Math.PI / 2), ...sphereTris(r, 24, 6, -h / 2, Math.PI / 2, Math.PI)];
}
export function geometryTris(g: Geometry): Tri[] {
  switch (g.type) {
    case "mesh": { const m = buildPart(g); return m.f.map(([a, b, c]) => [m.v[a], m.v[b], m.v[c]] as Tri); }
    case "box": return boxTris(g.size[0], g.size[1], g.size[2]);
    case "cylinder": return cylTris(g.radius, g.length);
    case "sphere": return sphereTris(g.radius);
    case "capsule": return capsuleTris(g.radius, g.length);
  }
}

function normal(t: Tri): V3 {
  const u: V3 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
  const v: V3 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
  const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l];
}
const f = (x: number) => (x * 1000).toFixed(4); // metres -> mm

export function trisToStl(name: string, tris: Tri[]): string {
  const out: string[] = [`solid ${name}`];
  for (const t of tris) {
    const n = normal(t);
    out.push(`  facet normal ${n[0].toFixed(6)} ${n[1].toFixed(6)} ${n[2].toFixed(6)}`, `    outer loop`);
    for (const v of t) out.push(`      vertex ${f(v[0])} ${f(v[1])} ${f(v[2])}`);
    out.push(`    endloop`, `  endfacet`);
  }
  out.push(`endsolid ${name}`);
  return out.join("\n") + "\n";
}

/** part mesh in the link frame (includes the visual origin offset) */
export function linkStl(l: Link): string {
  const m = poseToMat(l.origin);
  return trisToStl(safeName(l.name), geometryTris(l.geometry).map((t) => t.map((v) => xf(m, v)) as Tri));
}

/** whole robot at the zero pose */
export function assemblyStl(spec: RobotSpecification): string {
  const world = forwardKinematics(spec, {});
  const tris: Tri[] = [];
  for (const l of spec.links) {
    const w = world.get(l.name); if (!w) continue;
    const m = multiply(w, poseToMat(l.origin));
    for (const t of geometryTris(l.geometry)) tris.push(t.map((v) => xf(m, v)) as Tri);
  }
  return trisToStl(safeName(spec.robot_name), tris);
}

export interface PrintIssue { part: string; level: "warn" | "info"; message: string; }
export interface PrintabilityReport { build_volume_mm: number; issues: PrintIssue[]; parts: { name: string; bbox_mm: [number, number, number]; fits: boolean }[]; }

/** Heuristic FDM printability checks (build volume, thin features, huge parts). */
export function printabilityReport(spec: RobotSpecification, buildVolumeMm = 220): PrintabilityReport {
  const issues: PrintIssue[] = []; const parts: PrintabilityReport["parts"] = [];
  for (const l of spec.links) {
    const g = l.geometry;
    const dims: [number, number, number] = g.type === "box" ? [g.size[0], g.size[1], g.size[2]]
      : g.type === "sphere" ? [2 * g.radius, 2 * g.radius, 2 * g.radius]
      : g.type === "mesh" ? [g.bbox.max[0] - g.bbox.min[0], g.bbox.max[1] - g.bbox.min[1], g.bbox.max[2] - g.bbox.min[2]]
      : [2 * g.radius, 2 * g.radius, g.length + (g.type === "capsule" ? 2 * g.radius : 0)];
    const mm = dims.map((d) => +(d * 1000).toFixed(1)) as [number, number, number];
    const fits = Math.max(...mm) <= buildVolumeMm;
    parts.push({ name: l.name, bbox_mm: mm, fits });
    if (!fits) issues.push({ part: l.name, level: "warn", message: `longest dimension ${Math.max(...mm)} mm exceeds the ${buildVolumeMm} mm build volume — split the part or print diagonally` });
    if (Math.min(...mm) < 3) issues.push({ part: l.name, level: "warn", message: `thinnest dimension ${Math.min(...mm)} mm is below 3 mm — fragile on FDM; thicken or print in resin/metal` });
    if (g.type === "sphere") issues.push({ part: l.name, level: "info", message: "sphere needs supports or a flat-cut base to print" });
  }
  if (!issues.length) issues.push({ part: "*", level: "info", message: "all parts fit the build volume with no thin features" });
  return { build_volume_mm: buildVolumeMm, issues, parts };
}

export function generateStlFiles(spec: RobotSpecification): Record<string, string | Uint8Array> {
  const name = safeName(spec.robot_name);
  const files: Record<string, string | Uint8Array> = {};
  files[`cad/stl/${name}_assembly.stl`] = assemblyStl(spec);
  for (const l of spec.links) files[`cad/stl/parts/${safeName(l.name)}.stl`] = linkStl(l);
  const rep = printabilityReport(spec);
  files[`cad/PRINTABILITY.md`] = `# Printability — ${spec.robot_name}\n\nBuild volume assumed: ${rep.build_volume_mm} mm cube (typical desktop FDM).\n\n| Part | Bounding box (mm) | Fits |\n|---|---|:-:|\n` +
    rep.parts.map((p) => `| ${p.name} | ${p.bbox_mm.join(" × ")} | ${p.fits ? "✅" : "❌"} |`).join("\n") +
    `\n\n## Notes\n` + rep.issues.map((i) => `- ${i.level === "warn" ? "⚠️" : "ℹ️"} **${i.part}**: ${i.message}`).join("\n") + "\n";
  return files;
}
