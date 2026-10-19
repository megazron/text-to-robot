"""stills.py <urdf> <out.png> [--floating] [--q name=val ...] : 2x2 grid of MuJoCo renders"""
import sys, os, numpy as np
os.environ.setdefault("MUJOCO_GL", "osmesa")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "python"))
import mujoco
from PIL import Image
from ttr_mujoco.convert import urdf_to_mjcf
args = sys.argv[1:]; urdf, out = args[0], args[1]
floating = "--floating" in args
q = dict(a.split("=") for a in args[2:] if "=" in a)
xml = urdf_to_mjcf(urdf, floating=floating)
cwd = os.getcwd(); os.chdir(os.path.dirname(os.path.abspath(urdf)))
m = mujoco.MjModel.from_xml_string(xml); os.chdir(cwd)
d = mujoco.MjData(m)
for k, v in q.items():
    j = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, k)
    if j >= 0: d.qpos[m.jnt_qposadr[j]] = float(v)
mujoco.mj_forward(m, d)
W, H = 480, 400
r = mujoco.Renderer(m, H, W)
cam = mujoco.MjvCamera(); 
pts = []
for g in range(m.ngeom):
    if m.geom_bodyid[g] == 0: continue
    pts.append(d.geom_xpos[g] + m.geom_aabb[g][3:] * 0); 
pts = np.array(pts); lo = pts.min(0); hi = pts.max(0); c = (lo + hi) / 2
zoom = float(os.environ.get("ZOOM", "1"))
ext = max(float(np.max(hi - lo)), 0.12) / zoom
tiles = []
for az, el in [(135, -20), (45, -20), (180, -5), (90, -60)]:
    cam.lookat[:] = c; cam.distance = ext * 1.6; cam.azimuth = az; cam.elevation = el
    r.update_scene(d, cam); tiles.append(r.render())
img = np.vstack([np.hstack(tiles[:2]), np.hstack(tiles[2:])])
Image.fromarray(img).save(out); print("mass", round(sum(m.body_mass), 3), "bodies", m.nbody, "->", out)
