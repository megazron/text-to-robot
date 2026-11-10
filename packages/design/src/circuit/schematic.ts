// The schematic: KiCad-style symbols with numbered, named pins, reference designators, power and ground symbols with
// the rail voltage, net labels, orthogonal wires and a title block, laid out from the wiring record alone.
//   Power entry and regulation run along the top; below, columns from sensors through the controller and the drivers
//   to the actuators. A two-pin net between neighbours is a routed wire; a rail is a power symbol at every pin; ground is
//   a ground symbol; anything else meets by net label (the same name is the same conductor, as in KiCad).
import type { WiringRecord } from "../wiring.ts";
import { Doc, textWidth, textBox, type Box, type Pt, union } from "./draw.ts";
import { buildModel, withBranchFuses, fuseIdOf, type CircuitModel, type CPart, type CPin, type CNode, type Side } from "./model.ts";
import { Router, type Heading } from "./route.ts";

const G = 10, PITCH = 20, STUB = 30, HEAD = 40;
const C = { body: "#840000", fill: "#ffffc2", pin: "#840000", name: "#006464", num: "#a90000", wire: "#008400", bus: "#0000c8", label: "#000000", power: "#840000", frame: "#840000", text: "#000000", nc: "#0000c8", ref: "#006464" };
const F = { pin: 9, num: 7, ref: 11, value: 9, label: 9, power: 9, title: 13, note: 9 };
const snap = (v: number) => Math.round(v / G) * G;
const up = (v: number) => Math.ceil(v / G) * G;

export interface SymPin { pin: CPin; side: Side; off: number; }
export interface Sym { part: CPart; w: number; h: number; x: number; y: number; pins: SymPin[]; col: number; ext: { l: number; r: number; t: number; b: number }; glyph: boolean; }
type Mode = "wire" | "label" | "power" | "ground";
export interface SchematicResult { svg: string; pdf: Uint8Array; netlist: SchematicNetlist; model: CircuitModel; doc: Doc; unrouted: string[]; size: string; }
export interface SchematicNetlist {
  robot: string; parts: { ref: string; inst: string; key: string; value: string }[];
  nodes: { name: string; nets: string[]; kind: string; voltage_v?: number; drawn: Mode | "cable"; pins: { id: string; ref: string; num: string; members: string[] }[] }[];
  empty_nets: string[]; splices: string[];
}

// ------------------------------------------------------------------------------------------- symbol sizes and pin sides
const BAND = new Set(["battery", "psu", "inlet", "switch", "fuse", "regulator"]);
const colOf = (p: CPart) => (BAND.has(p.kind) ? -1 : p.role === "sensor" || p.role === "indicator" ? 0 : p.role === "controller" ? 1 : p.role === "actuator" ? 3 : 2);
const pinLabel = (p: CPin) => p.name;

function sideOf(m: CircuitModel, p: CPart, pin: CPin, col: Map<string, number>): Side {
  const node = m.nodeOf.get(pin.id);
  if (p.kind === "fuse" || p.kind === "switch") return /in|^1$/i.test(pin.name) || pin.dir === "in" ? "left" : "right";
  if (p.kind === "battery") return pin.signal === "ground" ? "bottom" : "top";
  if (pin.signal === "ground" && (pin.dir !== "power_out" || BAND.has(p.kind))) return "bottom";
  if (BAND.has(p.kind)) return pin.dir === "out" || pin.dir === "power_out" ? "right" : "left";
  if (pin.signal === "power") return "top";
  if (!node) return pin.dir === "out" ? "right" : "left";
  const me = col.get(p.inst)!, others = node.pins.map((t) => m.pin.get(t)!.inst).filter((i) => i !== p.inst).map((i) => col.get(i)!);
  const s = others.reduce((a, c) => a + Math.sign(c - me), 0);
  if (s < 0) return "left";
  if (s > 0) return "right";
  if (p.role === "actuator") return "left";
  if (p.role === "sensor" || p.role === "indicator") return "right";
  return pin.dir === "out" ? "right" : "left";
}

function makeSym(m: CircuitModel, p: CPart, col: Map<string, number>): Sym {
  const pins = p.pins.map((pin) => ({ pin, side: pin.nc ? ("left" as Side) : sideOf(m, p, pin, col), off: 0 }));
  // no-connect pins balance the two sides
  const nl = () => pins.filter((x) => x.side === "left").length, nr = () => pins.filter((x) => x.side === "right").length;
  for (const x of pins) if (x.pin.nc) x.side = nl() - 1 <= nr() ? "left" : "right";
  const sym: Sym = { part: p, w: 0, h: 0, x: 0, y: 0, pins, col: col.get(p.inst)!, ext: { l: 0, r: 0, t: 0, b: 0 }, glyph: false };
  sizeSym(m, sym);
  return sym;
}
/** body size from its pins and texts; pin offsets along each side */
function sizeSym(m: CircuitModel, s: Sym) {
  const p = s.part, by = (sd: Side) => s.pins.filter((x) => x.side === sd);
  if (p.kind === "fuse" || p.kind === "switch") {
    s.w = 40; s.h = 20;
    for (const x of s.pins) x.off = 10;
    return;
  }
  if (p.kind === "battery") {
    s.w = 40; s.h = 60;
    for (const x of s.pins) x.off = 20;
    return;
  }
  const L = by("left"), R = by("right"), T = by("top"), B = by("bottom");
  const wName = (xs: SymPin[]) => Math.max(0, ...xs.map((x) => textWidth(pinLabel(x.pin), F.pin)));
  const head = Math.max(textWidth(`${p.ref} `, F.ref, true) + textWidth(`· ${p.inst}`, F.value), textWidth(p.value, F.value)) + 16 + 28;
  // top and bottom pins: grouped by node, flags of neighbouring groups must not touch
  const place = (xs: SymPin[]) => {
    xs.sort((a, b) => (m.nodeOf.get(a.pin.id)?.name ?? "~").localeCompare(m.nodeOf.get(b.pin.id)?.name ?? "~") || a.pin.id.localeCompare(b.pin.id));
    let x = 0, prevNode = "", prevHalf = 0; const offs: number[] = [];
    xs.forEach((q, i) => {
      const nd = m.nodeOf.get(q.pin.id)?.name ?? `nc${i}`, half = flagHalf(m.nodeOf.get(q.pin.id));
      if (i === 0) x = 0; else if (nd === prevNode) x += PITCH; else x += Math.max(PITCH * 2, up(prevHalf + half + 12));
      if (nd !== prevNode) prevHalf = half;
      offs.push(x); prevNode = nd;
    });
    return { offs, span: offs.length ? offs[offs.length - 1] : 0 };
  };
  const tp = place(T), bp = place(B);
  const span = Math.max(tp.span, bp.span);
  const lw = wName(L), rw = wName(R);
  const mid = Math.max(span + 20, 0);
  s.w = up(Math.max(head, lw + rw + 24 + mid, 80));
  const rows = Math.max(L.length, R.length);
  const tn = Math.max(0, ...T.map((x) => textWidth(pinLabel(x.pin), F.pin))), bn = Math.max(0, ...B.map((x) => textWidth(pinLabel(x.pin), F.pin)));
  // side rows start under the header; top names hang under the header in the middle, bottom names stand on the floor
  s.h = up(Math.max(HEAD + rows * PITCH + 10, HEAD + tn + bn + 24, 70));
  L.forEach((x, i) => (x.off = HEAD + 10 + i * PITCH));
  R.forEach((x, i) => (x.off = HEAD + 10 + i * PITCH));
  // centre the top and bottom rows in the middle region
  const midX0 = 12 + lw + 6, midX1 = s.w - 12 - rw - 6, centre = snap((midX0 + midX1) / 2);
  const t0 = snap(centre - tp.span / 2), b0 = snap(centre - bp.span / 2);
  T.forEach((x, i) => (x.off = t0 + tp.offs[i]));
  B.forEach((x, i) => (x.off = b0 + bp.offs[i]));
}
const flagText = (n?: CNode) => (!n ? "" : n.kind === "ground" ? (n.name === "GND" ? "" : n.name) : n.voltage_v !== undefined && !/^\+?\d+V\d*$/i.test(n.name) ? `${n.name} ${fmtV(n.voltage_v)}` : n.name);
const fmtV = (v: number) => `${+v.toFixed(2)}V`;
function flagHalf(n?: CNode) { return n ? Math.max(10, textWidth(flagText(n), F.power) / 2) : 6; }

// pin geometry
export function pinEnd(s: Sym, x: SymPin): { at: Pt; root: Pt; out: Heading } {
  if (x.side === "left") return { at: [s.x - STUB, s.y + x.off], root: [s.x, s.y + x.off], out: 2 };
  if (x.side === "right") return { at: [s.x + s.w + STUB, s.y + x.off], root: [s.x + s.w, s.y + x.off], out: 0 };
  if (x.side === "top") return { at: [s.x + x.off, s.y - STUB], root: [s.x + x.off, s.y], out: 3 };
  return { at: [s.x + x.off, s.y + s.h + STUB], root: [s.x + x.off, s.y + s.h], out: 1 };
}
const stubFor = (s: Sym) => (s.part.kind === "fuse" || s.part.kind === "switch" ? 20 : STUB);
function pinEndK(s: Sym, x: SymPin) { const e = pinEnd(s, x), k = stubFor(s); if (k === STUB) return e; const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][e.out]; return { ...e, at: [e.root[0] + d[0] * k, e.root[1] + d[1] * k] as Pt }; }

// annotation boxes beyond a pin end (label, power flag, ground) in the direction it points
function annBox(m: CircuitModel, x: SymPin, at: Pt, out: Heading, mode: Mode): Box {
  const n = m.nodeOf.get(x.pin.id);
  if (x.pin.nc) return { x: at[0] - 4, y: at[1] - 4, w: 8, h: 8 };
  if (mode === "label") { const L = textWidth(n?.name ?? "", F.label) + 16; return out === 2 ? { x: at[0] - L, y: at[1] - 8, w: L, h: 16 } : out === 0 ? { x: at[0], y: at[1] - 8, w: L, h: 16 } : out === 3 ? { x: at[0] - 8, y: at[1] - L, w: 16, h: L } : { x: at[0] - 8, y: at[1], w: 16, h: L }; }
  if (mode === "power") { const t = textWidth(flagText(n), F.power); return out === 3 ? { x: at[0] - Math.max(8, t / 2), y: at[1] - 24, w: Math.max(16, t), h: 24 } : out === 1 ? { x: at[0] - Math.max(8, t / 2), y: at[1], w: Math.max(16, t), h: 24 } : out === 2 ? { x: at[0] - 14 - t, y: at[1] - 8, w: 14 + t, h: 16 } : { x: at[0], y: at[1] - 8, w: 14 + t, h: 16 }; }
  if (mode === "ground") { const t = flagText(n), tw = t ? textWidth(t, F.power) : 0; return out === 1 ? { x: at[0] - Math.max(9, tw / 2), y: at[1], w: Math.max(18, tw), h: t ? 26 : 14 } : out === 3 ? { x: at[0] - Math.max(9, tw / 2), y: at[1] - (t ? 26 : 14), w: Math.max(18, tw), h: t ? 26 : 14 } : out === 2 ? { x: at[0] - 14 - (t ? tw + 4 : 0), y: at[1] - 9, w: 14 + (t ? tw + 4 : 0), h: 18 } : { x: at[0], y: at[1] - 9, w: 14 + (t ? tw + 4 : 0), h: 18 }; }
  return { x: at[0], y: at[1], w: 0, h: 0 };
}

// ------------------------------------------------------------------------------------------- the layout
export function schematic(rec: WiringRecord, robot: string): SchematicResult {
  const w = withBranchFuses(rec);
  // first try compact (no room kept for labels on wired pins); if a wire then falls back to labels, lay out again with room
  const a = layoutOnce(w, robot, false);
  return a.unrouted.length ? layoutOnce(w, robot, true) : a;
}
function layoutOnce(w: WiringRecord, robot: string, roomy: boolean): SchematicResult {
  const m = buildModel(w, robot);
  for (const p of m.parts) if (p.kind === "fuse") { const f = w.fuses.find((x) => x.id === fuseIdOf(w, p.inst)); if (f) p.note = `${f.rating_a} A`; }
  const col = new Map<string, number>(m.parts.map((p) => [p.inst, colOf(p)]));
  // columns that are empty disappear; a column far taller than the rest wraps into several
  let syms = m.parts.map((p) => makeSym(m, p, col));
  // which nodes are wires: two pins, on neighbours (columns next to each other, or the power band)
  const symOf = new Map<string, Sym>();
  const refresh = () => { symOf.clear(); for (const s of syms) symOf.set(s.part.inst, s); };
  refresh();
  const modeOf = new Map<string, Mode | "cable">();
  const candidate = (n: CNode) => {
    if (n.pins.length !== 2) return false;
    const [a, b] = n.pins.map((t) => symOf.get(m.pin.get(t)!.inst)!);
    if (a === b) return false;
    if (a.col === -1 && b.col === -1) return true;
    if (a.col === -1 || b.col === -1) return false;
    return Math.abs(a.col - b.col) === 1;
  };
  const decide = () => {
    for (const n of m.nodes) {
      const cand = candidate(n) && (n.kind !== "power" || n.pins.every((t) => symOf.get(m.pin.get(t)!.inst)!.col === -1)) && (n.kind !== "ground" || n.pins.every((t) => symOf.get(m.pin.get(t)!.inst)!.col === -1));
      modeOf.set(n.name, cand ? "wire" : n.kind === "ground" ? "ground" : n.kind === "power" ? "power" : "label");
    }
  };
  // wrap tall columns before deciding
  const colsUsed = () => [...new Set(syms.filter((s) => s.col >= 0).map((s) => s.col))].sort((a, b) => a - b);
  const colH = (c: number) => syms.filter((s) => s.col === c).reduce((a, s) => a + s.h + 110, 0);
  {
    const cs = colsUsed(), hs = cs.map(colH), others = (c: number) => Math.max(600, ...cs.filter((x) => x !== c).map(colH));
    // renumber so wrapped sub-columns sit next to each other
    let shift = 0; const map = new Map<number, number[]>();
    // the tallest column wraps into as many sub-columns as bring the sheet nearest a landscape ISO page
    const cw = (c: number) => Math.max(...syms.filter((s) => s.col === c).map((s) => s.w)) + 260;
    const tall = cs[hs.indexOf(Math.max(...hs))];
    let best = 1, bestScore = Infinity;
    for (let k = 1; k <= 8; k++) {
      const W = cs.reduce((a, c) => a + (c === tall ? k * cw(c) : cw(c)), 0), H = Math.max(...cs.map((c, i) => (c === tall ? hs[i] / k : hs[i]))) + 320;
      const score = Math.max(W / Math.SQRT2, H);
      if (score < bestScore - 1) { bestScore = score; best = k; }
    }
    void others;
    cs.forEach((c) => { const k = c === tall ? best : 1; map.set(c, Array.from({ length: k }, (_, j) => c + shift + j)); shift += k - 1; });
    for (const c of cs) {
      const list = syms.filter((s) => s.col === c), slots = map.get(c)!;
      const per = Math.ceil(list.length / slots.length);
      list.forEach((s, i) => (s.col = slots[Math.floor(i / per)]));
    }
    // re-index to 0..n-1
    const used = colsUsed(); for (const s of syms) if (s.col >= 0) s.col = used.indexOf(s.col);
    for (const s of syms) col.set(s.part.inst, s.col);
    syms = m.parts.map((p) => { const s = makeSym(m, p, col); s.col = col.get(p.inst)!; return s; });
    refresh();
  }
  decide();
  // ---- placement, twice: the second pass orders pins by where their partners ended up
  const nodePins = (n: CNode) => n.pins.map((t) => { const p = m.pin.get(t)!, s = symOf.get(p.inst)!; return { s, sp: s.pins.find((x) => x.pin.id === t)! }; });
  const partner = (s: Sym, x: SymPin) => { const n = m.nodeOf.get(x.pin.id); if (!n || modeOf.get(n.name) !== "wire") return null; return nodePins(n).find((q) => q.s !== s) ?? null; };
  // same-node power or ground pins side by side on the top or the bottom share one symbol and a bar
  const runs = (s: Sym) => {
    const lead = new Map<SymPin, SymPin[]>(), follow = new Set<SymPin>();
    for (const sd of ["top", "bottom"] as Side[]) {
      const xs = s.pins.filter((x) => x.side === sd && !x.pin.nc).sort((a, b) => a.off - b.off);
      let cur: SymPin | null = null;
      for (const x of xs) {
        const n = m.nodeOf.get(x.pin.id), md = n ? modeOf.get(n.name) : undefined;
        const same = cur && md && (md === "power" || md === "ground") && m.nodeOf.get(cur.pin.id) === n && x.off - (lead.get(cur)!.at(-1) ?? cur).off <= PITCH;
        if (same) { lead.get(cur!)!.push(x); follow.add(x); } else { cur = x; lead.set(x, []); }
      }
    }
    return { lead, follow };
  };
  const extents = (s: Sym) => {
    const boxes: Box[] = [{ x: s.x, y: s.y, w: s.w, h: s.h }];
    const fol = runs(s).follow;
    for (const x of s.pins) { if (fol.has(x)) continue; const e = pinEndK(s, x), n = m.nodeOf.get(x.pin.id); const wired = !x.pin.nc && n && modeOf.get(n.name) === "wire", md = x.pin.nc ? "label" : n ? (wired ? "label" : (modeOf.get(n.name) as Mode)) : "label"; boxes.push({ x: Math.min(e.at[0], e.root[0]), y: Math.min(e.at[1], e.root[1]), w: Math.abs(e.at[0] - e.root[0]), h: Math.abs(e.at[1] - e.root[1]) }); if (!wired || roomy) boxes.push(annBox(m, x, e.at, e.out, md)); }
    if (s.part.kind === "fuse" || s.part.kind === "switch" || s.part.kind === "battery") boxes.push(...glyphTexts(s).map(textBox));
    const u = union(boxes);
    s.ext = { l: s.x - u.x, r: u.x + u.w - (s.x + s.w), t: s.y - u.y, b: u.y + u.h - (s.y + s.h) };
  };
  const bandY = 60;
  let bandBottom = 0, colX: number[] = [];
  const layout = () => {
    for (const s of syms) extents(s);
    let cx = 60;
    // columns
    const ncol = Math.max(0, ...syms.map((s) => s.col + 1));
    colX = [];
    for (let c = 0; c < ncol; c++) {
      const list = syms.filter((s) => s.col === c);
      const L = Math.max(0, ...list.map((s) => s.ext.l)), wmax = Math.max(0, ...list.map((s) => s.w + s.ext.r));
      // wires crossing to the next column each need a track
      const tracks = list.reduce((a, s) => a + s.pins.filter((x) => { const pt = partner(s, x); return pt && pt.s.col === c + 1; }).length, 0);
      colX.push(snap(cx + L));
      for (const s of list) s.x = snap(cx + L);
      cx = snap(cx + L + wmax + 60 + tracks * G);
    }
    // the power band: chain order from each source, then the regulators
    const band = syms.filter((s) => s.col === -1), orderB: Sym[] = [];
    const next = (s: Sym) => { for (const x of s.pins) { const pt = partner(s, x); if (pt && pt.s.col === -1 && !orderB.includes(pt.s)) return pt.s; } return null; };
    const starts = [...band.filter((s) => s.part.kind === "inlet" || s.part.kind === "battery"), ...band.filter((s) => s.part.kind === "psu")];
    for (const st of starts) { if (orderB.includes(st)) continue; let c: Sym | null = st; while (c && !orderB.includes(c)) { orderB.push(c); c = next(c); } }
    for (const s of band) if (!orderB.includes(s)) orderB.push(s);
    let x = 60, top = bandY;
    const extT = Math.max(0, ...orderB.map((s) => s.ext.t));
    let rowY = snap(bandY + extT + 40);
    // a long band (many branch fuses) wraps at the width of the columns below; only at a part with no wire to its
    // neighbours, so a wired chain is never split
    const limit = Math.max(1400, cx);
    for (const s of orderB) {
      if (x > 60 && x + s.ext.l + s.w + s.ext.r > limit && !s.pins.some((p) => partner(s, p))) { x = 60; rowY = snap(top + extT + 50); }
      x = snap(x + s.ext.l);
      s.x = x;
      // line the band up on its first left pin (or the battery's + pin end)
      const first = s.pins.find((p) => p.side === "left") ?? s.pins.find((p) => p.side === "top");
      s.y = s.part.kind === "battery" ? rowY + STUB + 20 : snap(rowY - (first && first.side === "left" ? first.off : HEAD));
      x = s.x + s.w + s.ext.r + 70 + 10 * s.pins.filter((p) => partner(s, p)).length;
      top = Math.max(top, s.y + s.h + s.ext.b);
    }
    bandBottom = band.length ? top + 50 : 40;
    // vertical: controllers first, then each column lined up with the pins it wires to
    const orderC = [1, 2, 3, ...Array.from({ length: Math.max(0, ncol - 4) }, (_, i) => 4 + i), 0].filter((c) => c < ncol);
    const placed = new Set<Sym>();
    for (const c of orderC) {
      const list = syms.filter((s) => s.col === c);
      const want = new Map<Sym, number>();
      for (const s of list) {
        const ys: number[] = [];
        for (const x of s.pins) { const pt = partner(s, x); if (pt && placed.has(pt.s)) ys.push(pinEndK(pt.s, pt.sp).at[1] - x.off); }
        want.set(s, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity);
      }
      const sorted = [...list].sort((a, b) => (want.get(a)! - want.get(b)!) || list.indexOf(a) - list.indexOf(b));
      let y = bandBottom;
      for (const s of sorted) {
        const wy = want.get(s)!;
        s.y = snap(Math.max(y + s.ext.t, Number.isFinite(wy) ? wy : 0));
        y = s.y + s.h + s.ext.b + 40;
        placed.add(s);
      }
    }
  };
  const orderPins = () => {
    const rank = (c: number) => (c === 1 ? 0 : c === -1 ? 9 : c === 0 ? 8 : c + 1);
    for (const s of [...syms].sort((a, b) => rank(a.col) - rank(b.col))) {
      if (s.part.kind === "fuse" || s.part.kind === "switch" || s.part.kind === "battery") continue;
      for (const sd of ["left", "right"] as Side[]) {
        const xs = s.pins.filter((x) => x.side === sd);
        const key = (x: SymPin) => { if (x.pin.nc) return 1e9 + xs.indexOf(x); const pt = partner(s, x); if (pt) return rank(pt.s.col) > rank(s.col) ? pt.s.y * 1000 + pt.s.pins.indexOf(pt.sp) : pinEndK(pt.s, pt.sp).at[1]; const n = m.nodeOf.get(x.pin.id); const ys = n ? nodePins(n).filter((q) => q.s !== s).map((q) => q.s.y + q.sp.off) : []; return ys.length ? Math.min(...ys) * (rank(s.col) === 0 ? 1 : 1000) + 0.5 : 5e11; };
        const sorted = [...xs].sort((a, b) => key(a) - key(b) || a.pin.id.localeCompare(b.pin.id));
        const offs = xs.map((x) => x.off).sort((a, b) => a - b);
        sorted.forEach((x, i) => (x.off = offs[i]));
      }
    }
  };
  layout(); orderPins(); layout(); orderPins(); layout();
  // reference designators stay as the model gave them (by instance name): the breadboard view uses the same ones
  // ---- sheet
  const content = union(syms.map((s) => ({ x: s.x - s.ext.l, y: s.y - s.ext.t, w: s.w + s.ext.l + s.ext.r, h: s.h + s.ext.t + s.ext.b })));
  const notes = notesBlock(w, m);
  const TBW = 420, TBH = 110;
  const needW = Math.max(content.x + content.w + 60, notes.w + TBW + 120), needH = content.y + content.h + 50 + Math.max(TBH, notes.h) + 40;
  const SIZES: [string, number, number][] = [["A4", 1169, 827], ["A3", 1654, 1169], ["A2", 2339, 1654], ["A1", 3307, 2339], ["A0", 4677, 3307]];
  const fit = SIZES.find(([, W, H]) => W >= needW && H >= needH);
  const [size, SW, SH] = fit ?? ["custom", up(needW), up(needH)];
  // centre the drawing on the sheet above the title block
  const dx = snap((SW - needW) / 2), dy = snap((SH - needH) / 2);
  for (const s of syms) { s.x += dx; s.y += dy; }
  const doc = new Doc(SW, SH);
  doc.rect(0, 0, SW, SH, { fill: "#ffffff" });
  frame(doc, SW, SH);
  // ---- routing
  const R = new Router(SW, SH, G);
  const idx = new Map(m.nodes.map((n, i) => [n.name, i]));
  for (const s of syms) {
    R.block({ x: s.x - G, y: s.y - G, w: s.w + 2 * G, h: s.h + 2 * G });
    for (const t of glyphTexts(s)) R.block(grow(textBox(t), 4));
    const rs = runs(s);
    for (const [ld, fs] of rs.lead) if (fs.length) { const id = idx.get(m.nodeOf.get(ld.pin.id)!.name)!; const a = pinEndK(s, ld).at, b = pinEndK(s, fs[fs.length - 1]).at; for (let x = a[0]; x <= b[0]; x += G) R.reserve([x, a[1]], id); }
    for (const x of s.pins) {
      const e = pinEndK(s, x), n = m.nodeOf.get(x.pin.id), id = n ? idx.get(n.name)! : -1;
      if (rs.follow.has(x)) { R.reserve(e.at, id); const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][e.out]; for (let k = 0; k < stubFor(s) / G; k++) R.block({ x: e.root[0] + d[0] * k * G - 1, y: e.root[1] + d[1] * k * G - 1, w: 2, h: 2 }); continue; }
      // the stub, then the end is kept for this net, and so is the space its label would need
      const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][e.out];
      for (let k = 0; k < stubFor(s) / G; k++) R.block({ x: e.root[0] + d[0] * k * G - 1, y: e.root[1] + d[1] * k * G - 1, w: 2, h: 2 });
      if (id < 0) { R.block(grow(annBox(m, x, e.at, e.out, "label"), 2)); continue; }
      const md = modeOf.get(n!.name);
      const ab = annBox(m, x, e.at, e.out, md === "wire" ? "label" : (md as Mode));
      // a wired pin keeps the cells in front of it; with room kept for labels, the whole label space as well
      if (md === "wire") { if (roomy) reserveBox(R, ab, id); else for (let k = 1; k <= 2; k++) { const q: Pt = [e.at[0] + d[0] * G * k, e.at[1] + d[1] * G * k]; const c = R.cell(q); if (!R.reserved[c] && !R.blocked[c]) R.reserved[c] = id + 1; } }
      else R.block(grow(ab, 4));
      R.reserve(e.at, id);
    }
  }
  R.block({ x: SW - TBW - 20 - 10, y: SH - TBH - 20 - 10, w: TBW + 20, h: TBH + 20 });
  R.block({ x: 20, y: SH - 30 - notes.h - 10, w: notes.w + 30, h: notes.h + 20 });
  const routes = new Map<string, Pt[]>(), unrouted: string[] = [];
  const wires = m.nodes.filter((n) => modeOf.get(n.name) === "wire").map((n) => { const [a, b] = nodePins(n).map((q) => pinEndK(q.s, q.sp)); return { n, a, b, d: Math.abs(a.at[0] - b.at[0]) + Math.abs(a.at[1] - b.at[1]) }; }).sort((p, q) => Math.abs(q.a.at[1] - q.b.at[1]) - Math.abs(p.a.at[1] - p.b.at[1]) || Math.min(p.a.at[1], p.b.at[1]) - Math.min(q.a.at[1], q.b.at[1]) || p.d - q.d);
  for (const { n, a, b } of wires) {
    const path = R.route(idx.get(n.name)!, { at: a.at, out: a.out }, { at: b.at, out: b.out }, { limit: 300000, late: 0.02 });
    if (path && pathLen(path) < 3 * (Math.abs(a.at[0] - b.at[0]) + Math.abs(a.at[1] - b.at[1])) + 400) routes.set(n.name, path);
    else { unrouted.push(n.name); modeOf.set(n.name, n.kind === "power" ? "power" : n.kind === "ground" ? "ground" : "label"); }
  }
  for (const n of m.nodes) if (n.kind === "cable" && modeOf.get(n.name) === "label") modeOf.set(n.name, "label");
  // ---- draw
  let g = 0;
  for (const s of syms) drawSym(doc, m, s);
  for (const s of syms) {
    const rs = runs(s);
    for (const [ld, fs] of rs.lead) {
      if (!fs.length) continue;
      const n = m.nodeOf.get(ld.pin.id)!, a = pinEndK(s, ld).at, b = pinEndK(s, fs[fs.length - 1]).at;
      doc.poly([a, b], C.wire, 1.4, { cls: "wire", data: { node: n.name } });
      for (const p of [ld, ...fs.slice(0, -1)]) { const e = pinEndK(s, p).at; doc.circle(e[0], e[1], 2.6, { fill: C.wire, cls: "junction" }); }
    }
  }
  const followers = new Set(syms.flatMap((s) => [...runs(s).follow]));
  for (const s of syms) for (const x of s.pins) {
    if (followers.has(x)) continue;
    const e = pinEndK(s, x), n = m.nodeOf.get(x.pin.id);
    if (x.pin.nc) { doc.line(e.at[0] - 4, e.at[1] - 4, e.at[0] + 4, e.at[1] + 4, C.nc, 1.2, { cls: "nc" }); doc.line(e.at[0] - 4, e.at[1] + 4, e.at[0] + 4, e.at[1] - 4, C.nc, 1.2, { cls: "nc" }); continue; }
    if (!n) continue;
    const md = modeOf.get(n.name)!;
    if (md === "wire") continue;
    drawAnn(doc, n, e.at, e.out, md as Mode, `A${++g}`);
  }
  for (const [name, path] of routes) {
    const n = m.nodes.find((x) => x.name === name)!;
    doc.poly(path, n.kind === "cable" ? C.bus : C.wire, n.kind === "cable" ? 3 : 1.4, { cls: n.kind === "cable" ? "wire bus" : "wire", data: { node: name }, title: `${name}${n.cable ? ` (${n.cable})` : ""}` });
  }
  doc.items.push(...notes.items(SW, SH));
  titleBlock(doc, SW, SH, TBW, TBH, robot, size, w);
  // ---- the netlist the drawing holds
  const netlist: SchematicNetlist = {
    robot, parts: syms.map((s) => ({ ref: s.part.ref, inst: s.part.inst, key: s.part.key, value: s.part.value })),
    nodes: m.nodes.map((n) => ({ name: n.name, nets: n.nets, kind: n.kind, ...(n.voltage_v !== undefined ? { voltage_v: n.voltage_v } : {}), drawn: n.kind === "cable" && modeOf.get(n.name) === "wire" ? "cable" : (modeOf.get(n.name) as Mode), pins: n.pins.map((t) => { const p = m.pin.get(t)!; return { id: t, ref: m.part.get(p.inst)!.ref, num: p.num, members: p.members }; }) })),
    empty_nets: m.emptyNets, splices: m.splices,
  };
  const title = `${robot}: schematic`;
  const svg = doc.svg({ title, desc: "Generated by Text to Robot from the robot's wiring record (design.wiring). Every pin carries data-pin; wires, labels and power symbols carry their net.", json: netlist });
  return { svg, pdf: doc.pdf({ title }), netlist, model: m, doc, unrouted, size };
}
const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const pathLen = (p: Pt[]) => p.slice(1).reduce((a, q, i) => a + Math.abs(q[0] - p[i][0]) + Math.abs(q[1] - p[i][1]), 0);
function reserveBox(R: Router, b: Box, id: number) {
  for (let y = Math.ceil(b.y / G) * G; y <= b.y + b.h; y += G) for (let x = Math.ceil(b.x / G) * G; x <= b.x + b.w; x += G) { const c = R.cell([x, y]); if (!R.reserved[c] && !R.blocked[c]) R.reserved[c] = id + 1; }
}

// ------------------------------------------------------------------------------------------- drawing
function glyphTexts(s: Sym) {
  const p = s.part, k = p.kind;
  const T = (x: number, y: number, str: string, size: number, o: { bold?: boolean; anchor?: "start" | "middle" | "end"; fill?: string } = {}) => ({ t: "text" as const, x, y, s: str, size, ...o });
  if (k === "fuse" || k === "switch") return [T(s.x + s.w / 2, s.y - 14, `${p.ref}${p.note ? `  ${p.note}` : ""}`, F.ref, { bold: true, anchor: "middle", fill: C.ref }), T(s.x + s.w / 2, s.y + s.h + 14, p.value, F.value, { anchor: "middle", fill: C.ref }), T(s.x + s.w / 2, s.y + s.h + 26, p.inst, F.value, { anchor: "middle", fill: C.ref })];
  if (k === "battery") return [T(s.x + s.w + 8, s.y + 26, p.ref, F.ref, { bold: true, fill: C.ref }), T(s.x + s.w + 8, s.y + 40, p.value, F.value, { fill: C.ref }), T(s.x + s.w + 8, s.y + 52, p.inst, F.value, { fill: C.ref })];
  return [];
}
function drawSym(doc: Doc, m: CircuitModel, s: Sym) {
  const p = s.part, gid = `S:${p.ref}`, d = { g: gid, ref: p.ref, inst: p.inst };
  const k = p.kind;
  if (k === "fuse") {
    doc.rect(s.x + 4, s.y + 4, s.w - 8, s.h - 8, { fill: C.fill, stroke: C.body, sw: 1.5, cls: "sym", data: d });
    doc.line(s.x, s.y + 10, s.x + s.w, s.y + 10, C.body, 1.2, { cls: "sym", data: d });
  } else if (k === "switch") {
    doc.rect(s.x, s.y, s.w, s.h, { fill: "none", cls: "sym", data: d });
    doc.circle(s.x + 6, s.y + 10, 3, { stroke: C.body, sw: 1.4, fill: "#ffffff", cls: "sym", data: d });
    doc.circle(s.x + s.w - 6, s.y + 10, 3, { stroke: C.body, sw: 1.4, fill: "#ffffff", cls: "sym", data: d });
    doc.line(s.x + 8, s.y + 9, s.x + s.w - 9, s.y + 1, C.body, 1.6, { cls: "sym", data: d });
    doc.line(s.x, s.y + 10, s.x + 3, s.y + 10, C.body, 1.4, { cls: "sym", data: d }); doc.line(s.x + s.w - 3, s.y + 10, s.x + s.w, s.y + 10, C.body, 1.4, { cls: "sym", data: d });
  } else if (k === "battery") {
    doc.rect(s.x, s.y, s.w, s.h, { fill: "none", cls: "sym", data: d });
    const cx = s.x + s.w / 2;
    doc.line(cx, s.y, cx, s.y + 14, C.body, 1.4, { cls: "sym", data: d });
    for (let i = 0; i < 2; i++) { const y = s.y + 16 + i * 16; doc.line(cx - 16, y, cx + 16, y, C.body, 2, { cls: "sym", data: d }); doc.line(cx - 9, y + 7, cx + 9, y + 7, C.body, 3.2, { cls: "sym", data: d }); }
    doc.line(cx, s.y + 46, cx, s.y + s.h, C.body, 1.4, { cls: "sym", data: d });
    doc.text(cx + 12, s.y + 12, "+", 10, { bold: true, fill: C.body, data: { g: gid } });
  } else {
    doc.rect(s.x, s.y, s.w, s.h, { fill: C.fill, stroke: C.body, sw: 1.6, cls: "sym body", data: d });
    doc.text(s.x + 8, s.y + 16, p.ref, F.ref, { bold: true, fill: C.ref, data: { g: gid } });
    // the part's name in the design beside its designator: the same name labels it in the breadboard view
    doc.text(s.x + 8 + textWidth(`${p.ref} `, F.ref, true), s.y + 16, `· ${p.inst}`, F.value, { fill: C.ref, data: { g: gid } });
    doc.text(s.x + 8, s.y + 30, p.value, F.value, { fill: C.ref, data: { g: gid }, title: p.inst });
    glyph(doc, s, gid);
  }
  for (const t of glyphTexts(s)) doc.add({ ...t, data: { g: gid } });
  // pins: line from the body out, number on the line, name inside
  for (const x of s.pins) {
    const e = pinEndK(s, x), horiz = x.side === "left" || x.side === "right";
    doc.line(e.root[0], e.root[1], e.at[0], e.at[1], C.pin, 1.2, { cls: "pin", data: { pin: x.pin.id, ...(m.nodeOf.get(x.pin.id) ? { node: m.nodeOf.get(x.pin.id)!.name } : {}), ...(x.pin.bundle ? { members: x.pin.members.join("|") } : {}), ...(x.pin.nc ? { nc: "1" } : {}) }, title: `${p.ref} pin ${x.pin.num} ${x.pin.name} (${x.pin.id})` });
    if (x.pin.bundle) doc.line(e.root[0], e.root[1], e.at[0], e.at[1], C.bus, 3, { cls: "pinbus" });
    // a pin numbered by its own name, or with a number longer than the stub, shows the name only
    const num = x.pin.num === x.pin.name || shortPinNum(x.pin) || textWidth(x.pin.num, F.num) > (horiz ? STUB + 30 : STUB - 6) ? "" : x.pin.num;
    if (k === "fuse" || k === "switch" || k === "battery") continue;
    if (horiz) {
      const mx = (e.root[0] + e.at[0]) / 2;
      if (num) doc.text(mx, e.at[1] - 3, num, F.num, { anchor: "middle", fill: C.num, data: { g: gid } });
      doc.text(x.side === "left" ? s.x + 5 : s.x + s.w - 5, e.at[1] + 3.2, pinLabel(x.pin), F.pin, { anchor: x.side === "left" ? "start" : "end", fill: C.name, data: { g: gid } });
    } else {
      const my = (e.root[1] + e.at[1]) / 2;
      if (num) doc.text(e.at[0] - 3, my, num, F.num, { anchor: "middle", fill: C.num, rot: -90, data: { g: gid } });
      if (x.side === "top") doc.text(e.at[0] + 3.2, s.y + HEAD - 4, pinLabel(x.pin), F.pin, { anchor: "end", fill: C.name, rot: -90, data: { g: gid } });
      else doc.text(e.at[0] + 3.2, s.y + s.h - 5, pinLabel(x.pin), F.pin, { anchor: "start", fill: C.name, rot: -90, data: { g: gid } });
    }
  }
}
const shortPinNum = (p: CPin) => p.num.toUpperCase() === p.name.toUpperCase();
function glyph(doc: Doc, s: Sym, gid: string) {
  const k = s.part.kind, cx = s.x + s.w - 20, cy = s.y + 20, d = { g: gid };
  if (k === "motor" || k === "servo" || k === "stepper") {
    doc.circle(cx, cy, 11, { stroke: C.body, sw: 1.4, fill: "#ffffff", cls: "sym", data: d });
    doc.text(cx, cy + 4, "M", 11, { bold: true, anchor: "middle", fill: C.body, data: d });
    if (k === "servo") doc.poly([[cx - 8, cy + 16], [cx - 5, cy + 16], [cx - 5, cy + 13], [cx - 1, cy + 13], [cx - 1, cy + 16], [cx + 8, cy + 16]], C.body, 1, { cls: "sym", data: d });
  } else if (k === "sensor") {
    doc.circle(cx, cy, 9, { stroke: C.body, sw: 1.2, fill: "#ffffff", cls: "sym", data: d });
    for (const r of [4, 7]) doc.path([["M", cx + r * 0.7, cy - r * 0.7], ["C", cx + r * 1.1, cy - r * 0.3, cx + r * 1.1, cy + r * 0.3, cx + r * 0.7, cy + r * 0.7]], { stroke: C.body, sw: 1, cls: "sym", data: d });
  } else if (k === "regulator" || k === "psu") {
    doc.rect(cx - 12, cy - 9, 24, 18, { stroke: C.body, sw: 1.1, fill: "#ffffff", cls: "sym", data: d });
    doc.line(cx - 12, cy + 9, cx + 12, cy - 9, C.body, 0.8, { cls: "sym", data: d });
    doc.text(cx - 6, cy - 1, k === "psu" ? "~" : "=", 8, { anchor: "middle", fill: C.body, data: d });
    doc.text(cx + 6, cy + 7, "=", 8, { anchor: "middle", fill: C.body, data: d });
  } else if (k === "led") {
    doc.path([["M", cx - 7, cy - 7], ["L", cx + 5, cy], ["L", cx - 7, cy + 7], ["Z"]], { stroke: C.body, sw: 1.2, fill: "#ffffff", cls: "sym", data: d });
    doc.line(cx + 5, cy - 7, cx + 5, cy + 7, C.body, 1.4, { cls: "sym", data: d });
  } else {
    // an IC outline with a notch
    doc.rect(cx - 9, cy - 11, 18, 22, { stroke: C.body, sw: 1.1, fill: "#ffffff", cls: "sym", data: d });
    doc.circle(cx - 4, cy - 6, 1.6, { fill: C.body, cls: "sym", data: d });
  }
}
/** Label, power symbol or ground symbol at a pin end, pointing away along `out`. */
function drawAnn(doc: Doc, n: CNode, at: Pt, out: Heading, mode: Mode, gid: string) {
  const [x, y] = at, data = { g: gid, name: n.name, at: `${x},${y}` };
  if (mode === "label") {
    const L = textWidth(n.name, F.label) + 16, h = 7;
    const kindCol = n.kind === "cable" ? C.bus : C.label;
    // a flag pointing back at the pin
    const pts: Pt[] = out === 2 ? [[x, y], [x - 7, y - h], [x - L, y - h], [x - L, y + h], [x - 7, y + h]] : out === 0 ? [[x, y], [x + 7, y - h], [x + L, y - h], [x + L, y + h], [x + 7, y + h]] : out === 3 ? [[x, y], [x - h, y - 7], [x - h, y - L], [x + h, y - L], [x + h, y - 7]] : [[x, y], [x - h, y + 7], [x - h, y + L], [x + h, y + L], [x + h, y + 7]];
    doc.poly(pts, kindCol, 1, { close: true, fill: n.kind === "cable" ? "#eef2ff" : "#ffffff", cls: "ann label", data });
    if (out === 0 || out === 2) doc.text(out === 2 ? x - 9 : x + 9, y + 3.2, n.name, F.label, { anchor: out === 2 ? "end" : "start", fill: kindCol, data: { g: gid } });
    else doc.text(x + 3.2, out === 3 ? y - 9 : y + 9, n.name, F.label, { anchor: out === 3 ? "start" : "end", rot: -90, fill: kindCol, data: { g: gid } });
    return;
  }
  const t = flagText(n);
  if (mode === "power") {
    if (out === 3 || out === 1) {
      const s = out === 3 ? -1 : 1;
      doc.line(x, y, x, y + s * 8, C.power, 1.2, { cls: "ann power", data });
      doc.line(x - 7, y + s * 8, x + 7, y + s * 8, C.power, 1.6, { cls: "ann", data: { g: gid } });
      doc.text(x, out === 3 ? y - 12 : y + 20, t, F.power, { anchor: "middle", bold: true, fill: C.power, data: { g: gid } });
    } else {
      const s = out === 2 ? -1 : 1;
      doc.line(x, y, x + s * 8, y, C.power, 1.2, { cls: "ann power", data });
      doc.line(x + s * 8, y - 6, x + s * 8, y + 6, C.power, 1.6, { cls: "ann", data: { g: gid } });
      doc.text(x + s * 12, y + 3.2, t, F.power, { anchor: s < 0 ? "end" : "start", bold: true, fill: C.power, data: { g: gid } });
    }
    return;
  }
  // ground: a stem and three bars getting shorter
  if (out === 1 || out === 3) {
    const s = out === 1 ? 1 : -1;
    doc.line(x, y, x, y + s * 5, C.power, 1.2, { cls: "ann power", data });
    [9, 6, 3].forEach((hw, i) => doc.line(x - hw, y + s * (5 + i * 3), x + hw, y + s * (5 + i * 3), C.power, 1.4, { cls: "ann", data: { g: gid } }));
    if (t) doc.text(x, out === 1 ? y + 24 : y - 17, t, F.power, { anchor: "middle", fill: C.power, data: { g: gid } });
  } else {
    const s = out === 0 ? 1 : -1;
    doc.line(x, y, x + s * 5, y, C.power, 1.2, { cls: "ann power", data });
    [9, 6, 3].forEach((hw, i) => doc.line(x + s * (5 + i * 3), y - hw, x + s * (5 + i * 3), y + hw, C.power, 1.4, { cls: "ann", data: { g: gid } }));
    if (t) doc.text(x + s * 16, y + 3.2, t, F.power, { anchor: s < 0 ? "end" : "start", fill: C.power, data: { g: gid } });
  }
}

// ------------------------------------------------------------------------------------------- frame, notes, title block
function frame(doc: Doc, W: number, H: number) {
  doc.rect(10, 10, W - 20, H - 20, { stroke: C.frame, sw: 1.2, cls: "frame" });
  doc.rect(20, 20, W - 40, H - 40, { stroke: C.frame, sw: 0.8, cls: "frame" });
  const nx = Math.max(4, Math.round(W / 250)), ny = Math.max(3, Math.round(H / 250));
  for (let i = 0; i < nx; i++) {
    const x0 = 20 + ((W - 40) * i) / nx, x1 = 20 + ((W - 40) * (i + 1)) / nx;
    if (i) { doc.line(x0, 10, x0, 20, C.frame, 0.8, { cls: "frame" }); doc.line(x0, H - 20, x0, H - 10, C.frame, 0.8, { cls: "frame" }); }
    doc.text((x0 + x1) / 2, 18, String(i + 1), 7, { anchor: "middle", fill: C.frame, data: { g: "frame" } });
    doc.text((x0 + x1) / 2, H - 12, String(i + 1), 7, { anchor: "middle", fill: C.frame, data: { g: "frame" } });
  }
  for (let j = 0; j < ny; j++) {
    const y0 = 20 + ((H - 40) * j) / ny, y1 = 20 + ((H - 40) * (j + 1)) / ny;
    if (j) { doc.line(10, y0, 20, y0, C.frame, 0.8, { cls: "frame" }); doc.line(W - 20, y0, W - 10, y0, C.frame, 0.8, { cls: "frame" }); }
    const L = String.fromCharCode(65 + j);
    doc.text(15, (y0 + y1) / 2 + 2.5, L, 7, { anchor: "middle", fill: C.frame, data: { g: "frame" } });
    doc.text(W - 15, (y0 + y1) / 2 + 2.5, L, 7, { anchor: "middle", fill: C.frame, data: { g: "frame" } });
  }
}
function hash(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
function titleBlock(doc: Doc, W: number, H: number, TBW: number, TBH: number, robot: string, size: string, w: WiringRecord) {
  const x = W - 20 - TBW, y = H - 20 - TBH, d = { g: "title" };
  doc.rect(x, y, TBW, TBH, { stroke: C.frame, sw: 1.2, fill: "#ffffff", cls: "titleblock", data: d });
  for (const yy of [y + 22, y + 52, y + 74, y + 92]) doc.line(x, yy, x + TBW, yy, C.frame, 0.8, { data: d });
  doc.line(x + 210, y + 74, x + 210, y + TBH, C.frame, 0.8, { data: d });
  doc.line(x + 310, y + 74, x + 310, y + TBH, C.frame, 0.8, { data: d });
  doc.text(x + 6, y + 15, "Text to Robot", 10, { bold: true, fill: C.frame, data: d });
  doc.text(x + TBW - 6, y + 15, "generated from design.wiring", 8, { anchor: "end", fill: C.frame, data: d });
  doc.text(x + 6, y + 32, "Title:", 7, { fill: C.frame, data: d });
  doc.text(x + 6, y + 47, `${robot}: schematic`, F.title, { bold: true, data: d });
  doc.text(x + 6, y + 67, `${w.instances.length} parts, ${w.nets.length} nets, ${w.cables.reduce((a, c) => a + c.wires.length, 0)} wires, ${w.rails.length} rail${w.rails.length === 1 ? "" : "s"}`, 9, { data: d });
  doc.text(x + 6, y + 86, `Size: ${size}`, 9, { data: d });
  doc.text(x + 216, y + 86, `Rev: ${hash(JSON.stringify(w.nets))}`, 9, { data: d });
  doc.text(x + 316, y + 86, "Sheet 1 / 1", 9, { data: d });
  doc.text(x + 6, y + 104, "File: schematic.svg", 9, { data: d });
  doc.text(x + 216, y + 104, "KiCad symbol style", 9, { data: d });
  doc.text(x + 316, y + 104, "Id: 1/1", 9, { data: d });
}
/** Rails and protection, in the lower left corner. */
function notesBlock(w: WiringRecord, m: CircuitModel) {
  const lines: [string, boolean][] = [["Power rails", true]];
  const wrap = (t: string) => { const out: string[] = []; let cur = ""; for (const wd of t.split(" ")) { if (cur && textWidth(`${cur} ${wd}`, F.note) > 640) { out.push(cur); cur = `    ${wd}`; } else cur = cur ? `${cur} ${wd}` : wd; } if (cur) out.push(cur); return out; };
  const add = (t: string) => { for (const l of wrap(t)) lines.push([l, false]); };
  for (const r of w.rails) add(`${r.name}  ${r.voltage_v} V from ${m.part.get(r.source)?.ref ?? r.source}: load ${r.typical_a} A typical, ${r.peak_a} A peak; source ${r.continuous_a} A cont, ${r.peak_limit_a} A peak${r.fuse_a ? `; fuse ${r.fuse_a} A` : ""}`);
  if (w.fuses.length) add(`Fuses: ${w.fuses.map((f) => `${f.id} ${f.rating_a} A (${f.protects})`).join(", ")}. Branch fuses sit inline in the lead they protect.`);
  if (m.splices.length) add(`Lever splices (${m.splices.join(", ")}) are junctions of their nets.`);
  add("Same net label or power symbol = same conductor. X = pin not connected.");
  if (m.emptyNets.length) add(`Declared, no pins: ${m.emptyNets.join(", ")}`);
  const width = Math.max(...lines.map(([s, b]) => textWidth(s, F.note, b))) + 20, h = lines.length * 14 + 14;
  return {
    w: width, h,
    items: (_W: number, H: number) => {
      const d = new Doc(0, 0), x = 30, y = H - 20 - 10 - h;
      d.rect(x, y, width, h, { stroke: C.frame, sw: 0.8, fill: "#ffffff", cls: "notes", data: { g: "notes" } });
      lines.forEach(([s, b], i) => d.text(x + 10, y + 18 + i * 14, s, F.note, { bold: b, data: { g: "notes" } }));
      return d.items;
    },
  };
}
