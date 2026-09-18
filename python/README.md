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
- position actuators on every joint, gains scaled to the robot's mass;
- polygon-mesh parts: `package://` and relative `meshes/` paths are resolved next to the URDF, visual meshes are kept (MuJoCo's URDF importer drops them by default) as non-colliding geoms while their bounding-box collision stays physical, fixed links keep their names (no static fusing) so welds and `--focus` can find them, and saved MJCFs use a relative `meshdir`;
- the URDF's designed masses and inertias are preserved (including the root link when the base floats);
- floor, lighting, a free-floating base for legged / wheeled / flying robots (auto-detected from link names);
- self-collision off by default (primitive robots overlap at their joints); `self_collision=True` to enable;
- servo stiffness scaled from the inverted-pendulum term m·g·h so standing robots are stable under position control;
- `ttr_mujoco.exo.add_wearer` puts an anthropometric human inside a wearable exoskeleton (requires the exosuit link naming: `pelvis_frame`, `*_thigh_cuff`, `*_shank_cuff`, `*_boot`, …); armour hinges are any actuator named `*_hinge` (closed = 0), which the `don`/`doff` motions drive in anatomical order.

The Gymnasium env (`ttr_mujoco.env.MujocoRobotEnv`) uses **delta actions around the standing pose**
(action 0 = hold still) and, for `stand`, random pushes so a policy must actually balance.
