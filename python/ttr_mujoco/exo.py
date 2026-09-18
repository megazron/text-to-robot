"""Put a human inside a wearable exoskeleton in MuJoCo.

`add_wearer(mjcf_xml)` adds a passive capsule mannequin (Winter anthropometrics,
75 kg / 1.75 m by default) whose segments are WELDED to the exoskeleton's cuffs
(equality constraints), exactly like straps. The mannequin has its own passive
joints, so the suit must carry and move the wearer. `assist_test` compares the
suit powered vs unpowered with the wearer inside."""
import xml.etree.ElementTree as ET
import numpy as np
import mujoco

# segment mass fractions and lengths as fraction of height (Winter, 2009)
SEG = {  # name: (mass_frac, length_frac, radius_m)
    "pelvis": (0.142, 0.10, 0.11), "torso": (0.355, 0.288, 0.13), "head": (0.081, 0.13, 0.10),
    "thigh": (0.100, 0.245, 0.075), "shank": (0.0465, 0.246, 0.05), "foot": (0.0145, 0.152, 0.035),
    "upper_arm": (0.028, 0.186, 0.045), "forearm": (0.016, 0.146, 0.035), "hand": (0.006, 0.108, 0.035),
}
# exo cuff (weld target) -> mannequin segment, and where the mannequin segment sits (exo link -> local offset of the wearer's limb axis)
WELDS = [("pelvis_frame", "w_pelvis"), ("spine_frame", "w_torso"), ("helmet", "w_head"),
         ("{s}_thigh_cuff", "w_{s}_thigh"), ("{s}_shank_cuff", "w_{s}_shank"), ("{s}_boot", "w_{s}_foot"),
         ("{s}_upper_arm_cuff", "w_{s}_upper_arm"), ("{s}_forearm_cuff", "w_{s}_forearm"), ("{s}_hand", "w_{s}_hand")]


def _capsule(parent, name, mass, length, radius, pos, axis="down", rgba="0.86 0.72 0.6 1"):
    b = ET.SubElement(parent, "body", name=name, pos=pos)
    half = max(0.005, length / 2 - radius)
    fromto = f"0 0 0 0 0 {-length:.4f}" if axis == "down" else f"0 0 0 {length:.4f} 0 0"
    ET.SubElement(b, "geom", type="capsule", fromto=fromto, size=f"{radius:.4f}", mass=f"{mass:.4f}", rgba=rgba, contype="0", conaffinity="0")
    return b


def add_wearer(mjcf_xml: str, height: float = 1.75, mass: float = 75.0) -> str:
    """Return MJCF with a passive mannequin welded to the exoskeleton cuffs."""
    root = ET.fromstring(mjcf_xml)
    world = root.find("worldbody")
    names = {b.get("name") for b in root.iter("body")}
    if "pelvis_frame" not in names and not any(n and n.endswith("pelvis_frame") for n in names):
        raise ValueError("model has no pelvis_frame: not a wearable exoskeleton")
    H = height
    ankleZ = 0.045 * H / 1.75 + 0.06; shank = SEG["shank"][1] * H; thigh = SEG["thigh"][1] * H
    kneeZ = ankleZ + shank; hipZ = kneeZ + thigh; shoulderZ = hipZ + SEG["torso"][1] * H
    uarm = SEG["upper_arm"][1] * H; farm = SEG["forearm"][1] * H
    m = lambda k: SEG[k][0] * mass
    skin = "0.86 0.72 0.6 1"

    # ---- a properly proportioned adult (Winter segment lengths/masses; widths from anthropometric tables) ----
    skin = "0.87 0.72 0.60 1"; dark = "0.16 0.11 0.08 1"
    shoulderW = 0.205 * H   # biacromial half-width ~0.205H total -> half 0.18
    hipHalf = 0.09; neck = 0.052 * H; torsoLen = shoulderZ - hipZ
    pel = ET.SubElement(world, "body", name="w_pelvis", pos=f"0 0 {hipZ:.4f}")
    ET.SubElement(pel, "freejoint", name="wearer_root")
    ET.SubElement(pel, "geom", type="capsule", fromto=f"0 {-hipHalf:.3f} 0.02 0 {hipHalf:.3f} 0.02", size="0.095", mass=f"{m('pelvis'):.3f}", rgba=skin, contype="0", conaffinity="0")
    tor = ET.SubElement(pel, "body", name="w_torso", pos="0 0 0.06")
    ET.SubElement(tor, "joint", name="w_trunk", type="hinge", axis="0 1 0", range="-0.4 0.6", damping="2")
    # abdomen (narrower) + chest (wider, flatter) + clavicles
    ET.SubElement(tor, "geom", type="capsule", fromto=f"0 0 0.02 0 0 {torsoLen*0.42:.4f}", size="0.105", mass=f"{m('torso')*0.4:.3f}", rgba=skin, contype="0", conaffinity="0")
    ET.SubElement(tor, "geom", type="box", size=f"0.095 {shoulderW*0.5*0.9:.3f} {torsoLen*0.22:.4f}", pos=f"0 0 {torsoLen*0.68:.4f}", mass=f"{m('torso')*0.5:.3f}", rgba=skin, contype="0", conaffinity="0")
    ET.SubElement(tor, "geom", type="capsule", fromto=f"0 {-shoulderW*0.5:.3f} {torsoLen*0.93:.4f} 0 {shoulderW*0.5:.3f} {torsoLen*0.93:.4f}", size="0.045", mass=f"{m('torso')*0.1:.3f}", rgba=skin, contype="0", conaffinity="0")
    # neck + head with a simple face (eyes) so it reads as a person
    head = ET.SubElement(tor, "body", name="w_head", pos=f"0.01 0 {torsoLen*0.93+0.03:.4f}")
    ET.SubElement(head, "geom", type="capsule", fromto=f"0 0 0 0 0 {neck:.4f}", size="0.05", mass=f"{m('head')*0.15:.3f}", rgba=skin, contype="0", conaffinity="0")
    ET.SubElement(head, "geom", type="capsule", fromto=f"0 0 {neck+0.04:.4f} 0 0 {neck+0.13:.4f}", size="0.085", mass=f"{m('head')*0.85:.3f}", rgba=skin, contype="0", conaffinity="0")
    ET.SubElement(head, "geom", type="sphere", size="0.012", pos=f"0.078 0.032 {neck+0.11:.4f}", rgba=dark, contype="0", conaffinity="0")
    ET.SubElement(head, "geom", type="sphere", size="0.012", pos=f"0.078 -0.032 {neck+0.11:.4f}", rgba=dark, contype="0", conaffinity="0")
    ET.SubElement(head, "geom", type="capsule", fromto=f"-0.03 -0.07 {neck+0.13:.4f} -0.03 0.07 {neck+0.13:.4f}", size="0.06", mass="0.2", rgba=dark, contype="0", conaffinity="0")  # hair
    for s, sign in (("left", 1), ("right", -1)):
        # legs: thigh tapers into the shank; feet as flat boxes with a heel
        th = ET.SubElement(pel, "body", name=f"w_{s}_thigh", pos=f"0 {sign*0.09:.3f} 0")
        ET.SubElement(th, "joint", name=f"w_{s}_hip", type="hinge", axis="0 1 0", range="-0.6 2.0", damping="1.5")
        ET.SubElement(th, "geom", type="capsule", fromto=f"0 0 -0.02 0 0 {-thigh+0.04:.4f}", size="0.078", mass=f"{m('thigh'):.3f}", rgba=skin, contype="0", conaffinity="0")
        sh = ET.SubElement(th, "body", name=f"w_{s}_shank", pos=f"0 0 {-thigh:.4f}")
        ET.SubElement(sh, "joint", name=f"w_{s}_knee", type="hinge", axis="0 1 0", range="-2.2 0.05", damping="1.5")
        ET.SubElement(sh, "geom", type="capsule", fromto=f"0 0 -0.02 0 0 {-shank+0.03:.4f}", size="0.055", mass=f"{m('shank'):.3f}", rgba=skin, contype="0", conaffinity="0")
        ft = ET.SubElement(sh, "body", name=f"w_{s}_foot", pos=f"0 0 {-shank:.4f}")
        ET.SubElement(ft, "joint", name=f"w_{s}_ankle", type="hinge", axis="0 1 0", range="-0.6 0.6", damping="1")
        ET.SubElement(ft, "geom", type="box", size="0.125 0.045 0.022", pos=f"0.055 0 {-ankleZ+0.022:.4f}", mass=f"{m('foot'):.3f}", rgba=skin, contype="0", conaffinity="0")
        # arms: hang from the clavicles; upper arm thicker than forearm; hand as a flat box with a thumb
        ua = ET.SubElement(tor, "body", name=f"w_{s}_upper_arm", pos=f"0 {sign*(shoulderW*0.5+0.02):.3f} {torsoLen*0.9:.4f}")
        ET.SubElement(ua, "joint", name=f"w_{s}_shoulder", type="hinge", axis="0 1 0", range="-1.0 3.0", damping="1")
        ET.SubElement(ua, "geom", type="capsule", fromto=f"0 0 -0.02 0 0 {-uarm+0.03:.4f}", size="0.046", mass=f"{m('upper_arm'):.3f}", rgba=skin, contype="0", conaffinity="0")
        fa = ET.SubElement(ua, "body", name=f"w_{s}_forearm", pos=f"0 0 {-uarm:.4f}")
        ET.SubElement(fa, "joint", name=f"w_{s}_elbow", type="hinge", axis="0 1 0", range="-2.4 0.05", damping="1")
        ET.SubElement(fa, "geom", type="capsule", fromto=f"0 0 -0.02 0 0 {-farm+0.02:.4f}", size="0.037", mass=f"{m('forearm'):.3f}", rgba=skin, contype="0", conaffinity="0")
        hd = ET.SubElement(fa, "body", name=f"w_{s}_hand", pos=f"0 0 {-farm:.4f}")
        ET.SubElement(hd, "geom", type="box", size="0.045 0.038 0.012", pos="0.015 0 -0.05", mass=f"{m('hand')*0.8:.3f}", rgba=skin, contype="0", conaffinity="0")
        ET.SubElement(hd, "geom", type="capsule", fromto=f"0.0 {sign*0.03:.3f} -0.03 0.05 {sign*0.055:.3f} -0.04", size="0.011", mass=f"{m('hand')*0.2:.3f}", rgba=skin, contype="0", conaffinity="0")

    # straps: weld each mannequin segment to the exo link it is strapped to
    eq = root.find("equality") or ET.SubElement(root, "equality")
    def exo_name(pattern, s):
        n = pattern.format(s=s)
        for cand in (n, f"{n}"):
            if cand in names: return cand
        # floating wrapper renames nothing, but the root link may live on the wrapper body
        for b in names:
            if b and b.endswith(n): return b
        return None
    for pat, wpat in WELDS:
        sides = ("left", "right") if "{s}" in pat else ("",)
        for s in sides:
            en = exo_name(pat, s); wn = wpat.format(s=s)
            if en: ET.SubElement(eq, "weld", body1=en, body2=wn, solref="0.02 1", solimp="0.9 0.95 0.001")
    return ET.tostring(root, encoding="unicode")


def assist_test(mjcf_with_wearer: str, seconds: float = 2.5) -> dict:
    """Does the powered suit hold the wearer up, and does it collapse unpowered?"""
    out = {}
    for label, powered in (("powered", True), ("unpowered", False)):
        m = mujoco.MjModel.from_xml_string(mjcf_with_wearer); d = mujoco.MjData(m)
        if not powered:
            m.actuator_gainprm[:, 0] = 0.0; m.actuator_biasprm[:, :] = 0.0   # motors off
        mujoco.mj_forward(m, d)
        # hold current joint targets
        for a in range(m.nu):
            j = m.actuator_trnid[a][0]; d.ctrl[a] = d.qpos[m.jnt_qposadr[j]]
        wid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "w_head")
        z0 = float(d.xpos[wid][2])
        for _ in range(int(seconds / m.opt.timestep)): mujoco.mj_step(m, d)
        z1 = float(d.xpos[wid][2])
        torques = np.abs(d.actuator_force) if m.nu else np.zeros(0)
        out[label] = {"wearer_head_z_start": round(z0, 3), "wearer_head_z_end": round(z1, 3), "head_drop_m": round(z0 - z1, 3),
                      "finite": bool(np.all(np.isfinite(d.qpos))), "max_actuator_torque_Nm": round(float(torques.max()), 1) if m.nu else 0.0}
    out["suit_supports_wearer"] = out["powered"]["head_drop_m"] < 0.10 and out["unpowered"]["head_drop_m"] > out["powered"]["head_drop_m"] + 0.15
    return out
