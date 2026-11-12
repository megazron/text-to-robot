"""Browser test of the Power view (Circuit tab): the robot's harness solved as a circuit in the page, on the static build.

On the static website build (deploy/build-pages.sh pages-dist) in headless Chromium, under the site's real policy:
  car    the Arduino car's prompt; Circuit > Power > Simulate: the rails table shows VBAT and the 5 V logic rail with the
         voltages the engine's electricalSim gives for the same robot (asked separately on the page), nothing trips
  short  a fault (VBAT shorted to ground): the main fuse opens, said as an error, and the plot over time is drawn
  life   Battery life: the hours shown are the engine's batteryLife for the same robot and scenario, and what ends it
  arm    the Arduino arm on a bench supply: Battery life is not offered (no battery)
Usage: python scripts/check_power.py [SITE_DIR]. Screenshots and a report go to out/power-check/.
"""
import http.server, json, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
import pw_csp; pw_csp.install()   # the site has no unsafe-eval: wait_for_function polls with evaluate instead

root = Path(__file__).resolve().parents[1]
out = root / "out/power-check"; out.mkdir(parents=True, exist_ok=True)
site = Path(sys.argv[1] if len(sys.argv) > 1 else root / "pages-dist").resolve()
assert (site / "index.html").is_file(), f"no site at {site}: run deploy/build-pages.sh pages-dist"
class Site(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(site), **k)
    def log_message(self, *a): pass
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Site); threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/"
report = {}
P = "#tab-circ-power"

def design(page, prompt):
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=900_000)
    page.fill("#prompt", prompt)
    page.evaluate("""()=>{const b=document.querySelector('#genbtn');window.__started=false;new MutationObserver(()=>{if(b.disabled)window.__started=true}).observe(b,{attributes:true})}""")
    page.click("#genbtn"); page.wait_for_function("window.__started", timeout=60_000)
    page.wait_for_function('!document.querySelector("#genbtn").disabled && !document.body.classList.contains("busy")', timeout=1_800_000)

def open_power(page):
    page.evaluate('document.querySelector(".dock-btn[data-jump=build]")?.click()')
    page.evaluate('document.querySelector(".tab[data-tab=circuit]").click()')
    page.evaluate('document.querySelector(".tab[data-tab=circ-power]").click()')
    page.wait_for_function(f'[...document.querySelectorAll("{P} button")].some(b=>b.textContent==="Simulate")', timeout=120_000)

def click(page, text):
    page.evaluate(f'[...document.querySelectorAll("{P} button")].find(b=>b.textContent==={json.dumps(text)}).click()')

def table(page, n=0):
    return page.evaluate(f'[...document.querySelectorAll("{P} .pstable")][{n}] ? [...[...document.querySelectorAll("{P} .pstable")][{n}].rows].map(r=>[...r.cells].map(c=>c.textContent)) : null')

def engine(page, path, options):
    return page.evaluate("""async ([p,o])=>{const r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({robot:window.__ttr.robot,options:o})});return r.json()}""", [path, options])

errors = []
with sync_playwright() as p:
    opts = {"headless": True, "args": ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
    if os.getenv("TTR_CHROMIUM"): opts["executable_path"] = os.environ["TTR_CHROMIUM"]
    browser = p.chromium.launch(**opts); page = browser.new_page(viewport={"width": 1400, "height": 1000})
    page.on("pageerror", lambda e: errors.append(str(e))); page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
    page.goto(url); page.wait_for_function("window.__ttr?.robot?.links.length>0", timeout=300_000)

    # ---- the car: the operating point
    design(page, (root / "examples/18_arduino_car/prompt.txt").read_text())
    open_power(page)
    click(page, "Simulate")
    page.wait_for_function(f'document.querySelector("{P} .pstable")', timeout=300_000)
    rows = {r[0]: r for r in table(page)[1:]}
    want = engine(page, "/api/engine/electrical-sim", {"scenario": "typical", "soc": 0.5})
    assert want["converged"], want.get("reason")
    for name, r in want["rails"].items():
        assert name in rows, (name, rows)
        assert rows[name][2] == f'{r["source_v"]:.2f}' and rows[name][3] == f'{r["min_v"]:.2f}', (name, rows[name], r)
    text = page.evaluate(f'document.querySelector("{P}").textContent')
    assert "Nothing trips" in text or not [e for e in want["events"] if e["severity"] == "error"], text[:400]
    page.screenshot(path=str(out / "car_operating_point.png"), full_page=True)
    report["car"] = {k: rows[k][1:] for k in rows}

    # ---- a short: the fuse opens
    click(page, "Add a fault")
    page.evaluate(f'(()=>{{const r=document.querySelector("{P} .psfault");r.children[0].value="short";r.children[0].dispatchEvent(new Event("change"));r.children[1].value="VBAT"}})()')
    click(page, "Simulate")
    page.wait_for_function(f'document.querySelector("{P} .psev.error") && document.querySelector("{P} .psplot")', timeout=300_000)
    ev = page.evaluate(f'[...document.querySelectorAll("{P} .psev.error")].map(e=>e.textContent)')
    assert any("fuse" in e and "opens" in e for e in ev), ev
    page.screenshot(path=str(out / "car_short.png"), full_page=True)
    report["short"] = ev[:3]
    page.evaluate(f'document.querySelector("{P} .psfault button").click()')   # remove the fault

    # ---- battery life
    click(page, "Battery life")
    page.wait_for_function(f'document.querySelector("{P} .pslife")', timeout=600_000)
    life = engine(page, "/api/engine/battery-life", {"scenario": "typical", "faults": []})
    assert life["ok"], life
    shown = page.evaluate(f'document.querySelector("{P} .pslife b").textContent')
    h = life["life_h"]; expect = f"{h:.1f} h" if h >= 2 else f"{round(h * 60)} min"
    assert shown == expect, (shown, expect)
    ends = page.evaluate(f'document.querySelector("{P} .pslife").nextElementSibling.textContent')
    assert life["ends"] == "empty" or life["ends"] in ends, (ends, life["ends"])
    page.screenshot(path=str(out / "car_battery_life.png"), full_page=True)
    report["life"] = {"shown": shown, "life_h": round(h, 3), "ends": life["ends"], "ends_at_soc": life["ends_at_soc"], "points": len(life["points"])}

    # ---- the arm on a supply: no battery life
    design(page, (root / "examples/19_arduino_arm/prompt.txt").read_text())
    open_power(page)
    assert not page.evaluate(f'[...document.querySelectorAll("{P} button")].some(b=>b.textContent==="Battery life")'), "a robot on a supply has no battery life"
    click(page, "Simulate")
    page.wait_for_function(f'document.querySelector("{P} .pstable")', timeout=300_000)
    report["arm"] = table(page)[1:]
    assert not errors, errors
    browser.close()
server.shutdown()
(out / "report.json").write_text(json.dumps(report, indent=1) + "\n")
print("PASS:", json.dumps(report)[:900])
