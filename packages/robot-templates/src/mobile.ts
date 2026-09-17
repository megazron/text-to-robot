import type { RobotSpecification } from "@ttr/robot-schema";
import { MOBILE, emptySpec, pose } from "@ttr/robot-schema";
import { box, cyl, sph, link, joint, DEFAULT_MATERIALS } from "./builder.ts";

function chassis(spec: RobotSpecification) {
  const [cx, cy, cz] = MOBILE.chassis;
  spec.links.push(link("base_link", box(cx, cy, cz), { material: "base_mat", role: "base", origin: pose([0, 0, cz / 2 + MOBILE.wheel_radius]) }));
  return { cx, cy, cz };
}

function wheel(spec: RobotSpecification, name: string, x: number, y: number, drive: boolean) {
  spec.links.push(link(name, cyl(MOBILE.wheel_radius, MOBILE.wheel_width), { material: "wheel_mat", role: "wheel", origin: pose([0, 0, 0], [Math.PI / 2, 0, 0]) }));
  spec.joints.push(joint(`${name}_joint`, drive ? "continuous" : "fixed", "base_link", name, { origin: pose([x, y, MOBILE.wheel_radius]), axis: [0, 1, 0] }));
}

export function diffDrive(name = "diff_drive_robot", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS];
  const { cx, cy } = chassis(spec);
  wheel(spec, "left_wheel", 0, cy / 2 + MOBILE.wheel_width / 2, true);
  wheel(spec, "right_wheel", 0, -(cy / 2 + MOBILE.wheel_width / 2), true);
  spec.links.push(link("caster", sph(MOBILE.wheel_radius * 0.6), { material: "wheel_mat", role: "wheel", origin: pose() }));
  spec.joints.push(joint("caster_joint", "fixed", "base_link", "caster", { origin: pose([cx / 2 - 0.05, 0, MOBILE.wheel_radius * 0.6]) }));
  spec.metadata.notes.push("Generated differential-drive base from template.");
  return spec;
}

function fourWheels(spec: RobotSpecification, drive: boolean) {
  const { cx, cy } = chassis(spec);
  const xs = [cx / 2 - 0.06, -(cx / 2 - 0.06)];
  const ys = [cy / 2 + MOBILE.wheel_width / 2, -(cy / 2 + MOBILE.wheel_width / 2)];
  const labels = [["front_left", "front_right"], ["rear_left", "rear_right"]];
  xs.forEach((x, i) => ys.forEach((y, j) => wheel(spec, `${labels[i][j]}_wheel`, x, y, drive)));
}

export function fourWheel(name = "four_wheel_robot", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS];
  fourWheels(spec, true);
  spec.metadata.notes.push("Generated four-wheel base from template.");
  return spec;
}

export function mecanum(name = "mecanum_robot", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS];
  fourWheels(spec, true);
  spec.metadata.notes.push("Generated mecanum base (4 holonomic wheels) from template. Roller geometry approximated by cylinders.");
  return spec;
}
