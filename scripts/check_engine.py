"""Load the engine API (engine/v1/engine.js) from a page on another origin, the way another site uses it, and drive it.

Serves the static build (deploy/build-pages.sh) under /text-to-robot/ with the headers GitHub Pages sends
(Access-Control-Allow-Origin: *), serves a blank page from a second origin, and in Chromium imports the engine across
origins and calls it: version, catalog with mounts, a design from an example prompt (compared with the shipped example),
its schematic and breadboard view, edits, checks, URDF, the ROS 2 package and an empty robot built by hand.

    deploy/build-pages.sh pages-dist
    python scripts/check_engine.py            (report in out/engine-check/report.json)
"""
import argparse, functools, http.server, json, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--site", type=Path, default=root / "pages-dist")
ap.add_argument("--out", type=Path, default=root / "out/engine-check")
args = ap.parse_args()
if not (args.site / "engine/v1/engine.js").exists(): sys.exit(f"{args.site} has no engine/v1/engine.js: run deploy/build-pages.sh first")
args.out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"


class Site(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm", ".ts": "text/plain"}
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()
    def translate_path(self, path):
        path = path.split("?")[0]
        return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)


class Other(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        body = b"<!DOCTYPE html><title>another site</title><p>another site</p>"
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.send_header("Content-Length", str(len(body)))
        # the strictest policy an embedding site can keep and still run the engine (docs/ENGINE_API.md, "Content-Security-Policy")
        self.send_header("Content-Security-Policy", EMBEDDER_CSP.format(site=site_origin))
        self.end_headers(); self.wfile.write(body)


EMBEDDER_CSP = ("default-src 'none'; script-src 'self' {site} 'unsafe-eval'; worker-src blob:; connect-src {site}; "
                "object-src 'none'; base-uri 'none'; form-action 'none'")


def serve(handler):
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, f"http://127.0.0.1:{s.server_address[1]}"


site, site_origin = serve(functools.partial(Site, directory=str(args.site)))
other, other_origin = serve(Other)
engine_url = f"{site_origin}{BASE}/engine/v1/engine.js"
example = root / "examples/18_arduino_car"
prompt = (example / "prompt.txt").read_text().strip()
expected = json.loads((example / "robot.json").read_text())

SCRIPT = """async ([url, prompt]) => {
  const t0 = performance.now(), out = {};
  try {
  const { createEngine, snapPart, applyEdits, toScene, fromScene } = await import(url);
  const engine = await createEngine();
  out.version = engine.version;
  const cat = await engine.catalog();
  out.parts = cat.parts.length; out.printed = cat.printed.length; out.withMounts = cat.parts.filter(p => p.mounts.length).length;
  const d = await engine.design(prompt);
  out.design = { name: d.robot.robot_name, links: d.robot.links.length, joints: d.robot.joints.length };
  out.roundTrip = JSON.stringify(fromScene(toScene(d.robot))) === JSON.stringify(d.robot);
  const sch = await engine.schematic(d.robot), bb = await engine.breadboard(d.robot);
  out.schematic = { svg: sch.svg.startsWith("<svg") && sch.svg.includes('class="pin"'), pdf: String.fromCharCode(...sch.pdf.slice(0, 5)), layout: sch.layout, nodes: sch.netlist.nodes.length, logic: sch.electrical.logic.length };
  out.breadboard = { svg: bb.svg.startsWith("<svg") && bb.svg.includes('class="wire"'), layout: bb.layout, unrouted: bb.unrouted.length };
  const e3 = await engine.electronics3d(d.robot), glb = new Uint8Array(await engine.electronicsGlb(d.robot));
  out.electronics3d = { parts: e3.parts.length, wires: e3.wires.length, models: Object.keys(e3.models).length, linked: e3.wires.every((w) => w.pts.every((q) => d.robot.links.some((l) => l.name === q.link))), glb: String.fromCharCode(...glb.slice(0, 4)), notes: e3.notes };
  const moved = await engine.edit(d.robot, [{ op: "translate", link: "ultrasonic", by: [0.002, 0, 0] }]);
  out.edited = moved.robot.metadata.studio?.edited === true && moved.mounts.length > 0;
  const q = await engine.check(moved.robot, { interference: false, wiring: false });
  out.check = { checks: q.checks.length, mass: q.engineering.mass_kg, cost: q.engineering.cost_usd };
  const u = await engine.urdf(moved.robot);
  out.urdf = u.urdf.length > 1000 && u.urdf.includes("<robot");
  const ros2 = await engine.ros2(moved.robot);
  out.ros2 = Object.keys(ros2).length; out.zip = engine.zip(ros2).size;
  // by hand: a plate, a servo snapped onto it, a joint about its shaft
  let r = await engine.empty("by_hand");
  ({ robot: r } = await engine.edit(r, [{ op: "add", printed: cat.printed.find(s => s.shape === "plate").defaults, world: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, name: "plate" }]));
  const mounts = await engine.mounts(r), servo = cat.parts.find(p => p.key === "hobby_mg996r");
  const top = mounts.find(m => m.link === "plate" && m.id === "top");
  const s = snapPart(servo.mounts, mounts, { point: top.pos, normal: top.axis, link: "plate" });
  ({ robot: r } = await engine.edit(r, [{ op: "add", key: servo.key, parent: s.parent, world: s.world, name: "servo" }]));
  const stl = await engine.partMesh("hobby_mg996r");
  out.partMesh = new DataView(stl).getUint32(80, true);
  const hb = await engine.check(r, { interference: false, wiring: false });
  out.handBuilt = { links: hb.robot.links.length, spec: hb.checks.find(c => c.name === "spec").pass, urdf: hb.checks.find(c => c.name === "urdf").pass };
  out.pure = applyEdits(r, [{ op: "rename", link: "servo", to: "base_servo" }]).links.some(l => l.name === "base_servo");
  engine.terminate();
  // a 1 MB kernel limit: the worker is replaced after every design, and a robot designed earlier still serves its meshes
  const small = await createEngine({ recycleMb: 1 });
  const a = await small.design("a 2 DOF arm"), b = await small.design("a SCARA robot");
  const file = a.robot.links.find(l => l.geometry.type === "mesh").geometry.file;
  const again = await small.robotMesh(a.id, file);
  out.recycle = { recycles: small.recycles, second: b.robot.robot_name, meshTriangles: new DataView(again).getUint32(80, true) };
  small.terminate();
  out.seconds = Math.round((performance.now() - t0) / 1000);
  } catch (e) { out.error = String(e && e.stack || e); }
  return out;
}"""

errors = []
with sync_playwright() as p:
    opts = {"headless": True, "args": ["--no-sandbox"]}
    if os.getenv("TTR_CHROMIUM"): opts["executable_path"] = os.environ["TTR_CHROMIUM"]
    browser = p.chromium.launch(**opts)
    page = browser.new_page()
    page.add_init_script("addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`))")
    page.on("worker", lambda w: w.on("console", lambda m: errors.append("worker: " + m.text) if m.type == "error" else None))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.route("**/*", lambda r: r.continue_() if r.request.url.startswith((site_origin, other_origin, "blob:", "data:")) else (errors.append("external: " + r.request.url), r.abort()))
    page.goto(other_origin + "/")
    result = page.evaluate(SCRIPT, [engine_url, prompt])
    browser.close()
site.shutdown(); other.shutdown()

if result.get("error"): sys.exit(f"FAIL: {result['error']} (after {list(result)})")
report = {"engine": engine_url, "page_origin": other_origin, "result": result, "errors": errors}
(args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
fail = []
if result["version"] != "1.0.0": fail.append("version")
if result["parts"] < 80 or result["withMounts"] != result["parts"] or result["printed"] < 6: fail.append("catalog")
if result["design"] != {"name": expected["robot_name"], "links": len(expected["links"]), "joints": len(expected["joints"])}: fail.append(f"design differs from the example: {result['design']}")
for k in ["roundTrip", "edited", "urdf", "pure"]:
    if not result[k]: fail.append(k)
sch, bb = result.get("schematic", {}), result.get("breadboard", {})
if not sch.get("svg") or sch.get("pdf") != "%PDF-" or sch.get("layout") or sch.get("nodes", 0) < 5: fail.append("schematic")
if not bb.get("svg") or bb.get("layout") or bb.get("unrouted"): fail.append("breadboard")
e3 = result.get("electronics3d", {})
if e3.get("parts", 0) < 3 or e3.get("wires", 0) < 3 or not e3.get("linked") or e3.get("glb") != "glTF" or e3.get("notes"): fail.append("electronics3d")
if result["ros2"] < 10 or result["zip"] < 10000: fail.append("ros2 export")
if not (result["handBuilt"]["links"] == 2 and result["handBuilt"]["spec"] and result["handBuilt"]["urdf"]): fail.append(f"hand built: {result['handBuilt']}")
if result["partMesh"] < 10: fail.append("part mesh")
if not (result["recycle"]["recycles"] >= 2 and result["recycle"]["meshTriangles"] > 10): fail.append(f"worker recycling: {result['recycle']}")
if errors: fail.append(f"page errors: {errors[:5]}")
print(json.dumps(result, indent=1))
if fail: sys.exit("FAIL: " + "; ".join(fail))
print(f"PASS: engine v1 loaded from {site_origin} into a page on {other_origin} in {result['seconds']} s")
