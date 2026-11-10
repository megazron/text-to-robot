// Small procedural geometry for the 3D electronics view: boxes, cylinders and rounded slabs, collected per material.
// Everything is in millimetres in the part's own frame (the catalog bbox frame, which is the component link's frame).
export type V3 = [number, number, number];
/** The look of a surface; the viewer and the GLB writer map each to a physical material. */
export type Mat = "pcb_green" | "pcb_blue" | "pcb_red" | "pcb_black" | "pcb_purple" | "pcb_teal" | "ic" | "gold" | "silver" | "header" | "plastic_black" | "plastic_white" | "plastic_red"
  | "plastic_orange" | "plastic_blue" | "plastic_yellow" | "plastic_grey" | "metal" | "copper" | "cell_blue" | "cell_teal" | "rubber" | "lens";
export interface MeshPart { mat: Mat; v: number[]; f: number[]; }
export interface Label { text: string; at: V3; w: number; h: number; normal: V3; up: V3; color: string; }
export interface Model { meshes: MeshPart[]; labels: Label[]; }

export class Builder {
  private by = new Map<Mat, MeshPart>();
  labels: Label[] = [];
  private part(m: Mat) { let p = this.by.get(m); if (!p) { p = { mat: m, v: [], f: [] }; this.by.set(m, p); } return p; }
  /** axis-aligned box */
  box(m: Mat, a: V3, b: V3) {
    const p = this.part(m), o = p.v.length / 3;
    const [x0, y0, z0] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [x1, y1, z1] = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    // 24 vertices (flat shading per face), 12 triangles
    const faces: [V3, V3, V3, V3][] = [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]],
      [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
    ];
    faces.forEach((q, i) => { for (const v of q) p.v.push(...v); const k = o + i * 4; p.f.push(k, k + 1, k + 2, k, k + 2, k + 3); });
  }
  /** cylinder from a to b, radius r */
  cyl(m: Mat, a: V3, b: V3, r: number, seg = 16, caps = true) {
    const p = this.part(m), o = p.v.length / 3;
    const d = sub(b, a), L = len(d); if (L < 1e-9) return;
    const w = scale(d, 1 / L), u = perp(w), v = cross(w, u);
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2, c = Math.cos(t) * r, s = Math.sin(t) * r;
      const q = add(scale(u, c), scale(v, s));
      p.v.push(...add(a, q), ...add(b, q));
    }
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg, a0 = o + 2 * i, a1 = o + 2 * j; p.f.push(a0, a1, a1 + 1, a0, a1 + 1, a0 + 1); }
    if (caps) {
      const ca = p.v.length / 3; p.v.push(...a); const cb = ca + 1; p.v.push(...b);
      for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; p.f.push(ca, o + 2 * j, o + 2 * i, cb, o + 2 * i + 1, o + 2 * j + 1); }
    }
  }
  /** square pin from a to b (header pins, tabs) */
  pin(m: Mat, a: V3, b: V3, s = 0.64) {
    const d = sub(b, a), L = len(d); if (L < 1e-9) return;
    // axis-aligned pins only (headers are): a box around the segment
    const h = s / 2; this.box(m, [Math.min(a[0], b[0]) - (d[0] ? 0 : h), Math.min(a[1], b[1]) - (d[1] ? 0 : h), Math.min(a[2], b[2]) - (d[2] ? 0 : h)], [Math.max(a[0], b[0]) + (d[0] ? 0 : h), Math.max(a[1], b[1]) + (d[1] ? 0 : h), Math.max(a[2], b[2]) + (d[2] ? 0 : h)]);
  }
  label(text: string, at: V3, w: number, h: number, color = "#ffffff", normal: V3 = [0, 0, 1], up: V3 = [0, 1, 0]) { this.labels.push({ text, at, w, h, normal, up, color }); }
  done(): Model { return { meshes: [...this.by.values()].filter((p) => p.f.length), labels: this.labels }; }
}

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** any unit vector perpendicular to w */
export function perp(w: V3): V3 { const a: V3 = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return unit(cross(w, a)); }
