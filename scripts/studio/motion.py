"""Record a short motion loop of an example in MuJoCo, for the Cycles film (scripts/studio/robot_film.py).

Nothing here is animated by hand: every joint is commanded through the model's real actuators (Rig: datasheet torque and the
torque-speed line) and the pose of every link is read back from the physics, so a motor that cannot do the move shows it. Wheeled
robots follow a body path with a little heading and position feedback, as a real controller would; legged robots run a gait whose
foot paths go through inverse kinematics; arms run key poses in joint space.

    MUJOCO_GL=disable .venv/bin/python -B scripts/studio/motion.py <example> [--out out/studio]
"""
from __future__ import annotations
import argparse, itertools, json, math, sys, warnings
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
import mujoco
import numpy as np
from ttr_mujoco import tasks
from ttr_mujoco.convert import urdf_to_mjcf

FPS = 12


def smooth(x): x = min(1.0, max(0.0, x)); return x * x * x * (10 - 15 * x + 6 * x * x)


def keyed(keys, t):
    """Value of each joint at t from [(time, {joint: value}), ...]: joints ease between keys, and a joint keeps its last value."""
    out, names = {}, {j for _, k in keys for j in k}
    for j in names:
        ks = [(tk, k[j]) for tk, k in keys if j in k]
        if t <= ks[0][0]: out[j] = ks[0][1]; continue
        for (a, va), (b, vb) in zip(ks, ks[1:]):
            if a <= t <= b: out[j] = va + (vb - va) * smooth((t - a) / max(b - a, 1e-6)); break
        else: out[j] = ks[-1][1]
    return out


class Take:
    """A model, its actuators, and the frames recorded so far."""

    def __init__(self, ex, floating, rail=False, pose=None):
        self.dir = ROOT / "examples" / ex; self.spec = json.loads((self.dir / "robot.json").read_text())
        self.design = self.spec["metadata"].get("design") or {}
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            xml = urdf_to_mjcf(str(self.dir / "robot.urdf"), floating=floating, spec=self.spec)
        self.xml = tasks._rail(xml) if rail else xml
        self.m = mujoco.MjModel.from_xml_string(self.xml); self.rig = tasks.Rig(self.m); self.d = self.rig.d
        self.frames, self.notes = [], []; self.sub = max(1, round(1 / FPS / self.m.opt.timestep))
        self.bodies = [(b, self.m.body(b).name) for b in range(1, self.m.nbody)]
        self.ref = np.zeros(self.m.nu); self.peak_err = 0.0
        self.home = {**(self.design.get("home") or {}), **(pose or {})}
        for A in self.rig.acts:
            if A["joint"] in self.home: self.d.qpos[A["qadr"]] = self.home[A["joint"]]
        mujoco.mj_forward(self.m, self.d)
        for A in self.rig.acts:
            if not A["velocity"]: self.ref[A["index"]] = self.d.qpos[A["qadr"]]
        self.index = {A["joint"]: A["index"] for A in self.rig.acts}

    def set(self, joints):
        for j, v in joints.items():
            if j in self.index: self.ref[self.index[j]] = v
            else: raise KeyError(f"no actuator on joint {j}")

    def step_frame(self, control=None, record=True):
        for _ in range(self.sub):
            if control: control()
            if not self.rig.step(self.ref, log=False): raise RuntimeError("simulation diverged")
        if record: self.frames.append({n: [round(float(x), 5) for x in (*self.d.xpos[b], *self.d.xquat[b])] for b, n in self.bodies})

    def settle(self, seconds=1.0):
        for _ in range(int(seconds * FPS)): self.step_frame(record=False)


def arm_take(ex, keys, T, floating=False, pin=False):
    k = Take(ex, floating)
    if pin:   # worn armour: the wearer holds the limbs still, so the joints without a motor do not droop
        driven = {A["jid"] for A in k.rig.acts}
        for j in range(k.m.njnt):
            if j not in driven: k.m.dof_damping[k.m.jnt_dofadr[j]] = 1e7
    first = {j: float(k.d.qpos[k.rig.acts[k.index[j]]["qadr"]]) for _, p in keys for j in p}
    keys = [(0.0, first), *keys, (T, first)]
    k.set(keyed(keys, 0)); k.settle(1.0)
    for f in range(int(T * FPS)):
        t = f / FPS
        def control(t0=t):
            k.set(keyed(keys, min(T, t0 + k.rig.t % (1 / FPS))))
        k.step_frame(control)
    return k


def arm_ik(k, lay, seed, goal, down=True):
    """Joint angles (arm joints, within limits) that bring the tool point to `goal`, tool pointing down when the arm has the joints for it."""
    m = k.m; d = mujoco.MjData(m); d.qpos[:] = seed
    # a pick is a planar problem: the base turns to the spot, the rolls stay square, the pitch joints do the rest
    ids = [mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, j) for j in lay.arm_joints]
    for j in ids:
        if "roll" in m.joint(j).name: d.qpos[m.jnt_qposadr[j]] = 0.0
        if "yaw" in m.joint(j).name: d.qpos[m.jnt_qposadr[j]] = math.atan2(goal[1], goal[0])
    every = ids; ids = [j for j in ids if "pitch" in m.joint(j).name]; dofs = [int(m.jnt_dofadr[j]) for j in ids]
    b = tasks._body(m, lay.tcp_body); axis = np.zeros(3); big = int(np.argmax(np.abs(lay.tcp_local))); axis[big] = np.sign(lay.tcp_local[big])   # the tool's own axis
    adr = [int(m.jnt_qposadr[j]) for j in ids]; lo = [m.jnt_range[j][0] for j in ids]; hi = [m.jnt_range[j][1] for j in ids]
    bend = [float(np.sign(seed[a_])) if "elbow" in m.joint(j).name else 0.0 for j, a_ in zip(ids, adr)]
    def cost(q):
        if any(s_ * x < 0.2 for s_, x in zip(bend, q) if s_): return 1e9      # the elbow stays on the side it started on
        d.qpos[adr] = q; mujoco.mj_kinematics(m, d)
        e = np.linalg.norm(np.asarray(goal, float) - tasks._tcp_world(m, d, lay.tcp_body, lay.tcp_local))
        return e * e + (0.01 * (1 + float((d.xmat[b].reshape(3, 3) @ axis)[2])) if down else 0.0)
    grids = [np.linspace(l, h, 13) for l, h in zip(lo, hi)]; best = min(itertools.product(*grids), key=cost); best = np.array(best); step = (np.array(hi) - np.array(lo)) / 13
    c = cost(best)
    while step.max() > 2e-3:          # pattern search from the best grid point
        moved = False
        for i in range(len(best)):
            for sgn in (1, -1):
                t = best.copy(); t[i] = np.clip(t[i] + sgn * step[i], lo[i], hi[i]); ct = cost(t)
                if ct < c: best, c, moved = t, ct, True
        if not moved: step = step / 2
    d.qpos[adr] = best
    mujoco.mj_kinematics(m, d)
    miss = float(np.linalg.norm(goal - tasks._tcp_world(m, d, lay.tcp_body, lay.tcp_local)))
    return {m.joint(j).name: float(d.qpos[m.jnt_qposadr[j]]) for j in every}, d.qpos.copy(), miss


def pick_take(ex, reach, height, lift, yaw, grip, T=4.2, down=True):
    """Pick and place: over the first spot, down, close, up, across to the second spot, down, open, home. Joint targets from IK."""
    k = Take(ex, False); lay = tasks.Layout(k.m, k.spec, k.design); seed = k.d.qpos.copy()
    spot = lambda a, z: (reach * math.cos(a), reach * math.sin(a), z)
    misses = []
    def at(a, z):
        nonlocal seed
        q, seed, miss = arm_ik(k, lay, seed, spot(a, z), down); misses.append(miss); return q
    a0 = at(yaw, height + lift); a1 = at(yaw, height); a2 = at(yaw, height + lift); b0 = at(-yaw, height + lift); b1 = at(-yaw, height); b2 = at(-yaw, height + lift)
    g = lay.gripper_joints[0] if lay.gripper_joints else None; o, c = grip
    G = lambda v: {g: v} if g else {}
    k.notes.append(f"worst IK miss {max(misses) * 1000:.1f} mm")
    keys = [(0.55, {**a0, **G(o)}), (0.95, a1), (1.2, {**a1, **G(c)}), (1.55, a2), (2.25, b0), (2.6, b1), (2.85, {**b1, **G(o)}), (3.2, b2)]
    first = {j: float(k.d.qpos[k.rig.acts[k.index[j]]["qadr"]]) for _, p in keys for j in p}
    keys = [(0.0, first), *keys, (T, first)]
    k.set(keyed(keys, 0)); k.settle(1.0); now = [0.0]
    def control():
        k.set(keyed(keys, min(T, now[0]))); now[0] += k.m.opt.timestep
    for _ in range(int(T * FPS)): k.step_frame(control)
    return k


def wheel_take(ex, path, T, extra=None, mecanum=False, pose=None):
    """path: [(time, x, yaw)] in the start frame, a closed loop. extra: joint key poses run alongside."""
    k = Take(ex, True, pose=pose); W = tasks.Wheels(k.m)
    extra = extra or []
    first = {j: float(k.d.qpos[k.rig.acts[k.index[j]]["qadr"]]) for _, p in extra for j in p}
    keys = [(0.0, first), *extra, (T, first)] if first else []
    if keys: k.set(keyed(keys, 0))
    k.settle(1.0)
    p0, y0 = tasks._base_pose(k.m, k.d); c, s = math.cos(y0), math.sin(y0)
    ease = [{"x": x, "y": yaw} for _, x, yaw in path]
    def goal(t):
        v = keyed([(p[0], {"x": p[1], "w": p[2]}) for p in path], t); return v["x"], v["w"]
    now = [0.0]
    def control():
        t = now[0]; now[0] += k.m.opt.timestep; dt = 0.02
        (x1, w1), (x2, w2) = goal(t), goal(t + dt)
        p, y = tasks._base_pose(k.m, k.d)
        dp = p[:2] - p0[:2]; x = dp[0] * c + dp[1] * s; lat = -dp[0] * s + dp[1] * c
        e = math.atan2(math.sin(w1 + y0 - y), math.cos(w1 + y0 - y))
        vx = (x2 - x1) / dt + 3.0 * (x1 - x); wz = (w2 - w1) / dt + 5.0 * e
        for a, w in W.command(vx=vx, wz=wz, mecanum=mecanum).items(): k.ref[a] = w
        if keys: k.set(keyed(keys, min(t, T)))
    for _ in range(int(T * FPS)): k.step_frame(control)
    k.scene = {"follow": 0.6}
    return k


def leg_ik(m, leg, base_offset, seed):
    """Joint angles that put a foot at its seeded position plus base_offset (base frame). Position only: damped least squares."""
    d = mujoco.MjData(m); d.qpos[:] = seed; mujoco.mj_forward(m, d)
    fb = leg["foot"]; dofs = [int(m.jnt_dofadr[j]) for j in leg["joints"]]; Rb = d.xmat[1].reshape(3, 3)
    goal = d.xpos[fb] + d.xmat[fb].reshape(3, 3) @ leg["foot_local"] + Rb @ np.asarray(base_offset, float)
    for _ in range(80):
        mujoco.mj_forward(m, d)
        p = d.xpos[fb] + d.xmat[fb].reshape(3, 3) @ leg["foot_local"]; e = goal - p
        if np.linalg.norm(e) < 1e-5: break
        jp = np.zeros((3, m.nv)); mujoco.mj_jac(m, d, jp, None, p, fb); J = jp[:, dofs]
        dq = J.T @ np.linalg.solve(J @ J.T + 1e-5 * np.eye(3), e)
        for j, x in zip(leg["joints"], dq):
            a_ = int(m.jnt_qposadr[j]); d.qpos[a_] += x
            if m.jnt_limited[j]: d.qpos[a_] = np.clip(d.qpos[a_], *m.jnt_range[j])
    return {m.joint(j).name: float(d.qpos[m.jnt_qposadr[j]]) for j in leg["joints"]}, float(np.linalg.norm(goal - (d.xpos[fb] + d.xmat[fb].reshape(3, 3) @ leg["foot_local"])))


def walk_take(ex, crouch, stride, lift, period, groups, duty=0.55, cycles=3, turn=0.0):
    """Open-loop gait on the free-floating model: groups of legs (by joint-name prefix) swing in turn, each foot on an IK path."""
    k = Take(ex, True); L = tasks.Legs(k.m)
    pose = L.squat_pose(k.m, crouch) if crouch else {}
    for j, v in pose.items(): k.d.qpos[k.rig.acts[k.index[j]]["qadr"]] = v
    k.d.qpos[2] -= crouch; mujoco.mj_forward(k.m, k.d); k.set(pose); seed = k.d.qpos.copy()
    k.settle(1.5)
    phase_of = {}
    for gi, grp in enumerate(groups):
        for pre in grp:
            for leg in L.legs:
                if leg["names"][0].startswith(pre): phase_of[id(leg)] = gi / len(groups)
    N = 48; table = {}; worst = 0.0
    for leg in L.legs:
        for n in range(N):
            ph = (n / N + phase_of[id(leg)]) % 1.0
            if ph < duty: x, z = stride * (0.5 - ph / duty), 0.0
            else:
                u = (ph - duty) / (1 - duty); x, z = stride * (-0.5 + smooth(u)), lift * math.sin(math.pi * u)
            sol, err = leg_ik(k.m, leg, (x, 0, z), seed); worst = max(worst, err)
            table.setdefault(n, {}).update(sol)
    k.notes.append(f"gait IK worst foot error {worst * 1000:.1f} mm")
    now = [0.0]
    def control(gain=[1.0]):
        n = now[0] / period * N; a, b = int(n) % N, (int(n) + 1) % N; f = n - int(n)
        ramp = gain[0]
        k.set({j: pose.get(j, table[a][j]) * (1 - ramp) + ramp * (table[a][j] * (1 - f) + table[b][j] * f) for j in table[a]})
        now[0] += k.m.opt.timestep
    # a warm-up cycle brings the walk to its steady state; the film is the following whole cycles
    warm = 2
    for _ in range(int(warm * period * FPS)): k.step_frame(control, record=False)
    for _ in range(int(round(cycles * period * FPS))): k.step_frame(control)
    k.scene = {"follow": 1.0}
    return k


def legged_pose_take(ex, lower, T, arms, rail=False):
    """Squat and rise (hip, knee and ankle by `lower` radians, feet flat) with the arms and head on key poses alongside."""
    k = Take(ex, True, rail=rail); L = tasks.Legs(k.m)
    home = {j: float(k.d.qpos[k.rig.acts[k.index[j]]["qadr"]]) for leg in L.legs for j in (k.m.joint(x).name for x in leg["joints"])}
    # both knees bend forward: the seeded IK can settle a free knee either way, so the bend is set from the leg's own sign
    t = lower
    down = {f"{s}_{j}": g * c * t for s, g in (("l", -1), ("r", 1)) for j, c in (("hip_pitch", 1), ("knee", 2), ("ankle_pitch", 1))}
    first = {j: float(k.d.qpos[k.rig.acts[k.index[j]]["qadr"]]) for _, p in arms for j in p}
    keys = [(0.0, {**first, **home}), (T * 0.28, down), (T * 0.5, down), (T * 0.8, home), *arms, (T, {**first, **home})]
    keys.sort(key=lambda x: x[0])
    k.settle(1.0)
    now = [0.0]
    def control():
        k.set(keyed(keys, min(now[0], T))); now[0] += k.m.opt.timestep
    for _ in range(int(T * FPS)): k.step_frame(control)
    return k


DRIVE = lambda s, yaw=0.8: [(0, 0, 0), (1.1, s, 0), (2.2, 0, 0), (3.1, 0, yaw), (4.0, 0, 0)]
def hover_take(ex, height=0.45, T=4.0):
    """A multirotor lifts off, hovers and turns a little on the same thrust model and flight controller the task tests fly
    (tasks.Hover), its props spinning on their velocity servos. Stepped here directly: the thrusts are site forces, not joints."""
    k = Take(ex, True)
    m, pos, spin, thr, fmax = tasks._thrust_rig(k.xml, k.design)
    d = mujoco.MjData(m); mujoco.mj_forward(m, d)
    k.m, k.d = m, d; k.bodies = [(b, m.body(b).name) for b in range(1, m.nbody)]
    ctl = tasks.Hover(m, pos, spin, thr, fmax)
    names = {r["joint"]: r.get("spin", 1) for r in k.design.get("rotors", [])}
    rotors = [(a, names[m.joint(int(m.actuator_trnid[a, 0])).name]) for a in range(m.nu) if a not in thr and m.actuator_trntype[a] == mujoco.mjtTrn.mjTRN_JOINT and m.joint(int(m.actuator_trnid[a, 0])).name in names]
    sub = max(1, round(1 / FPS / m.opt.timestep))
    for _ in range(int(T * FPS)):
        for _ in range(sub):
            t = d.time
            z = height * smooth(t / 1.4) if t < T - 0.9 else height * (1 - smooth((t - (T - 0.9)) / 0.9))
            yaw = 0.5 * math.sin(2 * math.pi * min(1.0, max(0.0, (t - 1.4) / 2.0)))
            for a, sgn in rotors: d.ctrl[a] = sgn * 120.0 * min(1.0, t / 0.5)   # rad/s: a visible spin, not the real 2700
            ctl.apply(d, ctl.thrusts(d, z, yaw))
            mujoco.mj_step(m, d)
            if not np.all(np.isfinite(d.qpos)): raise RuntimeError("simulation diverged")
        k.frames.append({n: [round(float(x), 5) for x in (*d.xpos[b], *d.xquat[b])] for b, n in k.bodies})
    return k


def swim_take(ex, T=4.0):
    """The ROV in the task tests' water model (tasks.Water): it holds depth, drives ahead, turns and comes back level."""
    k = Take(ex, True)
    W = tasks.Water(k.xml, k.design); W.release(0.5)
    k.m, k.d = W.m, W.d; k.bodies = [(b, W.m.body(b).name) for b in range(1, W.m.nbody)]
    sub = max(1, round(1 / FPS / W.m.opt.timestep))
    for _ in range(int(1.5 / W.m.opt.timestep)): W.step(W.hold(0.5))   # settled at depth before the film starts
    t0 = W.d.time
    for _ in range(int(T * FPS)):
        for _ in range(sub):
            t = W.d.time - t0
            surge = 0.35 * smooth(t / 0.6) * (1 - smooth((t - 1.6) / 0.6)); yaw = 0.25 * smooth((t - 2.0) / 0.4) * (1 - smooth((t - 3.0) / 0.5))
            if not W.step(W.hold(0.5 + 0.08 * math.sin(2 * math.pi * t / T), surge=surge, yaw_rate=yaw)): raise RuntimeError("simulation diverged")
        k.frames.append({n: [round(float(x), 5) for x in (*W.d.xpos[b], *W.d.xquat[b])] for b, n in k.bodies})
    return k


PLANS = {
    "01_arm_2dof": lambda ex: arm_take(ex, [(0.8, {"shoulder_pitch": 1.2, "elbow_pitch": -0.9, "gripper": 0.46}), (1.3, {}), (1.6, {"gripper": 0.0}), (2.6, {"shoulder_pitch": 0.2, "elbow_pitch": -1.7}), (3.2, {}), (3.5, {"gripper": 0.46}), (3.7, {})], 4.2),
    "02_arm_6dof": lambda ex: pick_take(ex, 0.27, 0.07, 0.07, 0.7, (0.46, 0.05)),
    "03_arm_7dof": lambda ex: pick_take(ex, 0.3, 0.07, 0.07, 0.7, (0.46, 0.05)),
    "04_scara": lambda ex: arm_take(ex, [(0.8, {"j1": 0.9, "j2": -1.2, "wrist_roll": 1.0}), (1.3, {"z": 0.12}), (1.6, {"finger_a": 0.012}), (2.0, {"z": 0.02}), (2.9, {"j1": -0.9, "j2": 1.2, "wrist_roll": -1.0}), (3.3, {"z": 0.12}), (3.6, {"finger_a": 0.0})], 4.2),
    "05_diff_drive": lambda ex: wheel_take(ex, DRIVE(0.35), 4.0),
    "06_four_wheel": lambda ex: wheel_take(ex, DRIVE(0.35), 4.0),
    "07_mecanum": lambda ex: wheel_take(ex, DRIVE(0.35), 4.0, mecanum=True),
    "08_humanoid": lambda ex: legged_pose_take(ex, 0.5, 4.0, [(1.2, {"l_shoulder_pitch": -0.6, "r_shoulder_pitch": -0.6, "neck_pan": 0.4}), (2.2, {"l_elbow": -0.9, "r_elbow": 0.9, "neck_pan": -0.4}), (3.2, {"neck_pan": 0.0})]),
    "09_gripper": lambda ex: arm_take(ex, [(1.0, {"finger_a": 0.028}), (1.5, {}), (2.5, {"finger_a": 0.004}), (3.0, {})], 3.6),
    "10_quadruped": lambda ex: walk_take(ex, 0.02, 0.05, 0.02, 0.8, [["fl", "rr"], ["fr", "rl"]], duty=0.6, cycles=4),
    "11_spider_scout": lambda ex: walk_take(ex, 0.0, 0.05, 0.025, 1.0, [["lf", "lr", "rm"], ["rf", "rr", "lm"]], duty=0.6, cycles=3),
    "12_mars_rover": lambda ex: wheel_take(ex, DRIVE(0.45), 4.0, [(1.0, {"arm_base_yaw": 0.5}), (2.2, {"arm_base_yaw": -0.5, "arm_wrist_pitch": -1.3}), (3.2, {"arm_base_yaw": 0.0, "arm_wrist_pitch": -0.9})],
                                           pose={"arm_shoulder_pitch": 0.25, "arm_elbow_pitch": -1.5, "arm_wrist_pitch": -0.9}),
    "13_battle_mech": lambda ex: legged_pose_take(ex, 0.2, 4.0, [(1.2, {"l_shoulder_pitch": -0.7, "r_shoulder_pitch": -0.7, "neck_pan": 0.4}), (2.2, {"l_elbow": -1.0, "r_elbow": 1.0, "neck_pan": -0.4}), (3.2, {"neck_pan": 0.0})]),
    "14_iron_man_mark_43": lambda ex: arm_take(ex, [(0.9, {"faceplate": -0.95}), (2.3, {}), (3.2, {"faceplate": 0.0})], 3.8, pin=True),
    "15_wall_e": lambda ex: wheel_take(ex, DRIVE(0.22), 4.0, [(1.0, {"neck_pan": 0.5, "left_arm_lift": -0.5, "right_arm_lift": 0.5, "left_elbow": -0.7, "right_elbow": 0.7, "left_hand": 0.5, "right_hand": -0.5}), (2.2, {"neck_pan": -0.5, "neck_tilt": -0.25, "left_hand": 0.0, "right_hand": 0.0}), (3.2, {"neck_pan": 0.2, "left_arm_lift": 0.1, "right_arm_lift": -0.1, "left_elbow": -0.2, "right_elbow": 0.2})]),
    "16_eva": lambda ex: wheel_take(ex, DRIVE(0.3), 4.0, [(1.0, {"head_pan": 0.5, "left_arm_shoulder_pitch": 0.5, "right_arm_shoulder_pitch": 0.5}), (2.2, {"head_pan": -0.5}), (3.2, {"head_pan": 0.0, "left_arm_shoulder_pitch": 0.0, "right_arm_shoulder_pitch": 0.0})]),
    "17_baymax": lambda ex: wheel_take(ex, DRIVE(0.3), 4.0, [(1.0, {"head_pan": 0.35}), (2.2, {"head_pan": -0.35}), (3.2, {"head_pan": 0.0})]),
    "18_arduino_car": lambda ex: wheel_take(ex, DRIVE(0.3), 4.0),
    "20_quadcopter": lambda ex: hover_take(ex),
    "21_underwater_rov": lambda ex: swim_take(ex),
    "22_pen_plotter": lambda ex: arm_take(ex, [(0.6, {"z_axis": 0.012}), (1.2, {"x_axis": 0.12}), (1.9, {"y_axis": 0.12}), (2.6, {"x_axis": 0.03}), (3.3, {"y_axis": 0.03}), (3.7, {"z_axis": 0.0})], 4.2),
    "23_robot_hand": lambda ex: arm_take(ex, [(0.8, {"thumb_swing": 0.6}), (1.4, {"index_mcp": 1.1, "middle_mcp": 1.1, "ring_mcp": 1.1, "little_mcp": 1.1, "thumb_mcp": 0.5}), (2.3, {}), (2.9, {"index_mcp": 0.0, "middle_mcp": 1.1, "thumb_mcp": 0.0}), (3.5, {"middle_mcp": 0.0, "ring_mcp": 0.0, "little_mcp": 0.0, "thumb_swing": 0.0})], 4.2),
    "24_plant_waterer": lambda ex: wheel_take(ex, DRIVE(0.35), 4.0),
    "19_arduino_arm": lambda ex: arm_take(ex, [(0.8, {"yaw": 0.8, "shoulder": 0.9, "elbow": 0.9, "claw": 0.35}), (1.3, {}), (1.6, {"claw": -0.02}), (2.5, {"yaw": -0.8, "shoulder": 0.3, "elbow": 1.3}), (3.1, {"shoulder": 0.9, "elbow": 0.9}), (3.4, {"claw": 0.35}), (3.6, {})], 4.2),
}


# where each film is shot from (0 = dead ahead, robots face +x)
VIEW = {"22_pen_plotter": 300, "23_robot_hand": 300, "01_arm_2dof": 75, "02_arm_6dof": 115, "03_arm_7dof": 115, "04_scara": 300, "09_gripper": 320, "19_arduino_arm": 115, "08_humanoid": 25, "13_battle_mech": 25, "16_eva": 25, "17_baymax": 25, "14_iron_man_mark_43": 20}


FRAME = {"14_iron_man_mark_43": {"frame": r"(helmet|ear_pod|faceplate|eye_led|head$)", "el": 8}}


def home_poses(k):
    """Link poses relative to the root link with every joint at zero: the frame the harness routes are stored in."""
    d = mujoco.MjData(k.m); mujoco.mj_kinematics(k.m, d)
    q0, p0 = d.xquat[1].copy(), d.xpos[1].copy()
    inv = np.zeros(4); mujoco.mju_negQuat(inv, q0)
    out = {}
    for b, n in k.bodies:
        pos = np.zeros(3); mujoco.mju_rotVecQuat(pos, d.xpos[b] - p0, inv)
        q = np.zeros(4); mujoco.mju_mulQuat(q, inv, d.xquat[b])
        out[n] = [round(float(x), 6) for x in (*pos, *q)]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0]); ap.add_argument("example"); ap.add_argument("--out", type=Path, default=ROOT / "out/studio")
    a = ap.parse_args()
    k = PLANS[a.example](a.example)
    (a.out / a.example).mkdir(parents=True, exist_ok=True)
    k.scene = {**getattr(k, "scene", {}), **({"az": VIEW[a.example]} if a.example in VIEW else {}), **FRAME.get(a.example, {})}
    (a.out / a.example / "motion.json").write_text(json.dumps({"example": a.example, "fps": FPS, "frames": k.frames, "notes": k.notes, "scene": getattr(k, "scene", {}), "home": home_poses(k), "root": k.bodies[0][1], "start": k.home}))
    p = np.array([k.frames[i][k.bodies[0][1]][:3] for i in range(len(k.frames))])
    print(a.example, len(k.frames), "frames; base travel", np.round(p.max(0) - p.min(0), 3), "seam", np.round(p[-1] - p[0], 3), k.notes)


if __name__ == "__main__": main()
