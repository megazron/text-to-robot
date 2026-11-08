// What a prompt says about the Mark 43 armour itself: its build (bulk), the size of the pauldrons, the panel style, and its paint.
// The shape goes to the forge (packages/mesh/src/forge), which makes the armour from these numbers; the paint goes to the designer.
import { DEFAULT_SHAPE, type ArmourShape } from "@ttr/mesh";
import { COLOURS } from "./text.ts";

export type RGBA = [number, number, number, number];
export interface SuitPaint { base?: RGBA; trim?: RGBA; steel?: RGBA; }
export interface SuitOptions { shape: ArmourShape; paint: SuitPaint; said: string[]; ignored: string[]; }

/** the suit's own paint names: base (the red), trim (the gold), steel (the silver) */
export const PAINT_NAMES = { base: "armour_red", trim: "armour_gold", steel: "armour_silver" } as const;
const ALIAS: Record<string, string> = { golden: "gold", silvery: "silver", crimson: "red", navy: "blue", steel: "silver", chrome: "silver", gunmetal: "grey", titanium: "silver" };
const WORDS = [...Object.keys(COLOURS), ...Object.keys(ALIAS)].join("|");
const canon = (c: string) => ALIAS[c] ?? c;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function suitOptions(t: string): SuitOptions {
  const shape: ArmourShape = { ...DEFAULT_SHAPE }, paint: SuitPaint = {}, said: string[] = [], ignored: string[] = [];
  // build: bulkier or slimmer armour, in words or per cent
  const pct = t.match(/\b(\d{1,2})\s*(?:%|per\s*cent|percent)\s+(bulkier|thicker|chunkier|slimmer|thinner|leaner)\b/);
  if (pct) {
    const p = Number(pct[1]) / 100, want = /bulk|thick|chunk/.test(pct[2]) ? 1 + p : 1 - p, got = clamp(want, 0.85, 1.2);
    shape.bulk = +got.toFixed(2);
    if (Math.abs(got - want) > 1e-9) ignored.push(`${pct[0]}: armour build is limited to 0.85-1.20 of the film suit; built at ${got.toFixed(2)}`);
  } else if (/\b(?:bulk(?:y|ier)|chunk(?:y|ier)|beef(?:y|ier)|heav(?:y|ier)[\s-]+(?:armou?r|build|suit)|thick(?:er)?[\s-]+armou?r|broad(?:er)?[\s-]+build|tank(?:y|ier))\b/.test(t)) shape.bulk = 1.12;
  else if (/\b(?:slim(?:mer)?|sleek(?:er)?|lean(?:er)?|slender|streamlined|light(?:er)?[\s-]+armou?r|thin(?:ner)?[\s-]+armou?r)\b/.test(t)) shape.bulk = 0.9;
  if (shape.bulk !== 1) said.push(`armour build ${shape.bulk > 1 ? "bulkier" : "slimmer"} (${shape.bulk.toFixed(2)} of the film suit)`);
  // pauldrons
  if (/\b(?:big(?:ger)?|large(?:r)?|broad(?:er)?|wide(?:r)?|huge|massive|oversized)[\s-]+(?:shoulders?|pauldrons?|shoulder[\s-]+(?:armou?r|plates?))\b/.test(t)) shape.shoulder = 1.2;
  else if (/\b(?:small(?:er)?|narrow(?:er)?|compact|slim(?:mer)?|low[\s-]+profile)[\s-]+(?:shoulders?|pauldrons?|shoulder[\s-]+(?:armou?r|plates?))\b/.test(t)) shape.shoulder = 0.85;
  if (shape.shoulder !== 1) said.push(`pauldrons ${shape.shoulder > 1 ? "larger" : "smaller"} (${shape.shoulder.toFixed(2)})`);
  // panels
  if (/\b(?:smooth|clean|minimal|plain|simple)[\s-]+(?:panels?|panel[\s-]+lines?|armou?r|plates?|finish|look|surface)\b|\bno[\s-]+panel[\s-]+lines?\b/.test(t)) shape.panels = "smooth";
  else if (/\b(?:heavy|deep|bold|raised|chunky|pronounced)[\s-]+(?:panels?|plates?|panel[\s-]+lines?|plating)\b/.test(t)) shape.panels = "heavy";
  if (shape.panels !== "film") said.push(shape.panels === "smooth" ? "panels smooth (fine panel lines left out)" : "panels heavy (plates stand twice as proud)");
  // paint: "black and gold", "<colour> trim", "<colour> joints"; one colour alone is the base
  const pair = t.match(new RegExp(String.raw`\b(${WORDS})(?:\s*(?:,|and|&|with|/)\s*(?:a\s+)?)(${WORDS})\b(?!\s*(?:camera|lidar|led|lights?|eyes?))`));
  const trim = t.match(new RegExp(String.raw`\b(${WORDS})[\s-]+(?:trim|accents?|details?|faceplate|mask|highlights?)\b`)), steel = t.match(new RegExp(String.raw`\b(${WORDS})[\s-]+(?:joints?|undersuit|steel|metal\s+parts?)\b`));
  const single = t.match(new RegExp(String.raw`\b(?:painted|coloured|colored|finished in|in)\s+(?:matte\s+|glossy\s+|bright\s+|dark\s+)?(${WORDS})\b|\b(${WORDS})[\s-]+(?:iron[\s-]?man|mark\s*\d+|suit|armou?r)\b`));
  const set = (k: keyof SuitPaint, c: string) => { const n = canon(c); paint[k] = [...COLOURS[n]] as RGBA; said.push(`${k === "base" ? "base paint" : k === "trim" ? "trim paint" : "steel parts"} ${n}`); };
  if (pair) { set("base", pair[1]); set("trim", pair[2]); }
  else if (single) set("base", (single[1] ?? single[2])!);
  if (trim && !(pair && canon(pair[2]) === canon(trim[1]))) set("trim", trim[1]);
  if (steel) set("steel", steel[1]);
  // the film colours are the reference paint: no change
  if (paint.base && canon(pair?.[1] ?? single?.[1] ?? single?.[2] ?? "") === "red") { delete paint.base; said.splice(said.findIndex((s) => s.startsWith("base paint")), 1); }
  if (paint.trim && canon(pair?.[2] ?? trim?.[1] ?? "") === "gold") { delete paint.trim; said.splice(said.findIndex((s) => s.startsWith("trim paint")), 1); }
  return { shape, paint, said, ignored };
}
export const isDefaultShape = (s: ArmourShape) => s.bulk === 1 && s.shoulder === 1 && s.panels === "film";
