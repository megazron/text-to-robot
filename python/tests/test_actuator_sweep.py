"""The actuator sweep tests motors, not balance: speed-limited, on a test stand,
wheels by commanded speed, and every failure carries a reason."""
import tempfile
import unittest
import warnings
from pathlib import Path

import mujoco
import numpy as np
from ttr_mujoco.convert import urdf_to_mjcf
from ttr_mujoco.testbench import run_tests, SPEED_FRACTION

INERTIA = '<inertia ixx="{i}" iyy="{i}" izz="{i}" ixy="0" ixz="0" iyz="0"/>'


def link(name, mass, geometry, xyz="0 0 0"):
    return (f'<link name="{name}"><inertial><mass value="{mass}"/>{INERTIA.format(i=mass * 0.002)}</inertial>'
            f'<collision><origin xyz="{xyz}"/><geometry>{geometry}</geometry></collision></link>')


def joint(name, kind, parent, child, xyz, axis, limit):
    return (f'<joint name="{name}" type="{kind}"><parent link="{parent}"/><child link="{child}"/>'
            f'<origin xyz="{xyz}"/><axis xyz="{axis}"/><limit {limit}/><dynamics damping="0.1"/></joint>')


def convert(source, **kw):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "robot.urdf"; path.write_text(source)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return urdf_to_mjcf(str(path), **kw)


def sweep(xml):
    return {a["joint"]: a for a in run_tests(xml, seconds=0.05, verbose=False)["tests"]["actuator_sweep"]["actuators"]}


DRIVE = ('<robot name="cart">' + link("base_link", 4, '<box size="0.4 0.3 0.1"/>')
         + link("wheel", 0.3, '<cylinder radius="0.06" length="0.03"/>')
         + joint("wheel_joint", "continuous", "base_link", "wheel", "0 0.17 0", "0 1 0", 'effort="2.5" velocity="12"')
         + '</robot>')


class ActuatorSweepTests(unittest.TestCase):
    def test_sweep_respects_urdf_speed_limit(self):
        arm = ('<robot name="slow">' + link("base", 2, '<box size="0.2 0.2 0.2"/>') + link("arm", 1, '<box size="0.05 0.05 0.3"/>', "0 0 0.15")
               + joint("j", "revolute", "base", "arm", "0 0 0.3", "0 1 0", 'lower="-3" upper="3" effort="40" velocity="0.8"') + '</robot>')
        m = mujoco.MjModel.from_xml_string(convert(arm, floating=False))
        nid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_NUMERIC, "ttr_vmax_act_j")
        self.assertAlmostEqual(float(m.numeric_data[m.numeric_adr[nid]]), 0.8)
        result = sweep(convert(arm, floating=False))["j"]
        peak_speed = 2 * np.pi * result["amplitude"] / result["period_s"]
        self.assertLessEqual(peak_speed, SPEED_FRACTION * 0.8 + 1e-6)
        self.assertTrue(result["pass"], result)

    def test_wheel_speed_tracked_on_a_test_stand(self):
        report = run_tests(convert(DRIVE, floating=True), seconds=0.05, verbose=False)
        test = report["tests"]["actuator_sweep"]
        self.assertIn("test stand", test["base"])
        wheel = test["actuators"][0]
        self.assertEqual(wheel["error_unit"], "rad/s")
        self.assertTrue(wheel["pass"], wheel)
        self.assertIn("standing_balance", report["tests"])

    def test_vertical_slide_holds_its_load(self):
        lift = ('<robot name="lift">' + link("base", 5, '<box size="0.2 0.2 0.2"/>') + link("carriage", 2, '<box size="0.1 0.1 0.1"/>')
                + joint("z", "prismatic", "base", "carriage", "0 0 0.3", "0 0 1", 'lower="0" upper="0.1" effort="80" velocity="0.4"') + '</robot>')
        result = sweep(convert(lift, floating=False))["z"]
        self.assertTrue(result["pass"], result)

    def test_blocked_motion_is_reported_as_contact_not_motor(self):
        # A plate fixed to the base sits inside the arm's swing: the motor stalls on geometry.
        blocked = ('<robot name="blocked">' + link("base", 2, '<box size="0.2 0.2 0.2"/>')
                   + link("plate", 0.5, '<box size="0.3 0.3 0.02"/>') + link("arm", 1, '<box size="0.05 0.05 0.3"/>', "0 0 0.15")
                   + '<joint name="plate_mount" type="fixed"><parent link="base"/><child link="plate"/><origin xyz="0.2 0 0.3"/></joint>'
                   + joint("j", "revolute", "base", "arm", "0 0 0.12", "0 1 0", 'lower="-1.5" upper="1.5" effort="5" velocity="2"') + '</robot>')
        result = sweep(convert(blocked, floating=False, self_collision=True))["j"]
        self.assertIn("collision_free_range", result)
        self.assertLess(result["collision_free_range"][1], 1.5)
        self.assertIn("range_note", result)


if __name__ == "__main__":
    unittest.main()
