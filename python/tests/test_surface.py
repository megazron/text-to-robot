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
  report=audit(SurfaceScene(source),['left_chest_door_hinge','right_chest_door_hinge'],61)
  self.assertTrue(report['pass'])

 def test_chest_doors_clear_simultaneous_opening(self):
  import numpy as np
  from ttr_mujoco.surface import SurfaceScene
  source=Path(__file__).resolve().parents[2]/'examples/14_iron_man_mark_43/robot.sim.urdf'
  scene=SurfaceScene(source)
  for angle in np.linspace(0,1.2,61):
   self.assertEqual(scene.contacts({'left_chest_door_hinge':float(angle),'right_chest_door_hinge':-float(angle)}),[],f'Opening angle {angle}')

 def test_grid_detects_collision_missed_by_independent_sweeps(self):
  from ttr_mujoco.surface import SurfaceScene,audit,audit_grid
  with tempfile.TemporaryDirectory() as td:
   path=Path(td)/'robot.urdf'
   path.write_text('''<robot name="combined"><link name="base"/>
<link name="a"><visual><origin xyz="0 .3 0"/><geometry><box size=".04 .04 .04"/></geometry></visual></link>
<link name="b"><visual><origin xyz=".3 0 0"/><geometry><box size=".04 .04 .04"/></geometry></visual></link>
<joint name="a_slide" type="prismatic"><parent link="base"/><child link="a"/><axis xyz="0 1 0"/><limit lower="-.3" upper="0"/></joint>
<joint name="b_slide" type="prismatic"><parent link="base"/><child link="b"/><axis xyz="1 0 0"/><limit lower="-.3" upper="0"/></joint></robot>''')
   scene=SurfaceScene(path)
   self.assertTrue(audit(scene,['a_slide','b_slide'],3)['pass'])
   result=audit_grid(scene,['a_slide','b_slide'],3)
   self.assertFalse(result['pass']);self.assertEqual(result['poses_checked'],10)
   self.assertEqual(result['failing_grid_poses'],1)
   self.assertEqual(result['failures'][0]['positions'],{'a_slide':-.3,'b_slide':-.3})
   self.assertEqual(result['failures'][0]['pairs'],[('a','b')])
   for names,samples in [(['a_slide','a_slide'],3),(['missing','b_slide'],3),(['a_slide','b_slide'],101)]:
    with self.assertRaises(ValueError):audit_grid(scene,names,samples)

 def test_shipped_neck_clears_combined_yaw_and_pitch(self):
  from ttr_mujoco.surface import SurfaceScene,audit_grid
  source=Path(__file__).resolve().parents[2]/'examples/14_iron_man_mark_43/robot.sim.urdf'
  result=audit_grid(SurfaceScene(source),['neck_yaw','neck_pitch'],13)
  self.assertTrue(result['pass'],result['failures'][:3])

 def test_clamshells_open_away_from_their_own_cuffs_and_shells(self):
  import numpy as np
  from ttr_mujoco.surface import SurfaceScene
  source=Path(__file__).resolve().parents[2]/'examples/14_iron_man_mark_43/robot.sim.urdf'
  scene=SurfaceScene(source)
  # Adjacent torso/limb interference is retained in the full-joint report.
  # This regression specifically prevents driving an opening panel into its
  # own cuff, including poses where the standing body's neighbours also collide.
  families={'bicep':('upper_arm_cuff','bicep_sleeve'),
   'gauntlet':('forearm_cuff','gauntlet_sleeve'),
   'thigh':('thigh_cuff','thigh_shell'),'calf':('shank_cuff','shin_shell')}
  for side,sign in [('left',1),('right',-1)]:
   for part,stationary in families.items():
    panel=f'{side}_{part}_clamshell';name=panel+'_hinge'
    joint=next(j for j in scene.joints if j.get('name')==name);limit=joint.find('limit')
    lo,hi=float(limit.get('lower')),float(limit.get('upper'))
    self.assertAlmostEqual(hi-lo,1.4)
    self.assertAlmostEqual(hi if sign>0 else lo,sign*1.4)
    forbidden={frozenset((panel,f'{side}_{suffix}')) for suffix in stationary}
    for angle in np.linspace(lo,hi,61):
     pairs=scene.contacts({name:float(angle)})
     self.assertFalse([p for p in pairs if frozenset(p) in forbidden],(name,angle,pairs))
