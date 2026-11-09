// Schematic and breadboard view of every example: the drawing is clean (nothing overlaps, no wire through a symbol or a
// label), the schematic's connectivity read back from the SVG alone equals the wiring record, every wire of the record
// is drawn once in its colour, and the electrical calculations hold their arithmetic and catch a wrong logic level.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { schematic, breadboard, layoutProblems, netlistFromSvg, electricalReport, wiringMarkdown, USABLE, WIRE_HEX, type WiringRecord } from "@ttr/design";
import { Doc } from "../packages/design/src/circuit/draw.ts";
import { ELECTRICAL, electrical, type Sourced } from "@ttr/parts";

const examples = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort();
const wiringOf = (ex: string): { w: WiringRecord; name: string } => { const s = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")); return { w: s.metadata.design.wiring, name: s.robot_name }; };

/**
 * The conductors a wiring record defines, worked out here independently of the drawing code: the record's wires joined
 * end to end, a lever splice joins its levers, a part ties pins of the same name together (not separate USB or camera
 * sockets), and a bought lead joins the pins of the two ports it plugs into.
 */
function conductors(w: WiringRecord): string[][] { return tagged(w).map((c) => c.pins); }
function tagged(w: WiringRecord): { pins: string[]; nets: Set<string> }[] {
  const key = new Map(w.instances.map((i) => [i.name, i.key]));
  const role = (t: string) => electrical(key.get(t.split(".")[0])!)?.role;
  const sig = (t: string) => { const [i, p, n] = t.split("."); return electrical(key.get(i)!)!.ports.find((q) => q.name === p)!.pins.v.find((q) => q.name === n)!.signal; };
  const P = new Map<string, string>(), find = (x: string): string => { let r = x; while ((P.get(r) ?? r) !== r) r = P.get(r)!; return r; }, join = (a: string, b: string) => P.set(find(a), find(b));
  const k = (t: string) => (role(t) === "splice" ? `splice:${t.split(".")[0]}` : t);
  const terms = new Set<string>(), out: { pins: string[]; nets: Set<string> }[] = [];
  const premade = new Set(w.cables.filter((c) => c.premade).flatMap((c) => c.wires.map((x) => x.net)));
  for (const c of w.cables) if (!c.premade) for (const x of c.wires) { join(k(x.from), k(x.to)); for (const t of [x.from, x.to]) if (role(t) !== "splice") terms.add(t); }
  const first = new Map<string, string>();
  for (const t of terms) { const [i, , n] = t.split("."); if (["usb", "csi"].includes(sig(t)) || n === "LINK") continue; const id = `${i}|${n}`; if (first.has(id)) join(t, first.get(id)!); else first.set(id, t); }
  const g = new Map<string, string[]>(); for (const t of terms) g.set(find(t), [...(g.get(find(t)) ?? []), t]);
  for (const pins of g.values()) out.push({ pins, nets: new Set(w.nets.filter((n) => !premade.has(n.name) && n.pins.some((p) => pins.includes(p) || (role(p) === "splice" && pins.some((q) => find(k(p)) === find(q))))).map((n) => n.name)) });
  for (const c of w.cables) if (c.premade) for (const x of c.wires) { const ports = [x.from, x.to].map((t) => `${t.split(".").slice(0, 2).join(".")}.`); out.push({ pins: w.nets.find((n) => n.name === x.net)!.pins.filter((p) => ports.some((q) => p.startsWith(q))), nets: new Set([x.net]) }); }
  return out.map((a) => ({ pins: [...new Set(a.pins)].sort(), nets: a.nets })).sort((a, b) => a.pins[0].localeCompare(b.pins[0]));
}

for (const ex of examples) {
  test(`${ex}: schematic is clean and draws exactly the record's netlist`, () => {
    const { w, name } = wiringOf(ex), r = schematic(w, name);
    assert.deepEqual(layoutProblems(r.doc), [], `${ex}: layout`);
    // connectivity from the drawing alone (pin ends, wires, junction dots, labels and power symbols) equals the record
    assert.deepEqual(netlistFromSvg(r.svg), conductors(w), `${ex}: netlist read back from schematic.svg`);
    // every net of the record with pins is in exactly the conductors it should be, with no pin left out
    const drawn = new Map<string, number>(); for (const n of r.netlist.nodes) for (const net of n.nets) drawn.set(net, (drawn.get(net) ?? 0) + 1);
    const pinsDrawn = new Set(r.netlist.nodes.flatMap((n) => n.pins.flatMap((p) => p.members)));
    for (const n of w.nets) {
      if (!n.pins.length) { assert.ok(r.netlist.empty_nets.includes(n.name), `${ex}: empty net ${n.name} not noted`); continue; }
      const expect = tagged(w).filter((c) => c.nets.has(n.name)).length;
      assert.equal(drawn.get(n.name), expect, `${ex}: net ${n.name} drawn ${drawn.get(n.name)} times, the record makes ${expect} conductors of it`);
      for (const p of n.pins) if (!r.netlist.splices.includes(p.split(".")[0])) assert.ok(pinsDrawn.has(p), `${ex}: ${n.name} pin ${p} not drawn`);
    }
    // reference designators are unique and every part is on the sheet once
    const refs = r.netlist.parts.map((p) => p.ref);
    assert.equal(new Set(refs).size, refs.length, `${ex}: duplicate reference designators`);
    // a rail's power symbol carries its voltage
    for (const rail of w.rails) if (r.netlist.nodes.some((n) => n.name === rail.name && n.drawn === "power")) assert.ok(r.svg.includes(`>${rail.name} ${+rail.voltage_v.toFixed(2)}V<`) || (/^\+?\d+V\d*$/.test(rail.name) && r.svg.includes(`>${rail.name}<`)), `${ex}: ${rail.name} power symbol without its voltage`);
    assert.match(r.svg, /Title:/); assert.match(r.svg, /Rev: [0-9a-f]{8}/);
    assert.equal(String.fromCharCode(...r.pdf.slice(0, 8)), "%PDF-1.4");
    assert.equal(readFileSync(`examples/${ex}/schematic.svg`, "utf8"), r.svg, `${ex}: schematic.svg is stale: node scripts/export_circuits.ts`);
  });
  test(`${ex}: breadboard view is clean and draws every wire once in its colour`, () => {
    const { w, name } = wiringOf(ex), r = breadboard(w, name);
    assert.deepEqual(r.unrouted, [], `${ex}: wires the router could not lay`);
    assert.deepEqual(layoutProblems(r.doc), [], `${ex}: layout`);
    const drawn = [...r.svg.matchAll(/<path[^>]*stroke="(#[0-9a-f]{6})"[^>]*class="wire"[^>]*data-wire="(W\d+)"/g)].map((m) => [m[2], m[1]]);
    const wires = w.cables.flatMap((c) => c.wires.map((x) => ({ ...x, premade: c.premade })));
    assert.equal(drawn.length, wires.length, `${ex}: ${drawn.length} wires drawn, the record has ${wires.length}`);
    for (const [id, hex] of drawn) { const x = wires.find((q) => q.id === id)!; assert.equal(hex, WIRE_HEX[x.premade ? "grey" : x.color], `${ex}: ${id} is ${x.color}`); }
    assert.equal(readFileSync(`examples/${ex}/breadboard.svg`, "utf8"), r.svg, `${ex}: breadboard.svg is stale: node scripts/export_circuits.ts`);
    assert.ok(existsSync(`examples/${ex}/schematic.pdf`));
    assert.equal(readFileSync(`examples/${ex}/WIRING.md`, "utf8"), wiringMarkdown(w, name), `${ex}: WIRING.md is stale`);
  });
}

test("the layout check is not blind: overlapping symbols, a wire through a symbol and colliding labels all fail", () => {
  const d = new Doc(400, 300);
  d.rect(50, 50, 100, 60, { fill: "#fff", stroke: "#000", data: { g: "S:U1" } });
  d.rect(120, 80, 100, 60, { fill: "#fff", stroke: "#000", data: { g: "S:U2" } });
  d.poly([[30, 70], [300, 70]], "#080", 1, { cls: "wire", data: { node: "N1" } });
  d.text(60, 200, "LABEL_ONE", 10, { data: { g: "A1" } }); d.text(70, 200, "LABEL_TWO", 10, { data: { g: "A2" } });
  const p = layoutProblems(d);
  assert.ok(p.some((x) => /S:U1 overlaps S:U2/.test(x)), p.join("; "));
  assert.ok(p.some((x) => /wire N1 runs through S:U1/.test(x)), p.join("; "));
  assert.ok(p.some((x) => /LABEL_ONE.*overlaps text "LABEL_TWO"/.test(x)), p.join("; "));
});

test("the netlist read-back is not blind: a missing wire shows up as split conductors", () => {
  const { w, name } = wiringOf("18_arduino_car"), r = schematic(w, name);
  const cut = r.svg.replace(/<polyline[^>]*data-node="CONTROLLER_D5"[^>]*>(<title>[^<]*<\/title><\/polyline>)?/, "");
  assert.notEqual(cut, r.svg);
  assert.notDeepEqual(netlistFromSvg(cut), conductors(w));
});

test("battery runtime and regulator heat follow from the budget (Arduino car)", () => {
  const { w } = wiringOf("18_arduino_car"), e = electricalReport(w), vbat = w.rails.find((r) => r.name === "VBAT")!;
  const [b] = e.runtime;
  assert.equal(b.energy_wh, 18.5);
  assert.ok(Math.abs(b.typical_min - (18.5 * USABLE) / (vbat.voltage_v * vbat.typical_a) * 60) < 0.05, String(b.typical_min));
  assert.ok(b.peak_min < b.typical_min);
  const reg = e.regulators.find((r) => r.to === "5V_LOGIC")!;
  assert.equal(reg.kind, "linear");
  assert.ok(Math.abs(reg.loss_typ_w - (7.2 - 5) * w.rails.find((r) => r.name === "5V_LOGIC")!.typical_a) < 1e-3);
  assert.ok(e.logic.length >= 10 && e.logic.every((l) => l.verdict === "ok"), JSON.stringify(e.logic.filter((l) => l.verdict !== "ok")));
  assert.match(wiringMarkdown(w, "car"), /## Electrical calculations[\s\S]*### Battery runtime[\s\S]*### Regulator heat[\s\S]*### Logic levels/);
});

test("a 5 V echo into a 3.3 V pin and a 3.3 V host on a 5 V LED ring are both caught", () => {
  const inst = (name: string, key: string) => ({ name, key, link: null });
  const wire = (id: string, net: string, from: string, to: string) => ({ id, net, kind: "signal" as const, from, to, awg: 26, color: "blue", typical_a: 0.01, peak_a: 0.01, length_mm: 100 });
  const w = {
    instances: [inst("mcu", "esp32_s3_devkitc1"), inst("sonar", "hc_sr04"), inst("ring", "ws2812_ring_12"), inst("reg", "buck_5v_5a")],
    nets: [{ name: "ECHO", kind: "signal", pins: ["sonar.header.Echo", "mcu.j1.4"] }, { name: "LED", kind: "signal", pins: ["mcu.j1.5", "ring.pads.DIN"] }, { name: "5V", kind: "power", voltage_v: 5, pins: ["reg.power_and_control.VOUT", "ring.pads.5V"] }],
    cables: [{ id: "C1", label: "", from: "sonar", to: "mcu", from_connector: "", to_connector: "", premade: null, wires: [wire("W1", "ECHO", "sonar.header.Echo", "mcu.j1.4")] },
      { id: "C2", label: "", from: "mcu", to: "ring", from_connector: "", to_connector: "", premade: null, wires: [wire("W2", "LED", "mcu.j1.5", "ring.pads.DIN")] },
      { id: "C3", label: "", from: "reg", to: "ring", from_connector: "", to_connector: "", premade: null, wires: [{ ...wire("W3", "5V", "reg.power_and_control.VOUT", "ring.pads.5V"), kind: "power" as const }] }],
    rails: [{ name: "5V", voltage_v: 5, source: "reg", continuous_a: 5, peak_limit_a: 8, typical_a: 0.3, peak_a: 0.7, simultaneous: "", loads: [{ inst: "ring", typical_a: 0.3, peak_a: 0.7 }], fuse_a: null, worst_drop_v: 0, ok: true }],
    fuses: [], main_switch: null, clips: [], bom: [], cost_usd: 0, total_wire_m: 0, notes: [], unconnected: [], estimated_inputs: [],
  } as unknown as WiringRecord;
  const e = electricalReport(w);
  const echo = e.logic.find((l) => l.net === "ECHO")!, led = e.logic.find((l) => l.net === "LED")!;
  assert.equal(echo.verdict, "over_voltage", JSON.stringify(echo));
  assert.equal(led.verdict, "too_low", JSON.stringify(led));
  assert.equal(led.vih, 3.5);
});

test("every logic-level record is sourced and names a real supply pin", () => {
  for (const [k, d] of Object.entries(ELECTRICAL)) {
    const L = d.electrical.logic as Sourced<{ supply_pin?: string; io_v?: number; max_in_v: number }> | undefined; if (!L) continue;
    if (L.src === "datasheet") assert.match(L.url ?? "", /^https?:\/\//, k); else assert.ok(L.note, `${k}: estimated logic levels without a reason`);
    assert.ok(L.v.supply_pin || L.v.io_v, `${k}: no output level`);
    if (L.v.supply_pin) assert.ok(d.electrical.ports.some((p) => p.pins.v.some((x) => x.name === L.v.supply_pin)), `${k}: no pin ${L.v.supply_pin}`);
  }
});
