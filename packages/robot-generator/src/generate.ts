import type { RobotSpecification, ValidationResult } from "@ttr/robot-schema";
import { validateSpec } from "@ttr/robot-schema";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { buildBom, type BillOfMaterials } from "@ttr/components";
import type { LlmProvider } from "@ttr/llm-providers";
import { finalizeSpec, dofCount } from "./finalize.ts";
import { interpretPrompt, applyModification, extractBudget, extractPayload, describeInterpretation, type Interpretation } from "./nlp.ts";
import { repair } from "./repair.ts";
import { ensureArmourPack, DEFAULT_SHAPE, type ArmourShape } from "@ttr/mesh";
import { normalize, mentions } from "./text.ts";
import { RX, WEAPONS } from "./families.ts";
import { suitOptions } from "./suit.ts";
import { diffSpecs, type SpecDiff } from "./diff.ts";
import { PromptRefusal, triage } from "./triage.ts";
import { nearestEntry, activeEmbedder } from "./similarity.ts";
import { planFromModel, PLAN_SYSTEM_PROMPT } from "./plan.ts";

/** Local reference/template generator; no network, account, or model token. */
export class LocalProvider implements LlmProvider {
  readonly name = "local";
  available() { return true; }
  async generateSpec(prompt: string) { return interpretPrompt(prompt).spec; }
  async modifySpec(spec: RobotSpecification, instruction: string) { return applyModification(spec, instruction).spec; }
}

/** Compatibility alias for existing scripts. */
export class DemoProvider extends LocalProvider {}

export interface GenerateResult {
  robot: RobotSpecification;
  urdf: string;
  xacro: string;
  validation: ValidationResult;      // spec (topology/physics)
  urdfValidation: ValidationResult;  // generated URDF (structural)
  warnings: string[];
  repairs: string[];
  provider: string;
  dof: number;
  bom: BillOfMaterials;
  /** how the local parser read the prompt (local provider only) */
  interpretation?: Interpretation;
  /** one-line summary of `interpretation` */
  summary?: string;
  /** which path designed the robot, in words: the rule parser, the knowledge table, a similarity match or a model */
  designedBy: string;
}

export interface GenerateOptions { provider?: LlmProvider; }

const MAX_REPAIRS = 3;

function repairLoop(spec: RobotSpecification): { validation: ValidationResult; repairs: string[] } {
  const repairs: string[] = [];
  let validation = validateSpec(spec);
  let attempts = 0;
  while (!validation.valid && attempts < MAX_REPAIRS) {
    attempts++;
    const { actions } = repair(spec);
    repairs.push(`attempt ${attempts}: ${actions.length ? actions.join("; ") : "no-op"}`);
    validation = validateSpec(spec);
  }
  return { validation, repairs };
}

/** The local parser; a prompt it cannot place is tried once more with the closest knowledge entry by the registered sentence-embedding model. */
async function localInterpret(prompt: string): Promise<{ spec: RobotSpecification; interpretation?: Interpretation }> {
  try { return interpretPrompt(prompt); }
  catch (e) {
    if (!(e instanceof PromptRefusal) || e.kind !== "not_understood" || activeEmbedder().name === "built-in word table") throw e;
    const hit = await nearestEntry(prompt);
    if (!hit) throw e;
    const r = interpretPrompt(prompt, { knowledgeHint: hit.entry.id });
    r.interpretation.path = `similarity (${hit.by}, ${hit.score})`;
    return r;
  }
}

async function specFromProvider(provider: LlmProvider, prompt: string, warnings: string[]): Promise<{ spec: RobotSpecification; interpretation?: Interpretation }> {
  if (provider instanceof LocalProvider) return localInterpret(prompt);
  // harmful and impossible requests are refused before any text leaves the page
  interpretTriage(prompt);
  try {
    // a model that writes a body plan: the plan is checked field by field, then designed from real parts like any prompt
    if (provider.generatePlan) {
      const raw = await provider.generatePlan(prompt, PLAN_SYSTEM_PROMPT);
      const plan = planFromModel(raw);
      const r = interpretPrompt(plan.prompt);
      r.spec.metadata.source_prompt = prompt;
      r.interpretation.path = `model (${provider.name})`;
      r.interpretation.approximations.unshift(`the model read the prompt as: "${plan.prompt}"`, ...plan.notes);
      return r;
    }
    return { spec: await provider.generateSpec(prompt) };
  } catch (e) {
    if (e instanceof PromptRefusal && e.kind !== "not_understood") throw e;
    warnings.push(`provider '${provider.name}' failed (${(e as Error).message}); designed by the local parser instead`);
    return localInterpret(prompt);
  }
}
const interpretTriage = (prompt: string) => triage(prompt);

function interpretationWarnings(i: Interpretation | undefined): string[] {
  if (!i) return [];
  return [...(i.warnings ?? []).map((w) => `warning: ${w}`), ...i.conflicts.map((c) => `conflict: ${c}`), ...i.approximations.map((a) => `approximated: ${a}`), ...i.ignored.map((x) => `not applied: ${x}`)];
}

/** Budget and payload stated in this instruction, else in the prompt that created the robot. */
function requirements(spec: RobotSpecification, text: string) {
  const origin = spec.metadata.source_prompt ?? "";
  return { budget: extractBudget(text) ?? extractBudget(origin), payloadKg: extractPayload(text) ?? extractPayload(origin) };
}

/** A Mark 43 prompt needs its armour forged (or found) before the designer places it: the forge makes it from the prompt's shape words. */
export async function forgeForPrompt(prompt: string): Promise<void> {
  const t = normalize(prompt);
  if (mentions(t, WEAPONS)) return;   // refused by the parser: nothing to forge
  if (!mentions(t, RX.suit) || !/iron[\s-]?man|mark\s*(?:[ivx]+|\d+)|armou?r|movie|ultron/.test(t) || (/\bmech\b(?!\s+suit)/.test(t) && !/iron[\s-]?man|exo|wearable|suit/.test(t))) return;
  await ensureArmourPack(suitOptions(t).shape);
}
/** the armour shape a built suit was designed with (its pack must be loaded to export its meshes) */
export async function forgeForRobot(spec: RobotSpecification): Promise<void> {
  // an imported file may be anything: only a spec with a Mark 43 design record needs its armour (the rest is validated later)
  const m = (spec?.metadata ?? {}) as { design?: { family?: string; request?: { shape?: ArmourShape } }; studio?: { design_request?: { shape?: ArmourShape } } }, d = m.design;
  if (d?.family !== "mark43_wearable") return;
  // a suit edited in an editor keeps its designer's request aside (apps/web/src/engine/edit.ts)
  await ensureArmourPack(d.request?.shape ?? m.studio?.design_request?.shape ?? DEFAULT_SHAPE);
}

export async function generateRobot(prompt: string, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const warnings: string[] = [];
  if (!prompt || !prompt.trim()) throw new PromptRefusal("empty", "The prompt is empty. Describe a robot, or what it should do, for example \"a robot that waters my plants\" or \"a 6 DOF arm with a gripper\".");
  await forgeForPrompt(prompt);
  const provider = opts.provider ?? new LocalProvider();
  const { spec: raw, interpretation } = await specFromProvider(provider, prompt, warnings);
  const spec = finalizeSpec(raw);
  warnings.push(...interpretationWarnings(interpretation));
  const { validation, repairs } = repairLoop(spec);
  const urdf = generateUrdf(spec);
  const xacro = generateXacro(spec);
  const urdfValidation = validateUrdf(urdf);
  const { budget, payloadKg } = requirements(spec, prompt);
  const bom = buildBom(spec, budget, { payloadKg: interpretation ? interpretation.payload_kg : payloadKg });
  return { robot: spec, urdf, xacro, validation, urdfValidation, warnings, repairs, provider: provider.name, dof: dofCount(spec), bom, designedBy: designedBy(interpretation, provider),
    ...(interpretation ? { interpretation, summary: describeInterpretation(interpretation) } : {}) };
}

/** The path that designed the robot, said plainly on the result. */
export function designedBy(i: Interpretation | undefined, provider: LlmProvider): string {
  if (!i) return `the ${provider.name} model wrote the robot file directly (checked and repaired locally; not sized from real parts)`;
  if (i.path.startsWith("model")) return `${i.path.replace(/^model \((.*)\)$/, "the $1 model")} wrote a body plan; the local design engine built it from real parts`;
  if (i.path === "knowledge table") return "the local task and object table chose the body plan; the local design engine built it";
  if (i.path.startsWith("similarity")) return `the closest task by meaning (${i.path.replace(/^similarity \((.*)\)$/, "$1")}) chose the body plan; the local design engine built it`;
  return "the local rule parser read the robot type; the local design engine built it";
}

export interface ModifyResult extends GenerateResult { diff: SpecDiff; changes: string[]; }

export async function modifyRobot(prev: RobotSpecification, instruction: string, opts: GenerateOptions = {}): Promise<ModifyResult> {
  const warnings: string[] = [];
  await forgeForRobot(prev);
  const provider = opts.provider ?? new LocalProvider();
  let changes: string[] = [];
  let next: RobotSpecification;
  if (provider instanceof LocalProvider) {
    const r = applyModification(prev, instruction);
    next = r.spec; changes = r.changes;
  } else {
    try { next = await provider.modifySpec(prev, instruction); }
    catch (e) { warnings.push(`provider '${provider.name}' failed (${(e as Error).message}); using local generation`); const r = applyModification(prev, instruction); next = r.spec; changes = r.changes; }
  }
  finalizeSpec(next);
  const { validation, repairs } = repairLoop(next);
  const urdf = generateUrdf(next);
  const xacro = generateXacro(next);
  const urdfValidation = validateUrdf(urdf);
  const diff = diffSpecs(prev, next);
  if (!changes.length) changes = diff.lines;
  for (const c of changes) if (/^[?!]/.test(c)) warnings.push(c.replace(/^[?!]\s*/, ""));
  const { budget, payloadKg } = requirements(next, instruction);
  const bom = buildBom(next, budget, { payloadKg: next.end_effectors.length ? payloadKg : undefined });
  return { robot: next, urdf, xacro, validation, urdfValidation, warnings, repairs, provider: provider.name, dof: dofCount(next), diff, changes, bom, designedBy: provider instanceof LocalProvider ? "the local edit engine changed the robot" : `the ${provider.name} model changed the robot file (checked and repaired locally)` };
}
