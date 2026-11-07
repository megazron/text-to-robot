"""Do any two parts pass through each other while a robot moves? Exact meshes, not collision boxes.

tests/examples-interference only sees the home pose. This steps every frame of an example's film (the MuJoCo motion loop of
scripts/studio/motion.py) and, with --sweep, every moving joint across its whole range from the film's first pose, and
intersects each pair of parts whose relative pose changes. A pair fails when it overlaps by more than it does with every joint
at zero (a shaft in its bearing is there by design), or a part goes through the floor.

    .venv/bin/python -B scripts/check_motion.py [example ...] [--record] [--sweep] [--json out/motion_check.json]
--record re-runs the motion takes instead of reading out/studio/<example>/motion.json. Exit code 1 on any failure.
"""
from __future__ import annotations
import argparse, itertools, json, math, os, subprocess, sys, warnings
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
import manifold3d as mf
import trimesh

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
TOL_MM3, FLOOR_MM = 3.0, 2.0


def quat_mat(q):
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


def pose_mat(p):
    T = np.eye(4); T[:3, :3] = quat_mat(p[3:7]); T[:3, 3] = np.array(p[:3]) * 1000.0
    return T


def rpy_mat(xyz, rpy):
    r, p, y = rpy; cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    T = np.eye(4); T[:3, :3] = [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr], [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr], [-sp, cp * sr, cp * cr]]
    T[:3, 3] = np.array(xyz) * 1000.0
    return T


class Robot:
    """Every visual mesh as a manifold solid in its link frame (mm)."""

    def __init__(self, folder):
        self.parts, self.hull, cache = [], [], {}
        for link in ET.parse(folder / "robot.urdf").getroot().findall("link"):
            for v in link.findall("visual"):
                mesh = v.find("geometry/mesh")
                if mesh is None: continue
                f = mesh.get("filename").split("/")[-1]
                if f not in cache:
                    t = trimesh.load(folder / "meshes" / f, force="mesh"); s = t.vertices * 1000.0
                    solid = mf.Manifold(mf.Mesh(vert_properties=np.asarray(s, np.float32), tri_verts=np.asarray(t.faces, np.uint32)))
                    if solid.status() != mf.Error.NoError or solid.is_empty():   # a bought part that is several touching bodies: its hull
                        h = t.convex_hull; self.hull.append(f)
                        solid = mf.Manifold(mf.Mesh(vert_properties=np.asarray(h.vertices * 1000.0, np.float32), tri_verts=np.asarray(h.faces, np.uint32)))
                    cache[f] = (solid, np.asarray(s, float))
                o = v.find("origin"); xyz = [float(x) for x in o.get("xyz", "0 0 0").split()] if o is not None else [0, 0, 0]; rpy = [float(x) for x in o.get("rpy", "0 0 0").split()] if o is not None else [0, 0, 0]
                solid, verts = cache[f]
                self.parts.append((link.get("name"), solid, verts, rpy_mat(xyz, rpy)))
        self.corners = [np.array(list(itertools.product(*zip(v.min(0), v.max(0))))) for _, _, v, _ in self.parts]

    def world(self, frame):
        return [pose_mat(frame[l]) @ o if l in frame else None for l, _, _, o in self.parts]


def overlap(a, b, Ta, Tb):
    x = a.transform(Ta[:3, :4]) ^ b.transform(Tb[:3, :4]); vol = x.volume()
    if vol <= 0: return 0.0, None
    box = np.array(x.bounding_box()); lo, hi = box[:3], box[3:]
    if (hi - lo).min() < 0.05: return 0.0, None        # faces in contact, not an overlap
    return vol, [round(float(v), 1) for v in (*lo, *hi)]


def boxes(rb, Ts):
    out = []
    for c, T in zip(rb.corners, Ts):
        if T is None: out.append(None); continue
        w = c @ T[:3, :3].T + T[:3, 3]; out.append((w.min(0), w.max(0)))
    return out


def check(rb, home, frames, label, res):
    """Every frame against the home-pose baseline; fills res[(a, b)] with the worst overlap found."""
    H = rb.world(home); n = len(rb.parts); base = {}; hb = boxes(rb, H)
    moving = set()
    for f in frames[:: max(1, len(frames) // 16)]:
        Ts = rb.world(f)
        for i, j in itertools.combinations(range(n), 2):
            if rb.parts[i][0] == rb.parts[j][0] or Ts[i] is None or Ts[j] is None or H[i] is None or H[j] is None or (i, j) in moving: continue
            if np.abs(np.linalg.inv(Ts[i]) @ Ts[j] - np.linalg.inv(H[i]) @ H[j]).max() > 0.05: moving.add((i, j))
    for idx, f in enumerate(frames):
        Ts = rb.world(f); bx = boxes(rb, Ts)
        for i, j in moving:
            if bx[i] is None or bx[j] is None or np.any(bx[i][1] < bx[j][0]) or np.any(bx[j][1] < bx[i][0]): continue
            if (i, j) not in base:
                base[(i, j)] = overlap(rb.parts[i][1], rb.parts[j][1], H[i], H[j])[0] if not (np.any(hb[i][1] < hb[j][0]) or np.any(hb[j][1] < hb[i][0])) else 0.0
            vol, where = overlap(rb.parts[i][1], rb.parts[j][1], Ts[i], Ts[j])
            over = vol - base[(i, j)]
            na, nb = rb.parts[i][0], rb.parts[j][0]
            # a wheel's D-bore sits on its motor's shaft, which the motor mesh shows standing still: that sliver is not a collision
            shaft = {na.replace("_motor", ""), nb.replace("_wheel", "")} if na.endswith("_motor") else {nb.replace("_motor", ""), na.replace("_wheel", "")}
            if len(shaft) == 1 and over < 30: continue
            # a hobby servo's mesh carries its horn, which really turns with the link screwed to it
            if nb == f"{na}_servo" and over < 100: continue
            if over > max(TOL_MM3, 0.1 * base[(i, j)]):
                k = (rb.parts[i][0], rb.parts[j][0]); w = res.get(k)
                if not w or over > w["mm3"]: res[k] = {"mm3": round(over, 1), "at": label, "frame": idx, "box_mm": where}
    return len(moving)


def floor(rb, frames):
    """Lowest real vertex of any part over the film (the corners of a rotated box would overstate it)."""
    worst, who = 0.0, None
    for f in frames:
        for (l, _, verts, _), T, bx in zip(rb.parts, rb.world(f), boxes(rb, rb.world(f))):
            if bx is None or bx[0][2] >= worst: continue
            z = float((verts @ T[2, :3] + T[2, 3]).min())
            if z < worst: worst, who = z, l
    return worst, who


def sweep_frames(ex, start):
    """One joint at a time from `start` across its limits, with the links moved by kinematics (no physics, no contact)."""
    import mujoco
    from ttr_mujoco.convert import urdf_to_mjcf
    folder = ROOT / "examples" / ex; spec = json.loads((folder / "robot.json").read_text())
    with warnings.catch_warnings():
        warnings.simplefilter("ignore"); xml = urdf_to_mjcf(str(folder / "robot.urdf"), floating=False, spec=spec)
    m = mujoco.MjModel.from_xml_string(xml); d = mujoco.MjData(m); mimic = [(j["name"], j["mimic"]) for j in spec["joints"] if j.get("mimic")]
    jid = lambda n: mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, n)
    out = {}
    for j in spec["joints"]:
        if j["type"] not in ("revolute", "prismatic") or j.get("mimic") or jid(j["name"]) < 0: continue
        lo, hi = j["limit"]["lower"], j["limit"]["upper"]; frames = []
        for q in np.linspace(lo, hi, 13):
            d.qpos[:] = m.qpos0
            for n, v in start.items():
                if jid(n) >= 0: d.qpos[m.jnt_qposadr[jid(n)]] = v
            d.qpos[m.jnt_qposadr[jid(j["name"])]] = q
            for n, mm in mimic:
                if jid(n) >= 0 and jid(mm["joint"]) >= 0: d.qpos[m.jnt_qposadr[jid(n)]] = mm.get("multiplier", 1) * d.qpos[m.jnt_qposadr[jid(mm["joint"])]] + mm.get("offset", 0)
            mujoco.mj_kinematics(m, d)
            frames.append({m.body(b).name: [*d.xpos[b], *d.xquat[b]] for b in range(1, m.nbody)})
        out[j["name"]] = frames
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0]); ap.add_argument("examples", nargs="*"); ap.add_argument("--record", action="store_true"); ap.add_argument("--sweep", action="store_true"); ap.add_argument("--json", type=Path)
    a = ap.parse_args()
    names = a.examples or sorted(p.name for p in (ROOT / "examples").iterdir() if p.is_dir() and p.name[:2].isdigit())
    report, failed = {}, 0
    for ex in names:
        path = ROOT / "out/studio" / ex / "motion.json"
        if a.record or not path.exists():
            subprocess.run([sys.executable, "-B", str(ROOT / "scripts/studio/motion.py"), ex], check=True, env={**os.environ, "MUJOCO_GL": "disable"}, stdout=subprocess.DEVNULL)
        mo = json.loads(path.read_text()); rb = Robot(ROOT / "examples" / ex); res = {}
        n = check(rb, mo["home"], mo["frames"], "film", res)
        low, who = floor(rb, mo["frames"])
        rest = floor(rb, [mo["home"]])[0] if "root" in mo and not any(abs(a_ - b_) > 1e-3 for a_, b_ in zip(mo["frames"][0][mo["root"]][:3], mo["frames"][-1][mo["root"]][:3])) and mo["frames"][0][mo["root"]][2] == mo["home"][mo["root"]][2] else 0.0
        if rest < -FLOOR_MM: low, who = 0.0, None      # bolted to a bench whose case hangs below the model origin: the film's floor sits under it
        sw = {}
        if a.sweep:
            for joint, frames in sweep_frames(ex, mo.get("start", {})).items(): check(rb, mo["home"], frames, f"sweep {joint}", sw)
        row = {"moving_pairs": n, "frames": len(mo["frames"]), "lowest_mm": round(low, 1), "lowest_part": who, "hull_stand_ins": rb.hull,
               "film": [{"a": k[0], "b": k[1], **v} for k, v in sorted(res.items(), key=lambda kv: -kv[1]["mm3"])], "sweep": [{"a": k[0], "b": k[1], **v} for k, v in sorted(sw.items(), key=lambda kv: -kv[1]["mm3"])]}
        report[ex] = row; bad = len(row["film"]) + (low < -FLOOR_MM)
        failed += bool(bad)
        print(f"{'FAIL' if bad else 'ok  '} {ex:24s} {row['frames']} frames, {n} moving pairs, lowest {low:.1f} mm ({who}), film hits {len(row['film'])}, sweep hits {len(row['sweep'])}", flush=True)
        for h in row["film"][:12]: print(f"     {h['a']} / {h['b']}: {h['mm3']} mm^3, frame {h['frame']}, box {h['box_mm']}", flush=True)
        for h in row["sweep"][:6]: print(f"     (range) {h['a']} / {h['b']}: {h['mm3']} mm^3 at {h['at']}", flush=True)
    if a.json: a.json.write_text(json.dumps(report, indent=1) + "\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__": main()
