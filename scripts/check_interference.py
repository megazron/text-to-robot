"""Exact part-to-part interference of a staged robot (mesh solids, not collision boxes).

    .venv/bin/python -B scripts/check_interference.py <robot.urdf> [--floating] [--min-mm3 1] [joint=value ...]

Every visual mesh is placed at the given joint values (MuJoCo forward kinematics) and every
pair of parts on different bodies whose boxes overlap is intersected with manifold3d. Pairs
that share more than --min-mm3 of volume are printed (faces that merely touch, e.g. a motor
flange on its plate, are ignored); the exit code is the number of such pairs.
Meshes that are not closed volumes are reported and skipped.
"""
import os
import sys
import warnings

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "python"))
warnings.filterwarnings("ignore")
import mujoco  # noqa: E402
import manifold3d as mf  # noqa: E402
from ttr_mujoco.convert import urdf_to_mjcf  # noqa: E402


def main(argv):
    urdf = argv[0]
    floating = "--floating" in argv
    min_mm3 = float(argv[argv.index("--min-mm3") + 1]) if "--min-mm3" in argv else 1.0
    q = dict(a.split("=") for a in argv[1:] if "=" in a and not a.startswith("--"))
    xml = urdf_to_mjcf(urdf, floating=floating)
    cwd = os.getcwd(); os.chdir(os.path.dirname(os.path.abspath(urdf)))
    m = mujoco.MjModel.from_xml_string(xml); os.chdir(cwd)
    d = mujoco.MjData(m)
    for k, v in q.items():
        j = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, k)
        if j < 0: raise SystemExit(f"unknown joint {k}")
        d.qpos[m.jnt_qposadr[j]] = float(v)
    import xml.etree.ElementTree as ET
    for j in ET.parse(urdf).getroot().findall("joint"):  # URDF mimic joints follow their leader
        mi = j.find("mimic")
        if mi is None: continue
        lead = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, mi.get("joint")); fol = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, j.get("name"))
        if lead >= 0 and fol >= 0:
            d.qpos[m.jnt_qposadr[fol]] = float(mi.get("multiplier", "1")) * d.qpos[m.jnt_qposadr[lead]] + float(mi.get("offset", "0"))
    mujoco.mj_forward(m, d)
    parts, skipped = [], []
    for g in range(m.ngeom):
        if m.geom_type[g] != mujoco.mjtGeom.mjGEOM_MESH or m.geom_group[g] == 3: continue
        mid = int(m.geom_dataid[g])
        v = m.mesh_vert[m.mesh_vertadr[mid]:m.mesh_vertadr[mid] + m.mesh_vertnum[mid]]
        f = m.mesh_face[m.mesh_faceadr[mid]:m.mesh_faceadr[mid] + m.mesh_facenum[mid]]
        w = (v @ d.geom_xmat[g].reshape(3, 3).T + d.geom_xpos[g]) * 1000.0  # mm
        solid = mf.Manifold(mf.Mesh(vert_properties=np.asarray(w, np.float32), tri_verts=np.asarray(f, np.uint32)))
        body = m.body(int(m.geom_bodyid[g])).name
        if solid.status() != mf.Error.NoError or solid.is_empty():
            skipped.append(body); continue
        parts.append((body, solid, w.min(0), w.max(0)))
    hits = []
    for i in range(len(parts)):
        for k in range(i + 1, len(parts)):
            a, b = parts[i], parts[k]
            if a[0] == b[0] or np.any(a[3] < b[2]) or np.any(b[3] < a[2]): continue
            x = a[1] ^ b[1]
            vol = x.volume()
            if vol > min_mm3:
                lo, hi = np.array(x.bounding_box()[:3]), np.array(x.bounding_box()[3:])
                if (hi - lo).min() < 0.05: continue  # bolted faces in contact (coplanar sliver), not an overlap
                hits.append((vol, a[0], b[0], lo, hi))
    for vol, a, b, lo, hi in sorted(hits, key=lambda h: -h[0]):
        print(f"  INTERSECT {a} / {b}: {vol:.1f} mm^3 in [{', '.join(f'{v:.1f}' for v in lo)}] .. [{', '.join(f'{v:.1f}' for v in hi)}] mm")
    if skipped: print(f"  skipped (not closed volumes): {', '.join(sorted(set(skipped)))}")
    print(f"{len(parts)} solids, {len(hits)} intersecting pairs (> {min_mm3} mm^3)")
    return len(hits)


if __name__ == "__main__":
    sys.exit(min(main(sys.argv[1:]), 100))
