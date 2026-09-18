"""Independent STL topology and solid-integral check against generated JSON metadata."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh


def audit(spec_path):
    spec_path=Path(spec_path);spec=json.loads(spec_path.read_text());parts=[]
    for link in spec["links"]:
        geometry=link["geometry"]
        if geometry["type"]!="mesh":continue
        file=spec_path.parent/"meshes"/geometry["file"];mesh=trimesh.load_mesh(file)
        expected=geometry["inertia_unit"]
        tensor=np.array([[expected["ixx"],expected["ixy"],expected["ixz"]],
                         [expected["ixy"],expected["iyy"],expected["iyz"]],
                         [expected["ixz"],expected["iyz"],expected["izz"]]])
        volume_error=abs(float(mesh.volume)-geometry["volume"])/geometry["volume"]
        com_error=float(np.max(np.abs(mesh.center_mass-np.asarray(geometry["centroid"]))))
        inertia_error=float(np.linalg.norm(mesh.moment_inertia-tensor)/np.linalg.norm(tensor))
        ok=mesh.is_volume and volume_error<1e-4 and com_error<1e-6 and inertia_error<1e-4
        parts.append({"part":link["name"],"pass":bool(ok),"closed_volume":bool(mesh.is_volume),
                      "volume_relative_error":volume_error,"com_error_m":com_error,"inertia_relative_error":inertia_error,
                      "sha256":hashlib.sha256(file.read_bytes()).hexdigest()})
    return {"scope":"STL closed topology and uniform-solid integrals; no self-intersection, assembly fit or manufacturing qualification",
            "trimesh_version":trimesh.__version__,"passed":sum(p["pass"] for p in parts),"total":len(parts),"parts":parts}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec",nargs="?",default="examples/14_iron_man_mark_43/robot.json")
    parser.add_argument("--json",type=Path);args=parser.parse_args();report=audit(args.spec)
    if args.json:args.json.write_text(json.dumps(report,indent=2)+"\n")
    print(f"{report['passed']}/{report['total']} mesh assets match their topology and mass metadata")
    for part in report["parts"]:
        if not part["pass"]:print(json.dumps(part))
    raise SystemExit(0 if report["passed"]==report["total"] and report["total"]>0 else 1)


if __name__=="__main__":main()
