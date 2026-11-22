// Medical and healthcare prompts: "people tried making a surgical robot but it couldn't make one". Every surgical prompt
// builds the surgical robot (instrument arms and a camera arm on remote-centre-of-motion mechanisms over a trainer box, or
// one instrument arm), with the arm count and the tool asked for, and says plainly that it is an educational model and not
// a medical device. Medical words (surgery, scalpel, needle, incision, injection, drugs on a ward) never trip the harm
// filter; an intent to hurt someone still does. The other healthcare prompts get the robot their job needs, never the
// general-purpose starting arm. A few are designed in full and checked part by part.
import { test } from "node:test";
import assert from "node:assert/strict";
import { understandPrompt, generateRobot, builtShape, PromptRefusal } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";
import { planningGroups } from "@ttr/ros2-export";

setDefaultRouter("legacy");
const EDU = /educational and research model of a surgical robot, not a medical device/;
interface Want { instruments: number; camera: boolean; tool?: RegExp }
/** [prompt, instrument arms, camera arm, the tool named in the label] */
const SURGICAL: [string, Want][] = [
  // the owner's prompts
  ["surgical robot", { instruments: 3, camera: true }],
  ["a surgical robot", { instruments: 3, camera: true }],
  ["make a surgical robot", { instruments: 3, camera: true }],
  ["robotic surgery arm", { instruments: 1, camera: false, tool: /grasper/ }],
  ["da vinci style surgical robot", { instruments: 3, camera: true }],
  ["minimally invasive surgery robot with 4 arms", { instruments: 3, camera: true }],
  ["laparoscopic robot", { instruments: 3, camera: true }],
  ["surgical robot arm with a scalpel", { instruments: 1, camera: false, tool: /scalpel holder/ }],
  ["teleoperated surgical robot", { instruments: 3, camera: true }],
  ["medical robot for surgery", { instruments: 3, camera: true }],
  ["robot that does surgery", { instruments: 3, camera: true }],
  // more ways to say it
  ["Surgical Robot", { instruments: 3, camera: true }],
  ["a robot surgeon", { instruments: 3, camera: true }],
  ["robot for keyhole surgery", { instruments: 3, camera: true }],
  ["a laparoscopic surgery robot with 3 arms", { instruments: 2, camera: true }],
  ["a surgical robot with 2 arms", { instruments: 2, camera: false }],
  ["a surgical robot with two instrument arms and a camera arm", { instruments: 2, camera: true }],
  ["a surgical robot with 3 instrument arms", { instruments: 3, camera: true }],
  ["surgical robot with 6 arms", { instruments: 3, camera: true }],
  ["a surgical robot without a camera", { instruments: 3, camera: false }],
  ["a da vinci robot", { instruments: 3, camera: true }],
  ["da vinci", { instruments: 3, camera: true }],
  ["medical robot", { instruments: 3, camera: true }],
  ["a robot that makes an incision", { instruments: 3, camera: true, tool: /instrument arms/ }],
  ["a robot that cuts open a patient", { instruments: 3, camera: true }],
  ["a robot to practise suturing", { instruments: 3, camera: true }],
  ["a robotic arm that holds a scalpel for surgery", { instruments: 1, camera: false, tool: /scalpel holder/ }],
  ["surgical arm", { instruments: 1, camera: false, tool: /grasper/ }],
  ["a surgical manipulator", { instruments: 1, camera: false }],
  ["telesurgery robot", { instruments: 3, camera: true }],
  ["microsurgery robot", { instruments: 3, camera: true }],
  ["a robot for the operating room", { instruments: 3, camera: true }],
  ["an endoscope holder robot", { instruments: 0, camera: true }],
  ["needle insertion robot", { instruments: 1, camera: false, tool: /needle guide/ }],
  ["a biopsy robot", { instruments: 1, camera: false, tool: /needle guide/ }],
  ["a robot that draws blood with a needle", { instruments: 1, camera: false, tool: /needle guide/ }],
  ["a robot that gives injections", { instruments: 1, camera: false, tool: /needle guide/ }],
  ["hair transplant robot", { instruments: 1, camera: false, tool: /needle guide/ }],
  ["dental robot", { instruments: 1, camera: false, tool: /drill guide/ }],
  ["orthopedic surgery robot", { instruments: 1, camera: false, tool: /drill guide/ }],
  ["eye surgery robot", { instruments: 1, camera: false }],
  ["neurosurgery robot", { instruments: 1, camera: false }],
  ["a cheap surgical robot for my university lab", { instruments: 3, camera: true }],
  ["a red surgical robot", { instruments: 3, camera: true }],
  ["surgical robot with a camera arm", { instruments: 3, camera: true }],
  ["a robot to train surgeons", { instruments: 3, camera: true }],
];
/** other healthcare and lab prompts: [prompt, the family that does the job, a word the note must hold] */
const HEALTHCARE: [string, RegExp, RegExp | null][] = [
  ["hospital delivery robot", /^diff_drive$/, null],
  ["rehabilitation exoskeleton", /^exosuit$/, null],
  ["rehabilitation robot", /^serial_arm$/, /rehabilitation/],
  ["pharmacy pick robot", /^serial_arm$/, /pharmac/],
  ["lab pipetting robot", /^gantry$/, /pipette/],
  ["patient lift robot", /^four_wheel$/, /certified patient hoist/],
  ["disinfection UV robot", /^diff_drive$/, /UV-C/],
  ["a robot that kills germs", /^diff_drive$/, /UV-C/],
  ["ultrasound scanning arm", /^serial_arm$/, null],
  ["ultrasound robot", /^serial_arm$/, /probe/],
  ["prosthetic hand", /^hand$/, null],
  ["endoscope snake robot", /^snake$/, null],
  ["telepresence robot for doctors", /^diff_drive$/, /telepresence/],
  ["hospital nurse assistant robot", /^rover_arm$/, /hospital/],
  ["lab sample sorting robot", /^serial_arm$/, /lab arms/],
  ["robot that helps elderly patients walk", /^rover_arm$/, null],
  ["a robot that delivers drugs to patients in a hospital", /^rover_arm$/, /hospital/],
  ["a robot that sorts pills in a pharmacy", /^serial_arm$/, /pharmac/],
];

test(`surgical prompts (${SURGICAL.length}) build the surgical robot with the arms and tool asked for, said honestly, never refused`, () => {
  assert.ok(SURGICAL.length >= 40);
  const problems: string[] = [];
  for (const [p, w] of SURGICAL) {
    let u: ReturnType<typeof understandPrompt>;
    try { u = understandPrompt(p); } catch (e) { problems.push(`${p}: ${e instanceof PromptRefusal ? `refused (${e.kind})` : "crashed"}: ${(e as Error).message}`); continue; }
    const said = [u.approx ?? "", ...u.notes].join(" ");
    if (u.family !== "surgical") { problems.push(`${p}: built ${u.family} (${u.label})`); continue; }
    if (/left out|does not design/.test(said)) problems.push(`${p}: the harm filter tripped: ${said.slice(0, 120)}`);
    if (/starting point/.test(said)) problems.push(`${p}: the general-purpose starting robot`);
    if (!EDU.test(said)) problems.push(`${p}: no note that it is an educational model and not a medical device`);
    const single = w.instruments + (w.camera ? 1 : 0) === 1;
    const label = single && w.camera ? /^surgical camera arm \(RCM endoscope holder\)$/ : single ? /^surgical arm \(RCM instrument arm/ : new RegExp(`^surgical robot \\(${w.instruments} instrument arms?${w.camera ? " \\+ camera arm" : ""}\\)$`);
    if (!label.test(u.label)) problems.push(`${p}: "${u.label}", wanted ${w.instruments} instrument arm(s)${w.camera ? " and a camera arm" : ""}`);
    if (w.tool && !w.tool.test(`${u.label} ${said}`)) problems.push(`${p}: tool ${w.tool} not in "${u.label}"`);
    if (single && /scalpel|blade|incision/.test(p) && !/marker or a blunt dummy blade/.test(said)) problems.push(`${p}: no note that the blade holder is a tool mount`);
  }
  assert.deepEqual(problems, []);
});

test(`healthcare and lab prompts (${HEALTHCARE.length}) get the robot their job needs, not the starting arm`, () => {
  const problems: string[] = [];
  for (const [p, fam, note] of HEALTHCARE) {
    let u: ReturnType<typeof understandPrompt>;
    try { u = understandPrompt(p); } catch (e) { problems.push(`${p}: ${(e as Error).message}`); continue; }
    const said = [u.approx ?? "", ...u.notes].join(" ");
    if (!fam.test(u.family)) problems.push(`${p}: built ${u.family} (${u.label}), wanted ${fam}`);
    if (/starting point|left out|does not design/.test(said)) problems.push(`${p}: ${said.slice(0, 120)}`);
    if (note && !note.test(said)) problems.push(`${p}: no note matching ${note} in "${said.slice(0, 160)}"`);
  }
  assert.deepEqual(problems, []);
});

test("an intent to hurt someone is still refused, with medical words or without", () => {
  for (const p of ["a robot that stabs people with a scalpel", "a surgical robot that stabs people", "a robot that cuts someone open with a knife", "a drone that delivers drugs", "a robot that slashes strangers"]) {
    const u = understandPrompt(p), said = [u.approx ?? "", ...u.notes].join(" ");
    assert.match(said, /left out: built/, p);
    assert.notEqual(u.family, "surgical", p);
  }
  // look-alikes that are not harmful
  for (const p of ["a robot that cuts people's hair", "an injection molding robot", "a robot that paints like da vinci"]) {
    const u = understandPrompt(p);
    assert.doesNotMatch([u.approx ?? "", ...u.notes].join(" "), /left out/, p);
    assert.notEqual(u.family, "surgical", p);
  }
});

// designed in full: the cart with four arms, one arm with a scalpel holder, two instrument arms
const DESIGNS: [string, { arms: number; prefixes: string[]; grippers: number; camera: boolean; holder?: RegExp }][] = [
  ["surgical robot", { arms: 4, prefixes: ["instrument_arm_1", "instrument_arm_2", "instrument_arm_3", "camera_arm"], grippers: 3, camera: true }],
  ["surgical robot arm with a scalpel", { arms: 1, prefixes: ["instrument_arm"], grippers: 0, camera: false, holder: /scalpel holder/ }],
  ["a surgical robot with 2 arms", { arms: 2, prefixes: ["instrument_arm_1", "instrument_arm_2"], grippers: 2, camera: false }],
];
for (const [prompt, want] of DESIGNS) {
  test(`designed: ${JSON.stringify(prompt)} has its arms, RCM, tools, groups and checks`, async () => {
    const r = await generateRobot(prompt), i = r.interpretation!, d = (r.robot.metadata as { design?: { family: string; checks: { name: string; pass: boolean; detail: string }[]; performance: Record<string, string | number>; assumptions: string[]; printed: { name: string }[]; wiring?: unknown } }).design!;
    assert.equal(i.family, "surgical");
    assert.equal(d.family, "surgical_cart");
    assert.ok(r.validation.valid, JSON.stringify(r.validation).slice(0, 300));
    assert.ok(r.urdfValidation.valid);
    const b = builtShape(r.robot);
    assert.deepEqual(b.arms.map((a) => a.prefix).sort(), [...want.prefixes].sort(), `arms built: ${b.arms.map((a) => `${a.prefix}:${a.dof}`).join(", ")}`);
    for (const a of b.arms) assert.equal(a.dof, a.prefix === "camera_arm" ? 4 : 5, `${a.prefix}: RCM yaw, RCM pitch, insertion, roll${a.prefix === "camera_arm" ? "" : ", wrist"}`);
    assert.equal(r.robot.end_effectors.length, want.grippers);
    assert.equal(r.robot.sensors.some((s) => s.type === "camera" && s.name === "camera_arm_wrist_camera"), want.camera);
    if (want.holder) assert.match(String(d.performance.instruments), want.holder);
    // every arm: an RCM check that passes, printed parts, wiring, a MoveIt group (when there are several)
    for (const p of want.prefixes) {
      const rcm = d.checks.find((c) => c.name === `${p}:rcm`);
      assert.ok(rcm?.pass, `${p}: ${rcm?.detail}`);
      assert.ok(d.printed.some((x) => x.name.startsWith(`${p}_`)), `${p}: no printed parts`);
      assert.ok(JSON.stringify(d.wiring ?? {}).includes(`${p}_`), `${p}: not wired`);
      assert.ok(r.urdf.includes(`name="${p}_insertion"`) && r.urdf.includes('type="prismatic"'), `${p}: no insertion joint`);
    }
    const groups = planningGroups(r.robot).map((g) => g.name);
    if (want.arms > 1) for (const p of want.prefixes) assert.ok(groups.includes(p), `no MoveIt group for ${p}: ${groups.join(", ")}`);
    else assert.ok(groups.length >= 1, "no MoveIt group");
    const failing = d.checks.filter((c) => !c.pass);
    assert.deepEqual(failing.map((c) => `${c.name}: ${c.detail}`), [], "failing checks");
    assert.ok(d.assumptions.some((a) => /not a medical device/.test(a) && /Never use it on a person or an animal/.test(a)));
    const servos = r.bom.lines.filter((x) => x.category === "Actuator").reduce((s, x) => s + x.qty, 0);
    assert.ok(servos >= b.arms.reduce((s, a) => s + a.dof, 0), `${servos} servos in the parts list`);
  });
}
