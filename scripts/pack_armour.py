"""Pack the pieces made by armour_from_reference.py for the designer, measuring how far each joint really moves.

    .venv/bin/python -B scripts/pack_armour.py <pack.json> <wearer.urdf> packages/parts/data/mark43_pack
"""
import json, math, os, struct, sys
import numpy as np, trimesh
import manifold3d as m3
from scipy.ndimage import label as nd_label
from pysdf import SDF
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import armour_from_reference as A

JOINTS = {"shoulder": ("upper_arm", "pelvis", -2.6, 0.6), "elbow": ("forearm", "upper_arm", -2.4, 0), "hip": ("thigh", "pelvis", -1.9, 0.4), "knee": ("shin", "thigh", 0, 2.2)}


# The helmet is a dedicated full-size model (Iron Man wearable helmet Mark 42, by Manifold3D, Printables 449081, CC BY-SA),
# printed in four parts laid out apart: translation, then a half turn about z for the parts that face the other way.
HELMET_DIR = os.path.expanduser("~/ironman_refs/mk42_helmet_ccbysa")
HELMET = {"back": ([14.5, -229, -284], True, "head", "armour_red"), "top": ([26, -68, -418], False, "head", "armour_red"),
          "faceplate": ([88, -389.5, 12], False, "helmet_faceplate", "armour_gold"), "chin": ([232, -4.5, -32], True, "head", "armour_gold")}
HELMET_AT, HELMET_SCALE = np.array([14.0, 0.0, 8.0]), 1.03   # placed in the head frame, forward so the face sits behind the mask; every part still fits the bed
HEAD_CLEAR = 6.0                                # room round the head (padding)
POD_R, COLLIDE = 28.0, 400.0
HINGE = np.array([-20.0, 0.0, 110.0])          # head frame: at the ear


def decimate(m, tol=0.3):
    """fewer triangles with the surface kept within tol mm and always closed (manifold's simplifier cannot open a mesh)"""
    return from_manifold(as_manifold(m).simplify(tol))


def as_manifold(m):
    return m3.Manifold(m3.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))


def from_manifold(x):
    g = x.to_mesh(); return trimesh.Trimesh(np.asarray(g.vert_properties)[:, :3], np.asarray(g.tri_verts), process=False)


def eye_lenses(face):
    """A translucent plate behind each eye slit: the slit found by casting rays through the faceplate from the front."""
    ys, zs = np.arange(-95, 96, 1.5), np.arange(face.bounds[0][2], face.bounds[1][2], 1.5)
    Y, Z = np.meshgrid(ys, zs, indexing="ij"); o = np.c_[np.full(Y.size, face.bounds[1][0] + 20), Y.ravel(), Z.ravel()]
    hit = face.ray.intersects_any(o, np.tile([-1.0, 0, 0], (len(o), 1))).reshape(Y.shape)
    lab, n = nd_label(~hit); out = []
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    for k in range(1, n + 1):
        if k in edge: continue
        ii = np.argwhere(lab == k)
        if len(ii) < 40: continue
        yy, zz = ys[ii[:, 0]], zs[ii[:, 1]]
        frac = (zz.mean() - face.bounds[0][2]) / face.extents[2]
        print("  slit", len(ii), round(yy.mean()), round(frac, 2), flush=True)
        if abs(yy.mean()) < 15 or not (0.35 < frac < 0.85) or np.ptp(yy) < 25: continue
        # the slit's rim on the shell: depth of the surface round the opening
        near = face.vertices[(np.abs(face.vertices[:, 1] - yy.mean()) < np.ptp(yy) / 2 + 6) & (np.abs(face.vertices[:, 2] - zz.mean()) < np.ptp(zz) / 2 + 6)]
        x = float(np.percentile(near[:, 0], 30)) - 3
        rim = np.c_[np.full(len(ii), x), yy, zz]
        out.append(trimesh.convex.convex_hull(np.vstack([rim, rim + [2.0, 0, 0]])))
    return out


def inflated(m, by):
    """a body grown by about `by` mm on every side (scaled about its own centre)"""
    c = m.bounds.mean(0); q = m.copy(); q.apply_translation(-c); q.apply_scale((m.extents + 2 * by) / m.extents); q.apply_translation(c); return q


def helmet(neck, head):
    parts = {}
    for n, (t, turn, link, mat) in HELMET.items():
        m = trimesh.load(f"{HELMET_DIR}/{n}.stl", force="mesh"); m.apply_translation(t)
        if turn: m.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 0, 1]))
        m.apply_scale(HELMET_SCALE); m.apply_translation(HELMET_AT); parts[n] = decimate(m, 0.2)
    # the model's parts are solid (they print with light infill): the head gets a cavity with padding room
    cav = as_manifold(inflated(trimesh.Trimesh(head.vertices - neck, head.faces, process=False), HEAD_CLEAR))
    for k in ("top", "back", "chin"): parts[k] = from_manifold(as_manifold(parts[k]) - cav)   # (never the mask: it is the face of the suit)
    face = parts["faceplate"]
    # the pivot that brings the faceplate through the least of the crown: tried on a grid, the rest then relieved by hand-style cuts
    fm = as_manifold(face); fixed = {k: as_manifold(parts[k]) for k in ("top", "back")}
    def swung(q, h, ang):
        c, sn = math.cos(ang), math.sin(ang)
        R = [[c, 0, sn, h[0] - c * h[0] - sn * h[2]], [0, 1, 0, 0], [-sn, 0, c, h[2] + sn * h[0] - c * h[2]]]
        return q.transform(R)
    best, h = 1e18, None
    for hx in np.arange(-70, 31, 20):
        for hz in np.arange(60, 201, 20):
            hh = np.array([hx, 0.0, hz]); v = sum((swung(fm, hh, a) ^ fixed[k]).volume() for a in (-0.25, -0.55, -0.85) for k in fixed)
            if v < best: best, h = v, hh
    print("hinge", h, "collision", round(best), "mm3", flush=True)
    fa = -1.0
    for k in fixed:
        x = fixed[k]; v0 = x.volume()
        for ang in np.linspace(-0.14, -1.0, 14): x = x - swung(fm, h, ang)
        parts[k] = from_manifold(x); print("relief", k, round(v0 - x.volume()), "mm3 of", round(v0), flush=True)
    cyl = trimesh.creation.cylinder(radius=POD_R + 0.5, height=70, sections=48)
    for s_ in (1, -1):
        c = cyl.copy(); c.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0])); c.apply_translation([h[0], s_ * 125, h[2]])
        # the servo body hangs below the pivot: a window for it and its cradle (MG996R case, 2.2 mm walls, clearance)
        w = trimesh.creation.box(extents=[46, 80, 66]); w.apply_translation([h[0], s_ * 120, h[2] - 11])
        for k in ("back", "top"): parts[k] = from_manifold(as_manifold(parts[k]) - as_manifold(c) - as_manifold(w))
    out = []
    for n, (t, turn, link, mat) in HELMET.items():
        m = parts[n]; m.apply_translation(neck)
        bodies = sorted((b for b in as_manifold(m).decompose() if b.volume() > 2000), key=lambda b: -b.volume())
        for i, b in enumerate(bodies):
            out.append(({"name": f"helmet_{n}" + (f"_{i + 1}" if i else ""), "link": link, "material": mat, "region": "head"}, from_manifold(b)))
    for i, l in enumerate(eye_lenses(face)):
        out.append(({"name": f"eye_lens_{i + 1}", "link": "helmet_faceplate", "material": "lens_glow", "region": "head"}, l))
    return out, h, fa


RANK = ("head", "torso", "upper_arm", "thigh", "forearm", "shin", "foot", "hand")


def resolve(pieces, body):
    """Nothing intersects at rest: every piece is trimmed against the wearer and against every piece ranked above it."""
    rank = lambda p: next((i for i, k in enumerate(RANK) if p["region"].endswith(k)), 9)
    lens_first = sorted(pieces, key=lambda x: (rank(x[0]), x[0]["material"] != "lens_glow"))
    bodies = [(b.bounds, as_manifold(b)) for b in body.values()]
    hit = lambda A_, B_: (A_[0] < B_[1]).all() and (B_[0] < A_[1]).all()
    done = []
    for p, m in lens_first:
        x = as_manifold(m); bb = m.bounds
        for bo, b in bodies:
            if hit(bb, bo): x = x - b
        for bo, q in [(e[2], e[3]) for e in done]:
            if hit(bb, bo): x = x - q
        keep = 150 if p["material"] == "lens_glow" else 2000
        for i, c in enumerate(sorted((c for c in x.decompose() if c.volume() > keep), key=lambda c: -c.volume())):
            t = from_manifold(c); pp = {**p, "name": p["name"] + ("" if not i else f"p{i}")}
            done.append((pp, t, t.bounds, c))
    print("resolved", len(pieces), "->", len(done), "pieces", flush=True)
    return [(e[0], e[1]) for e in done]


def main():
    src, urdf, out = sys.argv[1:4]
    meta = json.load(open(src)); base = src.replace(".json", "")
    links, jpos, _ = A.fk(urdf)
    pcs = []
    for p in meta:
        m = trimesh.load(f"{base}_{p['name']}.stl", force="mesh", process=True)
        if not m.is_watertight: print("not closed, dropped:", p["name"]); continue
        if m.volume < 0: m.invert()
        # one printed part is one solid: bodies that only touch become their own pieces, crumbs are dropped
        bodies = [b for b in as_manifold(m).simplify(0.3).decompose() if b.volume() > (150 if p["material"] == "lens_glow" else 3000)]
        for i, b in enumerate(sorted(bodies, key=lambda x: -x.volume())):
            pcs.append(({**p, "name": p["name"] + ("" if not i else f"b{i}")}, from_manifold(b)))
    pcs = [(p, m) for p, m in pcs if p["region"] != "head"]
    base = os.path.dirname(os.path.abspath(urdf)); body = {}
    for n, L in links.items():
        if L["material"] == "wearer" and L["mesh"]:
            b = trimesh.load(os.path.join(base, L["mesh"].split("/", 3)[-1]), force="mesh"); b.apply_scale(1000); b.apply_transform(A._mm(L["world"]))
            if n == "pelvis": b.vertices[:, :2] *= A.PELVIS_SLIM
            body[n] = b
    hp, hinge, fa = helmet(jpos["neck_mount"], body["head"])
    pcs = resolve(hp + pcs, body)
    by = lambda link: [m for p, m in pcs if p["link"] == link]
    limits = {}
    for side in ("left", "right"):
        for j, (child, parent, lo, hi) in JOINTS.items():
            jn = f"{side}_{j}"; cl = f"{side}_{child}"; pl = parent if parent == "pelvis" else f"{side}_{parent}"
            if not by(cl) or not by(pl): limits[jn] = [lo, hi]; continue
            # exact: the child's armour turned about the joint, intersected with the parent's armour. Moving stops when the
            # overlap grows by more than COLLIDE mm^3 over the rest pose (a real contact, not two pieces meeting at a seam)
            cm = m3.Manifold.compose([as_manifold(m) for m in by(cl)]); pm = m3.Manifold.compose([as_manifold(m) for m in by(pl)])
            o, k = jpos[jn], A.JOINT_AXIS[jn] / np.linalg.norm(A.JOINT_AXIS[jn])
            K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
            def turned(ang):
                Rm = np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
                return cm.transform(np.c_[Rm, o - Rm @ o].tolist())
            base = (cm ^ pm).volume(); r = []
            for lim in (lo, hi):
                a, step = 0.0, 0.1 * (1 if lim > 0 else -1)
                while abs(a + step) <= abs(lim) + 1e-9 and lim != 0:
                    if (turned(a + step) ^ pm).volume() - base > COLLIDE: break
                    a += step
                r.append(round(a, 3))
            limits[jn] = r; print(jn, r, flush=True)
    limits["faceplate"] = [round(fa, 3), 0]
    # STL has no vertex ids: two sheets meeting at one point would weld into a non-manifold edge, so they are parted slightly
    healed = []
    for p, m in pcs:
        v = np.asarray(m.vertices, float).copy(); nrm = m.vertex_normals
        for _ in range(8):
            lo = v.min(0); step = np.maximum((v.max(0) - lo) / 65535, 1e-6)      # the exact values the pack will store
            key = np.round((v - lo) / step).astype(np.int64); _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
            dup = cnt[inv.ravel()] > 1
            if not dup.any(): break
            v[dup] += nrm[dup] * 0.03 + np.random.default_rng(1).normal(0, 0.012, (int(dup.sum()), 3))
        healed.append((p, trimesh.Trimesh(v, m.faces, process=False)))
    pcs = healed
    blob = bytearray(); rows = []
    for p, m in pcs:
        v = np.asarray(m.vertices); f = np.asarray(m.faces)
        if len(v) > 65535: print("too many vertices, dropped:", p["name"]); continue
        lo = v.min(0); step = np.maximum((v.max(0) - lo) / 65535, 1e-6)
        q = np.round((v - lo) / step).astype("<u2"); ov = len(blob); blob += q.tobytes(); of = len(blob); blob += f.astype("<u2").tobytes()
        rows.append({"name": p["name"], "link": p["link"], "material": p["material"], "region": p["region"], "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(v), "nf": len(f), "ov": ov, "of": of,
                     "volume_mm3": round(float(m.volume), 1), "centroid": m.centroid.round(2).tolist()})
    man = {"source": 'body: "Iron man armored suit" by octv h (Printables 1524711, CC0, provenance unverified); helmet: Iron Man wearable helmet Mark 42 by Manifold3D (Printables 449081, CC BY-SA)', "wearer_height_m": 1.75, "pieces": rows, "limits": limits, "hinge": [float(hinge[0]), float(hinge[2])],
           "face_rear_x": float(min(m.bounds[0][0] for p, m in pcs if p["link"] == "helmet_faceplate") - jpos["neck_mount"][0]),
           "notes": ["shells made by scripts/armour_from_reference.py", "joint limits measured by sweeping each limb's armour against its parent's armour"]}
    json.dump(man, open(out + ".json", "w"), separators=(",", ":")); open(out + ".bin", "wb").write(blob)
    print(len(rows), "pieces", sum(r["nf"] for r in rows), "faces", len(blob) // 1000000, "MB")


if __name__ == "__main__":
    main()
