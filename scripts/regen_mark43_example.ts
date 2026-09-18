// Regenerates examples/14_iron_man_mark_43 (robot.json, both URDFs, binary STL meshes, BOM). Run from the repo root:
//   node scripts/regen_mark43_example.ts
// then: cd python && python -m ttr_mujoco test ../examples/14_iron_man_mark_43/robot.sim.urdf --wearer --json ../examples/14_iron_man_mark_43/mujoco_report_wearer.json
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { generateRobot, collectMeshFiles, DemoProvider } from "@ttr/robot-generator";
import { generateUrdf } from "@ttr/urdf-generator";
import { buildBom, bomToMarkdown } from "@ttr/components";
const prompt = "Build me a movie-accurate wearable Iron Man Mark 43 suit from Age of Ultron with all the small polygon armour plates that open and close, repulsors, a HUD and an IMU. Budget $60000";
const dir = "examples/14_iron_man_mark_43";
// Preserve hardware manifests and CAD work; invalidate only generated model reports.
rmSync(dir+"/meshes", { recursive: true, force: true }); mkdirSync(dir + "/meshes", { recursive: true });
for(const file of ["mujoco_report.json","mujoco_report_wearer.json","clearance_report.json","mesh_quality_report.json","collision_report.json","robot.convex.zip","iron_man_mark_43.mjcf.xml","iron_man_mark_43_with_wearer.mjcf.xml"])
  rmSync(`${dir}/${file}`,{force:true});
const res = await generateRobot(prompt,{provider:new DemoProvider()});
console.log(res.robot.robot_name, res.validation.valid, res.urdfValidation.valid, res.robot.links.length, "links", res.warnings);
writeFileSync(dir + "/prompt.txt", prompt + "\n");
writeFileSync(dir + "/robot.json", JSON.stringify(res.robot, null, 2));
writeFileSync(dir + "/robot.urdf", generateUrdf(res.robot));
writeFileSync(dir + "/robot.sim.urdf", generateUrdf(res.robot, { meshPrefix: "meshes/" }));
const meshes = collectMeshFiles(res.robot); let bytes = 0;
for (const [f, b] of Object.entries(meshes)) { writeFileSync(`${dir}/meshes/${f}`, b); bytes += b.length; }
writeFileSync(dir + "/BOM.md", bomToMarkdown(buildBom(res.robot, 60000)));
console.log(Object.keys(meshes).length, "meshes", (bytes / 1e6).toFixed(2), "MB", "bom $", res.bom.total);
