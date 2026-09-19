import unittest
import mujoco
import numpy as np
from ttr_mujoco.control import ModelBiasController
from ttr_mujoco.env import MujocoRobotEnv

def model(effort=15):
    return f'''<mujoco><option timestep=".002" integrator="implicitfast"/><worldbody><body pos="0 0 1">
    <joint name="lift" type="slide" axis="0 0 1" range="-.2 .2" damping="1"/>
    <geom type="sphere" size=".05" mass="1"/></body></worldbody><actuator>
    <position joint="lift" kp="100" ctrlrange="-.2 .2" forcerange="-{effort} {effort}"/>
    </actuator></mujoco>'''

class BiasControlTests(unittest.TestCase):
    def test_compensation_holds_load_using_only_motor_force(self):
        m=mujoco.MjModel.from_xml_string(model());d=mujoco.MjData(m);c=ModelBiasController(m)
        for _ in range(500):
            c.apply(d,[0]);mujoco.mj_step(m,d)
            self.assertLessEqual(abs(d.actuator_force[0]),15)
            np.testing.assert_array_equal(d.qfrc_applied,0)
            np.testing.assert_array_equal(d.xfrc_applied,0)
        self.assertLess(abs(d.qpos[0]),1e-6)
        self.assertAlmostEqual(d.actuator_force[0],9.81,places=5)

    def test_underpowered_motor_still_fails_to_support_load(self):
        m=mujoco.MjModel.from_xml_string(model(2));d=mujoco.MjData(m);c=ModelBiasController(m)
        for _ in range(100):
            c.apply(d,[0]);mujoco.mj_step(m,d)
            self.assertLessEqual(abs(d.actuator_force[0]),2)
        self.assertLess(d.qpos[0],-.01)

    def test_training_keeps_position_action_bounds_with_compensation(self):
        env=MujocoRobotEnv(model(),task='aperture',bias_compensation=True)
        env.reset(seed=1);np.testing.assert_allclose(env.lo,[-.2]);np.testing.assert_allclose(env.hi,[.2])
        obs,reward,*_=env.step([0]);self.assertTrue(np.isfinite(obs).all());self.assertTrue(np.isfinite(reward));env.close()

    def test_velocity_motor_cannot_be_reinterpreted_as_position_servo(self):
        xml=model().replace('<position joint="lift" kp="100"','<velocity joint="lift" kv="1"')
        with self.assertRaisesRegex(ValueError,'position actuators'):ModelBiasController(mujoco.MjModel.from_xml_string(xml))
