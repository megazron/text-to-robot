"""Simulation test battery for a generated robot in MuJoCo. Every test is a real
physics rollout; nothing is faked. Returns a JSON-able report."""
import numpy as np
import hashlib
import mujoco
from .convert import load_model, urdf_to_mjcf

SWEEP_FRACTION = 0.6     # of each joint's half-range (or speed limit)
SPEED_FRACTION = 0.5     # of the URDF velocity limit; a sweep must never demand more than the rating
MAX_PERIOD_S = 8.0       # long-range slow joints sweep a smaller arc instead of an endless period
STAND_S = 5.0            # standing_balance window
PENETRATION_M = 0.001    # same 1 mm threshold as initial_clearance


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


def _speed_limit(m, a):
    nid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_NUMERIC, f"ttr_vmax_{m.actuator(a).name}")
    return float(m.numeric_data[m.numeric_adr[nid]]) if nid >= 0 else None


def _test_stand(source, m):
    """The model with its free base held in mid-air by a stiff weld (a bench test stand),
    high enough that no limb reaches the floor. The free joint is kept: welding the body
    to the world instead would change MuJoCo's parent/child contact filtering.
    Fixed-base models are returned unchanged."""
    if not (m.nq and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE):
        return m, "fixed (as modelled)"
    name = m.body(int(m.jnt_bodyid[0])).name
    spec = mujoco.MjSpec.from_string(source) if source.lstrip().startswith("<") else mujoco.MjSpec.from_file(source)
    body = spec.body(name) if name else None
    if body is None:
        return m, "free (could not mount on a stand)"
    body.pos = [body.pos[0], body.pos[1], body.pos[2] + 2 * float(m.stat.extent)]
    spec.add_equality(type=mujoco.mjtEq.mjEQ_WELD, name1=name, objtype=mujoco.mjtObj.mjOBJ_BODY,
                      solref=[2 * m.opt.timestep, 1], solimp=[0.99, 0.999, 0.001, 0.5, 2])
    return spec.compile(), "free base held by a weld on a test stand"


def _descends(m, b, ancestor):
    while b > 0:
        if b == ancestor: return True
        b = int(m.body_parentid[b])
    return ancestor == 0


def _contact_pairs(m, d):
    return {tuple(sorted((int(m.geom_bodyid[c.geom1]), int(m.geom_bodyid[c.geom2])))) for c in d.contact[:d.ncon] if c.dist < -PENETRATION_M}


def _collision_free_range(m, d, j, q0, lo, hi, steps=200):
    """Interval of joint j around q0 (all other joints at qpos0) over which no new
    penetrating contact appears. Kinematic scan; without self-collision it is [lo, hi]."""
    qa = m.jnt_qposadr[j]
    mujoco.mj_resetData(m, d); mujoco.mj_forward(m, d); home = _contact_pairs(m, d)
    q0 = float(np.clip(q0, lo, hi)); bounds = []
    for end in (lo, hi):
        reached = q0
        for q in np.linspace(q0, end, steps + 1)[1:]:
            d.qpos[qa] = q; mujoco.mj_forward(m, d)
            if _contact_pairs(m, d) - home: break
            reached = float(q)
        bounds.append(reached)
    mujoco.mj_resetData(m, d)
    return bounds[0], bounds[1]


def _sweep_actuator(m, d, a, base):
    """Drive one actuator through a speed-limited trajectory; return (result, finite)."""
    mujoco.mj_resetData(m, d)
    dt = m.opt.timestep; j = m.actuator_trnid[a][0]
    velocity = _velocity_actuator(m, a); linear = m.jnt_type[j] == mujoco.mjtJoint.mjJNT_SLIDE
    vmax = _speed_limit(m, a)
    if m.actuator_ctrllimited[a]: lo, hi = m.actuator_ctrlrange[a]
    elif m.jnt_limited[j]: lo, hi = m.jnt_range[j]
    else: lo, hi = -1.0, 1.0
    start = float(base[a]); free = None
    if not velocity:
        free = _collision_free_range(m, d, j, start, lo, hi)
        lo, hi = free
    mid, amp = (lo + hi) / 2, (hi - lo) / 2 * SWEEP_FRACTION
    period = 1.0
    if not velocity and vmax:
        v_test = SPEED_FRACTION * vmax
        period = max(1.0, 2 * np.pi * amp / v_test)
        if period > MAX_PERIOD_S:
            period = MAX_PERIOD_S; amp = v_test * period / (2 * np.pi)
    ramp = 0.0 if velocity else np.pi * abs(mid - start) / (2 * 2 * np.pi * amp / period) if amp > 0 else 0.0
    def target(t):
        if t < ramp: return start + (mid - start) * (1 - np.cos(np.pi * t / ramp)) / 2
        return mid + amp * np.sin(2 * np.pi * (t - ramp) / period)
    moving = {b for b in range(m.nbody) if _descends(m, b, int(m.jnt_bodyid[j]))}
    errors = []; peak_force = 0.0; finite = True; touching = {}
    for k in range(int(round((ramp + period) / dt))):
        d.ctrl[:] = base; d.ctrl[a] = target(k * dt)
        mujoco.mj_step(m, d)
        for c in d.contact[:d.ncon]:
            b1, b2 = int(m.geom_bodyid[c.geom1]), int(m.geom_bodyid[c.geom2])
            if c.dist < 0 and (b1 in moving) != (b2 in moving):
                key = tuple(sorted((m.body(b1).name, m.body(b2).name))); touching[key] = max(touching.get(key, 0.0), float(-c.dist))
        errors.append(_actuator_state(m, d, a) - float(d.ctrl[a]))
        peak_force = max(peak_force, abs(float(d.actuator_force[a])))
        if not _finite(d):
            finite = False; break
    # A stalled actuator can end a sinusoid at its target. Measure the whole
    # trajectory, not only that final sample. These are explicit smoke-test
    # tolerances, not hardware accuracy specifications.
    rms = float(np.sqrt(np.mean(np.square(errors)))); peak = float(max(abs(e) for e in errors))
    tolerance = .5 if velocity else .01 if linear else .15
    ok = finite and rms <= tolerance
    limit = float(max(abs(v) for v in m.actuator_forcerange[a])) if m.actuator_forcelimited[a] else None
    unit = "rad/s" if velocity else "m" if linear else "rad"
    result = {"actuator": m.actuator(a).name, "joint": m.joint(j).name, "pass": bool(ok),
        "rms_error": round(rms, 6), "peak_error": round(peak, 6), "error_unit": unit, "rms_tolerance": tolerance,
        "amplitude": round(float(amp), 6), "centre": round(float(mid), 6), "period_s": round(float(period), 3), "speed_limit": vmax,
        "peak_actuator_force": round(peak_force, 6), "force_limit": limit, "force_unit": "N" if linear else "N m"}
    if free is not None:
        result["collision_free_range"] = [round(float(v), 6) for v in free]
        if m.jnt_limited[j] and (free[0] > m.jnt_range[j][0] + 1e-9 or free[1] < m.jnt_range[j][1] - 1e-9):
            result["range_note"] = "joint limit exceeds the self-collision-free range; swept the free range (planner/SRDF must avoid the rest)"
        if free[1] - free[0] < 1e-6:
            ok = False; result["pass"] = False
    if touching:
        result["moving_part_contacts"] = [{"bodies": list(k), "max_depth_m": round(v, 6)} for k, v in sorted(touching.items(), key=lambda kv: -kv[1])[:5]]
    if not ok:
        result["reason"] = ("contact-limited: the moving part presses on " + ", ".join("/".join(c["bodies"]) for c in result["moving_part_contacts"][:3])
                            + " (geometry touching the moving part, not motor capacity)"
                            if touching and limit and peak_force >= 0.99 * limit else
                            f"effort-limited: needs more than the URDF effort limit {limit:g} {result['force_unit']}"
                            if limit and peak_force >= 0.99 * limit else "numerically unstable" if not finite
                            else "blocked by self-collision at the hold pose" if free is not None and free[1] - free[0] < 1e-6
                            else "tracking error above tolerance below the effort limit (gain/damping)")
    return result, finite


def run_tests(path_or_xml: str, floating=None, seconds: float = 2.0, verbose: bool = True, self_collision: bool = False) -> dict:
    if not np.isfinite(seconds) or seconds <= 0:
        raise ValueError("seconds must be finite and positive")
    if path_or_xml.endswith(".urdf"):
        spec_source = urdf_to_mjcf(path_or_xml, floating=floating, self_collision=self_collision)
        m = load_model(spec_source)
    else:
        spec_source = path_or_xml; m = load_model(path_or_xml)
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
        if contact.dist < -PENETRATION_M and m.geom_type[a] != mujoco.mjtGeom.mjGEOM_PLANE and m.geom_type[b] != mujoco.mjtGeom.mjGEOM_PLANE:
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

    # 4. actuator sweep, one actuator at a time. A free base is held on a
    # test stand first: this checks each motor's tracking, not whether
    # the whole robot balances (that is standing_balance / disturbance_recovery).
    sm, mount = _test_stand(spec_source, m)
    sd = mujoco.MjData(sm)
    mujoco.mj_resetData(sm, sd); base = _hold_targets(sm, sd)
    worst = 0.0; tracked = 0; actuator_results = []
    sweep_finite = True
    for a in range(sm.nu):
        result, finite = _sweep_actuator(sm, sd, a, base)
        sweep_finite &= finite; tracked += result["pass"]; worst = max(worst, result["peak_error"])
        actuator_results.append(result)
    rec("actuator_sweep", sweep_finite and _finite(sd) and tracked == sm.nu, tracked=f"{tracked}/{sm.nu}",
        worst_error=round(worst, 3), base=mount)
    R["tests"]["actuator_sweep"]["actuators"] = actuator_results
    reasons = {}
    for result in actuator_results:
        if not result["pass"]: key = result["reason"].split(":")[0]; reasons[key] = reasons.get(key, 0) + 1
    if reasons:
        R["tests"]["actuator_sweep"]["failure_reasons"] = reasons
        if verbose: print("        failure reasons: " + ", ".join(f"{k} x{v}" for k, v in reasons.items()))
    R["tests"]["actuator_sweep"]["protocol"] = ("each actuator alone, others holding; position joints: within the joint's self-collision-free range, cosine move to mid-range then one sine "
        f"period over {SWEEP_FRACTION:.0%} of the half-range at no more than {SPEED_FRACTION:.0%} of the URDF velocity limit; "
        f"speed joints: one sine period of commanded speed to {SWEEP_FRACTION:.0%} of the limit")

    # 5. standing balance (floating only): the real robot on the floor, joints holding
    # their pose for a longer window. No balance controller is generated, so this
    # measures passive stability of the held posture, nothing more.
    if R["floating"]:
        mujoco.mj_resetData(m, d); d.ctrl[:] = _hold_targets(m, d)
        z0 = float(d.qpos[2]); min_up = 1.0
        for _ in range(int(max(seconds, STAND_S) / m.opt.timestep)):
            mujoco.mj_step(m, d); min_up = min(min_up, _up(m, d))
            if not _finite(d): break
        drop = z0 - float(d.qpos[2])
        rec("standing_balance", _finite(d) and min_up > 0.9, min_upright=round(min_up, 3), base_drop_m=round(drop, 3),
            seconds=max(seconds, STAND_S), note="joint hold only, no balance controller; upright>0.9 throughout")

    # 6. disturbance (floating only): shove the base, see if it recovers/stays finite
    if R["floating"]:
        mujoco.mj_resetData(m, d); d.ctrl[:] = _hold_targets(m, d)
        for _ in range(int(0.5 / m.opt.timestep)): mujoco.mj_step(m, d)
        d.qvel[0] += 1.0  # 1 m/s lateral shove
        for _ in range(steps): mujoco.mj_step(m, d)
        up2 = _up(m, d)
        rec("disturbance_recovery", _finite(d) and up2 is not None and up2 > 0.5, upright_after=round(up2, 3) if up2 is not None else None,
            note="upright>0.5 means it did not fall; joint hold only, no balance controller" )
    R["passed"] = sum(1 for t in R["tests"].values() if t["pass"]); R["total"] = len(R["tests"])
    if verbose: print(f"  => {R['passed']}/{R['total']} simulation tests passed")
    return R
