// Task tools a body plan can carry (pump and hose, brush, camera mast...): the words that ask for them, and what each
// one is. The tool modules themselves are designed in @ttr/design (tool-modules.ts); a tool that no module exists for
// yet, or that the chosen robot has no place for, is reported with the result, never dropped.
export type ToolKind = "water_tank" | "pump_hose" | "spray_nozzle" | "brush" | "scoop" | "camera_mast" | "tray" | "vacuum" | "led_panel" | "speaker" | "pen" | "mower_blade";

export const TOOL_LABEL: Record<ToolKind, string> = {
  water_tank: "water tank", pump_hose: "pump with hose and nozzle", spray_nozzle: "spray nozzle", brush: "rotating brush", scoop: "scoop",
  camera_mast: "pan-tilt camera mast", tray: "cargo tray", vacuum: "suction fan", led_panel: "LED light panel", speaker: "speaker", pen: "pen holder", mower_blade: "guarded cutting disc",
};

/** Tool words in a prompt ("with a spray nozzle", "a brush"). Grippers and suction cups are end effectors, read elsewhere. */
export const TOOL_WORDS: [RegExp, ToolKind][] = [
  [/\b(?:water\s+(?:tank|reservoir|bottle|container)|reservoir)\b/, "water_tank"],
  [/\b(?:pump|hose|watering\s+(?:can|nozzle))\b/, "pump_hose"],
  [/\bspray(?:er|ing)?\b(?!\s+paint\s+gun)|\bmist(?:er|ing)?\b|\bnozzle\b/, "spray_nozzle"],
  [/\b(?:brush(?:es)?|scrubber|squeegee|sweeper|duster)\b/, "brush"],
  [/\b(?:scoop|shovel|spoon|ladle|bucket|plough|plow|blade\s+for\s+snow)\b/, "scoop"],
  [/\b(?:camera\s+(?:mast|tower|pole|on\s+a\s+(?:mast|pole|stick))|pan[\s-]?(?:and[\s-]?)?tilt|periscope|gimbal)\b/, "camera_mast"],
  [/\b(?:tray|basket|cargo\s+(?:box|bay|bed)|carrier|crate|bin\s+on\s+top|cup\s+holder)\b/, "tray"],
  [/\b(?:suction\s+fan|blower|vacuum\s+(?:fan|motor|cleaner\s+head)|dust\s+bin)\b/, "vacuum"],
  [/\b(?:led\s+(?:panel|matrix|ring|strip|face|eyes)|light\s+panel|headlights?|flashlight|lamp|lights?)\b/, "led_panel"],
  [/\b(?:speakers?|loudspeaker|buzzer|voice|talks?|sound|music)\b/, "speaker"],
  [/\b(?:pen|pencil|marker|chalk|crayon)\b/, "pen"],
  [/\b(?:mower|cutting\s+(?:disc|blade)|grass\s+cutter|trimmer)\b/, "mower_blade"],
];
