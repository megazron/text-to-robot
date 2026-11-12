// Fits the task tools a body plan asks for onto the designed robot, and says which ones were built.
import type { RobotSpecification } from "@ttr/robot-schema";
import { TOOL_LABEL, type ToolKind } from "./tools.ts";
import type { Choice } from "./families.ts";

export interface ToolResult { kind: ToolKind; label: string; built: boolean; note?: string; }

/** Tools are designed as modules on the robot they ride on; until a module exists for a tool it is reported, not dropped. */
export function toolPlan(spec: RobotSpecification, kinds: ToolKind[], choice: Choice): ToolResult[] {
  void spec;
  return kinds.map((kind) => ({ kind, label: TOOL_LABEL[kind], built: false,
    note: `not designed yet: the ${choice.label} is built without it (the ${TOOL_LABEL[kind]} module is planned; mount one on the deck or tool flange by hand)` }));
}
