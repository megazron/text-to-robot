"""Inspect locally downloaded design meshes without importing them into the product."""
import json,hashlib,zipfile,urllib.parse
from pathlib import Path
import trimesh
base=Path(__file__).resolve().parents[1]/'references/mark43';records=[];meshes=[]
for archive in sorted((base/'designs').glob('*.zip')):
    if not zipfile.is_zipfile(archive):continue
    dest=archive.with_suffix('');dest.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for n in z.namelist():
            if not n.endswith('/') and '..' not in Path(n).parts and not Path(n).is_absolute():z.extract(n,dest)
        files=z.namelist()
    records.append({'file':archive.name,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
      'url':'https://cdn.hackaday.io/files/9327399046368/'+urllib.parse.quote(archive.name),
      'source':'https://hackaday.io/project/9327-mk-iii-iron-man-suit',
      'license':'CC BY-SA 4.0' if 'Mechanics' in archive.name else 'Author-permitted repost; commercial redistribution not established',
      'scope':'Mark III mechanism/assembly study, not Mark 43 surface truth','files':files})
    for p in sorted(dest.rglob('*')):
        if p.suffix.lower()!='.stl' or p.name.startswith('view_'):continue
        m=trimesh.load_mesh(p)
        meshes.append({'file':str(p.relative_to(base)),'vertices':len(m.vertices),'triangles':len(m.faces),'bounds_native_units':m.bounds.tolist(),
         'extents_native_units':m.extents.tolist(),'watertight':bool(m.is_watertight),'connected_components':len(m.split(only_watertight=False)),
         'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(base/'design_sources.json').write_text(json.dumps(records,indent=2)+'\n')
(base/'design_geometry_report.json').write_text(json.dumps({'units':'STL has no embedded units; dimensions require confirmation before use','product_imported':False,'meshes':meshes},indent=2)+'\n')
for m in meshes:print(Path(m['file']).name,m['triangles'],m['extents_native_units'],m['watertight'])
