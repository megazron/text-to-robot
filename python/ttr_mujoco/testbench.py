"""Simulation test battery for a generated robot in MuJoCo. Every test is a real
physics rollout; nothing is faked. Returns a JSON-able report."""
import numpy as np
import hashlib
import mujoco
from .convert import load_model


def _finite(d):
    # MuJoCo may reset divergent state back to finite values; warnings still
    # record that failure. A reset must never turn an unstable rollout into PASS.
    bad = (mujoco.mjtWarning.mjWARN_BADQPOS, mujoco.mjtWarning.mjWARN_BADQVEL, mujoco.mjtWarning.mjWARN_BADQACC)
    return bool(np.all(np.isfinite(d.qpos)) and np.all(np.isfinite(d.qvel))
                and all(d.warning[w].number == 0 for w in bad))
def _up(m, d):
    """world-z component of the base body's local z axis (1 = upright), or None if fixed base"""
    if m.nq and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE:
        q = d.qpos[3:7]; R = np.zeros(9); mujoco.mju_quat2Mat(R, q); return float(R[8])
    return None


def _velocity_actuator(m, a):
    return bool(m.actuator_biasprm[a, 1] == 0 and m.actuator_biasprm[a, 2] != 0)


def _actuator_state(m, d, a):
    j = m.actuator_trnid[a][0]
    return float(d.qvel[m.jnt_dofadr[j]]) if _velocity_actuator(m,a) else float(d.qpos[m.jnt_qposadr[j]])


def _hold_targets(m, d):
    """position-actuator targets that hold the current joint configuration"""
    t = np.zeros(m.nu)
    for a in range(m.nu):
        t[a] = 0.0 if _velocity_actuator(m,a) else _actuator_state(m,d,a)
    return t


def run_tests(path_or_xml: str, floating=None, seconds: float = 2.0, verbose: bool = True, self_collision: bool = False) -> dict:
    if not np.isfinite(seconds) or seconds <= 0:
        raise ValueError("seconds must be finite and positive")
    m = load_model(path_or_xml, floating=floating, self_collision=self_collision) if path_or_xml.endswith(".urdf") else load_model(path_or_xml)
    d = mujoco.MjData(m)
    steps = int(seconds / m.opt.timestep)
    R = {"model": path_or_xml if not path_or_xml.lstrip().startswith("<") else f"<inline mjcf, {len(path_or_xml)} chars>", "nbody": m.nbody, "njnt": m.njnt, "nu": m.nu, "ngeom": m.ngeom,
         "floating": bool(m.nq and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE), "tests": {}}
    R["validation_scope"] = "simulation smoke tests, not hardware or wearable qualification"
    R["mujoco_version"] = mujoco.__version__
    if path_or_xml.lstrip().startswith("<"):
        R["model_sha256"] = hashlib.sha256(path_or_xml.encode()).hexdigest()
    R["limitations"] = ["No measured motor, material, thermal or battery model", "No manufacturing or human-fit validation"]
    physical = [g for g in range(m.ngeom) if m.geom_type[g] != mujoco.mjtGeom.mjGEOM_PLANE
                and (m.geom_contype[g] or m.geom_conaffinity[g])]
    enabled = any((m.geom_contype[a] & m.geom_conaffinity[b]) or (m.geom_contype[b] & m.geom_conaffinity[a])
                  for i, a in enumerate(physical) for b in physical[i+1:] if m.geom_bodyid[a] != m.geom_bodyid[b])
    R["self_collision_masks_enabled"] = bool(enabled)
    if not enabled: R["limitations"].append("Robot self-collision disabled; interference is not validated")
    def rec(name, ok, **metrics):
        R["tests"][name] = {"pass": bool(ok), **metrics}
        if verbose: print(f"  {'PASS' if ok else 'FAIL'}  {name:22s} " + "  ".join(f"{k}={v}" for k, v in metrics.items()))

    # 1. compile + static sanity
    mujoco.mj_forward(m, d)
    mass = float(sum(m.body_mass)); rec("compile", m.nbody > 1 and m.nu > 0, total_mass_kg=round(mass, 3), actuators=m.nu)
    penetrations = []
    for contact in d.contact:
        a, b = int(contact.geom1), int(contact.geom2)
        if contact.dist < -0.001 and m.geom_type[a] != mujoco.mjtGeom.mjGEOM_PLANE and m.geom_type[b] != mujoco.mjtGeom.mjGEOM_PLANE:
            penetrations.append({"body1": mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_BODY, int(m.geom_bodyid[a])),
                                 "body2": mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_BODY, int(m.geom_bodyid[b])),
                                 "depth_m": round(float(-contact.dist), 6)})
    if enabled: rec("initial_clearance", not penetrations, penetrations=penetrations[:50], count=len(penetrations))

    # 2. drop / settle: hold initial pose, let gravity act, must stay finite and not explode
    mujoco.mj_resetData(m, d); d.ctrl[:] = _hold_targets(m, d)
    z0 = float(d.qpos[2]) if R["floating"] else None
    maxv = 0.0
    for _ in range(steps):
        mujoco.mj_step(m, d); maxv = max(maxv, float(np.max(np.abs(d.qvel))) if m.nv else 0.0)
        if not _finite(d): break
    up = _up(m, d)
    rec("settle_under_gravity", _finite(d) and maxv < 50 and (up is None or up > 0.5), max_joint_speed=round(maxv, 2),
        base_drop_m=None if z0 is None else round(z0 - float(d.qpos[2]), 3), upright=None if up is None else round(up, 3))

    # 3. pose hold: how far do joints drift from their targets while holding
    mujoco.mj_resetData(m, d)
    q_target = _hold_targets(m, d)
    d.ctrl[:] = q_target
    err = 0.0
    for _ in range(steps):
        mujoco.mj_step(m, d)
    for a in range(m.nu):
        j = m.actuator_trnid[a][0]; err = max(err, abs(_actuator_state(m,d,a) - q_target[a]))
    rec("hold_pose", _finite(d) and err < 0.6, max_joint_error_rad=round(err, 3))

    # 4. actuator sweep: every actuator through 60% of its range; must track and stay finite
    mujoco.mj_resetData(m, d); base = _hold_targets(m, d)
    worst = 0.0; tracked = 0; actuator_results = []
    sweep_finite = True
    for a in range(m.nu):
        mujoco.mj_resetData(m, d)
        lo, hi = (m.actuator_ctrlrange[a] if m.actuator_ctrllimited[a] else (-1.0, 1.0))
        mid, span = (lo + hi) / 2, (hi - lo) / 2 * 0.6
        j = m.actuator_trnid[a][0]; qi = m.jnt_qposadr[j]
        errors = []; peak_force = 0.0
        for k in range(int(1.0 / m.opt.timestep)):
            d.ctrl[:] = base; d.ctrl[a] = mid + span * np.sin(2 * np.pi * k * m.opt.timestep)
            mujoco.mj_step(m, d)
            errors.append(_actuator_state(m,d,a) - float(d.ctrl[a]))
            peak_force = max(peak_force, abs(float(d.actuator_force[a])))
            if not _finite(d):
                sweep_finite = False
                break
        # A stalled actuator can end a sinusoid at its target. Measure the whole
        # trajectory, not only that final sample. These are explicit smoke-test
        # tolerances, not hardware accuracy specifications.
        rms = float(np.sqrt(np.mean(np.square(errors))))
        peak = max(abs(e) for e in errors); worst = max(worst, peak)
        linear = m.jnt_type[j] == mujoco.mjtJoint.mjJNT_SLIDE
        tolerance = .5 if _velocity_actuator(m,a) else .01 if linear else .15
        ok = _finite(d) and rms <= tolerance; tracked += ok
        actuator_results.append({"actuator": m.actuator(a).name, "joint": m.joint(j).name,
            "pass": bool(ok), "rms_error": round(rms, 6), "peak_error": round(peak, 6),
            "error_unit": "rad/s" if _velocity_actuator(m,a) else "m" if linear else "rad", "rms_tolerance": tolerance,
            "peak_actuator_force": round(peak_force, 6), "force_unit": "N" if linear else "N m"})
    rec("actuator_sweep", sweep_finite and _finite(d) and tracked == m.nu, tracked=f"{tracked}/{m.nu}",
        worst_error=round(worst, 3))
    R["tests"]["actuator_sweep"]["actuators"] = actuator_results

    # 5. disturbance (floating only): shove the base, see if it recovers/stays finite
    if R["floating"]:
        mujoco.mj_resetData(m, d); d.ctrl[:] = _hold_targets(m, d)
        for _ in range(int(0.5 / m.opt.timestep)): mujoco.mj_step(m, d)
        d.qvel[0] += 1.0  # 1 m/s lateral shove
        for _ in range(steps): mujoco.mj_step(m, d)
        up2 = _up(m, d)
        rec("disturbance_recovery", _finite(d) and up2 is not None and up2 > 0.5, upright_after=round(up2, 3) if up2 is not None else None,
            note="upright>0.5 means it did not fall" )
    R["passed"] = sum(1 for t in R["tests"].values() if t["pass"]); R["total"] = len(R["tests"])
    if verbose: print(f"  => {R['passed']}/{R['total']} simulation tests passed")
    return R
