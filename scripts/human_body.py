"""A real anatomical wearer for armour: MakeHuman (CC0) adult body, split at its joints into closed solids.
    .venv/bin/python -B scripts/human_body.py <out-dir> [height_m]
Writes <link>.stl (mm, world frame: x forward, y left, z up, feet on z=0) and joints.json."""
import json, os, sys
import numpy as np, trimesh
from scipy.ndimage import binary_dilation, binary_erosion, gaussian_filter, label, distance_transform_edt
from skimage.measure import marching_cubes
sys.path.insert(0, os.path.expanduser("~/bs-chars/tools"))
from chars import mh

out = sys.argv[1]; H = float(sys.argv[2]) * 1000 if len(sys.argv) > 2 else 1750.0; os.makedirs(out, exist_ok=True)
base = mh.Obj(f"{mh.DATA}/3dobjs/base.obj")
tg = mh.macro_targets(gender=1.0, age=0.5, muscle=0.55, weight=0.42, height=0.5, proportions=0.75)
v = mh.apply_targets(np.array(base.v, float), tg)
rig = mh.Rig()
piv = rig.pivots(v); ix = rig.index
faces = base.group_faces(lambda g: g == "body")
tri = []
for k in faces:
    f = base.faces[k]; tri += [[f[0], f[i], f[i + 1]] for i in range(1, len(f) - 1)]
tri = np.array(tri)
to = lambda p: np.c_[p[:, 2], p[:, 0], p[:, 1]]                  # MakeHuman: x left, y up, z forward
V, P = to(v), to(piv)
lo = V[np.unique(tri)][:, 2].min(); sc = H / (V[np.unique(tri)][:, 2].max() - lo)
V = (V - [0, 0, lo]) * sc; P = (P - [0, 0, lo]) * sc
J = lambda n: P[ix[n]]
# sealed solid of the skin
g = 4.0; used = np.unique(tri); m = trimesh.Trimesh(V, tri, process=False)
lo3 = V[used].min(0) - 6 * g; shape = np.ceil((V[used].max(0) + 6 * g - lo3) / g).astype(int) + 1
occ = np.zeros(shape, bool); pts = trimesh.sample.sample_surface(m, 3000000)[0]; occ[tuple(np.round((pts - lo3) / g).astype(int).T)] = True
occ = binary_dilation(occ, iterations=2); lab, _ = label(~occ); solid = binary_erosion(lab != lab[0, 0, 0], iterations=2)
d = gaussian_filter((distance_transform_edt(solid) - distance_transform_edt(~solid)).astype(np.float32), 0.9)
# segments: nearest bone, in units of its girth
bones = {"pelvis": ("hips", "neck", 170), "head": ("neck", "head", 95)}
for s_, L in (("L", "left"), ("R", "right")):
    bones.update({f"{L}_upper_arm": (f"upperarm{s_}", f"lowerarm{s_}", 62), f"{L}_forearm": (f"lowerarm{s_}", f"hand{s_}", 50), f"{L}_hand": (f"hand{s_}", None, 55),
                  f"{L}_thigh": (f"upperleg{s_}", f"lowerleg{s_}", 90), f"{L}_shin": (f"lowerleg{s_}", f"foot{s_}", 65), f"{L}_foot": (f"foot{s_}", f"toe{s_}", 70)})
names = list(bones); ii = np.argwhere(d > -6); G = lo3 + ii * g
def seg(Q, a, b):
    if b is None: return np.linalg.norm(Q - a, axis=1)
    ab = b - a; t = np.clip(((Q - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)
D = np.stack([seg(G, J(bones[n][0]), J(bones[n][1]) if bones[n][1] else None) / bones[n][2] for n in names], 1)
hw = names.index("head"); D[:, hw] = np.where(G[:, 2] > J("neck")[2] + 8, 0, 9)     # the neck belongs to the torso below the jaw line
lab2 = np.full(d.shape, -1, np.int16); lab2[tuple(ii.T)] = D.argmin(1)
for k, n in enumerate(names):
    f = np.where(lab2 == k, -d, 4.0).astype(np.float32); f = np.where(lab2 == -1, 4.0, f)
    f = np.minimum(np.where((lab2 == k) & (d > 0), -d, 4.0), 4.0).astype(np.float32); f = gaussian_filter(f, 0.6)
    vv, ff, _, _ = marching_cubes(np.pad(f, 1, constant_values=4.0), 0.0, spacing=(g, g, g))
    b = trimesh.Trimesh(vv + lo3 - g, ff[:, ::-1], process=True)
    b = max(b.split(only_watertight=True), key=lambda c: abs(c.volume)); 
    if b.volume < 0: b.invert()
    b.export(f"{out}/{n}.stl"); print(n, len(b.faces), b.extents.round(0).tolist(), round(b.volume / 1e6, 2), "L", flush=True)
def rot_between(u, w):
    u, w = u / np.linalg.norm(u), w / np.linalg.norm(w); x = np.cross(u, w); c = float(u @ w); k = np.linalg.norm(x)
    if k < 1e-9: return np.eye(3)
    K = np.array([[0, -x[2], x[1]], [x[2], 0, -x[0]], [-x[1], x[0], 0]]) / k
    return np.eye(3) + K * k + K @ K * (1 - c)
# the rest pose has bent elbows: the forearm and hand are swung down to a relaxed hang, about 12 degrees of bend
straight = {}
for s_, L in (("L", "left"), ("R", "right")):
    e, w, sh = J(f"lowerarm{s_}"), J(f"hand{s_}"), J(f"upperarm{s_}")
    want = (e - sh) / np.linalg.norm(e - sh) + np.array([0.2, 0, 0]); Rm = rot_between(w - e, want)
    for n in (f"{L}_forearm", f"{L}_hand"):
        b = trimesh.load(f"{out}/{n}.stl", force="mesh"); b.vertices = (b.vertices - e) @ Rm.T + e; b.export(f"{out}/{n}.stl")
    straight[s_] = e + Rm @ (w - e)
joints = {"hip_c": J("hips"), "neck": J("neck")}
for s_, L in (("L", "left"), ("R", "right")):
    joints.update({f"{L}_shoulder": J(f"upperarm{s_}"), f"{L}_elbow": J(f"lowerarm{s_}"), f"{L}_wrist": straight[s_], f"{L}_hip": J(f"upperleg{s_}"), f"{L}_knee": J(f"lowerleg{s_}"), f"{L}_ankle": J(f"foot{s_}"), f"{L}_toe": J(f"toe{s_}")})
json.dump({k: [round(float(x), 1) for x in val] for k, val in joints.items()}, open(f"{out}/joints.json", "w"), indent=1)
for k, val in joints.items(): print(k, np.round(val).tolist())
