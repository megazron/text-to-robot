// The community board client, shared by Text to Robot and Robot Studio (Studio imports this file from the Text to
// Robot site). Nothing is sent anywhere until the person presses "Post publicly" in the share form; reading the feed
// only happens when the Community tab is opened. Everything is built with createElement and textContent (no HTML
// strings), so a post can never inject markup. The server is named in community.json next to this file; with no
// server named the whole feature stays hidden. docs/COMMUNITY.md describes the server.

const HERE = new URL(".", import.meta.url);
export const TTR_SITE = HERE.href;
const RECIPE = /^(make|robot)=[A-Za-z0-9_-]+$/;
const MAX_THUMB = 300 * 1024;
const PRODUCTS = { "text-to-robot": "Text to Robot", "robot-studio": "Robot Studio" };

/** The board's settings, or null when no server is configured (then nothing about the board is shown). */
export async function loadConfig(url = new URL("community.json", HERE)) {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) return null;
    const c = await r.json();
    const api = typeof c.api === "string" ? c.api.trim().replace(/\/+$/, "") : "";
    if (!/^https?:\/\/[^/]+(\/.*)?$/.test(api)) return null;
    return { api, siteKey: typeof c.turnstileSiteKey === "string" ? c.turnstileSiteKey.trim() : "" };
  } catch { return null; }
}

/** Base64url of a text, as the #make= share links carry a recipe. */
export const b64url = (text) => {
  const b = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A whole design as the recipe "robot=<deflate-raw base64url>", the format of the share links on both sites. */
export async function robotRecipe(robot) {
  const stream = new Blob([JSON.stringify(robot)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const b = new Uint8Array(await new Response(stream).arrayBuffer());
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return `robot=${btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

// ---------------------------------------------------------------- small DOM helpers
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(label, cls, onclick) { const b = el("button", cls, label); b.type = "button"; if (onclick) b.onclick = onclick; return b; }
const isHttp = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };

/** The description as DOM nodes: text stays text, links become <a rel="nofollow ugc noopener"> (http and https only). */
const LINK_RE = /\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)]{1,300})\)|(https?:\/\/[^\s<>"')\]]{1,300})/g;
export function descriptionNodes(text) {
  const out = [];
  let last = 0;
  const pushText = (s) => s.split("\n").forEach((line, i) => { if (i) out.push(document.createElement("br")); if (line) out.push(document.createTextNode(line)); });
  for (const m of String(text ?? "").matchAll(LINK_RE)) {
    pushText(text.slice(last, m.index));
    const href = m[2] ?? m[3];
    if (isHttp(href)) { const a = el("a", null, m[1] ?? m[3]); a.href = href; a.rel = "nofollow ugc noopener"; a.target = "_blank"; out.push(a); }
    else pushText(m[0]);
    last = m.index + m[0].length;
  }
  pushText(String(text ?? "").slice(last));
  return out;
}

// ---------------------------------------------------------------- the thumbnail
/**
 * A 480 x 360 picture of the 3D view, cropped to fill, as WebP (PNG where the browser cannot write WebP), at most
 * 300 KB. `source` is the canvas the 3D view was just drawn into, in the same task (the WebGL buffer is still there),
 * or { canvas, crop: { x, y, w, h } } with the part of it a person can see, in CSS pixels.
 */
export async function thumbnailFrom(source, width = 480, height = 360) {
  const canvas = source.canvas ?? source;
  const k = canvas.width / (canvas.clientWidth || canvas.width);
  const crop = source.crop ? { x: source.crop.x * k, y: source.crop.y * k, w: source.crop.w * k, h: source.crop.h * k } : { x: 0, y: 0, w: canvas.width || width, h: canvas.height || height };
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const g = c.getContext("2d");
  g.fillStyle = "#06110a"; g.fillRect(0, 0, width, height);
  const s = Math.max(width / crop.w, height / crop.h);
  const sw = width / s, sh = height / s;
  g.drawImage(canvas, crop.x + (crop.w - sw) / 2, crop.y + (crop.h - sh) / 2, sw, sh, 0, 0, width, height);
  const blob = (type, q) => new Promise((res) => c.toBlob(res, type, q));
  for (const q of [0.85, 0.7, 0.5]) {
    const b = await blob("image/webp", q);
    if (b && b.type === "image/webp" && b.size <= MAX_THUMB) return b;
  }
  const png = await blob("image/png");
  if (png && png.size <= MAX_THUMB) return png;
  throw new Error("the picture of the design is too large");
}
const toBase64 = async (blob) => {
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

// ---------------------------------------------------------------- Turnstile
let turnstileLoad;
async function loadTurnstile() {
  if (window.turnstile) return window.turnstile;
  turnstileLoad ??= (async () => {
    const url = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    // a page with Trusted Types gives script URLs through its own policy (safe.js); without it a plain string is fine
    const safe = await import(new URL("safe.js", HERE).href).catch(() => null);
    const s = document.createElement("script");
    s.src = safe?.scriptUrl ? safe.scriptUrl(url) : url;
    s.async = true;
    await new Promise((res, rej) => { s.onload = res; s.onerror = () => rej(new Error("the human check could not load")); document.head.append(s); });
    for (let i = 0; i < 100 && !window.turnstile; i++) await new Promise((r) => setTimeout(r, 50));
    if (!window.turnstile) throw new Error("the human check could not load");
    return window.turnstile;
  })();
  turnstileLoad.catch(() => { turnstileLoad = null; });
  return turnstileLoad;
}
/** Renders the Turnstile widget into `box` (invisible unless Cloudflare needs a click) and resolves with its token. */
async function humanCheck(box, siteKey, action) {
  if (!siteKey) throw new Error("the human check is not set up");
  const ts = await loadTurnstile();
  return new Promise((resolve, reject) => {
    box.replaceChildren();
    ts.render(box, {
      sitekey: siteKey, action, appearance: "interaction-only", theme: "dark",
      callback: resolve,
      "error-callback": () => reject(new Error("the human check failed; try again")),
      "expired-callback": () => reject(new Error("the human check expired; try again")),
    });
  });
}

// ---------------------------------------------------------------- the API
async function call(cfg, path, init = {}, timeoutMs = init.method && init.method !== "GET" ? 60000 : 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(cfg.api + path, { ...init, signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(out.error || `the community server answered ${r.status}`); e.status = r.status; throw e; }
    return out;
  } catch (e) {
    if (e.status) throw e;
    const off = new Error(ctl.signal.aborted && init.method === "POST"
      ? "The community server took too long to answer. Look in the feed before trying again."
      : "The community is offline right now. Everything else on this page still works.");
    off.offline = true;
    throw off;
  } finally { clearTimeout(timer); }
}

// ---------------------------------------------------------------- a card (feed and preview use the same one)
function card(post, { onOpen, onReport, onTag, preview } = {}) {
  const c = el("article", "cm-card");
  if (post.id) c.dataset.id = post.id;
  const img = el("img", "cm-thumb");
  img.alt = post.title; img.loading = "lazy"; img.decoding = "async"; img.draggable = false;
  if (post.thumbnail) img.src = post.thumbnail;
  const body = el("div", "cm-body");
  body.append(el("h3", "cm-title", post.title || "Untitled"));
  const by = el("div", "cm-by");
  by.append(el("span", post.name ? "cm-name" : "cm-name anon", post.name || "Anonymous"));
  by.append(el("span", "cm-meta", ` · ${PRODUCTS[post.product] ?? post.product}${post.created_at ? ` · ${new Date(post.created_at).toLocaleDateString()}` : ""}`));
  body.append(by);
  if (post.description) { const d = el("p", "cm-desc"); d.append(...descriptionNodes(post.description)); body.append(d); }
  if (post.tags?.length) {
    const tags = el("div", "cm-tags");
    for (const t of post.tags) tags.append(onTag ? button(`#${t}`, "cm-tag", () => onTag(t)) : el("span", "cm-tag", `#${t}`));
    body.append(tags);
  }
  if (!preview) {
    const row = el("div", "cm-actions");
    if (RECIPE.test(post.recipe ?? "")) row.append(button("Open this design", "cm-open", () => onOpen?.(post)));
    row.append(button("Report", "cm-report", () => onReport?.(post, c)));
    body.append(row);
  }
  c.append(img, body);
  return c;
}

// ---------------------------------------------------------------- the board
/**
 * The board for one page. `product` is "text-to-robot" or "robot-studio". `openDesign(post)` opens a post's design
 * (default: the product's page with the recipe after the #).
 */
export function createBoard(cfg, { product, openDesign, siteUrl = TTR_SITE } = {}) {
  if (!document.querySelector("link[data-community]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = new URL("community.css", HERE).href; css.dataset.community = "";
    document.head.append(css);
  }
  const defaultOpen = (post) => {
    if (!RECIPE.test(post.recipe)) return;
    location.assign(`${siteUrl}#${post.recipe}`);
    if (new URL(siteUrl, location.href).pathname === location.pathname) location.reload();
  };
  const open = openDesign ?? defaultOpen;

  /** Fills `box` with the feed: newest first, a product and tag filter, and a More button. Reads only when called. */
  function feed(box) {
    const state = { tag: "", product: "", next: null };
    const head = el("div", "cm-filters");
    const sel = el("select", "cm-product");
    sel.setAttribute("aria-label", "Made with");
    for (const [v, t] of [["", "All designs"], ...Object.entries(PRODUCTS)]) { const o = el("option", null, t); o.value = v; sel.append(o); }
    sel.onchange = () => { state.product = sel.value; load(); };
    const tagChip = button("", "cm-tag on", () => { state.tag = ""; load(); });
    tagChip.hidden = true;
    head.append(sel, tagChip, button("Refresh", "cm-refresh", () => load()));
    const list = el("div", "cm-grid");
    const more = button("More", "cm-more", () => load(true));
    const note = el("p", "cm-note");
    note.setAttribute("role", "status");
    box.classList.add("cm-root");
    box.replaceChildren(head, note, list, more);
    async function load(append) {
      tagChip.hidden = !state.tag; tagChip.textContent = `#${state.tag} ✕`;
      more.hidden = true;
      if (!append) { list.replaceChildren(); note.textContent = "Loading the community…"; }
      const q = new URLSearchParams({ limit: "12" });
      if (state.tag) q.set("tag", state.tag);
      if (state.product) q.set("product", state.product);
      if (append && state.next) q.set("cursor", state.next);
      try {
        const out = await call(cfg, `/posts?${q}`);
        note.textContent = "";
        for (const p of out.posts) list.append(card(p, { onOpen: open, onReport: report, onTag: (t) => { state.tag = t; load(); } }));
        if (!list.children.length) note.textContent = state.tag || state.product ? "Nothing posted here yet." : "Nothing posted yet. Design a robot and press “Share on the blog” to be the first.";
        state.next = out.next; more.hidden = !out.next;
      } catch (e) {
        note.textContent = e.message;
        note.classList.toggle("cm-offline", !!e.offline);
      }
    }
    load();
    return { reload: () => load() };
  }

  async function report(post, cardEl) {
    const dlg = dialog("Report this post");
    const why = el("textarea", "cm-input");
    why.maxLength = 300; why.rows = 3; why.placeholder = "What is wrong with it? (optional)";
    const check = el("div", "cm-check");
    const msg = el("p", "cm-note");
    const send = button("Send report", "cm-primary", async () => {
      send.disabled = true; msg.textContent = "Checking you are a person…";
      try {
        const turnstile = await humanCheck(check, cfg.siteKey, "report");
        msg.textContent = "Sending…";
        const out = await call(cfg, `/posts/${encodeURIComponent(post.id)}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: why.value, turnstile }) });
        msg.textContent = out.hidden ? "Thanks. The post is hidden until the owner reviews it." : "Thanks. The owner will look at it.";
        if (out.hidden) cardEl?.remove();
        send.hidden = true;
      } catch (e) { msg.textContent = e.message; send.disabled = false; }
    });
    dlg.body.append(el("p", "cm-small", "Reports are anonymous. A post with several reports is hidden until the owner looks at it."), why, check, msg);
    dlg.actions.append(button("Close", "cm-ghost", dlg.close), send);
  }

  /**
   * The share form. `design` = { title, recipe, snapshot } where snapshot() draws the 3D view and returns its canvas.
   * Shows exactly what will be posted; posts only when "Post publicly" is pressed.
   */
  async function share(design) {
    if (!RECIPE.test(design.recipe ?? "")) throw new Error("this design has no share link to post");
    const thumb = await thumbnailFrom(design.snapshot());
    const thumbUrl = URL.createObjectURL(thumb);
    const dlg = dialog("Share on the blog", () => URL.revokeObjectURL(thumbUrl));
    dlg.root.classList.add("cm-share");
    const field = (label, input) => { const l = el("label", "cm-field"); l.append(el("span", null, label), input); return l; };
    const title = el("input", "cm-input"); title.maxLength = 80; title.value = design.title.slice(0, 80); title.required = true;
    const desc = el("textarea", "cm-input"); desc.maxLength = 2000; desc.rows = 3; desc.placeholder = "What it is for, what you changed (links allowed, at most 3)";
    const tags = el("input", "cm-input"); tags.placeholder = "arm, desk, servo"; tags.maxLength = 140;
    const name = el("input", "cm-input"); name.maxLength = 40; name.placeholder = "Leave blank to post as Anonymous"; name.autocomplete = "off";
    const form = el("div", "cm-form");
    form.append(field("Title", title), field("Description", desc), field("Tags (up to 5)", tags), field("Display name (optional)", name));
    const prev = el("div", "cm-preview");
    const tagList = () => [...new Set(tags.value.split(/[,\s]+/).map((t) => t.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean))].slice(0, 5);
    const draft = () => ({ title: title.value.trim(), description: desc.value.trim(), name: name.value.trim(), tags: tagList(), product, recipe: design.recipe, thumbnail: thumbUrl });
    const paint = () => prev.replaceChildren(el("div", "cm-label", "Exactly what will be public:"), card(draft(), { preview: true }));
    for (const i of [title, desc, tags, name]) i.oninput = paint;
    paint();
    const privacy = el("p", "cm-small cm-privacy",
      "Public to anyone. Stored: the title, description, tags, name (if you give one), this picture and the design link. No login, email or IP address. You get a private link to delete it.");
    const check = el("div", "cm-check");
    const msg = el("p", "cm-note"); msg.setAttribute("role", "status");
    const post = button("Post publicly", "cm-primary", async () => {
      const d = draft();
      if (!d.title) { msg.textContent = "A title is needed."; title.focus(); return; }
      post.disabled = true; msg.textContent = "Checking you are a person…";
      try {
        const turnstile = await humanCheck(check, cfg.siteKey, "post");
        msg.textContent = "Posting…";
        const out = await call(cfg, "/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, thumbnail: await toBase64(thumb), turnstile }) });
        done(out);
      } catch (e) { msg.textContent = e.message; post.disabled = false; }
    });
    dlg.body.append(form, prev, privacy, check, msg);
    dlg.actions.append(button("Cancel", "cm-ghost", dlg.close), post);
    title.focus();

    function done(out) {
      const link = `${TTR_SITE}#community-delete=${out.id}.${out.delete_token}`;
      const box = el("div", "cm-done");
      box.append(el("p", null, out.status === "pending" ? "Posted. It appears once the owner approves it." : "Posted. It is on the board now."));
      box.append(el("p", "cm-small", "Your private delete link. It is shown only now; keep it to remove the post later:"));
      const inp = el("input", "cm-input cm-delete-link"); inp.readOnly = true; inp.value = link; inp.onclick = () => inp.select();
      box.append(inp);
      dlg.body.replaceChildren(box);
      dlg.actions.replaceChildren(
        button("Copy link", "cm-ghost", async () => { try { await navigator.clipboard.writeText(link); msg.textContent = "Copied."; } catch { inp.select(); } }),
        button("Done", "cm-primary", dlg.close));
      dlg.body.append(msg);
    }
  }

  /** Handles a private delete link (#community-delete=<id>.<token>) if the page was opened with one. */
  async function deleteFromLink() {
    const m = /[#&]community-delete=([A-Za-z0-9_-]{1,32})\.([A-Za-z0-9_-]{16,64})/.exec(location.hash);
    if (!m) return false;
    history.replaceState(null, "", location.pathname + location.search);
    const [, id, token] = m;
    const dlg = dialog("Delete your post");
    const msg = el("p", "cm-note", "This removes the post from the board for good.");
    const del = button("Delete it", "cm-danger", async () => {
      del.disabled = true; msg.textContent = "Deleting…";
      try { await call(cfg, `/posts/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Delete-Token": token } }); msg.textContent = "Deleted. It is gone from the board."; del.hidden = true; }
      catch (e) { msg.textContent = e.message; del.disabled = false; }
    });
    dlg.body.append(msg);
    dlg.actions.append(button("Keep it", "cm-ghost", dlg.close), del);
    return true;
  }

  // a delete link opened in a tab that already shows the site only changes the hash
  addEventListener("hashchange", () => { deleteFromLink(); });
  return { feed, share, report, deleteFromLink };
}

// ---------------------------------------------------------------- a modal dialog
function dialog(heading, onClose) {
  const root = el("div", "cm-dialog");
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", heading);
  const panel = el("div", "cm-panel");
  const body = el("div", "cm-dbody");
  const actions = el("div", "cm-dactions");
  panel.append(el("h2", "cm-dtitle", heading), body, actions);
  root.append(panel);
  const close = () => { root.remove(); document.removeEventListener("keydown", esc); onClose?.(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  root.onclick = (e) => { if (e.target === root) close(); };
  document.addEventListener("keydown", esc);
  document.body.append(root);
  return { root, body, actions, close };
}
