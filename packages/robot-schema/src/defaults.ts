// Default dimensions, densities and limits. Everything here is a *sensible
// inferred value*: the generator marks any field it fills from these as
// inferred so the UI can show which numbers the user did not specify.

/** material densities in kg/m^3 (aluminium-ish default for structure) */
export const DENSITY = {
  structure: 2700, // aluminium
  light: 900,      // plastics
  heavy: 7800,     // steel
  printed: 450,    // effective density of a hollow 3D-printed / shelled link
} as const;

/** default palette (RGBA 0..1) */
export const MATERIALS = {
  base: [0.25, 0.25, 0.28, 1] as [number, number, number, number],
  link: [0.85, 0.85, 0.88, 1] as [number, number, number, number],
  joint: [0.9, 0.55, 0.1, 1] as [number, number, number, number],
  gripper: [0.15, 0.35, 0.75, 1] as [number, number, number, number],
  wheel: [0.1, 0.1, 0.12, 1] as [number, number, number, number],
  sensor: [0.1, 0.7, 0.4, 1] as [number, number, number, number],
};

/** default limits by joint kind */
export const LIMITS = {
  revolute: { lower: -Math.PI, upper: Math.PI, effort: 50, velocity: 2.0 },
  prismatic: { lower: 0, upper: 0.2, effort: 80, velocity: 0.5 },
  gripper: { lower: 0, upper: 0.04, effort: 40, velocity: 0.3 },
};

export const DYNAMICS = { damping: 0.1, friction: 0.0 };

/** default sizes (metres) for an "arm link" scale reference */
export const ARM = {
  base_radius: 0.06,
  base_height: 0.12,
  link_radius: 0.04,
  segment_length: 0.25, // default upper-arm / forearm length
  wrist_length: 0.08,
  gripper_palm: [0.06, 0.08, 0.03] as [number, number, number],
  finger: [0.015, 0.02, 0.06] as [number, number, number],
};

export const MOBILE = {
  chassis: [0.4, 0.3, 0.12] as [number, number, number],
  wheel_radius: 0.06,
  wheel_width: 0.04,
};

export const HUMANOID = {
  torso: [0.16, 0.28, 0.36] as [number, number, number],
  head: 0.09, // sphere radius
  arm_segment: 0.22,
  arm_radius: 0.035,
};

export const GRAVITY = 9.80665;
