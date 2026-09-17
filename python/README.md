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
```

What the converter does, deterministically:
- position actuators on every joint, gains scaled to the robot's mass;
- the URDF's designed masses and inertias are preserved (including the root link when the base floats);
- floor, lighting, a free-floating base for legged / wheeled / flying robots (auto-detected from link names);
- self-collision off by default (primitive robots overlap at their joints); `self_collision=True` to enable.

The Gymnasium env (`ttr_mujoco.env.MujocoRobotEnv`) uses **delta actions around the standing pose**
(action 0 = hold still) and, for `stand`, random pushes so a policy must actually balance.
