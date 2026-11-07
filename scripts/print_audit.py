"""Printability audit of every printed part of every designed example (python -m ttr_build.dfm under the hood).

Writes examples/<ex>/print_report.json and docs/PRINTABILITY.md. Fails when a part fails that is not listed, with a
reason, in examples/print_known_issues.json (so known problems stay visible and new ones cannot slip in).
    python scripts/print_audit.py [example ...]   # write reports
    python scripts/print_audit.py --check    # CI: re-audit, compare, write nothing
"""
import io
import json
import sys
import zipfile
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
import trimesh  # noqa: E402
from ttr_build.dfm import audit_mesh, BED_MM  # noqa: E402

check = "--check" in sys.argv
only = {a for a in sys.argv[1:] if not a.startswith("--")}   # write just these examples' reports; the others stay as they are


def same_report(a, b):
    """Same parts, same verdicts, same measurements within what ray casts repeat to across machines. The wall samples and the
    tie between equally good orientations move in the last digit from one CPU to another, so exact equality made CI flaky."""
    if [p["name"] for p in a["parts"]] != [p["name"] for p in b["parts"]]: return False
    for p, q in zip(a["parts"], b["parts"]):
        if any(p[k] != q[k] for k in ("passed", "watertight", "fits_bed")): return False
        for k, tol in (("volume_cm3", 0.05), ("min_wall_mm", 0.1), ("thin_wall_frac", 0.02), ("support_frac", 0.02)):
            x, y = p.get(k), q.get(k)
            if (x is None) != (y is None) or (x is not None and abs(x - y) > tol): return False
    return True

known = json.loads((ROOT / "examples/print_known_issues.json").read_text())
rows, bad = [], []
for ex in sorted(p for p in (ROOT / "examples").iterdir() if p.is_dir() and p.name[:2].isdigit()):
    spec = json.loads((ex / "robot.json").read_text())
    if not (spec.get("metadata") or {}).get("design") or not (ex / "robot.cad.zip").exists():
        continue
    with zipfile.ZipFile(ex / "robot.cad.zip") as z:
        parts = [(n.split("/")[-1][:-4], z.read(n)) for n in sorted(z.namelist()) if n.startswith("cad/print/") and n.endswith(".stl")]
    reps = [asdict(audit_mesh(trimesh.load(io.BytesIO(b), file_type="stl", force="mesh"), name)) for name, b in parts]
    out = ex / "print_report.json"
    text = json.dumps({"bed_mm": BED_MM, "parts": reps}, indent=1) + "\n"
    if check:
        if not out.exists() or not same_report(json.loads(out.read_text()), json.loads(text)): bad.append(f"{ex.name}: print_report.json is stale (run scripts/print_audit.py)")
    elif not only or ex.name in only:
        out.write_text(text)
    for r in reps:
        if not r["passed"] and r["name"] not in known.get(ex.name, {}): bad.append(f"{ex.name}/{r['name']}: {'; '.join(r['problems'])}")
    ok = sum(r["passed"] for r in reps)
    rows.append(f"| {ex.name} | {ok}/{len(reps)} | {sum(r['passed'] and r['supports'] == 'needed' for r in reps)} | {sum(bool(r['passed'] and r['warnings']) for r in reps)} | "
                + ("; ".join(f"{r['name']}: {r['problems'][0]}" for r in reps if not r["passed"]) or "-") + " |")
    print(f"{ex.name:24s} {ok}/{len(reps)} printable")
doc = ("# Printability\n\nEvery printed part of every designed example, audited by `scripts/print_audit.py` (`python -m ttr_build.dfm`): best "
       f"orientation on a {BED_MM[0]:.0f} x {BED_MM[1]:.0f} x {BED_MM[2]:.0f} mm bed, flat face down, support area (faces steeper than 45 deg), "
       "wall thickness (< 0.8 mm fails, 0.8-1.2 mm is a thin-wall warning), one connected watertight solid. Supports up to 8 % of the surface "
       "print without supports; up to 30 % (inside open shells) with removable supports.\n\n"
       "| Example | Printable | With supports | Thin-wall warnings | Failing |\n|---|--:|--:|--:|---|\n" + "\n".join(rows) + "\n")
if not check: (ROOT / "docs/PRINTABILITY.md").write_text(doc)
if bad: sys.exit("\n".join(bad))
