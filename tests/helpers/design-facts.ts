// Designs each prompt given and prints one line of JSON: { prompt: facts } with what tests/fidelity/design-variety.test.ts and
// design-quality.test.ts hold every robot to (run eight to a process: one process designing a hundred robots runs its CAD
// kernels out of WebAssembly memory).
import { createHash } from "node:crypto";
import { generateRobot } from "@ttr/robot-generator";
import { setDefaultRouter, fk } from "@ttr/design";
import { builtShape } from "../../packages/robot-generator/src/fidelity.ts";

setDefaultRouter("legacy");
type Design = { checks: { name: string; pass: boolean; detail: string }[]; printed: { name: string; check: { fits_bed: boolean; watertight: boolean } }[]; performance: Record<string, unknown> };
const out: Record<string, unknown> = {};
for (const p of JSON.parse(process.argv[2] ?? "[]") as string[]) {
  const r = await generateRobot(p), s = r.robot, d = (s.metadata as unknown as { design?: Design }).design;
  const look = (s.metadata as unknown as { look?: { silhouette: string; preset: string; palette: string; hub: string; colours: Record<string, string> } }).look;
  const mat = new Map(s.materials.map((m) => [m.name, m.color.slice(0, 3).map((c) => +c.toFixed(2))]));
  // the colours a person sees on the printed parts (bought parts keep theirs)
  const printed = new Set((d?.printed ?? []).map((x) => x.name));
  const colours = [...new Set(s.links.filter((l) => printed.has(l.name)).map((l) => JSON.stringify(mat.get(l.material ?? "") ?? [])))].sort();
  const shell = s.links.filter((l) => l.role === "shell").map((l) => l.name);
  const wheels = s.links.filter((l) => l.role === "wheel" && /_wheel$/.test(l.name)).map((l) => l.name);
  const hubs = wheels.filter((w) => s.joints.some((j) => j.parent === w && /_hub_cap$/.test(j.child)));
  // the silhouette's overall size, 1 cm steps, at the home pose
  const f = fk(s), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const l of s.links) { const T = f.link[l.name]; const g = l.geometry as { bbox?: { min: number[]; max: number[] } }; if (!T || !g.bbox) continue;
    for (const x of [g.bbox.min[0], g.bbox.max[0]]) for (const y of [g.bbox.min[1], g.bbox.max[1]]) for (const z of [g.bbox.min[2], g.bbox.max[2]]) for (let i = 0; i < 3; i++) { const v = T.R[i][0] * x + T.R[i][1] * y + T.R[i][2] * z + T.p[i]; lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); } }
  const size = [0, 1, 2].map((i) => Math.round((hi[i] - lo[i]) * 100));
  const b = builtShape(s), structure = { arms: b.arms.map((a) => a.dof), wheels: b.wheels, legs: b.legs, sensors: s.sensors.map((x) => x.type).sort() };
  const sig = createHash("sha256").update(JSON.stringify([look?.silhouette, look?.preset, colours, structure, size, shell.length])).digest("hex").slice(0, 16);
  const filament = (r.bom?.lines ?? []).filter((l: { category: string }) => l.category === "Printed structure").map((l: { name: string }) => l.name);
  out[p] = { sig, family: r.interpretation?.family, look, colours, shell, wheels, hubs, size, structure, filament,
    failing: (d?.checks ?? []).filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail.slice(0, 160)}`),
    unprintable: (d?.printed ?? []).filter((x) => /^shell|hub_cap/.test(x.name) && !(x.check.fits_bed && x.check.watertight)).map((x) => x.name),
    checks: (d?.checks ?? []).filter((c) => /^look:|^shell:/.test(c.name)).map((c) => c.name), valid: r.validation.valid && r.urdfValidation.valid };
}
console.log(JSON.stringify(out));
