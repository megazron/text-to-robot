# iron_man_mark_43

Prompt: Build me a movie-accurate wearable Iron Man Mark 43 suit from Age of Ultron with all the small polygon armour plates that open and close, repulsors, a HUD and an IMU. Budget $60000

![Current MuJoCo simulation](simulation.gif)

This GIF runs gravity, pose holding and self-collision on the shipped URDF. It is
not a learned policy or proof of hardware accuracy. The model's failures remain visible.

## Download and inspect

- [ROS 2 package](robot.ros2.zip), [training package](robot.training.zip), [URDF](robot.urdf), [robot JSON](robot.json), [BOM](BOM.md).
- [Simulation report](simulation_report.json): **2/6** checks;
  **227** initial penetration contacts.
- Failed checks: initial_clearance, settle_under_gravity, hold_pose, actuator_sweep.

## MoveIt / ROS 2

[Browse the generated MoveIt configuration](moveit/) (SRDF, KDL, OMPL, controllers).
Unzip the ROS package into a workspace's `src/` directory, then:

```bash
source /opt/ros/jazzy/setup.bash
rosdep install --from-paths src --ignore-src -r -y
colcon build
source install/setup.bash
ros2 launch iron_man_mark_43 move_group.launch.py
```

The launch uses mock hardware. Planning requires a collision-free start state.
The fixed-root planner is not a walking controller or a simulation bridge.

[Recorded MoveIt runtime result](moveit_report.json).

## Reproduce

From the repository root:

```bash
python scripts/audit_examples.py
python scripts/render_example_gifs.py
```

These are procedural concept models. Masses, motors and contacts are approximate;
manufacturing interfaces and measured dynamics remain unverified.

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
but the colliding suit start state blocks planning. [Wearer fit](wearability_report.json)
also fails. [Production references and downloaded design research](../../references/mark43/RESEARCH.md)
record the sources and limitations. [Visual comparison](../../docs/MARK43_VISUAL_REVIEW.md).

The current clearance revision replaces the misused forearm-shaped torso sides,
corrects mirrored pectoral wall thickness, separates chest/abdominal plates,
provides clamshell seam gaps and makes room around the internal cuffs. Palm
geometry starts beyond the wrist rather than extending into the gauntlet.

[Surface-contact comparison](surface_contact_comparison.json): **175 → 81**
non-adjacent intersecting pairs at neutral; 94 resolved and no new pairs in this
check. This tests visual triangle surfaces, with tessellated primitives. It does
not measure penetration depth or full containment, and differs from native MoveIt
and approximate MuJoCo collision geometry.
[Joint samples](surface_contact_report.json) retain shoulder and side-door failures.
