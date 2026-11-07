"""Turns the forged door panels into a working mechanism. For every door of the suit (forge_mark43.DOOR_PLAN) it makes, from the finished shells:

  - hinges: a fixed leaf with two knuckles, a door leaf with one between them, on a steel pin; each leaf lies on the outer face of its shell
  - a drive: a pod on the fixed half that holds the servo with its output on the hinge line, and an arm from the servo's horn to the door
  - latches: a sprung pawl on a servo inside the shell, hooking a ledge on the door; a cord on the pawl opens it by hand with no power

Shells give way where the hardware and its swing need room, and limbs give way to the hardware on the body they hang from. `measure` then
sweeps every door against the rest of the armour with exact intersection; the angles it finds are the limits in the design.

    .venv/bin/python -B scripts/fit_doors.py <shells-base> <doors.json> packages/parts/data/mark43_pack
"""
import gc, json, math, os, pickle, sys, time
import numpy as np, trimesh
import manifold3d as m3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge_mark43 as FORGE
from fit_wiring import as_manifold, from_manifold, read_pack, encode, overlaps, inflated

R_BARREL, R_SLOT, BORE = 6.0, 7.5, 4.2           # knuckle radius, room round a knuckle, bore for an M4 pin
KNUCKLE, FIXED_H = 5.6, 19.0                     # half lengths: door knuckle, fixed leaf
POD_WALL, POCKET = 2.4, 0.3                      # servo pod wall, clearance round the servo
AIR = 0.6                                        # what a moving part keeps from a shell
PAWL_TRAVEL = 0.2                                # rad the pawl lifts to let the ledge go
LATCH_SERVO = "hobby_mg90s"
PAWL_H = 9.0                                     # the pawl's height along the seam: with its 6 mm thickness, the section that takes the load
LATCH_BACK, LATCH_REACH, LATCH_IN = 16.0, 18.0, 9.5   # pawl axis behind the seam, reach past the seam, off the inner face
STAGES = [("forearm",), ("shin",), ("upper_arm",), ("thigh",), ("torso",), ("head",)]   # one left and right pair at a time, so the rail sees two servos moving
# on the centre seams the left door's pawl reaches behind the right door, so the right door moves first when opening, and last when shutting
TOUCH = 2.0                                      # mm3 of overlap that counts as contact
CRUMB = 0.05                                     # a loose body under this share of its piece's surface is a crumb
COLLIDE = 400.0                                  # a limb joint stops when overlap grows by this much (as in pack_armour.py)
HARD = ("armour_red", "armour_gold", "armour_silver")
HERE = os.path.dirname(os.path.abspath(__file__))
_meshes = None


def servo_body(key):
    """the servo's vertices (mm, output at the origin, +z out, case towards -x), its case top, tab plane, tab holes and horn radius"""
    global _meshes
    if _meshes is None: _meshes = (json.load(open(f"{HERE}/../packages/parts/data/meshes.json")), json.load(open(f"{HERE}/../packages/parts/data/catalog.json")))
    v = np.array(_meshes[0][key]["v"], float).reshape(-1, 3); c = _meshes[1][key]
    holes = [h for h in c["holes"] if h["axis"][2] < -0.5 and abs(h["pos"][2]) > 3]; tab = holes[0]["pos"][2]
    top = -5.95 if key == "hobby_mg90s" else -6.05      # the case top; above it, the horn
    return {"v": v[v[:, 2] <= top], "body": v[v[:, 2] < tab - 0.01], "top": top, "tab": tab, "holes": holes, "horn": float(c["specs"]["horn_radius_mm"]), "out": float(v[:, 2].max())}


def frame(n, up, c):
    """3x4 from local (x towards the fixed half, z up the hinge) to world"""
    x = np.asarray(n, float); z = np.asarray(up, float); x = x - (x @ z) * z; x /= np.linalg.norm(x); y = np.cross(z, x)
    return np.c_[x, y, z, np.asarray(c, float)]


def at(M, p): return M[:, :3] @ np.asarray(p, float) + M[:, 3]
def place(M, solid): return solid.transform(M.tolist())
def cyl(M, r, z0, z1): return place(M, m3.Manifold.cylinder(z1 - z0, r, r, 40).translate([0, 0, z0]))
def box(M, lo, hi): return place(M, m3.Manifold.cube(list(np.subtract(hi, lo))).translate(list(lo)))
def turn(solid, o, e, ang):
    e = np.asarray(e, float) / np.linalg.norm(e); K = np.array([[0, -e[2], e[1]], [e[2], 0, -e[0]], [-e[1], e[0], 0]]); R = np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
    return solid.transform(np.c_[R, np.asarray(o) - R @ np.asarray(o)].tolist())
def sweep(solid, o, e, a0, a1, step=0.05): return m3.Manifold.batch_boolean([turn(solid, o, e, a) for a in np.linspace(a0, a1, max(3, int(abs(a1 - a0) / step) + 1))], m3.OpType.Add)
def bigger(solid, by):
    """the solid grown by `by` (a clearance body, not a part)"""
    return inflated(from_manifold(solid), by) if not solid.is_empty() else solid
def biggest(solid): return max(solid.decompose(), key=lambda c: c.volume())
def corners(M, lo, hi): return [at(M, (x, y, z)) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]


class Shells:
    """the pieces of one rigid group near a point"""
    def __init__(self, pieces, links): self.items = [e for e in pieces if e["row"]["link"] in links and e["row"]["material"] in HARD]

    def near(self, c, r=150.0):
        lo, hi = np.asarray(c) - r, np.asarray(c) + r
        return [e for e in self.items if (e["mesh"].bounds[0] < hi).all() and (e["mesh"].bounds[1] > lo).all()]

    def hit(self, O, D, c):
        """first surface along each ray from O in direction D (world), or None"""
        ms = [e["mesh"] for e in self.near(c)]
        if not ms: return [None] * len(O)
        m = trimesh.util.concatenate(ms); O = np.asarray(O, float); Dv = np.tile(np.asarray(D, float), (len(O), 1))
        loc, idx, _ = m.ray.intersects_location(O, Dv, multiple_hits=True); out = [None] * len(O)
        for p, i in zip(loc, idx):
            t = (p - O[i]) @ Dv[i]
            if t > 0 and (out[i] is None or t < out[i][0]): out[i] = (t, p)
        return [None if x is None else x[1] for x in out]

    def cut(self, solid):
        """take a clearance body out of the shells it touches"""
        bb = np.array(solid.bounding_box()).reshape(2, 3); lost = 0.0
        for e in self.items:
            if not overlaps(e["mesh"].bounds, bb): continue
            x = as_manifold(e["mesh"]) - solid; v = e["mesh"].volume - x.volume()
            if v > 0.01: lost += v; e["mesh"] = from_manifold(biggest(x)); e["dirty"] = True
        return lost

    def minus(self, solid):
        bb = np.array(solid.bounding_box()).reshape(2, 3)
        for e in self.items:
            if overlaps(e["mesh"].bounds, bb): solid = solid - as_manifold(e["mesh"])
        return solid


def level(out, e):
    """`out` square to the hinge line, so a leaf's edges stay in their own slice of the hinge"""
    o = np.asarray(out, float) - (np.asarray(out, float) @ np.asarray(e, float)) * np.asarray(e, float); return o / np.linalg.norm(o)


def contacts(sh, M, out, xs, zs, depth=0.6, reach=45.0):
    """points just inside the outer face of a shell, at local (x, z). A ray that finds no shell near the hinge line went through an opening: it does not count."""
    O = [at(M, (x, 0, z)) + np.asarray(out) * 70 for x in xs for z in zs]; c = at(M, (0, 0, 0))
    return [p - np.asarray(out) * depth for p, o_ in zip(sh.hit(O, -np.asarray(out), c), O) if p is not None and np.linalg.norm(p - o_) < 70 + reach]


def hinge(d, c, fixed, door):
    """one hinge at station c: (fixed leaf, door leaf)"""
    e = np.array(d["up"]); out = level(d["out"], e); M = frame(d["normal"], e, c)
    ring = lambda h: [at(M, (R_BARREL * math.cos(t), R_BARREL * math.sin(t), z)) for t in np.linspace(0, 2 * math.pi, 16, endpoint=False) for z in (-h, h)]
    pf = contacts(fixed, M, out, (12, 24, 34), (-FIXED_H, 0, FIXED_H)); pd = contacts(door, M, out, (-12, -24, -34), (-KNUCKLE, KNUCKLE))
    if len(pf) < 3 or len(pd) < 2: raise SystemExit(f"{d['name']}: no shell under a hinge at {np.round(c)}")
    bore = cyl(M, BORE / 2, -40, 40); slot = cyl(M, R_SLOT, -KNUCKLE - 0.5, KNUCKLE + 0.5)
    lf = m3.Manifold.hull_points(np.array(ring(FIXED_H) + pf + [p + out * 2.4 for p in pf])) - bore - slot - box(M, (-60, -60, -KNUCKLE - 0.5), (0, 60, KNUCKLE + 0.5))
    ld = m3.Manifold.hull_points(np.array(ring(KNUCKLE) + pd + [p + out * 2.4 for p in pd])) - bore - (box(M, (0.4, -60, -10), (60, 60, 10)) - cyl(M, R_BARREL + 0.2, -10, 10))
    return lf, ld, M


def drive(d, fixed, door):
    """servo pod on the fixed half, arm to the door: (pod, arm, servo clearance, horn clearance, servo frame)"""
    key = d["servo"]["key"]; S = servo_body(key); c = np.array(d["servo"]["at"]); e, n = np.array(d["up"]), np.array(d["normal"]); out = level(d["out"], e)
    Ms = frame(-np.array(n), e, c)           # servo frame: its case runs along -x, towards the fixed half
    lo, hi = S["body"].min(0), S["body"].max(0)
    lo2, hi2 = lo - [POD_WALL, POD_WALL, POD_WALL], np.array([hi[0] + POD_WALL, hi[1] + POD_WALL, S["tab"]])
    pod_box = box(Ms, lo2, hi2)
    fixed.cut(bigger(pod_box, 0.05))
    M = frame(n, e, c); zr = (lo2[2] - 6, S["tab"]); skirt = contacts(fixed, M, out, np.linspace(4, -lo2[0] + 10, 5), np.linspace(zr[0], zr[1], 5))
    blister = m3.Manifold.hull_points(np.array(corners(Ms, lo2, hi2) + skirt + [p + out * 2.0 for p in skirt]))
    pocket = m3.Manifold.hull_points(np.array([at(Ms, p) for p in S["body"]] + [at(Ms, (p[0], p[1], S["tab"] + 1)) for p in S["body"]]))
    pocket = bigger(pocket, POCKET)
    holes = m3.Manifold.batch_boolean([place(Ms, m3.Manifold.cylinder(9.0, 0.85 if "mg90" in key else 1.3, 0.85 if "mg90" in key else 1.3, 16).translate([h["pos"][0], h["pos"][1], S["tab"] - 8.5])) for h in S["holes"]], m3.OpType.Add)
    pod = blister - pocket - holes - box(M, (-60, -60, S["tab"]), (60, 60, 80))
    z0 = S["out"] + 0.5; r = S["horn"] + 1.5
    pd = contacts(door, M, out, (-r - 4, -r - 12, -r - 22), (z0, z0 + 6))
    if len(pd) < 2: raise SystemExit(f"{d['name']}: no door under the drive arm")
    ring = [at(M, (r * math.cos(t), r * math.sin(t), z)) for t in np.linspace(0, 2 * math.pi, 28, endpoint=False) for z in (z0, z0 + 6)]
    arm = m3.Manifold.hull_points(np.array(ring + pd + [p + out * 2.4 for p in pd]))
    # what the door and the arm must not touch: the servo with its tabs and horn
    body = m3.Manifold.hull_points(np.array([at(Ms, p) for p in S["v"]]))
    horn = cyl(M, S["horn"] + 0.8, S["top"] - 0.5, S["out"] + 0.2)
    fixed.cut(bigger(body + horn, POCKET))     # the servo stands through the wall: the shell has a window for it, horn included
    return pod, arm, body + horn, Ms


def latch(name, A_seam, u, f, w, carrier, catcher):
    """A pawl on a servo inside `carrier`'s shell reaching across the seam to a ledge inside `catcher`'s. `A_seam` is a point on the seam at the inner face,
    `f` points from the seam into the carrier, `w` inward off the shell, `u` along the seam. Returns the solids and the frames."""
    key = LATCH_SERVO; S = servo_body(key); u, f, w = (np.asarray(x, float) / np.linalg.norm(x) for x in (u, f, w))
    # the servo stands clear of the shell, which curves in along its length: as close to the wall as that allows
    allv = np.array(_meshes[0][key]["v"], float).reshape(-1, 3)
    for inset in np.arange(LATCH_IN, 40.0, 1.0):
        A = np.asarray(A_seam, float) + f * LATCH_BACK + w * inset
        whole_ = bigger(m3.Manifold.hull_points(np.array([at(frame(-f, u, A), p) for p in allv])), 0.4)
        if carrier.minus(whole_).volume() > whole_.volume() - 0.2: break
    P = lambda x, y, z: A + f * x + w * y + u * z
    Ms = frame(-f, u, A); Ml = frame(f, u, A)
    lo, hi = S["body"].min(0), S["body"].max(0); lo2, hi2 = lo - [POD_WALL, POD_WALL, POD_WALL], np.array([hi[0] + POD_WALL, hi[1] + POD_WALL, S["tab"]])
    O = [P(x, 0, z) for x in (LATCH_BACK * 0.1, 8, 16, 24, 32) for z in (lo2[2], (lo2[2] + S["tab"]) / 2, S["tab"])]
    feet = [p - w * 0.6 for p in carrier.hit(O, -w, A) if p is not None]
    if len(feet) < 4: raise SystemExit(f"{name}: no shell behind the latch")
    block = m3.Manifold.hull_points(np.array(corners(Ms, lo2, hi2) + feet))
    pocket = bigger(m3.Manifold.hull_points(np.array([at(Ms, p) for p in S["body"]] + [at(Ms, (p[0], p[1], S["tab"] + 1)) for p in S["body"]])), POCKET)
    r_pin = 0.85
    holes = m3.Manifold.batch_boolean([place(Ms, m3.Manifold.cylinder(9.0, r_pin, r_pin, 16).translate([h["pos"][0], h["pos"][1], S["tab"] - 8.5])) for h in S["holes"]], m3.OpType.Add)
    block = carrier.minus(block - pocket - holes - box(Ml, (-60, -60, S["tab"]), (60, 60, 80)))
    z0 = S["out"] + 0.6; L = LATCH_BACK + LATCH_REACH
    ks = catcher.hit([P(-L + d_, 0, z0 + 3) for d_ in (2, 9, 15)], -w, A)
    if any(k is None for k in ks): raise SystemExit(f"{name}: no shell for the ledge")
    depth = max((A - k) @ w for k in ks)          # how far off the catcher's inner face the pawl axis stands
    tip = -(depth - 1.2)                          # the tooth stops 1.2 mm off the shell
    hub = cyl(Ml, 7.0, z0, z0 + PAWL_H)
    arm = m3.Manifold.hull_points(np.array([P(x, y, z) for x in (0, -L) for y in (-3, 3) for z in (z0, z0 + PAWL_H)]))
    tooth = m3.Manifold.hull_points(np.array([P(x, y, z) for x in (-L, -L + 6) for y in (tip, 3) for z in (z0, z0 + PAWL_H)]))
    pawl = (hub + arm + tooth) - cyl(Ml, 1.6, z0 - 1, z0 + PAWL_H + 2)
    top = tip + 2.2
    foot = [p - w * 0.6 for p in catcher.hit([P(x, 0, z) for x in (-L + 6.7, -L + 12.7) for z in (z0 - 3, z0 + PAWL_H + 3)], -w, A) if p is not None]
    ledge = catcher.minus(m3.Manifold.hull_points(np.array(foot + [P(x, top, z) for x in (-L + 6.7, -L + 12.7) for z in (z0 - 3, z0 + PAWL_H + 3)])))
    pawl = carrier.minus(catcher.minus(pawl))
    sign = 1 if np.cross(u, -f) @ w > 0 else -1
    return block, biggest(pawl), ledge, Ms, A, u, sign, depth


def build(pieces, doors):
    """adds hinges, drives and latches; returns new pieces and the mechanism records"""
    new = []; recs = []; latches = []
    groups = lambda links: Shells(pieces, links)
    for d in doors:
        fixed, door = groups({d["parent"]}), groups({d["link"]})
        e = np.array(d["up"]); o = np.array(d["a"]); sg = d["sign"]; open_ = d["open"]
        fixed_hw, door_hw = [], []
        for i, c in enumerate(d["hinges"]):
            lf, ld, M = hinge(d, c, fixed, door)
            fixed_hw.append((f"hinge_{d['name']}_{i}", lf, c)); door_hw.append((f"hinge_{d['name']}_{i}_knuckle", ld, c))
        pod, arm, keep, Ms = drive(d, fixed, door)
        fixed_hw.append((f"pod_{d['name']}", pod, d["servo"]["at"])); door_hw.append((f"arm_{d['name']}", arm, d["servo"]["at"]))
        # room: the fixed shell for the door's hardware through its whole swing, the door's shell for everything fixed
        for _, s, _c in door_hw: fixed.cut(bigger(sweep(s, o, e, 0, sg * (open_ + 0.05)), AIR))
        for _, s, _c in fixed_hw + [("servo", keep, None)]: door.cut(bigger(sweep(s, o, e, 0, -sg * (open_ + 0.05)), AIR))
        for name, s, c in fixed_hw: new.append({"name": name, "link": d["parent"], "solid": biggest(fixed.minus(s)), "anchor": c, "region": d["region"]})
        for name, s, c in door_hw: new.append({"name": name, "link": d["link"], "solid": biggest(door.minus(s) - bigger(keep, 0.2)), "anchor": c, "region": d["region"]})
        recs.append({**d, "servo": {**d["servo"], "T": np.vstack([Ms, [0, 0, 0, 1]]).round(9).tolist(), "name": f"{d['name']}_servo"}})
        print(d["name"], "hardware done", flush=True)
    # latches: one per limb door on its free edge, between the back doors and the helmet doors on the centre line
    for d in doors:
        if d["part"] in ("torso", "head"):
            if d["side"] == "right": continue
            other = next(x for x in doors if x["part"] == d["part"] and x["side"] == "right")
            carrier, catcher = groups({d["link"]}), groups({other["link"]}); parent = d["link"]; f = np.array([0.0, 1.0, 0.0]); w = np.array([1.0, 0.0, 0.0]); u = np.array([0.0, 0.0, 1.0])
            seams = []
            for t in d["latch_t"]:
                O = np.array([[-20.0, 3.0, t]]); h = carrier.hit(O, -w, O[0])[0]
                seams.append(np.array([h[0], 0.0, t]))
        else:
            carrier, catcher = groups({d["parent"]}), groups({d["link"]}); parent = d["parent"]; f = np.array(d["normal"]); w = np.array(d["out"]); u = np.array(d["seam_up"]) * -1
            seams = []
            for t in d["latch_t"]:
                c = np.array(d["base"]) + np.array(d["seam_up"]) * t
                h = carrier.hit([c + f * 3.0], -w, c)[0]
                seams.append(h - f * 3.0)
        for k, seam in enumerate(seams):
            name = f"latch_{d['name']}_{k}"
            block, pawl, ledge, Ms, A, uu, sign, depth = latch(name, seam, u, f, w, carrier, catcher)
            new.append({"name": f"{name}_block", "link": parent, "solid": biggest(block), "anchor": A, "region": d["region"]})
            new.append({"name": f"{name}_ledge", "link": catcher.items[0]["row"]["link"], "solid": biggest(ledge), "anchor": A, "region": d["region"]})
            new.append({"name": f"{name}_pawl", "link": f"{name}_pawl_link", "solid": pawl, "anchor": A, "region": d["region"]})
            latches.append({"name": name, "door": d["link"], "parent": parent, "link": f"{name}_pawl_link", "joint": f"{name}_pawl", "region": d["region"], "key": LATCH_SERVO, "a": A.round(3).tolist(), "up": uu.round(6).tolist(), "sign": sign, "travel": PAWL_TRAVEL,
                            "T": np.vstack([Ms, [0, 0, 0, 1]]).round(9).tolist(), "room_mm": round(float(np.linalg.norm(A - seam) + 6 + POD_WALL), 1)})
            print(name, "depth", round(depth, 1), flush=True)
    return new, recs, latches


def base_link(link):
    """the rigid body a door closes onto"""
    return {"back_door_left": "pelvis", "back_door_right": "pelvis", "helmet_door_left": "head", "helmet_door_right": "head"}.get(link, link[:-5] if link.endswith("_door") else link)


def state(doors, opened):
    """world pose of each door at the angles in `opened`: link -> (point, axis, signed angle)"""
    return {d["link"]: (np.array(d["a"]), np.array(d["up"]), d["sign"] * opened.get(d["link"], 0.0)) for d in doors}


def trim_stages(pieces, new, doors, latches, checkpoint=None):
    """Doors open a left and right pair at a time, forearms first, back and helmet last. A door gives way along its edges to whatever it meets on its way, in the state
    the stage finds it, so the sequence runs clear; what its hardware meets gives way to the hardware. The suit is symmetrical: the right door takes the left door's cuts,
    mirrored. `checkpoint` keeps each finished stage, so a long run can pick up where it stopped."""
    opened = {}; lost_all = {}; solids = {}; first = 0
    ride = {l["link"]: l["parent"] for l in latches}; lifted = {l["link"]: (l["a"], l["up"], l["sign"] * l["travel"]) for l in latches}
    if checkpoint and os.path.exists(checkpoint):
        first, opened, lost_all, meshes = pickle.load(open(checkpoint, "rb"))
        for e, (m, dirty) in zip(pieces, meshes): e["mesh"], e["dirty"] = m, dirty
        print("resuming at stage", first, flush=True)
    for e in pieces:
        if e["row"]["material"] in HARD: solids.setdefault(e["row"]["link"], []).append(e)
    hw = {}
    for h in new: hw.setdefault(h["link"], []).append(h["solid"])
    for si, stage in enumerate(STAGES):
        moving = [d for d in doors if d["part"] in stage]
        if si < first: continue
        cuts = {}
        for d in moving:
            if d["side"] == "right":
                lost = sum(Shells(pieces, {link.replace("left", "right")}).cut(t_.mirror([0, 1, 0])) for link, t_ in cuts[d["name"].replace("right", "left")])
                lost_all[d["name"]] = round(lost); print(d["name"], "gave way", round(lost), "mm3 (mirrored)", flush=True); continue
            done = cuts.setdefault(d["name"], []); t0 = time.time()
            mine = Shells(pieces, {d["link"]}); o, e, sg = np.array(d["a"]), np.array(d["up"]), d["sign"]; lost = 0.0
            light = m3.Manifold.compose([as_manifold(x["mesh"]) for x in mine.items] + hw.get(d["link"], [])).simplify(0.3)
            bb = np.array(sweep(light.simplify(2.0), o, e, 0, sg * d["open"], 0.2).bounding_box()).reshape(2, 3)
            def posed(link, x, way=1):
                """a solid carried by a door that is already open (way -1: brought back to where that door stands shut)"""
                if link not in opened: return x
                st = next(q for q in doors if q["link"] == link); return turn(x, st["a"], st["up"], way * st["sign"] * opened[link])
            unposed = lambda link, x: posed(link, x, -1)
            # a coarse pass finds the few pieces the door meets; a fine pass follows those, and only what it reaches is swung back onto the door
            met = []; steel = m3.Manifold.compose(hw.get(d["link"], []))
            for link, es in solids.items():
                if link == d["link"]: continue
                for x in es:
                    q = posed(link, as_manifold(x["mesh"]).simplify(0.3)); qb = np.array(q.bounding_box()).reshape(2, 3)
                    if not overlaps(qb, bb): continue
                    for a in np.arange(0.06, d["open"] + 0.03, 0.08):
                        c = turn(light, o, e, sg * a)
                        if overlaps(np.array(c.bounding_box()).reshape(2, 3), qb) and (c ^ q).volume() > 0.05: met.append((link, q)); break
            # hardware and servos on other parts stand where they stand: the door's shell gives way to them, with pawls lifted as they are before a door moves
            for h in new:
                if h["link"] == d["link"] or ride.get(h["link"]) == d["link"]: continue
                q = h["solid"]
                if h["link"] in lifted: q = turn(q, *lifted[h["link"]])
                q = posed(ride.get(h["link"], h["link"]), q); qb = np.array(q.bounding_box()).reshape(2, 3)
                if overlaps(qb, bb) and any((turn(light, o, e, sg * a) ^ q).volume() > 0.05 for a in np.arange(0.06, d["open"] + 0.03, 0.08)): met.append((None, q))
            print(d["name"], "meets", len(met), "pieces", round(time.time() - t0), "s", flush=True)
            # what the door's shell meets is cut from the door; what its hardware meets is cut from the other part, since hardware cannot give way
            hits = []; theirs = {}
            for link, q in met:
                for a in np.arange(0.0125, d["open"] + 0.03, 0.0125):
                    x = turn(light, o, e, sg * a) ^ q
                    if x.volume() < 0.2: continue
                    hits.append(from_manifold(turn(x, o, e, -sg * a)))
                    y = (turn(steel, o, e, sg * a) ^ q) if link else None
                    if y and y.volume() > 0.05: theirs.setdefault(link, []).append(from_manifold(unposed(link, y)))
            if hits:
                tool = bigger(m3.Manifold.batch_boolean([as_manifold(h) for h in hits], m3.OpType.Add), 0.6); lost = mine.cut(tool); done.append((d["link"], tool))
            for link, ms in theirs.items():
                tool = bigger(m3.Manifold.batch_boolean([as_manifold(h) for h in ms], m3.OpType.Add), AIR); lost += Shells(pieces, {link}).cut(tool); done.append((link, tool))
            del hits, met, light, steel, theirs; gc.collect()
            lost_all[d["name"]] = round(lost); print(d["name"], "gave way", round(lost), "mm3", round(time.time() - t0), "s", flush=True)
        for d in moving: opened[d["link"]] = d["open"]
        if checkpoint: pickle.dump((si + 1, opened, lost_all, [(e["mesh"], e["dirty"]) for e in pieces]), open(checkpoint, "wb"))
    print("trimmed for the sequence (mm3):", lost_all, flush=True)


SWINGS = [("shoulder", "upper_arm", "pelvis", -1.04, 0.24), ("hip", "thigh", "pelvis", -1.04, 0.24), ("elbow", "forearm", "upper_arm", -1.95, 0.0), ("knee", "shin", "thigh", 0.0, 1.75)]


def relieve_limbs(pieces, new, jpos):
    """Hardware on a body takes room from the limb that swings past it, and the other way round"""
    lost = 0.0
    for side in ("left", "right"):
        for j, child, parent, lo, hi in SWINGS:
            o = np.array(jpos[f"{side}_{j}"], float); cl = f"{side}_{child}"; pl = parent if parent == "pelvis" else f"{side}_{parent}"; y = np.array([0.0, 1.0, 0.0])
            kids = Shells(pieces, {l for l in {e["row"]["link"] for e in pieces} if base_link(l) == cl}); dads = Shells(pieces, {l for l in {e["row"]["link"] for e in pieces} if base_link(l) == pl})
            for h in new:
                bl = base_link(h["link"])
                c = np.array(h["solid"].bounding_box()).reshape(2, 3).mean(0)
                if np.linalg.norm(c - o) > 420: continue
                # a joint angle q turns the child by q about +y: in the child's frame the parent's hardware turns by -q
                if bl == pl: lost += kids.cut(sweep(h["solid"], o, y, -hi, -lo, 0.06))
                elif bl == cl: lost += dads.cut(sweep(h["solid"], o, y, lo, hi, 0.06))
    print("relieved round the hardware", round(lost), "mm3", flush=True)


def fit(shells, doors_json, out):
    man, old = read_pack(shells)
    pieces = [{"row": r, "mesh": m, "raw": raw, "dirty": False} for r, m, raw in old]
    doors = json.load(open(doors_json))
    cache = shells + "_hardware.pkl"
    if "--reuse" in sys.argv and os.path.exists(cache):
        meshes, solids, recs, latches, new = pickle.load(open(cache, "rb"))
        for e, m, dirty in zip(pieces, *meshes): e["mesh"], e["dirty"] = m, dirty
        for h, m in zip(new, solids): h["solid"] = as_manifold(m)
    else:
        new, recs, latches = build(pieces, doors)
        pickle.dump((([e["mesh"] for e in pieces], [e["dirty"] for e in pieces]), [from_manifold(h["solid"]) for h in new], recs, latches, [{k: v for k, v in h.items() if k != "solid"} for h in new]), open(cache, "wb"))
    trim_stages(pieces, new, doors, latches, shells + "_stage.pkl")
    relieve_limbs(pieces, new, man["joints"])
    # every servo, horn and tabs included, has its room in whatever shell stands round it
    bodies = [body_of(d["servo"]["key"], r["servo"]["T"]) for d, r in zip(doors, recs)] + [body_of(l["key"], l["T"]) for l in latches]
    everything = Shells(pieces, {e["row"]["link"] for e in pieces})
    print("room round the servos", round(sum(everything.cut(bigger(b, POCKET)) for b in bodies)), "mm3", flush=True)
    # the joint sleeves are cloth: they give way to the hardware
    for e in pieces:
        if e["row"]["material"] != "armour_mech": continue
        x = as_manifold(e["mesh"]); hit = False
        for h in new:
            if overlaps(e["mesh"].bounds, np.array(h["solid"].bounding_box()).reshape(2, 3)): x = x - h["solid"]; hit = True
        if hit and not x.is_empty(): e["mesh"] = from_manifold(biggest(x)); e["dirty"] = True
    for e in pieces:     # a cut leaves dense edges: the same simplification every shell had
        if e["dirty"]: e["mesh"] = from_manifold(as_manifold(e["mesh"]).simplify(0.2))
    blob = bytearray(); rows = []
    for e in pieces:
        r, raw = e["row"], e["raw"]
        if e["dirty"]:
            lo, step, raw, q = encode(e["mesh"]); r = {**r, "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(q.vertices), "nf": len(q.faces), "volume_mm3": round(float(q.volume), 1), "centroid": q.centroid.round(2).tolist()}
        ov = len(blob); blob += raw; rows.append({**r, "ov": ov, "of": ov + r["nv"] * 6})
    for h in new:
        m = from_manifold(h["solid"]); lo, step, raw, q = encode(m); ov = len(blob); blob += raw
        rows.append({"name": h["name"], "link": h["link"], "material": "armour_silver", "region": h["region"], "hardware": True, "anchor": [round(float(x), 2) for x in h["anchor"]], "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(q.vertices), "nf": len(q.faces), "ov": ov, "of": ov + len(q.vertices) * 6,
                     "volume_mm3": round(float(q.volume), 1), "centroid": q.centroid.round(2).tolist()})
    man["pieces"] = rows; man["doors"] = recs; man["latches"] = latches
    json.dump(man, open(out + ".json", "w"), separators=(",", ":")); open(out + ".bin", "wb").write(blob)
    print(len(rows), "pieces", len(new), "new", len(blob) // 1000000, "MB", flush=True)


def body_of(key, T):
    """a servo's solid where it stands"""
    S = servo_body(key); M = np.array(T)[:3]; v = np.array(_meshes[0][key]["v"], float).reshape(-1, 3)
    return m3.Manifold.hull_points(np.array([at(M, p) for p in S["v"]])) + m3.Manifold.hull_points(np.array([at(M, p) for p in v[v[:, 2] > S["top"]]]))


def measure(base):
    """Every door swept through its range in the order the suit opens, with exact intersection against everything else, servos included.
    The angle reached goes into the manifest as the joint's limit, with what stopped it, if anything; `alone_deg` is the same door opened with all others shut."""
    man, ps = read_pack(base); doors = man["doors"]; solid = {}
    for r, m, _ in ps:
        if r["material"] != "lens_glow" and (r["material"] != "armour_mech" or r.get("wiring")): solid.setdefault(r["link"], []).append(as_manifold(m))    # the joint sleeves are cloth: they give
    for d in doors: solid.setdefault(d["parent"], []).append(body_of(d["servo"]["key"], d["servo"]["T"]))
    for l in man.get("latches", []): solid.setdefault(l["parent"], []).append(body_of(l["key"], l["T"]))
    if man.get("bay_box"): solid.setdefault(man["bay_box"]["link"], []).append(m3.Manifold.hull_points(np.array(man["bay_box"]["corners"])))
    # the pawls are lifted before a door moves
    for l in man.get("latches", []): solid[l["link"]] = [turn(s, l["a"], l["up"], l["sign"] * l["travel"]) for s in solid[l["link"]]]
    S = {k: m3.Manifold.compose(v) for k, v in solid.items()}
    # a pawl link rides on its parent: when the parent is a door it swings with it
    ride = {l["link"]: l["parent"] for l in man.get("latches", [])}
    bydoor = {d["link"]: d for d in doors}
    def pose(link, opened):
        s = S[link]; p = ride.get(link, link)
        if p in opened: d = bydoor[p]; s = turn(s, d["a"], d["up"], d["sign"] * opened[p])
        return s
    def clear(d, others, opened):
        """largest angle reached before overlap with anything, and what is hit"""
        mine = [k for k in S if k == d["link"] or ride.get(k) == d["link"]]; a = 0.0; hit = None; step = math.radians(2)
        while a + step <= d["open"] + 1e-6:
            for k in mine:
                t = turn(S[k], d["a"], d["up"], d["sign"] * (a + step)); bb = np.array(t.bounding_box()).reshape(2, 3)
                for o in others:
                    if o in mine: continue
                    q = pose(o, opened)
                    if overlaps(bb, np.array(q.bounding_box()).reshape(2, 3)):
                        v = (t ^ q).volume()
                        if v > TOUCH: hit = (o, round(v, 1)); break
                if hit: break
            if hit: break
            a += step
        return a, hit
    opened = {}; res = {}; order = []
    for stage in STAGES:
        moving = [d for d in doors if d["part"] in stage]
        centre = stage[0] in ("torso", "head")
        if centre: moving.sort(key=lambda d: d["side"] != "right")
        order += [[d["joint"]] for d in moving] if centre else [[d["joint"] for d in moving]]
        for d in moving:
            a, hit = clear(d, list(S), opened); solo, shit = clear(d, list(S), {})
            if centre: opened[d["link"]] = a
            res[d["link"]] = a; man["limits"][d["joint"]] = [0, round(a, 3)] if d["sign"] > 0 else [round(-a, 3), 0]
            d["measured_deg"] = round(math.degrees(a), 1); d["stopped_by"] = hit[0] if hit else None; d["alone_deg"] = round(math.degrees(solo), 1); d["alone_stopped_by"] = shit[0] if shit else None
            print(d["joint"], d["measured_deg"], hit, "alone", d["alone_deg"], shit, flush=True)
        for d in moving: opened[d["link"]] = res[d["link"]]
    # how far a closing edge stands from its hinge, and each pawl through its travel with the doors shut
    for d in doors:
        v = np.vstack([np.asarray(S[k].to_mesh().vert_properties)[:, :3] for k in S if k == d["link"]]) - np.array(d["a"]); e = np.array(d["up"])
        d["reach_mm"] = round(float(np.linalg.norm(v - np.outer(v @ e, e), axis=1).max()), 1)
    man["sequence"] = order
    for l in man.get("latches", []):
        man["limits"][l["joint"]] = [0, l["travel"]] if l["sign"] > 0 else [-l["travel"], 0]
        shut = turn(S[l["link"]], l["a"], l["up"], -l["sign"] * l["travel"]); bb = np.array(shut.bounding_box()).reshape(2, 3); worst = 0.0
        for k, q in S.items():
            if k != l["link"] and overlaps(bb, np.array(q.bounding_box()).reshape(2, 3)): worst = max(worst, (sweep(shut, l["a"], l["up"], 0, l["sign"] * l["travel"], 0.05) ^ q).volume())
        l["sweep_overlap_mm3"] = round(worst, 1); print(l["name"], "pawl sweep overlap", l["sweep_overlap_mm3"], flush=True)
    json.dump(man, open(base + ".json", "w"), separators=(",", ":"))


def tidy(base):
    """Cuts can leave crumbs joined to a piece only at a point: one printed part must be one solid, so each piece keeps its body and drops what is left (less than CRUMB of its surface).
    A second real body stays with the piece. Only removes material, so measured ranges stand."""
    man, ps = read_pack(base); blob = bytearray(); rows = []; dropped = 0
    for r, m, raw in ps:
        w = trimesh.Trimesh(m.vertices, m.faces, process=True); parts = w.split(only_watertight=False)
        if len(parts) > 1:
            big = max(parts, key=lambda c: c.area); rest = sum(c.area for c in parts) - big.area
            if big.is_watertight and rest < CRUMB * big.area:
                dropped += len(parts) - 1; lo, step, raw, q = encode(big); r = {**r, "lo": lo.round(4).tolist(), "step": step.tolist(), "nv": len(q.vertices), "nf": len(q.faces), "volume_mm3": round(float(q.volume), 1), "centroid": q.centroid.round(2).tolist()}
        ov = len(blob); blob += raw; rows.append({**r, "ov": ov, "of": ov + r["nv"] * 6})
    man["pieces"] = rows
    json.dump(man, open(base + ".json", "w"), separators=(",", ":")); open(base + ".bin", "wb").write(blob)
    print("crumbs dropped:", dropped, flush=True)


def limb_limits(base):
    """The limb joints measured again with all the hardware on, doors shut: child armour turned about the joint against the parent's, as pack_armour.py does, moving stops when overlap grows past COLLIDE"""
    man, ps = read_pack(base); by = {}
    for r, m, _ in ps:
        if r["material"] not in ("armour_mech", "lens_glow") or r.get("wiring"): by.setdefault(base_link(r["link"]) if not r["link"].endswith("_pawl_link") else next(l["parent"] for l in man["latches"] if l["link"] == r["link"]), []).append(as_manifold(m))
    for d in man["doors"]: by.setdefault(base_link(d["parent"]), []).append(body_of(d["servo"]["key"], d["servo"]["T"]))
    for l in man["latches"]: by.setdefault(base_link(l["parent"]), []).append(body_of(l["key"], l["T"]))
    y = np.array([0.0, 1.0, 0.0])
    for side in ("left", "right"):
        for j, child, parent, lo, hi in SWINGS:
            o = man["joints"][f"{side}_{j}"]; c = m3.Manifold.compose(by[f"{side}_{child}"]); q = m3.Manifold.compose(by[parent if parent == "pelvis" else f"{side}_{parent}"]); was = man["limits"][f"{side}_{j}"]; base_v = (c ^ q).volume(); got = []
            for lim in (lo, hi):
                a, step = 0.0, 0.05 * (1 if lim > 0 else -1)
                while abs(a + step) <= abs(lim) + 1e-9 and lim != 0:
                    if (turn(c, o, y, a + step) ^ q).volume() - base_v > COLLIDE: break
                    a += step
                got.append(round(a, 3))
            man["limits"][f"{side}_{j}"] = got; print(f"{side}_{j}", was, "->", got, flush=True)
    json.dump(man, open(base + ".json", "w"), separators=(",", ":"))


if __name__ == "__main__":
    if "--limits" in sys.argv: limb_limits(sys.argv[1]); sys.exit()
    if "--tidy" in sys.argv: tidy(sys.argv[1]); sys.exit()
    fit(*sys.argv[1:4])
    if "--measure" in sys.argv: measure(sys.argv[3])
