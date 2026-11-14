"""Browser test of the Run tab: a robot's compiled sketch on the virtual ATmega328P drives the 3D model.

On the static website build (deploy/build-pages.sh pages-dist) in headless Chromium, under the site's real policy:
  car   the Arduino car's prompt; its sketch is the shipped compiled example; Run: the serial monitor shows the sketch's
        banner and "drive: forward", every motor gets the sketch's cruise duty, the wheels turn, the car moves forwards
        on the floor, the ultrasonic sensor pings the arena; Reset puts it back at the start
  arm   the Arduino arm's prompt; Run: the servos receive pulses through the emulated PCA9685 and the joints move
  swap  the robot shows first with straight-run wiring and its 3D harness replaces it in place: the harness's answer is held
        back (the route still runs; the page only gets it when the test lets it through) while the car's sketch runs in the
        Run tab, and then while the Power view shows a result in the Electronics view; when it lands the board keeps
        running from where it was (same board, its time and the car's pose go on), the tab, the 3D view and the camera
        stay, the Power view is not opened again and its result is solved again on the new wires
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
    # the robot shows with its wires as straight runs and is replaced in place when its 3D harness is laid, which opens this
    # tab again for the new robot: test the robot that stays on screen (on a slow machine the swap came mid-run)
    page.wait_for_function("window.__ttr.routing !== 'running'", timeout=1_800_000)
    page.wait_for_function("window.__ttr.preview.ready", timeout=600_000)

HOLD = """()=>{ if (window.__held) return; window.__held = true; const f = window.fetch;
  window.fetch = async (u, o) => { const held = !!window.__hold && typeof o?.body === "string" && o.body.includes('"route":true'); if (held) window.__routeAsked = true;
    const r = await f.call(window, u, o); if (held) { window.__routeIn = true; await new Promise((go) => { window.__letRoute = go; }); } return r; }; }"""

def design_held(page, prompt):
    """a design whose 3D harness answer waits until let_route(): the robot on screen keeps its straight runs till then"""
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy") && window.__ttr.routing !== "running"', timeout=1_800_000)
    page.evaluate(HOLD); page.evaluate("()=>{window.__hold=true; window.__routeIn=false; window.__routeAsked=false; window.__letRoute=null}")
    page.fill("#prompt", prompt)
    page.evaluate("""()=>{const b=document.querySelector('#genbtn');window.__started=false;new MutationObserver(()=>{if(b.disabled)window.__started=true}).observe(b,{attributes:true})}""")
    page.click("#genbtn"); page.wait_for_function("window.__started", timeout=60_000)
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=1_800_000)
    page.wait_for_function("window.__ttr.preview.ready", timeout=600_000)
    assert page.evaluate("window.__routeAsked"), "the page asked for the 3D harness through the held fetch"
    assert page.evaluate("window.__ttr.routing") == "running" and page.evaluate("window.__ttr.robot.metadata.design.wiring.laid") == "legacy", "the car shows first with straight runs"

def let_route(page):
    page.wait_for_function("!!(window.__routeIn && window.__letRoute)", timeout=1_800_000)
    page.evaluate("()=>{window.__hold=false; window.__before=window.__ttr.robot; window.__letRoute()}")
    page.wait_for_function("window.__ttr.routing === 'done' && window.__ttr.robot !== window.__before", timeout=600_000)
    assert page.evaluate("window.__ttr.robot.metadata.design.wiring.laid") != "legacy", "the routed car is on screen"

CAM = "[...window.__ttr.camera.position.toArray(), ...window.__ttr.controls.target.toArray()]"
def same_cam(a, b): return max(abs(x - y) for x, y in zip(a, b)) < 1e-4   # 0.1 mm: the orbit's damping decays for ever; a reframe moves it by centimetres
def still_cam(page):
    """the camera once the orbit's damping has settled after a drag: unchanged over 2 s (software GL draws few frames)"""
    seen = [page.evaluate(CAM)]
    for _ in range(200):
        page.wait_for_timeout(500); seen = (seen + [page.evaluate(CAM)])[-5:]
        if len(seen) == 5 and all(same_cam(seen[0], x) for x in seen): return seen[-1]
    raise AssertionError("the camera never settles")

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

    car = (root / "examples/18_arduino_car/prompt.txt").read_text()
    # ---- swap, Run: the 3D harness lands while the car's sketch runs
    design_held(page, car)
    open_run(page)
    page.evaluate('[...document.querySelectorAll("#simPanel button")].find(b=>b.textContent==="Run").click()')
    page.wait_for_function(f"{S}.running && {S}.ms > 4000", timeout=600_000)   # (the sketch drives off after its start-up pause)
    # (the camera stays where the Run tab put it, on the arena; a redraw of the robot would frame the robot instead)
    cam0 = still_cam(page); b0, serial0 = page.evaluate(S), page.evaluate('document.querySelector(".simserial").textContent')
    let_route(page)
    page.wait_for_function(f"{S}.ms > {b0['ms'] + 1000}", timeout=600_000)
    b1, cam1 = page.evaluate(S), page.evaluate(CAM)
    assert same_cam(cam0, cam1), f"the camera stays: {cam0} -> {cam1}"
    assert b1["opens"] == b0["opens"] and b1["running"], f"the board was opened again or stopped: {b0['opens']} -> {b1['opens']}, running {b1['running']}"
    assert page.evaluate('document.querySelector(".tab[data-tab=run]").classList.contains("active")'), "the Run tab stays open"
    serial1 = page.evaluate('document.querySelector(".simserial").textContent')
    assert serial0[-80:] in serial1, "the serial monitor goes on, not from the start"
    d0, d1 = math.hypot(b0["pose"]["x"], b0["pose"]["y"]), math.hypot(b1["pose"]["x"], b1["pose"]["y"])
    # the same board's clock went on (a new board starts at 0 ms with the car back at the start); the car had driven off
    # before, and it drives round the arena, so its distance from the start goes up and down
    assert d0 > 0.01 and b1["ms"] > b0["ms"] + 1000, f"the car drives on: {d0:.3f} m from the start at {b0['ms']:.0f} ms, then {d1:.3f} m at {b1['ms']:.0f} ms"
    page.evaluate('[...document.querySelectorAll("#simPanel button")].find(b=>b.textContent==="Pause").click()')
    report["swap_run"] = {"board_ms_before": round(b0["ms"]), "board_ms_after": round(b1["ms"]), "moved_before_m": round(d0, 3), "moved_after_m": round(d1, 3), "camera_kept": True}

    # ---- swap, Power: the harness lands while the Power view shows a result in the 3D Electronics view
    design_held(page, car)
    page.evaluate('document.querySelector(".dock-btn[data-jump=build]").click()')
    page.evaluate('document.querySelector(".tab[data-tab=circuit]").click()'); page.evaluate('document.querySelector(".tab[data-tab=circ-power]").click()')
    page.wait_for_function('[...document.querySelectorAll(".powersim button")].some(b=>b.textContent==="Simulate")', timeout=120_000)
    page.evaluate('document.querySelector(".viewmode[data-mode=electronics]").click()')
    page.wait_for_function("window.__ttr.viewMode === 'electronics' && !document.querySelector('#railFilter').hidden", timeout=600_000)
    page.evaluate('[...document.querySelectorAll(".powersim button")].find(b=>b.textContent==="Add a fault").click()')
    page.evaluate('[...document.querySelectorAll(".powersim button")].find(b=>b.textContent==="Simulate").click()')
    page.wait_for_function('window.__ttr.powerResult && document.querySelector(".powersim .psevents")', timeout=600_000)
    page.mouse.move(700, 300); page.mouse.down(); page.mouse.move(620, 330, steps=5); page.mouse.up()
    page.evaluate('()=>{const b=document.querySelector(".powersim"); window.__psNode=b.firstChild; window.__psResult=window.__ttr.powerResult}')
    cam0 = still_cam(page)
    let_route(page)
    page.wait_for_function("window.__ttr.powerResult && window.__ttr.powerResult !== window.__psResult", timeout=600_000)
    page.wait_for_function("!document.querySelector('#railFilter').hidden", timeout=600_000)
    cam1 = page.evaluate(CAM)
    kept = page.evaluate('()=>({node: document.querySelector(".powersim").firstChild === window.__psNode, faults: document.querySelectorAll(".powersim .psfault").length, power: document.querySelector(".tab[data-tab=circ-power]").classList.contains("active") && document.querySelector(".tab[data-tab=circuit]").classList.contains("active"), mode: window.__ttr.viewMode})')
    assert kept["node"] and kept["faults"] == 1, f"the Power view was opened again: {kept}"
    assert kept["power"] and kept["mode"] == "electronics", f"the open tab and 3D view stay: {kept}"
    assert same_cam(cam0, cam1), f"the camera stays: {cam0} -> {cam1}"
    report["swap_power"] = {**kept, "camera_kept": True}

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
