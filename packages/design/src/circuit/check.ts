// Checks on a finished drawing. layoutProblems: nothing overlaps (symbols, labels, texts), no wire runs through a
// symbol or a text, wires of different nets never share a run or touch end to side, everything is inside the frame.
// netlistFromSvg: reads the connectivity back out of the SVG geometry alone (pin ends, wire runs, junction dots, labels
// and power symbols with the same name), so a test can hold it against the wiring record.
import { textBox, type Box, type Doc, type Item, type Pt } from "./draw.ts";

const inside = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d });
const hit = (a: Box, b: Box) => a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function itemBox(it: Item): Box | null {
  if (it.t === "rect") return { x: it.x, y: it.y, w: it.w, h: it.h };
  if (it.t === "circle") return { x: it.cx - it.r, y: it.cy - it.r, w: 2 * it.r, h: 2 * it.r };
  if (it.t === "line") return { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1) };
  if (it.t === "poly") { const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
  if (it.t === "path") { const xs: number[] = [], ys: number[] = []; for (const c of it.d) for (let i = 1; i + 1 < c.length; i += 2) { xs.push(c[i] as number); ys.push(c[i + 1] as number); } return xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : null; }
  return textBox(it);
}
/** segment (axis-parallel or not) against a box interior */
function segHits(a: Pt, b: Pt, r: Box): boolean {
  if (r.w <= 0 || r.h <= 0) return false;
  // Liang-Barsky clip
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r.x], [dx, r.x + r.w - a[0]], [-dy, a[1] - r.y], [dy, r.y + r.h - a[1]]] as [number, number][]) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6;
}
const onSeg = (p: Pt, a: Pt, b: Pt, e = 0.01) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < e * Math.hypot(b[0] - a[0], b[1] - a[1]) + e && p[0] >= Math.min(a[0], b[0]) - e && p[0] <= Math.max(a[0], b[0]) + e && p[1] >= Math.min(a[1], b[1]) - e && p[1] <= Math.max(a[1], b[1]) + e;
const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;

/** Every overlap or bad crossing in a drawing; empty when the layout is clean. */
export function layoutProblems(doc: Doc, o: { margin?: number } = {}): string[] {
  const out: string[] = [], m = o.margin ?? 20;
  const groups = new Map<string, Box[]>(), texts: { box: Box; g?: string; s: string }[] = [];
  const segs: { a: Pt; b: Pt; net: string; kind: string; g?: string }[] = [];
  const pinEnds: { at: Pt; net: string; id: string }[] = [];
  for (const it of doc.items) {
    const cls = it.cls ?? "", g = it.data?.g;
    if (cls.includes("frame")) continue;
    if (it.t === "text") { texts.push({ box: textBox(it), g, s: it.s }); continue; }
    if (cls.split(" ").includes("wire") && it.t === "poly") { for (let i = 1; i < it.pts.length; i++) segs.push({ a: it.pts[i - 1], b: it.pts[i], net: it.data?.node ?? "?", kind: "wire" }); continue; }
    if (cls === "pin" && it.t === "line") { const id = it.data?.pin ?? "?"; segs.push({ a: [it.x1, it.y1], b: [it.x2, it.y2], net: `pin:${id}`, kind: "pin", g: it.data?.sym }); pinEnds.push({ at: [it.x2, it.y2], net: it.data?.node ?? id, id }); continue; }
    if (!g) continue;
    const b = itemBox(it); if (b) groups.set(g, [...(groups.get(g) ?? []), b]);
  }
  const gbox = [...groups].map(([g, bs]) => { const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y)); return { g, box: { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 } }; });
  const W = doc.w, H = doc.h;
  const off = (b: Box) => b.x < m - 0.5 || b.y < m - 0.5 || b.x + b.w > W - m + 0.5 || b.y + b.h > H - m + 0.5;
  for (const { g, box } of gbox) if (off(box)) out.push(`${g} outside the frame`);
  for (const t of texts) if (t.g !== "frame" && off(t.box)) out.push(`text "${t.s}" outside the frame`);
  // groups never overlap each other
  for (let i = 0; i < gbox.length; i++) for (let j = i + 1; j < gbox.length; j++) if (hit(inside(gbox[i].box, 0.5), inside(gbox[j].box, 0.5))) out.push(`${gbox[i].g} overlaps ${gbox[j].g}`);
  // texts never overlap each other, nor a group other than their own
  const ts = [...texts].sort((a, b) => a.box.x - b.box.x);
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length && ts[j].box.x < ts[i].box.x + ts[i].box.w; j++) if (hit(inside(ts[i].box, 0.3), inside(ts[j].box, 0.3))) out.push(`text "${ts[i].s}" overlaps text "${ts[j].s}"`);
  for (const t of texts) for (const { g, box } of gbox) if (g !== t.g && hit(inside(t.box, 0.3), box)) out.push(`text "${t.s}" (${t.g}) overlaps ${g}`);
  // wires and pins: not through a group (other than a pin's own symbol, which it only touches) nor through a text
  for (const s of segs) {
    for (const { g, box } of gbox) if (segHits(s.a, s.b, inside(box, 1.5))) out.push(`${s.kind} ${s.net} runs through ${g}`);
    for (const t of texts) if (segHits(s.a, s.b, inside(t.box, 0.5))) out.push(`${s.kind} ${s.net} runs through text "${t.s}"`);
  }
  // wires of different nets: no shared run, no end on another's side
  const wires = segs.filter((s) => s.kind === "wire");
  for (let i = 0; i < wires.length; i++) for (let j = i + 1; j < wires.length; j++) {
    const a = wires[i], b = wires[j]; if (a.net === b.net) continue;
    const colA = a.a[1] === a.b[1], colB = b.a[1] === b.b[1];
    if (colA === colB && (colA ? a.a[1] === b.a[1] : a.a[0] === b.a[0])) {
      const k = colA ? 0 : 1, lo = Math.max(Math.min(a.a[k], a.b[k]), Math.min(b.a[k], b.b[k])), hi = Math.min(Math.max(a.a[k], a.b[k]), Math.max(b.a[k], b.b[k]));
      if (hi - lo > 0.01) { out.push(`wires ${a.net} and ${b.net} share a run`); continue; }
    }
    for (const p of [a.a, a.b]) if (onSeg(p, b.a, b.b)) out.push(`wire ${a.net} ends on wire ${b.net}`);
    for (const p of [b.a, b.b]) if (onSeg(p, a.a, a.b)) out.push(`wire ${b.net} ends on wire ${a.net}`);
  }
  for (const p of pinEnds) for (const s of wires) if (s.net !== p.net && onSeg(p.at, s.a, s.b) && !same(p.at, s.a) && !same(p.at, s.b)) out.push(`wire ${s.net} passes over pin ${p.id}`);
  return [...new Set(out)];
}

const attr = (tag: string, k: string) => tag.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1];
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/**
 * Conductors read back from a schematic SVG: each is the set of record terminals (inst.port.pin) joined by the drawing.
 * Joins: a wire's own runs; a pin end or a label on a wire's end or corner; a pin end on a wire's side only with a junction
 * dot; labels and power symbols of the same name.
 */
export function netlistFromSvg(svg: string): string[][] {
  const tags = svg.match(/<(line|polyline|polygon|circle|path|text)\b[^>]*>/g) ?? [];
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while ((parent.get(r) ?? r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const key = (p: Pt) => `${+p[0].toFixed(2)},${+p[1].toFixed(2)}`;
  const runs: Pt[][] = [], dots: Pt[] = [], pins: { at: Pt; members: string[] }[] = [], anchors: { at: Pt; name: string }[] = [];
  for (const t of tags) {
    const cls = attr(t, "class") ?? "";
    if (/^<polyline/.test(t) && cls.split(" ").includes("wire")) runs.push(attr(t, "points")!.split(" ").map((p) => p.split(",").map(Number) as Pt));
    else if (/^<circle/.test(t) && cls === "junction") dots.push([+attr(t, "cx")!, +attr(t, "cy")!]);
    else if (/^<line/.test(t) && cls === "pin" && !attr(t, "data-nc")) { const id = unesc(attr(t, "data-pin")!), mem = attr(t, "data-members"); pins.push({ at: [+attr(t, "x2")!, +attr(t, "y2")!], members: mem ? unesc(mem).split("|") : [id] }); }
    else if (/ann (label|power)/.test(cls) && attr(t, "data-at")) { const [x, y] = attr(t, "data-at")!.split(",").map(Number); anchors.push({ at: [x, y], name: unesc(attr(t, "data-name")!) }); }
  }
  for (const r of runs) for (let i = 1; i < r.length; i++) join(key(r[i - 1]), key(r[i]));
  const vertex = new Set(runs.flatMap((r) => r.map(key)));
  const attach = (p: Pt) => { const k = key(p); if (vertex.has(k)) return; for (const r of runs) for (let i = 1; i < r.length; i++) if (onSeg(p, r[i - 1], r[i]) && dots.some((d) => same(d, p))) join(k, key(r[i])); };
  for (const p of pins) attach(p.at);
  for (const a of anchors) { attach(a.at); join(key(a.at), `name:${a.name}`); }
  const groups = new Map<string, Set<string>>();
  for (const p of pins) { const r = find(key(p.at)); const s = groups.get(r) ?? new Set(); for (const m of p.members) s.add(m); groups.set(r, s); }
  return [...groups.values()].map((s) => [...s].sort()).sort((a, b) => a[0].localeCompare(b[0]));
}
