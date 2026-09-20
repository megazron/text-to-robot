# Visual review log

Reference files: `images/legacy-production-torso.jpg`,
`images/legacy-film-flight.jpg`, `images/hot-toys-full-body.jpg`.
Snapshots are saved locally under `iterations/`. Comparisons are visual,
not a quantitative surface-fit measurement.

- **00, baseline:** isolated flat pectoral badges over a rounded chest; large
  front-facing rib rings; narrow lower mask. Motor housings strongly change the
  silhouette. The film prop has compound chest surfaces, flank-wrapped trim and
  more integrated joint covers.
- **01, torso:** upper/lower panels now share a sampled curved surface. Front and
  three-quarter inspected. Lower chest was still too broad and side trim hidden.
- **02, flanks:** tapered lower chest and enclosed flank surfaces. Inspected
  three-quarter render; side trim placement still intersected the chest visually.
- **03, chest/jaw:** moved side trim to the visible surface and widened lower mask.
  Inspected torso and helmet close-ups. Close views expose overlapping cheek and
  forehead surfaces, which need correction; small full-body renders hid this.

- **04, face surfaces:** inspected helmet close-up after reducing cheek overlap
  and projecting the forehead detail onto the face surface. Jagged side overlap
  is reduced; the mouth/chin and cheek folds still differ from the reference.

Remaining: film-specific seam paths, shoulder trim mechanisms, helmet face planes,
hand anatomy, leg plating and boot transitions, bulky external actuator housings,
rear reference coverage, and physical interference. This model is not accepted
as movie-accurate. Existing hardware volumes must not simply be hidden to produce
an apparently buildable film silhouette.

### Articulated surfaces revision

Viewed the saved Hot Toys full-body photograph against fresh exported front and
three-quarter renders. Replaced flat limb overlays with conformal surfaces;
corrected chest inlay attachment, added neck yaw/pitch and multi-segment fingers.
Inspected exported hand/neck/chest motion close-ups. The first hand iteration
intersected knuckle barrels and the hand plate; shortened plates and moved the
finger pivots before rechecking. Exposed joint motors, the torso silhouette and
helmet topology still do not match the reference. No fidelity score is claimed.

### Torso, wrist and cuff clearance revision

Reopened the saved Legacy Effects production-torso photograph and compared it
against candidate three-quarter renders. Kept chest symmetry and clearance
corrections, widened shells around cuffs and corrected backward-extending palms.
Rejected the shoulder-shell experiment because the silhouette and intersections
were unsuitable. Saved the previous front render alongside the current render.
The reference has more continuous shoulder/torso transitions, a much slimmer
mechanical envelope and more complex panel surfacing; these gaps remain.

### Helmet, shoulder and joint-envelope revision

Compared the saved Legacy Effects torso and Hot Toys full-body reference against
actual candidate helmet and three-quarter renders. Added the red forehead notch,
separated helmet panels and replaced shallow shoulder caps with skirted shells.
Rejected mounting the jaw on a distant pivot merely to clear its sweep: that would
not establish a buildable mechanism. Remaining chin/neck motion collisions stay
reported. Lateral rim cutaways clear the existing motor housings; the visible
mechanical bulk and open ankle transitions still fall short of the reference.

### Chest opening clearance — 2026-09-20

Compared the saved Legacy Effects production-torso photograph with the existing
and regenerated torso close-ups. The original pectorals ran behind the fixed
sternum; a five-pose test missed intersections at the start of opening. Rejected
hinge relocation because it introduced arm interference. Trimmed both chest
solids to follow the sternum boundary with 4 mm nominal lateral clearance,
keeping the outer surface and existing inlay positions. The top opening remains
visibly simplified compared with the continuous film collar/chest transition.

Both doors pass 61 independent sampled positions and 61 simultaneous openings
across the original ±1.2 rad ranges. No collision exclusions or limits were
changed. The visual result still has exposed mechanisms and simplified panel
shapes; this correction establishes neither movie accuracy nor a wearable build.
Neck pitch, broader articulation and wearer-fit failures remain in the reports.
