import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBom, bomToMarkdown } from "@ttr/components";
import { generateScad, generateCadFiles } from "@ttr/cad";
import { finalizeSpec } from "@ttr/robot-generator";
import { nDofArm } from "@ttr/robot-templates";

test("BOM has an actuator for every actuated joint", () => {
  const spec = finalizeSpec(nDofArm(6));
  const bom = buildBom(spec);
  const actuated = spec.joints.filter((j) => j.type !== "fixed").length;
  assert.equal(bom.actuator_sizing.length, actuated);
  assert.ok(bom.total > 0);
});
test("BOM respects budget across tiers", () => {
  const spec = finalizeSpec(nDofArm(6));
  const cheap = buildBom(spec, 400);
  const rich = buildBom(spec, 5000);
  assert.ok(rich.total >= cheap.total);
});
test("BOM flags an impossible budget as infeasible", () => {
  const spec = finalizeSpec(nDofArm(7));
  const bom = buildBom(spec, 10);
  assert.equal(bom.feasible, false);
  assert.ok(bomToMarkdown(bom).includes("Bill of Materials"));
});
test("CAD generates a module per link + assembly", () => {
  const spec = finalizeSpec(nDofArm(6));
  const scad = generateScad(spec);
  assert.ok(scad.includes("_assembly()"));
  for (const l of spec.links) assert.ok(scad.includes("part_" + l.name));
  assert.ok(Object.keys(generateCadFiles(spec)).some((k) => k.endsWith(".scad")));
});

test('catalogue sizing does not select hypothetical actuators or certify hardware', async()=>{
  const {ACTUATORS}=await import('../packages/components/src/catalog.ts');
  const motor=ACTUATORS.find(a=>a.name==='CubeMars AK80-64')!;
  assert.equal(motor.torque,48);assert.equal(motor.peak_torque,120);
  const spec=finalizeSpec(nDofArm(6));
  for(const j of spec.joints)if(j.limit)j.limit.effort=10000;
  const bom=buildBom(spec,1000000);
  assert.equal(bom.hardware_verified,false);
  assert.equal(bom.sizing_pass,false);
  assert.ok(bom.actuator_sizing.every(s=>!s.chosen.includes('Harmonic Drive')));
});
