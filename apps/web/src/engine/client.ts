// Text to Robot engine, for other pages. Published with the website at /engine/v1/engine.js:
//
//   import { createEngine } from "https://megazron.github.io/text-to-robot/engine/v1/engine.js";
//   const engine = await createEngine();
//   const { robot } = await engine.design("a 4 DOF arm with a gripper");
//   const { urdf } = await engine.urdf(robot);
//
// The engine runs in a Web Worker started from the site that serves this file (the same worker the website uses), so
// designing never blocks the page. Loading works across origins: the worker is started from a small same-origin
// bootstrap that imports the engine with CORS. Everything stays in the browser; nothing is sent to a server.
// Version 1 keeps its method names, arguments and result fields; additions are backwards compatible.
import type { RobotSpecification } from "@ttr/robot-schema";
import type { EditOp, PrintedParams } from "./edit.ts";
import type { Mount, WorldMount } from "./snap.ts";
// robotkit.js is the website's own zip writer and forward kinematics, bundled in
// @ts-expect-error: plain JavaScript module without types
import { makeZip } from "../../public/robotkit.js";

export const API_VERSION = "1.2.0";
export type { RobotSpecification, EditOp, PrintedParams, Mount, WorldMount };
export { applyEdits, toScene, fromScene, worldFrames, rootLink, subtree, parentJoint, kindOf, poseMat, matPose, mul, inv, apply, emptyRobot, freeName, type Scene, type SceneNode } from "./edit.ts";
export { snapPart, mate, mountFrame, compatible, patternsMatch, MATES, type Snap } from "./snap.ts";

export interface Check { name: string; pass: boolean; detail: string; }
export interface DesignResult { id: string; robot: RobotSpecification; urdf: string; xacro: string; summary?: string; warnings?: string[]; validation?: unknown; urdfValidation?: unknown; bom?: unknown; [k: string]: unknown; }
export interface JointReport { joint: string; actuator: string | null; required_nm: number; rated_nm?: number; peak_nm?: number; margin: number | null; speed_rad_s?: number; ok?: boolean; note: string; }
export interface RailReport { name: string; voltage_v: number; source: string; continuous_a: number; peak_limit_a: number; typical_a: number; peak_a: number; ok: boolean; [k: string]: unknown; }
export interface Engineering { mass_kg: number; com_m: [number, number, number]; cost_usd: number; bom_lines: number; joints: JointReport[]; rails: RailReport[]; wiring_unconnected: string[]; printed: { name: string; bbox_mm: number[]; fits_bed: boolean; watertight: boolean; mass_kg: number; volume_cm3: number }[]; stability: { margin_mm: number; tip_deg: number; com_m: [number, number, number]; support: [number, number][]; ground_z: number; worst_pose: Record<string, number>; free_standing: boolean } | null; links: number; dof: number; }
export interface CheckReport { robot: RobotSpecification; urdf: string; valid: boolean; checks: Check[]; engineering: Engineering | null; }
export interface CatalogPart { key: string; name: string; category: string; mass_g: number; price_usd: number; supplier_url: string; datasheet_url: string; /** for viewers: the horn radius, the top of a servo case, a motor body without its shaft (mm, part frame) */ horn_radius_mm?: number; case_top_mm?: number; body_mm?: { min: number[]; max: number[] }; envelope_mm: number[]; bbox_mm: { min: number[]; max: number[] } | null; mounts: Mount[]; rating?: { rated_nm: number; peak_nm: number; speed_rad_s: number; voltage_v: number; range_deg: number | null; continuous: boolean }; electrical?: { role: string; voltage_v: { min: number; nom: number; max: number }; current_a: { typical: number; peak: number }; ports: string[] }; }
export interface PrintedShape { shape: PrintedParams["shape"]; label: string; defaults: PrintedParams; mounts: Mount[]; }
export interface Catalog { parts: CatalogPart[]; printed: PrintedShape[]; }
/** Files of an export: text, or bytes. */
export type Files = Record<string, string | Uint8Array>;
export interface SchematicNode { name: string; nets: string[]; kind: string; voltage_v?: number; drawn: string; pins: { id: string; ref: string; num: string; members: string[] }[]; }
export interface Schematic { svg: string; pdf: Uint8Array; size: string; netlist: { robot: string; parts: { ref: string; inst: string; key: string; value: string }[]; nodes: SchematicNode[]; empty_nets: string[]; splices: string[] }; layout: string[]; electrical: { runtime: unknown[]; supplies: unknown[]; regulators: unknown[]; logic: { net: string; from: string; to: string; voh: number | null; vih: number | null; max_in: number | null; verdict: string; advice: string }[]; unchecked: string[]; sources: unknown[] }; }
export interface Breadboard { svg: string; layout: string[]; unrouted: string[]; }
/** A board pin the sketch uses, with the wires of the wiring record that end on it. */
export interface FirmwarePin { pin: string; number: number; mode: "pwm" | "output" | "input" | "i2c" | "servo" | "unused"; drives: string; wires: { id: string; net: string; from: string; to: string }[]; }
/** A servo in the sketch: its output (PCA9685 board and channel, or a board pin), catalog pulse range, the joint it turns and that joint's range and home in degrees. */
export interface FirmwareServo { name: string; key: string; via: { board: number; channel: number } | { pin: number }; pulse_us: [number, number]; range_deg: number; joint: string | null; lower_deg: number; upper_deg: number; home_deg: number; max_dps: number | null; cut_from?: [number, number]; }
export interface FirmwareMotor { name: string; key: string; driver: string; driver_key: string; channel: string; pwm: number; pwm_is_pwm: boolean; in1: number; in2: number; side: "left" | "right" | null; forward: 1 | -1; }
/** A robot's program; the optional fields come with a sketch written from the wiring record. */
export type Program = { name: string; language: "arduino" | "python"; code: string; fqbn: string; libraries: string[] } & Partial<Omit<Firmware, "libraries">>;
/** What a sketch written from the wiring record drives. */
export interface Firmware {
  /** `<name>/<name>.ino` (the sketch, in a folder of its own name as the Arduino IDE wants) and `README.md` (flashing steps, pin map) */
  files: Record<string, string>;
  /** the sketch's path in `files` */
  sketch: string;
  board: { instance: string; key: string; name: string; fqbn: string; mcu: string; pwm_pins: number[] };
  pins: FirmwarePin[];
  /** Library Manager names of what the sketch includes */
  libraries: string[];
  /** what is wired but not driven, and what to check on the bench */
  notes: string[];
  behaviour: string; serial_baud: number;
  motors: FirmwareMotor[]; servos: FirmwareServo[]; servo_drivers: { name: string; key: string; address: number }[];
  range_sensor: { name: string; key: string; trig: number; echo: number; range_cm: [number, number] } | null;
  /** highest motor PWM duty the sketch writes, 0..255 */
  pwm_max: number;
  /** the pose sequence, joint angles in degrees in the order of `servos` */
  poses: { name: string; angles_deg: number[] }[];
}
type V3 = [number, number, number];
/** A part's 3D model in its own frame (mm): meshes per material, silkscreen labels, and each pin's place and lead direction (`port.pin`). */
export interface ElectronicsModel { meshes: { mat: string; v: number[]; f: number[] }[]; labels: { text: string; at: V3; w: number; h: number; normal: V3; up: V3; color: string }[]; pins: Record<string, { at: V3; out: V3; kind: string }>; source: string; detailed: boolean; /** stands in for the part's catalog body (false: a motor keeps its datasheet CAD) */ replaces: boolean; }
/** One wire: its centreline as points in the frames of the links it rides (mm), so it follows the joints. */
export interface Wire3D { id: string; cable: string; net: string; kind: string; color: string; awg: number | null; od_mm: number; from: string; to: string; typical_a: number; peak_a: number; cut_mm: number; pts: { link: string; p: V3 }[]; ends: [string, string]; min_bend_mm: number; flex_bend_mm: number; }
export interface HarnessCheck { through: { wire: string; link: string; at: V3; run_mm: number }[]; bend: { wire: string; radius_mm: number; min_mm: number }[]; length: { wire: string; drawn_mm: number; allowance_mm: number; cut_mm: number }[]; checked: { wires: number; samples: number; solids: number; skipped: string[] }; }
export interface Electronics3D {
  robot: string; rails: { name: string; voltage_v: number }[];
  /** per catalog key */
  models: Record<string, ElectronicsModel>;
  /** each part: its catalog key, the link it rides and its frame in that link (row-major 4x4, mm); harness parts (splices, inline fuses) included */
  parts: { inst: string; key: string; link: string; T: number[]; harness: boolean }[];
  wires: Wire3D[];
  /** link -> the rigid body it moves with */
  groups: Record<string, string>;
  notes: string[]; checks?: HarnessCheck;
}
export interface ForgeProgress { stage: string; [k: string]: unknown; }
export interface InventoryItem { key: string; qty: number; name: string; raw: string; match: string; assumed?: string; note?: string; }
export interface Inventory { items: InventoryItem[]; extras: { what: string; qty: number; raw: string; note: string }[]; unknown: { raw: string; qty: number; suggestions: { key: string; name: string; score: number }[] }[]; notes: string[]; }
export interface PartsOption { id: string; kind: string; label: string; blurb: string; uses: Record<string, number>; buys: Record<string, number>; used_count: number; inventory_count: number; extra_usd: number; headline: string; honesty: string[]; score: number; thumbnail: string; [k: string]: unknown; }
export interface PartsDesign { option: PartsOption; robot: RobotSpecification; bom: unknown; failing: string[]; shopping: { key: string | null; name: string; qty: number; unit_usd: number; subtotal_usd: number; url: string | null; why: string }[]; to_buy_usd: number; summary: string; }
export interface FromPartsResult { inventory: Inventory; options: PartsOption[]; designs: Record<string, PartsDesign>; cannot?: { reason: string; add: { key: string; qty: number; usd: number }[]; then: string }; notes: string[]; }

export interface Engine {
  readonly version: string;
  /** Design a robot from a description (the website's prompt bar). */
  design(prompt: string): Promise<DesignResult>;
  /** Change a robot by a description ("make the forearm longer"). */
  modify(robot: RobotSpecification, instruction: string): Promise<DesignResult & { changes?: string[] }>;
  /** Cheap Arduino versions of a description with their prices. */
  arduino(prompt: string): Promise<{ options: unknown[]; notes: string[] }>;
  /** Check and keep a robot from elsewhere (JSON); returns its id for meshes. */
  open(robot: RobotSpecification): Promise<DesignResult>;
  /** Checks and engineering numbers: spec, URDF, torque margins, print bed, clearance, wiring and power per rail. */
  check(robot: RobotSpecification, options?: { quick?: boolean; interference?: boolean; wiring?: boolean }): Promise<CheckReport>;
  /** Collisions over one joint's travel. */
  /** Parts that `link` intersects where it is (mm^3), the part it is attached to included: check a placement before keeping it. */
  clearance(robot: RobotSpecification, link: string): Promise<{ a: string; b: string; volume_mm3: number }[]>;
  sweep(robot: RobotSpecification, joint: string, samples?: number): Promise<{ q: number; hits: { a: string; b: string; volume_mm3: number }[] }[]>;
  urdf(robot: RobotSpecification): Promise<{ urdf: string; xacro: string }>;
  ros2(robot: RobotSpecification, options?: { ros2_control?: boolean }): Promise<Files>;
  cad(robot: RobotSpecification): Promise<Files>;
  training(robot: RobotSpecification): Promise<Files>;
  bom(robot: RobotSpecification, budget?: number): Promise<unknown>;
  /** Parts catalog with mounting points, and the parametric printed parts. */
  catalog(): Promise<Catalog>;
  /** Apply edits; returns the new spec and every mount in the world. The input is not changed. */
  edit(robot: RobotSpecification, ops: EditOp[]): Promise<{ robot: RobotSpecification; mounts: WorldMount[] }>;
  mounts(robot: RobotSpecification): Promise<WorldMount[]>;
  printedMounts(params: PrintedParams): Promise<Mount[]>;
  /** An empty robot to build by hand. */
  empty(name?: string): Promise<RobotSpecification>;
  /** Binary STL of a catalog part (component frame, metres). */
  partMesh(key: string): Promise<ArrayBuffer>;
  /** Binary STL of a link's geometry (link geometry frame, metres). */
  mesh(geometry: RobotSpecification["links"][number]["geometry"]): Promise<ArrayBuffer>;
  /** Binary STL of a mesh link of a robot the engine designed or opened, by its id. */
  robotMesh(id: string, file: string): Promise<ArrayBuffer>;
  templates(): Promise<{ id: string; title: string; description: string }[]>;
  /**
   * Schematic of the robot's wiring: KiCad-style symbols, reference designators, power symbols, net labels and a title
   * block (`svg`, and `pdf` bytes), the netlist it draws, layout problems (empty when nothing overlaps) and the electrical
   * calculations (battery runtime, regulator heat, logic levels).
   */
  schematic(robot: RobotSpecification): Promise<Schematic>;
  /** Picture wiring diagram: every wire of the harness in its colour, pin to pin, on drawings of the parts. */
  breadboard(robot: RobotSpecification): Promise<Breadboard>;
  /**
   * The electronics and harness in 3D: part models with their pins, where each part sits, and every wire's centreline on
   * the links it rides (pose them with your link matrices and the harness follows the joints). With `checks: true`,
   * also the harness checks at the home pose (wires through solids, bend radius, cut length).
   */
  electronics3d(robot: RobotSpecification, options?: { checks?: boolean }): Promise<Electronics3D>;
  /** The electronics and harness at the home pose as one binary glTF (metres, Y up): a node per part and per wire. */
  electronicsGlb(robot: RobotSpecification): Promise<ArrayBuffer>;
  /** Read a parts list ("I have an Arduino Uno, 2 TT motors, an L298N ..."): catalog parts with quantities, extras, not recognised lines with suggestions. (1.1) */
  parseInventory(text: string): Promise<Inventory>;
  /** Search the parts catalog for a parts picker. (1.1) */
  searchParts(query: string, limit?: number): Promise<{ key: string; name: string; category: string; price_usd: number }[]>;
  /**
   * Build from my parts: the robots a parts list can build, best first (how much of the list each uses, what it needs on
   * top), with the designs asked for (`design`: "top" by default, "all", "none" or an option id). (1.1)
   */
  fromParts(inventory: string | { key: string; qty?: number }[] | Record<string, number> | Inventory, options?: { design?: string; limit?: number; budget?: number; prompt?: string }): Promise<FromPartsResult>;
  /**
   * The program of a robot (1.1): the Arduino sketch (or Pi script) of a robot built from a parts list, with its pin
   * assignments; for any other robot with an Arduino-class board (Uno, Nano), a sketch whose every pin is a wire of its
   * wiring record (motor driver, servo and range sensor code, a simple behaviour, serial reports), with the sketch folder
   * and flashing steps in `files` and what it drives in the other fields. Rejects when the robot has none (no such board,
   * or the wearable Mark 43, whose door sequence is not written).
   */
  firmware(robot: RobotSpecification): Promise<Program>;
  /** The motions a robot has: the joint tour, its purpose demo (picked from what its joints are for), human motion for a wearable. */
  motions(robot: RobotSpecification): Promise<MotionInfo[]>;
  /** A motion sampled at `fps` (default 30), checked against the joint limits, speeds and torques and, unless `collision: false`, for self-collision on every frame. `files: true` adds its CSV, ROS 2 JointTrajectory YAML and BVH. */
  motion(robot: RobotSpecification, name: string, options?: { fps?: number; collision?: boolean; to?: [number, number]; files?: boolean }): Promise<Trajectory & { files?: Record<string, string> }>;
  /** Inverse kinematics: joint values that bring a point on `link` to a world pose (the root at the origin unless `base`), within the joint limits, and whether that reached it. */
  ik(robot: RobotSpecification, link: string, target: IkTarget, options?: IkOptions): Promise<IkResult>;
  /** A zip archive of export files. */
  zip(files: Files): Blob;
  /** How many times the engine's worker was replaced (its CAD kernel memory was full, or it aborted). */
  readonly recycles: number;
  terminate(): void;
}

/** A motion a robot has (`motions`). */
export interface MotionInfo { name: string; title: string; description: string; kind: "tour" | "demo" | "human" | "servo"; moves_base: boolean; default?: boolean; }
/** A sampled motion (`motion`): joint values per frame, the root's path, what collides when. */
export interface Trajectory {
  name: string; title: string; robot: string; fps: number; duration_s: number;
  /** columns of q: every joint the motion sets (not fixed, not mimic) */
  joints: string[];
  /** the motor-driven ones (a ROS 2 JointTrajectory's joint_names) */
  actuated: string[];
  t: number[]; q: number[][];
  /** root pose per frame [x, y, z, qx, qy, qz, qw] (floor at z = 0), or null when the root stays put */
  base: number[][] | null;
  /** per frame, the joint a joint tour is moving */
  focus: (string | null)[] | null;
  props: { kind: "box" | "table" | "wearer"; size: [number, number, number]; path: ([number, number, number] | null)[] }[];
  segments: { t0: number; t1: number; label: string }[];
  limits: { position_ok: boolean; velocity_ok: boolean; torque_ok: boolean | null; max_velocity_ratio: number; max_torque_ratio: number | null; violations: string[] };
  collisions: { checked: boolean; voxel_mm: number; tol_mm: number; frames: boolean[]; colliding_frames: number; pairs: { a: string; b: string; frames: number; first_s: number; last_s: number; depth_mm: number }[]; floor: { link: string; frames: number; depth_mm: number }[]; skipped: string[]; note: string } | null;
  clamped: { joint: string; frames: number; beyond_deg: number; note: string }[];
  measures: Record<string, number>;
  warnings: string[]; notes: string[];
}
/** What `ik` answers: joint values, whether the target was reached, how far off the closest pose is. */
export interface IkResult { values: Record<string, number>; reached: boolean; error_mm: number; error_deg: number; position: [number, number, number]; at_limit: string[]; collisions: { a: string; b: string; depth_mm: number }[] | null; }
export interface IkTarget { xyz: [number, number, number]; rpy?: [number, number, number]; quat?: [number, number, number, number]; }
export interface IkOptions { point?: [number, number, number]; seed?: Record<string, number>; joints?: string[]; base?: number[]; orientation?: boolean; restarts?: number; iterations?: number; collision?: boolean; }

interface Reply { status: number; type: string; buffer: ArrayBuffer; }
const dec = new TextDecoder();
function files(f: Record<string, string | { b64: string }>): Files {
  const out: Files = {};
  for (const [k, v] of Object.entries(f)) out[k] = typeof v === "string" ? v : Uint8Array.from(atob(v.b64), (c) => c.charCodeAt(0));
  return out;
}

/**
 * Start the engine. `base` is the site the engine is served from (default: the site this module came from).
 * `onProgress` hears long jobs (the armour forge). `recycleMb` (default 1800) is the CAD kernel memory at which the worker is
 * replaced between requests.
 */
export async function createEngine(opts: { base?: string | URL; onProgress?: (p: ForgeProgress) => void; recycleMb?: number } = {}): Promise<Engine> {
  const base = new URL(opts.base ?? new URL("../../", import.meta.url));
  const script = new URL("browser-engine.js", base);
  const sameOrigin = typeof location !== "undefined" && script.origin === location.origin;
  // a worker must come from the page's own origin: across origins a blob bootstrap imports the engine (CORS)
  // a worker must come from the page's own origin: across origins a blob bootstrap imports the engine (CORS)
  const boot = sameOrigin ? script.href : URL.createObjectURL(new Blob([`self.TTR_ENGINE_BASE=${JSON.stringify(base.href)};await import(${JSON.stringify(script.href)});`], { type: "text/javascript" }));
  // The CAD kernel keeps memory after every design (manifold-3d 3.5.4, see wasm-memory.ts) and aborts at 4 GB: past 1.8 GB the
  // worker is replaced while nothing is waiting, and a request whose kernel aborted goes once more to a fresh worker. The
  // robots it holds (for robotMesh) are handed to the new one.
  const RECYCLE_MB = opts.recycleMb ?? 1800, KERNEL_DIED = /Aborted\(|out of bounds|RuntimeError|unreachable|memory access/i;
  interface Pending { msg: { id: number; method: string; path: string; body: string }; ok: (r: Reply) => void; fail: (e: Error) => void; retried: boolean }
  const waiting = new Map<number, Pending>();
  let next = 1, worker!: Worker, robots = "[]", failedStarts = 0, ready!: Promise<void>, recycles = 0;
  const start = () => {
    worker = new Worker(boot, { type: "module", name: "text-to-robot engine" });
    const w = worker;
    ready = new Promise<void>((ok, fail) => {
      w.onerror = (e) => { if (++failedStarts > 1) fail(new Error(`the engine did not start: ${e.message || "blocked or out of memory"}`)); else { restart(); ok(); } };
      w.onmessage = ({ data }) => { if (data.ready) { failedStarts = 0; w.postMessage({ robots }); ok(); w.onmessage = onMessage; w.onerror = () => { if (w === worker) restart(); }; } };
    });
  };
  const onMessage = ({ data }: MessageEvent) => {
    if (data.forge) { opts.onProgress?.(data.forge); return; }
    if (data.save) { robots = data.save; return; }
    if (data.forgePreview || data.ready) return;
    const p = waiting.get(data.id); if (!p) return;
    if (data.status >= 400 && !p.retried && KERNEL_DIED.test(dec.decode(data.buffer))) { restart(); return; }
    waiting.delete(data.id);
    p.ok({ status: data.status, type: data.type, buffer: data.buffer });
    if (data.wasm_mb > RECYCLE_MB && waiting.size === 0) { recycles++; const old = worker; start(); old.terminate(); }
  };
  // a request waits for a worker that has started; if that worker is replaced meanwhile it goes to the new one
  const send = async (p: Pending) => { for (;;) { const r = ready, w = worker; await r; if (w === worker) { w.postMessage(p.msg); return; } } };
  const restart = () => {
    recycles++; const old = worker; start(); old.terminate();
    for (const [id, p] of [...waiting]) {
      if (p.retried) { waiting.delete(id); p.fail(new Error("the engine ran out of memory twice on this request")); }
      else { p.retried = true; void send(p); }
    }
  };
  start();
  await ready;
  const call = (method: string, path: string, body?: unknown) => new Promise<Reply>((ok, fail) => {
    const id = next++, p = { msg: { id, method, path, body: body === undefined ? "" : JSON.stringify(body) }, ok, fail, retried: false };
    waiting.set(id, p); void send(p);
  });
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await call(method, path, body), text = dec.decode(r.buffer);
    let v: any; try { v = JSON.parse(text); } catch { throw new Error(`engine answered ${r.status}: ${text.slice(0, 200)}`); }
    if (r.status >= 400) throw new Error(v?.error ?? `engine answered ${r.status}`);
    return v as T;
  };
  const bytes = async (method: string, path: string, body?: unknown) => { const r = await call(method, path, body); if (r.status >= 400) throw new Error(JSON.parse(dec.decode(r.buffer)).error ?? `engine answered ${r.status}`); return r.buffer; };
  let catalog: Promise<Catalog> | undefined;
  // a robot is sent to the worker once; motions and IK solves refer to it by handle (one small message per drag step)
  const handles = new WeakMap<RobotSpecification, Promise<string>>();
  const handle = (robot: RobotSpecification) => { let h = handles.get(robot); if (!h) { h = json<{ handle: string }>("POST", "/api/engine/motion-session", { robot }).then((r) => r.handle); handles.set(robot, h); } return h; };
  const byHandle = async <T>(robot: RobotSpecification, path: string, body: Record<string, unknown>): Promise<T> => {
    try { return await json<T>("POST", path, { handle: await handle(robot), ...body }); }
    catch (e) { if (!/unknown motion session/.test((e as Error).message)) throw e; handles.delete(robot); return json<T>("POST", path, { handle: await handle(robot), ...body }); }
  };
  const v = await json<{ api: string }>("GET", "/api/engine/version");
  return {
    version: v.api,
    design: (prompt) => json("POST", "/api/robots/generate", { prompt }),
    modify: (robot, instruction) => json("POST", "/api/robots/modify", { robot, instruction }),
    arduino: (prompt) => json("POST", "/api/arduino", { prompt }),
    open: (robot) => json("POST", "/api/robots/import", { robot }),
    check: (robot, options) => json("POST", "/api/engine/check", { robot, options }),
    clearance: async (robot, link) => (await json<{ hits: never }>("POST", "/api/engine/clearance", { robot, link })).hits,
    sweep: async (robot, joint, samples) => (await json<{ samples: never }>("POST", "/api/engine/sweep", { robot, joint, samples })).samples,
    urdf: (robot) => json("POST", "/api/engine/urdf", { robot }),
    ros2: async (robot, o) => files((await json<{ files: never }>("POST", "/api/robots/export", { robot, ros2_control: o?.ros2_control ?? true })).files),
    cad: async (robot) => files((await json<{ files: never }>("POST", "/api/robots/cad", { robot })).files),
    training: async (robot) => files((await json<{ files: never }>("POST", "/api/robots/training", { robot })).files),
    bom: async (robot, budget) => (await json<{ bom: unknown }>("POST", "/api/robots/bom", { robot, budget })).bom,
    catalog: () => (catalog ??= json<Catalog>("GET", "/api/engine/catalog")),
    edit: (robot, ops) => json("POST", "/api/engine/edit", { robot, ops }),
    mounts: async (robot) => (await json<{ mounts: WorldMount[] }>("POST", "/api/engine/mounts", { robot })).mounts,
    printedMounts: async (params) => (await json<{ mounts: Mount[] }>("POST", "/api/engine/printed-mounts", { params })).mounts,
    empty: async (name) => (await json<{ robot: RobotSpecification }>("POST", "/api/engine/empty", { name })).robot,
    partMesh: (key) => bytes("GET", `/api/engine/part/${encodeURIComponent(key)}.stl`),
    mesh: (geometry) => bytes("POST", "/api/engine/mesh", { geometry }),
    robotMesh: (id, file) => bytes("GET", `/api/robots/${encodeURIComponent(id)}/mesh/${encodeURIComponent(file)}`),
    templates: async () => (await json<{ templates: never }>("GET", "/api/templates")).templates,
    schematic: async (robot) => { const r = await json<Omit<Schematic, "pdf"> & { pdf: { b64: string } }>("POST", "/api/engine/schematic", { robot }); return { ...r, pdf: Uint8Array.from(atob(r.pdf.b64), (c) => c.charCodeAt(0)) }; },
    breadboard: (robot) => json("POST", "/api/engine/breadboard", { robot }),
    electronicsGlb: (robot) => bytes("POST", "/api/engine/electronics-glb", { robot }),
    electronics3d: (robot, options) => json("POST", "/api/engine/electronics3d", { robot, options: options ?? {} }),
    parseInventory: (text) => json("POST", "/api/engine/parse-inventory", { text }),
    searchParts: async (query, limit) => (await json<{ parts: never }>("POST", "/api/engine/parts-search", { query, limit })).parts,
    fromParts: (inventory, options) => json("POST", "/api/engine/from-parts", { inventory, options }),
    firmware: (robot) => json("POST", "/api/engine/firmware", { robot }),
    motions: async (robot) => (await byHandle<{ motions: MotionInfo[] }>(robot, "/api/engine/motions", {})).motions,
    motion: async (robot, name, o) => { const r = await byHandle<{ trajectory: Trajectory; files?: Record<string, string> }>(robot, "/api/engine/motion", { name, ...o }); return { ...r.trajectory, ...(r.files ? { files: r.files } : {}) }; },
    ik: (robot, link, target, o) => byHandle<IkResult>(robot, "/api/engine/ik", { link, target, options: o ?? {} }),
    zip: (f) => makeZip(f) as Blob,
    get recycles() { return recycles; },
    terminate: () => worker.terminate(),
  };
}
