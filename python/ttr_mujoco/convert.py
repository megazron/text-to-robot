"""URDF -> actuated MuJoCo MJCF scene (floor, light, position actuators, optional free base)."""
import os, re, tempfile, warnings
import xml.etree.ElementTree as ET
import numpy as np
import mujoco

# whole-word hints, matched against link/joint NAMES only (never the header comment/prompt)
FLOATING_HINT = re.compile(r"\b(hip|thigh|knee|shin|coxa|femur|tibia|wheel|leg|foot|track|thruster|hover|torso)\b", re.I)
NAME_ATTR = re.compile(r'<(?:link|joint)\s+name="([^"]+)"')


def _guess_floating(urdf_xml: str) -> bool:
    names = " ".join(n.replace("_", " ") for n in NAME_ATTR.findall(urdf_xml))
    return bool(FLOATING_HINT.search(names))


def _lowest_point(model: mujoco.MjModel) -> float:
    """World-z of the lowest point of any geom at qpos0 (exact per geom type, using its rotation)."""
    data = mujoco.MjData(model); mujoco.mj_forward(model, data)
    lows = []
    G = mujoco.mjtGeom
    for g in range(model.ngeom):
        if model.geom_contype[g] == 0 and model.geom_conaffinity[g] == 0:
            continue  # visual-only geom (polygon shells collide through their bounding boxes)
        pos = data.geom_xpos[g]; R = data.geom_xmat[g].reshape(3, 3); size = model.geom_size[g]; t = model.geom_type[g]
        zrow = np.abs(R[2, :])                      # |world-z components of the local axes|
        if t == G.mjGEOM_BOX:
            ext = float(zrow @ size[:3])
        elif t == G.mjGEOM_SPHERE:
            ext = float(size[0])
        elif t == G.mjGEOM_CYLINDER:
            ext = float(zrow[2] * size[1] + np.sqrt(max(0.0, 1 - zrow[2] ** 2)) * size[0])
        elif t == G.mjGEOM_CAPSULE:
            ext = float(zrow[2] * size[1] + size[0])
        elif t == G.mjGEOM_PLANE:
            continue
        else:
            ext = float(model.geom_rbound[g])
        lows.append(float(pos[2]) - ext)
    return float(min(lows)) if lows else 0.0


def urdf_to_mjcf(urdf_path: str, floating=None, kp: float | None = None, out: str | None = None, self_collision: bool = False) -> str:
    """Convert a URDF to an MJCF scene string with actuators. floating=None -> auto."""
    urdf_xml = open(urdf_path, encoding="utf8").read()
    source = ET.fromstring(urdf_xml)
    joint_efforts = {}
    for joint in source.findall("joint"):
        if joint.get("type") not in ("revolute", "continuous", "prismatic"):
            continue
        limit = joint.find("limit")
        effort = float(limit.get("effort", "nan")) if limit is not None else float("nan")
        if not np.isfinite(effort) or effort <= 0:
            raise ValueError(f"Joint {joint.get('name')!r} needs a finite positive URDF effort limit; refusing to invent actuator capacity")
        joint_efforts[joint.get("name")] = effort
    if floating is None:
        floating = _guess_floating(urdf_xml)
    # polygon-mesh parts: resolve package://<pkg>/meshes/<f> and relative meshes/<f> to absolute files next to the URDF
    urdf_dir = os.path.dirname(os.path.abspath(urdf_path))
    def _abs_mesh(mo):
        f = mo.group(1)
        for cand in (os.path.join(urdf_dir, "meshes", f), os.path.join(urdf_dir, f)):
            if os.path.exists(cand): return f'filename="{cand}"'
        return f'filename="{os.path.join(urdf_dir, "meshes", f)}"'
    resolved = re.sub(r'filename="(?:package://[^/"]+/meshes/|meshes/)([^"]+)"', _abs_mesh, urdf_xml)
    has_meshes = "<mesh " in resolved
    imported = ET.fromstring(resolved)
    extension = imported.find("mujoco")
    if extension is None: extension = ET.SubElement(imported, "mujoco")
    compiler = extension.find("compiler")
    if compiler is None: compiler = ET.SubElement(extension, "compiler")
    # Keep fixed-link identities so source inertias can be restored per body,
    # even when the source supplied its own MuJoCo compiler configuration.
    compiler.set("fusestatic", "false")
    compiler.set("discardvisual", "false" if has_meshes else "true")
    resolved = ET.tostring(imported, encoding="unicode")
    load_path = urdf_path
    if resolved != urdf_xml:
        tmpu = tempfile.NamedTemporaryFile(suffix=".urdf", delete=False, mode="w", encoding="utf8"); tmpu.write(resolved); tmpu.close(); load_path = tmpu.name
    try:
        base = mujoco.MjModel.from_xml_path(load_path)
    finally:
        if load_path != urdf_path:
            os.unlink(load_path)
    lift = max(0.0, -_lowest_point(base)) + 0.005 if floating else 0.0
    total_mass = float(sum(base.body_mass))
    try:  # the static root link's mass is dropped by the URDF importer; count it when the base floats
        _u = ET.fromstring(urdf_xml); _ch = {j.find("child").get("link") for j in _u.findall("joint") if j.find("child") is not None}
        _root = next((l for l in _u.findall("link") if l.get("name") not in _ch), None)
        _rid = mujoco.mj_name2id(base, mujoco.mjtObj.mjOBJ_BODY, _root.get("name")) if _root is not None else -1
        if floating and _root is not None and _root.find("inertial/mass") is not None and (_rid < 0 or base.body_mass[_rid] <= 0):
            total_mass += float(_root.find("inertial/mass").get("value", "0"))
    except Exception: pass
    # Servo stiffness must beat the inverted-pendulum "negative stiffness" m*g*h_com for a
    # standing robot to be statically stable under position control (real joint modules are).
    _d = mujoco.MjData(base); mujoco.mj_forward(base, _d)
    _mass = base.body_mass[1:]; _z = _d.xipos[1:, 2] if base.nbody > 1 else np.array([0.3])
    h_com = float((_mass * _z).sum() / _mass.sum()) if _mass.sum() > 0 else 0.3
    mgh = total_mass * 9.81 * max(h_com, 0.05)
    if kp is None: kp = float(np.clip(max(6.0 * total_mass, 3.0 * mgh), 40.0, 6000.0))
    if not np.isfinite(kp) or kp <= 0:
        raise ValueError("kp must be finite and positive")

    tmp = tempfile.NamedTemporaryFile(suffix=".xml", delete=False); tmp.close()
    mujoco.mj_saveLastXML(tmp.name, base)
    tree = ET.parse(tmp.name); os.unlink(tmp.name)
    root = tree.getroot()
    world = root.find("worldbody")
    name = root.get("model", "robot")

    # options / defaults / assets for a stable, good-looking sim
    opt = root.find("option")
    if opt is None: opt = ET.SubElement(root, "option")
    opt.set("timestep", "0.002"); opt.set("gravity", "0 0 -9.81"); opt.set("integrator", "implicitfast")
    default = ET.SubElement(root, "default")
    # Imported URDF damping/friction remain authoritative. Do not add fictitious
    # rotor inertia or friction to joints whose source does not specify them.
    # robot geoms: collide with the world (floor) but not with each other unless asked.
    # Primitive-built robots overlap at their joints; self-collision there explodes the sim.
    geom_kw = dict(friction="1 0.005 0.0001", condim="3", solref="0.005 1", solimp="0.95 0.99 0.001")
    if not self_collision: geom_kw.update(contype="1", conaffinity="0")
    ET.SubElement(default, "geom", **geom_kw)
    ET.SubElement(default, "position", kp=f"{kp:.9g}")
    asset = ET.SubElement(root, "asset")
    ET.SubElement(asset, "texture", type="skybox", builtin="gradient", rgb1="0.35 0.45 0.6", rgb2="0.05 0.06 0.08", width="256", height="256")
    ET.SubElement(asset, "texture", name="grid", type="2d", builtin="checker", rgb1="0.2 0.25 0.3", rgb2="0.12 0.15 0.19", width="512", height="512")
    ET.SubElement(asset, "material", name="grid", texture="grid", texrepeat="10 10", reflectance="0.15")
    vis = ET.SubElement(root, "visual"); ET.SubElement(vis, "headlight", diffuse="0.7 0.7 0.7", ambient="0.35 0.35 0.35"); ET.SubElement(vis, "global", offwidth="1280", offheight="720")

    # floor + light first in worldbody
    floor = ET.Element("geom", name="floor", type="plane", size="20 20 0.1", material="grid", contype="1", conaffinity="1")
    light = ET.Element("light", pos="1.5 -2 3", dir="-0.4 0.5 -0.8", diffuse="0.9 0.9 0.9", castshadow="true")
    children = list(world)
    for c in children: world.remove(c)
    world.append(light); world.append(floor)
    root_link_name = None
    try:
        _u2 = ET.fromstring(urdf_xml); _ch2 = {j.find("child").get("link") for j in _u2.findall("joint") if j.find("child") is not None}
        root_link_name = next((l.get("name") for l in _u2.findall("link") if l.get("name") not in _ch2), None)
    except Exception: pass
    wrapper_name = root_link_name or f"{name}_base"
    root_bodies = [c for c in children if c.tag == "body"]
    if floating and len(root_bodies) == 1 and root_bodies[0].get("name") == root_link_name:
        # the root link survived as a body (fusestatic off): free it directly instead of wrapping it
        body = root_bodies[0]; body.insert(0, ET.Element("freejoint", name="root"))
        p0 = [float(v) for v in body.get("pos", "0 0 0").split()]; body.set("pos", f"{p0[0]:.4f} {p0[1]:.4f} {p0[2] + lift:.4f}")
        for c in children: world.append(c)
    elif floating:
        body = ET.SubElement(world, "body", name=wrapper_name, pos=f"0 0 {lift:.4f}")
        ET.SubElement(body, "freejoint", name="root")
        for c in children: body.append(c)
    else:
        for c in children: world.append(c)

    # Restore source inertials directly, including products of inertia and RPY.
    # Importer/save round-trips can discard root inertia or inertial orientation.
    source_links = {link.get("name"): link for link in source.findall("link")}
    for body in root.iter("body"):
        link = source_links.get(body.get("name"))
        inertial = link.find("inertial") if link is not None else None
        if inertial is None:
            continue
        mass_node, ie = inertial.find("mass"), inertial.find("inertia")
        if mass_node is None or ie is None:
            raise ValueError(f"Incomplete inertial on {body.get('name')}")
        mass = float(mass_node.get("value", "nan"))
        o = inertial.find("origin")
        xyz = o.get("xyz", "0 0 0") if o is not None else "0 0 0"
        ixx, iyy, izz, ixy, ixz, iyz = (float(ie.get(k, "0")) for k in ("ixx", "iyy", "izz", "ixy", "ixz", "iyz"))
        tensor = np.array([[ixx, ixy, ixz], [ixy, iyy, iyz], [ixz, iyz, izz]])
        roll, pitch, yaw = (float(v) for v in (o.get("rpy", "0 0 0") if o is not None else "0 0 0").split())
        cr, sr, cp, sp, cy, sy = np.cos(roll), np.sin(roll), np.cos(pitch), np.sin(pitch), np.cos(yaw), np.sin(yaw)
        rotation = np.array([[cy*cp, cy*sp*sr-sy*cr, cy*sp*cr+sy*sr], [sy*cp, sy*sp*sr+cy*cr, sy*sp*cr-cy*sr], [-sp, cp*sr, cp*cr]])
        tensor = rotation @ tensor @ rotation.T
        if not np.isfinite(mass) or mass <= 0 or not np.all(np.isfinite(tensor)):
            raise ValueError(f"Invalid inertial on {body.get('name')}")
        full = [tensor[0, 0], tensor[1, 1], tensor[2, 2], tensor[0, 1], tensor[0, 2], tensor[1, 2]]
        for old in body.findall("inertial"):
            body.remove(old)
        ET.SubElement(body, "inertial", pos=xyz, mass=f"{mass:.12g}", fullinertia=" ".join(f"{v:.12g}" for v in full))

    # mesh assets: one meshdir + bare file names, so the MJCF can be relocated (see relativize_meshes)
    meshes = [me for a_ in root.iter("asset") for me in a_.findall("mesh") if me.get("file")]
    dirs = {os.path.dirname(me.get("file")) for me in meshes}
    if meshes and len(dirs) == 1:
        comp = root.find("compiler")
        if comp is None: comp = ET.SubElement(root, "compiler")
        comp.set("meshdir", dirs.pop())
        for me in meshes: me.set("file", os.path.basename(me.get("file")))
    # bodies that carry visual shells: their collision boxes stay physical but are hidden (group 3)
    for body in root.iter("body"):
        geoms = body.findall("geom")
        for g in geoms:
            if g.get("contype", "1") == "0" and g.get("conaffinity", "1") == "0":
                continue
            # Explicit imported attributes can override defaults: set both masks.
            g.set("contype", "1")
            g.set("conaffinity", "1" if self_collision else "0")
        if any(g.get("group") == "1" for g in geoms):
            for g in geoms:
                if g.get("group", "0") == "0": g.set("group", "3")

    # actuators for every hinge/slide joint
    act = ET.SubElement(root, "actuator")
    for j in root.iter("joint"):
        jn = j.get("name"); jt = j.get("type", "hinge")
        if not jn or jt not in ("hinge", "slide"): continue
        rng = j.get("range")
        effort = joint_efforts[jn]
        a = ET.SubElement(act, "position", name=f"act_{jn}", joint=jn,
                          forcelimited="true", forcerange=f"{-effort:.12g} {effort:.12g}")
        if rng: a.set("ctrlrange", rng); a.set("ctrllimited", "true")
    custom = ET.SubElement(root, "custom")
    ET.SubElement(custom, "text", name="ttr_fidelity", data="URDF effort limits enforced; position gains inferred; speed/thermal/electrical limits unmodelled; geometry and hardware uncalibrated")
    if not self_collision:
        warnings.warn("Self-collision disabled: this scene cannot validate part clearance or wearable fit", UserWarning, stacklevel=2)
    xml = ET.tostring(root, encoding="unicode")
    if out:
        with open(out, "w", encoding="utf8") as f: f.write(relativize_meshes(xml, os.path.dirname(os.path.abspath(out))))
    return xml


def relativize_meshes(xml: str, out_dir: str) -> str:
    """Rewrite an absolute compiler meshdir to a path relative to out_dir (for MJCFs saved into a repo)."""
    m = re.search(r'<compiler([^>]*)meshdir="([^"]+)"', xml)
    if not m or not os.path.isabs(m.group(2)): return xml
    rel = os.path.relpath(m.group(2), out_dir)
    return xml.replace(f'meshdir="{m.group(2)}"', f'meshdir="{rel}"', 1)


def load_model(path_or_xml: str, **kw):
    """Load a URDF (converted on the fly) or an MJCF string/path into MjModel."""
    if path_or_xml.lstrip().startswith("<"):
        return mujoco.MjModel.from_xml_string(path_or_xml)
    if path_or_xml.endswith(".urdf"):
        return mujoco.MjModel.from_xml_string(urdf_to_mjcf(path_or_xml, **kw))
    return mujoco.MjModel.from_xml_path(path_or_xml)
