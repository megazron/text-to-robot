import type { RobotSpecification, ValidationResult } from "@ttr/robot-schema";
import { validateSpec } from "@ttr/robot-schema";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import type { LlmProvider } from "@ttr/llm-providers";
import { selectCloudProvider } from "@ttr/llm-providers";
import { finalizeSpec, dofCount } from "./finalize.ts";
import { parsePrompt, applyModification } from "./nlp.ts";
import { repair } from "./repair.ts";
import { diffSpecs, type SpecDiff } from "./diff.ts";

/** Deterministic demo provider (no network); always available. */
export class DemoProvider implements LlmProvider {
  readonly name = "demo";
  available() { return true; }
  async generateSpec(prompt: string) { return parsePrompt(prompt); }
  async modifySpec(spec: RobotSpecification, instruction: string) { return applyModification(spec, instruction).spec; }
}

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
    warnings.push(`provider '${provider.name}' failed (${(e as Error).message}); using demo mode`);
    return parsePrompt(prompt);
  }
}

export async function generateRobot(prompt: string, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const warnings: string[] = [];
  if (!prompt || !prompt.trim()) throw new Error("empty prompt");
  const provider = opts.provider ?? selectCloudProvider() ?? new DemoProvider();
  const spec = finalizeSpec(await specFromProvider(provider, prompt, warnings));
  const { validation, repairs } = repairLoop(spec);
  const urdf = generateUrdf(spec);
  const xacro = generateXacro(spec);
  const urdfValidation = validateUrdf(urdf);
  return { robot: spec, urdf, xacro, validation, urdfValidation, warnings, repairs, provider: provider.name, dof: dofCount(spec) };
}

export interface ModifyResult extends GenerateResult { diff: SpecDiff; changes: string[]; }

export async function modifyRobot(prev: RobotSpecification, instruction: string, opts: GenerateOptions = {}): Promise<ModifyResult> {
  const warnings: string[] = [];
  const provider = opts.provider ?? selectCloudProvider() ?? new DemoProvider();
  let changes: string[] = [];
  let next: RobotSpecification;
  if (provider.name === "demo") {
    const r = applyModification(prev, instruction);
    next = r.spec; changes = r.changes;
  } else {
    try { next = await provider.modifySpec(prev, instruction); }
    catch (e) { warnings.push(`provider '${provider.name}' failed (${(e as Error).message}); using demo mode`); const r = applyModification(prev, instruction); next = r.spec; changes = r.changes; }
  }
  finalizeSpec(next);
  const { validation, repairs } = repairLoop(next);
  const urdf = generateUrdf(next);
  const xacro = generateXacro(next);
  const urdfValidation = validateUrdf(urdf);
  const diff = diffSpecs(prev, next);
  if (!changes.length) changes = diff.lines;
  return { robot: next, urdf, xacro, validation, urdfValidation, warnings, repairs, provider: provider.name, dof: dofCount(next), diff, changes };
}
