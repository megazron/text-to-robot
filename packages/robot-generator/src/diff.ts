import type { RobotSpecification, Link } from "@ttr/robot-schema";

export interface SpecDiff { lines: string[]; changed: boolean; }

function linkLen(l: Link): number | undefined {
  if (l.geometry.type === "cylinder" || l.geometry.type === "capsule") return l.geometry.length;
  if (l.geometry.type === "box") return l.geometry.size[2];
  if (l.geometry.type === "sphere") return l.geometry.radius;
  if (l.geometry.type === "mesh") return l.geometry.bbox.max[2]-l.geometry.bbox.min[2];
  return undefined;
}

export function diffSpecs(a: RobotSpecification, b: RobotSpecification): SpecDiff {
  const lines: string[] = [];
  const aL = new Map(a.links.map((l) => [l.name, l]));
  const bL = new Map(b.links.map((l) => [l.name, l]));
  const aJ = new Set(a.joints.map((j) => j.name));
  const bJ = new Set(b.joints.map((j) => j.name));

  for (const name of bL.keys()) if (!aL.has(name)) lines.push(`+ Added link: ${name}`);
  for (const name of aL.keys()) if (!bL.has(name)) lines.push(`- Removed link: ${name}`);
  for (const name of bJ) if (!aJ.has(name)) lines.push(`+ Added joint: ${name}`);
  for (const name of aJ) if (!bJ.has(name)) lines.push(`- Removed joint: ${name}`);

  for (const [name, la] of aL) {
    const lb = bL.get(name); if (!lb) continue;
    const da = linkLen(la), db = linkLen(lb);
    if (da !== undefined && db !== undefined && Math.abs(da - db) > 1e-6)
      lines.push(`~ ${name} length: ${da.toFixed(3)}m -> ${db.toFixed(3)}m`);
    if (Math.abs(la.mass - lb.mass) > 1e-6)
      lines.push(`~ ${name} mass: ${la.mass.toFixed(3)}kg -> ${lb.mass.toFixed(3)}kg`);
    if (la.geometry.type !== lb.geometry.type)
      lines.push(`~ ${name} geometry: ${la.geometry.type} -> ${lb.geometry.type}`);
  }
  for (const [name, ja] of new Map(a.joints.map((j) => [j.name, j]))) {
    const jb = b.joints.find((j) => j.name === name); if (!jb) continue;
    if (ja.type !== jb.type) lines.push(`~ ${name} type: ${ja.type} -> ${jb.type}`);
  }
  return { lines, changed: lines.length > 0 };
}
