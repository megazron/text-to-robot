"""Path-traced stills of the forged suit.
  blender -b -P scripts/studio/cycles_mark43.py -- <forge-dir> <out-dir> [samples] [width] [views]"""
import bpy, glob, math, os, sys
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]; samples = int(a[2]) if len(a) > 2 else 64; W = int(a[3]) if len(a) > 3 else 900
views = a[4].split(",") if len(a) > 4 else ["front", "three_quarter", "bust", "back"]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y = W, int(W * 1.25); sc.render.film_transparent = False; sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"


def paint(name, base, metal, rough, coat=0.0, coat_rough=0.05):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat; b.inputs["Coat Roughness"].default_value = coat_rough
    return m


MATS = {"armour_red": paint("red", (0.26, 0.003, 0.008), 0.8, 0.26, 1.0, 0.03), "armour_gold": paint("gold", (0.62, 0.41, 0.17), 1.0, 0.33, 0.4, 0.15),
        "armour_silver": paint("steel", (0.55, 0.56, 0.59), 1.0, 0.3), "armour_mech": paint("mech", (0.07, 0.07, 0.08), 1.0, 0.38)}
g = bpy.data.materials.new("glow"); g.use_nodes = True; nb = g.node_tree.nodes["Principled BSDF"]; nb.inputs["Emission Color"].default_value = (0.75, 0.92, 1, 1); nb.inputs["Emission Strength"].default_value = 26; nb.inputs["Base Color"].default_value = (1, 1, 1, 1); MATS["lens_glow"] = g
for f in glob.glob(f"{src}/*.ply"):
    n = os.path.basename(f)[:-4]; bpy.ops.wm.ply_import(filepath=f); o = bpy.context.selected_objects[0]; o.scale = (0.001,) * 3
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_auto_smooth(angle=math.radians(38))
    if MATS.get(n): o.data.materials.clear(); o.data.materials.append(MATS[n])
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.014, 0.018, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
bpy.ops.mesh.primitive_plane_add(size=30); fl = bpy.context.object; fl.data.materials.append(paint("floor", (0.03, 0.03, 0.035), 0.1, 0.32))


def softbox(loc, size, power, col=(1, 1, 1)):
    l = bpy.data.lights.new("l", "AREA"); l.size = size; l.energy = power; l.color = col; o = bpy.data.objects.new("l", l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return o


softbox((3.2, -2.2, 3.0), 2.4, 520, (1, 0.95, 0.88)); softbox((3.0, 2.6, 1.8), 2.0, 240, (0.8, 0.88, 1)); softbox((-3, 0.2, 3.2), 2.6, 480, (0.85, 0.92, 1)); softbox((1.4, 0, 4.2), 1.8, 220)
cam = bpy.data.cameras.new("c"); cam.lens = 85; co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
V = {"front": (5, 6.2, 1.0, 0.94), "three_quarter": (36, 6.2, 1.1, 0.94), "back": (186, 6.2, 1.1, 0.94), "bust": (14, 2.5, 1.56, 1.5)}
V.update({f"h{a_}": (a_, 1.25, 1.74, 1.71) for a_ in (0, 45, 90, 135, 180, 315)}); V["htop"] = (20, 0.9, 2.6, 1.72)
for n in views:
    az, d, h, ly = V[n]; p = Vector((math.cos(math.radians(az)) * d, math.sin(math.radians(az)) * d, h)); co.location = p
    co.rotation_euler = (Vector((0, 0, ly)) - p).to_track_quat("-Z", "Y").to_euler(); sc.render.filepath = f"{out}/{n}.png"; bpy.ops.render.render(write_still=True)
