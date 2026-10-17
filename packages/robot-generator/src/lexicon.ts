// Basic multilingual keywords (German, French, Spanish) for the local prompt parser.
// This is a small word list, not translation: it maps robot types, parts, sensors,
// joint-count units, number words and a few function words ("with", "without",
// "and") onto the English vocabulary the rule-based parser already understands.
// Function and number words are only mapped when the prompt also contains at least
// one robot keyword from the list, so English prompts are never rewritten.

/** Robot content words. Keys are lower-case and accent-free. */
const CONTENT: Record<string, string> = {
  // German
  roboterarm: "robot arm", roboterarme: "robot arms", industrieroboter: "industrial robot", greifarm: "arm with a gripper",
  greifer: "gripper", sauggreifer: "suction gripper", zweifingergreifer: "two-finger gripper", parallelgreifer: "parallel gripper",
  rader: "wheels", radern: "wheels", fahrbar: "wheeled", fahrbarer: "wheeled", fahrbare: "wheeled", fahrbares: "wheeled",
  raupen: "tracks", kettenfahrzeug: "tracked robot", beine: "legs", beinen: "legs", vierbeiner: "quadruped", vierbeinig: "four-legged",
  vierbeiniger: "four-legged", sechsbeinig: "six-legged", sechsbeiniger: "six-legged", zweibeinig: "two-legged", zweibeiniger: "two-legged",
  humanoider: "humanoid", humanoide: "humanoid", humanoiden: "humanoid", achse: "axis", achsen: "axes", gelenk: "joint", gelenke: "joints",
  gelenken: "joints", freiheitsgrade: "dof", freiheitsgraden: "dof", kamera: "camera", kameras: "cameras", tiefenkamera: "depth camera",
  mobiler: "mobile", roboter: "robot", roboterhund: "robot dog", greifern: "grippers",
  // French
  bras: "arm", pince: "gripper", pinces: "grippers", prehenseur: "gripper", ventouse: "suction gripper", roues: "wheels", roue: "wheel",
  jambes: "legs", pattes: "legs", quadrupede: "quadruped", hexapode: "hexapod", articulations: "joints", chenilles: "tracks",
  robotique: "robotic",
  // Spanish
  brazo: "arm", brazos: "arms", pinza: "gripper", pinzas: "grippers", garra: "claw", ventosa: "suction gripper", ruedas: "wheels",
  rueda: "wheel", piernas: "legs", patas: "legs", cuadrupedo: "quadruped", hexapodo: "hexapod", articulaciones: "joints",
  articulacion: "joint", ejes: "axes", eje: "axis", camara: "camera", camaras: "cameras", orugas: "tracks", robotico: "robotic", robotica: "robotic",
};

/** Multi-word phrases, matched before single words (accent-free). */
const PHRASES: [RegExp, string][] = [
  [/\bdegres? de liberte\b/g, "degrees of freedom"],
  [/\bgrados? de libertad\b/g, "degrees of freedom"],
  [/\ba roues\b/g, "wheeled"],
  [/\bcon ruedas\b/g, "with wheels"],
  [/\bbras robot(?:ique|ise)?\b/g, "robot arm"],
  [/\bbrazo robot(?:ico)?\b/g, "robot arm"],
  [/\bmit (?:raedern|radern|rader)\b/g, "with wheels"],
  // German compounds such as "sechsachsig", "6-achsiger": "six axis"
  [/\b(\w+?)-?achsig\w*\b/g, "$1 axis"],
];

/** Number and function words, mapped only once the prompt is known to be non-English. */
const FUNCTION: Record<string, string> = {
  // German
  mit: "with", ohne: "without", und: "and", kein: "no", keine: "no", keinen: "no", ein: "a", eine: "a", einen: "a", einem: "a", einer: "a",
  eins: "one", zwei: "two", drei: "three", vier: "four", funf: "five", fuenf: "five", sechs: "six", sieben: "seven", acht: "eight",
  neun: "nine", zehn: "ten", elf: "eleven", zwolf: "twelve", zwoelf: "twelve",
  // French
  avec: "with", sans: "without", et: "and", une: "a", deux: "two", trois: "three", quatre: "four", cinq: "five",
  sept: "seven", huit: "eight", neuf: "nine", dix: "ten", onze: "eleven", douze: "twelve", aucun: "no", aucune: "no",
  // Spanish
  con: "with", sin: "without", y: "and", una: "a", uno: "one", dos: "two", tres: "three", cuatro: "four", cinco: "five",
  seis: "six", siete: "seven", ocho: "eight", nueve: "nine", diez: "ten", doce: "twelve", ningun: "no", ninguna: "no",
};
/** Also English words: mapped, but they never mark a prompt as non-English on their own. */
const ALSO_ENGLISH = new Set(["articulations"]);

const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");

export interface Translation { text: string; /** "greifer -> gripper" for each mapped word */ mapped: string[]; }

/** Map German/French/Spanish robot keywords onto English. English prompts come back unchanged. */
export function translateKeywords(text: string): Translation {
  const plain = stripAccents(text);
  const mapped: string[] = [];
  const note = (from: string, to: string) => { const n = `${from} -> ${to}`; if (from !== to && !mapped.includes(n)) mapped.push(n); };
  let out = plain;
  for (const [rx, to] of PHRASES) out = out.replace(rx, (m, ...g) => { const r = to.replace("$1", typeof g[0] === "string" ? g[0] : ""); note(m, r); return r; });
  let foreign = mapped.length > 0;
  out = out.replace(/[a-z]+/g, (w) => {
    const to = CONTENT[w];
    if (to === undefined) return w;
    if (!ALSO_ENGLISH.has(w)) foreign = true;
    note(w, to);
    return to;
  });
  if (!foreign) return { text, mapped: [] };
  out = out.replace(/[a-z]+/g, (w) => {
    const to = FUNCTION[w] ?? (w === "un" ? "a" : undefined);
    if (to === undefined || to === w) return w;
    note(w, to);
    return to;
  });
  return { text: out, mapped };
}
