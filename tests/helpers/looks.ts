// Designs each prompt given and prints one line of JSON: { prompt: look } (tests/fidelity/variety.test.ts runs it in a
// process of its own per batch: one process designing a hundred robots runs its CAD kernels out of WebAssembly memory).
import { createHash } from "node:crypto";
import { generateRobot } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";
import type { RobotSpecification } from "@ttr/robot-schema";

setDefaultRouter("legacy");
/** what the robot looks like: every part's shape and place, and every colour */
export const look = (s: RobotSpecification) => createHash("sha256").update(JSON.stringify([s.links.map((l) => [l.name, l.geometry, l.material]), s.joints.map((j) => [j.parent, j.child, j.origin]), s.materials.map((m) => [m.name, m.color.map((c) => +c.toFixed(3))])])).digest("hex").slice(0, 16);
const out: Record<string, string> = {};
for (const p of JSON.parse(process.argv[2] ?? "[]") as string[]) out[p] = look((await generateRobot(p)).robot);
console.log(JSON.stringify(out));
