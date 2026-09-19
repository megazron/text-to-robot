import hashlib,json,tempfile,unittest,zipfile
from pathlib import Path
from ttr_mujoco.evidence import example_scene

class EvidenceTests(unittest.TestCase):
 def test_compound_archive_must_match_source(self):
  source='<robot name="box"><link name="base"><inertial><mass value="1"/><inertia ixx=".01" iyy=".01" izz=".01" ixy="0" ixz="0" iyz="0"/></inertial><visual><geometry><box size=".1 .1 .1"/></geometry></visual><collision><geometry><box size=".1 .1 .1"/></geometry></collision></link></robot>'
  with tempfile.TemporaryDirectory() as td:
   folder=Path(td);(folder/'robot.urdf').write_text(source)
   with zipfile.ZipFile(folder/'robot.convex.zip','w') as z:
    z.writestr('robot.urdf',source)
    z.writestr('collision_report.json',json.dumps({'source_urdf_sha256':hashlib.sha256(source.encode()).hexdigest(),'limitations':['fixture']}))
   with example_scene(folder) as (xml,evidence):
    self.assertIn('<mujoco',xml);self.assertTrue(evidence['self_collision'])
    self.assertEqual(evidence['collision_archive_sha256'],hashlib.sha256((folder/'robot.convex.zip').read_bytes()).hexdigest())
   (folder/'robot.urdf').write_text(source+'\n')
   with self.assertRaisesRegex(ValueError,'Stale'):
    with example_scene(folder):pass
