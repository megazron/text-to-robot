"""The motions every example ships: the ROS 2 package's JointTrajectory files load as YAML and name real, motor-driven
joints of the URDF; the training scaffold's reference CSVs have one column per joint (time first)."""
import csv, io, unittest, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = sorted(p for p in (ROOT / "examples").iterdir() if p.is_dir() and p.name[:2].isdigit())


def urdf_joints(text):
    root = ET.fromstring(text)
    moving = [j for j in root.findall("joint") if j.get("type") != "fixed"]
    return [j.get("name") for j in moving if j.find("mimic") is None], {j.get("name"): j for j in moving}


class MotionExports(unittest.TestCase):
    def test_ros2_trajectories_load(self):
        for ex in EXAMPLES:
            with self.subTest(ex.name), zipfile.ZipFile(ex / "robot.ros2.zip") as z:
                names = z.namelist(); pkg = names[0].split("/")[0]
                free, joints = urdf_joints(z.read(f"{pkg}/urdf/{pkg}.urdf"))
                motions = [n for n in names if n.startswith(f"{pkg}/motions/") and n.endswith(".yaml")]
                self.assertTrue(motions, "no motions in the ROS 2 package")
                self.assertIn(f"{pkg}/scripts/replay_motion.py", names)
                for n in motions:
                    msg = yaml.safe_load(z.read(n))
                    self.assertTrue(msg["joint_names"], n)
                    for j in msg["joint_names"]: self.assertIn(j, free, f"{n}: {j} is not a free joint of the URDF")
                    t = -1.0
                    for p in msg["points"]:
                        self.assertEqual(len(p["positions"]), len(msg["joint_names"]))
                        self.assertEqual(len(p["velocities"]), len(msg["joint_names"]))
                        tt = p["time_from_start"]["sec"] + p["time_from_start"]["nanosec"] * 1e-9
                        self.assertGreater(tt, t); t = tt
                        for j, v in zip(msg["joint_names"], p["positions"]):
                            lim = joints[j].find("limit")
                            if joints[j].get("type") in ("revolute", "prismatic") and lim is not None:
                                self.assertGreaterEqual(v, float(lim.get("lower")) - 1e-6, f"{n} {j}")
                                self.assertLessEqual(v, float(lim.get("upper")) + 1e-6, f"{n} {j}")

    def test_reference_motions_have_one_column_per_joint(self):
        for ex in EXAMPLES:
            with self.subTest(ex.name), zipfile.ZipFile(ex / "robot.training.zip") as z:
                names = z.namelist()
                urdf = next(n for n in names if n.startswith("training/") and n.endswith(".urdf") and n.count("/") == 1)
                free, _ = urdf_joints(z.read(urdf))
                refs = [n for n in names if n.startswith("training/reference_motions/") and n.endswith(".csv") and not n.endswith("_base.csv")]
                self.assertTrue(refs, "no reference motion")
                for n in refs:
                    rows = list(csv.reader(io.StringIO(z.read(n).decode())))
                    self.assertEqual(rows[0], ["time_s", *free], n)
                    self.assertTrue(all(len(r) == len(rows[0]) for r in rows[1:]))


if __name__ == "__main__":
    unittest.main()
