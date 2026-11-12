"""Build from my parts on the real website: the "My parts" picker, end to end.

Serves the static GitHub Pages build under /text-to-robot/ and drives it in Chromium with third-party requests blocked:
opens My parts in the Create pane, types a parts list, adds a part from the catalog search, removes it, adds a line it
cannot recognise (it must stay listed with suggestions), presses Find robots, checks the option cards ("uses n/m of your
parts, needs +$x"), lets the best one design, then checks the parts list marks "you have it" / "to buy", the shopping
list, the sketch download (pins of the user's parts) and the prompt bar route ("I have ..."). Screenshots go to the out
folder (the thumbnails in apps/web/public/parts/ come from --thumbs).

    deploy/build-pages.sh pages-dist
    python scripts/check_parts.py                 (report and screenshots in out/parts-check/)
    python scripts/check_parts.py --thumbs        (also renders one option card thumbnail per kind)

Exit code 1 on any failed step or page error.
"""
import argparse, functools, http.server, json, os, re, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright
import pw_csp; pw_csp.install()   # the site has no unsafe-eval: wait_for_function polls with evaluate instead

root = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--site", type=Path, default=root / "pages-dist")
ap.add_argument("--out", type=Path, default=root / "out/parts-check")
ap.add_argument("--timeout", type=int, default=1500, help="seconds allowed for one design")
ap.add_argument("--thumbs", action="store_true", help="render the option thumbnails into apps/web/public/parts/")
ap.add_argument("--only-thumbs", default="", help="comma list of kinds: render only these thumbnails, skip the flow checks")
args = ap.parse_args()
if not (args.site / "index.html").exists(): sys.exit(f"{args.site} has no index.html: run deploy/build-pages.sh first")
args.out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"
LIST = "I have an Arduino Uno, 2 TT gear motors, an L298N, an HC-SR04, 4 AA batteries and a servo SG90"
# one inventory per thumbnail: the kind of robot it must rank first
THUMBS = [("scan_car", LIST), ("obstacle_car", "Arduino Nano, TB6612FNG, 2 TT motors, HC-SR04, 2x18650 holder"),
          ("obstacle_car_4wd", "i have: 4 tt motors, 4 wheels, 2 tb6612, arduino nano, hc sr04, 2x18650"),
          ("line_follower", "Parts: Arduino Nano, TB6612FNG, 2 TT motors, 2 wheels, 3-channel line tracking module, 2S 18650 holder"),
          ("camera_car", "Raspberry Pi 4, Pi camera, 2 TT motors, TB6612, 2x18650 holder, LM2596"), ("radar", "SG90, HC-SR04, Arduino Nano"),
          ("servo_arm", "I have 2 MG996R and 2 SG90 servos, an Arduino Uno and a 5V 4A power adapter"), ("walker", "a pack of 10 SG90 servos, an Arduino Nano and a PCA9685")]


class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def translate_path(self, path):
        path = path.split("?")[0]
        return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(args.site)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_address[1]}"
steps, errors = [], []


def step(name, ok, detail=""):
    steps.append({"step": name, "pass": bool(ok), "detail": detail}); print(f"{'PASS' if ok else 'FAIL'} {name} {detail}", flush=True)
    return ok


def open_page(browser):
    ctx = browser.new_context(viewport={"width": 1100, "height": 760}, accept_downloads=True)
    page = ctx.new_page()
    page.route("**/*", lambda r: r.continue_() if r.request.url.startswith(origin) or r.request.url.startswith("data:") or r.request.url.startswith("blob:") else r.abort())
    page.on("pageerror", lambda e: errors.append(str(e)))
    # no default robot: the page would design the 6 DOF arm first and the parts request would queue behind it
    # #parts opens My parts without designing the default robot first
    page.goto(f"{origin}{BASE}/#parts")
    page.wait_for_function('window.__ttrParts && !document.querySelector("#partsPanel").hidden', timeout=args.timeout * 1000)
    return ctx, page


def shot(page, name, selector=None):
    """Screenshots under software GL can stall: wait longer, and never fail the check on a picture."""
    try:
        (page.locator(selector) if selector else page).screenshot(path=str(args.out / name), timeout=120000)
    except Exception as e: print(f"     (no screenshot {name}: {str(e)[:80]})", flush=True)


def wait_design(page):
    page.wait_for_function('!document.body.classList.contains("busy") && document.querySelector(".pcard.sel") && window.__ttr.robot?.metadata?.inventory', timeout=args.timeout * 1000)


with sync_playwright() as p:
    opts = {"headless": True, "args": ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
    if os.getenv("TTR_CHROMIUM"): opts["executable_path"] = os.environ["TTR_CHROMIUM"]
    browser = p.chromium.launch(**opts)
    if args.only_thumbs: args.thumbs = True; THUMBS[:] = [t for t in THUMBS if t[0] in args.only_thumbs.split(",")]
    else:
        ctx, page = open_page(browser)
        t0 = time.time()
        step("My parts opens in the Create pane", page.is_visible("#partsPanel") and page.get_attribute("#partsBtn", "aria-expanded") == "true")
        page.fill("#partsText", LIST + ", a hoverboard")
        page.wait_for_function('document.querySelectorAll("#partsList .partrow").length >= 6', timeout=60000)
        rows = page.eval_on_selector_all("#partsList .partrow", "rs => rs.map(r => [r.dataset.key, r.querySelector('.qty b').textContent])")
        step("the typed list is read into parts with counts", dict(rows) == {"arduino_uno_clone": "1", "tt_gearmotor_1to48": "2", "l298n_module": "1", "hc_sr04": "1", "battery_holder_4aa": "1", "hobby_sg90": "1"}, json.dumps(rows))
        unk = page.text_content("#partsUnknown")
        step("an unknown part stays listed with suggestions", "Not recognised" in unk and "hoverboard" in unk and page.eval_on_selector_all("#partsUnknown .unk button", "b => b.length") > 0, unk[:160])
        page.fill("#partsSearch", "drv8833")
        page.wait_for_selector("#partsResults .chip", timeout=30000)
        page.click("#partsResults .chip")
        added = page.eval_on_selector_all("#partsList .partrow", "rs => rs.map(r => r.dataset.key)")
        step("a part picked from the catalog search is added", "drv8833_module" in added)
        page.click('#partsList .partrow[data-key="drv8833_module"] .qty button:first-child')
        step("and removed again with the minus button", "drv8833_module" not in page.eval_on_selector_all("#partsList .partrow", "rs => rs.map(r => r.dataset.key)"))
        page.click('#partsList .partrow[data-key="tt_gearmotor_1to48"] .qty button:last-child')
        page.click('#partsList .partrow[data-key="tt_gearmotor_1to48"] .qty button:first-child')
        shot(page, "1_picker.png")
        page.click("#partsGo")
        page.wait_for_selector(".pcard", timeout=120000)
        cards = page.eval_on_selector_all(".pcard", "cs => cs.map(c => ({ id: c.dataset.option, h: c.querySelector('.ph').textContent, w: [...c.querySelectorAll('.pw')].map(x => x.textContent) }))")
        step("option cards: up to 3, each 'uses n/m of your parts, needs +$x'", 1 <= len(cards) <= 3 and all(re.match(r"uses \d+/\d+ of your parts, (needs \+\$[\d.]+ \(|nothing to buy)", c["h"]) for c in cards), json.dumps(cards)[:400])
        step("the best option for this list is the scanning car", cards[0]["id"] == "scan_car", cards[0]["id"])
        step("the 4 AA honesty note is on the card, with numbers and the fix", any("4 x AA" in w and "A" in w and "+$" in w for w in cards[0]["w"]), " | ".join(cards[0]["w"])[:300])
        wait_design(page)
        step("the best option is designed and shown", page.evaluate("window.__ttr.robot?.robot_name") == "scan_car", f"{time.time() - t0:.0f}s")
        page.wait_for_function("window.__ttr.preview.ready", timeout=300000); page.wait_for_timeout(3000)
        shot(page, "2_design.png")
        page.click('.dock-btn[data-jump="build"]'); page.click('.tab[data-tab="bom"]')
        page.wait_for_selector("#bom .tobuy", timeout=30000)
        bom = page.text_content("#bom")
        step("the parts list marks 'you have it' and 'to buy'", "you have it" in bom and "to buy" in bom)
        step("'What you still need to buy' with a total and links", re.search(r"What you still need to buy: \$\d+\.\d\d", bom) is not None and page.eval_on_selector_all("#bom .tobuy a[href^=http]", "a => a.length") > 0)
        shot(page, "3_bom.png")
        page.click('.tab[data-tab="files"]')
        with page.expect_download() as d: page.click('[data-dl="sketch"]')
        sketch = Path(d.value.path()).read_text()
        pins = page.evaluate("window.__ttr.robot.metadata.design.firmware")
        step("the sketch downloads with the pins of these parts", d.value.suggested_filename.endswith(".ino") and "Servo.h" in sketch and f"= {pins['drive']['pins']['motor_driver_1']['ENA'][1:]};" in sketch, d.value.suggested_filename)
        with page.expect_download() as d2: page.click('[data-dl="shopping"]')
        step("the shopping list downloads", "Still to buy" in Path(d2.value.path()).read_text())
        ctx.close()
        # the prompt bar: "I have ..." goes to My parts and designs the best option
        ctx, page = open_page(browser)
        page.fill("#prompt", "mere paas 2 motor aur ek Arduino hai"); page.click("#genbtn")
        page.wait_for_selector(".pcard", timeout=120000)
        step("Hinglish 'I have' in the prompt bar opens My parts with the cards", page.is_visible("#partsPanel") and page.eval_on_selector_all("#partsList .partrow", "r => r.length") == 2)
        wait_design(page)
        step("and designs the car", page.evaluate("window.__ttr.robot?.robot_name") == "obstacle_car")
        ctx.close()
    if args.thumbs:
        out = root / "apps/web/public/parts"; out.mkdir(exist_ok=True)
        for kind, text in THUMBS:
            ctx, page = open_page(browser)
            page.fill("#partsText", text)
            page.wait_for_function('document.querySelectorAll("#partsList .partrow").length > 0', timeout=60000)
            page.click("#partsGo"); page.wait_for_selector(".pcard", timeout=120000); wait_design(page)
            page.wait_for_function("window.__ttr.preview.ready", timeout=300000)
            page.wait_for_timeout(2500); page.evaluate("window.__ttr.frameRobot()"); page.wait_for_timeout(1500)
            pic = args.out / f"thumb_{kind}.png"
            box = page.evaluate("(() => { const r = document.querySelector('#viewport').getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.min(r.width, document.querySelector('#sheet').getBoundingClientRect().x - r.x), height: r.height }; })()")
            try: page.screenshot(path=str(pic), clip=box, timeout=120000, animations="disabled")
            except Exception as e: step(f"thumbnail {kind} picture", False, str(e)[:80]); ctx.close(); continue
            got = page.evaluate('document.querySelector(".pcard.sel")?.dataset.option')
            if step(f"thumbnail {kind}", got == kind, got):
                from PIL import Image
                im = Image.open(pic).convert("RGBA"); w, h = im.size; s = min(w / 4, h / 3); cw, ch = int(4 * s), int(3 * s)
                im.crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2)).resize((240, 180), Image.LANCZOS).save(out / f"{kind}.png", optimize=True)
            ctx.close()
    browser.close()
step("no page errors", not errors, "; ".join(errors[:3]))
(args.out / "report.json").write_text(json.dumps({"steps": steps, "errors": errors[:10]}, indent=2) + "\n")
print(f"{sum(s['pass'] for s in steps)}/{len(steps)} steps passed")
sys.exit(0 if all(s["pass"] for s in steps) else 1)
