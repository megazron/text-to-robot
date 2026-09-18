"""CLI: python -m ttr_mujoco {convert,test,render,train} ..."""
import argparse, os, json, sys
from .convert import urdf_to_mjcf, relativize_meshes
from .testbench import run_tests
from .render import render_gif
from .exo import add_wearer, assist_test


def main(argv=None):
    ap = argparse.ArgumentParser(prog="ttr_mujoco", description="Test, render and train text-to-robot URDFs in MuJoCo")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("convert", help="URDF -> actuated MJCF scene"); c.add_argument("urdf"); c.add_argument("-o", "--out", required=True)
    c.add_argument("--floating", action="store_true"); c.add_argument("--fixed", action="store_true"); c.add_argument("--wearer", action="store_true", help="add a human mannequin strapped into the exoskeleton")
    t = sub.add_parser("test", help="run the simulation test battery"); t.add_argument("model"); t.add_argument("--json"); t.add_argument("--floating", action="store_true"); t.add_argument("--fixed", action="store_true"); t.add_argument("--wearer", action="store_true")
    r = sub.add_parser("render", help="render a GIF"); r.add_argument("model"); r.add_argument("-o", "--out", required=True)
    r.add_argument("--seconds", type=float, default=4.0); r.add_argument("--motion", default="sweep", choices=["sweep", "hold", "drop", "don", "doff", "open"]); r.add_argument("--orbit", type=float, default=0.0, help="degrees of camera orbit over the clip"); r.add_argument("--azimuth", type=float, default=135); r.add_argument("--zoom", type=float, default=1.0); r.add_argument("--width", type=int, default=640); r.add_argument("--height", type=int, default=400); r.add_argument("--fps", type=int, default=20); r.add_argument("--label"); r.add_argument("--focus", help="body name to keep centred (close-ups)"); r.add_argument("--elevation", type=float, default=-18)
    r.add_argument("--floating", action="store_true"); r.add_argument("--fixed", action="store_true"); r.add_argument("--wearer", action="store_true"); r.add_argument("--unpowered", action="store_true", help="motors off (with --wearer: show the suit collapsing)")
    tr = sub.add_parser("train", help="PPO in MuJoCo"); tr.add_argument("model"); tr.add_argument("--task", default="stand"); tr.add_argument("--steps", type=int, default=100_000); tr.add_argument("--out", default="ppo_mujoco")
    for parser in (c, t, r, tr):
        parser.add_argument("--self-collision", action="store_true", help="enable robot collision checks when converting URDF (reveals intersecting parts)")
    tr.add_argument("--tip-body"); tr.add_argument("--seed",type=int,default=0)
    a = ap.parse_args(argv)
    fl = True if getattr(a, "floating", False) else (False if getattr(a, "fixed", False) else None)
    def model_xml(path):
        xml = urdf_to_mjcf(path, floating=fl, self_collision=getattr(a, "self_collision", False)) if path.endswith(".urdf") else open(path).read()
        return add_wearer(xml) if getattr(a, "wearer", False) else xml
    if a.cmd == "convert":
        xml = relativize_meshes(model_xml(a.urdf), os.path.dirname(os.path.abspath(a.out))); open(a.out, "w").write(xml); print("wrote", a.out)
    elif a.cmd == "test":
        xml = model_xml(a.model)
        rep = run_tests(xml, floating=fl)
        rep["model"] = a.model
        if getattr(a, "wearer", False):
            rep["assist"] = assist_test(xml)
            pw, up = rep["assist"]["powered"], rep["assist"]["unpowered"]
            ok = rep["assist"]["suit_supports_wearer"]
            print(f"  {'PASS' if ok else 'FAIL'}  wearer_support         powered head drop={pw['head_drop_m']} m, peak torque={pw['max_actuator_torque_Nm']} N·m | unpowered head drop={up['head_drop_m']} m")
            rep["tests"]["wearer_support"] = {"pass": ok, **rep["assist"]}; rep["passed"] += int(ok); rep["total"] += 1
        if a.json: json.dump(rep, open(a.json, "w"), indent=1); print("report ->", a.json)
        sys.exit(0 if rep["passed"] == rep["total"] else 1)
    elif a.cmd == "render":
        xml = model_xml(a.model)
        print("wrote", render_gif(xml, a.out, seconds=a.seconds, motion=a.motion, label=a.label, floating=fl, unpowered=getattr(a, "unpowered", False), orbit=a.orbit, azimuth=a.azimuth, zoom=a.zoom, width=a.width, height=a.height, fps=a.fps, focus=a.focus, elevation=a.elevation))
    elif a.cmd == "train":
        from .train import train
        print("saved", train(a.model, a.task, a.steps, a.out, self_collision=a.self_collision, tip_body=a.tip_body, seed=a.seed))


if __name__ == "__main__":
    main()
