"""Fits the harness into the finished armour pack:

  - cable channels: U-section raceways that lie on the inner face of the shells, bonded with foam tape, snap lips every ~50 mm. Rays from
    each bone find the inner surface. They run on the fixed halves, which never move, and stop short of the hinges: the suit's cables cross
    a door only in a service loop at its hinge (packages/design/src/wiring.ts sizes the loop from the door's real travel).
  - seats for the compartments: the battery bay on the left back door, off the centre line where the doors part, and a driver bay in the
    hollow of the waist on each side. A seat's front is the shell, its rear is flat for the compartment; cable ports go through the shell behind it.
  - the neck's measured range (the wearer turns his head; the helmet turns with him).

    .venv/bin/python -B scripts/fit_wiring.py packages/parts/data/mark43_pack

Run by pack_armour.py as its last step and safe to run again on a finished pack: earlier channels and the saddle are dropped first and
every other piece keeps its bytes. The wiring designer reads `channels` and `bay` from the manifest (packages/design/src/families/mark43-wearable.ts).
"""
import json, math, os, sys
import numpy as np, trimesh
import manifold3d as m3
from scipy.ndimage import gaussian_filter1d, maximum_filter1d
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge_mark43 as FORGE

J = FORGE.J
# the battery bay on the left back door, world mm: lowest cavity edge, length up the back, width across it, its edge off the centre line
BAY = {"z0": 1128.0, "L": 150.0, "W": 72.0, "y0": 14.0, "wall": 2.4}
PORT_Z, PORT_D = 1262.0, 11.0                   # the cable ports through the shell (a 9.5 mm grommet in the bay floor above each)
PORTS = [(1262.0, 26.0), (1262.0, 42.0), (1244.0, 26.0), (1244.0, 42.0), (1262.0, 58.0), (1244.0, 58.0)]
DRIVE = {"x0": 6.0, "z0": 1116.0, "L": 66.0, "W": 44.0, "wall": 2.4}   # a driver bay in the hollow of the waist: along the flank from x0, up from z0
DRIVE_SLOT = (40.0, 13.0)                       # the slot its cables leave by, beside the board
SADDLE_MIN = 7.0                                # saddle thickness at the shell's outermost point: what its screws bite into
STEP, GAPS = 8.0, (0.8, 1.2, 1.6, 2.0, 2.4)     # sample spacing along a channel; bonding gaps to the shell to try (foam tape fills it)
BASE_T, RAIL_T, LIP, LIP_T, LIP_EVERY = 2.0, 1.8, 2.4, 1.6, 6
MAX_RUN = 22                                    # samples per printed piece: 180 mm, inside the bed in any orientation
COLLIDE = 400.0


def as_manifold(m):
    return m3.Manifold(m3.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))


def from_manifold(x):
    g = x.to_mesh(); return trimesh.Trimesh(np.asarray(g.vert_properties)[:, :3], np.asarray(g.tri_verts), process=False)


def read_pack(base):
    man = json.load(open(base + ".json")); blob = open(base + ".bin", "rb").read(); out = []
    for r in man["pieces"]:
        q = np.frombuffer(blob, "<u2", r["nv"] * 3, r["ov"]).reshape(-1, 3).astype(float); f = np.frombuffer(blob, "<u2", r["nf"] * 3, r["of"]).reshape(-1, 3).astype(np.int64)
        out.append((r, trimesh.Trimesh(np.array(r["lo"]) + q * np.array(r["step"]), f, process=False), blob[r["ov"]:r["of"] + r["nf"] * 6]))
    return man, out


def encode(m):
    """The pack's storage, with sheets that meet at a point parted so the quantised mesh stays closed (as pack_armour.py does)."""
    v = np.asarray(m.vertices, float).copy(); nrm = m.vertex_normals
    for _ in range(8):
        lo = v.min(0); step = np.maximum((v.max(0) - lo) / 65535, 1e-6); key = np.round((v - lo) / step).astype(np.int64)
        _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True); dup = cnt[inv.ravel()] > 1
        if not dup.any(): break
        v[dup] += nrm[dup] * -0.03 + np.random.default_rng(1).normal(0, 0.012, (int(dup.sum()), 3))
    if len(v) > 65535: raise SystemExit("too many vertices for one piece")
    lo = v.min(0); step = np.maximum((v.max(0) - lo) / 65535, 1e-6); q = np.round((v - lo) / step).astype("<u2")
    return lo, step, q.tobytes() + np.asarray(m.faces).astype("<u2").tobytes(), trimesh.Trimesh(v, m.faces, process=False)


def overlaps(a, b):
    return (a[0] < b[1]).all() and (b[0] < a[1]).all()


def inflated(m, by):
    return as_manifold(trimesh.Trimesh(np.asarray(m.vertices) + m.vertex_normals * by, m.faces, process=False))


def first_hit(mesh, O, D):
    """Distance along each ray to the first surface it meets from inside, and that face's normal, which points into the cavity
    (nan where a ray finds none: an opening or a seam)."""
    tri, idx, loc = mesh.ray.intersects_id(O, D, multiple_hits=True, return_locations=True); d = np.full(len(O), np.nan); n = np.zeros((len(O), 3))
    t = ((loc - O[idx]) * D[idx]).sum(1)
    for i, x, f in zip(idx, t, tri):
        if x > 1.0 and not x >= d[i]: d[i] = x; n[i] = mesh.face_normals[f]
    return d, n


def torso_rays(way, cx=0.0):
    """(theta deg from forward towards left, z) -> rays out from the body axis"""
    a = np.array(way, float); s = np.r_[0, np.cumsum(np.hypot(np.diff(a[:, 0]) * 2.0, np.diff(a[:, 1])))]; u = np.linspace(0, s[-1], 240)
    th, z = np.radians(np.interp(u, s, a[:, 0])), np.interp(u, s, a[:, 1])
    return np.c_[np.full(len(u), cx), np.zeros(len(u)), z], np.c_[np.cos(th), np.sin(th), np.zeros(len(u))]


def limb_rays(a, b, way, side):
    """(distance along the bone, angle deg from forward towards outward) -> rays out from the bone"""
    fr = FORGE.Frame(a, b, side=side); w = np.array(way, float); s = np.r_[0, np.cumsum(np.hypot(np.diff(w[:, 0]), np.diff(w[:, 1])))]; u = np.linspace(0, s[-1], 200)
    t, ph = np.interp(u, s, w[:, 0]), np.radians(np.interp(u, s, w[:, 1]))
    return fr.A + np.outer(t, fr.u), np.outer(np.cos(ph), fr.f) + np.outer(np.sin(ph), fr.l)


def paths():
    """Every channel: name, link, region, rays, trough width, rail height. All but one lie on fixed shells; a limb's runs on its front half, inboard of the hinge."""
    out = [("door_left", "back_door_left", "torso", torso_rays([(166, PORT_Z), (140, PORT_Z), (112, PORT_Z)]), 24.0, 8.0),
           ("belt", "pelvis", "torso", torso_rays([(84, 1084), (40, 1076), (0, 1076), (-40, 1076), (-84, 1084)]), 14.0, 6.0),
           ("chest", "pelvis", "torso", torso_rays([(70, 1412), (60, 1500), (14, 1548), (0, 1500), (0, 1418)]), 14.0, 5.0),
           ("collar", "pelvis", "torso", torso_rays([(42, 1520), (20, 1556)]), 14.0, 5.0)]
    for sd, n in ((1, "left"), (-1, "right")):
        out.append((f"{n}_flank_low", "pelvis", "torso", torso_rays([(sd * 76, 1096), (sd * 76, 1236)]), 18.0, 7.0))
        out.append((f"{n}_flank_high", "pelvis", "torso", torso_rays([(sd * 74, 1246), (sd * 72, 1404)]), 18.0, 7.0))
        sh, el, wr, hp, kn, an = (J[k] * [1, sd, 1] for k in ("shoulder", "elbow", "wrist", "hip", "knee", "ankle"))
        Lu, Lf, Lt, Ls = (np.linalg.norm(a - b) for a, b in ((el, sh), (wr, el), (kn, hp), (an, kn)))
        out.append((f"{n}_upper_arm", f"{n}_upper_arm", f"{n}_upper_arm", limb_rays(sh, el, [(132, -48), (Lu - 44, -48)], sd), 14.0, 5.0))
        out.append((f"{n}_forearm", f"{n}_forearm", f"{n}_forearm", limb_rays(el, wr, [(26, -48), (Lf - 36, -48)], sd), 14.0, 5.0))
        out.append((f"{n}_thigh", f"{n}_thigh", f"{n}_thigh", limb_rays(hp, kn, [(36, 46), (Lt - 36, 46)], sd), 14.0, 5.0))
        out.append((f"{n}_shin", f"{n}_shin", f"{n}_shin", limb_rays(kn, an, [(30, 46), (Ls - 56, 46)], sd), 14.0, 5.0))
        out.append((f"{n}_helmet", "head", "head", torso_rays([(sd * 92, 1602), (sd * 88, 1680)], -10.0), 14.0, 5.0))
    return out


def channel(name, O, D, shell, w, h, gap):
    """Where the trough runs, the printable runs along it, and the maker of each run."""
    d, n = first_hit(shell, O, D); ok = np.isfinite(d)
    if ok.sum() < 8: raise SystemExit(f"{name}: rays found no shell")
    i = np.arange(len(d)); d = gaussian_filter1d(np.interp(i, i[ok], d[ok]), 3.0, mode="nearest")
    n = gaussian_filter1d(np.c_[[np.interp(i, i[ok], n[ok, k]) for k in range(3)]].T, 16.0, axis=0, mode="nearest")
    P = O + D * d[:, None]; s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]; u = np.arange(0, s[-1], STEP)
    P = np.c_[[np.interp(u, s, P[:, k]) for k in range(3)]].T; Nn = np.c_[[np.interp(u, s, n[:, k]) for k in range(3)]].T
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
    N = Nn - (Nn * T).sum(1, keepdims=True) * T; N /= np.linalg.norm(N, axis=1, keepdims=True); B = np.cross(T, N)
    # the shell is not flat across a trough: each flat-based section stands clear of the highest point under it
    lift = np.full(len(P), -9.0)
    for a in np.linspace(-w / 2, w / 2, 7):
        c = P + B * a; d, _ = first_hit(shell, c + N * 25, -N); lift = np.maximum(lift, np.where(np.isfinite(d), 25 - d, -9.0))
    lift = gaussian_filter1d(maximum_filter1d(lift, 5, mode="nearest"), 2.0, mode="nearest") + gap
    rect = lambda k, a0, a1, n0, n1, t=0.0: [P[k] + T[k] * t + B[k] * a + N[k] * (lift[k] + n) for a in (a0, a1) for n in (n0, n1)]
    slab = lambda k, b, t0=0.0, t1=0.0: m3.Manifold.hull_points(np.array(rect(k, *b, t0) + rect(k + 1, *b, t1)))
    top = BASE_T + h; trough = w / 2 - RAIL_T

    def piece(a, b):
        """One printed run: a solid bar with the trough cut out of it, so base and rails share their faces. A snap lip is the cut narrowing to a slot."""
        bar = m3.Manifold.batch_boolean([slab(k, (-w / 2, w / 2, 0, top)) for k in range(a, b)], m3.OpType.Add); cut = []
        for k in range(a, b):
            t0, t1 = (-1.0 if k == a else 0.0), (1.0 if k == b - 1 else 0.0); lip = k % LIP_EVERY == LIP_EVERY // 2
            cut.append(slab(k, (-trough, trough, BASE_T, top - LIP_T if lip else top + 1), t0, t1))
            if lip: cut.append(slab(k, (-trough + LIP, trough - LIP, BASE_T, top + 1), t0, t1))
        return bar - m3.Manifold.batch_boolean(cut, m3.OpType.Add)
    keep = np.ones(len(P), bool)
    runs = []; k = 0
    while k < len(P):       # the stretches between seams, each cut into equal printable lengths
        if not keep[k]: k += 1; continue
        e = k
        while e + 1 < len(P) and keep[e + 1]: e += 1
        n = math.ceil((e - k) / MAX_RUN); cuts = np.linspace(k, e, n + 1).round().astype(int)
        runs += [(int(a) + (1 if i else 0), int(b)) for i, (a, b) in enumerate(zip(cuts[:-1], cuts[1:])) if b - a >= 3]
        k = e + 1
    return P + N * (lift + BASE_T + h / 2)[:, None], runs, piece


def seat(shells, O, ex, ey, ez, L, W, wall, ports, port_d, slot=None):
    """A saddle under a compartment. Cavity corner at O, length along ex, width along ey, ez out of the suit; `ports` (u, v) are drilled through it and the shell.
    Returns the distance of the saddle's outer face from O along ez, the saddle, and the shells with their ports."""
    M = np.c_[ex, ey, ez]; to = np.c_[M.T, -M.T @ O]; back = np.c_[M, O]; lo, hi = (-wall - 0.0, -wall), (L + wall, W + wall)
    ls = [as_manifold(m).transform(to.tolist()) for m in shells]; hmax = -1e9
    for x in ls:
        v = np.asarray(x.to_mesh().vert_properties)[:, :3]; f = (v[:, 0] > lo[0]) & (v[:, 0] < hi[0]) & (v[:, 1] > lo[1]) & (v[:, 1] < hi[1])
        if f.any(): hmax = max(hmax, float(v[f, 2].max()))
    h = hmax + SADDLE_MIN
    if slot: drill = lambda g: m3.Manifold.batch_boolean([m3.Manifold.cube([slot[0] + g, slot[1] + g, 80.0]).translate([u - (slot[0] + g) / 2, v - (slot[1] + g) / 2, h - 70]) for u, v in ports], m3.OpType.Add)
    else: drill = lambda g: m3.Manifold.batch_boolean([m3.Manifold.cylinder(80.0, (port_d + g) / 2, (port_d + g) / 2, 32).translate([u, v, h - 70]) for u, v in ports], m3.OpType.Add)
    block = m3.Manifold.cube([L + 2 * wall - 6, W + 2 * wall - 6, 42.0]).translate([-wall + 3, -wall + 3, h - 42.0]); solid = drill(1.0)
    # everything under the shell goes, seams between its panels included: the saddle stands on the outer face and nothing of it reaches inside
    under = [x.translate([a, b, 0.4 - t]) for x in ls for t in np.arange(0.0, 46.0, 2.4) for a, b in ((0, 0), (1.0, 0), (-1.0, 0), (0, 1.0), (0, -1.0))]
    block = block - m3.Manifold.batch_boolean(under, m3.OpType.Add) - solid
    best = max((c for c in block.decompose() if c.volume() > 500), key=lambda c: c.bounding_box()[5])
    return h, from_manifold(best.transform(back.tolist())), [from_manifold((x - drill(0.0)).transform(back.tolist())) for x in ls]


def fit(base):
    man, old = read_pack(base)
    old = [e for e in old if not e[0].get("wiring")]
    meshes = {r["name"]: m for r, m, _ in old}
    # ---- the seats
    new = []; changed = {}; bays = {}
    def seated(name, link, O, ex, ey, ez, L, W, wall, ports, port_d, depth, slot=None):
        O, ex, ey, ez = (np.asarray(a, float) for a in (O, ex, ey, ez))
        foot = np.array([O + ex * u + ey * v for u in (0, L) for v in (0, W)]); lo, hi = foot.min(0) - 12, foot.max(0) + 12; c = ez != 0
        under = [r["name"] for r, m, _ in old if r["link"] == link and r["material"] in ("armour_red", "armour_gold", "armour_silver") and not r.get("hardware") and overlaps(m.bounds, np.array([np.where(c, -1e4, lo), np.where(c, 1e4, hi)]))]
        h, saddle, cut = seat([changed.get(n, meshes[n]) for n in under], O, ex, ey, ez, L, W, wall, ports, port_d, slot)
        for n, m in zip(under, cut): changed[n] = m
        new.append((f"{name}_saddle", link, "armour_red", "torso", saddle)); T = np.eye(4); T[:3, :3] = np.c_[ex, ey, ez]
        print(f"{name}: saddle face {h:.1f} from the cavity corner, {saddle.volume / 1000:.0f} cm3, {saddle.extents.round(1)}", flush=True)
        return {"link": link, "length_mm": L, "width_mm": W, "O": (O + ez * h).round(2).tolist(), "ex": list(map(float, ex)), "ey": list(map(float, ey)), "ez": list(map(float, ez)), "ports": [[round(float(u), 2), round(float(v), 2)] for u, v in ports]}
    # the battery bay: length up the back, width out from the centre line, floor towards the shell
    O = np.array([-90.0, BAY["y0"], BAY["z0"]])
    bays["back"] = seated("bay", "back_door_left", O, (0, 0, 1), (0, 1, 0), (-1, 0, 0), BAY["L"], BAY["W"], BAY["wall"], [(z - BAY["z0"], y - BAY["y0"]) for z, y in PORTS], PORT_D, 30.0)
    for sd, n in ((1, "left"), (-1, "right")):
        O = np.array([DRIVE["x0"], sd * 100.0, DRIVE["z0"]]); ex, ez = np.array([1.0, 0, 0]), np.array([0, float(sd), 0]); ey = np.cross(ez, ex)
        if ey[2] < 0: O = O + np.array([0, 0, DRIVE["W"]])
        bays[f"drive_{n}"] = seated(f"drive_{n}", "pelvis", O, ex, ey, ez, DRIVE["L"], DRIVE["W"], DRIVE["wall"], [(DRIVE["L"] / 2, 36.0)], 0.0, 16.0, DRIVE_SLOT)
    print("seats done", flush=True)
    # ---- channels
    shell_of = {}
    for r, m, _ in old:
        m = changed.get(r["name"], m)
        if r["material"] not in ("armour_mech", "lens_glow") and not r.get("hardware"): shell_of.setdefault(r["link"], []).append(m)
    shell_of = {k: trimesh.util.concatenate(x) for k, x in shell_of.items()}
    others = [(changed.get(r["name"], m).bounds, inflated(changed.get(r["name"], m), 0.2) if r["material"] != "armour_mech" else as_manifold(m)) for r, m, _ in old]
    for _, _, _, _, m in new: others.append((m.bounds, as_manifold(m)))
    import fit_doors       # the servos stand where they stand: a channel keeps clear of them too
    for key, T in [(d["servo"]["key"], d["servo"]["T"]) for d in man["doors"]] + [(l["key"], l["T"]) for l in man["latches"]]:
        s_ = fit_doors.body_of(key, T); others.append((np.array(s_.bounding_box()).reshape(2, 3), s_))
    chans = []; placed = []
    for name, link, region, (O, D), w, h in paths():
        # a section that would still touch a shell between its samples stands off further: cutting it would leave knife edges
        for gap in GAPS:
            P, runs, piece = channel(name, O, D, shell_of[link], w, h, gap); made = []; touched = 0.0
            for i, (a, b) in enumerate(runs):
                x = piece(a, b); bb = np.array(x.bounding_box()).reshape(2, 3)
                for bo, q in others + placed:
                    if overlaps(bb, bo): v0 = x.volume(); x = x - q; touched += v0 - x.volume()
                made.append(x)
            if touched < 0.05: break
        for i, x in enumerate(made):
            # only the body inside the shell stays, should a corner have been cut off at all
            t = from_manifold(max(x.decompose(), key=lambda c: c.volume())); new.append((f"chan_{name}_{i}", link, "armour_mech", region, t)); placed.append((t.bounds, as_manifold(t)))
        chans.append({"name": name, "link": link, "region": region, "width_mm": w, "depth_mm": h, "pts": P.round(1).tolist()})
        print(name, f"{len(P) * STEP:.0f} mm, {len(runs)} pieces, {gap} mm off the shell, {touched:.1f} mm3 trimmed", flush=True)
    # ---- the neck: the helmet turned about the body axis against the torso, as the other joints are measured
    body = lambda link: {"back_door_left": "pelvis", "back_door_right": "pelvis", "helmet_door_left": "head", "helmet_door_right": "head"}.get(link, link)
    cm = m3.Manifold.compose([as_manifold(m) for r, m, _ in old if body(r["link"]) in ("head", "helmet_faceplate") and r["material"] != "armour_mech"])
    pm = m3.Manifold.compose([as_manifold(changed.get(r["name"], m)) for r, m, _ in old if body(r["link"]) == "pelvis" and r["material"] != "armour_mech" and m.bounds[1][2] > 1400])
    base_v = (cm ^ pm).volume(); o = J["neck"]; rng = []
    for sign in (-1, 1):
        a = 0.0
        while a < 1.3:
            c, s_ = math.cos(sign * (a + 0.05)), math.sin(sign * (a + 0.05)); R = np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.0]])
            if (cm.transform(np.c_[R, o - R @ o].tolist()) ^ pm).volume() - base_v > COLLIDE: break
            a += 0.05
        rng.append(round(sign * a, 3))
    man["limits"]["neck"] = rng; print("neck", rng, flush=True)
    # ---- write: untouched pieces keep their bytes
    blob = bytearray(); rows = []
    for r, m, raw in old:
        if r["name"] in changed:
            lo, step, raw, q = encode(changed[r["name"]]); r = {**r, "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(q.vertices), "nf": len(q.faces), "volume_mm3": round(float(q.volume), 1), "centroid": q.centroid.round(2).tolist()}
        ov = len(blob); blob += raw; rows.append({**r, "ov": ov, "of": ov + r["nv"] * 6})
    for name, link, material, region, m in new:
        lo, step, raw, q = encode(m); ov = len(blob); blob += raw
        rows.append({"name": name, "link": link, "material": material, "region": region, "wiring": True, "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(q.vertices), "nf": len(q.faces), "ov": ov, "of": ov + len(q.vertices) * 6,
                     "volume_mm3": round(float(q.volume), 1), "centroid": q.centroid.round(2).tolist()})
    man["pieces"] = rows; man["channels"] = chans; man["bays"] = bays
    b = bays["back"]; Oc, ex_, ey_, ez_ = (np.array(b[k]) for k in ("O", "ex", "ey", "ez"))
    man["bay_box"] = {"link": b["link"], "corners": [(Oc + ex_ * u + ey_ * v + ez_ * h).round(2).tolist() for u in (-6, BAY["L"] + 6) for v in (-6, BAY["W"] + 6) for h in (0, 36.0)]}
    json.dump(man, open(base + ".json", "w"), separators=(",", ":")); open(base + ".bin", "wb").write(blob)
    print(len(rows), "pieces", sum(r["nf"] for r in rows), "faces", len(new), "new", len(blob) // 1000000, "MB")


if __name__ == "__main__":
    fit(sys.argv[1])
