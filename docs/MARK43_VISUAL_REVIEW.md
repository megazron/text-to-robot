# Mark 43 visual review

The previous model passed geometry checks while still looking unlike the reference.
Those checks establish valid solids, not visual fidelity. This revision changes the
actual exported geometry; these images are MuJoCo renders of the URDF/STL assets.
They are not concept art or image-generation outputs.

Primary reference inspected: [Legacy Effects — Avengers: Age of Ultron](https://www.legacyefx.com/avengersaou),
including its [production armour photograph](https://images.squarespace-cdn.com/content/v1/5bfdc74875f9ee194f3e0add/1597169230901-1YAKVO4QHQGB94IZ7KF2/2014-02-27_17077.jpg).
The photograph shows continuous curved pectoral surfaces, silver shoulder-edge
mechanisms, silver collar panels and rib details wrapped around the flanks.
The current export replaces isolated pectoral badges with adjoining compound
surfaces and moves rib details around the flanks, but still has
oversized exposed motor housings and simplified hands. These are unresolved
shape differences, even after adding conformal limb inlays and segmented fingers.
The production photograph is perspective imagery, not dimensioned CAD; a numerical
surface-error comparison would be misleading. Third-party images are linked,
not redistributed in the repository.

Secondary reference inspected: [Hot Toys Mark XLIII, official Sideshow gallery](https://www.sideshow.com/collectibles/marvel-iron-man-mark-xliii-hot-toys-902314),
particularly the [full-body three-quarter photograph](https://www.sideshow.com/storage/product-images/902314/iron-man-mark-xliii_marvel_gallery_5c4b8adb3b636_sm.jpg).
This is a collectible interpretation, not measured screen-used prop geometry.
No numerical visual-accuracy percentage is claimed.

| Feature | Previous geometry | Current geometry | Still different from reference |
|---|---|---|---|
| Chest | Round barrel with small rectangular trim | Adjoining curved upper/lower pectoral surfaces, narrower sternum and circular reactor | Chest curvature and panel junctions remain approximate |
| Abdomen | Three isolated rounded bars | Tapered red plates, flank shells and side-wrapped rib trim | Rib shapes/spacing need closer prop-derived modelling |
| Limbs | Nearly constant-radius sleeves | Independent depth/width profiles with surface-following thigh/shin/arm trim | Outer drive modules interrupt the film silhouette |
| Knees | Round dome | Angular shield, recessed-looking dark bezel and red centre | Mechanism and trim differ |
| Feet | Visible sole with small toe cap | Full hollow boot upper with shaped instep | Toe/ankle transitions and heel details remain approximate |
| Helmet | Smooth elongated mask | Planar cheek/bridge transitions, narrower eye lenses and surface-aligned mouth | Jaw, temple and forehead topology need refinement |
| Hands | Short horizontal platforms | Three flexion joints per finger, two per thumb; distinct knuckle barrels | Finger anatomy and knuckle mechanisms remain simplified |
| Back | Plain rectangular cover and two gold tabs | Tapered panel, shoulder-blade layers and grille details | Backpack volume is still unlike the film suit; rear details are not reference-exact |

## Current exported model

| Front | Three-quarter | Rear |
|---|---|---|
| ![Front](img/mark43_front_review.png) | ![Three-quarter](img/mark43_threequarter_review.png) | ![Rear](img/mark43_rear_review.png) |

## Previous model

![Previous geometry](img/mark43_geometry_review.png)

## Reproduce the visual check

```bash
node scripts/regen_mark43_example.ts
python scripts/render_mark43_review.py
```

The rendering script uses neutral joint positions and fixed cameras. It does not
animate, hide drive modules, or replace the model with a pre-rendered illustration.
The same recipes produce the browser meshes and downloadable STL/CAD assets. The
browser applies a metal finish to Mark 43 materials; geometry remains identical.

232 mesh instances (216 unique STL assets) are checked independently for closed topology and mass properties.
This is still an authored approximation, not an extremely accurate replica or a
manufacturing-qualified assembly. Revised geometry invalidates earlier collision
numbers; see the current reports in `examples/14_iron_man_mark_43`.

## Persistent reference workflow

Photographs are saved locally in `references/mark43/images/`. The source manifest,
fetch/review script and [review log](../references/mark43/review-notes.md) are tracked.

```bash
python scripts/render_mark43_review.py
python scripts/mark43_reference_review.py --fetch --snapshot review-name
# Open references/mark43/review.html
```

The review refuses renders whose model/image hashes no longer match. Each snapshot
records the model and reference hashes. This detects stale evidence; it does not
automatically certify visual similarity. Reference photographs remain a local
cache, with source links preserved.

| Torso close-up | Helmet close-up |
|---|---|
| ![Torso](img/mark43_torso_review.png) | ![Helmet](img/mark43_helmet_review.png) |

## Articulation revision

The chest inlays previously remained on the torso when the chest doors opened.
Their parents and local transforms now follow the doors. The complete helmet
assembly follows neck yaw/pitch, while the neck collar stays on the torso.
Fingers previously had a single rigid strip each; they now have three independently
articulated phalanges, with lengths varying by finger. Thumb opposition is still
simplified. Knuckle barrels have clearance from the plate ends at rest; this is
not a validated full-range human hand mechanism.

The limb inlays sample the same cross-section profiles as their supporting shells,
removing floating planar thigh/shin badges. Comparing the fresh front and
three-quarter views against the saved reference still shows the oversized exposed
motor modules, approximate chest/waist proportions, simple helmet topology and
backpack as major visual failures. More joints do not establish movie accuracy.

[Finger, neck and chest-motion GIFs](../examples/14_iron_man_mark_43/README.md)
use prescribed joint positions with collisions disabled. The separate collision
reports retain the failures; animation is not a clearance certificate.
