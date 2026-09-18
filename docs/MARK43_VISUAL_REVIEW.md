# Mark 43 visual review

The previous model passed geometry checks while still looking unlike the reference.
Those checks establish valid solids, not visual fidelity. This revision changes the
actual exported geometry; these images are MuJoCo renders of the URDF/STL assets.
They are not concept art or image-generation outputs.

Primary reference inspected: [Legacy Effects — Avengers: Age of Ultron](https://www.legacyefx.com/avengersaou),
including its [production armour photograph](https://images.squarespace-cdn.com/content/v1/5bfdc74875f9ee194f3e0add/1597169230901-1YAKVO4QHQGB94IZ7KF2/2014-02-27_17077.jpg).
The photograph shows continuous curved pectoral surfaces, silver shoulder-edge
mechanisms, silver collar panels and rib details wrapped around the flanks.
Our front render still has flat isolated pectoral plates, front-facing rib rings,
oversized exposed motor housings and simplified hands. These are unresolved
shape differences, even after adding collar inlays, rib edges and knuckle tiles.
The production photograph is perspective imagery, not dimensioned CAD; a numerical
surface-error comparison would be misleading. Third-party images are linked,
not redistributed in the repository.

Secondary reference inspected: [Hot Toys Mark XLIII, official Sideshow gallery](https://www.sideshow.com/collectibles/marvel-iron-man-mark-xliii-hot-toys-902314),
particularly the [full-body three-quarter photograph](https://www.sideshow.com/storage/product-images/902314/iron-man-mark-xliii_marvel_gallery_5c4b8adb3b636_sm.jpg).
This is a collectible interpretation, not measured screen-used prop geometry.
No numerical visual-accuracy percentage is claimed.

| Feature | Previous geometry | Current geometry | Still different from reference |
|---|---|---|---|
| Chest | Round barrel with small rectangular trim | Higher chest, broad angular pectoral plates and smaller reactor | Chest curvature and panel junctions remain approximate |
| Abdomen | Three isolated rounded bars | Contiguous tapered red plates with angled gold lateral ribs | Rib shapes/spacing need closer prop-derived modelling |
| Limbs | Nearly constant-radius sleeves | Independent depth/width profiles, sculpted taper and layered thigh/shin panels | Outer drive modules interrupt the film silhouette |
| Knees | Round dome | Angular shield, recessed-looking dark bezel and red centre | Mechanism and trim differ |
| Feet | Visible sole with small toe cap | Full hollow boot upper with shaped instep | Toe/ankle transitions and heel details remain approximate |
| Helmet | Smooth elongated mask | Planar cheek/bridge transitions, narrower eye lenses and surface-aligned mouth | Jaw, temple and forehead topology need refinement |
| Hands | Short horizontal platforms | Wrist orientation follows forearm; separate extended fingers/thumb | Finger anatomy and knuckle mechanisms remain simplified |
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

204 mesh instances (188 unique STL assets) are checked independently for closed topology and mass properties.
This is still an authored approximation, not an extremely accurate replica or a
manufacturing-qualified assembly. Revised geometry invalidates earlier collision
numbers; see the current reports in `examples/14_iron_man_mark_43`.
