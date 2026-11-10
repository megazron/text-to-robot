// The electronics and the harness in 3D: part models with their pins, every wire as a centreline on the links it rides,
// and the checks of the harness (through solids, bend radius, cut length).
export { wiring3d, wiringOfSpec, fillet, type Wiring3D, type Wire3D, type Part3D, type Pt } from "./wires.ts";
export { partModel, FOOTPRINT_SOURCES, type PartModel, type PinAt } from "./models.ts";
export { checkHarness, type HarnessCheck } from "./checks.ts";
export type { Model, MeshPart, Label, Mat } from "./geom.ts";
export { electronicsGlb, tube } from "./glb.ts";
