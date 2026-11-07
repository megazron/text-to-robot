"""Fits the harness into the finished armour pack, without touching the outside of the suit:

  - cable channels: U-section raceways that lie on the inner face of the shells, bonded with foam tape, snap lips every
    ~50 mm. Rays from each bone find the inner surface; pieces are short enough for the bed and stop at the seams where the suit opens.
  - the back bay's seat: a saddle whose front is the torso's back and whose rear is flat for the compartment, and the cable ports
    through the shell behind it.
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
# the compartment in world mm: lowest cavity edge, cavity length up the back and width across it; the wall and floor are the bay's own
BAY = {"z0": 1100.0, "L": 112.0, "W": 104.0, "wall": 2.4}
PORT_Z, PORT_YS, PORT_D = 1200.0, (9.0, -9.0, 27.0, -27.0), 11.0   # the cable ports through the shell (a 9.5 mm grommet in the bay floor above each); the helmet alone uses the first two
SADDLE_MIN = 7.0                                # saddle thickness at the shell's rearmost point: what its screws bite into
BACK_PIECE = "torso_8"                          # the lumbar panel: one piece under the whole footprint
STEP, GAPS = 8.0, (0.8, 1.2, 1.6, 2.0, 2.4)     # sample spacing along a channel; bonding gaps to the shell to try (foam tape fills it)
BASE_T, RAIL_T, LIP, LIP_T, LIP_EVERY = 2.0, 1.8, 2.4, 1.6, 6
MAX_RUN = 22                                    # samples per printed piece: 180 mm, inside the bed in any orientation
SEAM_X, SEAM_CLEAR = 8.0, 14.0                  # chest and back part here: a channel stops either side (an inline connector crosses it)
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
    """Every channel: name, link, region, rays, trough width, rail height. Rails run on the shells' rear halves, which stay in one piece when a limb opens; on the upper arm, the rear panel towards the body."""
    out = [("spine", "pelvis", "torso", torso_rays([(180, 1212), (180, 1534)]), 24.0, 8.0)]
    for sd, n in ((1, "left"), (-1, "right")):
        out.append((f"{n}_yoke", "pelvis", "torso", torso_rays([(sd * 168, 1466), (sd * 150, 1468), (sd * 124, 1472)]), 14.0, 6.0))
        sh, el, wr = (J[k] * [1, sd, 1] for k in ("shoulder", "elbow", "wrist"))
        Lu, Lf = np.linalg.norm(el - sh), np.linalg.norm(wr - el)
        out.append((f"{n}_upper_arm", f"{n}_upper_arm", f"{n}_upper_arm", limb_rays(sh, el, [(130, -140), (Lu - 72, -140)], sd), 14.0, 5.0))
        out.append((f"{n}_forearm", f"{n}_forearm", f"{n}_forearm", limb_rays(el, wr, [(40, -165), (Lf - 66, -165)], sd), 14.0, 5.0))
        out.append((f"{n}_helmet", "head", "head", torso_rays([(sd * 170, 1604), (sd * 150, 1640), (sd * 118, 1696)], -10.0), 14.0, 5.0))
    # the chest: round the left of the neck, past the seam, down the sternum to just above the reactor ring
    out.append(("chest", "pelvis", "torso", torso_rays([(168, 1540), (120, 1552), (60, 1552), (14, 1548), (0, 1500), (0, 1418)]), 14.0, 5.0))
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
    keep = np.abs(P[:, 0] - SEAM_X) > SEAM_CLEAR if name == "chest" else np.ones(len(P), bool)
    runs = []; k = 0
    while k < len(P):       # the stretches between seams, each cut into equal printable lengths
        if not keep[k]: k += 1; continue
        e = k
        while e + 1 < len(P) and keep[e + 1]: e += 1
        n = math.ceil((e - k) / MAX_RUN); cuts = np.linspace(k, e, n + 1).round().astype(int)
        runs += [(int(a) + (1 if i else 0), int(b)) for i, (a, b) in enumerate(zip(cuts[:-1], cuts[1:])) if b - a >= 3]
        k = e + 1
    return P + N * (lift + BASE_T + h / 2)[:, None], runs, piece


def fit(base):
    man, old = read_pack(base)
    old = [e for e in old if not e[0].get("wiring")]
    meshes = {r["name"]: m for r, m, _ in old}
    # ---- the seat on the back
    lumbar = meshes[BACK_PIECE]; hw = BAY["W"] / 2 + BAY["wall"]; z0, z1 = BAY["z0"] - BAY["wall"], BAY["z0"] + BAY["L"] + BAY["wall"]
    v = lumbar.vertices; foot = (np.abs(v[:, 1]) < hw) & (v[:, 2] > z0) & (v[:, 2] < z1); xr = float(v[foot, 0].min()) - SADDLE_MIN
    ports = [(PORT_Z, y) for y in PORT_YS]
    drill = lambda d: m3.Manifold.batch_boolean([m3.Manifold.cylinder(70.0, d / 2, d / 2, 32).rotate([0, 90, 0]).translate([xr - 10, y, z]) for z, y in ports], m3.OpType.Add)
    seat = m3.Manifold.cube([34.0, 2 * hw - 6, z1 - z0 - 6]).translate([xr, -hw + 3, z0 + 3]) - as_manifold(lumbar) - as_manifold(lumbar).translate([-0.4, 0, 0]) - drill(PORT_D + 1)
    saddle = from_manifold(min((c for c in seat.decompose() if c.volume() > 500), key=lambda c: c.bounding_box()[0]))
    back = from_manifold(as_manifold(lumbar) - drill(PORT_D))
    print(f"saddle: rear face x={xr:.1f}, {saddle.volume / 1000:.0f} cm3, {saddle.extents.round(1)}", flush=True)
    # ---- channels
    shell_of = {}
    for r, m, _ in old:
        if r["material"] not in ("armour_mech", "lens_glow"): shell_of.setdefault(r["link"], []).append(m)
    shell_of = {k: trimesh.util.concatenate(x) for k, x in shell_of.items()}
    others = [(m.bounds, inflated(m, 0.2) if r["material"] != "armour_mech" else as_manifold(m)) for r, m, _ in old]
    others.append((saddle.bounds, as_manifold(saddle)))
    new = [("bay_saddle", "pelvis", "armour_red", "torso", saddle)]; chans = []; placed = []
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
    cm = m3.Manifold.compose([as_manifold(m) for r, m, _ in old if r["link"] in ("head", "helmet_faceplate") and r["material"] != "armour_mech"])
    pm = m3.Manifold.compose([as_manifold(meshes[BACK_PIECE] if r["name"] == BACK_PIECE else m) for r, m, _ in old if r["link"] == "pelvis" and r["material"] != "armour_mech" and m.bounds[1][2] > 1400])
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
        if r["name"] == BACK_PIECE:
            lo, step, raw, q = encode(back); r = {**r, "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(q.vertices), "nf": len(q.faces), "volume_mm3": round(float(q.volume), 1), "centroid": q.centroid.round(2).tolist()}
        ov = len(blob); blob += raw; rows.append({**r, "ov": ov, "of": ov + r["nv"] * 6})
    for name, link, material, region, m in new:
        lo, step, raw, q = encode(m); ov = len(blob); blob += raw
        rows.append({"name": name, "link": link, "material": material, "region": region, "wiring": True, "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(q.vertices), "nf": len(q.faces), "ov": ov, "of": ov + len(q.vertices) * 6,
                     "volume_mm3": round(float(q.volume), 1), "centroid": q.centroid.round(2).tolist()})
    man["pieces"] = rows; man["channels"] = chans
    man["bay"] = {"rear_x": round(xr, 2), "z0": BAY["z0"], "length_mm": BAY["L"], "width_mm": BAY["W"], "ports": ports}
    json.dump(man, open(base + ".json", "w"), separators=(",", ":")); open(base + ".bin", "wb").write(blob)
    print(len(rows), "pieces", sum(r["nf"] for r in rows), "faces", len(new), "new", len(blob) // 1000000, "MB")


if __name__ == "__main__":
    fit(sys.argv[1])
