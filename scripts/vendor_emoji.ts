// Vendors the emoji outlines a shape shell is inflated from (packages/design/src/emoji-outlines.ts).
//
// For every single-codepoint emoji of the groups below (Unicode's emoji-test.txt), the Twemoji SVG
// (https://github.com/jdecked/twemoji, graphics CC-BY 4.0) is drawn at 128 px, its silhouette filled (holes closed),
// traced and simplified to at most 32 points on a 0-63 grid, with its main colour. Only that compact vector outline is
// kept: no SVG and no picture is in the repository. The Twemoji version and the licence are written into the file.
//
//   node scripts/vendor_emoji.ts <emoji-test.txt> <cache dir for the SVGs>
// (the SVGs are fetched from the jsDelivr CDN into the cache dir; run it again to reuse them)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const TWEMOJI = "17.0.2";
const GROUPS = new Set(["Smileys & Emotion", "Animals & Nature", "Food & Drink", "Travel & Places", "Activities", "Objects", "Symbols"]);
// sub-groups that are not shapes (signs, letters, arrows, clocks, keycaps, zodiac, geometric signs and the like)
const SKIP_SUB = /^(?:arrow|av-symbol|religion|zodiac|math|punctuation|currency|other-symbol|keycap|alphanum|geometric|warning|transport-sign|time|face-hand|cat-face|monkey-face|emotion|person|hand|family)$/;
const [testFile, cache] = process.argv.slice(2);
if (!testFile || !cache) { console.error("usage: node scripts/vendor_emoji.ts <emoji-test.txt> <cache dir>"); process.exit(2); }
mkdirSync(cache, { recursive: true });

interface Entry { cp: string; char: string; name: string; group: string; sub: string }
const entries: Entry[] = [];
let group = "", sub = "";
for (const line of readFileSync(testFile, "utf8").split("\n")) {
  if (line.startsWith("# group: ")) { group = line.slice(9).trim(); continue; }
  if (line.startsWith("# subgroup: ")) { sub = line.slice(12).trim(); continue; }
  const m = line.match(/^([0-9A-F ]+?)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/);
  if (!m || !GROUPS.has(group) || SKIP_SUB.test(sub)) continue;
  const cps = m[1].trim().split(/\s+/).filter((c) => c !== "FE0F");
  if (cps.length !== 1) continue;   // single codepoints only: no skin tones, no sequences, no flags
  entries.push({ cp: cps[0].toLowerCase(), char: m[2], name: m[3].trim().toLowerCase(), group, sub });
}

/** the silhouette as a 128 x 128 mask (alpha > 50 %), holes filled, with the mean colour of the drawn pixels */
async function silhouette(svg: Buffer): Promise<{ mask: Uint8Array; colour: [number, number, number] }> {
  const N = 128, { data } = await sharp(svg, { density: 400 }).resize(N, N, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(N * N), rgb = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < N * N; i++) if (data[i * 4 + 3] > 127) { mask[i] = 1; for (let k = 0; k < 3; k++) rgb[k] += data[i * 4 + k]; n++; }
  // holes: background not reached from the border is inside
  const out = new Uint8Array(N * N), stack: number[] = [];
  for (let i = 0; i < N; i++) for (const p of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!mask[p] && !out[p]) { out[p] = 1; stack.push(p); }
  while (stack.length) { const p = stack.pop()!, x = p % N, y = (p - x) / N; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; const q = Y * N + X; if (!mask[q] && !out[q]) { out[q] = 1; stack.push(q); } } }
  for (let i = 0; i < N * N; i++) mask[i] = out[i] ? 0 : 1;
  return { mask, colour: rgb.map((v) => +(v / Math.max(1, n) / 255).toFixed(2)) as [number, number, number] };
}

/** outer boundaries of the mask's pieces (Moore tracing), largest first, pieces under 8 % of the largest dropped */
function outlines(mask: Uint8Array, N = 128): [number, number][][] {
  const seen = new Uint8Array(N * N), at = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && mask[y * N + x] === 1;
  const pieces: { pts: [number, number][]; area: number }[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!at(x, y) || seen[y * N + x] || at(x - 1, y)) continue;
    // the piece's pixels (flood) and its area
    const stack = [y * N + x]; let area = 0; seen[y * N + x] = 1;
    while (stack.length) { const p = stack.pop()!, px = p % N, py = (p - px) / N; area++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = px + dx, Y = py + dy; if (at(X, Y) && !seen[Y * N + X]) { seen[Y * N + X] = 1; stack.push(Y * N + X); } } }
    // Moore neighbour tracing from the piece's top-left pixel, clockwise
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const pts: [number, number][] = [[x, y]]; let cx = x, cy = y, d = 6;
    for (let step = 0; step < 4 * N * N; step++) {
      let moved = false;
      for (let k = 0; k < 8; k++) { const dd = (d + 6 + k) % 8, X = cx + dirs[dd][0], Y = cy + dirs[dd][1]; if (at(X, Y)) { cx = X; cy = Y; d = dd; moved = true; break; } }
      if (!moved || (cx === x && cy === y)) break;
      pts.push([cx, cy]);
    }
    pieces.push({ pts, area });
  }
  pieces.sort((a, b) => b.area - a.area);
  return pieces.filter((p) => p.area >= 0.08 * pieces[0].area && p.pts.length >= 3).slice(0, 4).map((p) => p.pts);
}

/** Ramer-Douglas-Peucker on a closed outline, the tolerance raised until it has at most `max` points */
function simplify(pts: [number, number][], max = 32): [number, number][] {
  const rdp = (p: [number, number][], eps: number): [number, number][] => {
    if (p.length < 3) return p;
    const [a, b] = [p[0], p[p.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let worst = 0, idx = 0;
    for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > worst) { worst = d; idx = i; } }
    return worst > eps ? [...rdp(p.slice(0, idx + 1), eps).slice(0, -1), ...rdp(p.slice(idx), eps)] : [a, b];
  };
  // split the loop at its farthest point from the start so both halves are open chains
  let far = 0; for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  for (let eps = 0.8; ; eps *= 1.25) {
    const out = [...rdp(pts.slice(0, far + 1), eps).slice(0, -1), ...rdp([...pts.slice(far), pts[0]], eps).slice(0, -1)];
    if (out.length <= max) return out;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const rows: string[] = [];
let got = 0;
for (const e of entries) {
  const file = join(cache, `${e.cp}.svg`);
  if (!existsSync(file)) {
    const r = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI}/assets/svg/${e.cp}.svg`);
    if (!r.ok) { console.error(`no Twemoji for ${e.char} ${e.name} (${e.cp})`); continue; }
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const { mask, colour } = await silhouette(readFileSync(file));
  const loops = outlines(mask).map((l) => simplify(l));
  if (!loops.length) continue;
  // each point on a 0-63 grid as two base64url characters' worth: one character for x, one for y
  const enc = loops.map((l) => l.map(([x, y]) => B64[Math.min(63, Math.round(x / 2))] + B64[Math.min(63, Math.round(y / 2))]).join("")).join(" ");
  rows.push(`  [${JSON.stringify(e.char)}, ${JSON.stringify(e.name.replace(/^(?:a |an |the )/, ""))}, ${JSON.stringify(enc)}, ${JSON.stringify(colour.map((c) => Math.round(c * 99)).join(","))}],`);
  got++;
}
const out = `// Emoji outlines for shape shells, generated by scripts/vendor_emoji.ts from Twemoji ${TWEMOJI}
// (https://github.com/jdecked/twemoji): Copyright 2020 Twitter, Inc and other contributors, graphics licensed under
// CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changed: each emoji is reduced to its filled silhouette, traced
// and simplified to at most 32 points per piece, and its mean colour; nothing else of the artwork is kept. See NOTICE.md.
// Do not edit by hand.
//
// [emoji, CLDR name, outlines (pieces split by spaces; each point two characters of B64 below, x then y, on a 0-63 grid
// with y down), mean colour (r,g,b x 99)]
export const EMOJI_B64 = ${JSON.stringify(B64)};
export const EMOJI_OUTLINES: [string, string, string, string][] = [
${rows.join("\n")}
];
`;
writeFileSync(new URL("../packages/design/src/emoji-outlines.ts", import.meta.url), out);
console.log(`${got} of ${entries.length} emoji, ${out.length} bytes`);
