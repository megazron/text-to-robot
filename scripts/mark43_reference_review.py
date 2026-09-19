"""Maintain local reference photographs and a side-by-side geometry review page."""
import argparse, hashlib, html, json, shutil, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base=root/'references/mark43'
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--fetch',action='store_true');p.add_argument('--snapshot');p.add_argument('--check-renders',action='store_true');a=p.parse_args()
render_manifest=json.loads((root/'docs/img/mark43_render_manifest.json').read_text())
if render_manifest['robot_sha256']!=hashlib.sha256((root/'examples/14_iron_man_mark_43/robot.json').read_bytes()).hexdigest():
    raise SystemExit('Stale renders: rerun scripts/render_mark43_review.py')
for view,digest in render_manifest['images'].items():
    if digest!=hashlib.sha256((root/f'docs/img/mark43_{view}_review.png').read_bytes()).hexdigest():
        raise SystemExit(f'Render changed outside recorded run: {view}')
if a.check_renders:
    print('Render hashes match the exported model and images');raise SystemExit(0)
sources=json.loads((base/'sources.json').read_text());(base/'images').mkdir(exist_ok=True)
for s in sources:
    target=base/'images'/s['file']
    if a.fetch and not target.exists():
        request=urllib.request.Request(s['url'],headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=30) as response: target.write_bytes(response.read())
    if not target.exists():raise SystemExit(f'Missing {target}; run with --fetch')
    s['sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
if a.snapshot:
    if not a.snapshot.replace('-','').replace('_','').isalnum():raise SystemExit('Snapshot name must be alphanumeric with hyphens/underscores')
    (base/'iterations').mkdir(exist_ok=True)
    for view in ('front','threequarter','rear','torso','helmet'):
        shutil.copyfile(root/f'docs/img/mark43_{view}_review.png',base/f'iterations/{a.snapshot}-{view}.png')
if a.snapshot:
    (base/f'iterations/{a.snapshot}.json').write_text(json.dumps({'render':render_manifest,'references':sources},indent=2)+'\n')
(base/'local_manifest.json').write_text(json.dumps(sources,indent=2)+'\n')
refs=''.join(f'<figure><img src="images/{html.escape(s["file"])}"><figcaption>{html.escape(s["kind"])}: {html.escape(s["use"])} <a href="{html.escape(s["page"])}">Source</a></figcaption></figure>' for s in sources)
views=''.join(f'<figure><img src="../../docs/img/mark43_{v}_review.png"><figcaption>Exported geometry: {v}</figcaption></figure>' for v in ('front','threequarter','rear','torso','helmet'))
(base/'review.html').write_text('''<!doctype html><meta charset="utf-8"><title>Mark 43 reference review</title><style>body{background:#20252c;color:#eee;font:16px system-ui;margin:24px}section{display:flex;gap:16px;align-items:start}figure{margin:0;flex:1;min-width:0}img{width:100%;max-height:750px;object-fit:contain;background:#343b46}a{color:#8ed1ff}figcaption{padding:12px}h2{margin-top:32px}</style><h1>Mark 43 visual comparison</h1><p>Reference photographs and actual exported geometry. Different cameras and poses prevent a pixel-error accuracy score. Inspect silhouette, plate boundaries, negative spaces and colours separately.</p><h2>Reference photographs</h2><section>'''+refs+'</section><h2>Current model</h2><section>'+views+'</section>')
print(base/'review.html')
