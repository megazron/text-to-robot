# ttr-mujoco — the Python / MuJoCo layer

The TypeScript side of text-to-robot *generates* the robot. This package is where it becomes
a **simulated, testable, trainable** robot in **MuJoCo**.

```bash
pip install "git+https://github.com/megazron/text-to-robot#subdirectory=python[train]"
# CPU-only PyTorch is recommended on machines without a GPU:
#   pip install torch --index-url https://download.pytorch.org/whl/cpu
#   (and make sure no stray `cuda-bindings` / `nvidia-*` packages are installed -- they crash torch on GPU-less hosts)

ttr-mujoco convert robot.urdf -o robot.mjcf.xml      # URDF -> actuated MuJoCo scene (floor, light, servos, free base)
ttr-mujoco test    robot.urdf                        # simulation test battery (settle, hold, sweep, disturbance)
ttr-mujoco render  robot.urdf -o robot.gif --motion sweep --fixed   # headless GIF (OSMesa/EGL)
ttr-mujoco train   robot.urdf --task stand --steps 400000            # PPO in MuJoCo

# wearable exoskeletons: strap a 75 kg / 1.75 m person in (passive mannequin welded to the cuffs)
ttr-mujoco test   exosuit.urdf --wearer                              # adds a powered-vs-motors-off support test
ttr-mujoco render exosuit.urdf --wearer [--unpowered] -o suit.gif   # show the suit holding (or dropping) the wearer
ttr-mujoco render mark43.sim.urdf --wearer -o don.gif --motion don --orbit 50   # armour donning: plates open -> closed in sequence (doff / open too)
ttr-mujoco render mark43.sim.urdf --wearer -o helmet.gif --motion don --focus helmet --zoom 0.6   # close-up that follows one body
#   render flags: --motion {sweep,hold,drop,don,doff,open} --orbit DEG --azimuth DEG --elevation DEG --zoom X --focus BODY --width --height --fps
```

What the converter does, deterministically:
- position actuators on every joint, gains inferred from mass, forces bounded by each URDF effort limit (missing/invalid effort is an error);
- polygon-mesh parts: `package://` and relative `meshes/` paths are resolved next to the URDF, visual meshes are kept (MuJoCo's URDF importer drops them by default) as non-colliding geoms while their URDF collision geometry stays physical (boxes by default; compound convex meshes after `ttr-collision`), fixed links keep their names (no static fusing) so welds and `--focus` can find them, and saved MJCFs use a relative `meshdir`;
- the URDF's designed masses and inertias are preserved (including the root link when the base floats);
- floor, lighting, a free-floating base for legged / wheeled / flying robots (auto-detected from link names);
- self-collision off by default (primitive robots overlap at their joints); `--self-collision` / `self_collision=True` to expose interference;
- servo stiffness is a heuristic, not a measured controller model; speed, thermal and electrical limits are unmodelled;
- `ttr_mujoco.exo.add_wearer` puts an anthropometric human (head top at the given height, dark undersuit by default, `undersuit=False` for skin) inside a wearable exoskeleton (requires the exosuit link naming: `pelvis_frame`, `*_thigh_cuff`, `*_shank_cuff`, `*_boot`, …); armour hinges are any actuator named `*_hinge` (closed = 0), which the `don`/`doff` motions drive in anatomical order.

The Gymnasium env (`ttr_mujoco.env.MujocoRobotEnv`) uses **delta actions around the standing pose**
(action 0 = hold still) and, for `stand`, random pushes so a policy must actually balance.


## Solid CAD and collision preparation

From the repository root:

```bash
pip install -e './python[cad,geometry]'
ttr-enclosure python/ttr_cad/example_enclosure.json --out out/housing
ttr-attach-enclosure examples/14_iron_man_mark_43/robot.json \
  python/ttr_cad/example_enclosure.json --parent backpack \
  --xyz -0.3 0 0.2 --rpy 0 -1.5707963268 0 \
  --electronics-mass-kg 0.045 --out out/attached
# Open out/attached/robot.json with Import JSON in the web viewer.
ttr-collision examples/14_iron_man_mark_43/robot.sim.urdf --out out/convex --tolerance-mm 2
ttr-mujoco convert out/convex/robot.urdf --self-collision -o out/convex/robot.mjcf.xml
ttr-mujoco test out/convex/robot.urdf --self-collision
# Training can use the same contact model (requires [train]):
ttr-mujoco train out/convex/robot.urdf --self-collision --task stand --steps 400000
```

The enclosure manifest and mounting example use synthetic dimensions; replace them
with measured component geometry, mass and a designed interface. CAD solid mass/inertia
is included; fastener/cable mass and mounting strength are not.

CoACD decomposes each closed visual solid into convex collision pieces, preserves
URDF inertia/origins and copies every mesh into a portable output directory. Read
`collision_report.json`: the requested concavity is not a guaranteed maximum surface
error, and the hull cap can limit fidelity. Samples include internal hull interfaces;
the measured deviation is not a union-boundary Hausdorff metric. Default robot boxes
remain available for cheap diagnostics. Neither representation certifies human fit.

Regenerate evidence with `node scripts/regen_mark43_example.ts`, then
`python scripts/audit_mark43.py --convex` and `python scripts/check_mesh_assets.py`.
The physics audit records failures; successful file export does not mean balance or
hardware clearance passed. See [physical fidelity](../docs/PHYSICAL_FIDELITY.md).


Sample joint-range interference on a prepared self-colliding MJCF:

```bash
python -m ttr_mujoco.clearance out/convex/robot.mjcf.xml --samples 9 --json out/motion-clearance.json
```

This command returns nonzero for detected interference or disabled self-collision
masks. It records body pairs and witness joint positions. Samples move one joint at
a time; a pass cannot certify the continuous or combined configuration space.
Actuator smoke tests now report RMS tracking over the full command trajectory,
using explicit 0.15 rad/0.01 m tolerances rather than final-sample coincidence.

## Reaching and measured fit

Reaching requires an explicit tool body, for example
`ttr-mujoco train arm.urdf --task reach --tip-body gripper_base --self-collision`.
The named body must exist in the model. Training smoke runs do not establish a
capable policy.

Copy `ttr_mujoco/wearer.example.json`, enter measured dimensions, then run:

```bash
python -m ttr_mujoco.wearability robot.json wearer.json --json wearability_report.json
# Add --mjcf model.xml for static human-contact checks.
```

Open/closed pose checks do not validate insertion paths, ventilation or powered
human operation. The report keeps those limitations explicit.
