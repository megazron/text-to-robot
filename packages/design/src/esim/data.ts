// Numbers the electrical simulation needs that the parts catalog does not hold. Two kinds, kept apart:
// datasheet tables (the blade fuse) with their source, and estimates. Every estimate a simulation uses is listed in
// its result's `assumptions` with the parts it was used for, so nothing assumed reads as measured.
import type { FuseCurve } from "./mna.ts";

/**
 * Littelfuse MINI blade fuse (the ATM fuse of the harness): opening time against the percentage of the rating, and per
 * rating the typical cold resistance (milliohm) and the melting I^2 t (A^2 s). From the MINI 58 V datasheet, whose
 * header states it has the same time-current characteristic as the 32 V MINI fuse.
 */
export const FUSE_MINI = {
  src: "datasheet" as const,
  url: "https://static.chipdip.ru/lib/571/DOC011571744.pdf",
  note: "Littelfuse MINI blade fuses rated 58 V (0997 series), same time-current characteristic as the 32 V MINI; 110 %: 360000 s minimum, no maximum",
  /** at 110 % it must hold 100 h; the first gate with a maximum opening time is 135 % */
  curve: { hold: 1.1, gates: [{ m: 1.35, min_s: 0.75, max_s: 600 }, { m: 2, min_s: 0.15, max_s: 5 }, { m: 3.5, min_s: 0.08, max_s: 0.5 }, { m: 6, min_s: 0.03, max_s: 0.1 }] } satisfies FuseCurve,
  rows: [
    { a: 2, mohm: 55.6, i2t: 2.8 }, { a: 3, mohm: 33.75, i2t: 9.4 }, { a: 4, mohm: 23.48, i2t: 17 }, { a: 5, mohm: 17.75, i2t: 25 }, { a: 7.5, mohm: 10.85, i2t: 68 },
    { a: 10, mohm: 7.42, i2t: 93 }, { a: 15, mohm: 4.58, i2t: 270 }, { a: 20, mohm: 3.21, i2t: 380 }, { a: 25, mohm: 2.36, i2t: 625 }, { a: 30, mohm: 1.85, i2t: 1130 },
  ],
};

/** What the catalog lacks. `value` is what I use, `note` says where the figure comes from. */
export const ESTIMATES = {
  switch_contact_ohm: { value: 0.02, unit: "ohm", note: "contact resistance of a closed rocker or battery switch; makers give 50 milliohm as the initial maximum, a new contact is nearer 20" },
  fuse_other_drop_v: { value: 0.1, unit: "V", note: "a fuse that is not a MINI blade (ANL, 5 x 20 mm): resistance taken as 0.1 V over its rating, and the MINI blade time-current curve used for it" },
  linear_dropout_v: { value: 1.1, unit: "V", note: "dropout of the on-board linear regulator of a controller board (AMS1117 / NCP1117 class at full load)" },
  buck_dropout_v: { value: 1.0, unit: "V", note: "least input minus output a buck module regulates with, where its record's minimum input is not above its output" },
  buck_uvlo_frac: { value: 0.6, unit: "of the output voltage", note: "input under which a buck module stops, where its record gives no minimum below the output" },
  buck_efficiency: { value: 0.85, unit: "", note: "efficiency of a switching regulator whose record has no heat figure to derive it from; the same figure the harness budget assumes" },
  onboard_limit_a: { value: 0.5, unit: "A", note: "current limit of a board's own regulator output where the wiring record declares no rail for it" },
  driver_quiescent_a: { value: 0.01, unit: "A", note: "a motor or servo driver's own supply current (its record's current is what its outputs carry)" },
  bridge_ohm: { value: 0.06, unit: "ohm", note: "on-resistance of a MOSFET H-bridge (both switches) where the catalog gives no voltage drop" },
  idle_frac: { value: 0.1, unit: "of the typical current", note: "an actuator's current when it holds no load, where the catalog has neither an idle nor a no-load current" },
  short_ohm: { value: 0.001, unit: "ohm", note: "resistance of a hard short between a rail and ground" },
  single_voltage_tol: { value: 0.05, unit: "of the nominal voltage", note: "tolerance where a record gives one supply voltage instead of a range" },
  lipo_ohm_ah: { value: 0.015, unit: "ohm Ah per cell", note: "LiPo internal resistance per cell = 0.015 / capacity in Ah (7 milliohm for 2200 mAh, 3 milliohm for 5000 mAh); packs differ by a factor of two and it rises when cold or aged" },
  li_ion_ohm_ah: { value: 0.0475, unit: "ohm Ah per cell", note: "cylindrical Li-ion internal resistance per cell = 0.0475 / capacity in Ah: 19 milliohm for a 2500 mAh cell, the DC-IR Samsung gives for the INR18650-25R; holder springs add to it and are not included" },
  nimh_ohm_ah: { value: 0.05, unit: "ohm Ah per cell", note: "NiMH internal resistance per cell = 0.05 / capacity in Ah (25 milliohm for a 2000 mAh AA)" },
  alkaline_ohm: { value: 0.15, unit: "ohm per cell", note: "alkaline AA internal resistance when fresh; it rises several times as the cell empties" },
} as const;
export type EstimateId = keyof typeof ESTIMATES;

export type Chemistry = "lipo" | "li_ion" | "nimh" | "alkaline";
/**
 * Open-circuit voltage of one cell at rest against state of charge, 0 to 1 in tenths. Typical published curves, not
 * measured on the catalog's packs: always listed as an assumption.
 */
export const OCV_CELL: Record<Chemistry, number[]> = {
  lipo: [3.27, 3.69, 3.73, 3.77, 3.8, 3.84, 3.87, 3.95, 4.02, 4.11, 4.2],
  li_ion: [3.0, 3.45, 3.55, 3.62, 3.68, 3.75, 3.84, 3.93, 4.02, 4.1, 4.2],
  nimh: [1.0, 1.18, 1.21, 1.23, 1.24, 1.25, 1.26, 1.27, 1.29, 1.33, 1.4],
  alkaline: [1.0, 1.1, 1.15, 1.19, 1.23, 1.27, 1.31, 1.36, 1.42, 1.5, 1.6],
};
/** Open-circuit voltage of one cell at a state of charge (linear between the table's tenths). */
export function ocvCell(chem: Chemistry, soc: number): number {
  const t = OCV_CELL[chem], s = Math.min(1, Math.max(0, soc)) * 10, k = Math.min(9, Math.floor(s));
  return t[k] + (t[k + 1] - t[k]) * (s - k);
}
/** State of charge at which a cell rests at `volts` (the inverse of ocvCell, clamped to 0..1). */
export function socOfCell(chem: Chemistry, volts: number): number {
  const t = OCV_CELL[chem];
  if (volts <= t[0]) return 0;
  for (let k = 0; k < 10; k++) if (volts <= t[k + 1]) return (k + (volts - t[k]) / (t[k + 1] - t[k])) / 10;
  return 1;
}
/** Chemistry from a pack's catalog key and name, else from its nominal voltage per cell. */
export function chemistryOf(key: string, name: string, voltsPerCell: number): Chemistry {
  const s = `${key} ${name}`.toLowerCase();
  if (/li-?po|lipo/.test(s)) return "lipo";
  if (/18650|21700|li-?ion/.test(s)) return "li_ion";
  if (/ni-?mh/.test(s)) return "nimh";
  if (/alkaline/.test(s)) return "alkaline";
  return voltsPerCell > 2.5 ? "li_ion" : voltsPerCell > 1.35 ? "alkaline" : "nimh";
}
/** Internal resistance of one cell, from the estimates above. */
export function cellOhm(chem: Chemistry, capacityAh: number): { ohm: number; id: EstimateId } {
  if (chem === "alkaline") return { ohm: ESTIMATES.alkaline_ohm.value, id: "alkaline_ohm" };
  const id = chem === "lipo" ? "lipo_ohm_ah" : chem === "li_ion" ? "li_ion_ohm_ah" : "nimh_ohm_ah";
  return { ohm: ESTIMATES[id].value / capacityAh, id };
}
