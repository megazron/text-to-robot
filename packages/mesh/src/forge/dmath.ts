// Deterministic maths for the forge. Browsers and Node ship different implementations of Math.sin, cos, exp, log, pow, atan2 and
// hypot, a last bit apart; in the forge one bit can tip a voxel or a boolean cut, so the armour a browser makes would not be the
// same bytes as the one Node makes. These use only +, -, *, / and sqrt (exact in IEEE 754 everywhere), after FreeBSD's msun / Sun's
// fdlibm (freely redistributable, "Developed at SunPro... Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved"). They are accurate to an ulp or two, which is all the forge needs.

const buf = new DataView(new ArrayBuffer(8));
const hi32 = (x: number) => { buf.setFloat64(0, x); return buf.getInt32(0); };
const fromWords = (h: number, l: number) => { buf.setInt32(0, h); buf.setInt32(4, l); return buf.getFloat64(0); };
/** 2^k for an integer k in the normal range, exactly */
const pow2 = (k: number) => fromWords((k + 1023) << 20, 0);

// ---- sin, cos (fdlibm k_sin.c, k_cos.c; Cody-Waite reduction by pi/2, fine for the forge's angles, |x| < 1e5)
const S1 = -0.16666666666666632, S2 = 0.00833333333332249, S3 = -0.0001984126982985795, S4 = 2.7557313707070068e-06, S5 = -2.5050760253406863e-08, S6 = 1.58969099521155e-10;
const C1 = 0.0416666666666666, C2 = -0.001388888888887411, C3 = 2.480158728947673e-05, C4 = -2.7557314351390663e-07, C5 = 2.087572321298175e-09, C6 = -1.1359647557788195e-11;
const PIO2_1 = 1.5707963267341256, PIO2_1T = 6.077100506506192e-11, PIO2_2 = 6.077100506303966e-11, PIO2_2T = 2.0222662487959506e-21, INVPIO2 = 0.6366197723675814;
function ksin(x: number, y: number): number {
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
function kcos(x: number, y: number): number {
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))), hz = 0.5 * z, w = 1.0 - hz;
  return w + (((1.0 - w) - hz) + (z * r - x * y));
}
function reduce(x: number): [number, number, number] {
  if (Math.abs(x) <= 0.7853981633974483) return [x, 0, 0];
  const n = Math.round(x * INVPIO2), fn = n;
  let r = x - fn * PIO2_1, w = fn * PIO2_1T;
  const y0 = r - w, t = r;
  w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w);
  const y1 = r - w;
  void y0;
  return [y1, (r - y1) - w, ((n % 4) + 4) % 4];
}
export function sin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  const [a, b, n] = reduce(x);
  return n === 0 ? ksin(a, b) : n === 1 ? kcos(a, b) : n === 2 ? -ksin(a, b) : -kcos(a, b);
}
export function cos(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  const [a, b, n] = reduce(x);
  return n === 0 ? kcos(a, b) : n === 1 ? -ksin(a, b) : n === 2 ? -kcos(a, b) : ksin(a, b);
}

// ---- exp (fdlibm e_exp.c)
const LN2HI = 0.6931471803691238, LN2LO = 1.9082149292705877e-10, INVLN2 = Math.LOG2E;
const P1 = 0.16666666666666602, P2 = -0.0027777777777015593, P3 = 6.613756321437934e-05, P4 = -1.6533902205465252e-06, P5 = 4.1381367970572385e-08;
export function exp(x: number): number {
  if (Number.isNaN(x)) return x;
  if (x > 709.78) return Infinity;
  if (x < -745.13) return 0;
  if (Math.abs(x) < 3.725290298461914e-09) return 1 + x;
  const k = Math.round(x * INVLN2), hi = x - k * LN2HI, lo = k * LN2LO, r = hi - lo;
  const t = r * r, c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1.0 - ((lo - (r * c) / (2.0 - c)) - hi);
  if (k >= -1021) return k > 1023 ? y * pow2(1023) * pow2(k - 1023) : y * pow2(k);
  return y * pow2(k + 1000) * pow2(-1000);
}

// ---- log (fdlibm e_log.c)
const Lg1 = 0.6666666666666735, Lg2 = 0.3999999999940942, Lg3 = 0.2857142874366239, Lg4 = 0.22222198432149784, Lg5 = 0.1818357216161805, Lg6 = 0.15313837699209373, Lg7 = 0.14798198605116586;
export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  let k = 0;
  if (x < 2.2250738585072014e-308) { x *= 18014398509481984; k -= 54; }   // subnormal: scale by 2^54
  let hx = hi32(x);
  k += (hx >> 20) - 1023; hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  buf.setFloat64(0, x); buf.setInt32(0, hx | (i ^ 0x3ff00000)); x = buf.getFloat64(0);
  k += i >> 20;
  const f = x - 1.0, s = f / (2.0 + f), dk = k, z = s * s, w = z * z;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7))), R = t2 + t1, hfsq = 0.5 * f * f;
  return dk * LN2HI - ((hfsq - (s * (hfsq + R) + dk * LN2LO)) - f);
}
/** x^y for x > 0 (all the forge needs), else 0 for x = 0 and y > 0 */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (y === 1) return x;
  if (y === 2) return x * x;
  return exp(y * log(x));
}

// ---- atan, atan2 (fdlibm s_atan.c, e_atan2.c)
const ATANHI = [0.4636476090008061, 0.7853981633974483, 0.982793723247329, 1.5707963267948966];
const ATANLO = [2.2698777452961687e-17, 3.061616997868383e-17, 1.3903311031230998e-17, 6.123233995736766e-17];
const AT = [0.3333333333333293, -0.19999999999876483, 0.14285714272503466, -0.11111110405462356, 0.09090887133436507, -0.0769187620504483,
  0.06661073137387531, -0.058335701337905735, 0.049768779946159324, -0.036531572744216916, 0.016285820115365782];
export function atan(x: number): number {
  if (Number.isNaN(x)) return x;
  const neg = x < 0; let a = Math.abs(x), id = -1;
  if (a > 4.4e16) return neg ? -ATANHI[3] - ATANLO[3] : ATANHI[3] + ATANLO[3];
  if (a < 0.4375) { if (a < 1e-29) return x; }
  else if (a < 1.1875) { if (a < 0.6875) { id = 0; a = (2.0 * a - 1.0) / (2.0 + a); } else { id = 1; a = (a - 1.0) / (a + 1.0); } }
  else if (a < 2.4375) { id = 2; a = (a - 1.5) / (1.0 + 1.5 * a); }
  else { id = 3; a = -1.0 / a; }
  const z = a * a, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10]))))), s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) { const r = a - a * (s1 + s2); return neg ? -r : r; }
  const r = ATANHI[id] - ((a * (s1 + s2) - ATANLO[id]) - a);
  return neg ? -r : r;
}
const PI = Math.PI, PI_LO = 1.2246467991473532e-16;
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
  if (x === 1) return atan(y);
  if (y === 0) return x > 0 || Object.is(x, 0) ? y : (Object.is(y, -0) ? -PI : PI);
  if (x === 0) return y > 0 ? PI / 2 : -PI / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Math.atan2(y, x);
  const z = atan(Math.abs(y / x));
  if (x > 0) return y < 0 ? -z : z;
  const r = PI - (z - PI_LO);
  return y < 0 ? -r : r;
}
export const acos = (x: number): number => atan2(Math.sqrt(Math.max(0, (1 - x) * (1 + x))), x);
export const hypot = (...v: number[]): number => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s); };
