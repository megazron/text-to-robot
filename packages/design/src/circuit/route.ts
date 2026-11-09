// Orthogonal maze router on a square grid. Wires of different nets may cross at right angles but never run along the same
// grid edge, never share a corner or an end, and never enter a blocked cell (a symbol, a label, a text). A* over
// (cell, heading) with a cost per step, per bend and per crossing, so routes are short, straight and avoid each other.
import type { Box, Pt } from "./draw.ts";

const DIRS: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export type Heading = 0 | 1 | 2 | 3; // +x, +y, -x, -y

class Heap { a: [number, number][] = []; push(k: number, v: number) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop(): number { const a = this.a, top = a[0][1], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; } }

export interface RouteEnd { at: Pt; /** heading the wire must leave this end with (outward from the pin) */ out: Heading; }
export class Router {
  nx: number; ny: number;
  blocked: Uint8Array; // 1 = obstacle
  h: Int32Array; v: Int32Array; // net id + 1 occupying the cell along x / along y
  node: Int32Array; // net id + 1 owning the cell as a corner or an end
  reserved: Int32Array; // pin ends: only that net may enter
  w: number; hgt: number; g: number;
  constructor(w: number, hgt: number, g: number) {
    this.w = w; this.hgt = hgt; this.g = g;
    this.nx = Math.ceil(w / g) + 1; this.ny = Math.ceil(hgt / g) + 1;
    const n = this.nx * this.ny;
    this.blocked = new Uint8Array(n); this.h = new Int32Array(n); this.v = new Int32Array(n); this.node = new Int32Array(n); this.reserved = new Int32Array(n);
  }
  cell(p: Pt) { return Math.round(p[1] / this.g) * this.nx + Math.round(p[0] / this.g); }
  pt(c: number): Pt { return [(c % this.nx) * this.g, Math.floor(c / this.nx) * this.g]; }
  /** Block every grid point strictly inside the box (a wire may run along its edge only if `edge`). */
  block(b: Box, edge = false) {
    const g = this.g, e = edge ? 0 : 1e-6;
    const x0 = Math.ceil((b.x - e) / g), x1 = Math.floor((b.x + b.w + e) / g), y0 = Math.ceil((b.y - e) / g), y1 = Math.floor((b.y + b.h + e) / g);
    for (let y = Math.max(0, y0); y <= Math.min(this.ny - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.nx - 1, x1); x++) this.blocked[y * this.nx + x] = 1;
  }
  reserve(p: Pt, net: number) { this.reserved[this.cell(p)] = net + 1; }
  private free(c: number, net: number, axis: "h" | "v" | "node") {
    if (this.blocked[c]) return false;
    const r = this.reserved[c]; if (r && r !== net + 1) return false;
    const nd = this.node[c]; if (nd && nd !== net + 1) return false;
    const oh = this.h[c], ov = this.v[c];
    if (axis === "h") return !oh || oh === net + 1;
    if (axis === "v") return !ov || ov === net + 1;
    return (!oh || oh === net + 1) && (!ov || ov === net + 1);
  }
  /** Route one two-ended net. Returns the corner points, or null. */
  route(net: number, a: RouteEnd, b: RouteEnd, o: { bend?: number; cross?: number; limit?: number; late?: number } = {}): Pt[] | null {
    const bend = o.bend ?? 6, crossC = o.cross ?? 4, nx = this.nx, N = nx * this.ny;
    const s = this.cell(a.at), t = this.cell(b.at);
    // the end the wire arrives at is entered heading against its outward direction
    const tIn = ((b.out + 2) % 4) as Heading;
    const cost = new Float64Array(N * 4).fill(Infinity), from = new Int32Array(N * 4).fill(-1);
    const heap = new Heap(), hx = (c: number) => Math.abs((c % nx) - (t % nx)) + Math.abs(Math.floor(c / nx) - Math.floor(t / nx));
    const start = s * 4 + a.out; cost[start] = 0; heap.push(hx(s), start);
    let limit = o.limit ?? 400000, done = -1;
    while (heap.size && limit-- > 0) {
      const st = heap.pop(), c = st >> 2, d = st & 3, base = cost[st];
      if (c === t && d === tIn) { done = st; break; }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue;
        const turn = nd !== d;
        if (turn && (c === s || !this.free(c, net, "node"))) continue;   // no bend on the pin end itself
        const [dx, dy] = DIRS[nd], x = (c % nx) + dx, y = Math.floor(c / nx) + dy;
        if (x < 0 || y < 0 || x >= nx || y >= this.ny) continue;
        const c2 = y * nx + x, axis = nd % 2 === 0 ? "h" : "v";
        if (c2 !== t && !this.free(c2, net, axis)) continue;
        if (c2 === t && nd !== tIn) continue;
        const other = axis === "h" ? this.v[c2] : this.h[c2];
        // `late` makes a bend a little cheaper near the far end, so of equal routes the one that turns late wins and bundles nest
        const step = 1 + (turn ? bend + (o.late ?? 0) * hx(c) : 0) + (other && other !== net + 1 ? crossC : 0);
        const st2 = c2 * 4 + nd, nc = base + step;
        if (nc < cost[st2]) { cost[st2] = nc; from[st2] = st; heap.push(nc + hx(c2), st2); }
      }
    }
    if (done < 0) return null;
    const cells: number[] = [];
    for (let st = done; st >= 0; st = from[st]) cells.unshift(st);
    // occupy and keep the corners
    const pts: Pt[] = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i] >> 2, d = cells[i] & 3, next = cells[i + 1], nd = next !== undefined ? next & 3 : d;
      const corner = i === 0 || i === cells.length - 1 || nd !== d;
      if (corner) { this.node[c] = net + 1; this.h[c] = this.h[c] || net + 1; this.v[c] = this.v[c] || net + 1; }
      else if (d % 2 === 0) this.h[c] = net + 1; else this.v[c] = net + 1;
      if (i > 0 && (cells[i - 1] >> 2) === c) continue;
      if (corner) pts.push(this.pt(c));
    }
    // the first heading is set on the start cell, so a bend right after it shows up as a corner there
    return dedupe(pts);
  }
}
function dedupe(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const q of p) { const l = out[out.length - 1]; if (l && l[0] === q[0] && l[1] === q[1]) continue; out.push(q); }
  // drop collinear middles
  for (let i = out.length - 2; i > 0; i--) { const a = out[i - 1], b = out[i], c = out[i + 1]; if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1); }
  return out;
}
