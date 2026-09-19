"""Gymnasium environment on MuJoCo for any generated robot. Tasks: stand, walk, reach, sweep."""
import numpy as np
import gymnasium as gym
from gymnasium import spaces
import mujoco
from .convert import load_model
from .testbench import _hold_targets, _up, _finite, _actuator_state


class MujocoRobotEnv(gym.Env):
    metadata = {"render_modes": ["rgb_array"], "render_fps": 25}

    def __init__(self, path_or_xml: str, task: str = "stand", max_steps: int = 1000, frame_skip: int = 5, floating=None, action_scale: float = 0.15, self_collision: bool = False, tip_body: str | None = None):
        super().__init__()
        if task not in ("stand","walk","reach","sweep","aperture"): raise ValueError("Unknown task")
        if max_steps<1 or frame_skip<1 or not np.isfinite(action_scale) or action_scale<=0: raise ValueError("Invalid environment limits")
        self.action_scale = action_scale  # fraction of half-range per unit action; balance needs small deltas
        self.m = load_model(path_or_xml, floating=floating, self_collision=self_collision) if path_or_xml.endswith(".urdf") else load_model(path_or_xml)
        self.tip_id = -1
        if task=="reach":
            if not tip_body: raise ValueError("reach requires an explicit tip_body; body order is not an end-effector definition")
            self.tip_id=mujoco.mj_name2id(self.m,mujoco.mjtObj.mjOBJ_BODY,tip_body)
            if self.tip_id<1: raise ValueError("tip_body not found")
        self.d = mujoco.MjData(self.m); self.task = task; self.max_steps = max_steps; self.frame_skip = frame_skip
        self.floating = bool(self.m.nq and self.m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE)
        nu = self.m.nu
        self.lo = np.where(self.m.actuator_ctrllimited, self.m.actuator_ctrlrange[:, 0], -1.0)
        self.hi = np.where(self.m.actuator_ctrllimited, self.m.actuator_ctrlrange[:, 1], 1.0)
        self.action_space = spaces.Box(-1, 1, shape=(nu,), dtype=np.float32)
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(self.m.nq + self.m.nv + 5,), dtype=np.float32)
        if task=="aperture" and (nu==0 or any(self.m.jnt_type[self.m.actuator_trnid[a,0]]!=mujoco.mjtJoint.mjJNT_SLIDE for a in range(nu))):
            raise ValueError("aperture requires prismatic finger actuators only")
        self.steps = 0; self.renderer = None; self.target = np.zeros(3, dtype=np.float32)

    def _obs(self):
        return np.concatenate([self.d.qpos, self.d.qvel, self.target, [np.sin(.02*self.steps),np.cos(.02*self.steps)]]).astype(np.float32)

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
        if self.task=="reach":
            saved=self.d.qpos.copy()
            try:
                for attempt in range(128):
                    for a in range(self.m.nu):
                        j=self.m.actuator_trnid[a,0]
                        if self.m.jnt_limited[j]:
                            self.d.qpos[self.m.jnt_qposadr[j]]=self.np_random.uniform(*self.m.jnt_range[j])
                    mujoco.mj_forward(self.m,self.d)
                    if all(c.dist >= -.001 for c in self.d.contact):
                        self.target=self.d.xpos[self.tip_id].astype(np.float32).copy()
                        self.target_qpos=self.d.qpos.copy()
                        break
                else: raise ValueError("No collision-free reachable target found; revise model geometry")
            finally:
                self.d.qpos[:]=saved
                mujoco.mj_forward(self.m,self.d)
        if self.task=="aperture":self.target[:]=[self.np_random.uniform(float(self.lo.sum()),float(self.hi.sum())),0,0]
        self.x0 = float(self.d.qpos[0]) if self.floating else 0.0
        mujoco.mj_forward(self.m, self.d)
        return self._obs(), {}

    def step(self, action):
        a = np.asarray(action, dtype=np.float64)
        if a.shape != self.action_space.shape or not np.all(np.isfinite(a)): raise ValueError("Action must have the actuator shape and finite values")
        a = np.clip(a, -1, 1)
        span = 0.5 * (self.hi - self.lo)
        self.d.ctrl[:] = np.clip(self.hold + a * span * self.action_scale, self.lo, self.hi)   # small corrective deltas around the standing pose
        if self.task in ("reach","aperture","sweep"):
            self.d.ctrl[:] = self.lo + (a+1)*.5*(self.hi-self.lo)
        if self.task == "stand" and self.floating and self.steps == self.next_push:
            self.d.qvel[0:2] += self.np_random.normal(0, 0.6, 2)                # random shove every ~1 s
            self.next_push += int(self.np_random.integers(60, 120))
        for _ in range(self.frame_skip): mujoco.mj_step(self.m, self.d)
        self.steps += 1
        finite = _finite(self.d)
        up = _up(self.m, self.d)
        ctrl_cost = 1e-3 * float(np.square(a).sum())
        if self.task == "walk" and self.floating:
            vx = float(self.d.qvel[0]); reward = vx + 0.5 * (up or 0) - ctrl_cost; term = (up is not None and up < 0.3) or not finite
        elif self.task == "stand" and self.floating:
            reward = (up or 0) - 0.1 * float(np.linalg.norm(self.d.qvel[:3])) - ctrl_cost; term = (up is not None and up < 0.3) or not finite
        elif self.task == "aperture":
            travel=sum(float(self.d.qpos[self.m.jnt_qposadr[self.m.actuator_trnid[i,0]]]) for i in range(self.m.nu))
            error=abs(travel-float(self.target[0]));reward=-error-ctrl_cost;term=error<.002 or not finite
        elif self.task == "reach":
            tip = self.d.xpos[self.tip_id]; dist = float(np.linalg.norm(tip - self.target)); reward = -dist - ctrl_cost; term = dist < 0.05 or not finite
        else:  # "sweep": track a moving reference (smoothness benchmark)
            ref = 0.5 * np.sin(0.02 * self.steps + np.arange(self.m.nu))
            measured=np.array([_actuator_state(self.m,self.d,i) for i in range(self.m.nu)])
            normalized=2*(measured-self.lo)/np.maximum(self.hi-self.lo,1e-6)-1
            reward = -float(np.mean((normalized-ref)**2)) if self.m.nu else 0.0
            term = not finite
        if not finite: reward = -100.0
        return self._obs(), float(reward), bool(term), self.steps >= self.max_steps, {"upright": up,"is_success":bool(finite and term and self.task in ("reach","aperture"))}

    def render(self):
        import os; os.environ.setdefault("MUJOCO_GL", "osmesa")
        if self.renderer is None:
            self.renderer = mujoco.Renderer(self.m, 400, 640)
            self.cam = mujoco.MjvCamera(); mujoco.mjv_defaultFreeCamera(self.m, self.cam); self.cam.azimuth = 135; self.cam.elevation = -18
        self.renderer.update_scene(self.d, self.cam); return self.renderer.render()
