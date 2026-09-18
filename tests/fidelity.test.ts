import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCollision, generateInertial, generateGeometry, generateLimits, generateXacro } from "@ttr/urdf-generator";
import { meshGeometry } from "@ttr/mesh";
import { generateCadFiles } from "@ttr/cad";
import { inertiaOf } from "@ttr/kinematics";
import { pose, type Link } from "@ttr/robot-schema";
import { nDofArm } from "@ttr/robot-templates";

const meshLink = (): Link => ({name: "mounted_disc", mass: 1, geometry: meshGeometry("disc", "different_recipe_filename.stl", {depth: 0.02}, [2, 2, 2]), origin: pose([1, 2, 3], [0, Math.PI/2, 0])});
const xyz = (xml: string) => xml.match(/xyz="([^"]+)"/)![1].split(" ").map(Number);
const close = (a: number[], b: number[]) => a.forEach((x, i) => assert.ok(Math.abs(x-b[i]) < 1e-6, `${a} != ${b}`));

test("rotated mesh collision and mass centre use geometry-local offsets", () => {
  const l = meshLink();
  assert.equal(l.geometry.type, "mesh");
  if (l.geometry.type !== "mesh") return;
  const {min, max} = l.geometry.bbox;
  close(xyz(generateCollision(l)), [1+(min[2]+max[2])/2, 2+(min[1]+max[1])/2, 3-(min[0]+max[0])/2]);
  const c = l.geometry.centroid!;
  close(xyz(generateInertial(l)), [1+c[2], 2+c[1], 3-c[0]]);
  assert.ok(!generateGeometry(l.geometry).includes("scale="), "STL recipe scale must not be applied twice");
});

test("CAD mesh imports resolve per-link filenames and do not repeat the baked origin", () => {
  const spec = nDofArm(2); spec.links = [meshLink()]; spec.joints = []; spec.root = "mounted_disc";
  const files = generateCadFiles(spec);
  const assembly = String(files[`cad/${spec.robot_name}.scad`]);
  const part = String(files["cad/parts/mounted_disc.scad"]);
  assert.ok(files["cad/stl/parts/mounted_disc.stl"]);
  assert.ok(assembly.includes('import("stl/parts/mounted_disc.stl")'));
  assert.ok(part.includes('import("../stl/parts/mounted_disc.stl")'));
  assert.ok(!part.includes("multmatrix"));
  const module = assembly.split("module part_mounted_disc()")[1].split("}")[0];
  assert.ok(!module.includes("multmatrix"));
});

test("continuous joints retain their hardware effort and speed limits", () => {
  const j = nDofArm(2).joints[0];
  j.type = "continuous"; j.limit = {effort: 2.5, velocity: 1.2};
  const xml = generateLimits(j);
  assert.ok(xml.includes('effort="2.5"') && xml.includes('velocity="1.2"'));
  assert.ok(!xml.includes("lower=") && !xml.includes("upper="));
});

test("Xacro preserves explicit inertia and its orientation", () => {
  const spec = nDofArm(2); const l = meshLink();
  l.inertia = {ixx: 0.01, iyy: 0.02, izz: 0.025, ixy: 0.001, ixz: 0, iyz: 0};
  spec.links = [l]; spec.joints = [];
  assert.ok(generateXacro(spec).replace(/\s+/g, " ").includes(generateInertial(l).replace(/\s+/g, " ")));
});

test("zero-length capsule inertia approaches a solid sphere", () => {
  const capsule = inertiaOf({type: "capsule", radius: 0.2, length: 0}, 3);
  const sphere = inertiaOf({type: "sphere", radius: 0.2}, 3);
  close([capsule.ixx, capsule.iyy, capsule.izz], [sphere.ixx, sphere.iyy, sphere.izz]);
});
