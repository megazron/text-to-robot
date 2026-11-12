"""Browser test of the Run tab: a robot's compiled sketch on the virtual ATmega328P drives the 3D model.

On the static website build (deploy/build-pages.sh pages-dist) in headless Chromium, under the site's real policy:
  car   the Arduino car's prompt; its sketch is the shipped compiled example; Run: the serial monitor shows the sketch's
        banner and "drive: forward", every motor gets the sketch's cruise duty, the wheels turn, the car moves forwards
        on the floor, the ultrasonic sensor pings the arena; Reset puts it back at the start
  arm   the Arduino arm's prompt; Run: the servos receive pulses through the emulated PCA9685 and the joints move
  other a robot whose sketch differs from every shipped one (the arm renamed in the Modify bar) says it cannot be compiled
        here and offers to load a .hex; the page never runs anything it was not given; a loaded .hex then runs
Usage: python scripts/check_sim.py [SITE_DIR]. Screenshots and a report go to out/sim-check/.
"""
import http.server, json, math, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
import pw_csp; pw_csp.install()   # the site has no unsafe-eval: wait_for_function polls with evaluate instead

root = Path(__file__).resolve().parents[1]
out = root / "out/sim-check"; out.mkdir(parents=True, exist_ok=True)
site = Path(sys.argv[1] if len(sys.argv) > 1 else root / "pages-dist").resolve()
assert (site / "index.html").is_file(), f"no site at {site}: run deploy/build-pages.sh pages-dist"
class Site(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(site), **k)
    def log_message(self, *a): pass
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Site); threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/"
S = "window.__ttr.sim"
report = {}

def design(page, prompt):
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=900_000)
    page.fill("#prompt", prompt)
    page.evaluate("""()=>{const b=document.querySelector('#genbtn');window.__started=false;new MutationObserver(()=>{if(b.disabled)window.__started=true}).observe(b,{attributes:true})}""")
    page.click("#genbtn"); page.wait_for_function("window.__started", timeout=60_000)
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=1_800_000)
    page.wait_for_function("window.__ttr.preview.ready", timeout=600_000)

def open_run(page):
    page.evaluate('document.querySelector(".dock-btn[data-jump=build]").click()')
    page.evaluate('document.querySelector(".tab[data-tab=run]").click()')
    page.wait_for_function(f'{S} || /cannot|No program|not an ATmega/.test(document.querySelector("#simPanel").textContent)', timeout=300_000)

def run_for(page, ms):
    page.evaluate('[...document.querySelectorAll("#simPanel button")].find(b=>b.textContent==="Run").click()')
    page.wait_for_function(f"{S}.running && {S}.ms > {ms}", timeout=600_000)
    page.evaluate('[...document.querySelectorAll("#simPanel button")].find(b=>b.textContent==="Pause").click()')
    return page.evaluate(S)

errors = []
with sync_playwright() as p:
    opts = {"headless": True, "args": ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
    if os.getenv("TTR_CHROMIUM"): opts["executable_path"] = os.environ["TTR_CHROMIUM"]
    browser = p.chromium.launch(**opts); page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e))); page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
    page.goto(url); page.wait_for_function("window.__ttr?.robot?.links.length>0", timeout=300_000)

    # ---- the car
    design(page, (root / "examples/18_arduino_car/prompt.txt").read_text())
    open_run(page)
    s0 = page.evaluate(S)
    assert s0 and s0["shipped"], f"the car's sketch is a shipped compiled example: {page.evaluate('document.querySelector(`#simPanel`).textContent')[:400]}"
    s = run_for(page, 4500)
    serial = page.evaluate('document.querySelector(".simserial").textContent')
    assert "arduino_car" in serial and "drive: forward" in serial, serial
    moved = math.hypot(s["pose"]["x"], s["pose"]["y"])
    assert moved > 0.2, f"the car moved {moved:.3f} m in {s['ms']:.0f} ms"
    assert s["sensor"]["pings"] > 20, s["sensor"]
    wheels = {k: v for k, v in s["joints"].items() if "wheel" in k}
    assert wheels and all(abs(v) > 3 for v in wheels.values()), f"the wheels turn: {wheels}"
    page.screenshot(path=str(out / "car_running.png"))
    report["car"] = {"board_ms": round(s["ms"]), "moved_m": round(moved, 3), "heading_rad": round(s["pose"]["th"], 3), "pings": s["sensor"]["pings"], "last_cm": s["sensor"]["last_cm"], "serial_tail": serial[-300:]}
    page.evaluate('[...document.querySelectorAll("#simPanel button")].find(b=>b.textContent==="Reset").click()')
    back = page.evaluate(S)
    assert back["ms"] == 0 and math.hypot(back["pose"]["x"], back["pose"]["y"]) == 0, back["pose"]

    # ---- the arm
    design(page, (root / "examples/19_arduino_arm/prompt.txt").read_text())
    open_run(page)
    a0 = page.evaluate(S); assert a0 and a0["shipped"], "the arm's sketch is a shipped compiled example"
    a = run_for(page, 4500)
    pulses = [x for x in a["servos"] if x["us"] is not None]
    assert len(pulses) == len(a["servos"]) and all(500 <= x["us"] <= 2500 for x in pulses), a["servos"]
    joints = {x["joint"]: a["joints"].get(x["joint"]) for x in a["servos"] if x["joint"]}
    assert any(abs(v or 0) > 0.2 for v in joints.values()), f"a joint moved: {joints}"
    page.screenshot(path=str(out / "arm_running.png"))
    report["arm"] = {"board_ms": round(a["ms"]), "servos": a["servos"]}

    # ---- a sketch that was not compiled here: said, not faked, and a .hex the user loads runs
    # the arm renamed in the Modify bar: its sketch's name and text change, so it is not the example's sketch
    page.evaluate('document.querySelector(".dock-btn[data-jump=design]").click()'); page.fill("#modify", "rename it desk_arm")
    page.evaluate("""()=>{window.__before=window.__ttr.robot}""")
    page.evaluate('document.querySelector("#modform").requestSubmit()')
    page.wait_for_function("window.__ttr.robot !== window.__before && window.__ttr.robot.robot_name === 'desk_arm' && window.__ttr.preview.ready", timeout=1_800_000)
    open_run(page)
    page.wait_for_function(f"{S} && {S}.shipped === false", timeout=300_000)
    text = page.evaluate('document.querySelector("#simPanel").textContent')
    st = page.evaluate(S)
    assert st and not st["shipped"], f"the renamed arm's sketch is not a shipped one: {text[:300]}"
    assert "cannot compile" in text and "Load a .hex" in text and "desk_arm" in text, text[:400]
    assert page.evaluate('[...document.querySelectorAll("#simPanel button")].find(b=>b.textContent==="Run").disabled'), "Run stays off without a program"
    page.screenshot(path=str(out / "not_compiled.png"))
    # the user compiles it and loads the .hex: the arm example's compiled sketch has the same pins, so it drives the servos
    index = json.loads((root / "apps/web/public/firmware/index.json").read_text())
    hexfile = next(root / "apps/web/public" / r["hex"] for r in index["sketches"].values() if r["example"] == "19_arduino_arm")
    page.set_input_files('#simPanel input[type=file]', str(hexfile))
    page.wait_for_function('!([...document.querySelectorAll("#simPanel button")].find(b=>b.textContent==="Run").disabled)', timeout=60_000)
    loaded = run_for(page, 3000)
    assert all(x["us"] is not None for x in loaded["servos"]), loaded["servos"]
    report["other"] = {"said": text[:200], "loaded_hex_board_ms": round(loaded["ms"]), "pulses_us": [round(x["us"]) for x in loaded["servos"]]}
    assert not errors, errors
    browser.close()
server.shutdown()
(out / "report.json").write_text(json.dumps(report, indent=1) + "\n")
print("PASS:", json.dumps({k: (v if k != "arm" else {"board_ms": v["board_ms"]}) for k, v in report.items()})[:800])
