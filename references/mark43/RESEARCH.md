# Design research and downloaded geometry

Research date: 2026-09-19. The product remains a procedural concept generator;
this research does not qualify a wearable or establish movie-exact surfaces.

## What was actually downloaded and inspected

[Tyler Anderson / unlimitedbacon's build](https://hackaday.io/project/9327-mk-iii-iron-man-suit)
publishes **Helmet Mechanics V1.0** with seven STL parts, seven SolidWorks parts
and a README under **CC BY-SA 4.0**. The ZIP and extracted files are saved locally
in `references/mark43/designs/`; [source and hash manifest](design_sources.json).
The design uses separate mounting brackets, front/back links and hinge pieces.
Its build notes describe a four-bar mechanism, M3 screws and 623ZZ bearings, with
initial outward movement before the faceplate lifts. This is a **Mark III mechanism
study**, not a Mark 43 surface model. No source geometry is included in SaaS exports.

The independent [geometry inspection](design_geometry_report.json) records each
part's bounds, triangle count, connected components and topology. Six of seven
STLs are watertight; the back hinge is not. Native extents include a 79.39 × 9 × 6
front link and a 55 × 52.30 × 20 servo bracket. STL units are not embedded; these
numbers must not silently become metre-based robot dimensions. A local exploded
inspection render is saved at `designs/mechanics_inspection.png`; it is not an
assembled mechanism or a verified fit drawing.

## Mark 42/43 sources and access results

- [Do3D's Mark XLII/XLIII helmet](https://www.do3d.com/product-page/iron-man-mark-xlii-xliii-mk-42-43-premium-helmet-3d-model-project-5032-1): commercial design, not purchased or downloaded.
- [Gimpee's Mark 42/43 patterns](https://www.therpf.com/forums/threads/iron-man-pepakura-helmets-mark-42-43-iron-patriot-wm-pdf-links-first-post-3d-print.167044/): author labels these personal-use files. Direct page access returned 403; no pattern files downloaded.
- [PsychItsMike's wearable Mark 42 helmet](https://www.thingiverse.com/thing:2187205): public listing found; download endpoint returned HTML rather than a ZIP. No STL download is claimed.
- [JTIron625's Mark 42/43 FBX/Blend model](https://www.deviantart.com/jtiron625/art/Iron-Man-Mark-42-and-43-FBX-Blend-Download-1126296715): direct page access returned 403; no model downloaded.
- Drumguy560's helmet archive, linked by the Hackaday build: download timed out. The successfully downloaded linkage package must not be confused with that complete helmet.

The existing [production-photo reference set](README.md) remains the primary
Mark 43 appearance reference. There is **no complete downloaded Mark 43 CAD model**
in this repository, and no measured prop scan.

## Modelling and construction findings

[GoEngineer's first-hand metal-helmet project](https://www.goengineer.com/blog/full-metal-iron-man-helmet-project)
describes repairing imported surface CAD, separating plates and making physical
parts. It demonstrates why a plausible outer mesh does not establish closed
manufacturing solids or practical assembly interfaces.

For this generator, surface modelling and mechanism design must be separate:

1. Author continuous outer surfaces against reference views; preserve intentional
   creases and panel boundaries rather than covering primitive shells with badges.
2. Define inner surfaces and wearer/liner clearance, then split at real entry seams.
3. Specify connector, bearing, screw-head and servo keepouts from measured parts.
4. Solve actual linkage geometry and collision paths. A single rotating faceplate
   joint cannot represent a lift-and-retract four-bar mechanism.
5. Export separate visual meshes, physical solids and collision approximations;
   keep their transforms and mass properties consistent.
6. Retain reference provenance and distinguish a downloaded visual asset from
   a measured, actuated assembly. Do not derive safety from appearance.

These are engineering conclusions from the source studies and inspected files,
not claims that all six stages are already implemented. The current suit still
has single-axis faceplate motion, unresolved collisions and unverified human fit.

## Reproduce local inspection

Download the mechanics ZIP from the linked author's page into `designs/`, then:

```bash
python scripts/inspect_reference_designs.py
```

Cached third-party files are ignored by Git; the manifest, measurements and
findings are tracked. Source attribution and licence requirements remain attached
to the downloaded files. Public availability alone is not treated as permission
to redistribute a design through the launched service.

## Changes applied from the audit

The source study reinforced keeping appearance, mechanical interfaces and physics
evidence distinct. This revision adds visible MoveIt files, source-hashed simulation
GIFs and reports for every example, fixes concrete mesh/kinematic interference in
four template families, and tests every exported training environment. It does
not replace the suit's one-axis faceplate hinge with the downloaded four-bar system:
that mechanism has different attachment geometry and has not been fitted to this
helmet. Full Mark 43 CAD acquisition and mechanism integration remain outstanding.
