// Motion in the 3D view: play a robot's motions (joint tour, purpose demo, human motion), drag it into a pose, record a drag
// session as a clip, and download any of them as a GIF, a video, a joint CSV, a ROS 2 JointTrajectory or BVH.
// The engine (worker) makes the motions and solves the inverse kinematics; this file draws them. See docs/ENGINE_API.md.
import * as THREE from "three";
import { forwardKinematics, download, makeZip } from "./robotkit.js";
import { h } from "./safe.js";

const DEG = 180 / Math.PI;
const RED = 0xff2a3d, AMBER = 0xffa31a, FOCUS = 0x1f9d5a;

export function createMotion(ctx) {
  const { scene, camera, controls, renderer, robotGroup, state, api, updateFK, invalidate, renderSliders, toast, el, $, highlight } = ctx;
  const M = {
    handle: null, list: [], kin: null, cache: new Map(), traj: null, name: null, playing: false, t: 0, speed: 1, loop: true, origin: null,
    drag: null, move: false, depth: false, orient: false, recording: null, clips: [], undo: [], tinted: new Set(), busy: false, label: "", warn: "",
  };
  window.__ttrMotion = M;

  // ---------------------------------------------------------------- DOM: the Motion control in the view toolbar, the bar, the label
  const hud = $("#viewhud");
  const motionBtn = el("button", "chip", "Motion"); motionBtn.type = "button"; motionBtn.id = "motionBtn"; motionBtn.setAttribute("aria-expanded", "false");
  const moveChip = el("label", "chip"); moveChip.title = "Drag the robot to pose it: the tool tip, a foot or the body follow the pointer; any other part turns its own joint";
  const moveBox = document.createElement("input"); moveBox.type = "checkbox"; moveBox.id = "moveMode"; moveChip.append(moveBox, document.createTextNode("Move"));
  hud.insertBefore(moveChip, $("#resetView")); hud.insertBefore(motionBtn, moveChip);
  const bar = $("#motionbar");
  const opt = (value, text, sel) => h("option", { value, selected: sel }, text);
  const toggle = (id, text, checked) => h("label", { class: "mtog" }, h("input", { type: "checkbox", id, checked }), text);
  bar.replaceChildren(
    h("div", { class: "mrow" },
      h("select", { id: "motionPick", "aria-label": "Motion" }),
      h("button", { id: "motionPlay", class: "mbtn primary", type: "button", "aria-label": "Play" }, "Play"),
      h("select", { id: "motionSpeed", "aria-label": "Speed" }, opt("0.25", "0.25x"), opt("0.5", "0.5x"), opt("1", "1x", true), opt("2", "2x")),
      toggle("motionLoop", "Loop", true),
      h("select", { id: "motionGet", "aria-label": "Download" }, opt("", "Download"), opt("gif", "Animation (GIF)"), opt("video", "Video (MP4 or WebM)"), opt("csv", "Joint CSV"), opt("ros2", "ROS 2 trajectory (YAML)"), opt("bvh", "BVH (body)"), opt("all", "All files (zip)"))),
    h("input", { id: "motionTime", type: "range", min: "0", max: "1", step: "0.001", value: "0", "aria-label": "Time" }),
    h("div", { class: "mstat" }, h("span", { id: "motionInfo" }), h("span", { id: "motionWarn", class: "mwarn", hidden: true })));
  const pick = $("#motionPick"), playBtn = $("#motionPlay"), timeBar = $("#motionTime"), info = $("#motionInfo"), warnEl = $("#motionWarn"), getSel = $("#motionGet");
  const label = el("div", "jointlabel"); label.hidden = true; $("#stage").append(label);
  motionBtn.onclick = () => { const open = bar.hidden; bar.hidden = !open; motionBtn.classList.toggle("on", open); motionBtn.setAttribute("aria-expanded", String(open)); if (open && !M.list.length) refreshList(); };
  playBtn.onclick = () => (M.playing ? pause() : play());
  $("#motionSpeed").onchange = (e) => { M.speed = Number(e.target.value); };
  $("#motionLoop").onchange = (e) => { M.loop = e.target.checked; };
  pick.onchange = () => { stop(); M.name = pick.value; M.traj = null; loadTraj(M.name).then(() => setTime(0)).catch(() => {}); };
  timeBar.oninput = () => { if (!M.traj) return; pauseQuiet(); setTime(Number(timeBar.value) * M.traj.duration_s); };
  getSel.onchange = async () => { const k = getSel.value; getSel.value = ""; if (k) await exportAs(k).catch((e) => toast(`✗ ${e.message}`, "err")); };
  moveBox.onchange = () => { M.move = moveBox.checked; if (M.move) pause(); document.body.classList.toggle("posing", M.move); };

  // pose tools in the Joints tab
  const tools = $("#posebar");
  const btn = (id, text, extra = {}) => h("button", { type: "button", class: "mbtn", id, ...extra }, text);
  tools.replaceChildren(
    h("div", { class: "ptools" }, btn("poseReset", "Reset pose"), btn("poseUndo", "Undo"), btn("poseSave", "Save pose"), btn("poseRecord", "Record", { "aria-pressed": "false" })),
    h("div", { class: "ptools" }, toggle("poseOrient", "Keep tool orientation", false), toggle("poseDepth", "Drag in depth", false)),
    h("div", { id: "poseList", class: "chips" }), h("div", { id: "poseNote", class: "hint", hidden: true }), h("div", { id: "romTable" }));
  $("#poseReset").onclick = () => { pushUndo(); stop(); state.jointValues = { ...(M.kin?.home ?? {}) }; setBase(null); syncSliders(); };
  $("#poseUndo").onclick = () => { const u = M.undo.pop(); if (!u) return toast("Nothing to undo."); state.jointValues = u.values; setBase(u.base); syncSliders(); };
  $("#poseSave").onclick = savePose;
  $("#poseRecord").onclick = () => (M.recording ? stopRecording() : startRecording());
  $("#poseOrient").onchange = (e) => { M.orient = e.target.checked; };
  $("#poseDepth").onchange = (e) => { M.depth = e.target.checked; };

  // ---------------------------------------------------------------- engine
  /** a request about this robot: by handle, registering it again if the worker has forgotten it */
  async function eng(path, body) {
    if (!M.handle) M.handle = (await api("/api/engine/motion-session", { robot: state.robot })).handle;
    try { return await api(path, { handle: M.handle, ...body }); }
    catch (e) { if (!/unknown motion session/.test(e.message)) throw e; M.handle = (await api("/api/engine/motion-session", { robot: state.robot })).handle; return api(path, { handle: M.handle, ...body }); }
  }
  async function refreshList() {
    if (!state.robot) return;
    const robot = state.robot;
    const r = await eng("/api/engine/motions", {});
    if (robot !== state.robot) return;
    M.list = r.motions; M.kin = r.kinematics;
    renderPicker(); renderRom();
  }
  function renderPicker() {
    pick.replaceChildren();
    const all = [...M.list, ...M.clips.map((c) => ({ name: c.name, title: c.title, kind: "recorded" }))];
    for (const m of all) { const o = document.createElement("option"); o.value = m.name; o.textContent = m.title + (m.kind === "tour" ? "" : m.kind === "human" ? " (human)" : m.kind === "servo" ? " (servos)" : m.kind === "recorded" ? " (recorded)" : ""); o.title = m.description ?? ""; pick.append(o); }
    const def = all.find((m) => m.default) ?? all[0];
    if (!M.name || !all.some((m) => m.name === M.name)) M.name = def?.name ?? null;
    pick.value = M.name ?? "";
    getSel.querySelector('[value="bvh"]').hidden = !(M.kin?.anatomy?.length >= 4);
    const note = $("#poseNote");
    note.hidden = !M.kin?.wearable;
    note.textContent = M.kin?.wearable ? "Wearable: limbs follow the wearer (human motion); only the doors are motorised." : "";
    info.textContent = M.kin?.wearable ? "Wearable: limbs follow the wearer (human motion); only the doors are motorised." : "";
  }
  function renderRom() {
    const box = $("#romTable"); box.replaceChildren();
    const rom = M.kin?.range_of_motion; if (!rom || !M.kin.wearable) return;
    box.append(el("h2", "label", "Range of motion in this suit"));
    const t = el("div", "kv");
    for (const r of rom.joints) t.append(el("div", "k", `${r.side} ${r.movement}`.trim()), el("div", "v", `${r.min_deg.toFixed(0)} to ${r.max_deg.toFixed(0)} deg`));
    box.append(t);
    if (rom.missing.length) box.append(el("div", "hint", `No joint for: ${rom.missing.join(", ")}. The armour cannot follow those movements.`));
  }
  async function loadTraj(name) {
    const clip = M.clips.find((c) => c.name === name);
    if (clip) { M.traj = clip.trajectory; buildProps(); return M.traj; }
    const key = `${name}`;
    if (M.cache.has(key)) { M.traj = M.cache.get(key).trajectory; buildProps(); showWarn(); return M.traj; }
    info.textContent = "Making the motion...";
    M.busy = true;
    try {
      // the motion first, so it plays at once; the collision check of every frame follows and marks what it finds
      const quick = await eng("/api/engine/motion", { name, files: true, collision: false });
      if (M.name !== name) return M.traj;
      M.traj = quick.trajectory; buildProps(); showWarn();
      info.textContent = `${quick.trajectory.title}: checking every frame for collisions${(state.robot?.links.length ?? 0) > 200 ? " (a big robot: a minute or two)" : ""}...`;
      eng("/api/engine/motion", { name, files: true }).then((r) => {
        M.cache.set(key, r);
        if (M.traj?.name === name && !M.clips.some((c) => c.name === name)) { M.traj = r.trajectory; showWarn(); if (!M.playing) setTime(M.t); }
      }).catch(() => { info.textContent = `${quick.trajectory.title}: the collision check could not run here.`; });
      return M.traj;
    } finally { M.busy = false; }
  }
  function showWarn() {
    const tr = M.traj; if (!tr) return;
    const bad = tr.collisions?.colliding_frames ?? 0, lim = !tr.limits.position_ok || !tr.limits.velocity_ok || tr.limits.torque_ok === false;
    const msgs = [...(bad ? [`Collision in ${bad} frames`] : []), ...(lim ? tr.limits.violations.slice(0, 2) : []), ...(tr.clamped?.length ? [`beyond range: ${tr.clamped.map((c) => c.joint).join(", ")}`] : [])];
    warnEl.hidden = !msgs.length; warnEl.textContent = msgs.join(" · ");
    warnEl.title = [...tr.warnings, ...tr.notes].join("\n");
    info.textContent = `${tr.title}: ${tr.duration_s.toFixed(1)} s${tr.collisions?.checked && !bad ? ", no self-collision" : ""}${M.kin?.wearable ? " · limbs follow the wearer; only the doors are motorised" : ""}`;
  }

  // ---------------------------------------------------------------- playback
  async function play() {
    if (!state.robot) return;
    if (!M.handle || !M.list.length) await refreshList();
    if (!M.traj || M.traj.name !== M.name && !M.clips.some((c) => c.name === M.name)) await loadTraj(M.name);
    if (!M.traj) return;
    if (M.t >= M.traj.duration_s - 1e-6) M.t = 0;
    M.origin ??= originNow();
    M.playing = true; playBtn.textContent = "Pause"; playBtn.setAttribute("aria-label", "Pause");
    if (M.move) { moveBox.checked = false; M.move = false; document.body.classList.remove("posing"); }
    M.last = performance.now(); invalidate();
  }
  function pauseQuiet() { M.playing = false; playBtn.textContent = "Play"; playBtn.setAttribute("aria-label", "Play"); }
  function pause() { if (!M.playing) return; pauseQuiet(); syncSliders(); }
  function stop() { pauseQuiet(); M.t = 0; M.origin = null; clearTint(); label.hidden = true; for (const p of props) scene.remove(p.obj); props = []; grid.visible = false; }
  /** where the robot stands now (x, y, heading), so a motion starts from there */
  function originNow() { const b = state.base; if (!b) return { x: 0, y: 0, yaw: 0 }; return { x: b[0], y: b[1], yaw: 2 * Math.atan2(b[5], b[6]) }; }

  const cr = (p0, p1, p2, p3, s) => 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s * s * s);
  function sampleAt(tr, t) {
    const u = Math.max(0, Math.min(tr.t.length - 1, t * tr.fps)), k = Math.min(tr.t.length - 2, Math.floor(u)), s = tr.t.length > 1 ? u - k : 0;
    const q = tr.q, a = q[Math.max(0, k - 1)], b = q[k], c = q[Math.min(q.length - 1, k + 1)], d = q[Math.min(q.length - 1, k + 2)];
    const lim = M.kin ? new Map(M.kin.joints.map((j) => [j.name, j])) : new Map();
    const values = {};
    tr.joints.forEach((n, i) => {
      let v = tr.t.length > 1 ? cr(a[i], b[i], c[i], d[i], s) : b[i];
      const j = lim.get(n); if (j && j.lower != null && j.upper != null) v = Math.max(j.lower, Math.min(j.upper, v));
      values[n] = v;
    });
    let base = null;
    if (tr.base) {
      const p = tr.base[k], n = tr.base[Math.min(tr.base.length - 1, k + 1)];
      const x = p.map((v, i) => v + (n[i] - v) * s); const qn = Math.hypot(x[3], x[4], x[5], x[6]) || 1;
      base = [x[0], x[1], x[2], x[3] / qn, x[4] / qn, x[5] / qn, x[6] / qn];
    }
    return { values, base, frame: Math.round(u) };
  }
  /** a trajectory's root pose, from where the motion started */
  function placed(base) {
    const o = M.origin ?? { x: 0, y: 0, yaw: 0 }, b = base ?? [0, 0, -(M.kin?.ground_z ?? 0), 0, 0, 0, 1];
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw), hq = [0, 0, Math.sin(o.yaw / 2), Math.cos(o.yaw / 2)];
    const q = qmul(hq, [b[3], b[4], b[5], b[6]]);
    return [o.x + c * b[0] - s * b[1], o.y + s * b[0] + c * b[1], b[2], ...q];
  }
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];

  /** show the trajectory at time t */
  function setTime(t) {
    const tr = M.traj; if (!tr) return;
    M.t = Math.max(0, Math.min(tr.duration_s, t));
    const { values, base, frame } = sampleAt(tr, M.t);
    Object.assign(state.jointValues, values);
    setBase(tr.base ? placed(base) : state.base, { follow: true });
    updateFK();
    timeBar.value = String(tr.duration_s ? M.t / tr.duration_s : 0);
    // what is moving: the tour's joint and its links in green; colliding parts in red
    clearTint();
    const focus = tr.focus?.[frame];
    if (focus && state.robot) tintBelow(state.robot.joints.find((j) => j.name === focus)?.child, FOCUS);
    const col = tr.collisions;
    let msg = "";
    if (col?.frames?.[frame]) {
      const now = col.pairs.filter((p) => M.t >= p.first_s - 0.04 && M.t <= p.last_s + 0.04);
      for (const p of now) { tintLink(p.a, RED); tintLink(p.b, RED); }
      for (const f of col.floor) tintLink(f.link, RED);
      msg = now.length ? `Collision: ${now.map((p) => `${p.a} / ${p.b}`).slice(0, 2).join(", ")}` : "Collision";
    }
    const seg = tr.segments.find((s) => M.t >= s.t0 && M.t <= s.t1 + 1e-6);
    const fj = focus ? state.robot.joints.find((j) => j.name === focus) : null;
    const lab = fj ? `${fj.name}  ${fj.type === "prismatic" ? `${(values[fj.name] * 1000).toFixed(0)} mm` : `${(values[fj.name] * DEG).toFixed(1)}°`}` : seg?.label ?? "";
    M.label = lab; M.warn = msg;
    showLabel(lab, msg, fj ? fj.child : null);
    for (const p of props) placeProp(p, frame);
    invalidate();
  }
  function showLabel(text, warn, link) {
    label.hidden = !text && !warn;
    label.replaceChildren(document.createTextNode(text));
    if (warn) { const w = el("b", "bad", warn); label.append(w); }
    label.classList.toggle("bad", !!warn);
    let p = null;
    if (link && state.meshes.get(link)) { const g = state.meshes.get(link); const box = new THREE.Box3().setFromObject(g); if (!box.isEmpty()) p = box.getCenter(new THREE.Vector3()); }
    const r = renderer.domElement.getBoundingClientRect();
    if (p) { p.project(camera); label.style.left = `${r.left + ((p.x + 1) / 2) * r.width}px`; label.style.top = `${r.top + ((1 - p.y) / 2) * r.height - 34}px`; }
    else { label.style.left = `${r.left + r.width / 2}px`; label.style.top = `${r.top + r.height - 40}px`; }
  }
  function tick(now) {
    let moved = false;
    if (M.playing && M.traj) {
      const dt = Math.min(0.25, (now - (M.last ?? now)) / 1000); M.last = now;
      let t = M.t + dt * M.speed;
      if (t >= M.traj.duration_s) { if (M.loop) t %= Math.max(1e-6, M.traj.duration_s); else { t = M.traj.duration_s; pauseQuiet(); syncSliders(); } }
      setTime(t); moved = true;
    }
    if (M.drag?.kind === "drive") { driveStep(now); moved = true; }
    if (M.recording) recordSample(now);
    return moved;
  }

  // ---------------------------------------------------------------- the root pose and the camera that follows it
  function setBase(b, o = {}) {
    const old = robotGroup.position.clone();
    state.base = b;
    const g = M.kin?.ground_z ?? 0;
    if (!b) { robotGroup.position.set(0, 0, 0); robotGroup.quaternion.identity(); }
    else { robotGroup.position.set(b[0], b[1], b[2] + g); robotGroup.quaternion.set(b[3], b[4], b[5], b[6]); }
    robotGroup.updateMatrixWorld(true);
    if (o.follow && !M.noFollow) {
      // the camera keeps the robot in view without hiding that it moves: it follows only what goes past a margin
      const span = Math.max(0.15, M.kin?.span ?? 0.5), off = robotGroup.position.clone().sub(controls.target); off.z = 0;
      const past = off.length() - 0.45 * span;
      if (past > 0) { const d = off.setLength(past); camera.position.add(d); controls.target.add(d); }
      void old;
    }
    if (M.traj?.base) { if (!grid.visible) layGrid(); grid.visible = true; }
    invalidate();
  }
  let grid = new THREE.Group(); grid.visible = false; scene.add(grid);
  /** a floor grid under a robot that drives or walks, so its travel shows: cells about a fifth of the robot */
  function layGrid() {
    scene.remove(grid);
    const span = Math.max(0.15, M.kin?.span ?? 0.5), cell = Math.max(0.02, Math.round(span * 25) / 100), n = 40;
    grid = new THREE.GridHelper(cell * n, n, 0x39ff88, 0x2f6f4a); grid.rotation.x = Math.PI / 2;
    grid.material.transparent = true; grid.material.opacity = 0.5; grid.material.depthWrite = false;
    grid.position.set(robotGroup.position.x, robotGroup.position.y, (M.kin?.ground_z ?? 0) + 0.0005); scene.add(grid);
  }
  /** motion world (the engine's: the floor at z = 0 when the root stands on it) from the page's */
  const toMotion = (v) => new THREE.Vector3(v.x, v.y, v.z - (M.kin?.ground_z ?? 0));
  const toPage = (v) => new THREE.Vector3(v[0], v[1], v[2] + (M.kin?.ground_z ?? 0));
  const baseNow = () => state.base ?? [0, 0, -(M.kin?.ground_z ?? 0), 0, 0, 0, 1];

  // ---------------------------------------------------------------- props: the block a gripper carries, its table, the wearer
  let props = [];
  function buildProps() {
    for (const p of props) scene.remove(p.obj);
    props = [];
    for (const p of M.traj?.props ?? []) {
      let obj;
      if (p.kind === "box") obj = new THREE.Mesh(new THREE.BoxGeometry(...p.size), new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.5 }));
      else if (p.kind === "table") { obj = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), new THREE.MeshStandardMaterial({ color: 0x2b4a38, transparent: true, opacity: 0.55 })); obj.userData.lift = p.size[2] / 2; }
      else obj = wearer(p.size[2]);
      scene.add(obj); props.push({ p, obj });
    }
  }
  function wearer(h) {
    // a plain silhouette of a person in a black undersuit, feet at its origin, facing +x
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.85, transparent: true, opacity: 0.92 });
    const cap = (r, len, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.rotation.x = Math.PI / 2 + rx; m.position.set(x, y, z); g.add(m); return m; };
    const s = h / 1.75;
    cap(0.06 * s, 0.38 * s, 0, 0.09 * s, 0.47 * s); cap(0.06 * s, 0.38 * s, 0, -0.09 * s, 0.47 * s);
    cap(0.15 * s, 0.32 * s, 0, 0, 1.15 * s); cap(0.045 * s, 0.5 * s, 0, 0.21 * s, 1.12 * s); cap(0.045 * s, 0.5 * s, 0, -0.21 * s, 1.12 * s);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 16, 12), mat); head.position.set(0.01, 0, 1.6 * s); g.add(head);
    return g;
  }
  function placeProp(P, frame) {
    const pos = P.p.path[Math.min(P.p.path.length - 1, frame)];
    P.obj.visible = !!pos; if (!pos) return;
    let w;
    if (M.traj.base) {
      // the motion moves the root: props are in the motion's world, placed from where the motion started
      const o = M.origin ?? { x: 0, y: 0, yaw: 0 }, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      w = toPage([o.x + c * pos[0] - s * pos[1], o.y + s * pos[0] + c * pos[1], pos[2]]);
    } else w = new THREE.Vector3(...pos).applyMatrix4(robotGroup.matrixWorld);   // in the root's frame
    P.obj.position.copy(w); if (P.obj.userData.lift) P.obj.position.z += P.obj.userData.lift;
  }

  // ---------------------------------------------------------------- tints
  function meshesOf(link) { const g = state.meshes.get(link); return g ? g.children.filter((c) => c.material?.emissive) : []; }
  function tintLink(link, color) { for (const m of meshesOf(link)) { if (!m.userData.baseEmissive) m.userData.baseEmissive = m.material.emissive.getHex(); m.material.emissive.setHex(color); m.material.emissiveIntensity = Math.max(m.material.emissiveIntensity, 0.6); } M.tinted.add(link); }
  function tintBelow(link, color) {
    if (!link || !state.robot) return;
    const kids = new Map(); for (const j of state.robot.joints) { if (!kids.has(j.parent)) kids.set(j.parent, []); kids.get(j.parent).push(j.child); }
    const st = [link]; while (st.length) { const l = st.pop(); tintLink(l, color); st.push(...(kids.get(l) ?? [])); }
  }
  function clearTint() {
    for (const link of M.tinted) for (const m of meshesOf(link)) { m.material.emissive.setHex(m.userData.baseEmissive ?? 0); m.material.emissiveIntensity = m.material.emissive.getHex() === 0x9fe8ff ? 1.2 : 1; }
    M.tinted.clear(); highlight();
  }

  // ---------------------------------------------------------------- sliders, undo, poses
  function syncSliders() { renderSliders(); updateFK(); }
  function pushUndo() { M.undo.push({ values: { ...state.jointValues }, base: state.base ? [...state.base] : null }); if (M.undo.length > 50) M.undo.shift(); }
  function savePose() {
    if (!state.robot) return;
    const name = (prompt("Name this pose", `pose ${Object.keys(state.robot.metadata.poses ?? {}).length + 1}`) ?? "").replace(/[^\w .-]/g, "").trim().slice(0, 40); if (!name || name === "__proto__") return;
    state.robot.metadata.poses = { ...(state.robot.metadata.poses ?? {}), [name]: Object.fromEntries(Object.entries(state.jointValues).map(([k, v]) => [k, +v.toFixed(5)])) };
    renderPoses(); toast(`Saved "${name}" in the design (it goes with the JSON and the share link).`);
  }
  function renderPoses() {
    const box = $("#poseList"); box.replaceChildren();
    for (const [name, values] of Object.entries(state.robot?.metadata?.poses ?? {})) {
      const b = el("button", null, name); b.type = "button"; b.onclick = () => { pushUndo(); stop(); state.jointValues = { ...state.jointValues, ...values }; syncSliders(); }; box.append(b);
    }
  }

  // ---------------------------------------------------------------- recording a drag session
  function startRecording() { M.recording = { t0: performance.now(), samples: [] }; $("#poseRecord").textContent = "Stop"; $("#poseRecord").setAttribute("aria-pressed", "true"); toast("Recording: pose the robot, then press Stop."); }
  function recordSample(now) {
    const R = M.recording, t = (now - R.t0) / 1000, last = R.samples[R.samples.length - 1];
    if (last && t - last.t < 1 / 60) return;
    R.samples.push({ t, values: { ...state.jointValues }, base: state.base ? [...state.base] : null });
  }
  async function stopRecording() {
    const R = M.recording; M.recording = null; $("#poseRecord").textContent = "Record"; $("#poseRecord").setAttribute("aria-pressed", "false");
    if (!R || R.samples.length < 2) return toast("Nothing recorded.");
    const fps = 30, end = R.samples[R.samples.length - 1].t, joints = M.kin.joints.map((j) => j.name), q = [], base = [];
    let k = 0;
    for (let f = 0; f <= Math.round(end * fps); f++) {
      const t = f / fps; while (k < R.samples.length - 2 && R.samples[k + 1].t < t) k++;
      const a = R.samples[k], b = R.samples[k + 1], s = Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t)));
      q.push(joints.map((n) => (a.values[n] ?? 0) + ((b.values[n] ?? 0) - (a.values[n] ?? 0)) * s));
      const ba = a.base ?? baseNow(), bb = b.base ?? baseNow(); base.push(ba.map((v, i) => v + (bb[i] - v) * s));
    }
    const n = M.clips.length + 1, name = `recorded_${n}`;
    const r = await eng("/api/engine/motion-check", { trajectory: { name, title: `Recorded ${n}`, fps, joints, q, base: R.samples.some((x) => x.base) ? base : null } });
    M.clips.push({ name, title: `Recorded ${n}`, trajectory: r.trajectory, files: r.files });
    M.cache.set(name, { trajectory: r.trajectory, files: r.files });
    M.name = name; renderPicker(); M.traj = r.trajectory; M.origin = { x: 0, y: 0, yaw: 0 }; buildProps(); showWarn();
    toast(`Recorded ${r.trajectory.duration_s.toFixed(1)} s. It plays and downloads like the other motions.`);
  }

  // ---------------------------------------------------------------- dragging
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.55, depthTest: false }));
  ghost.renderOrder = 10; ghost.visible = false; scene.add(ghost);
  const dashGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const dash = new THREE.Line(dashGeom, new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.01, gapSize: 0.008, depthTest: false })); dash.renderOrder = 11; dash.visible = false; scene.add(dash);
  function rayAt(e) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; }
  function hitAt(e) { rayAt(e); const hits = ray.intersectObjects(robotGroup.children, true).filter((h) => h.object.userData.linkName && h.object.visible); return hits[0] ?? null; }
  const kidsOf = () => { const k = new Map(); for (const j of state.robot.joints) { if (!k.has(j.parent)) k.set(j.parent, []); k.get(j.parent).push(j); } return k; };
  const below = (link) => { const k = kidsOf(), out = new Set([link]), st = [link]; while (st.length) for (const j of k.get(st.pop()) ?? []) if (!out.has(j.child)) { out.add(j.child); st.push(j.child); } return out; };
  /** world (page) transform of a link */
  function linkWorld(link) { const W = forwardKinematics(state.robot, state.jointValues).get(link); const m = new THREE.Matrix4(); m.set(...W); return m.premultiply(robotGroup.matrixWorld); }
  const rigidWithRoot = (link) => { for (let j = state.robot.joints.find((x) => x.child === link); j; j = state.robot.joints.find((x) => x.child === j.parent)) if (j.type !== "fixed") return false; return true; };
  function dragKind(link) {
    const k = M.kin; if (!k) return null;
    const tip = k.tips.find((t) => below(t.link).has(link));
    if (tip) return { kind: "ik", link: tip.link, point: tip.point, joints: tip.joints };
    const foot = k.feet.find((f) => below(f.link).has(link));
    if (foot) return { kind: "ik", link: foot.link, point: foot.point, joints: foot.joints, foot: true };
    if (rigidWithRoot(link)) {
      if (k.feet.length >= 2) return { kind: "body" };
      if (k.wheels.length >= 2) return { kind: "drive" };
      return null;
    }
    // the nearest joint above this part that the user may turn
    for (let j = state.robot.joints.find((x) => x.child === link); j; j = state.robot.joints.find((x) => x.child === j.parent)) {
      if (j.type === "fixed" || j.mimic) continue;
      if (j.passive && !k.anatomy.some((a) => a.joint === j.name)) continue;
      return { kind: "joint", joint: j };
    }
    return null;
  }
  function planeThrough(p) { const n = camera.getWorldDirection(new THREE.Vector3()).negate(); return new THREE.Plane().setFromNormalAndCoplanarPoint(n, p); }
  renderer.domElement.parentElement.addEventListener("pointerdown", (e) => {
    if (!M.move || !state.robot || e.button > 0) return;
    const hit = hitAt(e);
    let kind = hit ? dragKind(hit.object.userData.linkName) : null;
    // a press near a tool tip, a hand or a foot grabs it, even between the fingers where there is nothing to hit
    const grab = e.pointerType === "touch" ? 40 : 26;
    let near = null;
    (M.kin?.tips ?? []).forEach((t, i) => { const p = M.tipScreen(i); const d = p && Math.hypot(p.x - e.clientX, p.y - e.clientY); if (p && d < grab && (!near || d < near.d)) near = { d, t, p }; });
    if (near) kind = { kind: "ik", link: near.t.link, point: near.t.point, joints: near.t.joints };
    if (!kind && !hit && M.kin?.wheels?.length >= 2 && !M.kin.feet.length) kind = { kind: "drive" };
    if (!kind) return;
    e.preventDefault(); controls.enabled = false;
    renderer.domElement.setPointerCapture?.(e.pointerId);
    pushUndo(); pause(); M.origin = null;
    const start = near ? new THREE.Vector3(...near.p.world) : hit ? hit.point.clone() : groundPoint(e) ?? new THREE.Vector3();
    M.drag = { ...kind, id: e.pointerId, start, plane: planeThrough(start), y0: e.clientY, values0: { ...state.jointValues }, base0: [...baseNow()], good: { ...state.jointValues }, goodBase: [...baseNow()], pending: false, next: null };
    if (kind.kind === "ik") {
      const W = linkWorld(kind.link), tip = new THREE.Vector3(...kind.point).applyMatrix4(W);
      M.drag.tip0 = tip; M.drag.rot0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(W.clone().premultiply(robotGroup.matrixWorld.clone().invert())));
      ghost.scale.setScalar(Math.max(0.006, (M.kin.tips[0]?.reach_m ?? 0.3) * 0.025)); ghost.position.copy(tip); ghost.visible = true;
    }
    if (kind.kind === "joint") {
      const j = kind.joint, W = linkWorld(j.child), o = new THREE.Vector3().setFromMatrixPosition(W), a = new THREE.Vector3(...j.axis).transformDirection(W);
      M.drag.origin = o; M.drag.axis = a; M.drag.v0 = state.jointValues[j.name] ?? 0;
      M.drag.aplane = new THREE.Plane().setFromNormalAndCoplanarPoint(a, o);
      const h = new THREE.Vector3(); M.drag.h0 = rayAt(e).intersectPlane(j.type === "prismatic" ? M.drag.plane : M.drag.aplane, h) ? h.clone() : start.clone();
    }
    if (kind.kind === "drive") { M.drag.target = groundPoint(e); M.last = performance.now(); ghost.scale.setScalar(0.02); ghost.visible = !!M.drag.target; if (M.drag.target) ghost.position.copy(M.drag.target); }
    invalidate();
  }, { capture: true });
  addEventListener("pointermove", (e) => {
    const d = M.drag; if (!d || e.pointerId !== d.id) return;
    const r = rayAt(e), p = new THREE.Vector3();
    if (d.kind === "drive") { d.target = groundPoint(e); if (d.target) { ghost.position.copy(d.target); ghost.visible = true; } return; }
    if (d.kind === "joint") { jointDrag(d, r); return; }
    if (!r.intersectPlane(d.plane, p)) return;
    const delta = p.sub(d.start);
    if (M.depth || e.shiftKey) {
      // depth: up and down the screen moves towards or away from the camera; across the screen still moves sideways
      const n = d.plane.normal.clone(), right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const side = delta.dot(right), k = camera.position.distanceTo(controls.target) * 0.003;
      delta.copy(right.multiplyScalar(side)).addScaledVector(n, (e.clientY - d.y0) * k);
    }
    if (d.kind === "ik") { const target = d.tip0.clone().add(delta); ghost.position.copy(target); solveIk(d, target); }
    if (d.kind === "body") bodyDrag(d, delta);
    invalidate();
  });
  addEventListener("pointerup", (e) => endDrag(e));
  addEventListener("pointercancel", (e) => endDrag(e));
  function endDrag(e) {
    const d = M.drag; if (!d || e.pointerId !== d.id) return;
    M.drag = null; controls.enabled = true; ghost.visible = false; dash.visible = false;
    clearTint(); syncSliders();
    if (d.kind === "body" && d.far) walkTo(d.far);
    M.lastDrag = { kind: d.kind, link: d.link ?? null, target: d.lastTarget ? [d.lastTarget.x, d.lastTarget.y, d.lastTarget.z] : null, result: d.result ?? null };
  }
  function groundPoint(e) { const r = rayAt(e), p = new THREE.Vector3(); return r.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(M.kin?.ground_z ?? 0)), p) ? p : null; }
  function atLimit(names) { for (const n of names) { const j = state.robot.joints.find((x) => x.name === n); if (j) tintBelow(j.child, AMBER); } }

  async function solveIk(d, target) {
    d.lastTarget = target.clone();
    if (d.pending) { d.next = target; return; }
    d.pending = true;
    try {
      const t = toMotion(target), opts = { seed: { ...state.jointValues }, base: baseNow(), restarts: 0, iterations: 40, collision: true, joints: d.joints };
      if (M.orient && !d.foot) { opts.orientation = true; }
      const body = { link: d.link, target: { xyz: [t.x, t.y, t.z], ...(M.orient && !d.foot ? { quat: [d.rot0.x, d.rot0.y, d.rot0.z, d.rot0.w] } : {}) }, options: opts };
      const r = await eng("/api/engine/ik", body);
      if (M.drag !== d) return;
      clearTint();
      if (r.collisions?.length) {
        // a pose that collides is not taken: the robot stays at the last clear pose, the parts that would meet turn red
        for (const c of r.collisions) { tintLink(c.a, RED); tintLink(c.b, RED); }
        Object.assign(state.jointValues, d.good); showLabel("", `Blocked: ${r.collisions[0].a} / ${r.collisions[0].b}`, d.link);
      } else {
        Object.assign(state.jointValues, r.values); d.good = { ...state.jointValues };
        atLimit(r.at_limit);
        const changed = Object.entries(r.values).sort((a, b) => Math.abs(b[1] - (d.values0[b[0]] ?? 0)) - Math.abs(a[1] - (d.values0[a[0]] ?? 0)))[0];
        showLabel(changed ? `${changed[0]}  ${(changed[1] * DEG).toFixed(1)}°${r.reached ? "" : `  · ${r.error_mm.toFixed(0)} mm short`}` : "", r.at_limit.length ? `at limit: ${r.at_limit.join(", ")}` : "", d.link);
      }
      d.result = r;
      // unreachable: the closest pose, and a dashed line from where the tip got to the target
      if (!r.reached) { const a = toPage(r.position); dashGeom.setFromPoints([a, target]); dash.computeLineDistances(); dash.visible = true; } else dash.visible = false;
      updateFK();
    } finally {
      d.pending = false;
      if (d.next && M.drag === d) { const n = d.next; d.next = null; solveIk(d, n); }
    }
  }
  function jointDrag(d, r) {
    const j = d.joint, h = new THREE.Vector3();
    let v = d.v0;
    if (j.type === "prismatic") { if (!r.intersectPlane(d.plane, h)) return; v = d.v0 + h.clone().sub(d.h0).dot(d.axis); }
    else {
      if (!r.intersectPlane(d.aplane, h)) return;
      const a = d.h0.clone().sub(d.origin), b = h.clone().sub(d.origin);
      if (a.length() < 1e-6 || b.length() < 1e-6) return;
      v = d.v0 + Math.atan2(d.axis.dot(a.clone().cross(b)), a.dot(b));
    }
    const lo = j.type === "continuous" ? -Infinity : j.limit?.lower ?? -Math.PI, hi = j.type === "continuous" ? Infinity : j.limit?.upper ?? Math.PI;
    const clamped = Math.max(lo, Math.min(hi, v));
    state.jointValues[j.name] = clamped; updateFK(); clearTint();
    if (clamped !== v) tintBelow(j.child, AMBER);
    showLabel(`${j.name}  ${j.type === "prismatic" ? `${(clamped * 1000).toFixed(0)} mm` : `${(clamped * DEG).toFixed(1)}°`}`, clamped !== v ? "at its limit" : "", j.child);
    checkPose(d);
  }
  async function checkPose(d) {
    if (d.checking) { d.recheck = true; return; }
    d.checking = true;
    try {
      const r = await eng("/api/engine/pose-collisions", { values: state.jointValues });
      if (M.drag !== d) return;
      if (r.collisions?.length) { for (const c of r.collisions) { tintLink(c.a, RED); tintLink(c.b, RED); } Object.assign(state.jointValues, d.good); updateFK(); showLabel("", `Blocked: ${r.collisions[0].a} / ${r.collisions[0].b}`, d.joint?.child); }
      else d.good = { ...state.jointValues };
    } catch { /* no solids here: posing still works, unchecked */ }
    finally { d.checking = false; if (d.recheck && M.drag === d) { d.recheck = false; checkPose(d); } }
  }
  async function bodyDrag(d, delta) {
    const b = [...d.base0]; b[0] += delta.x; b[1] += delta.y; b[2] += delta.z;
    d.wantBase = b;
    if (d.pending) return;
    d.pending = true;
    try {
      while (d.wantBase) {
        const want = d.wantBase; d.wantBase = null;
        const r = await eng("/api/engine/body-ik", { base: want, options: { seed: d.values0, seedBase: d.base0 } });
        if (M.drag !== d) return;
        clearTint();
        if (r.reached) { Object.assign(state.jointValues, r.values); setBase(want); d.far = null; dash.visible = false; showLabel(`body ${(Math.hypot(want[0] - d.base0[0], want[1] - d.base0[1]) * 1000).toFixed(0)} mm`, "", null); }
        else {
          atLimit(r.at_limit);
          // too far to lean: on release it walks there
          d.far = [want[0] - d.base0[0], want[1] - d.base0[1]];
          const a = toPage(baseNow()), t = toPage(want); dashGeom.setFromPoints([a, t]); dash.computeLineDistances(); dash.visible = true;
          showLabel("", "out of reach: release to walk there", null);
        }
        updateFK();
      }
    } finally { d.pending = false; }
  }
  async function walkTo(far) {
    const yaw = originNow().yaw, c = Math.cos(-yaw), s = Math.sin(-yaw), local = [c * far[0] - s * far[1], s * far[0] + c * far[1]];
    const name = M.kin.feet.length === 2 ? "step" : "gait";
    if (!M.list.some((m) => m.name === name)) return;
    const r = await eng("/api/engine/motion", { name, to: local, collision: false });
    M.origin = originNow(); state.jointValues = { ...(M.kin.home ?? {}) };
    M.traj = { ...r.trajectory, name: `walk_to` }; M.cache.set("walk_to", r); buildProps(); M.t = 0; M.playing = true; M.loop = false; $("#motionLoop").checked = false; playBtn.textContent = "Pause"; M.last = performance.now();
  }
  function driveStep(now) {
    const d = M.drag, k = M.kin, dt = Math.min(0.05, (now - (M.last ?? now)) / 1000); M.last = now;
    if (!d.target || !k.drive) return;
    const b = baseNow(), yaw = 2 * Math.atan2(b[5], b[6]), tg = toMotion(d.target);
    const dx = tg.x - b[0], dy = tg.y - b[1], dist = Math.hypot(dx, dy);
    if (dist < 0.015) return;
    const vmax = k.drive.speed_m_s, wmax = k.drive.turn_rad_s;
    let vx, vy, w;
    if (k.mecanum) { const s = vmax * Math.min(1, dist / 0.25); vx = (dx / dist) * s; vy = (dy / dist) * s; w = 0; }
    else {
      const e = Math.atan2(Math.sin(Math.atan2(dy, dx) - yaw), Math.cos(Math.atan2(dy, dx) - yaw));
      w = Math.max(-wmax, Math.min(wmax, 3 * e)); const v = vmax * Math.min(1, dist / 0.3) * Math.max(0, Math.cos(e)); vx = Math.cos(yaw) * v; vy = Math.sin(yaw) * v;
    }
    const nyaw = yaw + w * dt, nb = [b[0] + vx * dt, b[1] + vy * dt, b[2], 0, 0, Math.sin(nyaw / 2), Math.cos(nyaw / 2)];
    // wheels turn by the ground their hubs cover over their radius
    for (const wh of k.wheels) {
      const cw = (Y) => [Math.cos(Y) * wh.center[0] - Math.sin(Y) * wh.center[1], Math.sin(Y) * wh.center[0] + Math.cos(Y) * wh.center[1]];
      const c0 = cw(yaw), c1 = cw(nyaw), ds = [nb[0] + c1[0] - b[0] - c0[0], nb[1] + c1[1] - b[1] - c0[1]];
      const ax = [Math.cos(nyaw) * wh.axis[0] - Math.sin(nyaw) * wh.axis[1], Math.sin(nyaw) * wh.axis[0] + Math.cos(nyaw) * wh.axis[1], wh.axis[2]];
      const f = [ax[1], -ax[0]], fn = Math.hypot(f[0], f[1]) || 1;
      let dth = (ds[0] * f[0] + ds[1] * f[1]) / fn / wh.radius_m;
      if (wh.mecanum) { const lat = [-Math.sin(nyaw), Math.cos(nyaw)], sg = -Math.sign(wh.center[0] * wh.center[1]) || 1, fx = (f[0] * Math.cos(nyaw) + f[1] * Math.sin(nyaw)) / fn; dth += (sg * fx * (ds[0] * lat[0] + ds[1] * lat[1])) / wh.radius_m; }
      state.jointValues[wh.joint] = (state.jointValues[wh.joint] ?? 0) + dth;
    }
    setBase(nb, { follow: true }); updateFK();
  }

  // ---------------------------------------------------------------- exports
  const fileName = () => `${state.robot.robot_name}_${M.traj?.name ?? "motion"}`;
  async function exportAs(kind) {
    if (!state.robot) return;
    if (!M.traj) await loadTraj(M.name);
    const files = M.cache.get(M.traj.name)?.files ?? M.clips.find((c) => c.name === M.traj.name)?.files ?? (await eng("/api/engine/motion", { name: M.traj.name, files: true })).files;
    const pickFile = (ext) => Object.entries(files).find(([n]) => n.endsWith(ext) && !n.endsWith("_base.csv"));
    if (kind === "csv") { const f = pickFile(".csv"); download(`${state.robot.robot_name}_${f[0]}`, f[1], "text/csv"); const b = Object.entries(files).find(([n]) => n.endsWith("_base.csv")); if (b) download(`${state.robot.robot_name}_${b[0]}`, b[1], "text/csv"); return; }
    if (kind === "ros2") { const f = pickFile(".yaml"); if (!f) return toast("This motion moves no motor-driven joint."); return download(`${state.robot.robot_name}_${f[0]}`, f[1], "application/yaml"); }
    if (kind === "bvh") { const f = pickFile(".bvh"); if (!f) return toast("BVH is for robots with a body (shoulders, hips, knees)."); return download(`${state.robot.robot_name}_${f[0]}`, f[1], "text/plain"); }
    if (kind === "all") return download(`${fileName()}.zip`, makeZip(Object.fromEntries(Object.entries(files).map(([n, v]) => [`${fileName()}/${n}`, v]))));
    if (kind === "gif") return gif();
    if (kind === "video") return video();
  }
  async function gif() {
    const { GIFEncoder, quantize, applyPalette } = await import(new URL("./vendor/gifenc.esm.js", import.meta.url).href);
    const tr = M.traj, fps = 15, n = Math.max(1, Math.floor(tr.duration_s * fps) + 1);
    pauseQuiet(); M.origin ??= originNow();
    const src = renderer.domElement, W = Math.min(480, src.width), H = Math.round((W * src.height) / src.width);
    const c2 = document.createElement("canvas"); c2.width = W; c2.height = H; const g = c2.getContext("2d", { willReadFrequently: true });
    const enc = GIFEncoder();
    // frame what moves: the robot (and its props) over the whole motion, seen from where the camera looks now
    const saved = { pos: camera.position.clone(), target: controls.target.clone(), near: camera.near, far: camera.far }, box = new THREE.Box3();
    for (let k = 0; k <= 16; k++) { setTime((tr.duration_s * k) / 16); robotGroup.updateMatrixWorld(true); box.union(new THREE.Box3().setFromObject(robotGroup)); for (const p of props) if (p.obj.visible) box.union(new THREE.Box3().setFromObject(p.obj)); }
    if (!box.isEmpty()) {
      const sphere = box.getBoundingSphere(new THREE.Sphere()), dir = camera.position.clone().sub(controls.target).normalize();
      const fov = (camera.fov * Math.PI) / 180, across = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect), dist = (sphere.radius / Math.sin(Math.min(fov, across) / 2)) * 1.05;
      controls.target.copy(sphere.center); camera.position.copy(sphere.center).addScaledVector(dir, dist); camera.near = Math.max(0.001, dist / 200); camera.far = dist * 200; camera.updateProjectionMatrix();
    }
    const follow = M.noFollow; M.noFollow = true;
    for (let k = 0; k < n; k++) {
      setTime(k / fps); renderer.render(scene, camera);
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.drawImage(src, 0, 0, W, H);
      g.font = "600 13px system-ui, sans-serif"; g.fillStyle = "#a3b9ab"; g.fillText(`${tr.title} · ${(k / fps).toFixed(1)} s`, 10, H - 28);
      if (M.label) { g.fillStyle = "#ecfbf1"; g.fillText(M.label, 10, H - 10); }
      if (M.warn) { g.fillStyle = "#ff5a6a"; g.fillText(M.warn, 10, 20); }
      const { data } = g.getImageData(0, 0, W, H), palette = quantize(data, 128), index = applyPalette(data, palette);
      enc.writeFrame(index, W, H, { palette, delay: Math.round(1000 / fps), repeat: 0 });
      if (k % 8 === 0) { info.textContent = `Making the GIF: ${Math.round((k / n) * 100)} %`; await new Promise((r) => setTimeout(r, 0)); }
    }
    enc.finish();
    M.noFollow = follow; camera.position.copy(saved.pos); controls.target.copy(saved.target); camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix(); controls.update();
    const blob = new Blob([enc.bytes()], { type: "image/gif" });
    M.lastGif = { bytes: blob.size, frames: n, width: W, height: H };
    download(`${fileName()}.gif`, blob); showWarn();
  }
  async function video() {
    if (typeof MediaRecorder === "undefined" || !renderer.domElement.captureStream) return toast("This browser cannot record video; try the GIF.");
    const mime = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const stream = renderer.domElement.captureStream(60), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => { rec.onstop = r; });
    const loop = M.loop; M.loop = false; M.t = 0; M.origin = originNow(); rec.start(250); await play();
    await new Promise((r) => { const w = () => (M.playing ? setTimeout(w, 50) : r()); w(); });
    rec.stop(); await done; M.loop = loop;
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    download(`${fileName()}.${ext}`, new Blob(chunks, { type: mime.split(";")[0] }));
  }

  /** for tests: where a tool tip is on the screen (client pixels) and in the world */
  M.tipScreen = (i = 0) => {
    const t = M.kin?.tips[i]; if (!t) return null;
    const p = new THREE.Vector3(...t.point).applyMatrix4(linkWorld(t.link)), q = p.clone().project(camera), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height, world: [p.x, p.y, p.z], link: t.link };
  };

  return {
    robotChanged() {
      stop(); M.handle = null; M.list = []; M.kin = null; M.cache.clear(); M.traj = null; M.name = null; M.clips = []; M.undo = []; state.base = null; setBase(null);
      pick.replaceChildren(); info.textContent = ""; warnEl.hidden = true; renderPoses();
      refreshList().catch(() => {});
    },
    tick,
    get busy() { return M.playing || !!M.drag; },
  };
}
