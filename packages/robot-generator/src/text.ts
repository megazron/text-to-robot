// Lexical helpers for the local prompt parser: normalisation, negation-aware
// matching and unit-aware quantities. Pure functions; no templates here.

/** Lower-case, unify dashes/quotes and collapse whitespace. */
export function normalize(text: string): string {
  return (text || "").toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, " ").trim();
}

const NEGATOR = /\b(?:no|without|not|w\/o|excluding|except|minus|never|don't|do not)\b/g;
// A negation covers a list ("without lidar or camera") until the clause turns
// positive again ("no lidar, but a camera"; "no lidar and a camera").
const SCOPE_END = /[,;.:!?]|\b(?:but|with|plus|and (?:a|an|one|two|three|four|\d))\b/g;

/** Is the match at `index` inside a negated phrase such as "without a camera"? */
export function isNegated(t: string, index: number): boolean {
  const before = t.slice(0, index);
  let neg = -1;
  for (const m of before.matchAll(NEGATOR)) neg = m.index! + m[0].length;
  if (neg < 0) return false;
  const between = before.slice(neg);
  SCOPE_END.lastIndex = 0;
  return !SCOPE_END.test(between) && between.split(" ").filter(Boolean).length <= 5;
}

export interface Hit { index: number; text: string; }

const globalOf = (rx: RegExp) => new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");

/** First occurrence of `rx` that is not negated. */
export function find(t: string, rx: RegExp): Hit | undefined {
  for (const m of t.matchAll(globalOf(rx))) if (!isNegated(t, m.index!)) return { index: m.index!, text: m[0] };
  return undefined;
}
export const mentions = (t: string, rx: RegExp): boolean => find(t, rx) !== undefined;
/** Some occurrence of `rx` is explicitly negated ("no lidar"). */
export function negates(t: string, rx: RegExp): boolean {
  for (const m of t.matchAll(globalOf(rx))) if (isNegated(t, m.index!)) return true;
  return false;
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM = String.raw`(\d+(?:\.\d+)?|${Object.keys(WORD_NUM).join("|")})`;
const toNumber = (s: string) => WORD_NUM[s] ?? parseFloat(s);

/** Requested degrees of freedom, e.g. "6 DOF", "seven-axis", "5 joints". Not clamped. */
export function extractDofRaw(text: string): number | undefined {
  const t = normalize(text);
  const m = t.match(new RegExp(String.raw`\b${NUM}\s*-?\s*(?:dof|d\.o\.f\.?|degrees?\s+of\s+freedom|axis|axes|joints?)\b`));
  return m ? toNumber(m[1]) : undefined;
}

// ---------------- lengths ----------------
const LENGTH_UNITS: [RegExp, number][] = [
  [/^(?:mm|millimet(?:er|re)s?)$/, 0.001], [/^(?:cm|centimet(?:er|re)s?)$/, 0.01],
  [/^(?:m|met(?:er|re)s?)$/, 1], [/^(?:in|inch|inches|")$/, 0.0254], [/^(?:ft|feet|foot|')$/, 0.3048],
];
export type LengthContext = "reach" | "height" | "width" | "length";
export interface Length { metres: number; raw: string; index: number; context?: LengthContext; /** "under 2 m" / "at least 50 cm" */ bound?: "max" | "min"; }

const LENGTH_RX = /(\d+(?:\.\d+)?)\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|met(?:er|re)s?|m|inch(?:es)?|in(?=\s*(?:long|tall|high|wide|reach|of reach|arm|$|[,.;])|")|"|ft|feet|foot)(?![a-z0-9/])/g;

function lengthContext(t: string, start: number, end: number): LengthContext | undefined {
  const after = t.slice(end, end + 24), before = t.slice(Math.max(0, start - 24), start);
  const near = (rx: RegExp) => rx.test(after) || rx.test(before);
  if (near(/\breach\b|\bspan\b|\bworking (?:radius|range)\b/)) return "reach";
  if (near(/\btall\b|\bheight\b|\bhigh\b|\bstature\b|\bwearer\b|\bperson\b|\bpilot\b/)) return "height";
  if (near(/\bwide\b|\bwidth\b/)) return "width";
  if (near(/\blong\b|\blength\b/)) return "length";
  return undefined;
}

/** All explicit lengths ("60 cm reach", "1.2 m tall", "24 in long", "6 ft wearer") in metres. */
export function extractLengths(text: string): Length[] {
  const t = normalize(text), out: Length[] = [];
  for (const m of t.matchAll(LENGTH_RX)) {
    const factor = LENGTH_UNITS.find(([rx]) => rx.test(m[2]))?.[1];
    if (factor === undefined) continue;
    const lead = t.slice(Math.max(0, m.index! - 16), m.index!);
    const bound = /\b(?:under|below|less than|at most|up to|max(?:imum)?|no more than|within)\s*(?:of\s*)?$/.test(lead) ? "max" as const
      : /\b(?:over|above|more than|at least|min(?:imum)?|no less than)\s*(?:of\s*)?$/.test(lead) ? "min" as const : undefined;
    out.push({ metres: parseFloat(m[1]) * factor, raw: m[0].trim(), index: m.index!, context: lengthContext(t, m.index!, m.index! + m[0].length), ...(bound ? { bound } : {}) });
  }
  // "6 ft 2" / "5'10\"" style statures
  for (const m of t.matchAll(/(\d)\s*(?:ft|feet|')\s*(\d{1,2})\s*(?:in|inches|")?(?![a-z0-9.])/g)) {
    const i = out.findIndex((l) => l.index === m.index);
    const metres = parseInt(m[1], 10) * 0.3048 + parseInt(m[2], 10) * 0.0254;
    const entry: Length = { metres, raw: m[0].trim(), index: m.index!, context: lengthContext(t, m.index!, m.index! + m[0].length) ?? "height" };
    if (i >= 0) out[i] = entry; else out.push(entry);
  }
  return out;
}

/** Speeds ("2 m/s", "5 km/h", "3 mph"); reported because they are not modelled. */
export function extractSpeeds(text: string): string[] {
  return [...normalize(text).matchAll(/\d+(?:\.\d+)?\s*(?:m\/s|km\/h|kph|mph|rpm|deg\/s|°\/s)/g)].map((m) => m[0]);
}

// ---------------- masses ----------------
export interface Mass { kg: number; raw: string; context?: "payload" | "weight"; }

/** Explicit masses; "payload" when the text says payload/lift/carry/load. */
export function extractMasses(text: string): Mass[] {
  const t = normalize(text), out: Mass[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kilo(?:gram)?s?|g|grams?|lbs?|pounds?)(?![a-z])/g)) {
    const unit = m[2], v = parseFloat(m[1]);
    const kg = /^(?:kg|kilo)/.test(unit) ? v : /^(?:g|gram)/.test(unit) ? v / 1000 : v * 0.45359237;
    const s = m.index!, e = s + m[0].length;
    const window = t.slice(Math.max(0, s - 30), e + 30);
    const context = /payload|\blift|\bcarry|\bcarries|\bload\b|\bhold|\bpick up|\bhandle/.test(window) ? "payload"
      : /\bweigh|\bmass\b|\bweight\b/.test(window) ? "weight" : undefined;
    out.push({ kg, raw: m[0], context });
  }
  return out;
}

// ---------------- budget ----------------
export interface Budget { usd?: number; unsupported?: string; }

const amount = (digits: string, k?: string) => {
  const v = parseFloat(digits.replace(/,/g, "")) * (k ? 1000 : 1);
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

/** A budget stated in US dollars. Other currencies are reported, not converted. */
export function parseBudget(text: string): Budget {
  const t = normalize(text);
  const other = t.match(/(?:[€£₹¥]\s*[\d,.]+\s*k?\b|[\d,.]+\s*k?\s*(?:eur|euros?|gbp|pounds? sterling|inr|rupees?|rs\.?|yen|jpy|cny|yuan)\b)/);
  let m = t.match(/(?:us)?\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/)
    ?? t.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:usd|us dollars?|dollars?|bucks)\b/)
    ?? t.match(/\bbudget\b(?:\s+(?:of|is|around|about|under|below|up to|max(?:imum)?|at most|:|=|≈))*\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?(?!\s*(?:%|kg|g\b|m\b|cm|mm|dof|axis|joints?))/)
    ?? t.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\s+budget\b/);
  const explicitUsd = /\$|\busd\b|dollars?|\bbucks\b/.test(t);
  if (other && !explicitUsd) return { unsupported: other[0].trim() };
  if (m) return { usd: amount(m[1], m[2]) };
  return {};
}

// ---------------- naming / colour ----------------
const NAME_STOP = /\s+(?:with|that|which|who|and|having|for|to|in|on|using|featuring|carrying|plus|but)\b.*$/;

/** "an arm called Atlas with a camera" -> "atlas"; quoted names keep all words. */
export function extractName(text: string): string | undefined {
  const t = normalize(text);
  const quoted = t.match(/\b(?:called|named)\s+["']([^"']{1,40})["']/);
  if (quoted) return quoted[1];
  const m = t.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9_ -]{0,40})/);
  if (!m) return undefined;
  const name = m[1].replace(/[,.;:!?].*$/, "").replace(NAME_STOP, "").trim().split(" ").slice(0, 3).join(" ");
  return name || undefined;
}

export const COLOURS: Record<string, [number, number, number, number]> = {
  red: [0.78, 0.12, 0.12, 1], orange: [0.95, 0.5, 0.1, 1], yellow: [0.95, 0.8, 0.1, 1], green: [0.15, 0.6, 0.25, 1],
  blue: [0.15, 0.35, 0.8, 1], purple: [0.5, 0.25, 0.7, 1], pink: [0.95, 0.5, 0.7, 1], black: [0.08, 0.08, 0.09, 1],
  white: [0.95, 0.95, 0.95, 1], grey: [0.5, 0.5, 0.52, 1], gray: [0.5, 0.5, 0.52, 1], silver: [0.75, 0.76, 0.78, 1], gold: [0.85, 0.65, 0.13, 1],
};

/** A body colour that describes the robot itself: "a red 6 DOF arm", "painted blue",
 *  "in matte black". "Sorts red blocks" or "a red camera" are not body colours. */
export function extractColour(text: string): string | undefined {
  const t = normalize(text);
  const names = Object.keys(COLOURS).join("|");
  const noun = String.raw`(?:robot|robotic|arm|manipulator|rover|humanoid|quadruped|hexapod|scara|bot|dog|chassis|body|base|machine|cobot)`;
  const m = t.match(new RegExp(String.raw`\b(${names})\b[\s-]+(?:(?!with|for|on|to|that|and|or)[a-z0-9-]+[\s-]+){0,3}?${noun}\b`))
    ?? t.match(new RegExp(String.raw`\b(?:painted|coloured|colored|finished in|in (?:matte|glossy|bright|dark)?)\s*(?:matte\s+|glossy\s+|bright\s+|dark\s+)?(${names})\b(?![\s-]+(?:camera|lidar|led|lights?|eyes?|visor|blocks?|objects?|boxes|balls?))`));
  return m?.[1];
}
