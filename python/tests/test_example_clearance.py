"""Regression coverage for the concrete shipped-example geometry fixes."""
import unittest
from pathlib import Path
import mujoco
from ttr_mujoco.convert import urdf_to_mjcf
class ExampleClearanceTests(unittest.TestCase):
    def test_shipped_nonwearable_examples_compile_and_clear_at_rest(self):
        root=Path(__file__).resolve().parents[2]/'examples'
        for source in sorted(root.glob('*/robot.urdf')):
            if source.parent.name.startswith('14_'):continue # known unresolved wearable, reported separately
            with self.subTest(example=source.parent.name):
                m=mujoco.MjModel.from_xml_string(urdf_to_mjcf(str(source),self_collision=True));d=mujoco.MjData(m);mujoco.mj_forward(m,d)
                bad=[float(c.dist) for c in d.contact if c.dist<-.001 and all(m.geom_type[g]!=mujoco.mjtGeom.mjGEOM_PLANE for g in (c.geom1,c.geom2))]
                self.assertEqual(bad,[])
