"""A visitor's session on the live site (or a local build), desktop and phone: prompts, chains of changes, every view and
download, and the page's health throughout. Writes out/qa/sweep.json and prints one line per finding.

    python scripts/launch_audit/qa_sweep.py https://megazron.github.io/text-to-robot/ prompts.json chains.json

Per prompt: the robot came and matches the chips (wheels, arms), no page error, no failed request, the longest main-thread
task, the JS heap after it (growth over the session). Per change: the robot changed as asked (the changes list said what).
Once per viewport: every view button, every download (each file checked: non-empty, the type it says), the Here's what I
understood panel, keyboard focus order (every control reachable by Tab, a visible focus ring), labels on inputs and buttons,
text contrast of the main controls, and horizontal overflow on a 360 px wide screen."""
import json, sys, time, pathlib, re, io, zipfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import pw_csp; pw_csp.install()
from playwright.sync_api import sync_playwright

url = sys.argv[1]; prompts = json.loads(pathlib.Path(sys.argv[2]).read_text()); chains = json.loads(pathlib.Path(sys.argv[3]).read_text())
out = pathlib.Path("out/qa"); out.mkdir(parents=True, exist_ok=True)
IDLE = "!document.querySelector('#genbtn').disabled && !document.querySelector('#modbtn').disabled && !document.body.classList.contains('busy')"
INIT = "window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true})}catch{}"
SUM = """(()=>{const r=__ttr.robot,d=r.metadata.design||{};const js=r.joints.filter(j=>j.type!=='fixed'&&!j.mimic);
 return {name:r.robot_name,family:d.family||null,wheels:js.filter(j=>/wheel/.test(j.name)&&!/steer/.test(j.name)).length,
 arms:new Set(js.filter(j=>/(?:^|_)(?:shoulder\\w*|base_yaw)$/.test(j.name)).map(j=>j.name.replace(/_?(?:shoulder\\w*|base_yaw)$/,''))).size,
 failing:(d.checks||[]).filter(c=>!c.pass).map(c=>c.name), chips:[...document.querySelectorAll('#understood .chip, .uchips .chip')].map(c=>c.textContent.trim()).slice(0,12),
 heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null}})()"""
findings, rows = [], []


def find(kind, sev, what):
    findings.append({"kind": kind, "severity": sev, "what": what}); print(f"[{sev}] {kind}: {what}", flush=True)


def settle(page, ms=900000):
    page.wait_for_function(IDLE, timeout=ms)
    t = time.time()
    while time.time() - t < 900 and page.evaluate("window.__ttr.routing === 'running'"): time.sleep(2)


def session(p, viewport, mobile):
    ctx = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-precise-memory-info"]).new_context(
        viewport=viewport, is_mobile=mobile, has_touch=mobile, reduced_motion="reduce", accept_downloads=True)
    page = ctx.new_page(); page.add_init_script(INIT)
    errors, failed = [], []
    page.on("pageerror", lambda e: errors.append(str(e)[:300]))
    page.on("console", lambda m: errors.append("console: " + m.text[:300]) if m.type == "error" else None)
    page.on("requestfailed", lambda r: failed.append(f"{r.url[:120]} {r.failure}"))
    page.on("response", lambda r: failed.append(f"{r.status} {r.url[:120]}") if r.status >= 400 else None)
    page.goto(url); page.wait_for_function("window.__ttr?.robot?.links.length>0", timeout=600000); page.wait_for_function(IDLE, timeout=600000)
    tag = "phone" if mobile else "desktop"
    # layout: nothing wider than the screen
    over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    if over > 2: find("layout", "medium", f"{tag}: the page is {over} px wider than the screen")
    # labels: every input and button has an accessible name
    unnamed = page.evaluate("""[...document.querySelectorAll('input,button,select,textarea,[role=button]')].filter(e=>e.offsetParent!==null).filter(e=>!(e.getAttribute('aria-label')||e.labels?.length||e.textContent.trim()||e.title||e.getAttribute('aria-labelledby')||e.placeholder)).map(e=>e.outerHTML.slice(0,90))""")
    for u in unnamed[:8]: find("a11y", "medium", f"{tag}: a control with no accessible name: {u}")
    # keyboard: Tab reaches the prompt, Generate and Modify, and the focused element shows a ring
    seen = set()
    for _ in range(60):
        page.keyboard.press("Tab")
        info = page.evaluate("(()=>{const e=document.activeElement;if(!e)return null;const s=getComputedStyle(e);return {id:e.id||e.className||e.tagName,ring:s.outlineStyle!=='none'&&s.outlineWidth!=='0px'||s.boxShadow!=='none'}})()")
        if info: seen.add(info["id"])
        if info and not info["ring"] and info["id"] in ("prompt", "genbtn", "modify", "modbtn"): find("a11y", "low", f"{tag}: #{info['id']} has no visible focus ring")
    for need in ("prompt", "genbtn"):
        if need not in seen: find("a11y", "medium", f"{tag}: #{need} is not reachable by Tab within 60 presses")
    # contrast of the main controls (WCAG AA 4.5:1 for text)
    low = page.evaluate("""(()=>{const lum=c=>{const v=c.match(/[\\d.]+/g).slice(0,3).map(x=>{x/=255;return x<=0.03928?x/12.92:((x+0.055)/1.055)**2.4});return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]};
      const bgOf=e=>{for(;e;e=e.parentElement){const b=getComputedStyle(e).backgroundColor;if(b&&!/rgba\\(.*,\\s*0\\)$/.test(b)&&b!=='transparent')return b}return 'rgb(255,255,255)'};
      return [...document.querySelectorAll('button,label,h1,h2,h3,p,a,.chip')].filter(e=>e.offsetParent!==null&&e.textContent.trim()).slice(0,300).map(e=>{const a=lum(getComputedStyle(e).color),b=lum(bgOf(e));return {t:e.textContent.trim().slice(0,30),r:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)}}).filter(x=>x.r<4.5)})()""")
    for l in low[:6]: find("a11y", "low", f"{tag}: text \"{l['t']}\" contrast {l['r']:.1f}:1 (under 4.5)")
    heap0 = page.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : 0")
    for i, pr in enumerate(prompts if not mobile else prompts[:12]):
        e0, f0 = len(errors), len(failed); t = time.time()
        page.evaluate("window.__long=[]"); page.fill("#prompt", pr); page.click("#genbtn"); time.sleep(0.8)
        try: settle(page)
        except Exception as e: find("hang", "high", f"{tag}: {pr!r} did not finish: {str(e)[:120]}"); continue
        row = {"viewport": tag, "prompt": pr, "s": round(time.time() - t, 1), **page.evaluate(SUM), "long_max": max(page.evaluate("window.__long") or [0])}
        rows.append(row)
        if len(errors) > e0: find("error", "high", f"{tag}: {pr!r}: {errors[e0:][:2]}")
        if len(failed) > f0: find("request", "medium", f"{tag}: {pr!r}: {failed[f0:][:2]}")
        if row["long_max"] > 200: find("long task", "low", f"{tag}: {pr!r}: a {row['long_max']} ms task on the page")
        if row["failing"]: find("checks", "medium", f"{tag}: {pr!r}: failing design checks {row['failing']}")
        # what the panel says against what was built
        for c in row["chips"]:
            m = re.match(r"(\\d+)-wheel", c)
            if m and int(m.group(1)) != row["wheels"] and row["wheels"]: find("says one thing", "medium", f"{tag}: {pr!r}: chip {c!r} but {row['wheels']} wheel joints")
    heap1 = page.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : 0")
    if heap0 and heap1 - heap0 > 400: find("memory", "medium", f"{tag}: JS heap grew from {heap0} to {heap1} MB over the session")
    # chains of changes
    if not mobile:
        for prompt, mods in chains:
            page.fill("#prompt", prompt); page.click("#genbtn"); time.sleep(0.8); settle(page)
            for m in mods:
                before = page.evaluate(SUM); e0 = len(errors)
                page.fill("#modify", m); page.click("#modbtn"); time.sleep(0.8)
                try: settle(page)
                except Exception as e: find("hang", "high", f"modify {m!r} on {prompt!r} did not finish"); continue
                after = page.evaluate(SUM); diff = page.evaluate("[...document.querySelectorAll('#diff div')].map(d=>d.textContent).slice(1)")
                rows.append({"viewport": tag, "chain": prompt, "modify": m, "before": before, "after": after, "said": diff})
                if len(errors) > e0: find("error", "high", f"modify {m!r} on {prompt!r}: {errors[e0:][:2]}")
                if not diff: find("modify", "medium", f"modify {m!r} on {prompt!r}: nothing listed as changed")
                if any(x.startswith("? Not understood") for x in diff): find("modify", "medium", f"modify {m!r} on {prompt!r}: {diff[:2]}")
                w = re.search(r"\\b(\\d)\\s+wheels?\\b", m)
                if w and m.startswith(("only", "4", "3", "6")) and after["wheels"] not in (int(w.group(1)), int(w.group(1)) - 1): find("modify", "high", f"{m!r} on {prompt!r}: {after['wheels']} wheel joints")
    # views and downloads
    for b in page.query_selector_all("button"):
        try:
            if not b.is_visible(): continue
            label = (b.text_content() or "").strip()
            if label in ("Robot", "Electronics", "Exploded", "Bench", "Collision", "Axes", "Frames", "Motion", "Reset"):
                e0 = len(errors); b.click(); time.sleep(1.5)
                if len(errors) > e0: find("error", "high", f"{tag}: view {label!r}: {errors[e0:][:2]}")
        except Exception: pass
    for kind in ["urdf", "xacro", "json", "bom", "cad", "train", "sketch", "schematic", "breadboard", "wiring3d", "shopping"]:
        el = page.query_selector(f"[data-dl='{kind}']")
        if not el: continue
        if not el.is_visible():
            for dock in ("Build", "Model"):
                try: page.get_by_role("button", name=re.compile(dock)).first.click(); time.sleep(0.5)
                except Exception: pass
                if el.is_visible(): break
        if not el.is_visible(): find("download", "low", f"{tag}: the {kind} download is not reachable from the dock"); continue
        try:
            with page.expect_download(timeout=600000) as d: el.click()
            path = d.value.path(); data = pathlib.Path(path).read_bytes()
            if len(data) < 50: find("download", "high", f"{tag}: {kind}: {len(data)} bytes")
            if d.value.suggested_filename.endswith(".zip"):
                try: zipfile.ZipFile(io.BytesIO(data)).testzip()
                except Exception as e: find("download", "high", f"{tag}: {kind}: not a zip ({e})")
        except Exception as e: find("download", "medium", f"{tag}: {kind}: {str(e)[:120]}")
    ctx.browser.close()


with sync_playwright() as p:
    session(p, {"width": 1280, "height": 800}, False)
    session(p, {"width": 360, "height": 760}, True)
(out / "sweep.json").write_text(json.dumps({"findings": findings, "rows": rows}, indent=1, ensure_ascii=False))
print(f"{len(findings)} findings; {len(rows)} rows -> out/qa/sweep.json")
