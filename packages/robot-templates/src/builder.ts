// Terse, typed helpers for constructing template specs.
import type { Link, Joint, Geometry, Pose, Vec3, JointType, Material } from "@ttr/robot-schema";
import { DENSITY, LIMITS, DYNAMICS, pose } from "@ttr/robot-schema";
import { massFromDensity } from "@ttr/kinematics";

export const box = (x: number, y: number, z: number): Geometry => ({ type: "box", size: [x, y, z] });
export const cyl = (radius: number, length: number): Geometry => ({ type: "cylinder", radius, length });
export const sph = (radius: number): Geometry => ({ type: "sphere", radius });

export interface LinkOpts { mass?: number; material?: string; role?: string; origin?: Pose; density?: number; }

export function link(name: string, geometry: Geometry, opts: LinkOpts = {}): Link {
  const density = opts.density ?? DENSITY.structure;
  const mass = opts.mass ?? Math.max(0.02, massFromDensity(geometry, density));
  return {
    name, geometry, mass,
    material: opts.material,
    role: opts.role,
    origin: opts.origin ?? pose(),
    inferred: [opts.mass === undefined ? "mass" : "", "inertia"].filter(Boolean),
  };
}

export interface JointOpts {
  origin?: Pose; axis?: Vec3;
  lower?: number; upper?: number; effort?: number; velocity?: number;
  damping?: number; friction?: number;
}

export function joint(name: string, type: JointType, parent: string, child: string, opts: JointOpts = {}): Joint {
  const j: Joint = {
    name, type, parent, child,
    origin: opts.origin ?? pose(),
    axis: opts.axis ?? [0, 0, 1],
    dynamics: { damping: opts.damping ?? DYNAMICS.damping, friction: opts.friction ?? DYNAMICS.friction },
    inferred: ["limit", "dynamics"],
  };
  if (type === "revolute" || type === "prismatic") {
    const base = type === "revolute" ? LIMITS.revolute : LIMITS.prismatic;
    j.limit = {
      lower: opts.lower ?? base.lower,
      upper: opts.upper ?? base.upper,
      effort: opts.effort ?? base.effort,
      velocity: opts.velocity ?? base.velocity,
    };
  }
  return j;
}

export const DEFAULT_MATERIALS: Material[] = [
  { name: "base_mat", color: [0.25, 0.25, 0.28, 1] },
  { name: "link_mat", color: [0.85, 0.85, 0.88, 1] },
  { name: "gripper_mat", color: [0.15, 0.35, 0.75, 1] },
  { name: "wheel_mat", color: [0.1, 0.1, 0.12, 1] },
  { name: "sensor_mat", color: [0.1, 0.7, 0.4, 1] },
  { name: "accent_mat", color: [0.9, 0.55, 0.1, 1] },
];
