"""CLI: python -m ttr_mujoco {convert,test,render,train} ..."""
import argparse, json, sys
from .convert import urdf_to_mjcf
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
    r.add_argument("--seconds", type=float, default=4.0); r.add_argument("--motion", default="sweep", choices=["sweep", "hold", "drop"]); r.add_argument("--label")
    r.add_argument("--floating", action="store_true"); r.add_argument("--fixed", action="store_true"); r.add_argument("--wearer", action="store_true"); r.add_argument("--unpowered", action="store_true", help="motors off (with --wearer: show the suit collapsing)")
    tr = sub.add_parser("train", help="PPO in MuJoCo"); tr.add_argument("model"); tr.add_argument("--task", default="stand"); tr.add_argument("--steps", type=int, default=100_000); tr.add_argument("--out", default="ppo_mujoco")
    a = ap.parse_args(argv)
    fl = True if getattr(a, "floating", False) else (False if getattr(a, "fixed", False) else None)
    def model_xml(path):
        xml = urdf_to_mjcf(path, floating=fl) if path.endswith(".urdf") else open(path).read()
        return add_wearer(xml) if getattr(a, "wearer", False) else xml
    if a.cmd == "convert":
        xml = model_xml(a.urdf); open(a.out, "w").write(xml); print("wrote", a.out)
    elif a.cmd == "test":
        xml = model_xml(a.model)
        rep = run_tests(xml, floating=fl)
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
        print("wrote", render_gif(xml, a.out, seconds=a.seconds, motion=a.motion, label=a.label, floating=fl, unpowered=getattr(a, "unpowered", False)))
    elif a.cmd == "train":
        from .train import train
        print("saved", train(a.model, a.task, a.steps, a.out))


if __name__ == "__main__":
    main()
