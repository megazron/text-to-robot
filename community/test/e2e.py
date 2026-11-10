"""The community board end to end, all local: the Worker under `wrangler dev` on a local D1, the real static site, and
Chromium. Turnstile uses Cloudflare's documented test keys (always pass), so no secret is needed.

Design a robot, share it anonymously (the form shows exactly what is posted), see it in the feed, open it, report it,
delete it as the owner from the admin page, post again and delete that one with the private link, then stop the server
and check the site says the community is offline and still designs robots.

    deploy/build-pages.sh pages-dist          (from the repo root)
    cd community && npm ci && python3 test/e2e.py      (screenshots in out/community-e2e/)
"""
import argparse, functools, http.server, json, os, shutil, signal, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
try:
    import pw_csp  # the site's CSP has no 'unsafe-eval': wait_for_function polls with evaluate instead (scripts/pw_csp.py)
    pw_csp.install()
except ImportError:
    pass

here = Path(__file__).resolve().parent
community = here.parent
root = community.parent
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--site", type=Path, default=root / "pages-dist")
ap.add_argument("--out", type=Path, default=root / "out/community-e2e")
ap.add_argument("--port", type=int, default=8788)
ap.add_argument("--headed", action="store_true")
args = ap.parse_args()
if not (args.site / "index.html").exists(): sys.exit(f"{args.site} has no index.html: run deploy/build-pages.sh first")
args.out.mkdir(parents=True, exist_ok=True)

ADMIN = "local-e2e-admin-token-" + os.urandom(16).hex()
TEST_SECRET = "1x0000000000000000000000000000000AA"   # always passes
TEST_SITEKEY = "1x00000000000000000000AA"            # always passes
API = f"http://127.0.0.1:{args.port}"
BASE = "/text-to-robot"
results = []


def step(name):
    print(f"  {name}", flush=True)
    results.append(name)


# ---------------------------------------------------------------- the Worker, on a fresh local D1
state = Path(tempfile.mkdtemp(prefix="ttr-community-"))
env = {**os.environ, "WRANGLER_SEND_METRICS": "false", "CI": os.environ.get("CI", "1")}
wrangler = [str(community / "node_modules/.bin/wrangler")]
subprocess.run(wrangler + ["d1", "migrations", "apply", "DB", "--local", "--persist-to", str(state)], cwd=community, env=env, check=True, capture_output=True)
log = open(args.out / "wrangler.log", "w")
worker = subprocess.Popen(wrangler + ["dev", "--ip", "127.0.0.1", "--port", str(args.port), "--persist-to", str(state),
                                      "--var", f"TURNSTILE_SECRET:{TEST_SECRET}", "--var", f"ADMIN_TOKEN:{ADMIN}", "--var", "TURNSTILE_HOSTNAMES:"],
                          cwd=community, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def stop_worker():
    if worker.poll() is None:
        os.killpg(worker.pid, signal.SIGTERM)
        try: worker.wait(10)
        except subprocess.TimeoutExpired: os.killpg(worker.pid, signal.SIGKILL)


for _ in range(120):
    try:
        if json.load(urllib.request.urlopen(API + "/", timeout=2)).get("ok"): break
    except Exception: time.sleep(0.5)
else:
    stop_worker(); sys.exit("wrangler dev did not start; see " + str(args.out / "wrangler.log"))


def api(path, method="GET", headers=None):
    r = urllib.request.Request(API + path, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(r) as res: return res.status, json.load(res)
    except urllib.error.HTTPError as e: return e.code, json.load(e)


# ---------------------------------------------------------------- the site, with community.json pointing at it
config = {"api": API, "turnstileSiteKey": TEST_SITEKEY}
# the built page's content security policy names the board's origin (scripts/csp.ts); make one for this local API
index_html = (args.site / "index.html").read_bytes()
if (root / "scripts/csp.ts").exists():
    (state / "community.json").write_text(json.dumps(config))
    (state / "index.html").write_bytes(index_html)
    subprocess.run(["node", str(root / "scripts/csp.ts"), "--write", str(state / "index.html"), "--community", str(state / "community.json")], cwd=root, check=True)
    index_html = (state / "index.html").read_bytes()


class Site(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.split("?")[0] in (f"{BASE}/", f"{BASE}/index.html"):
            self.send_response(200); self.send_header("Content-Type", "text/html"); self.send_header("Content-Length", str(len(index_html))); self.end_headers(); self.wfile.write(index_html)
            return
        if self.path.split("?")[0] == f"{BASE}/community.json":
            body = json.dumps(config).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        super().do_GET()
    def translate_path(self, path):
        path = path.split("?")[0]
        return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)


site = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Site, directory=str(args.site)))
threading.Thread(target=site.serve_forever, daemon=True).start()
URL = f"http://localhost:{site.server_address[1]}{BASE}/"


def wait_robot(page, timeout=240_000):
    page.wait_for_function("() => window.__ttr && window.__ttr.robot && !document.body.classList.contains('busy')", timeout=timeout)
    return page.evaluate("() => window.__ttr.robot.robot_name")


def share(page, title, tags=""):
    page.click('.dock-btn[data-jump="share"]')
    page.click("#shareBlog")
    dlg = page.locator(".cm-dialog")
    expect(dlg.locator(".cm-preview .cm-card")).to_be_visible()
    dlg.locator(".cm-field input").first.fill(title)
    dlg.locator(".cm-field textarea").fill("Made on the site. Docs: https://github.com/megazron/text-to-robot")
    dlg.locator(".cm-field input").nth(1).fill(tags)
    return dlg


failed = None
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(viewport={"width": 1360, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # any content security policy violation fails the test
        ctx.add_init_script("document.addEventListener('securitypolicyviolation', (e) => console.error('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI))")
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and m.text.startswith("CSP violation") else None)
        to_api = []
        ctx.on("request", lambda r: to_api.append(f"{r.method} {r.url}") if r.url.startswith(API) else None)
        page.goto(URL)
        name = wait_robot(page)
        step(f"designed a robot: {name}")
        expect(page.locator('.dock-btn[data-jump="community"]')).to_be_visible()
        assert page.locator("#publishBtn").is_hidden(), "the GitHub gallery button gives way to the community board"

        # nothing was sent before the button: the server has no posts and the page made no request to it
        assert api("/posts")[1]["posts"] == [] and to_api == [], to_api

        dlg = share(page, "E2E arm", "arm, e2e")
        prev = dlg.locator(".cm-preview .cm-card")
        expect(prev.locator(".cm-name")).to_have_text("Anonymous")
        expect(prev.locator(".cm-title")).to_have_text("E2E arm")
        expect(dlg.locator(".cm-privacy")).to_contain_text("No login, email or IP address")
        assert page.evaluate("() => document.querySelector('.cm-preview img').naturalWidth") == 480, "the preview shows the real picture"
        page.screenshot(path=str(args.out / "share-form.png"))
        assert api("/posts")[1]["posts"] == [], "opening the form posts nothing"
        assert to_api == [], f"the page talked to the server before Post publicly: {to_api}"
        step("share form shows exactly what will be posted, with the privacy note; nothing sent yet")

        dlg.locator(".cm-primary").click()
        link = dlg.locator(".cm-delete-link")
        expect(link).to_be_visible(timeout=60_000)
        delete_link_1 = link.input_value()
        assert "#community-delete=" in delete_link_1
        page.screenshot(path=str(args.out / "posted.png"))
        dlg.locator(".cm-primary", has_text="Done").click()
        posts = api("/posts")[1]["posts"]
        assert len(posts) == 1 and posts[0]["name"] is None and posts[0]["tags"] == ["arm", "e2e"], posts
        first = posts[0]
        step(f"posted anonymously ({first['id']}), private delete link shown once")

        page.click('.dock-btn[data-jump="community"]')
        card = page.locator(f'.cm-card[data-id="{first["id"]}"]')
        expect(card).to_be_visible(timeout=30_000)
        expect(card.locator(".cm-name")).to_have_text("Anonymous")
        expect(card.locator(".cm-desc a")).to_have_attribute("rel", "nofollow ugc noopener")
        page.wait_for_function("id => { const i = document.querySelector(`.cm-card[data-id=\"${id}\"] img`); return i && i.complete && i.naturalWidth > 0; }", arg=first["id"])
        page.screenshot(path=str(args.out / "feed.png"))
        step("the post is in the feed with its picture, Anonymous, tags and a nofollow link")

        card.locator(".cm-open").click()
        page.wait_for_load_state()
        opened = wait_robot(page)
        assert opened == name, (opened, name)
        step(f"Open this design loaded the same robot ({opened})")

        page.click('.dock-btn[data-jump="community"]')
        card = page.locator(f'.cm-card[data-id="{first["id"]}"]')
        card.locator(".cm-report").click()
        rep = page.locator(".cm-dialog")
        rep.locator("textarea").fill("e2e report")
        rep.locator(".cm-primary").click()
        expect(rep.locator(".cm-note")).to_contain_text("Thanks", timeout=60_000)
        rep.locator(".cm-ghost").click()
        reports = api("/admin/reports", headers={"Authorization": f"Bearer {ADMIN}"})[1]["reports"]
        assert [r["post_id"] for r in reports] == [first["id"]] and reports[0]["reason"] == "e2e report", reports
        step("reported it (the owner sees the report)")

        # the owner's page, served by the Worker
        admin = ctx.new_page()
        admin.on("dialog", lambda d: d.accept())
        admin.goto(API + "/admin")
        admin.fill("#token", ADMIN)
        admin.click("#signin")
        acard = admin.locator(f'.card[data-id="{first["id"]}"]')
        expect(acard).to_be_visible()
        expect(acard).to_contain_text("1 report")
        expect(admin.locator("#reports")).to_contain_text("e2e report")
        admin.wait_for_function("id => { const i = document.querySelector(`.card[data-id=\"${id}\"] img`); return i && i.complete && i.naturalWidth > 0; }", arg=first["id"])
        admin.screenshot(path=str(args.out / "admin.png"), full_page=True)
        acard.locator("button", has_text="Delete").click()
        expect(admin.locator("#msg")).to_contain_text("Deleted")
        assert api(f"/posts/{first['id']}")[0] == 404
        assert api("/posts")[1]["posts"] == []
        step("deleted it as the owner from the admin page")

        # second post, removed by its poster with the private link
        page.goto(URL)
        wait_robot(page)
        dlg = share(page, "E2E arm again")
        dlg.locator(".cm-field input").nth(2).fill("Tester")
        dlg.locator(".cm-primary").click()
        expect(dlg.locator(".cm-delete-link")).to_be_visible(timeout=60_000)
        delete_link_2 = dlg.locator(".cm-delete-link").input_value()
        dlg.locator(".cm-primary", has_text="Done").click()
        second = api("/posts")[1]["posts"][0]
        assert second["name"] == "Tester"
        step(f"posted again with a display name ({second['id']})")

        page.goto(delete_link_2)
        ddlg = page.locator(".cm-dialog", has_text="Delete your post")
        expect(ddlg).to_be_visible(timeout=60_000)
        assert "community-delete" not in page.url, "the token leaves the address bar at once"
        ddlg.locator(".cm-danger").click()
        expect(ddlg.locator(".cm-note")).to_contain_text("Deleted", timeout=30_000)
        assert api(f"/posts/{second['id']}")[0] == 404
        step("deleted it with the private delete link")

        # the server goes away: the site still works and says so
        stop_worker()
        for _ in range(60):
            try: urllib.request.urlopen(API + "/", timeout=2); time.sleep(0.5)
            except Exception: break
        else: raise AssertionError("the Worker is still answering after it was stopped")
        page.goto(URL)
        wait_robot(page)
        page.click('.dock-btn[data-jump="community"]')
        expect(page.locator("#communityFeed .cm-note")).to_contain_text("offline", timeout=30_000)
        page.screenshot(path=str(args.out / "offline.png"))
        page.fill("#prompt", "Create a 2 DOF pan tilt")
        page.click("#genbtn")
        page.wait_for_function("n => window.__ttr.robot && window.__ttr.robot.robot_name !== n && !document.body.classList.contains('busy')", arg=name, timeout=240_000)
        step("with the server down the feed says the community is offline and the site still designs robots")

        # with no server configured nothing about the board shows
        config["api"] = ""
        page.goto(URL)
        wait_robot(page)
        assert page.locator('.dock-btn[data-jump="community"]').is_hidden() and page.locator("#shareBlog").is_hidden()
        assert page.locator("#publishBtn").is_visible()
        step("with community.json empty the feature is hidden")
        assert not errors, errors
        browser.close()
except Exception as e:
    failed = e
    raise
finally:
    stop_worker()
    site.shutdown()
    shutil.rmtree(state, ignore_errors=True)
    (args.out / "report.json").write_text(json.dumps({"ok": failed is None, "steps": results, "error": repr(failed) if failed else None}, indent=2))
print(f"community e2e: {len(results)} steps passed; screenshots in {args.out}")
