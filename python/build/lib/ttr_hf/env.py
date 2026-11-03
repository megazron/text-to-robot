"""SO-101 joint-positioning benchmark; no grasp assistance or hardware driver."""
from pathlib import Path
import xml.etree.ElementTree as ET
import gymnasium as gym
from gymnasium import spaces
import mujoco
import numpy as np

JOINTS = ('shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper')


class SO101JointEnv(gym.Env):
    """Absolute-radian actions, q/dq/goal observations; 20 Hz, 2-second episodes.

    Targets are modest joint-space perturbations around the supplied CAD zero,
    with an open gripper. This tests position servos, not manipulation or sim2real.
    The imported model keeps its original inertias, contacts, gains and limits.
    """
    metadata = {'render_modes': ['rgb_array'], 'render_fps': 20}

    def __init__(self, model_path, render_mode=None):
        if render_mode not in (None, 'rgb_array'):
            raise ValueError('Only rgb_array rendering is supported')
        path = Path(model_path).resolve()
        root = ET.parse(path).getroot()
        root.find('compiler').set('meshdir', str(path.parent.parent / 'meshes'))
        option = root.find('option')
        if option is None:
            option = ET.SubElement(root, 'option')
        option.set('timestep', '0.002')
        option.set('gravity', '0 0 -9.81')
        world = root.find('worldbody')
        ET.SubElement(world, 'geom', name='bench_floor', type='plane', size='1 1 0.1',
                      pos='0 0 -0.003', rgba='0.2 0.23 0.27 1')
        ET.SubElement(world, 'light', pos='0 -1 2', dir='0 0 -1')
        self.model = mujoco.MjModel.from_xml_string(ET.tostring(root, encoding='unicode'))
        self.data = mujoco.MjData(self.model)
        actual = tuple(self.model.joint(i).name for i in range(self.model.njnt))
        actuators = tuple(self.model.actuator(i).name for i in range(self.model.nu))
        if actual != JOINTS or actuators != JOINTS or self.model.nq != 6 or self.model.nv != 6:
            raise ValueError(f'Unexpected SO101 joint/actuator contract: {actual}, {actuators}')
        bounds = self.model.actuator_ctrlrange.astype(np.float32)
        self.action_space = spaces.Box(bounds[:, 0], bounds[:, 1], dtype=np.float32)
        self.observation_space = spaces.Box(-np.inf, np.inf, (18,), dtype=np.float32)
        self.render_mode = render_mode
        self.renderer = None
        self.goal = np.zeros(6)
        self.home = np.array([0., 0., 0., 0., 0., 0.5])
        self.steps = 0
        self.held = 0

    def _obs(self):
        return np.concatenate((self.data.qpos, self.data.qvel, self.goal)).astype(np.float32)

    def _info(self):
        penetration = max((max(0., -c.dist) for c in self.data.contact), default=0.)
        error = float(np.max(np.abs(self.data.qpos - self.goal)))
        return {'max_joint_error_rad': error, 'max_penetration_m': float(penetration),
                'contacts': int(self.data.ncon), 'is_success': self.held >= 5}

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        mujoco.mj_resetData(self.model, self.data)
        self.data.qpos[:] = self.home
        self.data.ctrl[:] = self.home
        self.goal = self.home + self.np_random.uniform(-0.25, 0.25, 6)
        self.steps = self.held = 0
        mujoco.mj_forward(self.model, self.data)
        return self._obs(), self._info()

    def step(self, action):
        action = np.asarray(action, dtype=np.float32)
        if not self.action_space.contains(action):
            raise ValueError('Expected six finite, in-range absolute joint targets in radians')
        self.data.ctrl[:] = action
        mujoco.mj_step(self.model, self.data, nstep=25)
        if not np.isfinite(self.data.qpos).all() or not np.isfinite(self.data.qvel).all():
            raise FloatingPointError('Non-finite SO101 dynamics')
        self.steps += 1
        info = self._info()
        settled = (info['max_joint_error_rad'] < 0.05
                   and np.max(np.abs(self.data.qvel)) < 0.1
                   and info['max_penetration_m'] < 0.001)
        self.held = self.held + 1 if settled else 0
        info['is_success'] = self.held >= 5
        reward = -float(np.linalg.norm(self.data.qpos - self.goal))
        return self._obs(), reward, info['is_success'], self.steps >= 40, info

    def render(self):
        if self.renderer is None:
            self.renderer = mujoco.Renderer(self.model, height=480, width=640)
        camera = mujoco.MjvCamera()
        camera.lookat[:] = [0., 0., 0.16]
        camera.distance = 0.85
        camera.azimuth = 135
        camera.elevation = -20
        options = mujoco.MjvOption()
        options.geomgroup[3] = 0
        self.renderer.update_scene(self.data, camera, scene_option=options)
        return self.renderer.render().copy()

    def close(self):
        if self.renderer is not None:
            self.renderer.close()
            self.renderer = None
