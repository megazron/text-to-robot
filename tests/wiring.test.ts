// Wiring model: gauge from current, fuse sizing, slack at full joint travel, and the three Arduino robots end to end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { designArduinoCar, gaugeFor, fuseFor, connectorFamily, jointSweep, wiringMarkdown, wiringSvg, needsEnclosure } from "@ttr/design";
import { buildBom } from "@ttr/components";
import { generateCadFiles } from "@ttr/cad";
import { CATALOG } from "@ttr/parts";

test("gauge grows with current and with length", () => {
  assert.ok(gaugeFor(0.5, 200, 0.2).awg >= gaugeFor(5, 200, 0.2).awg);
  assert.ok(gaugeFor(3, 3000, 0.1).awg < gaugeFor(3, 100, 0.1).awg);
  assert.equal(fuseFor(4.1), 5);
});
test("connector text maps to the right family", () => {
  assert.equal(connectorFamily("JST B3B-EH-A header, 3-pin"), "jst_ehr_2_5");
  assert.equal(connectorFamily("XT60 (male discharge plug)"), "xt60");
  assert.equal(connectorFamily("USB-C receptacle"), "premade");
  assert.equal(connectorFamily("0.1 in header"), "dupont_2_54");
});
test("a revolute's sweep needs the arc, a prismatic's the stroke", () => {
  const j: any = { type: "revolute", limit: { lower: -Math.PI / 2, upper: Math.PI / 2 } };
  const s = jointSweep(j, [20, 0, 0], [20, 0, 0], [0, 0, 0], [0, 0, 1]);
  assert.ok(Math.abs(s.need - 20 * Math.PI / 2) < 0.5, String(s.need));
  assert.equal(s.home, 0);
  const p = jointSweep({ type: "prismatic", limit: { lower: 0, upper: 100 } } as any, [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 1]);
  assert.equal(p.need, 100);
});

const s = designArduinoCar({ tier: "stronger" }), d = (s.metadata as any).design, w = d.wiring;
test("every wiring and enclosure check is present and passes on the 4WD car", () => {
  for (const n of ["wiring:ports", "wiring:gauge", "wiring:connector", "wiring:fuse", "wiring:switch", "wiring:ground", "wiring:slack", "wiring:rail:VBAT", "enclosure:lid:electronics_bay", "enclosure:exits:electronics_bay", "enclosure:usb:controller", "enclosure:switch:electronics_bay", "enclosure:vent:electronics_bay"]) assert.ok(d.checks.find((c: any) => c.name === n)?.pass, n);
  for (const c of d.checks) assert.ok(c.pass, `${c.name}: ${c.detail}`);
});
test("no loose electronics: every part that needs a compartment has an inside and a clearance check", () => {
  for (const l of s.links) {
    if (l.geometry.type !== "mesh" || l.geometry.part !== "component") continue;
    const k = String(l.geometry.params?.key);
    if (!needsEnclosure(k) || CATALOG[k].category === "sensor") continue;
    for (const c of [`enclosure:inside:${l.name}`, `enclosure:clearance:${l.name}`]) assert.ok(d.checks.find((x: any) => x.name === c), c);
  }
});
test("all of the battery current passes the main fuse; a motor's wire reaches the driver", () => {
  assert.equal(w.rails[0].name, "VBAT");
  assert.ok(w.rails[0].fuse_a >= w.rails[0].typical_a * 1.25);
  const hasPin = (t: RegExp) => w.cables.some((c: any) => c.wires.some((x: any) => t.test(x.from) || t.test(x.to)));
  assert.ok(hasPin(/^motor_driver_1\.motor_a\.AO1/) && hasPin(/^front_left_motor\.motor\.M\+/) && hasPin(/^star_ground/));
});
test("outputs: WIRING.md, the SVG, real BOM lines, in the CAD export", () => {
  const md = wiringMarkdown(w, s.robot_name), svg = wiringSvg(w, s.robot_name);
  for (const h of ["## Power budget", "## Pin-to-pin table", "## Cut list", "## Wiring parts to buy"]) assert.ok(md.includes(h), h);
  assert.match(svg, /^<svg/); assert.ok(svg.includes("controller"));
  const bom = buildBom(s), lines = bom.lines.filter((l) => l.category === "Wiring");
  assert.ok(lines.some((l) => /AWG silicone wire/.test(l.name)) && lines.some((l) => /Heat shrink/.test(l.name)) && lines.some((l) => /Cable tie/.test(l.name)) && lines.some((l) => /grommet/i.test(l.name)));
  assert.ok(!bom.lines.some((l) => /12%|~12/.test(l.spec)));
  const cad = generateCadFiles(s);
  assert.ok(cad["cad/WIRING.md"] && cad["cad/wiring.svg"]);
});
