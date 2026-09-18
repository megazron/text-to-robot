"""Dimensioned PCB enclosure: separate base/lid, mounting bores and cable opening.

All CAD dimensions are millimetres. Inputs must come from measured hardware or a
datasheet; the example is explicitly synthetic. No LLM-generated executable CAD.
This module is also copied into CAD downloads and can run standalone.
"""
import argparse
import json
import math
import re
from pathlib import Path


def validate(spec):
    required = {"name", "dimension_source", "board_mm", "mounting_holes_mm", "clearance_mm",
                "wall_mm", "floor_mm", "lid_mm", "standoff_mm", "boss_diameter_mm",
                "board_screw_clearance_mm", "lid_screw_clearance_mm", "density_kg_m3", "cable_port_mm"}
    if set(spec) != required:
        raise ValueError(f"Manifest fields differ: missing={sorted(required-set(spec))}, unknown={sorted(set(spec)-required)}")
    if not isinstance(spec["name"], str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", spec["name"]):
        raise ValueError("name must be a short lowercase identifier")
    if not isinstance(spec["dimension_source"], str) or not spec["dimension_source"].strip():
        raise ValueError("dimension_source must identify the measurements or drawing")
    def positive(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0
    scalar_keys = required - {"name", "dimension_source", "board_mm", "mounting_holes_mm", "cable_port_mm"}
    if any(not positive(spec[k]) for k in scalar_keys):
        raise ValueError("Dimensions and density must be finite and positive")
    board = spec["board_mm"]
    if not isinstance(board, list) or len(board) != 3 or not all(positive(v) for v in board):
        raise ValueError("board_mm must be [width, depth, total populated height], all positive")
    if max(board) > 1000 or min(spec["wall_mm"], spec["floor_mm"], spec["lid_mm"]) < 1:
        raise ValueError("Backend supports boards up to 1000 mm and walls/floor/lid at least 1 mm")
    holes = spec["mounting_holes_mm"]
    boss = spec["boss_diameter_mm"]
    bore = spec["board_screw_clearance_mm"]
    if boss < bore + 2 * spec["wall_mm"]:
        raise ValueError("Board bosses need wall_mm radial material around the clearance bore")
    if not isinstance(holes, list) or len(holes) < 2 or len(holes) > 16:
        raise ValueError("Provide 2–16 measured board mounting holes")
    for i, point in enumerate(holes):
        if not isinstance(point, list) or len(point) != 2 or any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) for v in point):
            raise ValueError("Mounting hole coordinates must be finite [x,y] relative to board centre")
        if any(abs(point[k]) + bore/2 >= board[k]/2 for k in (0, 1)):
            raise ValueError("Mounting bore extends beyond the board")
        if any(abs(point[k]) + boss/2 >= board[k]/2 + spec["clearance_mm"] for k in (0, 1)):
            raise ValueError("Mounting boss intersects the enclosure wall")
        if any(math.dist(point, other) <= boss for other in holes[:i]):
            raise ValueError("Mounting bosses overlap")
    port = spec["cable_port_mm"]
    if not isinstance(port, list) or len(port) != 3 or not all(positive(v) for v in port):
        raise ValueError("cable_port_mm must be [width_y, height_z, centre_z_from_base_bottom]")
    height = spec["floor_mm"] + spec["standoff_mm"] + board[2] + spec["clearance_mm"]
    if port[0] >= board[1] or port[2]-port[1]/2 <= spec["floor_mm"] or port[2]+port[1]/2 >= height-spec["wall_mm"]:
        raise ValueError("Cable opening must leave floor, top rim and side material intact")
    return spec


def build(spec):
    validate(spec)
    import cadquery as cq
    w, d, h = spec["board_mm"]
    clearance, wall, floor = (spec[k] for k in ("clearance_mm", "wall_mm", "floor_mm"))
    iw, id_ = w + 2*clearance, d + 2*clearance
    ow, od = iw + 2*wall, id_ + 2*wall
    height = floor + spec["standoff_mm"] + h + clearance
    box = lambda x, y, z: cq.Workplane("XY").box(x, y, z, centered=(True, True, False))
    base = box(ow, od, height).cut(box(iw, id_, height).translate((0, 0, floor)))
    for x, y in spec["mounting_holes_mm"]:
        boss = cq.Workplane("XY").center(x, y).circle(spec["boss_diameter_mm"]/2).extrude(floor+spec["standoff_mm"])
        base = base.union(boss)
        hole = cq.Workplane("XY").center(x, y).circle(spec["board_screw_clearance_mm"]/2).extrude(height)
        base = base.cut(hole)
    # Four external solid screw columns: through bolts and nuts, no invented
    # thread engagement or assumed self-tapping material strength.
    lug = spec["lid_screw_clearance_mm"] + 2*wall
    lid = box(ow, od, spec["lid_mm"]).translate((0, 0, height))
    lid_holes = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx*(ow/2+lug/2-wall/2), sy*(od/2-lug/2)
            lid_holes.append([x, y])
            base = base.union(box(lug, lug, height).translate((x, y, 0)))
            lid = lid.union(box(lug, lug, spec["lid_mm"]).translate((x, y, height)))
            hole = cq.Workplane("XY").center(x, y).circle(spec["lid_screw_clearance_mm"]/2).extrude(height+spec["lid_mm"])
            base, lid = base.cut(hole), lid.cut(hole)
    pw, ph, pz = spec["cable_port_mm"]
    port = box(wall+2, pw, ph).translate((ow/2-wall/2, 0, pz-ph/2))
    base = base.cut(port)
    envelope = box(w, d, h).translate((0, 0, floor+spec["standoff_mm"]))
    for name, part in (("base", base), ("lid", lid)):
        if not part.val().isValid() or len(part.solids().vals()) != 1:
            raise ValueError(f"{name} is not one valid solid")
        if part.intersect(envelope).val().Volume() > 1e-6:
            raise ValueError(f"{name} intrudes into the declared board envelope")
    if base.intersect(lid).val().Volume() > 1e-6:
        raise ValueError("Lid intersects base")
    return {"base": base, "lid": lid}, {"lid_holes_mm": lid_holes, "lid_bolt_grip_mm": height+spec["lid_mm"],
            "board_bolt_grip_excluding_pcb_mm": floor+spec["standoff_mm"], "board_origin_mm": [0, 0, floor+spec["standoff_mm"]]}


def export(spec, out):
    import cadquery as cq
    parts, assembly = build(spec)
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    report = {"name": spec["name"], "dimension_source": spec["dimension_source"],
              "status": "geometric fit checked against supplied rectangular envelope; hardware fit unverified",
              "cad_units": "mm", "density_kg_m3": spec["density_kg_m3"], "assembly": assembly, "parts": {},
              "limitations": ["No connector-specific keepouts, cable bend or cooling analysis", "No load or fastener-strength qualification",
                              "Choose bolts, nuts and washers using measured grip and board thickness", "CAD-derived mass assumes homogeneous solid material, not slicer infill",
                              "Enclosure is not automatically attached to the robot or included in its mass model"]}
    for name, part in parts.items():
        stem = f"{spec['name']}_{name}"
        cq.exporters.export(part, str(out / f"{stem}.step"))
        # Each printable part has z=0 at its bottom; assembly offset is explicit.
        shape = part.val(); z0 = shape.BoundingBox().zmin
        cq.exporters.export(part.translate((0, 0, -z0)), str(out / f"{stem}.stl"), tolerance=0.05, angularTolerance=0.1)
        centre = shape.Center().toTuple()
        tensor = cq.Shape.matrixOfInertia(shape)
        report["parts"][name] = {"volume_mm3": shape.Volume(), "mass_kg": shape.Volume()*1e-9*spec["density_kg_m3"],
                                 "com_m": [v/1000 for v in centre], "inertia_kg_m2": [[v*1e-15*spec["density_kg_m3"] for v in row] for row in tensor],
                                 "stl_assembly_offset_mm": [0, 0, z0]}
    (out / "report.json").write_text(json.dumps(report, indent=2)+"\n")
    (out / "input.json").write_text(json.dumps(spec, indent=2)+"\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = export(json.loads(args.manifest.read_text()), args.out)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
