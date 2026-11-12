// A virtual ATmega328P (Arduino Uno and Nano) running a compiled sketch, on avr8js (MIT, github.com/wokwi/avr8js), and
// the parts the sketch talks to, modelled from what is on its pins:
//   motor drivers (TB6612FNG, L298N): each channel's direction from its two inputs and its speed from the duty of its PWM
//     input, measured edge to edge in CPU cycles (analogWrite on any of the three timers, or a plain digitalWrite);
//   hobby servos on a board pin: the angle from the width of the pulse the Servo library sends, against the servo's own
//     pulse range;
//   PCA9685 servo drivers on I2C: the chip's registers (MODE1, PRE_SCALE, LEDn_ON / LEDn_OFF) written over TWI, and from
//     them each channel's pulse width at the frequency the prescaler sets (datasheet: f = 25 MHz / (4096 x (prescale + 1)));
//   HC-SR04: a trigger pulse of 10 us or more starts a ping; the echo pin goes high after the sensor's own delay for the
//     time sound takes to the nearest thing in front of it and back (343 m/s), which the caller measures in the 3D scene;
//   the serial port: every byte the sketch sends, and bytes typed in.
// Nothing here is a stand-in: the motors, servos and sensor are driven only by what the compiled program does with the pins.
// The module takes the avr8js namespace as an argument, so the same code runs in the page and in the node tests.

const F_CPU = 16e6;
/** Arduino pin number -> [port, bit]: D0-D7 port D, D8-D13 port B, A0-A5 (14-19) port C */
export function pinPort(n) { return n < 8 ? ["D", n] : n < 14 ? ["B", n - 8] : ["C", n - 14]; }

/** Intel HEX (as arduino-cli writes it) to the flash image */
export function parseHex(text) {
  const flash = new Uint8Array(0x8000);
  let base = 0, top = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    if (line[0] !== ":") throw new Error("not an Intel HEX file");
    const b = []; for (let i = 1; i < line.length; i += 2) b.push(parseInt(line.slice(i, i + 2), 16));
    const n = b[0], addr = (b[1] << 8) | b[2], type = b[3];
    let sum = 0; for (const x of b) sum = (sum + x) & 0xff;
    if (sum !== 0) throw new Error("HEX checksum error");
    if (type === 0) { for (let i = 0; i < n; i++) { const a = base + addr + i; if (a >= flash.length) throw new Error("program larger than the ATmega328P's 32 KB flash"); flash[a] = b[4 + i]; } top = Math.max(top, base + addr + n); }
    else if (type === 2) base = ((b[4] << 8) | b[5]) << 4;
    else if (type === 4) base = ((b[4] << 8) | b[5]) << 16;
    else if (type === 1) break;
  }
  return { flash, bytes: top };
}

/**
 * A running board. `plan` is the firmware plan of the engine's firmware(robot) (motors, servos, servo_drivers,
 * range_sensor, serial_baud); `distanceCm()` is asked at each ping for what the sensor sees (null: nothing in range).
 */
export function createBoard(avr, hexText, plan, { distanceCm = () => null, onSerial = () => {} } = {}) {
  const { flash } = parseHex(hexText);
  const cpu = new avr.CPU(new Uint16Array(flash.buffer));
  const timers = [new avr.AVRTimer(cpu, avr.timer0Config), new avr.AVRTimer(cpu, avr.timer1Config), new avr.AVRTimer(cpu, avr.timer2Config)];
  const ports = { B: new avr.AVRIOPort(cpu, avr.portBConfig), C: new avr.AVRIOPort(cpu, avr.portCConfig), D: new avr.AVRIOPort(cpu, avr.portDConfig) };
  const usart = new avr.AVRUSART(cpu, avr.usart0Config, F_CPU);
  const twi = new avr.AVRTWI(cpu, avr.twiConfig, F_CPU);
  void timers;
  const serial = [];
  usart.onByteTransmit = (b) => { serial.push(b); onSerial(String.fromCharCode(b)); };

  // ---- pin levels and their timing: per watched pin, its last rising edge, the width of its last high pulse and the period between rises
  const level = (n) => { const [p, bit] = pinPort(n); return ports[p].pinState(bit) === avr.PinState.High; };
  const watch = new Map();   // pin -> { high, since, rise, pulse, period, edges } (cycles)
  const track = (n) => { if (!watch.has(n)) watch.set(n, { high: level(n), since: cpu.cycles, rise: -1, pulse: 0, period: 0, edges: 0 }); };
  for (const m of plan.motors ?? []) { track(m.pwm); track(m.in1); track(m.in2); }
  for (const s of plan.servos ?? []) if ("pin" in s.via) track(s.via.pin);
  const range = plan.range_sensor; if (range) track(range.trig);
  const listeners = [];
  for (const [name, port] of Object.entries(ports)) port.addListener(() => {
    for (const [n, w] of watch) {
      const [p] = pinPort(n); if (p !== name) continue;
      const h = level(n); if (h === w.high) continue;
      const t = cpu.cycles;
      if (w.high) w.pulse = t - w.rise; else { if (w.rise >= 0) w.period = t - w.rise; w.rise = t; }
      w.high = h; w.since = t; w.edges++;
      for (const f of listeners) f(n, h, t);
    }
  });
  /**
   * duty of a pin now (0..1): its last full PWM cycle, high time over period, while edges keep coming (within two periods);
   * a pin that stopped switching holds its level (analogWrite 0 and 255 are plain digital writes on the AVR core)
   */
  const duty = (n) => {
    const w = watch.get(n); if (!w) return level(n) ? 1 : 0;
    if (w.edges > 2 && w.period > 0 && cpu.cycles - w.rise < 2 * w.period) return Math.min(1, w.pulse / w.period);
    return level(n) ? 1 : 0;
  };
  // ---- HC-SR04: trigger high for 10 us or more, then the echo pulse (datasheet: 8 x 40 kHz burst first, about 0.2 ms here)
  const pings = [];   // { at: cycle the echo goes high, until: cycle it goes low }
  const sensor = { last_cm: null, pings: 0 };
  if (range) listeners.push((n, h, t) => {
    if (n !== range.trig || h) return;
    const w = watch.get(n); if (w.pulse < 10e-6 * F_CPU) return;
    const cm = distanceCm(); sensor.last_cm = cm; sensor.pings++;
    const at = t + 0.2e-3 * F_CPU;
    // nothing in range: the module holds echo high for about 38 ms (its time-out), longer than the sketch listens
    const width = cm == null ? 38e-3 : (2 * cm) / 100 / 343;
    pings.push({ at, until: at + width * F_CPU });
  });
  const [ep, ebit] = range ? pinPort(range.echo) : [null, 0];
  const echoTick = () => {
    if (!range) return;
    const t = cpu.cycles; let high = false;
    while (pings.length && pings[0].until <= t) pings.shift();
    if (pings.length && pings[0].at <= t) high = true;
    if (high !== sensor.echo) { ports[ep].setPin(ebit, high); sensor.echo = high; }
  };

  // ---- PCA9685 on TWI: registers per address
  const chips = new Map();   // 7-bit address -> { reg: Uint8Array(256), ptr }
  for (const d of plan.servo_drivers ?? []) { const reg = new Uint8Array(256); reg[0] = 0x11; reg[0xfe] = 0x1e; chips.set(d.address, { reg, ptr: 0 }); }
  let cur = null, first = false;
  twi.eventHandler = {
    start() { twi.completeStart(); },
    stop() { cur = null; twi.completeStop(); },
    connectToSlave(addr, write) { cur = chips.get(addr) ?? null; first = true; twi.completeConnect(!!cur && write); },
    writeByte(v) {
      if (!cur) { twi.completeWrite(false); return; }
      if (first) { cur.ptr = v; first = false; }
      else {
        // PRE_SCALE only takes a value while the chip sleeps (MODE1 bit 4), as on the real chip
        if (cur.ptr !== 0xfe || cur.reg[0] & 0x10) cur.reg[cur.ptr] = v;
        // auto-increment (MODE1 bit 5) steps the pointer, as setPWM's four-byte write needs
        if (cur.reg[0] & 0x20) cur.ptr = (cur.ptr + 1) & 0xff;
      }
      twi.completeWrite(true);
    },
    readByte() { twi.completeRead(cur ? cur.reg[cur.ptr] : 0xff); if (cur && cur.reg[0] & 0x20) cur.ptr = (cur.ptr + 1) & 0xff; },
  };
  /** a PCA9685 channel's pulse width in us, or null while the chip sleeps or the channel is off */
  const pcaUs = (board, ch) => {
    const d = plan.servo_drivers?.[board], c = d && chips.get(d.address); if (!c || c.reg[0] & 0x10) return null;
    const r = c.reg, b = 6 + 4 * ch, on = r[b] | ((r[b + 1] & 0x0f) << 8), off = r[b + 2] | ((r[b + 3] & 0x0f) << 8);
    if (r[b + 3] & 0x10) return null;   // full off
    const hz = 25e6 / (4096 * (r[0xfe] + 1));
    return ((((off - on) + 4096) % 4096) / 4096) * (1e6 / hz);
  };

  // ---- reading the parts
  /** each motor: signed speed -1..1 of the driver's output (direction from the inputs, magnitude from the PWM duty), in the motor's own sense */
  function motors() {
    return (plan.motors ?? []).map((m) => {
      const a = level(m.in1), b = level(m.in2), d = duty(m.pwm);
      // TB6612FNG and L298N truth tables: IN1 high, IN2 low = one way; IN1 low, IN2 high = the other; equal = brake or coast
      const s = a === b ? 0 : (a ? 1 : -1) * d;
      return { name: m.name, side: m.side, speed: s, forward: s * (m.forward ?? 1), duty: d, in1: a, in2: b };
    });
  }
  /** each servo: the pulse it gets (us) and the angle that makes, from its catalog pulse range */
  function servos() {
    return (plan.servos ?? []).map((s) => {
      let us = null;
      if ("pin" in s.via) { const w = watch.get(s.via.pin); us = w && w.edges > 1 && cpu.cycles - w.since < 0.05 * F_CPU + w.period ? (w.pulse / F_CPU) * 1e6 : null; }
      else us = pcaUs(s.via.board, s.via.channel);
      const [lo, hi] = s.pulse_us, span = s.range_deg;
      const deg = us == null ? null : ((us - (lo + hi) / 2) / (hi - lo)) * span;
      return { name: s.name, joint: s.joint, us, deg };
    });
  }

  // ---- running
  function run(ms) {
    const end = cpu.cycles + ms * 1e-3 * F_CPU;
    while (cpu.cycles < end) {
      avr.avrInstruction(cpu);
      cpu.tick();
      if (range && (pings.length || sensor.echo)) echoTick();
      if (inbox.length && !usart.rxBusy && usart.writeByte(inbox[0])) inbox.shift();
    }
  }
  /** bytes typed in: handed to the UART one character time apart, as a terminal sends them */
  const inbox = [];
  function send(text) { for (const ch of text) inbox.push(ch.charCodeAt(0) & 0xff); }
  return { cpu, run, send, motors, servos, sensor, serial, level, get ms() { return (cpu.cycles / F_CPU) * 1000; } };
}
