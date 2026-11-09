"""Validate every file the site downloads for one robot: URDF, xacro, JSON, BOM, CAD zip (STEP, STL), ROS 2 zip, training zip.

    .venv/bin/python -B scripts/launch_audit/validate_files.py <folder with the downloads> [--no-colcon]

Needs ROS 2 Jazzy in /opt/ros/jazzy (check_urdf, xacro, colcon), trimesh, OCP, MuJoCo and PyBullet. Prints a JSON report."""
import io, json, math, os, re, subprocess, sys, tempfile, zipfile, pathlib, xml.etree.ElementTree as ET
import numpy as np, trimesh
d = pathlib.Path(sys.argv[1]); colcon = "--no-colcon" not in sys.argv
R = {"dir": str(d), "problems": [], "notes": []}
P = lambda m: R["problems"].append(m)
N = lambda m: R["notes"].append(m)
def one(pat):
    f = sorted(d.glob(pat)); return f[0] if f else None
urdf_f, xacro_f, json_f, bom_f = one("*.urdf"), one("*.urdf.xacro"), one("*.json"), one("*_BOM.md")
json_f = next((f for f in sorted(d.glob("*.json")) if f.name != "robot_from_page.json"), None)
cad_f, ros_f, tr_f = one("*_cad.zip"), one("*_ros2.zip"), one("*_training.zip")
for k, f in [("urdf", urdf_f), ("xacro", xacro_f), ("json", json_f), ("bom", bom_f), ("cad", cad_f), ("ros2", ros_f), ("train", tr_f)]:
    if not f: P(f"missing {k} download")
    elif f.stat().st_size == 0: P(f"{k} empty")
BAD_TEXT = [(r"\bNaN\b", "NaN"), (r"\bundefined\b", "undefined"), (r"\[object Object\]", "[object Object]"), (r"\bInfinity\b", "Infinity"), (r"\bTODO\b|\bTBD\b|\bFIXME\b|lorem ipsum|PLACEHOLDER", "placeholder"), ("—", "em dash")]
def scan_text(name, text):
    for rx, what in BAD_TEXT:
        n = len(re.findall(rx, text))
        if n: (N if what == "em dash" else P)(f"{name}: {n}x {what}") if what != "em dash" else R.setdefault("em_dash_files", []).append(f"{name} ({n})")
def check_urdf_xml(name, text, mesh_ok=None):
    try: root = ET.fromstring(text)
    except Exception as e: P(f"{name}: XML parse error {e}"); return None
    links = {l.get("name"): l for l in root.findall("link")}; joints = root.findall("joint")
    if len(links) != len(joints) + 1: P(f"{name}: {len(links)} links vs {len(joints)} joints (not a tree)")
    for j in joints:
        t = j.get("type"); lim = j.find("limit")
        if t in ("revolute", "prismatic"):
            if lim is None: P(f"{name}: joint {j.get('name')} has no limit"); continue
            lo, hi, ef, ve = (float(lim.get(k, "nan")) for k in ("lower", "upper", "effort", "velocity"))
            if not lo < hi: P(f"{name}: joint {j.get('name')} lower {lo} !< upper {hi}")
            if not ef > 0 or not ve > 0: P(f"{name}: joint {j.get('name')} effort {ef} velocity {ve}")
            if t == "revolute" and (abs(lo) > 2 * math.pi + 1e-6 or abs(hi) > 2 * math.pi + 1e-6): P(f"{name}: joint {j.get('name')} limits beyond 2 pi")
        ax = j.find("axis")
        if ax is not None:
            a = np.array([float(x) for x in ax.get("xyz").split()])
            if abs(np.linalg.norm(a) - 1) > 1e-3: P(f"{name}: joint {j.get('name')} axis not unit {a}")
    tot = 0; heavy = []
    for ln, l in links.items():
        inn = l.find("inertial")
        if inn is None:
            if l.find("visual") is not None or l.find("collision") is not None: N(f"{name}: link {ln} has geometry but no inertial")
            continue
        m = float(inn.find("mass").get("value")); I = inn.find("inertia"); tot += m
        ixx, iyy, izz = (float(I.get(k)) for k in ("ixx", "iyy", "izz"))
        if not m > 0: P(f"{name}: link {ln} mass {m}")
        if not (ixx > 0 and iyy > 0 and izz > 0): P(f"{name}: link {ln} inertia not positive {ixx} {iyy} {izz}")
        elif ixx + iyy < izz * (1 - 1e-6) or ixx + izz < iyy * (1 - 1e-6) or iyy + izz < ixx * (1 - 1e-6): P(f"{name}: link {ln} inertia violates triangle inequality")
        # plausibility: radius of gyration vs 3 m
        if m > 0 and max(ixx, iyy, izz) / m > 3.0: P(f"{name}: link {ln} radius of gyration {math.sqrt(max(ixx,iyy,izz)/m):.2f} m implausible")
        if any(not math.isfinite(v) for v in (m, ixx, iyy, izz)): P(f"{name}: link {ln} non-finite")
    R.setdefault("mass_kg", {})[name] = round(tot, 3)
    meshes = [m.get("filename") for m in root.iter("mesh")]
    if mesh_ok: mesh_ok(meshes)
    return root
def check_stl_bytes(name, data, bed=False):
    try: m = trimesh.load(io.BytesIO(data), file_type="stl", process=True)
    except Exception as e: P(f"{name}: STL load error {e}"); return None
    out = {"tri": len(m.faces), "watertight": bool(m.is_watertight), "winding": bool(m.is_winding_consistent), "ext_mm": [round(x, 1) for x in m.extents]}
    if len(m.faces) == 0: P(f"{name}: empty STL")
    if not np.isfinite(m.vertices).all(): P(f"{name}: non-finite vertices")
    if m.is_watertight and m.volume <= 0: P(f"{name}: negative volume (inverted normals)")
    return m, out
# ---------- URDF ----------
if urdf_f:
    text = urdf_f.read_text(); scan_text(urdf_f.name, text)
    check_urdf_xml(urdf_f.name, text)
    r = subprocess.run(["bash", "-c", f"source /opt/ros/jazzy/setup.bash && check_urdf '{urdf_f}'"], capture_output=True, text=True)
    R["check_urdf"] = "ok" if r.returncode == 0 else (r.stdout + r.stderr)[-300:]
    if r.returncode: P(f"check_urdf failed: {(r.stdout + r.stderr)[-200:]}")
# ---------- the xacro download on its own (no package) ----------
if xacro_f and urdf_f:
    r = subprocess.run(["env", "-i", f"HOME={os.environ['HOME']}", "PATH=/usr/bin:/bin", "bash", "-c", f"source /opt/ros/jazzy/setup.bash && xacro '{xacro_f}'"], capture_output=True, text=True)
    if r.returncode: R["xacro_download"] = "fail: " + r.stderr[-200:]; P(f"xacro download does not expand on its own: {r.stderr[-160:]}")
    else:
        def names(x): return sorted((e.tag, e.get("name") or "") for e in ET.fromstring(x).iter() if e.tag in ("link", "joint"))
        same = names(r.stdout) == names(urdf_f.read_text())
        R["xacro_download"] = "expands; same links and joints as the URDF download" if same else "expands; links or joints differ from the URDF download"
        if not same: P("xacro download expands to different links or joints than the URDF download")
# ---------- JSON ----------
if json_f:
    t = json_f.read_text(); scan_text(json_f.name, t)
    try: spec = json.loads(t); R["json"] = f"{len(spec['links'])} links"
    except Exception as e: P(f"json parse {e}")
# ---------- BOM ----------
if bom_f:
    t = bom_f.read_text(); scan_text(bom_f.name, t)
    lines = t.splitlines(); i0 = next(i for i, l in enumerate(lines) if l.startswith("| Category"))
    rows = []
    for l in lines[i0 + 2:]:
        if not l.startswith("|"): break
        rows.append(l)
    tot = re.search(r"total: \$([\d.]+)", t, re.I); s = 0; bad = []
    for l in rows:
        c = [x.strip() for x in l.strip("|").split("|")]
        try: q, u, sub = float(c[2]), float(c[3]), float(c[4])
        except Exception: bad.append(l[:80]); continue
        if q <= 0 or u < 0: bad.append(f"qty/price {l[:80]}")
        if abs(q * u - sub) > 0.011 + 0.005 * sub: bad.append(f"{c[1][:40]}: {q} x {u} != {sub}")
        s += sub
    if bad: P(f"BOM lines: {bad[:4]}")
    if tot and abs(s - float(tot.group(1))) > 0.05: P(f"BOM total {tot.group(1)} != sum {s:.2f}")
    R["bom"] = {"lines": len(rows), "total": tot and float(tot.group(1)), "sum": round(s, 2), "links": len(re.findall(r"https?://", t))}
# ---------- zips ----------
def zip_texts(z, label):
    for n in z.namelist():
        data = z.read(n)
        if n.endswith("/"): continue
        if len(data) == 0: P(f"{label}:{n} empty")
        if re.search(r"\.(md|txt|py|yaml|yml|xml|urdf|xacro|launch\.py|json|srdf|sdf|rviz|cmake|svg)$|CMakeLists", n, re.I):
            scan_text(f"{label}:{n}", data.decode("utf8", "replace"))
if cad_f:
    z = zipfile.ZipFile(cad_f); zip_texts(z, "cad"); names = z.namelist()
    steps = [n for n in names if re.search(r"\.ste?p$", n, re.I)]; stls = [n for n in names if n.endswith(".stl")]
    R["cad"] = {"stl": len(stls), "step": len(steps)}
    if not steps: N("CAD zip has no STEP file although the button says 'STEP + STL'")
    stl_stats = {"open": [], "inverted": 0, "big": []}
    for n in stls:
        r = check_stl_bytes(n, z.read(n))
        if not r: continue
        m, o = r
        if "/print/" in n:
            if not o["watertight"]: stl_stats["open"].append(n)
            if max(o["ext_mm"]) > 1000: stl_stats["big"].append(f"{n} {o['ext_mm']}")
            if max(o["ext_mm"]) < 1: P(f"{n}: extents {o['ext_mm']} mm (units?)")
    if stl_stats["open"]: P(f"printed STLs not watertight: {stl_stats['open'][:5]} ({len(stl_stats['open'])})")
    if stl_stats["big"]: P(f"printed STL > 1 m: {stl_stats['big'][:3]}")
    # STEP files: open with OpenCascade, check the solid
    if steps:
        from OCP.STEPControl import STEPControl_Reader; from OCP.BRepCheck import BRepCheck_Analyzer; from OCP.IFSelect import IFSelect_RetDone
        from OCP.GProp import GProp_GProps; from OCP.BRepGProp import BRepGProp
        okn = 0
        for n in steps:
            with tempfile.NamedTemporaryFile(suffix=".step") as f:
                f.write(z.read(n)); f.flush(); rd = STEPControl_Reader()
                if rd.ReadFile(f.name) != IFSelect_RetDone: P(f"{n}: STEP read failed"); continue
                rd.TransferRoots(); sh = rd.OneShape(); g = GProp_GProps(); BRepGProp.VolumeProperties_s(sh, g)
                if not BRepCheck_Analyzer(sh).IsValid(): P(f"{n}: STEP shape invalid")
                elif g.Mass() <= 0: P(f"{n}: STEP volume {g.Mass()}")
                else: okn += 1
        R["cad"]["step_valid"] = okn
    # wiring nets: parts named in WIRING.md vs BOM
    if "cad/WIRING.md" in names:
        w = z.read("cad/WIRING.md").decode(); R["cad"]["wiring_lines"] = len(w.splitlines())
    if "cad/wiring.svg" in names:
        try: ET.fromstring(z.read("cad/wiring.svg"))
        except Exception as e: P(f"wiring.svg not valid XML: {e}")
if ros_f:
    z = zipfile.ZipFile(ros_f); zip_texts(z, "ros2"); names = set(z.namelist())
    pkg = sorted({n.split("/")[0] for n in names})
    if len(pkg) != 1: P(f"ros2 zip top dirs {pkg}")
    pkg = pkg[0]
    try:
        px = ET.fromstring(z.read(f"{pkg}/package.xml")); pn = px.findtext("name")
        if pn != pkg: P(f"package.xml name {pn} != folder {pkg}")
        R["ros2_deps"] = sorted({e.text for e in px if e.tag.endswith("depend")})
    except Exception as e: P(f"package.xml: {e}")
    # every package:// path in urdf/xacro/sdf/launch resolves
    missing = set()
    for n in names:
        if re.search(r"\.(urdf|xacro|sdf|py|rviz|srdf|yaml)$", n):
            for ref in re.findall(r"package://([\w-]+)/([^\"'<> ]+)", z.read(n).decode("utf8", "replace")):
                if ref[0] == pkg and f"{pkg}/{ref[1]}" not in names: missing.add(f"{n} -> {ref[1]}")
                if ref[0] != pkg: missing.add(f"{n} -> other package {ref[0]}")
    if missing: P(f"ros2 unresolved paths: {sorted(missing)[:5]}")
    uf = f"{pkg}/urdf/{pkg}.urdf"
    if uf in names:
        def meshes_ok(ms):
            for m in ms:
                p = m.replace(f"package://{pkg}/", f"{pkg}/")
                if p not in names: P(f"ros2 urdf mesh missing {m}")
        check_urdf_xml("ros2:" + uf, z.read(uf).decode(), meshes_ok)
        if urdf_f and z.read(uf).decode() != urdf_f.read_text(): N("ros2 package URDF differs from the URDF download")
    for n in names:
        if n.endswith(".stl"):
            r = check_stl_bytes(n, z.read(n))
            if r and max(r[1]["ext_mm"]) > 5: P(f"{n}: ROS mesh extents {r[1]['ext_mm']} (expected metres)")
            if r and not r[1]["watertight"]: R.setdefault("ros_open_meshes", []).append(n)
    # cmake installs every directory
    cm = z.read(f"{pkg}/CMakeLists.txt").decode()
    for sub in sorted({n.split("/")[1] for n in names if n.count("/") >= 2}):
        if sub not in cm: P(f"CMakeLists does not install {sub}/")
    if colcon:
        with tempfile.TemporaryDirectory() as ws:
            (pathlib.Path(ws) / "src").mkdir(); z.extractall(pathlib.Path(ws) / "src")
            r = subprocess.run(["env", "-i", f"HOME={os.environ['HOME']}", "PATH=/usr/bin:/bin", "QT_QPA_PLATFORM=offscreen", "bash", "-c", f"cd {ws} && source /opt/ros/jazzy/setup.bash && colcon build 2>&1 | tail -4 && source install/setup.bash && "
                f"xacro install/{pkg}/share/{pkg}/urdf/{pkg}.urdf.xacro > {ws}/x.urdf && echo XACRO_OK; "
                f"(timeout 25 ros2 launch {pkg} display.launch.py 2>&1 | grep -E 'ERROR|error|robot_state_publisher|process started|exception' | head -12); test -f install/{pkg}/share/{pkg}/urdf/{pkg}.urdf && echo INSTALLED_OK"], capture_output=True, text=True)
            if "XACRO_OK" in r.stdout and urdf_f:
                xs = (pathlib.Path(ws) / "x.urdf").read_text()
                def canon(x):
                    def norm(e):
                        items = sorted((k, re.sub(r"-?\d+\.\d+(e-?\d+)?", lambda m: f"{float(m.group()):.6g}", v)) for k, v in e.attrib.items())
                        return (e.tag, tuple(items), tuple(sorted(norm(c) for c in e if isinstance(c.tag, str))))
                    return norm(ET.fromstring(x))
                same = canon(xs) == canon(z.read(uf).decode())
                R["xacro"] = "expands to the package URDF" if same else "expands, differs from the URDF"
                if not same:
                    a = {(e.tag, e.get("name")) for e in ET.fromstring(xs).iter()}; b = {(e.tag, e.get("name")) for e in ET.fromstring(z.read(uf).decode()).iter()}
                    N(f"xacro differs from URDF: only in xacro {sorted(a-b, key=str)[:6]}, only in urdf {sorted(b-a, key=str)[:6]}")
            else: P("xacro did not expand in the built workspace"); R["xacro"] = "fail"
            R["colcon"] = (r.stdout + r.stderr)[-1500:]
            if "INSTALLED_OK" not in r.stdout: P("colcon build did not install the URDF")
if tr_f:
    z = zipfile.ZipFile(tr_f); zip_texts(z, "train"); names = z.namelist()
    with tempfile.TemporaryDirectory() as td:
        z.extractall(td); tdp = pathlib.Path(td)
        u = [p for p in tdp.rglob("*.urdf")]
        R["train_files"] = len(names)
        if not u: P("training zip has no URDF")
        else:
            env = {**os.environ, "MUJOCO_GL": "disable", "PYTHONPATH": str(next(tdp.rglob("ttr_mujoco")).parent)}
            code = ("import sys,mujoco,numpy as np;from ttr_mujoco.convert import urdf_to_mjcf as c\n"
                    "import inspect\n"
                    "x=c(sys.argv[1]); m=mujoco.MjModel.from_xml_string(x) if isinstance(x,str) else x; d=mujoco.MjData(m)\n"
                    "[mujoco.mj_step(m,d) for _ in range(200)]\nprint('MUJOCO_OK', m.nbody, m.njnt, m.nu, bool(np.isfinite(d.qpos).all()))")
            r = subprocess.run([sys.executable, "-B", "-c", code, str(u[0])], capture_output=True, text=True, env=env, cwd=td, timeout=600)
            R["mujoco"] = (r.stdout + r.stderr)[-400:]
            envdir = next(tdp.rglob("robot_env.py")).parent
            code2 = ("import robot_env, inspect, numpy as np\ncls=[c for n,c in inspect.getmembers(robot_env, inspect.isclass) if c.__module__=='robot_env'][0]\n"
                     "e=cls(); o,_=e.reset(seed=0)\nfor i in range(50): o,rw,t,tr,_=e.step(e.action_space.sample())\nprint('PYBULLET_OK', o.shape, bool(np.isfinite(o).all()))")
            r2 = subprocess.run([sys.executable, "-B", "-c", code2], capture_output=True, text=True, cwd=envdir, timeout=600)
            R["pybullet"] = (r2.stdout + r2.stderr)[-300:]
            if "PYBULLET_OK" not in r2.stdout or "False" in r2.stdout.split("PYBULLET_OK")[-1]: P(f"training env does not run in PyBullet: {(r2.stdout + r2.stderr)[-200:]}")
            if "MUJOCO_OK" not in r.stdout or "False" in r.stdout.split("MUJOCO_OK")[-1]: P(f"training URDF does not load/step in MuJoCo: {(r.stdout + r.stderr)[-200:]}")
print(json.dumps(R, indent=1))
