// Netlist building blocks shared by the designers: serial-bus chains with power injection, DC motors on dual drivers with
// their encoders, sensors on a computer, and the power tree of a battery robot. Each designer calls these with the parts it
// mounted, so the netlist is always declared from what the robot really carries.
import { electrical, part } from "@ttr/parts";
import { connectorFamily, type Harness } from "./wiring.ts";
import { WIRING } from "@ttr/parts";
import { fk } from "./kin.ts";

/** Which pins of each adapter carry the bus. */
export const ADAPTERS: Record<string, { port: string; data: string; gnd: string; vcc?: string; powerV?: string; powerG?: string; usb?: string }> = {
  waveshare_bus_servo_adapter: { port: "servo_bus", data: "SIG", gnd: "GND", vcc: "VIN", powerV: "screw_in.VIN", powerG: "screw_in.GND", usb: "usb.VBUS" },
  feetech_fe_urt1: { port: "scs_bus_1", data: "S", gnd: "G", vcc: "V", powerV: "scs_power.V", powerG: "scs_power.G", usb: "usb.VBUS" },
  dxl_u2d2: { port: "ttl", data: "DATA", gnd: "GND", usb: "usb.VBUS" },
};
const dataOf = (H: Harness, inst: string, port: string) => `${inst}.${port}.@ttl_half_duplex`;
/** Share of each servo's typical current that flows at once on a working robot. */
export const BUS_DUTY = 0.5;

/**
 * One serial bus: data runs through every servo in order; power runs with it until the connector's rating would be
 * exceeded, then that servo takes its own feed from the rail (power injection) and a new power segment starts.
 */
export function busChain(H: Harness, o: { adapter: string; servos: string[]; rail: string; duty?: number; netName?: string; port?: string; hub?: string }) {
  const ad = ADAPTERS[H.instances.get(o.adapter)?.key ?? ""]; if (!ad) throw new Error(`netlist: ${o.adapter} is not a known bus adapter`);
  const duty = o.duty ?? BUS_DUTY, net = H.net(o.netName ?? `BUS_${o.adapter}`.toUpperCase(), "bus"), port = o.port ?? ad.port;
  if (!o.servos.length) return;
  if (!ad.vcc) H.spare(`${o.adapter}.${port}.VDD`);   // this adapter passes no power to the bus
  const cur = (s: string) => H.rec(s).current_a.v;
  const conn = WIRING.connectors[connectorFamily(H.rec(o.servos[0]).ports.find((p) => p.name === "bus_a")!.connector.v)]?.current_a ?? 3;
  const cap = conn * 0.9;
  // power segments
  const segs: string[][] = [[]];
  let sum = 0;
  for (const s of o.servos) { const t = cur(s).typical * duty; if (segs[segs.length - 1].length && sum + t > cap) { segs.push([]); sum = 0; } segs[segs.length - 1].push(s); sum += t; }
  // through a hub (a lever splice on the data line) several chains leave one adapter; each then has its own power feed
  if (o.hub) H.wire(net, `${o.hub}.P2`, dataOf(H, o.servos[0], "bus_a"));
  else { H.wire(net, `${o.adapter}.${port}.${ad.data}`, dataOf(H, o.servos[0], "bus_a")); H.wire("GND", `${o.adapter}.${port}.${ad.gnd}`, `${o.servos[0]}.bus_a.@ground`, { typ: 0.05 }); }
  segs.forEach((seg, i) => {
    const typ = seg.reduce((a, s) => a + cur(s).typical * duty, 0), peak = typ + Math.max(...seg.map((s) => cur(s).peak - cur(s).typical * duty));
    const head = seg[0];
    if (i === 0 && ad.vcc && ad.powerV && !o.hub) {
      H.feed(o.rail, o.adapter, { v: ad.powerV, g: ad.powerG, typ, peak });
      H.wire(H.rails.get(o.rail) ? railNet(H, o.rail) : o.rail, `${o.adapter}.${port}.${ad.vcc}`, `${head}.bus_a.@power`, { typ, peak });
    } else H.feed(o.rail, head, { v: "bus_a.@power", g: i === 0 ? "bus_a.@ground" : "bus_a.@ground", typ, peak });
    // downstream of each servo the rest of the segment's current
    seg.forEach((s, k) => {
      const next = seg[k + 1]; if (!next) return;
      const rest = seg.slice(k + 1), t = rest.reduce((a, x) => a + cur(x).typical * duty, 0), p = t + Math.max(...rest.map((x) => cur(x).peak - cur(x).typical * duty));
      H.wire(railNet(H, o.rail), `${s}.bus_b.@power`, `${next}.bus_a.@power`, { typ: t, peak: p }); H.wire("GND", `${s}.bus_b.@ground`, `${next}.bus_a.@ground`, { typ: t, peak: p });
    });
  });
  for (let k = 0; k + 1 < o.servos.length; k++) H.wire(net, dataOf(H, o.servos[k], "bus_b"), dataOf(H, o.servos[k + 1], "bus_a"));
  // a servo at the end of a power segment has an empty power pin on its far port
  for (const seg of segs) H.spare(`${seg[seg.length - 1]}.bus_b`);
}
const railNet = (_H: Harness, rail: string) => rail;

/** Several chains from one adapter: its data line into a lever splice, one chain per limb, each with its own feed. */
export function busTree(H: Harness, o: { adapter: string; chains: string[][]; rail: string; duty?: number }) {
  const ad = ADAPTERS[H.instances.get(o.adapter)!.key], net = H.net(`BUS_${o.adapter}`.toUpperCase(), "bus"), hub = `${o.adapter}_hub`;
  if (!H.instances.has(hub)) {
    H.part(hub, "wago_221_415", { link: H.instances.get(o.adapter)!.link, note: "data splice: one branch per limb" });
    H.buyHub = (H.buyHub ?? 0) + 1;
    H.wire(net, `${o.adapter}.${ad.port}.${ad.data}`, `${hub}.P1`);
    if (ad.powerV) { H.feed(o.rail, o.adapter, { v: ad.powerV, g: ad.powerG, typ: 0.05, peak: 0.1 }); H.spare(`${o.adapter}.${ad.port}.${ad.vcc}`, `${o.adapter}.${ad.port}.${ad.gnd}`); }
    else H.wire("GND", `${o.adapter}.${ad.port}.${ad.gnd}`, `${o.chains[0][0]}.bus_a.@ground`, { typ: 0.01 });
  }
  H.buyHub = (H.buyHub ?? 0) + Math.floor(o.chains.length / 4);
  for (const c of o.chains) busChain(H, { adapter: o.adapter, servos: c, rail: o.rail, duty: o.duty, netName: net, hub });
}
/** Limbs may mix actuator families: each run of one family on one rail becomes a chain on its own adapter. */
export function limbBuses(H: Harness, limbs: string[][], route: (key: string) => { adapter: string; rail: string; duty?: number }) {
  const groups = new Map<string, { adapter: string; rail: string; duty?: number; chains: string[][] }>();
  for (const limb of limbs) {
    let cur: string[] = [], tag = "";
    const flush = () => { if (!cur.length) return; const r = route(H.instances.get(cur[0])!.key), k = `${r.adapter}|${r.rail}`, g = groups.get(k) ?? { ...r, chains: [] }; g.chains.push(cur); groups.set(k, g); cur = []; };
    for (const s of limb) { const r = route(H.instances.get(s)!.key), k = `${r.adapter}|${r.rail}`; if (k !== tag) { flush(); tag = k; } cur.push(s); }
    flush();
  }
  for (const g of groups.values()) busTree(H, g);
}
/** CAN actuators: bus on a lever splice pair, one branch per actuator, power star from the rail. */
export function canTree(H: Harness, o: { adapter: string; motors: string[]; rail: string; duty?: number }) {
  const hi = H.net(`CAN_H_${o.adapter}`.toUpperCase(), "bus"), lo = H.net(`CAN_L_${o.adapter}`.toUpperCase(), "bus"), duty = o.duty ?? BUS_DUTY, hh = `${o.adapter}_hub_h`, hl = `${o.adapter}_hub_l`;
  H.part(hh, "wago_221_415", { link: H.instances.get(o.adapter)?.link ?? null, note: "CAN high splice" }); H.part(hl, "wago_221_415", { link: H.instances.get(o.adapter)?.link ?? null, note: "CAN low splice" });
  H.buyHub = (H.buyHub ?? 0) + 2 * Math.max(1, Math.ceil((o.motors.length - 1) / 3));
  const hPin = H.rec(o.adapter).ports.find((p) => p.name === "can_bus")!.pins.v, cn = (sig: string) => hPin.find((p) => p.signal === sig)!.name;
  H.wire(hi, `${o.adapter}.can_bus.${cn("can_h")}`, `${hh}.P1`); H.wire(lo, `${o.adapter}.can_bus.${cn("can_l")}`, `${hl}.P1`);
  for (const m of o.motors) {
    const r = H.rec(m), combined = r.ports.some((p) => p.name === "power_can"), pp = combined ? "power_can" : "power", cp = combined ? "power_can" : "can";
    const pos = r.ports.find((p) => p.name === pp)!.pins.v.find((x) => x.signal === "power")!.name, neg = r.ports.find((p) => p.name === pp)!.pins.v.find((x) => x.signal === "ground")!.name;
    H.feed(o.rail, m, { v: `${pp}.${pos}`, g: `${pp}.${neg}`, typ: r.current_a.v.typical * duty, peak: r.current_a.v.peak });
    H.wire(hi, `${hh}.P2`, `${m}.${cp}.@can_h`, { cable: `can~${m}` }); H.wire(lo, `${hl}.P2`, `${m}.${cp}.@can_l`, { cable: `can~${m}` });
    H.label(`can~${m}`, `CAN to ${m}`);
  }
  // the adapter's CAN ground joins the actuators' supply return
  const gnd = H.rec(o.adapter).ports.find((p) => p.name === "can_bus")!.pins.v.find((x) => x.signal === "ground");
  if (gnd && o.motors[0]) { const r = H.rec(o.motors[0]), pp = r.ports.some((p) => p.name === "power_can") ? "power_can" : "power"; H.wire("GND", `${o.adapter}.can_bus.${gnd.name}`, `${o.motors[0]}.${pp}.@ground`, { typ: 0.01 }); }
  H.notes.push("CAN: keep the branches short and fit a 120 ohm terminator at each end of the longest run.");
}

/** Hands out free controller pins in order. */
export class PinPool {
  list: string[];
  constructor(list: string[]) { this.list = [...list]; }
  take() { const p = this.list.shift(); if (!p) throw new Error("netlist: the controller is out of free pins"); return p; }
}
const PI_GPIO = ["GPIO12", "GPIO13", "GPIO18", "GPIO19", "GPIO5", "GPIO6", "GPIO16", "GPIO20", "GPIO21", "GPIO26", "GPIO17", "GPIO27", "GPIO22", "GPIO23", "GPIO24", "GPIO25", "GPIO4"];
const ESP_GPIO = ["4", "5", "6", "7", "15", "16", "17", "18", "8", "3", "9", "10", "11", "12", "13", "14", "1", "2", "42", "41", "40", "39", "38", "37", "36", "35"];
/** The pins a controller offers to motor drivers and encoders. */
export const pinsOf = (key: string): PinPool => new PinPool(key === "rpi5" ? PI_GPIO : key.startsWith("esp32") ? ESP_GPIO : []);

/** A Cytron MDD10A: rail to its power terminal, one motor per channel, PWM and direction from `ctrl`, the encoder back to it. */
export function dualDriver(H: Harness, o: { driver: string; motors: (string | undefined)[]; ctrl: string; pins: PinPool; rail: string; logicRail?: string; encVcc: string }) {
  const c = H.rec(o.motors.find(Boolean)!).current_a.v, n = o.motors.filter(Boolean).length;
  H.feed(o.rail, o.driver, { v: "POWER+", g: "POWER-", typ: c.typical * n + 0.05, peak: c.peak * n });
  H.net(`${o.driver}_CTRL_GND`.toUpperCase(), "ground");
  const cg = H.instances.get(o.ctrl)!.key.startsWith("esp32") ? "G" : "GND";
  H.wire("GND", `${o.driver}.control.GND`, `${o.ctrl}.${cg}`, { typ: 0.01 });
  o.motors.forEach((m, i) => {
    const ch = i + 1;
    if (!m) { H.spare(`${o.driver}.motor_${ch}`); H.spare(`${o.driver}.control.PWM${ch}`, `${o.driver}.control.DIR${ch}`); return; }
    const r = H.rec(m).current_a.v, phase = `${m}_PHASE`.toUpperCase();
    H.net(`${phase}_A`, "signal"); H.net(`${phase}_B`, "signal");
    H.wire(`${phase}_A`, `${o.driver}.M${ch}A`, `${m}.Motor (red)`, { typ: r.typical, peak: r.peak }); H.wire(`${phase}_B`, `${o.driver}.M${ch}B`, `${m}.Motor (black)`, { typ: r.typical, peak: r.peak });
    H.label([o.driver, m].sort().join("~"), `${o.driver} channel ${ch} to ${m}`);
    H.signals(o.ctrl, o.driver, [[o.pins.take(), `PWM${ch}`, `${m}_PWM`.toUpperCase()], [o.pins.take(), `DIR${ch}`, `${m}_DIR`.toUpperCase()]]);
    // encoder lead
    const v = `${m}_ENC_VCC`.toUpperCase(); H.net(v, "power", 3.3);
    H.wire(v, o.encVcc, `${m}.Encoder Vcc (blue)`, { typ: 0.01 }); H.wire("GND", `${o.ctrl}.${cg}`, `${m}.Encoder GND (green)`, { typ: 0.01 });
    H.signals(o.ctrl, m, [[o.pins.take(), "Encoder A (yellow)", `${m}_ENC_A`.toUpperCase()], [o.pins.take(), "Encoder B (white)", `${m}_ENC_B`.toUpperCase()]]);
    H.label([o.ctrl, m].sort().join("~"), `${m} encoder to ${o.ctrl}`);
  });
}

/** Sensors on a Pi 5 or a Jetson: USB ones on bought leads, the IMU on I2C, the camera on its ribbon. Their current counts on the computer's supply. */
export function sensorsOnComputer(H: Harness, computer: string, sensors: { name: string; kind: "lidar" | "depth" | "camera" | "imu" }[]) {
  const key = H.instances.get(computer)!.key, pi = key === "rpi5";
  const usbPort = pi ? "usb_a" : "usb_a_j6_j7", extra: { typ: number; peak: number } = { typ: 0, peak: 0 };
  for (const s of sensors) {
    const r = H.rec(s.name).current_a.v;
    if (s.kind === "lidar") { H.bought(`${s.name}.main.@power`, `${computer}.${usbPort}.LINK`, "USB", r.typical, r.peak, `${s.name}_USB`.toUpperCase()); extra.typ += r.typical; extra.peak += r.peak; }
    if (s.kind === "depth") { H.bought(`${s.name}.usb_c.VBUS`, `${computer}.${usbPort}.LINK`, "USB-C", r.typical, r.peak, `${s.name}_USB`.toUpperCase()); extra.typ += r.typical; extra.peak += r.peak; }
    if (s.kind === "camera") { H.bought(`${s.name}.csi_15.GND`, `${computer}.${pi ? "cam_dsi_0" : "camera_j20"}.${pi ? "GND" : "LINK"}`, "FFC", r.typical, r.peak, `${s.name}_CSI`.toUpperCase()); extra.typ += r.typical; extra.peak += r.peak; }
    if (s.kind === "imu") {
      H.net("3V3_IMU", "power", 3.3);
      H.wire("3V3_IMU", `${computer}.3V3`, `${s.name}.VIN`, { typ: r.typical, peak: r.peak }); H.wire("GND", `${computer}.GND`, `${s.name}.GND`, { typ: r.typical, peak: r.peak });
      H.signals(computer, s.name, pi ? [["GPIO2", "SDA", "I2C_SDA"], ["GPIO3", "SCL", "I2C_SCL"]] : [["I2C1_SDA", "SDA", "I2C_SDA"], ["I2C1_SCL", "SCL", "I2C_SCL"]]);
    }
  }
  return extra;
}
/** Actuators of a link subtree in kinematic order, by the bus they speak. */
export function actuatorsUnder(H: Harness, prefix: RegExp): string[] {
  const f = fk(H.A.spec), list = H.A.spec.links.filter((l) => prefix.test(l.name) && l.geometry.type === "mesh" && l.geometry.part === "component" && part(String(l.geometry.params?.key)).category === "actuator" && electrical(String(l.geometry.params?.key)));
  const depth = (n: string) => { let d = 0, c = n; for (;;) { const j = H.A.spec.joints.find((x) => x.child === c); if (!j) return d; c = j.parent; d++; } };
  void f;
  return list.map((l) => l.name).sort((a, b) => depth(a) - depth(b));
}

/**
 * Power tree and sensors of a battery robot with a computer: pack through fuse and switch to VBAT, a 5 V buck, the computer
 * (a Pi on the 5 V rail, a Jetson straight from the pack), and its sensors. Returns the rail names.
 */
export function coreTree(H: Harness, o: { batteries: string[]; regulators: string[]; compute: string; sensors: { name: string; kind: "lidar" | "depth" | "camera" | "imu" }[]; simNote: string; simultaneous?: number; cont?: number; peak?: number }) {
  const b0 = o.batteries[0], key = H.instances.get(b0)!.key;
  // the pack's connector is the limit of what leaves it
  const conn = WIRING.connectors[connectorFamily(H.rec(b0).ports.find((p) => p.name === "main")!.connector.v)]?.current_a ?? 30;
  H.mainPower("VBAT", { source: b0, pos: "main.BAT+", neg: "main.BAT-", sw: "main_switch", cont: o.cont ?? conn, peakLimit: o.peak ?? conn * 2, simultaneous: o.simultaneous, simNote: o.simNote });
  void key;
  for (const extra of o.batteries.slice(1)) { H.wire("VBAT", `${extra}.main.BAT+`, `${b0}.main.BAT+`, { typ: 2, peak: 8 }); H.wire("GND", `${extra}.main.BAT-`, `${b0}.main.BAT-`, { typ: 2, peak: 8 }); }
  if (o.batteries.length > 1) H.notes.push("Packs in parallel: bring them to the same voltage before joining them.");
  const r0 = o.regulators[0];
  H.regulator(r0, "VBAT", "5V", { vin: "VIN", gin: "GND", vout: "VOUT", gout: "GND", volts: 5, efficiency: 0.9, simNote: "the computer at its peak and every sensor running" });
  for (const r of o.regulators) H.spare(`${r}.power_and_control.VRP`, `${r}.power_and_control.EN`, `${r}.power_and_control.PG`);
  const extra = sensorsOnComputer(H, "computer", o.sensors), c = H.rec("computer").current_a.v;
  if (o.compute === "rpi5") H.feed("5V", "computer", { v: "gpio40.5V", g: "gpio40.GND", typ: c.typical + extra.typ, peak: c.peak });
  else H.feed("VBAT", "computer", { v: "dc_jack_j16.DC_IN", g: "dc_jack_j16.GND", typ: 15 / 11.1 + extra.typ * 0.5, peak: 25 / 9.9 + extra.typ * 0.5 });
}
