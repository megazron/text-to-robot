from pathlib import Path
import json,zipfile,shutil
root=Path('examples');summary=json.loads((root/'validation_summary.json').read_text())
index=['# Example gallery and validation','','All 17 examples were exported and tested with self-collision enabled. Zero initial contacts is an initial-pose check, not full-range clearance or hardware qualification.','','| Example | MuJoCo checks | Initial penetrations | Remaining failed checks |','|---|---|---|---|']
for row in summary['examples']:
 folder=root/row['example'];spec=json.loads((folder/'robot.json').read_text());name=spec['robot_name']
 source=Path('/tmp/ttr-example-packages')/folder.name
 with zipfile.ZipFile(folder/'robot.ros2.zip','w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(source.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(source))
 training=Path('/tmp/ttr-example-training')/folder.name
 if training.exists():
  with zipfile.ZipFile(folder/'robot.training.zip','w',zipfile.ZIP_DEFLATED) as z:
   for p in sorted(training.rglob('*')):
    if p.is_file() and "__pycache__" not in p.parts and p.suffix!=".pyc":z.write(p,p.relative_to(training))
 moveit=source/name/'moveit' 
 if moveit.exists():
  if (folder/'moveit').exists():shutil.rmtree(folder/'moveit')
  shutil.copytree(moveit,folder/'moveit')
 has_moveit=any((folder/'moveit').glob('*.srdf')) if (folder/'moveit').exists() else False
 failures=', '.join(row.get('failed',[])) or 'none in this smoke battery'
 text=f'''# {name}

Prompt: {spec['metadata'].get('source_prompt','See prompt.txt')}

![Current MuJoCo simulation](simulation.gif)

This GIF runs gravity, pose holding and self-collision on the shipped URDF. It is
not a learned policy or proof of hardware accuracy. The model's failures remain visible.

## Download and inspect

- [ROS 2 package](robot.ros2.zip), [training package](robot.training.zip), [URDF](robot.urdf), [robot JSON](robot.json), [BOM](BOM.md).
- [Simulation report](simulation_report.json): **{row.get('passed',0)}/{row.get('total',0)}** checks;
  **{row.get('initial_penetrations','unknown')}** initial penetration contacts.
- Failed checks: {failures}.

## MoveIt / ROS 2

'''
 if has_moveit:
  text+=f'''[Browse the generated MoveIt configuration](moveit/) (SRDF, KDL, OMPL, controllers).
Unzip the ROS package into a workspace's `src/` directory, then:

```bash
source /opt/ros/jazzy/setup.bash
rosdep install --from-paths src --ignore-src -r -y
colcon build
source install/setup.bash
ros2 launch {name} move_group.launch.py
```

The launch uses mock hardware. Planning requires a collision-free start state.
The fixed-root planner is not a walking controller or a simulation bridge.
'''
 else:
  text+='''No serial manipulator group applies to this example; MoveIt is not generated.
The ROS package includes display and control files. Wheeled navigation needs a
navigation controller; a gripper alone needs a gripper controller.
'''
 if (folder/'moveit_report.json').exists():text+='\n[Recorded MoveIt runtime result](moveit_report.json).\n'
 text+='''
## Reproduce

From the repository root:

```bash
python scripts/audit_examples.py
python scripts/render_example_gifs.py
```

These are procedural concept models. Masses, motors and contacts are approximate;
manufacturing interfaces and measured dynamics remain unverified.
'''
 if folder.name.startswith('07_'):text+='\nThe mecanum wheels currently use cylindrical contact geometry; roller contact and holonomic traction are not modelled.\n'
 if folder.name.startswith('16_'):text+='\nEVA has a free base under gravity; there is no physical levitation or flight controller.\n'
 if folder.name.startswith('14_'):
  text+='''
## Current armour and helmet animations

![Armour actuator preview](articulation.gif)
![Helmet actuator preview](helmet.gif)

These two previews use a **fixed base and self-collision disabled** to show the
actuated geometry. They do not validate donning or motion clearance. The first
GIF and simulation report above use self-collision enabled.

[MoveIt runtime result](moveit_report.json): controllers and planning scene start,
but the colliding suit start state blocks planning. [Wearer fit](wearability_report.json)
also fails. [Production references and downloaded design research](../../references/mark43/RESEARCH.md)
record the sources and limitations. [Visual comparison](../../docs/MARK43_VISUAL_REVIEW.md).
'''
 (folder/'README.md').write_text(text)
 index.append(f"| [{folder.name}]({folder.name}/) | {row.get('passed',0)}/{row.get('total',0)} | {row.get('initial_penetrations','?')} | {failures} |")
(root/'README.md').write_text('\n'.join(index)+'\n')
