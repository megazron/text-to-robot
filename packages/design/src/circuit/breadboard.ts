// Picture wiring diagram for beginners, in the spirit of Fritzing's breadboard view or Tinkercad Circuits: each part is
// drawn as it looks (board colour, chips, connectors, motor cans, servo horns, battery cells, lever splices), its pins are
// labelled on the part, and every wire of the wiring record is drawn once, in its own colour, pin to pin.
import { electrical } from "@ttr/parts";
import type { WiringRecord, WireRec } from "../wiring.ts";
import { Doc, textWidth, textBox, type Pt, type Box, union } from "./draw.ts";
import { symbolKind, shortName, shortPin, type Side } from "./model.ts";
import { Router, type Heading } from "./route.ts";

const G = 10, PITCH = 20, LEG = 10;
export const WIRE_HEX: Record<string, string> = { red: "#d7263d", black: "#262626", yellow: "#f2c200", blue: "#1f6fd1", white: "#f7f7f7", green: "#2a9d3a", orange: "#f28a1a", violet: "#8e44ad", grey: "#8c8c8c", gray: "#8c8c8c", brown: "#8b5a2b" };
const OUTLINE: Record<string, string> = { white: "#9a9a9a", yellow: "#a88600", black: "#000000" };
const snap = (v: number) => Math.round(v / G) * G;
const up = (v: number) => Math.ceil(v / G) * G;

interface BPin { term: string; name: string; side: Side; off: number; }
interface BPart { inst: string; key: string; role: string; kind: string; title: string; pins: BPin[]; col: number; x: number; y: number; w: number; h: number; }
export interface BreadboardResult { svg: string; pdf: Uint8Array; doc: Doc; unrouted: string[]; }

const isBand = (role: string) => ["battery", "psu", "switch", "protection", "regulator", "splice"].includes(role);
const colOf = (role: string) => (isBand(role) ? -1 : role === "sensor" || role === "indicator" ? 0 : role === "controller" ? 1 : role === "actuator" ? 3 : 2);

export function breadboard(w: WiringRecord, robot: string): BreadboardResult {
  // a sheet near A-paper proportions first; if a wire will not lay, more room, then the long single strip of parts
  let best: BreadboardResult | null = null;
  for (const [wrap, spread] of [["aspect", 1], ["aspect", 1.5], ["tall", 1], ["tall", 1.5], ["tall", 2]] as const) {
    const r = attempt(w, robot, spread, wrap);
    if (!best || r.unrouted.length < best.unrouted.length) best = r;
    if (!r.unrouted.length) break;
  }
  return best!;
}

function attempt(w: WiringRecord, robot: string, spread: number, wrap: "aspect" | "tall"): BreadboardResult {
  const keyOf = new Map(w.instances.map((i) => [i.name, i.key]));
  const roleOf = (i: string) => electrical(keyOf.get(i)!)?.role ?? "load";
  const wires: WireRec[] = w.cables.flatMap((c) => (c.premade ? c.wires.map((x) => ({ ...x, color: "grey", premade: c.premade })) : c.wires));
  // conductors: a wire's two ends, a splice's levers and pins of the same name on one part are one node
  const P = new Map<string, string>(), find = (x: string): string => { let r = x; while ((P.get(r) ?? r) !== r) r = P.get(r)!; P.set(x, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) P.set(ra, rb); };
  const nk = (t: string) => (roleOf(t.split(".")[0]) === "splice" ? `splice:${t.split(".")[0]}` : t);
  for (const x of wires) join(nk(x.from), nk(x.to));
  // parts
  const parts = new Map<string, BPart>();
  const terms = new Map<string, string[]>();
  for (const x of wires) for (const t of [x.from, x.to]) { const i = t.split(".")[0]; const l = terms.get(i) ?? []; if (!l.includes(t)) l.push(t); terms.set(i, l); }
  for (const i of w.instances) {
    const ts = terms.get(i.name); if (!ts) continue;
    const e = electrical(i.key)!; if (e.role === "carrier") continue;
    const kind = e.role === "splice" ? "splice" : symbolKind(i.key, e.role);
    parts.set(i.name, { inst: i.name, key: i.key, role: e.role, kind, title: shortName(i.key), pins: ts.map((t) => ({ term: t, name: shortPin(t.split(".")[2]), side: "left" as Side, off: 0 })), col: colOf(e.role), x: 0, y: 0, w: 0, h: 0 });
  }
  const list = [...parts.values()];
  const partnerOf = (t: string) => wires.filter((x) => x.from === t || x.to === t).map((x) => (x.from === t ? x.to : x.from).split(".")[0]);
  // band order: battery, then whatever it wires to in turn, then the rest
  const band = list.filter((p) => p.col === -1), bandOrder: BPart[] = [];
  const visit = (p: BPart) => { if (bandOrder.includes(p)) return; bandOrder.push(p); for (const t of p.pins) for (const o of partnerOf(t.term)) { const q = parts.get(o); if (q && q.col === -1) visit(q); } };
  for (const p of band.filter((q) => q.role === "battery" || q.role === "psu" || (q.role === "switch" && /iec/.test(q.key)))) visit(p);
  for (const p of band) visit(p);
  const bandIdx = (p: BPart) => bandOrder.indexOf(p);
  // pin sides: towards what each pin wires to
  for (const p of list) {
    for (const pin of p.pins) {
      const others = partnerOf(pin.term).map((o) => parts.get(o)!).filter(Boolean);
      const sc = others.reduce((a, q) => a + (q.col === -1 && p.col === -1 ? Math.sign(bandIdx(q) - bandIdx(p)) : 0), 0);
      if (p.col === -1) pin.side = others.some((q) => q.col !== -1) && !others.some((q) => q.col === -1) ? "bottom" : sc < 0 ? "left" : "right";
      else if (others.some((q) => q.col === -1)) pin.side = "top";
      else { const s = others.reduce((a, q) => a + Math.sign(q.col - p.col), 0); pin.side = s < 0 ? "left" : s > 0 ? "right" : p.role === "actuator" ? "left" : "right"; }
    }
    // the two terminals of an inline part face either way along the chain
    if ((p.kind === "fuse" || p.kind === "switch") && p.pins.length === 2) { p.pins[0].side = p.pins[0].side === "right" && p.pins[1].side === "right" ? "left" : p.pins[0].side; if (p.pins[0].side === p.pins[1].side) p.pins[1].side = p.pins[0].side === "left" ? "right" : "left"; }
    if (p.kind === "splice") { const n = p.pins.length; p.pins.forEach((x) => (x.side = n <= 1 ? "bottom" : x.side)); }
  }
  // sizes
  const BIG = new Set(["board", "ic", "regulator", "sensor", "module", "motor", "servo", "stepper", "psu"]);
  const MIN: Record<string, [number, number]> = { board: [200, 140], ic: [140, 90], regulator: [120, 70], sensor: [120, 70], motor: [120, 70], servo: [110, 70], stepper: [110, 90], battery: [150, 80], switch: [60, 50], fuse: [80, 30], inlet: [80, 70], psu: [170, 90], splice: [70, 40], led: [50, 50], module: [100, 70] };
  for (const p of list) {
    const by = (s: Side) => p.pins.filter((x) => x.side === s);
    const lw = Math.max(0, ...by("left").map((x) => textWidth(x.name, 8))), rw = Math.max(0, ...by("right").map((x) => textWidth(x.name, 8)));
    const tn = Math.max(0, ...by("top").map((x) => textWidth(x.name, 8))), bn = Math.max(0, ...by("bottom").map((x) => textWidth(x.name, 8)));
    const [mw, mh] = MIN[p.kind] ?? [100, 70];
    const titleW = Math.min(textWidth(p.title, 9, true), 200) + 24;
    const across = Math.max(by("top").length, by("bottom").length) * PITCH + 20;
    p.w = up(Math.max(mw, lw + rw + (BIG.has(p.kind) ? 90 : 50), across + lw + rw + 20, titleW));
    const rows = Math.max(by("left").length, by("right").length);
    p.h = up(Math.max(mh, rows * PITCH + 40, (tn ? tn + 12 : 0) + (bn ? bn + 12 : 0) + (BIG.has(p.kind) ? 80 : 30)));
    // side rows sit below the caption and the top pins' names, above the bottom pins' names
    const capIn = BIG.has(p.kind), topZ = (tn ? tn + 12 : 0) + (capIn ? 42 : 10), botZ = (bn ? bn + 12 : 0) + 10;
    p.h = up(Math.max(p.h, topZ + botZ + Math.max(0, rows - 1) * PITCH));
    const place = (xs: BPin[], a: number, b: number) => { const span = (xs.length - 1) * PITCH, s0 = snap((a + b) / 2 - span / 2); xs.forEach((x, i) => (x.off = Math.max(snap(a), s0) + i * PITCH)); };
    place(by("left"), topZ, p.h - botZ); place(by("right"), topZ, p.h - botZ); place(by("top"), 0, p.w); place(by("bottom"), 0, p.w);
  }
  // placement: the band across the top, then columns
  const gap = (n: number) => up((60 + n * G) * spread);
  let x = 60;
  const bandPins = (p: BPart) => p.pins.length;
  for (const p of bandOrder) { p.x = snap(x); p.y = 120 + up(30 * spread); x = p.x + p.w + gap(bandPins(p)); }
  const bandBottom = Math.max(120, ...bandOrder.map((p) => p.y + p.h)) + gap(Math.min(10, wires.filter((x2) => [x2.from, x2.to].some((t) => parts.get(t.split(".")[0])?.col === -1) && [x2.from, x2.to].some((t) => (parts.get(t.split(".")[0])?.col ?? -1) !== -1)).length / 3));
  const ncol = Math.max(0, ...list.map((p) => p.col + 1));
  // a very tall last column wraps
  const colsUsed = [...new Set(list.filter((p) => p.col >= 0).map((p) => p.col))].sort((a, b) => a - b);
  const remap = new Map(colsUsed.map((c, i) => [c, i]));
  for (const p of list) if (p.col >= 0) p.col = remap.get(p.col)!;
  let cols = colsUsed.length;
  if (cols) {
    const last = cols - 1, members = list.filter((p) => p.col === last), height = members.reduce((a, p) => a + p.h + gap(p.pins.length), 0);
    const other = Math.max(500, ...list.filter((p) => p.col >= 0 && p.col < last).map((p) => p.h + gap(p.pins.length)).reduce((a, h) => [a[0] + h], [0]));
    const colW = Math.max(...members.map((p) => p.w)) + 200, restW = list.filter((p) => p.col >= 0 && p.col < last).reduce((a, p) => Math.max(a, p.w), 0) * last + 400 * last;
    let k = 1, bestS = Infinity;
    if (wrap === "tall") k = Math.min(6, Math.max(1, Math.round(height / Math.max(other, 900))));
    else for (let kk = 1; kk <= 6; kk++) { const s2 = Math.max((restW + kk * colW) / Math.SQRT2, Math.max(other, height / kk) + 300); if (s2 < bestS - 1) { bestS = s2; k = kk; } }
    const per = Math.ceil(members.length / k);
    members.forEach((p, i) => (p.col = last + Math.floor(i / per)));
    cols = last + k;
  }
  void ncol;
  let cx = 60;
  for (let c = 0; c < cols; c++) {
    const ms = list.filter((p) => p.col === c);
    const crossing = wires.filter((x2) => { const a = parts.get(x2.from.split(".")[0]), b = parts.get(x2.to.split(".")[0]); return a && b && ((a.col <= c && b.col > c) || (b.col <= c && a.col > c) || ((a.col === -1) !== (b.col === -1) && (a.col === c || b.col === c))); }).length;
    const wmax = Math.max(0, ...ms.map((p) => p.w));
    let y = bandBottom;
    for (const p of ms) { const tops = p.pins.filter((q) => q.side === "top").length; y += gap(tops); p.x = snap(cx + (wmax - p.w) / 2); p.y = snap(y); y = p.y + p.h + 20; }
    cx += wmax + gap(crossing);
  }
  void cols;
  const all = union(list.map((p) => ({ x: p.x - 40, y: p.y - 40, w: p.w + 80, h: p.h + 80 })));
  const W = up(Math.max(all.x + all.w + 60, 900)), H = up(Math.max(all.y + all.h + 140, 600));
  const doc = new Doc(W, H);
  doc.rect(0, 0, W, H, { fill: "#f4f1ea" });
  // a faint grid like a bench mat
  for (let gx = 40; gx < W; gx += 40) doc.line(gx, 0, gx, H, "#e8e3d8", 0.6, { cls: "frame" });
  for (let gy = 40; gy < H; gy += 40) doc.line(0, gy, W, gy, "#e8e3d8", 0.6, { cls: "frame" });
  doc.text(30, 40, `${robot}: wiring picture`, 18, { bold: true, fill: "#222222", data: { g: "head" } });
  doc.text(30, 60, "Every wire of WIRING.md, in its colour, from pin to pin. Grey bundles are bought leads (USB, camera ribbon).", 10, { fill: "#555555", data: { g: "head" } });
  // legend
  const used = [...new Set(wires.map((x2) => x2.color))];
  let lx = 30;
  for (const c of used) { const label = c; doc.poly([[lx, 80], [lx + 24, 80]], WIRE_HEX[c] ?? "#888888", 4, { cap: "round", outline: OUTLINE[c] ?? shade(WIRE_HEX[c] ?? "#888888"), data: { g: "head" } }); doc.text(lx + 30, 84, label, 10, { fill: "#333333", data: { g: "head" } }); lx += 44 + textWidth(label, 10); }
  // routing
  const R = new Router(W, H, G);
  const nodeId = new Map<string, number>();
  const nid = (t: string) => { const r = find(nk(t)); if (!nodeId.has(r)) nodeId.set(r, nodeId.size); return nodeId.get(r)!; };
  const end = (p: BPart, x2: BPin): { at: Pt; root: Pt; out: Heading } => x2.side === "left" ? { at: [p.x - LEG, p.y + x2.off], root: [p.x, p.y + x2.off], out: 2 } : x2.side === "right" ? { at: [p.x + p.w + LEG, p.y + x2.off], root: [p.x + p.w, p.y + x2.off], out: 0 } : x2.side === "top" ? { at: [p.x + x2.off, p.y - LEG], root: [p.x + x2.off, p.y], out: 3 } : { at: [p.x + x2.off, p.y + p.h + LEG], root: [p.x + x2.off, p.y + p.h], out: 1 };
  for (const p of list) {
    R.block({ x: p.x - G, y: p.y - G, w: p.w + 2 * G, h: p.h + 2 * G });
    // each pin keeps its end and the two grid points in front of it, so no other wire seals it in
    for (const x2 of p.pins) { const e = end(p, x2), dv = [[1, 0], [0, 1], [-1, 0], [0, -1]][e.out]; for (let k2 = 0; k2 <= 2; k2++) R.reserve([e.at[0] + dv[0] * G * k2, e.at[1] + dv[1] * G * k2], nid(x2.term)); }
  }
  R.block({ x: 20, y: 20, w: Math.max(lx, 700), h: 80 });
  // captions over the small parts of the power row
  for (const p of list) if (["fuse", "switch", "splice", "led", "battery", "inlet"].includes(p.kind)) { const cw = Math.max(textWidth(p.title, 9, true), textWidth(p.inst, 8)) + 8, mw = Math.min(cw, Math.max(p.w + 40, 120) + 8); R.block({ x: p.x + p.w / 2 - mw / 2, y: p.y - 34, w: mw, h: 32 }); }
  const pinOf = (t: string) => { const p = parts.get(t.split(".")[0])!; return { p, x: p.pins.find((q) => q.term === t)! }; };
  // pins with several wires fan out first, then short wires before long ones
  const load = new Map<string, number>(); for (const x2 of wires) for (const t of [x2.from, x2.to]) load.set(t, (load.get(t) ?? 0) + 1);
  const order = [...wires].map((x2) => { const a = pinOf(x2.from), b = pinOf(x2.to), ea = end(a.p, a.x), eb = end(b.p, b.x); return { x2, ea, eb, fan: Math.max(load.get(x2.from)!, load.get(x2.to)!), d: Math.abs(ea.at[0] - eb.at[0]) + Math.abs(ea.at[1] - eb.at[1]) }; }).sort((a, b) => b.fan - a.fan || a.d - b.d);
  const routed: { x2: WireRec; path: Pt[] }[] = [], unrouted: string[] = [];
  for (const o of order) {
    const path = R.route(nid(o.x2.from), { at: o.ea.at, out: o.ea.out }, { at: o.eb.at, out: o.eb.out }, { bend: 4, cross: 2, limit: 200000 });
    if (path) routed.push({ x2: o.x2, path }); else unrouted.push(o.x2.id);
  }
  // parts, then wires over the bench, then wire ends
  for (const p of list) drawPart(doc, p, w);
  for (const p of list) for (const x2 of p.pins) {
    const e = end(p, x2);
    doc.line(e.root[0], e.root[1], e.at[0], e.at[1], "#b8962e", 3, { cls: "pin", data: { pin: x2.term, node: `N${nid(x2.term)}`, sym: p.inst }, cap: "butt", title: `${p.inst} ${x2.term.split(".").slice(1).join(" ")}` });
  }
  for (const { x2, path } of routed) {
    const hex = WIRE_HEX[x2.color] ?? "#888888", bundle = (x2 as WireRec & { premade?: string }).premade;
    doc.poly(path, hex, bundle ? 6 : 3.4, { cls: "wire", round: 6, cap: "round", outline: OUTLINE[x2.color] ?? shade(hex), data: { node: `N${nid(x2.from)}`, wire: x2.id }, title: `${x2.id} ${x2.net}: ${x2.from} to ${x2.to}${x2.awg ? `, ${x2.awg} AWG` : ""}${bundle ? ` (${bundle})` : ""}` });
  }
  for (const { path } of routed) for (const q of [path[0], path[path.length - 1]]) doc.circle(q[0], q[1], 2.6, { fill: "#c9c9c9", stroke: "#555555", sw: 0.8, cls: "end" });
  // a wire the router could not lay is still shown: a tag at each end naming the other
  let ui = 0;
  for (const id of unrouted) {
    const x2 = wires.find((q) => q.id === id)!;
    for (const [t, other] of [[x2.from, x2.to], [x2.to, x2.from]]) { const a = pinOf(t), e = end(a.p, a.x); const s = `${x2.id} to ${other.split(".")[0]} ${shortPin(other.split(".")[2])}`; const tw = textWidth(s, 8) + 8; const bx = e.out === 2 ? e.at[0] - tw : e.at[0]; doc.rect(bx, e.at[1] - 6, tw, 12, { fill: WIRE_HEX[x2.color] ?? "#888", stroke: "#333", sw: 0.6, data: { g: `U${++ui}` } }); doc.text(bx + 4, e.at[1] + 3, s, 8, { fill: x2.color === "black" ? "#ffffff" : "#111111", data: { g: `U${ui}` } }); }
  }
  const title = `${robot}: breadboard view`;
  return { svg: doc.svg({ title, desc: "Generated by Text to Robot from the robot's wiring record (design.wiring). Each wire carries data-wire, its colour is the wire colour in WIRING.md." }), pdf: doc.pdf({ title }), doc, unrouted };
}

function shade(hex: string): string { const v = hex.replace("#", "").match(/../g)!.map((h) => Math.round(parseInt(h, 16) * 0.6)); return `#${v.map((c) => c.toString(16).padStart(2, "0")).join("")}`; }
const PCB: Record<string, [string, string]> = {
  arduino: ["#0f7c8c", "#ffffff"], rpi: ["#2e8b4a", "#ffffff"], jetson: ["#2a2a2a", "#e6e6e6"], esp32: ["#1f1f1f", "#ffffff"], tb6612: ["#c0392b", "#ffffff"], pca9685: ["#1f4fa0", "#ffffff"],
  l298n: ["#c0392b", "#ffffff"], cytron: ["#b52020", "#ffffff"], tmc2209: ["#6a2c91", "#ffffff"], u2d2: ["#262626", "#ffffff"], waveshare: ["#1a5fb4", "#ffffff"], can: ["#333333", "#ffffff"], fe_urt: ["#1a5fb4", "#ffffff"],
  buck: ["#1f5fbf", "#ffffff"], dcdc: ["#9aa0a6", "#111111"], hc_sr04: ["#1f5fbf", "#ffffff"], bno085: ["#5b2a86", "#ffffff"], camera: ["#2e8b4a", "#ffffff"], lcd: ["#1f4fa0", "#ffffff"], ws2812: ["#1a1a1a", "#ffffff"],
};
function pcbFor(key: string): [string, string] { for (const [k, v] of Object.entries(PCB)) if (key.includes(k)) return v; if (/uno|nano/.test(key)) return PCB.arduino; return ["#2f6d3a", "#ffffff"]; }
const FUSE_COL: [number, string][] = [[2, "#9e9e9e"], [3, "#8e44ad"], [4, "#f48fb1"], [5, "#d2b48c"], [7.5, "#8b5a2b"], [10, "#d7263d"], [15, "#1f6fd1"], [20, "#f2c200"], [25, "#eeeeee"], [30, "#2a9d3a"]];

function drawPart(doc: Doc, p: BPart, w: WiringRecord) {
  const { x, y } = p, W = p.w, H = p.h, g = `P:${p.inst}`, d = { g };
  const k = p.kind, key = p.key;
  const T = (tx: number, ty: number, s: string, size: number, fill: string, o: { bold?: boolean; anchor?: "start" | "middle" | "end"; rot?: 0 | -90 } = {}) => doc.text(tx, ty, s, size, { fill, data: d, ...o });
  let ink = "#ffffff", body = "#333333";
  const wOf = (sd: Side) => Math.max(0, ...p.pins.filter((q) => q.side === sd).map((q) => textWidth(q.name.length > 14 ? `${q.name.slice(0, 13)}.` : q.name, 8)));
  const tz = wOf("top") ? wOf("top") + 12 : 0, bz = wOf("bottom") ? wOf("bottom") + 12 : 0, lz = wOf("left") ? wOf("left") + 12 : 0, rz = wOf("right") ? wOf("right") + 12 : 0;
  const capInside = !(k === "fuse" || k === "switch" || k === "splice" || k === "led" || k === "battery" || k === "inlet");
  const fb = { x: x + lz + 6, y: y + tz + (capInside ? 38 : 6), w: W - lz - rz - 12, h: H - tz - bz - (capInside ? 38 : 6) - 6 };
  const roomy = fb.w >= 40 && fb.h >= 26;
  if (k === "board" || k === "ic" || k === "regulator" || k === "sensor" || k === "module") {
    const [c, t] = pcbFor(key); body = c; ink = t;
    if (/realsense/.test(key)) { body = "#7d8288"; doc.rect(x, y, W, H, { rx: 14, fill: body, stroke: "#4a4d50", sw: 1.4, data: d }); for (let i = 0; i < 3; i++) doc.circle(x + W * (0.3 + i * 0.2), y + H * 0.55, 7, { fill: "#1b1b1b", stroke: "#444", sw: 1, data: d }); }
    else if (/rplidar/.test(key)) { body = "#2b2b2b"; doc.rect(x, y, W, H, { rx: 10, fill: "#3a3a3a", stroke: "#111", sw: 1.2, data: d }); doc.circle(x + W / 2, y + H / 2 + 4, Math.min(W, H) * 0.3, { fill: "#1b1b1b", stroke: "#666", sw: 2, data: d }); }
    else {
      doc.rect(x, y, W, H, { rx: 6, fill: body, stroke: shade(body), sw: 1.4, data: d });
      for (const [hx, hy] of [[x + 7, y + 7], [x + W - 7, y + 7], [x + 7, y + H - 7], [x + W - 7, y + H - 7]]) doc.circle(hx, hy, 3, { fill: "#d9d4c3", stroke: shade(body), sw: 0.8, data: d });
      const cxm = fb.x + fb.w / 2, cym = fb.y + fb.h / 2;
      if (!roomy) { /* no room for the details */ }
      else
      if (k === "board") {
        const cw = Math.min(48, fb.w - 8), ch = Math.min(32, fb.h - 8);
        doc.rect(cxm - cw / 2, cym - ch / 2, cw, ch, { rx: 2, fill: "#1b1b1b", data: d });
        if (/jetson/.test(key)) for (let i = 0; i < 6; i++) doc.line(cxm - cw / 2 + 2 + i * ((cw - 4) / 5), cym - ch / 2 + 2, cxm - cw / 2 + 2 + i * ((cw - 4) / 5), cym + ch / 2 - 2, "#555555", 2, { data: d });
      } else if (/hc_sr04/.test(key)) { for (const s of [-1, 1]) { doc.circle(cxm + s * fb.w * 0.25, cym, Math.min(18, fb.h * 0.45, fb.w * 0.2), { fill: "#c7c9cc", stroke: "#7d7f82", sw: 2, data: d }); doc.circle(cxm + s * fb.w * 0.25, cym, Math.min(10, fb.h * 0.25, fb.w * 0.11), { fill: "#5a5c5e", data: d }); } }
      else if (k === "regulator") { doc.rect(cxm - 26, cym - 12, 22, 22, { rx: 3, fill: "#3b3b3b", data: d }); doc.circle(cxm + 14, cym, 9, { fill: "#222222", stroke: "#888", sw: 1, data: d }); doc.rect(cxm - 1, cym - 18, 8, 8, { fill: "#2f6fd0", stroke: "#ffffff", sw: 0.6, data: d }); }
      else if (/camera/.test(key)) { doc.rect(cxm - 12, cym - 12, 24, 24, { fill: "#111", data: d }); doc.circle(cxm, cym, 7, { fill: "#2c3e50", stroke: "#888", sw: 1, data: d }); }
      else if (/ws2812/.test(key)) { doc.circle(cxm, cym, Math.min(W, H) * 0.3, { stroke: "#eeeeee", sw: 3, data: d }); }
      else if (/l298n/.test(key)) { doc.rect(cxm - 18, cym - 18, 36, 30, { fill: "#111", data: d }); for (let i = 0; i < 5; i++) doc.line(cxm - 14 + i * 7, cym - 18, cxm - 14 + i * 7, cym + 12, "#555", 2, { data: d }); }
      else { doc.rect(cxm - 12, cym - 9, 24, 18, { rx: 1.5, fill: "#1b1b1b", data: d }); }
    }
  } else if (k === "motor" || k === "stepper") {
    // the body carries the pins; the can, gearbox and shaft sit in the free space beside the labels
    const fx = fb.x, fy = fb.y, fw = Math.max(fb.w, 0), fh = Math.max(fb.h, 0), ok = roomy;
    if (/tt_gear/.test(key)) { body = "#f2c12e"; ink = "#333333"; doc.rect(x, y, W, H, { rx: 6, fill: body, stroke: "#b8901a", sw: 1.4, data: d }); if (ok) { doc.rect(fx + fw * 0.5, fy + fh * 0.1, fw * 0.5, fh * 0.8, { rx: 8, fill: "#c7c9cc", stroke: "#8a8d90", sw: 1.2, data: d }); doc.circle(fx + fw * 0.25, fy + fh / 2, Math.min(8, fh / 2 - 1), { fill: "#ffffff", stroke: "#999", sw: 1, data: d }); } }
    else if (/cubemars/.test(key)) { body = "#1e1e1e"; doc.rect(x, y, W, H, { rx: 10, fill: body, stroke: "#000", sw: 1.4, data: d }); if (ok) doc.circle(fx + fw / 2, fy + fh / 2, Math.min(fw, fh) * 0.4, { fill: "#3a3a3a", stroke: "#777", sw: 1.4, data: d }); }
    else if (k === "stepper") { body = "#2b2b2b"; doc.rect(x, y, W, H, { rx: 6, fill: body, stroke: "#000", sw: 1.4, data: d }); if (ok) { doc.rect(fx, fy, fw, fh, { rx: 4, fill: "#b9bcc0", data: d }); doc.circle(fx + fw / 2, fy + fh / 2, Math.min(10, fh / 2 - 2), { fill: "#2b2b2b", data: d }); } }
    else { body = "#b9bcc0"; ink = "#111111"; doc.rect(x, y, W, H, { rx: 8, fill: body, stroke: "#7d8084", sw: 1.4, data: d }); if (ok) { doc.rect(fx + fw * 0.45, fy + fh * 0.1, fw * 0.55, fh * 0.8, { rx: 4, fill: "#8e9195", stroke: "#5f6266", sw: 1.2, data: d }); doc.circle(fx + fw * 0.2, fy + fh / 2, Math.min(6, fh / 2 - 1), { fill: "#ffffff", stroke: "#666", sw: 1, data: d }); } }
  } else if (k === "servo") {
    body = /sg90|mg90/.test(key) ? "#3a7bd5" : "#222222";
    doc.rect(x, y, W, H, { rx: 5, fill: body, stroke: shade(body), sw: 1.4, data: d });
    if (roomy) { const hr = Math.min(10, fb.h / 2 - 2, fb.w / 6), hx = fb.x + fb.w - hr * 1.8, hy = fb.y + fb.h / 2; doc.circle(hx, hy, hr, { fill: "#f4f4f4", stroke: "#999", sw: 1, data: d }); doc.rect(hx - hr * 1.6, hy - 3, hr * 3.2, 6, { rx: 3, fill: "#f4f4f4", stroke: "#999", sw: 0.8, data: d }); }
  } else if (k === "battery") {
    if (/18650/.test(key)) { body = "#1e1e1e"; doc.rect(x, y, W, H, { rx: 4, fill: body, data: d }); for (let i = 0; i < 2; i++) { const cy = y + 12 + i * ((H - 24) / 2), ch = (H - 30) / 2; doc.rect(x + 10, cy, W - 20, ch, { rx: ch / 2, fill: "#2fa9c0", stroke: "#1c6c7c", sw: 1, data: d }); doc.text(x + 18, cy + ch / 2 + 3, "+ 18650", 8, { fill: "#ffffff", bold: true, data: d }); } }
    else { body = "#2a5fa5"; doc.rect(x, y, W, H, { rx: 6, fill: "#c7c9cc", stroke: "#8a8d90", sw: 1.2, data: d }); doc.rect(x + 6, y + 6, W - 12, H - 12, { rx: 4, fill: body, data: d }); }
  } else if (k === "switch") { body = "#1e1e1e"; doc.rect(x, y, W, H, { rx: 4, fill: body, data: d }); doc.rect(x + W * 0.25, y + H * 0.2, W * 0.5, H * 0.45, { rx: 3, fill: "#d7263d", stroke: "#8d1424", sw: 1, data: d }); doc.text(x + W / 2, y + H * 0.35 + 6, "I", 10, { anchor: "middle", fill: "#ffffff", bold: true, data: d }); }
  else if (k === "fuse") {
    const rating = w.fuses[0]?.rating_a ?? 5, col = (FUSE_COL.find(([a]) => a >= rating) ?? FUSE_COL[FUSE_COL.length - 1])[1];
    body = "#1e1e1e"; doc.rect(x, y + 4, W, H - 8, { rx: (H - 8) / 2, fill: body, data: d }); doc.rect(x + W / 2 - 12, y, 24, H, { rx: 3, fill: col, stroke: shade(col), sw: 1, data: d }); doc.text(x + W / 2, y + H / 2 + 3, `${rating}A`, 8, { anchor: "middle", bold: true, fill: "#111111", data: d });
  } else if (k === "inlet") { body = "#1e1e1e"; doc.rect(x, y, W, H, { rx: 6, fill: body, data: d }); doc.path([["M", x + W * 0.25, y + H * 0.3], ["L", x + W * 0.75, y + H * 0.3], ["L", x + W * 0.75, y + H * 0.6], ["L", x + W * 0.62, y + H * 0.75], ["L", x + W * 0.38, y + H * 0.75], ["L", x + W * 0.25, y + H * 0.6], ["Z"]], { fill: "#444", stroke: "#777", sw: 1, data: d }); }
  else if (k === "psu") { body = "#b9bcc0"; doc.rect(x, y, W, H, { rx: 3, fill: body, stroke: "#7d8084", sw: 1.4, data: d }); if (roomy) for (let i = 0; i < 6; i++) doc.line(fb.x + 4 + i * ((fb.w - 8) / 5), fb.y + 4, fb.x + 4 + i * ((fb.w - 8) / 5), fb.y + fb.h - 4, "#8e9195", 2, { data: d }); ink = "#111111"; }
  else if (k === "splice") { body = "#d9dde2"; doc.rect(x, y, W, H, { rx: 4, fill: body, stroke: "#9aa0a6", sw: 1.2, data: d }); const n = 5; for (let i = 0; i < n; i++) doc.rect(x + 6 + i * ((W - 12) / n), y + 4, (W - 12) / n - 3, 10, { rx: 2, fill: "#f28a1a", data: d }); ink = "#333333"; }
  else if (k === "led") { body = "#f7f7f7"; doc.circle(x + W / 2, y + H / 2, Math.min(W, H) / 2 - 4, { fill: "#fdfdf2", stroke: "#bbb", sw: 1.4, data: d }); ink = "#333333"; }
  else { doc.rect(x, y, W, H, { rx: 6, fill: body, data: d }); }
  // title on the part, shortened to fit
  let t = p.title; const max = capInside ? W - 16 : Math.max(W + 40, 120); while (t.length > 4 && textWidth(t, 9, true) > max) t = t.slice(0, -2);
  if (t !== p.title) t = `${t.trim()}...`;
  // the part's name in the design under its title: which motor is which
  let n = p.inst; while (n.length > 4 && textWidth(n, 8) > max) n = n.slice(0, -1);
  if (!capInside) { T(x + W / 2, y - 20, t, 9, "#333333", { bold: true, anchor: "middle" }); T(x + W / 2, y - 8, n, 8, "#555555", { anchor: "middle" }); }
  else { T(x + W / 2, y + tz + 18, t, 9, ink, { bold: true, anchor: "middle" }); T(x + W / 2, y + tz + 30, n, 8, ink, { anchor: "middle" }); }
  // pins: a gold pad on the edge, the name beside it on the part
  for (const q of p.pins) {
    const horiz = q.side === "left" || q.side === "right";
    const px = q.side === "left" ? x : q.side === "right" ? x + W : x + q.off, py = horiz ? y + q.off : q.side === "top" ? y : y + H;
    doc.rect(q.side === "left" ? px : q.side === "right" ? px - 6 : px - 3, q.side === "top" ? py : q.side === "bottom" ? py - 6 : py - 3, 6, 6, { fill: "#d4af37", stroke: "#8a6d1a", sw: 0.6, data: d });
    const lab = q.name.length > 14 ? `${q.name.slice(0, 13)}.` : q.name;
    if (k === "fuse" || k === "switch" || k === "splice" || k === "led") continue;
    if (q.side === "left") T(px + 9, py + 3, lab, 8, ink);
    else if (q.side === "right") T(px - 9, py + 3, lab, 8, ink, { anchor: "end" });
    else if (q.side === "top") T(px + 3, py + 9, lab, 8, ink, { anchor: "end", rot: -90 });
    else T(px + 3, py - 9, lab, 8, ink, { anchor: "start", rot: -90 });
  }
}
export type { Box };
void textBox;
