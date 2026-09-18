import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

import mujoco
import numpy as np
from ttr_mujoco.convert import load_model, _lowest_point
from ttr_mujoco.collision import prepare, decompose


@unittest.skipUnless(importlib.util.find_spec("coacd") and importlib.util.find_spec("trimesh"), "install .[geometry]")
class CollisionTests(unittest.TestCase):
    def test_hollow_ring_remains_empty_and_portable_in_mujoco(self):
        import trimesh
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); ring=trimesh.creation.annulus(r_min=.03,r_max=.04,height=.02,sections=24)
            ring.export(root/"ring.stl")
            source=root/"input.urdf"
            source.write_text('''<robot name="ring"><link name="base"><inertial><mass value="0.1"/>
              <inertia ixx="0.0001" iyy="0.0001" izz="0.00015" ixy="0" ixz="0" iyz="0"/></inertial>
              <visual><geometry><mesh filename="ring.stl"/></geometry></visual>
              <collision><geometry><box size=".08 .08 .02"/></geometry></collision></link></robot>''')
            report=prepare(source,root/"prepared",tolerance_m=.003,max_hulls=32)
            self.assertGreater(report["collision_hulls"],1)
            tree=ET.parse(root/"prepared/robot.urdf")
            for element in tree.findall(".//collision/geometry/mesh"):
                hull=trimesh.load_mesh(root/"prepared"/element.get("filename"))
                self.assertTrue(hull.is_convex)
                self.assertFalse(hull.contains([[0,0,0]])[0],"collision hull must not fill the central cavity")
            # Relocation must not depend on original source assets.
            (root/"ring.stl").unlink();source.unlink()
            model=load_model(str(root/"prepared/robot.urdf"),floating=True,self_collision=True)
            self.assertGreater(model.ngeom,2)
            self.assertAlmostEqual(float(model.body_mass.sum()),.1)
            data=mujoco.MjData(model);mujoco.mj_forward(model,data)
            # Collision mesh vertices, not bounding-sphere radii, set the spawn height.
            self.assertAlmostEqual(float(model.qpos0[2]),.015,places=5)

    def test_open_source_is_rejected_instead_of_silently_remeshed(self):
        import trimesh
        source=trimesh.creation.box();source.update_faces(np.arange(len(source.faces)-1))
        with self.assertRaisesRegex(ValueError,"closed volume"):
            decompose(source,.002,32)


if __name__=="__main__":unittest.main()
