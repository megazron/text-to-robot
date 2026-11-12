// "Build from my parts": the parts-list reader (quantities, model names, loose names, typos, Hinglish, shopping lists,
// kits) and the ranking of what a list builds, with its honesty checks. Fast: nothing here runs the designers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInventory, toInventory, isInventoryPrompt, searchParts, quantity, fromParts, rankOptions, carPower, servoPower } from "@ttr/robot-generator";
import { PARTS_PROMPTS } from "./parts-prompts.ts";

const have = (text: string) => Object.fromEntries(parseInventory(text).items.map((i) => [i.key, i.qty]));

test("the owner's sentence: every part with its count", () => {
  assert.deepEqual(have("I have an Arduino Uno, 2 TT gear motors, an L298N, an HC-SR04, 4 AA batteries and a servo SG90"),
    { arduino_uno_clone: 1, tt_gearmotor_1to48: 2, l298n_module: 1, hc_sr04: 1, battery_holder_4aa: 1, hobby_sg90: 1 });
});
test("quantities: digits, x counts, words, pairs, packs", () => {
  assert.equal(quantity("2x sg90").qty, 2);
  assert.equal(quantity("sg90 x4").qty, 4);
  assert.equal(quantity("three servos").qty, 3);
  assert.equal(quantity("a pair of mg90s").qty, 2);
  assert.equal(quantity("2 x sg90 micro servo (pack of 4)").qty, 8);
  assert.equal(quantity("qty: 5 tcrt5000").qty, 5);
  assert.equal(quantity("a dozen leds").qty, 12);
  // a number that is part of the name is not a count
  assert.equal(quantity("3-channel line tracking module").qty, 1);
  assert.equal(quantity("9v battery").qty, 1);
  assert.equal(quantity("2s 18650 holder").qty, 1);
  assert.deepEqual(have("a pack of 10 SG90 servos"), { hobby_sg90: 10 });
});
test("loose names are read as the usual part, and say so", () => {
  const inv = parseInventory("2 small yellow motors, a cheap ultrasonic sensor, some servos, an arduino, a motor driver");
  assert.deepEqual(Object.fromEntries(inv.items.map((i) => [i.key, i.qty])), { tt_gearmotor_1to48: 2, hc_sr04: 1, hobby_sg90: 3, arduino_uno_clone: 1, l298n_module: 1 });
  for (const k of ["hc_sr04", "hobby_sg90", "arduino_uno_clone", "l298n_module"]) assert.ok(inv.items.find((i) => i.key === k)!.assumed, `${k} should say what it was read as`);
  assert.deepEqual(have("bo motors x2, blue servo"), { tt_gearmotor_1to48: 2, hobby_sg90: 1 });
});
test("model names in any spelling: HC-SR04, hcsr04, hc sr 04, L298, sg-90, MG 996R", () => {
  assert.deepEqual(have("hcsr04"), { hc_sr04: 1 });
  assert.deepEqual(have("hc sr 04"), { hc_sr04: 1 });
  assert.deepEqual(have("L298"), { l298n_module: 1 });
  assert.deepEqual(have("sg-90"), { hobby_sg90: 1 });
  assert.deepEqual(have("MG 996R"), { hobby_mg996r: 1 });
  assert.deepEqual(have("esp32 cam"), { esp32_cam: 1 });
  assert.deepEqual(have("raspberry pi zero 2 w"), { rpi_zero_2w: 1 });
  assert.deepEqual(have("GY-521"), { mpu6050_gy521: 1 });
});
test("typos are corrected", () => {
  assert.deepEqual(have("ardiuno nano, 4x servoo, ultrasonik sensr, 2 moters, l298n"), { arduino_nano_clone: 1, hobby_sg90: 4, hc_sr04: 1, tt_gearmotor_1to48: 2, l298n_module: 1 });
  assert.equal(parseInventory("an ardiuno").items[0].match, "typo");
});
test("Hinglish and Hindi", () => {
  assert.deepEqual(have("mere paas 2 motor aur ek Arduino hai"), { tt_gearmotor_1to48: 2, arduino_uno_clone: 1 });
  assert.deepEqual(have("mere paas ek arduino uno, do tt motor, ek l298n aur ek ultrasonic sensor hai"), { arduino_uno_clone: 1, tt_gearmotor_1to48: 2, l298n_module: 1, hc_sr04: 1 });
  assert.deepEqual(have("mere kit me 2 peeli motor, l298n aur teen servo hai"), { tt_gearmotor_1to48: 2, l298n_module: 1, hobby_sg90: 3 });
  assert.deepEqual(have("मेरे पास 2 मोटर और एक Arduino है"), { tt_gearmotor_1to48: 2, arduino_uno_clone: 1 });
  assert.ok(isInventoryPrompt("mere paas 2 motor aur ek Arduino hai"));
});
test("AA and 18650 cells become holders and packs", () => {
  assert.deepEqual(have("4 AA batteries"), { battery_holder_4aa: 1 });
  assert.deepEqual(have("8 AA batteries"), { battery_holder_4aa: 2 });
  assert.deepEqual(have("6xAA"), { battery_holder_6aa: 1 });
  assert.deepEqual(have("4xAA battery holder"), { battery_holder_4aa: 1 });
  assert.deepEqual(have("2 x 4AA holders"), { battery_holder_4aa: 2 });
  assert.deepEqual(have("2x18650 battery holder"), { pack_2s_18650: 1 });
  assert.deepEqual(have("4 18650 cells"), { pack_2s_18650: 2 });
});
test("a pasted shopping list: counts, prices and order lines", () => {
  const inv = parseInventory("1 x Arduino Uno R3 - $23.00\n2 x SG90 Micro Servo (Pack of 4)\n1 x L298N Motor Driver\n4xAA battery holder\nHC-05 bluetooth\n- 3 line tracking sensors ₹120");
  assert.deepEqual(Object.fromEntries(inv.items.map((i) => [i.key, i.qty])), { arduino_uno_clone: 1, hobby_sg90: 8, l298n_module: 1, battery_holder_4aa: 1, hc05_bluetooth: 1, tcrt5000_module: 3 });
  assert.ok(isInventoryPrompt("1 x Arduino Uno\n2 x SG90\n1 x L298N"));
  assert.ok(!isInventoryPrompt("a 6 DOF arm with a gripper"));
});
test("kits by name expand to their contents, with a source", () => {
  const inv = parseInventory("Elegoo smart robot car kit v4");
  assert.equal(inv.items.find((i) => i.key === "tt_gearmotor_1to48")!.qty, 4);
  assert.ok(inv.items.some((i) => i.key === "esp32_cam"));
  assert.match(inv.notes.join(" "), /elegoo\.com/);
  assert.ok(parseInventory("Elegoo smart robot car kit").items.some((i) => i.key === "l298n_module"));
});
test("nothing is dropped: unknown parts are listed with the closest catalog parts", () => {
  const inv = parseInventory("an Arduino Nano, a flux capacitor drive, a hoverboard, jumper wires");
  assert.deepEqual(inv.items.map((i) => i.key), ["arduino_nano_clone"]);
  assert.deepEqual(inv.unknown.map((u) => u.raw), ["a flux capacitor drive", "a hoverboard"].filter((r) => inv.unknown.some((u) => u.raw === r)));
  assert.ok(inv.unknown.length >= 1 && inv.unknown.every((u) => u.suggestions.length > 0));
  assert.ok(inv.extras.some((e) => e.what === "jumper wires"));
  // picked keys the catalog does not have are not recognised either, never silently dropped
  const t = toInventory({ hobby_sg90: 2, warp_core: 1 });
  assert.deepEqual(t.items.map((i) => [i.key, i.qty]), [["hobby_sg90", 2]]);
  assert.equal(t.unknown[0].raw, "warp_core");
});
test("the picker's search finds parts by model, name and category word", () => {
  assert.equal(searchParts("L298N")[0].key, "l298n_module");
  assert.equal(searchParts("ultrasonic")[0].key, "hc_sr04");
  assert.ok(searchParts("servo").some((p) => p.key === "hobby_mg996r"));
  assert.ok(searchParts("aa battery").some((p) => p.key === "battery_holder_4aa"));
});
test("honesty: 4 AA cannot start two motors with an Uno; the L298N drop is counted", () => {
  const a = carPower("arduino_uno_clone", "l298n_module", "battery_holder_4aa");
  assert.ok(!a.ok); assert.match(a.problems.join(" "), /3\.0 A.*2 A|resets/);
  const b = carPower("arduino_uno_clone", "tb6612fng_module", "pack_2s_18650");
  assert.ok(b.ok, b.problems.join("; "));
  assert.ok(carPower("arduino_uno_clone", "l298n_module", "pack_2s_18650").vm < 5.3 && b.vm === 6);
  assert.ok(!servoPower(["hobby_mg996r", "hobby_mg996r"], "battery_holder_4aa").ok);
  const opt = rankOptions(parseInventory("Arduino Uno, 2 TT motors, L298N, HC-SR04, 4 AA batteries"))[0];
  assert.ok(opt.honesty.some((h) => /cannot run/.test(h) && /\+\$\d/.test(h)), opt.honesty.join("\n"));
  assert.ok(opt.buys.pack_2s_18650, "the fix is in the option's shopping list");
});
test("option cards: uses n/m of your parts, needs +$x (what)", () => {
  const o = rankOptions(parseInventory("I have an Arduino Uno, 2 TT gear motors, an L298N, an HC-SR04, 4 AA batteries and a servo SG90"))[0];
  assert.match(o.headline, /^uses \d+\/7 of your parts, needs \+\$\d+(\.\d)? \(\d+x /);
  assert.ok(o.thumbnail.startsWith("parts/"));
  assert.equal(o.uses.hobby_sg90, 1, "the scanning head uses the servo");
});
test(`${PARTS_PROMPTS.length} inventory prompts each rank the robot they should, or say why nothing safe can be built`, () => {
  assert.ok(PARTS_PROMPTS.length >= 40);
  for (const p of PARTS_PROMPTS) {
    const r = fromParts(p.text, { design: "none" }), got: string = r.options[0]?.kind ?? "cannot", want = ([] as string[]).concat(p.expect);
    assert.ok(want.includes(got), `${JSON.stringify(p.text)}: got ${got}, want ${want.join(" or ")}`);
    if (got === "cannot") { assert.ok(r.cannot?.reason && r.cannot.add.length, p.text); continue; }
    assert.ok(r.options.length <= 3);
    for (const o of r.options) { assert.ok(o.used_count > 0 && o.used_count <= o.inventory_count, o.id); assert.ok(o.extra_usd >= 0); }
  }
});
