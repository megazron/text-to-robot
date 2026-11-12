"""Generate every example on the real website, the way a person does, and compare the result with the shipped example.

Serves the static GitHub Pages build (deploy/build-pages.sh, the same files users get) under /text-to-robot/ and drives it
in Chromium with third-party requests blocked: types each prompt.txt into the prompt bar, presses Generate, waits for the
3D preview, opens the Circuit tab (schematic and breadboard view), then presses the download buttons. Each robot gets a fresh tab, so a design that needs a cold engine is timed
with one. Arduino cases flip the Arduino switch first and check the price tiers.

    deploy/build-pages.sh pages-dist
    python scripts/check_site.py                     (all; report in out/site-check/report.json)
    python scripts/check_site.py --only 12_mars_rover,18_arduino_car --no-downloads
    python scripts/check_site.py --update            (also writes examples/site_generation.json)

The motion case (motion_ui) plays the site's default arm's purpose demo, downloads its GIF, joint CSV and ROS 2 trajectory, drags
the arm's tool tip with the mouse in the Move mode (the joints must change and the tip must reach the dragged-to point), and
drags it by touch in a phone-sized tab.

Exit code 1 if any robot fails to generate, differs from its example, or logs a page error.
"""
import argparse, base64, functools, hashlib, http.server, io, json, os, re, struct, sys, threading, time, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
import pw_csp; pw_csp.install()   # the site has no unsafe-eval: wait_for_function polls with evaluate instead

root = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--site", type=Path, default=root / "pages-dist", help="static site directory (default: pages-dist)")
ap.add_argument("--only", default="", help="comma list of example folder names or case ids")
ap.add_argument("--no-downloads", action="store_true", help="skip the download buttons (faster)")
ap.add_argument("--no-arduino", action="store_true", help="skip the Arduino switch cases")
ap.add_argument("--out", type=Path, default=root / "out/site-check")
ap.add_argument("--update", action="store_true", help="write the tracked report examples/site_generation.json")
ap.add_argument("--timeout", type=int, default=1800, help="seconds allowed per robot")
ap.add_argument("--helpers", type=int, default=None, help="cap the armour forge's helper workers in the tab (the site's ?helpers=N)")
ap.add_argument("--forge-timeout", type=int, default=7200, help="seconds allowed for a Mark 43, whose armour the tab forges")
args = ap.parse_args()
if not (args.site / "index.html").exists(): sys.exit(f"{args.site} has no index.html: run deploy/build-pages.sh first")
args.out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"
# Arduino switch cases: the three cheap robots, the owner's "arduino" prompt from the README, and the suit (which must answer
# with the honest budget fallback, not a powered suit). `example` is the folder one of the tiers must equal, if any.
ARDUINO = [("arduino_18_car", "18_arduino_car", True), ("arduino_19_arm", "19_arduino_arm", False), ("arduino_15_wall_e", "15_wall_e", True), ("arduino_14_mark_43", "14_iron_man_mark_43", False)]
ARDUINO_TEXT = [("arduino_readme_car", "an arduino car with four wheels")]
DOWNLOADS = {"urdf": "robot.urdf", "json": "robot.json", "bom": None, "xacro": None, "cad": "robot.cad.zip", "ros2": "robot.ros2.zip", "train": "robot.training.zip",
             "schematic": "schematic", "breadboard": "breadboard.svg", "wiring3d": None}


class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def translate_path(self, path):
        path = path.split("?")[0]
        return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(args.site)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_address[1]}"
url = f"{origin}{BASE}/" + (f"?helpers={args.helpers}" if args.helpers is not None else "")


def canon(data):
    """What may legitimately differ between two runs: the clock, the newline a prompt.txt ends with (an input box drops it),
    and the last bits of a float (Chromium and Node ship different sin and cos, one unit in the last place apart)."""
    data = re.sub(rb"FILE_NAME\('([^']*)','[0-9T:-]+'", rb"FILE_NAME('\1',''", data)
    data = re.sub(rb'"created": ?"[^"]*"', b'"created":""', data)
    data = re.sub(rb"-?\d+(?:\.\d{8,}(?:[eE][-+]?\d+)?|(?:\.\d+)?[eE]-\d+)", lambda m: (b"%.8f" % (round(float(m.group()), 8) + 0.0)).rstrip(b"0").rstrip(b"."), data)
    data = data.replace(b"\\n\"", b'"').replace(b"\n\"", b'"').replace(b"\r\n", b"\n")
    return re.sub(rb"\n\s*\n", b"\n", data)


def clean(spec):
    """A spec with the same allowances as canon()."""
    return json.loads(canon(json.dumps(spec, indent=1).encode()))


def stl_box(data):
    """Triangle count and bounding box of a binary STL."""
    n = struct.unpack_from("<I", data, 80)[0]; lo = [1e9] * 3; hi = [-1e9] * 3
    for i in range(n):
        v = struct.unpack_from("<9f", data, 84 + 50 * i + 12)
        for k in range(9): lo[k % 3] = min(lo[k % 3], v[k]); hi[k % 3] = max(hi[k % 3], v[k])
    return n, lo, hi


def stl_close(a, b):
    """Same part, allowing a float-level change to tip a CSG cut into a few different triangles: 1 % of the count, 0.01 mm of box."""
    (na, la, ha), (nb, lb, hb) = stl_box(a), stl_box(b)
    return abs(na - nb) <= max(2, 0.01 * nb) and all(abs(x - y) < 1e-5 for x, y in zip(la + ha, lb + hb))


def compare_zip(got, want_path):
    out = []
    with zipfile.ZipFile(io.BytesIO(got)) as a, zipfile.ZipFile(want_path) as b:
        # the simulator's own source rides along in the training package; it is the repo's, not this robot's
        names = lambda z: {n for n in z.namelist() if not n.endswith("/") and "/ttr_mujoco/" not in n}
        na, nb = names(a), names(b)
        out += sorted(na ^ nb)
        for n in sorted(na & nb):
            x, y = a.read(n), b.read(n)
            if x == y or canon(x) == canon(y): continue
            if n.endswith(".stl") and stl_close(x, y): continue
            out.append(n)
    return out


def wait_idle(page, ms):
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=ms)


def press_generate(page, ms):
    """Press Generate and wait for the job to start and finish; a short job can come and go between two polls."""
    page.evaluate("""()=>{const b=document.querySelector('#genbtn');window.__started=false;
      new MutationObserver(()=>{if(b.disabled)window.__started=true}).observe(b,{attributes:true,childList:true,subtree:true})}""")
    page.click("#genbtn")
    page.wait_for_function("window.__started", timeout=60000); wait_idle(page, ms)


forge_ctx = None


def drag(page, x0, y0, dx, dy, touch=False, steps=12, probe=None):
    """Drag by mouse or by touch; `probe` is evaluated in the page just before the release and returned."""
    seen = None
    if not touch:
        page.mouse.move(x0, y0); page.mouse.down()
        for k in range(1, steps + 1): page.mouse.move(x0 + dx * k / steps, y0 + dy * k / steps); page.wait_for_timeout(40)
        page.wait_for_timeout(400)
        if probe: seen = page.evaluate(probe)
        page.mouse.up(); return seen
    cdp = page.context.new_cdp_session(page)
    pt = lambda x, y: [{"x": x, "y": y, "id": 1, "radiusX": 4, "radiusY": 4, "force": 1}]
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": pt(x0, y0)})
    for k in range(1, steps + 1): cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": pt(x0 + dx * k / steps, y0 + dy * k / steps)}); page.wait_for_timeout(40)
    page.wait_for_timeout(400)
    if probe: seen = page.evaluate(probe)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); return seen


def motion_case(browser, case):
    """Play the default arm's purpose demo, download the GIF and the trajectory files, drag the tool tip by mouse and by touch."""
    row = {"case": case["id"], "prompt": "(the arm the site opens with)", "mode": "motion", "pass": False, "problems": []}
    ms = args.timeout * 1000
    for profile in ("desktop", "phone"):
        opts = {"viewport": {"width": 1400, "height": 900}, "accept_downloads": True} if profile == "desktop" else {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2, "is_mobile": True, "has_touch": True, "accept_downloads": True}
        ctx = browser.new_context(**opts); page = ctx.new_page(); errors = []
        page.route("**/*", lambda r: r.continue_() if r.request.url.startswith(origin) or r.request.url.startswith(("data:", "blob:")) else r.abort())
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
        try:
            page.goto(url)
            page.wait_for_function("window.__ttr?.robot?.links.length>0 && window.__ttr.preview.ready && window.__ttr.motion?.list?.length>0", timeout=ms); wait_idle(page, ms)
            m = page.evaluate("(()=>{const M=__ttr.motion;return {list:M.list.map(x=>x.name),def:(M.list.find(x=>x.default)||{}).name,tips:M.kin.tips.length}})()")
            row[f"{profile}_motions"] = m["list"]
            if profile == "desktop":
                page.click("#motionBtn")
                page.select_option("#motionPick", m["def"])
                page.wait_for_function(f"__ttr.motion.traj && __ttr.motion.traj.name==={json.dumps(m['def'])} && __ttr.motion.traj.collisions", timeout=ms)
                page.click("#motionPlay"); page.wait_for_timeout(2500)
                played = page.evaluate("(()=>{const M=__ttr.motion;return {t:M.t,playing:M.playing,collide:M.traj.collisions?M.traj.collisions.colliding_frames:null,checked:!!M.traj.collisions?.checked,limits:M.traj.limits}})()")
                row["played"] = played
                if played["t"] < 0.3: row["problems"].append(f"the motion did not play: {played}")
                if played["collide"]: row["problems"].append(f"{m['def']} collides in {played['collide']} frames")
                if not played["checked"]: row["problems"].append("the motion was not checked for collisions")
                page.click("#motionPlay")
                for kind, ext in (("gif", ".gif"), ("csv", ".csv"), ("ros2", ".yaml")):
                    with page.expect_download(timeout=ms) as dl: page.select_option("#motionGet", kind)
                    data = Path(dl.value.path()).read_bytes(); name = dl.value.suggested_filename
                    row[f"download_{kind}"] = {"file": name, "bytes": len(data)}
                    if not name.endswith(ext): row["problems"].append(f"{kind}: got {name}")
                    if kind == "gif":
                        frames = data.count(b"\x21\xf9\x04")   # one graphic control extension per frame
                        row["download_gif"]["frames"] = frames
                        if data[:6] != b"GIF89a" or frames < 20: row["problems"].append(f"GIF: {data[:6]!r}, {frames} frames")
                        (args.out / "motion_ui.gif").write_bytes(data)
                    if kind == "csv":
                        head = data.decode().splitlines()[0].split(",")
                        want = ["time_s"] + page.evaluate("__ttr.motion.traj.joints")
                        if head != want: row["problems"].append(f"CSV columns {head} are not the joints {want}")
                    if kind == "ros2" and b"joint_names:" not in data: row["problems"].append("ROS 2 trajectory has no joint_names")
            # drag the tool tip in the Move mode (the motion bar closed, the robot framed in view)
            if profile == "desktop":
                page.click("#motionBtn"); page.evaluate("__ttr.frameRobot()"); page.wait_for_timeout(500)
                page.click("label:has(#moveMode)")
            else: page.evaluate("document.querySelector('#moveMode').click()")
            page.wait_for_timeout(300)
            tip = page.evaluate("__ttr.motion.tipScreen(0)")
            on = page.evaluate(f"(()=>{{const e=document.elementFromPoint({tip['x']},{tip['y']});return e&&e.tagName}})()")
            if on != "CANVAS": row["problems"].append(f"{profile}: the tool tip is under {on}, not in the open 3D view")
            page.evaluate("__ttr.motion.lastDrag = null")
            # the lower level of detail a heavy model (the Mark 43) is dragged at: with the triangle budget set below this arm's
            # count the smallest parts hide while the pointer is down and all come back when it is let go
            hidden0 = page.evaluate("(()=>{let n=0;__ttr.robotGroup.traverse(o=>{if(o.isMesh&&!o.visible)n++});return n})()")
            if profile == "desktop": page.evaluate("__ttr.motion.lodBudget = 1")
            probe = "(()=>{const l=__ttr.motion.lod;return l&&{hidden:l.hidden.length,triangles:l.triangles,shown:l.shown}})()"
            # desktop pulls the tip in and up; on the phone the same pixels are a larger move, so it lifts the tip straight up
            # (pulled in that far, the arm's elbow and wrist reach their limits before the tip gets there)
            lod = drag(page, tip["x"], tip["y"], *((-40, -30) if profile == "desktop" else (0, -40)), touch=(profile == "phone"), probe=probe)
            page.wait_for_function("__ttr.motion.lastDrag", timeout=60000)
            if profile == "desktop":
                row["drag_lod"] = lod
                back = {"lod": page.evaluate("__ttr.motion.lod"), "hidden": page.evaluate("(()=>{let n=0;__ttr.robotGroup.traverse(o=>{if(o.isMesh&&!o.visible)n++});return n})()") - hidden0}
                page.evaluate("__ttr.motion.lodBudget = 250000")
                if not lod or lod["hidden"] < 1 or lod["shown"] >= lod["triangles"]: row["problems"].append(f"the drag did not lower the level of detail: {lod}")
                if back["lod"] is not None or back["hidden"]: row["problems"].append(f"the full detail did not come back after the drag: {back}")
            elif lod: row["problems"].append(f"{profile}: a light arm was dragged at the lower level of detail: {lod}")
            res = page.evaluate("(()=>{const d=__ttr.motion.lastDrag;return d&&{kind:d.kind,reached:d.result?.reached,error_mm:d.result?.error_mm,values:d.result?.values,target:d.target}})()")
            row[f"{profile}_drag"] = res
            if not res or res["kind"] != "ik": row["problems"].append(f"{profile}: dragging the tool tip did not start an IK drag: {res}")
            else:
                moved = sum(abs(v - page.evaluate(f"__ttr.motion.kin.home[{json.dumps(k)}] ?? 0")) for k, v in (res["values"] or {}).items())
                if moved < 0.02: row["problems"].append(f"{profile}: the joints did not move ({moved:.4f} rad)")
                if not res["reached"] or res["error_mm"] > 1: row["problems"].append(f"{profile}: the tip is {res['error_mm']} mm from where it was dragged")
            page.screenshot(path=str(args.out / f"motion_{profile}.png"))
        except Exception as e:
            row["problems"].append(f"{profile}: {type(e).__name__}: {str(e)[:300]}")
        if errors: row["problems"].append(f"{profile} page errors: {errors[:2]}")
        ctx.close()
    row["pass"] = not row["problems"]
    return row


def run(browser, case):
    """One robot in a fresh tab. Returns the row for the report."""
    # the Mark 43 is forged live in the tab (packages/mesh/src/forge): its armour takes far longer than any other robot
    ms = (max(args.timeout, args.forge_timeout) if "mark_43" in case["id"] else args.timeout) * 1000
    row = {"case": case["id"], "prompt": case["prompt"], "mode": case["mode"], "pass": False, "problems": []}
    # the Mark 43 cases share one context, as one visitor would: the suit forged for the prompt case is kept (IndexedDB) and the Arduino
    # tiers are designed from it, instead of forging the same armour a second time
    global forge_ctx
    if "mark_43" in case["id"]:
        forge_ctx = forge_ctx or browser.new_context(viewport={"width": 1000, "height": 640}, accept_downloads=True)
        ctx = forge_ctx
    else: ctx = browser.new_context(viewport={"width": 1000, "height": 640}, accept_downloads=True)
    page = ctx.new_page(); errors, external, failed = [], [], []
    def route(r):
        u = r.request.url
        if u.startswith(origin) or u.startswith("data:") or u.startswith("blob:"): r.continue_()
        else: external.append(u); r.abort()
    page.route("**/*", route)
    # every Content-Security-Policy or Trusted Types violation is a page error (the policy is in index.html, scripts/csp.ts)
    page.add_init_script("addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`))")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
    page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    try:
        t = time.time()
        page.goto(url)
        page.wait_for_function("window.__ttr?.robot?.links.length>0", timeout=ms); wait_idle(page, ms)   # the default arm the site opens with
        row["site_ready_s"] = round(time.time() - t, 1)
        if case["mode"] == "arduino": page.evaluate('document.querySelector("#arduinoBtn").click()')
        page.fill("#prompt", case["prompt"])
        t = time.time(); press_generate(page, ms); row["generate_s"] = round(time.time() - t, 1)
        status = page.evaluate('[...document.querySelectorAll("#status > *")].map(n=>n.textContent).join(" | ") || document.querySelector("#status").textContent')
        row["status"] = status[-400:]
        if "✗" in status: row["problems"].append(f"site reported: {status[-300:]}")
        tiers = page.evaluate('[...document.querySelectorAll(".tier")].map(n=>n.textContent)') if case["mode"] == "arduino" else []
        if case["mode"] == "arduino":
            row["tiers"] = tiers; row["notes"] = page.evaluate('document.querySelector("#tierNotes").textContent')[:300]
            if not tiers: row["problems"].append("Arduino mode returned no tiers: " + page.evaluate('document.querySelector("#tiers").textContent')[:200])
        page.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=ms)
        row["preview_s"] = round(time.time() - t, 1)   # the robot on screen (its wires as straight runs until the 3D harness is laid)
        # then the 3D harness: the engine designs the robot again with every wire laid through free space and the page swaps it in
        page.wait_for_function("window.__ttr.routing !== 'running'", timeout=ms)
        page.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=ms)
        row["routed_s"] = round(time.time() - t, 1)
        preview = page.evaluate("(()=>{const p=window.__ttr.preview;return {ready:p.ready,expected:p.expected,loaded:p.loaded,errors:p.errors,triangles:p.parts.reduce((s,x)=>s+x.triangles,0)}})()")
        row["preview"] = preview
        if not preview["ready"]: row["problems"].append(f"preview incomplete: {preview['errors'][:3]}")
        robot = page.evaluate("window.__ttr.robot"); row["robot_name"] = robot["robot_name"]; row["links"] = len(robot["links"]); row["joints"] = len(robot["joints"])
        # wires the router could only lay through a part are said plainly: an amber row in the engineering checks and an amber
        # pill, exactly when the wiring record has them
        through = (((robot.get("metadata") or {}).get("design") or {}).get("wiring") or {}).get("route", {}).get("through", 0)
        shown = page.evaluate('({row: !!document.querySelector("#checksList .route-through"), pill: document.querySelector("#checksPill").className, text: document.querySelector("#checksPill").textContent})')
        row["route_through"] = {"record": through, "shown": shown}
        if through and not (shown["row"] and "amber" in shown["pill"].split() + (["amber"] if "failing" in shown["text"] else []) and "through parts" in shown["text"]):
            row["problems"].append(f"{through} wire runs through parts are not shown in the checks: {shown}")
        if not through and shown["row"]: row["problems"].append("the checks show wires through parts that the record does not have")
        page.screenshot(path=str(args.out / f"{case['id']}.png"), timeout=240000)   # software GL takes a while over the biggest models
        if case["mode"] == "prompt":
            folder = root / "examples" / case["example"]
            want, got = clean(json.loads((folder / "robot.json").read_text())), clean(robot)
            row["matches_example_spec"] = got == want
            if got != want:
                (args.out / f"{case['id']}.differs.json").write_text(json.dumps(robot, indent=1))
                row["problems"].append("robot.json differs from the example: " + ", ".join(k for k in want if got.get(k) != want.get(k)))
            # every mesh the viewer shows, byte for byte against the example's meshes/
            meshes = page.evaluate("""async()=>{const r=__ttr.robot,o={};
              const id=JSON.parse(localStorage.getItem('ttr.robots')||'[]').at(-1)?.[0];
              const b64=b=>{const u=new Uint8Array(b);let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s)};
              for(const l of r.links){if(l.geometry.type!=='mesh'||o[l.geometry.file])continue;const res=await fetch(`/api/robots/${id}/mesh/${l.geometry.file}`);o[l.geometry.file]=res.ok?b64(await res.arrayBuffer()):'';}return o}""")
            exact, bad = 0, []
            for f, enc in meshes.items():
                mine, theirs = base64.b64decode(enc), (folder / "meshes" / f).read_bytes() if (folder / "meshes" / f).exists() else b""
                if mine == theirs: exact += 1
                elif not mine or not theirs or not stl_close(mine, theirs): bad.append(f)
            row["meshes_bit_identical"] = exact
            row["meshes_checked"] = len(meshes); row["meshes_differ"] = bad[:10]; row["meshes_differ_count"] = len(bad)
            if bad: row["problems"].append(f"{len(bad)}/{len(meshes)} meshes differ, e.g. {bad[:3]}")
        elif case.get("example"):
            # press every tier: the shipped example must be one of them when the example is an Arduino design
            want = clean(json.loads((root / "examples" / case["example"] / "robot.json").read_text()))
            row["tier_robots"] = []
            for i in range(len(tiers)):
                if not page.evaluate(f'document.querySelectorAll(".tier")[{i}].classList.contains("sel")'):
                    page.evaluate(f'window.__was=__ttr.robot; document.querySelectorAll(".tier")[{i}].click()')
                    page.evaluate('window.__said=document.querySelector("#status").textContent.length')
                    page.wait_for_function('__ttr.robot!==window.__was || document.querySelector("#status").textContent.slice(window.__said).includes("\u2717")', timeout=ms)
                    if page.evaluate("__ttr.robot===window.__was"): row["problems"].append(f"tier {i} failed: " + page.evaluate('document.querySelector("#status").textContent')[-200:]); continue
                page.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=ms)
                shown = page.evaluate("(()=>{const p=window.__ttr.preview,r=window.__ttr.robot;return {r,ready:p.ready,errors:p.errors.slice(0,3)}})()")
                got = clean(shown["r"]); same = got["links"] == want["links"] and got["joints"] == want["joints"]   # the same machine; the record names the mode it came from
                if not same and case.get("must_match"): (args.out / f"{case['id']}_tier{i}.differs.json").write_text(json.dumps(shown["r"], indent=1))
                row["tier_robots"].append({"tier": tiers[i][:60], "robot": shown["r"]["robot_name"], "links": len(shown["r"]["links"]), "preview_ready": shown["ready"], "same_as_example": same})
                if not shown["ready"]: row["problems"].append(f"tier {i} preview: {shown['errors']}")
            if case.get("must_match") and not any(x["same_as_example"] for x in row["tier_robots"]): row["problems"].append("no tier equals the shipped example")
        if case["mode"] == "prompt":
            # the Circuit tab draws the schematic and the breadboard view in the tab
            t = time.time()
            page.evaluate('document.querySelector(".tab[data-tab=circuit]").click()')
            for view in ["schematic", "breadboard"]:
                if view != "schematic": page.evaluate(f'document.querySelector(".tab[data-tab=circ-{view}]").click()')
                page.wait_for_function(f'(()=>{{const b=document.querySelector(".circview[data-view={view}]");const i=b&&b.querySelector("img.circimg");return (i&&i.complete&&i.naturalWidth>0)||(b&&b.textContent.includes("\u2717"))}})()', timeout=ms)
                shown = page.evaluate(f'(()=>{{const i=document.querySelector(".circview[data-view={view}] img.circimg");return i?i.naturalWidth:0}})()')
                if not shown: row["problems"].append(f"Circuit tab: no {view}: " + page.evaluate(f'document.querySelector(".circview[data-view={view}]").textContent')[:200])
            row["circuit_s"] = round(time.time() - t, 1)
            page.screenshot(path=str(args.out / f"{case['id']}.circuit.png"), timeout=240000)
        if case["mode"] == "prompt":
            # the electronics and harness in 3D: the engine's parts and wires for this robot, with the harness checks
            t = time.time()
            e3 = page.evaluate("""async()=>{const r=await fetch('/api/engine/electronics3d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({robot:__ttr.robot,options:{checks:true}})});
              if(!r.ok)return {error:(await r.json()).error};const d=await r.json();return {parts:d.parts.length,wires:d.wires.length,notes:d.notes,through:d.checks.through.length,bend:d.checks.bend.length,length:d.checks.length.length,samples:d.checks.checked.samples,skipped:d.checks.checked.skipped.length}}""")
            row["electronics3d"] = {**e3, "seconds": round(time.time() - t, 1)}
            if e3.get("error") or not e3.get("wires") or e3.get("notes"): row["problems"].append(f"electronics3d: {e3}")
            if case["example"] in ("18_arduino_car", "08_humanoid"):
                page.evaluate('document.querySelector(".tab[data-tab=circuit]")?.click()')
                page.evaluate('document.querySelector(".viewmode[data-mode=electronics]").click()')
                page.wait_for_function("document.querySelector('.viewmode[data-mode=electronics]').classList.contains('active') && !document.querySelector('#railFilter').hidden", timeout=ms)
                page.screenshot(path=str(args.out / f"{case['id']}.electronics.png"), timeout=240000)
                page.evaluate('document.querySelector(".viewmode[data-mode=robot]").click()')
        if not args.no_downloads:
            row["downloads"] = {}
            for kind, target in DOWNLOADS.items():
                t = time.time()
                with page.expect_download(timeout=ms) as dl: page.evaluate(f'document.querySelector("[data-dl={kind}]").click()')
                data = Path(dl.value.path()).read_bytes(); d = {"file": dl.value.suggested_filename, "bytes": len(data), "seconds": round(time.time() - t, 1)}
                if case["mode"] == "prompt" and target:
                    want = root / "examples" / case["example"] / target
                    if target.endswith(".zip"):
                        d["differs"] = compare_zip(data, want)[:8]
                        if d["differs"]: (args.out / f"{case['id']}.{kind}.zip").write_bytes(data)
                        d["same_as_example"] = not d["differs"]
                    elif kind == "urdf": d["same_as_example"] = canon(data) == canon(want.read_bytes())
                    elif kind == "schematic":
                        # a zip of the sheet as PDF and SVG: both equal the example's
                        with zipfile.ZipFile(io.BytesIO(data)) as z:
                            got = {n.rsplit("_schematic.", 1)[-1]: z.read(n) for n in z.namelist()}
                        d["same_as_example"] = got.get("svg") == (want.parent / "schematic.svg").read_bytes() and got.get("pdf") == (want.parent / "schematic.pdf").read_bytes()
                    elif target.endswith(".svg"): d["same_as_example"] = data == want.read_bytes()
                    else: d["same_as_example"] = None
                row["downloads"][kind] = d
                if not len(data): row["problems"].append(f"{kind} download is empty")
                if d.get("same_as_example") is False: row["problems"].append(f"{kind} differs from the example: {d.get('differs', '')}")
        heap = page.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null"); row["page_heap_mb"] = heap
    except Exception as e:
        row["problems"].append(f"{type(e).__name__}: {str(e)[:400]}")
        try: page.screenshot(path=str(args.out / f"{case['id']}.png"), timeout=10000)
        except Exception: pass
    row["page_errors"] = errors[:8]; row["external_requests"] = external[:8]; row["failed_responses"] = failed[:8]
    if errors: row["problems"].append(f"page errors: {errors[:2]}")
    if external: row["problems"].append(f"external requests: {external[:2]}")
    if failed: row["problems"].append(f"failed responses: {failed[:2]}")
    row["pass"] = not row["problems"]
    if ctx is not forge_ctx: ctx.close()
    else: page.close()
    return row


cases = [{"id": f.name, "example": f.name, "mode": "prompt", "prompt": (f / "prompt.txt").read_text()} for f in sorted((root / "examples").glob("[0-9][0-9]_*"))]
if not args.no_arduino:
    cases += [{"id": i, "example": e, "mode": "arduino", "must_match": m, "prompt": (root / "examples" / e / "prompt.txt").read_text()} for i, e, m in ARDUINO]
    cases += [{"id": i, "mode": "arduino", "prompt": p} for i, p in ARDUINO_TEXT]
cases += [{"id": "motion_ui", "mode": "motion", "prompt": ""}]
if args.only: keep = set(args.only.split(",")); cases = [c for c in cases if c["id"] in keep or c.get("example") in keep]
rows = []
with sync_playwright() as p:
    opts = {"headless": True, "args": ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
    if os.getenv("TTR_CHROMIUM"): opts["executable_path"] = os.environ["TTR_CHROMIUM"]
    browser = p.chromium.launch(**opts)
    for case in cases:
        row = motion_case(browser, case) if case["mode"] == "motion" else run(browser, case); rows.append(row)
        print(f"{'PASS' if row['pass'] else 'FAIL'} {row['case']:<24} generate {row.get('generate_s', '-')}s preview {row.get('preview_s', '-')}s {row.get('robot_name', '')}", flush=True)
        for problem in row["problems"]: print("     ", problem, flush=True)
        (args.out / "report.json").write_text(json.dumps({"rows": rows}, indent=2) + "\n")
    browser.close()
report = {"scope": "Static GitHub Pages build driven in headless Chromium (software GL), fresh tab per robot, third-party requests blocked. Timings depend on the machine.",
          "site_engine_sha256": hashlib.sha256((args.site / "browser-engine.js").read_bytes()).hexdigest(), "passed": sum(r["pass"] for r in rows), "total": len(rows), "rows": rows}
(args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
if args.update: (root / "examples/site_generation.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"{report['passed']}/{report['total']} passed; report: {args.out / 'report.json'}")
sys.exit(0 if report["passed"] == report["total"] else 1)
