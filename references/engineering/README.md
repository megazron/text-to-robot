# Public engineering research and design decisions

Reviewed 19 September 2026. These sources inform our own parametric designs.
They do not supply product geometry or run in the web service. Dimensions below
are explicitly ours unless identified as a published specification. None of these
sources certifies our robots or establishes a physical prototype.

| Public source | Engineering observation | Applied change |
|---|---|---|
| [ROBOTIS OpenMANIPULATOR-X assembly](https://emanual.robotis.com/docs/en/platform/openmanipulator_x/assembly/) | Separate frames, bearing/idler parts, gripper rails, pads, mounting screws and routed cables are part of an assembly—not solid cylinders alone. | Separable chassis plates, through-bores, vented lids and hollow standoffs; closing gripper pads. These are our original parts, not compatible replacements for ROBOTIS parts. |
| [ROBOTIS arm specification and inertias](https://emanual.robotis.com/docs/en/platform/openmanipulator_x/specification/) | Link masses, centre-of-mass frames and tensor units must be explicit. A robot's payload and repeatability belong to a tested complete mechanism. | Retain explicit SI inertia generation and distinguish our assumed densities/actuator sizes from hardware measurements. No imported payload or repeatability claims. |
| [REV mecanum wheel mechanics](https://docs.revrobotics.com/duo-build/motion/wheels) and [wheel layout](https://docs.revrobotics.com/duo-build/mecanum-drivetrain-kit-mecanum-drivetrain/mecanum-wheel-setup-and-behavior) | Mecanum motion depends on free rollers at 45 degrees and opposing handedness. Four ordinary cylinders cannot model it. | Four driven hubs and 32 passive rollers; X handedness; explicit passive-joint support; contact-driven forward/strafe tests. Our 120 mm wheel design is not a REV part replica. |
| [ROBOTIS OP3 joint configuration](https://emanual.robotis.com/docs/en/platform/op3/tutorials/) | A walking humanoid uses hip yaw/roll/pitch and ankle pitch/roll, calibration offsets and tuned controllers. | Add hip yaw/roll/pitch and ankle pitch/roll to the humanoid, mech and Baymax families. Carrier dimensions remain our assumptions; topology alone does not provide a walking controller. |
| [ROS 2 velocity controller](https://control.ros.org/jazzy/doc/ros2_controllers/velocity_controllers/doc/userdoc.html) | Wheel speed control uses a velocity command interface. | Separate wheel velocity controller and bounded position-joint trajectory configuration; passive rollers receive no motor commands. |
| [Legacy Effects production armour](https://www.legacyefx.com/avengersaou) | Production photographs provide a visual Mark 43 reference, not powered-exoskeleton drawings or wearer-clearance measurements. | Preserve the existing [image research and comparison](../mark43/RESEARCH.md); do not attribute wearable/powered functionality to movie imagery. |

## Model-by-model changes and gaps

| Examples | Applied changes | Still required for a physical build |
|---|---|---|
| 01 planar arm | Two parallel pitch axes, useful segment lengths, hollow mounting pedestal, bent home pose and distinct joint hubs | Motor brackets, bearings, hard stops, measured torque/speed |
| 02 six-axis arm | Correct shoulder/elbow pitch architecture, bent home pose, distinct joint hubs, hollow pedestal, closing gripper pads | Full joint-range collision/actuator qualification |
| 03 seven-axis arm | Hollow pedestal and closing contact pads | Redundant-arm workspace/planning and real hardware interfaces |
| 04 SCARA | Hollow column with removable panels | Linear rail, leadscrew, nut carrier and spindle support design |
| 05 differential drive | Hollow chassis, front/rear passive swivel-and-roll casters, speed commands | Caster bracket/axle fabrication, bearing fits and odometry |
| 06 four-wheel base | Hollow chassis and speed commands | Motor mounts, wiring, traction calibration |
| 07 mecanum | Independent free rollers and physically produced sideways motion | Roller bearings, axles, hub fabrication and measured contact friction |
| 08 humanoid | Six-axis legs, hollow torso, closing gripper pads, better training observations | Balancing controller, calibrated actuators and physical structural design |
| 09 gripper | Contact pads close at zero; 0–60 mm additional aperture | Rail/transmission, force sensing and demonstrated object grasps |
| 10 quadruped | Hollow chassis, explicit feet and corrected ground height | Leg actuators, a gait and measured ground contacts |
| 11 hexapod | Hollow body, consistent left/right radial layout, contact feet | Servo mounting, gait and terrain testing |
| 12 rover arm | Separate hollow base/arm pedestals, corrected arm and wheel control | Mobile manipulation, stability under payload, component fit |
| 13 battle mech | Six-axis legs, hollow torso and corrected training dynamics/interfaces | A feasible complete mechanism; character appearance is not hardware evidence |
| 14 Mark 43 | Raised/repositioned faceplate pivot with nine clear sampled opening poses; refreshed physical-state training rewards/observations | Known moving-panel collisions, wearer entry/clearance, strength, cooling and actuation. The closed silhouette is unchanged; film accuracy remains incomplete. |
| 15 WALL-E | Hollow body, raised guards that no longer drag on the floor, wheel-speed actuation, closing pads | Continuous belts and tensioners; currently a wheeled approximation |
| 16 EVA | Physical pedestal, support column, shoulder connectors and separated head; reachable training targets | Component fits and a supported-display assembly. No hover capability is claimed. |
| 17 Baymax | Six-axis legs, torso clearance for hip carriers, physical-state training rewards and complete base observations | Actual soft-skin/frame/actuator design and balancing; rigid capsules are not an inflatable robot |

Our sheet parts use 3 mm thickness, 3.4 mm mounting bores, 12 mm edge offsets,
and assumed aluminium density of 2700 kg/m³. The source guides motivate the
assembly approach; these numbers are original provisional design choices.
Small holes remain filled in the cheap collision proxies, while the visual/CAD
meshes contain the actual openings. The hollow chassis interior stays hollow
because walls are independent bodies, not one enclosing collision box.

A simulation result is tied to the shipped model and recorded in each example.
The mobile-motion report evaluates two-second commands, not navigation or learned
skills. Manufacturing drawings, component interfaces and prototype tests remain
necessary. The source list is a research record, not a declaration of perfection.
