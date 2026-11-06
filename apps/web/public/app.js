import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { forwardKinematics, findRoot, download, makeZip } from "./robotkit.js";
import { Dial, Sheet, followKeyboard, haptic, popIn, transformFlash } from "./ui.js";

const API = ""; // same origin
let revealNext = null, first = true, tierDial = null;
const STATIC = globalThis.ttrStatic; // GitHub Pages build: generator runs in this tab, see apps/web/src/browser-api.ts
const $ = (s) => document.querySelector(s);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

// ---------------- state ----------------
const state = {
  robot: null, urdf: "", xacro: "", jointValues: {},
  versions: [], version: -1, selection: null, meshes: new Map(), axisHelpers: [], frameHelpers: [], bom: null, id: null,
};

// ---------------- three.js scene ----------------
const viewport = $("#viewport");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.up.set(0, 0, 1);
camera.position.set(0.9, -0.9, 0.7);
// Without WebGL (hardware acceleration off, blocked GPU) the 3D view is skipped but generation,
// the engineering report and every download still work.
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setClearColor(0x000000, 0); }
catch {
  const canvas = document.createElement("canvas");
  renderer = { domElement: canvas, setPixelRatio() {}, setSize() {}, render() {} };
  const note = el("div", "nowebgl", "3D preview unavailable: this browser has WebGL turned off (enable hardware acceleration to see the model). Generating, the Build report and all downloads still work.");
  viewport.append(note);
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.target.set(0, 0, 0.25);

scene.add(new THREE.HemisphereLight(0xd8ffe6, 0x0b1a10, 0.95));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, -2, 3); scene.add(key);
const fill = new THREE.DirectionalLight(0x7dffb0, 0.35); fill.position.set(-2, 1, 1); scene.add(fill);

// projection pad under the robot: three soft rings, sized to the robot in frameRobot()
const pad = new THREE.Group();
for (const [radius, opacity] of [[1, 0.55], [0.84, 0.14]]) {
  pad.add(new THREE.Mesh(new THREE.RingGeometry(radius - 0.008, radius, 128), new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
}
scene.add(pad);
const robotGroup = new THREE.Group(); scene.add(robotGroup);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h); // updates CSS size too; without it HiDPI (DPR 2) canvases overflow the layout
  camera.aspect = w / h; camera.updateProjectionMatrix(); invalidate();
}
// Draw only when something changed: an idle GPU keeps the glass panels and springs at full frame rate.
let dirty = true;
function invalidate() { dirty = true; }
controls.addEventListener("change", invalidate);
new ResizeObserver(resize).observe(viewport); resize();
(function loop() { requestAnimationFrame(loop); controls.update(); if (dirty) { dirty = false; renderer.render(scene, camera); } })();

// The sheet's top edge decides how much room the model gets: on phones the canvas scales from its
// top edge to stay in the visible area, using transform alone so dragging stays smooth.
const sheet = new Sheet({ el: $("#sheet"), grabber: $("#grabber"), onMove(top) {
  if (top == null) { viewport.style.transform = ""; return; }
  const h = viewport.offsetHeight, room = top - viewport.offsetTop - 8;
  const scale = Math.min(1, Math.max(0.68, room / h));
  viewport.style.transform = `translateY(${Math.min(0, (room - h * scale) / 2)}px) scale(${scale})`;
} });

// ---------------- geometry / materials ----------------
const stlLoader = new STLLoader(); const meshCache = new Map();
let previewRevision = 0;
let preview = { ready: false, expected: 0, loaded: 0, errors: [] };
async function loadMeshInto(mesh, g, revision, robotId) {
  const key = `${robotId}/${g.file}`;
  try {
    let geometry = meshCache.get(key);
    if (!geometry) {
      geometry = await stlLoader.loadAsync(`/api/robots/${robotId}/mesh/${g.file}`);
      const positions = geometry.getAttribute('position');
      if (!positions || positions.count < 3 || positions.count % 3 || !positions.array.every(Number.isFinite)) {
        geometry.dispose(); throw new Error('Invalid triangle geometry');
      }
      geometry.computeVertexNormals(); meshCache.set(key, geometry);
      if (meshCache.size > 512) {
        const oldest = meshCache.keys().next().value;
        meshCache.get(oldest).dispose(); meshCache.delete(oldest);
      }
    }
    if (revision !== previewRevision) return;
    mesh.geometry.dispose(); mesh.geometry = geometry.clone();
    mesh.userData.meshLoaded = true;
    preview.loaded++; invalidate();
  } catch (error) {
    if (revision !== previewRevision) return;
    preview.errors.push(`${g.file}: ${error.message}`);
    mesh.material.color.set(0xff3366); mesh.material.wireframe = true; invalidate();
  }
}
function showPreviewStatus() {
  const node = $('#previewStatus');
  node.hidden = preview.ready;
  node.replaceChildren();
  if (preview.errors.length) {
    node.append(document.createTextNode(`Incomplete preview: ${preview.errors.length} part(s) failed to load. `));
    const retry = el('button', '', 'Retry'); retry.onclick = () => buildRobot(state.robot); node.append(retry);
    node.title = preview.errors.join('\n');
  } else node.textContent = `Loading geometry: ${preview.loaded}/${preview.expected}`;
}
function makeGeom(g) {
  switch (g.type) {
    case "mesh": { const b = g.bbox; return new THREE.BoxGeometry(Math.max(1e-3, b.max[0] - b.min[0]), Math.max(1e-3, b.max[1] - b.min[1]), Math.max(1e-3, b.max[2] - b.min[2])).translate((b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2); }
    case "box": { const b = new THREE.BoxGeometry(g.size[0], g.size[1], g.size[2]); return b; }
    case "cylinder": { const c = new THREE.CylinderGeometry(g.radius, g.radius, g.length, 28); c.rotateX(Math.PI / 2); return c; }
    case "capsule": { const c = new THREE.CapsuleGeometry(g.radius, g.length, 6, 16); c.rotateX(Math.PI / 2); return c; }
    case "sphere": return new THREE.SphereGeometry(g.radius, 24, 16);
    default: return new THREE.BoxGeometry(0.05, 0.05, 0.05);
  }
}
function matColor(spec, name, fallback) {
  const m = spec.materials.find((x) => x.name === name);
  if (m) return new THREE.Color(m.color[0], m.color[1], m.color[2]);
  return new THREE.Color(fallback);
}
function mat4(arr) { const m = new THREE.Matrix4(); m.set(...arr); return m; }

// ---------------- build robot ----------------
function clearRobot() {
  for (const [, obj] of state.meshes) {
    obj.traverse(child => { child.geometry?.dispose(); child.material?.dispose(); });
    robotGroup.remove(obj);
  }
  state.meshes.clear();
  for (const h of [...state.axisHelpers, ...state.frameHelpers]) robotGroup.remove(h);
  state.axisHelpers = []; state.frameHelpers = [];
  while (robotGroup.children.length) robotGroup.remove(robotGroup.children[0]);
}

function buildRobot(spec) {
  const revision = ++previewRevision;
  clearRobot();
  preview = { ready: false, expected: 0, loaded: 0, errors: [] };
  const pending = [];
  for (const l of spec.links) {
    const group = new THREE.Group(); group.matrixAutoUpdate = false;
    const isCol = $("#showCollision").checked;
    const g = isCol ? (l.collision ?? l.geometry) : l.geometry;
    let shapes=[g];
    if(isCol && g.type==='mesh' && g.part==='arm_spar' && (!g.scale || g.scale[0]===g.scale[1])) {
      const radial=g.scale?.[0]??1,axial=g.scale?.[2]??1;
      const p=Object.fromEntries(Object.entries({length:.25,radius:.025,neck:.010,gap:.04}).map(([key,value])=>[key,typeof g.params?.[key]==='number'?g.params[key]:value]));
      shapes=[{type:'cylinder',radius:p.neck*radial,length:p.length*axial},
        {type:'cylinder',radius:p.radius*radial,length:(p.length-2*p.gap+2*Math.min(p.gap*.3,.006))*axial}];
    }
    for(const shape of shapes) {
      const geom = makeGeom(shape);
      const color = matColor(spec, l.material, l.role === "gripper" ? 0x2a5bd0 : l.role === "wheel" ? 0x1a1a1f : l.role === "base" ? 0x3f3f46 : 0xd8d8dc);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color, metalness: l.material?.startsWith("armour_") ? 0.6 : l.material === "wearer" ? 0 : 0.25, roughness: l.material?.startsWith("armour_") ? 0.4 : l.material === "wearer" ? 0.9 : 0.55,
        ...(l.material === "lens_glow" ? { emissive: new THREE.Color(0x9fe8ff), emissiveIntensity: 1.2 } : {}), transparent: isCol, opacity: isCol ? 0.45 : 1, wireframe: isCol }));
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(mat4(poseArr(l.origin)));
      mesh.userData.linkName = l.name;
      if (g.type === "mesh" && !isCol) {
        preview.expected++;
        if (state.id) pending.push(loadMeshInto(mesh, g, revision, state.id));
        else preview.errors.push(`${g.file}: missing robot identifier`);
      }
      group.add(mesh);
    }
    robotGroup.add(group);
    state.meshes.set(l.name, group);
  }
  updateFK();
  frameRobot();
  showPreviewStatus();
  Promise.all(pending).then(() => {
    if (revision !== previewRevision) return;
    frameRobot();
    // Explicitly draw the loaded geometry. Network-idle does not imply a painted frame.
    renderer.render(scene, camera);
    preview.ready = preview.errors.length === 0 && preview.loaded === preview.expected;
    showPreviewStatus();
    if (revealNext) { const strong = revealNext === "strong"; revealNext = null; reveal(strong); }
  });
}

function poseArr(p) {
  // build row-major [R|t] identical to robotkit.poseToMat
  const [r, pt, y] = p.rpy;
  const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(pt), sp = Math.sin(pt), cy = Math.cos(y), sy = Math.sin(y);
  return [cy*cp, cy*sp*sr - sy*cr, cy*sp*cr + sy*sr, p.xyz[0], sy*cp, sy*sp*sr + cy*cr, sy*sp*cr - cy*sr, p.xyz[1], -sp, cp*sr, cp*cr, p.xyz[2], 0, 0, 0, 1];
}

function updateFK() {
  if (!state.robot) return;
  const world = forwardKinematics(state.robot, state.jointValues);
  for (const [name, group] of state.meshes) {
    const m = world.get(name); if (m) { group.matrix.copy(mat4(m)); group.matrixWorldNeedsUpdate = true; }
  }
  drawHelpers(world); invalidate();
}

function drawHelpers(world) {
  for (const h of [...state.axisHelpers, ...state.frameHelpers]) robotGroup.remove(h);
  state.axisHelpers = []; state.frameHelpers = [];
  const showAxes = $("#showAxes").checked, showFrames = $("#showFrames").checked;
  if (showFrames) for (const [, m] of world) { const a = new THREE.AxesHelper(0.06); a.matrixAutoUpdate = false; a.matrix.copy(mat4(m)); robotGroup.add(a); state.frameHelpers.push(a); }
  if (showAxes) for (const j of state.robot.joints) {
    if (j.type === "fixed" || j.passive) continue;
    const m = world.get(j.child); if (!m) continue;
    const origin = new THREE.Vector3(m[3], m[7], m[11]);
    const dir = new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]).applyMatrix4(new THREE.Matrix4().extractRotation(mat4(m))).normalize();
    const arrow = new THREE.ArrowHelper(dir, origin, 0.12, j.type === "prismatic" ? 0x3aa0ff : 0xe0910f, 0.03, 0.02);
    robotGroup.add(arrow); state.axisHelpers.push(arrow);
  }
}

function frameRobot() {
  scene.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(robotGroup);
  if (bb.isEmpty()) return;
  const sphere = bb.getBoundingSphere(new THREE.Sphere());
  console.log('[frame] center', sphere.center.toArray().map(x=>+x.toFixed(2)), 'r', +sphere.radius.toFixed(3));
  const r = Math.max(0.12, sphere.radius);
  const fov = (camera.fov * Math.PI) / 180;
  const across = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);   // portrait phones are limited by width
  const dist = (r / Math.sin(Math.min(fov, across) / 2)) * 1.1;
  const dir = new THREE.Vector3(1, -1.1, 0.65).normalize();
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  controls.target.copy(sphere.center);
  camera.near = Math.max(0.001, dist / 200);
  camera.far = dist * 200;
  camera.updateProjectionMatrix();
  controls.update();
  pad.position.set(sphere.center.x, sphere.center.y, bb.min.z);
  pad.scale.setScalar(Math.max(0.08, Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y) * 0.56));
  invalidate();
}

// ---------------- selection ----------------
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
// A tap selects; a drag only orbits.
let tapFrom = null;
renderer.domElement.addEventListener("pointerdown", (e) => { tapFrom = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!tapFrom || Math.hypot(e.clientX - tapFrom[0], e.clientY - tapFrom[1]) > 8) return;
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(robotGroup.children, true).filter((h) => h.object.userData.linkName);
  if (hits.length) selectLink(hits[0].object.userData.linkName);
});

function selectLink(name) {
  state.selection = { kind: "link", name };
  highlight(); renderTree(); renderInspector();
  showInspector();
}
function selectJoint(name) { state.selection = { kind: "joint", name }; renderTree(); renderInspector(); showInspector(); }
function showInspector() { jump("model"); setTab("inspector"); }

function highlight() {
  for (const [name, group] of state.meshes) {
    const mesh = group.children[0];
    if (!mesh.material.emissive) continue;
    const glow = mesh.material.emissiveIntensity > 1 ? 0x9fe8ff : 0x000000;   // lenses keep their light
    mesh.material.emissive = new THREE.Color(state.selection?.kind === "link" && state.selection.name === name ? 0x0e6b3a : glow);
  }
  invalidate();
}

// ---------------- panels ----------------
function renderTree() {
  const box = $("#tree"); box.innerHTML = "";
  if (!state.robot) return;
  const root = findRoot(state.robot);
  const kids = new Map(); for (const j of state.robot.joints) { if (!kids.has(j.parent)) kids.set(j.parent, []); kids.get(j.parent).push(j); }
  const walk = (link, depth) => {
    const row = el("div", "row"); const pad = "  ".repeat(depth) + (depth ? "└ " : "");
    row.append(document.createTextNode(pad + link));
    const l = state.robot.links.find((x) => x.name === link);
    if (l?.role) { const r = el("span", "role", "  " + l.role); row.append(r); }
    if (state.selection?.kind === "link" && state.selection.name === link) row.classList.add("sel");
    row.onclick = () => selectLink(link);
    box.append(row);
    for (const j of kids.get(link) ?? []) walk(j.child, depth + 1);
  };
  if (root) walk(root, 0);
}

function kv(obj) { const d = el("div", "kv"); for (const [k, v] of Object.entries(obj)) { d.append(el("div", "k", k), el("div", "v", String(v))); } return d; }
const f3 = (n) => (typeof n === "number" ? n.toFixed(3) : n);
const vec = (v) => "[" + v.map(f3).join(", ") + "]";

function renderInspector() {
  const pane = $("#tab-inspector"); pane.innerHTML = "";
  if (!state.selection) { pane.append(el("div", "hint", "Click a link or joint in the 3D view or tree.")); return; }
  if (state.selection.kind === "link") {
    const l = state.robot.links.find((x) => x.name === state.selection.name); if (!l) return;
    pane.append(el("div", "insp-title", l.name), el("div", "insp-sub", "Link" + (l.role ? " · " + l.role : "")));
    const I = l.inertia ?? {};
    const parent = state.robot.joints.find((j) => j.child === l.name)?.parent ?? "—";
    const children = state.robot.joints.filter((j) => j.parent === l.name).map((j) => j.child).join(", ") || "—";
    pane.append(kv({
      Geometry: l.geometry.type,
      Dimensions: l.geometry.type === "box" ? vec(l.geometry.size) : l.geometry.type === "mesh" ? vec(l.geometry.bbox.max.map((v, i) => v - l.geometry.bbox.min[i])) : l.geometry.type === "sphere" ? "r=" + f3(l.geometry.radius) : "r=" + f3(l.geometry.radius) + " l=" + f3(l.geometry.length),
      Mass: f3(l.mass) + " kg",
      Inertia: `ixx=${f3(I.ixx)} iyy=${f3(I.iyy)} izz=${f3(I.izz)}`,
      Origin: "xyz " + vec(l.origin.xyz),
      Parent: parent, Children: children,
    }));
  } else {
    const j = state.robot.joints.find((x) => x.name === state.selection.name); if (!j) return;
    pane.append(el("div", "insp-title", j.name), el("div", "insp-sub", "Joint · " + j.type));
    pane.append(kv({
      Type: j.type, Parent: j.parent, Child: j.child, Axis: vec(j.axis),
      Origin: "xyz " + vec(j.origin.xyz) + " rpy " + vec(j.origin.rpy),
      Limits: j.limit ? `[${f3(j.limit.lower)}, ${f3(j.limit.upper)}]` : "—",
      Velocity: j.limit ? f3(j.limit.velocity) : "—", Effort: j.limit ? f3(j.limit.effort) : "—",
      Position: f3(state.jointValues[j.name] ?? 0),
    }));
  }
}

function renderSliders() {
  const box = $("#sliders"); box.innerHTML = "";
  if (!state.robot) return;
  const actuated = state.robot.joints.filter((j) => j.type !== "fixed" && !j.passive);
  if (!actuated.length) { box.append(el("div", "hint", "This robot has no actuated joints.")); return; }
  for (const j of actuated) {
    const cont = j.type === "continuous";
    const lo = cont ? -Math.PI : (j.limit?.lower ?? -Math.PI);
    const hi = cont ? Math.PI : (j.limit?.upper ?? Math.PI);
    const wrap = el("div", "slider");
    const lab = el("label"); lab.append(el("span", null, j.name)); const val = el("b", null, "0.00"); lab.append(val); wrap.append(lab);
    const s = document.createElement("input"); s.type = "range"; s.min = lo; s.max = hi; s.step = (hi - lo) / 200 || 0.01; s.value = state.jointValues[j.name] ?? 0;
    const unit = j.type === "prismatic" ? "m" : "";
    const upd = () => { s.style.setProperty("--p", `${((s.value - lo) / (hi - lo || 1)) * 100}%`); state.jointValues[j.name] = parseFloat(s.value); val.textContent = parseFloat(s.value).toFixed(2) + unit; updateFK(); if (state.selection?.kind === "joint" && state.selection.name === j.name) renderInspector(); };
    s.oninput = upd; wrap.append(s);
    lab.style.cursor = "pointer"; lab.onclick = () => selectJoint(j.name);
    box.append(wrap); upd();
  }
}

function renderHistory() {
  const box = $("#history"); box.innerHTML = "";
  state.versions.forEach((v, i) => {
    const card = el("div", "ver" + (i === state.version ? " sel" : ""));
    card.append(el("b", null, `v${i + 1}`), el("small", null, v.label));
    card.onclick = () => loadVersion(i);
    box.append(card);
  });
}

function renderBom(bom) {
  const box = $("#bom"); box.innerHTML = "";
  const totalEl = $("#bomtotal");
  if (!bom) { totalEl.textContent = ""; return; }
  const over = bom.budget != null && !bom.feasible;
  totalEl.textContent = "$" + bom.total + (bom.budget != null ? (bom.feasible ? " ✓ within" : " ✗ over") : "");
  totalEl.className = "bomtotal " + (bom.budget == null ? "" : over ? "over" : "ok");
  const tbl = el("table", "bomtable");
  tbl.innerHTML = "<thead><tr><th>Component</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>";
  const tb = el("tbody");
  for (const l of bom.lines) {
    const tr = el("tr");
    const url = (l.note ?? "").match(/https?:\/\/\S+$/)?.[0], note = url ? l.note.slice(0, -url.length).replace(/\s*·\s*$/, "") : l.note;
    tr.innerHTML = `<td><div class="bomcat">${esc(l.category)}</div>${url ? link(url, esc(l.name)) : esc(l.name)}${note ? ` · <span style="color:var(--mute)">${esc(note)}</span>` : ""}<div style="color:var(--mute);font-size:11px">${esc(l.spec)}</div></td><td class="n">${l.qty}</td><td class="n">$${l.unit_cost}</td><td class="n">$${l.subtotal}</td>`;
    tb.append(tr);
  }
  tbl.append(tb); box.append(tbl);
  box.append(el("div", "hint", `Tier: ${bom.tier}. Street prices from the linked suppliers; check before ordering.`));
  for (const w of bom.warnings ?? []) box.append(el("div", "bomwarn", "⚠ " + w));
  renderDesign(state.robot?.metadata?.design);
}
const link = (url, text) => `<a href="${encodeURI(url)}" target="_blank" rel="noopener">${text}</a>`;
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** Engineering record of a designed robot: what it can do, how each motor was sized, every check. */
function renderDesign(d) {
  const box = $("#bom");
  if (!d) return;
  const sec = el("div", "design");
  const perf = Object.entries(d.performance ?? {}).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td class="n">${esc(v)}</td></tr>`).join("");
  const joints = (d.joints ?? []).map((j) => `<tr><td>${esc(j.joint)}</td><td>${esc(j.actuator)}</td><td class="n">${j.required_nm}</td><td class="n">${j.rated_nm} / ${j.peak_nm}</td><td class="n">${j.margin}x</td><td class="n">${j.speed_rad_s}</td></tr>`).join("");
  const checks = (d.checks ?? []).map((c) => `<li class="${c.pass ? "ok" : "bad"}">${c.pass ? "✓" : "✗"} <b>${esc(c.name)}</b> — ${esc(c.detail)}</li>`).join("");
  const printed = (d.printed ?? []).map((p) => `<li>${esc(p.name)}: ${p.check.bbox_mm.join(" × ")} mm, ${Math.round(p.mass_kg * 1000)} g${p.check.fits_bed ? "" : " — <b>too big for the bed</b>"}</li>`).join("");
  sec.innerHTML = `<div class="panel-h">Engineering</div><div class="hint">${esc(d.summary)}</div>
    <table class="bomtable"><tbody>${perf}</tbody></table>
    ${joints ? `<div class="panel-h">Actuator sizing</div><table class="bomtable"><thead><tr><th>Joint</th><th>Actuator</th><th>Peak need N·m</th><th>Rated / peak</th><th>Margin</th><th>rad/s loaded</th></tr></thead><tbody>${joints}</tbody></table>` : ""}
    <div class="panel-h">Checks</div><ul class="checks">${checks}</ul>
    <div class="panel-h">Printed parts (${d.printed?.length ?? 0})</div><ul class="checks">${printed}</ul>
    ${(d.assumptions ?? []).length ? `<div class="panel-h">Assumptions</div><ul class="checks">${d.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}`;
  box.append(sec);
}
async function refreshBom() {
  if (!state.robot) return;
  const v = $("#budget").value;
  try { const { bom } = await api("/api/robots/bom", { robot: state.robot, budget: v === "" ? undefined : Number(v) }); state.bom = bom; renderBom(bom); }
  catch { /* keep last */ }
}
function bomMarkdown(bom) {
  let md = `# Bill of Materials — ${bom.robot_name}\n\n**Total: $${bom.total}** · tier ${bom.tier}` + (bom.budget != null ? ` · budget $${bom.budget} ${bom.feasible ? "(within)" : "(OVER)"}` : "") + "\n\n| Category | Component | Qty | Unit $ | Subtotal $ | Spec |\n|---|---|--:|--:|--:|---|\n";
  for (const l of bom.lines) md += `| ${l.category} | ${l.name}${l.note ? " ("+l.note+")" : ""} | ${l.qty} | ${l.unit_cost} | ${l.subtotal} | ${l.spec} |\n`;
  return md;
}

function renderDiff(lines) {
  const box = $("#diff"); box.innerHTML = "";
  if (!lines || !lines.length) return;
  box.append(el("div", null, "ROBOT CHANGES"));
  for (const ln of lines) {
    const c = ln.startsWith("+") ? "add" : ln.startsWith("-") ? "del" : ln.startsWith("~") ? "chg" : /^[!?]/.test(ln) ? "warn" : "";
    box.append(el("div", c, ln));
  }
}

// ---------------- status log ----------------
function status(lines, kind) {
  const box = $("#status"); box.className = "status show" + (kind === "err" ? " err" : "");
  box.textContent = Array.isArray(lines) ? lines.join("\n") : lines;
  if (kind === "err") toast(box.textContent, "err");
}
let toastTimer;
function toast(text, kind) {
  const t = $("#toast"); t.textContent = text; t.className = "show" + (kind === "err" ? " err" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ""; }, kind === "err" ? 5200 : 2400);
}
/** The robot steps out of the flash, centred on the model. */
function reveal(strong) {
  const r = viewport.getBoundingClientRect();
  transformFlash(renderer.domElement, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, strong);
}
function checksToText(res) {
  const out = [...(res.summary ? ["→ Interpreted as: " + res.summary] : []), ...(res.validation?.checks ?? []), ...(res.urdfValidation?.checks ?? [])];
  for (const w of res.warnings ?? []) out.push("⚠ " + w);
  for (const r of res.repairs ?? []) out.push("↻ " + r);
  return out;
}

// ---------------- API ----------------
async function api(path, body) {
  const res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}

function applyResult(res, label, diffLines) {
  state.robot = res.robot; state.urdf = res.urdf; state.xacro = res.xacro; state.id = res.id ?? state.id;
  if (state.id && !STATIC) history.replaceState(null, "", `/r/${state.id}`);
  state.jointValues = { ...(res.robot?.metadata?.design?.home ?? {}) }; // designed robots open in their ready pose
  state.versions.push({ id: state.id, label, robot: res.robot, urdf: res.urdf, xacro: res.xacro });
  state.version = state.versions.length - 1;
  state.selection = null;
  state.bom = res.bom ?? null;
  revealNext = revealNext ?? "soft";
  document.body.classList.remove("busy");
  buildRobot(res.robot); renderTree(); renderSliders(); renderInspector(); renderHistory(); renderDiff(diffLines); renderBom(state.bom);
  renderCards();
  status(checksToText(res));
}

function loadVersion(i) {
  const v = state.versions[i]; if (!v) return;
  state.version = i; state.id = v.id; state.robot = v.robot; state.urdf = v.urdf; state.xacro = v.xacro; state.jointValues = { ...(v.robot?.metadata?.design?.home ?? {}) }; state.selection = null;
  buildRobot(v.robot); renderTree(); renderSliders(); renderInspector(); renderHistory(); renderCards();
}

async function doGenerate(prompt) {
  if (!prompt.trim()) return;
  setBusy($("#genbtn"), true); document.body.classList.add("busy"); revealNext = "strong";
  const family = FAMILIES.findIndex((f) => f.prompt === prompt);
  if (family >= 0) familyDial.go(family, { silent: true });   // chips and the bar keep the ring honest
  if (!first) sheet.go("peek");   // on phones, get out of the way of the reveal
  first = false;
  try {
    if (state.arduino) await doArduino(prompt);
    else { const res = await api("/api/robots/generate", { prompt }); state.versions = []; applyResult(res, prompt.slice(0, 40)); }
  }
  catch (e) { revealNext = null; status("✗ " + e.message, "err"); }
  finally { setBusy($("#genbtn"), false, "Generate"); document.body.classList.remove("busy"); }
}

// ---------------- Arduino mode: price tiers ----------------
async function doArduino(prompt) {
  status("Designing Arduino versions… (each option is a complete, checked design; this takes a few seconds)");
  const r = await api("/api/arduino", { prompt });
  state.tiers = r.options ?? [];
  const box = $("#tiers"); box.replaceChildren();
  $("#tierNotes").textContent = (r.notes ?? []).join("  ·  ");
  if (!state.tiers.length) { $("#tierDial").hidden = true; box.append(el("div", "hint", "No Arduino version of this robot yet.")); jump("arduino"); return; }
  state.tiers.forEach((o, i) => {
    const b = el("button", "tier"); b.type = "button"; b.style.setProperty("--k", i);
    const price = el("div", "price", "$" + Math.round(o.cost_usd)); price.append(el("small", null, o.tier));
    const pill = el("span", "pill " + (o.failing.length ? "red" : o.over_budget ? "red" : "green"), o.failing.length ? `${o.failing.length} check${o.failing.length > 1 ? "s" : ""} fail` : o.over_budget ? "over budget" : "works");
    b.append(price, pill, el("div", "label", o.label));
    b.onclick = () => selectTier(i);
    box.append(b);
  });
  state.versions = [];
  const start = Math.max(0, state.tiers.findIndex((o) => !o.failing.length && !o.over_budget));
  // a turning ring needs at least two stops; a single option is just its card
  $("#tierDial").hidden = state.tiers.length < 2;
  if (state.tiers.length > 1) {
    tierDial = new Dial($("#tierDial"), { label: "Price tier",
      stops: state.tiers.map((o) => ({ big: "$" + Math.round(o.cost_usd), label: o.tier })),
      coreLabel: (s) => `${s.label}, ${s.big}`,
      onSettle: (i) => selectTier(i).catch((e) => status("✗ " + e.message, "err")),
      onPress: (i) => selectTier(i).catch((e) => status("✗ " + e.message, "err")) });
    tierDial.go(start, { silent: true });
  }
  await selectTier(start);
  jump("arduino");
}
async function selectTier(i) {
  const o = state.tiers?.[i]; if (!o) return;
  document.querySelectorAll(".tier").forEach((t, k) => t.classList.toggle("sel", k === i));
  if (tierDial && tierDial.index !== i) tierDial.go(i, { silent: true });
  const res = await api("/api/robots/import", { robot: o.robot });
  applyResult({ ...res, summary: o.summary, warnings: o.failing.length ? [`failing checks: ${o.failing.join(", ")}`] : [] }, `${o.tier}: $${Math.round(o.cost_usd)}`);
}

// ---------------- summary cards: cost, stats, checks chart ----------------
function renderCards() {
  const r = state.robot, d = r?.metadata?.design;
  $("#robotName").textContent = r ? r.robot_name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";
  document.title = r ? `${r.robot_name.replace(/_/g, " ")} · Text to Robot` : "Text to Robot";
  const cost = d?.performance?.cost_usd ?? state.bom?.total;
  $("#costBig").textContent = cost != null ? "$" + Number(cost).toFixed(0) : "—";
  $("#costPill").textContent = d?.performance?.tier_label ?? (d ? "designed" : r ? "template" : "");
  $("#costSub").textContent = d ? d.summary : r ? "Template robot (not sized from real parts)." : "Generate a robot to see what it costs to build.";
  const stats = [];
  if (d?.performance?.mass_kg != null) stats.push([`${Number(d.performance.mass_kg).toFixed(2)} kg`, "mass"]);
  if (d) stats.push([String(d.printed.length), "printed parts"], [String(d.purchased.reduce((n, p) => n + p.qty, 0)), "bought parts"]);
  else if (r) stats.push([String(r.links.length), "links"], [String(r.joints.filter((j) => j.type !== "fixed").length), "joints"]);
  $("#statRow").replaceChildren(...stats.map(([v, k]) => { const s = el("div", "stat"); s.append(el("b", null, v), el("span", null, k)); return s; }));
  // checks: margins per actuated joint as a lollipop chart, then every named check
  const chart = $("#checksChart"); chart.replaceChildren();
  const joints = d?.joints ?? [];
  const maxM = Math.max(1.5, ...joints.map((j) => Math.min(j.margin, 6)));
  for (const j of joints) {
    const m = Math.min(j.margin, 6), bar = el("div", "bar" + (j.margin < 1 ? " bad" : "")), i = el("i");
    i.style.height = `${Math.max(6, (m / maxM) * 100)}%`; bar.title = `${j.joint}: ${j.margin}x margin (${j.actuator})`; bar.onclick = () => toast(bar.title); bar.append(i); chart.append(bar);
  }
  const checks = d?.checks ?? [], bad = checks.filter((c) => !c.pass);
  $("#checksPill").textContent = checks.length ? (bad.length ? `${bad.length} failing` : `all ${checks.length} pass`) : "";
  $("#checksPill").className = "pill " + (checks.length ? (bad.length ? "red" : "green") : "");
  const list = $("#checksList"); list.replaceChildren();
  for (const c of [...bad, ...checks.filter((x) => x.pass)].slice(0, 60)) {
    const row = el("div", "check"); row.append(el("span", c.pass ? "ok" : "no", c.pass ? "✓" : "✗"));
    const t = el("div"); t.append(el("b", null, c.name + " "), document.createTextNode(c.detail)); row.append(t); list.append(row);
  }
  if (!checks.length) list.append(el("div", "hint", r ? "Template robots carry no engineering checks: switch on Arduino or describe a designed robot." : ""));
}

// ---------------- navigation ----------------
const PANES = ["design", "arduino", "model", "build", "share"];
function jump(section) {
  const i = PANES.indexOf(section), pane = document.querySelector(`.pane[data-section="${section}"]`);
  if (!pane) return;
  $("#dock").style.setProperty("--i", i);
  document.querySelectorAll(".dock-btn").forEach((b) => {
    const on = b.dataset.jump === section; b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  sheet.atLeast("half");
  if (pane.classList.contains("active")) return;
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p === pane));
  $("#panes").scrollTop = 0;
  popIn(pane);
}

// ---------------- publish (opt-in) and gallery ----------------
const REPO = "megazron/text-to-robot";
async function publish() {
  if (!state.robot) return;
  const link = STATIC ? await STATIC.shareUrl(state.robot) : `${location.origin}/r/${state.id}`;
  const d = state.robot.metadata?.design;
  const title = `[gallery] ${state.robot.robot_name.replace(/_/g, " ")}`;
  const body = `${d?.summary ?? state.robot.metadata?.source_prompt ?? ""}\n\nOpen it: ${link}\n\n(Posted from the Text to Robot page. Edit or close this issue to change or remove it.)`;
  if (link.length > 7000) { status("This design is too large for a gallery post link; download the JSON and attach it to a post instead.", "err"); return; }
  window.open(`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
}
async function loadGallery() {
  const box = $("#gallery"); box.replaceChildren(el("div", "empty", "Loading…"));
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=60`);
    const items = (await r.json()).filter((i) => typeof i.title === "string" && i.title.startsWith("[gallery]"));
    box.replaceChildren();
    if (!items.length) box.append(el("div", "empty", "Nothing published yet. Press “Publish to gallery” to be the first."));
    for (const it of items) {
      const link = /https?:\/\/\S+#robot=[A-Za-z0-9_-]+/.exec(it.body ?? "")?.[0];
      const a = el("a", "item"); a.style.animationDelay = `${box.children.length * 40}ms`; a.href = link ?? it.html_url; a.target = "_blank"; a.rel = "noopener";
      a.append(el("b", null, it.title.replace(/^\[gallery\]\s*/, "")), el("small", null, `by ${it.user?.login ?? "someone"} · ${new Date(it.created_at).toLocaleDateString()}`));
      box.append(a);
    }
  } catch { box.replaceChildren(el("div", "empty", "Could not reach GitHub for the gallery.")); }
}
async function doModify(instruction) {
  if (!state.robot || !instruction.trim()) return;
  setBusy($("#modbtn"), true); revealNext = "soft"; sheet.go("peek");
  try { const res = await api("/api/robots/modify", { robot: state.robot, instruction }); applyResult(res, instruction.slice(0, 40), res.changes ?? res.diff?.lines); }
  catch (e) { status("✗ " + e.message, "err"); }
  finally { setBusy($("#modbtn"), false, "Modify"); }
}
function setBusy(btn, busy, label) {
  btn.disabled = busy; btn.setAttribute("aria-busy", String(busy));
  if (btn.closest(".list")) return;   // list rows keep their label and pulse their icon
  if (busy) btn.innerHTML = '<span class="spin" aria-hidden="true"></span>'; else btn.textContent = label;
}

// ---------------- downloads ----------------
async function handleDownload(kind) {
  if (!state.robot) return;
  const name = state.robot.robot_name;
  if (kind === "urdf") return download(`${name}.urdf`, state.urdf, "application/xml");
  if (kind === "xacro") return download(`${name}.urdf.xacro`, state.xacro, "application/xml");
  if (kind === "json") return download(`${name}.json`, JSON.stringify(state.robot, null, 2), "application/json");
  if (kind === "bom") { const bom = state.bom ?? (await api("/api/robots/bom", { robot: state.robot })).bom; return download(`${name}_BOM.md`, bomMarkdown(bom), "text/markdown"); }
  if (kind === "cad") { const { files } = await api("/api/robots/cad", { robot: state.robot }); return download(`${name}_cad.zip`, makeZip(files)); }
  if (kind === "train") { const { files } = await api("/api/robots/training", { robot: state.robot }); return download(`${name}_training.zip`, makeZip(files)); }
  if (kind === "share") {
    if (!state.id) return;
    const url = STATIC ? await STATIC.shareUrl(state.robot) : `${location.origin}/r/${state.id}`;
    // phones get the system share sheet; everywhere else the link goes to the clipboard
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: "Text to Robot", url }); } catch (e) { if (e.name !== "AbortError") throw e; }
      return;
    }
    await navigator.clipboard.writeText(url); flash($("[data-dl=share]"), "Link copied"); toast("Link copied. The design travels inside it."); return;
  }
  if (kind === "launch") { await navigator.clipboard.writeText(`ros2 launch ${name} display.launch.py`); flash($("[data-dl=launch]"), "Copied"); return; }
  if (kind === "ros2") {
    const { files } = await api("/api/robots/export", { robot: state.robot, ros2_control: true });
    download(`${name}_ros2.zip`, makeZip(files));
  }
}
function flash(btn, txt) { const t = btn.querySelector(".t b") ?? btn.querySelector(".t") ?? btn, old = t.textContent; t.textContent = txt; haptic(10); setTimeout(() => (t.textContent = old), 1200); }

// ---------------- tabs ----------------
function setTab(name) {
  const pick = document.querySelector(`.tab[data-tab="${name}"]`), seg = pick.parentElement;
  [...seg.children].forEach((t, i) => {
    const on = t === pick; t.classList.toggle("active", on); t.setAttribute("aria-selected", String(on));
    if (on) seg.style.setProperty("--i", i);
    const pane = $("#tab-" + t.dataset.tab); pane.classList.toggle("active", on);
    if (on) popIn(pane, { y: 6, duration: 260 });
  });
}

// ---------------- wiring ----------------
$("#genform").onsubmit = (e) => { e.preventDefault(); doGenerate($("#prompt").value); };
$("#modform").onsubmit = (e) => { e.preventDefault(); doModify($("#modify").value); };
document.querySelectorAll(".seg").forEach((s) => { s.style.setProperty("--n", s.children.length); [...s.children].forEach((t) => t.setAttribute("aria-selected", String(t.classList.contains("active")))); });
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => { haptic(6); setTab(t.dataset.tab); }));
document.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => {
  if (!state.robot) return toast("Generate a robot first.");
  b.setAttribute("aria-busy", "true");
  try { await handleDownload(b.dataset.dl); }
  catch (e) { toast("✗ " + e.message, "err"); }
  finally { b.removeAttribute("aria-busy"); }
}));
for (const id of ["#showCollision", "#showAxes", "#showFrames"]) $(id).onchange = () => { if (state.robot) buildRobot(state.robot); };
$("#resetView").onclick = frameRobot;
function setArduino(on) {
  state.arduino = on; haptic(10);
  document.querySelectorAll("[data-arduino]").forEach((b) => { if (b.getAttribute("role") === "switch") b.setAttribute("aria-checked", String(on)); else b.hidden = !on; });
  toast(on ? "Arduino mode on. Press Generate for price tiers." : "Arduino mode off.");
}
document.querySelectorAll("[data-arduino]").forEach((b) => (b.onclick = () => setArduino(!state.arduino)));
document.querySelectorAll(".dock-btn").forEach((b) => (b.onclick = () => { haptic(6); jump(b.dataset.jump); }));
$("#publishBtn").onclick = publish;
$("#loadGallery").onclick = loadGallery;
$("#importRobot").onclick = () => $("#robotFile").click();
$("#robotFile").onchange = async (event) => {
  const file=event.target.files[0];if(!file)return;
  const button=$("#importRobot");setBusy(button,true);
  try {
    if(file.size>3_900_000)throw new Error("Robot JSON must be smaller than 3.9 MB");
    const robot=JSON.parse(await file.text());
    const result=await api("/api/robots/import",{robot});applyResult(result,`Imported ${file.name}`);
  }catch(error){status("✗ "+error.message,"err");}
  finally {setBusy(button,false,"Import JSON");event.target.value="";}
};
$("#budget").oninput = () => { clearTimeout(window.__bt); window.__bt = setTimeout(refreshBom, 350); };

// ---------------- the dial: choose a body, press the core ----------------
const FAMILIES = [
  { label: "Arm", icon: "f-arm", prompt: "Create a 6 DOF robotic arm with a parallel gripper" },
  { label: "Car", icon: "f-car", prompt: "An obstacle avoiding robot car" },
  { label: "Tracked", icon: "f-track", prompt: "WALL-E" },
  { label: "Quadruped", icon: "f-quad", prompt: "Create a quadruped robot" },
  { label: "Humanoid", icon: "f-human", prompt: "Create a small humanoid robot" },
  { label: "SCARA", icon: "f-scara", prompt: "Create a SCARA robot" },
  { label: "Suit", icon: "f-suit", prompt: "Iron Man Mark 43 suit" },
];
let dialPrompt = "";   // what the dial last wrote, so it never overwrites words the user typed
const familyDial = new Dial($("#familyDial"), { label: "Robot family", stops: FAMILIES,
  coreLabel: (s) => `Build a ${s.label}`,
  onChange: (i) => { const p = $("#prompt"); if (!p.value || p.value === dialPrompt) p.value = dialPrompt = FAMILIES[i].prompt; },
  onPress: (i) => { const prompt = FAMILIES[i].prompt; $("#prompt").value = dialPrompt = prompt; doGenerate(prompt); } });

const EXAMPLES = [
  "Create a 6 DOF robotic arm with a parallel gripper",
  "An obstacle avoiding robot car",
  "WALL-E",
  "Iron Man Mark 43 suit",
  "Create a quadruped robot",
  "Create a small humanoid robot",
  "Create a SCARA robot",
];
function initExamples() {
  const box = $("#examples");
  for (const ex of EXAMPLES) { const b = el("button", null, ex); b.type = "button"; b.onclick = () => { $("#prompt").value = ex; doGenerate(ex); }; box.append(b); }
}
async function initTemplates() {
  try {
    const { templates } = await (await fetch("/api/templates")).json();
    const box = $("#templates");
    for (const t of templates) { const b = el("button", null, t.title); b.type = "button"; b.title = t.description; b.onclick = () => { $("#prompt").value = "Create a " + t.title; doGenerate("Create a " + t.title); }; box.append(b); }
  } catch {}
}
async function initMode() {
  try { await (await fetch("/api/status")).json(); const badge = $("#mode"); badge.textContent = "Free · local"; badge.title = "No account, tokens or external inference"; } catch {}
}

// the icon link is relative, which on a /r/<id> share page would point inside /r/
document.querySelector('link[rel="icon"]').href = new URL("./mark.svg", import.meta.url).href;
followKeyboard();
initExamples(); initTemplates(); initMode();
(async () => {
  if (STATIC && location.hash.includes("robot=")) {
    try { const robot = await STATIC.sharedRobot(); history.replaceState(null, "", location.pathname); applyResult(await api("/api/robots/import", { robot }), "shared robot"); return; }
    catch { status("\u2717 shared robot link is damaged; generating a default", "err"); }
  }
  const m = location.pathname.match(/^\/r\/([0-9a-f-]{8,})$/i);
  if (m) {
    try {
      const r = await fetch(`/api/robots/${m[1]}`); if (!r.ok) throw new Error("not found");
      const d = await r.json();
      const gen = await api("/api/robots/bom", { robot: d.robot }).catch(() => ({ bom: null }));
      applyResult({ ...d, validation: { checks: ["\u2713 Loaded shared robot"] }, urdfValidation: { checks: [] }, warnings: [], repairs: [], bom: gen.bom }, "shared robot");
      return;
    } catch { status("\u2717 shared robot not found; generating a default", "err"); }
  }
  doGenerate("Create a 6 DOF robotic arm with a parallel gripper");
})();
window.__ttr = { get preview() { return { ...preview, parts: [...state.meshes].filter(([name]) => state.robot.links.find(l => l.name === name)?.geometry.type === 'mesh').map(([name, group]) => ({ name, loaded: !!group.children[0].userData.meshLoaded, triangles: group.children[0].geometry.getAttribute('position').count / 3 })) }; }, camera, controls, frameRobot, get robot(){return state.robot} };
