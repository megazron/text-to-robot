// Open-vocabulary fallback: when no keyword in the knowledge table matches, the prompt is compared with every entry's
// description and the closest entry above a threshold is used, and said. Two embedders share one interface:
//   - the built-in lexical one (stems plus a synonym table): deterministic, instant, no download; the default and the
//     one every test runs;
//   - a sentence-embedding model the website registers (a small MiniLM in transformers.js, lazy-loaded and cached in
//     the browser): it understands wording the synonym table does not know.
import { KNOWLEDGE, type KnowledgeEntry } from "./knowledge.ts";

export interface Embedder {
  readonly name: string;
  /** one unit vector per text */
  embed(texts: string[]): Promise<number[][]>;
  /** cosine similarity a match must reach */
  readonly threshold: number;
}

/** Words that mean the same thing for choosing a body, mapped to one stem. */
const SYNONYMS: Record<string, string> = {
  aquarium: "fish", tank: "water", irrigate: "water", hydrate: "water", sprinkle: "water", moisten: "water", douse: "water", wet: "water", shower: "water",
  flower: "plant", herb: "plant", tree: "plant", shrub: "plant", seedling: "plant", vegetable: "plant", basil: "plant", tomato: "plant", succulent: "plant", orchid: "plant", cactus: "plant", veggie: "plant", greenery: "plant",
  tidy: "clean", wipe: "clean", dust: "clean", scrub: "clean", polish: "clean", wash: "clean", sweep: "clean", hoover: "clean", vacuum: "clean", sanitize: "clean", disinfect: "clean", mop: "clean", declutter: "clean",
  kitty: "cat", kitten: "cat", feline: "cat", puppy: "dog", doggy: "dog", canine: "dog", hound: "dog", pup: "dog", hamster: "pet", parrot: "pet", bunny: "pet", goldfish: "fish",
  picture: "photo", pic: "photo", snapshot: "photo", selfie: "photo", film: "photo", video: "photo", record: "photo", shoot: "photo", capture: "photo", footage: "photo", photograph: "photo",
  chase: "follow", track: "follow", accompany: "follow", tail: "follow", shadow: "follow", escort: "follow",
  bring: "fetch", grab: "fetch", retrieve: "fetch", collect: "fetch", gather: "fetch", pickup: "fetch",
  haul: "deliver", ship: "deliver", courier: "deliver", parcel: "deliver", package: "deliver", cargo: "deliver", transport: "deliver", carry: "deliver", move: "deliver", load: "deliver",
  drink: "serve", beverage: "serve", meal: "serve", snack: "serve", coffee: "serve", tea: "serve", beer: "serve", wine: "serve", waiter: "serve",
  guard: "patrol", protect: "patrol", security: "patrol", watch: "patrol", monitor: "patrol", surveil: "patrol", sentry: "patrol",
  lawn: "mow", grass: "mow", yard: "mow", hedge: "mow", trim: "mow",
  sketch: "draw", doodle: "draw", paint: "draw", write: "draw", scribble: "draw", letter: "draw", sign: "draw", art: "draw", illustrate: "draw",
  pool: "swim", lake: "swim", ocean: "swim", sea: "swim", river: "swim", dive: "swim", reef: "swim", submerge: "swim", underwater: "swim", pond: "swim",
  sky: "fly", air: "fly", hover: "fly", airborne: "fly", aerial: "fly", soar: "fly", glide: "fly", roof: "fly", chimney: "fly", gutter: "fly",
  pipe: "crawl", duct: "crawl", tunnel: "crawl", sewer: "crawl", drain: "crawl", rubble: "crawl", slither: "crawl", wriggle: "crawl", vent: "crawl", crevice: "crawl",
  stair: "climb", step: "climb", hill: "climb", hike: "climb", terrain: "climb", rocky: "climb", trail: "climb", mountain: "climb",
  chat: "companion", talk: "companion", converse: "companion", lonely: "companion", kid: "companion", child: "companion", story: "companion", teach: "companion", tutor: "companion", entertain: "companion", play: "companion", game: "companion",
  grandma: "elderly", grandmother: "elderly", grandpa: "elderly", grandfather: "elderly", granny: "elderly", nana: "elderly", senior: "elderly", disabled: "elderly", aged: "elderly", patient: "elderly", nurse: "elderly", carer: "elderly",
  song: "music", sing: "music", drum: "music", piano: "music", guitar: "music", melody: "music", tune: "music",
  laundry: "fold", cloth: "fold", clothes: "fold", shirt: "fold", towel: "fold", garment: "fold", sock: "fold",
  dish: "dishes", plate: "dishes", cup: "dishes", mug: "dishes", sink: "dishes", cutlery: "dishes",
  food: "feed", kibble: "feed", treat: "feed", hungry: "feed", dinner: "feed", breakfast: "feed", lunch: "feed",
  panel: "solar", photovoltaic: "solar", pv: "solar", sun: "solar",
  sort: "sort", candy: "sort", coin: "sort", bead: "sort", lego: "sort", screw: "sort", bolt: "sort",
  build: "assemble", construct: "assemble", glue: "assemble", solder: "assemble", screwdriver: "assemble", kit: "assemble",
  cook: "cook", fry: "cook", bake: "cook", stir: "cook", chop: "cook", flip: "cook", burger: "cook", pancake: "cook", pizza: "cook", kitchen: "cook", recipe: "cook",
  harvest: "garden", balcony: "garden", patio: "garden", terrace: "garden", windowsill: "garden", backyard: "garden", weed: "garden", farm: "garden", crop: "garden", orchard: "garden", greenhouse: "garden", fruit: "garden", berry: "garden", seed: "garden",
  map: "explore", survey: "explore", scout: "explore", search: "explore", discover: "explore", investigate: "explore", inspect: "explore", wander: "explore", roam: "explore",
  light: "lamp", lighting: "lamp", illuminate: "lamp", bright: "lamp", glow: "lamp", torch: "lamp",
  snow: "snow", ice: "snow", winter: "snow", shovel: "snow", plow: "snow", plough: "snow",
};
const STOP = new Set(["a", "an", "the", "my", "me", "i", "to", "for", "of", "and", "or", "that", "which", "who", "can", "could", "would", "will", "should", "is", "are", "be", "it", "its", "on", "in", "at", "with", "by", "from", "robot", "robots", "bot", "bots", "something", "thing", "machine", "device", "want", "need", "make", "build", "create", "design", "please", "some", "help", "helps", "helper", "do", "does", "doing", "get", "one", "around", "all", "every", "day", "while", "when", "so", "very", "really", "just", "like", "also", "your", "our", "us", "we", "you", "this", "these", "those", "there", "here", "up", "out", "keep", "keeps"]);

/** A crude English stemmer: enough to meet "watering" and "waters" at "water". */
export function stem(w: string): string {
  let s = w.toLowerCase().replace(/[^a-z]/g, "");
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && /(?:ss|sh|ch|x)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  if (s.length > 4 && /(.)\1$/.test(s)) s = s.slice(0, -1);   // "mopp" -> "mop"
  if (s.length > 5 && s.endsWith("er")) s = s.slice(0, -2);    // "cleaner" -> "clean"
  return s;
}
const canon = (w: string) => { const s = stem(w); return SYNONYMS[s] ?? SYNONYMS[w.toLowerCase()] ?? s; };
export const contentWords = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(canon).filter((w) => w.length > 1 && !STOP.has(w));

/**
 * Word-table similarity: each entry is a set of canonical stems. A prompt's score against an entry is the share of its
 * content words (weighted by how rare each word is across entries) that the entry knows. Words no entry knows count
 * against the match, so nonsense and off-topic prompts score low.
 */
export class LexicalEmbedder implements Embedder {
  readonly name = "built-in word table";
  readonly threshold = 0.5;
  readonly sets: Set<string>[];
  readonly entries: KnowledgeEntry[];
  private idf = new Map<string, number>();
  constructor(entries: KnowledgeEntry[] = KNOWLEDGE) {
    this.entries = entries;
    this.sets = entries.map((e) => new Set(contentWords(`${e.about} ${e.id.replace(/_/g, " ")}`)));
    const df = new Map<string, number>();
    for (const s of this.sets) for (const w of s) df.set(w, (df.get(w) ?? 0) + 1);
    for (const [w, n] of df) this.idf.set(w, Math.log(1 + entries.length / n));
  }
  /** unknown words weigh as much as the rarest known word */
  private weight(w: string) { return this.idf.get(w) ?? Math.log(1 + this.entries.length); }
  score(text: string): { i: number; score: number }[] {
    const words = [...new Set(contentWords(text))];
    const total = words.reduce((s, w) => s + this.weight(w), 0);
    if (!total) return [];
    return this.sets.map((set, i) => {
      const hit = words.filter((w) => set.has(w)).reduce((s, w) => s + this.weight(w), 0);
      // among equal matches, the more specific entry (fewer words) wins by a hair
      return { i, score: hit / total - set.size * 1e-4 };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  }
  /** bag-of-stems vectors, for callers that want the Embedder interface */
  async embed(texts: string[]) {
    const vocab = [...this.idf.keys()];
    return texts.map((t) => { const ws = new Set(contentWords(t)); const v = vocab.map((w) => (ws.has(w) ? this.weight(w) : 0)); const n = Math.hypot(...v) || 1; return v.map((x) => x / n); });
  }
}

let registered: Embedder | undefined;
/** The website registers its sentence-embedding model here; undefined puts the built-in table back. */
export function registerEmbedder(e: Embedder | undefined) { registered = e; entryVectors = undefined; }
export const activeEmbedder = (): Embedder => registered ?? LEXICAL;
const LEXICAL = new LexicalEmbedder();
let entryVectors: { by: string; v: number[][] } | undefined;

const FILLER = /\b(?:a|an|the|robot|robots|bot|machine|device|gadget|contraption|something|thing|that|which|can|will|to|for|my|me|i|need|want|build|make|design|please)\b/gi;
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

export interface SimilarMatch { entry: KnowledgeEntry; score: number; by: string; runnerUp?: { entry: KnowledgeEntry; score: number } }

/** Closest knowledge entry to the prompt by the built-in word table, else undefined. Synchronous. */
export function nearestLexical(text: string): SimilarMatch | undefined {
  const [top, second] = LEXICAL.score(text);
  if (!top || top.score < LEXICAL.threshold) return undefined;
  return { entry: KNOWLEDGE[top.i], score: +top.score.toFixed(3), by: LEXICAL.name, ...(second ? { runnerUp: { entry: KNOWLEDGE[second.i], score: +second.score.toFixed(3) } } : {}) };
}
export async function nearestEntry(text: string): Promise<SimilarMatch | undefined> {
  const e = activeEmbedder();
  if (e === LEXICAL) return nearestLexical(text);
  try {
    // a sentence model compares the prompt with each task's, object's and animal's keyword description; named robots are
    // found by name, never by likeness, and the filler words every prompt shares ("a robot that ...") are left out
    if (!entryVectors || entryVectors.by !== e.name) entryVectors = { by: e.name, v: await e.embed(KNOWLEDGE.map((k) => (k.kind === "named" ? "" : k.about ?? ""))) };
    const [q] = await e.embed([text.replace(FILLER, " ").replace(/\s+/g, " ").trim() || text]);
    return best(q, entryVectors.v, e) ?? nearestLexical(text);
  } catch { return nearestLexical(text); }   // a model that fails to load never blocks a design: the word table answers
}
function best(q: number[], vs: number[][], e: Embedder): SimilarMatch | undefined {
  const scored = vs.map((v, i) => ({ entry: KNOWLEDGE[i], score: KNOWLEDGE[i].kind === "named" ? -1 : dot(q, v) })).sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || !(top.score >= e.threshold)) return undefined;
  return { entry: top.entry, score: +top.score.toFixed(3), by: e.name, ...(scored[1] ? { runnerUp: { entry: scored[1].entry, score: +scored[1].score.toFixed(3) } } : {}) };
}
