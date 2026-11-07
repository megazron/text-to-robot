"""Pack the pieces made by forge_mark43.py for the designer: adds the working helmet, trims every overlap, measures how far each
joint really moves.

    .venv/bin/python -B scripts/pack_armour.py <forge-print-dir>/pack.json packages/parts/data/mark43_pack
"""
import json, math, os, struct, sys
import numpy as np, trimesh
import manifold3d as m3
from scipy.ndimage import label as nd_label, binary_closing, binary_fill_holes, distance_transform_edt, gaussian_filter
from skimage.measure import marching_cubes
from pysdf import SDF
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge_mark43 as FORGE

JOINTS = {"shoulder": ("upper_arm", "pelvis", -2.6, 0.6), "elbow": ("forearm", "upper_arm", -2.4, 0), "hip": ("thigh", "pelvis", -1.9, 0.4), "knee": ("shin", "thigh", 0, 2.2)}


# The helmet is a dedicated full-size model (Iron Man wearable helmet Mark 42, by Manifold3D, Printables 449081, CC BY-SA),
# printed in four parts laid out apart: translation, then a half turn about z for the parts that face the other way.
HELMET_AT, HELMET_SCALE = np.array([-46.0, 0.0, -12.0]), 1.2   # measured on the wearer: the smallest helmet that closes round a real skull and nose (244 mm wide)
BACK_TILT = math.radians(14.0)                  # the part is modelled as it lies on the print bed: worn, its rear lifts to the crown and the jaw line falls to the chin
MESH_TOL = 0.2
WALL, SEAM_H = 3.0, 0.3                         # helmet wall; half a seam (mm)
HEAD_CLEAR = 6.0                                # room round the head (padding)
POD_R, COLLIDE = 28.0, 400.0
HINGE = np.array([FORGE.EAR[0], 0.0, FORGE.EAR[1] - 1580.0])   # from the neck: the mask's pivot, in the ear
NECK_TURN = 0.8                                 # rad each way the collar leaves the helmet room to turn


def decimate(m, tol=0.3):
    """fewer triangles with the surface kept within tol mm and always closed (manifold's simplifier cannot open a mesh)"""
    return from_manifold(as_manifold(m).simplify(tol))


def as_manifold(m):
    return m3.Manifold(m3.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))


def from_manifold(x):
    g = x.to_mesh(); return trimesh.Trimesh(np.asarray(g.vert_properties)[:, :3], np.asarray(g.tri_verts), process=False)


def working_helmet(pcs, neck, hinge):
    """The mask swings about the ear with everything ahead of its seam: gold panels, forehead wedge and front crown. Its crown is forged
    to slide under the fixed shell (forge_mark43.helmet_zones), so what is left to relieve here is the small rest round its edges."""
    h = np.array(neck, float) + hinge
    plate = m3.Manifold.compose([as_manifold(m) for p, m in pcs if p["link"] == "helmet_faceplate"])
    turned = []
    for ang in np.linspace(-0.04, -FORGE.MASK_OPEN, 32):
        c, sn = math.cos(ang), math.sin(ang); R = np.array([[c, 0, sn], [0, 1, 0], [-sn, 0, c]]); turned.append(plate.transform(np.c_[R, h - R @ h].tolist()))
    sweep = m3.Manifold.batch_boolean(turned, m3.OpType.Add); out = []; lost = 0.0
    for p, m in pcs:
        if p["link"] != "head": out.append((p, m)); continue
        v0 = m.volume; x = as_manifold(m) - sweep; lost += v0 - x.volume()
        for i, c_ in enumerate(sorted((c_ for c_ in x.decompose() if c_.volume() > 500), key=lambda c_: -c_.volume())):
            out.append(({**p, "name": p["name"] + ("" if not i else f"r{i}")}, from_manifold(c_)))
    print("helmet relief", round(lost), "mm3", flush=True)
    return out


RANK = ("head", "torso", "upper_arm", "thigh", "forearm", "shin", "foot", "hand")


# (joint, child link, parent link, lowest, highest rad): each joint's required range
SWINGS = [("shoulder", "upper_arm", "pelvis", -1.04, 0.24), ("hip", "thigh", "pelvis", -1.04, 0.24), ("elbow", "forearm", "upper_arm", -1.95, 0.0), ("knee", "shin", "thigh", 0.0, 1.75)]


def trim_neck(pcs, jpos):
    """The collar's front lip stands inside the helmet's chin: it gives way to the helmet turned as far as NECK_TURN each way. The helmet stays whole."""
    o = np.array(jpos["neck_mount"], float); helmet = m3.Manifold.compose([as_manifold(m) for p, m in pcs if p["link"] in ("head", "helmet_faceplate")]).simplify(0.4); turned = []
    for a in np.linspace(-NECK_TURN, NECK_TURN, int(2 * NECK_TURN / 0.04) + 1):
        c, s_ = math.cos(a), math.sin(a); R = np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.0]]); turned.append(helmet.transform(np.c_[R, o - R @ o].tolist()))
    sweep = m3.Manifold.batch_boolean(turned, m3.OpType.Add); out = []; lost = 0.0
    for p, m in pcs:
        if p["region"] != "torso" or p["material"] == "lens_glow" or m.bounds[1][2] < 1500: out.append((p, m)); continue
        x = as_manifold(m) - sweep; lost += m.volume - x.volume()
        out += [({**p, "name": p["name"] + ("" if not i else f"n{i}")}, from_manifold(c_)) for i, c_ in enumerate(sorted((c_ for c_ in x.decompose() if c_.volume() > 500), key=lambda c_: -c_.volume()))]
    print("collar relief", round(lost), "mm3", flush=True)
    return out


def trim_swings(pcs, jpos):
    """Armour is cut where it moves: each limb piece near a joint loses whatever the part it hangs from would run into across the
    joint's whole range. The parent stays whole, so the chest and hips keep their panels."""
    for side in ("left", "right"):
        for j, child, parent, lo, hi in SWINGS:
            o = jpos[f"{side}_{j}"]; cl = f"{side}_{child}"; pl = parent if parent == "pelvis" else f"{side}_{parent}"
            near = lambda m: (m.bounds[0] - 300 < o).all() and (m.bounds[1] + 300 > o).all()
            par = m3.Manifold.compose([as_manifold(m) for p, m in pcs if p["link"] == pl and p["material"] not in ("armour_mech", "lens_glow") and near(m)]).simplify(0.4)
            turned = []
            for ang in np.linspace(lo, hi, max(12, int((hi - lo) / 0.03))):
                c, sn = math.cos(-ang), math.sin(-ang); R = np.array([[c, 0, sn], [0, 1, 0], [-sn, 0, c]])
                turned.append(par.transform(np.c_[R, o - R @ o].tolist()))
            sweep = m3.Manifold.batch_boolean(turned, m3.OpType.Add)
            out = []
            for p, m in pcs:
                if p["link"] != cl or p["material"] in ("armour_mech", "lens_glow") or not near(m): out.append((p, m)); continue
                x = as_manifold(m) - sweep
                for i, c_ in enumerate(sorted((c_ for c_ in x.decompose() if c_.volume() > 500), key=lambda c_: -c_.volume())):
                    out.append(({**p, "name": p["name"] + ("" if not i else f"w{i}")}, from_manifold(c_)))
            pcs = out; print("trimmed", side, j, flush=True)
    return pcs


def resolve(pieces, body):
    """Nothing intersects at rest: every piece is trimmed against the wearer and against every piece ranked above it."""
    rank = lambda p: next((i for i, k in enumerate(RANK) if p["region"].endswith(k)), 9)
    lens_first = sorted(pieces, key=lambda x: (rank(x[0]), x[0]["material"] != "lens_glow"))
    # the shipped wearer is simplified: armour is cleared against that surface as well as the true one
    bodies = [(b.bounds + np.array([[-2.0] * 3, [2.0] * 3]), as_manifold(b) + as_manifold(b).simplify(1.0)) for b in body.values()]
    hit = lambda A_, B_: (A_[0] < B_[1]).all() and (B_[0] < A_[1]).all()
    done = []
    for p, m in lens_first:
        x = as_manifold(m); bb = m.bounds
        for bo, b in bodies:
            if hit(bb, bo): x = x - b
        for bo, q in [(e[2], e[3]) for e in done]:
            if hit(bb, bo): x = x - q
        keep = 150 if p["material"] == "lens_glow" else 500
        for i, c in enumerate(sorted((c for c in x.decompose() if c.volume() > keep), key=lambda c: -c.volume())):
            t = from_manifold(c); pp = {**p, "name": p["name"] + ("" if not i else f"p{i}")}
            done.append((pp, t, t.bounds, c))
    print("resolved", len(pieces), "->", len(done), "pieces", flush=True)
    return [(e[0], e[1]) for e in done]


def main():
    src, out = sys.argv[1:3]
    meta = json.load(open(src)); base = src.replace(".json", ""); J = FORGE.J
    jpos = {"standing": J["hip_c"], "neck_mount": J["neck"]}
    for sd, n in ((1, "left"), (-1, "right")):
        for k in ("shoulder", "elbow", "wrist", "hip", "knee", "ankle"): jpos[f"{n}_{k}"] = J[k] * [1, sd, 1]
    joints = jpos; body = {}
    pcs = []
    for p in meta:
        m = trimesh.load(f"{base}_{p['name']}.stl", force="mesh", process=True)
        # two bodies touching along one edge are not a closed solid until they are taken apart; a panel must never vanish quietly
        for k, sub in enumerate([m] if m.is_watertight else m.split(only_watertight=False)):
            if not sub.is_watertight: trimesh.repair.fill_holes(sub)
            if not sub.is_watertight:
                if sub.area > 300: raise SystemExit(f"open shell in {p['name']} ({sub.area:.0f} mm2)")
                continue
            if sub.volume < 0: sub.invert()
            # one printed part is one solid: bodies that only touch become their own pieces, crumbs are dropped
            bodies = [b for b in as_manifold(sub).simplify(0.2).decompose() if b.volume() > (150 if p["material"] == "lens_glow" else 500)]
            for i, b in enumerate(sorted(bodies, key=lambda x: -x.volume())):
                pcs.append(({**p, "name": p["name"] + ("" if not k else f"k{k}") + ("" if not i else f"b{i}")}, from_manifold(b)))
    hinge = HINGE; fa = -FORGE.MASK_OPEN
    pcs = trim_swings(trim_neck(working_helmet(resolve(pcs, body), jpos["neck_mount"], hinge), jpos), jpos)
    # the shells are far denser than a printer needs: flat panels lose their triangles, edges stay (0.2 mm is under one layer)
    pcs = [(p, from_manifold(as_manifold(m).simplify(MESH_TOL))) for p, m in pcs]
    # simplifying moves surfaces a little: the joint sleeves give way to the armour once more
    hard = [(m.bounds, as_manifold(m)) for p, m in pcs if p["material"] != "armour_mech"]; soft = []
    for p, m in pcs:
        if p["material"] != "armour_mech": soft.append((p, m)); continue
        x = as_manifold(m); bb = m.bounds
        for bo, q in hard:
            if (bb[0] < bo[1]).all() and (bo[0] < bb[1]).all(): x = x - q
        for i, c_ in enumerate(sorted((c_ for c_ in x.decompose() if c_.volume() > 500), key=lambda c_: -c_.volume())):
            soft.append(({**p, "name": p["name"] + ("" if not i else f"m{i}")}, from_manifold(c_)))
    pcs = soft
    by = lambda link: [m for p, m in pcs if p["link"] == link and p["material"] != "armour_mech"]
    limits = {}
    for side in ("left", "right"):
        for j, (child, parent, lo, hi) in JOINTS.items():
            jn = f"{side}_{j}"; cl = f"{side}_{child}"; pl = parent if parent == "pelvis" else f"{side}_{parent}"
            if not by(cl) or not by(pl): limits[jn] = [lo, hi]; continue
            # exact: the child's armour turned about the joint, intersected with the parent's armour. Moving stops when the
            # overlap grows by more than COLLIDE mm^3 over the rest pose (a real contact, not two pieces meeting at a seam)
            cm = m3.Manifold.compose([as_manifold(m) for m in by(cl)]); pm = m3.Manifold.compose([as_manifold(m) for m in by(pl)])
            o, k = jpos[jn], np.array([0.0, 1.0, 0.0])
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
    # the wearer ships too, lightly reduced: he is drawn inside the suit and checked against it
    for n, b in body.items():
        pcs.append(({"name": f"wearer_{n}", "link": n, "material": "wearer", "region": "wearer"}, from_manifold(as_manifold(b).simplify(1.0))))
    healed = []
    for p, m in pcs:
        v = np.asarray(m.vertices, float).copy(); nrm = m.vertex_normals
        for _ in range(8):
            lo = v.min(0); step = np.maximum((v.max(0) - lo) / 65535, 1e-6)      # the exact values the pack will store
            key = np.round((v - lo) / step).astype(np.int64); _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
            dup = cnt[inv.ravel()] > 1
            if not dup.any(): break
            v[dup] += nrm[dup] * -0.03 + np.random.default_rng(1).normal(0, 0.012, (int(dup.sum()), 3))
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
        if p["material"] == "lens_glow" and p["region"].endswith("_hand"):       # the palm's outward direction: the plate's thin axis, away from the hand
            c0 = v - v.mean(0); n = np.linalg.svd(c0, full_matrices=False)[2][2]
            hc = np.mean([q.centroid for r_, q in pcs if r_["region"] == p["region"] and r_["material"] != "lens_glow"], axis=0)
            rows[-1]["normal"] = (n if n @ (v.mean(0) - hc) > 0 else -n).round(4).tolist()
    man = {"source": 'suit: designed directly by scripts/forge_mark43.py from reference photos of the movie suit', "wearer_height_m": 1.75, "pieces": rows, "limits": limits, "hinge": [float(hinge[0]), float(hinge[2])], "joints": {k: [round(float(x), 2) for x in v] for k, v in jpos.items()},
           "face_rear_x": float(min(m.bounds[0][0] for p, m in pcs if p["link"] == "helmet_faceplate" and p["material"] == "armour_gold") - jpos["neck_mount"][0]),
           "notes": ["shells made by scripts/forge_mark43.py", "joint limits measured by sweeping each limb's armour against its parent's armour"]}
    json.dump(man, open(out + ".json", "w"), separators=(",", ":")); open(out + ".bin", "wb").write(blob)
    print(len(rows), "pieces", sum(r["nf"] for r in rows), "faces", len(blob) // 1000000, "MB")
    import fit_wiring; fit_wiring.fit(out)     # the harness's channels and seat are cut from the finished shells


if __name__ == "__main__":
    main()
