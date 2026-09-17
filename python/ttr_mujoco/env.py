"""Gymnasium environment on MuJoCo for any generated robot. Tasks: stand, walk, reach, sweep."""
import numpy as np
import gymnasium as gym
from gymnasium import spaces
import mujoco
from .convert import load_model
from .testbench import _hold_targets, _up


class MujocoRobotEnv(gym.Env):
    metadata = {"render_modes": ["rgb_array"], "render_fps": 25}

    def __init__(self, path_or_xml: str, task: str = "stand", max_steps: int = 1000, frame_skip: int = 5, floating=None, action_scale: float = 0.15):
        super().__init__()
        self.action_scale = action_scale  # fraction of half-range per unit action; balance needs small deltas
        self.m = load_model(path_or_xml, floating=floating) if path_or_xml.endswith(".urdf") else load_model(path_or_xml)
        self.d = mujoco.MjData(self.m); self.task = task; self.max_steps = max_steps; self.frame_skip = frame_skip
        self.floating = bool(self.m.nq and self.m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE)
        nu = self.m.nu
        self.lo = np.where(self.m.actuator_ctrllimited, self.m.actuator_ctrlrange[:, 0], -1.0)
        self.hi = np.where(self.m.actuator_ctrllimited, self.m.actuator_ctrlrange[:, 1], 1.0)
        self.action_space = spaces.Box(-1, 1, shape=(nu,), dtype=np.float32)
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(self.m.nq + self.m.nv + 3,), dtype=np.float32)
        self.steps = 0; self.renderer = None; self.target = np.zeros(3, dtype=np.float32)

    def _obs(self):
        return np.concatenate([self.d.qpos, self.d.qvel, self.target]).astype(np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed); mujoco.mj_resetData(self.m, self.d); self.steps = 0
        self.hold = _hold_targets(self.m, self.d)
        self.d.ctrl[:] = self.hold
        if self.task in ("stand", "walk") and self.floating:
            # perturbed start so the policy must actively balance (not just do nothing)
            self.d.qvel[:6] += self.np_random.normal(0, 0.15, 6)
            self.d.ctrl[:] = self.hold + self.np_random.normal(0, 0.05, self.m.nu)
        self.next_push = int(self.np_random.integers(60, 120))
        self.target = np.array([self.np_random.uniform(0.2, 0.5), self.np_random.uniform(-0.3, 0.3), self.np_random.uniform(0.2, 0.6)], dtype=np.float32)
        self.x0 = float(self.d.qpos[0]) if self.floating else 0.0
        mujoco.mj_forward(self.m, self.d)
        return self._obs(), {}

    def step(self, action):
        a = np.clip(np.asarray(action, dtype=np.float64), -1, 1)
        span = 0.5 * (self.hi - self.lo)
        self.d.ctrl[:] = np.clip(self.hold + a * span * self.action_scale, self.lo, self.hi)   # small corrective deltas around the standing pose
        if self.task == "stand" and self.floating and self.steps == self.next_push:
            self.d.qvel[0:2] += self.np_random.normal(0, 0.6, 2)                # random shove every ~1 s
            self.next_push += int(self.np_random.integers(60, 120))
        for _ in range(self.frame_skip): mujoco.mj_step(self.m, self.d)
        self.steps += 1
        finite = bool(np.all(np.isfinite(self.d.qpos)))
        up = _up(self.m, self.d)
        ctrl_cost = 1e-3 * float(np.square(a).sum())
        if self.task == "walk" and self.floating:
            vx = float(self.d.qvel[0]); reward = vx + 0.5 * (up or 0) - ctrl_cost; term = (up is not None and up < 0.3) or not finite
        elif self.task == "stand" and self.floating:
            reward = (up or 0) - 0.1 * float(np.linalg.norm(self.d.qvel[:3])) - ctrl_cost; term = (up is not None and up < 0.3) or not finite
        elif self.task == "reach":
            tip = self.d.xpos[self.m.nbody - 1]; dist = float(np.linalg.norm(tip - self.target)); reward = -dist - ctrl_cost; term = dist < 0.05 or not finite
        else:  # "sweep": track a moving reference (smoothness benchmark)
            ref = 0.5 * np.sin(0.02 * self.steps + np.arange(self.m.nu)); reward = -float(np.mean((a - ref) ** 2)); term = not finite
        return self._obs(), float(reward), bool(term), self.steps >= self.max_steps, {"upright": up}

    def render(self):
        import os; os.environ.setdefault("MUJOCO_GL", "osmesa")
        if self.renderer is None:
            self.renderer = mujoco.Renderer(self.m, 400, 640)
            self.cam = mujoco.MjvCamera(); mujoco.mjv_defaultFreeCamera(self.m, self.cam); self.cam.azimuth = 135; self.cam.elevation = -18
        self.renderer.update_scene(self.d, self.cam); return self.renderer.render()
