// The Power tab of the Circuit view: the robot's harness as a circuit (the engine's electricalSim), solved for its
// operating point in a scenario, with faults you add, and stepped in time when there are faults. It shows what trips
// (fuses, brown-outs, regulators in dropout or limit, wires over their rating, logic levels), every rail's voltage at
// its source and at its worst load, and, over time, each rail's lowest supply; every estimate the model used is listed.
// The result goes back to the page (`onResult`), so the 3D view's hover shows the voltage at a pin and the current in a wire.
// Usage: createPowerSim({ api, el, box, robot, onResult }); .rewire(robot) when the same robot's harness is laid again (the
// 3D harness replacing the straight runs): the controls stay as they are and a result on show is solved again on the new wires.
// Nothing here builds markup from strings (the page's policy).
const SVG = "http://www.w3.org/2000/svg";
// rail lines: the first four slots of the validated categorical palette, dark steps (worst adjacent CVD dE 8.4 on this surface)
const LINE = ["#3987e5", "#d95926", "#199e70", "#c98500"];
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "-" : (+v).toFixed(d));

export function createPowerSim({ api, el, box, robot, onResult }) {
  let solved = null;   // the options of the result on show, to solve it again on a new harness
  const w = robot.metadata?.design?.wiring;
  if (!w) { box.replaceChildren(el("div", "hint", "This robot has no wiring to simulate.")); return { dispose() {} }; }
  const rails = w.rails.map((r) => r.name), wires = w.cables.flatMap((c) => (c.premade ? [] : c.wires.map((x) => x.id)));
  const motors = w.instances.filter((i) => /motor|servo|actuator/.test(i.name)).map((i) => i.name);
  const hasBattery = w.instances.some((i) => /battery|pack|cell/.test(i.key));
  // ---- controls
  const scen = el("select", "chip"); for (const [v, t] of [["typical", "Typical load"], ["idle", "Idle"], ["stall", "Every actuator stalled"], ["peak", "Peak: stalled, the rest at peak"]]) { const o = el("option", "", t); o.value = v; scen.append(o); }
  const soc = el("input"); soc.type = "range"; soc.min = "0"; soc.max = "100"; soc.value = "50"; const socLab = el("label", "pslab", "Battery 50 %"); socLab.append(soc);
  soc.addEventListener("input", () => { socLab.firstChild.textContent = `Battery ${soc.value} %`; });
  const faults = el("div", "psfaults"), addBtn = el("button", "chip", "Add a fault"), go = el("button", "chip", "Simulate");
  addBtn.type = go.type = "button";
  const kinds = [["short", "Short a rail to ground", rails], ["open", "Open a wire", wires], ["stall", "Stall a motor", motors], ...(hasBattery ? [["low_battery", "Low battery (state of charge %)", ["5", "10", "20", "30"]]] : [])];
  function faultRow() {
    const row = el("div", "psfault"), kind = el("select", "chip"), what = el("select", "chip"), del = el("button", "chip", "Remove"); del.type = "button";
    for (const [v, t] of kinds) { const o = el("option", "", t); o.value = v; kind.append(o); }
    const fill = () => { what.replaceChildren(...kinds.find((k) => k[0] === kind.value)[2].map((x) => { const o = el("option", "", x); o.value = x; return o; })); };
    kind.addEventListener("change", fill); del.addEventListener("click", () => row.remove()); fill();
    row.append(kind, what, del); faults.append(row);
  }
  addBtn.addEventListener("click", faultRow);
  const out = el("div", "psout"), lifeOut = el("div", "psout"), lifeBtn = el("button", "chip", "Battery life");
  lifeBtn.type = "button";
  box.replaceChildren(el("div", "hint", "The harness as a circuit: every wire's resistance from its gauge and cut length, the battery's voltage from its charge behind its internal resistance, regulators, fuses and loads from their records. Add faults to see what trips."),
    el("div", "psrow"), faults, el("div", "psrow"), out, ...(hasBattery ? [el("h4", "", "Battery life"), el("div", "hint", "The pack run down from full in the scenario above (with the faults that are not a low battery): the harness solved at every 2 % of charge, the time from the current each solution draws, until the first error or empty."), el("div", "psrow"), lifeOut] : []));
  box.children[1].append(scen, ...(hasBattery ? [socLab] : []));
  box.children[3].append(addBtn, go);
  if (hasBattery) box.children[7].append(lifeBtn);
  lifeBtn.addEventListener("click", async () => {
    lifeBtn.disabled = true; lifeOut.replaceChildren(el("div", "hint", "Running the pack down..."));
    try { showLife(await api("/api/engine/battery-life", { robot, options: { scenario: scen.value, faults: faultList().filter((f) => f.kind !== "low_battery") } })); }
    catch (e) { lifeOut.replaceChildren(el("div", "hint", `Not simulated: ${e.message}`)); }
    lifeBtn.disabled = false;
  });
  const faultList = () => [...faults.children].map((r) => { const [k, x] = [r.children[0].value, r.children[1].value];
    return k === "short" ? { kind: "short", rail: x } : k === "open" ? { kind: "open", wire: x } : k === "stall" ? { kind: "stall", inst: x } : { kind: "low_battery", soc: Number(x) / 100 }; });

  go.addEventListener("click", async () => {
    go.disabled = true; out.replaceChildren(el("div", "hint", "Solving..."));
    try {
      const f = faultList(), options = { scenario: scen.value, faults: f, ...(hasBattery ? { soc: Number(soc.value) / 100 } : {}), ...(f.length ? { transient: { t_end_s: 4, dt_s: 0.02, t_fault_s: 0.5 } } : {}) };
      const r = await api("/api/engine/electrical-sim", { robot, options });
      show(r); onResult?.(r, robot); solved = options;
    } catch (e) { out.replaceChildren(el("div", "hint", `Not simulated: ${e.message}`)); onResult?.(null); solved = null; }
    go.disabled = false;
  });
  /** the same robot with its harness laid again: only the wiring's values change, so the page keeps everything on show */
  async function rewire(next) {
    robot = next;
    if (!solved) return;
    const options = solved;
    try { const r = await api("/api/engine/electrical-sim", { robot, options }); if (robot === next && solved === options) { show(r); onResult?.(r, robot); } }
    catch { /* the result on show stays: the visitor can press Simulate again */ }
  }

  function show(r) {
    const parts = [];
    if (!r.converged) { out.replaceChildren(el("div", "pserr", `No steady operating point: ${r.reason ?? "the solver did not converge"}. Nothing below is shown as if it were one.`)); return; }
    // what trips: errors first, then warnings, each with its severity in words (never colour alone)
    const ev = [...r.events].sort((a, b) => ["error", "warning", "info"].indexOf(a.severity) - ["error", "warning", "info"].indexOf(b.severity));
    const evBox = el("div", "psevents");
    if (!ev.length) evBox.append(el("div", "psok", "Nothing trips: every supply is inside its range and every wire, fuse and regulator inside its rating."));
    for (const e of ev) { const d = el("div", `psev ${e.severity}`); d.append(el("b", "", e.severity === "error" ? "Error" : e.severity === "warning" ? "Warning" : "Note"), document.createTextNode(` ${e.message}`)); evBox.append(d); }
    parts.push(el("h4", "", "What trips"), evBox);
    // rails
    const t = el("table", "pstable"), head = el("tr"); for (const h of ["Rail", "Nominal V", "At its source V", "Lowest supply V", "at", "Current A"]) head.append(el("th", "", h)); t.append(head);
    for (const [name, x] of Object.entries(r.rails)) { const tr = el("tr"); for (const v of [name, fmt(x.nominal_v), fmt(x.source_v), fmt(x.min_v), x.min_at ?? "-", fmt(x.current_a)]) tr.append(el("td", "", v)); t.append(tr); }
    parts.push(el("h4", "", "Rails"), t);
    if (r.transient?.ok) parts.push(el("h4", "", "Over time (the faults start at 0.5 s)"), plot(r.transient));
    else if (r.transient) parts.push(el("div", "hint", `Not stepped in time: ${r.transient.reason}`));
    // the busiest wires
    const ws = Object.entries(r.wires).filter(([, x]) => x.load_pct != null).sort((a, b) => b[1].load_pct - a[1].load_pct).slice(0, 8);
    if (ws.length) { const tw = el("table", "pstable"), h2 = el("tr"); for (const h of ["Wire", "Current A", "Drop V", "AWG", "Load of rating"]) h2.append(el("th", "", h)); tw.append(h2);
      for (const [id, x] of ws) { const tr = el("tr"); for (const v of [id, fmt(Math.abs(x.current_a), 3), fmt(x.drop_v, 3), x.awg ?? "-", `${Math.round(x.load_pct)} %${x.open ? " (open)" : ""}`]) tr.append(el("td", "", v)); tw.append(tr); }
      parts.push(el("h4", "", "Busiest wires"), tw); }
    const p = r.power; parts.push(el("div", "hint", `Power: ${fmt(p.sources_w)} W from the sources = ${fmt(p.loads_w)} W in the loads + ${fmt(p.wires_w + p.switches_fuses_w, 3)} W in wires, switch and fuses + ${fmt(p.regulators_w + p.drivers_w)} W in regulators and drivers + ${fmt(p.source_internal_w)} W inside the battery${p.fault_w ? ` + ${fmt(p.fault_w)} W in the fault` : ""} (balance ${fmt(p.balance_w, 4)} W). Hover a pin or a wire in the 3D Electronics view for its voltage and current.`));
    // what the numbers rest on
    const as = el("details", "psassume"); as.append(el("summary", "", `${r.assumptions.length} estimates the model used, and what it leaves out`));
    for (const a of r.assumptions) as.append(el("div", "", `${a.id}: ${a.value} ${a.unit}. ${a.note}${a.parts.length ? ` (${a.parts.slice(0, 6).join(", ")}${a.parts.length > 6 ? " ..." : ""})` : ""}`));
    for (const m of r.model) as.append(el("div", "", m));
    parts.push(as);
    out.replaceChildren(...parts);
  }

  function showLife(d) {
    if (!d.ok) { lifeOut.replaceChildren(el("div", "hint", `No battery life: ${d.reason}`)); return; }
    const life = d.life_h == null ? "-" : d.life_h >= 2 ? `${d.life_h.toFixed(1)} h` : `${Math.round(d.life_h * 60)} min`;
    const head = el("div", "pslife"); head.append(el("b", "", life), document.createTextNode(` from full on ${d.source} (${(d.capacity_ah * 1000).toFixed(0)} mAh), ${d.scenario} load`));
    const why = el("div", `psev ${d.ends === "empty" ? "info" : "error"}`);
    why.append(el("b", "", d.ends === "empty" ? "Note" : "Ends"), document.createTextNode(d.ends === "empty" ? " The pack empties with every part still inside its range." : ` at ${Math.round(d.ends_at_soc * 100)} % charge: ${d.ends}`));
    const p0 = d.points[0], pn = d.points[d.points.length - 1];
    const series = { t_s: d.points.map((q) => q.t_h * 3600), rails: { [`${d.source} terminal`]: { min_v: d.points.map((q) => q.terminal_v) }, ...Object.fromEntries(Object.keys(p0.rails).map((n) => [n, { min_v: d.points.map((q) => q.rails[n]) }])) }, fuses: {}, note: d.note };
    lifeOut.replaceChildren(head, why, plot(series, { unit: "h", scale: 1 / 3600, label: "Lowest supply as the pack runs down" }),
      el("div", "hint", `Current from the pack ${fmt(p0.current_a)} A at full, ${fmt(pn.current_a)} A at ${Math.round(pn.soc * 100)} %; terminal ${fmt(p0.terminal_v)} V to ${fmt(pn.terminal_v)} V.`));
  }

  /** each rail's lowest supply over time: one line per rail (at most four, the rest in the table), a crosshair with every value */
  function plot(tr, axis = { unit: "s", scale: 1, label: "Lowest supply" }) {
    const W = 560, H = 200, L = 44, R = 70, T = 10, B = 26, names = Object.keys(tr.rails).slice(0, 4), ts = tr.t_s;
    const vals = names.flatMap((n) => tr.rails[n].min_v.filter((v) => v != null)), vmax = Math.max(1, ...vals) * 1.08;
    const x = (t) => L + (t / ts[ts.length - 1]) * (W - L - R), y = (v) => T + (1 - v / vmax) * (H - T - B);
    const s = document.createElementNS(SVG, "svg"); s.setAttribute("viewBox", `0 0 ${W} ${H}`); s.setAttribute("class", "psplot"); s.setAttribute("role", "img");
    s.setAttribute("aria-label", `${axis.label} on ${names.join(", ")} over ${(ts[ts.length - 1] * axis.scale).toFixed(1)} ${axis.unit}`);
    const mk = (tag, a) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); s.append(n); return n; };
    // recessive grid and axes
    for (let k = 0; k <= 4; k++) { const v = (vmax * k) / 4; mk("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "psgrid" }); mk("text", { x: L - 6, y: y(v) + 4, class: "psaxis", "text-anchor": "end" }).textContent = v.toFixed(1); }
    for (let k = 0; k <= 4; k++) { const t = (ts[ts.length - 1] * k) / 4; mk("text", { x: x(t), y: H - 8, class: "psaxis", "text-anchor": "middle" }).textContent = `${(t * axis.scale).toFixed(1)} ${axis.unit}`; }
    mk("text", { x: 4, y: T + 4, class: "psaxis" }).textContent = "V";
    names.forEach((n, i) => {
      const d = tr.rails[n].min_v.map((v, k) => (v == null ? null : `${x(ts[k]).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
      mk("polyline", { points: d.join(" "), fill: "none", stroke: LINE[i], "stroke-width": 2, "stroke-linejoin": "round" });
      const last = [...tr.rails[n].min_v].reverse().find((v) => v != null);
      if (last != null) mk("text", { x: W - R + 6, y: y(last) + 4, class: "pslabel" }).textContent = n;   // direct label in ink, the line beside it carries the colour
    });
    for (const [n, f] of Object.entries(tr.fuses)) if (f.blown_at_s != null) { mk("line", { x1: x(f.blown_at_s), x2: x(f.blown_at_s), y1: T, y2: H - B, class: "psmark" }); mk("text", { x: x(f.blown_at_s) + 4, y: T + 12, class: "pslabel" }).textContent = `${n} opens`; }
    // crosshair and tooltip
    const cross = mk("line", { y1: T, y2: H - B, class: "pscross", visibility: "hidden" });
    const tip = el("div", "pstip"); tip.hidden = true;
    s.addEventListener("pointermove", (e) => {
      const rc = s.getBoundingClientRect(), px = ((e.clientX - rc.left) / rc.width) * W;
      if (px < L || px > W - R) { cross.setAttribute("visibility", "hidden"); tip.hidden = true; return; }
      const t = ((px - L) / (W - L - R)) * ts[ts.length - 1]; let k = 0; while (k < ts.length - 1 && ts[k + 1] <= t) k++;
      cross.setAttribute("x1", x(ts[k])); cross.setAttribute("x2", x(ts[k])); cross.setAttribute("visibility", "visible");
      tip.replaceChildren(el("b", "", `${(ts[k] * axis.scale).toFixed(2)} ${axis.unit}`), ...names.map((n) => el("div", "", `${n}: ${fmt(tr.rails[n].min_v[k])} V`)));
      tip.style.left = `${e.clientX - rc.left + 12}px`; tip.style.top = `${e.clientY - rc.top + 8}px`; tip.hidden = false;
    });
    s.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; });
    const wrap = el("div", "psplotwrap"), legend = el("div", "pslegend");
    names.forEach((n, i) => { const k = el("span", "pskey"); k.style.setProperty("--c", LINE[i]); legend.append(k, document.createTextNode(` ${n}  `)); });
    wrap.append(legend, s, tip, el("div", "hint", tr.note));
    return wrap;
  }
  return { rewire, dispose() { onResult?.(null); } };
}
