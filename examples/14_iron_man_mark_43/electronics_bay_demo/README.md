# Dimensioned electronics enclosure demonstration

This is a separate demonstration housing for a **synthetic** 60 × 40 × 12 mm
populated PCB envelope. It is not a vendor-specific housing or an integrated suit part.
`input.json` records every assumed dimension and material density. Replace them with
measured hardware before using the generator for an actual component.

Reproduce from the repository root:

```bash
pip install -e './python[cad]'
ttr-enclosure examples/14_iron_man_mark_43/electronics_bay_demo/input.json --out out/electronics_bay
```

STEP files use assembly coordinates. Each STL is in millimetres with its bottom at
Z=0 for printing; `report.json` gives its assembly offset. The base and lid use
through bolts with nuts; select fasteners from the reported grip lengths plus
board thickness, washers and nut engagement. No threads are modelled.

The report contains solid volume, homogeneous-material mass, centre of mass and
inertia about the centre of mass in assembly axes. These are geometric calculations,
not measurements of a printed part. Electronics and fasteners are not included.
No housing mounting transform, suit attachment, structural or thermal analysis is supplied.
