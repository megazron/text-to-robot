"""Simulation test battery for a generated robot in MuJoCo. Every test is a real
physics rollout; nothing is faked. Returns a JSON-able report."""
import numpy as np
import mujoco
from .convert import load_model


def _finite(d): return bool(np.all(np.isfinite(d.qpos)) and np.all(np.isfinite(d.qvel)))
def _up(m, d):
    """world-z component of the base body's local z axis (1 = upright), or None if fixed base"""
    if m.nq and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE:
        q = d.qpos[3:7]; R = np.zeros(9); mujoco.mju_quat2Mat(R, q); return float(R[8])
    return None


def _hold_targets(m, d):
    """position-actuator targets that hold the current joint configuration"""
    t = np.zeros(m.nu)
    for a in range(m.nu):
        j = m.actuator_trnid[a][0]; t[a] = d.qpos[m.jnt_qposadr[j]]
    return t


def run_tests(path_or_xml: str, floating=None, seconds: float = 2.0, verbose: bool = True) -> dict:
    m = load_model(path_or_xml, floating=floating) if path_or_xml.endswith(".urdf") else load_model(path_or_xml)
    d = mujoco.MjData(m)
    steps = int(seconds / m.opt.timestep)
    R = {"model": path_or_xml if not path_or_xml.lstrip().startswith("<") else f"<inline mjcf, {len(path_or_xml)} chars>", "nbody": m.nbody, "njnt": m.njnt, "nu": m.nu, "ngeom": m.ngeom,
         "floating": bool(m.nq and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE), "tests": {}}
    def rec(name, ok, **metrics):
        R["tests"][name] = {"pass": bool(ok), **metrics}
        if verbose: print(f"  {'PASS' if ok else 'FAIL'}  {name:22s} " + "  ".join(f"{k}={v}" for k, v in metrics.items()))

    # 1. compile + static sanity
    mujoco.mj_forward(m, d)
    mass = float(sum(m.body_mass)); rec("compile", m.nbody > 1 and m.nu > 0, total_mass_kg=round(mass, 3), actuators=m.nu)

    # 2. drop / settle: hold initial pose, let gravity act, must stay finite and not explode
    mujoco.mj_resetData(m, d); d.ctrl[:] = _hold_targets(m, d)
    z0 = float(d.qpos[2]) if R["floating"] else None
    maxv = 0.0
    for _ in range(steps):
        mujoco.mj_step(m, d); maxv = max(maxv, float(np.max(np.abs(d.qvel))) if m.nv else 0.0)
        if not _finite(d): break
    up = _up(m, d)
    rec("settle_under_gravity", _finite(d) and maxv < 50, max_joint_speed=round(maxv, 2),
        base_drop_m=None if z0 is None else round(z0 - float(d.qpos[2]), 3), upright=None if up is None else round(up, 3))

    # 3. pose hold: how far do joints drift from their targets while holding
    q_target = _hold_targets(m, d)
    err = 0.0
    for _ in range(steps):
        mujoco.mj_step(m, d)
    for a in range(m.nu):
        j = m.actuator_trnid[a][0]; err = max(err, abs(float(d.qpos[m.jnt_qposadr[j]] - q_target[a])))
    rec("hold_pose", _finite(d) and err < 0.6, max_joint_error_rad=round(err, 3))

    # 4. actuator sweep: every actuator through 60% of its range; must track and stay finite
    mujoco.mj_resetData(m, d); base = _hold_targets(m, d)
    worst = 0.0; tracked = 0
    for a in range(m.nu):
        lo, hi = (m.actuator_ctrlrange[a] if m.actuator_ctrllimited[a] else (-1.0, 1.0))
        mid, span = (lo + hi) / 2, (hi - lo) / 2 * 0.6
        j = m.actuator_trnid[a][0]; qi = m.jnt_qposadr[j]
        for k in range(int(1.0 / m.opt.timestep)):
            d.ctrl[:] = base; d.ctrl[a] = mid + span * np.sin(2 * np.pi * k * m.opt.timestep)
            mujoco.mj_step(m, d)
            if not _finite(d): break
        e = abs(float(d.qpos[qi] - d.ctrl[a])); worst = max(worst, e); tracked += e < max(0.5, span)
    rec("actuator_sweep", _finite(d) and tracked >= max(1, int(0.8 * m.nu)), tracked=f"{tracked}/{m.nu}", worst_error=round(worst, 3))

    # 5. disturbance (floating only): shove the base, see if it recovers/stays finite
    if R["floating"]:
        mujoco.mj_resetData(m, d); d.ctrl[:] = _hold_targets(m, d)
        for _ in range(int(0.5 / m.opt.timestep)): mujoco.mj_step(m, d)
        d.qvel[0] += 1.0  # 1 m/s lateral shove
        for _ in range(steps): mujoco.mj_step(m, d)
        up2 = _up(m, d)
        rec("disturbance_recovery", _finite(d), upright_after=round(up2, 3) if up2 is not None else None,
            note="upright>0.5 means it did not fall" )
    R["passed"] = sum(1 for t in R["tests"].values() if t["pass"]); R["total"] = len(R["tests"])
    if verbose: print(f"  => {R['passed']}/{R['total']} simulation tests passed")
    return R
