"""Headless MuJoCo rendering (OSMesa/EGL) to GIF or PNG frames."""
import os
os.environ.setdefault("MUJOCO_GL", "osmesa")
import numpy as np
import mujoco
from PIL import Image
from .convert import load_model
from .testbench import _hold_targets


def render_gif(path_or_xml: str, out_gif: str, seconds: float = 4.0, fps: int = 20, width: int = 640, height: int = 400,
               motion: str = "sweep", floating=None, azimuth: float = 135, elevation: float = -18, label: str | None = None, unpowered: bool = False, orbit: float = 0.0, zoom: float = 1.0, focus: str | None = None):
    """motion: 'sweep' (sinusoidal actuator sweep), 'hold' (stand still under gravity), 'drop' (fall from height)."""
    m = load_model(path_or_xml, floating=floating) if path_or_xml.endswith(".urdf") else load_model(path_or_xml)
    if unpowered: m.actuator_gainprm[:, 0] = 0.0; m.actuator_biasprm[:, :] = 0.0
    d = mujoco.MjData(m); mujoco.mj_forward(m, d)
    # armour hinges (closed = 0, open = the non-zero limit) and their donning order
    import re as _re
    act_names = [mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_ACTUATOR, a) or "" for a in range(m.nu)]
    hinge = np.array([n.endswith("_hinge") for n in act_names])
    open_pose = np.zeros(m.nu)
    for a, n in enumerate(act_names):
        if hinge[a]:
            lo_a, hi_a = m.actuator_ctrlrange[a]; open_pose[a] = lo_a if abs(lo_a) > abs(hi_a) else hi_a
    def don_order(n):  # 0 = first to close ... 1 = last (faceplate)
        n = n.lower()
        if "faceplate" in n: return 1.0
        if any(k in n for k in ("finger", "thumb", "gauntlet", "elbow", "bicep", "pauldron", "hand")): return 0.72
        if any(k in n for k in ("chest", "back_door", "air_brake", "ab_plate", "codpiece", "belt", "lat")): return 0.5
        if any(k in n for k in ("hip_flap", "thigh", "knee")): return 0.3
        return 0.1  # boots, shins, ankle
    order = np.array([don_order(n) for n in act_names])
    if motion == "drop" and m.nq and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE: d.qpos[2] += 0.5
    base = _hold_targets(m, d)
    import re as _re
    leg_mask = np.array([bool(_re.search(r"hip|knee|ankle|thigh|shin|foot|coxa|femur|tibia", mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_ACTUATOR, a) or "")) for a in range(m.nu)]) if m.nu else np.zeros(0, bool)
    if label: label = label.replace("{nu}", str(m.nu))
    r = mujoco.Renderer(m, height, width)
    cam = mujoco.MjvCamera(); mujoco.mjv_defaultFreeCamera(m, cam)
    # frame on the robot's bodies (ignore the 20 m floor plane)
    bodies = np.array([d.xpos[b] for b in range(1, m.nbody)]) if m.nbody > 1 else np.zeros((1, 3))
    lo, hi = bodies.min(0), bodies.max(0); size = float(np.max(hi - lo)) + 0.3
    cam.lookat[:] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, max(0.05, (lo[2] + hi[2]) / 2 + 0.06 * size)]
    cam.distance = max(0.6, size * 1.45) * zoom; cam.azimuth, cam.elevation = azimuth, elevation
    focus_id = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, focus) if focus else -1
    if focus_id >= 0:   # close-up on one body (e.g. the helmet): follow it every frame
        cam.distance = 0.9 * zoom
    frames = []; n = int(seconds * fps); sub = max(1, int(1 / (fps * m.opt.timestep)))
    for i in range(n):
        t = i / fps
        if motion in ("don", "doff", "open") and m.nu:
            # progress 0..1 over the clip: each hinge closes (or opens) in a 20 % window at its turn
            prog = min(1.0, t / max(1e-6, seconds * 0.85))
            k = np.clip((prog - order * 0.8) / 0.2, 0, 1)                  # per-hinge closing fraction
            if motion == "doff": k = 1 - k
            if motion == "open": k = np.zeros_like(k)
            d.ctrl[:] = np.where(hinge, open_pose * (1 - k) + 0.0 * k, base)  # frame joints hold; plates travel
        elif motion == "sweep" and m.nu:
            lo = np.where(m.actuator_ctrllimited, m.actuator_ctrlrange[:, 0], -1); hi = np.where(m.actuator_ctrllimited, m.actuator_ctrlrange[:, 1], 1)
            mid, span = (lo + hi) / 2, (hi - lo) / 2 * 0.35
            floating = bool(m.nq and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE)
            amp, hz = (0.35, 0.25) if floating else (1.0, 0.4)   # gentle + slow on a free base so momentum stays small
            sweep = base + span * amp * np.sin(2 * np.pi * hz * t + np.arange(m.nu) * 0.7)
            # keep the legs holding so a legged robot stays standing while the upper body moves
            d.ctrl[:] = np.where(leg_mask, base, np.clip(sweep, lo, hi))
        else:
            d.ctrl[:] = base
        for _ in range(sub): mujoco.mj_step(m, d)
        if orbit: cam.azimuth = azimuth + orbit * (i / max(1, n - 1))
        if focus_id >= 0: cam.lookat[:] = d.xpos[focus_id]
        r.update_scene(d, cam); img = Image.fromarray(r.render())
        if label:
            from PIL import ImageDraw
            dr = ImageDraw.Draw(img); dr.rectangle([0, height - 22, width, height], fill=(0, 0, 0)); dr.text((8, height - 19), label, fill=(160, 230, 190))
        frames.append(img)
    r.close()
    frames[0].save(out_gif, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, optimize=True)
    return out_gif


def render_task_gif(urdf: str, spec, out_gif: str, width: int = 640, height: int = 400, fps: int = 20, azimuth: float = 135,
                    elevation: float = -18, zoom: float = 1.0, label: str | None = None):
    """Play the arm payload-hold task (tasks.arm_payload_hold): the payload (red box) at the TCP,
    home -> arm stretched out -> hold -> home, with the live shoulder torque vs its ratings."""
    import warnings
    from PIL import ImageDraw
    from .actuators import load_spec
    from .convert import urdf_to_mjcf
    from .tasks import Layout, Rig, _with_payload, _min_jerk, _clip_pose, HOLD_S
    spec = load_spec(spec); design = (spec.get("metadata") or {}).get("design") or {}
    payload = float((design.get("performance") or {}).get("payload_kg") or 0.0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore"); xml = urdf_to_mjcf(urdf, floating=False, spec=spec)
    lay = Layout(mujoco.MjModel.from_xml_string(xml), spec, design)
    m, _ = _with_payload(xml, lay.tcp_body, lay.tcp_local, payload)
    rig = Rig(m, feedforward=True); mujoco.mj_forward(m, rig.d)
    pose = _clip_pose(m, rig, {lay.shoulder: np.pi / 2} if lay.shoulder else {})
    q0 = rig.q(); q1 = q0.copy()
    for i, A in enumerate(rig.acts):
        if A["joint"] in pose: q1[i] = pose[A["joint"]]
    T = 2.0; plan = [(q0, q1, T), (q1, q1, HOLD_S), (q1, q0, T)]
    sh = rig.by_joint(lay.shoulder) if lay.shoulder else None
    r = mujoco.Renderer(m, height, width); cam = mujoco.MjvCamera(); mujoco.mjv_defaultFreeCamera(m, cam)
    from .tasks import _tcp_world
    span = max(0.15, float(np.linalg.norm(_tcp_world(m, rig.d, lay.tcp_body, lay.tcp_local))))
    cam.lookat[:] = [0, 0, 0.2 * span]; cam.distance = 2.0 * span * zoom
    cam.azimuth, cam.elevation = azimuth, elevation
    frames = []; sub = max(1, int(1 / (fps * m.opt.timestep)))
    for qa, qb, dur in plan:
        t0 = rig.t; k = 0
        while rig.t - t0 < dur:
            s_, ds, dds = _min_jerk(rig.t - t0, dur)
            rig.step(qa + (qb - qa) * s_, (qb - qa) * ds, (qb - qa) * dds, log=False); k += 1
            if k % sub: continue
            r.update_scene(rig.d, cam); img = Image.fromarray(r.render())
            text = label or f"{payload:g} kg payload hold"
            if sh:
                tau = abs(float(rig.d.actuator_force[sh['index']]))
                text += f" | {lay.shoulder} {tau:.2f} N m = {tau / sh['peak']:.0%} peak" + (f", {tau / sh['rated']:.0%} rated" if sh["rated"] else "")
            dr = ImageDraw.Draw(img); dr.rectangle([0, height - 22, width, height], fill=(0, 0, 0)); dr.text((8, height - 19), text, fill=(160, 230, 190))
            frames.append(img)
    r.close()
    frames[0].save(out_gif, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, optimize=True)
    return out_gif
