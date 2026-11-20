// The look asked for: a shape ("a heart shaped robot", "a sneaker on wheels", "❤️ robot", "looks like a teapot") and a
// style ("cartoon", "cute", "retro", "steampunk"). The robot underneath is designed as always; the shape becomes a printed
// shell over it (packages/design/src/shell.ts). A film or game character named as a style gets an original robot
// inspired by it, never a replica.
import { emojiShape, emojiShapes, chooseFairing, type Shape, type Style, type Preset } from "@ttr/design";
import { wordEmoji } from "./lexicon.ts";

/** a word or emoji that names a shape, and the shape it is */
const SHAPE_WORDS: [RegExp, Shape, boolean][] = [
  // [words, shape, is a thing that is not a robot body (so "a heart robot" is enough, no "shaped" needed)]
  [/\bhearts?\b|❤️?|♥️?|💖|💗|💓|💕|💞|🧡|💛|💚|💙|💜|🖤|🤍|💘|😍/u, "heart", true],
  [/\bstars?\b(?!\s+wars)|⭐|🌟|★|✨/u, "star", true],
  [/\beggs?\b|🥚/u, "egg", true],
  [/\b(?:sphere|spherical|ball|orb)\b|⚽|🏀|🔵|🟢|🔴|🟣/u, "sphere", true],
  [/\bcubes?\b|\bcubic\b|🧊|📦/u, "cube", true],
  [/\b(?:capsules?|pills?)\b|💊/u, "capsule", true],
  [/\b(?:shoes?|sneakers?|trainers?|boots?|slippers?|high[\s-]?heels?)\b|👟|👞|👠|🥾|🩴/u, "shoe", true],
  [/\b(?:teapots?|kettles?)\b|🫖/u, "teapot", true],
  [/\blamps?\b|💡|🪔/u, "lamp", true],
  [/\btoasters?\b/u, "toaster", true],
  [/\b(?:soda\s+)?cans?\b(?!\s+(?:you|it|i|we|he|she|they|be|do))|\btin\s+can\b|🥫/u, "can", true],
  [/\b(?:burgers?|hamburgers?|cheeseburgers?)\b|🍔/u, "burger", true],
  [/\bpizza(?:\s+slice)?\b|🍕/u, "pizza", true],
  [/\b(?:donuts?|doughnuts?)\b|🍩/u, "donut", true],
  [/\b(?:blob|jelly|slime|cloud|bean|marshmallow)\b|☁️?/u, "blob", true],
  [/\b(?:dragons?|dinosaurs?|dinos?|t[\s-]?rex)\b|🐉|🐲|🦖|🦕/u, "dragon", true],
  [/\bcar\b|🚗|🚙|🏎️?/u, "car", false],
  [/\b(?:dog|puppy|doggy)\b|🐶|🐕/u, "dog", false],
  [/\b(?:cat|kitty|kitten)\b|🐱|🐈/u, "cat", false],
  [/\bspiders?\b|🕷️?/u, "spider", false],
  [/\bfish\b|🐟|🐠|🐡/u, "fish", false],
  [/\b(?:bird|duck|penguin|owl|chicken)\b|🐦|🐧|🦆|🦉|🐔/u, "bird", false],
];
const STYLE_WORDS: [RegExp, Style][] = [
  [/\b(?:cartoon(?:y|ish)?|toon|chibi|kawaii|anime|pixar[\s-]?like|disney[\s-]?like)\b/, "cartoon"],
  [/\b(?:cute|adorable|cuddly|friendly[\s-]looking)\b|🥰|😊/u, "cute"],
  [/\b(?:sci[\s-]?fi|science[\s-]fiction|futuristic|space[\s-]age)\b/, "scifi"],
  [/\b(?:sleek|streamlined)\b/, "sleek"],
  [/\bminimalist(?:ic)?\b|\bminimal[\s-](?:style|styled|look(?:ing)?|design)\b|\bunderstated\b/, "minimal"],
  // ("an industrial robot" is an arm on a factory floor: the style is said as a look)
  [/\bindustrial[\s-](?:style|styled|look(?:ing)?|design)\b|\butilitarian\b/, "industrial"],
  [/\b(?:rugged|tough[\s-]looking|outdoor[\s-]style)\b/, "rugged"],
  [/\b(?:boxy|blocky|square)\b/, "boxy"],
  [/\b(?:retro|vintage|tin[\s-]toy|1950s|50s|old[\s-]school)\b/, "retro"],
  [/\b(?:steampunk|brass|victorian|clockwork)\b/, "steampunk"],
  [/\b(?:mecha|mech[\s-]style|armou?red|gundam[\s-]like|transformer[\s-]like)\b/, "mecha"],
];
/** a shape said as a shape: "heart shaped", "looks like a shoe", "in the shape of a teapot", an emoji */
const CUE = /\b(?:shaped|shape\s+of|form\s+of|looks?\s+like|looking\s+like|resembl\w*|disguised\s+as|styled\s+(?:as|like)|in\s+the\s+style\s+of|emoji)\b|-shaped/;
/** the families a shell is fitted to (each designer places it on its own body: shell.ts) */
export const SHELL_FAMILIES = new Set(["diff_drive", "four_wheel", "mecanum", "drone", "serial_arm", "quadruped", "hexapod", "humanoid"]);
/** robot bodies named outright: a look with one of them goes on that body, not on a wheeled base */
export const NOT_WHEELED = /\brobot(?:ic)?\s+(?:dogs?|pupp(?:y|ies)|cats?|spiders?)\b|\brobo[\s-]?dogs?\b|\b(?:arms?|manipulators?|cobots?|scara|grippers?|hands?|humanoids?|biped|legs?|legged|quadrupeds?|hexapods?|drones?|quadcopters?|rovs?|underwater|snakes?|gantry|plotters?|delta|exo\w*|suits?|wearable)\b/;
/** characters named as a style: an original robot inspired by them, said so */
const INSPIRED = /\b(?:star\s+wars|pixar|disney|marvel|transformers?|gundam|pokemon|pok[eé]mon|studio\s+ghibli|ghibli|futurama|doctor\s+who|minecraft|mario|sonic|astro\s*boy|big\s+hero\s+6)\b/;

export interface ShellAsk { shape: Shape; style: Style; said: string; /** a style word alone: the industrial preset it means (styling.ts) */ preset?: Preset; note?: string; /** shape "emoji": the emoji whose outline is inflated */ emoji?: string; /** what the shape is called ("unicorn emoji") */ name: string }

/** The shape and style asked for, or nothing when the prompt names neither. */
/** a style word ("cute", "sci-fi", "steampunk", "rugged") is said: a look asked for */
export const saysStyle = (t: string) => STYLE_WORDS.some(([rx]) => rx.test(t));
export function readShell(t: string, original = t): ShellAsk | undefined {
  const cue = CUE.test(t) || /\p{Extended_Pictographic}/u.test(original);
  const style = STYLE_WORDS.find(([rx]) => rx.test(t))?.[1];
  let hit: { shape: Shape; said: string } | undefined;
  for (const [rx, shape, thing] of SHAPE_WORDS) {
    const m = t.match(rx), e = m ? undefined : original.match(rx);
    if (!m && !e) continue;
    // an animal or a car is a robot body of its own ("a robot dog" walks, "a robot car" drives) unless it is said as a shape
    if (!thing && !CUE.test(t)) continue;   // (an emoji of an animal is that animal's robot: 🐕 is a robot dog)
    // a thing names the look only when it describes the robot: "a heart robot", "a sneaker on wheels", "a robot teapot",
    // "heart shaped", an emoji; not "a robot that cooks eggs" or "a robot that hands out pills"
    if (m && !cue) {
      const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 24), before = t.slice(Math.max(0, m.index! - 14), m.index!);
      if (!/^\s*(?:-?\s*)?(?:robot|bot|droid|rover|buggy|on\s+wheels|with\s+wheels|that\s+(?:drives|rolls|moves))\b/.test(after) && !/\brobot(?:ic)?\s+$/.test(before)) continue;
    }
    hit = { shape, said: (m ?? e)![0] }; break;
  }
  // an emoji the library has no shape for: its own outline (Twemoji), inflated; one read as a word keeps that meaning
  if (!hit) for (const m of original.matchAll(/\p{Extended_Pictographic}\uFE0F?/gu)) {
    const em = emojiShape(m[0]);
    if (em && !wordEmoji(m[0])) return { shape: "emoji", emoji: em.char, name: `${em.name} emoji`, style: style ?? "plain", said: m[0], note: EMOJI_NOTE(m[0], em.name) };
  }
  const ref = t.match(INSPIRED)?.[0];
  // a franchise named as the look ("a star wars style droid"): an original rounded robot inspired by it
  if (!hit && !style && ref && /\b(?:style|styled|like|inspired|themed|looking|droid|bot)\b/.test(t))
    return { shape: "capsule", name: "capsule", style: "retro", said: ref, note: `"${ref}": an original robot inspired by its style, not a copy of any character` };
  if (!hit && !style) {
    // "looks like a cloud", "shaped like a banana": a shape the library does not have is a rounded blob, said
    const m = t.match(/\b(?:shaped\s+like|looks?\s+like|in\s+the\s+shape\s+of|resembling)\s+(?:an?\s+|the\s+)?([a-z][a-z\s-]{1,24}?)(?=$|[,.;!?]|\s+(?:with|and|on|that|which|robot))/) ?? t.match(/\b([a-z]{3,16})[\s-]shaped\b/);
    if (!m || /^(?:robot|wheel|wheeled|normal|regular)$/.test(m[1].trim())) return undefined;
    // a thing an emoji shows ("shaped like a banana", "looks like a rocket"): that emoji's outline
    const em = emojiNamed(m[1].trim());
    if (em) return { shape: "emoji", emoji: em.char, name: `${em.name} emoji`, style: "plain", said: m[0], note: EMOJI_NOTE(m[1].trim(), em.name) };
    return { shape: "blob", name: "blob", style: "plain", said: m[0], note: `"${m[1].trim()}" is not in the shape library yet (heart, star, egg, sphere, cube, capsule, shoe, car, dog, cat, spider, fish, bird, dragon, teapot, lamp, toaster, can, burger, pizza, donut): built a rounded shell instead` };
  }
  // a style word alone is an industrial preset: a fairing whose silhouette the prompt's meaning picks among the preset's
  const preset = !hit && style ? PRESET_OF[style] : undefined;
  if (preset) {
    const shape = chooseFairing("wheeled", lookKey(t), preset).shape;
    return { shape, name: shape, style: style!, preset, said: style!, ...(ref ? { note: `"${ref}": an original robot inspired by its style, not a copy of any character` } : {}) };
  }
  const shape: Shape = hit?.shape ?? (style === "boxy" || style === "steampunk" || style === "mecha" ? "cube" : "capsule");
  return { shape, name: shape, style: style ?? "plain", said: [hit?.said, style].filter(Boolean).join(", "),
    ...(ref ? { note: `"${ref}": an original robot inspired by its style, not a copy of any character` } : {}) };
}

/** the style words that mean an industrial preset rather than a character shape */
export const PRESET_OF: Partial<Record<Style, Preset>> = { sleek: "sleek", scifi: "scifi", rugged: "rugged", retro: "retro", industrial: "industrial", minimal: "minimal" };
const NUMBER_WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", single: "1", pair: "2", twin: "2" };
const LOOK_STOP = new Set("a an the my our your his her their its this that these those to for of on in at with and or but robot robots robotic bot machine which who please can could would will it them me us some any very create build make design generate give want need i im i'm like wheeled wheel wheels".split(" "));
/** What a prompt means, as a key the look is chosen by: its content words, stemmed, numbers as digits, sorted ("a six dof
 *  robotic arm", "Create a 6 DOF robotic arm" and "a 6 dof robot arm" are one key; "a robot that waters my plants" and
 *  "plant watering robot" another). */
export function lookKey(t: string): string {
  const words = t.toLowerCase().replace(/(\d)\s*-\s*(?=[a-z])/g, "$1 ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !LOOK_STOP.has(w)).map((w) => NUMBER_WORDS[w] ?? w);
  const stem = (w: string) => (w.length > 5 ? w.replace(/ing$/, "") : w).replace(/(?<=..)s$/, "");
  return [...new Set(words.map(stem))].sort().join(" ");
}
const EMOJI_NOTE = (said: string, name: string) => `"${said}": the shell is the ${name} emoji's outline (Twemoji, CC-BY 4.0), inflated like a cushion`;
/** the emoji whose name is the thing said: "banana", "rocket", "hot dog", "ghosts", "a unicorn" */
function emojiNamed(thing: string): ReturnType<typeof emojiShape> {
  const w = thing.toLowerCase().replace(/^(?:a|an|the)\s+/, "").replace(/\s+/g, " ").trim();
  if (w.length < 3) return undefined;
  const forms = [w, w.replace(/(?:es|s)$/, ""), w.replace(/ies$/, "y")];
  const all = emojiShapes();
  return all.find((e) => forms.includes(e.name)) ?? all.find((e) => forms.some((f) => e.name === `${f} face`));
}

