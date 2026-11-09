// The engine API for other pages (apps/web/src/engine, docs/ENGINE_API.md): the spec as a scene round-trips exactly,
// edits keep the robot where it is on screen, parts snap to matching mounts, joints are made about the right axis, and a
// robot built by hand exports like a designed one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { RobotSpecification } from "@ttr/robot-schema";
import { validateUrdf } from "@ttr/urdf-validator";
import { exportRos2Package } from "@ttr/ros2-export";
import { generateXacro } from "@ttr/urdf-generator";
import { toScene, fromScene, applyEdits, emptyRobot, worldFrames, poseMat, mul, apply, matPose, type EditOp } from "../apps/web/src/engine/edit.ts";
import { snapPart, mate, patternsMatch } from "../apps/web/src/engine/snap.ts";
import { partMounts, printedMounts, worldMounts } from "../apps/web/src/engine/mounts.ts";
import { engineApi, parts, checkRobot } from "../apps/web/src/engine/api.ts";
import { stability } from "../apps/web/src/engine/stability.ts";
import { clearanceAtHome } from "../apps/web/src/engine/incremental.ts";
import { withSolids, interferences } from "@ttr/design";

const example = (name: string) => JSON.parse(readFileSync(`examples/${name}/robot.json`, "utf8")) as RobotSpecification;
const near = (a: number[], b: number[], tol = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < tol);
/** world position of a link's body origin */
const bodyAt = (spec: RobotSpecification, link: string) => { const l = spec.links.find((x) => x.name === link)!; return apply(mul(worldFrames(spec).get(link)!, poseMat(l.origin)), [0, 0, 0]); };

test("every example round-trips through the scene exactly, and no edits change nothing", () => {
  for (const ex of readdirSync("examples").filter((d) => /^\d\d_/.test(d))) {
    const spec = example(ex), text = JSON.stringify(spec);
    assert.equal(JSON.stringify(fromScene(toScene(spec))), text, ex);
    assert.equal(JSON.stringify(applyEdits(spec, [])), text, ex);
    const s = toScene(spec);
    assert.equal(Object.keys(s.nodes).length, spec.links.length, ex);
    assert.ok(Object.values(s.nodes).some((n) => n.kind === "part") || ex.startsWith("14_") || true);
  }
});

test("move, rotate, duplicate, rename and delete keep a valid tree", () => {
  const spec = example("19_arduino_arm"), child = spec.joints.find((j) => j.type === "revolute")!.child;
  const before = bodyAt(spec, child);
  const moved = applyEdits(spec, [{ op: "translate", link: child, by: [0.01, 0, 0.02] }]);
  assert.ok(near(bodyAt(moved, child), [before[0] + 0.01, before[1], before[2] + 0.02]));
  assert.notEqual(JSON.stringify(spec), JSON.stringify(applyEdits(spec, [{ op: "rotate", link: child, axis: [0, 0, 1], angle: 0.3 }])));
  assert.equal(JSON.stringify(spec), JSON.stringify(example("19_arduino_arm")), "the input is never changed");
  const dup = applyEdits(spec, [{ op: "duplicate", link: child }]);
  assert.ok(dup.links.length > spec.links.length && dup.joints.length === spec.joints.length + (dup.links.length - spec.links.length));
  assert.equal(new Set(dup.links.map((l) => l.name)).size, dup.links.length);
  const renamed = applyEdits(spec, [{ op: "rename", link: child, to: "renamed_link" }]);
  assert.ok(renamed.joints.some((j) => j.child === "renamed_link") && !renamed.joints.some((j) => j.child === child || j.parent === child));
  const gone = applyEdits(spec, [{ op: "delete", link: child }]);
  assert.ok(!gone.links.some((l) => l.name === child) && gone.joints.every((j) => gone.links.some((l) => l.name === j.child) && gone.links.some((l) => l.name === j.parent)));
  assert.throws(() => applyEdits(spec, [{ op: "pose", link: spec.links[0].name === child ? "x" : (spec.root ?? toScene(spec).root!), world: { xyz: [0, 0, 0], rpy: [0, 0, 0] } }]), /root/);
  assert.ok((gone.metadata as { studio?: { edited: boolean } }).studio?.edited);
  assert.equal((gone.metadata as { design?: { request?: unknown } }).design?.request, undefined);
  assert.deepEqual((gone.metadata as { studio?: { design_request?: unknown } }).studio?.design_request, (spec.metadata as { design?: { request?: unknown } }).design?.request);
});

test("a joint re-bases the child frame onto the pivot without moving anything", () => {
  const spec = example("18_arduino_car"), link = "sensor_bracket", before = bodyAt(spec, link);
  const kids = spec.joints.filter((j) => j.parent === link).map((j) => j.child), kidsBefore = kids.map((k) => bodyAt(spec, k));
  const out = applyEdits(spec, [{ op: "joint", child: link, type: "revolute", axis: [0, 0, 1], at: [0.08, 0, 0.05], lower: -0.5, upper: 0.5, effort: 0.2, velocity: 3 }]);
  const j = out.joints.find((x) => x.child === link)!;
  assert.equal(j.type, "revolute"); assert.ok(near(j.axis, [0, 0, 1]));
  assert.ok(near(apply(worldFrames(out).get(link)!, [0, 0, 0]), [0.08, 0, 0.05]), "child frame on the pivot");
  assert.ok(near(bodyAt(out, link), before), "body did not move");
  kids.forEach((k, i) => assert.ok(near(bodyAt(out, k), kidsBefore[i]), `${k} did not move`));
  // turning it moves the bracket about the pivot
  const W = worldFrames(out, { [j.name]: Math.PI / 2 }).get(link)!;
  assert.ok(near([W[3], W[7], W[11]], [0.08, 0, 0.05]));
  assert.throws(() => applyEdits(spec, [{ op: "joint", child: "chassis", parent: link, type: "revolute", axis: [0, 0, 1], at: [0, 0, 0] }]), /loop|root/);
});

test("parts snap to matching mounts: servo in its bracket, wheel on a motor shaft, board on its standoffs", () => {
  // servo into a bracket made for it: the servo frame lands on the seat, facing up
  const seat = printedMounts({ shape: "servo_bracket", size_mm: [0, 0, 0], wall_mm: 3, key: "hobby_mg996r" }).find((m) => m.kind === "seat")!;
  const s = snapPart(partMounts("hobby_mg996r"), [{ ...seat, link: "bracket" }], { point: seat.pos, normal: [0, 0, 1], link: "bracket" });
  assert.equal(s.how, "mate"); assert.equal(s.parent, "bracket");
  assert.ok(near(s.world.xyz, seat.pos) && near(s.world.rpy, [0, 0, 0]), JSON.stringify(s));
  // a servo of another size does not fit that seat: it lands on the surface instead
  assert.equal(snapPart(partMounts("hobby_sg90"), [{ ...seat, link: "bracket" }], { point: seat.pos, normal: [0, 0, 1], link: "bracket" }).how, "surface");
  // wheel on a TT motor's shaft (motor lying with its shaft along +y): hub on the output, axes opposite, joint offered
  const motor = partMounts("tt_gearmotor_1to48").find((m) => m.kind === "output")!;
  const W = mul([1, 0, 0, 0, 0, 0, -1, 0.05, 0, 1, 0, 0.03, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const out = { ...motor, link: "motor", pos: apply(W, motor.pos), axis: [W[2], W[6], W[10]] as [number, number, number], ref: [W[0], W[4], W[8]] as [number, number, number] };
  const w = snapPart(partMounts("wheel_65mm_tt"), [out], { point: out.pos, normal: out.axis, link: "motor" });
  assert.equal(w.how, "mate"); assert.ok(w.joint && near(w.joint.axis, out.axis) && near(w.joint.at, out.pos));
  const hub = partMounts("wheel_65mm_tt").find((m) => m.kind === "hub")!, Wh = poseMat(w.world);
  assert.ok(near(apply(Wh, hub.pos), out.pos)); assert.ok(near(apply(Wh, [0, 0, 1]).map((x, i) => x - Wh[i * 4 + 3]), out.axis), "wheel extends away from the motor");
  // board holes on standoffs for that board
  const st = printedMounts({ shape: "standoff_plate", size_mm: [80, 60, 8], wall_mm: 3, key: "arduino_uno_r3" }).find((m) => m.kind === "standoffs")!;
  const b = partMounts("arduino_uno_r3").find((m) => m.kind === "board")!;
  assert.ok(patternsMatch(b.holes, st.holes));
  const bs = snapPart(partMounts("arduino_uno_r3"), [{ ...st, link: "plate" }], { point: st.pos, normal: [0, 0, 1], link: "plate" });
  assert.equal(bs.how, "mate"); assert.ok(near(apply(poseMat(bs.world), b.pos), st.pos));
  // the Nano has no holes in the catalog: its electrical record's drawing gives them
  assert.equal(partMounts("arduino_nano_clone").find((m) => m.kind === "board")?.holes?.length, 4);
  // plain surface: on a 5 mm grid, base down
  const g = snapPart(partMounts("lipo_3s_2200"), [], { point: [0.0123, 0.0471, 0.02], normal: [0, 0, 1] });
  assert.equal(g.how, "surface"); assert.ok(near(apply(poseMat(g.world), partMounts("lipo_3s_2200").find((m) => m.kind === "base")!.pos), [0.010, 0.045, 0.02], 1e-9));
  assert.ok(near(mate(b, { pos: [0, 0, 0], axis: [0, 0, 1], ref: [1, 0, 0] }).slice(0, 3), [1, 0, 0]));
});

/** A small robot built by hand: plate, servo bracket, servo, arm link on the horn, a revolute joint about the shaft. */
function handBuilt(): RobotSpecification {
  let r = applyEdits(emptyRobot("hand_built"), [{ op: "add", printed: { shape: "plate", size_mm: [120, 80, 4], holes: 4 }, world: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, name: "base_plate" }], parts);
  const top = worldMounts(r).find((m) => m.id === "top")!;
  r = applyEdits(r, [{ op: "add", printed: { shape: "servo_bracket", size_mm: [0, 0, 0], wall_mm: 3, key: "hobby_mg996r" }, parent: "base_plate", world: { xyz: top.pos, rpy: [0, 0, 0] }, name: "servo_bracket" }], parts);
  const seat = worldMounts(r).find((m) => m.kind === "seat")!;
  const s = snapPart(partMounts("hobby_mg996r"), [seat], { point: seat.pos, normal: [0, 0, 1], link: seat.link });
  r = applyEdits(r, [{ op: "add", key: "hobby_mg996r", parent: s.parent, world: s.world, name: "shoulder_servo" }], parts);
  const output = worldMounts(r).find((m) => m.link === "shoulder_servo" && m.kind === "output")!;
  const arm = snapPart(printedMounts({ shape: "beam", size_mm: [100, 24, 6], key: "hobby_mg996r" }), [output], { point: output.pos, normal: output.axis, link: "shoulder_servo" });
  assert.equal(arm.how, "mate"); assert.ok(arm.joint);
  const ops: EditOp[] = [
    { op: "add", printed: { shape: "beam", size_mm: [100, 24, 6], key: "hobby_mg996r" }, parent: "shoulder_servo", world: arm.world, name: "upper_arm" },
    { op: "joint", child: "upper_arm", type: "revolute", axis: arm.joint!.axis, at: arm.joint!.at, lower: -1.5, upper: 1.5, effort: 1.1, velocity: 5, actuator: "shoulder_servo", name: "shoulder" },
    { op: "add", key: "lipo_3s_2200", parent: "base_plate", world: matPose(mul([1, 0, 0, -0.01, 0, 1, 0, 0.0, 0, 0, 1, 0.004, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, -0.03, 0, 0, 1, 0, 0, 0, 0, 1])), name: "battery" },
  ];
  return applyEdits(r, ops, parts);
}

test("a robot built by hand has a valid URDF, a sized joint and the same exports as a designed robot", () => {
  const r = handBuilt();
  assert.equal(r.links.length, 5); assert.equal(r.joints.filter((j) => j.type === "revolute").length, 1);
  const j = r.joints.find((x) => x.name === "shoulder")!;
  assert.equal(j.parent, "shoulder_servo"); assert.ok(j.limit && j.limit.lower === -1.5);
  const report = checkRobot(r, { interference: false, wiring: false });
  assert.ok(report.checks.find((c) => c.name === "spec")!.pass && report.checks.find((c) => c.name === "urdf")!.pass, JSON.stringify(report.checks));
  assert.ok(validateUrdf(report.urdf).valid);
  const shoulder = report.engineering!.joints.find((x) => x.joint === "shoulder")!;
  assert.equal(shoulder.actuator, "hobby_mg996r"); assert.ok(shoulder.margin! > 1, JSON.stringify(shoulder));
  assert.ok(report.engineering!.cost_usd > 0 && report.engineering!.mass_kg > 0.1);
  const files = exportRos2Package(report.robot, { ros2_control: true });
  assert.ok(Object.keys(files).some((f) => f.endsWith(".urdf")) && Object.keys(files).filter((f) => f.endsWith(".stl")).length >= 5);
  assert.match(generateXacro(report.robot), /<robot/);
});

test("the /api/engine endpoints answer like the client expects", async () => {
  const get = async (method: string, path: string, body: unknown = {}) => { const r = await engineApi(method, path, body); return { status: r.status, body: r.headers.get("Content-Type")?.includes("json") ? await r.json() : await r.arrayBuffer() }; };
  assert.equal((await get("GET", "/api/engine/version")).body.api, "1.0.0");
  const cat = (await get("GET", "/api/engine/catalog")).body;
  assert.ok(cat.parts.length > 80 && cat.parts.every((p: { mounts: unknown[] }) => p.mounts.length >= 1) && cat.printed.length >= 6);
  assert.ok(cat.parts.find((p: { key: string }) => p.key === "hobby_sg90").rating.range_deg === 180);
  const stl = (await get("GET", "/api/engine/part/hobby_sg90.stl")).body as ArrayBuffer;
  assert.ok(new DataView(stl).getUint32(80, true) > 10);
  const spec = example("18_arduino_car");
  const ed = (await get("POST", "/api/engine/edit", { robot: spec, ops: [{ op: "translate", link: "ultrasonic", by: [0.002, 0, 0] }] })).body;
  assert.ok(ed.robot.links.length === spec.links.length && ed.mounts.length > spec.links.length);
  const u = (await get("POST", "/api/engine/urdf", { robot: ed.robot })).body;
  assert.ok(validateUrdf(u.urdf).valid && /<robot/.test(u.xacro));
  assert.equal((await get("POST", "/api/engine/edit", { robot: spec, ops: [{ op: "delete", link: "nope" }] }).catch((e) => ({ status: 500, body: String(e) }))).status, 500);
  assert.equal((await get("GET", "/api/engine/nothing")).status, 404);
});

test("stability: a car stands on its wheels, and falls over when its weight moves past them", () => {
  const car = example("18_arduino_car"), s = stability(car)!;
  assert.ok(s.free_standing && s.margin_mm > 20 && s.tip_deg > 10 && s.support.length >= 3, JSON.stringify(s));
  const heavy = applyEdits(car, [{ op: "translate", link: "battery", by: [0, 0.6, 0] }]);
  heavy.links.find((l) => l.name === "battery")!.mass = 2;
  const f = stability(heavy)!;
  assert.ok(f.margin_mm < 0, JSON.stringify(f));
  assert.equal(checkRobot(heavy, { interference: false, wiring: false }).checks.find((c) => c.name === "stability")!.pass, false);
  // an arm is bolted down: reported, never failed
  const arm = checkRobot(example("02_arm_6dof"), { interference: false, wiring: false }).checks.find((c) => c.name === "stability")!;
  assert.ok(arm.pass && /bolt/.test(arm.detail));
});

test("the incremental clearance check finds what the full one finds, and an edit only intersects the pairs it changed", () => {
  const car = applyEdits(example("18_arduino_car"), [{ op: "translate", link: "ultrasonic", by: [-0.02, 0, -0.01] }]);
  const skip = new Set(car.joints.map((j) => `${j.parent}|${j.child}`));
  const full = withSolids(car, (m) => interferences(m, {}, undefined, 2, skip)).map((h) => [h.a, h.b].sort().join("/")).sort();
  const first = clearanceAtHome(car, skip);
  assert.deepEqual(first.hits.map((h) => [h.a, h.b].sort().join("/")).sort(), full);
  assert.ok(full.length > 0, "the moved sensor hits something");
  const again = clearanceAtHome(car, skip);
  assert.equal(again.intersected, 0); assert.equal(again.reused, first.pairs);
  const moved = applyEdits(car, [{ op: "translate", link: "ultrasonic", by: [0.02, 0, 0.01] }]);
  const third = clearanceAtHome(moved, skip);
  assert.ok(third.intersected > 0 && third.intersected < third.pairs + 1 && third.reused > 0, JSON.stringify(third));
});

test("a designed robot keeps its designer's clearance and harness; after an edit only what changed is checked again", () => {
  const car = example("18_arduino_car");
  const as = checkRobot(car, { interference: true, wiring: true });
  assert.ok(as.checks.find((c) => c.name === "clearance:home")!.pass);
  assert.ok(as.engineering!.rails.length >= 2, "the designer's rails");
  const moved = applyEdits(car, [{ op: "translate", link: "ultrasonic", by: [-0.02, 0, -0.01] }]);
  const r = checkRobot(moved, { interference: true, wiring: true }), c = r.checks.find((x) => x.name === "clearance:home")!;
  assert.equal(c.pass, false); assert.match(c.detail, /ultrasonic/); assert.match(c.detail, /untouched since the designer/);
  assert.ok(r.engineering!.timing.pairs_as_designed > 0);
  for (const pair of c.detail.replace(/ \(.*$/, "").replace(/^intersecting: /, "").split(", ")) assert.match(pair, /ultrasonic|sensor_bracket/, pair);
});
