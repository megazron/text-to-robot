// Builds a RobotSpecification out of real components and printed parts, keeping the
// engineering record (what was bought, what is printed, why each part was chosen).
import type { RobotSpecification, Joint, Link, Material } from "@ttr/robot-schema";
import { emptySpec } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { meshGeometry } from "@ttr/mesh";
import { toPose, printCheck, type Mat4, type Program, type PrintCheck } from "@ttr/solid";
import { partFiles, type Program as CadProgram } from "@ttr/kernel/ready";

// Sizing loops rebuild the same parts many times: cache geometry by recipe (bounded).
// Entries are kept as JSON text, never as live objects: on the site, CI once saw a cached part come back carrying the inertia of
// the part computed after it (dxl_u2d2 with exactly the mains inlet's numbers, its volume and centroid untouched). No code
// writes to a cached object, so the fix is to keep nothing mutable between calls.
const cache = new Map<string, string>();
function memo<T>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return JSON.parse(hit) as T;
  const text = JSON.stringify(make());
  if (cache.size > 400) cache.delete(cache.keys().next().value as string);
  cache.set(key, text);
  return JSON.parse(text) as T;
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
  { name: "armour_red", color: [0.55, 0.04, 0.05, 1] },
  { name: "armour_gold", color: [0.83, 0.62, 0.24, 1] },
  { name: "lens_glow", color: [0.72, 0.93, 1, 1] },
  // the wearer is drawn as the black undersuit worn under armour builds (shows through the gaps between pieces)
  { name: "wearer", color: [0.05, 0.05, 0.06, 1] },
];
const COMPONENT_MATERIAL: Record<string, string> = { actuator: "actuator", wheel: "rubber", battery: "battery", compute: "electronics", sensor: "electronics", motor_driver: "electronics", misc: "electronics", bearing: "metal", horn: "metal" };

export interface PrintedRecord { name: string; link: string; program: Program; check: PrintCheck; mass_kg: number; }
export interface PurchasedRecord { key: string; qty: number; uses: string[]; }
/** required / rated / peak are N·m for rotary joints; a record with unit "N" (a linear axis in joint space) is in N, and its speed in m/s */
export interface JointRecord { joint: string; actuator: string; required_nm: number; rated_nm: number; peak_nm: number; margin: number; speed_rad_s: number; note: string; unit?: "N" | "N·m"; }
export interface DesignRecord {
  family: string;
  /** the harness: nets, cables, rails, fuses, cut list (see wiring.ts) */
  wiring?: import("./wiring.ts").WiringRecord;
  /** electronics compartments (see enclosure.ts) */
  enclosures?: import("./enclosure.ts").BayRecord[];
  exposed?: import("./enclosure.ts").ExposedRecord[];
  summary: string;
  purchased: PurchasedRecord[];
  printed: PrintedRecord[];
  joints: JointRecord[];
  checks: { name: string; pass: boolean; detail: string }[];
  performance: Record<string, number | string>;
  assumptions: string[];
  fasteners: Record<string, number>;
  /** pairs of parts glued into each other on purpose (not interference) */
  bonded?: [string, string][];
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
  /** Purchased parts so far and their total list price (USD). */
  bom(): { items: PurchasedRecord[]; cost_usd: number } {
    const items = [...this.purchased.values()];
    return { items, cost_usd: +items.reduce((s, r) => s + part(r.key).price_usd * r.qty, 0).toFixed(2) };
  }
  /** Purchased parts collected so far (key, quantity, uses). */
  purchasedList(): PurchasedRecord[] { return [...this.purchased.values()].map((r) => ({ ...r, uses: [...r.uses] })); }
  fastener(spec: string, qty: number) { this.design.fasteners[spec] = (this.design.fasteners[spec] ?? 0) + qty; }

  /** A link whose body is a printed part. Mass from solid volume at print density. */
  printedLink(name: string, program: Program, opts: { role?: string; material?: string; extraMassKg?: number } = {}): Link {
    // TTR_KERNEL_ALL=1 builds these on the CAD kernel too. Not the default yet: OpenCascade's WASM heap only grows, and the
    // sizing loops of the arm/humanoid designers rebuild every link dozens of times (measured: 4 GB after ~30 arm parts)
    if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.TTR_KERNEL_ALL) return this.cadLink(name, program as unknown as CadProgram, opts);
    const geometry = printedGeometry({ ...program, name });
    const check = checkOf(program);
    const mass = geometry.volume * PRINT_DENSITY + (opts.extraMassKg ?? 0);
    const link: Link = { name, role: opts.role ?? "link", geometry, mass: Math.max(mass, 0.002), material: opts.material ?? "printed", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
    this.spec.links.push(link);
    this.design.printed.push({ name, link: name, program, check, mass_kg: +(geometry.volume * PRINT_DENSITY).toFixed(4) });
    return link;
  }
  /** A link whose body is a printed part modelled on the CAD kernel (exact solid, fillets, STEP export). */
  cadLink(name: string, program: CadProgram, opts: { role?: string; material?: string; extraMassKg?: number; printed?: boolean; massKg?: number } = {}): Link {
    const json = JSON.stringify({ ...program, name });
    const geometry = memo(`cad:${json}`, () => meshGeometry("cad", `${name}.stl`, { program: json }));
    const f = partFiles(json), size = [0, 1, 2].map((k) => f.bbox_mm.max[k] - f.bbox_mm.min[k]) as Vec3;
    const fits = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]].some((o) => o.every((k, i) => size[k] <= [250, 210, 220][i]));
    const check: PrintCheck = { volume_cm3: +(f.volume_mm3 / 1000).toFixed(2), bbox_mm: size.map((x) => +x.toFixed(1)) as Vec3, fits_bed: fits,
      watertight: f.watertight && f.bodies === 1, min_feature_ok: f.volume_mm3 > 50, genus: f.genus };
    const mass = opts.massKg ?? geometry.volume * PRINT_DENSITY + (opts.extraMassKg ?? 0);
    const link: Link = { name, role: opts.role ?? "link", geometry, mass: Math.max(mass, 0.002), material: opts.material ?? "printed", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
    this.spec.links.push(link);
    // printed: false for bodies that are modelled but not made (e.g. the wearer inside a suit)
    if (opts.printed !== false) this.design.printed.push({ name, link: name, program: { ...program, name } as unknown as Program, check, mass_kg: +(geometry.volume * PRINT_DENSITY).toFixed(4) });
    return link;
  }
  /** A printed armour shell from the reference pack: `toLink` is the column-major 4x4 (metres) from world to this link's frame. */
  armourLink(name: string, piece: string, s: number, toLink: number[], opts: { material: string; role?: string; printed?: boolean; density?: number }): Link {
    const geometry = memo(`armour:${piece}:${s}:${toLink.join()}`, () => meshGeometry("armour", `${name}.stl`, { piece, s, toLink: JSON.stringify(toLink) }));
    const bb = geometry.bbox as unknown as { min: number[]; max: number[] } | undefined;
    const size = (bb ? [0, 1, 2].map((k) => (bb.max[k] - bb.min[k]) * 1000) : [0, 0, 0]) as Vec3;
    const fits = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]].some((o) => o.every((k, i) => size[k] <= [250, 210, 220][i]));
    const check: PrintCheck = { volume_cm3: +(geometry.volume * 1e6).toFixed(2), bbox_mm: size.map((x) => +x.toFixed(1)) as Vec3, fits_bed: fits, watertight: true, min_feature_ok: true, genus: 0 };
    const link: Link = { name, role: opts.role ?? "armour", geometry, mass: Math.max(geometry.volume * (opts.density ?? PRINT_DENSITY), 0.002), material: opts.material, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
    this.spec.links.push(link);
    if (opts.printed !== false) this.design.printed.push({ name, link: name, program: { name, ops: [] } as unknown as Program, check, mass_kg: +(geometry.volume * PRINT_DENSITY).toFixed(4) });
    return link;
  }
  /** Add ops to a finished printed (or fabricated) link: cable clips, screw holes for a compartment bolted to it. */
  amendProgram(name: string, ops: unknown[]) {
    const l = this.spec.links.find((x) => x.name === name);
    if (!l || l.geometry.type !== "mesh" || (l.geometry.part !== "printed" && l.geometry.part !== "cad")) throw new Error(`amendProgram: ${name} is not a printed link`);
    const before = l.geometry.volume, cad = l.geometry.part === "cad", program = JSON.parse(String(l.geometry.params!.program));
    program.ops = [...program.ops, ...ops];
    const rec = this.design.printed.find((p) => p.name === name);
    if (cad) {
      const json = JSON.stringify(program), f = partFiles(json), size = [0, 1, 2].map((k) => f.bbox_mm.max[k] - f.bbox_mm.min[k]) as Vec3;
      l.geometry = memo(`cad:${json}`, () => meshGeometry("cad", `${name}.stl`, { program: json })) as Link["geometry"];
      if (rec) { rec.program = program; rec.check = { ...rec.check, volume_cm3: +(f.volume_mm3 / 1000).toFixed(2), bbox_mm: size.map((x) => +x.toFixed(1)) as Vec3, watertight: f.watertight && f.bodies === 1, genus: f.genus }; }
    } else {
      l.geometry = printedGeometry(program) as Link["geometry"];
      if (rec) { rec.program = program; rec.check = checkOf(program); }
    }
    const v = (l.geometry as { volume: number }).volume;
    l.mass = Math.max(l.mass * (v / before), 0.002);
    if (rec) rec.mass_kg = +(v * PRINT_DENSITY).toFixed(4);
  }
  /** An empty frame link (massless anchors are avoided: URDF tools dislike them). */
  frameLink(name: string, role = "frame"): Link {
    const link: Link = { name, role, geometry: { type: "sphere", radius: 0.004 }, mass: 0.001, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, material: "metal" };
    this.spec.links.push(link);
    return link;
  }
  /** Mount a purchased component rigidly on `parent` at T (mm, parent frame). */
  mount(parent: string, key: string, T: Mat4, name: string, use = name, material?: string): Link {
    const c = part(key);
    const link: Link = { name, role: c.category, geometry: componentGeometry(key), mass: c.mass_g / 1000, material: material ?? COMPONENT_MATERIAL[c.category] ?? "metal", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
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
      // passive rollers (idler wheels on deep-groove bearings, caster balls): a bearing's friction torque is ~0.5 mN·m and its
      // viscous drag negligible; 2 mN·m·s/rad would brake a 12.7 mm caster ball spinning at 95 rad/s with ~15 N
      dynamics: { damping: r ? defaultDamping(actuator!) : 1e-5, friction: r ? frictionOf(actuator!) : 5e-4 },
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
  const r = rating(key), sp = part(key).specs;
  // DC gearmotors with a datasheet no-load current: the gearbox and brush losses take I0/Istall of the stall torque at
  // no-load speed, modelled as viscous damping (TT motor: 10 % of stall at 200 rpm)
  const i0 = Number(sp.no_load_current_a), is = Number(sp.stall_current_a);
  if (i0 > 0 && is > 0 && /gearmotor|tt_/.test(key)) return +(r.peak_nm * (i0 / is) / Math.max(r.speed_rad_s, 1)).toFixed(6);
  return +(0.02 * r.peak_nm / Math.max(r.speed_rad_s, 1) * 10).toFixed(4);
}
function frictionOf(key: string): number { return +(rating(key).peak_nm * 0.02).toFixed(4); }
