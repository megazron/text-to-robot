// Basic multilingual keywords (German, French, Spanish, romanised Hindi / Hinglish) for the local prompt parser.
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
  // Hinglish (romanised Hindi)
  haath: "arm", hath: "arm", haathon: "arms", pahiye: "wheels", pahiya: "wheel", pahiyon: "wheels", kutta: "dog", kutte: "dog",
  pakadne: "gripping", pakad: "grip", pakdne: "gripping", chalne: "walking", chalta: "walking", chalti: "walking", ghoomne: "driving",
  insaan: "human", insan: "human", aankh: "camera", aankhen: "cameras", chahiye: "", banao: "make", bana: "make",
  // a robot dog in each language
  hund: "dog", chien: "dog", perro: "dog",
};

/** Hindi (Devanagari) and Urdu (Perso-Arabic) robot words, matched as whole words before anything else. Longer forms first. */
const SCRIPT: [string, string][] = [
  // Hindi
  ["रोबोटिक", "robotic"], ["रोबोट", "robot"], ["मानवाकार", "humanoid"], ["इंसान जैसा", "humanoid"], ["इंसान", "human"],
  ["हाथ", "arm"], ["बांह", "arm"], ["भुजा", "arm"], ["ग्रिपर", "gripper"], ["पकड़ने वाला", "gripper"], ["पंजा", "claw"],
  ["पहियों", "wheels"], ["पहिये", "wheels"], ["पहिए", "wheels"], ["पहिया", "wheel"], ["पैरों", "legs"], ["पैर", "legs"], ["टांगें", "legs"], ["टांगों", "legs"],
  ["कुत्ता", "dog"], ["मकड़ी", "spider"], ["कैमरा", "camera"], ["लिडार", "lidar"], ["गाड़ी", "car"], ["कार", "car"], ["सर्वो", "servo"],
  ["आर्डुइनो", "arduino"], ["अर्डुइनो", "arduino"], ["सस्ता", "cheap"], ["सस्ती", "cheap"],
  ["एक", "a"], ["दो", "two"], ["तीन", "three"], ["चार", "four"], ["पांच", "five"], ["छह", "six"], ["छः", "six"], ["सात", "seven"],
  ["जिसमें", "with"], ["के साथ", "with"], ["और", "and"], ["बिना", "without"], ["बनाओ", "make"], ["बनाइए", "make"],
  ["वाला", ""], ["वाली", ""], ["वाले", ""], ["हो", ""], ["चाहिए", ""], ["मुझे", ""], ["का", ""], ["की", ""], ["के", ""],
  // Urdu
  ["روبوٹک", "robotic"], ["روبوٹ", "robot"], ["بازو", "arm"], ["ہاتھ", "arm"], ["گرپر", "gripper"], ["پنجہ", "claw"],
  ["پہیوں", "wheels"], ["پہیے", "wheels"], ["پہیہ", "wheel"], ["ٹانگوں", "legs"], ["ٹانگیں", "legs"], ["پاؤں", "legs"],
  ["کتا", "dog"], ["مکڑی", "spider"], ["کیمرہ", "camera"], ["گاڑی", "car"], ["کار", "car"], ["سستا", "cheap"], ["سستی", "cheap"], ["آرڈوینو", "arduino"],
  ["ایک", "a"], ["دو", "two"], ["تین", "three"], ["چار", "four"], ["پانچ", "five"], ["چھ", "six"], ["سات", "seven"],
  ["کے ساتھ", "with"], ["اور", "and"], ["بغیر", "without"], ["بناؤ", "make"],
  ["والا", ""], ["والی", ""], ["والے", ""], ["چاہیے", ""], ["مجھے", ""], ["کا", ""], ["کی", ""], ["کے", ""],
];
/** Multi-word phrases, matched before single words (accent-free). */
const PHRASES: [RegExp, string][] = [
  [/\bdegres? de liberte\b/g, "degrees of freedom"],
  [/\bgrados? de libertad\b/g, "degrees of freedom"],
  [/\ba roues\b/g, "wheeled"],
  [/\bcon ruedas\b/g, "with wheels"],
  [/\bbras robot(?:ique|ise)?\b/g, "robot arm"],
  [/\bbrazo robot(?:ico)?\b/g, "robot arm"],
  [/\bmit (?:raedern|radern|rader)\b/g, "with wheels"],
  // Hinglish: "jo 1 kg utha sake" (that can lift 1 kg), "2 kilo tak uthane wala"
  [/\b(\d+(?:\.\d+)?\s*(?:kg|kgs|kilo|kilos|g|gm|gram|grams))\s+(?:tak\s+|ka\s+|ki\s+)?(?:wajan\s+|vajan\s+|bhaar\s+|saman\s+|samaan\s+)?(?:utha|uthaa|uthane|uthaye)\s*(?:sake|sakta|sakti|sakte|paye|le|wala|wali|ne\s+wala|ne\s+wali)?\b/g, "that lifts $1"],
  [/\binsaan jaisa\b|\binsan jaisa\b/g, "humanoid"],
  [/\brobot kutta\b/g, "robot dog"],
  [/\bke saath\b|\bke sath\b/g, "with"],
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
  // Hinglish
  ek: "a", teen: "three", char: "four", chaar: "four", paanch: "five", panch: "five", chhe: "six", chhah: "six", saat: "seven", aath: "eight",
  aur: "and", bina: "without", saath: "with", sath: "with", jo: "that", mujhe: "", mera: "my", meri: "my", wala: "", wali: "", wale: "", ka: "", ki: "", ke: "",
  nahi: "no", nahin: "no",
};
/** Also English words: mapped, but they never mark a prompt as non-English on their own. */
const ALSO_ENGLISH = new Set(["articulations"]);

const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");

export interface Translation { text: string; /** "greifer -> gripper" for each mapped word */ mapped: string[]; }

/** Map German/French/Spanish robot keywords onto English. English prompts come back unchanged. */
export function translateKeywords(text: string): Translation {
  const mapped: string[] = [];
  const note = (from: string, to: string) => { const n = to ? `${from} -> ${to}` : `${from} (no English word needed)`; if (from !== to && !mapped.includes(n)) mapped.push(n); };
  // Devanagari and Urdu words first (before accents are stripped: combining vowel signs are part of these words)
  let scripted = text;
  if (/[\u0900-\u097F\u0600-\u06FF]/.test(text)) for (const [w, to] of SCRIPT)
    scripted = scripted.replace(new RegExp(`(^|[^\\p{L}\\p{M}])${w}(?=$|[^\\p{L}\\p{M}])`, "gu"), (_m, pre) => { note(w, to); return `${pre} ${to} `; });
  const plain = stripAccents(scripted).replace(/[ \t]{2,}/g, " ").trim();
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

/** Robot-type words a typo is corrected to ("quadrupad" -> "quadruped"); short words are left alone. */
const TYPO_TARGETS = ["quadruped", "hexapod", "humanoid", "mecanum", "gripper", "manipulator", "differential", "exoskeleton", "robotic", "omnidirectional"];
/** Edit distance with adjacent swaps counted once (Damerau, optimal string alignment). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
/** Read a few emoji as words, and correct a misspelt robot-type word: one slip in a word of up to 7 letters, two in a longer one. Each one is reported. */
const EMOJI: [RegExp, string][] = [[/🐕|🐶|🦮|🐩/gu, "robot dog"], [/🚗|🚙|🏎️?|🚕/gu, "car"], [/🕷️?|🕸️?|🐜/gu, "spider"], [/🦾/gu, "robot arm"], [/🦿/gu, "legs"], [/🤏|🦞|🦀/gu, "gripper"], [/🤖/gu, "robot"], [/🚁|🛸|🛩️?|✈️?/gu, "drone"], [/🐍/gu, "snake robot"], [/🐟|🐠|🐡|🦈|🐙|🐬|🐳|🤿/gu, "underwater"],
  [/🌱|🪴|🌻|🌷|🌿|🌵|🍅/gu, "plants"], [/💧|🚿|💦/gu, "water"], [/🧹|🧽|🧼/gu, "cleaning"], [/📷|📸|🎥|📹/gu, "camera"], [/🐈|🐱/gu, "cat"], [/🖐️?|✋|🤚/gu, "robot hand"], [/🚜/gu, "tractor"], [/☀️?🔋?|🔆/gu, "solar panels"]];
export function correctTypos(text: string): Translation {
  const mapped: string[] = [];
  for (const [rx, to] of EMOJI) text = text.replace(rx, (e) => { mapped.push(`${e} -> ${to}`); return ` ${to} `; });
  const out = text.replace(/[a-z]{5,}/g, (w) => {
    if (TYPO_TARGETS.some((t) => w.includes(t))) return w;   // "hexapods", "grippers": already the word
    const best = TYPO_TARGETS.map((t) => ({ t, d: distance(w, t) })).sort((x, y) => x.d - y.d)[0];
    if (best.d === 0 || best.d > (best.t.length <= 7 ? 1 : 2) || Math.abs(best.t.length - w.length) > 2) return w;
    mapped.push(`${w} -> ${best.t}`);
    return best.t;
  });
  return { text: out, mapped };
}
