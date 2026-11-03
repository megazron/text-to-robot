"""Deterministic sampled joint-range interference audit (kinematic, not dynamic)."""
import argparse
import json
from pathlib import Path

import mujoco
import numpy as np


def audit(model, samples=9, penetration_tolerance_m=.001):
    if not isinstance(samples, int) or samples < 3:
        raise ValueError("samples must be an integer >= 3")
    if not np.isfinite(penetration_tolerance_m) or penetration_tolerance_m < 0:
        raise ValueError("penetration tolerance must be finite and nonnegative")
    data = mujoco.MjData(model)
    poses = [("neutral", None, 0.)]
    for j in range(model.njnt):
        if int(model.jnt_type[j]) not in (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE)):
            continue
        if not model.jnt_limited[j]:
            continue
        for value in np.linspace(*model.jnt_range[j], samples):
            poses.append((model.joint(j).name, j, float(value)))
    pairs = {}; failing_poses = 0
    for name, joint, value in poses:
        mujoco.mj_resetData(model, data)
        if joint is not None: data.qpos[model.jnt_qposadr[joint]] = value
        mujoco.mj_forward(model, data)
        failed = False
        for c in data.contact:
            if c.dist >= -penetration_tolerance_m: continue
            if any(model.geom_type[g] == mujoco.mjtGeom.mjGEOM_PLANE for g in (c.geom1, c.geom2)): continue
            failed = True
            bodies = tuple(sorted(model.body(int(model.geom_bodyid[g])).name for g in (c.geom1,c.geom2)))
            depth = float(-c.dist)
            if bodies not in pairs or depth > pairs[bodies]["max_depth_m"]:
                pairs[bodies] = {"bodies": list(bodies), "max_depth_m": depth,
                    "witness_joint": name, "witness_position": value,
                    "position_unit": "m" if joint is not None and model.jnt_type[joint] == mujoco.mjtJoint.mjJNT_SLIDE else "rad"}
        failing_poses += failed
    physical = [g for g in range(model.ngeom) if model.geom_type[g] != mujoco.mjtGeom.mjGEOM_PLANE]
    enabled = any((model.geom_contype[a] & model.geom_conaffinity[b]) or (model.geom_contype[b] & model.geom_conaffinity[a])
        for i,a in enumerate(physical) for b in physical[i+1:] if model.geom_bodyid[a] != model.geom_bodyid[b])
    return {"mujoco_version": mujoco.__version__, "self_collision_masks_enabled": bool(enabled),
        "pass": bool(enabled and not pairs), "poses_checked": len(poses), "failing_poses": failing_poses,
        "samples_per_limited_joint": samples, "penetration_tolerance_m": penetration_tolerance_m,
        "pairs": sorted(pairs.values(), key=lambda p: -p["max_depth_m"]),
        "limitations": ["Independent joint samples only: simultaneous motions and gaps between samples are not checked",
            "Kinematic poses, not dynamically achievable trajectories", "MuJoCo collision masks and adjacent-body exclusions apply",
            "Approximate collision geometry; no human-fit or manufacturing certification"]}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mjcf",type=Path); parser.add_argument("--json",type=Path,required=True)
    parser.add_argument("--samples",type=int,default=9)
    args=parser.parse_args()
    report=audit(mujoco.MjModel.from_xml_path(str(args.mjcf.resolve())),args.samples)
    args.json.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({k:v for k,v in report.items() if k!='pairs'},indent=2))
    raise SystemExit(0 if report['pass'] else 1)


if __name__ == '__main__': main()
