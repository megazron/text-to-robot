import tempfile
import unittest
import warnings
from pathlib import Path
import xml.etree.ElementTree as ET

import mujoco
import numpy as np
from ttr_mujoco.convert import urdf_to_mjcf
from ttr_mujoco.testbench import run_tests, _finite


def fixture(effort="2.5", joint_type="revolute"):
    return f'''<robot name="fixture">
      <link name="base"><inertial><origin xyz="0.01 0.02 0.03" rpy="0.2 -0.3 0.5"/><mass value="2"/>
      <inertia ixx="0.02" iyy="0.03" izz="0.04" ixy="0.002" ixz="0.003" iyz="0.001"/></inertial>
      <collision><geometry><box size="0.2 0.2 0.2"/></geometry></collision></link>
      <link name="arm"><inertial><mass value="1"/><inertia ixx="0.01" iyy="0.01" izz="0.01" ixy="0" ixz="0" iyz="0"/></inertial>
      <collision><geometry><box size="0.1 0.1 0.1"/></geometry></collision></link>
      <joint name="servo" type="{joint_type}"><parent link="base"/><child link="arm"/>
      <origin xyz="0 0 0.2"/><axis xyz="0 1 0"/><limit lower="-1" upper="1" effort="{effort}" velocity="1"/>
      <dynamics damping="0.12" friction="0.03"/></joint></robot>'''


class FidelityTests(unittest.TestCase):
    def convert(self, source=None, **kw):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "robot.urdf"
            path.write_text(source or fixture())
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                return urdf_to_mjcf(str(path), **kw)

    def test_effort_is_enforced_under_saturated_control(self):
        for joint_type in ("revolute", "prismatic", "continuous"):
            with self.subTest(joint_type=joint_type):
                m = mujoco.MjModel.from_xml_string(self.convert(fixture(joint_type=joint_type), floating=False))
                np.testing.assert_allclose(m.actuator_forcerange[0], [-2.5, 2.5])
                d = mujoco.MjData(m); d.ctrl[:] = 100
                for _ in range(100):
                    mujoco.mj_step(m, d)
                    self.assertLessEqual(abs(d.actuator_force[0]), 2.5 + 1e-9)
                np.testing.assert_allclose(m.dof_damping, [0.12])
                np.testing.assert_allclose(m.dof_frictionloss, [0.03])
                np.testing.assert_allclose(m.dof_armature, [0])

    def test_missing_or_invalid_effort_rejected(self):
        for value in ("nan", "inf", "0", "-1"):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "effort"):
                self.convert(fixture(effort=value))

    def test_floating_root_keeps_rotated_full_tensor(self):
        m = mujoco.MjModel.from_xml_string(self.convert(floating=True))
        bid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "base")
        self.assertAlmostEqual(m.body_mass[bid], 2)
        np.testing.assert_allclose(m.body_ipos[bid], [0.01, 0.02, 0.03])
        rotation = np.zeros(9); mujoco.mju_quat2Mat(rotation, m.body_iquat[bid]); rotation = rotation.reshape(3, 3)
        actual = rotation @ np.diag(m.body_inertia[bid]) @ rotation.T
        r, p, y = 0.2, -0.3, 0.5
        rx = np.array([[1,0,0], [0,np.cos(r),-np.sin(r)], [0,np.sin(r),np.cos(r)]])
        ry = np.array([[np.cos(p),0,np.sin(p)], [0,1,0], [-np.sin(p),0,np.cos(p)]])
        rz = np.array([[np.cos(y),-np.sin(y),0], [np.sin(y),np.cos(y),0], [0,0,1]])
        rot = rz @ ry @ rx
        expected = rot @ np.array([[.02,.002,.003],[.002,.03,.001],[.003,.001,.04]]) @ rot.T
        np.testing.assert_allclose(actual, expected, atol=1e-8)

    def test_collision_mode_sets_explicit_masks(self):
        for enabled in (False, True):
            m = mujoco.MjModel.from_xml_string(self.convert(self_collision=enabled))
            robot = m.geom_type != mujoco.mjtGeom.mjGEOM_PLANE
            self.assertTrue(np.all(m.geom_contype[robot] == 1))
            self.assertTrue(np.all(m.geom_conaffinity[robot] == int(enabled)))

    def test_existing_compiler_cannot_fuse_away_source_mass(self):
        source = fixture().replace('<robot name="fixture">', '<robot name="fixture"><mujoco><compiler fusestatic="true"/></mujoco>')
        source = source.replace('type="revolute"', 'type="fixed"')
        m = mujoco.MjModel.from_xml_string(self.convert(source, floating=True))
        self.assertAlmostEqual(float(m.body_mass.sum()), 3)
        self.assertGreaterEqual(mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "arm"), 1)

    def test_fallen_finite_robot_fails_recovery(self):
        xml = '''<mujoco><option gravity="0 0 0"/><worldbody><body quat="0.70710678 0.70710678 0 0"><freejoint/>
        <geom type="sphere" size="0.1" mass="1"/><body pos="0 0 0.3"><joint name="j"/><geom type="sphere" size="0.05" mass="0.1"/></body>
        </body></worldbody><actuator><position joint="j" kp="1"/></actuator></mujoco>'''
        report = run_tests(xml, seconds=0.02, verbose=False)
        self.assertFalse(report["tests"]["disturbance_recovery"]["pass"])

    def test_numerical_reset_is_not_a_pass(self):
        m = mujoco.MjModel.from_xml_string(self.convert())
        d = mujoco.MjData(m)
        d.warning[mujoco.mjtWarning.mjWARN_BADQACC].number = 1
        self.assertFalse(_finite(d))


if __name__ == "__main__":
    unittest.main()
