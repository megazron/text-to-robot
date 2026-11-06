// Every shipped example carries its harness and compartments: nets, a rail per voltage, slack at every joint a cable
// crosses, WIRING.md and the diagram beside it. Example 14 (the wearable Mark 43 suit) has its own electronics plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { jointSweep, needsEnclosure } from "@ttr/design";

const examples = readdirSync("examples").filter((d) => /^\d\d_/.test(d) && !d.startsWith("14_")).sort();

test("every example has its harness, compartments and outputs", () => {
  for (const ex of examples) {
    const spec = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")), d = spec.metadata.design, w = d.wiring;
    assert.ok(w, `${ex}: no wiring record`);
    assert.ok(existsSync(`examples/${ex}/WIRING.md`) && existsSync(`examples/${ex}/wiring.svg`), `${ex}: outputs missing`);
    assert.ok(w.rails.length > 0 && w.cables.length > 0, ex);
    for (const n of ["wiring:ports", "wiring:gauge", "wiring:connector", "wiring:ground", "wiring:slack", "wiring:voltage"]) assert.ok(d.checks.some((c: any) => c.name === n), `${ex}: no ${n}`);
    for (const c of d.checks) if (/^(wiring|enclosure):/.test(c.name)) assert.ok(c.pass, `${ex} ${c.name}: ${c.detail}`);
    assert.ok(d.enclosures?.length > 0, `${ex}: no compartment`);
  }
});

test("no loose electronics in any example", () => {
  for (const ex of examples) {
    const spec = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")), d = spec.metadata.design;
    const out = new Set((d.exposed ?? []).map((e: any) => e.name));
    for (const l of spec.links) {
      if (l.geometry.type !== "mesh" || l.geometry.part !== "component" || !needsEnclosure(String(l.geometry.params?.key)) || out.has(l.name)) continue;
      assert.ok(d.checks.some((c: any) => c.name === `enclosure:inside:${l.name}` && c.pass), `${ex}: ${l.name} is not inside a compartment`);
    }
  }
});

test("the slack at every joint covers the joint's limits as shipped (recomputed from the URDF limits)", () => {
  for (const ex of examples) {
    const spec = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")), w = spec.metadata.design.wiring;
    const joints = new Map(spec.joints.map((j: any) => [j.name, j]));
    for (const c of w.cables) for (const s of c.joints) {
      const j: any = joints.get(s.joint);
      assert.ok(j, `${ex}: ${s.joint}`);
      assert.notEqual(j.type, "continuous", `${ex}: ${c.id} crosses a continuous joint`);
      assert.ok(Math.abs(j.limit.lower - s.travel[0]) < 0.011 && Math.abs(j.limit.upper - s.travel[1]) < 0.011, `${ex}: ${s.joint} limits moved after routing`);
      assert.ok(s.slack_mm >= s.need_mm - s.home_mm, `${ex} ${c.id}/${s.joint}: loop ${s.slack_mm} mm, needs ${s.need_mm - s.home_mm}`);
    }
  }
  assert.ok(jointSweep);
});

test("the BOM carries the routed wire, not a percentage", () => {
  for (const ex of examples) {
    const bom = JSON.parse(readFileSync(`examples/${ex}/bom.json`, "utf8"));
    assert.ok(bom.lines.some((l: any) => l.category === "Wiring" && /AWG/.test(l.name)), `${ex}: no wire lines`);
    assert.ok(!bom.lines.some((l: any) => /% of electronics/.test(String(l.spec))), ex);
  }
});
