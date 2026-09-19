import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { forwardKinematics, findRoot, download, makeZip } from "./robotkit.js";

const API = ""; // same origin
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
scene.background = new THREE.Color(0x0a0c0f);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.up.set(0, 0, 1);
camera.position.set(0.9, -0.9, 0.7);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.target.set(0, 0, 0.25);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20242b, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, -2, 3); scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.4); fill.position.set(-2, 1, 1); scene.add(fill);

const grid = new THREE.GridHelper(4, 40, 0x2a3340, 0x1a2028); grid.rotation.x = Math.PI / 2; scene.add(grid);
const robotGroup = new THREE.Group(); scene.add(robotGroup);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h); // updates CSS size too; without it HiDPI (DPR 2) canvases overflow the layout
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport); resize();
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

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
    preview.loaded++;
  } catch (error) {
    if (revision !== previewRevision) return;
    preview.errors.push(`${g.file}: ${error.message}`);
    mesh.material.color.set(0xff3366); mesh.material.wireframe = true;
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
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color, metalness: l.material?.startsWith("mk43_") ? 0.65 : 0.25, roughness: l.material?.startsWith("mk43_") ? 0.30 : 0.55, transparent: isCol, opacity: isCol ? 0.45 : 1, wireframe: isCol }));
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
  drawHelpers(world);
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
  const dist = (r / Math.sin(fov / 2)) * 1.25;
  const dir = new THREE.Vector3(1, -1.1, 0.65).normalize();
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  controls.target.copy(sphere.center);
  camera.near = Math.max(0.001, dist / 200);
  camera.far = dist * 200;
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------- selection ----------------
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
renderer.domElement.addEventListener("pointerdown", (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(robotGroup.children, true).filter((h) => h.object.userData.linkName);
  if (hits.length) selectLink(hits[0].object.userData.linkName);
});

function selectLink(name) {
  state.selection = { kind: "link", name };
  highlight(); renderTree(); renderInspector();
  setTab("inspector");
}
function selectJoint(name) { state.selection = { kind: "joint", name }; renderTree(); renderInspector(); setTab("inspector"); }

function highlight() {
  for (const [name, group] of state.meshes) {
    const mesh = group.children[0];
    if (!mesh.material.emissive) continue;
    mesh.material.emissive = new THREE.Color(state.selection?.kind === "link" && state.selection.name === name ? 0x2a4a7a : 0x000000);
  }
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
      Dimensions: l.geometry.type === "box" ? vec(l.geometry.size) : l.geometry.type === "sphere" ? "r=" + f3(l.geometry.radius) : "r=" + f3(l.geometry.radius) + " l=" + f3(l.geometry.length),
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
    const upd = () => { state.jointValues[j.name] = parseFloat(s.value); val.textContent = parseFloat(s.value).toFixed(2) + unit; updateFK(); if (state.selection?.kind === "joint" && state.selection.name === j.name) renderInspector(); };
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
    tr.innerHTML = `<td><div class="bomcat">${l.category}</div>${l.name}${l.note ? ` · <span style="color:var(--mute)">${l.note}</span>` : ""}<div style="color:var(--mute);font-size:11px">${l.spec}</div></td><td class="n">${l.qty}</td><td class="n">$${l.unit_cost}</td><td class="n">$${l.subtotal}</td>`;
    tb.append(tr);
  }
  tbl.append(tb); box.append(tbl);
  box.append(el("div", "hint", `Tier: ${bom.tier}. Estimates for planning, not quotes.`));
  for (const w of bom.warnings ?? []) box.append(el("div", "bomwarn", "⚠ " + w));
}
async function refreshBom() {
  if (!state.robot) return;
  const v = $("#budget").value;
  try { const { bom } = await api("/api/robots/bom", { robot: state.robot, budget: v === "" ? undefined : Number(v) }); state.bom = bom; renderBom(bom); }
  catch (e) { /* keep last */ }
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
    const c = ln.startsWith("+") ? "add" : ln.startsWith("-") ? "del" : ln.startsWith("~") ? "chg" : "";
    box.append(el("div", c, ln));
  }
}

// ---------------- status log ----------------
function status(lines, kind) {
  const box = $("#status"); box.className = "status show" + (kind === "err" ? " err" : "");
  box.textContent = Array.isArray(lines) ? lines.join("\n") : lines;
}
function checksToText(res) {
  const out = [...(res.validation?.checks ?? []), ...(res.urdfValidation?.checks ?? [])];
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
  if (state.id) history.replaceState(null, "", `/r/${state.id}`);
  state.jointValues = {};
  state.versions.push({ id: state.id, label, robot: res.robot, urdf: res.urdf, xacro: res.xacro });
  state.version = state.versions.length - 1;
  state.selection = null;
  state.bom = res.bom ?? null;
  buildRobot(res.robot); renderTree(); renderSliders(); renderInspector(); renderHistory(); renderDiff(diffLines); renderBom(state.bom);
  status(checksToText(res));
}

function loadVersion(i) {
  const v = state.versions[i]; if (!v) return;
  state.version = i; state.id = v.id; state.robot = v.robot; state.urdf = v.urdf; state.xacro = v.xacro; state.jointValues = {}; state.selection = null;
  buildRobot(v.robot); renderTree(); renderSliders(); renderInspector(); renderHistory();
}

async function doGenerate(prompt) {
  if (!prompt.trim()) return;
  setBusy($("#genbtn"), true);
  try { const res = await api("/api/robots/generate", { prompt }); state.versions = []; applyResult(res, prompt.slice(0, 40)); }
  catch (e) { status("✗ " + e.message, "err"); }
  finally { setBusy($("#genbtn"), false, "Generate Robot"); }
}
async function doModify(instruction) {
  if (!state.robot || !instruction.trim()) return;
  setBusy($("#modbtn"), true);
  try { const res = await api("/api/robots/modify", { robot: state.robot, instruction }); applyResult(res, instruction.slice(0, 40), res.changes ?? res.diff?.lines); }
  catch (e) { status("✗ " + e.message, "err"); }
  finally { setBusy($("#modbtn"), false, "Modify"); }
}
function setBusy(btn, busy, label) { btn.disabled = busy; if (busy) btn.innerHTML = '<span class="spin">↻</span>'; else btn.textContent = label; }

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
  if (kind === "share") { if (!state.id) return; await navigator.clipboard.writeText(`${location.origin}/r/${state.id}`); flash($("[data-dl=share]"), "link copied!"); return; }
  if (kind === "launch") { await navigator.clipboard.writeText(`ros2 launch ${name} display.launch.py`); flash($("[data-dl=launch]"), "copied!"); return; }
  if (kind === "ros2") {
    const { files } = await api("/api/robots/export", { robot: state.robot, ros2_control: true });
    download(`${name}_ros2.zip`, makeZip(files));
  }
}
function flash(btn, txt) { const old = btn.textContent; btn.textContent = txt; setTimeout(() => (btn.textContent = old), 1200); }

// ---------------- tabs ----------------
function setTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}

// ---------------- wiring ----------------
$("#genform").onsubmit = (e) => { e.preventDefault(); doGenerate($("#prompt").value); };
$("#modform").onsubmit = (e) => { e.preventDefault(); doModify($("#modify").value); };
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => setTab(t.dataset.tab)));
document.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = () => handleDownload(b.dataset.dl)));
for (const id of ["#showCollision", "#showAxes", "#showFrames"]) $(id).onchange = () => { if (state.robot) buildRobot(state.robot); };
$("#resetView").onclick = frameRobot;
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

const EXAMPLES = [
  "Create a 6 DOF robotic arm with a parallel gripper",
  "Create a 7 DOF robotic arm with a two-finger gripper",
  "Create a small humanoid robot with a torso, head and two 7 DOF arms",
  "Create a differential drive mobile robot",
  "Create a quadruped robot",
  "Create a SCARA robot",
];
function initExamples() {
  const box = $("#examples");
  for (const ex of EXAMPLES) { const b = el("button", null, ex); b.onclick = () => { $("#prompt").value = ex; doGenerate(ex); }; box.append(b); }
}
async function initTemplates() {
  try {
    const { templates } = await (await fetch("/api/templates")).json();
    const box = $("#templates");
    for (const t of templates) { const b = el("button", null, t.title); b.title = t.description; b.onclick = () => { $("#prompt").value = "Create a " + t.title; doGenerate("Create a " + t.title); }; box.append(b); }
  } catch {}
}
async function initMode() {
  try { const s = await (await fetch("/api/status")).json(); const badge = $("#mode"); badge.textContent = "Free · local"; badge.title = "No account, tokens or external inference"; } catch {}
}

initExamples(); initTemplates(); initMode();
(async () => {
  const m = location.pathname.match(/^\/r\/([0-9a-f-]{8,})$/i);
  if (m) {
    try {
      const r = await fetch(`/api/robots/${m[1]}`); if (!r.ok) throw new Error("not found");
      const d = await r.json();
      const gen = await api("/api/robots/bom", { robot: d.robot }).catch(() => ({ bom: null }));
      applyResult({ ...d, validation: { checks: ["\u2713 Loaded shared robot"] }, urdfValidation: { checks: [] }, warnings: [], repairs: [], bom: gen.bom }, "shared robot");
      return;
    } catch (e) { status("\u2717 shared robot not found; generating a default", "err"); }
  }
  doGenerate("Create a 6 DOF robotic arm with a parallel gripper");
})();
window.__ttr = { get preview() { return { ...preview, parts: [...state.meshes].filter(([name]) => state.robot.links.find(l => l.name === name)?.geometry.type === 'mesh').map(([name, group]) => ({ name, loaded: !!group.children[0].userData.meshLoaded, triangles: group.children[0].geometry.getAttribute('position').count / 3 })) }; }, camera, controls, frameRobot, get robot(){return state.robot} };
