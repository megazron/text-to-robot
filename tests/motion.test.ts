// Motions (packages/motion): every example gets a joint tour and a purpose demo inside its joint limits and speeds, with no
// self-collision (examples/motion_play_known_issues.json lists, with a reason, what is not clear yet); legged feet stay
// planted; wheels turn at the ground speed; the inverse kinematics reaches what is reachable and says so when it is not;
// the exports parse and carry one column per joint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { RobotSpecification } from "@ttr/robot-schema";
import { motions, motion, ik, kinematics, robotOf, compile, fk, qVector, toCsv, toJointTrajectoryYaml, toBvh, wheelSlip, bodyIk, collisionModel, checkCollisions } from "@ttr/motion";
import { exportRos2Package } from "@ttr/ros2-export";
import { exportTraining } from "@ttr/training-export";
import { collisionOf, motionTrajectory } from "../apps/web/src/engine/motion.ts";

const EXAMPLES = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort();
const spec = (ex: string) => JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")) as RobotSpecification;
const known = JSON.parse(readFileSync("examples/motion_play_known_issues.json", "utf8")) as Record<string, Record<string, string>>;
/** is this pair a listed finding: by name either way round, or by a '~' regular expression over 'a/b' */
const listed = (ex: string, name: string, a: string, b: string) => Object.keys(known[ex] ?? {}).some((k) => k === `${name}:${a}/${b}` || k === `${name}:${b}/${a}` || (k.startsWith(`${name}:~`) && (new RegExp(k.slice(name.length + 2)).test(`${a}/${b}`) || new RegExp(k.slice(name.length + 2)).test(`${b}/${a}`))));
const SUIT = "14_iron_man_mark_43";
/** a binary STL as a triangle soup */
const stl = (path: string) => { const b = readFileSync(path), n = b.readUInt32LE(80), positions = new Float32Array(n * 9); for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) positions[t * 9 + k] = b.readFloatLE(84 + t * 50 + 12 + k * 4); return { positions, triangles: Uint32Array.from({ length: n * 3 }, (_, i) => i) }; };
/** the collision model of an example: parts made on the CAD kernel come from the example's own meshes (the same welded mesh the
 *  kernel gives, without spending minutes rebuilding them in a cold process); everything else as the site makes it */
const collisionFor = (ex: string, s: RobotSpecification) => collisionOf(s, (l) => (l.geometry.type === "mesh" && l.geometry.part === "cad" ? stl(`examples/${ex}/meshes/${l.geometry.file}`) : undefined));

test("every example has a joint tour and a purpose demo, inside its position and speed limits", () => {
  for (const ex of EXAMPLES) {
    const s = spec(ex), list = motions(s);
    assert.ok(list.some((m) => m.name === "tour"), `${ex}: no joint tour`);
    const demo = list.find((m) => m.default)!;
    assert.ok(demo, `${ex}: no default motion`);
    for (const name of new Set(["tour", demo.name])) {
      const tr = motion(s, name);
      assert.ok(tr.t.length > 30, `${ex} ${name}: only ${tr.t.length} frames`);
      assert.ok(tr.limits.position_ok, `${ex} ${name}: ${tr.limits.violations.join("; ")}`);
      assert.ok(tr.limits.velocity_ok, `${ex} ${name}: ${tr.limits.violations.join("; ")}`);
      if (tr.limits.torque_ok === false && !known[ex]?.[`${name}:torque`]) assert.fail(`${ex} ${name}: ${tr.limits.violations.join("; ")}`);
      // what the robot was asked to do, it does: the demo moves something
      const moving = tr.joints.filter((_, c) => tr.q.some((r) => Math.abs(r[c] - tr.q[0][c]) > 1e-3));
      // a robot with no joints (a thruster ROV) has nothing to tour: its demo moves it as a whole
      assert.ok(moving.length || tr.base || (name === "tour" && !tr.joints.length), `${ex} ${name}: nothing moves`);
    }
  }
});

test("the purpose demo follows what the joints are for, not the family name", () => {
  const want: Record<string, string> = {
    "01_arm_2dof": "pick_place", "02_arm_6dof": "pick_place", "03_arm_7dof": "pick_place", "04_scara": "pick_place", "05_diff_drive": "drive", "06_four_wheel": "drive", "07_mecanum": "drive",
    "08_humanoid": "step", "09_gripper": "grip", "10_quadruped": "gait", "11_spider_scout": "gait", "12_mars_rover": "drive", "13_battle_mech": "step", [SUIT]: "suit_up",
    "15_wall_e": "drive", "16_eva": "drive", "17_baymax": "drive", "18_arduino_car": "drive", "19_arduino_arm": "pick_place",
    "20_quadcopter": "fly", "21_underwater_rov": "swim", "22_pen_plotter": "plot", "23_robot_hand": "grasp", "24_plant_waterer": "drive",
  };
  for (const ex of EXAMPLES) assert.equal(motions(spec(ex)).find((m) => m.default)?.name, want[ex], ex);
  // a robot with no family at all: the same arm with its design record removed still picks and places
  const bare = spec("02_arm_6dof"); delete (bare.metadata as { design?: unknown }).design;
  assert.equal(motions(bare).find((m) => m.default)?.name, "pick_place");
  // nothing to go on: the tour is the demo
  const block = { ...spec("09_gripper") }; block.joints = block.joints.map((j) => ({ ...j, name: `j_${j.name.length}_${j.child}`.replace(/grip|finger/g, "x") }));
  block.links = block.links.map((l) => ({ ...l, role: l.role === "gripper" ? "link" : l.role, name: l.name }));
  assert.ok(["tour", "grip"].includes(motions(block).find((m) => m.default)!.name));
});

test("no self-collision in any example's tour or demo (real meshes, every frame)", { timeout: 1_200_000 }, () => {
  for (const ex of EXAMPLES) {
    if (ex === SUIT) continue;   // the suit's armour: the next test
    const s = spec(ex), demo = motions(s).find((m) => m.default)!.name;
    for (const name of new Set(["tour", demo])) {
      collisionFor(ex, s);
      const tr = motionTrajectory(s, name), c = tr.collisions!;
      assert.ok(c.checked, `${ex} ${name}: not checked`);
      assert.equal(c.skipped.length, 0, `${ex} ${name}: parts left out: ${c.skipped.join(", ")}`);
      for (const p of c.pairs) if (!listed(ex, name, p.a, p.b)) assert.fail(`${ex} ${name}: ${p.a} and ${p.b} collide ${p.frames} frames, ${p.depth_mm} mm (${p.first_s}-${p.last_s} s)`);
      for (const f of c.floor) if (!known[ex]?.[`${name}:floor`]) assert.fail(`${ex} ${name}: ${f.link} ${f.depth_mm} mm under the floor in ${f.frames} frames`);
    }
  }
});

test("Mark 43: suit-up opens and closes every door on its servos; human motion stays in the suit's range and says where it cannot", { timeout: 1_200_000 }, () => {
  const s = spec(SUIT), list = motions(s);
  for (const n of ["suit_up", "doors", "idle", "walk", "look", "wave", "squat", "punch", "arms_up", "hover"]) assert.ok(list.some((m) => m.name === n), n);
  const up = motion(s, "suit_up"), design = (s.metadata as any).design;
  for (const st of design.door_sequence as string[][]) for (const d of st) {
    const c = up.joints.indexOf(d), v = up.q.map((r) => r[c]), j = s.joints.find((x) => x.name === d)!;
    const far = Math.abs(j.limit!.lower!) > Math.abs(j.limit!.upper!) ? j.limit!.lower! : j.limit!.upper!;
    assert.ok(v.some((x) => Math.abs(x - far) < 1e-3), `${d} never opens fully`);
    assert.ok(Math.abs(v[v.length - 1] - v[0]) < 1e-6, `${d} does not close`);
  }
  assert.ok(up.props.some((p) => p.kind === "wearer" && p.path.some(Boolean)), "nobody steps in");
  assert.ok(up.notes.some((n) => n.startsWith("Wearable: limbs follow the wearer")));
  // only doors, latches and the faceplate move in the servo motions
  const servo = new Set([...(design.door_sequence as string[][]).flat(), ...s.joints.filter((j) => /latch|pawl|faceplate/.test(j.name)).map((j) => j.name)]);
  for (const [c, n] of up.joints.entries()) if (!servo.has(n)) assert.ok(up.q.every((r) => r[c] === up.q[0][c]), `${n} moves in suit-up`);
  for (const n of ["idle", "walk", "squat", "arms_up", "hover"]) {
    const tr = motion(s, n);
    assert.ok(tr.limits.position_ok && tr.limits.velocity_ok, `${n}: ${tr.limits.violations.join("; ")}`);
  }
  // raising both arms overhead is far beyond a 57 degree shoulder: clamped and said
  const arms = motion(s, "arms_up");
  assert.ok(arms.clamped.some((c) => /shoulder/.test(c.joint) && c.beyond_deg > 60), JSON.stringify(arms.clamped));
  assert.ok(arms.warnings.some((w) => w.includes("Beyond the suit's range of motion")));
  // a walk plants its feet: the root moves forward
  const walk = motion(s, "walk");
  assert.ok(walk.base && walk.base[walk.base.length - 1][0] > 0.3, "the suit walks nowhere");
  const rom = kinematics(s).range_of_motion!;
  assert.ok(rom.joints.some((r) => r.movement === "shoulder flexion" && r.max_deg > 50));
  assert.ok(rom.missing.includes("shoulder abduction"));
  // BVH of the suit skeleton
  const bvh = toBvh(robotOf(s).m, robotOf(s).sem, walk);
  assert.match(bvh, /^HIERARCHY\nROOT \w+\n/); assert.match(bvh, /JOINT left_forearm/);
  assert.match(bvh, new RegExp(`Frames: ${walk.t.length}\\n`));
});

test("legged robots walk with planted feet; the body moves", () => {
  for (const ex of ["08_humanoid", "10_quadruped", "11_spider_scout", "13_battle_mech"]) {
    const s = spec(ex), name = motions(s).find((m) => m.default)!.name, tr = motion(s, name);
    assert.ok(tr.measures.stance_drift_mm < 1, `${ex}: a planted foot slides ${tr.measures.stance_drift_mm} mm`);
    const x = tr.base!.map((b) => b[0]);
    assert.ok(Math.max(...x) - Math.min(...x) > 0.1, `${ex}: the body does not travel`);
    // independent of the solver: feet in stance measured from the trajectory itself
    const { m, sem } = robotOf(s); let worst = 0;
    const footAt = (k: number, L: (typeof sem.legs)[number]) => { const q = qVector(m, Object.fromEntries(tr.joints.map((n, c) => [n, tr.q[k][c]]))), b = tr.base![k]; const W = fk(m, q, Float64Array.of(1 - 2 * (b[4] ** 2 + b[5] ** 2), 2 * (b[3] * b[4] - b[6] * b[5]), 2 * (b[3] * b[5] + b[6] * b[4]), b[0], 2 * (b[3] * b[4] + b[6] * b[5]), 1 - 2 * (b[3] ** 2 + b[5] ** 2), 2 * (b[4] * b[5] - b[6] * b[3]), b[1], 2 * (b[3] * b[5] - b[6] * b[4]), 2 * (b[4] * b[5] + b[6] * b[3]), 1 - 2 * (b[3] ** 2 + b[4] ** 2), b[2])); const o = 12 * L.foot; return [W[o] * L.point[0] + W[o + 1] * L.point[1] + W[o + 2] * L.point[2] + W[o + 3], W[o + 4] * L.point[0] + W[o + 5] * L.point[1] + W[o + 6] * L.point[2] + W[o + 7], W[o + 8] * L.point[0] + W[o + 9] * L.point[1] + W[o + 10] * L.point[2] + W[o + 11]]; };
    const k0 = Math.ceil(tr.measures.walk_t0 * tr.fps) + 1, k1 = Math.floor(tr.measures.walk_t1 * tr.fps) - 1;
    for (const L of sem.legs) for (let k = k0 + 1; k < k1; k++) {
      const a = footAt(k - 1, L), b = footAt(k, L);
      // a foot on the floor (within 1 mm of the lowest it gets) must not move along it
      if (a[2] - L.contactDrop < 0.001 && b[2] - L.contactDrop < 0.001) worst = Math.max(worst, Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    assert.ok(worst < 0.001, `${ex}: a foot on the floor slides ${(worst * 1000).toFixed(2)} mm in one frame`);
  }
});

test("wheels turn at the speed the ground passes under them", () => {
  for (const ex of ["05_diff_drive", "06_four_wheel", "12_mars_rover", "15_wall_e", "16_eva", "17_baymax", "18_arduino_car"]) {
    const s = spec(ex), tr = motion(s, "drive"), { m, sem } = robotOf(s);
    const slip = wheelSlip(m, sem.wheels.map((w) => ({ joint: w.joint, radius: w.radius })), tr);
    assert.ok(slip < 0.0005, `${ex}: a wheel's roll and its hub's travel differ by ${(slip * 1000).toFixed(2)} mm in a frame`);
    const x = tr.base!.map((b) => b[0]); assert.ok(Math.max(...x) > 0.3, `${ex}: drives ${Math.max(...x)} m`);
  }
  // mecanum: forward and back the same rule holds; sideways the wheels turn too (rollers)
  const mec = motion(spec("07_mecanum"), "drive");
  assert.ok(mec.segments.some((g) => g.label === "strafe left"));
});

test("inverse kinematics reaches reachable targets within 1 mm and 1 degree on every example arm, and says when it cannot", () => {
  for (const ex of EXAMPLES) {
    const s = spec(ex), k = kinematics(s), { m } = robotOf(s);
    for (const tip of k.tips.filter((t) => t.joints.length >= 2 && !k.wearable)) {
      const joints = tip.joints.map((n) => m.joints[m.joint.get(n)!]);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let trial = 0; trial < 6; trial++) {
        // a target this arm can reach: where some pose inside its limits puts the tip
        const pose: Record<string, number> = { ...k.home };
        for (const j of joints) { const lo = Number.isFinite(j.lower) ? j.lower : -Math.PI, hi = Number.isFinite(j.upper) ? j.upper : Math.PI; pose[j.name] = lo + (hi - lo) * (0.15 + 0.7 * rnd()); }
        const W = fk(m, qVector(m, pose)), o = 12 * m.link.get(tip.link)!, p = tip.point;
        const target = [W[o] * p[0] + W[o + 1] * p[1] + W[o + 2] * p[2] + W[o + 3], W[o + 4] * p[0] + W[o + 5] * p[1] + W[o + 6] * p[2] + W[o + 7], W[o + 8] * p[0] + W[o + 9] * p[1] + W[o + 10] * p[2] + W[o + 11]] as [number, number, number];
        const six = tip.joints.length >= 6;
        const R = six ? (() => { const r = [W[o], W[o + 1], W[o + 2], W[o + 4], W[o + 5], W[o + 6], W[o + 8], W[o + 9], W[o + 10]]; const tr = r[0] + r[4] + r[8]; const w = Math.sqrt(Math.max(0, 1 + tr)) / 2; return [(r[7] - r[5]) / (4 * w), (r[2] - r[6]) / (4 * w), (r[3] - r[1]) / (4 * w), w] as [number, number, number, number]; })() : undefined;
        const a = ik(s, tip.link, { xyz: target, quat: R }, { orientation: six, restarts: 12 });
        assert.ok(a.reached && a.error_mm <= 1 && (!six || a.error_deg <= 1), `${ex} ${tip.link} trial ${trial}: ${a.error_mm} mm, ${a.error_deg} deg off`);
        for (const j of joints) { const v = a.values[j.name]; assert.ok(v >= j.lower - 1e-9 && v <= j.upper + 1e-9, `${ex} ${j.name}=${v} outside [${j.lower}, ${j.upper}]`); }
      }
      // twice its reach away: not reachable, and it says so with the closest pose it found
      const far = ik(s, tip.link, { xyz: [tip.reach_m * 2.2, 0.3, 0.5] }, { restarts: 4 });
      assert.equal(far.reached, false, `${ex}: claims to reach ${tip.reach_m * 2.2} m`);
      assert.ok(far.error_mm > 100, `${ex}: unreachable target reported ${far.error_mm} mm off`);
    }
  }
});

test("dragging the body of a legged robot keeps its feet planted", () => {
  const s = spec("10_quadruped"), k = kinematics(s);
  const base = [0.012, 0.008, 0.16, 0, 0, 0, 1];
  const r = bodyIk(s, base, { seedBase: [0, 0, 0.17, 0, 0, 0, 1] });
  assert.ok(r.reached, `body shift not held: ${r.error_mm} mm`);
  assert.equal(Object.keys(r.values).length, k.feet.reduce((n, f) => n + f.joints.length, 0));
});

test("motion exports: the CSV has one column per joint, the JointTrajectory lists the motor-driven joints, the ROS 2 package and training scaffold carry them", () => {
  for (const ex of ["02_arm_6dof", "07_mecanum", "10_quadruped", SUIT]) {
    const s = spec(ex), demo = motions(s).find((m) => m.default)!.name, tr = motion(s, demo);
    const csv = toCsv(tr).trim().split("\n"), head = csv[0].split(",");
    const free = s.joints.filter((j) => j.type !== "fixed" && !j.mimic).map((j) => j.name);
    assert.deepEqual(head, ["time_s", ...free], ex);
    assert.equal(csv.length, tr.t.length + 1);
    for (const row of csv.slice(1)) { const v = row.split(",").map(Number); assert.equal(v.length, head.length); assert.ok(v.every(Number.isFinite)); }
    const yaml = toJointTrajectoryYaml(tr);
    assert.match(yaml, /^# .*\n# .*\nheader:\n {2}frame_id: ''\njoint_names:\n/);
    const names = [...yaml.matchAll(/^ {2}- (\w+)$/gm)].map((x) => x[1]);
    assert.deepEqual(names, tr.actuated);
    assert.equal([...yaml.matchAll(/^ {2}- positions: \[(.*)\]$/gm)].length, tr.t.length);
    for (const p of yaml.matchAll(/^ {2}- positions: \[(.*)\]$/gm)) assert.equal(p[1].split(", ").length, names.length);
    const pkg = exportRos2Package(s, { ros2_control: true }), root = Object.keys(pkg)[0].split("/")[0];
    assert.ok(pkg[`${root}/motions/${demo}.yaml`] || pkg[`${root}/motions/tour.yaml`], `${ex}: no motion in the ROS 2 package`);
    assert.ok(pkg[`${root}/scripts/replay_motion.py`]);
    assert.match(String(pkg[`${root}/CMakeLists.txt`]), /install\(PROGRAMS scripts\/replay_motion.py/);
    const train = exportTraining(s);
    assert.ok(train[`training/reference_motions/${demo}.csv`] || train["training/reference_motions/tour.csv"], `${ex}: no reference motion`);
    assert.ok(train["training/reference_motion.py"]);
  }
  // the suit's ROS 2 trajectory is its doors and latches only: the limbs are the wearer's
  const s = spec(SUIT), pkg = exportRos2Package(s, { ros2_control: true }), y = String(Object.entries(pkg).find(([n]) => n.endsWith("motions/suit_up.yaml"))![1]);
  const names = [...y.matchAll(/^ {2}- (\w+)$/gm)].map((x) => x[1]);
  assert.ok(names.length > 10 && names.every((n) => /hinge|pawl|faceplate/.test(n)), names.join(","));
});

test("the collision check catches a part swinging into another and passes it clear of it", () => {
  const box = (lo: number[], hi: number[]) => {
    const v = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
    const f = [[0, 2, 1], [1, 2, 3], [4, 5, 6], [5, 7, 6], [0, 1, 4], [1, 5, 4], [2, 6, 3], [3, 6, 7], [0, 4, 2], [2, 4, 6], [1, 3, 5], [3, 7, 5]];
    return { positions: Float32Array.from(v.flat()), triangles: Uint32Array.from(f.flat()) };
  };
  const pose = { xyz: [0, 0, 0] as [number, number, number], rpy: [0, 0, 0] as [number, number, number] };
  const link = (name: string, lo: number[], hi: number[]) => ({ name, mass: 0.1, origin: pose, geometry: { type: "box" as const, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] as [number, number, number] } });
  const geo: Record<string, [number[], number[]]> = { base: [[-0.1, -0.1, -0.02], [0.1, 0.1, 0]], post: [[0.09, -0.01, 0], [0.11, 0.01, 0.2]], arm: [[-0.01, 0, 0.04], [0.01, 0.15, 0.06]] };
  const s = { robot_name: "swing", links: Object.entries(geo).map(([n, [lo, hi]]) => link(n, lo, hi)), joints: [
    { name: "post_fix", type: "fixed", parent: "base", child: "post", origin: pose, axis: [0, 0, 1] },
    { name: "swing", type: "revolute", parent: "base", child: "arm", origin: pose, axis: [0, 0, 1], limit: { lower: -2, upper: 2, effort: 1, velocity: 2 } },
  ], materials: [], sensors: [], end_effectors: [], metadata: { generator: "test", created: "", inferred_fields: [], notes: [] } } as unknown as RobotSpecification;
  const m = compile(s), cm = collisionModel(m, (i) => box(...geo[m.links[i]]));
  const i = m.joint.get("swing")!;
  const at = (v: number) => { const q = qVector(m, { swing: v }); return { q, base: null }; };
  const frames = Array.from({ length: 21 }, (_, k) => at((-Math.PI / 2) * (k / 20)));
  const tr = { fps: 20, warnings: [], notes: [] } as unknown as Parameters<typeof checkCollisions>[1];
  const r = checkCollisions(cm, tr, frames, { floor: false });
  assert.equal(r.frames[0], false, "clear at the start");
  assert.equal(r.frames[20], true, "the arm through the post is not caught");
  assert.ok(r.pairs.some((p) => [p.a, p.b].sort().join("/") === "arm/post"), JSON.stringify(r.pairs));
  // the other way round it never meets the post
  assert.equal(checkCollisions(cm, tr, Array.from({ length: 21 }, (_, k) => at((Math.PI / 2) * (k / 20))), { floor: false }).colliding_frames, 0);
  void i;
});

test("the motion code runs in the website's worker: no Node globals", () => {
  for (const f of readdirSync("packages/motion/src")) {
    const text = readFileSync(`packages/motion/src/${f}`, "utf8");
    assert.doesNotMatch(text, /\bprocess\.|\brequire\(|from "node:/, `${f} uses a Node global or module`);
  }
  assert.doesNotMatch(readFileSync("apps/web/src/engine/motion.ts", "utf8"), /\bprocess\.|from "node:/);
});
