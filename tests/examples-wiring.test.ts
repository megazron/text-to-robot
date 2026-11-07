// Every shipped example carries its harness and compartments: nets, a rail per voltage, slack at every joint a cable
// crosses, WIRING.md and the diagram beside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { jointSweep, needsEnclosure } from "@ttr/design";

const examples = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort();

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

test("the Mark 43's harness runs inside its shells: out through the bay floors, along the channels, a loop at every joint and door hinge it crosses", () => {
  const spec = JSON.parse(readFileSync("examples/14_iron_man_mark_43/robot.json", "utf8")), d = spec.metadata.design, w = d.wiring;
  const by = (to: string) => w.cables.find((c: any) => c.to === to), crossed = (to: string) => by(to).joints.map((j: any) => j.joint), hinge = "back_door_left_hinge";
  assert.deepEqual(crossed("eye_led_right"), [hinge, "neck", "faceplate"]);
  assert.deepEqual(crossed("faceplate_servo_left"), [hinge, "neck"]);
  assert.deepEqual(crossed("left_repulsor"), [hinge, "left_shoulder", "left_elbow"]);
  assert.deepEqual(crossed("right_repulsor"), [hinge, "right_shoulder", "right_elbow"]);
  assert.deepEqual(crossed("arc_reactor"), [hinge]);
  // the battery bay's cables each take a service loop at the door's real travel; the limbs' servo leads never cross a door
  for (const c of w.cables.filter((x: any) => x.joints.some((j: any) => j.joint === hinge))) { const j = c.joints.find((x: any) => x.joint === hinge); assert.ok(j.travel[0] < -1.2 && j.slack_mm >= j.need_mm - j.home_mm, c.id); }
  for (const c of w.cables.filter((x: any) => /^servo_driver_/.test(x.from) && /(arm|thigh|shin|forearm)/.test(x.to))) assert.ok(!c.joints.some((j: any) => /door/.test(j.joint)), `${c.id} stays off the doors`);
  for (const c of w.cables.filter((x: any) => x.exit)) { assert.match(c.exit, /^(back_bay\.leads_\d|drive_(left|right)\.leads)/); assert.ok(c.joints.length === 0 || c.channel_mm > 50, `${c.id} lies in the channels`); }
  // the compartments are the only electrics outside the shell: battery bay on the left door, clear of the centre line; a driver board each side, on the fixed half
  assert.deepEqual(d.enclosures.map((b: any) => [b.name, b.parent]), [["back_bay", "back_door_left"], ["drive_left", "pelvis"], ["drive_right", "pelvis"]]);
  for (const n of ["battery", "controller", "regulator", "regulator_lights", "regulator_doors", "main_switch"]) assert.ok(d.enclosures[0].parts.includes(n), n);
  assert.ok(d.fasteners["M3 x 10 self-tapping (lid to compartment)"] >= 4);
  assert.ok(w.rails.some((r: any) => r.name === "5V_DOORS" && r.source === "regulator_doors" && r.ok));
  const channels = spec.links.filter((l: any) => /^chan_/.test(l.name));
  assert.ok(channels.length >= 14 && channels.every((l: any) => d.printed.some((p: any) => p.name === l.name)));
  assert.ok(!channels.some((l: any) => /spine/.test(l.name)), "nothing runs across the centre split");
});
