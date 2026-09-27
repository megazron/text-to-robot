// Lexical helpers for the local prompt parser: normalisation, negation-aware
// matching and unit-aware quantities. Pure functions; no templates here.

/** Lower-case, unify dashes/quotes and collapse whitespace. */
export function normalize(text: string): string {
  return (text || "").toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, " ").trim();
}

const NEGATOR = /\b(?:no|without|not|w\/o|excluding|except|other than|apart from|besides|minus|never|neither|nor|instead of|rather than|don't|doesn't|do not|does not|won't|shouldn't|isn't|aren't)\b/g;
/** "no sensors except a camera": an exception after a blanket negation is a positive request. */
const EXCEPTION = /^(?:except|excluding|other than|apart from|besides)$/;
const BLANKET = /\b(?:no|without|nothing|zero)\s+(?:other\s+)?(?:sensors?|extras?|attachments?|accessories)\b|\bnothing\b/;
// A negation covers a list ("without lidar or camera") until the clause turns
// positive again ("no lidar, but a camera"; "no lidar and a camera").
const SCOPE_END = /[,;.:!?]|\b(?:but|with|plus|and (?:a|an|one|two|three|four|\d))\b/g;
// "lidar is not needed", "camera not required"
const POSTFIX_NEGATION = /^\s*(?:is|are|isn't|aren't)?\s*(?:not\s+(?:needed|required|wanted|necessary|included)|unnecessary|unneeded|optional)\b/;

function lastNegator(before: string): { start: number; end: number; word: string } | undefined {
  let last: { start: number; end: number; word: string } | undefined;
  for (const m of before.matchAll(NEGATOR)) last = { start: m.index!, end: m.index! + m[0].length, word: m[0] };
  return last;
}

/** Is the match at `index` inside a negated phrase such as "without a camera"? */
export function isNegated(t: string, index: number, length = 0): boolean {
  if (length && POSTFIX_NEGATION.test(t.slice(index + length).split(/[,;.]/)[0])) return true;
  const before = t.slice(0, index);
  const neg = lastNegator(before);
  if (!neg) return false;
  const between = before.slice(neg.end).replace(/^\s*with\b/, "");
  SCOPE_END.lastIndex = 0;
  if (SCOPE_END.test(between) || between.split(" ").filter(Boolean).length > 5) return false;
  if (EXCEPTION.test(neg.word)) {
    const clause = before.slice(0, neg.start).split(/[,;.]/).pop() ?? "";
    return !BLANKET.test(clause);
  }
  return true;
}

/** Negated with nothing but an article in between: "not a humanoid", "no lidar". */
export function isDirectlyNegated(t: string, index: number): boolean {
  const neg = lastNegator(t.slice(0, index));
  return !!neg && /^\s*(?:a|an|the|any)?\s*$/.test(t.slice(neg.end, index));
}

export interface Hit { index: number; text: string; }

const globalOf = (rx: RegExp) => new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");

/** First occurrence of `rx` that is not negated. */
export function find(t: string, rx: RegExp): Hit | undefined {
  for (const m of t.matchAll(globalOf(rx))) if (!isNegated(t, m.index!, m[0].length)) return { index: m.index!, text: m[0] };
  return undefined;
}
/** Every occurrence of `rx` that is not negated. */
export function findAll(t: string, rx: RegExp): Hit[] {
  return [...t.matchAll(globalOf(rx))].filter((m) => !isNegated(t, m.index!, m[0].length)).map((m) => ({ index: m.index!, text: m[0] }));
}
export const mentions = (t: string, rx: RegExp): boolean => find(t, rx) !== undefined;
/** Some occurrence of `rx` is explicitly negated ("no lidar"). */
export function negates(t: string, rx: RegExp): boolean {
  for (const m of t.matchAll(globalOf(rx))) if (isNegated(t, m.index!, m[0].length)) return true;
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
export type LengthContext = "reach" | "height" | "width" | "length" | "position";
export interface Length { metres: number; raw: string; index: number; context?: LengthContext; /** "under 2 m" / "at least 50 cm" */ bound?: "max" | "min"; }

const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const LENGTH_RX = new RegExp(NUMBER + String.raw`\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|met(?:er|re)s?|m|inch(?:es)?|in(?=\s*(?:long|tall|high|wide|reach|of reach|arm|$|[,.;])|")|"|'(?![\da-z])|ft|feet|foot)(?![a-z0-9/])`, "g");
const SPELLED_LENGTH = /\b(one and a half|half an?|a half|one|two|three|four|five|six|seven|eight|nine|ten|a)\s+(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|inch(?:es)?|foot|feet)\b/g;
const SPELLED: Record<string, number> = { "one and a half": 1.5, "half a": 0.5, "half an": 0.5, "a half": 0.5, a: 1, ...WORD_NUM };

function lengthContext(t: string, start: number, end: number): LengthContext | undefined {
  const after = t.slice(end, end + 24), before = t.slice(Math.max(0, start - 24), start);
  const near = (rx: RegExp) => rx.test(after) || rx.test(before);
  if (near(/\breach\b|\bspan\b|\bworking (?:radius|range)\b/)) return "reach";
  if (near(/\btall\b|\bheight\b|\bhigh\b|\bstature\b|\bwearer\b|\bperson\b|\bpilot\b/)) return "height";
  if (near(/\bwide\b|\bwidth\b/)) return "width";
  // positions and part sizes ("50 cm above the table", "a 20 cm gripper") are not the arm's length
  if (/^\s*(?:above|below|over|under|off|from|away|behind|in front|beside|apart)\b|^\s*(?:\w+\s+)?(?:gripper|camera|wheels?|stroke|diameter|radius|gap|jaw|fingers?|cube|box|boxes|parts?|objects?)\b/.test(after)) return "position";
  if (near(/\blong\b|\blength\b/)) return "length";
  return undefined;
}

const toMetres = (unit: string) => LENGTH_UNITS.find(([rx]) => rx.test(unit))?.[1];

/** All explicit lengths ("60 cm reach", "1.2 m tall", "24 in long", "6 ft wearer", "one metre") in metres. */
export function extractLengths(text: string): Length[] {
  const t = normalize(text), out: Length[] = [];
  const push = (metres: number, raw: string, index: number) => {
    const lead = t.slice(Math.max(0, index - 16), index);
    const bound = /\b(?:under|below|less than|at most|up to|max(?:imum)?|no more than|within)\s*(?:of\s*)?$/.test(lead) ? "max" as const
      : /\b(?:over|above|more than|at least|min(?:imum)?|no less than)\s*(?:of\s*)?$/.test(lead) ? "min" as const : undefined;
    out.push({ metres, raw: raw.trim(), index, context: lengthContext(t, index, index + raw.length), ...(bound ? { bound } : {}) });
  };
  for (const m of t.matchAll(LENGTH_RX)) {
    const factor = toMetres(m[2] === "'" ? "ft" : m[2]);
    if (factor !== undefined) push(parseFloat(m[1].replace(/,/g, "")) * factor, m[0], m.index!);
  }
  for (const m of t.matchAll(SPELLED_LENGTH)) {
    const factor = toMetres(m[2].replace(/^(?:millimet|centimet|met)(?:er|re)s?$/, (u) => u.startsWith("milli") ? "mm" : u.startsWith("centi") ? "cm" : "m"));
    if (factor !== undefined) push(SPELLED[m[1]] * factor, m[0], m.index!);
  }
  // "6 ft 2" / "5'10\"" style statures replace their separate foot and inch parts
  for (const m of t.matchAll(/(\d)\s*(?:ft|feet|foot|')\s*(\d{1,2})\s*(?:in|inches|")?(?![a-z0-9.])/g)) {
    const s = m.index!, e = s + m[0].length;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].index >= s && out[i].index < e) out.splice(i, 1);
    out.push({ metres: parseInt(m[1], 10) * 0.3048 + parseInt(m[2], 10) * 0.0254, raw: m[0].trim(), index: s, context: lengthContext(t, s, e) ?? "height" });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Speeds ("2 m/s", "5 km/h", "3 mph"); reported because they are not modelled. */
export function extractSpeeds(text: string): string[] {
  return [...normalize(text).matchAll(/\d+(?:\.\d+)?\s*(?:m\/s|km\/h|kph|mph|rpm|deg\/s|°\/s)/g)].map((m) => m[0]);
}

// ---------------- masses ----------------
export interface Mass { kg: number; raw: string; context?: "payload" | "weight"; }

const PAYLOAD_BEFORE = /(?:payload(?:\s+of)?|lift(?:s|ing)?|carr(?:y|ies|ying)|hold(?:s|ing)?|pick(?:s|ing)?(?:\s+up)?|handl(?:e|es|ing)|mov(?:e|es|ing)|capacity(?:\s+of)?|rated\s+(?:for|at)|for)\s+(?:up\s+to\s+|objects?\s+of\s+|parts?\s+of\s+)?(?:an?\s+|about\s+|around\s+)?$/;
const PAYLOAD_AFTER = /^\s*(?:of\s+)?(?:payload|load|loads|capacity|boxes|box|parts?|objects?|items?|packages?|parcels?|bags?|weights?|tools?|workpieces?)\b/;
const WEIGHT_BEFORE = /(?:weigh(?:s|ing)?|mass(?:\s+of)?|weight(?:\s+of)?|under|below|lighter\s+than|less\s+than|at\s+most|max(?:imum)?|total|self[\s-]weight)\s*(?:about\s+|around\s+|only\s+|just\s+)?$/;
const WEIGHT_AFTER = /^\s*(?:total|in\s+total|overall|robot|arm|body|weight|mass|or\s+less|max)\b/;

/** Explicit masses. A mass is a payload only when a payload word is next to it
 *  ("lifts 3 kg", "2 kg boxes", "10 kg capacity"); "weighs under 20 kg" is robot mass. */
export function extractMasses(text: string): Mass[] {
  const t = normalize(text), out: Mass[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kilo(?:gram)?s?|g|grams?|lbs?|pounds?)(?![a-z])/g)) {
    const unit = m[2], v = parseFloat(m[1]);
    const kg = /^(?:kg|kilo)/.test(unit) ? v : /^(?:g|gram)/.test(unit) ? v / 1000 : v * 0.45359237;
    const s = m.index!, e = s + m[0].length;
    const before = t.slice(Math.max(0, s - 32), s), after = t.slice(e, e + 24);
    const context = PAYLOAD_BEFORE.test(before) || PAYLOAD_AFTER.test(after) ? "payload"
      : WEIGHT_BEFORE.test(before) || WEIGHT_AFTER.test(after) || /\bweigh|\bweight\b|\bmass\b/.test(t.slice(Math.max(0, s - 20), e + 12)) ? "weight" : undefined;
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
  const grand = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:grand|thousand\s+(?:dollars?|usd|bucks))\b/);
  if (grand && !other) return { usd: amount(grand[1], "k") };
  const m = t.match(/(?:us)?\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/)
    ?? t.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:usd|us dollars?|dollars?|bucks|\$)/)
    ?? t.match(/\bbudget\b(?:\s+(?:of|is|around|about|under|below|up to|max(?:imum)?|at most|:|=|≈))*\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?(?!\s*(?:%|kg|g\b|m\b|cm|mm|dof|axis|joints?))/)
    ?? t.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\s+budget\b/);
  const explicitUsd = /\$|\busd\b|dollars?|\bbucks\b|\bgrand\b/.test(t);
  if (other && !explicitUsd) return { unsupported: other[0].trim() };
  if (m) return { usd: amount(m[1], m[2]) };
  return {};
}

// ---------------- naming / colour ----------------
const NAME_STOP = /\s+(?:with|that|which|who|and|having|for|to|in|on|using|featuring|carrying|plus|but)\b.*$/;
const NAME_INTRO = String.raw`\b(?:called|named|nicknamed|name(?:d)?\s*[:=]|with\s+the\s+name|by\s+the\s+name(?:\s+of)?)`;
// "named after my dog", "called from ROS" are not names
const NOT_A_NAME = /^(?:after|from|by|via|when|whenever|in|on|to|for|using|with|at|over|through|as)\b/;

export interface NameSpan { name: string; start: number; end: number; }

/** "an arm called Atlas with a camera" -> atlas; quoted names keep every word. */
export function findName(text: string): NameSpan | undefined {
  const t = normalize(text);
  const quoted = new RegExp(NAME_INTRO + String.raw`\s*["']([^"']{1,40})["']`).exec(t);
  if (quoted) return { name: quoted[1], start: quoted.index, end: quoted.index + quoted[0].length };
  const m = new RegExp(NAME_INTRO + String.raw`\s*([a-z0-9][a-z0-9_ .&-]{0,40})`).exec(t);
  if (!m || NOT_A_NAME.test(m[1])) return undefined;
  const name = m[1].replace(/[,;:!?].*$/, "").replace(/\.(?:\s.*)?$/, "").replace(NAME_STOP, "").trim().split(" ").slice(0, 3).join(" ");
  return name ? { name, start: m.index, end: m.index + m[0].indexOf(m[1]) + name.length } : undefined;
}

export function extractName(text: string): string | undefined {
  return findName(text)?.name;
}

/** Blank out names and quoted text (keeping indices) so "named Tiny", "called 'Unit 50'"
 *  or "named after my dog" cannot be read as sizes, lengths or robot types. */
export function maskNames(text: string): string {
  let t = normalize(text);
  const blank = (s: number, e: number) => { t = t.slice(0, s) + " ".repeat(e - s) + t.slice(e); };
  const span = findName(t);
  if (span) blank(span.start, span.end);
  for (const m of t.matchAll(/"[^"]{1,40}"|(?<![a-z0-9])'[^']{1,40}'(?![a-z0-9])/g)) blank(m.index!, m.index! + m[0].length);
  for (const m of t.matchAll(/\b(?:named|called)\s+(?:after|for)\s+[^,;.]{1,40}/g)) blank(m.index!, m.index! + m[0].length);
  return t;
}

export const COLOURS: Record<string, [number, number, number, number]> = {
  red: [0.78, 0.12, 0.12, 1], orange: [0.95, 0.5, 0.1, 1], yellow: [0.95, 0.8, 0.1, 1], green: [0.15, 0.6, 0.25, 1],
  blue: [0.15, 0.35, 0.8, 1], purple: [0.5, 0.25, 0.7, 1], pink: [0.95, 0.5, 0.7, 1], black: [0.08, 0.08, 0.09, 1],
  white: [0.95, 0.95, 0.95, 1], grey: [0.5, 0.5, 0.52, 1], gray: [0.5, 0.5, 0.52, 1], silver: [0.75, 0.76, 0.78, 1], gold: [0.85, 0.65, 0.13, 1],
};
const COLOUR_ALIASES: Record<string, string> = { golden: "gold", silvery: "silver", crimson: "red", navy: "blue" };
const colourWords = () => [...Object.keys(COLOURS), ...Object.keys(COLOUR_ALIASES)].join("|");
const canonical = (c: string) => COLOUR_ALIASES[c] ?? c;

/** Robot nouns a colour can describe (characters included, so "a red Baymax" is reported). */
export const ROBOT_NOUN = String.raw`(?:robot|robotic|arm|manipulator|rover|humanoid|quadruped|hexapod|scara|bot|dog|chassis|body|base|machine|cobot|suit|exosuit|exoskeleton|droid|mech|walker|baymax|eva|wall-?e|iron man|gripper)`;

/** A body colour that describes the robot itself: "a red 6 DOF arm", "painted blue",
 *  "colour: red", "(blue)". "Sorts red blocks" or "a red camera" are not body colours. */
export function extractColour(text: string): string | undefined {
  const t = maskNames(text), names = colourWords();
  const m = t.match(new RegExp(String.raw`\b(${names})\b[\s-]+(?:(?!with|for|on|to|that|and|or)[a-z0-9-]+[\s-]+){0,3}?${ROBOT_NOUN}\b`))
    ?? t.match(new RegExp(String.raw`\b(?:painted|coloured|colored|finished in|in (?:matte|glossy|bright|dark)?)\s*(?:matte\s+|glossy\s+|bright\s+|dark\s+)?(${names})\b(?![\s-]+(?:camera|lidar|led|lights?|eyes?|visor|blocks?|objects?|boxes|balls?))`))
    ?? t.match(new RegExp(String.raw`\bcolou?r\s*(?:[:=-]|is|of)?\s*(${names})\b|\((${names})\)|\b(?:that|which)\s+is\s+(${names})\b|,\s*(${names})\s*(?:[,;.]|$)`));
  const c = m?.slice(1).find(Boolean);
  return c ? canonical(c) : undefined;
}
