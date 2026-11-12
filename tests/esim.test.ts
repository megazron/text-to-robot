// Electrical simulation (packages/design/src/esim). The solver against circuits worked out by hand, each with its
// arithmetic beside it; then four example robots: the operating point converges, every checked supply is inside its
// record's range, the currents at every node sum to zero, every watt is accounted for, and each fault trips what the
// numbers say it must.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { RobotSpecification } from "@ttr/robot-schema";
import { WIRING } from "@ttr/parts";
import { Circuit, simulate, discharge, fuseWindow, FUSE_MINI, ocvCell, socOfCell, type SimResult, type SimOptions, type Motor, type Fuse, type WiringRecord } from "@ttr/design";
import type { ElectricalSim, ElectricalSimOptions } from "../apps/web/src/engine/client.ts";

const near = (got: number, want: number, tol: number, what: string) => assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, want ${want} within ${tol}`);
const robot = (ex: string) => JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")) as RobotSpecification;
const run = (ex: string, o: SimOptions = {}) => simulate(robot(ex), null, o);
const has = (r: SimResult, kind: string, inst?: string) => r.events.some((e) => e.kind === kind && (inst === undefined || e.inst === inst));

test("voltage divider", () => {
  // 12 V across 1 k + 2 k: i = 12 / 3000 = 4 mA, mid = 4 mA x 2 k = 8 V
  const c = new Circuit();
  const v = c.vsource("V", "top", "0", 12); c.resistor("R1", "top", "mid", 1000); c.resistor("R2", "mid", "0", 2000);
  const s = c.dc();
  assert.ok(s.ok);
  // (the solver's 1e-12 S from every node to ground takes 8 pA here: 5 nV off across 667 ohm)
  near(c.v(s.x, "mid"), 8, 1e-8, "mid");
  near(v.current(s.x), 0.004, 1e-10, "current");
  assert.ok(s.kcl_a < 1e-10);
});

test("two sources: superposition", () => {
  // 10 V through 100 ohm and 5 V through 200 ohm into a node with 300 ohm to ground.
  // 10 V alone: 200 || 300 = 120, node = 10 x 120 / 220 = 5.454545. 5 V alone: 100 || 300 = 75, node = 5 x 75 / 275 = 1.363636.
  // Sum 6.818182 V (= 75 / 11). Currents: (10 - 6.818182) / 100 = 31.818 mA from the 10 V source,
  // (5 - 6.818182) / 200 = -9.091 mA from the 5 V source (it is being charged), 6.818182 / 300 = 22.727 mA to ground.
  const c = new Circuit();
  const a = c.vsource("A", "a", "0", 10), b = c.vsource("B", "b", "0", 5);
  c.resistor("R1", "a", "n", 100); c.resistor("R2", "b", "n", 200); c.resistor("R3", "n", "0", 300);
  const s = c.dc();
  near(c.v(s.x, "n"), 75 / 11, 1e-9, "node");
  near(a.current(s.x), 0.0318181818, 1e-9, "10 V source");
  near(b.current(s.x), -0.0090909091, 1e-9, "5 V source");
  // a current source instead of the 5 V branch: 20 mA into the node. node = (10 / 100 + 0.02) / (1 / 100 + 1 / 300) = 0.12 / 0.0133333 = 9 V
  const d = new Circuit();
  d.vsource("A", "a", "0", 10); d.resistor("R1", "a", "n", 100); d.resistor("R3", "n", "0", 300); d.isource("I", "0", "n", 0.02);
  near(d.v(d.dc().x, "n"), 9, 1e-9, "node with a current source");
});

test("RC step response at t = tau", () => {
  // 5 V step into 1 k and 1 uF, tau = 1 ms: v(tau) = 5 x (1 - 1/e) = 3.160603 V.
  // Step h = tau / 100. Trapezoidal multiplies the remainder by (1 - h/2) / (1 + h/2) = exp(-h - h^3/12 - ...) a step,
  // so after 100 steps the exponent is off by h^2 / 12 = 8.3e-6 and v by 5/e x 8.3e-6 = 1.5e-5 V: bound 1e-4 V.
  // Backward Euler multiplies by 1 / (1 + h) = exp(-h + h^2/2 - ...): exponent off by h / 2 = 0.005, v by 5/e x 0.005 =
  // 9.2e-3 V (it lags): bound 2e-2 V, and it must be worse than 1e-3 V or it is not backward Euler.
  const want = 5 * (1 - Math.exp(-1));
  for (const method of ["trap", "be"] as const) {
    const c = new Circuit();
    c.vsource("V", "in", "0", 5); c.resistor("R", "in", "out", 1000); c.capacitor("C", "out", "0", 1e-6, 0);
    const r = c.transient({ t_end: 1e-3, dt: 1e-5, method, uic: true });
    assert.ok(r.ok && r.t.length === 101);
    near(c.v(r.x[0], "out"), 0, 1e-5, "starts empty");
    const err = Math.abs(c.v(r.x[100], "out") - want);
    if (method === "trap") assert.ok(err < 1e-4, `trapezoidal error ${err}`); else assert.ok(err > 1e-3 && err < 2e-2, `backward Euler error ${err}`);
  }
  // from the operating point instead: the capacitor is already at 5 V and nothing moves
  const c = new Circuit(); c.vsource("V", "in", "0", 5); c.resistor("R", "in", "out", 1000); c.capacitor("C", "out", "0", 1e-6);
  const r = c.transient({ t_end: 1e-3, dt: 1e-4 }); near(c.v(r.x[10], "out"), 5, 1e-6, "steady");
});

test("diode clamp", () => {
  // 10 V through 1 k into a diode of 0.7 V and 10 ohm: i = (10 - 0.7) / 1010 = 9.207921 mA, node = 0.7 + 0.0920792 = 0.792079 V.
  // Reversed (-10 V) it blocks: no current, the node sits at -10 V.
  const c = new Circuit();
  c.vsource("V", "in", "0", 10); c.resistor("R", "in", "n", 1000); const d = c.diode("D", "n", "0", { vf: 0.7, r_on: 10 });
  const s = c.dc();
  near(c.v(s.x, "n"), 0.7920792, 1e-7, "clamped node"); near(d.current(s.x, s.ctx), 0.009207921, 1e-9, "diode current");
  const e = new Circuit();
  e.vsource("V", "in", "0", -10); e.resistor("R", "in", "n", 1000); const d2 = e.diode("D", "n", "0", { vf: 0.7, r_on: 10 });
  const t = e.dc();
  near(e.v(t.x, "n"), -10, 1e-6, "blocked node"); near(d2.current(t.x, t.ctx), 0, 1e-12, "blocked current");
});

test("a battery with internal resistance feeding a constant-power load, and a buck regulator", () => {
  // 12 V behind 0.5 ohm, 20 W: v = 12 - 0.5 x 20 / v, so v^2 - 12 v + 10 = 0, v = (12 + sqrt(144 - 40)) / 2 = (12 + 10.198039) / 2
  // = 11.099020 V (the upper root: the lower one, 0.90 V, is the collapsed state), i = 20 / 11.099020 = 1.801961 A.
  const c = new Circuit();
  const b = c.vsource("B", "bat", "0", 12, { ohm: 0.5 }); c.powerLoad("P", "bat", "0", 20, 3);
  const s = c.dc();
  near(c.v(s.x, "bat"), 11.09902, 1e-6, "terminal"); near(b.current(s.x), 1.801961, 1e-6, "current");
  // The same battery into a 5 V buck at 80 % with 2.5 ohm on its output: 2 A, 10 W out, 12.5 W in.
  // v^2 - 12 v + 6.25 = 0, v = (12 + sqrt(144 - 25)) / 2 = (12 + 10.908712) / 2 = 11.454356 V, i_in = 12.5 / 11.454356 = 1.091288 A.
  const d = new Circuit();
  d.vsource("B", "bat", "0", 12, { ohm: 0.5 });
  const reg = d.regulator("U", "bat", "out", "0", { type: "buck", vout: 5, dropout: 0.5, i_limit: 8, efficiency: 0.8, uvlo: 3 }); d.resistor("RL", "out", "0", 2.5);
  const t = d.dc(), o = reg.out(t.x, t.ctx);
  near(o.vin, 11.454356, 1e-6, "buck input"); near(o.iin, 1.091288, 1e-6, "buck input current"); near(o.vout, 5, 1e-9, "buck output"); near(o.iout, 2, 1e-9, "buck output current");
  near(o.loss_w, 2.5, 1e-6, "loss = 12.5 - 10");
  assert.equal(reg.state(t.x, t.ctx), "regulating");
  // 30 W from that battery has no upper root worth the name: 144 - 60 > 0 still solves (v = 10.58 V), but 80 W does not
  // (144 - 160 < 0): the load collapses onto its resistive branch (80 W at its 3 V floor is 0.1125 ohm, v = 12 x 0.1125 / 0.6125 = 2.204 V).
  const e = new Circuit(); e.vsource("B", "bat", "0", 12, { ohm: 0.5 }); e.powerLoad("P", "bat", "0", 80, 3);
  const u = e.dc(); assert.ok(u.ok); near(e.v(u.x, "bat"), 2.204082, 1e-5, "collapsed");
});

test("regulator dropout and current limit", () => {
  // A linear 5 V regulator with 1.1 V dropout fed 5.6 V: out = 5.6 - 1.1 = 4.5 V into 100 ohm, 45 mA in and out, loss 1.1 x 0.045 = 49.5 mW.
  const c = new Circuit();
  c.vsource("V", "in", "0", 5.6); const r = c.regulator("U", "in", "out", "0", { type: "linear", vout: 5, dropout: 1.1, i_limit: 0.4 }); c.resistor("RL", "out", "0", 100);
  const s = c.dc(), o = r.out(s.x, s.ctx);
  near(o.vout, 4.5, 1e-9, "dropout output"); near(o.iin, 0.045, 1e-9, "input current"); near(o.loss_w, 0.0495, 1e-9, "loss"); assert.equal(r.state(s.x, s.ctx), "dropout");
  // Fed 9 V with 5 ohm on the output it would give 1 A; limited to 0.4 A the output is 0.4 x 5 = 2 V.
  const d = new Circuit();
  d.vsource("V", "in", "0", 9); const q = d.regulator("U", "in", "out", "0", { type: "linear", vout: 5, dropout: 1.1, i_limit: 0.4 }); d.resistor("RL", "out", "0", 5);
  const t = d.dc(); near(q.out(t.x, t.ctx).vout, 2, 1e-9, "limited output"); assert.equal(q.state(t.x, t.ctx), "limit");
  // A supply limited to 2 A into 1 ohm: 2 V instead of 5 V.
  const e = new Circuit(); const v = e.vsource("V", "out", "0", 5, { i_max: 2 }); e.resistor("RL", "out", "0", 1);
  const u = e.dc(); near(e.v(u.x, "out"), 2, 1e-9, "supply in limit"); assert.equal(v.state(u.x, u.ctx), "limit");
});

test("motor: running, and stalled with the rail sag it causes", () => {
  // A TT motor: 6 V, 1.5 A stall, so 4 ohm; no-load 0.15 A at 20.944 rad/s, so k = (6 - 0.15 x 4) / 20.944 = 0.257830 V s/rad.
  // Pack 7.4 V behind 0.1 ohm, 0.1 ohm of wire. Running at a 0.4 A load: rail = 7.4 - 0.04 = 7.36 V, motor = 7.32 V,
  // speed = (7.32 - 0.4 x 4) / 0.257830 = 22.185 rad/s.
  // Stalled: i = 7.4 / (0.1 + 0.1 + 4) = 1.761905 A, rail = 7.4 - 0.1761905 = 7.223810 V (sag 0.136 V more), motor = 7.047619 V.
  const make = (stalled: boolean) => { const c = new Circuit(); c.vsource("B", "rail", "0", 7.4, { ohm: 0.1 }); c.resistor("W", "rail", "m", 0.1); const m = c.motor("M", "m", "0", { ohm: 4, k: (6 - 0.15 * 4) / 20.944, load_a: 0.4, stalled }); return { c, m }; };
  const a = make(false), s = a.c.dc();
  near(a.c.v(s.x, "rail"), 7.36, 1e-9, "rail running"); near(a.c.v(s.x, "m"), 7.32, 1e-9, "motor running"); near(a.m.speed(s.x, s.ctx), 22.185, 1e-3, "speed");
  const b = make(true), t = b.c.dc();
  near(b.m.current(t.x, t.ctx), 1.7619048, 1e-6, "stall current"); near(b.c.v(t.x, "rail"), 7.2238095, 1e-6, "rail stalled"); near(b.c.v(t.x, "m"), 7.047619, 1e-6, "motor stalled");
  assert.equal((b.m as Motor).speed(t.x, t.ctx), 0);
  // A load it cannot carry stalls it by itself: 3 A through 4 ohm needs 12 V, so it draws the locked-rotor current.
  const c = new Circuit(); c.vsource("B", "m", "0", 6); const m = c.motor("M", "m", "0", { ohm: 4, k: 0.2578, load_a: 3 });
  const u = c.dc(); near(m.current(u.x, u.ctx), 1.5, 1e-9, "overloaded motor"); assert.equal(m.state(u.x, u.ctx), "stalled");
});

test("a fuse that must blow and fuses that must not", () => {
  const f4 = FUSE_MINI.rows.find((r) => r.a === 4)!;   // 23.48 milliohm
  const make = (load: number) => { const c = new Circuit(); c.vsource("V", "a", "0", 12); const f = c.fuse("F", "a", "b", 4, f4.mohm / 1000, FUSE_MINI.curve); c.resistor("RL", "b", "0", load); return { c, f }; };
  // 2 ohm: i = 12 / 2.02348 = 5.9304 A = 148.26 % of 4 A. Between the 135 % gate (0.75 s to 600 s) and the 200 % gate
  // (0.15 s to 5 s), log-log: u = ln(1.4826 / 1.35) / ln(2 / 1.35) = 0.09369 / 0.39304 = 0.2384;
  // longest = 600 x (5 / 600)^0.2384 = 192 s, shortest = 0.75 x (0.15 / 0.75)^0.2384 = 0.511 s. It opens, and nothing flows after.
  const a = make(2), s = a.c.dc();
  assert.equal(s.trips.length, 1); near(s.trips[0].current_a, 5.9304, 1e-3, "current before it opens");
  near(s.trips[0].opens_s[0], 0.511, 0.005, "shortest"); near(s.trips[0].opens_s[1], 192, 2, "longest");
  near(a.c.v(s.x, "b"), 0, 1e-6, "dead after the fuse"); near(a.c.v(s.before_trip!.x, "b"), 11.8607, 1e-3, "before it opened");
  // 4 ohm: 2.98 A, 75 %: holds. 2.5 ohm: 12 / 2.52348 = 4.755 A, 119 %: over its rating, under the 135 % at which the
  // datasheet first promises it opens, so it stays closed.
  for (const [load, amps] of [[4, 2.9825], [2.5, 4.7553]] as const) { const b = make(load), t = b.c.dc(); assert.equal(t.trips.length, 0); near(b.f.current(t.x, t.ctx), amps, 1e-3, `${load} ohm`); assert.equal((b.f as Fuse).blown, false); }
  // In time the 148 % fuse opens at the geometric mean of its window, sqrt(0.511 x 192) = 9.9 s.
  const c = make(2), r = c.c.transient({ t_end: 12, dt: 0.1 });
  assert.equal(r.events.length, 1); near(r.events[0].t, 9.9, 0.2, "opens at"); near(c.c.v(r.x[r.x.length - 1], "b"), 0, 1e-6, "dead at the end");
  // the gates themselves, and constant I^2 t past the last: 12 x rating is 4 x further than 6 x, 16 x sooner
  assert.deepEqual(fuseWindow(FUSE_MINI.curve, 2), [0.15, 5]); assert.equal(fuseWindow(FUSE_MINI.curve, 1.34), null);
  near(fuseWindow(FUSE_MINI.curve, 12)![1], 0.1 / 4, 1e-12, "past the last gate");
  // the datasheet's own melting I^2 t agrees with its 600 % gate: 17 A^2 s / (24 A)^2 = 29.5 ms against 30 ms
  near(f4.i2t / (6 * 4) ** 2, 0.03, 0.002, "I^2 t at 600 %");
});

test("no steady state is reported, not papered over", () => {
  // two ideal sources of different voltage across the same node: no solution
  const c = new Circuit(); c.vsource("A", "n", "0", 5); c.vsource("B", "n", "0", 6); c.resistor("R", "n", "0", 10);
  const s = c.dc();
  assert.equal(s.ok, false); assert.match(s.reason!, /singular/); assert.ok(Number.isNaN(s.kcl_a));
});

test("battery curve: state of charge to voltage and back", () => {
  // LiPo at 50 % is the table's 3.84 V; at 75 % halfway between 3.95 and 4.02 = 3.985 V
  near(ocvCell("lipo", 0.5), 3.84, 1e-12, "50 %"); near(ocvCell("lipo", 0.75), 3.985, 1e-12, "75 %"); near(socOfCell("lipo", 3.985), 0.75, 1e-9, "inverse");
});

const EXAMPLES = ["18_arduino_car", "19_arduino_arm", "05_diff_drive", "08_humanoid"];
for (const ex of EXAMPLES) {
  test(`${ex}: the typical operating point converges, supplies are in range, currents and power balance`, () => {
    const spec = robot(ex), r = simulate(spec, null, {});
    assert.ok(r.converged, r.reason); assert.equal(r.trips.length, 0);
    // every part whose supply is checked against its record is inside it
    const checked = Object.entries(r.parts).filter(([, p]) => p.min_v !== null && p.supply_v !== null);
    assert.ok(checked.length >= 4, `${ex}: ${checked.length} parts checked`);
    for (const [name, p] of checked) assert.ok(p.state === "ok" && p.supply_v! >= p.min_v! && p.supply_v! <= p.max_v!, `${ex}: ${name} gets ${p.supply_v} V, record ${p.min_v} to ${p.max_v}`);
    assert.ok(!r.events.some((e) => e.kind === "brown_out" || e.kind === "unpowered" || e.kind === "over_voltage"));
    // Kirchhoff's current law from the reported element currents, node by node
    const sum = new Map<string, number>();
    for (const e of r.elements) e.nodes.forEach((n, k) => sum.set(n, (sum.get(n) ?? 0) + e.i_a[k]));
    for (const [n, i] of sum) if (n !== "0") assert.ok(Math.abs(i) < 1e-6, `${ex}: ${i} A left over at ${n}`);
    assert.ok(r.kcl_max_residual_a! < 1e-6);
    // energy: what the sources deliver is what the wires, switch, fuses, regulators, drivers and loads take
    const p = r.power;
    assert.ok(p.sources_w > 1 && Math.abs(p.balance_w) < 1e-6 * p.sources_w, `${ex}: ${p.balance_w} W unaccounted of ${p.sources_w}`);
    // each wire is the wire table's resistance for its gauge and length, and its loss is I^2 R
    const recs = (spec.metadata as unknown as { design: { wiring: WiringRecord } }).design.wiring.cables.flatMap((c) => (c.premade ? [] : c.wires));
    let n = 0, loss = 0;
    for (const x of recs) { const sw = r.wires[x.id]; if (!sw || /[ab]$/.test(x.id)) continue; if (r.wires[`${x.id}a`]) continue; n++; near(sw.ohm, (WIRING.awg.find((g) => g.awg === x.awg)!.ohm_per_m * x.length_mm) / 1000, 1e-12, `${ex}: ${x.id} resistance`); near(sw.drop_v, sw.current_a * sw.ohm, 1e-9, `${ex}: ${x.id} drop`); }
    for (const [id, sw] of Object.entries(r.wires)) if (!r.wires[`${id}a`]) loss += sw.ohm * sw.current_a ** 2;
    assert.ok(n >= 10); near(loss, p.wires_w, 1e-9, `${ex}: wire loss`);
    // every rail's lowest supply is under its source and above zero; the same input gives the same output
    for (const [name, rail] of Object.entries(r.rails)) assert.ok(rail.min_v! > 0 && rail.min_v! <= rail.source_v! + 0.05, `${ex}: rail ${name}`);
    assert.deepEqual(simulate(spec, null, {}), r);
    assert.ok(r.assumptions.length >= 3 && r.assumptions.every((a) => a.parts.length && a.note.length > 20));
    // the engine API's declared result is this result
    const api: ElectricalSim = r; const back: SimResult = api; const o: ElectricalSimOptions = {} satisfies SimOptions; void back; void o;
  });
}

test("Arduino car: stalled motors, shorts, an open wire and a low battery", () => {
  const typ = run("18_arduino_car");
  // The pack (2 x Li-ion at 50 %: 2 x 3.75 = 7.5 V behind 2 x 19 = 38 milliohm) runs four TT motors at 0.4 A each.
  near(typ.sources.battery.emf_v, 7.5, 1e-9, "emf"); near(typ.sources.battery.ohm, 0.038, 1e-9, "internal resistance");
  near(typ.sources.battery.current_a, 1.66, 0.01, "typical draw: 4 x 0.4 + 0.025 + 3 x 0.01 + 0.015 - the regulator passes its 35 mA");
  near(typ.sources.battery.terminal_v, 7.5 - 0.038 * typ.sources.battery.current_a, 1e-9, "terminal = emf - r i");
  // Both front motors locked: each is 4 ohm behind the TB6612's 0.5 ohm bridge, so about (7.1 / 4.6) = 1.54 A instead of 0.4 A.
  const st = run("18_arduino_car", { faults: [{ kind: "stall", inst: "front_left_motor" }, { kind: "stall", inst: "front_right_motor" }] });
  assert.ok(st.converged && st.parts.front_left_motor.motor!.stalled && !st.parts.rear_left_motor.motor!.stalled);
  near(st.parts.front_left_motor.current_a, st.parts.front_left_motor.supply_v! / 4, 1e-6, "locked rotor: v / 4 ohm");
  near(st.parts.front_left_motor.current_a, 1.54, 0.03, "stall current");
  near(st.sources.battery.current_a, 3.95, 0.05, "draw with two stalled");
  // the rail sags by about 0.28 V at the driver; the Nano still has 7.1 V on VIN, above the 7 V of its record, and its 5 V holds
  const sag = typ.rails.VBAT.min_v! - st.rails.VBAT.min_v!;
  assert.ok(sag > 0.2 && sag < 0.4, `sag ${sag}`);
  assert.ok(st.parts.controller.supply_v! > 7 && st.parts.controller.state === "ok" && st.regulators.controller.state === "regulating");
  // the 4 A main fuse is at 99 %: it holds
  assert.equal(st.trips.length, 0); assert.ok(st.fuses.F1.load_pct > 95 && st.fuses.F1.load_pct < 100);
  // the same stall at 10 % charge (2 x 3.45 = 6.9 V): now VIN is under 7 V and the Nano is flagged
  const low = run("18_arduino_car", { soc: 0.1, faults: [{ kind: "stall", inst: "front_left_motor" }, { kind: "stall", inst: "front_right_motor" }] });
  assert.ok(low.parts.controller.supply_v! < 7 && low.parts.controller.state === "brown_out" && has(low, "brown_out", "controller"));
  // all four locked: about 6 A through the 4 A fuse, 151 %: it opens, between about half a second and a few minutes, and the car is dead
  const all = run("18_arduino_car", { scenario: "stall" });
  assert.equal(all.trips.length, 1); assert.equal(all.trips[0].fuse, "F1"); near(all.trips[0].current_a, 6.05, 0.1, "current that opens it");
  assert.ok(all.trips[0].opens_s[0] > 0.3 && all.trips[0].opens_s[1] < 300 && all.fuses.F1.blown && all.parts.controller.state === "unpowered");
  near(all.before_trip!.sources.battery.current_a, all.trips[0].current_a, 1e-9, "the state before it opened is kept");
  // a short on the Nano's 5 V pin: its regulator limits at the rail's 0.4 A; no fuse sees it
  const s5 = run("18_arduino_car", { faults: [{ kind: "short", rail: "5V_LOGIC" }] });
  assert.equal(s5.regulators.controller.state, "limit"); near(s5.regulators.controller.iout, 0.4, 1e-9, "limit current");
  assert.ok(s5.trips.length === 0 && has(s5, "regulator_limit", "controller") && s5.parts.ultrasonic.state === "unpowered" && s5.parts.motor_driver_1.state === "brown_out");
  // a short on the battery rail after the switch: 7.5 V over 91 milliohm of pack, wire, fuse and switch = 83 A, 20 x the fuse: gone in under 10 ms
  const sb = run("18_arduino_car", { faults: [{ kind: "short", rail: "VBAT" }] });
  assert.equal(sb.trips[0].fuse, "F1"); near(sb.trips[0].current_a, 82.6, 1, "short-circuit current"); assert.ok(sb.trips[0].opens_s[1] < 0.01);
  assert.ok(has(sb.before_trip ? { ...sb, events: sb.before_trip.events } : sb, "battery_overcurrent", "battery"));
  // the Nano's supply wire off: it and its 5 V rail are dead, the motors keep their supply
  const op = run("18_arduino_car", { faults: [{ kind: "open", wire: "W29" }] });
  assert.ok(op.wires.W29.open && op.wires.W29.current_a === 0 && op.parts.controller.state === "unpowered" && op.parts.ultrasonic.state === "unpowered" && op.parts.front_left_motor.supply_v! > 6.5);
  // an empty pack (2 x 3.0 = 6.0 V at rest): VIN under 7 V, and the 5 V regulator in dropout (6.0 - 1.1 < 5)
  const lb = run("18_arduino_car", { faults: [{ kind: "low_battery", soc: 0 }] });
  near(lb.sources.battery.emf_v, 6, 1e-9, "empty pack"); assert.ok(has(lb, "brown_out", "controller") && has(lb, "regulator_dropout", "controller") && lb.regulators.controller.vout < 4.9);
  const lv = run("18_arduino_car", { faults: [{ kind: "low_battery", volts: 6.9 }] }); near(lv.sources.battery.emf_v, 6.9, 1e-9, "pack at a given voltage"); near(lv.soc!, 0.1, 1e-9, "its charge");
  // bad input is refused
  assert.throws(() => run("18_arduino_car", { faults: [{ kind: "open", wire: "W999" }] }), /no simulated wire/);
  assert.throws(() => run("18_arduino_car", { faults: [{ kind: "stall", inst: "controller" }] }), /not a motor/);
  assert.throws(() => run("18_arduino_car", { faults: [{ kind: "short", rail: "GND" }] }), /no rail or power net/);
});

test("Arduino car in time: the battery short opens the main fuse within the datasheet window", () => {
  const r = run("18_arduino_car", { faults: [{ kind: "short", rail: "VBAT" }], transient: { t_end_s: 0.1, dt_s: 0.001 } }), t = r.transient!;
  assert.ok(t.ok && t.t_s.length === 101); near(t.t_fault_s, 0.01, 1e-12, "fault time");
  // before the fault the rail is at its typical 7.35 V; at the fault 83 A flows; the fuse opens 3 to 8 ms later; then nothing
  near(t.rails.VBAT.source_v[5]!, 7.35, 0.02, "before"); near(t.sources.battery.current_a[10], 82.6, 1, "short current");
  const blown = t.fuses.F1.blown_at_s!; assert.ok(blown - 0.01 >= 0.002 && blown - 0.01 <= 0.009, `opened ${blown - 0.01} s after the short`);
  near(t.sources.battery.current_a[100], 0, 1e-6, "after"); assert.ok(t.events.some((e) => e.kind === "fuse_blown" && e.t_s === blown));
});

test("diff drive, arm and humanoid: what each fault trips", () => {
  // diff drive, 5 V rail shorted: the buck limits at its 8 A; at 90 % efficiency into a short it takes almost nothing from the pack, so no fuse opens
  const d = run("05_diff_drive", { faults: [{ kind: "short", rail: "5V" }] });
  assert.equal(d.regulators.regulator_5v.state, "limit"); near(d.regulators.regulator_5v.iout, 8, 1e-9, "buck limit");
  assert.ok(d.trips.length === 0 && d.parts.computer.state === "unpowered" && has(d, "regulator_limit", "regulator_5v"));
  // both drive motors locked: 2 x (about 10.9 V / (2.18 + 0.06) ohm) = 9.5 A plus the rest: the 7.5 A fuse is at 133 %, just under the 135 % gate
  const ds = run("05_diff_drive", { scenario: "stall" });
  near(ds.parts.left_motor.motor!.stall_ohm, 12 / 5.5, 1e-9, "winding = 12 V / 5.5 A");
  assert.ok(ds.trips.length === 0 && ds.fuses.F1.load_pct > 125 && ds.fuses.F1.load_pct < 135 && has(ds, "fuse_overload") && has(ds, "switch_overcurrent", "main_switch"));
  assert.ok(ds.parts.computer.state === "ok" && ds.regulators.regulator_5v.state === "regulating");
  // arm, every servo locked on the 5 V supply: 5.2 A, inside the supply's limit, but every servo is under its 4.8 V minimum
  const a = run("19_arduino_arm", { scenario: "stall" });
  near(a.sources.power_supply.current_a, 5.17, 0.05, "stall draw"); assert.equal(a.sources.power_supply.state, "voltage");
  for (const s of ["yaw_servo", "shoulder_servo", "elbow_servo", "claw_servo"]) assert.ok(a.parts[s].supply_v! < 4.8 && a.parts[s].state === "brown_out", `${s} at ${a.parts[s].supply_v}`);
  assert.equal(a.parts.controller.state, "external");
  // arm, servo rail shorted: no fuse on a mains supply; it goes into its 11 A limit
  const as = run("19_arduino_arm", { faults: [{ kind: "short", rail: "V_SERVO" }] });
  assert.equal(as.sources.power_supply.state, "limit"); near(as.sources.power_supply.current_a, 11, 1e-9, "supply limit"); assert.ok(has(as, "source_limit", "power_supply"));
  // humanoid, every servo locked: 49 A through the 15 A main fuse, 324 %: open in under a second
  const h = run("08_humanoid", { scenario: "stall" });
  assert.equal(h.trips[0].fuse, "F1"); near(h.trips[0].current_a, 48.7, 1, "stall draw"); assert.ok(h.trips[0].opens_s[1] < 1);
  // humanoid, at half the typical load (what its harness was sized for): 10.7 A, the fuse at ease
  const hh = run("08_humanoid", { actuator_load: 0.5 });
  assert.ok(hh.fuses.F1.load_pct < 80 && !has(hh, "fuse_overload"), `F1 at ${hh.fuses.F1.load_pct} %`);
  // humanoid, arm rail shorted: its buck limits; the legs do not notice
  const ha = run("08_humanoid", { faults: [{ kind: "short", rail: "5V_ARMS" }] });
  assert.ok(ha.regulators.regulator_5v_arms.state === "limit" && ha.parts.l_elbow_actuator.state === "unpowered" && ha.parts.l_knee_actuator.state === "ok" && ha.regulators.regulator_5v.state === "regulating");
});

test("the wires of a lead cut by a branch fuse are listed in halves and whole", () => {
  const r = run("05_diff_drive");
  assert.ok(r.wires.W27 && r.wires.W27a && r.wires.W27b);
  near(r.wires.W27.current_a, r.wires.W27a.current_a, 1e-9, "same current"); near(r.wires.W27.ohm, r.wires.W27a.ohm + r.wires.W27b.ohm, 1e-12, "resistance adds");
  near(r.wires.W27.current_a, r.fuses.F2.current_a, 1e-9, "the fuse in it carries it");
});

test("battery life: the pack run down, each step's time from the current the solution draws", () => {
  // the car on its 2S Li-ion pack (2500 mAh): it draws about 1.66 A at typical load whatever the charge (its loads
  // are constant currents), so each 2 % step takes 0.05 Ah / 1.66 A, and the run ends where the Nano's VIN falls under
  // the 7.0 V of its record: the time must be the charge used over that current
  const d = discharge(robot("18_arduino_car"), null, { scenario: "typical" });
  assert.ok(d.ok && d.source && d.capacity_ah === 2.5, JSON.stringify(d).slice(0, 300));
  assert.ok(d.ends !== "empty" && /VIN/.test(d.ends ?? ""), String(d.ends));
  const used = (1 - d.ends_at_soc!) * d.capacity_ah!, i = d.points[0].current_a;
  near(d.life_h!, used / i, 0.01, "life from the charge used over the current");
  // the pack's terminal voltage falls as it runs down, and the controller's rail stays regulated until the end
  for (let k = 1; k < d.points.length; k++) assert.ok(d.points[k].terminal_v <= d.points[k - 1].terminal_v + 1e-9 && d.points[k].t_h > d.points[k - 1].t_h);
  // less load, longer life; a stalled motor shortens it; a robot on a bench supply has none
  const idle = discharge(robot("18_arduino_car"), null, { scenario: "idle" });
  assert.ok(idle.life_h! > d.life_h! * 1.5, `${idle.life_h} vs ${d.life_h}`);
  const arm = discharge(robot("19_arduino_arm"), null, {});
  assert.ok(!arm.ok && /no battery/.test(arm.reason ?? ""));
  // the diff drive's 3S LiPo empties before anything browns out
  const dd = discharge(robot("05_diff_drive"), null, { scenario: "typical" });
  assert.equal(dd.ends, "empty"); assert.ok(dd.life_h! > 0.3 && dd.life_h! < 1.5, String(dd.life_h));
});
