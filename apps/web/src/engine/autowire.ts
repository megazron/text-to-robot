// Automatic harness for any robot: finds the battery, switch, controller, regulators, drivers, actuators and sensors among
// its bought parts and declares the netlist the design engine's Harness routes, sizes and checks (wiring.ts). Parts it
// cannot wire are listed with the reason, never guessed.
import type { RobotSpecification } from "@ttr/robot-schema";
import { CATALOG, electrical } from "@ttr/parts";
import { Assembly, Harness, finishWiring, busChain, type WiringRecord } from "@ttr/design";
import { kindOf } from "./edit.ts";

export interface AutoWire { record: WiringRecord | null; checks: { name: string; pass: boolean; detail: string }[]; unwired: string[]; }

export function autoWire(input: RobotSpecification): AutoWire {
  const spec = structuredClone(input), unwired: string[] = [], checks: AutoWire["checks"] = [];
  const parts = spec.links.map((l) => ({ name: l.name, key: kindOf(l).key })).filter((p): p is { name: string; key: string } => !!p.key && !!CATALOG[p.key] && !!electrical(p.key));
  if (!parts.length) return { record: null, checks: [], unwired };
  const role = (k: string) => electrical(k)!.role, of = (r: string) => parts.filter((p) => role(p.key) === r);
  const battery = of("battery")[0], controller = of("controller")[0];
  if (!battery) { checks.push({ name: "wiring:power", pass: false, detail: "no battery: add one from Power to wire the robot" }); return { record: null, checks, unwired: parts.map((p) => p.name) }; }
  const A = new Assembly(spec.robot_name, "built");
  A.spec = spec;
  const H = new Harness(A);
  const bat = electrical(battery.key)!.voltage_v.v, sw = parts.find((p) => role(p.key) === "switch");
  const tryWire = (what: string, fn: () => void) => { try { fn(); } catch (e) { unwired.push(`${what}: ${(e as Error).message.replace(/^wiring: /, "")}`); } };
  H.mainPower("VBAT", { source: battery.name, pos: "@power", neg: "@ground", ...(sw ? { sw: sw.name } : {}), simultaneous: 2, simNote: "two actuators at peak at once, the rest running" });

  // pins of the controller, handed out in order
  const pins = { pwm: [] as string[], digital: [] as string[] }, spare: string[] = [];
  if (controller) for (const p of electrical(controller.key)!.ports) for (const x of p.pins.v) {
    if (/usb|icsp/i.test(p.name)) continue;
    const n = x.name.split("/")[0];
    if (/^D[01]$|^RX|^TX|GPIO1[45]$/.test(n)) continue;
    if (x.signal === "pwm") pins.pwm.push(n); else if (x.signal === "digital" && /^(D\d+|GPIO\d+|\d+)$/.test(n)) pins.digital.push(n);
    else if ((x.signal === "analog" && /^A[0-3]$/.test(n)) || (x.signal === "spi" && /^D1[0-3]$/.test(n))) spare.push(n);
  }
  pins.digital.push(...spare.filter((x, i) => spare.indexOf(x) === i));
  const used = new Set<string>();
  const take = (kind: "pwm" | "digital") => { const list = kind === "pwm" ? pins.pwm : [...pins.digital, ...pins.pwm.slice().reverse()]; const p = list.find((x) => !used.has(x)); if (!p) throw new Error(`the controller has no free ${kind} pin left`); used.add(p); return p; };

  // logic rail: the controller's own regulator from the pack, else a buck converter
  const bucks = of("regulator");
  let logic: string | null = null;
  if (controller) tryWire(controller.name, () => {
    const e = electrical(controller.key)!, vin = e.ports.flatMap((p) => p.pins.v).some((x) => x.name === "VIN");
    if (vin && bat.nom >= e.voltage_v.v.min && bat.max <= e.voltage_v.v.max + 0.6) {
      H.regulator(controller.name, "VBAT", "5V_LOGIC", { vin: "VIN", gin: "GND", vout: "5V", gout: "GND", volts: 5, cont: 0.2, peakLimit: 0.4 }); logic = "5V_LOGIC";
    } else if (bucks[0]) {
      const b = bucks[0], br = electrical(b.key)!.ports.flatMap((p) => p.pins.v);
      const pin = (sig: string, dir: string) => br.find((x) => x.signal === sig && x.dir === dir)!.name;
      H.regulator(b.name, "VBAT", "5V", { vin: pin("power", "power_in"), gin: br.find((x) => x.signal === "ground" && x.dir === "power_in")?.name ?? "GND", vout: pin("power", "power_out"), gout: br.filter((x) => x.signal === "ground").pop()!.name, volts: 5 });
      H.feed("5V", controller.name, { v: "5V" }); logic = "5V";
    } else throw new Error(`needs ${e.voltage_v.v.min} to ${e.voltage_v.v.max} V from a regulator: add a buck converter`);
  });
  else unwired.push("controller: no controller board (Arduino, ESP32, Raspberry Pi): actuators and sensors have nothing to talk to");

  // hobby servos: through a PCA9685 when there is one, else straight to PWM pins; power from the pack when it suits them
  const hobby = parts.filter((p) => p.key.startsWith("hobby_")), pca = parts.find((p) => p.key.startsWith("pca9685"));
  if (hobby.length) tryWire("servos", () => {
    const sv = electrical(hobby[0].key)!.voltage_v.v;
    let rail = "VBAT";
    if (bat.max > sv.max + 0.2) {
      const b = bucks.find((x) => x.name !== (logic === "5V" ? bucks[0].name : ""));
      if (!b) throw new Error(`the ${bat.nom} V pack is above the servos' ${sv.max} V: add a buck converter for them`);
      const br = electrical(b.key)!.ports.flatMap((p) => p.pins.v), pin = (sig: string, dir: string) => br.find((x) => x.signal === sig && x.dir === dir)!.name;
      H.regulator(b.name, "VBAT", "V_SERVO", { vin: pin("power", "power_in"), gin: br.find((x) => x.signal === "ground")!.name, vout: pin("power", "power_out"), gout: br.filter((x) => x.signal === "ground").pop()!.name, volts: Math.min(6, sv.max), simultaneous: 2 }); rail = "V_SERVO";
    }
    if (pca && controller) {
      H.feed(rail, pca.name, { v: "v_plus.V+", g: "v_plus.GND", typ: 0.01, peak: 0.01 });
      const feed = H.rails.get(rail)!.feeds.find((x) => x.inst === pca.name)!;
      hobby.forEach((s, ch) => {
        if (ch > 15) { unwired.push(`${s.name}: the PCA9685 has 16 channels`); return; }
        const r = H.rec(s.name).current_a.v;
        for (const [n, k] of [[`${s.name}_PWM`.toUpperCase(), "signal"], [`${s.name}_V`.toUpperCase(), "power"]] as const) H.net(n, k);
        H.wire(`${s.name}_PWM`.toUpperCase(), `${pca.name}.ch${ch}.PWM${ch}`, `${s.name}.@pwm`); H.wire(`${s.name}_V`.toUpperCase(), `${pca.name}.ch${ch}.V+`, `${s.name}.@power`, { typ: r.typical, peak: r.peak }); H.wire("GND", `${pca.name}.ch${ch}.GND`, `${s.name}.@ground`, { typ: r.typical, peak: r.peak });
        feed.typ += r.typical; feed.peak += r.peak;
      });
      for (let ch = hobby.length; ch < 16; ch++) H.spare(`${pca.name}.ch${ch}`);
      H.spare(`${pca.name}.control_out`, `${pca.name}.control_in.OE`, `${pca.name}.control_in.V+`);
      if (logic) H.feed(logic, pca.name, { v: "control_in.VCC", g: "control_in.GND", typ: 0.01, peak: 0.01 });
      H.signals(controller.name, pca.name, [["SDA", "SDA", "I2C_SDA"], ["SCL", "SCL", "I2C_SCL"]]);
    } else for (const s of hobby) tryWire(s.name, () => { H.feed(rail, s.name); if (controller) H.signals(controller.name, s.name, [[take("pwm"), "@pwm", `${s.name}_PWM`.toUpperCase()]]); });
  });

  // DC gear motors: two per dual H-bridge
  const dc = parts.filter((p) => role(p.key) === "actuator" && electrical(p.key)!.ports.some((x) => x.pins.v.some((y) => y.signal === "motor_phase")));
  const drivers = parts.filter((p) => /tb6612|l298n|mdd10/.test(p.key));
  dc.forEach((m, i) => tryWire(m.name, () => {
    const d = drivers[Math.floor(i / 2)]; if (!d) throw new Error("no motor driver channel left: add a TB6612FNG or L298N");
    if (!controller) throw new Error("no controller to drive it");
    const ch = i % 2, tb = d.key.startsWith("tb6612"), phase = electrical(m.key)!.ports.flatMap((p) => p.pins.v).filter((x) => x.signal === "motor_phase").map((x) => x.name);
    if (ch === 0) {
      H.feed("VBAT", d.name, tb ? { v: "VM", g: "GND", typ: 0.01, peak: 0.01 } : { v: "+12V Power", g: "Power GND", typ: 0.01, peak: 0.01 });
      if (tb && logic) { H.feed(logic, d.name, { v: "VCC", g: "", typ: 0.002, peak: 0.002 }); H.net(`${d.name}_STBY`.toUpperCase(), "signal"); H.wire(`${d.name}_STBY`.toUpperCase(), `${controller.name}.5V`, `${d.name}.STBY`); }
      if (!tb) H.spare(`${d.name}.power.+5V Power`, `${d.name}.jumpers`);
      if (i === dc.length - 1) H.spare(tb ? `${d.name}.motor_b` : `${d.name}.output_b`, `${d.name}.${tb ? "control.PWMB" : "logic.ENB"}`, `${d.name}.${tb ? "control.BIN1" : "logic.IN3"}`, `${d.name}.${tb ? "control.BIN2" : "logic.IN4"}`);
    }
    const [en, a, b] = tb ? (ch ? ["PWMB", "BIN1", "BIN2"] : ["PWMA", "AIN1", "AIN2"]) : ch ? ["ENB", "IN3", "IN4"] : ["ENA", "IN1", "IN2"];
    H.signals(controller.name, d.name, [[take("pwm"), en], [take("digital"), a], [take("digital"), b]]);
    const outs = tb ? (ch ? ["BO1", "BO2"] : ["AO1", "AO2"]) : ch ? ["OUT3", "OUT4"] : ["OUT1", "OUT2"], r = H.rec(m.name).current_a.v;
    const feed = H.rails.get("VBAT")!.feeds.find((x) => x.inst === d.name)!;
    outs.forEach((o, k) => { const n = `${m.name}_PHASE_${k + 1}`.toUpperCase(); H.net(n, "signal"); H.wire(n, `${d.name}.${o}`, `${m.name}.${phase[k]}`, { typ: r.typical, peak: r.peak }); });
    feed.typ += r.typical; feed.peak += r.peak;
    H.spare(`${m.name}.leads`);
  }));

  // serial bus servos on their adapter
  const bus = parts.filter((p) => /^(feetech_sts|dxl_)/.test(p.key)), adapter = parts.find((p) => /waveshare_bus|fe_urt1|u2d2/.test(p.key));
  if (bus.length) tryWire("bus servos", () => { if (!adapter) throw new Error("add a bus servo adapter (Waveshare, FE-URT-1 or U2D2)"); busChain(H, { adapter: adapter.name, servos: bus.map((s) => s.name), rail: "VBAT" }); });

  // sensors
  for (const s of parts.filter((p) => role(p.key) === "sensor")) tryWire(s.name, () => {
    if (!controller || !logic) throw new Error("no controller with a 5 V rail to read it");
    const pinsOf = electrical(s.key)!.ports.flatMap((p) => p.pins.v);
    if (s.key === "hc_sr04") { H.feed(logic, s.name, { v: "Vcc", g: "GND" }); H.signals(controller.name, s.name, [[take("digital"), "Trig"], [take("digital"), "Echo"]]); return; }
    if (pinsOf.some((x) => x.signal === "i2c_sda")) { H.feed(logic, s.name); H.signals(controller.name, s.name, [["SDA", "SDA", "I2C_SDA"], ["SCL", "SCL", "I2C_SCL"]]); return; }
    throw new Error("connects over USB or a camera cable: wire it by hand");
  });
  for (const p of parts) if (["sensor", "actuator"].includes(role(p.key)) && !H.rails.size) unwired.push(p.name);

  try { finishWiring(H, { noClips: /.*/ }); }
  catch (e) { unwired.push(`harness: ${(e as Error).message.replace(/^wiring: /, "")}`); return { record: null, checks: [...checks, { name: "wiring", pass: false, detail: unwired.join("; ") }], unwired }; }
  for (const c of A.design.checks) checks.push(c);
  checks.push({ name: "wiring:auto", pass: !unwired.length, detail: unwired.length ? `not wired: ${unwired.join("; ")}` : `every electrical part is wired (${A.design.wiring!.cables.length} cables)` });
  return { record: A.design.wiring ?? null, checks, unwired };
}
