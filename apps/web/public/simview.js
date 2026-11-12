// The Run tab: the robot's own compiled sketch on a virtual ATmega328P (avrsim.js on avr8js), driving the 3D model.
//   Motors: each wheel turns at the speed its driver's inputs give (direction from IN1 / IN2, voltage from the PWM duty
//   times the supply), and the robot moves on the floor by its wheel speeds: forward speed from the design's top speed
//   at the motors' rated voltage, turning from the difference between the sides over the track, slowed by the slip factor
//   the design's own turning check uses. Servos: each joint goes to the angle its pulse gives. The ultrasonic sensor
//   measures, in the 3D scene, the distance from its transducers to the nearest wall or box of a small arena (five rays in
//   its beam (15 degrees for the HC-SR04)). The serial monitor shows what the sketch prints and sends what you type.
//   The program: the shipped, compiled .hex of an example sketch when this robot's sketch is byte for byte that sketch
//   (checked by its SHA-256), or a .hex you compile yourself and load. The page cannot compile a sketch, and says so.
// Usage: const sim = createSim({ THREE, scene, robotGroup, state, updateFK, invalidate, api, el, box }); sim.dispose().
import * as avr from "./vendor/avr8js.js";
import { createBoard } from "./avrsim.js";

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))); }

export async function createSim({ THREE, scene, robotGroup, state, updateFK, invalidate, api, el, box, frameOn }) {
  const robot = state.robot;
  box.replaceChildren(el("div", "hint", "Loading the robot's program..."));
  let fw;
  try { fw = await api("/api/engine/firmware", { robot }); } catch (e) { box.replaceChildren(el("div", "hint", `No program to run: ${e.message}`)); return { dispose() {} }; }
  if (fw.language !== "arduino" || !/^arduino:avr:(uno|nano)/.test(fw.fqbn) || !fw.motors) {
    box.replaceChildren(el("div", "hint", fw.language === "python" ? "This robot runs a Python script on a Raspberry Pi: the simulator runs Arduino Uno and Nano programs only."
      : !/^arduino:avr:(uno|nano)/.test(fw.fqbn) ? `This robot's board (${fw.fqbn}) is not an ATmega328P: the simulator runs Arduino Uno and Nano programs only.`
      : "This robot's sketch was written from its parts list, and the simulator models the parts on a sketch written from a wiring record only. Download the sketch from Files and flash it to the board."));
    return { dispose() {} };
  }
  // ---- the program: a shipped hex for this exact sketch, else one the user loads
  const sum = await sha256(fw.code);
  let index = {}; try { index = await (await fetch("firmware/index.json")).json(); } catch { index = {}; }
  const shipped = index.sketches?.[sum];
  const ui = {
    status: el("div", "simstatus"), clock: el("div", "simclock"), parts: el("div", "simparts"),
    serial: el("pre", "simserial"), input: el("input", "siminput"), run: el("button", "chip", "Run"), reset: el("button", "chip", "Reset"),
    load: el("input"), loadLab: el("label", "chip", "Load a .hex"),
  };
  ui.input.placeholder = "send to the board (Enter)"; ui.load.type = "file"; ui.load.accept = ".hex"; ui.load.hidden = true; ui.loadLab.append(ui.load);
  for (const b of [ui.run, ui.reset]) b.type = "button";
  box.replaceChildren(ui.status, el("div", "simbtns"), ui.clock, ui.parts, el("h4", "", "Serial monitor"), ui.serial, ui.input);
  box.children[1].append(ui.run, ui.reset, ui.loadLab);
  const say = (t, cls = "") => { ui.status.className = `simstatus ${cls}`; ui.status.textContent = t; };
  let program = null, source = "";
  if (shipped) {
    program = await (await fetch(shipped.hex)).text(); source = `the compiled sketch of example ${shipped.example} (${shipped.fqbn}, ${shipped.flash_bytes} bytes, built with arduino-cli and the ${shipped.core} core)`;
    say(`Ready: ${fw.name} is the sketch of example ${shipped.example}, compiled. Press Run.`);
  } else {
    say(`This robot's sketch (${fw.name}) is not one of the shipped compiled examples, and this page cannot compile a sketch. Compile it yourself (arduino-cli compile --fqbn ${fw.fqbn} --output-dir out ${fw.name.replace(/\.ino$/, "")}) and load the .hex it writes: the simulator then runs it against this robot's pins.`, "warn");
    ui.run.disabled = true;
  }
  ui.load.addEventListener("change", async () => {
    const f = ui.load.files?.[0]; if (!f) return;
    program = await f.text(); source = `${f.name}, loaded from this computer`;
    reset(); say(`Loaded ${f.name}. It runs against this robot's pins as its sketch assigns them: a program built from another sketch will not match them.`); ui.run.disabled = false;
  });

  // ---- the arena: walls and two boxes round a robot that drives; nothing for a robot that stays put
  const drive = fw.drive, arena = new THREE.Group(), solids = [];
  if (drive) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b3a31, roughness: 0.9, transparent: true, opacity: 0.85 });
    const add = (x, y, w, d, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat); m.position.set(x, y, h / 2); arena.add(m); solids.push(m); };
    const R = 1.2, t = 0.04, h = 0.15;
    add(0, R, 2 * R, t, h); add(0, -R, 2 * R, t, h); add(R, 0, t, 2 * R, h); add(-R, 0, t, 2 * R, h);
    add(0.7, 0.25, 0.2, 0.3, h); add(-0.5, -0.6, 0.3, 0.2, h);
    arena.visible = false; scene.add(arena);
  }

  // ---- the board
  const sensorLink = fw.range_sensor?.name;
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  const distanceCm = () => {
    const g = state.meshes.get(sensorLink); if (!g || !solids.length) return null;
    robotGroup.updateMatrixWorld(true); arena.updateMatrixWorld(true);
    // from the middle of the transducer face, along the sensor's axis and across its beam (fw.range_sensor: face_m, axis, beam_deg)
    const rs = fw.range_sensor, m = new THREE.Matrix4().multiplyMatrices(robotGroup.matrixWorld, g.matrix);
    origin.set(...rs.face_m).applyMatrix4(m); q.setFromRotationMatrix(m);
    const ax = new THREE.Vector3(...rs.axis), side = new THREE.Vector3(1, 0, 0).cross(ax).lengthSq() > 1e-6 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    let best = null;
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      const a = (k * rs.beam_deg * Math.PI) / 360;
      dir.copy(ax).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).applyQuaternion(q).normalize();
      ray.set(origin, dir); ray.far = 4;
      const hit = ray.intersectObjects(solids, false)[0];
      if (hit && (best === null || hit.distance < best)) best = hit.distance;
    }
    return best === null ? null : Math.max(2, best * 100);
  };
  let board = null, pose = { x: 0, y: 0, th: 0 }, running = false, simMs = 0, wallMs = 0, raf = 0, last = 0;
  const wheelAngle = {};
  function reset() {
    running = false; cancelAnimationFrame(raf); ui.run.textContent = "Run";
    board = program ? createBoard(avr, program, fw, { distanceCm, onSerial: (c) => { ui.serial.textContent = (ui.serial.textContent + c).slice(-6000); ui.serial.scrollTop = ui.serial.scrollHeight; } }) : null;
    ui.serial.textContent = ""; pose = { x: 0, y: 0, th: 0 }; simMs = 0; wallMs = 0;
    for (const s of fw.servos) if (s.joint) state.jointValues[s.joint] = (s.home_deg * Math.PI) / 180;
    place(); updateFK(); show();
  }
  function place() { robotGroup.position.set(pose.x, pose.y, 0); robotGroup.rotation.set(0, 0, pose.th); robotGroup.updateMatrixWorld(true); invalidate(); }
  function step(now) {
    raf = requestAnimationFrame(step);
    const dt = Math.min(50, now - (last || now)); last = now;
    // as much simulated time as there was real time, within a budget of 20 ms of work a frame
    const t0 = performance.now(); let done = 0;
    while (done < dt && performance.now() - t0 < 20) { board.run(5); done += 5; }
    simMs += done; wallMs += dt;
    const ms = done / 1000;
    if (drive) {
      const ms2 = board.motors(), v = { left: [], right: [] };
      for (const m of ms2) {
        const volts = m.forward * drive.supply_v, ws = (volts / drive.rated_v) * drive.top_speed_m_s;   // wheel surface speed, m/s
        if (m.side) v[m.side].push(ws);
        const wj = drive.wheels[m.name];
        if (wj) { wheelAngle[wj.joint] = (wheelAngle[wj.joint] ?? 0) + wj.sign * (ws / drive.wheel_radius_m) * ms; state.jointValues[wj.joint] = wheelAngle[wj.joint]; }
      }
      const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0), vl = avg(v.left), vr = avg(v.right);
      const vx = (vl + vr) / 2, w = (vr - vl) / drive.track_m / drive.turn_slip_factor;
      const nx = pose.x + Math.cos(pose.th) * vx * ms, ny = pose.y + Math.sin(pose.th) * vx * ms;
      // the arena's walls stop it: the robot's centre stays 10 cm inside them
      if (Math.abs(nx) < 1.1 && Math.abs(ny) < 1.1) { pose.x = nx; pose.y = ny; }
      pose.th += w * ms; place();
    }
    for (const s of board.servos()) if (s.joint && s.deg != null) state.jointValues[s.joint] = (s.deg * Math.PI) / 180;
    updateFK(); show();
  }
  function show() {
    if (!board) { ui.clock.textContent = ""; ui.parts.replaceChildren(); return; }
    ui.clock.textContent = `board time ${(board.ms / 1000).toFixed(2)} s${wallMs > 500 ? ` · ${Math.round((100 * simMs) / wallMs)} % of real time` : ""} · program: ${source}`;
    const rows = [];
    for (const m of board.motors()) rows.push(`${m.name}: ${m.in1 ? "IN1" : m.in2 ? "IN2" : "brake"} · duty ${Math.round(m.duty * 100)} % · ${(m.forward * drive.supply_v).toFixed(1)} V forward`);
    for (const s of board.servos()) rows.push(`${s.name}: ${s.us == null ? "no pulse" : `${Math.round(s.us)} us = ${s.deg.toFixed(1)} deg`}${s.joint ? ` (${s.joint})` : ""}`);
    if (fw.range_sensor) rows.push(`${fw.range_sensor.name}: ${board.sensor.pings} pings, last ${board.sensor.last_cm == null ? "nothing in range" : `${board.sensor.last_cm.toFixed(0)} cm`}`);
    ui.parts.replaceChildren(...rows.map((r) => el("div", "", r)));
  }
  ui.run.addEventListener("click", () => {
    if (!board) return;
    running = !running; ui.run.textContent = running ? "Pause" : "Run";
    // a robot that drives: the arena shows and the camera takes it all in, once
    if (drive && !arena.visible) { arena.visible = true; frameOn?.(new THREE.Box3().setFromObject(arena)); }
    if (running) { last = 0; raf = requestAnimationFrame(step); } else cancelAnimationFrame(raf);
  });
  ui.reset.addEventListener("click", reset);
  ui.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && board) { board.send(ui.input.value); ui.input.value = ""; } });
  reset();
  return {
    get board() { return board; }, get pose() { return { ...pose }; }, get running() { return running; }, fw, shipped: !!shipped,
    dispose() { cancelAnimationFrame(raf); scene.remove(arena); robotGroup.position.set(0, 0, 0); robotGroup.rotation.set(0, 0, 0); invalidate(); },
  };
}
