// Real, purchasable components with datasheet values, exported from python/ttr_build.components
// by scripts/export_parts.py. Library units are millimetres and grams; helpers convert to SI.
import catalogJson from "../data/catalog.json" with { type: "json" };
import meshesJson from "../data/meshes.json" with { type: "json" };

export type Vec3 = [number, number, number];
export interface Hole { pos: Vec3; axis: Vec3; dia_mm: number; thread: string | null; }
export interface Component {
  key: string; name: string; category: string;
  mass_g: number; price_usd: number; supplier_url: string; datasheet_url: string;
  envelope_mm: Vec3; holes: Hole[];
  specs: Record<string, any>;
  /** actuators: output face origin and axis (component frame, mm) */
  output_frame: [Vec3, Vec3] | null;
  bbox_mm?: { min: Vec3; max: Vec3 };
  mesh_triangles?: number;
}

export const CATALOG = catalogJson as unknown as Record<string, Component>;
const MESHES = meshesJson as unknown as Record<string, { v: number[]; f: number[] }>;

export function part(key: string): Component {
  const c = CATALOG[key];
  if (!c) throw new Error(`unknown component '${key}'`);
  return c;
}
export const byCategory = (category: string) => Object.values(CATALOG).filter((c) => c.category === category);

/** Actuator ratings in SI. `rated` is the continuous torque the sizing must stay under; `peak` is stall/peak. */
export interface ActuatorRating { key: string; rated_nm: number; peak_nm: number; speed_rad_s: number; voltage_v: number; mass_kg: number; price_usd: number; family: string; }
export function rating(key: string): ActuatorRating {
  const c = part(key), s = c.specs;
  const rated = Number(s.rated_torque_nm), peak = Number(s.peak_torque_nm ?? s.stall_torque_nm ?? rated);
  const speed = Number(s.rated_speed_rad_s ?? s.no_load_speed_rad_s);
  if (!(rated > 0 && peak > 0 && speed > 0)) throw new Error(`${key} has no usable torque/speed rating`);
  return { key, rated_nm: rated, peak_nm: peak, speed_rad_s: speed, voltage_v: Number(s.voltage_v), mass_kg: c.mass_g / 1000, price_usd: c.price_usd, family: actuatorFamily(key) };
}
export function actuatorFamily(key: string): string {
  if (key.startsWith("feetech_sts")) return "feetech_sts";
  if (key.startsWith("dxl_")) return "dynamixel_x";
  if (key.startsWith("cubemars_")) return "cubemars_ak";
  if (key.startsWith("nema17")) return "stepper";
  return "dc_gearmotor";
}

/** Component body as a triangle mesh in metres (component frame). */
export function componentMesh(key: string): { v: Vec3[]; f: [number, number, number][] } {
  const m = MESHES[key];
  if (!m) throw new Error(`component '${key}' has no mesh`);
  const v: Vec3[] = [], f: [number, number, number][] = [];
  for (let i = 0; i < m.v.length; i += 3) v.push([m.v[i] / 1000, m.v[i + 1] / 1000, m.v[i + 2] / 1000]);
  for (let i = 0; i < m.f.length; i += 3) f.push([m.f[i], m.f[i + 1], m.f[i + 2]]);
  return { v, f };
}
export const hasMesh = (key: string) => key in MESHES;

/** Body bounding box in metres. */
export function bboxM(key: string): { min: Vec3; max: Vec3 } {
  const b = part(key).bbox_mm;
  if (!b) throw new Error(`component '${key}' has no bbox`);
  return { min: b.min.map((x) => x / 1000) as Vec3, max: b.max.map((x) => x / 1000) as Vec3 };
}

/** Mounting holes on the stationary case (not the rotating output). */
export function caseHoles(key: string): Hole[] {
  const c = part(key), r = hornRadiusMm(key);
  return c.holes.filter((h) => !(Math.abs(h.pos[2]) < 0.6 && Math.hypot(h.pos[0], h.pos[1]) < r + 0.5));
}
/** Holes on the rotating output (horn / hub) face at z = 0. */
export function outputHoles(key: string): Hole[] {
  const c = part(key), r = hornRadiusMm(key);
  return c.holes.filter((h) => Math.abs(h.pos[2]) < 0.6 && h.axis[2] > 0.5 && Math.hypot(h.pos[0], h.pos[1]) < r + 0.5);
}
/** Radius of the rotating output (horn or hub) in mm. */
export function hornRadiusMm(key: string): number {
  const s = part(key).specs;
  if (key.startsWith("feetech_sts")) return 10;
  if (key.startsWith("dxl_")) return key.includes("xl330") ? 8 : key.includes("xh540") ? 12.5 : 10.25;
  if (key.startsWith("cubemars_")) return Number(s.hub_hole_pcd_mm ?? 30) / 2 + 4;
  if (s.shaft_d_mm) return Number(s.shaft_d_mm) / 2;
  return 5;
}

// Reflected rotor inertia (kg m^2 at the output) = J_rotor * N^2. The catalog has gear ratios but no
// rotor inertia, so J_rotor is a per-family estimate (+-50 %), the same table the MuJoCo converter uses
// (python/ttr_mujoco/actuators.py).
const ROTOR_INERTIA: Record<string, number> = { feetech_sts: 2.4e-7, dynamixel_x: 1.0e-7, cubemars_ak60: 3.0e-5, cubemars_ak70: 4.5e-5, cubemars_ak80: 6.0e-5, stepper: 5.4e-6, dc_gearmotor_37: 1.5e-6, dc_gearmotor_n20: 1.0e-8, dc_gearmotor: 1.0e-6 };
const DEFAULT_RATIO: Record<string, number> = { feetech_sts: 345, dynamixel_x: 300, cubemars_ak: 9, stepper: 1, dc_gearmotor: 50 };
export function armature(key: string): number {
  const s = part(key).specs, fam = actuatorFamily(key);
  if (s.rotor_inertia_kgm2) return Number(s.rotor_inertia_kgm2) * Number(s.gear_ratio ?? 1) ** 2;
  const sub = fam === "cubemars_ak" ? `cubemars_${key.includes("ak80") ? "ak80" : key.includes("ak70") ? "ak70" : "ak60"}`
    : fam === "dc_gearmotor" ? (key.startsWith("n20") ? "dc_gearmotor_n20" : key.includes("37d") ? "dc_gearmotor_37" : "dc_gearmotor") : fam;
  const ratio = Number(s.gear_ratio) || DEFAULT_RATIO[fam] || 1;
  return ROTOR_INERTIA[sub] * ratio * ratio;
}
/** No-load output speed (rad/s): the end of the linear torque-speed line. */
export const noLoadSpeed = (key: string) => Number(part(key).specs.no_load_speed_rad_s ?? rating(key).speed_rad_s);
