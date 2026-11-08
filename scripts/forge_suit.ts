// Forges the Mark 43 armour pack with the same TypeScript code the website runs in its worker (packages/mesh/src/forge), and writes it.
//   node --max-old-space-size=8192 scripts/forge_suit.ts <out-base> [--voxel 2] [--bulk 1] [--shoulder 1] [--panels film|smooth|heavy]
// <out-base>.json and <out-base>.bin are the manifest and the quantised meshes (packages/parts/data/mark43_pack is the shipped cache).
import { writeFileSync } from "node:fs";
import Manifold from "manifold-3d";
import { forgeSuit } from "../packages/mesh/src/forge/suit.ts";

const args = process.argv.slice(2), out = args[0];
if (!out) { console.error("usage: forge_suit.ts <out-base> [--voxel 2] [--bulk 1] [--shoulder 1] [--panels film]"); process.exit(2); }
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i > 0 ? args[i + 1] : undefined; };
const mf = await Manifold(); mf.setup();
const params = { voxel: Number(opt("voxel") ?? 2), bulk: Number(opt("bulk") ?? 1), shoulder: Number(opt("shoulder") ?? 1), panels: (opt("panels") ?? "film") as "film" | "smooth" | "heavy" };
const t0 = Date.now();
let peak = 0;
const { manifest, bytes } = await forgeSuit(mf, params, (p) => { peak = Math.max(peak, process.memoryUsage().rss); if (args.includes("--progress")) console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${p.stage} ${p.detail}`); }, (s) => console.log(s));
writeFileSync(`${out}.json`, JSON.stringify(manifest));
writeFileSync(`${out}.bin`, bytes);
console.log(`${manifest.pieces.length} pieces, ${(bytes.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s, peak rss ${(peak / 1e9).toFixed(2)} GB`);
