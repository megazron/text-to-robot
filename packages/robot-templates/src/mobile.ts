import type { RobotSpecification } from "@ttr/robot-schema";
import { MOBILE, emptySpec, pose } from "@ttr/robot-schema";
import { hollowChassis } from "./mechanics.ts";
import { box, cyl, sph, link, joint, DEFAULT_MATERIALS } from "./builder.ts";

function chassis(spec: RobotSpecification) {
  const [cx, cy, cz] = MOBILE.chassis;
  spec.links.push(link("base_link", box(cx, cy, cz), { material: "base_mat", role: "base", origin: pose([0, 0, cz / 2 + MOBILE.wheel_radius]) }));
  hollowChassis(spec);
  return { cx, cy, cz };
}

function wheel(spec: RobotSpecification, name: string, x: number, y: number, drive: boolean) {
  spec.links.push(link(name, cyl(MOBILE.wheel_radius, MOBILE.wheel_width), { material: "wheel_mat", role: "wheel", origin: pose([0, 0, 0], [Math.PI / 2, 0, 0]) }));
  spec.joints.push(joint(`${name}_joint`, drive ? "continuous" : "fixed", "base_link", name, { origin: pose([x, y, MOBILE.wheel_radius]), axis: [0, 1, 0], effort: 2.5, velocity: 12 }));
}

export function diffDrive(name = "diff_drive_robot", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS];
  const { cx, cy } = chassis(spec);
  wheel(spec, "left_wheel", 0, cy / 2 + MOBILE.wheel_width / 2, true);
  wheel(spec, "right_wheel", 0, -(cy / 2 + MOBILE.wheel_width / 2), true);
  spec.links.push(link("caster", sph(MOBILE.wheel_radius * 0.6), { material: "wheel_mat", role: "wheel", origin: pose() }));
  spec.joints.push(joint("caster_joint", "fixed", "base_link", "caster", { origin: pose([cx / 2 - 0.05, 0, MOBILE.wheel_radius * 0.6]) }));
  spec.links.push(link("rear_caster",sph(MOBILE.wheel_radius*.6),{material:"wheel_mat",role:"support",origin:pose()}));
  spec.joints.push(joint("rear_caster_mount","fixed","base_link","rear_caster",{origin:pose([-(cx/2-.05),0,MOBILE.wheel_radius*.6])}));
  spec.metadata.notes.push("Differential drive with front and rear supports to keep the centre of mass inside the support polygon. Casters use spherical sliding-contact approximations, not a swivel-bearing model.");
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
  for(const w of spec.links.filter(l=>l.role==='wheel')){
    w.geometry=cyl(.043,MOBILE.wheel_width);w.mass=.12;w.inertia=undefined;
    const handed=(w.name.startsWith('front_left')||w.name.startsWith('rear_right'))?1:-1;
    for(let k=0;k<8;k++){
      const theta=k*Math.PI/4,axis:[number,number,number]=[Math.cos(theta)/Math.SQRT2,handed/Math.SQRT2,-Math.sin(theta)/Math.SQRT2];
      const name=`${w.name}_roller_${k}`;
      spec.links.push(link(name,cyl(.012,.026),{mass:.012,material:'wheel_mat',role:'roller',
        origin:pose([0,0,0],[0,Math.acos(axis[2]),Math.atan2(axis[1],axis[0])])}));
      const bearing=joint(`${name}_bearing`,'continuous',w.name,name,{origin:pose([.048*Math.sin(theta),0,.048*Math.cos(theta)]),axis,effort:.01,velocity:100,damping:.00001,friction:0});
      bearing.passive=true;spec.joints.push(bearing);
    }
  }
  spec.metadata.notes.push("Mecanum: four driven hubs, eight independent passive rollers per wheel, alternating 45-degree roller handedness in an X arrangement. Roller contact, lateral mobility and load capacity require validation; no hidden lateral force is applied.");
  return spec;
}
