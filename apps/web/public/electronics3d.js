// The robot's electronics and harness in 3D, from the engine's electronics3d answer (engine API v1).
//   Parts ride their links (children of the link groups the robot view poses), so they follow every joint. Wires are
//   tubes through their centreline points, each point in its link's frame: a wire is rebuilt from the links' matrices
//   when a joint moves, and the stretch across the joint follows.
//   Modes: "robot" (electronics hidden), "electronics" (the printed and bought shells turn to glass, the electronics
//   and wires stay solid), "exploded" (parts pulled apart along their mount normals, wires stretched to them).
// Usage: const ex = createElectronics(THREE, { root, links, data }); ex.setMode("electronics"); ex.update() after FK.
const MAT = {
  pcb_green: [0x1f7a3a, 0.1, 0.55], pcb_blue: [0x1b4fa8, 0.1, 0.55], pcb_red: [0xb3261e, 0.1, 0.55], pcb_black: [0x1d1f22, 0.1, 0.5], pcb_purple: [0x5b2a86, 0.1, 0.55], pcb_teal: [0x0f7c8c, 0.1, 0.55],
  ic: [0x161616, 0.2, 0.45], gold: [0xd4af37, 0.9, 0.28], silver: [0xc9ccd1, 0.85, 0.3], header: [0x111111, 0.05, 0.7], plastic_black: [0x1b1b1b, 0.05, 0.6], plastic_white: [0xf2f2f2, 0.05, 0.5],
  plastic_red: [0xd7263d, 0.05, 0.5], plastic_orange: [0xf28a1a, 0.05, 0.5], plastic_blue: [0x2f6fd0, 0.05, 0.5], plastic_yellow: [0xf2c200, 0.05, 0.5], plastic_grey: [0xb8bcc2, 0.05, 0.55],
  metal: [0x9aa0a6, 0.8, 0.35], copper: [0xc56b2b, 0.9, 0.3], cell_blue: [0x2a5fa5, 0.15, 0.4], cell_teal: [0x2fa9c0, 0.15, 0.4], rubber: [0x222222, 0, 0.9], lens: [0x222833, 0.3, 0.1],
};
const WIRE = { red: 0xd7263d, black: 0x262626, yellow: 0xf2c200, blue: 0x1f6fd1, white: 0xf3f3f3, green: 0x2a9d3a, orange: 0xf28a1a, violet: 0x8e44ad, grey: 0x8c8c8c, gray: 0x8c8c8c, brown: 0x8b5a2b };

export function createElectronics(THREE, { root, links, data, robotMeshes }) {
  const group = new THREE.Group(); group.name = "electronics"; root.add(group);
  const mats = new Map();
  const mat = (m) => { if (!mats.has(m)) { const [c, metal, rough] = MAT[m] ?? [0x888888, 0.1, 0.6]; mats.set(m, new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough })); } return mats.get(m); };
  const geoms = new Map(); // catalog key -> [{geometry, mat}]
  const modelMeshes = (key) => {
    if (geoms.has(key)) return geoms.get(key);
    const m = data.models[key], out = [];
    for (const s of m?.meshes ?? []) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(s.v, 3)); g.setIndex(s.f); g.computeVertexNormals(); out.push({ g, mat: s.mat }); }
    geoms.set(key, out); return out;
  };
  const labelTex = new Map();
  const label = (text, color) => {
    const k = `${text}|${color}`; if (labelTex.has(k)) return labelTex.get(k);
    const c = document.createElement("canvas"); c.width = 512; c.height = 96; const x = c.getContext("2d");
    x.fillStyle = color; x.font = "bold 72px Helvetica, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 256, 52, 500);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; labelTex.set(k, t); return t;
  };
  // ---- parts, on their links
  const parts = new Map(); // inst -> { obj, link, base: Matrix4 }
  const fromRow = (a, s = 0.001) => { const m = new THREE.Matrix4(); m.set(a[0], a[1], a[2], a[3] * s, a[4], a[5], a[6], a[7] * s, a[8], a[9], a[10], a[11] * s, 0, 0, 0, 1); return m; };
  for (const p of data.parts) {
    const lg = links.get(p.link); if (!lg) continue;
    const obj = new THREE.Group(); obj.matrixAutoUpdate = false; obj.userData.inst = p.inst;
    for (const { g, mat: mm } of modelMeshes(p.key)) { const mesh = new THREE.Mesh(g, mat(mm)); mesh.userData.inst = p.inst; mesh.userData.electronics = true; obj.add(mesh); }
    for (const l of data.models[p.key]?.labels ?? []) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.h), new THREE.MeshBasicMaterial({ map: label(l.text, l.color), transparent: true, depthWrite: false }));
      plane.position.set(l.at[0], l.at[1], l.at[2] + 0.02); obj.add(plane);
    }
    const base = fromRow(p.T).multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001));
    obj.matrix.copy(base); lg.add(obj);
    parts.set(p.inst, { obj, link: p.link, base, key: p.key, offset: new THREE.Vector3() });
  }
  // ---- wires
  const wires = data.wires.map((w) => {
    const color = WIRE[w.color] ?? 0x888888;
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.45, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material); mesh.userData.wire = w; mesh.userData.electronics = true;
    group.add(mesh);
    const moving = new Set(w.pts.map((q) => data.groups[q.link] ?? q.link)).size > 1;
    // connector bodies at both ends (Dupont housing, JST plug); and pin markers to hover
    const ends = [0, w.pts.length - 1].map((i, k) => {
      const kind = w.ends[k], body = kind === "header" || kind === "socket" ? [2.6, 2.6, 10] : kind === "jst" ? [7.6, 3, 8] : kind === "lever" || kind === "terminal" || kind === "tab" ? [2.2, 2.2, 6] : null;
      const conn = body ? new THREE.Mesh(new THREE.BoxGeometry(body[0] / 1000, body[1] / 1000, body[2] / 1000), mat(kind === "tab" || kind === "lever" || kind === "terminal" ? "silver" : "plastic_black")) : null;
      const pin = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.3, w.od_mm) / 1000, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0 }));
      pin.userData.pin = k === 0 ? w.from : w.to; pin.userData.wire = w; pin.userData.electronics = true;
      if (conn) { conn.userData.wire = w; conn.userData.electronics = true; group.add(conn); }
      group.add(pin);
      return { conn, pin, i, len: body ? body[2] : 0 };
    });
    return { w, mesh, material, moving, ends, built: false };
  });
  const tmp = new THREE.Vector3(), M = new THREE.Matrix4();
  const linkMatrix = (name) => { const lg = links.get(name); return lg ? lg.matrix : M.identity(); };
  /** world (robot root) points of a wire, with the part offsets of exploded view at its two ends */
  const points = (rec) => {
    const w = rec.w, pts = w.pts.map((q) => new THREE.Vector3(q.p[0] / 1000, q.p[1] / 1000, q.p[2] / 1000).applyMatrix4(linkMatrix(q.link)));
    if (mode === "exploded") {
      // the ends move with their parts; the wire stretches over its first and last 80 mm
      for (const [term, from, dir] of [[w.from, 0, 1], [w.to, pts.length - 1, -1]]) {
        const p = parts.get(term.split(".")[0]); if (!p || !p.world) continue;
        let d = 0;
        for (let i = from; i >= 0 && i < pts.length; i += dir) { if (i !== from) d += pts[i].distanceTo(pts[i - dir]); const k = Math.max(0, 1 - d / 0.08); if (!k) break; pts[i].addScaledVector(p.world, k); }
      }
    }
    return pts;
  };
  const build = (rec) => {
    const pts = points(rec), w = rec.w;
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
    const L = curve.getLength(), segs = Math.min(600, Math.max(8, Math.ceil(L / 0.004)));
    rec.mesh.geometry.dispose(); rec.mesh.geometry = new THREE.TubeGeometry(curve, segs, (w.od_mm / 2) / 1000, 7, false);
    for (const e of rec.ends) {
      const at = pts[e.i], next = pts[e.i === 0 ? 1 : pts.length - 2], dir = tmp.copy(next).sub(at).normalize();
      e.pin.position.copy(at);
      if (e.conn) { e.conn.position.copy(at).addScaledVector(dir, e.len / 2000); e.conn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); }
    }
    rec.built = true;
  };
  // ---- modes
  let mode = "robot", filter = "all", focus = null;
  const saved = new Map();
  const xray = (on) => {
    for (const [name, g] of robotMeshes()) for (const m of g.children) {
      if (!m.isMesh || !m.material) continue;
      if (!saved.has(m)) saved.set(m, { transparent: m.material.transparent, opacity: m.material.opacity, depthWrite: m.material.depthWrite, visible: m.visible });
      const s = saved.get(m), elec = data.parts.some((p) => p.link === name && !p.harness && data.models[p.key]?.replaces);
      const part = data.parts.find((p) => p.link === name && !p.harness);
      if (!on) { Object.assign(m.material, { transparent: s.transparent, opacity: s.opacity, depthWrite: s.depthWrite }); m.visible = s.visible; m.material.needsUpdate = true; continue; }
      // a part with its own detailed model replaces its body; a bought part without one (a motor's CAD) stays solid; the rest is glass
      if (elec) m.visible = false;
      else if (!part) { Object.assign(m.material, { transparent: true, opacity: 0.14, depthWrite: false }); m.material.needsUpdate = true; }
      else m.visible = true;
    }
  };
  function explodeOffsets() {
    // boards and modules out along their board normal, everything else out from the robot's middle; 30 % of its size
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()).length() || 0.3, centre = box.getCenter(new THREE.Vector3());
    for (const [, p] of parts) {
      // a part drawn by the robot view (a motor's CAD) stays where it is mounted
      const lg = links.get(p.link); if (!lg || !data.models[p.key]?.replaces) { p.world = null; continue; }
      const wm = new THREE.Matrix4().multiplyMatrices(lg.matrix, p.base);
      const pos = new THREE.Vector3().setFromMatrixPosition(wm), n = new THREE.Vector3(0, 0, 1).transformDirection(wm);
      const radial = pos.clone().sub(centre); radial.z = Math.max(radial.z, 0);
      const pcb = data.models[p.key]?.detailed || /pcb_/.test((data.models[p.key]?.meshes ?? [])[0]?.mat ?? "");
      const dir = (pcb ? n : radial.lengthSq() > 1e-8 ? radial.normalize() : n).normalize();
      p.world = dir.multiplyScalar(size * 0.12);
      // the offset in the link's frame
      const inv = new THREE.Matrix4().copy(lg.matrix).invert(), local = p.world.clone().transformDirection(inv).multiplyScalar(p.world.length());
      p.obj.matrix.copy(new THREE.Matrix4().makeTranslation(local.x, local.y, local.z).multiply(p.base));
    }
  }
  function setMode(m) {
    mode = m; const on = m !== "robot";
    group.visible = on; for (const [, p] of parts) p.obj.visible = on;
    xray(on);
    if (m === "exploded") explodeOffsets(); else for (const [, p] of parts) { p.world = null; p.obj.matrix.copy(p.base); }
    for (const r of wires) r.built = false;
    update(true);
  }
  const visibleWire = (w) => filter === "all" || (filter === "signal" ? w.kind === "signal" || w.kind === "bus" : filter === "ground" ? w.kind === "ground" : w.net === filter);
  function restyle() {
    for (const r of wires) {
      const on = visibleWire(r.w), lit = !focus || r.w.net === focus;
      r.mesh.visible = on; for (const e of r.ends) { if (e.conn) e.conn.visible = on; e.pin.visible = on; }
      r.material.opacity = lit ? 1 : 0.12; r.material.depthWrite = lit;
      r.material.emissive?.setHex(focus && r.w.net === focus ? 0x333333 : 0x000000);
    }
  }
  function update(all = false) {
    if (mode === "robot") return;
    for (const r of wires) if (all || !r.built || r.moving || mode === "exploded") build(r);
  }
  function setFilter(f) { filter = f; restyle(); }
  function highlight(net) { focus = net; restyle(); }
  /** what is under a ray: a wire (or its connector) or a pin */
  function pick(raycaster) {
    if (mode === "robot") return null;
    const objs = []; for (const r of wires) if (r.mesh.visible) { objs.push(r.mesh); for (const e of r.ends) { objs.push(e.pin); if (e.conn) objs.push(e.conn); } }
    for (const [, p] of parts) objs.push(...p.obj.children.filter((c) => c.isMesh && c.userData.inst));
    const hit = raycaster.intersectObjects(objs, false)[0]; if (!hit) return null;
    const u = hit.object.userData;
    if (u.pin) return { type: "pin", pin: u.pin, wire: u.wire };
    if (u.wire) return { type: "wire", wire: u.wire };
    if (u.inst) return { type: "part", inst: u.inst, key: parts.get(u.inst)?.key };
    return null;
  }
  function dispose() {
    for (const [, p] of parts) p.obj.parent?.remove(p.obj);
    root.remove(group);
    group.traverse((o) => { o.geometry?.dispose(); });
    for (const [, gs] of geoms) for (const { g } of gs) g.dispose();
    for (const [, m] of mats) m.dispose(); for (const [, t] of labelTex) t.dispose();
    xray(false);
  }
  /** the box round the electronics, in the robot root frame (to frame the camera on them) */
  function bounds() { const b = new THREE.Box3(); for (const [, p] of parts) if (p.obj.visible) b.expandByObject(p.obj); for (const r of wires) if (r.mesh.visible && r.built) b.expandByObject(r.mesh); return b; }
  setMode("robot");
  return { bounds, group, setMode, setFilter, highlight, update, pick, dispose, get mode() { return mode; }, data };
}
