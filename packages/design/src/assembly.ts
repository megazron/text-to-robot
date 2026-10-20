// Builds a RobotSpecification out of real components and printed parts, keeping the
// engineering record (what was bought, what is printed, why each part was chosen).
import type { RobotSpecification, Joint, Link, Material } from "@ttr/robot-schema";
import { emptySpec } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { meshGeometry } from "@ttr/mesh";
import { toPose, printCheck, type Mat4, type Program, type PrintCheck } from "@ttr/solid";

// Sizing loops rebuild the same parts many times: cache geometry by recipe (bounded).
const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  if (cache.has(key)) return structuredClone(cache.get(key)) as T;
  const v = make();
  if (cache.size > 400) cache.delete(cache.keys().next().value as string);
  cache.set(key, v);
  return structuredClone(v);
}
/** MeshGeometry for a printed program / a catalog component (mass properties precomputed). */
export const printedGeometry = (p: Program) => { const program = JSON.stringify(p); return memo(`p:${program}`, () => meshGeometry("printed", `${p.name}.stl`, { program })); };
export const componentGeometry = (key: string, file?: string) => memo(`c:${key}:${file ?? ""}`, () => meshGeometry("component", file ?? `${key}.stl`, { key }));
const checkOf = (p: Program) => memo(`k:${JSON.stringify(p.ops)}`, () => printCheck(p));

/** PETG printed with 4 perimeters and 30 % gyroid infill: effective density of a typical bracket. */
export const PRINT_DENSITY = 1270 * 0.72; // kg/m^3
export const PRINT_MATERIAL = "PETG, 0.4 mm nozzle, 4 perimeters, 30 % gyroid infill";

export const MATERIALS: Material[] = [
  { name: "printed", color: [0.93, 0.93, 0.95, 1] },
  { name: "printed_accent", color: [0.95, 0.5, 0.12, 1] },
  { name: "printed_dark", color: [0.22, 0.23, 0.26, 1] },
  { name: "actuator", color: [0.1, 0.1, 0.11, 1] },
  { name: "metal", color: [0.62, 0.64, 0.68, 1] },
  { name: "electronics", color: [0.08, 0.45, 0.25, 1] },
  { name: "rubber", color: [0.07, 0.07, 0.08, 1] },
  { name: "battery", color: [0.15, 0.3, 0.75, 1] },
];
const COMPONENT_MATERIAL: Record<string, string> = { actuator: "actuator", wheel: "rubber", battery: "battery", compute: "electronics", sensor: "electronics", motor_driver: "electronics", misc: "electronics", bearing: "metal", horn: "metal" };

export interface PrintedRecord { name: string; link: string; program: Program; check: PrintCheck; mass_kg: number; }
export interface PurchasedRecord { key: string; qty: number; uses: string[]; }
export interface JointRecord { joint: string; actuator: string; required_nm: number; rated_nm: number; peak_nm: number; margin: number; speed_rad_s: number; note: string; }
export interface DesignRecord {
  family: string;
  summary: string;
  purchased: PurchasedRecord[];
  printed: PrintedRecord[];
  joints: JointRecord[];
  checks: { name: string; pass: boolean; detail: string }[];
  performance: Record<string, number | string>;
  assumptions: string[];
  fasteners: Record<string, number>;
  /** joint angles of a natural "ready" pose for previews (the URDF zero pose stays the build pose) */
  home?: Record<string, number>;
  /** the designer's input; edits change it and run the designer again */
  request?: Record<string, unknown>;
  /** Tool centre point (link frame, metres) for task tests: payload hold, reach, grip. */
  tcp?: { link: string; xyz: Vec3 };
  /** tool point of a serial chain: link, offset (m) and the payload it was sized for */
  tool?: { link: string; xyz_m: Vec3; payload_kg: number };
}

export class Assembly {
  spec: RobotSpecification;
  design: DesignRecord;
  private purchased = new Map<string, PurchasedRecord>();

  constructor(name: string, family: string, prompt?: string) {
    this.spec = emptySpec(name, prompt);
    this.spec.materials = MATERIALS.map((m) => ({ ...m, color: [...m.color] as Material["color"] }));
    this.design = { family, summary: "", purchased: [], printed: [], joints: [], checks: [], performance: {}, assumptions: [], fasteners: {} };
  }

  buy(key: string, qty: number, use: string) {
    part(key);
    const r = this.purchased.get(key) ?? { key, qty: 0, uses: [] };
    r.qty += qty; if (!r.uses.includes(use)) r.uses.push(use);
    this.purchased.set(key, r);
  }
  fastener(spec: string, qty: number) { this.design.fasteners[spec] = (this.design.fasteners[spec] ?? 0) + qty; }

  /** A link whose body is a printed part. Mass from solid volume at print density. */
  printedLink(name: string, program: Program, opts: { role?: string; material?: string; extraMassKg?: number } = {}): Link {
    const geometry = printedGeometry({ ...program, name });
    const check = checkOf(program);
    const mass = geometry.volume * PRINT_DENSITY + (opts.extraMassKg ?? 0);
    const link: Link = { name, role: opts.role ?? "link", geometry, mass: Math.max(mass, 0.002), material: opts.material ?? "printed", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
    this.spec.links.push(link);
    this.design.printed.push({ name, link: name, program, check, mass_kg: +(geometry.volume * PRINT_DENSITY).toFixed(4) });
    return link;
  }
  /** An empty frame link (massless anchors are avoided: URDF tools dislike them). */
  frameLink(name: string, role = "frame"): Link {
    const link: Link = { name, role, geometry: { type: "sphere", radius: 0.004 }, mass: 0.001, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, material: "metal" };
    this.spec.links.push(link);
    return link;
  }
  /** Mount a purchased component rigidly on `parent` at T (mm, parent frame). */
  mount(parent: string, key: string, T: Mat4, name: string, use = name): Link {
    const c = part(key);
    const link: Link = { name, role: c.category, geometry: componentGeometry(key), mass: c.mass_g / 1000, material: COMPONENT_MATERIAL[c.category] ?? "metal", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
    this.spec.links.push(link);
    this.fixed(`${name}_mount`, parent, name, T);
    this.buy(key, 1, use);
    return link;
  }
  fixed(name: string, parent: string, child: string, T: Mat4): Joint {
    const j: Joint = { name, type: "fixed", parent, child, origin: toPose(T), axis: [0, 0, 1] };
    this.spec.joints.push(j);
    return j;
  }
  /** Actuated revolute joint about the actuator output axis (+z of T). Limits come from the datasheet. */
  revolute(name: string, parent: string, child: string, T: Mat4, actuator: string, lower: number, upper: number, opts: { damping?: number } = {}): Joint {
    const r = rating(actuator);
    const j: Joint = {
      name, type: "revolute", parent, child, origin: toPose(T), axis: [0, 0, 1],
      limit: { lower, upper, effort: r.peak_nm, velocity: r.speed_rad_s },
      dynamics: { damping: opts.damping ?? defaultDamping(actuator), friction: frictionOf(actuator) },
    };
    this.spec.joints.push(j);
    return j;
  }
  continuous(name: string, parent: string, child: string, T: Mat4, actuator: string | null, axis: Vec3 = [0, 0, 1]): Joint {
    const r = actuator ? rating(actuator) : null;
    const j: Joint = {
      name, type: "continuous", parent, child, origin: toPose(T), axis,
      ...(r ? { limit: { effort: r.peak_nm, velocity: r.speed_rad_s } } : { passive: true }),
      dynamics: { damping: r ? defaultDamping(actuator!) : 0.002, friction: r ? frictionOf(actuator!) : 0.001 },
    };
    this.spec.joints.push(j);
    return j;
  }
  prismatic(name: string, parent: string, child: string, T: Mat4, lower: number, upper: number, forceN: number, speed: number, axis: Vec3 = [0, 0, 1]): Joint {
    const j: Joint = { name, type: "prismatic", parent, child, origin: toPose(T), axis, limit: { lower, upper, effort: forceN, velocity: speed }, dynamics: { damping: 5, friction: 2 } };
    this.spec.joints.push(j);
    return j;
  }
  check(name: string, pass: boolean, detail: string) { this.design.checks.push({ name, pass, detail }); }

  finish(summary: string): RobotSpecification {
    this.design.summary = summary;
    this.design.purchased = [...this.purchased.values()].sort((a, b) => a.key.localeCompare(b.key));
    for (const p of this.design.printed) this.check(`print:${p.name}`, p.check.fits_bed && p.check.watertight, `${p.check.bbox_mm.join(" x ")} mm, ${p.check.volume_cm3} cm^3, ${(p.mass_kg * 1000).toFixed(0)} g${p.check.fits_bed ? "" : " — does not fit a 250 x 210 x 220 mm bed"}`);
    (this.spec.metadata as any).design = this.design;
    this.spec.metadata.generator = "text-to-robot design engine (real components + printed structure)";
    return this.spec;
  }
}

/** Viscous damping that roughly matches each actuator family's gearbox (N·m·s/rad). */
function defaultDamping(key: string): number {
  const r = rating(key);
  return +(0.02 * r.peak_nm / Math.max(r.speed_rad_s, 1) * 10).toFixed(4);
}
function frictionOf(key: string): number { return +(rating(key).peak_nm * 0.02).toFixed(4); }
