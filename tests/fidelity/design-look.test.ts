// Designed looks (packages/design/src/styling.ts). 100 prompts for the robots that wear a fairing (wheeled bases, legged
// robots, arms, drones, humanoids), each designed in full:
// - variety: no two of them give the same-looking robot by silhouette, preset, palette, structure and size (a coarser test
//   than tests/fidelity/variety.test.ts, which compares every part); each body kind shows several silhouettes, the robots
//   many palettes, and a style word's robot one of its preset's silhouettes; the same prompt again, in another process,
//   gives the same robot;
// - quality: every robot has a fairing (printed, on the bed, watertight), at least three colours on its printed parts (body,
//   accent, dark trim), an accent band over a two-tone fairing's seam, nothing standing through a wheeled fairing's roof, a hub cap on every wheel, its filament bought in its colours, and every design check passing with
//   the look on (clearances, the joints' sweeps, mass in the drive, leg and flight sizing, a LiDAR's view over the body).
// Sharded by TTR_SHARD="i/n" like the rest of tests/fidelity: each shard designs its share and compares it with itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PRESET, type Preset } from "@ttr/design";

const [shard, shards] = (process.env.TTR_SHARD ?? "1/1").split("/").map(Number);
type Facts = { sig: string; family: string; look?: { silhouette: string; preset: Preset; palette: string; hub: string; extras?: string[]; paint?: string; cargo?: boolean; colours: Record<string, string> }; colours: string[]; shell: string[]; wheels: string[]; hubs: string[]; filament: string[]; failing: string[]; unprintable: string[]; checks: string[]; valid: boolean };
function facts(prompts: string[]): Record<string, Facts> {
  const out: Record<string, Facts> = {};
  for (let i = 0; i < prompts.length; i += 8) Object.assign(out, JSON.parse(execFileSync(process.execPath, [new URL("../helpers/design-facts.ts", import.meta.url).pathname, JSON.stringify(prompts.slice(i, i + 8))], { encoding: "utf8", maxBuffer: 1 << 24 }).trim().split("\n").pop()!));
  return out;
}

const WHEELED = ["a four wheel robot", "a differential drive robot", "a three wheel robot", "a mecanum robot", "a four wheel robot with a camera", "a differential drive robot with a lidar",
  "a mecanum robot with a camera", "a four wheel robot with a depth camera", "a three wheel robot with a camera", "a differential drive robot with a camera and a lidar",
  "a four wheel robot carrying 3 kg", "a mecanum robot with a lidar and a camera", "a small two wheeled robot with a camera", "a four wheel robot with no lidar", "a mecanum robot carrying 4 kg",
  "a differential drive robot with a depth camera", "a mecanum robot with a depth camera", "a three wheel robot with a lidar", "a four wheel robot carrying 1 kg with a camera"];
const JOBS = ["a robot that carries boxes around my house", "a robot that delivers packages", "a robot that patrols my garden at night", "a telepresence robot", "a robot that follows me around",
  "a robot that carries groceries", "a robot that guards my house", "a robot that serves drinks at a party", "a robot that counts inventory on shelves", "a robot that chases my cat",
  "a robot that greets visitors", "a robot that stacks cups", "a robot that picks and places parts", "a robot that carries tools around the workshop", "a robot that patrols the parking lot",
  "a robot that scares birds", "a robot that cleans solar panels", "a robot that maps my office", "a museum guide robot", "a robot that reads books to kids", "a robot that waters the lawn", "a robot that cleans windows"];
const STYLES = ["a sleek four wheel robot", "a sci-fi four wheel robot", "a rugged four wheel robot", "a retro four wheel robot", "an industrial style four wheel robot", "a minimalist four wheel robot",
  "a sleek differential drive robot", "a rugged mecanum robot", "a retro three wheel robot", "an industrial looking differential drive robot", "a sci-fi mecanum robot", "a minimalist differential drive robot",
  "a sleek robot", "a futuristic robot", "a rugged robot", "an industrial style robot", "a minimalist robot", "a sleek robot arm", "a rugged quadruped", "a sci-fi drone", "a retro robot arm", "a sleek hexapod"];
const COLOURS = ["a red four wheel robot", "a blue four wheel robot", "a green differential drive robot", "a yellow mecanum robot", "a black four wheel robot", "a white differential drive robot",
  "a red 6 dof robot arm", "a blue quadruped", "an orange drone", "a purple hexapod"];
const ARMS = ["a 3 dof robot arm", "a 4 dof robot arm", "a 5 dof robot arm", "a 6 dof robot arm", "a 7 dof robot arm", "a 6 dof robot arm with a camera", "a 4 dof robot arm with a suction cup",
  "a 6 dof robot arm without a gripper", "a 5 dof robot arm with 50 cm reach", "a 6 dof robot arm with 45 cm reach", "a 3 dof robot arm with a camera"];
const LEGGED = ["a quadruped", "a quadruped with a lidar", "a quadruped with a camera", "a robot dog", "a hexapod", "a hexapod with a camera", "a hexapod with a lidar", "a quadruped with a depth camera", "a robot dog with a camera"];
const FLYING = ["a quadcopter drone", "a quadcopter drone with a camera", "a drone for aerial photos", "a small racing drone", "a drone carrying 300 g"];
const HUMANOIDS = ["a humanoid robot", "a small humanoid robot"];
const PROMPTS = [...WHEELED, ...JOBS, ...STYLES, ...COLOURS, ...ARMS, ...LEGGED, ...FLYING, ...HUMANOIDS];
const SAMPLE = PROMPTS.filter((_, i) => i % shards === shard - 1);
const got = SAMPLE.length ? facts(SAMPLE) : {};

test(`${PROMPTS.length} prompts give ${PROMPTS.length} different-looking designed robots (shard ${shard}/${shards})`, () => {
  assert.ok(PROMPTS.length >= 100, `${PROMPTS.length} prompts`);
  assert.equal(new Set(PROMPTS).size, PROMPTS.length);
  const seen = new Map<string, string>(), clash: string[] = [];
  for (const p of SAMPLE) { const k = got[p].sig; if (seen.has(k)) clash.push(`${JSON.stringify(seen.get(k))} and ${JSON.stringify(p)} look the same`); else seen.set(k, p); }
  assert.deepEqual(clash, []);
  // a style word's robot wears one of its preset's silhouettes, in one of its palettes
  for (const p of SAMPLE.filter((x) => STYLES.includes(x) && got[x].look)) {
    const l = got[p].look!, spec = PRESET[l.preset];
    assert.notEqual(l.preset, "studio", `${p}: the style was not read`);
    assert.ok(Object.values(spec.shapes).flat().includes(l.silhouette as never) && spec.palettes.includes(l.palette), `${p}: ${JSON.stringify(l)}`);
  }
});

test(`the looks are spread: several silhouettes per body, many palettes (shard ${shard}/${shards})`, { skip: shards > 2 }, () => {
  const by = (fams: string[]) => new Set(SAMPLE.filter((p) => fams.includes(got[p].family) && got[p].look).map((p) => got[p].look!.silhouette));
  assert.ok(by(["diff_drive", "four_wheel", "mecanum"]).size >= 7, `wheeled silhouettes: ${[...by(["diff_drive", "four_wheel", "mecanum"])]}`);
  assert.ok(by(["serial_arm"]).size >= 2, `arm silhouettes: ${[...by(["serial_arm"])]}`);
  assert.ok(by(["quadruped", "hexapod"]).size >= 2, `legged silhouettes: ${[...by(["quadruped", "hexapod"])]}`);
  assert.ok(new Set(SAMPLE.filter((p) => got[p].look).map((p) => got[p].look!.palette)).size >= 8);
});

test(`a style word shows: each preset's own details are on its wheeled robots, a carrier has a lid, a helmet a face (shard ${shard}/${shards})`, () => {
  const problems: string[] = [], wheeled = (p: string) => ["diff_drive", "four_wheel", "mecanum"].includes(got[p].family);
  for (const p of SAMPLE.filter((x) => got[x].look)) {
    const f = got[p], l = f.look!, say = (x: string) => problems.push(`${JSON.stringify(p)}: ${x}`), has = (rx: RegExp) => f.shell.some((n) => rx.test(n));
    if (wheeled(p)) {
      // the preset's details are asked for (those a silhouette cannot carry aside), and the ones that are parts are there
      for (const x of PRESET[l.preset].extras) if (!(l.extras ?? []).includes(x) && !["rack", "fins"].includes(x)) say(`no ${x} (${l.preset})`);
      if ((l.extras ?? []).includes("rear") && !has(/_tail_/)) say("no tail lamps");
      if (l.preset === "scifi" && !has(/_strip_/)) say("no light strips on a sci-fi body");
      if (l.preset === "industrial" && l.silhouette !== "tower" && !has(/_beacon$/)) say("no beacon on an industrial body");
      if (l.paint && l.paint !== "none" && l.paint !== "bonnet" && !has(/_paint_/)) say(`no ${l.paint} paint panels`);
      if (/deliver|carr|groceries/.test(p) && !l.cargo) say("a carrier with no lid");
    }
    if (f.family === "humanoid" && !(has(/_visor$/) && has(/_eye_/))) say("a helmet with no visor and eyes");
    if (f.family === "drone" && !has(/_screen$/)) say("a canopy with no screen");
  }
  assert.deepEqual(problems, []);
});

test(`every designed robot has a fairing, three colours, styled wheels, its filament in its colours and every check passing (shard ${shard}/${shards})`, () => {
  const problems: string[] = [];
  for (const p of SAMPLE) {
    const f = got[p], say = (x: string) => problems.push(`${JSON.stringify(p)}: ${x}`);
    if (!f.look) { say(`no designed look (${f.family})`); continue; }
    if (!f.shell.some((n) => /^shell/.test(n) && !/_(?:light|badge)$/.test(n))) say("no fairing");
    if (f.colours.length < 3) say(`${f.colours.length} colours on its printed parts`);
    if (f.hubs.length !== f.wheels.length) say(`hub caps on ${f.hubs.length} of ${f.wheels.length} wheels`);
    if (f.filament.length < 2) say(`filament in ${f.filament.length} colour(s): ${f.filament.join("; ")}`);
    if (f.unprintable.length) say(`does not print: ${f.unprintable.join(", ")}`);
    if (f.failing.length) say(`failing: ${f.failing.join(" | ")}`);
    if (!f.valid) say("invalid robot or URDF");
    if (["diff_drive", "four_wheel", "mecanum"].includes(f.family) && !f.checks.includes("look:proportion")) say("no proportion check");
    if (["diff_drive", "four_wheel", "mecanum"].includes(f.family) && !f.checks.includes("look:covered")) say("no check that nothing stands through the roof");
    // an accent band over the seam on every two-tone fairing but the minimal look's
    if (f.shell.some((n) => /_skirt/.test(n)) && f.look.preset !== "minimal" && !f.shell.some((n) => /_band/.test(n))) say("no accent band");
  }
  assert.deepEqual(problems, []);
});

test(`the same prompt, designed again in another process, is the same robot (shard ${shard}/${shards})`, () => {
  const again = facts(SAMPLE.slice(0, 2));
  for (const p of SAMPLE.slice(0, 2)) assert.equal(again[p].sig, got[p].sig, p);
});

test("an arm's base fairing keeps its joints' ranges (within 15 % of the same arm with no fairing)", { skip: shard !== 1 }, async () => {
  const { generateRobot } = await import("@ttr/robot-generator");
  const range = async (p: string) => Object.fromEntries((await generateRobot(p)).robot.joints.filter((j) => j.type === "revolute" && j.limit).map((j) => [j.name, (j.limit!.upper ?? 0) - (j.limit!.lower ?? 0)]));
  for (const p of ["a 5 dof robot arm with a camera", "a 6 dof robot arm"]) {
    const bare = await range(`${p} with no fairing`), faired = await range(p);
    for (const [j, r] of Object.entries(bare)) assert.ok(faired[j] >= 0.85 * r - 1e-9, `${p}: ${j} ${faired[j]?.toFixed(2)} rad of ${r.toFixed(2)}`);
  }
});
