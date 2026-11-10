// Common robot words in scripts other than Latin (Hindi, Urdu, Arabic, Japanese, Chinese) and a few more romanised Hindi,
// Spanish, French and German words for the new robot types and tasks. Like lexicon.ts this is a word list, not
// translation: each word found is replaced by its English robot word and reported. Scripts without spaces between words
// (Japanese, Chinese) are matched as substrings, longest first.

const SCRIPT_WORDS: [string, string][] = [
  // Hindi (Devanagari)
  ["रोबोटिक", "robotic"], ["रोबोट", "robot"], ["हाथ", "arm"], ["बांह", "arm"], ["भुजा", "arm"], ["पहिये", "wheels"], ["पहियों", "wheels"], ["पहिया", "wheel"],
  ["पैरों", "legs"], ["पैर", "legs"], ["टांगें", "legs"], ["कुत्ता", "robot dog"], ["कुत्ते", "robot dog"], ["ड्रोन", "drone"], ["कैमरा", "camera"], ["ग्रिपर", "gripper"],
  ["पकड़ने", "gripper"], ["इंसान", "humanoid"], ["मानव", "humanoid"], ["मकड़ी", "spider"], ["सांप", "snake"], ["साँप", "snake"], ["मछली", "fish"],
  ["उड़ने", "flying"], ["उड़ता", "flying"], ["पौधों", "plants"], ["पौधे", "plants"], ["पानी", "water"], ["साफ", "clean"], ["सफाई", "cleaning"], ["गाड़ी", "car"], ["कार", "car"],
  ["दो", "two"], ["तीन", "three"], ["चार", "four"], ["पांच", "five"], ["पाँच", "five"], ["छह", "six"], ["सात", "seven"], ["के साथ", "with"], ["जिसमें", "with"], ["बिना", "without"],
  ["एक", "a"], ["वाला", ""], ["वाली", ""], ["बनाओ", "make"], ["चाहिए", ""], ["हो", ""],
  // Urdu (Perso-Arabic)
  ["روبوٹک", "robotic"], ["روبوٹ", "robot"], ["بازو", "arm"], ["ہاتھ", "arm"], ["پہیوں", "wheels"], ["پہیے", "wheels"], ["پہیہ", "wheel"], ["ٹانگیں", "legs"], ["ٹانگوں", "legs"],
  ["کتا", "robot dog"], ["ڈرون", "drone"], ["کیمرہ", "camera"], ["کیمرا", "camera"], ["گرپر", "gripper"], ["انسان", "humanoid"], ["مکڑی", "spider"], ["سانپ", "snake"],
  ["مچھلی", "fish"], ["اڑنے", "flying"], ["پودوں", "plants"], ["پودے", "plants"], ["پانی", "water"], ["صفائی", "cleaning"], ["صاف", "clean"], ["گاڑی", "car"],
  ["کے ساتھ", "with"], ["کے بغیر", "without"], ["ایک", "a"], ["دو", "two"], ["تین", "three"], ["چار", "four"], ["پانچ", "five"], ["چھ", "six"], ["سات", "seven"], ["بناؤ", "make"], ["والا", ""],
  // Arabic
  ["روبوتية", "robotic"], ["روبوت", "robot"], ["ذراع", "arm"], ["عجلات", "wheels"], ["عجلة", "wheel"], ["أرجل", "legs"], ["ارجل", "legs"], ["كلب", "robot dog"],
  ["طائرة بدون طيار", "drone"], ["درون", "drone"], ["كاميرا", "camera"], ["ملقط", "gripper"], ["قابض", "gripper"], ["بشري", "humanoid"], ["عنكبوت", "spider"],
  ["ثعبان", "snake"], ["سمكة", "fish"], ["تحت الماء", "underwater"], ["نباتات", "plants"], ["تنظيف", "cleaning"], ["سيارة", "car"], ["مع", "with"], ["بدون", "without"],
  ["اثنين", "two"], ["ثلاث", "three"], ["أربع", "four"], ["اربع", "four"], ["ست", "six"], ["سبع", "seven"],
  // Japanese
  ["ロボットアーム", "robot arm"], ["ロボット", "robot"], ["アーム", "arm"], ["腕", "arm"], ["車輪", "wheels"], ["ホイール", "wheels"], ["四足", "quadruped"], ["六脚", "hexapod"],
  ["脚", "legs"], ["犬型", "robot dog"], ["犬", "robot dog"], ["ドローン", "drone"], ["カメラ", "camera"], ["グリッパー", "gripper"], ["ハンド", "hand"], ["人型", "humanoid"],
  ["ヒューマノイド", "humanoid"], ["蜘蛛", "spider"], ["クモ", "spider"], ["ヘビ", "snake"], ["水中", "underwater"], ["魚", "fish"], ["植物", "plants"], ["掃除", "cleaning"],
  ["自由度", " dof"], ["軸", " axis"], ["の", " "], ["付き", " with"], ["と", " and "],
  // Chinese (simplified and traditional)
  ["机械臂", "robot arm"], ["機械臂", "robot arm"], ["机器人", "robot"], ["機器人", "robot"], ["手臂", "arm"], ["轮式", "wheeled"], ["輪式", "wheeled"], ["轮子", "wheels"], ["輪子", "wheels"],
  ["四足", "quadruped"], ["六足", "hexapod"], ["腿", "legs"], ["机器狗", "robot dog"], ["機器狗", "robot dog"], ["狗", "robot dog"], ["无人机", "drone"], ["無人機", "drone"],
  ["摄像头", "camera"], ["攝像頭", "camera"], ["相机", "camera"], ["相機", "camera"], ["夹爪", "gripper"], ["夾爪", "gripper"], ["夹持器", "gripper"], ["人形", "humanoid"],
  ["蜘蛛", "spider"], ["蛇", "snake"], ["水下", "underwater"], ["鱼", "fish"], ["魚", "fish"], ["浇花", "water plants"], ["澆花", "water plants"], ["植物", "plants"], ["清洁", "cleaning"],
  ["清潔", "cleaning"], ["带", " with "], ["帶", " with "], ["的", " "], ["个", " "], ["個", " "],
  ["一", "one "], ["二", "two "], ["两", "two "], ["兩", "two "], ["三", "three "], ["四", "four "], ["五", "five "], ["六", "six "], ["七", "seven "],
];
/** Latin-script words added for the new robot types and tasks (accents already stripped). */
const LATIN_WORDS: [RegExp, string][] = [
  // romanised Hindi / Urdu
  [/\b(?:paudhon|paudhe|paudho|podhon|podhe)\b/g, "plants"], [/\b(?:paani|pani)\b/g, "water"], [/\b(?:saaf|safai|safaai)\b/g, "clean"], [/\b(?:udne|udta|udti|udan)\b/g, "flying"],
  [/\b(?:machli|machhli)\b/g, "fish"], [/\b(?:saanp|sanp)\b/g, "snake"], [/\b(?:makdi|makri)\b/g, "spider"], [/\b(?:gaadi|gadi)\b/g, "car"], [/\b(?:billi)\b/g, "cat"],
  [/\b(?:photo|tasveer|tasvir)\s+(?:kheenche|khinche|lene|leta)\b/g, "takes photos"], [/\bdene\s+wala\b|\bkarne\s+wala\b/g, ""],
  // Spanish, French, German, Italian, Portuguese
  [/\b(?:dron|drohne|drone)\b/g, "drone"], [/\b(?:serpiente|serpent|schlange|serpente|cobra)\b/g, "snake"], [/\b(?:submarino|sous[\s-]?marin|unterwasser|subacqueo)\b/g, "underwater"],
  [/\b(?:reg(?:ar|ue|ua|ar\w*)|riega\w*|arros\w*|giess\w*|giesst|gieben|annaffi\w*)\b/g, "water"], [/\b(?:plantas|plantes|pflanzen|piante)\b/g, "plants"], [/\b(?:limpiar|nettoyer|reinigen|pulire|limpar)\b/g, "clean"],
  [/\b(?:aspiradora|aspirateur|staubsauger|aspirapolvere)\b/g, "robot vacuum"], [/\b(?:mano\s+robotica|main\s+robotique|roboterhand)\b/g, "robot hand"], [/\b(?:pez|poisson|fisch|pesce)\b/g, "fish"],
  [/\b(?:arana|araignee|spinne|ragno)\b/g, "spider"], [/\b(?:coche|voiture|auto)\b/g, "car"], [/\b(?:gato|chat|katze|gatto)\b/g, "cat"], [/\b(?:fotos|photos)\b/g, "photos"],
];

const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
const SORTED = [...SCRIPT_WORDS].sort((a, b) => b[0].length - a[0].length);

/** Replace known non-Latin robot words, and a few more Latin ones, with English. Returns the text and what was mapped. */
export function translateScripts(text: string): { text: string; mapped: string[] } {
  const mapped: string[] = [];
  let out = text;
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(out)) {
    for (const [from, to] of SORTED) {
      if (!out.includes(from)) continue;
      out = out.split(from).join(` ${to} `);
      if (to.trim() && !mapped.includes(`${from} -> ${to.trim()}`)) mapped.push(`${from} -> ${to.trim()}`);
    }
    // Japanese / Chinese numbers before an axis or DOF word: "6軸" is already "6 axis" after the swap above
  }
  const latin = strip(out.toLowerCase());
  let low = latin;
  for (const [rx, to] of LATIN_WORDS) low = low.replace(rx, (m) => { if (m.trim() !== to.trim() && to.trim()) { const n = `${m} -> ${to}`; if (!mapped.includes(n)) mapped.push(n); } return to; });
  if (low !== latin) out = low;
  return { text: out.replace(/\s+/g, " ").trim(), mapped };
}
