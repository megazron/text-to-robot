// A 1:1 Iron Man style helmet built like the motorised kits sold today: cranium
// shell with a raised crest, a faceplate that rotates up at the temples, two
// cheek panels that swing outward, a crown panel that lifts to clear the
// faceplate, ear pods, glowing eye lenses, a forehead plate and a neck collar.
// Frame: origin at ear level in the head centre; X forward, Y left, Z up. Metres.
import { type Mesh, type V3, merge, translate, rotate, loft, subdivide, shell, mirrorY, scale, norm } from "./core.ts";
import { superArc, shelledLoft, disc, resample } from "./shapes.ts";

export const HELMET = { W: 0.205, D: 0.27, H: 0.25, thick: 0.0045 };

// front-face cross-sections: [z, frontX, halfWidth, exponent, ridge]
const FACE: [number, number, number, number, number][] = [
  [-0.128, 0.105, 0.032, 2.0, 0.010],   // chin point
  [-0.104, 0.120, 0.058, 2.3, 0.008],   // jaw
  [-0.080, 0.130, 0.080, 2.5, 0.006],   // mouth line
  [-0.056, 0.136, 0.092, 2.7, 0.005],   // lower cheek flare
  [-0.026, 0.140, 0.101, 2.9, 0.004],   // cheek (widest)
  [ 0.010, 0.138, 0.101, 2.9, 0.004],   // under-eye
  [ 0.036, 0.139, 0.100, 2.8, 0.006],   // eye line (nearly flush with the brow)
  [ 0.056, 0.144, 0.098, 2.7, 0.012],   // brow ledge (protrudes)
  [ 0.066, 0.131, 0.094, 2.5, 0.006],   // brow crease (steps back)
  [ 0.088, 0.117, 0.087, 2.4, 0.004],   // forehead (top of faceplate)
];

/** point on the faceplate's outer surface at (y, z), interpolating the FACE rows (includes the nose ridge) */
export function faceSurface(y: number, z: number, proud = 0): V3 {
  let i = 0; while (i < FACE.length - 2 && FACE[i + 1][0] < z) i++;
  const [z0, fx0, hw0, e0, r0] = FACE[i], [z1, fx1, hw1, e1, r1] = FACE[i + 1];
  const u = Math.min(1, Math.max(0, (z - z0) / (z1 - z0 || 1)));
  const fx = fx0 + (fx1 - fx0) * u, hw = hw0 + (hw1 - hw0) * u, e = e0 + (e1 - e0) * u, ridge = r0 + (r1 - r0) * u;
  const t = Math.asin(Math.min(1, Math.abs(y) / hw));
  const x = Math.pow(Math.max(0, Math.cos(t)), 2 / e) * fx + ridge * Math.max(0, 1 - Math.abs(t) / 0.22);
  const n = norm([1, 0, 0]);  // outward is essentially +x on the face front
  return [x + proud * n[0], y, z];
}

const N = 33; // points per arc (dense -> crisp brow ledge without smoothing)

function faceSections(a0: number, a1: number): V3[][] {
  return FACE.map(([z, fx, hw, e, ridge]) => {
    const arc = superArc(fx, hw, z, a0, a1, N, e);
    // vertical nose/centre ridge: push the centre points forward a little
    return arc.map((p) => { const t = Math.atan2(p[1], p[0]); const w = Math.max(0, 1 - Math.abs(t) / 0.22); return [p[0] + ridge * w, p[1], p[2]] as V3; });
  });
}

/** central faceplate (nose, brow, chin) -- hinged at the temples */
export function faceplate(): Mesh {
  const sec = faceSections(-0.78, 0.78);
  return shelledLoft(sec, HELMET.thick, 0);
}
/** side cheek panels -- hinged on vertical axes at the temples, swing outward */
export function cheekPanel(side: "left" | "right"): Mesh {
  const m = shelledLoft(faceSections(0.70, 1.62), HELMET.thick, 0);
  return side === "left" ? m : mirrorY(m);
}
/** cranium: back half + top, with the raised centre crest */
export function cranium(): Mesh {
  const rows: [number, number, number, number][] = [   // z, rx (front/back extent), ry, e
    [-0.075, 0.100, 0.092, 2.2], [-0.030, 0.118, 0.100, 2.4], [0.020, 0.124, 0.102, 2.5], [0.065, 0.120, 0.097, 2.5],
    [0.098, 0.100, 0.082, 2.3], [0.118, 0.066, 0.055, 2.1], [0.126, 0.025, 0.020, 2.0],
  ];
  // back half (angles 90..270 deg) as an open surface, then shelled
  const sections = rows.map(([z, rx, ry, e]) => superArc(rx, ry, z, Math.PI / 2 - 0.02, (3 * Math.PI) / 2 + 0.02, 33, e, -0.012));
  const back = shelledLoft(sections, HELMET.thick, 1);
  // crest: a raised ridge along the top centre line from the forehead to the back
  const crestPts: V3[] = [[0.095, 0, 0.095], [0.06, 0, 0.118], [0.0, 0, 0.130], [-0.06, 0, 0.126], [-0.11, 0, 0.100], [-0.128, 0, 0.060]];
  const crest = ridge(crestPts, 0.016, 0.012);
  return merge(back, crest);
}
/** crown panel: the top-front cap that lifts to let the faceplate rotate up (Mark 85 style) */
export function crownPanel(): Mesh {
  const rows: [number, number, number, number][] = [[0.088, 0.116, 0.087, 2.4], [0.104, 0.098, 0.078, 2.3], [0.118, 0.066, 0.055, 2.1], [0.125, 0.030, 0.024, 2.0]];
  const sections = rows.map(([z, rx, ry, e]) => superArc(rx, ry, z, -1.05, 1.05, 21, e));
  return shelledLoft(sections, HELMET.thick, 1);
}
/** forehead plate: layered gold accent over the brow */
export function foreheadPlate(): Mesh {
  const sec = FACE.slice(8, 10).map(([z, fx, hw, e]) => superArc(fx + 0.0035, hw + 0.001, z + 0.002, -0.38, 0.38, 13, e));
  sec.push(superArc(0.108, 0.080, 0.100, -0.38, 0.38, 13, 2.3));
  return shelledLoft(sec, 0.003, 0);
}
/** eye: an angled trapezoid slit just under the brow ledge -- dark socket recess + glowing lens proud of the surface */
const EYE: [number, number][] = [[0.019, 0.033], [0.068, 0.039], [0.068, 0.054], [0.024, 0.050]];   // (y, z), inner-low .. outer-high
function eyeRing(outline: [number, number][], side: "left" | "right", proud: number): V3[] {
  const sgn = side === "left" ? 1 : -1;
  return outline.map(([y, z]) => { const p = faceSurface(y, z, proud); return [p[0], sgn * y, z] as V3; });
}
export function eyeLens(side: "left" | "right"): Mesh {
  const outer = eyeRing(EYE, side, 0.006), inner = eyeRing(EYE, side, -0.006);
  return loft(side === "left" ? [inner, outer] : [outer, inner], { closed: true, capStart: true, capEnd: true });
}
export function eyeSocket(side: "left" | "right"): Mesh {
  const O: [number, number][] = [[0.015, 0.029], [0.074, 0.036], [0.074, 0.058], [0.020, 0.054]];
  const outer = eyeRing(O, side, 0.0015), inner = eyeRing(O, side, -0.009);
  return loft(side === "left" ? [inner, outer] : [outer, inner], { closed: true, capStart: true, capEnd: true });
}
/** mouth line: a thin dark horizontal recess strip across the lower faceplate */
export function mouthLine(): Mesh {
  const front = 0.130, hw = 0.080, e = 2.5;
  const arc = (d: number, z: number) => superArc(front + d, hw + d * 0.5, z, -0.55, 0.55, 15, e);
  const rings = [arc(0.0015, -0.084), arc(0.0015, -0.079), arc(-0.006, -0.079), arc(-0.006, -0.084)];
  return loft(rings, { closed: true, capStart: true, capEnd: true });
}
/** ear pod: chamfered disc on the temple */
export function earPod(side: "left" | "right"): Mesh {
  const s = side === "left" ? 1 : -1;
  const d = rotate(disc(0.036, 0.014, 0.004, 36), "x", -s * Math.PI / 2);   // disc axis -> +-Y
  return translate(d, [0.0, s * 0.098, 0.0]);
}
/** neck collar ring under the jaw */
export function neckCollar(): Mesh {
  const rows: [number, number, number][] = [[-0.135, 0.078, 0.074], [-0.118, 0.088, 0.082], [-0.100, 0.096, 0.088]];
  const sections = rows.map(([z, rx, ry]) => superArc(rx, ry, z, 0, 2 * Math.PI - (2 * Math.PI) / 32, 32, 2.3, -0.01));
  return shell(subdivide(loft(sections, { closed: true }), 1), 0.005);
}
/** chin guard under the faceplate (jaw line), hinged down slightly */
export function chinGuard(): Mesh {
  const sec = [[-0.132, 0.100, 0.070, 2.2, 0.0], [-0.112, 0.116, 0.084, 2.4, 0.0], [-0.096, 0.122, 0.092, 2.5, 0.0]].map(([z, fx, hw, e]) =>
    superArc(fx, hw, z, -1.35, 1.35, 21, e));
  return shelledLoft(sec, 0.004, 1);
}

/** a raised ridge along a 3D polyline: rectangular cross-section, tapered ends */
function ridge(path: V3[], width: number, height: number): Mesh {
  const P = resample(path, 12); const sections: V3[][] = [];
  for (let i = 0; i < P.length; i++) {
    const t = i / (P.length - 1); const k = Math.sin(Math.PI * t) ** 0.5; const w = width * k / 2, h = height * k;
    const p = P[i]; const dir = i < P.length - 1 ? [P[i + 1][0] - p[0], 0, P[i + 1][2] - p[2]] : [p[0] - P[i - 1][0], 0, p[2] - P[i - 1][2]];
    const l = Math.hypot(dir[0], dir[2]) || 1; const up: V3 = [-dir[2] / l, 0, dir[0] / l];  // normal in XZ plane
    sections.push([[p[0], -w, p[2]], [p[0] + up[0] * h, -w * 0.6, p[2] + up[2] * h], [p[0] + up[0] * h, w * 0.6, p[2] + up[2] * h], [p[0], w, p[2]]]);
  }
  return loft(sections, { closed: true, capStart: true, capEnd: true });
}

/** all helmet parts, in the helmet frame */
export function helmetParts(): Record<string, Mesh> {
  return {
    cranium: cranium(), crown_panel: crownPanel(), forehead_plate: foreheadPlate(), faceplate: faceplate(), chin_guard: chinGuard(),
    left_cheek_panel: cheekPanel("left"), right_cheek_panel: cheekPanel("right"),
    left_eye_socket: eyeSocket("left"), right_eye_socket: eyeSocket("right"), left_eye_lens: eyeLens("left"), right_eye_lens: eyeLens("right"), mouth_line: mouthLine(),
    left_ear_pod: earPod("left"), right_ear_pod: earPod("right"), neck_collar: neckCollar(),
  };
}
