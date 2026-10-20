"""Task tests: does the robot do what its design record claims, under its real actuator limits?

The battery in testbench.py proves a model compiles and does not explode. The tests here
read the CLAIMS in ``robot.json`` -> ``metadata.design`` (payload, reach, top speed,
slope, grip ...) and the RATINGS of every actuator (``rated_nm`` continuous, ``peak_nm``,
speed) and run the task the claim is about, in MuJoCo, with

* every motor force-limited to its datasheet peak torque (URDF effort) and, at speed,
  to the linear DC-motor torque-speed line (peak at standstill -> 0 at no-load speed);
* reflected rotor inertia (armature) on every joint (see actuators.py);
* torque utilisation measured from the actual actuator forces (``d.actuator_force``):
  peak |torque| / peak rating and mean |torque| over the hold / cruise / rated rating.

A PASS means: the bought actuators can produce the torques and speeds this task needs,
in this geometry, with these masses. It does not mean the robot works: see ``SCOPE``.

``run_tasks(urdf, spec)`` -> report dict; CLI ``python -m ttr_mujoco task <urdf> --spec robot.json``.
"""
from __future__ import annotations

import re
import warnings

import mujoco
import numpy as np

from .actuators import load_spec
from .convert import urdf_to_mjcf
from .testbench import _finite

G = 9.81
DT_LOG = 0.01                 # metrics are sampled every 10 ms
HOLD_S = 3.0                  # payload / grip hold
TRACK_HOLD_RAD = 0.02         # |error| allowed while holding (1.1 deg)
TRACK_MOVE_RAD = 0.10         # |error| allowed during a fast move (5.7 deg)
SPEED_FRACTION = 0.80         # speed test runs at 80 % of the rated joint speed
SLIP_M = 0.005                # grip: box may creep at most 5 mm in 3 s
SATURATED = 0.995             # |torque| at >= 99.5 % of the available limit counts as saturated

SCOPE = ("PASS means the modelled actuators (datasheet peak torque as a hard limit, a linear torque-speed "
         "line to no-load speed, reflected rotor inertia, URDF damping/friction) can produce the torques and "
         "speeds the task needs in this geometry and mass distribution, and that mean torque over the hold "
         "stays within the continuous (rated) torque. Joint control uses an ideal model-based feedforward "
         "(computed torque) through the force-limited servo for fixed-base robots and plain position servos for "
         "floating robots; a pass therefore proves torque/speed capacity, not that a given controller achieves it. "
         "Untested: thermal limits over long duty cycles (only the mean-vs-rated proxy), gearbox backlash and "
         "compliance, link and joint flexibility, encoder resolution, supply voltage sag and current limits, "
         "bus latency, controller tuning, and contact/friction values (nominal friction only).")

ARM = {"arm", "scara", "manipulator", "mobile_manipulator"}
WHEELED = {"diff_drive", "four_wheel", "mecanum", "rover", "skid_steer", "wheeled", "omni", "tracked", "ackermann", "differential",
           "rocker_bogie", "character_walle", "character_eva", "character_baymax"}
LEGGED = {"quadruped", "hexapod", "humanoid", "biped", "legged"}
GRIPPER = {"gripper", "end_effector"}
EXO = {"exo", "exoskeleton"}


# ----------------------------------------------------------------------------- helpers
def _num(m, name):
    i = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_NUMERIC, name)
    return float(m.numeric_data[m.numeric_adr[i]]) if i >= 0 else None


def _min_jerk(t, T):
    """(s, ds/dt, d2s/dt2) of the minimum-jerk blend 0 -> 1 over T seconds."""
    if T <= 0 or t >= T: return 1.0, 0.0, 0.0
    if t <= 0: return 0.0, 0.0, 0.0
    x = t / T
    return 10*x**3 - 15*x**4 + 6*x**5, (30*x**2 - 60*x**3 + 30*x**4) / T, (60*x - 180*x**2 + 120*x**3) / T**2


def _descendants(m, root):
    out = {root}
    for b in range(m.nbody):
        p = b
        while p > 0:
            if p == root: out.add(b); break
            p = int(m.body_parentid[p])
    return out


def _body(m, name):
    return mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, name) if name else -1


def _is_free(m):
    return bool(m.njnt and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE)


def _upright(d):
    R = np.zeros(9); mujoco.mju_quat2Mat(R, d.qpos[3:7]); return float(R[8])


def _collision_geom(m, g):
    return m.geom_contype[g] != 0 or m.geom_conaffinity[g] != 0


def _geom_points(m, d, g, n=24):
    """World-frame points on geom g (mesh vertices, box corners, rims of round shapes)."""
    pos, R, s, t = d.geom_xpos[g], d.geom_xmat[g].reshape(3, 3), m.geom_size[g], int(m.geom_type[g])
    class T:  # plain ints: numpy ints do not compare equal to pybind enums inside tuples
        mjGEOM_MESH, mjGEOM_BOX, mjGEOM_CYLINDER, mjGEOM_CAPSULE, mjGEOM_SPHERE, mjGEOM_ELLIPSOID = (int(mujoco.mjtGeom.mjGEOM_MESH), int(mujoco.mjtGeom.mjGEOM_BOX),
            int(mujoco.mjtGeom.mjGEOM_CYLINDER), int(mujoco.mjtGeom.mjGEOM_CAPSULE), int(mujoco.mjtGeom.mjGEOM_SPHERE), int(mujoco.mjtGeom.mjGEOM_ELLIPSOID))
    if t == T.mjGEOM_MESH:
        mid = int(m.geom_dataid[g]); a = m.mesh_vertadr[mid]
        local = m.mesh_vert[a:a + m.mesh_vertnum[mid]]
    elif t == T.mjGEOM_BOX:
        local = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]) * s[:3]
    elif t in (T.mjGEOM_CYLINDER, T.mjGEOM_CAPSULE):
        ang = np.linspace(0, 2*np.pi, n, endpoint=False)
        rim = np.stack([np.cos(ang) * s[0], np.sin(ang) * s[0]], 1)
        h = s[1] + (s[0] if t == T.mjGEOM_CAPSULE else 0)
        local = np.vstack([np.c_[rim, np.full(n, z)] for z in (-s[1], s[1])] + [[[0, 0, -h], [0, 0, h]]])
    elif t in (T.mjGEOM_SPHERE, T.mjGEOM_ELLIPSOID):
        dirs = np.array([[x, y, z] for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1) if (x, y, z) != (0, 0, 0)], float)
        dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
        local = dirs * (s[:3] if t == T.mjGEOM_ELLIPSOID else s[0])
    else:
        return np.zeros((0, 3))
    return pos + local @ R.T


def _subtree_points(m, d, bodies):
    pts = [_geom_points(m, d, g) for g in range(m.ngeom) if m.geom_bodyid[g] in bodies and _collision_geom(m, g)]
    pts = [p for p in pts if len(p)]
    return np.vstack(pts) if pts else np.zeros((0, 3))


def _r(x, k=4):
    return None if x is None else round(float(x), k)


# ----------------------------------------------------------------------------- the actuated rig
class Rig:
    """MjModel + MjData with per-actuator ratings, the torque-speed limit, optional ideal
    feedforward through the force-limited servos, and a force log for utilisation."""

    def __init__(self, m, feedforward=False):
        self.m, self.d = m, mujoco.MjData(m)
        self.dinv = mujoco.MjData(m)
        self.ff = bool(feedforward)
        self.acts = []
        for a in range(m.nu):
            j = int(m.actuator_trnid[a, 0]); name = m.actuator(a).name
            vel = bool(m.actuator_biasprm[a, 1] == 0 and m.actuator_biasprm[a, 2] != 0)
            peak = float(np.max(np.abs(m.actuator_forcerange[a]))) if m.actuator_forcelimited[a] else float("inf")
            noload = _num(m, f"ttr_noload_{name}") or _num(m, f"ttr_vmax_{name}")
            self.acts.append(dict(index=a, name=name, joint=m.joint(j).name, jid=j, dof=int(m.jnt_dofadr[j]), qadr=int(m.jnt_qposadr[j]),
                                  velocity=vel, kp=float(m.actuator_gainprm[a, 0]), kv=float(-m.actuator_biasprm[a, 2]) if not vel else 0.0,
                                  peak=peak, limit=peak, rated=_num(m, f"ttr_rated_{name}"), noload=noload, damping=float(m.dof_damping[int(m.jnt_dofadr[j])])))
        if self.ff:
            for A in self.acts:
                if not A["velocity"]: m.actuator_ctrllimited[A["index"]] = 0
        self.log_t, self.log_f, self.log_err, self.log_sat = [], [], [], []
        self.t = 0.0

    def by_joint(self, name):
        return next((A for A in self.acts if A["joint"] == name), None)

    def q(self):
        return np.array([self.d.qpos[A["qadr"]] for A in self.acts])

    def _limits(self):
        lo, hi = np.zeros(len(self.acts)), np.zeros(len(self.acts))
        for i, A in enumerate(self.acts):
            L = A["limit"]
            if not np.isfinite(L): lo[i], hi[i] = -np.inf, np.inf; continue
            w = float(self.d.qvel[A["dof"]])
            # Motoring quadrant: the datasheet no-load speed already includes the gearbox losses
            # that the URDF damping models, so the NET output torque (motor minus damping) follows
            # the linear line peak -> 0 at no-load speed. Braking keeps the full limit.
            top = min(L, L * max(0.0, 1 - abs(w) / A["noload"]) + A["damping"] * abs(w)) if A["noload"] else L
            lo[i], hi[i] = (-L, top) if w > 0 else (-top, L)
            self.m.actuator_forcerange[A["index"]] = (lo[i], hi[i])
        return lo, hi

    def step(self, ref, qd_ref=None, qdd_ref=None, log=True):
        """ref: per actuator position target (rad / m) or wheel speed (rad/s)."""
        m, d = self.m, self.d
        ref = np.asarray(ref, float)
        ctrl = ref.copy()
        if self.ff:
            qd_ref = np.zeros(len(self.acts)) if qd_ref is None else np.asarray(qd_ref, float)
            qdd_ref = np.zeros(len(self.acts)) if qdd_ref is None else np.asarray(qdd_ref, float)
            self.dinv.qpos[:] = d.qpos; self.dinv.qvel[:] = d.qvel; self.dinv.qacc[:] = 0
            for i, A in enumerate(self.acts):
                if not A["velocity"]: self.dinv.qacc[A["dof"]] = qdd_ref[i]
            mujoco.mj_inverse(m, self.dinv)
            for i, A in enumerate(self.acts):
                if A["velocity"] or A["kp"] <= 0: continue
                ctrl[i] = ref[i] + (float(self.dinv.qfrc_inverse[A["dof"]]) + A["kv"] * qd_ref[i]) / A["kp"]
        d.ctrl[:] = ctrl
        lo, hi = self._limits()
        mujoco.mj_step(m, d)
        self.t += m.opt.timestep
        if log and (not self.log_t or self.t - self.log_t[-1] >= DT_LOG - 1e-9):
            f = d.actuator_force.copy()
            err = np.array([(d.qvel[A["dof"]] if A["velocity"] else d.qpos[A["qadr"]]) - ref[i] for i, A in enumerate(self.acts)])
            sat = ((hi > 0) & (f >= SATURATED * hi)) | ((lo < 0) & (f <= SATURATED * lo))
            self.log_t.append(self.t); self.log_f.append(f); self.log_err.append(err); self.log_sat.append(sat)
        return _finite(d)

    def window(self, t0, t1=None):
        t = np.array(self.log_t); sel = (t >= t0) & (t <= (t1 if t1 is not None else np.inf))
        return (np.array(self.log_f)[sel], np.array(self.log_err)[sel], np.array(self.log_sat)[sel])

    def utilisation(self, names, hold=None, whole=None, mean_label="mean_hold"):
        """Per joint: peak |torque| vs peak rating over `whole`, mean |torque| vs rated over `hold`."""
        out = {}
        Fw, Ew, Sw = self.window(*(whole or (0, None)))
        Fh, Eh, Sh = self.window(*(hold or (0, None)))
        for i, A in enumerate(self.acts):
            if A["joint"] not in names: continue
            peak = float(np.max(np.abs(Fw[:, i]))) if len(Fw) else 0.0
            mean = float(np.mean(np.abs(Fh[:, i]))) if len(Fh) else 0.0
            out[A["joint"]] = {
                "peak_nm": _r(peak), "peak_rating_nm": _r(A["peak"]), "util_peak": _r(peak / A["peak"], 3) if np.isfinite(A["peak"]) else None,
                f"{mean_label}_nm": _r(mean), "rated_nm": _r(A["rated"]), "util_rated": _r(mean / A["rated"], 3) if A["rated"] else None,
                "max_err": _r(float(np.max(np.abs(Ew[:, i]))) if len(Ew) else 0.0), "max_err_hold": _r(float(np.max(np.abs(Eh[:, i]))) if len(Eh) else 0.0),
                "saturated_frac": _r(float(np.mean(Sw[:, i])) if len(Sw) else 0.0, 3),
            }
        return out


def _names(items, k=6):
    items = list(items)
    return ", ".join(items[:k]) + (f" (+{len(items) - k} more)" if len(items) > k else "")


def _result(ok, why, **metrics):
    return {"pass": ok, "explanation": why, **metrics}


def _worst(util, key):
    vals = [(v[key], j) for j, v in util.items() if v.get(key) is not None]
    return max(vals) if vals else (None, None)


# ----------------------------------------------------------------------------- scene building
def _spec_xml(xml):
    return mujoco.MjSpec.from_string(xml)


def _with_payload(xml, body, pos, mass, name="ttr_payload"):
    """Rigidly attach a payload (mass at `pos` in `body`'s frame) as a visible red box."""
    s = _spec_xml(xml)
    b = s.body(body)
    side = float(np.clip((mass / 2700.0) ** (1 / 3), 0.02, 0.12))    # aluminium-density cube, for the picture
    p = b.add_body(name=name, pos=list(map(float, pos)))
    p.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, size=[side / 2] * 3, mass=float(mass), contype=0, conaffinity=0,
               rgba=[0.85, 0.15, 0.12, 1], group=1)
    return s.compile(), s.to_xml()


class Layout:
    """Kinematic roles read from the spec + model: arm joints, gripper, TCP, shoulder."""

    def __init__(self, m, spec, design):
        self.m = m; d = mujoco.MjData(m); mujoco.mj_forward(m, d)
        links = {l["name"]: l for l in spec.get("links", [])} if spec else {}
        actuated = [m.joint(int(m.actuator_trnid[a, 0])).name for a in range(m.nu)]
        ee = (spec or {}).get("end_effectors") or []
        self.attach = next((e.get("attach_link") for e in ee if _body(m, e.get("attach_link")) >= 0), None)
        grip_bodies = set()
        if self.attach:
            grip_bodies = _descendants(m, _body(m, self.attach)) - {_body(m, self.attach)}
        for n, l in links.items():
            if l.get("role") == "gripper" and _body(m, n) >= 0: grip_bodies |= _descendants(m, _body(m, n))
        self.gripper_joints = [j for j in actuated if int(m.jnt_bodyid[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, j)]) in grip_bodies]
        if self.gripper_joints and not self.attach:
            self.attach = m.body(int(m.body_parentid[int(m.jnt_bodyid[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, self.gripper_joints[0])])])).name
        self.arm_joints = [j for j in actuated if j not in self.gripper_joints]
        # shoulder: named, else the first actuated hinge with a horizontal axis at home
        self.shoulder = next((j for j in self.arm_joints if re.search(r"shoulder.*(pitch|lift)|(pitch|lift).*shoulder", j)), None)
        if self.shoulder is None:
            for j in self.arm_joints:
                jid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, j)
                if m.jnt_type[jid] == mujoco.mjtJoint.mjJNT_HINGE and abs(d.xaxis[jid][2]) < 0.3: self.shoulder = j; break
        # TCP
        tcp = (design or {}).get("tcp") or {}
        if tcp.get("link") and _body(m, tcp["link"]) >= 0:
            self.tcp_body, self.tcp_local, self.tcp_source = tcp["link"], np.array(tcp["xyz"], float), "metadata.design.tcp"
        elif len({int(m.jnt_bodyid[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, j)]) for j in self.gripper_joints}) >= 2:
            # estimate: between the fingers, a quarter of the finger length back from the tips
            jids = [mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, j) for j in self.gripper_joints]
            anchor = np.mean([d.xanchor[j] for j in jids], axis=0)
            fingers = [_descendants(m, int(m.jnt_bodyid[j])) for j in jids]
            mid = np.mean([d.subtree_com[int(m.jnt_bodyid[j])] for j in jids], axis=0)
            fdir = mid - anchor; fdir = fdir / np.linalg.norm(fdir) if np.linalg.norm(fdir) > 1e-6 else d.xmat[_body(m, self.attach)].reshape(3, 3)[:, 2]
            pts = np.vstack([_subtree_points(m, d, f) for f in fingers])
            proj = float(np.max((pts - anchor) @ fdir))
            p = mid - ((mid - anchor) @ fdir) * fdir + 0.75 * proj * fdir
            bid = _body(m, self.attach)
            self.tcp_body, self.tcp_local = self.attach, d.xmat[bid].reshape(3, 3).T @ (p - d.xpos[bid])
            self.tcp_source = "estimated (between the fingers, 3/4 of the finger length out; no metadata.design.tcp)"
        else:
            # estimate: the tool point farthest from the first arm joint, in the last arm body
            last = self.attach
            if last is None and self.arm_joints:
                last = m.body(int(m.jnt_bodyid[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, self.arm_joints[-1])])).name
            bid = _body(m, last) if last else m.nbody - 1
            first = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, self.arm_joints[0]) if self.arm_joints else 0
            pts = _subtree_points(m, d, _descendants(m, bid))
            anchor = d.xanchor[first] if m.njnt else np.zeros(3)
            p = pts[np.argmax(np.linalg.norm(pts - anchor, axis=1))] if len(pts) else d.xpos[bid]
            self.tcp_body = m.body(bid).name
            self.tcp_local = d.xmat[bid].reshape(3, 3).T @ (p - d.xpos[bid])
            self.tcp_source = "estimated (tool point farthest from the first joint; no metadata.design.tcp)"


def _tcp_world(m, d, body, local):
    b = _body(m, body)
    return d.xpos[b] + d.xmat[b].reshape(3, 3) @ local


# ----------------------------------------------------------------------------- arm tasks
def _run_traj(rig, q0, q1, T, hold):
    """Min-jerk joint move q0 -> q1 over T, then hold. Returns False if the sim diverged."""
    steps = int(round((T + hold) / rig.m.opt.timestep))
    t0 = rig.t
    for _ in range(steps):
        t = rig.t - t0
        s, ds, dds = _min_jerk(t, T)
        if not rig.step(q0 + (q1 - q0) * s, (q1 - q0) * ds, (q1 - q0) * dds): return False
    return True


def _clip_pose(m, rig, pose):
    out = {}
    for A in rig.acts:
        if A["joint"] not in pose: continue
        jid = A["jid"]; v = pose[A["joint"]]
        if m.jnt_limited[jid]: v = float(np.clip(v, m.jnt_range[jid][0] + 1e-3, m.jnt_range[jid][1] - 1e-3))
        out[A["joint"]] = v
    return out


def arm_payload_hold(xml, lay, payload, claimed_reach):
    """(a) payload at the TCP, home -> arm stretched horizontally (shoulder +-90 deg), hold 3 s; (c) reach."""
    results, reach = {}, None
    signs = (1, -1) if lay.shoulder else (0,)
    for sgn in signs:
        m, _ = _with_payload(xml, lay.tcp_body, lay.tcp_local, payload)
        rig = Rig(m, feedforward=True); mujoco.mj_forward(m, rig.d)
        pose = _clip_pose(m, rig, {lay.shoulder: sgn * np.pi / 2} if lay.shoulder else {})
        q0 = rig.q(); q1 = q0.copy()
        for i, A in enumerate(rig.acts):
            if A["joint"] in pose: q1[i] = pose[A["joint"]]
        vmin = min((A["noload"] or 1.0) for A in rig.acts if A["joint"] in pose) if pose else 1.0
        T = max(2.0, 1.875 * float(np.max(np.abs(q1 - q0))) / (0.5 * vmin))
        ok = _run_traj(rig, q0, q1, T, HOLD_S)
        util = rig.utilisation(lay.arm_joints, hold=(T + 0.5, None))
        label = "stretched_plus" if sgn > 0 else "stretched_minus" if sgn < 0 else "home"
        tcp = _tcp_world(m, rig.d, lay.tcp_body, lay.tcp_local)
        if lay.shoulder:
            sid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, lay.shoulder)
            r = float(np.linalg.norm(tcp - rig.d.xanchor[sid]))
            reach = r if reach is None else min(reach, r)
        bad = [j for j, u in util.items() if u["max_err_hold"] > TRACK_HOLD_RAD]
        over = [j for j, u in util.items() if u["util_rated"] is not None and u["util_rated"] > 1.0]
        sat = [j for j, u in util.items() if u["saturated_frac"] > 0]
        passed = ok and not bad and not over and not sat
        wj = _worst(util, "util_rated")
        wp = _worst(util, "util_peak")
        why = ("holds %.3g kg %s for %.0f s; %s" % (payload, "with the arm stretched out" if lay.shoulder else "at home", HOLD_S,
               f"worst continuous utilisation {wj[0]:.2f}x rated at {wj[1]}" if wj[0] is not None else f"no continuous ratings known; worst {wp[0]:.2f}x peak at {wp[1]}")) if passed else \
              "; ".join(x for x in [
                  "simulation diverged" if not ok else "",
                  f"mean holding torque exceeds the continuous rating at {', '.join(f'{j} ({util[j]['util_rated']:.2f}x rated)' for j in over)}" if over else "",
                  f"torque saturates at the peak/speed limit at {_names(sat)}" if sat else "",
                  f"cannot hold position within {TRACK_HOLD_RAD} rad at {_names(bad)}" if bad else ""] if x)
        results[label] = _result(passed, why, shoulder=lay.shoulder, shoulder_target_rad=_r(pose.get(lay.shoulder)) if lay.shoulder else None,
                                 move_s=_r(T, 2), hold_s=HOLD_S, payload_kg=payload, joints=util)
    passed = all(r["pass"] for r in results.values())
    hold = _result(passed, " | ".join(f"{k}: {v['explanation']}" for k, v in results.items()), poses=results,
                   tcp={"link": lay.tcp_body, "xyz": [_r(x) for x in lay.tcp_local], "source": lay.tcp_source})
    out = {"payload_hold": hold}
    if lay.shoulder:
        tol = max(0.005, 0.02 * claimed_reach) if claimed_reach else None
        ok = claimed_reach is None or reach >= claimed_reach - tol
        out["reach"] = _result(ok if claimed_reach else None,
                               (f"TCP {reach:.3f} m from the shoulder axis with the payload, claimed {claimed_reach:.3f} m (tolerance {tol*1000:.0f} mm)"
                                if claimed_reach else f"TCP {reach:.3f} m from the shoulder axis; no reach claim in the design record"),
                               achieved_m=_r(reach), claimed_m=claimed_reach, tcp_source=lay.tcp_source)
    return out


def _ideal_torques(m, rig, qa, qb, T, n=200):
    """Inverse dynamics along the planned trajectory (no limits): the torque each joint must
    produce, and the worst ratio to what the torque-speed line allows at that speed."""
    d = mujoco.MjData(m); out = {}
    worst = {A["joint"]: (0.0, 0.0, 0.0, 0.0) for A in rig.acts}
    peak = {A["joint"]: 0.0 for A in rig.acts}
    for t in np.linspace(0, T, n):
        s_, ds, dds = _min_jerk(t, T)
        for i, A in enumerate(rig.acts):
            d.qpos[A["qadr"]] = qa[i] + (qb[i] - qa[i]) * s_; d.qvel[A["dof"]] = (qb[i] - qa[i]) * ds; d.qacc[A["dof"]] = (qb[i] - qa[i]) * dds
        mujoco.mj_inverse(m, d)
        for A in rig.acts:
            tau = float(d.qfrc_inverse[A["dof"]]); w = float(d.qvel[A["dof"]]); L = A["limit"]
            motoring = tau * w > 0
            avail = min(L, L * max(0.0, 1 - abs(w) / A["noload"]) + A["damping"] * abs(w)) if (A["noload"] and motoring) else L
            peak[A["joint"]] = max(peak[A["joint"]], abs(tau))
            if abs(tau) / max(avail, 1e-9) > worst[A["joint"]][0]: worst[A["joint"]] = (abs(tau) / max(avail, 1e-9), abs(tau), abs(w), avail)
    for j, (ratio, tau, w, avail) in worst.items():
        out[j] = {"ideal_peak_nm": _r(peak[j]), "ideal_worst_vs_available": _r(ratio, 3), "at_speed_rad_s": _r(w, 3), "needs_nm": _r(tau), "available_nm": _r(avail)}
    return out


def arm_speed(xml, lay, payload):
    """(b) fast point-to-point move with the payload, peak joint speed = 80 % of the rated speed."""
    m, _ = _with_payload(xml, lay.tcp_body, lay.tcp_local, payload)
    rig = Rig(m, feedforward=True); mujoco.mj_forward(m, rig.d)
    a = {lay.shoulder: np.pi / 2} if lay.shoulder else {}
    b = {lay.shoulder: -np.pi / 2} if lay.shoulder else {}
    for j in lay.arm_joints:
        if j == lay.shoulder: continue
        if re.search(r"yaw|roll|rot|base|waist|turn", j) or not lay.shoulder: b[j] = np.pi / 2
    a, b = _clip_pose(m, rig, a), _clip_pose(m, rig, b)
    q0 = rig.q(); qa = q0.copy(); qb = q0.copy()
    for i, A in enumerate(rig.acts):
        qa[i] = a.get(A["joint"], q0[i]); qb[i] = b.get(A["joint"], q0[i])
    # slow move into the start pose, settle
    _run_traj(rig, q0, qa, 2.0, 0.5)
    vmax = {A["joint"]: (_num(m, f"ttr_vmax_{A['name']}") or A["noload"] or 1.0) for A in rig.acts}
    T = max(1.875 * abs(qb[i] - qa[i]) / (SPEED_FRACTION * vmax[A["joint"]]) for i, A in enumerate(rig.acts)) if np.any(qb != qa) else 1.0
    need = _ideal_torques(m, rig, qa, qb, T)
    t_move = rig.t
    ok = _run_traj(rig, qa, qb, T, 1.0)
    util = rig.utilisation(lay.arm_joints, hold=(t_move, t_move + T), whole=(t_move, t_move + T), mean_label="mean_move")
    settle = rig.utilisation(lay.arm_joints, hold=(t_move + T + 0.5, None))
    speeds = {A["joint"]: _r(1.875 * abs(qb[i] - qa[i]) / T, 3) for i, A in enumerate(rig.acts) if A["joint"] in lay.arm_joints}
    late = [j for j, u in util.items() if u["max_err"] > TRACK_MOVE_RAD]
    unsettled = [j for j, u in settle.items() if u["max_err_hold"] > TRACK_HOLD_RAD]
    passed = ok and not late and not unsettled
    for j in util: util[j].update(need.get(j, {}))
    for j in util: util[j]["peak_speed_rad_s"] = speeds.get(j); util[j]["rated_speed_rad_s"] = _r(vmax[j], 3); util[j]["err_after_0p5s"] = settle[j]["max_err_hold"]
    ws = _worst(util, "saturated_frac")
    why = (f"{T:.2f} s move at {int(SPEED_FRACTION*100)} % rated speed tracks within {TRACK_MOVE_RAD} rad; most saturated {ws[1]} ({ws[0]*100:.0f} % of the move)"
           if passed else "; ".join(x for x in ["simulation diverged" if not ok else "",
                                               f"lags more than {TRACK_MOVE_RAD} rad at {', '.join(f'{j} ({util[j]['max_err']:.3f} rad, saturated {util[j]['saturated_frac']*100:.0f} %)' for j in late)}" if late else "",
                                               "; ".join(f"{j} needs {need[j]['needs_nm']} N m at {need[j]['at_speed_rad_s']} rad/s where the torque-speed line allows {need[j]['available_nm']} N m"
                                                         for j in util if need.get(j, {}).get("ideal_worst_vs_available", 0) > 1),
                                               f"does not settle within {TRACK_HOLD_RAD} rad at {_names(unsettled)}" if unsettled else ""] if x))
    return _result(passed, why, move_s=_r(T, 3), payload_kg=payload, start=a, end=b, joints=util)


# ----------------------------------------------------------------------------- grip
def _sample_surface(m, d, g, n=4000, rng=None):
    """World points on the surface of geom g (area-weighted samples + vertices)."""
    pts = _geom_points(m, d, g)
    if m.geom_type[g] == mujoco.mjtGeom.mjGEOM_MESH:
        mid = int(m.geom_dataid[g]); va = m.mesh_vertadr[mid]; fa = m.mesh_faceadr[mid]
        V = m.mesh_vert[va:va + m.mesh_vertnum[mid]]; F = m.mesh_face[fa:fa + m.mesh_facenum[mid]]
        A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        area = 0.5 * np.linalg.norm(np.cross(B - A, C - A), axis=1)
        if area.sum() > 0:
            rng = rng or np.random.default_rng(0)
            k = rng.choice(len(F), size=n, p=area / area.sum())
            u, v = rng.random(n), rng.random(n); flip = u + v > 1; u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
            local = A[k] + (B[k] - A[k]) * u[:, None] + (C[k] - A[k]) * v[:, None]
            pts = np.vstack([pts, d.geom_xpos[g] + local @ d.geom_xmat[g].reshape(3, 3).T])
    elif m.geom_type[g] == int(mujoco.mjtGeom.mjGEOM_BOX):
        rng = rng or np.random.default_rng(0)
        local = rng.uniform(-1, 1, (n, 3)); axis = rng.integers(0, 3, n)
        local[np.arange(n), axis] = rng.choice([-1.0, 1.0], n)               # push each sample onto a face
        pts = np.vstack([pts, d.geom_xpos[g] + (local * m.geom_size[g][:3]) @ d.geom_xmat[g].reshape(3, 3).T])
    return pts


def _clusters(points, voxel=0.002):
    from scipy import ndimage
    if len(points) == 0: return []
    lo = points.min(0); idx = np.floor((points - lo) / voxel).astype(int)
    grid = np.zeros(idx.max(0) + 1, bool); grid[tuple(idx.T)] = True
    lab, n = ndimage.label(ndimage.binary_dilation(grid, iterations=1))
    labels = lab[tuple(idx.T)]
    return [points[labels == k] for k in range(1, n + 1)]


def grip_test(xml, lay, payload):
    """Close the gripper on a box of the payload mass (friction 0.5) and hold it while its weight
    pulls it straight out of the fingers. Fingers collide through convex pads cut from the finger
    tips of the real link meshes (a whole-link convex hull would fill the gap between the fingers)."""
    m = mujoco.MjModel.from_xml_string(xml); d = mujoco.MjData(m); mujoco.mj_forward(m, d)
    attach = _body(m, lay.attach)
    gj = [mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, j) for j in lay.gripper_joints]
    # open / close: the joint limit that takes each finger farthest from / nearest to the TCP
    opened, close = {}, {}
    for j in gj:
        lo, hi = m.jnt_range[j] if m.jnt_limited[j] else (-1.0, 1.0)
        dist = {}
        for q in (lo, hi):
            d2 = mujoco.MjData(m); d2.qpos[m.jnt_qposadr[j]] = q; mujoco.mj_forward(m, d2)
            pts = _subtree_points(m, d2, _descendants(m, int(m.jnt_bodyid[j])))
            dist[q] = float(np.min(np.linalg.norm(pts - _tcp_world(m, d2, lay.tcp_body, lay.tcp_local), axis=1))) if len(pts) else 0.0
        opened[j], close[m.joint(j).name] = (lo, hi) if dist[lo] >= dist[hi] else (hi, lo)
    for j, q in opened.items(): d.qpos[m.jnt_qposadr[j]] = q
    mujoco.mj_forward(m, d)                                   # work at the open pose
    tcp = _tcp_world(m, d, lay.tcp_body, lay.tcp_local)
    moving = set().union(*[_descendants(m, int(m.jnt_bodyid[j])) for j in gj])
    def finger_of(b):   # which gripper joint moves body b (-1: the fixed part of the gripper)
        return next((k for k, j in enumerate(gj) if b in _descendants(m, int(m.jnt_bodyid[j]))), -1)
    bodies = _descendants(m, attach)
    # finger direction: from the jaw joints out to the TCP
    anchor = np.mean([d.xanchor[j] for j in gj], axis=0)
    fdir = tcp - anchor; reach = float(np.linalg.norm(fdir)); fdir /= max(reach, 1e-9)
    back = min(0.025, 0.45 * reach)
    rng = np.random.default_rng(0)
    pads = []   # (body, world points)
    for b in bodies:
        pts = [_sample_surface(m, d, g, rng=rng) for g in range(m.ngeom) if m.geom_bodyid[g] == b and _collision_geom(m, g)]
        if not pts: continue
        P = np.vstack(pts); rel = P - tcp; along = rel @ fdir
        lateral = np.linalg.norm(rel - np.outer(along, fdir), axis=1)
        P = P[(along >= -back) & (lateral <= 0.08)]
        for c in _clusters(P):
            if len(c) >= 8 and np.linalg.matrix_rank(c - c.mean(0), tol=1e-4) == 3: pads.append((b, c))
    sides = sorted({finger_of(b) for b, _ in pads})
    if len(sides) < 2 or not any(b in moving for b, _ in pads):
        return _result(None, "untested: could not find opposing finger surfaces around the TCP", pads=len(pads))
    # closing direction: from one finger's pads (the fixed finger if there is one) to the other's, perpendicular to the fingers
    fp = np.vstack([c for b, c in pads if finger_of(b) == sides[0]]); mp = np.vstack([c for b, c in pads if finger_of(b) == sides[1]])
    pads = [(b, c) for b, c in pads if finger_of(b) in sides[:2]]
    cdir = mp.mean(0) - fp.mean(0); cdir -= (cdir @ fdir) * fdir; cdir /= np.linalg.norm(cdir)
    adir = np.cross(fdir, cdir)
    # build the test scene: pads, a free box and gravity along the finger direction
    s = _spec_xml(xml)
    for k, (b, c) in enumerate(pads):
        R = d.xmat[b].reshape(3, 3); local = (c - d.xpos[b]) @ R
        s.add_mesh(name=f"ttr_pad{k}", uservert=local.flatten().tolist())
        s.body(m.body(b).name).add_geom(type=mujoco.mjtGeom.mjGEOM_MESH, meshname=f"ttr_pad{k}", contype=2, conaffinity=2, condim=4,
                                       friction=[0.5, 0.005, 0.0001], group=4, mass=0, density=0, rgba=[0.2, 0.8, 0.3, 0.5])
    # finger gap through the TCP: nearest pad surface on each side along the closing direction
    hp = float(np.min((mp - tcp) @ cdir)); hm = float(np.min(-(fp - tcp) @ cdir))
    if hp <= 0 or hm <= 0:
        return _result(None, "untested: the TCP is not between two finger surfaces", gap_plus=_r(hp), gap_minus=_r(hm))
    gap = hp + hm; width = 0.5 * gap; centre = tcp + cdir * (hp - hm) / 2
    depth = min(0.02, 0.9 * back)
    Rb = np.stack([cdir, adir, fdir], 1); quat = np.zeros(4); mujoco.mju_mat2Quat(quat, Rb.flatten())
    box = s.worldbody.add_body(name="ttr_grip_box", pos=centre.tolist(), quat=quat.tolist())
    box.add_freejoint(name="ttr_grip_box")
    box.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, size=[width / 2, 0.01, depth / 2], mass=float(payload), contype=2, conaffinity=2, condim=4,
                 friction=[0.5, 0.005, 0.0001], rgba=[0.85, 0.15, 0.12, 1])
    # MuJoCo's default soft pyramidal cone lets a squeezed object creep; grasping needs the
    # elliptic cone and a high impedance ratio (MuJoCo documentation, "Contact")
    s.option.cone = mujoco.mjtCone.mjCONE_ELLIPTIC; s.option.impratio = 10
    m2 = s.compile()
    rig = Rig(m2)
    grip_acts = [A for A in rig.acts if A["joint"] in close]
    for A in grip_acts:   # continuous holding: the gripper may use its RATED torque, not its stall torque
        if A["rated"]: A["limit"] = A["rated"]
    m2.opt.gravity[:] = 0
    for j, q in opened.items(): rig.d.qpos[m2.jnt_qposadr[mujoco.mj_name2id(m2, mujoco.mjtObj.mjOBJ_JOINT, m.joint(j).name)]] = q
    mujoco.mj_forward(m2, rig.d)
    q0 = rig.q(); target = q0.copy()
    for i, A in enumerate(rig.acts):
        if A["joint"] in close: target[i] = close[A["joint"]]
    for A in grip_acts: m2.actuator_ctrllimited[A["index"]] = 0
    for k in range(int(1.2 / m2.opt.timestep)):
        s_, _, _ = _min_jerk(k * m2.opt.timestep, 0.6)
        rig.step(q0 + (target - q0) * s_)
    bid = _body(m2, "ttr_grip_box"); ab = _body(m2, lay.attach)
    def box_local():
        return rig.d.xmat[ab].reshape(3, 3).T @ (rig.d.xpos[bid] - rig.d.xpos[ab])
    def normal_force():
        total = 0.0
        for c in range(rig.d.ncon):
            con = rig.d.contact[c]
            if bid in (m2.geom_bodyid[con.geom1], m2.geom_bodyid[con.geom2]):
                f = np.zeros(6); mujoco.mj_contactForce(m2, rig.d, c, f); total += abs(f[0])
        return total
    clamp = normal_force()
    p0 = box_local(); t_on = rig.t
    m2.opt.gravity[:] = G * fdir        # the box's weight pulls it straight out of the fingers
    ok = True
    for _ in range(int(HOLD_S / m2.opt.timestep)):
        ok = rig.step(target) and ok
    # slip = motion along the pull (out of the fingers); two force-limited fingers may also let the
    # clamped box drift sideways together, which is reported but is not slip
    f_local = rig.d.xmat[ab].reshape(3, 3).T @ fdir
    moved = box_local() - p0
    slip = float(abs(moved @ f_local)) if np.linalg.norm(moved) < 0.05 else float(np.linalg.norm(moved))
    sideways = float(np.linalg.norm(moved - (moved @ f_local) * f_local))
    normal = normal_force()
    util = rig.utilisation(set(close), hold=(t_on, None), whole=(t_on, None))
    passed = ok and slip <= SLIP_M
    needed = payload * G / (2 * 0.5)
    why = (f"holds {payload:g} kg against its weight with friction 0.5: slip {slip*1000:.1f} mm in {HOLD_S:.0f} s, "
           f"clamp force {clamp:.1f} N (needs >= {needed:.1f} N), gripper limited to its "
           + ("rated (continuous) torque" if all(A["rated"] for A in grip_acts) else "peak torque (no continuous rating known)")) if passed else \
          ((f"box slips {slip*1000:.1f} mm in {HOLD_S:.0f} s" if slip < 0.05 else "box drops out of the fingers")
           + f": clamp force {clamp:.1f} N (sum of finger normal forces before loading) but {payload:g} kg at friction 0.5 needs {needed:.1f} N"
           + ("" if ok else "; simulation diverged"))
    return _result(passed, why, payload_kg=payload, friction=0.5, slip_mm=_r(min(slip, 1.0) * 1000, 2), sideways_drift_mm=_r(min(sideways, 1.0) * 1000, 2), clamp_force_n=_r(clamp, 2), normal_force_end_n=_r(normal, 2), required_normal_n=_r(needed, 2),
                   box_width_m=_r(width), finger_gap_m=_r(gap), close_targets=close, actuator_limit="rated torque (continuous)" if all(A["rated"] for A in grip_acts) else "peak torque (no rated value known)",
                   pads=len(pads), joints=util)


# ----------------------------------------------------------------------------- wheeled
PERF_SPEED = ("top_speed_m_s", "max_speed_m_s", "speed_m_s", "cruise_speed_m_s", "top_speed")
PERF_SLOPE = ("max_slope_deg", "slope_deg", "climb_deg", "grade_deg")


def _perf(design, keys):
    perf = (design or {}).get("performance") or {}
    for k in keys:
        v = perf.get(k)
        if isinstance(v, (int, float)) and v > 0: return k, float(v)
    return None, None


class Wheels:
    """Drive wheels (velocity actuators): radius, rolling direction and position in the base frame."""

    def __init__(self, m):
        d = mujoco.MjData(m); mujoco.mj_forward(m, d)
        self.base = int(m.jnt_bodyid[0]) if _is_free(m) else 1
        Rb = d.xmat[self.base].reshape(3, 3); com = d.subtree_com[self.base]
        self.items = []
        for a in range(m.nu):
            if not (m.actuator_biasprm[a, 1] == 0 and m.actuator_biasprm[a, 2] != 0): continue
            j = int(m.actuator_trnid[a, 0]); b = int(m.jnt_bodyid[j])
            axis = d.xaxis[j]; anc = d.xanchor[j]
            pts = _subtree_points(m, d, _descendants(m, b))
            if not len(pts): continue
            rel = pts - anc; radius = float(np.max(np.linalg.norm(rel - np.outer(rel @ axis, axis), axis=1)))
            ax_b = Rb.T @ axis; pos_b = Rb.T @ (d.xipos[b] - com)
            roll = np.cross(ax_b, [0, 0, 1.0])       # base-frame direction the wheel centre moves per +rad/s (times r)
            passive = sum(1 for jj in range(m.njnt) if int(m.jnt_bodyid[jj]) in _descendants(m, b) and jj != j and not any(int(m.actuator_trnid[x, 0]) == jj for x in range(m.nu)))
            self.items.append(dict(act=a, joint=m.joint(j).name, radius=radius, axis=ax_b, pos=pos_b, roll=roll, rollers=passive))
        self.track = 2 * max((abs(w["pos"][1]) for w in self.items), default=0.1)

    def command(self, vx=0.0, vy=0.0, wz=0.0, mecanum=False):
        """Wheel speeds (rad/s) for a body twist: no-slip rolling for ordinary wheels; the standard
        X-pattern for mecanum wheels (rollers at 45 deg)."""
        out = {}
        for w in self.items:
            v = np.array([vx, vy, 0.0]) + np.cross([0, 0, wz], w["pos"])
            if mecanum:
                fwd = np.sign(w["roll"][0]) or 1.0
                quad = np.sign(w["pos"][0]) * np.sign(w["pos"][1])           # +1 FL / RR, -1 FR / RL
                out[w["act"]] = fwd * (v[0] - quad * v[1]) / w["radius"]
            else:
                n2 = float(w["roll"] @ w["roll"])
                out[w["act"]] = float(v @ w["roll"]) / (w["radius"] * n2) if n2 > 0.05 else 0.0
        return out


def _base_pose(m, d):
    yaw = np.arctan2(2 * (d.qpos[3] * d.qpos[6] + d.qpos[4] * d.qpos[5]), 1 - 2 * (d.qpos[5] ** 2 + d.qpos[6] ** 2))
    return d.qpos[:3].copy(), float(yaw)


def wheeled_tasks(xml, design, family):
    m = mujoco.MjModel.from_xml_string(xml)
    if not _is_free(m): return {"drive": _result(None, "untested: model has no free base")}
    W = Wheels(m)
    if not W.items: return {"drive": _result(None, "untested: no driven (velocity-controlled) wheels found")}
    names = {w["joint"] for w in W.items}
    k, claim = _perf(design, PERF_SPEED)
    rig0 = Rig(m)
    v_free = min(rig0.by_joint(w["joint"])["noload"] * w["radius"] for w in W.items if rig0.by_joint(w["joint"])["noload"]) if all(rig0.by_joint(w["joint"])["noload"] for w in W.items) else 0.5
    v_cmd = claim or 0.8 * v_free
    mec = family == "mecanum"
    out = {}

    def run(cmd_fn, seconds, gravity=None, stop=None):
        mm = mujoco.MjModel.from_xml_string(xml)
        if gravity is not None: mm.opt.gravity[:] = gravity
        rig = Rig(mm); mujoco.mj_forward(mm, rig.d)
        hold = np.zeros(mm.nu)
        for A in rig.acts:
            if not A["velocity"]: hold[A["index"]] = rig.d.qpos[A["qadr"]]
        for _ in range(int(0.5 / mm.opt.timestep)): rig.step(hold)         # settle on the wheels
        p0, y0 = _base_pose(mm, rig.d); t0 = rig.t; ok = True; min_up = 1.0
        while rig.t - t0 < seconds:
            min_up = min(min_up, _upright(rig.d))
            ref = hold.copy(); s_, _, _ = _min_jerk(rig.t - t0, 0.5)
            for a, w in cmd_fn().items(): ref[a] = w * s_
            ok = rig.step(ref) and ok
            if not ok: break
            if stop and stop(rig.d, p0): break
        p1, y1 = _base_pose(mm, rig.d)
        rig.min_upright = min_up
        return rig, p0, y0, p1, y1, t0, ok

    # straight 2 m
    dist = 2.0
    cmd = W.command(vx=v_cmd, mecanum=mec)
    rig, p0, y0, p1, y1, t0, ok = run(lambda: cmd, 0.5 + 2.5 * dist / max(v_cmd, 1e-3), stop=lambda d, p0: np.linalg.norm(d.qpos[:2] - p0[:2]) >= dist)
    T = rig.t - t0; heading = np.array([np.cos(y0), np.sin(y0)])
    travel = float((p1[:2] - p0[:2]) @ heading); dp = p1[:2] - p0[:2]; lateral = float(heading[0] * dp[1] - heading[1] * dp[0])
    # cruise speed: second half of the run
    cruise_t = t0 + 0.5 + 0.5 * max(T - 0.5, 0)
    v_ach = travel / T if T > 0 else 0.0
    util = rig.utilisation(names, hold=(cruise_t, None), mean_label="mean_cruise")
    drift = float(np.degrees(np.angle(np.exp(1j * (y1 - y0)))))
    sat_speed = any(abs(w) > (rig.by_joint(rig.acts[a]["joint"])["noload"] or np.inf) for a, w in cmd.items())
    v_end = float(np.linalg.norm(rig.d.qvel[:2]))
    over = [j for j, u in util.items() if u["util_rated"] is not None and u["util_rated"] > 1]
    ok_speed = claim is None or v_end >= 0.9 * claim
    tipped = rig.min_upright < np.cos(np.radians(30))
    passed = ok and travel >= 0.95 * dist and ok_speed and abs(drift) <= 5 and abs(lateral) <= 0.1 and not over and not tipped
    out["drive_straight"] = _result(passed, (
        f"{travel:.2f} m in {T:.2f} s, cruise speed {v_end:.3f} m/s vs {'claimed ' + format(claim, '.3f') if claim else 'no claimed top speed; commanded ' + format(v_cmd, '.3f')} m/s, "
        f"heading drift {drift:.1f} deg, lateral {lateral*100:.1f} cm" + (f"; mean wheel torque over rated at {_names(over)}" if over else "")
        + ("; commanded wheel speed exceeds the motor no-load speed" if sat_speed else "") + ("; the body tipped over (> 30 deg)" if tipped else "")),
        claimed_speed_m_s=claim, claim_key=k, commanded_m_s=_r(v_cmd), cruise_speed_m_s=_r(v_end), mean_speed_m_s=_r(v_ach), distance_m=_r(travel),
        heading_drift_deg=_r(drift, 2), lateral_m=_r(lateral), wheel_radius_m=[_r(w["radius"]) for w in W.items], joints=util)

    # ramp: tilt gravity so the slope rises along the robot's +x
    sk, sclaim = _perf(design, PERF_SLOPE)
    for deg in sorted({10.0} | ({sclaim} if sclaim and sclaim > 10 else set())):
        th = np.radians(deg); g = [-G * np.sin(th), 0.0, -G * np.cos(th)]
        cmd = W.command(vx=v_cmd, mecanum=mec)
        rig, p0, y0, p1, y1, t0, ok = run(lambda: cmd, 3.0, gravity=g)
        up = float(p1[0] - p0[0]); v_up = float(rig.d.qvel[0])
        util = rig.utilisation(names, hold=(t0 + 1.0, None), mean_label="mean_climb")
        tipped = rig.min_upright < np.cos(np.radians(30))
        passed = ok and up >= 0.5 * v_cmd * 2.5 and v_up >= 0.5 * v_cmd and not tipped
        out[f"ramp_{deg:g}deg"] = _result(passed, f"from standstill on a {deg:g} deg slope: {up:.2f} m uphill in 3 s, speed {v_up:.3f} m/s of {v_cmd:.3f} commanded"
                                          + ("" if passed else " (needs >= 50 % of the commanded speed)") + ("; the body tipped over" if tipped else ""),
                                          slope_deg=deg, claim_key=sk if deg == sclaim else None, uphill_m=_r(up), speed_m_s=_r(v_up), joints=util)

    # turn in place (and strafe for mecanum)
    wz = 0.5 * v_cmd / max(W.track / 2, 0.02)
    cmd = W.command(wz=wz, mecanum=mec)
    rig, p0, y0, p1, y1, t0, ok = run(lambda: cmd, 3.0)
    yaw_rate = float(rig.d.qvel[5]); moved = float(np.linalg.norm(p1[:2] - p0[:2]))
    util = rig.utilisation(names, hold=(t0 + 1.0, None), mean_label="mean_turn")
    passed = ok and yaw_rate >= 0.5 * wz and moved <= 0.1 + 0.05 * W.track and rig.min_upright >= np.cos(np.radians(30))
    out["turn_in_place"] = _result(passed, f"yaw rate {yaw_rate:.2f} rad/s of {wz:.2f} commanded, centre moved {moved*100:.1f} cm",
                                   commanded_rad_s=_r(wz), yaw_rate_rad_s=_r(yaw_rate), drift_m=_r(moved), track_m=_r(W.track), joints=util)
    if mec:
        if not any(w["rollers"] for w in W.items):
            out["strafe"] = _result(None, "untested: mecanum rollers are not modelled as joints, so a rigid wheel cannot strafe in simulation")
        else:
            vy = 0.5 * v_cmd; cmd = W.command(vy=vy, mecanum=True)
            rig, p0, y0, p1, y1, t0, ok = run(lambda: cmd, 3.0)
            side = float(p1[1] - p0[1]); drift = float(np.degrees(y1 - y0))
            passed = ok and side >= 0.5 * vy * 2.5 and abs(drift) <= 10
            out["strafe"] = _result(passed, f"{side:.2f} m sideways in 3 s at {vy:.2f} m/s commanded, heading drift {drift:.1f} deg",
                                    sideways_m=_r(side), heading_drift_deg=_r(drift, 2), joints=rig.utilisation(names, hold=(t0 + 1.0, None)))
    return out


# ----------------------------------------------------------------------------- legged
class Legs:
    def __init__(self, m):
        d = mujoco.MjData(m); mujoco.mj_forward(m, d)
        self.base = int(m.jnt_bodyid[0]) if _is_free(m) else 1
        allpts = _subtree_points(m, d, _descendants(m, self.base))
        floor = float(allpts[:, 2].min()) if len(allpts) else 0.0
        actuated = {int(m.actuator_trnid[a, 0]) for a in range(m.nu)}
        # the trunk: the free body and everything welded to it (bodies without joints)
        trunk = {self.base}
        for b in range(self.base + 1, m.nbody):
            if int(m.body_parentid[b]) in trunk and m.body_jntnum[b] == 0: trunk.add(b)
        self.trunk = trunk
        self.legs = []
        for child in range(m.nbody):
            if int(m.body_parentid[child]) not in trunk or child in trunk: continue
            sub = _descendants(m, child)
            joints = [j for j in range(m.njnt) if int(m.jnt_bodyid[j]) in sub and j in actuated]
            if not joints: continue
            best = None
            for g in range(m.ngeom):
                if m.geom_bodyid[g] not in sub or not _collision_geom(m, g): continue
                p = _geom_points(m, d, g)
                if len(p):
                    zmin = float(p[:, 2].min()); sole = p[p[:, 2] <= zmin + 0.001].mean(0)   # centre of a flat sole, not a corner
                    if best is None or zmin < best[0]: best = (zmin, int(m.geom_bodyid[g]), sole)
            if best is None or best[0] > floor + 0.02: continue      # not a support leg (arm, head, tail)
            fb = best[1]; local = d.xmat[fb].reshape(3, 3).T @ (best[2] - d.xpos[fb])
            length = float(np.linalg.norm(best[2] - d.xanchor[joints[0]]))
            self.legs.append(dict(root=child, bodies=sub, joints=joints, foot=fb, foot_local=local, length=length,
                                  names=[m.joint(j).name for j in joints]))
        # an arm that happens to hang down to the floor is not a leg
        armish = re.compile(r"arm|shoulder|elbow|wrist|hand|finger|gripper", re.I)
        if any(not any(armish.search(n) for n in l["names"]) for l in self.legs):
            self.legs = [l for l in self.legs if not armish.search(l["names"][0])]
        self.leg_length = max((l["length"] for l in self.legs), default=0.0)

    def squat_pose(self, m, lower):
        """Per-leg damped-least-squares IK: every foot rises by `lower` in the base frame
        (= base lowered with the feet planted); the sole orientation is kept in the null space."""
        d = mujoco.MjData(m); mujoco.mj_forward(m, d)
        Rb = d.xmat[self.base].reshape(3, 3)
        target = {}
        for leg in self.legs:
            fb = leg["foot"]; dofs = [int(m.jnt_dofadr[j]) for j in leg["joints"]]
            p_goal = d.xpos[fb] + d.xmat[fb].reshape(3, 3) @ leg["foot_local"] + Rb @ np.array([0, 0, lower])
            R_goal = d.xmat[fb].reshape(3, 3).copy()
            home = {j: float(d.qpos[m.jnt_qposadr[j]]) for j in leg["joints"]}
            best = None
            # a straight leg is singular for vertical motion: retry from slightly bent seeds
            seeds = [np.zeros(len(dofs))] + [np.random.default_rng(k).choice([-0.15, 0.15], len(dofs)) for k in range(12)]
            for seed in seeds:
                for j, x in zip(leg["joints"], seed):
                    a_ = int(m.jnt_qposadr[j]); d.qpos[a_] = home[j] + x
                    if m.jnt_limited[j]: d.qpos[a_] = np.clip(d.qpos[a_], *m.jnt_range[j])
                for _ in range(200):
                    mujoco.mj_forward(m, d)
                    p = d.xpos[fb] + d.xmat[fb].reshape(3, 3) @ leg["foot_local"]
                    jp = np.zeros((3, m.nv)); jr = np.zeros((3, m.nv)); mujoco.mj_jac(m, d, jp, jr, p, fb)
                    e = p_goal - p; J = jp[:, dofs]
                    Rc = d.xmat[fb].reshape(3, 3); Re = R_goal @ Rc.T
                    rot = 0.5 * np.array([Re[2, 1] - Re[1, 2], Re[0, 2] - Re[2, 0], Re[1, 0] - Re[0, 1]])
                    if np.linalg.norm(e) < 1e-6 and np.linalg.norm(rot) < 1e-5: break
                    Jp = J.T @ np.linalg.inv(J @ J.T + 1e-6 * np.eye(3))
                    dq = Jp @ e
                    # keep the sole's orientation with the redundancy left over (exact for >= 6 joints)
                    Jr = jr[:, dofs]; N = np.eye(len(dofs)) - Jp @ J
                    JrN = Jr @ N
                    dq += N @ (JrN.T @ np.linalg.solve(JrN @ JrN.T + 1e-4 * np.eye(3), rot - Jr @ dq))
                    for j, x in zip(leg["joints"], dq):
                        a_ = int(m.jnt_qposadr[j]); d.qpos[a_] += x
                        if m.jnt_limited[j]: d.qpos[a_] = np.clip(d.qpos[a_], *m.jnt_range[j])
                mujoco.mj_forward(m, d)
                err = float(np.linalg.norm(p_goal - (d.xpos[fb] + d.xmat[fb].reshape(3, 3) @ leg["foot_local"])))
                if best is None or err < best[0] - 1e-6: best = (err, {j: float(d.qpos[m.jnt_qposadr[j]]) for j in leg["joints"]})
                if err < 1e-4: break
            for j in leg["joints"]: d.qpos[m.jnt_qposadr[j]] = best[1][j]
            mujoco.mj_forward(m, d)
            leg["ik_error_m"] = best[0]
            for j in leg["joints"]: target[m.joint(j).name] = float(d.qpos[m.jnt_qposadr[j]])
            for j in leg["joints"]: d.qpos[m.jnt_qposadr[j]] = home[j]     # next leg starts from home
        return target


def _rail(xml):
    """Replace the free base by a vertical slide: a guided test stand that removes balance
    but leaves the full body weight on the legs."""
    return re.sub(r'<freejoint name="root"\s*/>', '<joint name="root_rail" type="slide" axis="0 0 1"/>', xml, count=1)


def _stand(xml, seconds=5.0, rail=False, no_contact=()):
    m = mujoco.MjModel.from_xml_string(xml)
    for g in range(m.ngeom):          # lift legs out of the test by removing their contacts
        if int(m.geom_bodyid[g]) in no_contact: m.geom_contype[g] = 0; m.geom_conaffinity[g] = 0
    rig = Rig(m); mujoco.mj_forward(m, rig.d)
    hold = np.array([rig.d.qpos[A["qadr"]] if not A["velocity"] else 0.0 for A in rig.acts])
    zs = []; ok = True
    for k in range(int(seconds / m.opt.timestep)):
        ok = rig.step(hold) and ok
        if not ok: break
        if k % 5 == 0: zs.append((rig.t, float(rig.d.qpos[2] if not rail else rig.d.xpos[1][2])))
    return rig, hold, np.array(zs), ok


def legged_tasks(xml, family):
    m = mujoco.MjModel.from_xml_string(xml)
    if not _is_free(m): return {"stand": _result(None, "untested: model has no free base")}
    L = Legs(m)
    if not L.legs: return {"stand": _result(None, "untested: no support legs found (no actuated branch reaches the floor)")}
    leg_names = {n for l in L.legs for n in l["names"]}
    all_names = {m.joint(int(m.actuator_trnid[a, 0])).name for a in range(m.nu)}
    out = {}
    humanoid = family in ("humanoid", "biped") or len(L.legs) < 3

    def stand_report(rig, zs, ok, label, upright_req=True):
        z0 = float(zs[0, 1]); zset = float(zs[zs[:, 0] <= 0.5][-1, 1]); zend = float(zs[-1, 1])
        up = _upright(rig.d) if _is_free(rig.m) else 1.0
        util = rig.utilisation(all_names, hold=(rig.t - 2.0, None))
        legu = {j: u for j, u in util.items() if j in leg_names}
        over = [j for j, u in legu.items() if u["util_rated"] is not None and u["util_rated"] > 1]
        sat = [j for j, u in legu.items() if u["saturated_frac"] > 0]
        creep = zset - zend
        passed = ok and up >= np.cos(np.radians(15)) and creep <= 0.02 * L.leg_length + 0.002 and not over and not sat
        why = (f"base z {z0:.3f} -> {zend:.3f} m (creep after settling {creep*1000:.1f} mm), upright {up:.3f}; "
               + (f"worst leg joint {max(legu.items(), key=lambda kv: kv[1]['util_rated'] or 0)[0]} at {max((u['util_rated'] or 0) for u in legu.values()):.2f}x rated"
                  if any(u["util_rated"] is not None for u in legu.values()) else
                  f"no continuous ratings known; worst leg joint at {max((u['util_peak'] or 0) for u in legu.values()):.2f}x peak" if legu else "")
               + (f"; over rated: {_names(over)}" if over else "") + (f"; saturated: {_names(sat)}" if sat else ""))
        return passed, _result(passed, why, base_z_start=_r(z0), base_z_settled=_r(zset), base_z_end=_r(zend), base_drop_m=_r(z0 - zend),
                               creep_m=_r(creep), upright=_r(up, 4), leg_length_m=_r(L.leg_length), joints=util)

    # free standing, joints holding the home pose, no balance controller
    rig, hold, zs, ok = _stand(xml)
    passed, res = stand_report(rig, zs, ok, "free")
    if humanoid:
        res["pass"] = None
        res["explanation"] = "informational (no balance controller; a biped is not statically stable): " + res["explanation"]
    out["stand_free"] = res

    lower = 0.2 * L.leg_length
    target = L.squat_pose(m, lower)
    ik_err = max(l.get("ik_error_m", 0) for l in L.legs)

    def squat(xml_s, label, rail):
        mm = mujoco.MjModel.from_xml_string(xml_s); rig = Rig(mm); mujoco.mj_forward(mm, rig.d)
        q0 = np.array([rig.d.qpos[A["qadr"]] if not A["velocity"] else 0.0 for A in rig.acts]); q1 = q0.copy()
        for i, A in enumerate(rig.acts):
            if A["joint"] in target: q1[i] = target[A["joint"]]
        bz = lambda: float(rig.d.xpos[L.base][2])
        ok = True
        for _ in range(int(1.0 / mm.opt.timestep)): ok = rig.step(q0) and ok
        z_top = bz(); t_down = rig.t
        for k in range(int(3.5 / mm.opt.timestep)):
            s_, _, _ = _min_jerk(rig.t - t_down, 2.0); ok = rig.step(q0 + (q1 - q0) * s_) and ok
        z_low = bz(); t_up = rig.t
        for k in range(int(2.5 / mm.opt.timestep)):
            s_, _, _ = _min_jerk(rig.t - t_up, 2.0); ok = rig.step(q1 + (q0 - q1) * s_) and ok
        z_back = bz()
        up = _upright(rig.d) if _is_free(mm) else 1.0
        util = rig.utilisation(all_names, hold=(t_down + 2.0, t_up), whole=(t_down, None), mean_label="mean_low")
        legu = {j: u for j, u in util.items() if j in leg_names}
        sat = [j for j, u in legu.items() if u["saturated_frac"] > 0.02]
        over = [j for j, u in legu.items() if u["util_rated"] is not None and u["util_rated"] > 1]
        achieved = z_top - z_low
        passed = ok and 0.7 * lower <= achieved <= 1.3 * lower and abs(z_back - z_top) <= 0.3 * lower and up >= np.cos(np.radians(20)) and not sat and not over
        why = (f"{label}: commanded body drop {lower*1000:.0f} mm (20 % of {L.leg_length*1000:.0f} mm leg), achieved {achieved*1000:.0f} mm, "
               f"back up to {(z_back - z_low)*1000:.0f} mm above the low point, upright {up:.3f}"
               + (f"; saturated: {_names(sat)}" if sat else "") + (f"; mean torque over rated while low: {_names(over)}" if over else ""))
        return _result(passed, why, commanded_drop_m=_r(lower), achieved_drop_m=_r(achieved), base_z_top=_r(z_top), base_z_low=_r(z_low), base_z_back=_r(z_back),
                       upright=_r(up, 4), ik_error_m=_r(ik_err, 5), joints=util)

    if humanoid:
        rx = _rail(xml)
        rig, hold, zs, ok = _stand(rx, rail=True)
        p2, res = stand_report(rig, zs, ok, "rail")
        res["explanation"] = "on a vertical guide rail (balance removed, full weight on the legs): " + res["explanation"]
        out["stand_rail"] = res
        # single-leg weight test: every other support leg lifted out of contact
        keep = L.legs[0]
        off = set().union(*[l["bodies"] for l in L.legs if l is not keep])
        rig, hold, zs, ok = _stand(rx, rail=True, no_contact=off)
        p3, res = stand_report(rig, zs, ok, "single")
        res["explanation"] = f"one leg ({keep['names'][0]} chain) carrying the full body weight on the rail, the other legs out of contact: " + res["explanation"]
        out["single_leg_rail"] = res
        out["squat_rail"] = squat(rx, "on the rail", True)
    else:
        out["squat"] = squat(xml, "free standing", False)
    return out


# ----------------------------------------------------------------------------- generic / exo
def generic_hold(xml, note):
    m = mujoco.MjModel.from_xml_string(xml)
    rig, hold, zs, ok = _stand(xml, seconds=3.0)
    names = {A["joint"] for A in rig.acts}
    util = rig.utilisation(names, hold=(1.0, None))
    sat = [j for j, u in util.items() if u["saturated_frac"] > 0]
    over = [j for j, u in util.items() if u["util_rated"] is not None and u["util_rated"] > 1]
    extra = {}
    if _is_free(m): extra = dict(base_drop_m=_r(zs[0, 1] - zs[-1, 1]), upright=_r(_upright(rig.d), 4))
    passed = ok and not sat and not over
    return {"hold_home": _result(passed, f"{note}: holds the home pose for 3 s" + (f"; saturated {_names(sat)}" if sat else "") + (f"; over rated {_names(over)}" if over else ""),
                                 joints=util, **extra)}


def exo_tasks(xml):
    from .exo import add_wearer, assist_test
    try:
        wx = add_wearer(xml)
    except ValueError as e:
        return generic_hold(xml, f"exo without a wearer mount ({e})")
    rep = assist_test(wx)
    m = mujoco.MjModel.from_xml_string(wx); rig = Rig(m)
    ratings = {A["name"]: A for A in rig.acts}
    util = {}
    for name, f in (rep["powered"].get("actuators") or {}).items():
        A = ratings.get(name)
        if not A: continue
        util[A["joint"]] = {"peak_nm": f["peak"], "peak_rating_nm": _r(A["peak"]), "util_peak": _r(f["peak"] / A["peak"], 3),
                            "mean_hold_nm": f["mean"], "rated_nm": _r(A["rated"]), "util_rated": _r(f["mean"] / A["rated"], 3) if A["rated"] else None,
                            "saturated_frac": f.get("saturated_frac")}
    over = [j for j, u in util.items() if u["util_rated"] is not None and u["util_rated"] > 1]
    sat = [j for j, u in util.items() if (u.get("saturated_frac") or 0) > 0]
    passed = rep["suit_supports_wearer"] and not over and not sat
    why = (f"powered head drop {rep['powered']['head_drop_m']} m vs unpowered {rep['unpowered']['head_drop_m']} m"
           + (f"; mean torque over rated at {_names(over)}" if over else "") + (f"; saturated {_names(sat)}" if sat else ""))
    return {"wearer_support": _result(passed, why, joints=util, powered=rep["powered"], unpowered=rep["unpowered"], validation_scope=rep["validation_scope"])}


# ----------------------------------------------------------------------------- entry point
def family_of(spec, urdf_xml=""):
    design = ((spec or {}).get("metadata") or {}).get("design") or {}
    fam = design.get("family") or ((spec or {}).get("metadata") or {}).get("family")
    if fam: return str(fam).lower()
    names = " ".join(re.findall(r'<joint\s+name="([^"]+)"', urdf_xml)).lower()
    if re.search(r"wheel", names): return "wheeled"
    if re.search(r"hip|knee", names): return "legged"
    return "unknown"


def run_tasks(urdf_path, spec=None, verbose=True, family=None):
    spec = load_spec(spec)
    design = ((spec or {}).get("metadata") or {}).get("design") or {}
    urdf_xml = open(urdf_path, encoding="utf8").read()
    family = (family or family_of(spec, urdf_xml)).lower()
    has = lambda words: family in words or any(w in family for w in words)  # design families are prefixed: mobile_diff_drive, character_walle
    group = ("arm" if family in ARM else "wheeled" if has(WHEELED) or "wheel" in family else "legged" if has(LEGGED)
             else "gripper" if has(GRIPPER) else "exo" if has(EXO) else "unknown")
    floating = {"arm": False, "gripper": False, "wheeled": True, "legged": True, "exo": None, "unknown": None}[group]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        xml = urdf_to_mjcf(urdf_path, floating=floating, spec=spec)
    m = mujoco.MjModel.from_xml_string(xml)
    perf = design.get("performance") or {}
    payload = float(perf.get("payload_kg") or 0.0)
    tests, untested = {}, []
    if group == "arm":
        lay = Layout(m, spec, design)
        if not payload: untested.append("no payload claim (performance.payload_kg); arm tests run with 0 kg")
        tests.update(arm_payload_hold(xml, lay, payload, perf.get("reach_m")))
        tests["speed"] = arm_speed(xml, lay, payload)
        if lay.gripper_joints: tests["grip"] = grip_test(xml, lay, payload)
        else: untested.append("grip: the arm has no gripper joint")
    elif group == "gripper":
        lay = Layout(m, spec, design)
        if not lay.gripper_joints:
            lay.gripper_joints = [m.joint(int(m.actuator_trnid[a, 0])).name for a in range(m.nu)]
            lay.attach = lay.attach or m.body(1).name
        tests["grip"] = grip_test(xml, lay, payload or float(perf.get("grip_payload_kg") or 0.1))
    elif group == "wheeled":
        tests.update(wheeled_tasks(xml, design, family))
    elif group == "legged":
        tests.update(legged_tasks(xml, family))
    elif group == "exo":
        tests.update(exo_tasks(xml))
    else:
        tests.update(generic_hold(xml, f"unknown family '{family}': only a generic hold was run"))
        untested.append(f"family '{family}' has no task tests; only the home pose hold under gravity was checked")
    counted = [t for t in tests.values() if t.get("pass") is not None]
    rep = {"model": urdf_path, "family": family, "group": group, "scope": SCOPE, "untested": untested,
           "fidelity": next((t for t in re.findall(r'name="ttr_fidelity" data="([^"]*)"', xml)), None),
           "tests": tests, "passed": sum(bool(t["pass"]) for t in counted), "total": len(counted)}
    if verbose:
        print(f"task tests: {urdf_path} (family {family})")
        for k, t in tests.items():
            flag = "PASS" if t["pass"] else "----" if t["pass"] is None else "FAIL"
            print(f"  {flag}  {k:<22} {t['explanation']}")
        print(f"  {rep['passed']}/{rep['total']} task tests passed")
    return rep
