"""Studio stills and a turntable of the Mark 43 pack (headless Chromium, software GL is fine):
    ~/.venvs/ehd/bin/python scripts/studio/render.py <out-dir>"""
import glob, http.server, os, shutil, sys, tempfile, threading
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); out = sys.argv[1]; os.makedirs(out, exist_ok=True)
t = tempfile.mkdtemp()
shutil.copy(f"{R}/scripts/studio/studio.html", t); shutil.copy(f"{R}/apps/web/public/vendor/three.module.js", t)
for f in ("three.core.js",):
    if os.path.exists(f"{R}/node_modules/three/build/{f}"): shutil.copy(f"{R}/node_modules/three/build/{f}", t)
shutil.copy(f"{R}/node_modules/three/build/three.module.js", t)
os.makedirs(f"{t}/addons"); shutil.copy(f"{R}/node_modules/three/examples/jsm/environments/RoomEnvironment.js", f"{t}/addons/")
for f in ("json", "bin"): shutil.copy(f"{R}/packages/parts/data/mark43_pack.{f}", t)
os.chdir(t)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
Q.extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8766), Q); threading.Thread(target=s.serve_forever, daemon=True).start()
ex = glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome"))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=ex[0] if ex else None, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    g = b.new_page(viewport={"width": 1200, "height": 1500}); g.on("pageerror", lambda e: print("ERR", e)); g.on("console", lambda m: print("LOG", m.text[:200]) if m.type == "error" else None)
    g.goto("http://127.0.0.1:8766/studio.html?w=1200&h=1500", timeout=60000); g.wait_for_function("window.ready", timeout=180000)
    for name, az, h, d, ly in (("front", 8, 1.15, 5.2, 1.0), ("three_quarter", 38, 1.2, 5.2, 1.0), ("back", 188, 1.2, 5.2, 1.0), ("bust", 14, 1.55, 2.5, 1.5)):
        g.evaluate(f"shot({az},{h},{d},{ly})"); g.locator("canvas").screenshot(path=f"{out}/{name}.png"); print(name, flush=True)
    b.close()
