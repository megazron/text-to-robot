"""Website reading options, in a real browser (Playwright, Chromium) on a built site.

    python scripts/check_reading.py <pages-dist>

1. With both options off, generating a robot makes no request off the site and loads neither byok.js nor embed.js.
2. "Your own model" set to Anthropic with a test key: the request goes to api.anthropic.com (answered here by a stub
   with a body plan), the robot is designed from real parts, the log says which path designed it, and the key is in no
   saved robot or share link.
3. The model returns junk: the local parser designs the robot and the log says so.
"""
import json
import socketserver
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pw_csp  # noqa: E402

pw_csp.install()   # the site keeps its real Content-Security-Policy in this check

site = Path(sys.argv[1]).resolve()
BASE = "/text-to-robot"
KEY = "sk-test-check-reading"
PLAN = {"locomotion": "multirotor", "count": 4, "arms": {"count": 0, "dof": 0, "reach_m": 0}, "effector": "none", "tools": [], "sensors": ["camera"],
        "payload_kg": 0, "budget_usd": 400, "size": "small", "task": "aerial photos of a field"}


class H(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split("?")[0]
        if path.startswith(BASE): path = path[len(BASE):] or "/"
        return str(site / path.lstrip("/"))

    def log_message(self, *a): pass


H.extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), partial(H))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_address[1]}"
problems = []


def wait_status(page, rx, timeout=240_000):
    page.wait_for_function(f"() => /{rx}/.test(document.querySelector('#status')?.textContent ?? '')", timeout=timeout)
    return page.eval_on_selector("#status", "e => e.textContent")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    external, scripts, sent = [], [], []
    reply = {"text": json.dumps(PLAN)}

    def route(r):
        u = r.request.url
        if u.startswith(origin) or u.startswith("data:") or u.startswith("blob:"):
            if u.endswith(".js"): scripts.append(u.rsplit("/", 1)[-1])
            return r.continue_()
        if u.startswith("https://api.anthropic.com/"):
            if r.request.method == "OPTIONS":
                return r.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST"})
            sent.append({"headers": r.request.headers, "body": json.loads(r.request.post_data or "{}")})
            msg = {"id": "msg_check", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "end_turn", "stop_sequence": None,
                   "content": [{"type": "text", "text": reply["text"]}], "usage": {"input_tokens": 1, "output_tokens": 1}}
            return r.fulfill(status=200, headers={"content-type": "application/json", "access-control-allow-origin": "*"}, body=json.dumps(msg))
        external.append(u); r.abort()

    ctx.route("**/*", route)
    page = ctx.new_page()
    page.goto(f"{origin}{BASE}/")
    page.wait_for_selector("#readingBox:not([hidden])", timeout=60_000)

    # 1: both off
    page.fill("#prompt", "a robot that waters my plants"); page.click("#genbtn")
    try: wait_status(page, "Designed by: the local task and object table")
    except Exception as e: problems.append(f"off: no designed-by line for the task table ({str(e)[:80]})")
    if external: problems.append(f"off: external requests {external[:3]}")
    if {"byok.js", "embed.js"} & set(scripts): problems.append(f"off: optional bundles loaded {scripts}")

    # 2: Anthropic with a key
    page.click("#byok summary")
    page.select_option("#byokKind", "anthropic"); page.fill("#byokKey", KEY); page.dispatch_event("#byokKey", "change")
    page.fill("#prompt", "something to take aerial photos of my farm"); page.click("#genbtn")
    log = wait_status(page, "Designed by: the Anthropic")
    if not sent: problems.append("byok: nothing sent to Anthropic")
    else:
        s = sent[-1]
        if s["body"].get("model") != "claude-opus-5-5": problems.append(f"byok: model {s['body'].get('model')}")
        if KEY not in (s["headers"].get("authorization", "") + s["headers"].get("x-api-key", "")): problems.append("byok: key not sent to the provider")
    if "model wrote a body plan" not in log: problems.append(f"byok: log {log[:200]}")
    saved = page.evaluate("localStorage.getItem('ttr.robots') ?? ''")
    if KEY in saved: problems.append("byok: key found in a saved robot")
    if KEY in page.evaluate("localStorage.getItem('ttr.reading') ?? ''"): problems.append("byok: key remembered without being asked")
    share = page.evaluate("(async () => ttrStatic.shareUrl(JSON.parse(localStorage.getItem('ttr.robots'))[0][1]))()")
    if KEY in share: problems.append("byok: key in a share link")
    if "byok.js" not in scripts: problems.append("byok: byok.js never loaded")
    if external: problems.append(f"byok: other external requests {external[:3]}")

    # 3: junk from the model
    reply["text"] = "I am not JSON"
    page.fill("#prompt", "a robot that waters my plants"); page.click("#genbtn")
    log = wait_status(page, "designed by the local parser instead")
    b.close()

print(json.dumps({"passed": not problems, "problems": problems, "requests_to_anthropic": len(sent)}, indent=1))
sys.exit(1 if problems else 0)
