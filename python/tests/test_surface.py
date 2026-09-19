import importlib.util,tempfile,unittest
from pathlib import Path

@unittest.skipUnless(importlib.util.find_spec('fcl'), 'requires geometry extra')
class SurfaceTests(unittest.TestCase):
 def test_detects_contact_reached_by_rotation(self):
  from ttr_mujoco.surface import SurfaceScene,audit
  with tempfile.TemporaryDirectory() as td:
   path=Path(td)/'robot.urdf'
   path.write_text('''<robot name="fixture"><link name="base"/>
<link name="obstacle"><visual><origin xyz="0 .3 0"/><geometry><box size=".08 .08 .08"/></geometry></visual></link>
<link name="arm"><visual><origin xyz=".3 0 0"/><geometry><box size=".08 .08 .08"/></geometry></visual></link>
<joint name="mount" type="fixed"><parent link="base"/><child link="obstacle"/></joint>
<joint name="swing" type="revolute"><parent link="base"/><child link="arm"/><axis xyz="0 0 1"/><limit lower="0" upper="1.5707963267948966"/></joint></robot>''')
   scene=SurfaceScene(path);self.assertEqual(scene.contacts(),[])
   result=audit(scene,['swing'],3)
   self.assertFalse(result['pass']);self.assertEqual(result['poses_checked'],4)
   self.assertIn(('arm','obstacle'),result['motion'][-1]['new_pairs'])
   with self.assertRaises(ValueError):audit(scene,['missing'],3)
 def test_shipped_torso_and_wrists_have_no_neutral_surface_intersections(self):
  from ttr_mujoco.surface import SurfaceScene
  source=Path(__file__).resolve().parents[2]/'examples/14_iron_man_mark_43/robot.sim.urdf'
  targets={'left_chest_door','right_chest_door','left_lat_plate','right_lat_plate','backpack',
   'ab_plate_1','ab_plate_2','ab_plate_3','left_hand','right_hand','left_hand_plate','right_hand_plate',
   'left_elbow_cap','right_elbow_cap'}
  pairs=SurfaceScene(source).contacts()
  self.assertEqual(pairs, [], 'Every non-adjacent pair in the shipped neutral model must be clear')
  self.assertFalse([p for p in pairs if any('cuff' in name for name in p)])
  for side in ['left','right']:
   for a,b in [('thigh_clamshell','thigh_shell'),('calf_clamshell','shin_shell'),('bicep_clamshell','bicep_sleeve'),('gauntlet_clamshell','gauntlet_sleeve')]:
    self.assertNotIn(tuple(sorted((f'{side}_{a}',f'{side}_{b}'))),pairs)

 def test_chest_doors_clear_their_sampled_paths(self):
  from ttr_mujoco.surface import SurfaceScene,audit
  source=Path(__file__).resolve().parents[2]/'examples/14_iron_man_mark_43/robot.sim.urdf'
  report=audit(SurfaceScene(source),['left_chest_door_hinge','right_chest_door_hinge'],5)
  self.assertTrue(report['pass'])
