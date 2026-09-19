import type { RobotSpecification, ValidationResult } from "@ttr/robot-schema";
import { validateSpec } from "@ttr/robot-schema";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { buildBom, type BillOfMaterials } from "@ttr/components";
import type { LlmProvider } from "@ttr/llm-providers";
import { finalizeSpec, dofCount } from "./finalize.ts";
import { parsePrompt, applyModification, extractBudget } from "./nlp.ts";
import { repair } from "./repair.ts";
import { diffSpecs, type SpecDiff } from "./diff.ts";

/** Local reference/template generator; no network, account, or model token. */
export class LocalProvider implements LlmProvider {
  readonly name = "local";
  available() { return true; }
  async generateSpec(prompt: string) { return parsePrompt(prompt); }
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

async function specFromProvider(provider: LlmProvider, prompt: string, warnings: string[]): Promise<RobotSpecification> {
  try {
    return await provider.generateSpec(prompt);
  } catch (e) {
    warnings.push(`provider '${provider.name}' failed (${(e as Error).message}); using local generation`);
    return parsePrompt(prompt);
  }
}

export async function generateRobot(prompt: string, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const warnings: string[] = [];
  if (!prompt || !prompt.trim()) throw new Error("empty prompt");
  const provider = opts.provider ?? new LocalProvider();
  const spec = finalizeSpec(await specFromProvider(provider, prompt, warnings));
  const { validation, repairs } = repairLoop(spec);
  const urdf = generateUrdf(spec);
  const xacro = generateXacro(spec);
  const urdfValidation = validateUrdf(urdf);
  const bom = buildBom(spec, extractBudget(prompt));
  return { robot: spec, urdf, xacro, validation, urdfValidation, warnings, repairs, provider: provider.name, dof: dofCount(spec), bom };
}

export interface ModifyResult extends GenerateResult { diff: SpecDiff; changes: string[]; }

export async function modifyRobot(prev: RobotSpecification, instruction: string, opts: GenerateOptions = {}): Promise<ModifyResult> {
  const warnings: string[] = [];
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
  const bom = buildBom(next, extractBudget(instruction));
  return { robot: next, urdf, xacro, validation, urdfValidation, warnings, repairs, provider: provider.name, dof: dofCount(next), diff, changes, bom };
}
