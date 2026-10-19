"""Task tests must discriminate: the same robot with a weak actuator fails the payload hold
and with a strong one passes; wheeled and legged code paths run on small synthetic robots."""
from _deps import require
require("mujoco")

import tempfile
import unittest
import warnings
from pathlib import Path

import mujoco
import numpy as np
from ttr_mujoco.convert import urdf_to_mjcf
from ttr_mujoco.tasks import run_tasks

INERTIA = '<inertia ixx="{i}" iyy="{i}" izz="{i}" ixy="0" ixz="0" iyz="0"/>'


def link(name, mass, geometry, xyz="0 0 0", rpy="0 0 0"):
    return (f'<link name="{name}"><inertial><origin xyz="{xyz}"/><mass value="{mass}"/>{INERTIA.format(i=max(mass * 0.0005, 1e-6))}</inertial>'
            f'<collision><origin xyz="{xyz}" rpy="{rpy}"/><geometry>{geometry}</geometry></collision></link>')


def joint(name, kind, parent, child, xyz, axis, limit="", extra="", damping=0.02, friction=0.01):
    lim = f"<limit {limit}/>" if limit else ""
    return (f'<joint name="{name}" type="{kind}" {extra}><parent link="{parent}"/><child link="{child}"/>'
            f'<origin xyz="{xyz}"/><axis xyz="{axis}"/>{lim}<dynamics damping="{damping}" friction="{friction}"/></joint>')


def record(name, peak, rated, speed):
    return {"joint": name, "actuator": "synthetic", "required_nm": 0, "rated_nm": rated, "peak_nm": peak, "margin": 1, "speed_rad_s": speed, "note": ""}


def spec(name, family, joints, performance, tcp=None, links=None):
    design = {"family": family, "joints": joints, "performance": performance, "checks": [], "assumptions": []}
    if tcp: design["tcp"] = tcp
    return {"robot_name": name, "links": links or [], "joints": [], "end_effectors": [], "metadata": {"design": design}}


def run(urdf, robot):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "robot.urdf"; path.write_text(urdf)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return run_tasks(str(path), robot, verbose=False)


# --- a 2-link planar arm, 0.30 m reach, 0.5 kg payload at the tool --------------------------
def arm(peak, rated, speed=6.0):
    lim = f'lower="-2" upper="2" effort="{peak}" velocity="{speed}"'
    urdf = ('<robot name="arm">' + link("base_link", 1.0, '<box size="0.1 0.1 0.05"/>', "0 0 0.025")
            + link("upper", 0.15, '<box size="0.03 0.03 0.15"/>', "0 0 0.075")
            + link("fore", 0.10, '<box size="0.03 0.03 0.15"/>', "0 0 0.075")
            + joint("shoulder_pitch", "revolute", "base_link", "upper", "0 0 0.08", "0 1 0", lim)
            + joint("elbow_pitch", "revolute", "upper", "fore", "0 0 0.15", "0 1 0", lim) + "</robot>")
    robot = spec("arm", "arm", [record("shoulder_pitch", peak, rated, speed), record("elbow_pitch", peak, rated, speed)],
                 {"reach_m": 0.30, "payload_kg": 0.5}, tcp={"link": "fore", "xyz": [0, 0, 0.15]})
    return urdf, robot


class ArmTaskTests(unittest.TestCase):
    def test_weak_actuator_fails_and_strong_passes_payload_hold(self):
        # stretched out, the shoulder carries ~0.5*9.81*0.3 + arm ~= 1.7 N m
        weak = run(*arm(peak=1.0, rated=0.4))["tests"]["payload_hold"]
        strong = run(*arm(peak=10.0, rated=4.0))["tests"]["payload_hold"]
        self.assertFalse(weak["pass"], weak["explanation"])
        self.assertTrue(strong["pass"], strong["explanation"])
        sh = strong["poses"]["stretched_plus"]["joints"]["shoulder_pitch"]
        self.assertAlmostEqual(sh["mean_hold_nm"], 0.5 * 9.81 * 0.30 + 0.15 * 9.81 * 0.075 + 0.10 * 9.81 * 0.225, delta=0.05)
        self.assertAlmostEqual(sh["util_rated"], sh["mean_hold_nm"] / 4.0, places=2)
        self.assertGreater(weak["poses"]["stretched_plus"]["joints"]["shoulder_pitch"]["saturated_frac"], 0)

    def test_peak_enough_but_continuous_rating_exceeded_fails(self):
        mid = run(*arm(peak=4.0, rated=1.0))["tests"]["payload_hold"]
        self.assertFalse(mid["pass"])
        self.assertIn("continuous rating", mid["explanation"])

    def test_reach_and_speed_reported(self):
        rep = run(*arm(peak=10.0, rated=4.0))
        self.assertTrue(rep["tests"]["reach"]["pass"])
        self.assertAlmostEqual(rep["tests"]["reach"]["achieved_m"], 0.30, delta=0.005)
        self.assertIn("ideal_peak_nm", rep["tests"]["speed"]["joints"]["shoulder_pitch"])
        self.assertIn("thermal", rep["scope"])


# --- a differential-drive cart with two passive casters --------------------------------------
def cart(peak, rated, claim=0.5):
    w = f'effort="{peak}" velocity="20"'
    parts = [link("base_link", 2.0, '<box size="0.30 0.20 0.06"/>')]
    for side, y in (("left", 0.13), ("right", -0.13)):
        parts += [link(f"wheel_{side}", 0.1, '<cylinder radius="0.05" length="0.03"/>', rpy="1.5708 0 0"),
                  joint(f"wheel_{side}", "continuous", "base_link", f"wheel_{side}", f"0 {y} -0.02", "0 1 0", w)]
    for end, x in (("front", 0.12), ("rear", -0.12)):
        parts += [link(f"{end}_swivel", 0.01, '<box size="0.005 0.005 0.005"/>'), link(f"{end}_caster", 0.02, '<sphere radius="0.02"/>'),
                  joint(f"{end}_swivel_joint", "continuous", "base_link", f"{end}_swivel", f"{x} 0 -0.03", "0 0 1", extra='passive="true"', damping=1e-5, friction=0),
                  joint(f"{end}_caster_joint", "continuous", f"{end}_swivel", f"{end}_caster", "-0.01 0 -0.02", "0 1 0", extra='passive="true"', damping=1e-5, friction=0)]
    urdf = '<robot name="cart">' + "".join(parts) + "</robot>"
    robot = spec("cart", "diff_drive", [record("wheel_left", peak, rated, 20), record("wheel_right", peak, rated, 20)], {"top_speed_m_s": claim})
    return urdf, robot


class WheeledTaskTests(unittest.TestCase):
    def test_drive_ramp_turn(self):
        rep = run(*cart(peak=2.0, rated=0.8))
        t = rep["tests"]
        self.assertEqual(rep["group"], "wheeled")
        self.assertTrue(t["drive_straight"]["pass"], t["drive_straight"]["explanation"])
        self.assertAlmostEqual(t["drive_straight"]["cruise_speed_m_s"], 0.5, delta=0.05)
        self.assertTrue(t["ramp_10deg"]["pass"], t["ramp_10deg"]["explanation"])
        self.assertTrue(t["turn_in_place"]["pass"], t["turn_in_place"]["explanation"])
        self.assertAlmostEqual(t["drive_straight"]["wheel_radius_m"][0], 0.05, delta=0.002)

    def test_weak_motor_cannot_climb(self):
        # 2.4 kg on 10 deg needs 2.4*9.81*sin(10)*0.05 = 0.2 N m over two wheels at standstill
        t = run(*cart(peak=0.05, rated=0.02))["tests"]
        self.assertFalse(t["ramp_10deg"]["pass"], t["ramp_10deg"]["explanation"])

    def test_claim_beyond_motor_speed_fails(self):
        t = run(*cart(peak=2.0, rated=0.8, claim=1.5))["tests"]   # no-load is 20 rad/s * 0.05 m = 1 m/s
        self.assertFalse(t["drive_straight"]["pass"])


# --- a quadruped with bent knees, and a biped -------------------------------------------------
def legs(names_xy, peak, rated, family, foot='<sphere radius="0.015"/>'):
    lim = f'lower="-2.5" upper="2.5" effort="{peak}" velocity="8"'
    parts = [link("base_link", 2.0, '<box size="0.30 0.20 0.06"/>')]
    records = []
    for leg, (x, y) in names_xy.items():
        parts += [link(f"{leg}_thigh", 0.15, '<box size="0.02 0.02 0.10"/>', "0.03 0 -0.05"),
                  link(f"{leg}_shin", 0.10, '<box size="0.02 0.02 0.10"/>', "-0.03 0 -0.05"),
                  link(f"{leg}_foot", 0.02, foot),
                  joint(f"{leg}_hip", "revolute", "base_link", f"{leg}_thigh", f"{x} {y} -0.03", "0 1 0", lim),
                  joint(f"{leg}_knee", "revolute", f"{leg}_thigh", f"{leg}_shin", "0.06 0 -0.10", "0 1 0", lim),
                  joint(f"{leg}_ankle", "fixed", f"{leg}_shin", f"{leg}_foot", "-0.06 0 -0.10", "0 1 0")]
        records += [record(f"{leg}_hip", peak, rated, 8), record(f"{leg}_knee", peak, rated, 8)]
    return '<robot name="legs">' + "".join(parts) + "</robot>", spec("legs", family, records, {})


QUAD = {"fl": (0.12, 0.08), "fr": (0.12, -0.08), "rl": (-0.12, 0.08), "rr": (-0.12, -0.08)}


class LeggedTaskTests(unittest.TestCase):
    def test_quadruped_stands_and_squats(self):
        rep = run(*legs(QUAD, peak=6.0, rated=2.5, family="quadruped"))
        t = rep["tests"]
        self.assertTrue(t["stand_free"]["pass"], t["stand_free"]["explanation"])
        self.assertTrue(t["squat"]["pass"], t["squat"]["explanation"])
        self.assertAlmostEqual(t["squat"]["achieved_drop_m"], t["squat"]["commanded_drop_m"], delta=0.3 * t["squat"]["commanded_drop_m"])

    def test_weak_knees_fail_the_stand(self):
        t = run(*legs(QUAD, peak=0.15, rated=0.05, family="quadruped"))["tests"]
        self.assertFalse(t["stand_free"]["pass"] and t["squat"]["pass"])

    def test_humanoid_uses_rail_and_single_leg(self):
        urdf, robot = legs({"left": (0, 0.06), "right": (0, -0.06)}, peak=6.0, rated=2.5, family="humanoid", foot='<box size="0.08 0.04 0.01"/>')
        t = run(urdf, robot)["tests"]
        self.assertIsNone(t["stand_free"]["pass"])          # informational without a balance controller
        self.assertIn("rail", t["stand_rail"]["explanation"])
        self.assertIn("single_leg_rail", t)
        self.assertIn("squat_rail", t)


class ConverterArmatureTests(unittest.TestCase):
    def test_spec_adds_armature_and_ratings(self):
        urdf, robot = arm(peak=10.0, rated=4.0)
        robot["links"] = [{"name": "shoulder_pitch_actuator", "geometry": {"type": "mesh", "part": "component", "params": {"key": "feetech_sts3250"}}}]
        robot["joints"] = [{"name": "shoulder_pitch", "type": "revolute", "limit": {"effort": 10.0, "velocity": 6.0}},
                           {"name": "elbow_pitch", "type": "revolute", "limit": {"effort": 10.0, "velocity": 6.0}}]
        robot["metadata"]["design"]["joints"] = []
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "robot.urdf"; path.write_text(urdf)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                plain = mujoco.MjModel.from_xml_string(urdf_to_mjcf(str(path), floating=False))
                real = mujoco.MjModel.from_xml_string(urdf_to_mjcf(str(path), floating=False, spec=robot))
        self.assertTrue(np.all(plain.dof_armature == 0))
        sh = real.joint("shoulder_pitch").dofadr[0]
        self.assertGreater(real.dof_armature[sh], 0.01)              # 345^2 x rotor inertia estimate
        self.assertEqual(real.dof_armature[real.joint("elbow_pitch").dofadr[0]], 0)   # unknown actuator: nothing invented
        nid = mujoco.mj_name2id(real, mujoco.mjtObj.mjOBJ_NUMERIC, "ttr_rated_act_shoulder_pitch")
        self.assertGreater(nid, -1)


if __name__ == "__main__":
    unittest.main()
