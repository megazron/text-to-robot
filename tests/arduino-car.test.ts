// Arduino car: cheap parts, every check passes, printed parts are exact solids, tiers differ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "@ttr/robot-schema";
import { arduinoCarOptions, designArduinoCar } from "@ttr/design";

const [cheapest, stronger] = arduinoCarOptions({ prompt: "arduino car" });
const d = (s: any) => s.metadata.design;

test("both tiers are valid robots and pass every engineering and print check", () => {
  for (const s of [cheapest, stronger]) {
    const v = validateSpec(s);
    assert.ok(v.valid, v.issues.map((i: any) => i.message).join("; "));
    for (const c of d(s).checks) assert.ok(c.pass, `${d(s).performance.tier} ${c.name}: ${c.detail}`);
    assert.ok(d(s).checks.some((c: any) => c.name === "clearance:home"));
  }
});

test("only cheap Arduino-ecosystem parts are bought", () => {
  const allowed = /^(arduino_|tt_gearmotor|wheel_65mm_tt|tb6612|breadboard|hc_sr04|pack_2s_18650|ball_caster)/;
  for (const s of [cheapest, stronger]) for (const p of d(s).purchased) assert.match(p.key, allowed, p.key);
  for (const s of [cheapest, stronger]) assert.ok(d(s).performance.cost_usd < 60, String(d(s).performance.cost_usd));
});

test("tiers: 2WD with a caster, 4WD with two drivers", () => {
  const joints = (s: any) => s.joints.filter((j: any) => j.type === "continuous" && !j.passive).length;
  assert.equal(joints(cheapest), 2);
  assert.equal(joints(stronger), 4);
  assert.equal(d(stronger).purchased.find((p: any) => p.key === "tb6612fng_module").qty, 2);
});

test("printed parts are CAD-kernel solids (one closed body each, fit the bed)", () => {
  for (const p of d(cheapest).printed) { assert.ok(p.check.watertight, p.name); assert.ok(p.check.fits_bed, p.name); }
  assert.ok(cheapest.links.some((l: any) => l.geometry.type === "mesh" && l.geometry.part === "cad"));
});

test("a budget below the parts cost fails the budget check", () => {
  const s = designArduinoCar({ tier: "cheapest", budget: 10 });
  assert.ok(d(s).checks.some((c: any) => c.name === "budget" && !c.pass));
});
