"""The suit-up film, as a real suit would do it: servos lift the mask and swing the back open from its centre line on hinges, a person in a
black undersuit steps in from behind, the panels swing shut, the eyes light. Nothing floats: every moving panel turns about a hinge.
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
def lined(src_):
    """outside: the paint; inside a shell: dark machined lining"""
    m = src_.copy(); nt = m.node_tree; out_ = nt.nodes["Material Output"]; pb = nt.nodes["Principled BSDF"]
    geo = nt.nodes.new("ShaderNodeNewGeometry"); dk = nt.nodes.new("ShaderNodeBsdfPrincipled"); dk.inputs["Base Color"].default_value = (0.02, 0.022, 0.026, 1); dk.inputs["Metallic"].default_value = 0.9; dk.inputs["Roughness"].default_value = 0.45
    mx = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(geo.outputs["Backfacing"], mx.inputs[0]); nt.links.new(dk.outputs[0], mx.inputs[1]); nt.links.new(pb.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out_.inputs["Surface"]); return m


LINED = {k: lined(MATS[k]) for k in ("armour_red", "armour_gold", "armour_silver")}
groups = {}
for p in M["pieces"]:
    bpy.ops.wm.ply_import(filepath=f"{src}/{p['file']}"); o = bpy.context.selected_objects[0]; o.scale = (0.001,) * 3
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_auto_smooth(angle=math.radians(38))
    o.data.materials.clear(); o.data.materials.append(LINED.get(p["material"], MATS[p["material"]])); groups.setdefault(p["link"], []).append(o)


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


OPEN = math.radians(82)
def hinge_of(link):
    """(point on the hinge line, its direction, turn sign): every rear panel hangs on its outer edge"""
    n, h = link.split(":"); sd = 1 if (h == "bL" or n.startswith("left")) else -1
    if n == "pelvis": return Vector((-0.03, sd * 0.15, 1.2)), Vector((0, 0, 1)), sd
    if n == "head": return Vector((-0.02, sd * 0.098, 1.7)), Vector((0, 0, 1)), sd
    k = n.split("_", 1)[1]; a_, b_ = {"upper_arm": ("shoulder", "elbow"), "forearm": ("elbow", "wrist"), "thigh": ("hip", "knee"), "shin": ("knee", "ankle")}[k]
    A_ = Vector((J[a_].x, J[a_].y * sd, J[a_].z)); B_ = Vector((J[b_].x, J[b_].y * sd, J[b_].z)); u = (A_ - B_).normalized()
    out_ = Vector((0, sd, 0)); out_ = (out_ - out_.dot(u) * u).normalized(); return (A_ + B_) / 2 + out_ * {"upper_arm": 0.06, "forearm": 0.06, "thigh": 0.09, "shin": 0.066}[k] + Vector((-0.012, 0, 0)), u, sd


def add_hinges():
    """steel hinge barrels with a servo at each moving panel, and the lights inside"""
    for link in groups:
        if ":b" not in link: continue
        p_, u, sd = hinge_of(link); L_ = 0.2 if link.startswith(("pelvis", "head")) is False else 0.3
        bpy.ops.mesh.primitive_cylinder_add(radius=0.009, depth=L_, vertices=24, location=p_); o = bpy.context.object; o.rotation_mode = "QUATERNION"; o.rotation_quaternion = u.to_track_quat("Z", "Y"); bpy.ops.object.shade_smooth(); o.data.materials.append(MATS["armour_silver"])
    for loc in ((-0.03, 0, 1.32), (-0.05, 0.07, 1.16), (-0.05, -0.07, 1.16), (-0.04, 0, 1.45), (-0.02, 0.11, 0.8), (-0.02, -0.11, 0.8), (-0.02, 0.125, 0.33), (-0.02, -0.125, 0.33)):
        l = bpy.data.lights.new("in", "POINT"); l.energy = 3.2; l.color = (0.2, 0.42, 1); l.shadow_soft_size = 0.05; o = bpy.data.objects.new("in", l); sc.collection.objects.link(o); o.location = loc; INNER.append(l)


INNER = []
add_hinges()
def pose(f):
    op = span(f, 20, 50) - span(f, 112, 146); mask = span(f, 6, 28) - span(f, 142, 168)
    for link, objs in groups.items():
        for o in objs:
            o.matrix_world = Matrix.Identity(4)
    if "helmet_faceplate" in groups:
        h = Vector((-0.006, 0, (M["chin"] + 158) / 1000))
        for o in groups["helmet_faceplate"]: rot_about(o, h, "Y", -1.0 * mask)
    for link, objs in groups.items():
        if ":b" not in link: continue
        p_, u, sd = hinge_of(link); R = Matrix.Translation(p_) @ Matrix.Rotation(-sd * OPEN * op, 4, u) @ Matrix.Translation(-p_)
        for o in objs: o.matrix_world = R
    for l in INNER: l.energy = 3.2 * op
    # the person: walks in from behind, stops inside
    wk = span(f, 44, 108); x = -2.5 * (1 - wk); root.location = Vector((x, 0, 0)); ph = (f - 44) * 0.42; amp = 0.5 * (1 - span(f, 94, 108))
    for n, s_ in (("left", 1), ("right", -1)):
        th, sh, ua, fa = L[n]; q = math.sin(ph) * s_
        th.rotation_euler = (0, -q * amp, 0); sh.rotation_euler = (0, max(0, -math.cos(ph) * s_) * amp * 1.5, 0); ua.rotation_euler = (0, q * amp * 0.7, 0); fa.rotation_euler = (0, -0.25 * amp, 0)
    glow.default_value = 26 * (1 - span(f, 2, 12) + span(f, 160, 174))
    # camera: orbits from behind-left to the front as the armour closes
    az = math.radians(212 - 172 * span(f, 116, 178)); d = 5.4; p = Vector((math.cos(az) * d, math.sin(az) * d - 0.2, 1.22)); co.location = p
    co.rotation_euler = (Vector((-0.25 * (1 - span(f, 110, 170)), 0, 0.98)) - p).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()


for f in range(first, last + 1, step):
    pose(f); sc.render.filepath = f"{out}/f{f:04d}.png"; bpy.ops.render.render(write_still=True); print("frame", f, flush=True)
