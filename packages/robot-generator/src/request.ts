// The structure of a request, read before a robot type is chosen: how many arms and of how many joints each, what they
// stand on ("on a mobile robot", "with two arms"), how many wheels or legs, how many robots. A small grammar of counts
// ("two", "2", "a pair of", "dual", "twin", "triple", "a couple of", "2x"), coordination ("a 6 DOF and a 4 DOF arm"),
// attachment ("on", "with", "mounted on", "carrying", "on top of") and negation. Deterministic and fast: the counts and
// the structure never depend on a sentence model.
import { isNegated, extractDofMentions } from "./text.ts";

const WORDS: Record<string, number> = { one: 1, single: 1, a: 1, an: 1, two: 2, both: 2, pair: 2, couple: 2, dual: 2, twin: 2, double: 2, three: 3, triple: 3, four: 4, quad: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12 };
/** "two", "2", "a pair of", "a couple of", "dual", "twin", "2x", "x2" */
export const COUNT = String.raw`(?:an?\s+)?(?:pair|couple)\s+of|dual|twin|double|triple|both|single|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a\s+dozen|\d{1,3}(?!\s*x\b)`;
export function countOf(word: string): number {
  // (word by word, not "\s+of$": that regular expression is quadratic on a long run of spaces)
  const parts = word.trim().split(/\s+/);
  if (parts[0] === "a" || parts[0] === "an") parts.shift();
  if (parts.length > 1 && parts[parts.length - 1] === "of") parts.pop();
  const w = parts.join(" ").replace(/^(\d+)\s?x$/, "$1");
  return WORDS[w] ?? WORDS[w.replace(/^a\s+/, "")] ?? (/^\d+$/.test(w) ? parseInt(w, 10) : 1);
}

export interface ArmsAsked {
  /** how many arms */
  count: number;
  /** joints per arm, where stated (one entry per arm; undefined where not said) */
  dofs: (number | undefined)[];
  /** the words that said it */
  said: string;
  /** "arms" with no number: two were assumed */
  assumed?: boolean;
}
export type BaseKind = "mobile" | "rover" | "tracks" | "mecanum" | "omni" | "legs" | "quadruped" | "hexapod" | "humanoid" | "torso" | "table";
export interface BaseAsked { kind: BaseKind; said: string; wheels?: number; legs?: number }
export interface RequestShape {
  arms?: ArmsAsked;
  base?: BaseAsked;
  /** wheels asked for anywhere ("three-wheeled", "6 wheels", "tricycle") */
  wheels?: { count: number; said: string };
  legs?: { count: number; said: string };
  /** several separate robots asked for ("two rovers", "3 drones"): a prompt builds one */
  robots?: { count: number; what: string; said: string };
  /** an arm is said to stand on, or be carried by, the base ("arms on a rover", "a rover with an arm") */
  attached: boolean;
}

const ARM_NOUN = String.raw`(?:robot(?:ic)?\s+|industrial\s+|collaborative\s+)?(?:arms|manipulators|cobots)`;
// words that may stand between a count and "arms": sizes, joint counts, makes ("two small 6-dof robot arms")
const MOD = String.raw`(?:(?!on\b|with\b|and\b|for\b|of\b|in\b|that\b|which\b|to\b|at\b|onto\b|carrying\b|mounted\b)[\w.'-]+\s+){0,5}?`;
const ARMS_RX = new RegExp(String.raw`\b(${COUNT})\s+(${MOD})${ARM_NOUN}\b`, "g");
// "2x 6dof arm", "arm x2", "robot arms x3": a multiplier names the count, singular or plural
const TIMES_RX = new RegExp(String.raw`\b(\d{1,2})\s*x\s+(${MOD})(?:robot(?:ic)?\s+)?(?:arms?|manipulators?|cobots?)\b|\b(?:robot(?:ic)?\s+)?(?:arms?|manipulators?|cobots?)\s*(?:x\s*(\d{1,2})|\*\s*(\d{1,2}))\b`, "g");
const ARMED_RX = new RegExp(String.raw`\b(${COUNT})[\s-]+arm(?:ed|s)?[\s-]+(?:robot|bot|machine|torso|humanoid|platform|rover|base|cell|station|setup|system)\b|\b(${COUNT})[\s-]armed\b`, "g");
const DUAL_RX = /\b(?:dual|twin|double)[\s-]?arm(?:ed|s)?\b|\bbi[\s-]?manual\b|\bbi[\s-]?arm(?:ed)?\b/g;
// "a 6 dof and a 4 dof arm", "one 5-axis and one 6-axis arm"
const DOF_WORD = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*-?\s*(?:dof|d\.o\.f\.?|axis|axes|joints?)`;
const MIXED_RX = new RegExp(String.raw`\b(?:an?|one)\s+${DOF_WORD}\s+(?:robot(?:ic)?\s+)?(?:arm\s+)?(?:and|plus|\+|&)\s+(?:an?|one|another)\s+${DOF_WORD}\s+(?:robot(?:ic)?\s+)?arms?\b`);
const PLAIN_ARMS = /\b(?:robot(?:ic)?\s+)?arms\b/g;
const NUMW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const num = (s: string) => NUMW[s] ?? parseInt(s, 10);

/** Mobile bases and other bodies an arm can stand on, in the words people use. */
const BASES: [BaseKind, RegExp][] = [
  ["torso", /\btorso\b|\bupper[\s-]body\b/],
  ["humanoid", /\bhumanoid\b|\bbiped(?:al)?\b|\bandroid\b/],
  ["hexapod", /\bhexapod\b|\b(?:six|6)[\s-]?legged\b|\bspider\b/],
  ["quadruped", /\bquadruped\b|\b(?:four|4)[\s-]?legged\b|\brobo(?:t)?[\s-]?dog\b|\bdog\b|\bspot\b/],
  ["mecanum", /\bmecanum\b/],
  ["omni", /\bomni[\s-]?(?:wheels?|directional|base)\b|\bholonomic\b/],
  ["tracks", /\btrack(?:ed|s)\b|\btank\b|\bcrawler\b|\btreads?\b/],
  ["rover", /\brover\b|\bmars\b|\bplanetary\b|\brocker[\s-]?bogie\b/],
  ["mobile", /\bmobile\s+(?:robot|base|platform|manipulator|chassis)\b|\bmobile\b|\bwheel(?:ed|s)\b|\b(?:agv|amr)s?\b|\b(?:robot(?:ic)?\s+)?(?:car|cart|trolley|buggy|vehicle)\b|\bdiff(?:erential)?[\s-]?drive\b|\bturtlebot\b|\b4wd\b|\bskid[\s-]?steer\b|\bwheelbase\b|\bchassis\b/],
  ["table", /\b(?:on|at)\s+(?:a|the|one)?\s*(?:shared\s+)?(?:table|bench|workbench|desk|base\s*plate|plate|pedestal)\b|\bwork[\s-]?cell\b|\bworkstation\b/],
];
const WHEELS_RX = /\b(one|two|three|four|five|six|seven|eight|ten|twelve|\d{1,3})[\s-]+wheel(?:s|ed)?\b|\b(tricycle|trike|unicycle)\b/;
const LEGS_RX = /\b(one|two|three|four|five|six|seven|eight|ten|twelve|\d{1,3})[\s-]+leg(?:s|ged)?\b/;
// several robots: "two rovers", "3 drones", "a pair of quadrupeds", "two robots" (but not "two robot arms")
const ROBOTS_RX = new RegExp(String.raw`\b(${COUNT})\s+(?:(?:small|little|big|large|tiny|identical|cute|cheap|mobile|wheeled|walking|flying)\s+){0,2}(robots|rovers|drones|quadrupeds|robot\s+dogs|dogs|hexapods|humanoids|cars|trucks|boats|rovs|snakes|bots)\b(?!\s+arms?\b)`);

export function readShape(t: string): RequestShape {
  const out: RequestShape = { attached: false };
  // ---- arms
  const mixed = t.match(MIXED_RX);
  if (mixed && !isNegated(t, mixed.index!)) out.arms = { count: 2, dofs: [num(mixed[1]), num(mixed[2])], said: mixed[0] };
  for (const m of t.matchAll(TIMES_RX)) {
    if (out.arms || isNegated(t, m.index!, m[0].length)) continue;
    const n = parseInt(m[1] ?? m[3] ?? m[4], 10); if (!(n >= 1)) continue;
    const dof = m[2] ? extractDofMentions(m[2])[0]?.value : undefined;
    out.arms = { count: n, dofs: Array.from({ length: n }, () => dof), said: m[0].trim() };
  }
  if (!out.arms) for (const m of t.matchAll(ARMS_RX)) {
    if (isNegated(t, m.index!, m[0].length)) continue;
    const n = countOf(m[1]); if (n < 1) continue;
    const dof = extractDofMentions(m[2])[0]?.value;
    out.arms = { count: n, dofs: Array.from({ length: n }, () => dof), said: m[0].trim() }; break;
  }
  if (!out.arms) for (const m of t.matchAll(ARMED_RX)) {
    if (isNegated(t, m.index!, m[0].length)) continue;
    const n = countOf(m[1] ?? m[2]); out.arms = { count: n, dofs: Array.from({ length: n }, () => undefined), said: m[0] }; break;
  }
  if (!out.arms) for (const m of t.matchAll(DUAL_RX)) { if (!isNegated(t, m.index!, m[0].length)) { out.arms = { count: 2, dofs: [undefined, undefined], said: m[0] }; break; } }
  // "arms" with no number in front ("a robot with arms"): two
  if (!out.arms) for (const m of t.matchAll(PLAIN_ARMS)) {
    if (isNegated(t, m.index!, m[0].length)) continue;
    const before = t.slice(Math.max(0, m.index! - 30), m.index!);
    if (/\b(?:with|has|have|having|and|plus|carrying|its)\s+(?:(?:small|little|big|long|short|strong|light|heavy|slim|servo)\s+)?$/.test(before) || m.index === 0) {
      out.arms = { count: 2, dofs: [undefined, undefined], said: m[0], assumed: true }; break;
    }
  }
  // a DOF said after the arms ("two arms with 6 dof each", "2 arms, 5 axis") applies to every arm not yet given one
  if (out.arms && out.arms.dofs.every((d) => d === undefined)) {
    const after = extractDofMentions(t).find((d) => !/\b(?:legs?|fingers?|hands?|neck|head)\b/.test(t.slice(d.index, d.index + d.raw.length + 12)));
    if (after) out.arms.dofs = out.arms.dofs.map(() => after.value);
  }
  // ---- what they stand on
  for (const [kind, rx] of BASES) {
    const m = t.match(rx);
    if (m && !isNegated(t, m.index!, m[0].length)) { out.base = { kind, said: m[0].trim() }; break; }
  }
  const w = t.match(WHEELS_RX);
  if (w && !isNegated(t, w.index!, w[0].length)) {
    const n = w[2] ? ({ tricycle: 3, trike: 3, unicycle: 1 } as Record<string, number>)[w[2]] : countOf(w[1]);
    out.wheels = { count: n, said: w[0] };
    if (!out.base || out.base.kind === "table") out.base = { kind: "mobile", said: w[0] };
    out.base.wheels = n;
  }
  const l = t.match(LEGS_RX);
  if (l && !isNegated(t, l.index!, l[0].length)) { out.legs = { count: countOf(l[1]), said: l[0] }; if (out.base) out.base.legs = out.legs.count; }
  const r = t.match(ROBOTS_RX);
  if (r && !isNegated(t, r.index!, r[0].length) && countOf(r[1]) > 1) out.robots = { count: countOf(r[1]), what: r[2], said: r[0] };
  out.attached = !!(out.arms && out.base && out.base.kind !== "table");
  return out;
}

/** The request as a list of short chips: "2x 6-DOF arm", "on a 6-wheel rover", "3 wheels". */
export function shapeChips(s: RequestShape): string[] {
  const chips: string[] = [];
  if (s.arms) {
    const same = s.arms.dofs.every((d) => d === s.arms!.dofs[0]);
    if (same) chips.push(`${s.arms.count}x ${s.arms.dofs[0] ? `${s.arms.dofs[0]}-DOF ` : ""}arm`);
    else chips.push(...s.arms.dofs.map((d) => `1x ${d ? `${d}-DOF ` : ""}arm`));
  }
  if (s.base) chips.push(`${s.arms ? "on " : ""}${s.base.kind === "table" ? "a shared base plate" : s.base.said}`);
  if (s.wheels && !(s.base?.said ?? "").includes(s.wheels.said)) chips.push(`${s.wheels.count} wheels`);
  if (s.legs) chips.push(`${s.legs.count} legs`);
  if (s.robots) chips.push(`${s.robots.count}x ${s.robots.what}`);
  return chips;
}

/** "two rovers" read as "a rover": the robot type of a prompt that asks for several robots (one is built, and that is said). */
export function oneRobot(t: string, s: RequestShape): string {
  if (!s.robots) return t;
  const single = s.robots.what.replace(/s$/, "");
  return t.replace(s.robots.said, `a ${single}`);
}
