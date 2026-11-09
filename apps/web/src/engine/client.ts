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

export const API_VERSION = "1.0.0";
export type { RobotSpecification, EditOp, PrintedParams, Mount, WorldMount };
export { applyEdits, toScene, fromScene, worldFrames, rootLink, subtree, parentJoint, kindOf, poseMat, matPose, mul, inv, apply, emptyRobot, freeName, type Scene, type SceneNode } from "./edit.ts";
export { snapPart, mate, mountFrame, compatible, patternsMatch, MATES, type Snap } from "./snap.ts";

export interface Check { name: string; pass: boolean; detail: string; }
export interface DesignResult { id: string; robot: RobotSpecification; urdf: string; xacro: string; summary?: string; warnings?: string[]; validation?: unknown; urdfValidation?: unknown; bom?: unknown; [k: string]: unknown; }
export interface JointReport { joint: string; actuator: string | null; required_nm: number; rated_nm?: number; peak_nm?: number; margin: number | null; speed_rad_s?: number; ok?: boolean; note: string; }
export interface RailReport { name: string; voltage_v: number; source: string; continuous_a: number; peak_limit_a: number; typical_a: number; peak_a: number; ok: boolean; [k: string]: unknown; }
export interface Engineering { mass_kg: number; com_m: [number, number, number]; cost_usd: number; bom_lines: number; joints: JointReport[]; rails: RailReport[]; wiring_unconnected: string[]; printed: { name: string; bbox_mm: number[]; fits_bed: boolean; watertight: boolean; mass_kg: number; volume_cm3: number }[]; stability: { margin_mm: number; tip_deg: number; com_m: [number, number, number]; support: [number, number][]; ground_z: number; worst_pose: Record<string, number>; free_standing: boolean } | null; links: number; dof: number; }
export interface CheckReport { robot: RobotSpecification; urdf: string; valid: boolean; checks: Check[]; engineering: Engineering | null; }
export interface CatalogPart { key: string; name: string; category: string; mass_g: number; price_usd: number; supplier_url: string; datasheet_url: string; envelope_mm: number[]; bbox_mm: { min: number[]; max: number[] } | null; mounts: Mount[]; rating?: { rated_nm: number; peak_nm: number; speed_rad_s: number; voltage_v: number; range_deg: number | null; continuous: boolean }; electrical?: { role: string; voltage_v: { min: number; nom: number; max: number }; current_a: { typical: number; peak: number }; ports: string[] }; }
export interface PrintedShape { shape: PrintedParams["shape"]; label: string; defaults: PrintedParams; mounts: Mount[]; }
export interface Catalog { parts: CatalogPart[]; printed: PrintedShape[]; }
/** Files of an export: text, or bytes. */
export type Files = Record<string, string | Uint8Array>;
export interface ForgeProgress { stage: string; [k: string]: unknown; }

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
  /** A zip archive of export files. */
  zip(files: Files): Blob;
  terminate(): void;
}

interface Reply { status: number; type: string; buffer: ArrayBuffer; }
const dec = new TextDecoder();
function files(f: Record<string, string | { b64: string }>): Files {
  const out: Files = {};
  for (const [k, v] of Object.entries(f)) out[k] = typeof v === "string" ? v : Uint8Array.from(atob(v.b64), (c) => c.charCodeAt(0));
  return out;
}

/**
 * Start the engine. `base` is the site the engine is served from (default: the site this module came from).
 * `onProgress` hears long jobs (the armour forge).
 */
export async function createEngine(opts: { base?: string | URL; onProgress?: (p: ForgeProgress) => void } = {}): Promise<Engine> {
  const base = new URL(opts.base ?? new URL("../../", import.meta.url));
  const script = new URL("browser-engine.js", base);
  const sameOrigin = typeof location !== "undefined" && script.origin === location.origin;
  // a worker must come from the page's own origin: across origins a blob bootstrap imports the engine (CORS)
  const boot = sameOrigin ? script : URL.createObjectURL(new Blob([`self.TTR_ENGINE_BASE=${JSON.stringify(base.href)};await import(${JSON.stringify(script.href)});`], { type: "text/javascript" }));
  const worker = new Worker(boot, { type: "module", name: "text-to-robot engine" });
  const waiting = new Map<number, { ok: (r: Reply) => void; fail: (e: Error) => void }>();
  let next = 1;
  await new Promise<void>((ok, fail) => {
    worker.onerror = (e) => fail(new Error(`the engine did not start: ${e.message || "blocked or out of memory"}`));
    worker.onmessage = ({ data }) => { if (data.ready) ok(); };
  });
  if (!sameOrigin) URL.revokeObjectURL(boot as string);
  worker.onmessage = ({ data }) => {
    if (data.forge) { opts.onProgress?.(data.forge); return; }
    if (data.save || data.forgePreview || data.ready) return;
    const w = waiting.get(data.id); waiting.delete(data.id);
    w?.ok({ status: data.status, type: data.type, buffer: data.buffer });
  };
  worker.onerror = (e) => { for (const w of waiting.values()) w.fail(new Error(`the engine stopped: ${e.message || "out of memory?"}`)); waiting.clear(); };
  const call = (method: string, path: string, body?: unknown) => new Promise<Reply>((ok, fail) => {
    const id = next++; waiting.set(id, { ok, fail });
    worker.postMessage({ id, method, path, body: body === undefined ? "" : JSON.stringify(body) });
  });
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await call(method, path, body), text = dec.decode(r.buffer);
    let v: any; try { v = JSON.parse(text); } catch { throw new Error(`engine answered ${r.status}: ${text.slice(0, 200)}`); }
    if (r.status >= 400) throw new Error(v?.error ?? `engine answered ${r.status}`);
    return v as T;
  };
  const bytes = async (method: string, path: string, body?: unknown) => { const r = await call(method, path, body); if (r.status >= 400) throw new Error(JSON.parse(dec.decode(r.buffer)).error ?? `engine answered ${r.status}`); return r.buffer; };
  let catalog: Promise<Catalog> | undefined;
  const v = await json<{ api: string }>("GET", "/api/engine/version");
  return {
    version: v.api,
    design: (prompt) => json("POST", "/api/robots/generate", { prompt }),
    modify: (robot, instruction) => json("POST", "/api/robots/modify", { robot, instruction }),
    arduino: (prompt) => json("POST", "/api/arduino", { prompt }),
    open: (robot) => json("POST", "/api/robots/import", { robot }),
    check: (robot, options) => json("POST", "/api/engine/check", { robot, options }),
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
    zip: (f) => makeZip(f) as Blob,
    terminate: () => worker.terminate(),
  };
}
