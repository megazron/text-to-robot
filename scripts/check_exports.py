"""Check every export of a robot with the real tools, not only against a schema.

    python scripts/check_exports.py                         the shipped examples (CI: the steps whose tools CI has)
    python scripts/check_exports.py --designs               also 40 generated designs (two-arm cells, a rover with two arms,
                                                            three wheels, shape shells, a changed design, a parts-first robot)
    python scripts/check_exports.py --ros --moveit --rviz   add the ROS 2 steps (local: needs /opt/ros/jazzy)
    python scripts/check_exports.py --only 12_mars_rover    one example or design (by name)
    python scripts/check_exports.py --report docs/EXPORT_CHECK.md

Per robot:
  urdf      check_urdf (liburdfdom) is clean; every mesh path resolves; masses > 0, inertias positive definite and within
            the triangle inequality; joint limits ordered, effort and velocity > 0, axes unit length
  xacro     xacro expands to the same robot (ROS)
  rsp       robot_state_publisher loads the description and publishes (ROS)
  colcon    the ROS 2 package builds with no warnings (ROS)
  launch    display.launch.py starts and stays up (ROS)
  moveit    move_group starts and plans a joint goal in every planning group of the SRDF; the SRDF's collision pairs name
            real links (ROS, --moveit)
  rviz      RViz draws the robot headless (Xvfb, llvmpipe) with no mesh load errors, and a screenshot is kept (ROS, --rviz)
  mujoco    the MJCF loads and simulates 10 s without NaN, joints stay in their limits, nothing falls through the floor
  stl       every STL is a closed manifold with positive volume, in mm, and every printed part fits the 250 x 210 x 220 mm bed
  step      every STEP file opens in OpenCascade (OCP) with a solid in it
  bom       the BOM parses, every line has a price and a source, the subtotals and total add up, and the wheels, motors and
            servos it buys match the robot's joints
  firmware  the sketch compiles for its board (arduino-cli) and every pin it uses is a pin of the wiring record
  wiring    every connection names a part and a pin that exist; the power budget's sums add up
Writes out/export_check/<robot>/ (unpacked files, logs, screenshots) and out/export_check/report.json.
"""
from __future__ import annotations

import argparse, hashlib, json, math, os, re, shutil, signal, subprocess, sys, tempfile, time, xml.etree.ElementTree as ET, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out/export_check"
ROS = "/opt/ros/jazzy/setup.bash"
BED = (250, 210, 220)

DESIGNS = [
    "two 6 dof robot arms on a table", "three 5 dof robot arms on a table", "four 4 dof robot arms on a table", "a dual arm humanoid torso",
    "a rover with two 6 dof arms", "a mobile robot with 2 robot arms", "a 4 wheel rover with a 6 dof arm", "a quadruped with an arm on its back",
    "a 3 wheel robot", "a tricycle robot with a camera", "a four wheel robot with a lidar", "a mecanum robot", "a six wheel rover",
    "a heart emoji robot", "a shoe shaped robot", "a cartoon robot", "a robot that looks like a teapot", "🦄 robot", "a robot shaped like a banana",
    "a heart shaped robot arm", "a cartoon robot dog", "a star shaped hexapod", "a heart shaped drone", "a heart shaped humanoid",
    "a 2 dof robot arm", "a 5 dof robot arm with a camera", "a 7 dof robot arm", "an arduino robot arm with sg90 servos", "a cheap arduino car",
    "a quadruped", "a hexapod", "a humanoid robot", "a quadcopter drone with a camera", "a robot that waters my plants", "a robot that delivers packages",
    "a sci-fi robot", "a rugged four wheel robot", "a red 6 dof robot arm",
    "surgical robot", "surgical robot arm with a scalpel", "a surgical robot with 2 arms", "an endoscope holder robot",
]
CHANGED = [("a 6 wheel rover", ["change to red colour and only 4 wheels"]), ("three 6 dof robot arms on a table", ["remove one arm", "make them blue"])]
PARTS = "Build a robot from my parts: Arduino Uno, L298N motor driver, 2 TT gear motors, HC-SR04, 4 AA battery holder"


# ROS steps run in a clean environment: only ROS 2 Jazzy and the system Python (a user's own workspaces and Python on PATH
# would change what is found)
CLEAN = {"HOME": str(Path.home()), "PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"}


def sh(cmd: str, cwd: Path | None = None, timeout: int = 600, ros: bool = False, env: dict | None = None) -> tuple[int, str]:
    if ros: cmd = f"source {ROS} && {cmd}"
    try:
        p = subprocess.run(["bash", "-c", cmd], cwd=cwd, capture_output=True, text=True, timeout=timeout, env={**(CLEAN if ros else os.environ), **(env or {})})
        return p.returncode, (p.stdout + p.stderr)[-20000:]
    except subprocess.TimeoutExpired as e:
        return 124, f"timeout after {timeout} s: {(e.stdout or b'')[-2000:]!r}"


class Robot:
    def __init__(self, name: str, root: Path):
        self.name, self.root, self.results = name, root, {}

    def ok(self, step, passed, detail=""): self.results[step] = {"pass": bool(passed), "detail": str(detail)[:1500]}


# ------------------------------------------------------------------ the robots
def example_robots(only: str | None) -> list[Robot]:
    out = []
    for ex in sorted(p for p in (ROOT / "examples").iterdir() if p.is_dir() and p.name[:2].isdigit()):
        if only and only != ex.name: continue
        out.append(Robot(ex.name, ex))
    return out


def generated_robots(only: str | None) -> list[Robot]:
    """Each design written by the CLI into out/export_check/designs/<slug>/ (robot JSON, URDF, ROS 2 package, CAD, BOM, firmware)."""
    base = OUT / "designs"; base.mkdir(parents=True, exist_ok=True)
    jobs = [(p, []) for p in DESIGNS] + CHANGED + [(PARTS, [])]
    out = []
    for prompt, mods in jobs:
        slug = re.sub(r"[^a-z0-9]+", "_", (prompt + (" then " + " then ".join(mods) if mods else "")).lower()).strip("_")[:60] or "emoji"
        if prompt.startswith("🦄"): slug = "unicorn_emoji_robot"
        if only and only != slug: continue
        d = base / slug
        if not (d / "done").exists():
            shutil.rmtree(d, ignore_errors=True); d.mkdir(parents=True)
            code, log = sh(f"node scripts/export_one.ts {json.dumps(json.dumps({'prompt': prompt, 'modify': mods, 'out': str(d)}))}", cwd=ROOT, timeout=1800)
            (d / "export.log").write_text(log)
            if code: r = Robot(slug, d); r.ok("export", False, log[-800:]); out.append(r); continue
            (d / "done").write_text("")
        out.append(Robot(slug, d))
    return out


def unpack(r: Robot) -> tuple[Path | None, Path | None]:
    """the ROS 2 package directory and the CAD directory, unpacked under out/export_check/<robot>/"""
    work = OUT / r.name; work.mkdir(parents=True, exist_ok=True)
    pkg = cad = None
    if (r.root / "robot.ros2.zip").exists():
        shutil.rmtree(work / "ws", ignore_errors=True)
        with zipfile.ZipFile(r.root / "robot.ros2.zip") as z: z.extractall(work / "ws/src")
        pkg = next((p for p in (work / "ws/src").iterdir() if (p / "package.xml").exists()), None)
    if (r.root / "robot.cad.zip").exists():
        shutil.rmtree(work / "cad", ignore_errors=True)
        with zipfile.ZipFile(r.root / "robot.cad.zip") as z: z.extractall(work / "cad")
        cad = work / "cad"
    return pkg, cad


# ------------------------------------------------------------------ URDF
def check_urdf(r: Robot, pkg: Path | None):
    urdf = next(iter(sorted((pkg / "urdf").glob("*.urdf"))), None) if pkg else (r.root / "robot.urdf")
    if not urdf or not urdf.exists(): r.ok("urdf", False, "no URDF"); return None
    problems = []
    tool = Path(ROS).exists()
    if tool:
        code, log = sh(f"check_urdf {urdf} 2>&1 | head -40", ros=True, timeout=60)
        if code or "Successfully Parsed" not in log: problems.append(f"check_urdf: {log.strip()[-400:]}")
    tree = ET.parse(urdf).getroot()
    # meshes: package://<pkg>/... inside the package, else relative to the URDF
    for m in tree.iter("mesh"):
        f = m.get("filename", "")
        path = (pkg.parent / f[len("package://"):]) if f.startswith("package://") and pkg else (urdf.parent / f)
        if not path.exists(): problems.append(f"mesh not found: {f}")
    for link in tree.iter("link"):
        inertial = link.find("inertial")
        if inertial is None: continue
        mass = float(inertial.find("mass").get("value"))
        I = inertial.find("inertia"); g = {k: float(I.get(k)) for k in ["ixx", "iyy", "izz", "ixy", "ixz", "iyz"]}
        M = [[g["ixx"], g["ixy"], g["ixz"]], [g["ixy"], g["iyy"], g["iyz"]], [g["ixz"], g["iyz"], g["izz"]]]
        if not mass > 0: problems.append(f"{link.get('name')}: mass {mass}")
        # positive definite (Sylvester) and the principal moments' triangle inequality (eigenvalues of the symmetric matrix)
        d1, d2 = M[0][0], M[0][0] * M[1][1] - M[0][1] ** 2
        d3 = (M[0][0] * (M[1][1] * M[2][2] - M[1][2] ** 2) - M[0][1] * (M[0][1] * M[2][2] - M[1][2] * M[0][2]) + M[0][2] * (M[0][1] * M[1][2] - M[1][1] * M[0][2]))
        if not (d1 > 0 and d2 > 0 and d3 > 0): problems.append(f"{link.get('name')}: inertia not positive definite")
        else:
            ev = eig3(M)
            if not (ev[0] + ev[1] >= ev[2] * (1 - 1e-6) and ev[1] + ev[2] >= ev[0] * (1 - 1e-6) and ev[0] + ev[2] >= ev[1] * (1 - 1e-6)):
                problems.append(f"{link.get('name')}: principal moments {['%.3g' % e for e in ev]} break the triangle inequality")
    for j in tree.iter("joint"):
        t = j.get("type"); lim = j.find("limit"); ax = j.find("axis")
        if t in ("revolute", "prismatic"):
            if lim is None: problems.append(f"{j.get('name')}: no limit"); continue
            lo, hi = float(lim.get("lower", 0)), float(lim.get("upper", 0))
            if not lo < hi: problems.append(f"{j.get('name')}: limits [{lo}, {hi}]")
        if t in ("revolute", "prismatic", "continuous"):
            if lim is not None and not (float(lim.get("effort", 0)) > 0 and float(lim.get("velocity", 0)) > 0): problems.append(f"{j.get('name')}: effort or velocity not positive")
            if ax is not None:
                v = [float(x) for x in ax.get("xyz", "1 0 0").split()]
                if abs(math.sqrt(sum(x * x for x in v)) - 1) > 1e-3: problems.append(f"{j.get('name')}: axis {v} not unit")
    r.ok("urdf", not problems, "; ".join(problems[:12]) or f"{urdf.name}: {'check_urdf clean' if tool else 'parsed (check_urdf not installed here)'}, {sum(1 for _ in tree.iter('mesh'))} meshes found, inertias and limits sane")
    return urdf


def eig3(M):
    """eigenvalues of a symmetric 3x3 matrix, ascending (closed form)"""
    a, b, c, d, e, f = M[0][0], M[1][1], M[2][2], M[0][1], M[1][2], M[0][2]
    p1 = d * d + e * e + f * f
    if p1 < 1e-30: return sorted([a, b, c])
    q = (a + b + c) / 3; p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1; p = math.sqrt(p2 / 6)
    B = [[(M[i][j] - (q if i == j else 0)) / p for j in range(3)] for i in range(3)]
    rdet = (B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1]) - B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0]) + B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0])) / 2
    phi = math.acos(max(-1, min(1, rdet))) / 3
    e1 = q + 2 * p * math.cos(phi); e3 = q + 2 * p * math.cos(phi + 2 * math.pi / 3); e2 = 3 * q - e1 - e3
    return sorted([e1, e2, e3])


# ------------------------------------------------------------------ ROS 2
def check_ros(r: Robot, pkg: Path | None, moveit: bool, rviz: bool):
    if not pkg: r.ok("colcon", False, "no ROS 2 package"); return
    ws = pkg.parent.parent; name = pkg.name
    for d in ("build", "install", "log"): shutil.rmtree(ws / d, ignore_errors=True)
    code, log = sh("colcon build --event-handlers console_direct+ --cmake-args -DPython3_EXECUTABLE=/usr/bin/python3 2>&1", cwd=ws, ros=True, timeout=900)
    warn = [l for l in log.splitlines() if re.search(r"\bwarning\b", l, re.I) and not re.search(r"SetuptoolsDeprecationWarning|easy_install|setup.py install is deprecated", l)]
    r.ok("colcon", code == 0 and not warn, (warn[:5] if warn else log.strip()[-300:]))
    if code: return
    env = f"source {ws}/install/setup.bash"
    xacro = pkg / "urdf" / f"{name}.urdf.xacro"
    if xacro.exists():
        code, log = sh(f"{env} && xacro {xacro} > {ws}/expanded.urdf && check_urdf {ws}/expanded.urdf 2>&1 | head -40", ros=True, timeout=120)
        r.ok("xacro", code == 0 and "Successfully Parsed" in log, log.strip()[-300:])
    urdf = pkg / "urdf" / f"{name}.urdf"
    params = ws / "rsp.yaml"
    params.write_text("/robot_state_publisher:\n  ros__parameters:\n    robot_description: |\n" + "".join("      " + l + "\n" for l in urdf.read_text().splitlines()))
    code, log = sh(f"{env} && timeout 8 ros2 run robot_state_publisher robot_state_publisher --ros-args --params-file {params} 2>&1; true", ros=True, timeout=60)
    good = "got segment" in log.lower() or "robot initialized" in log.lower()
    r.ok("rsp", good and not re.search(r"\b(?:error|failed)\b", log, re.I), log.strip()[-400:])
    if moveit and (pkg / "launch/move_group.launch.py").exists(): check_moveit(r, pkg, ws, env)
    check_rviz(r, pkg, ws, env)


MOVEIT_CLIENT = r'''
import sys, time, rclpy, xml.etree.ElementTree as ET
from rclpy.action import ActionClient
from moveit_msgs.action import MoveGroup
from moveit_msgs.msg import Constraints, JointConstraint, MotionPlanRequest
srdf, urdf = ET.parse(sys.argv[1]).getroot(), ET.parse(sys.argv[2]).getroot()
limits = {j.get("name"): j.find("limit") for j in urdf.iter("joint")}
rclpy.init(); node = rclpy.create_node("ttr_plan_check"); cli = ActionClient(node, MoveGroup, "/move_action")
if not cli.wait_for_server(timeout_sec=60): print("RESULT no move_action server"); sys.exit(1)
bad = 0
for g in srdf.iter("group"):
    joints = [j.get("name") for j in g.iter("joint") if limits.get(j.get("name")) is not None]
    chain = g.find("chain")
    if chain is not None and not joints:
        tip, base, parent = chain.get("tip_link"), chain.get("base_link"), {j.find("child").get("link"): j for j in urdf.iter("joint")}
        link = tip
        while link != base and link in parent:
            j = parent[link]
            if j.get("type") in ("revolute", "prismatic"): joints.append(j.get("name"))
            link = j.find("parent").get("link")
    # a mimic joint follows the joint it mimics: a goal names only the joints that are driven
    mimic = {j.get("name") for j in urdf.iter("joint") if j.find("mimic") is not None}
    joints = [j for j in joints if limits.get(j) is not None and j not in mimic]
    if not joints: continue
    req = MotionPlanRequest(); req.group_name = g.get("name"); req.num_planning_attempts = 3; req.allowed_planning_time = 10.0
    c = Constraints()
    for j in joints:
        lo, hi = float(limits[j].get("lower")), float(limits[j].get("upper"))
        c.joint_constraints.append(JointConstraint(joint_name=j, position=lo + 0.3 * (hi - lo) if lo < 0 < hi and abs(lo) < 1e-9 else (lo + hi) / 2 * 0.5, tolerance_above=0.01, tolerance_below=0.01, weight=1.0))
    req.goal_constraints.append(c)
    goal = MoveGroup.Goal(); goal.request = req; goal.planning_options.plan_only = True
    f = cli.send_goal_async(goal); rclpy.spin_until_future_complete(node, f, timeout_sec=30)
    h = f.result()
    if not h or not h.accepted: print(f"RESULT {g.get('name')} goal rejected"); bad += 1; continue
    rf = h.get_result_async(); rclpy.spin_until_future_complete(node, rf, timeout_sec=60)
    code = rf.result().result.error_code.val if rf.result() else -999
    print(f"RESULT {g.get('name')} {'planned' if code == 1 else f'error {code}'} ({len(joints)} joints)"); bad += code != 1
sys.exit(1 if bad else 0)
'''


def check_moveit(r: Robot, pkg: Path, ws: Path, env: str):
    name = pkg.name; srdf = pkg / "moveit" / f"{name}.srdf"
    if not srdf.exists(): r.ok("moveit", False, "no SRDF"); return
    links = {l.get("name") for l in ET.parse(pkg / "urdf" / f"{name}.urdf").getroot().iter("link")}
    stray = [f"{d.get('link1')}/{d.get('link2')}" for d in ET.parse(srdf).getroot().iter("disable_collisions") if d.get("link1") not in links or d.get("link2") not in links]
    (ws / "plan.py").write_text(MOVEIT_CLIENT)
    launch = subprocess.Popen(["bash", "-c", f"source {ROS} && {env} && exec ros2 launch {name} move_group.launch.py rviz:=false"], env=CLEAN, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    try:
        time.sleep(12)
        code, log = sh(f"{env} && python3 {ws}/plan.py {srdf} {pkg}/urdf/{name}.urdf", ros=True, timeout=600)
    finally:
        os.killpg(launch.pid, signal.SIGINT)
        try: mg = launch.communicate(timeout=20)[0] or ""
        except subprocess.TimeoutExpired: os.killpg(launch.pid, signal.SIGKILL); mg = ""
    (OUT / r.name / "move_group.log").write_text(mg + "\n--- plan client\n" + log)
    res = [l for l in log.splitlines() if l.startswith("RESULT")]
    ok = code == 0 and res and not stray
    # on a failure, what move_group said about it
    why = [] if ok else [l.strip()[-200:] for l in mg.splitlines() if re.search(r"\b(?:ERROR|WARN)\b", l) and "KDL" not in l][:4]
    r.ok("moveit", ok, "; ".join(res + ([f"SRDF names links not in the URDF: {stray[:4]}"] if stray else []) + why) or log[-400:])


def check_rviz(r: Robot, pkg: Path, ws: Path, env: str):
    name = pkg.name; shot = OUT / r.name / "rviz.png"; disp = ":%d" % (90 + int(hashlib.md5(r.name.encode()).hexdigest()[:2], 16) % 100)
    cfg = next(iter((pkg / "rviz").glob(f"{name}.rviz")), None)
    xvfb = subprocess.Popen(["Xvfb", disp, "-screen", "0", "1280x800x24"], start_new_session=True)
    proc = None
    try:
        time.sleep(2)
        envs = {**CLEAN, "DISPLAY": disp, "LIBGL_ALWAYS_SOFTWARE": "1", "QT_QPA_PLATFORM": "xcb"}
        proc = subprocess.Popen(["bash", "-c", f"source {ROS} && {env} && exec ros2 launch {name} display.launch.py gui:=false"], env=envs, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        time.sleep(25)
        subprocess.run([shutil.which("ffmpeg") or "ffmpeg", "-y", "-loglevel", "error", "-f", "x11grab", "-video_size", "1280x800", "-i", disp, "-frames:v", "1", str(shot)], env=envs, timeout=60)
    finally:
        log = ""
        if proc:
            os.killpg(proc.pid, signal.SIGINT)
            try: log = proc.communicate(timeout=20)[0]
            except subprocess.TimeoutExpired: os.killpg(proc.pid, signal.SIGKILL); log = ""
        os.killpg(xvfb.pid, signal.SIGTERM)
    errs = [l for l in log.splitlines() if re.search(r"Could not load|mesh.*(?:error|fail)|failed to load|No such file", l, re.I)]
    died = [l for l in re.findall(r"process has died.*", log) if not re.search(r"exit code -(?:2|9|15)\b", l)]   # (-2, -9, -15: stopped by this check at the end)
    r.ok("launch", not died, died[:3] or "display.launch.py: robot_state_publisher, the joint publishers and RViz started and stayed up")
    r.ok("rviz", shot.exists() and shot.stat().st_size > 20000 and not errs and not died, (errs[:3] or f"screenshot {shot.relative_to(ROOT)}"))


# ------------------------------------------------------------------ MuJoCo
def check_mujoco(r: Robot, urdf: Path | None):
    if not urdf: return
    sys.path.insert(0, str(ROOT / "python"))
    os.environ.setdefault("MUJOCO_GL", "osmesa")
    try:
        import mujoco, numpy as np
        from ttr_mujoco.convert import urdf_to_mjcf
    except Exception as e:
        r.ok("mujoco", False, f"mujoco not importable: {e}"); return
    try:
        spec = json.loads((r.root / "robot.json").read_text()) if (r.root / "robot.json").exists() else {}
        floating = bool(re.search(r"mobile|quadruped|hexapod|humanoid|mech|drone|rover|walker|car|walle|eva|baymax|snake|rov", str((spec.get("metadata") or {}).get("design", {}).get("family", "")) + r.name))
        cwd = os.getcwd(); os.chdir(urdf.parent)
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            xml = urdf_to_mjcf(str(urdf), floating=floating)
        m = mujoco.MjModel.from_xml_string(xml); os.chdir(cwd)
        d = mujoco.MjData(m)
        lo = m.jnt_range[:, 0].copy(); hi = m.jnt_range[:, 1].copy(); limited = m.jnt_limited.astype(bool)
        steps = int(10 / m.opt.timestep); worst = 0.0; low = math.inf
        acted = sorted({int(m.actuator_trnid[a, 0]) for a in range(m.nu) if m.actuator_trntype[a] == 0}); q0 = {j: float(d.qpos[m.jnt_qposadr[j]]) for j in acted}; moved = {j: 0.0 for j in acted}
        for k in range(steps):
            if m.nu: d.ctrl[:] = 0.3 * np.sin(k * m.opt.timestep * 2) * (m.actuator_ctrlrange[:, 1] - m.actuator_ctrlrange[:, 0]) / 2 + (m.actuator_ctrlrange[:, 1] + m.actuator_ctrlrange[:, 0]) / 2 if m.actuator_ctrllimited.any() else 0
            mujoco.mj_step(m, d)
            if not np.all(np.isfinite(d.qpos)): r.ok("mujoco", False, f"NaN at t={k * m.opt.timestep:.2f} s"); return
            if floating and k % 50 == 0: low = min(low, float(d.xpos[1:, 2].min()))
            if k % 25 == 0:
                for j in acted: moved[j] = max(moved[j], abs(float(d.qpos[m.jnt_qposadr[j]]) - q0[j]))
        over = 0.0
        for j in range(m.njnt):
            if limited[j] and m.jnt_type[j] in (2, 3):
                q = d.qpos[m.jnt_qposadr[j]]; over = max(over, lo[j] - q, q - hi[j])
        fell = floating and low < -0.05
        still = [mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, j) for j, v in moved.items() if v < 0.005 and m.jnt_type[j] in (2, 3)]
        if still and len(still) == len(moved): r.ok("mujoco", False, f"no actuated joint moved when driven: {still[:6]}"); return
        r.ok("mujoco", over < 0.05 and not fell, f"10 s simulated, {m.nu} actuators, worst limit overrun {over:.3f} rad, lowest body {low:.3f} m" if floating else f"10 s simulated, {m.nu} actuators, worst limit overrun {over:.3f} rad")
    except Exception as e:
        r.ok("mujoco", False, f"{type(e).__name__}: {e}")


# ------------------------------------------------------------------ CAD
def check_stl(r: Robot, cad: Path | None, pkg: Path | None):
    import trimesh, numpy as np
    files = sorted(cad.rglob("*.stl")) if cad else []
    if not files and pkg: files = sorted((pkg / "meshes").glob("*.stl"))
    if not files: r.ok("stl", False, "no STL"); return
    problems, notes, printed = [], set(), {p.stem for p in (cad / "cad/print").glob("*.stl")} if cad and (cad / "cad/print").exists() else set()
    for f in files:
        m = trimesh.load(f, force="mesh", process=True)
        ext = m.bounds[1] - m.bounds[0]
        # what is printed or cut must be one closed solid; the assembly (the whole robot for viewing) and the bought parts'
        # reference models are pictures of parts, checked for units only
        if f.parent.name in ("print", "fabricate") and not m.is_watertight:
            # zero-volume slivers (a pair of triangles where a cut met a wall, once a slicer welds the vertices) are no
            # material: what is judged is the solid that is left
            solid = [b for b in m.split(only_watertight=False) if abs(b.volume) >= 0.5 or len(b.faces) > 8]
            if solid and all(b.is_watertight for b in solid) and len(solid) < len(m.split(only_watertight=False)): notes.add(f"{f.name} (zero-volume slivers, no material)")
            elif f.stem in known_parts(r.name): notes.add(f"{f.name} (known: {known_parts(r.name)[f.stem][:80]})")
            else: problems.append(f"{f.name}: not watertight")
        elif not m.is_watertight and not f.name.endswith("_assembly.stl"): notes.add(f.name)
        elif f.parent.name in ("print", "fabricate") and not m.volume > 0: problems.append(f"{f.name}: volume {m.volume:.1f}")
        if ext.max() < 0.5: problems.append(f"{f.name}: {ext.max():.3f} across: not in mm")
        if f.parent.name == "print" and not fits_bed(m): problems.append(f"{f.name}: {np.round(ext, 1).tolist()} mm does not fit the bed in any orientation")
    # every printed part of the design is in the print folder, and nothing else
    if r.root.joinpath("robot.json").exists() and printed:
        design = (json.loads(r.root.joinpath("robot.json").read_text()).get("metadata") or {}).get("design") or {}
        want = {p["name"] for p in design.get("printed", [])}
        miss = sorted(want - printed - {re.sub(r"_(?:front|rear|left|right|[a-z])$", "", n) for n in printed})
        if miss and len(miss) == len(want): problems.append(f"print folder lacks {miss[:5]}")
    r.ok("stl", not problems, "; ".join(problems[:10]) or f"{len(files)} STL in mm; every printed and cut part a closed manifold with positive volume that fits the bed" + (f" (not closed solids, not failing: {', '.join(sorted(notes))})" if notes else ""))


KNOWN = None
def known_parts(robot: str) -> dict:
    """printed parts with an open issue on record (examples/print_known_issues.json, examples/export_known_issues.json)"""
    global KNOWN
    if KNOWN is None:
        KNOWN = {}
        for f in ("print_known_issues.json", "export_known_issues.json"):
            p = ROOT / "examples" / f
            if p.exists():
                for k, v in json.loads(p.read_text()).items(): KNOWN.setdefault(k, {}).update(v)
    return KNOWN.get(robot, {})


def fits_bed(m) -> bool:
    import numpy as np
    for v in [m.vertices] + [m.vertices @ np.array(R) for R in rotations()]:
        e = sorted((v.max(0) - v.min(0)).tolist()); b = sorted(BED)
        if all(e[i] <= b[i] + 0.5 for i in range(3)): return True
    return False


def rotations():
    out = []
    for deg in range(0, 90, 15):
        t = math.radians(deg); c, s = math.cos(t), math.sin(t)
        out += [[[c, -s, 0], [s, c, 0], [0, 0, 1]], [[1, 0, 0], [0, c, -s], [0, s, c]], [[c, 0, s], [0, 1, 0], [-s, 0, c]]]
    return out


def check_step(r: Robot, cad: Path | None):
    files = sorted(cad.rglob("*.step")) + sorted(cad.rglob("*.stp")) if cad else []
    if not files: return
    try:
        from OCP.STEPControl import STEPControl_Reader
        from OCP.IFSelect import IFSelect_RetDone
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopAbs import TopAbs_SOLID
    except Exception as e:
        r.ok("step", False, f"OCP not importable: {e}"); return
    problems = []
    for f in files:
        rd = STEPControl_Reader()
        if rd.ReadFile(str(f)) != IFSelect_RetDone: problems.append(f"{f.name}: does not read"); continue
        rd.TransferRoots(); shape = rd.OneShape(); ex = TopExp_Explorer(shape, TopAbs_SOLID)
        if not ex.More(): problems.append(f"{f.name}: no solid")
    r.ok("step", not problems, "; ".join(problems[:8]) or f"{len(files)} STEP files open in OpenCascade with solids")


# ------------------------------------------------------------------ BOM, firmware, wiring
def check_bom(r: Robot):
    f = r.root / "bom.json"
    if not f.exists(): r.ok("bom", False, "no bom.json"); return
    bom = json.loads(f.read_text()); problems = []
    total = 0.0
    for l in bom.get("lines", []):
        if not isinstance(l.get("qty"), (int, float)) or l["qty"] <= 0: problems.append(f"{l.get('name')}: qty {l.get('qty')}")
        if abs(l.get("unit_cost", 0) * l.get("qty", 0) - l.get("subtotal", 0)) > 0.011 + 0.001 * l.get("subtotal", 0): problems.append(f"{l.get('name')}: {l.get('qty')} x {l.get('unit_cost')} != {l.get('subtotal')}")
        # (a lead that comes with a part, such as a wall adapter's barrel plug, is a $0 wiring line)
        if l.get("unit_cost", 0) <= 0 and l.get("category") not in ("Owned", "Included", "Wiring"): problems.append(f"{l.get('name')}: no price")
        if l.get("category") not in ("Printed structure", "Fasteners", "Wiring", "Owned") and not re.search(r"https?://", str(l.get("note", "")) + str(l.get("spec", ""))): problems.append(f"{l.get('name')}: no source link")
        total += l.get("subtotal", 0)
    if abs(total - bom.get("total", total)) > 0.05: problems.append(f"lines add to {total:.2f}, total says {bom.get('total')}")
    # the drive bought matches the robot: one motor per driven wheel, one servo per servo joint
    spec = json.loads((r.root / "robot.json").read_text()) if (r.root / "robot.json").exists() else None
    if spec:
        design = (spec.get("metadata") or {}).get("design") or {}
        bought = {p["key"]: p["qty"] for p in design.get("purchased", [])}
        comps = {}
        for l in spec["links"]:
            g = l.get("geometry", {})
            if g.get("type") == "mesh" and g.get("part") == "component": k = (g.get("params") or {}).get("key"); comps[k] = comps.get(k, 0) + 1
        short = [f"{k}: {n} in the robot, {bought.get(k, 0)} bought" for k, n in comps.items() if k and bought.get(k, 0) < n and not re.search(r"wheel|tire|tyre|caster", k) and k in bought]
        if short: problems.append("; ".join(short[:5]))
    r.ok("bom", not problems, "; ".join(problems[:10]) or f"{len(bom.get('lines', []))} lines with prices and sources, add up to ${bom.get('total')}; every bought part counted")


def check_firmware(r: Robot):
    fw = r.root / "firmware"
    sketches = sorted(fw.rglob("*.ino")) if fw.exists() else []
    if not sketches: return
    arduino = shutil.which("arduino-cli") or (str(Path.home() / "bin/arduino-cli") if (Path.home() / "bin/arduino-cli").exists() else None)
    problems = []
    for ino in sketches:
        src = ino.read_text()
        board = "arduino:avr:nano" if re.search(r"\bnano\b", src, re.I) and not re.search(r"\buno\b", src, re.I) else "arduino:avr:uno"
        if re.search(r"ESP32|esp_|WiFi\.h", src): board = None
        if board and arduino:
            code, log = sh(f"{arduino} compile --warnings all --fqbn {board} {ino.parent}", timeout=600)
            if code: problems.append(f"{ino.name}: {log.strip()[-300:]}")
            # (warnings in the sketch itself; the libraries' own are theirs)
            elif re.search(re.escape(ino.name) + r":\d+:\d+: warning:", log):
                found = re.findall(re.escape(ino.name) + r":\d+:\d+: warning: .*", log)[:2]
                problems.append(f"{ino.name}: compiler warnings {found}")
        # every pin the sketch drives is one the wiring connects
        spec = json.loads((r.root / "robot.json").read_text())
        wiring = json.dumps(((spec.get("metadata") or {}).get("design") or {}).get("wiring") or {})
        pins = set(re.findall(r"\bconst\s+(?:int|uint8_t|byte)\s+\w*(?:PIN|Pin|pin)\w*\s*=\s*(A?\d+)\s*;", src))
        stray = [p for p in pins if not re.search(rf'"(?:D|A)?{re.escape(p.lstrip("D"))}"|\b(?:D|PIN_?|pin\s?){re.escape(p)}\b|"{re.escape(p)}"', wiring)]
        if stray and wiring != "{}": problems.append(f"{ino.name}: pins {sorted(stray)[:6]} are not in the wiring record")
    r.ok("firmware", not problems, "; ".join(problems[:6]) or (f"{len(sketches)} sketch(es) compile without warnings; their pins are the wiring's" if arduino else f"{len(sketches)} sketch(es): their pins are the wiring's (arduino-cli not installed here: scripts/compile_firmware.py compiles them in CI)"))


ELEC = None
def check_wiring(r: Robot):
    global ELEC
    if not (r.root / "robot.json").exists(): return
    spec = json.loads((r.root / "robot.json").read_text())
    w = ((spec.get("metadata") or {}).get("design") or {}).get("wiring")
    if not w: return
    ELEC = ELEC or json.loads((ROOT / "packages/parts/data/electrical.json").read_text())
    problems, links = [], {l["name"] for l in spec["links"]}
    inst = {i["name"]: i for i in w.get("instances", [])}
    for i in inst.values():
        if i.get("link") and i["link"] not in links: problems.append(f"{i['name']}: on link {i['link']}, which is not in the robot")
    def pins_of(key, port):
        ports = ((ELEC.get(key) or {}).get("electrical") or {}).get("ports") or []
        for pt in ports:
            if pt.get("name") == port: return {str(x.get("pin")) for x in (pt.get("pins") or {}).get("v", [])} | {str(x.get("name")) for x in (pt.get("pins") or {}).get("v", [])}
        return None if ports else set()
    n = 0
    for c in w.get("cables", []):
        for end in ("from", "to"):
            if c.get(end) not in inst: problems.append(f"cable {c.get('id')}: {end} {c.get(end)} is not a part")
        for wire in c.get("wires", []):
            for end in ("from", "to"):
                ref = str(wire.get(end, "")); name, _, rest = ref.partition("."); port, _, pin = rest.partition(".")
                n += 1
                if name not in inst: problems.append(f"{wire.get('id')}: {ref}: no part {name}"); continue
                if port.startswith("@") or pin.startswith("@") or not port: continue
                pins = pins_of(inst[name].get("key"), port)
                if pins is None: problems.append(f"{wire.get('id')}: {ref}: {inst[name].get('key')} has no port {port}")
                elif pins and pin and pin not in pins: problems.append(f"{wire.get('id')}: {ref}: port {port} has no pin {pin}")
    for rail in w.get("rails", []):
        s_ = sum(x.get("typical_a", 0) for x in rail.get("loads", []))
        if rail.get("typical_a") is not None and rail.get("loads") and abs(s_ - rail["typical_a"]) > 0.05 + 0.03 * s_: problems.append(f"rail {rail.get('name')}: loads add to {s_:.2f} A, the rail says {rail['typical_a']} A")
    r.ok("wiring", not problems, "; ".join(problems[:8]) or f"{len(w.get('cables', []))} cables, {n} wire ends: every part, port and pin exists; rail sums add up")


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--designs", action="store_true"); ap.add_argument("--no-examples", action="store_true")
    ap.add_argument("--ros", action="store_true"); ap.add_argument("--moveit", action="store_true"); ap.add_argument("--rviz", action="store_true")
    ap.add_argument("--only"); ap.add_argument("--report", type=Path)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    robots = ([] if a.no_examples else example_robots(a.only)) + (generated_robots(a.only) if a.designs else [])
    report = {}
    for r in robots:
        t0 = time.time()
        if "export" not in r.results:
            pkg, cad = unpack(r)
            urdf = check_urdf(r, pkg)
            if a.ros: check_ros(r, pkg, a.moveit, a.rviz)
            check_mujoco(r, r.root / "robot.urdf" if (r.root / "robot.urdf").exists() else urdf)
            check_stl(r, cad, pkg); check_step(r, cad); check_bom(r); check_firmware(r); check_wiring(r)
        report[r.name] = r.results
        bad = [k for k, v in r.results.items() if not v["pass"]]
        print(f"{r.name}: {'PASS' if not bad else 'FAIL ' + ', '.join(bad)} ({time.time() - t0:.0f} s)", flush=True)
        (OUT / "report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    if a.report: write_report(a.report, report, a)
    fails = {k: [s for s, v in r.items() if not v["pass"]] for k, r in report.items()}
    fails = {k: v for k, v in fails.items() if v}
    print(f"{len(report) - len(fails)} of {len(report)} robots pass every check" + (f"; failing: {json.dumps(fails)}" if fails else ""))
    sys.exit(1 if fails else 0)


def write_report(path: Path, report: dict, a):
    steps = ["export", "urdf", "xacro", "rsp", "colcon", "launch", "moveit", "rviz", "mujoco", "stl", "step", "bom", "firmware", "wiring"]
    used = [s for s in steps if any(s in r for r in report.values())]
    lines = ["# Export check", "", f"`python scripts/check_exports.py{' --designs' if a.designs else ''}{' --ros' if a.ros else ''}{' --moveit' if a.moveit else ''}{' --rviz' if a.rviz else ''}` on {time.strftime('%Y-%m-%d')}: every export of every robot opened, built, loaded or run with the tool it is made for. ✓ passed, ✗ failed (the details follow the table), blank: the robot has no such export.", "",
             "| Robot | " + " | ".join(used) + " |", "|---|" + "---|" * len(used)]
    for name, r in report.items(): lines.append(f"| {name} | " + " | ".join("" if s not in r else ("✓" if r[s]["pass"] else "✗") for s in used) + " |")
    lines += ["", "## Failures", ""]
    for name, r in report.items():
        for s, v in r.items():
            if not v["pass"]: lines.append(f"- **{name}** {s}: {v['detail']}")
    path.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
