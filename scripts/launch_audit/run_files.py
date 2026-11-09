"""Generate a representative set on the site and press every download button; save the files for validation."""
import functools, http.server, json, os, sys, threading, time, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parents[2]; site = root / os.environ.get("SITE", "pages-dist"); out = root / "out/audit/files"; out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"
CASES = [("arm6", "Create a 6 DOF robotic arm with a parallel gripper", False), ("arm2", "Create a 2 DOF robotic arm", False), ("arm7", "Create a 7 DOF robotic arm with a two-finger gripper", False),
  ("scara", "Create a SCARA robot", False), ("scara_suction", "a scara arm for pick and place", False), ("diff", "Create a differential drive mobile robot", False), ("four", "Create a four-wheel robot", False),
  ("mecanum", "Create a mecanum-wheel robot", False), ("humanoid", "Create a small humanoid robot with a torso, head, two arms and two-finger grippers", False), ("gripper", "Create a two-finger parallel gripper", False),
  ("quad", "Create a quadruped robot", False), ("hex", "Build a six-legged reconnaissance spider-bot with a LiDAR turret, budget $1500", False),
  ("rover", "Design a Mars rover with four wheels and a 6 DOF sampling arm, RGB-D camera, budget $4000", False), ("mech", "Create a humanoid battle mech with two 7 DOF arms, a head camera and an IMU", False),
  ("walle", "Build WALL-E: a tracked trash-compactor robot with a telescoping neck, binocular eyes and two gripper arms", False), ("eva", "Build EVA, a sleek hovering egg-shaped droid with a visor and two floating arms", False),
  ("baymax", "Build Baymax, an inflatable healthcare companion robot", False), ("acar", "An Arduino 4WD obstacle avoiding car with an ultrasonic sensor", False), ("aarm", "A cheap Arduino robot arm with a claw", False),
  ("arm6_suction", "a 6 DOF arm with a suction cup", False), ("exosuit", "a robotic exoskeleton for the leg", False), ("arm_hobby", "a 6 DOF arm, 600 mm reach, 1 kg payload, under $300, Arduino", False),
  ("tiers_car", "an arduino car with four wheels", True), ("tiers_arm", "A cheap Arduino robot arm with a claw", True), ("tiers_walle", "WALL-E", True)]
only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
class Q(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def translate_path(self, path):
        path = path.split("?")[0]; return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(site)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{srv.server_address[1]}"; url = f"{origin}{BASE}/"
def idle(page, ms=900000): page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=ms)
report = {}
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1000, "height": 640}, accept_downloads=True, permissions=["clipboard-read", "clipboard-write"])
    errs = []
    page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)[:300])); page.on("console", lambda m: errs.append(m.text[:300]) if m.type == "error" else None)
    page.goto(url); page.wait_for_function("window.__ttr?.robot?.links.length>0", timeout=900000); idle(page)
    for cid, prompt, arduino in CASES:
        if only and cid not in only: continue
        d = out / cid; d.mkdir(exist_ok=True); errs.clear(); rec = {"prompt": prompt, "arduino": arduino, "downloads": {}}
        page.evaluate("""([p,a])=>{const sw=document.querySelector('#arduinoBtn'); if((sw.getAttribute('aria-checked')==='true')!==a) sw.click(); document.querySelector('#prompt').value=p;
          const b=document.querySelector('#genbtn');window.__started=false;new MutationObserver(()=>{if(b.disabled)window.__started=true}).observe(b,{attributes:true,childList:true,subtree:true})}""", [prompt, arduino])
        t = time.time(); page.click("#genbtn"); page.wait_for_function("window.__started", timeout=60000); idle(page)
        page.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=600000); rec["generate_s"] = round(time.time() - t, 1)
        rec["status"] = page.evaluate('document.querySelector("#status").textContent')[:1500]
        rec["tiers"] = page.evaluate("[...document.querySelectorAll('.tier')].map(n=>n.textContent)")
        tiers = range(len(rec["tiers"])) if arduino else [None]
        for ti in tiers:
            sub = d if ti is None else d / f"tier{ti}"; sub.mkdir(exist_ok=True)
            if ti is not None:
                page.evaluate(f"window.__was=__ttr.robot; document.querySelectorAll('.tier')[{ti}].click()")
                if ti != 0 or True:
                    try: page.wait_for_function("__ttr.robot!==window.__was", timeout=120000)
                    except Exception: pass
                page.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=600000)
            (sub / "robot_from_page.json").write_text(json.dumps(page.evaluate("__ttr.robot")))
            for kind in ["urdf", "xacro", "json", "bom", "cad", "ros2", "train"]:
                t = time.time()
                try:
                    with page.expect_download(timeout=900000) as dl: page.evaluate(f'document.querySelector("[data-dl={kind}]").click()')
                    target = sub / dl.value.suggested_filename; dl.value.save_as(target)
                    rec["downloads"][f"{ti}:{kind}"] = {"file": target.name, "bytes": target.stat().st_size, "s": round(time.time() - t, 1)}
                except Exception as e: rec["downloads"][f"{ti}:{kind}"] = {"error": str(e)[:300]}
            # share link: copy, open in a fresh tab, compare the robot
            page.evaluate('document.querySelector("[data-dl=share]").click()'); time.sleep(1.5)
            link = page.evaluate("navigator.clipboard.readText()"); rec[f"share_len_{ti}"] = len(link)
            p2 = ctx.new_page(); p2.goto(link)
            try:
                p2.wait_for_function("window.__ttr?.robot?.links.length>0 && !document.querySelector('#genbtn').disabled", timeout=600000)
                same = p2.evaluate("JSON.stringify(__ttr.robot)") == page.evaluate("JSON.stringify(__ttr.robot)")
                rec[f"share_same_{ti}"] = same; rec[f"share_status_{ti}"] = p2.evaluate('document.querySelector("#status").textContent')[:200]
            except Exception as e: rec[f"share_same_{ti}"] = f"error {e}"[:200]
            p2.close()
            page.evaluate('document.querySelector("[data-dl=launch]").click()'); time.sleep(0.5); rec[f"launch_{ti}"] = page.evaluate("navigator.clipboard.readText()")
        rec["errors"] = list(errs); report[cid] = rec
        (out / "report.json").write_text(json.dumps(report, indent=1))
        print(cid, rec["generate_s"], {k: v.get("bytes", v.get("error")) for k, v in rec["downloads"].items()}, "share", [rec.get(k) for k in rec if k.startswith("share_same")], "errs", len(errs), flush=True)
    b.close()
