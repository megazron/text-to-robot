// An emoji's outline as a shape for a shell: the silhouette (packages/design/src/emoji-outlines.ts, traced from Twemoji,
// CC-BY 4.0) inflated like a cushion: covered by discs (largest first, each as big as the outline allows), each disc an
// ellipsoid as thick as it is wide at the middle and thinner towards the edge, and touching discs joined by their hull.
// Deterministic; a few milliseconds per emoji, kept once worked out.
import { EMOJI_B64, EMOJI_OUTLINES } from "./emoji-outlines.ts";

export interface EmojiShape { char: string; name: string; pieces: [number, number][][]; colour: [number, number, number] }
let byChar: Map<string, EmojiShape> | undefined;
const strip = (s: string) => s.replace(/️/g, "");
function load(): Map<string, EmojiShape> {
  if (byChar) return byChar;
  byChar = new Map();
  for (const [char, name, enc, col] of EMOJI_OUTLINES) {
    const pieces = enc.split(" ").map((p) => { const out: [number, number][] = []; for (let i = 0; i + 1 < p.length; i += 2) out.push([EMOJI_B64.indexOf(p[i]) / 63, EMOJI_B64.indexOf(p[i + 1]) / 63]); return out; });
    byChar.set(strip(char), { char, name, pieces, colour: col.split(",").map((c) => +(Number(c) / 99).toFixed(2)) as [number, number, number] });
  }
  return byChar;
}
/** the emoji with an outline, by the emoji itself */
export const emojiShape = (char: string): EmojiShape | undefined => load().get(strip(char));
/** every emoji with an outline (for reading names in prompts) */
export const emojiShapes = (): EmojiShape[] => [...load().values()];

const inside = (pieces: [number, number][][], x: number, y: number) => pieces.some((p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
});

export interface Disc { u: number; v: number; r: number }
const discCache = new Map<string, { discs: Disc[]; links: [number, number][] }>();
/** Discs covering the outline (u right, v down, 0-1) and the pairs of them that touch inside it. */
export function emojiDiscs(e: EmojiShape): { discs: Disc[]; links: [number, number][] } {
  const hit = discCache.get(e.char); if (hit) return hit;
  const G = 48, inPx: boolean[] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) inPx.push(inside(e.pieces, (i + 0.5) / G, (j + 0.5) / G));
  const edge: [number, number][] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (!inPx[j * G + i] || i === 0 || j === 0 || i === G - 1 || j === G - 1 || !inPx[j * G + i - 1] || !inPx[j * G + i + 1] || !inPx[(j - 1) * G + i] || !inPx[(j + 1) * G + i]) if (!inPx[j * G + i]) edge.push([i, j]);
  // distance (pixels) from each inside pixel to the nearest outside one
  const dist = inPx.map((v, k) => { if (!v) return 0; const i = k % G, j = (k - i) / G; let d = Math.min(i + 0.5, j + 0.5, G - i - 0.5, G - j - 0.5); for (const [a, b] of edge) d = Math.min(d, Math.hypot(a - i, b - j)); return d; });
  const covered = inPx.map((v) => !v), discs: Disc[] = [];
  const total = inPx.filter(Boolean).length;
  for (let n = 0; n < 40; n++) {
    let best = -1;
    for (let k = 0; k < G * G; k++) if (!covered[k] && (best < 0 || dist[k] > dist[best])) best = k;
    if (best < 0 || dist[best] < 0.75) break;
    const i = best % G, j = (best - i) / G, r = dist[best];
    discs.push({ u: (i + 0.5) / G, v: (j + 0.5) / G, r: r / G });
    for (let k = 0; k < G * G; k++) { const a = k % G, b = (k - a) / G; if (Math.hypot(a - i, b - j) <= r) covered[k] = true; }
    if (covered.filter((c, k) => c && inPx[k]).length >= 0.96 * total) break;
  }
  // each disc joins its two nearest touching neighbours whose join stays inside the outline
  const links: [number, number][] = [];
  discs.forEach((d, a) => {
    const near = discs.map((o, b) => ({ b, s: Math.hypot(o.u - d.u, o.v - d.v) })).filter((x) => x.b !== a && x.s < 1.15 * (d.r + discs[x.b].r)).sort((x, y) => x.s - y.s).slice(0, 2);
    for (const { b } of near) {
      const o = discs[b], mid = inside(e.pieces, (d.u + o.u) / 2, (d.v + o.v) / 2);
      if (mid && !links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.push([a, b]);
    }
  });
  const out = { discs, links };
  discCache.set(e.char, out);
  return out;
}
