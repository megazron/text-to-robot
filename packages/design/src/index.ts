export * from "./assembly.ts";
export * from "./kin.ts";
export * from "./sizing.ts";
export { designArm, type ArmRequest } from "./families/arm.ts";

import type { RobotSpecification } from "@ttr/robot-schema";
import { designArm as _arm } from "./families/arm.ts";
/** Designer per record family: edits re-run the designer with an updated request. */
export const DESIGNERS: Record<string, (req: any) => RobotSpecification> = { arm: _arm };
/** The record a designed robot carries (undefined for template robots). */
export const designOf = (spec: RobotSpecification) => (spec.metadata as { design?: import("./assembly.ts").DesignRecord }).design;
