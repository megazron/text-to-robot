#!/usr/bin/env python3
"""Compile every example's Arduino sketch for its board with arduino-cli; fail on any error or sketch warning.

The board comes from the sketch's own "// FQBN:" line. Needs arduino-cli with the arduino:avr core and the libraries the
sketches include (Servo, Adafruit PWM Servo Driver Library); CI installs pinned versions.

  python3 scripts/compile_firmware.py                 every examples/*/firmware/<name>/<name>.ino
  python3 scripts/compile_firmware.py --variants      also the rewired variants (scripts/firmware_variants.ts): no sensor,
                                                      L298N, servos on board pins, PCA9685 and a pin servo together
  python3 scripts/compile_firmware.py --hex DIR       also write DIR/<example>.hex and DIR/firmware.json (board, sizes,
                                                      sha256 of each hex), for a simulator to load
  ARDUINO_CLI=/path/to/arduino-cli overrides the binary (default: arduino-cli on PATH, then ~/bin/arduino-cli).
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--hex", type=Path, help="folder to write <example>.hex files and firmware.json into")
ap.add_argument("--variants", action="store_true", help="also compile the rewired variants")
args = ap.parse_args()
cli = os.environ.get("ARDUINO_CLI") or shutil.which("arduino-cli") or str(Path.home() / "bin/arduino-cli")
if not Path(cli).exists(): sys.exit("arduino-cli not found: install it or set ARDUINO_CLI")


def compile_sketch(label: str, ino: Path, out: Path) -> dict:
    """Compile one sketch folder; returns its sizes, or exits with the compiler's message."""
    if ino.parent.name != ino.stem: sys.exit(f"{label}: {ino} is not in a folder of its own name (the Arduino IDE needs that)")
    m = re.search(r"^// FQBN:\s+(\S+)$", ino.read_text(), re.M)
    if not m: sys.exit(f"{label}: no '// FQBN:' line in {ino}")
    r = subprocess.run([cli, "compile", "--fqbn", m[1], "--warnings", "all", "--output-dir", str(out), str(ino.parent)], capture_output=True, text=True)
    if r.returncode: sys.exit(f"{label}: compile failed\n{r.stdout}\n{r.stderr}")
    warned = [l for l in r.stderr.splitlines() if ino.name in l and "warning" in l]
    if warned: sys.exit(f"{label}: the sketch compiles with warnings\n" + "\n".join(warned))
    flash = re.search(r"Sketch uses (\d+) bytes .*?Maximum is (\d+) bytes", r.stdout)
    ram = re.search(r"Global variables use (\d+) bytes .*?Maximum is (\d+) bytes", r.stdout)
    if not flash or not ram: sys.exit(f"{label}: no size report from arduino-cli\n{r.stdout}")
    return {"sketch": ino.name, "fqbn": m[1], "flash_bytes": int(flash[1]), "flash_max": int(flash[2]), "ram_bytes": int(ram[1]), "ram_max": int(ram[2])}


jobs = [(p.parents[2].name, p) for p in sorted((root / "examples").glob("[0-9][0-9]_*/firmware/*/*.ino"))]
if not jobs: sys.exit("no example has a firmware sketch: run node scripts/export_firmware.ts")
report = {}
with tempfile.TemporaryDirectory(prefix="ttr-fw-") as tmp:
    if args.variants:
        subprocess.run(["node", "scripts/export_firmware.ts", "--variants", f"{tmp}/variants"], cwd=root, check=True, stdout=subprocess.DEVNULL)
        jobs += [(f"variant {p.stem}", p) for p in sorted(Path(tmp, "variants").glob("*/*/*.ino"))]
    for label, ino in jobs:
        out = Path(tmp, "build", label.replace(" ", "_"))
        row = compile_sketch(label, ino, out)
        print(f"{label:28s} {row['fqbn']:32s} flash {row['flash_bytes']:6d} / {row['flash_max']} bytes ({100 * row['flash_bytes'] / row['flash_max']:.0f} %)   "
              f"RAM {row['ram_bytes']:5d} / {row['ram_max']} bytes ({100 * row['ram_bytes'] / row['ram_max']:.0f} %)")
        if args.hex and not label.startswith("variant "):
            args.hex.mkdir(parents=True, exist_ok=True)
            data = (out / f"{ino.name}.hex").read_bytes()
            (args.hex / f"{label}.hex").write_bytes(data)
            report[label] = {**row, "hex": f"{label}.hex", "hex_sha256": hashlib.sha256(data).hexdigest()}
if args.hex:
    v = subprocess.run([cli, "version"], capture_output=True, text=True).stdout.strip()
    (args.hex / "firmware.json").write_text(json.dumps({"arduino_cli": v, "sketches": report}, indent=2) + "\n")
    print(f"wrote {len(report)} hex files and firmware.json to {args.hex}")
print(f"{len(jobs)} sketches compiled without errors or warnings")
