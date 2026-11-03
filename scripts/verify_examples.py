"""Verify the shipped examples match their pipeline (build_examples.ts + simulate_examples.py) before publishing.

For every example except 14_iron_man_mark_43 (own evidence: mark43_reference_review.py, check_motion_paths.py):
  - all deliverables exist and the archives open (ROS 2 package, CAD build package, training package)
  - simulation_report.json was produced from the shipped robot.urdf (sha256) and no task test failed
  - designed robots pass every engineering check recorded in robot.json
Fast (no simulation); `simulate_examples.py --check` re-runs the physics.
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
REQUIRED = ["prompt.txt", "robot.json", "robot.urdf", "BOM.md", "bom.json", "robot.ros2.zip", "robot.cad.zip", "robot.training.zip",
            "README.md", "simulation_report.json", "simulation.gif"]
bad = []
examples = sorted(p for p in (root / "examples").iterdir() if p.is_dir() and p.name[:2].isdigit() and p.name != "14_iron_man_mark_43")
for ex in examples:
    miss = [f for f in REQUIRED if not (ex / f).exists()]
    if miss: bad.append(f"{ex.name}: missing {', '.join(miss)}"); continue
    spec = json.loads((ex / "robot.json").read_text())
    name = spec["robot_name"]
    rep = json.loads((ex / "simulation_report.json").read_text())
    if rep.get("source_urdf_sha256") != hashlib.sha256((ex / "robot.urdf").read_bytes()).hexdigest():
        bad.append(f"{ex.name}: simulation_report.json is not from the shipped robot.urdf (rerun simulate_examples.py)")
    failing = [k for k, t in rep.get("tests", {}).items() if t.get("pass") is False]
    if failing: bad.append(f"{ex.name}: failing task tests {failing}")
    design = (spec.get("metadata") or {}).get("design") or {}
    dfail = [c["name"] for c in design.get("checks", []) if not c.get("pass")]
    if dfail: bad.append(f"{ex.name}: failing design checks {dfail}")
    for z, must in [("robot.ros2.zip", f"{name}/package.xml"), ("robot.cad.zip", None), ("robot.training.zip", None)]:
        try:
            with zipfile.ZipFile(ex / z) as a:
                if a.testzip() is not None: bad.append(f"{ex.name}: {z} is corrupt")
                if must and must not in a.namelist(): bad.append(f"{ex.name}: {z} lacks {must}")
                if not a.namelist(): bad.append(f"{ex.name}: {z} is empty")
        except zipfile.BadZipFile:
            bad.append(f"{ex.name}: {z} is not a zip")
    print(f"{ex.name:24s} {'ok' if not any(b.startswith(ex.name) for b in bad) else 'FAIL'}  tests {rep.get('passed')}/{rep.get('total')}"
          + (f"  design checks {sum(c['pass'] for c in design.get('checks', []))}/{len(design.get('checks', []))}" if design else ""))
if bad: sys.exit("\n".join(bad))
print(f"{len(examples)} examples verified")
