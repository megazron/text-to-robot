// WIRING.md and the wiring diagram SVG, both straight from a design's wiring record.
import { part, electrical } from "@ttr/parts";
import type { WiringRecord, CableRec } from "./wiring.ts";
import { electricalReport, electricalMarkdown } from "./circuit/electrical.ts";
import { schematic } from "./circuit/schematic.ts";
import { breadboard } from "./circuit/breadboard.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const short = (t: string) => t.split(".").filter((_, i) => i !== 1).join(".");
const conn = (c: CableRec) => (c.premade ? c.premade : `${c.from_connector.split(",")[0]} / ${c.to_connector.split(",")[0]}`);

/** WIRING.md: power budget, pin-to-pin table, cut list, joints, fuses, what to buy. */
export function wiringMarkdown(w: WiringRecord, robot: string): string {
  const o: string[] = [`# Wiring: ${robot}`, "", `${w.cables.length} cables, ${w.cables.reduce((s, c) => s + c.wires.length, 0)} conductors, ${w.total_wire_m} m of wire, wiring parts $${w.cost_usd.toFixed(2)}.`, ""];
  o.push("Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.", "");
  o.push("## Power budget", "", "| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |", "|---|--:|---|--:|--:|--:|--:|--:|");
  for (const r of w.rails) o.push(`| ${r.name} | ${r.voltage_v} | ${r.source} | ${r.continuous_a} / ${r.peak_limit_a} | ${r.typical_a} / ${r.peak_a} | ${r.typical_a > 0 ? (r.continuous_a / r.typical_a).toFixed(1) : "-"}x | ${r.fuse_a ?? "-"} | ${r.worst_drop_v} |`);
  o.push("");
  for (const r of w.rails) { o.push(`**${r.name} loads** (peak assumes ${r.simultaneous}):`, "", "| Load | Typical A | Peak A |", "|---|--:|--:|", ...r.loads.map((l) => `| ${l.inst} | ${l.typical_a} | ${l.peak_a} |`), ""); }
  if (w.main_switch || w.fuses.length) {
    o.push("## Protection", "");
    if (w.main_switch) o.push(`- Main switch: **${w.main_switch}** breaks the positive feed after the fuse. Ground is never switched.`);
    for (const f of w.fuses) o.push(`- Fuse **${f.id}**: ${f.rating_a} A ${f.holder}, protects ${f.protects} (${f.wire_awg} AWG).`);
    o.push("- All grounds meet at one star point. Every signal has its return through that common ground.", "");
  }
  o.push("## Pin-to-pin table", "", "| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |", "|---|---|---|---|---|--:|---|--:|--:|");
  for (const c of w.cables) for (const x of c.wires) o.push(`| ${c.id} | ${x.id} | ${x.net} | ${short(x.from)} | ${short(x.to)} | ${x.awg ?? "made"} | ${x.color} | ${x.typical_a} | ${x.peak_a} |`);
  o.push("", "## Cut list", "", "Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.", "", "| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |", "|---|---|--:|--:|--:|--:|--:|--:|---|---|");
  for (const c of w.cables) o.push(`| ${c.id} | ${c.label} | ${c.wires.length} | ${c.length_mm} | ${c.route_mm} | ${c.service_mm} | ${c.slack_mm} | ${c.termination_mm} | ${conn(c)} | ${c.exit ?? "-"} |`);
  const js = w.cables.flatMap((c) => c.joints.map((j) => ({ c, j })));
  if (js.length) {
    o.push("", "## Slack at the joints", "", "Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.", "", "| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |", "|---|---|---|--:|--:|--:|");
    for (const { c, j } of js) o.push(`| ${c.id} | ${j.joint} | ${j.travel[0]} to ${j.travel[1]} | ${j.home_mm} | ${j.need_mm} | ${j.slack_mm} |`);
  }
  o.push("", electricalMarkdown(electricalReport(w)).trimEnd());
  o.push("", "## Wiring parts to buy", "", "| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |", "|---|--:|---|--:|--:|---|---|");
  for (const b of w.bom) o.push(`| ${b.item} | ${b.qty} | ${b.unit} | ${b.unit_usd} | ${b.subtotal_usd.toFixed(2)} | ${b.spec} | ${b.source} |`);
  o.push("", "## Data sources", "");
  const parts = [...new Set(w.instances.map((i) => i.key))].sort();
  o.push("| Part | Voltage | Current | Pins | Connector |", "|---|---|---|---|---|");
  for (const k of parts) { const e = electrical(k); if (!e) continue; const s = (x?: { src: string; url?: string }) => (!x ? "-" : x.src === "datasheet" && x.url ? `[datasheet](${x.url})` : x.src); o.push(`| ${part(k).name.split(" (")[0]} | ${s(e.voltage_v)} | ${s(e.current_a)} | ${s(e.ports[0]?.pins)} | ${s(e.ports[0]?.connector)} |`); }
  if (w.notes.length) o.push("", "## Notes", "", ...w.notes.map((n) => `- ${n}`));
  return o.join("\n") + "\n";
}

const COLS: [string, RegExp][] = [["Source", /^(battery|psu)$/], ["Protection", /^(protection|switch|splice)$/], ["Regulation", /^regulator$/], ["Control", /^(controller|adapter|carrier)$/], ["Drivers", /^driver$/], ["Loads", /.*/]];
const STROKE: Record<string, string> = { power: "#c8102e", ground: "#111111", signal: "#1f6fd1", bus: "#0a8f5b" };

/** Block diagram: parts in columns from source to load, each with the pins this robot uses, wires drawn pin to pin. */
export function wiringSvg(w: WiringRecord, robot: string): string {
  const role = (k: string) => electrical(k)?.role ?? "load";
  const used = new Map<string, string[]>();
  for (const c of w.cables) for (const x of c.wires) for (const t of [x.from, x.to]) { const [i, , p] = t.split("."); const l = used.get(i) ?? []; if (!l.includes(p)) l.push(p); used.set(i, l); }
  const cols = COLS.map(() => [] as string[]);
  for (const i of w.instances) { if (!used.has(i.name)) continue; cols[COLS.findIndex(([, re]) => re.test(role(i.key)))].push(i.name); }
  const BW = 190, GAP = 150, LH = 13, HEAD = 22, VG = 18, M = 30, TOP = 74;
  const pos = new Map<string, { x: number; y: number; h: number }>();
  let H = 0;
  const live = cols.map((c, i) => ({ c, i })).filter(({ c }) => c.length);
  live.forEach(({ c }, ci) => { let y = TOP; for (const n of c) { const h = HEAD + used.get(n)!.length * LH + 6; pos.set(n, { x: M + ci * (BW + GAP), y, h }); y += h + VG; } H = Math.max(H, y); });
  const Wd = M * 2 + live.length * BW + (live.length - 1) * GAP;
  const pinY = (n: string, p: string) => { const q = pos.get(n)!; return q.y + HEAD + used.get(n)!.indexOf(p) * LH + 9; };
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${H + 40}" width="${Wd}" height="${H + 40}" font-family="Helvetica, Arial, sans-serif" font-size="10.5">`, `<rect width="100%" height="100%" fill="#ffffff"/>`, `<text x="${M}" y="26" font-size="17" font-weight="700">${esc(robot)}: wiring diagram</text>`];
  let lx = M;
  for (const [k, c] of Object.entries(STROKE)) { out.push(`<line x1="${lx}" y1="44" x2="${lx + 24}" y2="44" stroke="${c}" stroke-width="2"/><text x="${lx + 30}" y="48">${k}</text>`); lx += 90; }
  live.forEach(({ i }, ci) => out.push(`<text x="${M + ci * (BW + GAP)}" y="66" font-weight="700" fill="#555">${COLS[i][0]}</text>`));
  // wires under the boxes; every wire gets its own lane in the gap it crosses
  let lane = 0;
  for (const c of w.cables) for (const x of c.wires) {
    const [ai, , ap] = x.from.split("."), [bi, , bp] = x.to.split("."), a = pos.get(ai), b = pos.get(bi);
    if (!a || !b) continue;
    const ya = pinY(ai, ap), yb = pinY(bi, bp), right = a.x <= b.x;
    const xa = right ? a.x + BW : a.x, xb = right ? b.x : b.x + BW, off = 14 + (lane++ % 12) * 10;
    const m1 = right ? xa + off : xa - off, m2 = right ? xb - off : xb + off;
    out.push(`<path d="M${xa} ${ya} H${m1} V${(ya + yb) / 2} H${m2} V${yb} H${xb}" fill="none" stroke="${STROKE[x.kind]}" stroke-width="${x.awg && x.awg <= 18 ? 2 : 1.1}" opacity="0.8"><title>${esc(`${c.id} ${x.id} ${x.net}: ${x.from} to ${x.to}${x.awg ? `, ${x.awg} AWG` : ""}`)}</title></path>`);
  }
  for (const i of w.instances) {
    const q = pos.get(i.name); if (!q) continue;
    out.push(`<rect x="${q.x}" y="${q.y}" width="${BW}" height="${q.h}" rx="5" fill="#f4f6f8" stroke="#333"/><text x="${q.x + 7}" y="${q.y + 15}" font-weight="700">${esc(i.name)}</text>`);
    for (const p of used.get(i.name)!) out.push(`<text x="${q.x + 7}" y="${pinY(i.name, p) + 3.5}" fill="#333">${esc(p)}</text>`);
  }
  out.push("</svg>");
  return out.join("\n") + "\n";
}

/** Every wiring deliverable of a robot: WIRING.md, the cable diagram, the schematic (SVG and PDF) and the breadboard view. */
export function circuitFiles(w: WiringRecord, robot: string): Record<string, string | Uint8Array> {
  const sch = schematic(w, robot), bb = breadboard(w, robot);
  return { "WIRING.md": wiringMarkdown(w, robot), "wiring.svg": wiringSvg(w, robot), "schematic.svg": sch.svg, "schematic.pdf": sch.pdf, "breadboard.svg": bb.svg };
}
