// Every electrical part has complete, sourced records: dimensions, ports, pins, connector, voltage, typical and peak current.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, ELECTRICAL, WIRING, electrical, type Sourced } from "@ttr/parts";

const ELECTRICAL_MISC = /^(breadboard_|buck_|buzzer_|dc_jack|dcdc_|estop|fuse_holder|iec_|led_|psu_|switch_|wago_|ws2812)/;
const parts = Object.values(CATALOG).filter((c) => ["actuator", "compute", "sensor", "motor_driver", "battery"].includes(c.category) || ELECTRICAL_MISC.test(c.key));
const SIGNALS = new Set(["ground", "power", "pwm", "digital", "analog", "i2c_sda", "i2c_scl", "uart_tx", "uart_rx", "ttl_half_duplex", "rs485_a", "rs485_b", "can_h", "can_l", "usb", "csi", "spi", "motor_phase", "encoder", "one_wire_led", "mains"]);
function sourced(key: string, what: string, s: Sourced<unknown> | undefined) {
  assert.ok(s, `${key}: no ${what}`);
  assert.ok(s.v !== undefined && s.v !== null, `${key}: ${what} has no value`);
  if (s.src === "datasheet") assert.match(s.url ?? "", /^https?:\/\//, `${key}: ${what} says datasheet but has no URL`);
  else { assert.equal(s.src, "estimated", `${key}: ${what} has source ${s.src}`); assert.ok(s.note, `${key}: ${what} is estimated without saying why`); }
}

test("the list of electrical parts covers the catalog's electrical categories", () => {
  assert.ok(parts.length >= 70, String(parts.length));
  for (const p of parts) assert.ok(ELECTRICAL[p.key], `${p.key}: no electrical record`);
  for (const k of Object.keys(ELECTRICAL)) assert.ok(CATALOG[k], `${k}: record for a part the catalog does not have`);
});
test("every electrical part has a complete record", () => { for (const p of parts) {
  const d = ELECTRICAL[p.key], e = electrical(p.key)!;
  assert.ok(p.bbox_mm, `${p.key}: no bbox`);
  sourced(p.key, "body size", d.dimensions.body_mm);
  sourced(p.key, "holes", d.dimensions.holes);
  sourced(p.key, "voltage", e.voltage_v); sourced(p.key, "current", e.current_a);
  assert.ok(e.current_a.v.peak >= e.current_a.v.typical && e.current_a.v.typical > 0, `${p.key}: current ${JSON.stringify(e.current_a.v)}`);
  assert.ok(e.voltage_v.v.max >= e.voltage_v.v.nom && e.voltage_v.v.nom >= e.voltage_v.v.min);
  assert.ok(e.ports.length > 0, `${p.key}: no ports`);
  for (const port of e.ports) {
    sourced(p.key, `${port.name} connector`, port.connector); sourced(p.key, `${port.name} mate`, port.mate); sourced(p.key, `${port.name} pins`, port.pins);
    assert.ok(port.pins.v.length > 0, `${port.name} has no pins`);
    for (const pin of port.pins.v) { assert.ok(pin.name, `${port.name}: pin without a name`); assert.ok(SIGNALS.has(pin.signal), `${port.name}.${pin.name}: signal ${pin.signal}`); assert.ok(pin.dir, `${port.name}.${pin.name}: no direction`); }
  }
} });
test("the wiring tables are complete: resistance falls and ampacity rises with wire size", () => {
  const rows = [...WIRING.awg].sort((a, b) => b.awg - a.awg);
  for (let i = 1; i < rows.length; i++) { assert.ok(rows[i].ohm_per_m < rows[i - 1].ohm_per_m); assert.ok(rows[i].ampacity_a > rows[i - 1].ampacity_a); }
  for (const r of Object.values(WIRING.connectors)) assert.ok(r.current_a > 0 && r.unit_usd >= 0, r.name);
});
