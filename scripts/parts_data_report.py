"""Writes docs/PARTS_DATA.md: for every electrical part, how many of its values come from a datasheet and how many are estimated.

    python3 scripts/parts_data_report.py
Source of truth: packages/parts/data/electrical.json (each value marked `datasheet` with a URL or `estimated` with a reason).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "packages/parts/data/electrical.json").read_text())
open_issues = json.loads((ROOT / "packages/parts/data/electrical_open_issues.json").read_text())


def sourced(o, out):
    if isinstance(o, dict):
        if "src" in o and "v" in o:
            out.append(o)
            return
        for v in o.values():
            sourced(v, out)
    elif isinstance(o, list):
        for v in o:
            sourced(v, out)


rows, total, ds = [], 0, 0
for key, rec in sorted(data.items()):
    vals = []
    sourced(rec, vals)
    n, d = len(vals), sum(v["src"] == "datasheet" for v in vals)
    total += n
    ds += d
    e = rec["electrical"]
    rows.append(f"| {key} | {d}/{n} | {e['voltage_v']['src']} | {e['current_a']['src']} | {e['ports'][0]['pins']['src']} | {e['ports'][0]['connector']['src']} | {rec['dimensions']['body_mm']['src']} | {rec['dimensions']['holes']['src']} |")
doc = ("# Parts data\n\nEvery electrical part has dimensions and an electrical record in `packages/parts/data/electrical.json`: ports with pin names, "
       "connector, voltage, typical and peak current, signal types. Each value says where it comes from: `datasheet` with a URL, or `estimated` with the "
       "reason. `tests/parts-electrical.test.ts` fails if a part or a mark is missing. A value seen only in a search snippet or remembered is `estimated`.\n\n"
       f"{ds} of {total} values are from a datasheet or a manufacturer or reputable vendor page; the rest are estimated. Treat estimated pinouts as a "
       "reason to check the part in your hand before powering it.\n\n"
       "| Part | Values from a datasheet | Voltage | Current | Pins | Connector | Body size | Holes |\n|---|--:|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n\n"
       "## Where the sources disagree with the catalog\n\nFound while collecting the data. Those not fixed in `python/ttr_build/components` are open.\n\n"
       + "\n".join(f"- {m}" for m in open_issues) + "\n")
(ROOT / "docs/PARTS_DATA.md").write_text(doc)
print(f"{len(rows)} parts, {ds}/{total} values from a datasheet")
