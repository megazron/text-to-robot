"""The suit-up film: the mask lifts, the rear halves swing open, a person in a black undersuit walks in, the armour closes, the eyes light.
  blender -b -P scripts/studio/suit_up.py -- <anim-dir> <frames-dir> [samples] [width] [first] [last] [step]"""
import bpy, json, math, os, sys
from mathutils import Vector, Matrix, Euler
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]; samples = int(a[2]) if len(a) > 2 else 24; W = int(a[3]) if len(a) > 3 else 640
first = int(a[4]) if len(a) > 4 else 0; last = int(a[5]) if len(a) > 5 else 180; step = int(a[6]) if len(a) > 6 else 1
os.makedirs(out, exist_ok=True); M = json.load(open(f"{src}/anim.json")); J = {k: Vector(v) / 1000 for k, v in M["joints"].items()}
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y = W, int(W * 1.1); sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"


def paint(name, base, metal, rough, coat=0.0, coat_rough=0.05):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat; b.inputs["Coat Roughness"].default_value = coat_rough
    return m


MATS = {"armour_red": paint("red", (0.26, 0.003, 0.008), 0.8, 0.26, 1.0, 0.03), "armour_gold": paint("gold", (0.62, 0.41, 0.17), 1.0, 0.33, 0.4, 0.15), "armour_silver": paint("steel", (0.55, 0.56, 0.59), 1.0, 0.3),
        "armour_mech": paint("mech", (0.07, 0.07, 0.08), 1.0, 0.38), "suit": paint("undersuit", (0.004, 0.004, 0.005), 0.0, 0.72)}
g = bpy.data.materials.new("glow"); g.use_nodes = True; nb = g.node_tree.nodes["Principled BSDF"]; nb.inputs["Emission Color"].default_value = (0.75, 0.92, 1, 1); nb.inputs["Base Color"].default_value = (1, 1, 1, 1); MATS["lens_glow"] = g
glow = nb.inputs["Emission Strength"]
groups = {}
for p in M["pieces"]:
    bpy.ops.wm.ply_import(filepath=f"{src}/{p['file']}"); o = bpy.context.selected_objects[0]; o.scale = (0.001,) * 3
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_auto_smooth(angle=math.radians(38))
    o.data.materials.clear(); o.data.materials.append(MATS[p["material"]]); groups.setdefault(p["link"], []).append(o); o["base"] = list(o.matrix_world.translation)


def capsule(a_, b_, r):
    """a dark limb between two points"""
    d = b_ - a_; bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=32, location=(a_ + b_) / 2); o = bpy.context.object
    o.rotation_mode = "QUATERNION"; o.rotation_quaternion = d.to_track_quat("Z", "Y"); bpy.ops.object.transform_apply(location=True, rotation=True); bpy.ops.object.shade_smooth()
    o.data.materials.append(MATS["suit"])
    for e in (a_, b_):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=e, segments=24, ring_count=14); s = bpy.context.object; bpy.ops.object.shade_smooth(); s.data.materials.append(MATS["suit"]); s.parent = o
    return o


def bone(name, pivot, parent=None):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = pivot
    if parent: e.parent = parent; e.location = pivot - parent.matrix_world.translation; 
    e.rotation_mode = "XYZ"; bpy.context.view_layer.update(); return e


def attach(o, e): o.parent = e; o.matrix_parent_inverse = e.matrix_world.inverted()


root = bone("person", Vector((0, 0, 0)))
bpy.context.view_layer.update()
hipc, neck = J["hip_c"] * 0.97, J["neck"] * 0.97
attach(capsule(hipc + Vector((0, 0.05, 0)), neck - Vector((0, -0.075, 0.14)), 0.074), root); attach(capsule(hipc + Vector((0, -0.05, 0)), neck - Vector((0, 0.075, 0.14)), 0.074), root)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.086, location=neck + Vector((0.02, 0, 0.12)), segments=32, ring_count=20); hd = bpy.context.object; bpy.ops.object.shade_smooth(); hd.data.materials.append(MATS["suit"]); attach(hd, root)
attach(capsule(neck - Vector((0, 0, 0.03)), neck + Vector((0, 0, 0.06)), 0.046), root)
L = {}
for sd, n in ((1, "left"), (-1, "right")):
    Y = Vector((1, sd, 1)); P = lambda k: Vector((J[k].x, J[k].y * sd, J[k].z)) * 0.97
    th = bone(f"{n}_th", P("hip"), root); sh = bone(f"{n}_sh", P("knee"), th); ua = bone(f"{n}_ua", P("shoulder"), root); fa = bone(f"{n}_fa", P("elbow"), ua)
    attach(capsule(P("hip"), P("knee"), 0.06), th); attach(capsule(P("knee"), P("ankle"), 0.043), sh)
    attach(capsule(P("shoulder"), P("elbow"), 0.04), ua); attach(capsule(P("elbow"), P("wrist"), 0.033), fa); attach(capsule(P("wrist"), P("hand_end"), 0.026), fa)
    bpy.ops.mesh.primitive_cube_add(size=1, location=P("ankle") + Vector((0.05, 0, -0.05))); ft = bpy.context.object; ft.scale = (0.22, 0.075, 0.06); bpy.ops.object.transform_apply(scale=True); ft.data.materials.append(MATS["suit"]); attach(ft, sh)
    L[n] = (th, sh, ua, fa)

w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.014, 0.018, 1)
bpy.ops.mesh.primitive_plane_add(size=40); bpy.context.object.data.materials.append(paint("floor", (0.03, 0.03, 0.035), 0.1, 0.32))


def softbox(loc, size, power, col=(1, 1, 1)):
    l = bpy.data.lights.new("l", "AREA"); l.size = size; l.energy = power; l.color = col; o = bpy.data.objects.new("l", l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


softbox((3.2, -2.4, 3.0), 2.4, 520, (1, 0.95, 0.88)); softbox((3.0, 2.8, 1.8), 2.0, 240, (0.8, 0.88, 1)); softbox((-3.4, -1.4, 3.2), 2.6, 620, (0.85, 0.92, 1)); softbox((-2.4, 2.6, 2.2), 2.0, 300)
cam = bpy.data.cameras.new("c"); cam.lens = 70; co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co


def ease(t): t = min(max(t, 0), 1); return t * t * (3 - 2 * t)
def span(f, a_, b_): return ease((f - a_) / (b_ - a_))


def rot_about(o, pivot, axis, ang):
    o.matrix_world = Matrix.Translation(pivot) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-pivot)


# door swing of each rear half: hinged at the outer edge of its part, opening backwards and out
DOORS = {"pelvis:b": ((0, 0.19, 1.2), "Z", 0.0)}
def pose(f):
    op = span(f, 18, 44) - span(f, 118, 146); mask = span(f, 6, 26) - span(f, 142, 168)
    for link, objs in groups.items():
        for o in objs:
            o.matrix_world = Matrix.Identity(4)
    if "helmet_faceplate" in groups:
        h = Vector((-0.006, 0, (M["chin"] + 158) / 1000))
        for o in groups["helmet_faceplate"]: rot_about(o, h, "Y", -1.0 * mask)
    for link, objs in groups.items():
        if not link.endswith(":b"): continue
        n = link[:-2]; sd = 1 if n.startswith("left") else -1 if n.startswith("right") else 0
        back = Vector((-0.42 - (0.14 if n in ("pelvis", "head") else 0.0), 0.2 * sd, 0.04))
        for o in objs: o.matrix_world = Matrix.Translation(back * op)
    # the person: walks in from behind, stops inside
    wk = span(f, 40, 106); x = -2.5 * (1 - wk); root.location = Vector((x, 0, 0)); ph = (f - 40) * 0.42; amp = 0.52 * (1 - span(f, 96, 108)) * (1 if f < 108 else 0)
    for n, s_ in (("left", 1), ("right", -1)):
        th, sh, ua, fa = L[n]; q = math.sin(ph) * s_
        th.rotation_euler = (0, -q * amp, 0); sh.rotation_euler = (0, max(0, -math.cos(ph) * s_) * amp * 1.5, 0); ua.rotation_euler = (0, q * amp * 0.7, 0); fa.rotation_euler = (0, -0.25 * amp, 0)
    glow.default_value = 26 * (1 - span(f, 2, 12) + span(f, 160, 174))
    # camera: orbits from behind-left to the front as the armour closes
    az = math.radians(205 - 165 * span(f, 110, 178)); d = 5.4; p = Vector((math.cos(az) * d, math.sin(az) * d - 0.2, 1.22)); co.location = p
    co.rotation_euler = (Vector((-0.25 * (1 - span(f, 110, 170)), 0, 0.98)) - p).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()


for f in range(first, last + 1, step):
    pose(f); sc.render.filepath = f"{out}/f{f:04d}.png"; bpy.ops.render.render(write_still=True); print("frame", f, flush=True)
