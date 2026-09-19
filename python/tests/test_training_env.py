import unittest,numpy as np
from ttr_mujoco.env import MujocoRobotEnv
XML='<mujoco><option gravity="0 0 0"/><worldbody><body name="tool"><joint name="j" range="-1 1"/><geom type="sphere" size=".1"/></body><body name="decoration" pos="10 0 0"><geom type="sphere" size=".1"/></body></worldbody><actuator><position joint="j" kp="1" ctrlrange="-1 1"/></actuator></mujoco>'
class TrainingEnvTests(unittest.TestCase):
    def test_reach_requires_explicit_tip(self):
        with self.assertRaisesRegex(ValueError,'tip_body'):MujocoRobotEnv(XML,task='reach')
        env=MujocoRobotEnv(XML,task='reach',tip_body='tool');env.reset(seed=1)
        self.assertNotEqual(env.tip_id,env.m.nbody-1);env.close()
    def test_bad_actions_rejected(self):
        env=MujocoRobotEnv(XML,task='sweep');env.reset(seed=1)
        for action in ([float('nan')],[],[0,0]):
            with self.assertRaises(ValueError):env.step(action)
        self.assertTrue(np.isfinite(env.step([0])[1]));env.close()
    def test_reach_actions_cover_the_declared_joint_range(self):
        env=MujocoRobotEnv(XML,task='reach',tip_body='tool');env.reset(seed=1)
        env.step([1]);self.assertAlmostEqual(float(env.d.ctrl[0]),1.0)
        env.step([-1]);self.assertAlmostEqual(float(env.d.ctrl[0]),-1.0);env.close()
    def test_aperture_uses_prismatic_travel_and_reports_success(self):
        from pathlib import Path
        model=Path(__file__).resolve().parents[2]/'examples/09_gripper/robot.urdf'
        env=MujocoRobotEnv(str(model),task='aperture',self_collision=True);env.reset(seed=2)
        self.assertGreaterEqual(env.target[0],env.lo.sum());self.assertLessEqual(env.target[0],env.hi.sum())
        env.target[:]=0
        _,_,terminated,_,info=env.step([-1]*env.m.nu)
        self.assertTrue(terminated);self.assertTrue(info['is_success']);env.close()

    def test_reach_target_has_a_joint_configuration_witness(self):
        import mujoco
        xml=XML.replace('<geom type="sphere" size=".1"/>','<geom type="sphere" size=".1"/>')
        env=MujocoRobotEnv(xml,task='reach',tip_body='tool');env.reset(seed=42)
        probe=mujoco.MjData(env.m);probe.qpos[:]=env.target_qpos;mujoco.mj_forward(env.m,probe)
        np.testing.assert_allclose(probe.xpos[env.tip_id],env.target,atol=1e-6);env.close()

    def test_sweep_scores_physics_not_the_command(self):
        dead=XML.replace('kp="1"','kp="0"')
        a=MujocoRobotEnv(dead,task='sweep');b=MujocoRobotEnv(dead,task='sweep')
        a.reset(seed=0);b.reset(seed=0)
        self.assertAlmostEqual(a.step([1])[1],b.step([-1])[1])
        self.assertAlmostEqual(float(a.d.ctrl[0]),1.0)
        self.assertAlmostEqual(float(b.d.ctrl[0]),-1.0)
        a.close();b.close()
