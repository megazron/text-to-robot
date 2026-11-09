"""Press every control on the site, on a desktop and a phone viewport; record what happened, console errors and failed requests."""
import functools, http.server, json, sys, threading, time, pathlib, re
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parents[2]; site = root / (sys.argv[1] if len(sys.argv) > 1 else "pages-dist"); out = root / "out/audit"; out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"
class Q(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def translate_path(self, path):
        path = path.split("?")[0]; return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(site))); threading.Thread(target=srv.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{srv.server_address[1]}"; url = f"{origin}{BASE}/"
results = []
def rec(view, control, ok, detail=""):
    results.append({"view": view, "control": control, "pass": bool(ok), "detail": str(detail)[:400]}); print(f"{'PASS' if ok else 'FAIL'} [{view}] {control}: {str(detail)[:200]}", flush=True)
def idle(p, ms=600000): p.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=ms)
def gen(p, prompt, ms=600000):
    p.evaluate("""p=>{const b=document.querySelector('#genbtn');window.__s=false;new MutationObserver(()=>{if(b.disabled)window.__s=true}).observe(b,{attributes:true,childList:true,subtree:true});window.__was=__ttr.robot;document.querySelector('#prompt').value=p}""", prompt)
    p.click("#genbtn"); p.wait_for_function("window.__s", timeout=30000); idle(p, ms)
    p.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=ms)
def active_pane(p): return p.evaluate("document.querySelector('.pane.active')?.dataset.section")
INIT = "window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true})}catch{}"
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for view, opts in [("desktop", {"viewport": {"width": 1280, "height": 800}}), ("phone", {**pw.devices["iPhone 13"], "accept_downloads": True})]:
        opts = {**opts, "accept_downloads": True, "permissions": ["clipboard-read", "clipboard-write"]}
        opts.pop("default_browser_type", None)
        ctx = b.new_context(**opts); p = ctx.new_page(); p.add_init_script(INIT)
        errors, failed, external = [], [], []
        p.on("pageerror", lambda e: errors.append("pageerror " + str(e)[:200])); p.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        p.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        p.on("requestfailed", lambda r: failed.append(f"failed {r.url} {r.failure}") if not r.url.startswith("blob:") else None)
        p.on("request", lambda r: external.append(r.url) if not r.url.startswith((origin, "data:", "blob:")) else None)
        popups = []; ctx.on("page", lambda pg: popups.append(pg))
        t = time.time(); p.goto(url)
        p.wait_for_function("window.__ttr?.robot?.links.length>0", timeout=600000); idle(p)
        p.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=600000)
        rec(view, "page load + default robot", True, f"{time.time()-t:.1f}s to the first robot ({p.evaluate('__ttr.robot.robot_name')}); long tasks max {p.evaluate('Math.max(0,...window.__long)')} ms")
        rec(view, "icons, manifest, favicon", all(p.evaluate(f"fetch('{u}').then(r=>r.ok)") for u in ["mark.svg", "manifest.webmanifest", "icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/social.png"]), "fetched")
        # dock
        for sec in ["arduino", "model", "build", "share", "design"]:
            p.click(f".dock-btn[data-jump={sec}]"); time.sleep(0.4)
            rec(view, f"dock: {sec}", active_pane(p) == sec, f"active pane {active_pane(p)}")
        # dial: keyboard turn and the core
        p.click(".dock-btn[data-jump=design]"); time.sleep(0.3)
        p.focus("#familyDial [aria-valuemin]") if p.query_selector("#familyDial [aria-valuemin]") else None
        before = p.evaluate("document.querySelector('#prompt').value")
        p.evaluate("document.querySelector('#prompt').value=''")
        p.keyboard.press("ArrowRight"); time.sleep(1.2)
        rec(view, "family dial: arrow key turns the ring and fills the prompt", p.evaluate("document.querySelector('#prompt').value") != "", p.evaluate("document.querySelector('#prompt').value"))
        # empty prompt
        p.evaluate("document.querySelector('#prompt').value=''"); p.click("#genbtn"); time.sleep(0.8)
        rec(view, "Generate with an empty prompt", True, "toast: " + p.evaluate("document.querySelector('#toast').textContent") + " | status: " + p.evaluate("document.querySelector('#status').textContent")[:80])
        # an example chip
        t = time.time(); p.evaluate("window.__s=false;const b=document.querySelector('#genbtn');new MutationObserver(()=>{if(b.disabled)window.__s=true}).observe(b,{attributes:true,childList:true,subtree:true})")
        p.click("#examples button:nth-child(2)"); p.wait_for_function("window.__s", timeout=30000); idle(p); p.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=600000)
        rec(view, "example chip 2 ('An obstacle avoiding robot car')", "robot" in p.evaluate("__ttr.robot.robot_name"), f"{p.evaluate('__ttr.robot.robot_name')} in {time.time()-t:.1f}s")
        # template chip
        tpl = p.evaluate("[...document.querySelectorAll('#templates button')].map(b=>b.textContent)")
        rec(view, "template chips listed", len(tpl) > 0, tpl)
        # generate an arm for the rest
        gen(p, "Create a 6 DOF robotic arm with a parallel gripper")
        # modify
        p.click(".dock-btn[data-jump=design]"); p.fill("#modify", "make the forearm longer")
        p.evaluate("window.__was=__ttr.robot"); p.click("#modbtn")
        try:
            p.wait_for_function("__ttr.robot!==window.__was && !document.querySelector('#modbtn').disabled", timeout=600000)
            diff = p.evaluate("document.querySelector('#diff').textContent")
            rec(view, "Modify: 'make the forearm longer'", "forearm" in diff or "reach" in diff, diff[:200])
        except Exception as e: rec(view, "Modify", False, e)
        # history
        p.click(".dock-btn[data-jump=model]"); p.click(".tab[data-tab=history]"); time.sleep(0.3)
        n = p.evaluate("document.querySelectorAll('#history .ver').length")
        if n > 1:
            p.evaluate("window.__was=__ttr.robot"); p.click("#history .ver:first-child"); time.sleep(1)
            rec(view, "History: open v1", p.evaluate("__ttr.robot!==window.__was"), f"{n} versions")
        else: rec(view, "History", False, f"{n} versions")
        # joints slider
        p.click(".tab[data-tab=joints]"); time.sleep(0.3)
        moved = p.evaluate("""()=>{const s=document.querySelector('#sliders input[type=range]');if(!s)return 'no slider';const lab=s.parentElement.querySelector('b').textContent;s.value=String((Number(s.min)+Number(s.max))/2+0.3);s.dispatchEvent(new Event('input'));return lab+' -> '+s.parentElement.querySelector('b').textContent}""")
        rec(view, "Joints: slider moves a joint", "->" in moved and moved.split(" -> ")[0] != moved.split(" -> ")[1], moved)
        # structure + inspector
        p.click(".tab[data-tab=structure]"); time.sleep(0.3); p.click("#tree .row:nth-child(3)"); time.sleep(0.4)
        rec(view, "Structure: tap a link opens the inspector", "Mass" in p.evaluate("document.querySelector('#tab-inspector').textContent"), p.evaluate("document.querySelector('#tab-inspector .insp-title')?.textContent"))
        # 3D tap
        vb = p.evaluate("(()=>{const r=document.querySelector('#viewport canvas').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
        p.evaluate("window.__ttr && (window.__sel0=document.querySelector('#tab-inspector .insp-title')?.textContent)")
        p.mouse.click(vb[0], vb[1]); time.sleep(0.6)
        rec(view, "3D view: tap a part", True, "inspector: " + str(p.evaluate("document.querySelector('#tab-inspector .insp-title')?.textContent")))
        # view hud
        for cb in ["showCollision", "showAxes", "showFrames"]:
            if p.is_visible(f"#{cb}"):
                p.check(f"#{cb}"); time.sleep(0.8); okc = p.evaluate("!!window.__ttr.robot"); p.uncheck(f"#{cb}"); time.sleep(0.5)
                rec(view, f"view: {cb}", okc and not [e for e in errors if "pageerror" in e], "toggled on and off")
            else: rec(view, f"view: {cb}", False, "not visible")
        cam0 = p.evaluate("__ttr.camera.position.toArray().map(x=>+x.toFixed(3))")
        p.mouse.move(vb[0], vb[1]); p.mouse.down(); p.mouse.move(vb[0] + 120, vb[1] + 40, steps=8); p.mouse.up(); time.sleep(0.5)
        cam1 = p.evaluate("__ttr.camera.position.toArray().map(x=>+x.toFixed(3))")
        rec(view, "3D view: drag orbits", cam0 != cam1, f"{cam0} -> {cam1}")
        if p.is_visible("#resetView"): p.click("#resetView"); time.sleep(0.5)
        rec(view, "view: Reset", p.evaluate("__ttr.camera.position.toArray().map(x=>+x.toFixed(3))") != cam1, "camera reframed")
        # build tabs
        p.click(".dock-btn[data-jump=build]"); time.sleep(0.3)
        rec(view, "Build: Summary", p.evaluate("document.querySelector('#costBig').textContent").startswith("$"), p.evaluate("document.querySelector('#costBig').textContent + ' ' + document.querySelector('#checksPill').textContent"))
        p.click(".tab[data-tab=bom]"); time.sleep(0.3)
        p.fill("#budget", "100"); time.sleep(1.5); t1 = p.evaluate("document.querySelector('#bomtotal').textContent")
        p.fill("#budget", "100000"); time.sleep(1.5); t2 = p.evaluate("document.querySelector('#bomtotal').textContent")
        rec(view, "Parts: budget field", "over" in t1 and "within" in t2, f"$100: {t1} | $100000: {t2}")
        p.click(".tab[data-tab=files]"); time.sleep(0.3)
        cad = p.evaluate("document.querySelector('[data-dl=cad] small').textContent")
        for kind in ["urdf", "xacro", "json", "bom", "cad", "ros2", "train"]:
            t = time.time()
            try:
                with p.expect_download(timeout=600000) as dl: p.click(f"[data-dl={kind}]")
                path = dl.value.path(); size = pathlib.Path(path).stat().st_size
                rec(view, f"download: {kind}", size > 0, f"{dl.value.suggested_filename} {size} bytes in {time.time()-t:.1f}s" + (f" (label '{cad}')" if kind == "cad" else ""))
                if kind == "json": jpath = path
            except Exception as e: rec(view, f"download: {kind}", False, e)
        p.click("[data-dl=launch]"); time.sleep(0.5)
        rec(view, "Copy launch cmd", "ros2 launch" in p.evaluate("navigator.clipboard.readText()"), p.evaluate("navigator.clipboard.readText()"))
        # import JSON (the file just downloaded)
        p.evaluate("window.__was=__ttr.robot")
        p.set_input_files("#robotFile", jpath); 
        try: p.wait_for_function("__ttr.robot!==window.__was", timeout=120000); rec(view, "Import JSON", True, p.evaluate("document.querySelector('#status').textContent")[:120])
        except Exception as e: rec(view, "Import JSON", False, e)
        bad = out / "bad.json"; bad.write_text('{"links": "nope"}')
        p.set_input_files("#robotFile", str(bad)); time.sleep(2)
        rec(view, "Import JSON: a bad file is refused with a message", "✗" in p.evaluate("document.querySelector('#status').textContent"), p.evaluate("document.querySelector('#status').textContent")[:120])
        # share
        p.click(".dock-btn[data-jump=share]"); time.sleep(0.3)
        if view == "phone":
            p.evaluate("window.__shared=null; navigator.share = async (d)=>{window.__shared=d}")
        p.click("[data-dl=share]"); time.sleep(1.5)
        link = p.evaluate("window.__shared?.url") if view == "phone" else p.evaluate("navigator.clipboard.readText()")
        rec(view, "Share this robot", bool(link) and "#robot=" in link, f"{len(link or '')} chars" + (" via navigator.share" if view == "phone" else " to the clipboard"))
        if link:
            p2 = ctx.new_page(); p2.goto(link)
            try:
                p2.wait_for_function("window.__ttr?.robot?.links.length>0 && !document.querySelector('#genbtn').disabled", timeout=600000)
                same = p2.evaluate("JSON.stringify(__ttr.robot.links.map(l=>l.name))") == p.evaluate("JSON.stringify(__ttr.robot.links.map(l=>l.name))")
                rec(view, "Share link opens the same robot in a new tab", same, p2.evaluate("document.querySelector('#status').textContent")[:100])
            except Exception as e: rec(view, "Share link opens", False, e)
            p2.close()
        try:
            with ctx.expect_page(timeout=15000) as pi: p.click("#publishBtn")
            pop = pi.value
            try: pop.wait_for_url(re.compile(r"github\.com"), timeout=20000)
            except Exception: pass
            rec(view, "Publish to gallery (opens a GitHub issue form)", "github.com/megazron/text-to-robot/issues/new" in pop.url or "github.com/login" in pop.url, pop.url[:160])
            pop.close()
        except Exception as e: rec(view, "Publish to gallery (opens a GitHub issue form)", False, "no window opened; the log says: " + p.evaluate("document.querySelector('#status').textContent")[:160])
        p.click("#loadGallery"); time.sleep(5)
        rec(view, "Show published designs (GitHub API)", True, p.evaluate("document.querySelector('#gallery').textContent")[:160])
        # arduino switch + capsule tag
        p.click(".dock-btn[data-jump=design]"); p.click("#arduinoBtn"); time.sleep(0.4)
        on = p.evaluate("document.querySelector('#arduinoBtn').getAttribute('aria-checked')"); tag = p.is_visible(".arduino-tag")
        gen(p, "an arduino car with four wheels")
        tiers = p.evaluate("[...document.querySelectorAll('.tier')].map(n=>n.textContent)")
        rec(view, "Arduino switch + Generate: price tiers", on == "true" and len(tiers) > 0, f"tag visible {tag}; tiers {tiers}")
        if len(tiers) > 1:
            p.evaluate("window.__was=__ttr.robot"); p.click(".tier:nth-child(2)")
            try: p.wait_for_function("__ttr.robot!==window.__was", timeout=600000); rec(view, "Arduino: choose tier 2", True, p.evaluate("__ttr.robot.robot_name"))
            except Exception as e: rec(view, "Arduino: choose tier 2", False, e)
        if p.is_visible(".arduino-tag"): p.click(".arduino-tag"); time.sleep(0.4)
        rec(view, "Arduino tag in the prompt bar turns it off", p.evaluate("document.querySelector('#arduinoBtn').getAttribute('aria-checked')") == "false", "")
        if view == "phone":
            g = p.evaluate("(()=>{const r=document.querySelector('#grabber').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
            top0 = p.evaluate("document.querySelector('#sheet').getBoundingClientRect().top")
            p.mouse.move(g[0], g[1]); p.mouse.down(); p.mouse.move(g[0], g[1] - 250, steps=10); p.mouse.up(); time.sleep(0.8)
            rec(view, "Sheet grabber drag", p.evaluate("document.querySelector('#sheet').getBoundingClientRect().top") != top0, f"top {top0} -> {p.evaluate('document.querySelector(\"#sheet\").getBoundingClientRect().top')}")
            # does the prompt bar overflow the screen?
            w = p.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            rec(view, "No horizontal overflow", w[0] <= w[1], w)
        try: p.screenshot(path=str(out / f"buttons_{view}.png"), timeout=240000)
        except Exception as e: print("screenshot skipped:", str(e)[:80])
        rec(view, "console errors", not errors, errors[:5])
        rec(view, "failed requests", not failed, failed[:5])
        rec(view, "requests to other sites", True, sorted(set(re.sub(r"\?.*", "", u) for u in external))[:6])
        ctx.close()
    b.close()
(out / f"buttons_{site.name}.json").write_text(json.dumps(results, indent=1))
