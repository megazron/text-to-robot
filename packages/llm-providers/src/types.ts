import type { RobotSpecification } from "@ttr/robot-schema";

export interface LlmProvider {
  readonly name: string;
  /** true if this provider is configured (e.g. an API key is present) */
  available(): boolean;
  /** produce a RobotSpecification (untrusted -- caller validates + repairs) */
  generateSpec(prompt: string): Promise<RobotSpecification>;
  /** modify an existing spec */
  modifySpec(spec: RobotSpecification, instruction: string): Promise<RobotSpecification>;
}

export const SYSTEM_PROMPT =
  "You are a robotics URDF architect. Convert the user's request into a JSON " +
  "RobotSpecification with fields: robot_name (string), links[], joints[], " +
  "materials[], sensors[], end_effectors[], metadata. Each link: name, geometry " +
  "({type:'box',size:[x,y,z]} | {type:'cylinder',radius,length} | {type:'sphere',radius}), " +
  "mass (kg, >0), origin ({xyz:[x,y,z], rpy:[r,p,y]}), optional material (name), role. " +
  "Each joint: name, type ('revolute'|'continuous'|'prismatic'|'fixed'), parent, child, " +
  "origin, axis [x,y,z], and for revolute/prismatic a limit {lower,upper,effort,velocity}. " +
  "Exactly one root link (a link that is never a child). No cycles. Do NOT include inertia " +
  "(it is computed). Output ONLY minified JSON, no markdown, no prose.";
