// Public surface of the local prompt parser. The implementation is split by concern:
//   text.ts       lexical helpers (normalisation, negation, units, names, colours)
//   lexicon.ts    multilingual keyword translation
//   families.ts   robot-family vocabulary and template choice
//   interpret.ts  prompt -> spec + Interpretation (applied / approximated / ignored)
//   sizing.ts     reach, link length and size-word handling
//   sensors.ts    sensor requests and surface mounting
//   grippers.ts   gripper swaps and arm-tip lookup
//   modify.ts     natural-language modification of an existing spec
import { parseBudget, extractMasses } from "./text.ts";

export { MAX_ARM_DOF, extractDof, interpretPrompt, parsePrompt, describeInterpretation, type Interpretation, type PromptResult } from "./interpret.ts";
export { applyModification, splitClauses, type ModResult } from "./modify.ts";
export { bodyEnvelope } from "./sensors.ts";

/** parse a budget like "$500", "under 2000 dollars", "budget of 1.5k" (US dollars only) */
export function extractBudget(text: string): number | undefined {
  return parseBudget(text).usd;
}

/** Payload mass (kg) stated in the text, e.g. "lifts 2 kg", "5 kg payload". */
export function extractPayload(text: string): number | undefined {
  return extractMasses(text).find((m) => m.context === "payload")?.kg;
}
