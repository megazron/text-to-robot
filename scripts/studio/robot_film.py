"""Path-traced stills and film frames of an example, from its URDF, meshes and a recorded motion (scripts/studio/motion.py).

  blender -b -P scripts/studio/robot_film.py -- <example-dir> <motion.json> <out-dir> [key=value ...]
    frames=all | 0,12,24     frames of the motion to render, written as f0000.png
    views=35:18,215:18,...   az:elevation stills of frame `pose` instead of the film (written as v35_18.png)
    pose=0  samples=40  w=560  h=350  device=CPU|GPU  threads=14  focus=link  zoom=1

Geometry comes only from the URDF: every visual is placed by the pose MuJoCo reports for its link. Colours come from the URDF
materials; the name of a material decides how the surface behaves (PLA, anodised metal, rubber, solder mask, LEDs).
"""
import bpy, json, math, os, sys
import xml.etree.ElementTree as ET
from mathutils import Euler, Matrix, Quaternion, Vector

a = sys.argv[sys.argv.index("--") + 1:]
exdir, motion_path, out = a[0], a[1], a[2]
opt = dict(x.split("=", 1) for x in a[3:])
samples, W, H = int(opt.get("samples", 40)), int(opt.get("w", 560)), int(opt.get("h", 350))
os.makedirs(out, exist_ok=True)
motion = json.load(open(motion_path)); frames = motion["frames"]
scene_opts = motion.get("scene", {})

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = "CYCLES"; cy = sc.cycles
cy.samples = samples; cy.use_denoising = True; cy.denoiser = "OPENIMAGEDENOISE"; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.04
cy.max_bounces = 6; cy.diffuse_bounces = 3; cy.glossy_bounces = 3; cy.transmission_bounces = 4; cy.caustics_reflective = False; cy.caustics_refractive = False
sc.render.threads_mode = "FIXED"; sc.render.threads = int(opt.get("threads", 14)); sc.render.use_persistent_data = True
cy.device = "CPU"
if opt.get("device") == "GPU":
    prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    if not any(d.type == "OPTIX" for d in prefs.devices): prefs.compute_device_type = "CUDA"; prefs.get_devices()   # WSL often shows CUDA only
    for d in prefs.devices: d.use = d.type != "CPU"
    if not any(d.use for d in prefs.devices): sys.exit("no GPU for Cycles")
    print("rendering on", [d.name for d in prefs.devices if d.use], prefs.compute_device_type, flush=True)
    cy.device = "GPU"
sc.render.resolution_x, sc.render.resolution_y = W, H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"; sc.render.image_settings.file_format = "PNG"


def lin(c): return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c[:3])


def shader(name, base, metal=0.0, rough=0.45, coat=0.0, coat_rough=0.1, spec=0.5, emit=None, sheen=0.0, bevel=0.0009, transmission=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat; b.inputs["Coat Roughness"].default_value = coat_rough; b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Sheen Weight"].default_value = sheen; b.inputs["Transmission Weight"].default_value = transmission
    if emit: b.inputs["Emission Color"].default_value = (*emit[0], 1); b.inputs["Emission Strength"].default_value = emit[1]
    if bevel:   # rounds what an STL leaves razor sharp, so edges catch light as moulded and printed edges do
        n = nt.nodes.new("ShaderNodeBevel"); n.samples = 3; n.inputs["Radius"].default_value = bevel; nt.links.new(n.outputs[0], b.inputs["Normal"])
    return m


# Bought parts in the colours they arrive in (a URDF gives a whole category one colour, and every lidar is not solder-mask green)
PART_LOOK = {"hobby_sg90": ("actuator", (0.07, 0.2, 0.62)), "hobby_mg90s": ("actuator", (0.08, 0.08, 0.09)), "hobby_mg996r": ("actuator", (0.05, 0.05, 0.06)), "hobby_ds3218": ("actuator", (0.05, 0.05, 0.06)),
             "tt_gearmotor_1to48": ("actuator", (0.92, 0.68, 0.08)), "hc_sr04": ("metal", (0.7, 0.71, 0.72)) if "wall_e" in exdir else ("electronics", (0.05, 0.2, 0.6)), "arduino_nano_clone": ("electronics", (0.03, 0.2, 0.55)), "arduino_uno_clone": ("electronics", (0.0, 0.42, 0.48)),
             "breadboard_400": ("printed", (0.9, 0.9, 0.86)), "pca9685_clone": ("electronics", (0.15, 0.1, 0.45)), "tb6612fng_module": ("electronics", (0.55, 0.05, 0.08)), "buck_lm2596": ("electronics", (0.05, 0.25, 0.55))}
LOOK_BY_NAME = [("lidar", "actuator", (0.05, 0.05, 0.055)), ("realsense", "metal", (0.5, 0.52, 0.55)), ("depth", "metal", (0.5, 0.52, 0.55)), ("oak_", "metal", (0.5, 0.52, 0.55)), ("rplidar", "actuator", (0.05, 0.05, 0.055)),
                ("ld06", "actuator", (0.05, 0.05, 0.055)), ("ld19", "actuator", (0.05, 0.05, 0.055)), ("feetech", "actuator", (0.05, 0.05, 0.055)), ("dynamixel", "actuator", (0.06, 0.06, 0.065))]


def look_of(stem):
    if stem in PART_LOOK: return PART_LOOK[stem]
    return next(((m, c) for key, m, c in LOOK_BY_NAME if key in stem), None)


def weathered(name, paint, under, metal=0.0, rust=(0.22, 0.09, 0.035), wear=0.55):
    """Old paint: rust patches and vertical streaks from noise, bare metal rubbed through on the edges (ambient occlusion seen from inside finds them)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]; L = nt.links.new
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1, 1, 0.22); L(tc.outputs["Object"], mp.inputs[0])
    big = nt.nodes.new("ShaderNodeTexNoise"); big.inputs["Scale"].default_value = 26; big.inputs["Detail"].default_value = 9; big.inputs["Roughness"].default_value = 0.62; L(tc.outputs["Object"], big.inputs[0])
    streak = nt.nodes.new("ShaderNodeTexNoise"); streak.inputs["Scale"].default_value = 70; streak.inputs["Detail"].default_value = 5; L(mp.outputs[0], streak.inputs[0])
    r1 = nt.nodes.new("ShaderNodeValToRGB"); r1.color_ramp.elements[0].position = 0.52; r1.color_ramp.elements[1].position = 0.64; L(big.outputs[0], r1.inputs[0])
    r2 = nt.nodes.new("ShaderNodeValToRGB"); r2.color_ramp.elements[0].position = 0.56; r2.color_ramp.elements[1].position = 0.7; L(streak.outputs[0], r2.inputs[0])
    both = nt.nodes.new("ShaderNodeMath"); both.operation = "MAXIMUM"; L(r1.outputs[0], both.inputs[0]); L(r2.outputs[0], both.inputs[1])
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion"); ao.inside = True; ao.samples = 6; ao.inputs["Distance"].default_value = 0.004
    er = nt.nodes.new("ShaderNodeValToRGB"); er.color_ramp.elements[0].position = 0.08; er.color_ramp.elements[1].position = 0.45; L(ao.outputs["AO"], er.inputs[0])
    edge = nt.nodes.new("ShaderNodeInvert"); L(er.outputs[0], edge.inputs[1])
    c1 = nt.nodes.new("ShaderNodeMix"); c1.data_type = "RGBA"; c1.inputs["A"].default_value = (*paint, 1); c1.inputs["B"].default_value = (*rust, 1); L(both.outputs[0], c1.inputs["Factor"])
    c2 = nt.nodes.new("ShaderNodeMix"); c2.data_type = "RGBA"; c2.inputs["B"].default_value = (*under, 1); L(c1.outputs["Result"], c2.inputs["A"])
    k = nt.nodes.new("ShaderNodeMath"); k.operation = "MULTIPLY"; k.inputs[1].default_value = wear; L(edge.outputs[0], k.inputs[0]); L(k.outputs[0], c2.inputs["Factor"]); L(c2.outputs["Result"], b.inputs["Base Color"])
    ro = nt.nodes.new("ShaderNodeMapRange"); ro.inputs["To Min"].default_value = 0.42; ro.inputs["To Max"].default_value = 0.88; L(both.outputs[0], ro.inputs["Value"]); L(ro.outputs[0], b.inputs["Roughness"])
    me = nt.nodes.new("ShaderNodeMath"); me.operation = "MAXIMUM"; me.inputs[1].default_value = metal; L(k.outputs[0], me.inputs[0]); L(me.outputs[0], b.inputs["Metallic"])
    bv = nt.nodes.new("ShaderNodeBevel"); bv.samples = 3; bv.inputs["Radius"].default_value = 0.0009; L(bv.outputs[0], b.inputs["Normal"])
    return m


def material_for(name, rgba):
    c = lin(rgba); n = name.lower()
    if n == "walle": return weathered(n, c, (0.42, 0.40, 0.37))
    if n == "walle_grey": return weathered(n, c, (0.62, 0.6, 0.56), metal=0.55, rust=(0.2, 0.11, 0.06), wear=0.7)
    if n == "walle_rust": return weathered(n, c, (0.4, 0.36, 0.32), metal=0.3, rust=(0.1, 0.05, 0.03))
    if n in ("lens_glow", "led"): return shader(n, c, rough=0.3, emit=(c, 9.0), bevel=0)
    if n == "visor": return shader(n, c, rough=0.06, coat=1.0, coat_rough=0.02, spec=0.8, bevel=0)
    if "armour_red" in n: return shader(n, c, metal=0.8, rough=0.26, coat=1.0, coat_rough=0.03)
    if "armour" in n: return shader(n, c, metal=1.0, rough=0.32, coat=0.4, coat_rough=0.15)
    if n in ("metal", "aluminium", "steel"): return shader(n, c, metal=1.0, rough=0.3)
    if n == "rubber": return shader(n, c, rough=0.82, spec=0.35)
    if n == "electronics": return shader(n, c, rough=0.32, coat=0.6, coat_rough=0.2)
    if n == "battery": return shader(n, c, rough=0.28, coat=0.7, coat_rough=0.12)
    if n == "actuator": return shader(n, c, rough=0.38, spec=0.6)
    if n == "fabric": return shader(n, c, rough=0.75, sheen=0.6, spec=0.4, bevel=0)
    if n == "walle": return shader(n, c, metal=0.3, rough=0.42, coat=0.25, coat_rough=0.3)
    return shader(n, c, rough=0.44, spec=0.5, coat=0.08, coat_rough=0.35)   # PLA: satin plastic


# ---- robot from the URDF
root = ET.parse(f"{exdir}/robot.urdf").getroot()
colours = {m.get("name"): [float(v) for v in m.find("color").get("rgba").split()] for m in root.findall("material") if m.find("color") is not None}
mats = {}
def get_mat(name, stem=""):
    look = look_of(stem) if stem else None
    key = f"{name}|{stem}" if look else name
    if key not in mats: mats[key] = material_for(look[0], (*look[1], 1)) if look else material_for(name, colours.get(name, (0.5, 0.5, 0.5, 1)))
    return mats[key]


def origin(el):
    o = el.find("origin") if el is not None else None
    xyz = [float(v) for v in (o.get("xyz", "0 0 0") if o is not None else "0 0 0").split()]
    rpy = [float(v) for v in (o.get("rpy", "0 0 0") if o is not None else "0 0 0").split()]
    return Matrix.Translation(xyz) @ Euler(rpy, "XYZ").to_matrix().to_4x4()


meshes, items = {}, []
for link in root.findall("link"):
    for v in link.findall("visual"):
        g = v.find("geometry"); mesh = g.find("mesh")
        mat = v.find("material"); mname = mat.get("name") if mat is not None else "printed"
        if mesh is not None:
            f = mesh.get("filename").split("/")[-1]
            if f not in meshes:
                bpy.ops.wm.stl_import(filepath=f"{exdir}/meshes/{f}"); o = bpy.context.selected_objects[0]; me = o.data
                me.shade_smooth(); me.set_sharp_from_angle(angle=math.radians(34)); bpy.data.objects.remove(o); meshes[f] = me; me.use_fake_user = True
            data = meshes[f]
        else:
            s = g.find("sphere"); c = g.find("cylinder"); b = g.find("box")
            if s is not None and float(s.get("radius")) <= 0.005: continue      # massless frame markers are not parts
            if s is not None: bpy.ops.mesh.primitive_uv_sphere_add(radius=float(s.get("radius")), segments=32, ring_count=16)
            elif c is not None: bpy.ops.mesh.primitive_cylinder_add(radius=float(c.get("radius")), depth=float(c.get("length")), vertices=40)
            elif b is not None:
                bpy.ops.mesh.primitive_cube_add(size=1); bpy.context.object.scale = [float(x) for x in b.get("size").split()]; bpy.ops.object.transform_apply(scale=True)
            else: continue
            o = bpy.context.object; data = o.data; bpy.data.objects.remove(o)
        o = bpy.data.objects.new(link.get("name"), data); sc.collection.objects.link(o)
        items.append((o, link.get("name"), origin(v), mname, f[:-4] if mesh is not None else ""))
for me in meshes.values():
    if not me.materials: me.materials.append(None)
for o, _, _, mname, stem in items:
    if o.data.materials: o.material_slots[0].link = "OBJECT"; o.material_slots[0].material = get_mat(mname, stem)
    else: o.data.materials.append(get_mat(mname, stem))


# ---- the harness: the routes stored in metadata.design.wiring, each waypoint riding on the link it is closest to
spec = json.load(open(f"{exdir}/robot.json")); wiring = (spec["metadata"].get("design") or {}).get("wiring") or {}
home = {k: Matrix.Translation(v[:3]) @ Quaternion(v[3:7]).to_matrix().to_4x4() for k, v in motion.get("home", {}).items()}
WIRE = {"red": (0.75, 0.03, 0.03), "black": (0.012, 0.012, 0.014), "yellow": (0.85, 0.65, 0.05), "white": (0.8, 0.8, 0.78), "blue": (0.03, 0.12, 0.7), "green": (0.03, 0.4, 0.1), "orange": (0.85, 0.3, 0.03), "brown": (0.16, 0.07, 0.03), "purple": (0.3, 0.05, 0.5), "grey": (0.3, 0.3, 0.32), "gray": (0.3, 0.3, 0.32)}
wire_mats = {}
def wire_mat(c):
    if c not in wire_mats: wire_mats[c] = shader("wire_" + c, WIRE.get(c, WIRE["grey"]), rough=0.42, coat=0.2, coat_rough=0.3, bevel=0)
    return wire_mats[c]


def link_centres():
    out = {}
    for o, link, vis, *_ in items:
        if link in home:
            cs = [Vector(c) for c in o.bound_box]; out[link] = home[link] @ vis @ (sum(cs, Vector()) / 8)
    return out


cables = []
if home and wiring.get("cables") and opt.get("cables", "1") == "1":
    centres = link_centres()
    for c in wiring["cables"]:
        pts = [Vector(p) / 1000 for p in c.get("path_mm", [])]; links = [l for l in c.get("links", []) if l in home]
        if len(pts) < 2 or not links: continue
        # dense polyline, so the spline bends between waypoints instead of cutting across them
        anchors = [min(links, key=lambda l: (centres.get(l, Vector((9, 9, 9))) - p).length) for p in pts]
        od = max(float(c.get("od_mm", 3)), 1.2) / 1000; wires = c.get("wires", [])
        colours_ = [w.get("color", "black") for w in wires][:3] if len(wires) <= 4 else ["black"]
        n = len(colours_); r = od / (2 if n == 1 else 2.6)
        for i, col in enumerate(colours_):
            cu = bpy.data.curves.new("cable", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r; cu.bevel_resolution = 1; cu.resolution_u = 6
            sp = cu.splines.new("NURBS"); sp.points.add(len(pts) - 1); sp.use_endpoint_u = True; sp.order_u = min(4, len(pts))
            cu.materials.append(wire_mat(col)); o = bpy.data.objects.new("cable", cu); sc.collection.objects.link(o)
            cables.append((sp, pts, anchors, (i - (n - 1) / 2) * r * 1.9))


def pose_cables(fr):
    for sp, pts, anchors, off in cables:
        moved = []
        for p, l in zip(pts, anchors):
            q = fr.get(l)
            moved.append(Matrix.Translation(q[:3]) @ Quaternion(q[3:7]).to_matrix().to_4x4() @ home[l].inverted() @ p if q else p)
        for i, p in enumerate(moved):
            t = (moved[min(i + 1, len(moved) - 1)] - moved[max(i - 1, 0)]); side = t.cross(Vector((0, 0, 1)))
            if side.length < 1e-9: side = Vector((0, 1, 0))
            sp.points[i].co = (*(p + side.normalized() * off), 1)


def pose(frame):
    fr = frames[frame]
    pose_cables(fr)
    for o, link, vis, *_ in items:
        p = fr.get(link)
        if p is None: continue
        o.matrix_world = Matrix.Translation(p[:3]) @ Quaternion(p[3:7]).to_matrix().to_4x4() @ vis
    bpy.context.view_layer.update()


def moving_chain():
    """On a bolted-down robot: the links that move and everything between them and the root. A control box on the bench is in the
    scene, but the arm is what the shot is framed on."""
    first, parent = frames[0], {j.find("child").get("link"): j.find("parent").get("link") for j in root.findall("joint")}
    moved = {l for l, p in first.items() if any(abs(a_ - b_) > 1e-3 for fr in frames[::6] for a_, b_ in zip(p[:3], fr[l][:3]))}
    root_name = motion.get("root")
    if root_name in moved or not moved: return None
    chain = set(moved)
    for l in moved:
        while l in parent: l = parent[l]; chain.add(l)
    return chain


PTS = []


def bounds(frame_ids, only=None):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3); PTS.clear()
    keep = {only} if only else moving_chain()
    for f in frame_ids:
        pose(f)
        for o, link, *_ in items:
            if keep and link not in keep: continue
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w)); PTS.append(w)
    return lo, hi


all_f = list(range(0, len(frames), max(1, len(frames) // 12)))
follow = scene_opts.get("follow", False)
lo, hi = bounds([0] if follow else all_f)
follow = float(follow)
if follow:   # the camera tracks this share of the base's travel; the rest is seen as motion across the frame
    track = [frames[f][motion["root"]][:2] for f in all_f]; t0 = track[0]; base_pts = list(PTS)
    PTS[:] = [v + Vector(((1 - follow) * (p[0] - t0[0]), (1 - follow) * (p[1] - t0[1]), 0)) for p in track for v in base_pts]
print("lowest point of the robot", round(lo.z, 4), flush=True)
centre, size = (lo + hi) / 2, hi - lo
span = max(size.x, size.y, size.z * 1.1, 0.12)

# ---- studio, scaled to the robot
S = span
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*lin((0.055, 0.062, 0.07)), 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
# the floor sits under whatever is lowest: a gripper's bench case hangs below its model origin
pose(0); ground = min([0.0] + [(o.matrix_world @ Vector(c)).z for o, *_ in items for c in o.bound_box])
if ground > -0.005: ground = 0.0
bpy.ops.mesh.primitive_plane_add(size=max(60 * S, 12), location=(0, 0, ground)); fl = bpy.context.object
fl.data.materials.append(shader("floor", lin((0.11, 0.12, 0.135)), metal=0.0, rough=0.5, spec=0.4, bevel=0))
cell = float(scene_opts.get("grid", 0.1 if S < 2 else 0.5)); n = int(min(max(12 * S / cell, 16), 160)); lw = max(cell * 0.012, S * 0.0012)
verts, faces = [], []
for i in range(-n, n + 1):
    for ax in (0, 1):
        p = i * cell; L = n * cell; q = len(verts)
        r = [(p - lw, -L, 0.0002), (p + lw, -L, 0.0002), (p + lw, L, 0.0002), (p - lw, L, 0.0002)]
        if ax: r = [(y, x, z) for x, y, z in r]
        verts += r; faces.append((q, q + 1, q + 2, q + 3))
gm = bpy.data.meshes.new("grid"); gm.from_pydata(verts, [], faces); go = bpy.data.objects.new("grid", gm); sc.collection.objects.link(go)
gm.materials.append(shader("gridline", lin((0.16, 0.18, 0.19)), rough=0.5, bevel=0))
go.location = (*scene_opts.get("grid_offset", (0, 0)), ground)


def softbox(rel, size_, power, col=(1, 1, 1)):
    l = bpy.data.lights.new("l", "AREA"); l.size = size_ * S; l.energy = power * S * S; l.color = col
    o = bpy.data.objects.new("l", l); sc.collection.objects.link(o)
    o.location = centre + Matrix.Rotation(math.radians(float(scene_opts.get("az", 35)) - 35), 3, "Z") @ Vector(rel) * S   # the rig turns with the camera
    o.rotation_euler = (centre - o.location).to_track_quat("-Z", "Y").to_euler(); return o


softbox((1.7, 1.2, 2.1), 1.5, 150, (1, 0.96, 0.9)); softbox((1.2, -2.0, 0.9), 1.3, 62, (0.82, 0.9, 1)); softbox((-2.0, 0.3, 1.8), 1.7, 150, (0.86, 0.93, 1)); softbox((0.2, 0, 2.6), 1.4, 46)
cam = bpy.data.cameras.new("c"); cam.lens = 70; cam.sensor_width = 36; co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
aspect = W / H
zoom = float(opt.get("zoom", 1))


def fit(az, el):
    """Target and distance at which every sampled corner of the robot fills the frame from this direction, with a margin."""
    az, el = math.radians(az), math.radians(el)
    fwd = -Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))); right = fwd.cross(Vector((0, 0, 1))).normalized(); up = right.cross(fwd)
    rs, us = [v @ right for v in PTS], [v @ up for v in PTS]
    mid = right * ((min(rs) + max(rs)) / 2) + up * ((min(us) + max(us)) / 2) + fwd * (sum(v @ fwd for v in PTS) / len(PTS))
    tx = 18 / cam.lens; ty = tx / aspect; need = 0
    for v in PTS:
        w_ = v - mid; depth = -(w_ @ fwd); need = max(need, depth + abs(w_ @ right) / tx, depth + abs(w_ @ up) / ty)
    return mid, need * 1.07 / zoom


def aim(az, el, target, dist_):
    az, el = math.radians(az), math.radians(el)
    p = target + dist_ * Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))); co.location = p
    co.rotation_euler = (target - p).to_track_quat("-Z", "Y").to_euler()


az0, el0 = float(scene_opts.get("az", 35)), float(scene_opts.get("el", 16))
if "focus" in opt: bounds([int(opt.get("pose", 0))], opt["focus"])
if "views" in opt:
    fi = int(opt.get("pose", 0)); pose(fi); shift = Vector((0, 0, 0))
    if follow:
        p, p0 = frames[fi][motion["root"]], frames[0][motion["root"]]; shift = Vector((follow * (p[0] - p0[0]), follow * (p[1] - p0[1]), 0))
    for v in opt["views"].split(","):
        az, el = (float(x) for x in v.split(":")); t_, d_ = fit(az, el); aim(az, el, t_ + shift, d_)
        sc.render.filepath = f"{out}/v{int(az)}_{int(el)}.png"; bpy.ops.render.render(write_still=True)
    sys.exit(0)
ids = range(len(frames)) if opt.get("frames", "all") == "all" else [int(x) for x in opt["frames"].split(",")]
sway = float(scene_opts.get("sway", 7)); fits = [fit(az0 + s_, el0) for s_ in (-sway, 0, sway)]
film_target, film_dist = fits[1][0], max(f_[1] for f_ in fits)
root_link = motion.get("root") or root.find("link").get("name")
for f in ids:
    pose(f); ph = 2 * math.pi * f / len(frames); target = film_target.copy()
    if follow:
        p = frames[f][root_link]; p0 = frames[0][root_link]; target.x += follow * (p[0] - p0[0]); target.y += follow * (p[1] - p0[1])
    aim(az0 + sway * math.sin(ph), el0 + 1.5 * math.cos(ph), target, film_dist)
    sc.render.filepath = f"{out}/f{f:04d}.png"; bpy.ops.render.render(write_still=True)
