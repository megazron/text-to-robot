// Circuit drawings and electrical calculations from a robot's wiring record.
export { schematic, type SchematicResult, type SchematicNetlist } from "./schematic.ts";
export { breadboard, type BreadboardResult, WIRE_HEX } from "./breadboard.ts";
export { electricalReport, electricalMarkdown, USABLE, type ElectricalReport, type LogicRow, type RegulatorRow, type RuntimeRow } from "./electrical.ts";
export { layoutProblems, netlistFromSvg } from "./check.ts";
export { buildModel, type CircuitModel } from "./model.ts";
