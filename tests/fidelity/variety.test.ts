// Different prompts give different robots; the same prompt the same robot. 100 prompts, each designed in full: two prompts
// that mean different robots (another job, another look, another style, colour or structure) must not give a robot that
// looks the same (the same parts in the same places and the same colours), and the prompts listed as meaning the same robot
// must give exactly the same one. Sharded by TTR_SHARD="i/n" for the designs; the comparison runs on the shard's own
// prompts plus the same-meaning groups.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [shard, shards] = (process.env.TTR_SHARD ?? "1/1").split("/").map(Number);
/** each prompt's look (tests/helpers/looks.ts), designed eight to a process */
function looks(prompts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < prompts.length; i += 8) Object.assign(out, JSON.parse(execFileSync(process.execPath, [new URL("../helpers/looks.ts", import.meta.url).pathname, JSON.stringify(prompts.slice(i, i + 8))], { encoding: "utf8", maxBuffer: 1 << 24 }).trim().split("\n").pop()!));
  return out;
}

// jobs: each its own palette (and, where the job needs it, its own body)
const JOBS = ["a robot that waters my plants", "a robot that cleans solar panels", "a robot that mops the floor", "a robot that cleans windows", "a robot that cleans the pool",
  "a robot that washes the dishes", "a robot that folds laundry", "a robot that feeds my cat", "a robot that cleans the litter box", "a robot that takes photos of my dog",
  "a robot that plays with my dog", "a telepresence robot", "a companion robot for my grandma", "a robot that plays music", "a robot that delivers packages",
  "a robot that serves drinks at a party", "a security robot that patrols the warehouse", "a robot that counts inventory on shelves", "a robot that mows the lawn", "a robot that clears snow",
  "a robot that harvests strawberries", "a robot that sprays crops", "a robot that paints walls", "a robot that sorts parcels fast", "a robot that picks and places parts",
  "a robot that fetches my slippers", "a robot that inspects pipes", "a robot that follows me around", "a robot that gives massages", "a robot that peels potatoes",
  "a robot that tidies my desk", "a robot that brushes my hair", "a robot that sorts lego bricks", "a robot that waters the lawn", "a robot that guards my house"];
// looks, styles, colours and structures
const LOOKS = ["a heart shaped robot", "a shoe shaped robot", "a star shaped robot", "a teapot robot", "a donut robot", "a cartoon robot", "a dragon robot", "🦄 robot", "👻 robot", "🚀 robot",
  "a robot shaped like a banana", "a robot that looks like a pineapple", "🍕 robot", "a toaster robot", "a burger robot", "a cube shaped robot", "an egg shaped robot", "a heart shaped drone", "a heart shaped robot arm", "a star shaped quadruped"];
const STYLES = ["a sci-fi robot", "a rugged robot", "a retro robot", "a steampunk robot", "a cute robot", "a sleek robot arm", "a retro robot arm", "a rugged quadruped", "a sci-fi drone", "a steampunk four wheel robot"];
const COLOURS = ["a red four wheel robot", "a blue four wheel robot", "a green four wheel robot", "a yellow four wheel robot", "a black four wheel robot",
  "a red 6 dof robot arm", "a blue 6 dof robot arm", "a purple quadruped", "an orange drone", "a pink hexapod"];
const STRUCTS = ["a 6 dof robot arm", "a 5 dof robot arm", "a 4 dof robot arm", "a 3 dof robot arm", "a 7 dof robot arm", "a four wheel robot", "a three wheel robot", "a differential drive robot",
  "a mecanum robot", "a six wheel rover", "a four wheel rover with an arm", "a six wheel rover with an arm", "two 6 dof robot arms on a table", "three 6 dof robot arms on a table", "a quadruped",
  "a hexapod", "a quadcopter drone", "a 6 dof robot arm with a camera", "a four wheel robot with a lidar", "a quadruped with an arm on its back", "a 6 dof robot arm without a gripper",
  "a differential drive robot with a camera", "a 4 dof arm on a six wheel rover", "a quadcopter drone with a camera", "a four wheel robot with a camera and a lidar"];
const PROMPTS = [...JOBS, ...LOOKS, ...STYLES, ...COLOURS, ...STRUCTS];
// prompts that mean the same robot, said another way: these must be the same robot
const SAME: string[][] = [["a robot that waters my plants", "a robot to water my plants", "plant watering robot"], ["a 6 dof robot arm", "a six dof robotic arm", "Create a 6 DOF robotic arm"], ["a heart shaped robot", "❤️ robot", "a robot shaped like a heart"]];

test(`${PROMPTS.length} different prompts give ${PROMPTS.length} different looking robots, the same prompt the same robot (shard ${shard}/${shards})`, async () => {
  assert.ok(PROMPTS.length >= 100, `${PROMPTS.length} prompts`);
  assert.equal(new Set(PROMPTS).size, PROMPTS.length);
  // each shard designs its share, and compares it with the rest of its share (every pair is compared on some shard when
  // shards is 1, the way it is run locally; in CI each shard holds its quarter to it)
  const mine = PROMPTS.filter((_, i) => i % shards === shard - 1), seen = new Map<string, string>(), clash: string[] = [], got = looks(mine);
  for (const p of mine) {
    const k = got[p];
    if (seen.has(k)) clash.push(`${JSON.stringify(seen.get(k))} and ${JSON.stringify(p)} give the same robot`);
    else seen.set(k, p);
  }
  assert.deepEqual(clash, []);
  // the same prompt again, in another process: the same robot
  assert.equal(looks([mine[0]])[mine[0]], got[mine[0]]);
});

for (const group of SAME.filter((_, i) => i % shards === shard - 1)) {
  test(`said another way, the same robot: ${group.map((g) => JSON.stringify(g)).join(", ")}`, async () => {
    const got = looks(group);
    assert.equal(new Set(Object.values(got)).size, 1, JSON.stringify(got));
  });
}
