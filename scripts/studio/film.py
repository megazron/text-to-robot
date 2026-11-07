"""One example's studio film, end to end: MuJoCo motion loop, Cycles frames, then examples/<name>/studio.gif.

    .venv/bin/python -B scripts/studio/film.py <example> [--samples 28] [--device CPU|GPU] [--threads 14]

Set BLENDER to the Blender 4.5 binary (default ~/tools/blender/blender-4.5.3-linux-x64/blender). ffmpeg makes the GIF.
"""
import argparse, os, shutil, subprocess, sys
from pathlib import Path
R = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0]); ap.add_argument("example"); ap.add_argument("--samples", type=int, default=28); ap.add_argument("--device", default="CPU")
ap.add_argument("--threads", type=int, default=14); ap.add_argument("--w", type=int, default=560); ap.add_argument("--h", type=int, default=350); ap.add_argument("--colors", type=int, default=176); ap.add_argument("--reuse-motion", action="store_true")
a = ap.parse_args()
ex, work = R / "examples" / a.example, R / "out/studio" / a.example
blender = os.environ.get("BLENDER", os.path.expanduser("~/tools/blender/blender-4.5.3-linux-x64/blender"))
env = {**os.environ, "MUJOCO_GL": "disable"}
if not a.reuse_motion or not (work / "motion.json").exists(): subprocess.run([sys.executable, "-B", str(R / "scripts/studio/motion.py"), a.example], check=True, env=env)
frames = work / "frames"; shutil.rmtree(frames, ignore_errors=True)
genv = {**os.environ, "LD_LIBRARY_PATH": "/usr/lib/wsl/lib"} if a.device == "GPU" else os.environ
base = [blender, "-b", "-P", str(R / "scripts/studio/robot_film.py"), "--", str(ex), str(work / "motion.json"), str(frames), f"device={a.device}", f"threads={a.threads}"]
log = open(work / "render.log", "w")
subprocess.run([*base, f"samples={a.samples}", f"w={a.w}", f"h={a.h}"], check=True, stdout=log, stderr=log, env=genv)
pal = "split[a][b];[a]palettegen=max_colors=%d:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" % a.colors
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "12", "-pattern_type", "glob", "-i", str(frames / "f*.png"), "-vf", pal, "-loop", "0", str(ex / "studio.gif")], check=True)
mb = (ex / "studio.gif").stat().st_size / 1e6
print(a.example, "studio.gif", round(mb, 2), "MB", "OVER 5 MB" if mb > 5 else "")
