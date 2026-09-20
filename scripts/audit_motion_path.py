"""Check coordinated joint waypoints against exported visual surfaces, locally.

This samples straight segments in joint space, not continuous collision detection.
It checks geometry only: no timing, torque, balance or human-fit guarantee.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from ttr_mujoco.surface import SurfaceScene


def audit_path(scene, waypoints, angular_step=0.02, linear_step=0.002, max_poses=10000):
    for value in (angular_step, linear_step):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError('Sampling steps must be finite positive numbers')
    if isinstance(max_poses, bool) or not isinstance(max_poses, int) or max_poses < 2:
        raise ValueError('max_poses must be an integer >= 2')
    if not isinstance(waypoints, list) or len(waypoints) < 2:
        raise ValueError('Supply a list of at least two joint-position objects')
    if any(not isinstance(p, dict) for p in waypoints):
        raise ValueError('Each waypoint must be a joint-position object')
    names = set(waypoints[0])
    if not names or any(set(p) != names for p in waypoints):
        raise ValueError('Every waypoint must specify the same nonempty set of joints')
    joints = {j.get('name'): j for j in scene.joints}
    if names - joints.keys():
        raise ValueError('Unknown joints: ' + ', '.join(sorted(names - joints.keys())))
    steps = {}
    held = {}
    for name, joint in joints.items():
        kind = joint.get('type')
        if joint.find('mimic') is not None:
            raise ValueError('Mimic joints are not supported: ' + name)
        if kind == 'fixed':
            if name in names:
                raise ValueError('Cannot command fixed joint: ' + name)
            continue
        if kind not in ('revolute', 'continuous', 'prismatic'):
            raise ValueError('Unsupported joint type: ' + kind)
        axis = joint.find('axis')
        vector = [float(v) for v in (axis.get('xyz') if axis is not None else '1 0 0').split()]
        if len(vector) != 3 or not all(math.isfinite(v) for v in vector) or not any(vector):
            raise ValueError('Invalid joint axis: ' + name)
        lo, hi = -math.inf, math.inf
        if kind != 'continuous':
            limit = joint.find('limit')
            if limit is None:
                raise ValueError('Missing joint limits: ' + name)
            lo, hi = float(limit.get('lower')), float(limit.get('upper'))
            if not math.isfinite(lo) or not math.isfinite(hi) or lo > hi:
                raise ValueError('Invalid joint limits: ' + name)
        values = [p[name] for p in waypoints] if name in names else [0.0]
        for value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError('Joint positions must be finite numbers: ' + name)
            if not lo <= value <= hi:
                raise ValueError('Joint position outside limits: ' + name)
        if name in names:
            steps[name] = linear_step if kind == 'prismatic' else angular_step
        else:
            held[name] = 0.0
    # Validate and bound all work before changing the scene. Continuous joints
    # use the explicit unwrapped input: 0 -> 2*pi means a full revolution.
    counts = []
    for start, end in zip(waypoints, waypoints[1:]):
        ratios = [abs(end[n] - start[n]) / steps[n] for n in names]
        if any(not math.isfinite(r) or r > max_poses for r in ratios):
            raise ValueError('Path exceeds max_poses; shorten the path or increase sampling steps')
        counts.append(max(1, math.ceil(max(ratios))))
    total = 1 + sum(counts)
    if total > max_poses:
        raise ValueError('Path exceeds max_poses; shorten the path or increase sampling steps')
    failures = []
    index = 0
    baseline = set()

    def check(segment, fraction, positions):
        nonlocal index
        pairs = scene.contacts(positions)
        if index == 0:
            baseline.update(pairs)
        if pairs:
            failures.append({'sample': index, 'segment': segment, 'fraction': fraction,
                             'positions': positions, 'pairs': pairs,
                             'new_pairs': sorted(set(pairs) - baseline)})
        index += 1

    check(0, 0.0, dict(waypoints[0]))
    for segment, (start, end, count) in enumerate(zip(waypoints, waypoints[1:], counts)):
        for i in range(1, count + 1):
            t = i / count
            positions = {n: float(end[n]) if i == count else (1-t)*start[n]+t*end[n] for n in sorted(names)}
            check(segment, t, positions)
    return {
        'scope': __doc__, 'mode': 'sampled_joint_path',
        'source_urdf_sha256': hashlib.sha256(scene.source.read_bytes()).hexdigest(),
        'source_mesh_sha256': scene.mesh_hashes,
        'waypoints': waypoints, 'held_joint_positions': held,
        'angular_step_rad': angular_step, 'linear_step_m': linear_step,
        'poses_checked': total, 'failing_poses': len(failures),
        'initial_pairs': sorted(baseline),
        'poses_with_new_pairs': sum(bool(f['new_pairs']) for f in failures),
        'first_failure': failures[0] if failures else None,
        'failures': failures, 'pass': not failures,
        'limitations': [
            'Finite samples can miss collisions between samples; no continuous clearance guarantee',
            'Surface intersections do not test containment, human fit or achievable dynamics',
            'Only direct parent-child link pairs are excluded; rigid assembly overlaps can be reported',
            'Unspecified movable joints are held at zero; continuous joint angles are not wrapped',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('urdf', type=Path)
    parser.add_argument('waypoints', type=Path, help='JSON array of joint-position objects, radians/metres')
    parser.add_argument('--json', type=Path, required=True)
    parser.add_argument('--angular-step', type=float, default=0.02)
    parser.add_argument('--linear-step', type=float, default=0.002)
    args = parser.parse_args()
    try:
        if args.json.resolve() in (args.urdf.resolve(), args.waypoints.resolve()):
            raise ValueError('Report must not overwrite input files')
        report = audit_path(SurfaceScene(args.urdf), json.loads(args.waypoints.read_text()),
                            args.angular_step, args.linear_step)
        args.json.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    except (ValueError, TypeError, OSError) as error:
        parser.exit(2, f'Motion audit failed: {error}\n')
    print(f"{report['poses_checked']} poses; {report['failing_poses']} collisions; pass: {report['pass']}")
    return 0 if report['pass'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
