// Motion and touch primitives for the page: spring physics, the turning dial,
// the bottom sheet and the transform flash. Everything animates transform or opacity only.

export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
export const SPRING = "cubic-bezier(.2,1.2,.3,1)";

/** Damped spring from `from` to `to`; returns a function that stops it. */
export function spring({ from, to, velocity = 0, stiffness = 240, damping = 24, onUpdate, onRest }) {
  if (calm()) { onUpdate(to); onRest?.(); return () => {}; }
  let x = from, v = velocity, last = performance.now(), raf = 0;
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000) / 4; last = now;
    for (let i = 0; i < 4; i++) { v += (-stiffness * (x - to) - damping * v) * dt; x += v * dt; }
    if (Math.abs(x - to) < 0.02 && Math.abs(v) < 0.2) { onUpdate(to); onRest?.(); return; }
    onUpdate(x); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function popIn(node, { y = 12, scale = 0.985, duration = 340 } = {}) {
  if (calm()) return;
  node.animate([{ opacity: 0, transform: `translateY(${y}px) scale(${scale})` }, { opacity: 1, transform: "none" }], { duration, easing: SPRING });
}

/**
 * A ring that turns in detents. The ring leans towards the nearest stop while it is dragged,
 * ticks at each detent, and settles on a spring with a green pulse.
 * Keyboard: arrows, Home and End turn it; Enter or Space presses the core.
 */
export class Dial {
  constructor(root, { label, stops, onChange, onSettle, onPress, coreLabel }) {
    Object.assign(this, { root, stops, onChange, onSettle, onPress, coreLabel });
    this.step = 360 / stops.length; this.index = 0; this.rot = 0; this.stop = () => {};
    root.replaceChildren();
    this.body = document.createElement("div");
    this.body.className = "dial-body"; this.body.tabIndex = 0;
    this.body.setAttribute("role", "slider"); this.body.setAttribute("aria-label", label);
    this.body.setAttribute("aria-valuemin", "1"); this.body.setAttribute("aria-valuemax", String(stops.length));
    this.ring = document.createElement("div"); this.ring.className = "dial-ring";
    this.nodes = stops.map((s, i) => {
      const n = document.createElement("span"); n.className = "dial-stop"; n.dataset.i = i;
      n.style.setProperty("--a", `${i * this.step}deg`);
      n.innerHTML = s.icon ? `<svg class="ico" aria-hidden="true"><use href="#${s.icon}"/></svg>` : "<i></i>";
      this.ring.append(n); return n;
    });
    const part = (c) => { const n = document.createElement("i"); n.className = c; return n; };
    this.pulseNode = part("dial-pulse");
    this.body.append(part("dial-lit"), this.ring, part("dial-pointer"), this.pulseNode);
    this.core = document.createElement("button"); this.core.type = "button"; this.core.className = "dial-core";
    this.coreFace = document.createElement("span"); this.coreFace.className = "dial-face"; this.core.append(this.coreFace);
    this.core.onclick = () => { this.pulse(); haptic(14); this.onPress?.(this.index); };
    root.append(this.body, this.core);
    this.bind(); this.paint(); this.face();
  }
  paint(lean = true) {
    // the ring leans into each detent, which reads as a physical click under the finger
    const pull = lean ? Math.sin((this.rot / this.step) * 2 * Math.PI) * this.step * 0.07 : 0;
    this.ring.style.transform = `rotate(${this.rot - pull}deg)`;
  }
  face() {
    const s = this.stops[this.index];
    this.coreFace.replaceChildren();
    if (s.icon) this.coreFace.insertAdjacentHTML("beforeend", `<svg class="ico" aria-hidden="true"><use href="#${s.icon}"/></svg>`);
    if (s.big) { const b = document.createElement("b"); b.textContent = s.big; this.coreFace.append(b); }
    const t = document.createElement("span"); t.textContent = s.label; this.coreFace.append(t);
    this.core.setAttribute("aria-label", this.coreLabel?.(s) ?? s.label);
    this.body.setAttribute("aria-valuenow", String(this.index + 1));
    this.body.setAttribute("aria-valuetext", s.label);
    this.nodes.forEach((n, i) => n.classList.toggle("on", i === this.index));
    popIn(this.coreFace, { y: 0, scale: 0.8, duration: 260 });
  }
  pulse() {
    if (calm()) return;
    this.pulseNode.animate([{ opacity: 0.9, transform: "scale(.72)" }, { opacity: 0, transform: "scale(1.22)" }], { duration: 620, easing: "cubic-bezier(.2,.7,.2,1)" });
  }
  stopFor(rot) { const n = this.stops.length; return ((Math.round(-rot / this.step) % n) + n) % n; }
  track() {
    const i = this.stopFor(this.rot);
    if (i !== this.index) { this.index = i; haptic(6); this.face(); this.onChange?.(i); }
  }
  /** Turn to a stop by the short way round. */
  go(i, { silent = false, velocity = 0 } = {}) {
    const n = this.stops.length; i = ((i % n) + n) % n;
    const here = Math.round(-this.rot / this.step);
    const delta = ((((i - here) % n) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
    const target = -(here + delta) * this.step;
    this.stop();
    if (i !== this.index) { this.index = i; this.face(); if (!silent) { haptic(6); this.onChange?.(i); } }
    this.stop = spring({ from: this.rot, to: target, velocity, stiffness: 300, damping: 21,
      onUpdate: (x) => { this.rot = x; this.paint(false); },
      onRest: () => { if (!silent) { this.pulse(); haptic(12); this.onSettle?.(this.index); } } });
  }
  bind() {
    const b = this.body;
    const angle = (e) => { const r = b.getBoundingClientRect(); return (Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2) * 180) / Math.PI; };
    let last = 0, moved = 0, vel = 0, t = 0, drag = false, hit = null;
    b.addEventListener("pointerdown", (e) => {
      drag = true; moved = 0; vel = 0; last = angle(e); t = e.timeStamp;
      hit = e.target.closest(".dial-stop"); this.stop(); b.setPointerCapture(e.pointerId); b.classList.add("held");
    });
    b.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const a = angle(e); const d = ((a - last + 540) % 360) - 180; last = a;
      const dt = Math.max(1, e.timeStamp - t); t = e.timeStamp;
      vel = 0.7 * vel + 0.3 * ((d / dt) * 1000); moved += Math.abs(d);
      this.rot += d; this.paint(); this.track();
    });
    const end = () => {
      if (!drag) return; drag = false; b.classList.remove("held");
      if (moved < 3 && hit) return this.go(Number(hit.dataset.i));
      const ahead = this.rot + Math.max(-60, Math.min(60, vel * 0.09));   // a flick carries on to the next stops
      this.go(this.stopFor(ahead), { velocity: vel * 0.4 });
    };
    b.addEventListener("pointerup", end); b.addEventListener("pointercancel", end);
    let wheel = 0;
    b.addEventListener("wheel", (e) => {
      e.preventDefault(); wheel += e.deltaY;
      if (Math.abs(wheel) >= 50) { this.go(this.index + Math.sign(wheel)); wheel = 0; }
    }, { passive: false });
    b.addEventListener("keydown", (e) => {
      const n = this.stops.length;
      const to = { ArrowRight: this.index + 1, ArrowUp: this.index + 1, ArrowLeft: this.index - 1, ArrowDown: this.index - 1, Home: 0, End: n - 1 }[e.key];
      if (to != null) { e.preventDefault(); this.go(to); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.core.click(); }
    });
  }
}

/**
 * Bottom sheet with peek, half and full stops on phones; a docked side panel on wide screens.
 * `onMove(top)` receives the sheet's top edge in px so the 3D stage can make room for it.
 */
export class Sheet {
  constructor({ el, grabber, onMove }) {
    Object.assign(this, { el, grabber, onMove });
    this.wide = matchMedia("(min-width: 900px)"); this.y = 0; this.snap = "half"; this.stop = () => {};
    const relayout = () => this.layout();
    this.wide.addEventListener("change", relayout); addEventListener("resize", relayout);
    this.bind(); this.layout();
  }
  get docked() { return this.wide.matches; }
  stops() {
    const h = this.el.offsetHeight, chrome = innerHeight - document.querySelector("#dock").getBoundingClientRect().top + 76;   // dock, prompt bar, safe area
    const half = Math.min(h, innerHeight * 0.62, Math.max(innerHeight * 0.5, 474));
    return { full: 0, half: Math.max(0, h - half), peek: Math.max(0, h - chrome - 44) };
  }
  place(y) { this.y = y; this.el.style.transform = `translate3d(0,${y}px,0)`; this.onMove?.(this.el.offsetTop + y); }
  rest() { this.el.style.setProperty("--sheet-y", `${Math.round(this.y)}px`); this.grabber.setAttribute("aria-expanded", String(this.snap !== "peek")); }
  layout() {
    this.stop();
    if (this.docked) { this.el.style.transform = ""; this.el.style.setProperty("--sheet-y", "0px"); this.onMove?.(null); return; }
    this.place(this.stops()[this.snap]); this.rest();
  }
  go(name, velocity = 0) {
    this.snap = name;
    if (this.docked) return;
    this.stop();
    this.stop = spring({ from: this.y, to: this.stops()[name], velocity, stiffness: 320, damping: 32, onUpdate: (y) => this.place(y), onRest: () => this.rest() });
  }
  /** Raise the sheet at least to the given stop. */
  atLeast(name) { const o = ["peek", "half", "full"]; if (o.indexOf(this.snap) < o.indexOf(name)) this.go(name); }
  bind() {
    const g = this.grabber; let start = 0, from = 0, last = 0, t = 0, v = 0, active = false, moved = 0, s = null;
    g.addEventListener("pointerdown", (e) => {
      if (this.docked) return;
      active = true; s = this.stops(); start = last = e.clientY; from = this.y; t = e.timeStamp; v = 0; moved = 0;
      this.stop(); g.setPointerCapture(e.pointerId);
    });
    g.addEventListener("pointermove", (e) => {
      if (!active) return;
      const dt = Math.max(1, e.timeStamp - t); v = 0.7 * v + 0.3 * (((e.clientY - last) / dt) * 1000);
      last = e.clientY; t = e.timeStamp; moved = Math.max(moved, Math.abs(e.clientY - start));
      const raw = from + e.clientY - start;
      // rubber band past the ends
      const y = raw < 0 ? raw * 0.2 : raw > s.peek ? s.peek + (raw - s.peek) * 0.2 : raw;
      this.place(y);
    });
    const end = () => {
      if (!active) return; active = false;
      if (moved < 6) return this.go({ peek: "half", half: "full", full: "half" }[this.snap]);
      const aim = this.y + v * 0.18;
      const name = Object.keys(s).reduce((a, b) => (Math.abs(s[b] - aim) < Math.abs(s[a] - aim) ? b : a));
      haptic(6); this.go(name, v);
    };
    g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
    g.addEventListener("keydown", (e) => {
      const up = { peek: "half", half: "full", full: "full" }, down = { full: "half", half: "peek", peek: "peek" };
      if (e.key === "ArrowUp") { e.preventDefault(); this.go(up[this.snap]); }
      if (e.key === "ArrowDown") { e.preventDefault(); this.go(down[this.snap]); }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.go(this.snap === "full" ? "half" : up[this.snap]); }
    });
  }
}

/** The on-screen keyboard covers fixed bars on iOS; lift the prompt bar above it. */
export function followKeyboard() {
  const vv = globalThis.visualViewport; if (!vv) return;
  const fit = () => {
    const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb", `${kb}px`);
    document.body.classList.toggle("kb", kb > 80);
  };
  vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit);
}

/** The moment a robot appears: a green bloom, two shock rings, and the model scaling up out of it. */
export function transformFlash(canvas, centre, strong = true) {
  if (calm()) { canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
  const f = document.querySelector("#flash");
  f.style.setProperty("--cx", `${centre.x}px`); f.style.setProperty("--cy", `${centre.y}px`);
  const [bloom, a, b, spin] = f.children, out = "cubic-bezier(.16,.8,.24,1)";
  bloom.animate([{ opacity: 0, transform: "scale(.4)" }, { opacity: strong ? 0.95 : 0.5, transform: "scale(1)", offset: 0.22 }, { opacity: 0, transform: "scale(1.5)" }], { duration: strong ? 760 : 460, easing: out });
  a.animate([{ opacity: 1, transform: "scale(.08)" }, { opacity: 0, transform: "scale(1)" }], { duration: 760, easing: out });
  if (strong) {
    b.animate([{ opacity: 0.8, transform: "scale(.04)" }, { opacity: 0, transform: "scale(.72)" }], { duration: 900, delay: 110, easing: out, fill: "backwards" });
    spin.animate([{ opacity: 0, transform: "rotate(-70deg) scale(.5)" }, { opacity: 1, transform: "rotate(0) scale(.82)", offset: 0.4 }, { opacity: 0, transform: "rotate(36deg) scale(1)" }], { duration: 820, easing: out });
  }
  canvas.animate([{ opacity: 0, transform: "scale(.72)" }, { opacity: 1, transform: "scale(1.035)", offset: 0.62 }, { opacity: 1, transform: "scale(1)" }], { duration: 760, easing: out });
  haptic(strong ? 24 : 10);
}
