"""Wearable armour from a reference sculpt (signed-distance pipeline, no CAD program needed).

    .venv/bin/python -B scripts/armour_from_reference.py <figure.stl> <wearer_urdf> <out.json> [--voxel 1.0] [--only torso,...]

How a cosplay armourer builds a suit from a statue, done with signed-distance fields:
  1. landmarks: the sculpt's joint centres (measured once on the figure, below) and the wearer's (from the URDF);
  2. per-piece fit: each body region of the sculpt is mapped bone-to-bone onto the wearer (axial scale = bone length
     ratio, radial scale grown until the wearer's body clears the inside of the shell by the padding gap);
  3. shell: field max(-depth, depth - T) is negative inside a wall T thick under the sculpt's surface;
  4. partition: a point belongs to the region whose bone is nearest in units of that region's girth (power-diagram
     cut lines fall at the joints), with a seam gap between neighbouring pieces;
  5. print split: pieces larger than the bed are cut by planes (with the same seam gap);
  6. marching cubes on each piece's field -> closed meshes, decimated and checked manifold.
The output JSON holds every piece in the wearer's world frame (mm, home pose) with the link it rides on.
"""
import json, sys, math, time
import numpy as np, trimesh
import xml.etree.ElementTree as ET
from pysdf import SDF
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes
from scipy.ndimage import binary_opening, median_filter, map_coordinates, binary_dilation, binary_erosion, distance_transform_edt, gaussian_filter, label as nd_label, mean as nd_mean
import manifold3d as m3d

T, GAP, SEAM = 3.0, 14.0, 0.6
BODY_CLEAR, FACES = 4.0, 10**9
BED = (250.0, 210.0, 220.0)

# ---- sculpt landmarks in mm, the sculpt at true scale: x forward, y left, z up (1742 mm tall)
def mirror(p): return (p[0], -p[1], p[2])
FIG = {"hip_c": (55, 0, 880), "neck": (65, 0, 1510), "top": (80, 0, 1742)}
for side, f in (("left", lambda p: p), ("right", mirror)):
    FIG.update({f"{side}_shoulder": f((10, 235, 1400)), f"{side}_elbow": f((-9, 357, 1120)), f"{side}_wrist": f((85, 430, 930)),
                f"{side}_hand_end": f((115, 440, 780)), f"{side}_hip": f((55, 100, 880)), f"{side}_knee": f((55, 150, 510)),
                f"{side}_ankle": f((10, 190, 95)), f"{side}_toe": f((165, 200, 30))})
RADIAL = 1.10   # ONE scale across the whole body: every region keeps the sculpt's proportions (per-bone stretching made the suit look deformed)


def fk(urdf):
    """World transforms of every link at the zero pose, the joints' world positions and each link's visual mesh."""
    root = ET.parse(urdf).getroot()
    def tf(o):
        xyz = [float(v) for v in (o.get("xyz", "0 0 0") if o is not None else "0 0 0").split()]
        r, p, y = [float(v) for v in (o.get("rpy", "0 0 0") if o is not None else "0 0 0").split()]
        cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
        M = np.eye(4); M[:3, :3] = [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr], [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr], [-sp, cp * sr, cp * cr]]
        M[:3, 3] = xyz; return M
    joints = {j.find("child").get("link"): (j.get("name"), j.find("parent").get("link"), tf(j.find("origin"))) for j in root.findall("joint")}
    W = {}
    def world(l):
        if l in W: return W[l]
        if l not in joints: W[l] = np.eye(4); return W[l]
        _, parent, M = joints[l]; W[l] = world(parent) @ M; return W[l]
    links = {}
    for l in root.findall("link"):
        n = l.get("name"); world(n)
        vis = l.find("visual"); mat = l.find("visual/material")
        links[n] = {"world": W[n], "mesh": vis.find("geometry/mesh").get("filename") if vis is not None and vis.find("geometry/mesh") is not None else None,
                    "material": mat.get("name") if mat is not None else None}
    jpos = {name: (W[parent] @ M)[:3, 3] * 1000 for child, (name, parent, M) in joints.items()}
    global JOINT_AXIS
    JOINT_AXIS = {}
    for j in root.findall("joint"):
        ax = j.find("axis")
        if ax is not None:
            c = j.find("child").get("link"); JOINT_AXIS[j.get("name")] = W[c][:3, :3] @ np.array([float(x) for x in ax.get("xyz").split()])
    return links, jpos, W


def bones_from_wearer(jpos, head_top):
    w = {"hip_c": (0, 0, jpos["standing"][2]), "neck": tuple(jpos["neck_mount"]), "top": (0, 0, head_top)}
    for side in ("left", "right"):
        w[f"{side}_shoulder"] = tuple(jpos[f"{side}_shoulder"]); w[f"{side}_elbow"] = tuple(jpos[f"{side}_elbow"]); w[f"{side}_wrist"] = tuple(jpos[f"{side}_wrist"])
        w[f"{side}_hip"] = tuple(jpos[f"{side}_hip"]); w[f"{side}_knee"] = tuple(jpos[f"{side}_knee"]); w[f"{side}_ankle"] = tuple(jpos[f"{side}_ankle"])
        wr, el = np.array(w[f"{side}_wrist"]), np.array(w[f"{side}_elbow"])
        w[f"{side}_hand_end"] = tuple(wr + (wr - el) / np.linalg.norm(wr - el) * 170)
        a = np.array(w[f"{side}_ankle"]); w[f"{side}_toe"] = (a[0] + 190, a[1], 20.0)
    return {k: np.array(v, float) for k, v in w.items()}


# region: (bone a, bone b, link it rides on, girth radius for the partition in mm, material)
def regions():
    R = {"torso": ("hip_c", "neck", "pelvis", 165, "armour_red"), "head": ("neck", "top", "head", 105, "armour_red")}
    for s in ("left", "right"):
        R.update({f"{s}_upper_arm": (f"{s}_shoulder", f"{s}_elbow", f"{s}_upper_arm", 62, "armour_red"),
                  f"{s}_forearm": (f"{s}_elbow", f"{s}_wrist", f"{s}_forearm", 52, "armour_red"),
                  f"{s}_hand": (f"{s}_wrist", f"{s}_hand_end", f"{s}_hand", 45, "armour_red"),
                  f"{s}_thigh": (f"{s}_hip", f"{s}_knee", f"{s}_thigh", 82, "armour_red"),
                  f"{s}_shin": (f"{s}_knee", f"{s}_ankle", f"{s}_shin", 60, "armour_red"),
                  f"{s}_foot": (f"{s}_ankle", f"{s}_toe", f"{s}_foot", 55, "armour_red")})
    return R


# panels painted champagne gold (from the reference photo), boxes in sculpt units; mirrored for the right side
GOLD = {"torso": [((-400, 92, 1040), (400, 400, 1215))],
        "upper_arm": [((-400, -400, 1170), (400, 600, 1330))],
        "thigh": [((70, -400, 600), (400, 600, 800))],
        "forearm": [((-400, -400, 985), (400, 600, 1030))]}


# (joint, moving limb, swept range rad): parts of the parent's armour in the limb's way are cut back (armpit scoops, hip
# and knee reliefs), as an armourer trims a suit on the wearer
SWEEP = {"torso": [(f"{s}_{j}", f"{s}_{l}", lo, hi) for s in ("left", "right") for j, l, lo, hi in (("shoulder", "upper_arm", -1.02, 0.22), ("hip", "thigh", -1.02, 0.2))],
         "upper_arm": [("{s}_elbow", "{s}_forearm", -1.85, 0)], "thigh": [("{s}_knee", "{s}_shin", 0, 1.65)]}
PARENT_BODY = {"upper_arm": ("{s}_shoulder", "pelvis", -1.1, 0.3), "thigh": ("{s}_hip", "pelvis", -1.05, 0.2), "forearm": ("{s}_elbow", "{s}_upper_arm", -1.85, 0), "shin": ("{s}_knee", "{s}_thigh", 0, 1.65)}
RELIEF, CHILD_RELIEF, ARMOUR_CLEAR = GAP + T + 2, 8.0, 3.0
UNIFORM = ("head", "hand", "foot")                     # kept in proportion: a stretched helmet stops looking like the helmet
PELVIS_SLIM = 0.94                                     # wearer torso 0.94 of the reference build: 89 cm chest at 1.75 m
HINGE_HEAD = np.array([-5.0, 0.0, 185.0])              # faceplate pivot in the head frame: the centre of the crown's curve
EYE = ((5.0, 1.6, 139.7), (30, 5.8, 140.8))            # eye slots (mirrored), sculpt units
REACTOR = (0.0, 1367.0, 31.0)                          # arc reactor: y, z, radius (mm)
PALM = ((95.0, 420.0, 880.0), 25.0)                    # repulsor: centre (mirrored), radius (mm)
FACE_T, POD_R, CROWN_T = 2.0, 28.0, 9.0
import os as _os
OPENING = _os.environ.get("ARMOUR_OPEN", "1") == "1"
HELMET_Z = 1490.0                                      # lower edge of the helmet (mm)
FACE = ((3.0, -30, 125), (30, 30, 143.5))              # the faceplate, in sculpt units


def rotate_about(g, o, axis, ang):
    """points g rotated by ang about the line through o (Rodrigues)"""
    k = axis / np.linalg.norm(axis); x = g - o; c, sn = math.cos(ang), math.sin(ang)
    return o + x * c + np.cross(k, x) * sn + np.outer(x @ k, k) * (1 - c)


def box_sd(Q, lo, hi):
    """signed distance-like value of points to a box (negative inside)"""
    return np.maximum(np.asarray(lo) - Q, Q - np.asarray(hi)).max(1)


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def rot_between(u, v):
    u, v = u / np.linalg.norm(u), v / np.linalg.norm(v); c = float(u @ v); x = np.cross(u, v); s = np.linalg.norm(x)
    if s < 1e-9: return np.eye(3) if c > 0 else -np.eye(3)
    K = np.array([[0, -x[2], x[1]], [x[2], 0, -x[0]], [-x[1], x[0], 0]]) / s
    return np.eye(3) + K * s + K @ K * (1 - c)


def frame_of(fa, fb):
    uf = (fb - fa) / np.linalg.norm(fb - fa)
    h = np.array([1.0, 0, 0]) if abs(uf[0]) < 0.8 else np.array([0, 0, 1.0])
    e1 = h - (h @ uf) * uf; e1 /= np.linalg.norm(e1)
    return uf, e1, np.cross(uf, e1)


def mapping(fa, fb, wa, wb, radial):
    """sculpt -> wearer: along the bone by the bone-length ratio, across it by (depth, width) scales"""
    uf, e1, e2 = frame_of(fa, fb); R = rot_between(fb - fa, wb - wa); ax = np.linalg.norm(wb - wa) / np.linalg.norm(fb - fa)
    def M(P):
        q = P - fa
        return wa + (ax * np.outer(q @ uf, uf) + radial[0] * np.outer(q @ e1, e1) + radial[1] * np.outer(q @ e2, e2)) @ R.T
    return M


def unmapping(fa, fb, wa, wb, radial):
    uf, e1, e2 = frame_of(fa, fb); R = rot_between(fb - fa, wb - wa); ax = np.linalg.norm(wb - wa) / np.linalg.norm(fb - fa)
    def M(Q):
        x = (Q - wa) @ R
        return fa + np.outer(x @ uf, uf) / ax + np.outer(x @ e1, e1) / radial[0] + np.outer(x @ e2, e2) / radial[1]
    return M


def label_field(P, W, R, names, gs=1.0, sculpt=False):
    """normalised distance of every point to every region's bone: d / girth"""
    D = np.stack([seg_dist(P, W[R[n][0]], W[R[n][1]]) / (R[n][3] * gs) for n in names], axis=1)
    if sculpt and "head" in names:      # sculpt space: the helmet ends on a clean line at its lower edge, not at a bone's reach
        h = names.index("head"); up = ((P[:, 2] > HELMET_Z) & (np.hypot(P[:, 0] - 60.0, P[:, 1]) < 100)) | ((P[:, 2] > 1540) & (np.abs(P[:, 1]) < 170))
        D[up, h] = 0.0; D[~up, h] = 9.0
    return D


def sculpt_solid(P, faces, v=2.5):
    """Sealed solid of the sculpt: the surface is dilated so hairline cracks (up to 0.4 units) cannot leak, flood-filled from
    outside, and the solid eroded back. Returns the depth lookup (sculpt units, trilinear) and the inside test."""
    m = trimesh.Trimesh(P, faces, process=False); k = 2
    lo = m.bounds[0] - (k + 4) * v; shape = np.ceil((m.bounds[1] + (k + 4) * v - lo) / v).astype(int) + 1
    occ = binary_dilation(occupancy(m, lo, shape, v), iterations=k)
    lab, _ = nd_label(~occ); solid = binary_erosion(lab != lab[0, 0, 0], iterations=k); del lab, occ
    d = distance_transform_edt(solid).astype(np.float32); d -= distance_transform_edt(~solid).astype(np.float32); d *= v
    look = lambda q: map_coordinates(d, ((q - lo) / v).T, order=1, mode="constant", cval=-100.0)
    return look, (lambda q: look(q) > 0)


def fit_radial(depth_fig, a, b, Wa, Wb, wear, cap=1.45):
    """(depth, width) mm per sculpt unit that put the wearer's limb inside the sculpt with the padding gap. Uses one depth
    map of the closed sculpt, so stretching cannot disturb the measurement; each step widens only the direction the worst
    body points lie in."""
    ax = np.linalg.norm(Wb - Wa) / np.linalg.norm(b - a); r = np.array([ax, ax]); uf, e1, e2 = frame_of(a, b)
    u = (Wb - Wa) / np.linalg.norm(Wb - Wa); t = ((wear - Wa) @ u) / np.linalg.norm(Wb - Wa)
    pts = wear[(t > 0.12) & (t < 0.88)]
    if not len(pts): return r, 0.0
    need, bad = T + GAP * 0.7, np.zeros(1)
    for _ in range(70):
        q = unmapping(a, b, Wa, Wb, r)(pts)
        bad = depth_fig(q) * r.min() < need
        if bad.mean() < 0.06 or (r >= cap * ax).all(): break
        x = q[bad] - a
        i = 1 if np.abs(x @ e2).mean() * r[1] > np.abs(x @ e1).mean() * r[0] else 0
        if r[i] >= cap * ax: i = 1 - i
        r[i] *= 1.03
    return r, float(bad.mean())


def crop(P, faces, F, R, names, k):
    """faces of the sculpt in this region or next to it, decided in the sculpt's own space"""
    c = P[faces].mean(1); D = label_field(c, F, R, names, 1.0, True)
    return faces[D[:, k] <= D.min(1) * 1.12 + 0.05]


def occupancy(m, lo, shape, v):
    occ = np.zeros(shape, bool)
    n = int(min(m.area / (0.35 * v) ** 2, 3e7))
    for c0 in range(0, n, 2000000):
        pts = trimesh.sample.sample_surface(m, min(2000000, n - c0))[0]
        i = np.round((pts - lo) / v).astype(int); ok = ((i >= 0) & (i < shape)).all(1)
        occ[tuple(i[ok].T)] = True
    return occ


def depth_grid(Pw, all_faces, faces, v, inv, inside, depth):
    """Signed depth under the OUTER skin (mm, positive inside) on a grid round `faces`: the fine surface is sealed and
    flood-filled, and each region of the grid takes its side from the sealed sculpt, so hidden inner plates make no
    walls, cracks cannot leak and a crop cannot open the surface."""
    reg = Pw[np.unique(faces)]
    lo = reg.min(0) - 4 * v; shape = np.ceil((reg.max(0) + 4 * v - lo) / v).astype(int) + 1
    c = Pw[all_faces].mean(1); near = ((c > lo - 20) & (c < lo + shape * v + 20)).all(1)
    occ = binary_dilation(occupancy(trimesh.Trimesh(Pw, all_faces[near], process=False), lo, shape, v), iterations=1)
    lab, n = nd_label(~occ)
    rng = np.random.default_rng(1); sm = np.stack([rng.integers(0, shape[i], 400000) for i in range(3)], 1)
    ls = lab[tuple(sm.T)]; ins = inside(inv(lo + sm * v))
    tot = np.bincount(ls, minlength=n + 1); yes = np.bincount(ls, weights=ins, minlength=n + 1)
    isin = yes > 0.5 * np.maximum(tot, 1); isin[0] = False
    solid = isin[lab]
    ii = np.argwhere(occ)
    for c0 in range(0, len(ii), 1000000):
        j = ii[c0:c0 + 1000000]; solid[tuple(j.T)] = inside(inv(lo + j * v))
    d = (slab_edt(solid) - slab_edt(~solid)) * v
    d = gaussian_filter(d, 0.8)
    # right at the skin use the exact distance to the sculpt (no voxel terraces); the sealed solid still decides the sign
    ii = np.argwhere(np.abs(d) < 4 * v)
    d = np.where(d >= 4 * v, d - (v + 0.6), d).astype(np.float32)   # deep voxels: the same shift back to the true skin
    m = trimesh.Trimesh(Pw, all_faces[near], process=False)
    pts, fi = trimesh.sample.sample_surface(m, int(min(m.area / (0.4 * v) ** 2, 6e6)))
    tree = cKDTree(pts); nrm = m.face_normals[fi]
    for c0 in range(0, len(ii), 1000000):
        j = ii[c0:c0 + 1000000]; t = tuple(j.T); g = lo + j * v
        dist, k = tree.query(g, workers=4)
        dn = (-np.einsum("ij,ij->i", g - pts[k], nrm[k])).astype(np.float32)            # along the local normal: smooth, positive inside
        # the sculpt has hidden layers just under its skin: below the skin the nearest surface can be one of those, so depth
        # there is never less than the sealed solid says
        # (the sealed solid sits about a voxel outside the skin, so its depth is shifted back before the comparison: the
        # exact value keeps the crisp panel lines at the skin, the sealed value takes over below it)
        e = d[t]; d[t] = np.where(np.abs(dn - e) < 12.0, np.maximum(dn, e - v - 0.6), e - v)
    return median_filter(gaussian_filter(d, 0.45), size=3), lo, v   # the median closes one-voxel slits


def slab_edt(mask, slab=96, halo=40):
    """Distance transform in overlapping slabs along z: only depths near the skin matter, and a whole-body grid does not fit
    in memory. Distances beyond the halo are capped, which nothing downstream reads."""
    out = np.empty(mask.shape, np.float32)
    for z0 in range(0, mask.shape[2], slab):
        a, b = max(0, z0 - halo), min(mask.shape[2], z0 + slab + halo)
        out[:, :, z0:z0 + slab] = distance_transform_edt(mask[:, :, a:b]).astype(np.float32)[:, :, z0 - a:z0 - a + min(slab, mask.shape[2] - z0)]
    return out


def sample_grid(d, lo, v, pts):
    i = np.round((pts - lo) / v).astype(int); ok = ((i >= 0) & (i < d.shape)).all(1)
    out = np.full(len(pts), -1e3, np.float32); out[ok] = d[tuple(i[ok].T)]
    return out


def main():
    fig_path, urdf, out = sys.argv[1], sys.argv[2], sys.argv[3]
    voxel = float(sys.argv[sys.argv.index("--voxel") + 1]) if "--voxel" in sys.argv else 1.0
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    links, jpos, Wl = fk(urdf)
    import os
    base = os.path.dirname(os.path.abspath(urdf))
    # wearer bodies (world, mm)
    body = {}
    for n, L in links.items():
        if L["material"] == "wearer" and L["mesh"]:
            m = trimesh.load(os.path.join(base, L["mesh"].split("/", 3)[-1] if L["mesh"].startswith("package://") else L["mesh"]), force="mesh"); m.apply_scale(1000); m.apply_transform(_mm(L["world"])); body[n] = m
    body["pelvis"].vertices[:, :2] *= PELVIS_SLIM
    head_top = body["head"].bounds[1][2] + GAP + T
    W = bones_from_wearer(jpos, head_top)
    F = {k: np.array(v, float) for k, v in FIG.items()}
    fig = trimesh.load(fig_path, force="mesh")
    P = np.asarray(fig.vertices, float)
    R = regions(); names = list(R)
    pieces = []
    depth_fig, inside_fig = sculpt_solid(P, fig.faces)
    wear_pts = np.vstack([trimesh.sample.sample_surface_even(m, 6000, seed=1)[0] for m in body.values()])
    lab_w = np.argmin(label_field(wear_pts, W, R, names), axis=1)
    # children first: each parent is trimmed against the real armour that swings past it
    order = sorted(names, key=lambda n: next((i for i, k in enumerate(("forearm", "hand", "foot", "shin", "upper_arm", "thigh", "torso", "head")) if n.endswith(k)), 9))
    for name in order:
        if only and name not in only: continue
        a, b, link, girth, mat = R[name]
        t0 = time.time(); k = names.index(name)
        cr = crop(P, fig.faces, F, R, names, k)
        mine = trimesh.sample.sample_surface_even(body[link], 8000, seed=2)[0]
        kind = name.split("_", 1)[1] if name[:4] in ("left", "righ") else name
        radial = np.array([RADIAL, RADIAL]); rm = RADIAL; miss = 0.0
        if kind in UNIFORM: W[b] = W[a] + (W[b] - W[a]) / np.linalg.norm(W[b] - W[a]) * rm * np.linalg.norm(F[b] - F[a])
        Pw = mapping(F[a], F[b], W[a], W[b], radial)(P)
        inv = unmapping(F[a], F[b], W[a], W[b], radial)
        d, lo, v = depth_grid(Pw, fig.faces, cr, voxel, inv, inside_fig, depth_fig)
        field = np.full(d.shape, 5.0, np.float32); paint = np.full(d.shape, 5.0, np.float32); lens = np.full(d.shape, 5.0, np.float32)
        idx = np.argwhere((d > -3 * v) & (d < (CROWN_T if kind == "head" else T) + 3 * v))
        rest = np.full(d.shape, -50.0, np.float32)    # every constraint but the wall itself
        side = -1 if name.startswith("right") else 1
        ride = [body[link]] if link in body else []
        bs = [SDF(m.vertices, m.faces) for m in ride]
        sn = name.split("_")[0]
        sweeps = []
        for j, l, lo_, hi_ in SWEEP.get(kind, []):
            lk = l.format(s=sn); mine_arm = [p["mesh"] for p in pieces if p["link"] == lk]
            m_ = trimesh.util.concatenate(mine_arm) if mine_arm else body[lk]
            if mine_arm and lk.endswith("upper_arm"): m_ = m_.convex_hull   # the spiky shoulder cuts a jagged edge: its hull cuts one clean scoop
            sweeps.append((j.format(s=sn), SDF(m_.vertices, m_.faces), lo_, hi_, ARMOUR_CLEAR if mine_arm else RELIEF))
        pb = PARENT_BODY.get(kind); pbody = None
        if pb: pbody = (pb[0].format(s=sn), SDF(body[pb[1].format(s=sn)].vertices, body[pb[1].format(s=sn)].faces), pb[2], pb[3])
        for c0 in range(0, len(idx), 500000):        # in chunks: a full-body grid does not fit in memory at once
            ii = idx[c0:c0 + 500000]; g = lo + ii * v; dd = d[tuple(ii.T)]; t = tuple(ii.T)
            q = inv(g)
            D = label_field(q, F, R, names, 1.0, True)
            regf = (D[:, k] - np.delete(D, k, axis=1).min(1)) * girth + SEAM     # mm-ish, negative inside this region
            f = regf
            for sd in bs: f = np.maximum(f, BODY_CLEAR + sd(g))                 # never closer than BODY_CLEAR to the wearer (sdf > 0 inside the body)
            for jn, sd, lo_, hi_, rl in sweeps:                                 # the child armour's whole swing
                for ang in np.linspace(lo_, hi_, 25):       # fine steps: a 3 mm shell must not slip between two samples
                    if abs(ang) > 0.04: f = np.maximum(f, rl + sd(rotate_about(g, jpos[jn], JOINT_AXIS[jn], -ang)))
            if pbody:                                                           # and this piece's own swing against the body it hangs from
                jn, sd, lo_, hi_ = pbody
                for ang in np.linspace(lo_, hi_, 9): f = np.maximum(f, CHILD_RELIEF + sd(rotate_about(g, jpos[jn], JOINT_AXIS[jn], ang)))
            if kind == "foot": f = np.maximum(f, 1.0 - g[:, 2])                 # flat on the floor
            rest[t] = f
            field[t] = np.maximum(f, np.maximum(-dd, dd - T))
            qs = q * np.array([1, side, 1])
            if kind == "torso": qs[:, 1] = np.abs(qs[:, 1])              # torso panels on both sides
            pf = np.full(len(g), 5.0, np.float32)
            for blo, bhi in GOLD.get(kind, []): pf = np.minimum(pf, box_sd(qs, blo, bhi) * rm)
            if kind == "head": pf = np.minimum(pf, box_sd(q, *FACE) * rm)
            paint[t] = pf
            lf = np.full(len(g), 5.0, np.float32); qa = q * np.array([1, 1, 1]); ya = np.abs(q[:, 1])
            if kind == "head": lf = box_sd(np.c_[q[:, 0], ya, q[:, 2]], *EYE) * rm
            if kind == "torso": lf = np.maximum(np.hypot(q[:, 1], q[:, 2] - REACTOR[1]) - REACTOR[2], 60 - q[:, 0]) * rm
            if kind == "hand": lf = np.maximum(np.linalg.norm(qs - np.array(PALM[0]), axis=1) - PALM[1], -5) * rm
            lens[t] = lf
        # cut lines rounded: relief edges follow a smooth curve instead of the jagged outline of what swings past
        w = (rest > -49).astype(np.float32)
        den = gaussian_filter(w, 1.6)
        rest2 = gaussian_filter(np.where(rest > -49, np.clip(rest, -12, 12), 0).astype(np.float32), 1.6) / np.maximum(den, 1e-3)
        field = np.where(rest > -49, np.maximum(rest2, np.maximum(-d, d - T)), field).astype(np.float32)
        del rest2, den, w
        if kind == "head":
            # a light faceplate (two small servos lift it), and round openings where the ear pods pass through the shell
            field = np.where(paint < 0, np.maximum(field, d - FACE_T), field)
            hx = jpos["neck_mount"] + HINGE_HEAD; xs = (lo[0] + np.arange(d.shape[0]) * v)[:, None, None]; zs = (lo[2] + np.arange(d.shape[2]) * v)[None, None, :]
            ys = np.abs(lo[1] + np.arange(d.shape[1]) * v)[None, :, None]
            field = np.where(ys > 60, np.maximum(field, POD_R + 0.5 - np.hypot(xs - hx[0], zs - hx[2])), field).astype(np.float32)
            # the faceplate swings up over the forehead: the cranium is recessed wherever it passes
            ff = np.pad(np.maximum(field, paint + SEAM), 1, constant_values=5.0)
            vv, tt, _, _ = marching_cubes(ff, 0.0, spacing=(v,) * 3)
            fp = trimesh.Trimesh(vv + lo - v, tt[:, ::-1], process=True); fps = SDF(fp.vertices, fp.faces)
            hinge, hax = jpos["neck_mount"] + HINGE_HEAD, np.array([0.0, 1.0, 0.0])
            ii = np.argwhere((d > -2 * v) & (d < CROWN_T + 2 * v)); g = lo + ii * v; t = tuple(ii.T); red = paint[t] > 0
            sw = np.full(len(g), -1e3, np.float32)
            for ang in np.linspace(-1.0, 0, 13): sw = np.maximum(sw, fps(rotate_about(g, hinge, hax, -ang)))
            # where it passes the cranium is thickened inwards first, so the recess has a floor instead of a hole
            dd = d[t]; thick = np.maximum(np.maximum(-dd, dd - CROWN_T), rest[t])
            f = np.where(red & (sw > -14), thick, field[t])
            field[t] = np.where(red, np.maximum(f, 1.0 + sw), f)
        # print split: bed-sized cells with seams; each cell splits again into red and gold panels
        ext = (np.array(d.shape) - 1) * v
        nc = [max(1, math.ceil(e / c)) for e, c in zip(ext, (260, 260, 260) if kind == "head" else (205, 215, 245))]
        edges = [lo[i] + np.linspace(0, ext[i], nc[i] + 1) for i in range(3)]
        X = [lo[i] + np.arange(d.shape[i]) * v for i in range(3)]
        got = 0
        def emit(ff, o, col):
            nonlocal got
            if ff.min() >= 0: return
            # nothing thinner than two voxels survives: feathered edges and slivers cannot be printed
            keep = binary_opening(ff < 0, structure=np.ones((2, 2, 2), bool)) if col != "lens_glow" and OPENING else ff < 0
            if OPENING: ff = np.where(keep, ff, np.maximum(ff, 0.6)).astype(np.float32)
            if ff.min() >= 0: return
            verts, faces, _, _ = marching_cubes(np.pad(ff, 1, constant_values=5.0), 0.0137, spacing=(v,) * 3)   # off zero: exact zeros make non-manifold vertices
            mesh = trimesh.Trimesh(verts + o - v, faces[:, ::-1], process=True)
            for comp in mesh.split(only_watertight=False):
                if not comp.is_watertight:
                    trimesh.repair.fill_holes(comp)
                    if not comp.is_watertight:
                        if comp.area > 3000: print("  lost a piece of", name, round(comp.area), flush=True)
                        continue
                if comp.volume < 0: comp.invert()
                if comp.volume < (150 if col == "lens_glow" else 3000): continue   # specks: under 3 cm^3 is not worth a print
                comp = trimesh.smoothing.filter_taubin(comp, lamb=0.5, nu=0.52, iterations=12)
                got += 1
                face = kind == "head" and col != "armour_red"
                pieces.append({"name": f"{'faceplate' if face else name}_{got}", "link": "helmet_faceplate" if face else link, "material": col, "region": name, "mesh": comp})
        for ci in range(nc[0]):
            for cj in range(nc[1]):
                for ck in range(nc[2]):
                    sl = []
                    for i, c in zip(range(3), (ci, cj, ck)):
                        a0 = max(0, int(np.searchsorted(X[i], edges[i][c])) - 3); a1 = min(d.shape[i], int(np.searchsorted(X[i], edges[i][c + 1])) + 4)
                        sl.append(slice(a0, a1))
                    sl = tuple(sl); f0 = field[sl]
                    if f0.min() >= 0: continue
                    gx = np.meshgrid(*[X[i][sl[i]] for i in range(3)], indexing="ij", sparse=True)
                    cell = np.full(f0.shape, -1e3, np.float32)
                    for i, c in zip(range(3), (ci, cj, ck)):
                        if c > 0: cell = np.maximum(cell, edges[i][c] + SEAM - gx[i])
                        if c < nc[i] - 1: cell = np.maximum(cell, gx[i] - (edges[i][c + 1] - SEAM))
                    base = np.maximum(f0, cell); pp = paint[sl]; ln = lens[sl]
                    for col, pf in (("armour_red", np.maximum(-pp, -ln) + SEAM), ("armour_gold", np.maximum(pp, -ln) + SEAM), ("lens_glow", ln + 0.2)):
                        if kind == "head" and col != "armour_red": continue       # the faceplate and lenses stay whole
                        emit(np.maximum(base, pf), np.array([X[i][sl[i].start] for i in range(3)]), col)
        if kind == "head":
            emit(np.maximum(np.maximum(field, paint + 0 * lens), np.maximum(paint, -lens) + SEAM), lo, "armour_gold")
            emit(np.maximum(field, lens + 0.2), lo, "lens_glow")
        print(f"{name}: depth/width {radial[0]:.1f}/{radial[1]:.1f}, body not covered {miss:.1%}, axial {np.linalg.norm(W[b] - W[a]) / np.linalg.norm(F[b] - F[a]):.2f}, {got} pieces, {time.time() - t0:.0f}s", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    for p in pieces: p["mesh"].export(out.replace(".json", f"_{p['name']}.stl"))
    json.dump([{k: v for k, v in p.items() if k != "mesh"} for p in pieces], open(out, "w"), indent=1)


def _mm(M):
    X = M.copy(); X[:3, 3] *= 1000; return X


if __name__ == "__main__":
    main()
