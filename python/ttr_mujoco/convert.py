"""URDF -> actuated MuJoCo MJCF scene (floor, light, position actuators, optional free base)."""
import os, re, tempfile
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
    if floating is None:
        floating = _guess_floating(urdf_xml)
    base = mujoco.MjModel.from_xml_path(urdf_path)
    lift = max(0.0, -_lowest_point(base)) + 0.005 if floating else 0.0
    total_mass = float(sum(base.body_mass))
    try:  # the static root link's mass is dropped by the URDF importer; count it when the base floats
        _u = ET.fromstring(urdf_xml); _ch = {j.find("child").get("link") for j in _u.findall("joint") if j.find("child") is not None}
        _root = next((l for l in _u.findall("link") if l.get("name") not in _ch), None)
        if floating and _root is not None and _root.find("inertial/mass") is not None: total_mass += float(_root.find("inertial/mass").get("value", "0"))
    except Exception: pass
    # Servo stiffness must beat the inverted-pendulum "negative stiffness" m*g*h_com for a
    # standing robot to be statically stable under position control (real joint modules are).
    _d = mujoco.MjData(base); mujoco.mj_forward(base, _d)
    _mass = base.body_mass[1:]; _z = _d.xipos[1:, 2] if base.nbody > 1 else np.array([0.3])
    h_com = float((_mass * _z).sum() / _mass.sum()) if _mass.sum() > 0 else 0.3
    mgh = total_mass * 9.81 * max(h_com, 0.05)
    if kp is None: kp = float(np.clip(max(6.0 * total_mass, 3.0 * mgh), 40.0, 6000.0))
    fmax = float(np.clip(max(8.0 * total_mass, 1.2 * mgh), 60.0, 3000.0))

    tmp = tempfile.NamedTemporaryFile(suffix=".xml", delete=False); tmp.close()
    mujoco.mj_saveLastXML(tmp.name, base)
    tree = ET.parse(tmp.name); os.unlink(tmp.name)
    root = tree.getroot()
    world = root.find("worldbody")
    name = root.get("model", "robot")

    # options / defaults / assets for a stable, good-looking sim
    opt = root.find("option") or ET.SubElement(root, "option")
    opt.set("timestep", "0.002"); opt.set("gravity", "0 0 -9.81"); opt.set("integrator", "implicitfast")
    default = ET.SubElement(root, "default")
    ET.SubElement(default, "joint", damping="0.6", armature="0.01", frictionloss="0.05")
    # robot geoms: collide with the world (floor) but not with each other unless asked.
    # Primitive-built robots overlap at their joints; self-collision there explodes the sim.
    geom_kw = dict(friction="1 0.005 0.0001", condim="3", solref="0.005 1", solimp="0.95 0.99 0.001")
    if not self_collision: geom_kw.update(contype="1", conaffinity="0")
    ET.SubElement(default, "geom", **geom_kw)
    ET.SubElement(default, "position", kp=f"{kp:.1f}", forcerange=f"-{fmax:.0f} {fmax:.0f}")
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
    if floating:
        body = ET.SubElement(world, "body", name=wrapper_name, pos=f"0 0 {lift:.4f}")
        ET.SubElement(body, "freejoint", name="root")
        for c in children: body.append(c)
    else:
        for c in children: world.append(c)

    # preserve the URDF's designed masses/inertias: mj_saveLastXML omits <inertial>,
    # and MuJoCo would otherwise re-derive mass from geometry at 1000 kg/m^3.
    for body in root.iter("body"):
        bn = body.get("name")
        if not bn: continue
        bid = mujoco.mj_name2id(base, mujoco.mjtObj.mjOBJ_BODY, bn)
        if bid < 0 or base.body_mass[bid] <= 0: continue
        if body.find("inertial") is not None: continue
        ipos = base.body_ipos[bid]; iq = base.body_iquat[bid]; I = base.body_inertia[bid]
        ET.SubElement(body, "inertial", pos=f"{ipos[0]:.6g} {ipos[1]:.6g} {ipos[2]:.6g}",
                      quat=f"{iq[0]:.6g} {iq[1]:.6g} {iq[2]:.6g} {iq[3]:.6g}",
                      mass=f"{base.body_mass[bid]:.6g}", diaginertia=f"{I[0]:.6g} {I[1]:.6g} {I[2]:.6g}")
    # the URDF importer drops the (static) root link's inertial; when we make the base
    # floating, read it back from the URDF so the base body is not massless/geometry-derived.
    if floating:
        wrapper = world.find(f"body[@name='{wrapper_name}']")
        u = ET.fromstring(urdf_xml)
        children = {j.find("child").get("link") for j in u.findall("joint") if j.find("child") is not None}
        root_link = next((l for l in u.findall("link") if l.get("name") not in children), None)
        inertial = root_link.find("inertial") if root_link is not None else None
        if wrapper is not None and inertial is not None and wrapper.find("inertial") is None:
            mass = float(inertial.find("mass").get("value", "0"))
            o = inertial.find("origin"); xyz = (o.get("xyz", "0 0 0") if o is not None else "0 0 0")
            ie = inertial.find("inertia")
            ixx, iyy, izz = (float(ie.get(k, "0")) for k in ("ixx", "iyy", "izz")) if ie is not None else (1e-4, 1e-4, 1e-4)
            if mass > 0:
                ET.SubElement(wrapper, "inertial", pos=xyz, mass=f"{mass:.6g}", diaginertia=f"{max(ixx,1e-6):.6g} {max(iyy,1e-6):.6g} {max(izz,1e-6):.6g}")

    # actuators for every hinge/slide joint
    act = ET.SubElement(root, "actuator")
    for j in root.iter("joint"):
        jn = j.get("name"); jt = j.get("type", "hinge")
        if not jn or jt not in ("hinge", "slide"): continue
        rng = j.get("range")
        a = ET.SubElement(act, "position", name=f"act_{jn}", joint=jn)
        if rng: a.set("ctrlrange", rng); a.set("ctrllimited", "true")
    xml = ET.tostring(root, encoding="unicode")
    if out:
        with open(out, "w", encoding="utf8") as f: f.write(xml)
    return xml


def load_model(path_or_xml: str, **kw):
    """Load a URDF (converted on the fly) or an MJCF string/path into MjModel."""
    if path_or_xml.lstrip().startswith("<"):
        return mujoco.MjModel.from_xml_string(path_or_xml)
    if path_or_xml.endswith(".urdf"):
        return mujoco.MjModel.from_xml_string(urdf_to_mjcf(path_or_xml, **kw))
    return mujoco.MjModel.from_xml_path(path_or_xml)
