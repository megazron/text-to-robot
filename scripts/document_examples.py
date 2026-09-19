from pathlib import Path
import json
root=Path('examples');summary=json.loads((root/'validation_summary.json').read_text())
index=['# Example gallery and validation','','All 17 examples were exported and tested with self-collision enabled. Mark 43 uses source-checked compound hulls; other examples use primitives and mesh proxies. Zero initial contacts is an initial-pose check, not full-range clearance or hardware qualification.','','| Actual simulation | Example and downloads | MuJoCo checks | Initial penetrations | Remaining failed checks |','|---|---|---|---|---|']
for row in summary['examples']:
 folder=root/row['example'];spec=json.loads((folder/'robot.json').read_text());name=spec['robot_name']
 has_moveit=any((folder/'moveit').glob('*.srdf')) if (folder/'moveit').exists() else False
 physics=json.loads((folder/'simulation_report.json').read_text())
 failures=', '.join(row.get('failed',[])) or 'none in this smoke battery'
 text=f'''# {name}

Prompt: {spec['metadata'].get('source_prompt','See prompt.txt')}

![Current MuJoCo simulation](simulation.gif)

Collision model: **{physics.get('collision_model','URDF primitives / mesh bounding boxes')}**.

This GIF runs gravity, pose holding and self-collision on the shipped model. It is
not a learned policy or proof of hardware accuracy. The model's failures remain visible.

## Download and inspect

- [CAD / STL / OpenSCAD](robot.cad.zip), [ROS 2 package](robot.ros2.zip), [training package](robot.training.zip), [URDF](robot.urdf), [robot JSON](robot.json), [BOM](BOM.md).
- [Simulation report](simulation_report.json): **{row.get('passed',0)}/{row.get('total',0)}** checks;
  **{row.get('initial_penetrations','unknown')}** initial penetration contacts.
- Failed checks: {failures}.
- [Physical build evidence and missing interfaces](BUILDABILITY.md), [machine-readable record](buildability_report.json). **No tested physical build is documented.**

## Design research

[Public engineering sources and model-specific changes](../../references/engineering/README.md).

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
 if (folder/'task_motion_report.json').exists():
  motion=json.loads((folder/'task_motion_report.json').read_text())
  text+=f"\n## Coordinated motion\n\n![Actual coordinated arm motion](task_motion.gif)\n\n[Motion report](task_motion_report.json): **{'PASS' if motion['pass'] else 'FAIL'}** for one smooth outward/return path. Gravity and self-collision are enabled; model-based bias compensation acts through the original effort-limited motors. Requested speed stays below half the declared limit. This does not validate the full workspace, a learned skill or a hardware build. The independent stress-sweep results above are unchanged.\n"
 if (folder/'moveit_report.json').exists():text+='\n[Recorded MoveIt runtime result](moveit_report.json).\n'
 text+='''
## Reproduce

From the repository root:

```bash
node scripts/export_examples.ts
python scripts/audit_examples.py
python scripts/render_example_gifs.py
python scripts/document_examples.py
python scripts/verify_example_artifacts.py
```

These are procedural concept models. Masses, motors and contacts are approximate;
manufacturing interfaces and measured dynamics remain unverified.
'''
 if folder.name.startswith('07_'):text+='\nMecanum wheels have 32 passive rollers and four velocity-controlled hubs. See [measured forward/strafe motion](../mobile_motion.json); this is an open-loop simulation check, not calibrated hardware traction.\n'
 if folder.name.startswith('16_'):text+='\nEVA is a supported display prototype with a pedestal, column, neck support and shoulder connectors. There is no levitation or flight controller.\n'
 if folder.name.startswith('14_'):
  text+='''
## Current armour and helmet animations

![Armour actuator preview](articulation.gif)
![Helmet actuator preview](helmet.gif)

### Individual joint checks

![Finger articulation](hand_joints.gif)
![Neck articulation](neck_joints.gif)
![Chest door attachments](chest_joints.gif)

These three close-ups prescribe joint positions on the exported meshes, with
collision resolution disabled. They verify the joint tree, not actuator forces
or safe motion. [Source-hashed articulation report](articulation_report.json).
Each finger has three flexion joints; each thumb has two. The neck has yaw and
pitch, and the chest inlays now move with their chest doors. Fixed trim is meant
to move with its supporting plate, not have an independent motor.


These two previews use a **fixed base and self-collision disabled** to show the
actuated geometry. They do not validate donning or motion clearance. The first
GIF and simulation report above use self-collision enabled.

[MoveIt runtime result](moveit_report.json): controllers and planning scene start,
with a collision-free neutral state. Small neck and left/right arm goals plan and
execute through mock control; this does not validate the whole motion range or
real motors. [Left arm](moveit_left_arm_report.json), [right arm](moveit_right_arm_report.json).
An initial five-second right-arm request [timed out](moveit_right_arm_timeout.json)
while other audits were running; a subsequent request succeeded. This is not a
planning reliability benchmark. [Wearer fit](wearability_report.json)
also fails. [Production references and downloaded design research](../../references/mark43/RESEARCH.md)
record the sources and limitations. [Visual comparison](../../docs/MARK43_VISUAL_REVIEW.md).

The current revision separates helmet seams and adds the red forehead insert,
reshapes shoulders and boot uppers, and cuts limb-shell ends around joint motors.
Surface-following boot/forearm trim replaces intersecting badges. Rear details
follow their flight flaps. Internal struts have clearance at their connector ends.

[Surface-contact comparison](surface_contact_comparison.json): **81 → 0**
non-adjacent intersecting pairs at neutral. No new neutral pairs were introduced.
This tests visual triangle surfaces with tessellated primitives; it is not a
penetration-depth, full-containment or wearer-fit measurement.
[Sampled motion poses](surface_contact_report.json) still expose shoulder, side-door,
chin and other motion failures. Zero neutral contacts is not full articulation approval.

The main physics GIF and smoke report use the source-checked compound collision
archive, with self-collision enabled. The old box approximation fills hollow armour
and creates false collisions; its diagnostic remains in [clearance_report.json](clearance_report.json)
for comparison. Compound hulls are still approximations; their errors are reported.

'''
 (folder/'README.md').write_text(text.rstrip()+'\n')
 index.append(f"| [<img src='{folder.name}/simulation.gif' width='220' alt='{name} simulation'>]({folder.name}/) | [{folder.name}]({folder.name}/)<br>[CAD]({folder.name}/robot.cad.zip) · [Results]({folder.name}/simulation_report.json) · [Build evidence]({folder.name}/BUILDABILITY.md) | {row.get('passed',0)}/{row.get('total',0)} | {row.get('initial_penetrations','?')} | {failures} |")
(root/'README.md').write_text('\n'.join(index)+'\n')

# Make all results visible in the main README, before the detailed Mark 43 section.
root_readme=Path('README.md');content=root_readme.read_text()
start='<!-- EXAMPLE_GALLERY_START -->';end='<!-- EXAMPLE_GALLERY_END -->'
cells=[]
for row in summary['examples']:
 name=row['example'];label=name[3:].replace('_',' ')
 cells.append(f"[**{label}**](examples/{name}/)<br>![{label}: actual gravity/self-collision run](examples/{name}/simulation.gif)<br>{row.get('passed',0)}/{row.get('total',0)} simulation checks · [CAD](examples/{name}/robot.cad.zip) · [Results](examples/{name}/simulation_report.json) · [Build evidence](examples/{name}/BUILDABILITY.md)")
gallery=[start,'','These are actual simulations of all 17 exported examples. Check counts are smoke-test results; no example has a documented physical prototype. Click **Build evidence** for the missing manufacturing and hardware work.','','| | | |','|---|---|---|']
for i in range(0,len(cells),3):gallery.append('| '+' | '.join((cells[i:i+3]+['']*3)[:3])+' |')
gallery+=['',end]
block='\n'.join(gallery)
if start in content:content=content[:content.index(start)]+block+content[content.index(end)+len(end):]
else:content=content.replace('## Iron Man: MoveIt and animated previews',block+'\n\n## Iron Man: MoveIt and animated previews')
root_readme.write_text(content)
for row in summary['examples']:
 folder=root/row['example'];r=json.loads((folder/'buildability_report.json').read_text())
 lines=[f"# Physical build evidence — {folder.name}",'','**Not manufacturing-ready. No tested physical prototype is documented.**','','[CAD export](robot.cad.zip) · [BOM](BOM.md) · [Simulation results](simulation_report.json) · [Source-hashed inventory](buildability_report.json)','','The CAD contains conceptual link solids. It is not a set of verified motor mounts, bearing seats, electronics housings and assembly drawings. The optional enclosure generator uses synthetic dimensions until measured hardware is supplied.','',f"Declared model mass: {r['declared_mass_kg']:.3f} kg. {len(r['links_with_inferred_mass'])} links have inferred mass. {len(r['joint_requirements'])} joints require actuator integration.",'',f"Catalogue effort sizing: {'passes its estimate' if r['actuator_catalogue_sizing_pass'] else 'fails'}. This does not establish speed, duty cycle, fit or electrical compatibility.",'','## Missing evidence','']
 for item in r['missing_evidence']:lines.append('- '+item['detail'])
 if folder.name.startswith('07_'):lines+=['','Mecanum rollers and directional traction are not modelled; cylindrical wheels cannot validate omnidirectional hardware behaviour.']
 if folder.name.startswith('16_'):lines+=['','No levitation system is designed. The free-base EVA model falls under gravity.']
 if folder.name.startswith('17_'):lines+=['','The rigid-body Baymax model does not validate inflatable skins, pressure control or compliant human contact.']
 if folder.name.startswith('14_'):lines+=['','Wearer entry, joint alignment, breathing, emergency release and load-bearing safety remain unverified. See [wearer checks](wearability_report.json).']
 (folder/'BUILDABILITY.md').write_text('\n'.join(lines)+'\n')
