"""Hostile input against the real website in Chromium: share links and robot files carrying script payloads, a deflate bomb
in a share link, a robot name that would break out of generated files, and the site framed by another page.

Passes when no payload runs (no dialog, no injected element, no global set), payload text shows up as text, the bad name
and the bomb are refused with a message, the framed copy only offers a link, and the page logs no CSP or Trusted Types
violation. docs/SECURITY_AUDIT.md lists the findings these payloads come from.

    deploy/build-pages.sh pages-dist
    python scripts/check_xss.py               (report in out/xss-check/report.json)
"""
import argparse, base64, copy, functools, http.server, json, os, sys, threading, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright
import pw_csp; pw_csp.install()   # the site has no unsafe-eval: wait_for_function polls with evaluate instead

root = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--site", type=Path, default=root / "pages-dist")
ap.add_argument("--out", type=Path, default=root / "out/xss-check")
ap.add_argument("--timeout", type=int, default=240, help="seconds to wait for a robot to open")
args = ap.parse_args()
if not (args.site / "index.html").exists(): sys.exit(f"{args.site} has no index.html: run deploy/build-pages.sh first")
args.out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"
MARK = "__ttrXss"
PAYLOADS = [f'<img src=x onerror="window.{MARK}=1">', f'"><svg onload="window.{MARK}=2">', f"<script>window.{MARK}=3</script>",
            f'<a href="javascript:window.{MARK}=4">x</a>', f"<iframe srcdoc=\"<script>parent.{MARK}=5</script>\"></iframe>"]


class Site(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def translate_path(self, path):
        path = path.split("?")[0]
        return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)


def serve(handler):
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, f"http://127.0.0.1:{s.server_address[1]}"


def share(robot) -> str:
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    raw = c.compress(json.dumps(robot).encode()) + c.flush()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


base_robot = json.loads((root / "examples/01_arm_2dof/robot.json").read_text())
hostile = copy.deepcopy(base_robot)
d = hostile["metadata"]["design"]
d["summary"] = PAYLOADS[0]
d["joints"][0]["required_nm"] = PAYLOADS[1]
d["joints"][0]["margin"] = PAYLOADS[2]
d["checks"][0]["name"] = PAYLOADS[3]
d["checks"][0]["detail"] = PAYLOADS[4]
d["printed"][0]["name"] = PAYLOADS[0]
d.setdefault("assumptions", []).append(PAYLOADS[1])
d.setdefault("performance", {})[PAYLOADS[2]] = PAYLOADS[0]
bad_name = copy.deepcopy(base_robot)
bad_name["robot_name"] = 'x"""\nimport os; os.system("id")\n""" ' + PAYLOADS[0]
bomb = zlib.compressobj(9, zlib.DEFLATED, -15)
bomb_raw = bomb.compress(b"[" + b" " * (64 * 1024 * 1024)) + bomb.flush()
bomb_hash = base64.urlsafe_b64encode(bomb_raw).decode().rstrip("=")

site, origin = serve(functools.partial(Site, directory=str(args.site)))
url = f"{origin}{BASE}/"
report, fail = {}, []
GUARD = ("addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`));"
         f"Object.defineProperty(window, '{MARK}', {{ set(v) {{ console.error('XSS payload ran: ' + v); }}, get() {{ return undefined; }} }});")


def page_for(browser, name):
    ctx = browser.new_context(viewport={"width": 1000, "height": 700}, accept_downloads=True)
    page = ctx.new_page()
    errors, dialogs = [], []
    page.add_init_script(GUARD)
    page.on("pageerror", lambda e: errors.append(str(e)[:300]))
    page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
    page.on("dialog", lambda dl: (dialogs.append(dl.message), dl.dismiss()))
    page.route("**/*", lambda r: r.continue_() if r.request.url.startswith((origin, "data:", "blob:")) else (errors.append("external: " + r.request.url), r.abort()))
    report[name] = {"errors": errors, "dialogs": dialogs}
    return ctx, page, errors, dialogs


def injected(page):
    return page.evaluate("""() => ({
      imgs: document.querySelectorAll('img[src$="/x"], img[src="x"]').length,
      svgOnload: [...document.querySelectorAll('svg')].filter(s => s.hasAttribute('onload')).length,
      scripts: [...document.querySelectorAll('script')].filter(s => !s.src && s.type !== 'importmap').length,
      jsLinks: [...document.querySelectorAll('a')].filter(a => /^javascript:/i.test(a.getAttribute('href') || '')).length,
      iframes: document.querySelectorAll('iframe').length,
    })""")


with sync_playwright() as p:
    opts = {"headless": True, "args": ["--no-sandbox"]}
    if os.getenv("TTR_CHROMIUM"): opts["executable_path"] = os.environ["TTR_CHROMIUM"]
    browser = p.chromium.launch(**opts)

    # 1. a share link whose design record is full of markup: shown as text, never run
    ctx, page, errors, dialogs = page_for(browser, "share_link_payloads")
    page.goto(f"{url}#robot={share(hostile)}")
    page.wait_for_function("window.__ttr && window.__ttr.robot", timeout=args.timeout * 1000)
    page.click('.dock-btn[data-jump="build"]'); page.click('.tab[data-tab="bom"]')
    page.wait_for_function("document.querySelector('#bom .design')", timeout=args.timeout * 1000)
    text = page.inner_text("#bom")
    report["share_link_payloads"].update(injected=injected(page), payload_as_text=all(x.split(" ")[0] in text for x in PAYLOADS[:3]))
    if any(injected(page).values()): fail.append(f"share link: injected elements {injected(page)}")
    if not report["share_link_payloads"]["payload_as_text"]: fail.append("share link: payload text not shown as text")
    page.click('.dock-btn[data-jump="model"]'); page.click('.tab[data-tab="inspector"]')
    ctx.close()

    # 2. an imported file whose robot name would close a Python docstring and open markup: refused with a reason
    ctx, page, errors, dialogs = page_for(browser, "import_bad_name")
    page.goto(url)
    page.wait_for_function("window.__ttr && window.__ttr.robot", timeout=args.timeout * 1000)
    bad_file = args.out / "bad_name.json"; bad_file.write_text(json.dumps(bad_name))
    page.set_input_files("#robotFile", str(bad_file))
    page.wait_for_function("document.querySelector('#status').textContent.includes('not a valid identifier')", timeout=60000)
    status = page.inner_text("#status")
    report["import_bad_name"].update(status=status[:300], injected=injected(page))
    errors[:] = [e for e in errors if "Failed to load resource" not in e]   # the refused import answers 400
    if any(injected(page).values()): fail.append(f"import: injected elements {injected(page)}")
    proto = page.evaluate("""async () => { const f = new File(['{"__proto__":{"polluted":1},"links":[],"joints":[]}'], 'p.json', {type:'application/json'});
      const dt = new DataTransfer(); dt.items.add(f); const i = document.querySelector('#robotFile'); i.files = dt.files; i.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 1500)); return ({}).polluted === undefined; }""")
    report["import_bad_name"]["prototype_clean"] = proto
    if not proto: fail.append("import: prototype polluted")
    errors[:] = [e for e in errors if "Failed to load resource" not in e]
    ctx.close()

    # 3. a share link that unpacks to 64 MB: refused, the page keeps working
    ctx, page, errors, dialogs = page_for(browser, "deflate_bomb")
    page.goto(f"{url}#robot={bomb_hash}")
    page.wait_for_function("document.querySelector('#status').textContent.includes('damaged')", timeout=args.timeout * 1000)
    page.wait_for_function("window.__ttr && window.__ttr.robot", timeout=args.timeout * 1000)
    report["deflate_bomb"].update(link_chars=len(bomb_hash), status=page.inner_text("#status")[:200])
    ctx.close()

    # 4. another page frames the site: the frame offers a link instead of the app (clickjacking)
    ctx, page, errors, dialogs = page_for(browser, "framed")
    page.goto(f"{origin}{BASE}/robotkit.js")   # any page on another path; the frame is what matters
    page.set_content(f'<iframe src="{url}" width="800" height="400"></iframe>')
    frame = page.frame_locator("iframe")
    frame.locator("p.framed a").wait_for(timeout=60000)
    report["framed"]["link"] = frame.locator("p.framed a").inner_text()
    errors[:] = [e for e in errors if "does not run inside a frame" not in e]
    ctx.close()
    browser.close()
site.shutdown()

for name, r in report.items():
    if r["errors"]: fail.append(f"{name}: page errors {r['errors'][:3]}")
    if r["dialogs"]: fail.append(f"{name}: dialogs {r['dialogs'][:3]}")
(args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=1)[:3000])
if fail: sys.exit("FAIL: " + "; ".join(fail))
print("PASS: no payload ran, hostile names and the bomb were refused, the framed copy offers only a link, no CSP violations")
