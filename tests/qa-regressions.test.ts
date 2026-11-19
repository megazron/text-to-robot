// Problems the November QA sweep found on the live site (docs/QA_2026-11.md), each held to its fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, understandPrompt } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";

setDefaultRouter("legacy");

test("a rover with two arms whose walls have no room for the battery switch puts it in the lid, never the 16 A rocker", async () => {
  const r = await generateRobot("mobile manipulator with two arms");
  const sw = r.robot.links.find((l) => l.name === "main_switch");
  assert.equal(sw?.geometry.type === "mesh" ? String(sw.geometry.params?.key) : "", "switch_battery_6006");
  const d = (r.robot.metadata as unknown as { design: { checks: { name: string; pass: boolean }[] } }).design;
  assert.deepEqual(d.checks.filter((c) => !c.pass).map((c) => c.name), []);
});

test("the prompt's own dog, an underwater drone, an Arduino robot", () => {
  assert.notEqual(understandPrompt("a robot that opens the door for my dog").family, "quadruped");
  assert.equal(understandPrompt("a robot dog").family, "quadruped");
  assert.equal(understandPrompt("an underwater drone for my lake").family, "rov");
  assert.equal(understandPrompt("a cheap arduino robot for my 10 year old").family, "arduino_car");
});
