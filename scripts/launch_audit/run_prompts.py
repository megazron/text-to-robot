"""Drive the static site (deploy/build-pages.sh pages-dist) with the launch-audit prompt corpus in one tab, like a visitor.

    python scripts/launch_audit/run_prompts.py                       every prompt in corpus.py, then the template chips
    SITE=pages-test LIST=list.json OUTF=retest.jsonl python ...      a list of prompts on another build
    LIST=list.json REPEAT=4 OUTF=session.jsonl python ...            one long session (each round words the prompts differently)

Rows go to out/audit/prompts.jsonl (one JSON line per prompt, with the status text, timings, long tasks and memory)."""
import functools, http.server, json, os, sys, threading, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); from corpus import C
root = pathlib.Path(__file__).resolve().parents[2]; site = root / os.environ.get("SITE", "pages-dist"); out = root / "out/audit"; out.mkdir(parents=True, exist_ok=True)
BASE = "/text-to-robot"
only = sys.argv[1] if len(sys.argv) > 1 else ""
class Q(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".wasm": "application/wasm"}
    def log_message(self, *a): pass
    def translate_path(self, path):
        path = path.split("?")[0]; return super().translate_path(path[len(BASE):] if path.startswith(BASE) else path)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(site)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{srv.server_address[1]}"; url = f"{origin}{BASE}/"
INIT = """window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true})}catch{}
window.__alerts=0;window.alert=()=>{window.__alerts++};"""
def rss_tree():
    pids = {os.getpid()}; total = 0; changed = True
    procs = {}
    for d in pathlib.Path("/proc").iterdir():
        if d.name.isdigit():
            try:
                st = (d / "stat").read_text().rsplit(")", 1)[1].split(); procs[int(d.name)] = (int(st[1]), int(st[21]) * 4096 // 1048576)
            except Exception: pass
    while changed:
        changed = False
        for pid, (pp, _) in procs.items():
            if pp in pids and pid not in pids: pids.add(pid); changed = True
    return sum(procs[p][1] for p in pids if p in procs)
def new_page(ctx, log):
    page = ctx.new_page(); page.add_init_script(INIT)
    page.on("pageerror", lambda e: log["errors"].append("pageerror: " + str(e)[:300]))
    page.on("console", lambda m: log["errors"].append("console: " + m.text[:300]) if m.type == "error" else None)
    page.on("response", lambda r: log["failed"].append(f"{r.status} {r.url}") if r.status >= 400 else None)
    page.on("requestfailed", lambda r: log["failed"].append(f"FAILED {r.url} {r.failure}"))
    page.on("dialog", lambda d: (log["errors"].append("dialog: " + d.message), d.dismiss()))
    def route(r):
        u = r.request.url
        if u.startswith(origin) or u.startswith("data:") or u.startswith("blob:"): r.continue_()
        else: log["external"].append(u); r.abort()
    page.route("**/*", route)
    t = time.time(); page.goto(url)
    page.wait_for_function("window.__ttr?.robot?.links.length>0 && !document.querySelector('#genbtn').disabled", timeout=600000)
    return page, round(time.time() - t, 1)
STATUS = 'document.querySelector("#status").textContent'
def gen(page, prompt, arduino, timeout_s):
    page.evaluate("""([p,a])=>{const b=document.querySelector('#genbtn');window.__started=false;window.__done=false;
      const sw=document.querySelector('#arduinoBtn'); if((sw.getAttribute('aria-checked')==='true')!==a) sw.click();
      window.__wasRobot=window.__ttr.robot; window.__wasStatus=document.querySelector('#status').textContent;
      new MutationObserver(()=>{if(b.disabled)window.__started=true; else if(window.__started)window.__done=true}).observe(b,{attributes:true,childList:true,subtree:true});
      document.querySelector('#prompt').value=p}""", [prompt, arduino])
    t = time.time(); page.click("#genbtn")
    try: page.wait_for_function("window.__started", timeout=3000)
    except Exception: return {"no_start": True, "s": round(time.time() - t, 1)}
    deadline = t + timeout_s; forge = None
    while time.time() < deadline:
        if page.evaluate("window.__done"): break
        st = page.evaluate(STATUS)
        if "Forging the Mark 43" in st and not forge: forge = {"first_progress_s": round(time.time() - t, 1), "text": st[:300]}
        if forge and time.time() - t > forge["first_progress_s"] + 60: return {"forge": forge, "s": round(time.time() - t, 1), "last": page.evaluate(STATUS)[:300]}
        time.sleep(0.5)
    else: return {"hang": True, "s": round(time.time() - t, 1), "last": page.evaluate(STATUS)[:400]}
    s = round(time.time() - t, 1)
    try: page.wait_for_function("window.__ttr.preview.ready || window.__ttr.preview.errors.length>0 || window.__ttr.robot===window.__wasRobot", timeout=180000)
    except Exception: pass
    info = page.evaluate("""()=>{const r=__ttr.robot,p=__ttr.preview,d=r?.metadata?.design;return {changed:r!==window.__wasRobot,name:r?.robot_name,family:d?.family,links:r?.links.length,joints:r?.joints.length,
      dof:r?.joints.filter(j=>j.type!=='fixed'&&!j.passive).length, cost:document.querySelector('#costBig').textContent, checks:document.querySelector('#checksPill').textContent,
      preview:{ready:p.ready,expected:p.expected,loaded:p.loaded,errors:p.errors.slice(0,3)}, status:document.querySelector('#status').textContent, statusErr:document.querySelector('#status').classList.contains('err'),
      tiers:[...document.querySelectorAll('.tier')].map(n=>n.textContent), tierNotes:document.querySelector('#tierNotes').textContent, title:document.title, robotName:document.querySelector('#robotName').textContent,
      materials:r?.materials?.map(m=>m.name+':'+m.color.map(c=>c.toFixed(2)).join(',')).slice(0,6), heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null,
      longMax:Math.max(0,...window.__long), longSum:window.__long.reduce((a,b)=>a+b,0), longN:window.__long.length, alerts:window.__alerts, toast:document.querySelector('#toast').textContent,
      injected:document.querySelectorAll('#panes img, #panes script, #panes b.inj').length}}""")
    page.evaluate("window.__long=[]")
    info["s"] = s; info["preview_s"] = round(time.time() - t, 1); return info
rows = []; outf = out / (os.environ["OUTF"] if os.environ.get("OUTF") else "prompts.jsonl" if not only else f"prompts_{only}.jsonl")
done = set()
if outf.exists():
    for l in outf.read_text().splitlines(): r = json.loads(l); rows.append(r); done.add(r["key"])
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--js-flags=--expose-gc"])
    log = {"errors": [], "failed": [], "external": []}
    ctx = b.new_context(viewport={"width": 1000, "height": 640}); page, ready = new_page(ctx, log)
    print("site ready", ready, "s", flush=True); gens = 0; crashes = []
    templates = page.evaluate("[...document.querySelectorAll('#templates button')].map(b=>b.textContent)")
    cases = list(C) + [{"cat": "template", "exp": "template " + t, "prompt": "Create a " + t} for t in templates]
    if os.environ.get("LIST"): cases = [{"cat": "retest", "exp": "", "prompt": p} for p in json.load(open(os.environ["LIST"]))]
    # each round words the prompts a little differently, so nothing comes from the design cache
    if os.environ.get("REPEAT"): cases = [{**c, "prompt": c["prompt"] + ["", " please", " now", " today", " thanks"][k % 5]} for k in range(int(os.environ["REPEAT"])) for c in cases]
    if only: cases = [c for c in cases if c["cat"] in only.split(",")]
    for i, c in enumerate(cases):
        arduino = c["cat"] == "arduino"; key = f'{c["cat"]}|{arduino}|{c["prompt"][:200]}|{len(c["prompt"])}'
        if key in done and not os.environ.get("REPEAT"): continue
        mark = c["cat"] == "mark43" or "mark 43" in c["prompt"].lower() or "iron man" in c["prompt"].lower()
        if mark:   # forging takes tens of minutes: its own context, observed until progress, then closed
            mlog = {"errors": [], "failed": [], "external": []}; mctx = b.new_context(viewport={"width": 1000, "height": 640}); mp, _ = new_page(mctx, mlog)
            r = gen(mp, c["prompt"], arduino, 900); r.update(errors=mlog["errors"][:5], failed=mlog["failed"][:5], external=mlog["external"][:5]); mctx.close()
        else:
            log["errors"].clear(); log["failed"].clear(); log["external"].clear()
            try: r = gen(page, c["prompt"], arduino, 600)
            except Exception as e: r = {"exception": str(e)[:300]}
            r.update(errors=log["errors"][:5], failed=log["failed"][:5], external=log["external"][:5])
            crash = any(k in (r.get("status") or "") for k in ("Aborted()", "out of bounds", "engine stopped", "memory access out of bounds"))
            if crash:   # the engine died in this tab: note it, then retry the prompt in a fresh tab, as a visitor reloading would
                r["engine_crash_after"] = gens; r["crash_status"] = r["status"][:200]
                page.close(); page, _ = new_page(ctx, log); gens = 0; crashes.append(len(rows) + 1)
                log["errors"].clear()
                try: r2 = gen(page, c["prompt"], arduino, 600)
                except Exception as e: r2 = {"exception": str(e)[:300]}
                r = {**r2, "engine_crash_after": r["engine_crash_after"], "crash_status": r["crash_status"], "retried_in_fresh_tab": True}
                r.update(errors=log["errors"][:5], failed=log["failed"][:5], external=log["external"][:5])
            gens += 1
            if r.get("hang") or r.get("exception"):
                try: page.close()
                except Exception: pass
                page, _ = new_page(ctx, log); r["page_restarted"] = True
        r["rss_mb"] = rss_tree()
        try: r["wasm_mb"] = page.evaluate("window.__ttrWasmMb ?? null"); r["recycles"] = page.evaluate("window.ttrEngineRecycles ? ttrEngineRecycles() : null")
        except Exception: pass
        row = {"key": key, **c, "arduino": arduino, "len": len(c["prompt"]), **r}; row["prompt"] = c["prompt"][:300]
        rows.append(row)
        with outf.open("a") as f: f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f'{len(rows):3d} {r.get("s")}s {c["cat"]:<12} {c["prompt"][:50]!r:<54} -> {r.get("name") or ("FORGE" if r.get("forge") else "HANG" if r.get("hang") else "NOSTART" if r.get("no_start") else r.get("exception","?")[:40])} {r.get("family","")} err={len(r["errors"])} rss={r["rss_mb"]}', flush=True)
    b.close()
