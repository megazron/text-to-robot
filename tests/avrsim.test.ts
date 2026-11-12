// The Run tab's simulator (apps/web/public/avrsim.js on avr8js) runs the shipped compiled sketches of the examples
// (apps/web/public/firmware, written by scripts/compile_firmware.py --site) and what it reads off the pins is what the
// sketch meant: the car's speed is its CRUISE_PWM, an obstacle at 12 cm makes it stop, back off and turn, nothing in range
// keeps it going, 's' on the serial port stops it; the arm's servos get the pulses its pose sequence prints, through the
// emulated PCA9685; the HEX reader refuses a corrupt file. The shipped hex files belong to the examples' sketches as the
// engine writes them today (the index is keyed by each sketch's SHA-256).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { arduinoFirmware, type ArduinoFirmware } from "@ttr/design";
// @ts-expect-error: a plain ES module of the website, no type declarations
import { createBoard, parseHex } from "../apps/web/public/avrsim.js";

const avr = createRequire(import.meta.url)("avr8js");
const index = JSON.parse(readFileSync("apps/web/public/firmware/index.json", "utf8")) as { sketches: Record<string, { example: string; hex: string; hex_sha256: string }> };
const load = (ex: string) => { const spec = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")); return arduinoFirmware(spec)!; };
const hexOf = (fw: ArduinoFirmware) => {
  const row = index.sketches[createHash("sha256").update(fw.files[fw.sketch]).digest("hex")];
  assert.ok(row, `${fw.sketch}: no compiled hex for the sketch the engine writes now (run scripts/compile_firmware.py --site)`);
  const text = readFileSync(`apps/web/public/${row.hex}`, "utf8");
  assert.equal(createHash("sha256").update(text).digest("hex"), row.hex_sha256);
  return text;
};
const constant = (code: string, name: string) => Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(code)![1]);

test("every example sketch the engine writes has its compiled hex on the site, and nothing else is shipped", () => {
  const want = ["15_wall_e", "18_arduino_car", "19_arduino_arm", "23_robot_hand"];
  for (const ex of want) hexOf(load(ex));
  assert.deepEqual(Object.values(index.sketches).map((r) => r.example).sort(), want);
});

test("the HEX reader takes Intel HEX and refuses a bad checksum", () => {
  const { flash, bytes } = parseHex(":0400000001020304F2\n:00000001FF\n");
  assert.deepEqual([...flash.slice(0, 4)], [1, 2, 3, 4]); assert.equal(bytes, 4);
  assert.throws(() => parseHex(":0400000001020304F3\n:00000001FF\n"), /checksum/);
});

test("the car's sketch drives its motors from the pins: cruise, an obstacle, nothing in range, stop on 's'", () => {
  const fw = load("18_arduino_car"), code = fw.files[fw.sketch], cruise = constant(code, "CRUISE_PWM"), startMs = constant(code, "START_DELAY_MS");
  let cm: number | null = 100, out = "";
  const b = createBoard(avr, hexOf(fw), fw, { distanceCm: () => cm, onSerial: (c: string) => { out += c; } });
  b.run(startMs + 600);
  assert.match(out, /drive: forward/);
  for (const m of b.motors()) assert.ok(Math.abs(m.forward - cruise / 255) < 0.01, `${m.name} forward duty ${m.forward.toFixed(3)}, sketch cruises at ${cruise}/255`);
  assert.ok(b.sensor.pings >= 5 && b.sensor.last_cm === 100, `pings ${b.sensor.pings}`);
  // an obstacle at 12 cm (under the sketch's STOP_CM): stop, back off, then turn on the spot
  const stop = constant(code, "STOP_CM"); cm = 12; assert.ok(cm < stop);
  b.run(150); assert.match(out, /obstacle at 12 cm/);
  b.run(450); assert.ok(b.motors().every((m: { forward: number }) => m.forward < -0.3), "backing off");
  b.run(500); const ms = b.motors(); assert.match(out, /turn (left|right)/);
  assert.ok(ms.some((m: { forward: number }) => m.forward > 0.3) && ms.some((m: { forward: number }) => m.forward < -0.3), "one side forwards, the other back");
  // nothing in range: the module's echo times out and the sketch reads it as clear
  cm = null; b.run(2500); assert.ok(b.motors().every((m: { forward: number }) => m.forward > 0.3), "clear again: forwards"); assert.equal(b.sensor.last_cm, null);
  b.send("s"); b.run(200); assert.ok(b.motors().every((m: { forward: number }) => m.forward === 0), "'s' stops every motor");
});

test("the arm's sketch moves its servos through the emulated PCA9685 to the angles its pose sequence prints", () => {
  const fw = load("19_arduino_arm");
  let out = "";
  const b = createBoard(avr, hexOf(fw), fw, { onSerial: (c: string) => { out += c; } });
  b.run(1000);
  for (const s of b.servos()) assert.ok(s.us !== null && Math.abs(s.deg - fw.servos.find((x) => x.name === s.name)!.home_deg) < 0.6, `${s.name} at home: ${s.deg}`);
  // each "pose n/12: joint=deg ..." line starts a move to that pose at the servos' speed: before the next pose starts,
  // every servo reaches the angle printed
  let seen = 0, target: Record<string, number> | null = null, reached = 0, pending = false;
  for (let t = 0; t < 30000 && reached < 3; t += 50) {
    b.run(50);
    const lines = [...out.matchAll(/pose \d+\/\d+: ([^\r\n]*)/g)];
    if (lines.length > seen) {
      assert.ok(!pending, `the arm did not reach ${JSON.stringify(target)} before the next pose: ${JSON.stringify(b.servos().map((s: { name: string; deg: number }) => [s.name, s.deg]))}`);
      seen = lines.length; pending = true;
      target = Object.fromEntries([...lines[lines.length - 1][1].matchAll(/(\w+)=(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
      assert.deepEqual(Object.keys(target!).sort(), b.servos().map((s: { name: string }) => s.name.replace(/_servo$/, "")).sort(), "every servo has a target");
    }
    if (pending && target && b.servos().every((s: { name: string; deg: number }) => { const k = s.name.replace(/_servo$/, ""); return !(k in target!) || Math.abs(s.deg - target![k]) < 0.6; })) { pending = false; reached++; }
  }
  assert.ok(reached >= 3, `poses reached: ${reached}\n${out}`);
});
