"""Time Generate on the real website, cold and warm, on a desktop and on a throttled low-end profile.

Serves a static build (deploy/build-pages.sh) under /text-to-robot/ with the site's own Content-Security-Policy and Trusted Types,
opens it in headless Chromium and, for each prompt, measures in a fresh browser profile (nothing cached):

  preview_s   Generate pressed -> every part of the robot on screen (its wires as straight runs)
  routed_s    Generate pressed -> the 3D harness laid and swapped in

then the same prompt again in a new tab of the same profile (the persistent cache is warm). The main thread is watched the
whole time: a long task over 200 ms, a page error or a crashed tab is a failure. The low-end profile throttles the CPU 4x
(DevTools CPU throttling; Chromium applies it to the page's main thread and refuses it for workers, which the report records
as throttle_errors) and reports 2 GB of device memory, 4 cores and a touch screen, so the site plans one worker.

    deploy/build-pages.sh pages-dist
    python scripts/bench_site.py                                  (desktop; out/bench/desktop.json)
    python scripts/bench_site.py --profile lowend --only 02_arm_6dof,20_quadcopter
    python scripts/bench_site.py --site out/pages-before --label before

Exit code 1 if any case fails (no robot, a long task over 200 ms, a page error, a crash).
"""
import argparse, functools, http.server, json, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright
import pw_csp; pw_csp.install()

root = Path(__file__).resolve().parents[1]
CASES = ["02_arm_6dof", "12_mars_rover", "10_quadruped", "08_humanoid", "13_battle_mech", "18_arduino_car", "20_quadcopter", "14_iron_man_mark_43"]
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--site", type=Path, default=root / "pages-dist")
ap.add_argument("--only", default="", help="comma list of example folders (default: the eight timing prompts)")
ap.add_argument("--profile", choices=["desktop", "lowend"], default="desktop")
ap.add_argument("--no-warm", action="store_true", help="cold runs only")
ap.add_argument("--no-route", action="store_true", help="do not wait for the 3D harness")
ap.add_argument("--label", default="", help="name of this run in the report")
ap.add_argument("--query", default="", help="a query string for the site, e.g. workers=1")
ap.add_argument("--out", type=Path, default=root / "out/bench")
ap.add_argument("--timeout", type=int, default=2400, help="seconds allowed per robot")
ap.add_argument("--long-task-ms", type=int, default=200)
ap.add_argument("--software-compositing", action="store_true", help="the headless shell's default: the page composites in software and reads every WebGL frame back on its main thread")
args = ap.parse_args()
if not (args.site / "index.html").exists(): sys.exit(f"{args.site} has no index.html: run deploy/build-pages.sh first")
args.out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"


class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def translate_path(self, path):
        path = path.split("?")[0]
        return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(args.site)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_address[1]}"
url = f"{origin}{BASE}/" + (f"?{args.query}" if args.query else "")

# The main thread's long tasks (PerformanceObserver) and the worst gap between two timer ticks: both must stay under the limit.
WATCH = """(() => {
  window.__long = []; window.__gap = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch {}
  let last = performance.now();
  setInterval(() => { const now = performance.now(); window.__gap = Math.max(window.__gap, now - last - 50); last = now; }, 50);
})()"""
LOWEND = """(() => {
  for (const [k, v] of [['deviceMemory', 2], ['hardwareConcurrency', 4], ['maxTouchPoints', 5]]) Object.defineProperty(Navigator.prototype, k, { get: () => v, configurable: true });
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => /pointer:\\s*coarse/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q);
})()"""


def throttle(ctx, page, rate):
    """CPU throttling on the page and on every worker it starts, and the workers those start (DevTools throttles one target
    at a time: each worker is attached as it starts and throttled from then on)."""
    cdp = ctx.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": rate})
    auto = {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": False}
    cdp.send("Target.setAutoAttach", auto)
    n = [100]
    def to(sid, method, params):
        n[0] += 1; cdp.send("Target.sendMessageToTarget", {"sessionId": sid, "message": json.dumps({"id": n[0], "method": method, "params": params})})
    def attached(e, via=None):
        sid = e["sessionId"]
        if via is None:
            to(sid, "Emulation.setCPUThrottlingRate", {"rate": rate}); to(sid, "Target.setAutoAttach", auto); to(sid, "Runtime.runIfWaitingForDebugger", {})
        else:   # a worker's own worker: reached through its parent's session
            inner = lambda m, p: to(via, "Target.sendMessageToTarget", {"sessionId": sid, "message": json.dumps({"id": 1, "method": m, "params": p})})
            inner("Emulation.setCPUThrottlingRate", {"rate": rate}); inner("Runtime.runIfWaitingForDebugger", {})
        throttled.append(e["targetInfo"]["type"])
    def message(e):
        try: m = json.loads(e["message"])
        except Exception: return
        if m.get("method") == "Target.attachedToTarget": attached(m["params"], via=e["sessionId"])
        if "error" in m: throttle_errors.append(str(m["error"])[:120])   # a target that refused a command (throttling not supported there)
    cdp.on("Target.attachedToTarget", attached)
    cdp.on("Target.receivedMessageFromTarget", message)
    return cdp


throttled, throttle_errors = [], []


def wait_idle(page, ms):
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=ms)


def generate(page, prompt, ms, route):
    page.fill("#prompt", prompt)
    page.evaluate("""()=>{const b=document.querySelector('#genbtn');window.__started=false;window.__was=window.__ttr.robot;
      new MutationObserver(()=>{if(b.disabled)window.__started=true}).observe(b,{attributes:true,childList:true,subtree:true})}""")
    t = time.time(); page.click("#genbtn")
    page.wait_for_function("window.__started", timeout=60000); wait_idle(page, ms)
    page.wait_for_function("window.__ttr.robot!==window.__was && (window.__ttr.preview.ready || window.__ttr.preview.errors.length>0)", timeout=ms)
    # on screen: the frame with every part drawn and shown (two animation frames after it was drawn: a compositor that is
    # behind holds them back, so this waits for the picture, the same way for any version of the page)
    page.evaluate("() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))")
    out = {"preview_s": round(time.time() - t, 2)}
    if route:
        page.wait_for_function("window.__ttr.routing !== 'running'", timeout=ms)
        page.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0", timeout=ms)
        out["routed_s"] = round(time.time() - t, 2)
    st = page.evaluate("window.__ttr.preview"); out["parts"] = st["loaded"]
    if not st["ready"]: out["problem"] = f"preview incomplete: {st['errors'][:2]}"
    return out


def case(browser, name):
    prompt = (root / "examples" / name / "prompt.txt").read_text().strip()
    ms = args.timeout * 1000
    ctx = browser.new_context(viewport={"width": 1000, "height": 640}, has_touch=args.profile == "lowend")
    ctx.add_init_script(WATCH)
    if args.profile == "lowend": ctx.add_init_script(LOWEND)
    row = {"case": name, "problems": []}
    errors = []
    def run(label):
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("crash", lambda *_: errors.append("the tab crashed"))
        page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
        if args.profile == "lowend": throttle(ctx, page, 4)
        page.goto(url)
        page.wait_for_function("window.__ttr?.robot?.links.length>0", timeout=ms); wait_idle(page, ms)
        page.evaluate("window.__long = []; window.__gap = 0")
        r = generate(page, prompt, ms, not args.no_route)
        r["pool"] = page.evaluate("globalThis.ttrEnginePool?.() ?? null")
        r["times"] = page.evaluate("window.__ttrTimes ? { answered_ms: __ttrTimes.answered_ms, loaded_ms: __ttrTimes.loaded_ms, drawn_ms: __ttrTimes.drawn_ms } : null")
        r["long_task_ms"] = max(page.evaluate("window.__long") or [0]); r["timer_gap_ms"] = round(page.evaluate("window.__gap"))
        if r["long_task_ms"] > args.long_task_ms: row["problems"].append(f"{label}: a {r['long_task_ms']} ms long task on the main thread")
        if "problem" in r: row["problems"].append(f"{label}: {r.pop('problem')}")
        if args.profile == "lowend": r["throttled_targets"] = len(throttled); r["throttle_errors"] = sorted(set(throttle_errors))[:3]; throttled.clear(); throttle_errors.clear()
        row[label] = r
        # a visitor keeps the tab a while: let what it made reach the cache before the tab closes (not timed)
        page.evaluate("globalThis.ttrStatic?.idle?.(30000)")
        page.close()
    try:
        run("cold")
        if not args.no_warm: run("warm")
    except Exception as e:
        row["problems"].append(f"{type(e).__name__}: {str(e)[:300]}")
    if errors: row["problems"].append(f"page errors: {errors[:3]}")
    ctx.close()
    row["pass"] = not row["problems"]
    return row


cases = [c for c in (args.only.split(",") if args.only else CASES) if c]
report = {"label": args.label or args.site.name, "profile": args.profile, "site": str(args.site), "compositing": "software" if args.software_compositing else "gpu", "rows": []}
out = args.out / f"{args.label or args.profile}.json"
with sync_playwright() as p:
    # GPU compositing, as on any device with WebGL: the compositor takes the 3D view's frames on the GPU (SwiftShader here). The
    # headless shell's default composites in software and reads every WebGL frame back on the page's main thread, which
    # blocks it for as long as the frame takes to draw (scripts/bench_site.py --software-compositing measures that too).
    gpu = [] if args.software_compositing else ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-gpu-compositing"]
    browser = p.chromium.launch(args=["--enable-precise-memory-info", *gpu])
    for name in cases:
        row = case(browser, name)
        report["rows"].append(row)
        print(json.dumps(row), flush=True)
        out.write_text(json.dumps(report, indent=1))
    browser.close()
bad = [r["case"] for r in report["rows"] if not r["pass"]]
print(f"{len(report['rows']) - len(bad)}/{len(report['rows'])} passed; report in {out}")
sys.exit(1 if bad else 0)
