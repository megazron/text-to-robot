// Electrical simulation: a circuit solver of my own (mna.ts), the data the catalog lacks (data.ts) and a robot's
// harness as a circuit, with faults (robot.ts).
export { Circuit, Element, Resistor, Switch, Fuse, VSource, ISource, Capacitor, Diode, CurrentLoad, PowerLoad, Motor, Regulator, fuseWindow, type FuseCurve, type RegulatorSpec, type Solution, type TransientResult, type Trip } from "./mna.ts";
export { ESTIMATES, FUSE_MINI, OCV_CELL, ocvCell, socOfCell, chemistryOf, cellOhm, type Chemistry } from "./data.ts";
export { simulate, discharge, MODEL_NOTES, type SimDischarge, type SimOptions, type SimResult, type SimState, type SimEvent, type SimWire, type SimPart, type SimRail, type SimSource, type SimRegulator, type SimFuse, type SimPower, type SimTransient, type Fault, type Scenario, type Assumption } from "./robot.ts";
