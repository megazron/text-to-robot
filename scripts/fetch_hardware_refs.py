"""Download the open hardware references in references/hardware/manifest.json.

Files go to references/hardware/cache/ (git-ignored). A lock file records the
sha256 of every download so measurements taken from them stay reproducible.

    python scripts/fetch_hardware_refs.py            # fetch anything missing
    python scripts/fetch_hardware_refs.py --verify   # fail if a file changed upstream
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HW = ROOT / "references" / "hardware"
CACHE = HW / "cache"
LOCK = HW / "lock.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_url(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "text-to-robot-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, dest.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)


def fetch_sparse(repo: str, dirs: list[str], dest: Path) -> str:
    if not dest.exists():
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", repo, str(dest)], check=True)
    subprocess.run(["git", "-C", str(dest), "sparse-checkout", "set", *dirs], check=True)
    return subprocess.run(["git", "-C", str(dest), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args()
    manifest = json.loads((HW / "manifest.json").read_text())
    lock = json.loads(LOCK.read_text()) if LOCK.exists() else {}
    CACHE.mkdir(parents=True, exist_ok=True)
    bad = 0
    for item in manifest["items"]:
        if item.get("download") is False:
            continue
        iid = item["id"]
        try:
            if "git" in item:
                rev = fetch_sparse(item["git"], item["sparse"], CACHE / item["dir"])
                digest = "git:" + rev
            else:
                dest = CACHE / item["file"]
                if not dest.exists():
                    fetch_url(item["url"], dest)
                digest = sha256(dest)
        except Exception as e:  # keep going; report at the end
            print(f"FAIL {iid}: {e}")
            bad += 1
            continue
        old = lock.get(iid)
        if args.verify and old and old != digest:
            print(f"CHANGED {iid}: {old[:16]} -> {digest[:16]}")
            bad += 1
        lock[iid] = old if (args.verify and old) else digest
        print(f"ok   {iid:22s} {digest[:20]}")
    if not args.verify:
        LOCK.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
