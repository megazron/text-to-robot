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
  every actuator to track. Hold tests compare against the commanded initial pose.
- Wearer comparison reports peak actuator force across the rollout, not only the
  last sample. It remains an ideal welded-mannequin experiment.

## What the Mark 43 results mean

The corrected empty suit fails disturbance recovery. The mannequin-loaded model
fails the actuator sweep. The initial self-collision audit finds 479 penetrating
proxy contacts, maximum depth approximately 93 mm. These are collision-box contacts,
not measured mesh intersection volumes. Adjacent-body collision exclusions also
mean this is not exhaustive.

Current meshes still use bounding-box collision proxies. Replacing them with one
mesh each is insufficient: MuJoCo generally uses a convex hull for mesh collision,
which can fill a hollow shell. Use validated convex decomposition or another
appropriate contact representation and measure its error against the CAD surface.
See [MuJoCo collision documentation](https://mujoco.readthedocs.io/en/latest/computation/).

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
The output is separate from the robot until its mounting transform, collision shape
and complete component masses are integrated. It is not a structural suit component.

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
