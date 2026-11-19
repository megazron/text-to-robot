import json, sys
from pathlib import Path
def load(fs):
    # several files per side (the quick pass and the route pass run in processes of their own): merged per prompt
    parts = []
    for f in fs.split(","):
        d = {}
        for l in Path(f).read_text().splitlines():
            if l.strip(): r = json.loads(l); d[r["prompt"]] = r
        parts.append(d)
    out = {}
    for p in set.intersection(*(set(d) for d in parts)):
        out[p] = {"prompt": p, "s": sum(d[p]["s"] for d in parts), "files": {k: v for d in parts for k, v in d[p]["files"].items()}}
    return out
a, b = load(sys.argv[1]), load(sys.argv[2])
prompts = json.loads(Path(sys.argv[3]).read_text())
both = [p["prompt"] for p in prompts if p["prompt"] in a and p["prompt"] in b]
missing = [p["prompt"] for p in prompts if p["prompt"] not in a or p["prompt"] not in b]
bad, files = [], 0
for p in both:
    fa, fb = a[p]["files"], b[p]["files"]; files += len(fa)
    diff = sorted(k for k in set(fa) | set(fb) if fa.get(k) != fb.get(k))
    if diff: bad.append((p, diff[:8], len(diff)))
ta, tb = sum(a[p]["s"] for p in both), sum(b[p]["s"] for p in both)
print(f"{len(both)} prompts compared, {files} files; identical: {len(both) - len(bad)}; differ: {len(bad)}; missing: {len(missing)}")
print(f"engine time, sum over prompts: base {ta:.0f} s, new {tb:.0f} s")
for p, d, n in bad: print("DIFF", repr(p[:60]), n, d)
for p in missing: print("MISSING", repr(p[:60]))
