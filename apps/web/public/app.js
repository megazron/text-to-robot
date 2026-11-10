import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { forwardKinematics, findRoot, download, makeZipDeflated } from "./robotkit.js";
import { Dial, Sheet, followKeyboard, haptic, popIn, transformFlash } from "./ui.js";
import { h, safeHttpUrl, safeJsonParse, MAX_PROMPT_CHARS, MAX_ROBOT_BYTES } from "./safe.js";
import { createElectronics } from "./electronics3d.js";
import { createMotion } from "./motion.js";

// Clickjacking guard: GitHub Pages cannot send frame-ancestors or X-Frame-Options, so a page that frames this site gets
// a link to open it in its own tab instead of a working (and invisible-overlay-able) copy.
if (window.top !== window.self) {
  document.body.replaceChildren(h("p", { class: "framed" }, h("a", { href: location.href, target: "_blank", rel: "noopener" }, "Open Text to Robot in its own tab")));
  throw new Error("Text to Robot does not run inside a frame");
}
const API = ""; // same origin
let revealNext = null, first = true, tierDial = null;
const STATIC = globalThis.ttrStatic; // GitHub Pages build: generator runs in this tab, see apps/web/src/browser-api.ts
const $ = (s) => document.querySelector(s);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

// ---------------- state ----------------
const state = {
  robot: null, urdf: "", xacro: "", jointValues: {},
  versions: [], version: -1, selection: null, meshes: new Map(), axisHelpers: [], frameHelpers: [], bom: null, id: null,
  /** how this robot was made, if from the prompt bar: { p: prompt, a?: Arduino tiers, t?: tier, m?: [changes] }; a gallery link replays it */
  recipe: null,
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
let motionUI = null;   // motion.js: playback, posing, recording
(function loop() { requestAnimationFrame(loop); controls.update(); if (motionUI?.tick(performance.now())) dirty = true; if (dirty) { dirty = false; renderer.render(scene, camera); } })();

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
  resetElectronics();
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
  drawHelpers(world); electronics?.update(); invalidate();
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
  const ex = electronics?.pick(raycaster);
  if (ex?.wire) { focusNet(focusedNet === ex.wire.net ? null : ex.wire.net); return; }
  const hits = raycaster.intersectObjects(robotGroup.children, true).filter((h) => h.object.userData.linkName && h.object.visible);
  if (hits.length) selectLink(hits[0].object.userData.linkName);
});

// ---------------- electronics and harness in 3D ----------------
// the engine's electronics3d answer for this robot, drawn on the robot's links; Robot keeps it hidden
let electronics = null, electronicsFor = null, viewMode = "robot", focusedNet = null;
async function setViewMode(m) {
  viewMode = m;
  for (const b of document.querySelectorAll(".viewmode")) { const on = b.dataset.mode === m; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); }
  if (m !== "robot" && state.robot && electronicsFor !== state.robot) {
    const robot = state.robot;
    try {
      const data = await api("/api/engine/electronics3d", { robot });
      if (robot !== state.robot) return;
      electronics?.dispose(); electronics = createElectronics(THREE, { root: robotGroup, links: state.meshes, data, robotMeshes: () => state.meshes }); electronicsFor = robot;
      const sel = $("#railFilter"); sel.replaceChildren(el("option", "", "All wires")); sel.options[0].value = "all";
      for (const r of data.rails) { const o = el("option", "", `${r.name} ${+r.voltage_v.toFixed(2)} V`); o.value = r.name; sel.append(o); }
      for (const [v, t] of [["signal", "Signals and buses"], ["ground", "Ground"]]) { const o = el("option", "", t); o.value = v; sel.append(o); }
    } catch (e) { toast(`Electronics view: ${e.message}`, "err"); return; }
  }
  $("#railFilter").hidden = m === "robot" || !electronics;
  electronics?.setMode(m); electronics?.update(true);
  // the first time the electronics show for this robot, the camera moves in on them
  if (m !== "robot" && electronics && !electronics.framed) { electronics.framed = true; frameOn(electronics.bounds()); }
  invalidate();
}
function frameOn(box) {
  if (box.isEmpty()) return;
  robotGroup.updateMatrixWorld(true);
  const b = box.clone().applyMatrix4(robotGroup.matrixWorld), c = b.getCenter(new THREE.Vector3()), r = Math.max(0.05, b.getSize(new THREE.Vector3()).length() / 2);
  const dir = camera.position.clone().sub(controls.target).normalize(), d = r / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, d); controls.update(); invalidate();
}
for (const b of document.querySelectorAll(".viewmode")) b.addEventListener("click", () => setViewMode(b.dataset.mode));
$("#railFilter").addEventListener("change", (e) => { electronics?.setFilter(e.target.value); invalidate(); });
/** a new robot: the electronics view is rebuilt when it is next shown */
function resetElectronics() { electronics?.dispose(); electronics = null; electronicsFor = null; focusedNet = null; if (viewMode !== "robot") setViewMode(viewMode); }
// hover: what the wire or pin under the pointer carries
renderer.domElement.addEventListener("pointermove", (e) => {
  const tip = $("#wireTip");
  if (!electronics || viewMode === "robot" || e.buttons) { tip.hidden = true; return; }
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = electronics.pick(raycaster);
  if (!hit || hit.type === "part") { tip.hidden = !hit; if (hit) { tip.replaceChildren(el("b", "", hit.inst), document.createTextNode(` ${hit.key}`)); tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px`; } return; }
  const w = hit.wire, pin = hit.type === "pin" ? hit.pin : null;
  tip.replaceChildren(el("b", "", w.net), el("div", "", pin ? `pin ${pin}` : `${w.from} to ${w.to}`),
    el("div", "", `${w.typical_a} A typical, ${w.peak_a} A peak${w.awg ? `, ${w.awg} AWG` : ""}, ${w.color}`), el("div", "", `${w.id}, cut ${w.cut_mm} mm`));
  tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px`; tip.hidden = false;
});
renderer.domElement.addEventListener("pointerleave", () => { $("#wireTip").hidden = true; });
/** one net lit end to end in 3D, and in the schematic and breadboard view when they are open */
function focusNet(net) {
  focusedNet = net; electronics?.highlight(net); markCircuitNet(); invalidate();
}
function markCircuitNet() {
  // the drawings are images (the page's policy allows no markup from strings): the focused net is lit by redrawing the
  // image from the engine's SVG with the stroke of that net's wires, pins and conductors recoloured
  const ws = focusedNet && electronics ? electronics.data.wires.filter((w) => w.net === focusedNet) : [];
  const ids = new Set(ws.flatMap((w) => [w.id, w.id.replace(/[ab]$/, "")])), terms = new Set(ws.flatMap((w) => [w.from, w.to]));
  for (const box of document.querySelectorAll(".circview")) {
    const img = box.querySelector("img.circimg"); if (!img || !box._svg) continue;
    let svg = box._svg;
    if (ws.length) {
      const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
      const nodes = new Set(); for (const m of svg.matchAll(/<[a-z]+\b[^>]*\sdata-pin="[^"]*"[^>]*>/g)) if (terms.has(attr(m[0], "data-pin")) && attr(m[0], "data-node")) nodes.add(attr(m[0], "data-node"));
      svg = svg.replace(/<(path|line|polyline)\b[^>]*>/g, (tag) => {
        const lit = ids.has(attr(tag, "data-wire")) || terms.has(attr(tag, "data-pin")) || (attr(tag, "data-node") && nodes.has(attr(tag, "data-node")) && !attr(tag, "data-wire"));
        if (!lit) return tag;
        const t = tag.replace(/\sstroke="[^"]*"/, "").replace(/\sstroke-width="[^"]*"/, "");
        return t.replace(/^<(\w+)/, '<$1 stroke="#ff2d95" stroke-width="5"');
      });
    }
    if (box._lit === (ws.length ? focusedNet : null)) continue;
    box._lit = ws.length ? focusedNet : null;
    const old = img.src; img.src = svgUrl(svg); if (old.startsWith("blob:") && old !== box.querySelector("a.tonal")?.href) URL.revokeObjectURL(old);
  }
}

motionUI = createMotion({ scene, camera, controls, renderer, robotGroup, state, api, updateFK, invalidate, renderSliders, toast, el, $, highlight });

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
  const box = $("#tree"); box.replaceChildren();
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
  const pane = $("#tab-inspector"); pane.replaceChildren();
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
  const box = $("#sliders"); box.replaceChildren();
  if (!state.robot) return;
  // mimic joints follow their leader; a wearable's limbs are passive (the wearer moves them) but they are posed here too
  const actuated = state.robot.joints.filter((j) => j.type !== "fixed" && !j.mimic && (!j.passive || /shoulder|elbow|hip|knee|neck/.test(j.name) && state.robot.metadata?.design?.doors));
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
  const box = $("#history"); box.replaceChildren();
  state.versions.forEach((v, i) => {
    const card = el("div", "ver" + (i === state.version ? " sel" : ""));
    card.append(el("b", null, `v${i + 1}`), el("small", null, v.label));
    card.onclick = () => loadVersion(i);
    box.append(card);
  });
}

function renderBom(bom) {
  const box = $("#bom"); box.replaceChildren();
  const totalEl = $("#bomtotal");
  if (!bom) { totalEl.textContent = ""; return; }
  const over = bom.budget != null && !bom.feasible;
  totalEl.textContent = (bom.to_buy_total != null ? `$${bom.to_buy_total} to buy` : "$" + bom.total) + (bom.budget != null ? (bom.feasible ? " ✓ within" : " ✗ over") : "");
  totalEl.className = "bomtotal " + (bom.budget == null ? "" : over ? "over" : "ok");
  // built from elements, never from HTML strings: every value here can come from an imported file or a share link
  if (bom.to_buy_total != null) box.append(shoppingBox(bom));
  const tb = h("tbody");
  for (const l of bom.lines) {
    const raw = String(l.note ?? ""), url = safeHttpUrl(raw.match(/https?:\/\/\S+$/)?.[0]), note = url ? raw.slice(0, raw.lastIndexOf("http")).replace(/\s*·\s*$/, "") : raw;
    tb.append(h("tr", null,
      h("td", null, h("div", { class: "bomcat" }, l.category, ownBadge(l)), url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, l.name) : String(l.name),
        note ? [" · ", h("span", { class: "mute" }, note)] : null, h("div", { class: "mute small" }, l.spec)),
      h("td", { class: "n" }, l.qty), h("td", { class: "n" }, `$${l.unit_cost}`), h("td", { class: "n" }, `$${l.subtotal}`)));
  }
  box.append(h("table", { class: "bomtable" }, h("thead", null, h("tr", null, ["Component", "Qty", "Unit", "Total"].map((t) => h("th", null, t)))), tb));
  box.append(el("div", "hint", `Tier: ${bom.tier}. Street prices from the linked suppliers; check before ordering.`));
  for (const w of bom.warnings ?? []) box.append(el("div", "bomwarn", "⚠ " + w));
  renderDesign(state.robot?.metadata?.design);
}
/** Engineering record of a designed robot: what it can do, how each motor was sized, every check. */
function renderDesign(d) {
  const box = $("#bom");
  if (!d) return;
  const list = (items) => h("ul", { class: "checks" }, items);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const joints = arr(d.joints).map((j) => h("tr", null, h("td", null, j.joint), h("td", null, j.actuator), h("td", { class: "n" }, j.required_nm), h("td", { class: "n" }, `${j.rated_nm} / ${j.peak_nm}`), h("td", { class: "n" }, `${j.margin}x`), h("td", { class: "n" }, j.speed_rad_s)));
  const sec = h("div", { class: "design" },
    h("div", { class: "panel-h" }, "Engineering"), h("div", { class: "hint" }, d.summary),
    h("table", { class: "bomtable" }, h("tbody", null, Object.entries(d.performance ?? {}).map(([k, v]) => h("tr", null, h("td", null, k.replace(/_/g, " ")), h("td", { class: "n" }, typeof v === "object" ? JSON.stringify(v) : v))))),
    joints.length ? [h("div", { class: "panel-h" }, "Actuator sizing"), h("table", { class: "bomtable" },
      h("thead", null, h("tr", null, ["Joint", "Actuator", "Peak need N·m", "Rated / peak", "Margin", "rad/s loaded"].map((t) => h("th", null, t)))), h("tbody", null, joints))] : null,
    h("div", { class: "panel-h" }, "Checks"),
    list(arr(d.checks).map((c) => h("li", { class: c.pass ? "ok" : "bad" }, c.pass ? "✓ " : "✗ ", h("b", null, c.name), ": ", c.detail))),
    h("div", { class: "panel-h" }, `Printed parts (${arr(d.printed).length})`),
    list(arr(d.printed).map((p) => h("li", null, `${p.name}: ${arr(p.check?.bbox_mm).join(" × ")} mm, ${Math.round(p.mass_kg * 1000)} g`, p.check?.fits_bed ? null : [": ", h("b", null, "too big for the bed")]))),
    arr(d.assumptions).length ? [h("div", { class: "panel-h" }, "Assumptions"), list(arr(d.assumptions).map((x) => h("li", null, x)))] : null);
  box.append(sec);
}
async function refreshBom() {
  if (!state.robot) return;
  const v = $("#budget").value;
  try { const { bom } = await api("/api/robots/bom", { robot: state.robot, budget: v === "" ? undefined : Number(v) }); state.bom = bom; renderBom(bom); }
  catch { /* keep last */ }
}
/** "What you still need to buy": the parts first, then print, screws and wire, each with its link and the total */
function toBuyLines(bom) { return bom.lines.filter((l) => (l.buy ?? l.qty) > 0 && l.unit_cost > 0).map((l) => ({ ...l, n: l.buy ?? l.qty, url: (l.note ?? "").match(/https?:\/\/\S+$/)?.[0] })); }
/** "you have it", "have 1, buy 1" or "to buy" on a parts list line of a robot built from a parts list */
function ownBadge(l) {
  if (l.have == null) return null;
  if (l.have >= l.qty) return h("span", { class: "bomhave" }, "you have it");
  return l.have > 0 ? [h("span", { class: "bomhave" }, `have ${l.have}`), h("span", { class: "bombuy" }, `buy ${l.buy}`)] : h("span", { class: "bombuy" }, "to buy");
}
function shoppingBox(bom) {
  const lines = toBuyLines(bom), parts = lines.filter((l) => l.key), rest = lines.filter((l) => !l.key);
  const sum = (ls) => ls.reduce((s, l) => s + l.n * l.unit_cost, 0);
  const item = (l) => { const url = safeHttpUrl(l.url); return h("li", null, `${+l.n.toFixed(2)}x `, url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, l.name) : String(l.name), `: $${(l.n * l.unit_cost).toFixed(2)}`); };
  return h("div", { class: "tobuy" }, h("div", { class: "panel-h" }, `What you still need to buy: $${Number(bom.to_buy_total).toFixed(2)}`),
    h("ul", null, parts.length ? parts.map(item) : h("li", null, "No parts: you have them all.")),
    h("div", { class: "hint" }, `Parts $${sum(parts).toFixed(2)}, plus $${sum(rest).toFixed(2)} of filament, screws and wire. You already have $${Number(bom.owned_total ?? 0).toFixed(2)} of the parts.`));
}
function shoppingMarkdown(bom) {
  const lines = toBuyLines(bom);
  let md = `# Still to buy: ${bom.robot_name}\n\n**Total: $${bom.to_buy_total ?? bom.total}** (you already have $${bom.owned_total ?? 0} of the parts)\n\n| Part | Qty | Unit $ | Subtotal $ | Link |\n|---|--:|--:|--:|---|\n`;
  for (const l of lines) md += `| ${l.name} | ${+l.n.toFixed(2)} | ${l.unit_cost} | ${(l.n * l.unit_cost).toFixed(2)} | ${l.url ?? ""} |\n`;
  return md;
}
function bomMarkdown(bom) {
  let md = `# Bill of materials: ${bom.robot_name}\n\n**Total: $${bom.total}** · tier ${bom.tier}` + (bom.budget != null ? ` · budget $${bom.budget} ${bom.feasible ? "(within)" : "(OVER)"}` : "") + "\n\n| Category | Component | Qty | Unit $ | Subtotal $ | Spec |\n|---|---|--:|--:|--:|---|\n";
  for (const l of bom.lines) md += `| ${l.category} | ${l.name}${l.have != null ? (l.have >= l.qty ? " **(you have it)**" : l.have > 0 ? ` **(have ${l.have}, buy ${l.buy})**` : " **(to buy)**") : ""}${l.note ? " ("+l.note+")" : ""} | ${l.qty} | ${l.unit_cost} | ${l.subtotal} | ${l.spec} |\n`;
  return md;
}

function renderDiff(lines) {
  const box = $("#diff"); box.replaceChildren();
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
// the Mark 43 armour is forged in the page's worker from the prompt: show how far it has got
addEventListener("ttr-forge", ({ detail: p }) => {
  if (p.stage === "done") return;
  const pct = Math.round(100 * p.done / (p.total || 1)), names = { forge: "shaping the shells", pack: "trimming overlaps", doors: "fitting hinges, servos and latches", trims: "clearing the doors' swing", wiring: "fitting cable channels and bays", measure: "measuring joint and door ranges", store: "storing the pieces" };
  status(`Forging the Mark 43 armour in your browser: ${names[p.stage] ?? p.stage} (${pct} %, ${p.elapsed_s ?? 0} s). The page stays usable, and the result is kept for next time.`);
  const stop = Object.assign(document.createElement("button"), { type: "button", textContent: "Cancel the forge", className: "forge-cancel" });
  stop.addEventListener("click", () => { globalThis.ttrStatic?.cancelForge(); stop.disabled = true; stop.textContent = "Cancelling..."; });
  $("#status").append(document.createElement("br"), stop);
});
// while the full armour is forged, a coarse look at it (4 mm voxels, no doors or trims) stands on the pad
addEventListener("ttr-forge-preview", ({ detail: parts }) => {
  clearRobot();
  const paint = { armour_red: 0x8f0808, armour_gold: 0xb88f4d, armour_silver: 0x9ea1a8, lens_glow: 0x9fe8ff };
  for (const p of parts) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p.v, 3)); g.setIndex(new THREE.BufferAttribute(p.f, 1)); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: paint[p.material] ?? 0xcccccc, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.85 }));
    mesh.scale.setScalar(0.001); robotGroup.add(mesh);
  }
  frameRobot();
});
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
  const out = [...(res.designedBy ? ["◆ Designed by: " + res.designedBy] : []), ...(res.summary ? ["→ Interpreted as: " + res.summary] : []), ...(res.validation?.checks ?? []), ...(res.urdfValidation?.checks ?? [])];
  for (const w of res.warnings ?? []) out.push("⚠ " + w);
  for (const r of res.repairs ?? []) out.push("↻ " + r);
  return out;
}

// ---------------- API ----------------
async function api(path, body) {
  const res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 409) {
    // a Mark 43 shape that is not made yet: forging it takes many minutes, so ask first, and only then send the request again
    const info = await res.json().catch(() => ({}));
    if (info.forgeNeeded && await askToForge(info.forgeNeeded.shape)) return api(path, { ...body, forgeConsent: true });
    throw new Error("Not forged: the reference Mark 43 opens at once; this shape is made only when you agree to the time it takes.");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}
/** What forging a custom Mark 43 costs on this device, from the measured runs: 25 minutes in Chrome with four helper workers, about 2.6 times
 *  that in a slow headless browser; up to 6 GB of memory. */
function forgeEstimate() {
  const cores = navigator.hardwareConcurrency || 4, helpers = Math.min(4, Math.max(0, cores - 2)), lo = Math.round((25 * 5) / (1 + helpers)), hi = Math.round(lo * 2.6);
  const mem = navigator.deviceMemory;
  return { lo, hi, cores, memNote: mem && mem < 8 ? ` This device reports ${mem} GB of memory, so the forge may run out of memory and stop.` : "" };
}
function askToForge(shape) {
  const e = forgeEstimate(), what = [shape.bulk !== 1 ? `build ${shape.bulk}` : "", shape.shoulder !== 1 ? `pauldrons ${shape.shoulder}` : "", shape.panels !== "film" ? `${shape.panels} panels` : ""].filter(Boolean).join(", ");
  return new Promise((done) => {
    // a native modal dialog: focus stays inside it, and Escape is the same as Cancel
    const box = h("dialog", { id: "forgeAsk", class: "forge-ask", "aria-labelledby": "forgeAskTitle" },
      h("form", { method: "dialog", class: "forge-ask-card" }, h("h3", { id: "forgeAskTitle" }, "Forge a custom Mark 43?"),
        h("p", null, `The reference suit opens at once. This one (${what || "a custom shape"}) has to be made in your browser: about ${e.lo} to ${e.hi} minutes on this device (${e.cores} cores) and up to 6 GB of memory.${e.memNote} The page stays usable, you can cancel at any time, and the result is kept for next time.`),
        h("div", { class: "forge-ask-buttons" }, h("button", { value: "cancel" }, "Cancel"), h("button", { value: "forge", class: "primary", autofocus: "" }, "Forge it"))));
    box.addEventListener("close", () => { const yes = box.returnValue === "forge"; box.remove(); done(yes); });
    document.body.append(box);
    box.showModal();
  });
}

function applyResult(res, label, diffLines) {
  state.robot = res.robot; state.urdf = res.urdf; state.xacro = res.xacro; state.id = res.id ?? state.id;
  if (state.id && !STATIC) history.replaceState(null, "", `/r/${state.id}`);
  state.jointValues = { ...(res.robot?.metadata?.design?.home ?? {}) }; // designed robots open in their ready pose
  state.versions.push({ id: state.id, label, robot: res.robot, urdf: res.urdf, xacro: res.xacro, recipe: state.recipe && structuredClone(state.recipe) });
  state.version = state.versions.length - 1;
  state.selection = null;
  state.bom = res.bom ?? null;
  revealNext = revealNext ?? "soft";
  document.body.classList.remove("busy");
  buildRobot(res.robot); renderTree(); renderSliders(); renderInspector(); renderHistory(); renderDiff(diffLines); renderBom(state.bom);
  motionUI.robotChanged();
  renderCards(); refreshCircuit();
  status(checksToText(res));
}

function loadVersion(i) {
  const v = state.versions[i]; if (!v) return;
  state.version = i; state.id = v.id; state.robot = v.robot; state.recipe = v.recipe ?? null; state.urdf = v.urdf; state.xacro = v.xacro; state.jointValues = { ...(v.robot?.metadata?.design?.home ?? {}) }; state.selection = null;
  buildRobot(v.robot); renderTree(); renderSliders(); renderInspector(); renderHistory(); renderCards(); refreshCircuit();
  motionUI.robotChanged();
}

async function doGenerate(prompt) {
  if (!prompt.trim()) { toast("Describe a robot first, for example \"a 6 DOF arm with a gripper\"."); $("#prompt").focus(); return; }
  if (prompt.length > MAX_PROMPT_CHARS) { toast(`Keep the description under ${MAX_PROMPT_CHARS} characters.`, "err"); return; }
  setBusy($("#genbtn"), true); document.body.classList.add("busy"); revealNext = "strong";
  const family = FAMILIES.findIndex((f) => f.prompt === prompt);
  if (family >= 0) familyDial.go(family, { silent: true });   // chips and the bar keep the ring honest
  if (!first) sheet.go("peek");   // on phones, get out of the way of the reveal
  first = false;
  try {
    if (looksLikeParts(prompt)) await doPartsPrompt(prompt);
    else if (state.arduino) await doArduino(prompt);
    else { const res = await api("/api/robots/generate", { prompt }); state.versions = []; state.recipe = { p: prompt }; applyResult(res, prompt.slice(0, 40)); }
  }
  catch (e) { revealNext = null; status("✗ " + e.message, "err"); }
  finally { setBusy($("#genbtn"), false, "Generate"); document.body.classList.remove("busy"); }
}

// ---------------- Arduino mode: price tiers ----------------
async function doArduino(prompt) {
  status("Designing Arduino versions… (each option is a complete, checked design: a car takes under a minute, an arm with its exact printed parts a few minutes)");
  const r = await api("/api/arduino", { prompt }); state.tierPrompt = prompt;
  state.tiers = r.options ?? [];
  const box = $("#tiers"); box.replaceChildren();
  $("#tierNotes").textContent = (r.notes ?? []).join("  ·  ");
  if (!state.tiers.length) {
    $("#tierDial").hidden = true; box.append(el("div", "hint", "No Arduino version of this robot yet."));
    // the log must not keep saying "Designing..." once the answer is in
    status(["✗ No Arduino version of this robot: nothing was designed.", ...(r.notes ?? [])], "err"); jump("arduino"); return;
  }
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
  state.recipe = { p: state.tierPrompt, a: 1, t: i };
  applyResult({ ...res, summary: o.summary, warnings: o.failing.length ? [`failing checks: ${o.failing.join(", ")}`] : [] }, `${o.tier}: $${Math.round(o.cost_usd)}`);
}

// ---------------- summary cards: cost, stats, checks chart ----------------
function renderCards() {
  const r = state.robot, d = r?.metadata?.design;
  $("#robotName").textContent = r ? r.robot_name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";
  // what the CAD download holds for this robot: exact STEP solids only for parts modelled on the CAD kernel
  const printedNames = new Set((d?.printed ?? []).map((p) => p.name));
  const step = !!r?.links.some((l) => l.geometry.type === "mesh" && l.geometry.part === "cad" && printedNames.has(l.name));
  $("[data-dl=cad] small").textContent = !r ? "STEP + STL" : !d ? "OpenSCAD + STL" : step ? "STEP + STL" : "STL";
  $("[data-dl=sketch]").hidden = !d?.firmware;
  $("[data-dl=sketch] b").textContent = d?.firmware?.language === "python" ? "Pi script" : "Arduino sketch";
  $("[data-dl=shopping]").hidden = !r?.metadata?.inventory;
  document.title = r ? `${r.robot_name.replace(/_/g, " ")} · Text to Robot` : "Text to Robot";
  // the parts list total (bought parts, filament, fasteners, wiring), so the summary, the parts list and the tier cards agree
  const cost = state.bom?.total ?? d?.performance?.cost_usd;
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
const PANES = ["design", "arduino", "model", "build", "share", "community"];
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

// ---------------- community board (community.js) ----------------
// Hidden unless community.json names a server. Nothing is sent until the person presses "Post publicly" in the share
// form, and the feed is read only when the Community tab is opened.
async function initCommunity() {
  const cm = await import("./community.js");
  const cfg = await cm.loadConfig();
  if (!cfg) return;
  const board = cm.createBoard(cfg, { product: "text-to-robot" });
  document.body.classList.add("community");
  document.querySelectorAll("[data-cm]").forEach((x) => { x.hidden = false; });
  document.querySelectorAll("[data-gallery]").forEach((x) => { x.hidden = true; });
  let feed;
  $('.dock-btn[data-jump="community"]').addEventListener("click", () => { if (feed) feed.reload(); else feed = board.feed($("#communityFeed")); });
  $("#shareBlog").onclick = async () => {
    if (!state.robot) return;
    try {
      // how it was made (prompt, Arduino tier, changes) when there is a recipe, else the whole design as a share link
      const recipe = state.recipe?.p ? `make=${cm.b64url(JSON.stringify(state.recipe))}`
        : /#(robot=[A-Za-z0-9_-]+)/.exec(STATIC ? await STATIC.shareUrl(state.robot) : "")?.[1];
      if (!recipe) { status("✗ This design cannot be shared from here.", "err"); return; }
      await board.share({ title: state.robot.robot_name.replace(/_/g, " "), recipe, snapshot: () => {
        renderer.render(scene, camera);
        // only the part of the view not under the docked panel
        const c = renderer.domElement, r = c.getBoundingClientRect(), panel = $("#sheet").getBoundingClientRect();
        const w = panel.left > r.left + r.width * 0.4 && panel.left < r.right ? panel.left - r.left : r.width;
        return { canvas: c, crop: { x: 0, y: 0, w, h: r.height } };
      } });
    } catch (e) { status(`✗ ${e.message}`, "err"); }
  };
  board.deleteFromLink();
}

// ---------------- publish (opt-in) and gallery ----------------
const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
const REPO = "megazron/text-to-robot";
async function publish() {
  if (!state.robot) return;
  let link = STATIC ? await STATIC.shareUrl(state.robot) : `${location.origin}/r/${state.id}`, replay = false;
  // a designed robot is about 22,000 characters as a link, more than a GitHub issue form takes: post how it was made instead
  // (its prompt, Arduino tier and changes), which the design engine rebuilds the same way
  if (link.length > 7000 && state.recipe) { link = `${location.origin}${location.pathname}#make=${b64url(JSON.stringify(state.recipe))}`; replay = true; }
  const d = state.robot.metadata?.design;
  const title = `[gallery] ${state.robot.robot_name.replace(/_/g, " ")}`;
  const body = `${d?.summary ?? state.robot.metadata?.source_prompt ?? ""}\n\nOpen it: ${link}\n\n${replay ? "(The link rebuilds the robot from its prompt and changes with the site's design engine.) " : ""}(Posted from the Text to Robot page. Edit or close this issue to change or remove it.)`;
  if (link.length > 7000) { status("This robot was opened from a file, so it has no prompt to post and is too large for a gallery post link; download the JSON and attach it to a post instead.", "err"); return; }
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
      // a post links back to this site only: an issue body cannot send visitors to a look-alike page
      const found = /https:\/\/\S+#(?:robot|make)=[A-Za-z0-9_-]+/.exec(it.body ?? "")?.[0], here = `${location.origin}${location.pathname}`;
      const link = found?.startsWith(`${here}#`) ? found : null;
      const a = el("a", "item"); a.style.animationDelay = `${box.children.length * 40}ms`; a.href = link ?? (String(safeHttpUrl(it.html_url)).startsWith(`https://github.com/${REPO}/issues/`) ? it.html_url : `https://github.com/${REPO}/issues`); a.target = "_blank"; a.rel = "noopener";
      a.append(el("b", null, it.title.replace(/^\[gallery\]\s*/, "")), el("small", null, `by ${it.user?.login ?? "someone"} · ${new Date(it.created_at).toLocaleDateString()}`));
      box.append(a);
    }
  } catch { box.replaceChildren(el("div", "empty", "Could not reach GitHub for the gallery.")); }
}
async function doModify(instruction) {
  if (!state.robot || !instruction.trim()) return;
  if (instruction.length > MAX_PROMPT_CHARS) { toast(`Keep the change under ${MAX_PROMPT_CHARS} characters.`, "err"); return; }
  setBusy($("#modbtn"), true); revealNext = "soft"; sheet.go("peek");
  try { const res = await api("/api/robots/modify", { robot: state.robot, instruction }); state.recipe = state.recipe && { ...state.recipe, m: [...(state.recipe.m ?? []), instruction] }; applyResult(res, instruction.slice(0, 40), res.changes ?? res.diff?.lines); }
  catch (e) { status("✗ " + e.message, "err"); }
  finally { setBusy($("#modbtn"), false, "Modify"); }
}
function setBusy(btn, busy, label) {
  btn.disabled = busy; btn.setAttribute("aria-busy", String(busy));
  if (btn.closest(".list")) return;   // list rows keep their label and pulse their icon
  if (busy) btn.replaceChildren(h("span", { class: "spin", "aria-hidden": "true" })); else btn.textContent = label;
}

// ---------------- downloads ----------------
async function handleDownload(kind) {
  if (!state.robot) return;
  const name = state.robot.robot_name;
  if (kind === "urdf") return download(`${name}.urdf`, state.urdf, "application/xml");
  if (kind === "xacro") return download(`${name}.urdf.xacro`, state.xacro, "application/xml");
  if (kind === "json") return download(`${name}.json`, JSON.stringify(state.robot, null, 2), "application/json");
  if (kind === "bom") { const bom = state.bom ?? (await api("/api/robots/bom", { robot: state.robot })).bom; return download(`${name}_BOM.md`, bomMarkdown(bom), "text/markdown"); }
  if (kind === "cad") { const { files } = await api("/api/robots/cad", { robot: state.robot }); return download(`${name}_cad.zip`, await makeZipDeflated(files)); }
  if (kind === "schematic") { const r = await circuits("schematic"); return download(`${name}_schematic.zip`, await makeZipDeflated({ [`${name}_schematic.pdf`]: Uint8Array.from(atob(r.pdf.b64), (c) => c.charCodeAt(0)), [`${name}_schematic.svg`]: r.svg })); }
  if (kind === "wiring3d") { const res = await fetch(API + "/api/engine/electronics-glb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ robot: state.robot }) }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`); return download(`${name}_electronics.glb`, new Blob([await res.arrayBuffer()], { type: "model/gltf-binary" })); }
  if (kind === "breadboard") { const r = await circuits("breadboard"); return download(`${name}_breadboard.svg`, r.svg, "image/svg+xml"); }
  if (kind === "sketch") { const f = await api("/api/engine/firmware", { robot: state.robot }); return download(f.name, f.code, "text/plain"); }
  if (kind === "shopping") { const bom = state.bom ?? (await api("/api/robots/bom", { robot: state.robot })).bom; return download(`${name}_still_to_buy.md`, shoppingMarkdown(bom), "text/markdown"); }
  if (kind === "train") { const { files } = await api("/api/robots/training", { robot: state.robot }); return download(`${name}_training.zip`, await makeZipDeflated(files)); }
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
    download(`${name}_ros2.zip`, await makeZipDeflated(files));
  }
}
function flash(btn, txt) { const t = btn.querySelector(".t b") ?? btn.querySelector(".t") ?? btn, old = t.textContent; t.textContent = txt; haptic(10); setTimeout(() => (t.textContent = old), 1200); }

// ---------------- circuit: schematic, breadboard view, cable diagram, electrical numbers ----------------
// drawn in the engine worker from the robot's wiring record when the tab is first opened, then kept for this robot
async function circuits(which) {
  const c = state.circuits?.robot === state.robot ? state.circuits : (state.circuits = { robot: state.robot });
  const path = { schematic: "/api/engine/schematic", breadboard: "/api/engine/breadboard", wiring: "/api/engine/wiring" }[which];
  c[which] ??= api(path, { robot: state.robot });
  return c[which];
}
/** a new robot redraws the open circuit view */
function refreshCircuit() { if ($("#tab-circuit").classList.contains("active")) showCircuit(document.querySelector(".seg.circ .tab.active").dataset.tab.slice(5)); }
function svgUrl(svg) { return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); }
async function showCircuit(which) {
  if (!state.robot) return;
  const box = document.querySelector(`.circview[data-view="${which}"]`), robot = state.robot;
  if (box._robot === robot && box.firstChild) return;
  box._robot = robot;
  box.replaceChildren(el("div", "hint", which === "breadboard" ? "Laying out every wire..." : "Drawing..."));
  $("#circNote").hidden = true;
  try {
    const r = await circuits(which);
    if (robot !== state.robot) return;
    const url = svgUrl(r.svg), img = el("img", "circimg");
    img.src = url; img.alt = `${robot.robot_name} ${which}`;
    img.onclick = () => box.classList.toggle("zoom");
    box._svg = r.svg;
    const bar = el("div", "circbar");
    const open = el("a", "tonal", "Open full size"); open.href = url; open.target = "_blank"; open.rel = "noopener";
    bar.append(open, el("span", "hint", which === "schematic" ? `Tap to zoom. ${r.size} sheet, ${r.netlist.parts.length} parts, ${r.netlist.nodes.length} nets.` : "Tap to zoom."));
    box.replaceChildren(bar, el("div", "circscroll"));
    box.lastChild.append(img); box._lit = null; markCircuitNet();
    if (which === "schematic") renderElectrical(r.electrical);
  } catch (e) { box.replaceChildren(el("div", "hint", "✗ " + e.message)); }
}
function renderElectrical(e) {
  const out = $("#circElectrical"); out.replaceChildren();
  const rows = [];
  for (const r of e.runtime) rows.push([`Battery ${r.battery}`, `${fmtMin(r.typical_min)} at ${r.typical_a} A typical, ${fmtMin(r.peak_min)} at ${r.peak_a} A peak (${r.c_rate_peak} C)`]);
  for (const s of e.supplies) rows.push([`Supply ${s.supply}`, `${s.load_pct} % loaded at ${s.typical_a} A typical of ${s.rating_a} A`]);
  for (const r of e.regulators) rows.push([`${r.kind === "linear" ? "Linear" : "Switching"} ${r.regulator}`, `${r.loss_typ_w} W heat typical, ${r.loss_peak_w} W peak, ${r.from} to ${r.to}${r.ok ? "" : " (too hot)"}`]);
  const bad = e.logic.filter((l) => l.verdict === "over_voltage" || l.verdict === "too_low"), marg = e.logic.filter((l) => l.verdict === "marginal");
  rows.push(["Logic levels", bad.length ? `${bad.length} signal${bad.length > 1 ? "s" : ""} need a level shifter` : marg.length ? `${marg.length} with little margin, none out of range` : `${e.logic.filter((l) => l.verdict === "ok").length} signals checked, all read correctly`]);
  out.append(el("div", "panel-h", "Electrical"), kvRows(rows));
  for (const l of [...bad, ...marg]) out.append(el("div", "hint", `${l.net}: ${l.from} to ${l.to}: ${l.advice}`));
  if (e.unchecked.length) out.append(el("div", "hint", `Not checked (no logic data): ${e.unchecked.join(", ")}`));
}
const fmtMin = (m) => (m == null || !Number.isFinite(m) ? "-" : m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
function kvRows(rows) { const d = el("div", "kv"); for (const [k, v] of rows) d.append(el("div", "k", k), el("div", "v", v)); return d; }

// ---------------- tabs ----------------
function setTab(name) {
  const pick = document.querySelector(`.tab[data-tab="${name}"]`), seg = pick.parentElement;
  [...seg.children].forEach((t, i) => {
    const on = t === pick; t.classList.toggle("active", on); t.setAttribute("aria-selected", String(on));
    if (on) seg.style.setProperty("--i", i);
    const pane = $("#tab-" + t.dataset.tab); pane.classList.toggle("active", on);
    if (on) popIn(pane, { y: 6, duration: 260 });
  });
  if (name === "circuit") showCircuit(document.querySelector(".seg.circ .tab.active").dataset.tab.slice(5));
  else if (name.startsWith("circ-")) showCircuit(name.slice(5));
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
initCommunity().catch(() => {});
$("#importRobot").onclick = () => $("#robotFile").click();
$("#robotFile").onchange = async (event) => {
  const file=event.target.files[0];if(!file)return;
  const button=$("#importRobot");setBusy(button,true);
  try {
    if(file.size>MAX_ROBOT_BYTES)throw new Error(`Robot JSON must be smaller than ${MAX_ROBOT_BYTES/1048576} MB`);
    const robot=safeJsonParse(await file.text());
    const result=await api("/api/robots/import",{robot});state.recipe=null;applyResult(result,`Imported ${file.name}`);
  }catch(error){status("✗ "+error.message,"err");}
  finally {setBusy(button,false,"Import JSON");event.target.value="";}
};
$("#budget").oninput = () => { clearTimeout(window.__bt); window.__bt = setTimeout(refreshBom, 350); };

// ---------------- My parts: what you have -> the robots it builds ----------------
// state.parts: catalog key -> qty, from the text box, the search and the suggestion buttons; unknown lines stay listed
const parts = { have: new Map(), names: new Map(), unknown: [], extras: [], notes: [], options: [], text: "" };
const looksLikeParts = (t) => /^\s*(i\s+(have|got|own|bought)|i've\s+got|i\s+already\s+have|mere\s+(paas|pass|pas)|मेरे\s+पास|my\s+(parts|kit|parts\s+bin)\s+(has|have|contains?|is)|(parts|inventory|kit\s+contents|shopping\s+list|contents)\s*:)/i.test(t) || t.split("\n").filter((l) => /^\s*([-*•]|\d+\s*x?\s)/.test(l)).length >= 3;
function openParts(open = true) { $("#partsPanel").hidden = !open; $("#partsBtn").setAttribute("aria-expanded", String(open)); haptic(8); if (open) sheet.atLeast("half"); }
$("#partsBtn").onclick = () => openParts($("#partsPanel").hidden);
async function readPartsText(text) {
  parts.text = text;
  const inv = await api("/api/engine/parse-inventory", { text });
  // the text owns what it lists; parts added by search or suggestion stay
  for (const [k, v] of [...parts.have]) if (v.from === "text") parts.have.delete(k);
  for (const i of inv.items) { const cur = parts.have.get(i.key); parts.have.set(i.key, { qty: (cur?.qty ?? 0) + i.qty, from: cur ? cur.from : "text", name: i.name, assumed: i.assumed, note: i.note }); }
  parts.unknown = inv.unknown; parts.extras = inv.extras; parts.notes = inv.notes;
  renderParts();
}
function renderParts() {
  const list = $("#partsList"); list.replaceChildren();
  for (const [key, v] of parts.have) {
    const row = el("div", "partrow"), nm = el("div", "nm", v.name.split(" (")[0]);
    if (v.assumed || v.note) nm.append(el("small", null, v.assumed ? `read as ${v.assumed}` : v.note));
    const q = el("div", "qty"), minus = el("button", null, "−"), plus = el("button", null, "+"), n = el("b", null, String(v.qty));
    minus.type = plus.type = "button"; minus.setAttribute("aria-label", `one ${v.name} less`); plus.setAttribute("aria-label", `one more ${v.name}`);
    minus.onclick = () => { v.qty--; if (v.qty <= 0) parts.have.delete(key); renderParts(); };
    plus.onclick = () => { v.qty++; renderParts(); };
    q.append(minus, n, plus);
    row.dataset.key = key;
    row.append(nm, q); list.append(row);
  }
  const unk = $("#partsUnknown"); unk.replaceChildren();
  for (const u of parts.unknown) {
    const d = el("div", "unk"); d.append(el("b", null, "Not recognised: "), document.createTextNode(`"${u.raw}". Closest parts I know: `));
    for (const sg of u.suggestions) { const b = el("button", null, sg.name.split(" (")[0]); b.type = "button"; b.onclick = () => { addPart(sg.key, sg.name, u.qty); parts.unknown = parts.unknown.filter((x) => x !== u); renderParts(); }; d.append(b); }
    unk.append(d);
  }
  for (const e of parts.extras) unk.append(el("div", "unk", `Kept aside: ${e.qty > 1 ? e.qty + "x " : ""}${e.what} (${e.note}).`));
  $("#partsGo").disabled = !parts.have.size;
}
function addPart(key, name, qty = 1) { const cur = parts.have.get(key); parts.have.set(key, { qty: (cur?.qty ?? 0) + qty, from: cur?.from ?? "picked", name: name ?? cur?.name ?? key }); }
$("#partsText").oninput = () => { clearTimeout(window.__pt); window.__pt = setTimeout(() => readPartsText($("#partsText").value).catch((e) => toast("✗ " + e.message, "err")), 350); };
$("#partsSearch").oninput = () => { clearTimeout(window.__ps); window.__ps = setTimeout(searchPartsBox, 200); };
async function searchPartsBox() {
  const q = $("#partsSearch").value, box = $("#partsResults"); box.replaceChildren();
  if (!q.trim()) return;
  const { parts: found } = await api("/api/engine/parts-search", { query: q, limit: 8 });
  for (const f of found) {
    const b = el("button", "chip", `+ ${f.name.split(" (")[0]}`); b.type = "button"; b.setAttribute("role", "option"); b.title = `${f.name}, $${f.price_usd}`;
    b.onclick = () => { addPart(f.key, f.name); renderParts(); toast(`Added ${f.name.split(" (")[0]}`); };
    box.append(b);
  }
  if (!found.length) box.append(el("div", "hint", "No catalog part matches. Describe it in the text box and it will be listed as not recognised."));
}
const inventoryOf = () => Object.fromEntries([...parts.have].map(([k, v]) => [k, v.qty]));
async function findRobots() {
  if (!parts.have.size) return;
  const go = $("#partsGo"); setBusy(go, true);
  try {
    const r = await api("/api/engine/from-parts", { inventory: inventoryOf(), options: { design: "none" } });
    parts.options = r.options; renderPartCards(r);
    if (r.options.length) await choosePart(0);
  } finally { setBusy(go, false, "Find robots"); }
}
$("#partsGo").onclick = () => findRobots().catch((e) => status("✗ " + e.message, "err"));
function renderPartCards(r) {
  const box = $("#partsCards"); box.replaceChildren();
  $("#partsNotes").textContent = [...(r.notes ?? [])].join("  ·  ");
  if (!r.options.length) {
    const c = r.cannot;
    box.append(h("div", { class: "tobuy" }, h("div", { class: "panel-h" }, "Nothing safe to build yet"),
      h("div", { class: "hint" }, `Can't build anything safe because ${c?.reason ?? "the list is empty"}. Add ${c?.add.map((a) => `${a.qty}x ${a.key.replace(/_/g, " ")} ($${a.usd})`).join(", ") || "a motor or a servo"} and it makes ${c?.then ?? "a robot"}.`))); status([`✗ Can't build anything safe because ${c?.reason}.`, `Add: ${c?.add.map((a) => `${a.qty}x ${a.key}`).join(", ")}`], "err"); return;
  }
  r.options.forEach((o, i) => {
    const b = el("button", "pcard"); b.type = "button"; b.style.setProperty("--k", i); b.dataset.option = o.id;
    const img = el("img"); img.src = o.thumbnail; img.alt = o.label; img.loading = "lazy"; img.draggable = false; img.onerror = () => img.classList.add("noimg");
    b.append(img, el("div", "pl", o.label), el("div", "ph", o.headline), el("div", "pb", o.blurb));
    for (const h of o.honesty) b.append(el("div", "pw", "⚠ " + h));
    b.onclick = () => choosePart(i).catch((e) => status("✗ " + e.message, "err"));
    box.append(b);
  });
}
async function choosePart(i) {
  const o = parts.options[i]; if (!o) return;
  document.querySelectorAll(".pcard").forEach((c, k) => c.classList.toggle("sel", k === i));
  status(`Designing the ${o.label.toLowerCase()} from your parts… (a car takes about a minute, an arm a few)`);
  document.body.classList.add("busy"); revealNext = "strong";
  try {
    const r = await api("/api/engine/from-parts", { inventory: inventoryOf(), options: { design: o.id } });
    const d = r.designs[o.id]; if (!d) throw new Error("that option could not be designed");
    const res = await api("/api/robots/import", { robot: d.robot });
    state.versions = []; state.recipe = null;
    applyResult({ ...res, summary: d.summary, warnings: [...o.honesty, ...(d.failing.length ? [`failing checks: ${d.failing.join(", ")}`] : [])] }, `${o.label} (my parts)`);
    toast(`${o.label}: $${d.to_buy_usd.toFixed(0)} still to buy`);
  } finally { document.body.classList.remove("busy"); }
}
/** "I have ..." typed in the prompt bar: read it into the panel and design the best option */
async function doPartsPrompt(prompt) {
  openParts(true); $("#partsText").value = prompt; parts.have.clear();
  await readPartsText(prompt);
  status(`Reading your parts: ${[...parts.have.values()].map((v) => `${v.qty}x ${v.name.split(" (")[0]}`).join(", ") || "none recognised"}`);
  await findRobots();
  jump("design");
}
window.__ttrParts = parts;

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
    for (const t of templates) {
      const prompt = `Create ${/^[aeiou]/i.test(t.title) ? "an" : "a"} ${t.title}`;
      const b = el("button", null, t.title); b.type = "button"; b.title = t.description; b.onclick = () => { $("#prompt").value = prompt; doGenerate(prompt); }; box.append(b);
    }
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
  const make = /[#&]make=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1];
  if (make) {
    // a gallery link: replay how the robot was made
    try {
      // anyone can send this link: the recipe is size-capped, prototype keys are dropped and every field is type-checked
      if (make.length > 64 * 1024) throw new Error("too long");
      const r = safeJsonParse(fromB64url(make)); history.replaceState(null, "", location.pathname);
      if (typeof r.p !== "string" || r.p.length > MAX_PROMPT_CHARS) throw new Error("no prompt");
      if (r.m !== undefined && !(Array.isArray(r.m) && r.m.length <= 100)) throw new Error("bad changes");
      $("#prompt").value = r.p;
      if (r.a && !state.arduino) setArduino(true);
      await doGenerate(r.p);
      if (r.a && Number.isInteger(r.t) && r.t !== state.recipe?.t) await selectTier(r.t);
      for (const m of r.m ?? []) await doModify(String(m));
      return;
    } catch { status("\u2717 gallery link is damaged; generating a default", "err"); }
  }
  // #parts: straight to My parts (a link from a tutorial or another page), nothing designed until the list is in
  if (/^#parts\b/.test(location.hash)) { openParts(true); $("#partsText").focus(); return; }
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
window.__ttr = { get motion() { return window.__ttrMotion; }, robotGroup, renderer, get preview() { return { ...preview, parts: [...state.meshes].filter(([name]) => state.robot.links.find(l => l.name === name)?.geometry.type === 'mesh').map(([name, group]) => ({ name, loaded: !!group.children[0].userData.meshLoaded, triangles: group.children[0].geometry.getAttribute('position').count / 3 })) }; }, camera, controls, frameRobot, get robot(){return state.robot} };

// ---------------- how it reads: the sentence model and a bring-your-own-key model (website only) ----------------
// The settings live in this browser (apps/web/src/browser-api.ts); the key never leaves it except to the provider chosen.
if (globalThis.ttrReading) {
  const R = globalThis.ttrReading, cur = { embeddings: false, model: null, remember: false, ...R.get() };
  $("#readingBox").hidden = false;
  const kindSel = $("#byokKind"), key = $("#byokKey"), base = $("#byokBase"), model = $("#byokModel"), remember = $("#byokRemember");
  const show = () => {
    $("#embedBtn").setAttribute("aria-checked", String(!!cur.embeddings));
    const k = cur.model?.kind ?? "";
    kindSel.value = k; key.value = cur.model?.key ?? ""; base.value = cur.model?.baseUrl ?? ""; model.value = cur.model?.model ?? ""; remember.checked = !!cur.remember;
    $("#byokBaseRow").hidden = k !== "openai";
    model.placeholder = k === "openai" ? "gpt-4o-mini" : "claude-opus-5-5";
    $("#byokState").textContent = k ? `${k === "anthropic" ? "Anthropic" : "OpenAI-compatible"}${cur.model?.key || k === "openai" ? "" : " (no key yet)"}` : "off";
  };
  const save = () => { R.set(cur); show(); };
  $("#embedBtn").onclick = () => { cur.embeddings = !cur.embeddings; save(); if (cur.embeddings) $("#embedSub").textContent = "Loading when a prompt needs it…"; };
  const readModel = () => {
    const k = kindSel.value;
    cur.model = k ? { kind: k, key: key.value.trim(), ...(k === "openai" && base.value.trim() ? { baseUrl: base.value.trim() } : {}), ...(model.value.trim() ? { model: model.value.trim() } : {}) } : null;
    cur.remember = remember.checked; save();
  };
  for (const e of [kindSel, key, base, model, remember]) e.onchange = readModel;
  addEventListener("ttr-reading", ({ detail: p }) => {
    const sub = $("#embedSub");
    if (p.status === "error") { sub.textContent = `Could not load the sentence model (${p.error}); the word table reads instead`; return; }
    if (p.status === "progress" && p.progress != null) sub.textContent = `Downloading the sentence model… ${Math.round(p.progress)} % (${p.file ?? ""})`;
    if (p.status === "ready") sub.textContent = "Sentence model ready (cached in this browser)";
  });
  show();
}
