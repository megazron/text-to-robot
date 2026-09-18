# Physical fidelity audit

The generator produces reproducible concepts. It does not yet turn an arbitrary
sentence into an engineered machine. Changing TypeScript to Python does not supply
missing measurements, mechanisms or physical models.

## Corrected defects

- Each MuJoCo position actuator now has its URDF effort bound. A 2.5 N·m hinge
  cannot inherit a whole-suit force allowance. Missing/invalid effort limits fail
  conversion rather than silently inventing hardware capacity.
- Continuous-joint limits survive URDF export. New templates mark defaults as
  inferred; legacy URDFs without limits must be regenerated or given measured limits.
- Full source inertia tensors, including products of inertia and inertial-frame
  rotations, are restored directly after URDF import. No fictitious rotor inertia,
  damping or friction is injected; URDF dynamics remain authoritative.
- Mesh mass centres and rotated bounding-box centres are applied in the geometry
  frame. Recipe scale is baked into STL exactly once. Xacro retains explicit tensors.
- CAD imports use the actual per-link STL filename and apply its baked origin once.
- A falling model fails recovery. A numerical-reset warning fails a rollout even
  when the reset state is finite. Sweep tests reset each actuator trial and require
  every actuator to track across the trajectory, using RMS error (0.15 rad for hinges,
  0.01 m for slides). A stalled actuator cannot pass by ending a sinusoid near its target.
  Each actuator reports its RMS/peak error and peak force. These thresholds are smoke
  criteria, not measured hardware specifications. Hold tests compare against the commanded initial pose.
- Wearer comparison reports peak actuator force across the rollout, not only the
  last sample. It remains an ideal welded-mannequin experiment.

## What the Mark 43 results mean

The regenerated smoke reports record balance/tracking failures rather than hiding
falls or enlarging actuators. See `mujoco_report*.json` beside the example. The
mannequin remains ideal welded geometry with disabled human contact; its mass is
75 kg without hidden decorative mass. It does not demonstrate wearable support.

All **106 exported STL parts** pass independent closed-volume/winding and mass
integration checks. Earlier procedural meshes included open seams, degenerate poles,
self-overlapping helmet detail and filled cuffs. These generators are repaired;
the faceplate now has geometric eye apertures, the cuffs and pelvis are hollow,
and mass/COM/full inertia come from solid volume integrals rather than a thin-surface
approximation. See `mesh_quality_report.json` and `scripts/check_mesh_assets.py`.

The configurable neutral stance separates legs and abducts the arms; mirrored
abduction axes are corrected. These inferred dimensions are not a measured body fit.
Palette and proportions were compared with [official Hot Toys photographs](https://www.sideshow.com/collectibles/marvel-iron-man-mark-xliii-hot-toys-902314).
The procedural silhouette still differs substantially from the film suit.

The default URDF retains inexpensive box collision proxies. The optional Python
`ttr-collision` tool uses [CoACD](https://github.com/SarahWeiii/CoACD) to replace mesh
collision proxies with compound convex solids and export portable assets. A single
MuJoCo mesh collision hull would fill concave shell cavities; see
[MuJoCo collision documentation](https://mujoco.readthedocs.io/en/latest/computation/).
The example includes `robot.convex.zip`, a source-hashed decomposition report and an
initial-pose clearance comparison. **Both collision representations still show
interference:** 124 box contacts (maximum depth 45 mm), or 409 compound-convex
contacts (maximum depth 9 mm). The latter uses 2,516 convex pieces from 72 unique
decompositions; its largest sampled surface deviation is about 7 mm. Contact counts between them are not directly comparable because
one object pair can produce many convex-hull contact points.

The requested 2 mm concavity is not a certified surface tolerance. The report samples
512 points on component hull surfaces, including internal interfaces, and measures
distance to the source mesh. This is not the union boundary or a worst-case
Hausdorff bound; it also does not bound missing material. Hull count caps can limit
fidelity. Adjacent-body exclusions mean the reports do not establish full assembly clearance.
`motion_clearance_report.json` adds nine samples across each limited joint range
(595 poses including neutral), with worst-contact witness joint positions. Every
sampled pose still has interference. This independently moves one joint at a time;
it does not cover simultaneous motions, space between samples, or dynamic reachability.

URDF effort bounds are necessary but insufficient. They do not model motor
torque–speed curves, continuous versus peak duty, controller bandwidth, compliance,
backlash, electrical power or temperature. Servo gains are still inferred, and
velocity limits are not enforced as a motor model. No sim-to-real accuracy is claimed.

## Python CAD backend

`ttr-enclosure` takes a dimensioned manifest, not generated Python code, and uses
CadQuery/OpenCascade to create genuine solids. It exports base/lid STEP, printable
STL, geometric checks and mass/COM/inertia from a specified homogeneous density.
The same tool is included in every CAD download. Units are explicit: CAD in mm,
report mass in kg and inertia in kg·m². STL has no intrinsic units.

The rectangular populated-board envelope cannot express arbitrary connectors,
underside components, screw-head keepouts or ventilation requirements. Measure those
before using the housing. Standoffs assume a flat mounting plane with empty space
below it; the cable opening is generic. Bolts/nuts/washers need deliberate selection.
`ttr-attach-enclosure` takes an explicit parent link, mounting transform in metres/
radians and measured electronics mass. It embeds base/lid CAD tessellations, exact
solid mass/COM/inertia, fixed joints and a uniform electronics envelope into robot
JSON. **Import JSON** in the web viewer validates and displays this assembly and
makes it available to the existing URDF/CAD exporters. CAD ZIPs include the robot
JSON and standalone enclosure/attachment scripts. The selected fixed transform is
not a designed fastener interface: fastener/cable masses, mount strength and
clearance remain unverified. It is not a structural suit component.

## Inputs needed for a buildable wearable

1. Choose the actual use: unpowered armour, humanoid robot or powered wearable;
   define motions, loads, runtime and allowable mass.
2. Obtain licensed/reference geometry for visual fidelity and measured body scans
   or wearer dimensions for fit. Height-only anthropometrics do not establish fit.
3. Select exact actuators, bearings, transmissions, sensors, battery and compute;
   record vendor drawings, ratings and revision/source for every physical value.
4. Design mounting interfaces, fasteners, cable routes, access, ventilation and
   joint clearances in solid CAD. Prototype representative joints and housings.
5. Derive mass properties from material/CAD, add all purchased hardware, create
   validated collision models and test interference through complete motion paths.
6. Identify dynamics from measured hardware and compare held-out motion/load tests
   against simulation before training policies intended for transfer.

A human-bearing powered suit additionally needs qualified mechanical/electrical
review, joint alignment, load-path and release design, and staged testing. Fictional
flight/repulsor features remain decorative placeholders. No "perfect buildable
Mark 43" or wearable qualification is delivered by this change.


## Reproduce the evidence

```bash
npm install
pip install -e './python[cad,geometry]'
node scripts/regen_mark43_example.ts
python scripts/audit_mark43.py --convex
python scripts/check_mesh_assets.py --json examples/14_iron_man_mark_43/mesh_quality_report.json
npm test
npm run typecheck
python -m unittest discover -s python/tests -v
```

The mesh audit and regression tests gate CI. Concept balance/tracking diagnostics
are uploaded separately even when they fail. They are evidence of the remaining
physical problems, not software tests whose expected answer should be changed to
make the model look successful.
