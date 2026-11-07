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
  /** made by scripts/fit_wiring.py: a cable channel or the bay's seat */
  wiring?: boolean;
}
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
  /** the back compartment's seat: rear face of the saddle (x), lowest cavity edge (z), cavity size and the ports through the shell (z, y), world mm */
  bay: { rear_x: number; z0: number; length_mm: number; width_mm: number; ports: [number, number][] };
}

let manifest: ArmourManifest | undefined, bytes: Uint8Array | undefined;
export function setArmourPack(m: ArmourManifest, b: Uint8Array): void { manifest = m; bytes = b; }
export const armourPackLoaded = () => !!manifest;
function load(): void {
  if (manifest) return;
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
