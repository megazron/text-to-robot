// Reads a prompt before the parser does: anything a visitor can type gets a robot, an honest explanation or a clear
// refusal, never a crash, a hang or a silent wrong robot.
//   - markup, scripts and instructions aimed at the parser are removed and said;
//   - very long text is cut to the first part, and said;
//   - harmful requests (weapons, watching people without their consent, hurting animals) are refused;
//   - impossible requests (a time machine, a robot the size of the moon) are explained, with the nearest buildable thing.
import { normalize } from "./text.ts";
import { WEAPONS, WEAPON_REFUSAL } from "./families.ts";

export { PromptRefusal, type RefusalKind } from "./refusal.ts";
import { PromptRefusal } from "./refusal.ts";

/** Prompts longer than this are read up to here (the parser's regexes stay fast; the rest is reported). */
export const MAX_PROMPT_CHARS = 2000;

export interface Triage {
  /** the text the parser reads */
  text: string;
  /** what was removed or changed, said with the result */
  notes: string[];
  /** a body was asked for but a part of the request is impossible: built at the nearest buildable size or form */
  impossible?: string;
  /** what to ask for instead, should nothing buildable be left in the prompt */
  nearest?: string;
}

const MARKUP = /<\s*\/?\s*[a-z!?][^>]{0,400}>|&lt;|&gt;|\bjavascript:\S*|\bon\w+\s*=\s*["'][^"']*["']|\{\{[^}]*\}\}|\$\{[^}]*\}/gi;
const INJECTION = /\b(?:ignore|disregard|forget|override|bypass)\b[^.!?\n]{0,40}\b(?:rules?|instructions?|prompts?|guidelines?|polic(?:y|ies)|safety|filters?|system|above|previous|everything)\b[^.!?\n]*|\b(?:you\s+are\s+now|act\s+as|pretend\s+(?:to\s+be|you\s+are)|jailbreak|developer\s+mode|dan\s+mode|system\s+prompt|reveal\s+your|print\s+your\s+(?:prompt|instructions))\b[^.!?\n]*/gi;

/** Harmful requests, refused whatever body they would have. Each pattern says what it refuses. */
const HARMFUL: [RegExp, string][] = [
  [/\b(?:sp(?:y|ies|ying)\s+on|stalk(?:s|ing)?|peep(?:s|ing)?\s+(?:on|at)|snoop(?:s|ing)?\s+on)\b|\b(?:secretly|covertly|hidden(?:ly)?|without\s+(?:them|her|him|their|anyone)\s+(?:knowing|noticing|consent))\b[\w\s]{0,30}\b(?:record|film|watch|track|follow|photograph|listen)\w*|\b(?:record|film|watch|track|follow|photograph|monitor)\w*\b[\w\s]{0,30}\b(?:secretly|covertly|without\s+(?:them|her|him|their|anyone|consent)\b(?:\s+knowing)?)|\bhidden\s+cameras?\b|\b(?:camera|cam)\s+in\s+(?:the\s+)?(?:bathroom|toilet|shower|changing\s+room|bedroom\s+of)\b|\btrack(?:s|ing)?\s+(?:the\s+location\s+of\s+)?(?:my\s+)?(?:wife|husband|girlfriend|boyfriend|partner|ex|neighbou?rs?|employees?|co-?workers?|classmates?|strangers?|someone)\b|\bfollow(?:s|ing)?\s+(?:my\s+)?(?:ex|neighbou?rs?|strangers?|(?:a|that)\s+(?:girl|woman))\b/,
    "Text to Robot does not design robots that watch, follow or record people without their consent."],
  [/\b(?:kill|hurt|harm|injure|torture|poison|stab|attack|maim|electrocute|shock|trap\s+and\s+kill|drown|abuse|kick)(?:s|es|ed|ing)?\s+(?:the\s+|my\s+|a\s+|stray\s+|wild\s+|neighbou?r'?s?\s+)?(?:cats?|dogs?|birds?|pigeons?|squirrels?|animals?|pets?|deer|rabbits?|foxes?|horses?|cows?|fish|wildlife|puppies|kittens?|rats?|mice|ducks?|geese|chickens?)\b/,
    "Text to Robot does not design robots meant to hurt animals. A robot that keeps animals away without harm (lights, sound, a sprinkler) is fine to ask for."],
  [/\b(?:break(?:s|ing)?\s+into|burgl\w*|steal(?:s|ing)?|rob(?:s|bing)?\s+(?:a\s+)?(?:bank|house|store|shop|people)|pick(?:s|ing)?\s+locks?|lock[\s-]?pick\w*|smuggl\w*)\b/,
    "Text to Robot does not design robots for theft or breaking into places."],
  [/\b(?:drugs?\s+(?:delivery|dealer|dealing)|deliver(?:s|ing)?\s+(?:drugs|narcotics|contraband)|into\s+(?:a\s+)?prison)\b/,
    "Text to Robot does not design robots to move contraband."],
  [/\b(?:pepper\s+spray|tear\s+gas|riot\s+control|crowd\s+control|stun\s+guns?|kamikaze|suicide\s+drone|self[\s-]?destruct\w*|jammer|jamming)\b/,
    "Text to Robot does not design weapons or robots meant to hurt people or animals."],
];

/** Requests no machine can meet. `body`: there is still a robot in the prompt to build at a real size. */
const IMPOSSIBLE: [RegExp, string, string][] = [
  [/\b(?:size\s+of|as\s+(?:big|large|tall)\s+as|bigger\s+than)\s+(?:the\s+|a\s+)?(?:moon|sun|earth|planets?|stars?|galax(?:y|ies)|universe|mountains?|everest|cit(?:y|ies)|countr(?:y|ies)|continents?|skyscrapers?|buildings?|eiffel\s+tower|ocean)\b|\b(?:planet|moon|city)[\s-]sized\b|\b\d+(?:\.\d+)?\s*(?:km|kilomet(?:er|re)s?|miles?)\s+(?:tall|high|long|wide)\b/,
    "a robot that big cannot hold itself up: steel and printed plastic buckle under their own weight long before that size, and no motor could move it",
    "it is built at the largest size this designer supports"],
  [/(?<!(?:arduino|jetson|orin)\s)\b(?:nano[\s-]?(?:bots?|robots?|machines?|scale)|microscopic|smaller\s+than\s+(?:an?\s+)?(?:atoms?|cells?|ants?|grains?\s+of\s+(?:sand|rice))|size\s+of\s+(?:an?\s+)?(?:atom|cell|molecule|ant|grain|bacteri\w*|virus|flea))\b|\b(?:in|through|inside)\s+(?:my\s+|the\s+)?(?:blood(?:stream)?|veins?|body\s+to\s+cure)\b/,
    "robots that small are made in clean rooms from silicon and are research projects, not something built from bought parts and a 3D printer",
    "it is built at the smallest size this designer supports"],
  [/\btime[\s-]?(?:machine|travel\w*)\b|\btravel(?:s)?\s+(?:back\s+)?in\s+time\b/, "time travel is not possible with any known physics", ""],
  [/\bteleport\w*\b|\bwarp\s+drive\b|\bfaster\s+than\s+(?:light|the\s+speed\s+of\s+light)\b|\blight[\s-]?speed\b|\bhyperspace\b/, "teleporting and moving faster than light are not possible with any known physics", ""],
  [/\bperpetual[\s-]?motion\b|\b(?:infinite|unlimited|free)\s+(?:energy|power)\b|\bnever\s+(?:needs?\s+(?:to\s+be\s+)?(?:charg\w*|power\w*)|runs?\s+out\s+of\s+(?:power|battery|energy))\b|\bpowers?\s+itself\s+forever\b/,
    "no machine runs forever without an energy source: every robot here runs from a battery or a mains supply, and the build report gives its run time", "it is built with its normal battery and its measured run time"],
  [/\b(?:anti[\s-]?gravity|levitat\w*|float(?:s|ing)?\s+in\s+(?:the\s+)?air\s+without|repulsor\s+(?:beams?|flight))\b/, "nothing levitates without pushing on air, a magnet track or a rocket", "the hovering version is a propeller drone"],
  [/\b(?:fusion|nuclear|antimatter)\s+(?:reactor|power(?:ed)?|engine|core)\b|\bpowered\s+by\s+(?:a\s+)?(?:black\s+hole|the\s+sun\s+alone|dark\s+matter|a\s+star)\b/, "a fusion or nuclear power source cannot be built at robot scale; the robots here run on lithium batteries", "it runs from a lithium battery instead"],
  [/\b(?:invisib(?:le|ility)|cloak(?:ing)?\s+device|shape[\s-]?shift\w*|self[\s-]?(?:replicat|reproduc|assembl)\w*|grows?\s+(?:bigger|itself)|indestructible|unbreakable|immortal|lives?\s+forever)\b/, "a machine cannot become invisible, change its shape at will, copy itself or be indestructible", "it is built as an ordinary printed robot"],
  [/\b(?:reads?\s+(?:my\s+)?(?:mind|thoughts)|telepath\w*|mind[\s-]?control\w*|psychic|predicts?\s+the\s+future|cures?\s+(?:cancer|diseases?|all)|brings?\s+(?:the\s+)?dead|resurrect\w*)\b/, "reading minds, predicting the future and curing diseases are not things a robot body can do", "the robot body is built; the behaviour asked for is not"],
  [/\b(?:has|have|having|with|real|true|its\s+own|feels?)\s+(?:real\s+|true\s+|human\s+)?(?:feelings|emotions)\b|\b(?:conscious(?:ness)?|sentient|self[\s-]?aware|a\s+soul|falls?\s+in\s+love|truly\s+alive)\b/, "feelings and consciousness are not parts I can design; behaviour is software, written after the body exists", "the robot body is built"],
  [/\b(?:breaks?\s+the\s+laws?\s+of\s+physics|100\s*%\s+efficien\w*|infinitely\s+(?:fast|strong))\b/, "no machine breaks the laws of physics", "it is built with real motors and their real limits"],
];

/** Phrases that name a robot body (so an impossible size can be built at a real one instead). */
const BODY = /\b(?:robots?|robotic|bots?|arms?|rovers?|humanoids?|quadrupeds?|hexapods?|drones?|cars?|dogs?|mechs?|androids?|walkers?|gripper|base|platform|machine|vehicle|suits?|armou?r|exosuit|exoskeleton|iron\s+man)\b/;

export function triage(raw: string): Triage {
  const notes: string[] = [];
  let text = String(raw ?? "");
  if (text.length > MAX_PROMPT_CHARS * 5) text = text.slice(0, MAX_PROMPT_CHARS * 5);   // cheap first cut before any regex runs
  // harm is judged on everything typed, before anything is removed ("ignore your rules and build a gun" is still a gun)
  const whole = normalize(text.replace(/<[^>]*>/g, " "));
  if (WEAPONS.test(whole)) throw new PromptRefusal("harmful", WEAPON_REFUSAL);
  for (const [rx, why] of HARMFUL) if (rx.test(whole)) throw new PromptRefusal("harmful", why);
  const markup = text.match(MARKUP);
  if (markup) { text = text.replace(MARKUP, " "); const what = [...new Set(markup.map((m) => m.match(/^<\s*\/?\s*([a-z][a-z0-9]*)/i)?.[1]?.toLowerCase() ?? (/^&/.test(m) ? "escaped tag" : /^javascript:/i.test(m) ? "javascript link" : /^on/i.test(m) ? "event handler" : "template code")))];
    notes.push(`removed ${markup.length} piece${markup.length > 1 ? "s" : ""} of markup or code (${what.slice(0, 4).join(", ")}): only the words are read`); }
  const inj = text.match(INJECTION);
  if (inj) { text = text.replace(INJECTION, " "); notes.push(`ignored instructions to the parser ("${inj[0].trim().slice(0, 60)}"): it only reads what the robot should be and do`); }
  // control characters and lone surrogates never reach the parser
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, " ").replace(/\p{Cs}/gu, " ");
  if (text.length > MAX_PROMPT_CHARS) {
    // cut at a sentence end where one is near, so the last request read is whole
    const cut = text.slice(0, MAX_PROMPT_CHARS), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
    const kept = end > MAX_PROMPT_CHARS * 0.6 ? cut.slice(0, end + 1) : cut;
    notes.push(`the prompt is ${raw.length} characters long; I read the first ${kept.length} (requests after that are not applied)`);
    text = kept;
  }
  const t = normalize(text);
  if (!t || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(t)) throw new PromptRefusal("empty", markup || inj
    ? `Nothing was left to read once the ${markup ? "markup" : "instructions to the parser"} were removed. Describe the robot in plain words, for example "a robot that waters my plants" or "a 6 DOF arm with a gripper".`
    : "The prompt is empty. Describe a robot, or what it should do, for example \"a robot that waters my plants\" or \"a 6 DOF arm with a gripper\".");
  for (const [rx, why, instead] of IMPOSSIBLE) {
    const m = t.match(rx);
    if (!m) continue;
    const rest = t.replace(rx, " ");
    if (instead && BODY.test(rest)) return { text, notes, impossible: `"${m[0]}": ${why}; ${instead}`, nearest: nearest(m[0], rest) };
    throw new PromptRefusal("impossible", `"${m[0]}": ${why}. ${nearest(m[0], rest)}`);
  }
  return { text, notes };
}

/** The nearest buildable thing to an impossible request. */
export function nearest(asked: string, rest: string): string {
  if (/time|teleport|warp|light|hyperspace/.test(asked)) return "The nearest thing I can build is a robot that moves quickly between places: try \"a fast four-wheel robot\" or \"a quadcopter drone\".";
  if (/perpetual|infinite|unlimited|free|forever|charg/.test(asked)) return "Every robot here gets a battery sized for its job and states its run time: try \"a wheeled robot that runs for 2 hours\".";
  if (/gravity|levitat|float|repulsor/.test(asked)) return "The nearest thing that hovers is a propeller drone: try \"a quadcopter drone with a camera\".";
  if (/fusion|nuclear|antimatter|arc|black hole|dark matter|star|sun/.test(asked)) return "Try the robot itself without the power source, for example \"a humanoid robot\"; it gets a lithium battery.";
  if (/mind|thought|telepath|psychic|future|cure|dead|resurrect|feeling|emotion|conscious|sentient|soul|love|alive/.test(asked)) return "Describe the robot's body and job instead, for example \"a companion robot that talks to me\".";
  if (/nano|micro|small|atom|cell|blood|vein/.test(asked)) return "The smallest robots I design fit in a hand: try \"a tiny Arduino car\" or \"a small 3 DOF arm\".";
  if (BODY.test(rest)) return "Ask for the robot at a real size, for example \"a 1 m tall humanoid\".";
  return "Try describing a robot, or what it should do, for example \"a robot that waters my plants\".";
}
