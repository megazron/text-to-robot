"""The suit-up film, from the real mechanism: every mesh, hinge line, joint limit and the opening order come from the built example (forge_mark43.py --anim <dir> examples/14_iron_man_mark_43),
so what opens here is what is in the URDF. Pawls lift, the doors open stage by stage on their servos, the mask lifts, a person in a black undersuit steps in from behind, and it all closes in reverse.
  blender -b -P scripts/studio/suit_up.py -- <anim-dir> <frames-dir> [samples] [width] [first] [last] [step]
GIF (one palette for the whole film, so the gold keeps its colour; only changed regions are stored):
  ffmpeg -framerate 6.25 -i frames/%04d.png -vf "scale=460:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" out.gif"""
import bpy, json, math, os, sys
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]; samples = int(a[2]) if len(a) > 2 else 24; W = int(a[3]) if len(a) > 3 else 640
first = int(a[4]) if len(a) > 4 else 0; last = int(a[5]) if len(a) > 5 else 270; step = int(a[6]) if len(a) > 6 else 1
os.makedirs(out, exist_ok=True); M = json.load(open(f"{src}/anim.json"))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y = W, int(W * 1.1); sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"; sc.view_settings.exposure = -0.3


def paint(name, base, metal, rough, coat=0.0, coat_rough=0.05):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat; b.inputs["Coat Roughness"].default_value = coat_rough
    return m


MATS = {"armour_red": paint("red", (0.26, 0.003, 0.008), 0.8, 0.26, 1.0, 0.03), "armour_gold": paint("gold", (0.62, 0.41, 0.17), 1.0, 0.33, 0.4, 0.15), "armour_silver": paint("steel", (0.34, 0.35, 0.37), 1.0, 0.34),
        "armour_mech": paint("mech", (0.07, 0.07, 0.08), 1.0, 0.38), "suit": paint("undersuit", (0.006, 0.006, 0.007), 0.0, 0.78), "actuator": paint("servo", (0.03, 0.03, 0.035), 0.3, 0.4),
        "electronics": paint("board", (0.02, 0.2, 0.1), 0.2, 0.4), "metal": paint("metal", (0.6, 0.6, 0.62), 1.0, 0.3), "battery": paint("cell", (0.05, 0.1, 0.4), 0.2, 0.4), "rubber": paint("rubber", (0.02, 0.02, 0.02), 0, 0.7), "printed_dark": paint("dark", (0.05, 0.05, 0.06), 0, 0.5)}
MATS["suit"].node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.12
g = bpy.data.materials.new("glow"); g.use_nodes = True; nb = g.node_tree.nodes["Principled BSDF"]; nb.inputs["Emission Color"].default_value = (0.75, 0.92, 1, 1); nb.inputs["Base Color"].default_value = (1, 1, 1, 1); MATS["lens_glow"] = g
glow = nb.inputs["Emission Strength"]


def lined(src_):
    """outside: the paint; inside a shell: the same paint, darker, so the hairline seams between printed pieces do not read as black cracks"""
    m = src_.copy(); nt = m.node_tree; out_ = nt.nodes["Material Output"]; pb = nt.nodes["Principled BSDF"]; b0 = pb.inputs["Base Color"].default_value
    geo = nt.nodes.new("ShaderNodeNewGeometry"); dk = nt.nodes.new("ShaderNodeBsdfPrincipled"); dk.inputs["Base Color"].default_value = (b0[0] * 0.45, b0[1] * 0.45, b0[2] * 0.45, 1); dk.inputs["Metallic"].default_value = 0.9; dk.inputs["Roughness"].default_value = 0.45
    mx = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(geo.outputs["Backfacing"], mx.inputs[0]); nt.links.new(pb.outputs[0], mx.inputs[1]); nt.links.new(dk.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out_.inputs["Surface"]); return m


LINED = {k: lined(MATS[k]) for k in ("armour_red", "armour_gold", "armour_silver")}


def load(path, mat):
    bpy.ops.wm.ply_import(filepath=path); o = bpy.context.selected_objects[0]; o.scale = (0.001,) * 3
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_auto_smooth(angle=math.radians(38)); o.data.materials.clear(); o.data.materials.append(mat); return o


groups = {}
for p in M["pieces"]: groups.setdefault(p["group"], []).append(load(f"{src}/{p['file']}", LINED.get(p["material"], MATS.get(p["material"], MATS["armour_mech"]))))
person = {f["name"]: dict(f, obj=load(f"{src}/person/{f['file']}", MATS["suit"])) for f in M["figure"]}

w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.014, 0.018, 1)
bpy.ops.mesh.primitive_plane_add(size=40); bpy.context.object.data.materials.append(paint("floor", (0.03, 0.03, 0.035), 0.1, 0.32))


def softbox(loc, size, power, col=(1, 1, 1)):
    l = bpy.data.lights.new("l", "AREA"); l.size = size; l.energy = power; l.color = col; o = bpy.data.objects.new("l", l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


# the studio stills' rig (scripts/studio/cycles_mark43.py), with one more box behind, since the film spends its first half there
softbox((3.2, -2.2, 3.0), 2.4, 520, (1, 0.95, 0.88)); softbox((3.0, 2.6, 1.8), 2.0, 240, (0.8, 0.88, 1)); softbox((-3, 0.2, 3.2), 2.6, 480, (0.85, 0.92, 1)); softbox((1.4, 0, 4.2), 1.8, 220); softbox((-2.6, -2.4, 2.4), 2.0, 200)
INNER = []
for loc in ((-0.03, 0, 1.32), (-0.03, 0, 1.08), (-0.02, 0.12, 0.8), (-0.02, -0.12, 0.8), (-0.02, 0.13, 0.33), (-0.02, -0.13, 0.33), (-0.04, 0.26, 1.3), (-0.04, -0.26, 1.3)):
    l = bpy.data.lights.new("in", "POINT"); l.color = (0.2, 0.42, 1); l.shadow_soft_size = 0.05; o = bpy.data.objects.new("in", l); sc.collection.objects.link(o); o.location = loc; INNER.append(l)
cam = bpy.data.cameras.new("c"); cam.lens = 70; co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co


def ease(t): t = min(max(t, 0), 1); return t * t * (3 - 2 * t)
def span(f, a_, b_): return ease((f - a_) / (b_ - a_))


def about(at, axis, ang):
    p = Vector(at) / 1000; return Matrix.Translation(p) @ Matrix.Rotation(ang, 4, Vector(axis)) @ Matrix.Translation(-p)


far = lambda G: G["lower"] if abs(G["lower"]) > abs(G["upper"]) else G["upper"]
seq = M["sequence"]; pawls = [k for k in M["groups"] if k.endswith("_pawl")]
OPEN0, STAGE = 12, 12                         # pawls lift over frames 6-12, then each stage takes STAGE frames (a real swing is 3 s, the film runs it faster)
OPEN1 = OPEN0 + STAGE * len(seq); WALK0, WALK1 = OPEN1 + 4, OPEN1 + 70; SHUT0 = WALK1 + 6; SHUT1 = SHUT0 + STAGE * len(seq)
END = SHUT1 + 22


def amount(name, f):
    """how far a joint is through its travel at frame f"""
    if name in pawls: return span(f, 6, OPEN0) - span(f, SHUT1, SHUT1 + 6)
    if name == "faceplate": return span(f, OPEN1 - STAGE, OPEN1) - span(f, SHUT0, SHUT0 + STAGE)
    for i, st in enumerate(seq):
        if name in st:
            up = OPEN0 + STAGE * i; down = SHUT0 + STAGE * (len(seq) - 1 - i)
            return span(f, up, up + STAGE) - span(f, down, down + STAGE)
    return 0.0


def pose(f):
    mats = {}
    def world(n):
        if n is None: return Matrix.Identity(4)
        if n not in mats:
            G = M["groups"][n]; mats[n] = world(G["parent"]) @ about(G["at"], G["axis"], far(G) * amount(n, f))
        return mats[n]
    for n, objs in groups.items():
        T = world(n)
        for o in objs: o.matrix_world = T
    op = span(f, OPEN0, OPEN1) - span(f, SHUT0, SHUT1)
    for l in INNER: l.energy = 2.6 * op
    # the person: walks in from behind along the suit's own axis, stops inside, arms and legs in line with the shells
    wk = span(f, WALK0, WALK1); x = -3.2 * (1 - wk); ph = (f - WALK0) * 0.42; amp = 0.42 * (1 - span(f, WALK1 - 22, WALK1 - 4))
    base = Matrix.Translation((x, 0, 0)); T = {}
    def limb(name):
        if name in T: return T[name]
        p = person[name]; n = name.split("_")[0]; s_ = 1 if n == "left" else -1; q = math.sin(ph) * s_; par = limb(p["parent"]) if p["parent"] else base; k = name.split("_", 1)[1] if "_" in name else ""
        ang = {"thigh": -q * amp, "shin": max(0, -math.cos(ph) * s_) * amp * 1.5, "upper_arm": q * amp * 0.6, "forearm": -0.22 * amp}.get(k, 0.0)
        T[name] = par @ about(p["pivot"], (0, 1, 0), ang); return T[name]
    for n, p in person.items(): p["obj"].matrix_world = limb(n); p["obj"].hide_render = f < WALK0
    glow.default_value = 26 * (1 - span(f, 2, 10) + span(f, SHUT1 + 6, SHUT1 + 16))
    # camera: behind the suit while it opens, close on the back and limbs; swings round to the front as it closes
    t = span(f, OPEN0 - 8, OPEN0 + 18) - span(f, WALK0 - 14, WALK0 + 6); az = math.radians(204 + 36 * span(f, WALK0 - 14, WALK0 + 10) - 200 * span(f, SHUT0 - 6, END - 6)); d = 6.0 - 2.3 * t; p = Vector((math.cos(az) * d, math.sin(az) * d, 1.35)); co.location = p
    co.rotation_euler = (Vector((-0.2 * (1 - span(f, SHUT0, END)), 0, 1.0)) - p).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()


print("frames", END, flush=True)
for f in range(first, min(last, END) + 1, step):
    pose(f); sc.render.filepath = f"{out}/f{f:04d}.png"; bpy.ops.render.render(write_still=True); print("frame", f, flush=True)
