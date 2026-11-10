// Shared helpers for the family designers: component bodies in mm, printed gear/rack teeth,
// faceted armour shells, aluminium tube links, bill-of-materials cost.
import type { Link, SensorType } from "@ttr/robot-schema";
import { part, type Vec3 } from "@ttr/parts";
import { frame, mul, invert, apply, toPose, dxlPlug, type Mat4, type Op } from "@ttr/solid";
import type { Assembly } from "../assembly.ts";

export const bodyMm = (key: string) => { const b = part(key).bbox_mm!; return { min: [...b.min] as Vec3, max: [...b.max] as Vec3 }; };
export const rotZ = (deg: number): Mat4 => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
export const at = (T: Mat4, of: Op[]): Op => ({ op: "at", T, of });
/** Ops given in world coordinates, re-expressed in the frame of a link whose world pose is W. */
export const inFrame = (W: Mat4, ops: Op[]): Op[] => [{ op: "at", T: invert(W), of: ops }];
export const rel = (parentW: Mat4, W: Mat4) => mul(invert(parentW), W);

/** Spur gear (module m, z teeth) about +z from z0 to z1: root disc + trapezoidal teeth, tooth 0 at `phaseDeg`. */
export function gearOps(m: number, z: number, z0: number, z1: number, phaseDeg = 90): Op[] {
  const rp = (m * z) / 2, ra = rp + m, rf = rp - 1.25 * m, p = Math.PI * m;
  const ops: Op[] = [{ op: "rod", a: [0, 0, z0], b: [0, 0, z1], r: rf + 0.2 }];
  for (let k = 0; k < z; k++) {
    ops.push(at(rotZ(phaseDeg + (k * 360) / z), [{ op: "hull", of: [
      { op: "box", min: [rf - 0.3, -p * 0.32, z0], max: [rf, p * 0.32, z1] },
      { op: "box", min: [ra - 0.4, -p * 0.12, z0], max: [ra, p * 0.12, z1] },
    ] }]));
  }
  return ops;
}
/** Rack along x from x0 to x1 whose pitch line is y = yp; teeth point towards -side*y (towards the pinion). */
export function rackOps(m: number, x0: number, x1: number, yp: number, side: 1 | -1, z0: number, z1: number, back: number): Op[] {
  const p = Math.PI * m, root = yp + side * 1.25 * m, tip = yp - side * m;
  const ops: Op[] = [{ op: "box", min: [x0, Math.min(root, root + side * back), z0], max: [x1, Math.max(root, root + side * back), z1] }];
  // gaps centred on x = k * p (tooth centres at (k + 1/2) * p) so the pinion tooth at 90 deg meshes at q = 0
  for (let k = Math.ceil(x0 / p - 0.5) - 1; (k + 0.5) * p < x1 + p; k++) {
    const c = (k + 0.5) * p;
    if (c - p * 0.32 < x0 || c + p * 0.32 > x1) continue;
    ops.push({ op: "hull", of: [
      { op: "box", min: [c - p * 0.32, Math.min(root, root - side * 0.3), z0], max: [c + p * 0.32, Math.max(root, root - side * 0.3), z1] },
      { op: "box", min: [c - p * 0.12, Math.min(tip, tip + side * 0.4), z0], max: [c + p * 0.12, Math.max(tip, tip + side * 0.4), z1] },
    ] });
  }
  return ops;
}

/**
 * Faceted ("polygon") armour shell: a thin plate following an elliptical arc around an axis.
 * Frame: the shell wraps the +x side of the local z axis, from angle a0 to a1 (rad, 0 = +x, +pi/2 = +y),
 * radii rx/ry at its mid height, tapering by `taper` (fraction) towards z1. Each facet is the hull of
 * two neighbouring thin slabs, so the shell reads as flat polygon plates and stays hollow.
 */
export function shellOps(o: { rx: number; ry: number; a0: number; a1: number; z0: number; z1: number; t: number; facets: number; taper?: number; bulge?: number }): Op[] {
  const ops: Op[] = [], n = o.facets, tp = o.taper ?? 0, zs = [o.z0, (o.z0 + o.z1) / 2, o.z1];
  const pt = (a: number, z: number, inset: number): Vec3 => {
    const f = 1 - tp * ((z - o.z0) / Math.max(o.z1 - o.z0, 1e-6)) + (z === zs[1] ? (o.bulge ?? 0) : 0);
    return [(o.rx * f - inset) * Math.cos(a), (o.ry * f - inset) * Math.sin(a), z];
  };
  const slab = (a: number, zA: number, zB: number): Op => ({ op: "hull", of: [zA, zB].flatMap((z) => [0, o.t].map((ins) => { const p = pt(a, z, ins); return { op: "box" as const, min: [p[0] - 0.3, p[1] - 0.3, z - 0.3] as Vec3, max: [p[0] + 0.3, p[1] + 0.3, z + 0.3] as Vec3 }; })) });
  for (let i = 0; i < n; i++) {
    const a = o.a0 + ((o.a1 - o.a0) * i) / n, b = o.a0 + ((o.a1 - o.a0) * (i + 1)) / n;
    for (let k = 0; k < 2; k++) ops.push({ op: "hull", of: [slab(a, zs[k], zs[k + 1]), slab(b, zs[k], zs[k + 1])] });
  }
  return ops;
}

/** An aluminium tube (bought stock, cut to length) as its own link, fixed to `parent`. Mass from the alloy. */
export function tubeLink(A: Assembly, parent: string, parentW: Mat4, name: string, a: Vec3, b: Vec3, stockKey: string, use: string): Link {
  const s = part(stockKey).specs, L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const W = frame([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [b[0] - a[0], b[1] - a[1], b[2] - a[2]], Math.abs(b[0] - a[0]) < 0.9 * L ? [1, 0, 0] : [0, 1, 0]);
  const link: Link = { name, role: "strut", geometry: { type: "cylinder", radius: Number(s.od_mm) / 2000, length: L / 1000 }, mass: (Number(s.kg_per_m) * L) / 1000, material: "metal", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
  A.spec.links.push(link);
  A.fixed(`${name}_mount`, parent, name, mul(invert(parentW), W));
  tubeUse.set(A, [...(tubeUse.get(A) ?? []), { key: stockKey, mm: L, use }]);
  return link;
}
const tubeUse = new WeakMap<Assembly, { key: string; mm: number; use: string }[]>();
/** Buy whole 1 m lengths of tube stock for every tube cut (plus 5 mm saw kerf/facing each). */
export function buyTubeStock(A: Assembly) {
  const by = new Map<string, { mm: number; uses: string[] }>();
  for (const t of tubeUse.get(A) ?? []) { const r = by.get(t.key) ?? { mm: 0, uses: [] }; r.mm += t.mm + 5; if (!r.uses.includes(t.use)) r.uses.push(t.use); by.set(t.key, r); }
  for (const [key, r] of by) A.buy(key, Math.ceil(r.mm / Number(part(key).specs.length_mm)), `${r.uses.join(", ")} (${(r.mm / 1000).toFixed(2)} m cut)`);
}

/** PETG at about 25 USD/kg; screws, inserts and nuts about 0.15 USD each. */
export const FILAMENT_USD_PER_KG = 25;
export function recordCost(A: Assembly): number {
  let parts = 0;
  for (const r of A.purchasedList()) parts += part(r.key).price_usd * r.qty;
  const printedKg = A.design.printed.reduce((s, p) => s + p.mass_kg, 0);
  const screws = Object.values(A.design.fasteners).reduce((s, n) => s + n, 0) * 0.15;
  const wiring = A.design.wiring?.cost_usd ?? 0;
  const total = parts + printedKg * FILAMENT_USD_PER_KG + screws + wiring;
  A.design.performance.cost_usd = +total.toFixed(2);
  A.design.performance.cost_breakdown = `parts ${parts.toFixed(2)} USD, filament ${(printedKg * FILAMENT_USD_PER_KG).toFixed(2)} USD (${printedKg.toFixed(2)} kg), fasteners ~${screws.toFixed(2)} USD, wiring ${wiring.toFixed(2)} USD`;
  return total;
}
export const fmt = (x: number, d = 2) => (+x.toFixed(d)).toString();
export { apply };

/** What every family designer accepts. */
export interface DesignRequest {
  name?: string; prompt?: string; budget?: number; payloadKg?: number; reachM?: number;
  wearerMassKg?: number; wearerHeightM?: number; sensors?: string[];
}

/** Catalog part fitted for each sensor type a request can ask for. */
export const SENSOR_PARTS: Record<SensorType, { key: string; frame: Mat4 } | null> = {
  // sensor frames in the component frame (mm): camera looks along +z out of the lens
  camera: { key: "rpi_camera_module_3", frame: frame([12.5, 14.4, 9.1], [0, 0, 1], [1, 0, 0]) },
  depth: { key: "realsense_d435i", frame: frame([0, -12.5, 0], [0, -1, 0], [1, 0, 0]) },
  imu: { key: "bno085_breakout", frame: frame([12.8, 11.35, 2.6], [0, 0, 1], [1, 0, 0]) },
  lidar: { key: "rplidar_c1", frame: frame([0, 0, 29.8], [0, 0, 1], [1, 0, 0]) },
  force: null,
  // HC-SR04: looks along +z out of its transducers
  range: { key: "hc_sr04", frame: frame([22.5, 10, 13.6], [0, 0, 1], [1, 0, 0]) },
};
const ALIASES: [RegExp, SensorType][] = [[/ultrasonic|sonar|hc-?sr04/, "range"], [/depth|realsense|rgb-?d|stereo/, "depth"], [/lidar|laser|scanner/, "lidar"], [/imu|gyro|accel|orientation/, "imu"], [/cam|vision|video|hud/, "camera"], [/force|torque|load ?cell/, "force"]];
export function sensorTypes(list: string[] | undefined): SensorType[] {
  const out: SensorType[] = [];
  for (const raw of list ?? []) { const s = raw.toLowerCase(); const t = ALIASES.find(([re]) => re.test(s))?.[1]; if (t && !out.includes(t)) out.push(t); }
  return out;
}
/** Where a design can carry a sensor: component pose in `link`'s frame (mm). */
export interface SensorSlot { link: string; T: Mat4; use: string; }
/**
 * Mount every requested sensor type (plus `always`, the ones the design needs anyway) as a real catalog part
 * and list it in spec.sensors. A requested type the design has no place for is reported as a failing check.
 */
export function mountSensors(A: Assembly, requested: string[] | undefined, slots: Partial<Record<SensorType, SensorSlot>>, always: SensorType[] = []): SensorType[] {
  const types = [...new Set([...always, ...sensorTypes(requested)])], fitted: SensorType[] = [];
  for (const t of types) {
    const p = SENSOR_PARTS[t], slot = slots[t];
    if (!p || !slot) { A.check(`sensor:${t}`, false, `a ${t} sensor was requested but this design has no catalog part or mounting position for it; not fitted`); continue; }
    const name = `${t}_sensor`;
    A.mount(slot.link, p.key, slot.T, name, slot.use);
    A.spec.sensors.push({ name, type: t, parent: name, origin: toPose(p.frame), params: { part: p.key } });
    fitted.push(t);
  }
  return fitted;
}

/** Cut through a cradle wall where a servo's bus connectors are, so the plug and cable fit (T: servo pose). */
export function plugWindowOps(key: string, T: Mat4): Op[] {
  const b = bodyMm(key);
  if (key.startsWith("feetech_sts")) return [at(T, [{ op: "cutbox", min: [-20, -10, b.min[2] - 8], max: [-8, 10, b.min[2] + 6] }])];   // plugs on the bottom face
  const slot = dxlPlug(key);
  if (slot) return [at(T, [{ op: "cutbox", min: [slot.x - 7, b.min[1] - 14, b.min[2] + 0.5], max: [slot.x + 7, b.max[1] + 14, b.min[2] + 10] }])];   // a plug in each long side of the back case
  if (key.startsWith("dxl_")) return [at(T, [{ op: "cutbox", min: [b.min[0] - 8, -11, b.min[2] + 0.5], max: [b.min[0] + 0.5, 11, b.min[2] + 12] }])]; // plugs on the far end face
  return [];
}
