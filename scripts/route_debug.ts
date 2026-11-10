// Design examples from their prompts and run the harness checks on the result, with the router's own problem list.
//   node scripts/route_debug.ts 18_arduino_car [more]     SHOW=W4,W8 prints those wires corner by corner; SLICE="x,y,z,axis,half" prints a slice of the grid
import { readFileSync, writeFileSync } from "node:fs";
import { generateRobot } from "@ttr/robot-generator";
import { wiring3d, checkHarness } from "@ttr/design";
(globalThis as any).TTR_ROUTE_DEBUG = true;
(globalThis as any).TTR_ROUTE_SLICE = (process.env.SLICE ?? '').split(';').filter(Boolean).map((x) => x.split(',').map(Number));
import { mkdirSync } from "node:fs";
mkdirSync("out/route-debug", { recursive: true });
for (const ex of process.argv.slice(2)) {
  const t0 = Date.now(), res = await generateRobot(readFileSync(`examples/${ex}/prompt.txt`, "utf8"));
  const s = (res as any).spec ?? (res as any).robot, d = s.metadata.design, w = d.wiring;
  writeFileSync(`out/route-debug/${ex}.json`, JSON.stringify(s));
  const t1 = Date.now(), h = wiring3d(s), c = checkHarness(s, w, h);
  console.log(ex, `design ${t1 - t0} ms, check ${Date.now() - t1} ms`, JSON.stringify(c.checked.skipped), "wires", h.wires.length, "THROUGH", c.through.length, `${c.through.reduce((a, x) => a + x.run_mm, 0)} mm`, "BEND", c.bend.length, "LENGTH", c.length.length, "clips", w.clips.length, "notes", h.notes.length);
  for (const k of d.checks) if (!k.pass) console.log("  FAIL", k.name, k.detail.slice(0, 1500));
  const by: Record<string, number> = {}; for (const t of c.through) by[t.link] = (by[t.link] ?? 0) + 1;
  console.log("  through by solid", JSON.stringify(by));
  console.log("  through", JSON.stringify(c.through.slice(0, 6)));
  console.log("  bend", JSON.stringify(c.bend.slice(0, 12).map((b: any) => b.wire + ":" + b.radius_mm)));
  console.log("  length", JSON.stringify(c.length.slice(0, 6)));
  const show = (process.env.SHOW ?? "").split(",").filter(Boolean);
  for (const cb of w.cables) for (const x of cb.wires) if (show.includes(x.id)) { const on = x.on.flatMap(([l, n]: [string, number]) => Array.from({ length: n }, () => l)); console.log("  ", x.id, cb.label, x.from, "->", x.to, "R", x.bend_mm, "\n     " + x.pts.map((p: number[], i: number) => { const a = x.pts[i - 1], b = x.pts[i + 1]; let t = ""; if (a && b) { const u = [0, 1, 2].map((k) => p[k] - a[k]), v = [0, 1, 2].map((k) => b[k] - p[k]), lu = Math.hypot(...u), lv = Math.hypot(...v); t = ` turn ${Math.round(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)))) * 57.3)} legs ${lu.toFixed(1)} ${lv.toFixed(1)}`; } return `${on[i].slice(0, 10)}:${p.join(",")}${t}`; }).join("\n     ")); }
}
