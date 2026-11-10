// 3D models of the electrical parts and where their pins are, in each part's own frame (millimetres; the catalog bbox
// frame, which is the frame of the component link the design mounts it on).
//   The boards the robots use most have their real header layout (pin pitch 2.54 mm, rows and pin order from the
//   board's datasheet or reference design, sources below). Every other part is drawn from its catalog body box with a
//   look for its kind (cells, motor can, lever splice, blade fuse holder...) and its pins on the face its leads leave.
import { electrical, part } from "@ttr/parts";
import { dxlPlug } from "@ttr/solid";
import { Builder, type Model, type V3, type Mat } from "./geom.ts";

/** where a pin is and which way a wire leaves it */
export interface PinAt { at: V3; out: V3; kind: "header" | "socket" | "terminal" | "lead" | "lever" | "tab" | "pad" | "jst" | "plug"; }
/** detailed: real pin map from a datasheet; replaces: the model stands in for the part's catalog body (a motor keeps its datasheet CAD) */
export interface PartModel extends Model { pins: Map<string, PinAt>; source: string; detailed: boolean; replaces: boolean; }

const P = 2.54;
/** footprint sources: shown in the API's provenance */
export const FOOTPRINT_SOURCES: Record<string, string> = {
  arduino_nano: "Arduino Nano reference design (A000005 datasheet): 43.18 x 17.78 mm, two 15-pin rows 15.24 mm apart, D12/D13 at the USB end",
  arduino_uno: "Arduino Uno Rev3 reference design (A000066): 68.6 x 53.3 mm, header columns on the 0.1 in grid, D0 at 63.5 mm, power header from 27.94 mm",
  rpi5: "Raspberry Pi 5 mechanical drawing: 85 x 56 mm, 40-pin header centred 3.5 mm from the long edge, pin 1 at 8.37 mm, holes 58 x 49 mm",
  pca9685: "Adafruit PCA9685 16-channel board (product 815) layout: 62.2 x 25.4 mm, 6-pin control headers at both ends, 16 x 3 servo headers in four groups",
  tb6612: "SparkFun TB6612FNG breakout (ROB-14450): 20.3 x 20.3 mm, two rows of 8 pins 17.78 mm apart",
  esp32s3: "Espressif ESP32-S3-DevKitC-1 user guide: two 22-pin rows 22.86 mm apart, module at the far end",
  hc_sr04: "HC-SR04 module: 45 x 20 mm board, two 16 mm transducers 24 mm apart, 4-pin header centred on the long edge",
  pololu_d36v50: "Pololu D36V50Fx regulator: 25.4 x 25.4 mm, through holes on the 0.1 in grid in two 1 x 6 strips",
  generic: "catalog body box; pins on the face the part's leads leave (no datasheet pin map in the catalog)",
};

const pcbColour = (key: string): Mat => /arduino|uno|nano/.test(key) ? "pcb_teal" : /rpi|raspberry|camera/.test(key) ? "pcb_green" : /tb6612|l298|cytron/.test(key) ? "pcb_red" : /pca9685|buck|hc_sr04|bus_servo|lcd|waveshare/.test(key) ? "pcb_blue" : /bno|purple/.test(key) ? "pcb_purple" : /esp32|jetson|u2d2|ws2812/.test(key) ? "pcb_black" : "pcb_green";

/** a male header pin: through the board, `below` mm under it (pins down) or above (pins up), with its plastic spacer */
function headerPin(b: Builder, x: number, y: number, z0: number, dir: 1 | -1, length = 6, spacer = 2.5) {
  const zs = z0 + dir * spacer;
  b.box("header", [x - 1.27, y - 1.27, Math.min(z0, zs)], [x + 1.27, y + 1.27, Math.max(z0, zs)]);
  b.pin("gold", [x, y, z0 - dir * 1.6], [x, y, zs + dir * length]);
}
/** a female socket on top of a board */
function socket(b: Builder, x: number, y: number, z0: number, h = 8.5) {
  b.box("header", [x - 1.27, y - 1.27, z0], [x + 1.27, y + 1.27, z0 + h]);
}

export function partModel(key: string): PartModel {
  const e = electrical(key), c = part(key), bb = c.bbox_mm ?? { min: [0, 0, 0] as V3, max: (c.envelope_mm ?? [20, 20, 10]) as V3 };
  const pins = new Map<string, PinAt>(), b = new Builder();
  // a name on several pins of a header (GND, 5V, 3V3): the record's wire goes to the first of them
  const set = (port: string, name: string, at: V3, out: V3, kind: PinAt["kind"]) => { if (!pins.has(`${port}.${name}`)) pins.set(`${port}.${name}`, { at, out, kind }); };
  /** every port pin with this name gets this position (a board's GND appears in several ports) */
  const byName = (name: string, at: V3, out: V3, kind: PinAt["kind"]) => { for (const p of e?.ports ?? []) for (const x of p.pins.v) if (x.name === name || x.name.split(" (")[0] === name) set(p.name, x.name, at, out, kind); };
  const T = 1.6;
  let source = FOOTPRINT_SOURCES.generic, detailed = true;

  if (/^arduino_nano/.test(key)) {
    source = FOOTPRINT_SOURCES.arduino_nano;
    b.box("pcb_teal", [0, 0, 0], [43.18, 17.78, T]);
    b.box("silver", [-1.5, 5.4, T], [7.5, 12.4, T + 3.2]);                        // USB-C
    b.box("ic", [19, 5.4, T], [26, 12.4, T + 1.1]);                                // ATmega328P TQFP
    b.box("ic", [9.5, 6.5, T], [14.5, 11.3, T + 1.5]);                             // CH340
    b.box("silver", [30.5, 7.4, T], [33.5, 10.4, T + 1.4]);                        // reset button
    b.box("plastic_white", [16, 2.6, T], [17.2, 3.6, T + 0.6]);                    // LEDs
    const row = (port: string, y: number, fromUsb: boolean) => {
      const pv = e!.ports.find((p) => p.name === port)!.pins.v;
      pv.forEach((x, i) => { const k = fromUsb ? i : 14 - i, xx = 3.81 + k * P; headerPin(b, xx, y, 0, -1); set(port, x.name, [xx, y, -8.5], [0, 0, -1], "header"); });
    };
    row("j2_analog_side", 16.51, true); row("j1_digital_side", 1.27, false);
    const icsp = e!.ports.find((p) => p.name === "icsp");
    icsp?.pins.v.forEach((x, i) => { const xx = 39.4 + (i % 2) * P, yy = 6.35 + Math.floor(i / 2) * P; b.box("header", [xx - 1.2, yy - 1.2, T], [xx + 1.2, yy + 1.2, T + 2.5]); b.pin("gold", [xx, yy, T], [xx, yy, T + 8]); set("icsp", x.name, [xx, yy, T + 8], [0, 0, 1], "header"); });
    set("usb", "VBUS", [-1.5, 8.9, T + 1.6], [-1, 0, 0], "plug");
    for (const n of ["D-", "D+", "GND"]) set("usb", n, [-1.5, 8.9, T + 1.6], [-1, 0, 0], "plug");
    b.label("NANO", [30, 13.5, T + 0.02], 9, 2.4); b.label("ATmega328P", [22.5, 4, T + 0.02], 8, 1.4);
  } else if (/^arduino_uno/.test(key)) {
    source = FOOTPRINT_SOURCES.arduino_uno;
    b.box("pcb_teal", [0, 0, 0], [68.58, 53.34, T]);
    b.box("silver", [-6.2, 31.7, T], [10, 43.7, T + 11]);                           // USB-B
    b.box("plastic_black", [-1.8, 3.3, T], [12, 12.3, T + 11]);                    // DC jack
    b.box("ic", [31, 14, T], [66.5, 21.6, T + 3.4]);                               // ATmega328P DIP-28
    b.box("plastic_black", [31, 14, T + 3.4], [66.5, 21.6, T + 4.4]);
    b.box("silver", [15, 28, T], [26, 33, T + 3.5]);                               // crystal / regulator
    const dig = e!.ports.find((p) => p.name === "jdigital")!.pins.v, ana = e!.ports.find((p) => p.name === "janalog")!.pins.v;
    dig.forEach((x, i) => { const xx = i < 8 ? 63.5 - i * P : 41.656 - (i - 8) * P, yy = 50.8; socket(b, xx, yy, T); set("jdigital", x.name, [xx, yy, T + 8.5], [0, 0, 1], "socket"); });
    ana.forEach((x, i) => { const xx = i < 8 ? 27.94 + i * P : 50.8 + (i - 8) * P, yy = 2.54; socket(b, xx, yy, T); set("janalog", x.name, [xx, yy, T + 8.5], [0, 0, 1], "socket"); });
    e!.ports.find((p) => p.name === "icsp")?.pins.v.forEach((x, i) => { const xx = 63.6 + Math.floor(i / 2) * P, yy = 25.5 + (i % 2) * P; b.box("header", [xx - 1.2, yy - 1.2, T], [xx + 1.2, yy + 1.2, T + 2.5]); b.pin("gold", [xx, yy, T], [xx, yy, T + 8]); set("icsp", x.name, [xx, yy, T + 8], [0, 0, 1], "header"); });
    set("power_jack", "VIN", [-1.8, 7.8, T + 5.5], [-1, 0, 0], "plug"); set("power_jack", "GND", [-1.8, 7.8, T + 5.5], [-1, 0, 0], "plug");
    for (const n of ["VBUS", "D-", "D+", "GND"]) set("usb", n, [-6.2, 37.7, T + 5.5], [-1, 0, 0], "plug");
    b.label("UNO", [45, 32, T + 0.02], 12, 4); b.label("ARDUINO", [45, 26.5, T + 0.02], 14, 2.6);
  } else if (key === "rpi5") {
    source = FOOTPRINT_SOURCES.rpi5;
    b.box("pcb_green", [0, 0, 0], [85, 56, T]);
    b.box("silver", [22, 24, T], [37, 39, T + 2.2]);                               // BCM2712 heat spreader
    b.box("ic", [44, 30, T], [52, 38, T + 1]);                                     // RP1
    b.box("ic", [22, 10, T], [36, 20, T + 1]);                                     // RAM
    b.box("silver", [65, 2, T], [88, 16, T + 13.5]);                               // Ethernet
    b.box("silver", [70, 21, T], [88, 34, T + 16]); b.box("silver", [70, 39, T], [88, 52, T + 16]);   // USB stacks
    b.box("plastic_blue", [70.5, 21.5, T + 3], [87.5, 33.5, T + 5]); b.box("plastic_black", [70.5, 39.5, T + 3], [87.5, 51.5, T + 5]);
    b.box("silver", [3.5, -1.2, T], [12.5, 6, T + 3.2]);                           // USB-C power
    for (const [hx, hy] of [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]]) b.cyl("gold", [hx, hy, 0], [hx, hy, T + 0.05], 3, 16);
    const g = e!.ports.find((p) => p.name === "gpio40")!.pins.v;
    g.forEach((x) => { const n = +x.pin, col = Math.floor((n - 1) / 2), xx = 8.37 + col * P, yy = n % 2 ? 51.23 : 53.77; headerPin(b, xx, yy, T, 1); set("gpio40", x.name, [xx, yy, T + 8.5], [0, 0, 1], "header"); });
    for (const n of ["VBUS", "GND", "CC1", "CC2", "D-", "D+"]) set("power_usbc", n, [8, -1.2, T + 1.6], [0, -1, 0], "plug");
    for (const port of ["usb_a", "ethernet", "micro_hdmi", "pcie_fpc"]) set(port, "LINK", [88, 28, T + 8], [1, 0, 0], "plug");
    for (const port of ["cam_dsi_0", "cam_dsi_1"]) for (const x of e!.ports.find((p) => p.name === port)?.pins.v ?? []) set(port, x.name, [port.endsWith("0") ? 45 : 50, 2, T + 3], [0, 0, 1], "plug");
    b.box("plastic_black", [43, 0.5, T], [47, 4.5, T + 2.5]); b.box("plastic_black", [48, 0.5, T], [52, 4.5, T + 2.5]);
    b.label("Raspberry Pi 5", [16, 46, T + 0.02], 20, 3);
  } else if (/^pca9685/.test(key)) {
    source = FOOTPRINT_SOURCES.pca9685;
    b.box("pcb_blue", [0, 0, 0], [62.23, 25.4, T]);
    b.box("ic", [27.5, 8, T], [35.5, 13, T + 1.2]);                                // PCA9685 TSSOP
    b.box("plastic_blue", [26.5, 18.5, T], [36.5, 25, T + 8.5]);                   // V+ screw terminal
    b.box("silver", [28.5, 20, T + 8.5], [30.5, 22, T + 9]); b.box("silver", [32.5, 20, T + 8.5], [34.5, 22, T + 9]);
    set("v_plus", "V+", [29.5, 25, T + 4], [0, 1, 0], "terminal"); set("v_plus", "GND", [33.5, 25, T + 4], [0, 1, 0], "terminal");
    const ctl = ["GND", "OE", "SCL", "SDA", "VCC", "V+"];
    for (const [port, xx] of [["control_in", 1.27], ["control_out", 60.96]] as const) ctl.forEach((n, i) => { const yy = 6.35 + i * P; headerPin(b, xx, yy, T, 1); set(port, n, [xx, yy, T + 8.5], [0, 0, 1], "header"); });
    for (let ch = 0; ch < 16; ch++) {
      const xx = 8.9 + ch * P + Math.floor(ch / 4) * 1.27;
      ["GND", "V+", `PWM${ch}`].forEach((n, r) => { const yy = 1.27 + r * P; headerPin(b, xx, yy, T, 1); set(`ch${ch}`, n === `PWM${ch}` ? `PWM${ch}` : n, [xx, yy, T + 8.5], [0, 0, 1], "header"); });
      // the record names a channel's signal PWM (pin name) or PWMk: both resolve here
      const port = e!.ports.find((p) => p.name === `ch${ch}`); for (const x of port?.pins.v ?? []) if (/^PWM/.test(x.name)) pins.set(`ch${ch}.${x.name}`, pins.get(`ch${ch}.PWM${ch}`)!);
    }
    b.label("16-CH PWM", [44, 18, T + 0.02], 14, 2.4);
  } else if (key === "tb6612fng_module") {
    source = FOOTPRINT_SOURCES.tb6612;
    b.box("pcb_red", [0, 0, 0], [20.32, 20.32, T]);
    b.box("ic", [7, 6.5, T], [13.3, 13.8, T + 1.1]);
    const left = ["PWMA", "AIN2", "AIN1", "STBY", "BIN1", "BIN2", "PWMB", "GND"], right = ["VM", "VCC", "GND", "AO1", "AO2", "BO2", "BO1", "GND"];
    left.forEach((n, i) => { const yy = 19.05 - i * P; headerPin(b, 1.27, yy, 0, -1); byName(n, [1.27, yy, -8.5], [0, 0, -1], "header"); });
    right.forEach((n, i) => { const yy = 19.05 - i * P; headerPin(b, 19.05, yy, 0, -1); if (!(n === "GND" && i === 7)) byName(n, [19.05, yy, -8.5], [0, 0, -1], "header"); });
    b.label("TB6612FNG", [10.16, 16, T + 0.02], 10, 1.6);
  } else if (key === "esp32_s3_devkitc1") {
    source = FOOTPRINT_SOURCES.esp32s3;
    b.box("pcb_black", [0, 0, 0], [63.24, 25.4, T]);
    b.box("silver", [40, 4.2, T], [58, 21.2, T + 3.2]);                            // WROOM module can
    b.box("pcb_black", [58, 4.2, T], [63.24, 21.2, T + 0.8]);
    b.box("silver", [-1, 3, T], [5, 10, T + 2.8]); b.box("silver", [-1, 15.4, T], [5, 22.4, T + 2.8]);   // two micro-USB
    for (const [port, yy] of [["j1", 24.13], ["j3", 1.27]] as const) e!.ports.find((p) => p.name === port)!.pins.v.forEach((x, i) => { const xx = 60.0 - i * P; headerPin(b, xx, yy, 0, -1); set(port, x.name, [xx, yy, -8.5], [0, 0, -1], "header"); });
    for (const n of ["VBUS", "D-", "D+", "GND"]) { set("usb_uart", n, [-1, 6.5, T + 1.4], [-1, 0, 0], "plug"); set("usb_native", n, [-1, 18.9, T + 1.4], [-1, 0, 0], "plug"); }
    b.label("ESP32-S3", [49, 12.7, T + 3.22], 12, 2.6);
  } else if (key === "hc_sr04") {
    source = FOOTPRINT_SOURCES.hc_sr04;
    b.box("pcb_blue", [0, 0, 0], [45, 20, T]);
    for (const cx of [10.5, 34.5]) { b.cyl("silver", [cx, 10, T], [cx, 10, T + 12], 8, 24); b.cyl("plastic_black", [cx, 10, T + 12], [cx, 10, T + 12.05], 6.5, 24, true); }
    b.box("silver", [19, 13, T], [26, 16.5, T + 3]);                               // crystal
    ["Vcc", "Trig", "Echo", "Gnd"].forEach((n, i) => { const xx = 18.69 + i * P; b.box("header", [xx - 1.27, -2.5, -2.54], [xx + 1.27, 0, 0]); b.pin("gold", [xx, 1, -1.27], [xx, -8.5, -1.27]); byName(n, [xx, -8.5, -1.27], [0, -1, 0], "header"); });
    b.label("HC-SR04", [22.5, 3, T + 0.02], 10, 2);
  } else if (/^buck_5v|pololu_d36/.test(key)) {
    source = FOOTPRINT_SOURCES.pololu_d36v50;
    b.box("pcb_blue", [0, 0, 0], [25.4, 25.4, T]);
    b.box("plastic_grey", [6, 6, T], [17, 17, T + 7]);                              // inductor
    b.box("ic", [3, 18.5, T], [9, 22.5, T + 1]);
    const port = e!.ports[0];
    port.pins.v.forEach((x, i) => { const left = i < Math.ceil(port.pins.v.length / 2), k = left ? i : i - Math.ceil(port.pins.v.length / 2), xx = left ? 1.27 : 24.13, yy = 6.35 + k * P; headerPin(b, xx, yy, 0, -1); set(port.name, x.name, [xx, yy, -8.5], [0, 0, -1], "header"); });
  } else {
    detailed = false;
    generic(key, e?.ports ?? [], bb, b, set);
  }
  // any pin still without a place: on the body's -x face, in order (never left out of the drawing)
  let k = 0;
  for (const p of e?.ports ?? []) for (const x of p.pins.v) if (!pins.has(`${p.name}.${x.name}`)) { const y = bb.min[1] + ((k++ % 8) + 1) * ((bb.max[1] - bb.min[1]) / 9); pins.set(`${p.name}.${x.name}`, { at: [bb.min[0], y, (bb.min[2] + bb.max[2]) / 2], out: [-1, 0, 0], kind: "pad" }); }
  const replaces = detailed || (e?.role !== "actuator");
  return { ...b.done(), pins, source, detailed, replaces };
}

type Port = { name: string; pins: { v: { pin: string; name: string; signal: string }[] } };
/** a part without a datasheet pin map: its body by kind, its pins where its leads really leave */
function generic(key: string, ports: Port[], bb: { min: V3; max: V3 }, b: Builder, set: (port: string, name: string, at: V3, out: V3, kind: PinAt["kind"]) => void) {
  const [x0, y0, z0] = bb.min, [x1, y1, z1] = bb.max, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, role = electrical(key)?.role ?? "";
  const lead = (port: Port, at: (i: number, n: number) => V3, out: V3, kind: PinAt["kind"]) => port.pins.v.forEach((x, i) => set(port.name, x.name, at(i, port.pins.v.length), out, kind));
  if (role === "carrier" || /breadboard/.test(key)) {
    // solderless breadboard: white body, the centre channel, red and blue power rails, the tie-point field
    b.box("plastic_white", [x0, y0, z0], [x1, y1, z1]);
    b.box("plastic_grey", [x0 + 1, cy - 1.2, z1 - 1.5], [x1 - 1, cy + 1.2, z1 + 0.01]);
    const rail = (y: number, m: Mat) => b.box(m, [x0 + 3, y - 0.3, z1], [x1 - 3, y + 0.3, z1 + 0.05]);
    rail(y0 + 2, "plastic_red"); rail(y0 + 8.5, "plastic_blue"); rail(y1 - 8.5, "plastic_red"); rail(y1 - 2, "plastic_blue");
    for (let x = x0 + 4; x < x1 - 3; x += P) for (const [ya, yb] of [[y0 + 11, cy - 2], [cy + 2, y1 - 11]]) b.box("header", [x - 0.45, ya, z1 - 0.2], [x + 0.45, yb, z1 + 0.04]);
  } else if (role === "battery") {
    const cells = /18650/.test(key);
    if (cells) { const n = 2, r = Math.min((y1 - y0) / (2 * n), (z1 - z0) / 2) * 0.95; b.box("plastic_black", [x0, y0, z0], [x1, y1, z0 + 1.5]); for (let i = 0; i < n; i++) { const yy = y0 + (i + 0.5) * ((y1 - y0) / n); b.cyl("cell_teal", [x0 + 4, yy, z0 + r + 1.5], [x1 - 4, yy, z0 + r + 1.5], r, 20); } }
    else { b.box("cell_blue", [x0 + 2, y0, z0], [x1 - 2, y1, z1]); b.box("plastic_black", [x1 - 2, y0, z0], [x1, y1, z1]); b.label(key.replace(/_/g, " ").toUpperCase(), [(x0 + x1) / 2, cy, z1 + 0.05], Math.min(40, x1 - x0 - 10), 5); }
    for (const p of ports) lead(p, (i, n) => [x1, cy + (i - (n - 1) / 2) * 4, cz], [1, 0, 0], p.name === "main" ? "plug" : "lead");
    if (!cells) b.box("plastic_yellow", [x1, cy - 8, cz - 4], [x1 + 8, cy + 8, cz + 4]);   // XT60
  } else if (/fuse_holder/.test(key)) {
    b.box("plastic_black", [x0 + 8, y0, z0], [x1 - 8, y1, z1]);
    b.box("plastic_red", [(x0 + x1) / 2 - 5, y0 + 2, z1], [(x0 + x1) / 2 + 5, y1 - 2, z1 + 3]);   // blade fuse top
    b.cyl("plastic_black", [x0, cy, cz], [x0 + 8, cy, cz], 3, 12); b.cyl("plastic_black", [x1 - 8, cy, cz], [x1, cy, cz], 3, 12);
    for (const p of ports) p.pins.v.forEach((x, i) => set(p.name, x.name, i === 0 ? [x0, cy, cz] : [x1, cy, cz], i === 0 ? [-1, 0, 0] : [1, 0, 0], "lead"));
  } else if (/wago/.test(key)) {
    b.box("plastic_grey", [x0, y0, z0], [x1, y1, z1 - 2]);
    const n = 5, w = (y1 - y0) / n;
    for (let i = 0; i < n; i++) b.box("plastic_orange", [x0 + (x1 - x0) * 0.45, y0 + i * w + 0.4, z1 - 3], [x1, y0 + (i + 1) * w - 0.4, z1]);
    for (const p of ports) lead(p, (i) => [x0, y0 + (i + 0.5) * w, cz - 1], [-1, 0, 0], "lever");
  } else if (/switch|estop/.test(key)) {
    b.box("plastic_black", [x0, y0, z1 - 3], [x1, y1, z1]);                         // bezel
    b.box("plastic_black", [x0 + 1.5, y0 + 1.5, z0 + 4], [x1 - 1.5, y1 - 1.5, z1 - 3]);
    b.box("plastic_red", [x0 + 2.5, y0 + 2.5, z1], [x1 - 2.5, y1 - 2.5, z1 + 2]);   // rocker
    for (const p of ports) p.pins.v.forEach((x, i) => { const yy = cy + (i - (p.pins.v.length - 1) / 2) * 6; b.box("silver", [-0.4, yy - 2.4, z0], [0.4, yy + 2.4, z0 + 4]); set(p.name, x.name, [0, yy, z0], [0, 0, -1], "tab"); });
  } else if (role === "actuator") {
    // the motor body comes from its datasheet CAD (drawn by the robot view); its leads leave at the back
    const servo = /sg90|mg90|mg996|ds3218|sts|dxl|feetech|xl|xm|xh/.test(key);
    // bus servos: two sockets where the maker puts them. Feetech STS: side by side under the case. DYNAMIXEL X430 / X540:
    // one in each long side of the back case (dxlPlug); the plug sits inside the case, so the pin is drawn 10 mm in and
    // the wire is free to bend where it leaves the slot. These are the faces the cradles' plug windows open. A hobby servo's
    // fixed lead is drawn from the cable slot every cradle has (low on its +y wall), where it comes out of the print.
    ports.forEach((p, k) => {
      const side = (k - (ports.length - 1) / 2) * 2;
      if (/^feetech_sts/.test(key)) lead(p, (i, n) => [-14 + (i - (n - 1) / 2) * 2.5, side * 4.5, z0], [0, 0, -1], "jst");
      else if (dxlPlug(key)) { const q = dxlPlug(key)!, sg = side < 0 ? -1 : 1; lead(p, (i, n) => [q.x + (i - (n - 1) / 2) * 2.5, sg * (y1 - 10), q.z], [0, sg, 0], "jst"); }
      else if (/^dxl_/.test(key)) lead(p, (i, n) => [x0, side * 5.5 + (i - (n - 1) / 2) * 2.5 * 0, z0 + 6.5 + (i - (n - 1) / 2) * 2.5], [-1, 0, 0], "jst");
      else if (servo) lead(p, (i, n) => [x0 + 11 + (i - (n - 1) / 2) * 2.54, y1, z0 + 5.2], [0, 1, 0], "lead");
      else {
        // a motor's leads leave its rear: the end of the body furthest from the output (the origin), pointing away from it
        const ext: [number, number, number][] = [[0, -1, -x0], [0, 1, x1], [1, -1, -y0], [1, 1, y1], [2, -1, -z0], [2, 1, z1]], [ax, sg] = ext.sort((a, b) => b[2] - a[2])[0];
        const c: V3 = [(x0 + x1) / 2, cy, cz], out: V3 = [0, 0, 0]; out[ax] = sg; const across = ax === 1 ? 0 : 1;
        lead(p, (i, n) => { const at: V3 = [...c]; at[ax] = sg > 0 ? [x1, y1, z1][ax] : [x0, y0, z0][ax]; at[across] += (i - (n - 1) / 2) * 3; return at; }, out, "lead");
      }
    });
  } else if (role === "psu" || /psu|lrs/.test(key)) {
    b.box("silver", [x0, y0, z0], [x1, y1, z1]);
    // the terminal block is at the -x end of the case: the designs leave the room for its wires there (controlCase)
    b.box("plastic_black", [x0, y0 + 2, z0 + 2], [x0 + 12, y1 - 2, z0 + 14]);
    let k = 0; for (const p of ports) for (const x of p.pins.v) { const yy = y0 + 6 + (k++) * 9.5; set(p.name, x.name, [x0, Math.min(yy, y1 - 4), z0 + 8], [-1, 0, 0], "terminal"); }
  } else if (role === "controller" || role === "driver" || role === "regulator" || role === "sensor" || role === "adapter" || role === "indicator") {
    const pcb = pcbColour(key), t = 1.6, top = Math.min(z1, z0 + t);
    b.box(pcb, [x0, y0, z0], [x1, y1, top]);
    const w = x1 - x0, h = y1 - y0;
    b.box("ic", [x0 + w * 0.35, y0 + h * 0.3, top], [x0 + w * 0.65, y0 + h * 0.7, top + 1.2]);
    if (z1 - top > 4) b.box("plastic_black", [x0 + w * 0.1, y0 + h * 0.15, top], [x0 + w * 0.25, y0 + h * 0.45, Math.min(z1, top + 6)]);
    // header rows along the long edge, one port after another
    let k = 0; const all = ports.flatMap((p) => p.pins.v.map((x) => ({ port: p.name, name: x.name, sig: x.signal })));
    const along = w >= h, n = Math.max(1, all.length), pitch = Math.min(P, (along ? w : h) / (n + 1));
    for (const q of all) {
      if (q.sig === "cable" || q.name === "LINK") { set(q.port, q.name, [x0, cy, top + 2], [-1, 0, 0], "plug"); continue; }
      const s = (k++ + 1) * pitch, at: V3 = along ? [x0 + s, y0 + 1.27, top] : [x0 + 1.27, y0 + s, top];
      b.pin("gold", at, [at[0], at[1], top + 6]); b.box("header", [at[0] - 1.2, at[1] - 1.2, top], [at[0] + 1.2, at[1] + 1.2, top + 2.5]);
      set(q.port, q.name, [at[0], at[1], top + 6], [0, 0, 1], "header");
    }
    if (role !== "indicator") b.label(part(key).name.split(/ \(|, /)[0].slice(0, 22), [x0 + w / 2, y0 + h * 0.85, top + 0.02], Math.min(w * 0.8, 30), Math.min(h * 0.12, 3));
  } else {
    b.box("plastic_grey", [x0, y0, z0], [x1, y1, z1]);
    for (const p of ports) lead(p, (i, n) => [x0, cy + (i - (n - 1) / 2) * 3, cz], [-1, 0, 0], "lead");
  }
}
