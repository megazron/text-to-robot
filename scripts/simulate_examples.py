"""Run every example's MuJoCo task tests and film them.

The GIF is recorded from inside the task tests (payload hold, drive and ramp, stand and squat,
...), so what it shows is exactly what was verified under the real actuator limits. Writes
simulation_report.json, simulation.gif and the results section of each example README, then
the gallery in examples/README.md.

    MUJOCO_GL=osmesa .venv/bin/python -B scripts/simulate_examples.py [example ...]
"""
from __future__ import annotations

import json
import os
import re
import sys
import warnings
from pathlib import Path

os.environ.setdefault("MUJOCO_GL", "osmesa")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
import mujoco  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from ttr_mujoco import tasks  # noqa: E402

FPS, W, H = 12, 480, 300
MAX_SEGMENT_S, MAX_SEGMENTS = 5.0, 4


class Recorder:
    """Wraps mujoco.mj_step: every 1/FPS of simulated time, render the model being stepped."""

    def __init__(self):
        self.frames: list[np.ndarray] = []
        self.segments = 0
        self._model = None
        self._renderer = None
        self._next = 0.0
        self._t0 = 0.0
        self._cam = None
        self._orig = mujoco.mj_step

    def __enter__(self):
        rec = self

        def step(m, d, nstep=1):
            rec._orig(m, d, nstep)
            rec.capture(m, d)
        mujoco.mj_step = step
        return self

    def __exit__(self, *exc):
        mujoco.mj_step = self._orig
        if self._renderer: self._renderer.close()

    def capture(self, m, d):
        if m is not self._model or d.time + 1e-9 < self._next - 1.0 / FPS:  # a new task started
            if self.segments >= MAX_SEGMENTS: self._model = m; self._next = float("inf"); return
            self.segments += 1
            self._model, self._t0, self._next = m, d.time, d.time
            if self._renderer: self._renderer.close()
            self._renderer = mujoco.Renderer(m, H, W)
            self._cam = mujoco.MjvCamera()
            self._cam.azimuth, self._cam.elevation = 135, -20
            # frame the robot itself (the scene's extent includes the test floor and ramps)
            pts = [d.geom_xpos[g] + s * m.geom_rbound[g] for g in range(m.ngeom) if m.geom_bodyid[g] != 0 and m.geom_rbound[g] < 2 for s in (-1, 1)]
            lo, hi = np.min(pts, 0), np.max(pts, 0)
            self._size, self._center = float(np.max(hi - lo)), (lo + hi) / 2
            self._cam.distance = max(0.3, self._size * 1.9)
        if d.time < self._next or d.time - self._t0 > MAX_SEGMENT_S: return
        self._next = d.time + 1.0 / FPS
        free = m.njnt and m.jnt_type[0] == mujoco.mjtJoint.mjJNT_FREE
        self._cam.lookat[:] = d.subtree_com[1] if free else self._center
        self._renderer.update_scene(d, self._cam)
        self.frames.append(self._renderer.render().copy())


def gif(frames, path, label):
    if not frames:
        return
    step = max(1, len(frames) // 110)  # keep files small: <= ~110 frames
    imgs = []
    for f in frames[::step]:
        im = Image.fromarray(f)
        ImageDraw.Draw(im).text((10, 8), label, fill=(235, 235, 235))
        imgs.append(im.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=int(1000 / FPS * step), loop=0, optimize=True)


def sim_block(rep):
    rows = []
    for name, t in rep["tests"].items():
        flag = "✅" if t["pass"] else "➖" if t["pass"] is None else "❌"
        rows.append(f"| {flag} | {name.replace('_', ' ')} | {t['explanation']} |")
    out = ["<!-- SIM -->", "## Simulation (MuJoCo, real actuator limits)", "",
           f"**{rep['passed']}/{rep['total']} task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, "
           "with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. "
           "The animation above is recorded from these tests.", "",
           "| | Test | Result |", "|---|---|---|", *rows, ""]
    if rep.get("untested"): out += ["Not tested: " + "; ".join(rep["untested"]), ""]
    out += [f"_{rep['scope']}_", "<!-- /SIM -->"]
    return "\n".join(out)


def main(selected):
    rows = []
    for ex in sorted(p for p in (ROOT / "examples").iterdir() if p.is_dir() and re.match(r"\d\d_", p.name)):
        if selected and ex.name not in selected:
            report = ex / "simulation_report.json"
            if report.exists(): rows.append((ex, json.loads(report.read_text())))
            continue
        spec = json.loads((ex / "robot.json").read_text())
        with warnings.catch_warnings(), Recorder() as rec:
            warnings.simplefilter("ignore")
            rep = tasks.run_tasks(str(ex / "robot.urdf"), spec=spec, verbose=False)
        rep["model"] = "robot.urdf"
        (ex / "simulation_report.json").write_text(json.dumps(rep, indent=1, default=float) + "\n")
        gif(rec.frames, ex / "simulation.gif", f"{ex.name[3:].replace('_', ' ')} - MuJoCo task tests, real actuator limits")
        readme = ex / "README.md"
        text = readme.read_text()
        text = re.sub(r"<!-- SIM -->[\s\S]*?<!-- /SIM -->", lambda _m: sim_block(rep), text)
        readme.write_text(text)
        print(f"{ex.name:24s} {rep['group']:8s} {rep['passed']}/{rep['total']}  " + "  ".join(f"{k}:{'ok' if t['pass'] else '-' if t['pass'] is None else 'FAIL'}" for k, t in rep["tests"].items()))
        rows.append((ex, rep))
    gallery(rows)


def gallery(rows):
    out = ["# Examples", "", "Every example is regenerated from its prompt by `node scripts/build_examples.ts` and simulated by "
           "`scripts/simulate_examples.py`. Each robot is built from real, purchasable parts sized from its own loads; the GIF is "
           "recorded from its MuJoCo task tests under the real actuator limits.", "",
           "| Example | Robot | Parts cost | Mass | Design checks | Simulation |", "|---|---|--:|--:|--:|--:|"]
    for ex, rep in rows:
        spec = json.loads((ex / "robot.json").read_text())
        d = spec.get("metadata", {}).get("design") or {}
        bom = json.loads((ex / "bom.json").read_text()) if (ex / "bom.json").exists() else {}
        checks = d.get("checks", [])
        out.append(f"| [{ex.name}]({ex.name}/README.md)<br><img src=\"{ex.name}/simulation.gif\" width=\"220\"> | {d.get('summary', spec['robot_name'])} | "
                   f"${bom.get('total', '?')} | {d.get('performance', {}).get('mass_kg', '?')} kg | {sum(c['pass'] for c in checks)}/{len(checks)} | {rep['passed']}/{rep['total']} |")
    (ROOT / "examples" / "README.md").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
