// The owner's moderation page, served by the Worker at /admin. It holds no secret: the owner pastes the ADMIN_TOKEN,
// which stays in this tab's sessionStorage and goes only to this Worker. Posts are shown with textContent, never as HTML.
export const ADMIN_PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Community admin</title>
<style>
:root{color-scheme:dark;--bg:#06110a;--card:#0e1b13;--line:#1f3326;--fg:#e8f5ea;--mut:#8fa596;--acc:#3dfa46;--bad:#ff6b6b}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--line)}
h1{font-size:17px;margin:0 12px 0 0}h2{font-size:15px;margin:18px 0 8px}
main{padding:0 18px 40px;max-width:1200px}
input,select,button{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
button{cursor:pointer}button.acc{background:var(--acc);color:#06110a;border-color:var(--acc);font-weight:600}button.bad{border-color:var(--bad);color:var(--bad)}
.tabs button.on{border-color:var(--acc);color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.card img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#000}
.card .b{padding:10px;display:flex;flex-direction:column;gap:6px;flex:1}.card .t{font-weight:600}
.mut{color:var(--mut);font-size:12px}.pill{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:0 8px;font-size:12px;margin-right:4px}
.pill.live{color:var(--acc)}.pill.pending{color:#ffd166}.pill.hidden{color:var(--bad)}
.row{display:flex;gap:6px;flex-wrap:wrap}.desc{white-space:pre-wrap;word-break:break-word;max-height:7em;overflow:auto}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}
#posts.gap{margin-top:12px}.num{width:64px}
#msg{min-height:1.4em;color:var(--mut)}#msg.err{color:var(--bad)}
</style></head><body>
<header><h1>Community admin</h1>
<input id="token" type="password" placeholder="ADMIN_TOKEN" autocomplete="off" size="34"><button id="signin" class="acc">Use token</button><button id="forget">Forget</button>
<span class="mut">Moderation</span><select id="mode"><option value="instant">instant: live at once</option><option value="review">review: held until I approve</option></select>
<span class="mut">Hide after</span><input id="threshold" type="number" min="1" max="100" class="num"><span class="mut">reports</span><button id="save">Save</button>
</header>
<main><p id="msg"></p>
<div class="tabs row"><button data-s="">All</button><button data-s="pending">Waiting for review</button><button data-s="hidden">Hidden</button><button data-s="live">Live</button></div>
<div id="posts" class="grid gap"></div><p><button id="more" hidden>More</button></p>
<h2>Reports</h2><table><thead><tr><th>When</th><th>Post</th><th>Reason</th><th>State</th></tr></thead><tbody id="reports"></tbody></table>
</main>
<script>
const $ = (s) => document.querySelector(s);
const el = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
let token = sessionStorage.getItem("ttr-admin") || "", status = "", next = null;
const msg = (t, err) => { $("#msg").textContent = t; $("#msg").className = err ? "err" : ""; };
async function call(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { Authorization: "Bearer " + token, ...(opt.body ? { "Content-Type": "application/json" } : {}) } });
  if (r.status === 401) { msg("That token is not the owner's token.", true); throw new Error("401"); }
  const out = r.headers.get("Content-Type")?.includes("json") ? await r.json() : r;
  if (!r.ok) { msg(out.error || r.status, true); throw new Error(out.error); }
  return out;
}
async function thumbOf(url, img) { try { const r = await call(url); img.src = URL.createObjectURL(await r.blob()); } catch {} }
function card(p) {
  const c = el("article", "card"); c.dataset.id = p.id;
  const img = el("img"); img.alt = ""; thumbOf(p.thumbnail, img);
  const b = el("div", "b");
  const meta = el("div"); meta.append(el("span", "pill " + p.status, p.status + (p.hidden_reason ? " (" + p.hidden_reason + ")" : "")), el("span", "pill", p.product));
  if (p.reports) meta.append(el("span", "pill hidden", p.reports + " report" + (p.reports > 1 ? "s" : "")));
  b.append(meta, el("div", "t", p.title), el("div", "mut", (p.name || "Anonymous") + " · " + new Date(p.created_at).toLocaleString() + " · " + p.id));
  if (p.tags.length) b.append(el("div", "mut", p.tags.map((t) => "#" + t).join(" ")));
  if (p.description) b.append(el("div", "desc", p.description));
  const row = el("div", "row");
  const act = (label, fn, cls) => { const x = el("button", cls, label); x.onclick = fn; row.append(x); };
  if (p.status === "pending") act("Approve", () => doAct(p.id, "approve"), "acc");
  if (p.status === "hidden") act("Restore", () => doAct(p.id, "restore"), "acc");
  if (p.status !== "hidden") act("Hide", () => doAct(p.id, "hide"));
  act("Delete", () => { if (confirm("Delete this post for good?")) call("/admin/posts/" + p.id, { method: "DELETE" }).then(() => { msg("Deleted " + p.id); load(); }); }, "bad");
  act("Ban poster", () => { if (confirm("Hide every post from this poster's connection and block it from posting for the rest of the salt's life (up to two days)?")) doAct(p.id, "ban"); }, "bad");
  b.append(row); c.append(img, b); return c;
}
async function doAct(id, a) { await call("/admin/posts/" + id + "/" + a, { method: "POST" }); msg(a + " done on " + id); load(); }
async function load(append) {
  if (!token) { msg("Paste the ADMIN_TOKEN (wrangler secret ADMIN_TOKEN) to moderate."); return; }
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.s === status));
  const q = new URLSearchParams({ limit: "30" }); if (status) q.set("status", status); if (append && next) q.set("cursor", next);
  const out = await call("/admin/posts?" + q);
  if (!append) $("#posts").replaceChildren();
  for (const p of out.posts) $("#posts").append(card(p));
  if (!$("#posts").children.length) $("#posts").append(el("p", "mut", "No posts here."));
  next = out.next; $("#more").hidden = !next;
  const s = await call("/admin/settings"); $("#mode").value = s.moderation; $("#threshold").value = s.report_threshold;
  const r = await call("/admin/reports"); const tb = $("#reports"); tb.replaceChildren();
  for (const x of r.reports) { const tr = el("tr"); tr.append(el("td", "mut", new Date(x.created_at).toLocaleString()), el("td", null, x.title + " (" + x.post_id + ")"), el("td", null, x.reason || "(no reason)"), el("td", "mut", x.resolved ? "resolved" : "open")); tb.append(tr); }
  if (!r.reports.length) { const tr = el("tr"); tr.append(el("td", "mut", "No reports.")); tb.append(tr); }
}
$("#signin").onclick = () => { token = $("#token").value.trim(); sessionStorage.setItem("ttr-admin", token); $("#token").value = ""; msg("Token kept for this tab."); load(); };
$("#forget").onclick = () => { token = ""; sessionStorage.removeItem("ttr-admin"); $("#posts").replaceChildren(); $("#reports").replaceChildren(); msg("Token forgotten."); };
$("#save").onclick = async () => { const s = await call("/admin/settings", { method: "POST", body: JSON.stringify({ moderation: $("#mode").value, report_threshold: Number($("#threshold").value) }) }); msg("Saved: " + s.moderation + ", hide after " + s.report_threshold + " reports"); };
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { status = b.dataset.s; load(); }));
$("#more").onclick = () => load(true);
load().catch(() => {});
</script></body></html>`;

const inner = (tag) => ADMIN_PAGE.slice(ADMIN_PAGE.indexOf(`<${tag}>`) + tag.length + 2, ADMIN_PAGE.indexOf(`</${tag}>`));
let csp;
/** The page's CSP: its one inline script and one inline style allowed by hash, nothing else inline, no HTML sinks. */
export async function adminCsp() {
  if (csp) return csp;
  const hash = async (text) => `'sha256-${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))))}'`;
  csp = `default-src 'none'; script-src ${await hash(inner("script"))}; style-src ${await hash(inner("style"))}; img-src blob:; connect-src 'self'; ` +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
  return csp;
}
