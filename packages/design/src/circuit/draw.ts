// A small display list for the circuit drawings, written out as SVG and as PDF from the same items, so both files show
// exactly the same picture. Text is measured with the Helvetica metrics (Arial and Liberation Sans share them), which is
// what lets the layout check know where every label really ends.

export type Pt = [number, number];
export type Data = Record<string, string>;
/** Path commands: M x y, L x y, C x1 y1 x2 y2 x y, Z. */
export type Cmd = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];
interface Base { cls?: string; data?: Data; title?: string; }
export type Item =
  | (Base & { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; w: number; dash?: string; cap?: "round" | "butt" })
  | (Base & { t: "poly"; pts: Pt[]; stroke: string; w: number; fill?: string; close?: boolean; round?: number; cap?: "round" | "butt"; outline?: string })
  | (Base & { t: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill?: string; stroke?: string; sw?: number })
  | (Base & { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number })
  | (Base & { t: "path"; d: Cmd[]; fill?: string; stroke?: string; sw?: number })
  | (Base & { t: "text"; x: number; y: number; s: string; size: number; anchor?: "start" | "middle" | "end"; bold?: boolean; fill?: string; rot?: 0 | -90 });

// Helvetica and Helvetica-Bold advance widths for ASCII 32..126, per 1000 em (Adobe core font metrics)
const W_REG = [278,278,355,556,556,889,667,222,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,222,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,278,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,278,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
/** Width of a string in px at `size`. */
export function textWidth(s: string, size: number, bold = false): number {
  const t = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of s) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? t[c - 32] : 556; }
  return (w * size) / 1000;
}
/** Ink box of a text item: ascender 0.75 em above the baseline, descender 0.22 em below. */
export function textBox(it: Extract<Item, { t: "text" }>): Box {
  const w = textWidth(it.s, it.size, it.bold), a = it.anchor ?? "start";
  const x0 = a === "start" ? 0 : a === "middle" ? -w / 2 : -w;
  if (it.rot === -90) return { x: it.x - it.size * 0.75, y: it.y - x0 - w, w: it.size * 0.97, h: w };
  return { x: it.x + x0, y: it.y - it.size * 0.75, w, h: it.size * 0.97 };
}
export interface Box { x: number; y: number; w: number; h: number; }
export const overlaps = (a: Box, b: Box, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
export const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
export const union = (bs: Box[]): Box => { const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y)), x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (x: number) => String(+x.toFixed(2));
const attrs = (it: Base) => (it.cls ? ` class="${it.cls}"` : "") + (it.data ? Object.entries(it.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("") : "");
const title = (it: Base) => (it.title ? `<title>${esc(it.title)}</title>` : "");
function close(tag: string, it: Base, a: string) { return it.title ? `<${tag}${a}${attrs(it)}>${title(it)}</${tag}>` : `<${tag}${a}${attrs(it)}/>`; }

/** Rounded polyline as path commands (corner radius r, clipped to half of the shorter neighbouring segment). */
export function roundedPath(pts: Pt[], r: number): Cmd[] {
  if (pts.length < 3 || r <= 0) return pts.map((p, i) => [i ? "L" : "M", p[0], p[1]] as Cmd);
  const out: Cmd[] = [["M", pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]), k = Math.min(r, la / 2, lc / 2);
    const p1: Pt = [b[0] + ((a[0] - b[0]) * k) / la, b[1] + ((a[1] - b[1]) * k) / la], p2: Pt = [b[0] + ((c[0] - b[0]) * k) / lc, b[1] + ((c[1] - b[1]) * k) / lc];
    out.push(["L", p1[0], p1[1]], ["C", (p1[0] + b[0]) / 2, (p1[1] + b[1]) / 2, (p2[0] + b[0]) / 2, (p2[1] + b[1]) / 2, p2[0], p2[1]]);
  }
  out.push(["L", pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}
const pathD = (d: Cmd[]) => d.map((c) => c[0] + c.slice(1).map((v) => n(v as number)).join(" ")).join("");

export class Doc {
  items: Item[] = [];
  w: number; h: number; font: string;
  constructor(w: number, h: number, font = "Helvetica, Arial, 'Liberation Sans', sans-serif") { this.w = w; this.h = h; this.font = font; }
  add<T extends Item>(it: T): T { this.items.push(it); return it; }
  line(x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1, o: Partial<Extract<Item, { t: "line" }>> = {}) { return this.add({ t: "line", x1, y1, x2, y2, stroke, w, ...o }); }
  rect(x: number, y: number, w: number, h: number, o: Partial<Extract<Item, { t: "rect" }>> = {}) { return this.add({ t: "rect", x, y, w, h, ...o }); }
  circle(cx: number, cy: number, r: number, o: Partial<Extract<Item, { t: "circle" }>> = {}) { return this.add({ t: "circle", cx, cy, r, ...o }); }
  poly(pts: Pt[], stroke: string, w = 1, o: Partial<Extract<Item, { t: "poly" }>> = {}) { return this.add({ t: "poly", pts, stroke, w, ...o }); }
  path(d: Cmd[], o: Partial<Extract<Item, { t: "path" }>> = {}) { return this.add({ t: "path", d, ...o }); }
  text(x: number, y: number, s: string, size: number, o: Partial<Extract<Item, { t: "text" }>> = {}) { return this.add({ t: "text", x, y, s, size, ...o }); }

  svg(meta?: { title: string; desc?: string; json?: unknown }): string {
    const o: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(this.w)} ${n(this.h)}" width="${n(this.w)}" height="${n(this.h)}" font-family="${esc(this.font)}">`];
    if (meta) {
      o.push(`<title>${esc(meta.title)}</title>`);
      if (meta.desc) o.push(`<desc>${esc(meta.desc)}</desc>`);
      if (meta.json !== undefined) o.push(`<metadata id="ttr-circuit">${esc(JSON.stringify(meta.json))}</metadata>`);
    }
    for (const it of this.items) {
      if (it.t === "line") o.push(close("line", it, ` x1="${n(it.x1)}" y1="${n(it.y1)}" x2="${n(it.x2)}" y2="${n(it.y2)}" stroke="${it.stroke}" stroke-width="${n(it.w)}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ""}${it.cap ? ` stroke-linecap="${it.cap}"` : ""}`));
      else if (it.t === "poly") {
        const common = ` fill="${it.fill ?? "none"}" stroke-linejoin="round"${it.cap ? ` stroke-linecap="${it.cap}"` : ""}`;
        const geom = it.round ? ` d="${pathD(roundedPath(it.pts, it.round))}"` : ` points="${it.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(" ")}"`;
        const tag = it.round ? "path" : it.close ? "polygon" : "polyline";
        if (it.outline) o.push(`<${tag}${geom} fill="none" stroke="${it.outline}" stroke-width="${n(it.w + 1.6)}" stroke-linejoin="round"${it.cap ? ` stroke-linecap="${it.cap}"` : ""}/>`);
        o.push(close(tag, it, `${geom} stroke="${it.stroke}" stroke-width="${n(it.w)}"${common}`));
      } else if (it.t === "rect") o.push(close("rect", it, ` x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${it.rx ? ` rx="${n(it.rx)}"` : ""} fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.sw ?? 1)}"` : ""}`));
      else if (it.t === "circle") o.push(close("circle", it, ` cx="${n(it.cx)}" cy="${n(it.cy)}" r="${n(it.r)}" fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.sw ?? 1)}"` : ""}`));
      else if (it.t === "path") o.push(close("path", it, ` d="${pathD(it.d)}" fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.sw ?? 1)}" stroke-linejoin="round"` : ""}`));
      else {
        const a = it.anchor && it.anchor !== "start" ? ` text-anchor="${it.anchor}"` : "";
        const r = it.rot ? ` transform="rotate(${it.rot} ${n(it.x)} ${n(it.y)})"` : "";
        o.push(`<text x="${n(it.x)}" y="${n(it.y)}" font-size="${n(it.size)}"${a}${it.bold ? ` font-weight="700"` : ""}${it.fill && it.fill !== "#000000" ? ` fill="${it.fill}"` : ""}${r}${attrs(it)}>${title(it)}${esc(it.s)}</text>`);
      }
    }
    o.push("</svg>");
    return o.join("\n") + "\n";
  }

  /** The same drawing as a one-page PDF (base-14 Helvetica, no embedded fonts), 1 px = 1 pt. */
  pdf(meta: { title: string }): Uint8Array {
    const H = this.h, ops: string[] = [];
    const col = (hex: string | undefined) => { const h = (hex ?? "#000000").replace("#", ""); const v = h.length === 3 ? h.split("").map((c) => c + c) : h.match(/../g)!; return v.slice(0, 3).map((x) => n(parseInt(x, 16) / 255)).join(" "); };
    const live = (c?: string) => !!c && c !== "none";
    const paint = (fill?: string, stroke?: string, w?: number) => {
      if (live(fill)) ops.push(`${col(fill)} rg`);
      if (live(stroke)) ops.push(`${col(stroke)} RG ${n(w ?? 1)} w`);
      ops.push(live(fill) && live(stroke) ? "B" : live(fill) ? "f" : live(stroke) ? "S" : "n");
    };
    const P = (x: number, y: number) => `${n(x)} ${n(H - y)}`;
    const cmds = (d: Cmd[]) => { for (const c of d) ops.push(c[0] === "M" ? `${P(c[1], c[2])} m` : c[0] === "L" ? `${P(c[1], c[2])} l` : c[0] === "C" ? `${P(c[1], c[2])} ${P(c[3], c[4])} ${P(c[5], c[6])} c` : "h"); };
    const pstr = (s: string) => "(" + [...s].map((ch) => { const c = ch.charCodeAt(0); if (ch === "(" || ch === ")" || ch === "\\") return "\\" + ch; if (c >= 32 && c <= 126) return ch; const map: Record<string, number> = { "·": 0xb7, "×": 0xd7, "°": 0xb0, "µ": 0xb5, "–": 0x96 }; return map[ch] ? "\\" + map[ch].toString(8).padStart(3, "0") : "?"; }).join("") + ")";
    ops.push("1 J 1 j");
    for (const it of this.items) {
      if (it.t === "line") { ops.push(`${col(it.stroke)} RG ${n(it.w)} w ${it.dash ? `[${it.dash.replace(/,/g, " ")}] 0 d ` : ""}${it.cap === "butt" ? "0 J " : ""}${P(it.x1, it.y1)} m ${P(it.x2, it.y2)} l S${it.dash ? " [] 0 d" : ""}${it.cap === "butt" ? " 1 J" : ""}`); }
      else if (it.t === "poly") {
        const d: Cmd[] = it.round ? roundedPath(it.pts, it.round) : it.pts.map((p, i) => [i ? "L" : "M", p[0], p[1]] as Cmd);
        if (it.close) d.push(["Z"]);
        if (it.outline) { cmds(d); paint(undefined, it.outline, it.w + 1.6); }
        cmds(d); paint(it.fill, it.stroke, it.w);
      } else if (it.t === "rect") {
        const r = Math.min(it.rx ?? 0, it.w / 2, it.h / 2);
        if (r > 0) { const k = 0.5523 * r, x0 = it.x, y0 = it.y, x1 = it.x + it.w, y1 = it.y + it.h; cmds([["M", x0 + r, y0], ["L", x1 - r, y0], ["C", x1 - r + k, y0, x1, y0 + r - k, x1, y0 + r], ["L", x1, y1 - r], ["C", x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1], ["L", x0 + r, y1], ["C", x0 + r - k, y1, x0, y1 - r + k, x0, y1 - r], ["L", x0, y0 + r], ["C", x0, y0 + r - k, x0 + r - k, y0, x0 + r, y0], ["Z"]]); }
        else ops.push(`${P(it.x, it.y + it.h)} ${n(it.w)} ${n(it.h)} re`);
        paint(it.fill, it.stroke, it.sw);
      } else if (it.t === "circle") {
        const { cx, cy, r } = it, k = 0.5523 * r;
        cmds([["M", cx + r, cy], ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r], ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy], ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r], ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy], ["Z"]]);
        paint(it.fill, it.stroke, it.sw);
      } else if (it.t === "path") { cmds(it.d); paint(it.fill, it.stroke, it.sw); }
      else {
        const w = textWidth(it.s, it.size, it.bold), a = it.anchor ?? "start", dx = a === "start" ? 0 : a === "middle" ? -w / 2 : -w;
        const m = it.rot === -90 ? `0 1 -1 0 ${P(it.x, it.y)} Tm ${n(dx)} 0 Td` : `1 0 0 1 ${n(it.x + dx)} ${n(H - it.y)} Tm`;
        ops.push(`BT ${col(it.fill)} rg /${it.bold ? "F2" : "F1"} ${n(it.size)} Tf ${m} ${pstr(it.s)} Tj ET`);
      }
    }
    const stream = ops.join("\n");
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.w)} ${n(this.h)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      `<< /Title ${pstr(meta.title)} /Producer (Text to Robot) >>`,
    ];
    let out = "%PDF-1.4\n";
    const offs: number[] = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
