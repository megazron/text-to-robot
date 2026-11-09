// Armour shells made by scripts/forge_mark43.py: closed printable pieces in the wearer's world frame (mm, home
// pose) kept as one quantised binary (uint16 vertices per piece's own box, uint16 triangle indices) and a JSON manifest.
// Node reads the files on first use; the browser fetches them and hands them to setArmourPack() before designing.
import { readFileSync } from "node:fs";
import type { Mesh } from "./core.ts";

export interface ArmourPiece {
  name: string; link: string; material: string; region: string;
  /** quantisation box: x = lo + q * step (mm) */
  lo: [number, number, number]; step: [number, number, number];
  nv: number; nf: number; /** byte offsets of the vertices and the indices in the binary */ ov: number; of: number;
  volume_mm3: number; centroid: [number, number, number];
  /** a palm lens's outward direction */
  normal?: [number, number, number];
  /** made by scripts/fit_wiring.py: a cable channel or a compartment's seat */
  wiring?: boolean;
  /** made by scripts/fit_doors.py: a hinge, servo pod, drive arm or latch part. It holds real parts, so it keeps its size at every suit height and moves with `anchor` (world mm) */
  hardware?: boolean; anchor?: [number, number, number];
}
/** A door of the suit (world mm, home pose): a revolute joint on its servo, whose output lies on the hinge line. */
export interface ArmourDoor {
  name: string; part: string; side: string; link: string; joint: string; parent: string; region: string;
  /** a point on the hinge line, its direction up the suit, and the sense of opening about that direction */
  a: [number, number, number]; up: [number, number, number]; sign: number;
  hinges: [number, number, number][];
  /** the drive: the servo's key, its name in the design and its pose (row-major 4x4, world mm) */
  servo: { key: string; name: string; T: number[][] };
  /** what the sweep found: degrees reached in the opening sequence, and alone with every other door shut, and what stopped it */
  measured_deg: number; alone_deg: number; stopped_by: string | null; alone_stopped_by: string | null;
  /** furthest point of the door from its hinge line */
  reach_mm: number;
}
/** A latch: a sprung pawl on a servo, on `parent`, hooking a ledge on the door. */
export interface ArmourLatch { name: string; door: string; parent: string; link: string; joint: string; region: string; key: string; T: number[][]; travel: number; room_mm: number; }
/** Where a compartment seats: its floor's outer corner O, length along ex, width along ey, ez out of the suit; ports (u, v) in the cavity's own measure. */
export interface ArmourBay { link: string; length_mm: number; width_mm: number; O: [number, number, number]; ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number]; ports: [number, number][]; }
/** A cable channel on the inside of a shell: where its trough runs (world mm, home pose). */
export interface ArmourChannel { name: string; link: string; region: string; width_mm: number; depth_mm: number; pts: [number, number, number][]; }
export interface ArmourManifest {
  source: string; wearer_height_m: number;
  pieces: ArmourPiece[];
  /** measured: how far each joint moves before armour meets armour (rad) */
  limits: Record<string, [number, number]>;
  /** faceplate pivot in the head frame (x, z mm) and the rear edge of the faceplate */
  hinge: [number, number]; face_rear_x: number;
  /** wearer joint centres, world mm at the reference height */
  joints: Record<string, [number, number, number]>;
  notes: string[];
  channels: ArmourChannel[];
  doors: ArmourDoor[]; latches: ArmourLatch[];
  /** the order the doors open in, stage by stage (joint names); they close in reverse */
  sequence: string[][];
  /** seats of the compartments: the battery bay on the left back door, a driver bay each side of the waist */
  bays: { back: ArmourBay; drive_left: ArmourBay; drive_right: ArmourBay };
}

/** What a prompt may change in the armour itself (the forge's inputs; packages/mesh/src/forge/mark43.ts). */
export interface ArmourShape { bulk: number; shoulder: number; panels: "film" | "smooth" | "heavy"; }
export const DEFAULT_SHAPE: ArmourShape = { bulk: 1, shoulder: 1, panels: "film" };
/** bump when the forge's output changes, so cached packs are made again */
export const FORGE_VERSION = 1;
export const shapeKey = (s: ArmourShape) => `v${FORGE_VERSION}|bulk ${s.bulk}|shoulder ${s.shoulder}|panels ${s.panels}`;
const sameShape = (a: ArmourShape, b: ArmourShape) => shapeKey(a) === shapeKey(b);

let manifest: ArmourManifest | undefined, bytes: Uint8Array | undefined;
export function setArmourPack(m: ArmourManifest, b: Uint8Array): void { manifest = m; bytes = b; }
export const armourPackLoaded = () => !!manifest;
/** the shape the loaded pack was forged with */
export function armourShape(): ArmourShape {
  const p = (manifest as { params?: Partial<ArmourShape> } | undefined)?.params;
  return { bulk: p?.bulk ?? 1, shoulder: p?.shoulder ?? 1, panels: p?.panels ?? "film" };
}
/** Where packs come from: "file" reads the shipped cache for the reference shape (Node), "forge" always forges (the website). */
let source: "file" | "forge" = "file";
export const setArmourSource = (s: "file" | "forge") => { source = s; };
/** can armour meshes be built now without forging (the pack is loaded, or Node reads the shipped one) */
export const armourAvailable = () => !!manifest || source === "file";
/** a store for forged packs that outlives the page (the website gives IndexedDB) */
export interface ArmourCache { get(key: string): Promise<{ manifest: ArmourManifest; bytes: Uint8Array } | undefined>; put(key: string, manifest: ArmourManifest, bytes: Uint8Array): Promise<void>; }
let cache: ArmourCache | undefined;
export const setArmourCache = (c: ArmourCache | undefined) => { cache = c; };
export interface ForgeProgress { stage: string; done: number; total: number; detail: string; }
export interface PreviewPart { material: string; v: Float32Array; f: Uint32Array; }
let forging: Promise<unknown> | undefined, hear: ((p: ForgeProgress) => void | Promise<void>) | undefined, say: ((s: string) => void) | undefined, look: ((parts: PreviewPart[]) => void) | undefined;
/** who hears the forge when a caller passes no listener (the website's worker posts it to the page); `preview` gets a coarse look first */
export const setForgeListener = (onProgress?: (p: ForgeProgress) => void | Promise<void>, log?: (s: string) => void, preview?: (parts: PreviewPart[]) => void) => { hear = onProgress; say = log; look = preview; };
/**
 * Makes the loaded pack the one for `shape`: the loaded one if it matches, then the shipped file (reference shape, Node only), then the
 * cache, else the forge runs (minutes; `onProgress` hears from it). Returns where the pack came from.
 */
/** The site serves the reference suit ready-made (the shipped pack): `fetchPrebuilt` returns it, or undefined when it cannot. */
let prebuilt: (() => Promise<{ manifest: ArmourManifest; bytes: Uint8Array } | undefined>) | undefined;
export const setPrebuilt = (f: typeof prebuilt) => { prebuilt = f; };
/** Thrown instead of forging when the forge needs the visitor's go-ahead (setForgeGate): its shape says which suit would be made. */
export class ForgeNeedsConsent extends Error { shape: ArmourShape; constructor(shape: ArmourShape) { super("forging this Mark 43 armour takes many minutes: it needs a go-ahead first"); this.name = "ForgeNeedsConsent"; this.shape = shape; } }
let gate: ((shape: ArmourShape) => boolean) | undefined;
/** Asked before any forge: false throws ForgeNeedsConsent (the website asks the visitor first). */
export const setForgeGate = (g: typeof gate) => { gate = g; };
let cancelled = false;
/** Stops a forge that is running: it throws at its next step. */
export const cancelForge = () => { cancelled = true; };
export const forgeCancelled = () => cancelled;
/**
 * Makes the loaded pack the one for `shape`: the loaded one if it matches, then the shipped file (reference shape: read in Node, fetched on
 * the website), then the cache, else the forge runs (minutes; `onProgress` hears from it), once the gate allows it. Returns where it came from.
 */
export async function ensureArmourPack(shape: ArmourShape = DEFAULT_SHAPE, onProgress?: (p: ForgeProgress) => void | Promise<void>, log?: (s: string) => void): Promise<"loaded" | "file" | "prebuilt" | "cache" | "forged"> {
  while (forging) await forging.catch(() => {});
  if (manifest && sameShape(armourShape(), shape)) return "loaded";
  if (source === "file" && sameShape(shape, DEFAULT_SHAPE)) { manifest = undefined; load(); return "file"; }
  if (prebuilt && sameShape(shape, DEFAULT_SHAPE)) { const got = await prebuilt(); if (got) { setArmourPack(got.manifest, got.bytes); return "prebuilt"; } }
  const key = shapeKey(shape), hit = await cache?.get(key);
  if (hit) { setArmourPack(hit.manifest, hit.bytes); return "cache"; }
  if (gate && !gate(shape)) throw new ForgeNeedsConsent(shape);
  cancelled = false;
  const job = (async () => {
    const [{ forgeSuit }, { forgePreview }, { manifoldModule }] = await Promise.all([import("./forge/suit.ts"), import("./forge/mark43.ts"), import("@ttr/kernel")]);
    if (look) look((await forgePreview(shape)).map((p) => ({ material: p.material, v: Float32Array.from(p.mesh.v), f: p.mesh.f })));
    const tell = onProgress ?? hear;
    const r = await forgeSuit(await manifoldModule(), { voxel: 2, ...shape }, async (p) => { if (cancelled) throw new Error("the forge was cancelled"); await tell?.(p); }, log ?? say);
    setArmourPack(r.manifest, r.bytes);
    await cache?.put(key, r.manifest, r.bytes);
  })();
  forging = job;
  try { await job; } finally { forging = undefined; }
  return "forged";
}
function load(): void {
  if (manifest) return;
  if (source === "forge") throw new Error("the Mark 43 armour has not been forged yet (ensureArmourPack)");
  const dir = new URL("../../parts/data/", import.meta.url);
  manifest = JSON.parse(String(readFileSync(new URL("mark43_pack.json", dir)))) as ArmourManifest;
  bytes = new Uint8Array(readFileSync(new URL("mark43_pack.bin", dir)) as unknown as ArrayBufferLike);
}
export function armourManifest(): ArmourManifest { load(); return manifest!; }

/** One piece as a mesh in metres: scaled by s about the world origin, then moved by the column-major 4x4 `toLink` (metres). */
export function armourMesh(name: string, s: number, toLink: number[]): Mesh {
  load();
  const p = manifest!.pieces.find((x) => x.name === name);
  if (!p) throw new Error(`armour piece '${name}' is not in the pack`);
  const dv = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength), T = toLink;
  const v: [number, number, number][] = [], f: [number, number, number][] = [];
  for (let i = 0; i < p.nv; i++) {
    const w = [0, 1, 2].map((k) => ((p.lo[k] + dv.getUint16(p.ov + (i * 3 + k) * 2, true) * p.step[k]) * s) / 1000);
    v.push([T[0] * w[0] + T[4] * w[1] + T[8] * w[2] + T[12], T[1] * w[0] + T[5] * w[1] + T[9] * w[2] + T[13], T[2] * w[0] + T[6] * w[1] + T[10] * w[2] + T[14]]);
  }
  for (let i = 0; i < p.nf; i++) f.push([dv.getUint16(p.of + i * 6, true), dv.getUint16(p.of + i * 6 + 2, true), dv.getUint16(p.of + i * 6 + 4, true)]);
  return { v, f };
}
