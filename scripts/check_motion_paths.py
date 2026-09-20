"""Reproduce sampled visual-surface path evidence; failures remain visible."""
import argparse
import hashlib
import json
from pathlib import Path

from audit_motion_path import audit_path, SurfaceScene


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Reject changed evidence without overwriting it')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    directory = root/'docs/motion_paths'
    rows = []
    for source in sorted(directory.glob('*.json')):
        if source.stem.endswith('_report') or source.name == 'summary.json':
            continue
        example = '14_iron_man_mark_43' if source.stem.startswith('mark43_') else source.stem
        folder = root/'examples'/example
        urdf = folder/('robot.sim.urdf' if example == '14_iron_man_mark_43' else 'robot.urdf')
        report = audit_path(SurfaceScene(urdf), json.loads(source.read_text()))
        report['source_path_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
        report['auditor_sha256'] = hashlib.sha256((root/'scripts/audit_motion_path.py').read_bytes()).hexdigest()
        # Normalize tuple pairs to their serialized representation for comparisons.
        report = json.loads(json.dumps(report, allow_nan=False))
        output = source.with_name(source.stem+'_report.json')
        if args.check:
            if json.loads(output.read_text()) != report:
                raise SystemExit('Stale motion evidence: '+str(output))
        else:
            output.write_text(json.dumps(report, indent=2)+'\n')
        rows.append({'path': source.name, 'example': example, 'poses_checked': report['poses_checked'],
                     'failing_poses': report['failing_poses'], 'pass': report['pass']})
        print(rows[-1], flush=True)
    if len(rows) != 6:
        raise SystemExit('Expected six motion fixtures')
    summary = {'scope': 'Sampled geometric paths, not dynamic or hardware validation; reported collisions are not suppressed', 'paths': rows}
    output = directory/'summary.json'
    if args.check:
        if json.loads(output.read_text()) != summary:
            raise SystemExit('Stale motion summary')
    else:
        output.write_text(json.dumps(summary, indent=2)+'\n')


if __name__ == '__main__':
    main()
