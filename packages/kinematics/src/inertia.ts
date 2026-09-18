// Analytic inertia tensors about a body's centre of mass, from geometry + mass.
import type { Geometry, Inertia } from "@ttr/robot-schema";

export function inertiaOf(g: Geometry, mass: number): Inertia {
  const zero = { ixy: 0, ixz: 0, iyz: 0 };
  switch (g.type) {
    case "box": {
      const [x, y, z] = g.size;
      return { ixx: (mass / 12) * (y * y + z * z), iyy: (mass / 12) * (x * x + z * z), izz: (mass / 12) * (x * x + y * y), ...zero };
    }
    case "cylinder": {
      const r = g.radius, h = g.length; // axis along local Z
      const ir = (mass / 12) * (3 * r * r + h * h);
      return { ixx: ir, iyy: ir, izz: 0.5 * mass * r * r, ...zero };
    }
    case "sphere": {
      const i = (2 / 5) * mass * g.radius * g.radius;
      return { ixx: i, iyy: i, izz: i, ...zero };
    }
    case "mesh": {
      const k = mass / Math.max(g.volume, 1e-12);
      const I = g.inertia_unit; return { ixx: I.ixx * k, iyy: I.iyy * k, izz: I.izz * k, ixy: I.ixy * k, ixz: I.ixz * k, iyz: I.iyz * k };
    }
    case "capsule": {
      // cylinder + two hemispheres, mass split by volume, axis along Z
      const r = g.radius, h = g.length;
      const vCyl = Math.PI * r * r * h;
      const vSph = (4 / 3) * Math.PI * r * r * r;
      const total = vCyl + vSph;
      const mc = mass * (vCyl / total);
      const ms = mass * (vSph / total);
      const ixxCyl = (mc / 12) * (3 * r * r + h * h);
      const izzCyl = 0.5 * mc * r * r;
      // hemispheres: treat as sphere shifted by h/2 (parallel-axis)
      const iSph = (2 / 5) * ms * r * r;
      const d = h / 2 + (3 / 8) * r;
      const ixxSph = iSph - ms * (3 * r / 8) ** 2 + ms * d * d;
      return { ixx: ixxCyl + ixxSph, iyy: ixxCyl + ixxSph, izz: izzCyl + iSph, ...zero };
    }
  }
}

export function volumeOf(g: Geometry): number {
  switch (g.type) {
    case "box": return g.size[0] * g.size[1] * g.size[2];
    case "cylinder": return Math.PI * g.radius * g.radius * g.length;
    case "sphere": return (4 / 3) * Math.PI * g.radius ** 3;
    case "capsule": return Math.PI * g.radius * g.radius * g.length + (4 / 3) * Math.PI * g.radius ** 3;
    case "mesh": return g.volume;
  }
}

/** mass from geometry and density (kg/m^3) */
export const massFromDensity = (g: Geometry, density: number): number => volumeOf(g) * density;
