<img src="brand/mark.png" alt="" width="56" align="right">

# Performance

How long Text to Robot takes to make a robot in the browser, where that time goes, and what I did about it. The rule for every
change here: the robot that comes out is the same, byte for byte, and the visitor's device is never frozen or crashed.

## Before and after

Generate pressed to the robot on screen / to its 3D harness laid, in seconds, for the eight timing prompts, measured with
`scripts/bench_site.py` on the final static build against main as it was when it landed (088b03a), both built with `deploy/build-pages.sh`. Headless Chromium on this machine (20
cores), its GPU emulated in software (SwiftShader) with GPU compositing. **Cold** is a fresh browser profile: nothing cached
(the page designs its default robot, the 6 DOF arm, on load, so the arm's prompt is answered from that); **warm** is the same
prompt again in a new tab of the same profile. The old site kept no results, so its warm runs are its cold ones. On screen
means every part drawn and the frame shown (two animation frames after the page drew it).

**Desktop** (the device plan gives 6 workers):

| Prompt | Before | After, cold | After, warm | Longest main-thread task, before / after |
|---|--:|--:|--:|--:|
| arm | 2.6 / 16.9 | 1.0 / 8.3 | 1.6 / 1.6 | 934 / 197 ms |
| rover | 17.1 / 45.5 | 13.0 / 25.0 | 2.5 / 2.5 | 810 / 128 ms |
| quadruped | 7.7 / 18.4 | 7.3 / 10.1 | 2.4 / 2.4 | 785 / 641 ms |
| humanoid | 26.8 / 204 | 25.1 / 77.7 | 2.5 / 2.5 | 704 / 616 ms |
| battle mech | 54.2 / 470 | 43.2 / 170 | 1.7 / 1.7 | 510 / 600 ms |
| Arduino car | 50.0 / 107 | 53.6 / 60.8 | 2.0 / 2.0 | 763 / 605 ms |
| quadcopter | 3.6 / 12.6 | 4.6 / 7.6 | 1.8 / 1.8 | 964 / 798 ms |
| Mark 43 reference | 47.9 / 47.9 | 51.2 / 51.2 | 60.0 / 60.0 | 3574 / 4143 ms |

**Low-end**: the page's main thread throttled 4x by DevTools (Chromium refuses CPU throttling for workers, so they ran at full
speed), 2 GB of device memory, 4 cores and a touch screen reported, so the plan is one worker and the light schedule:

| Prompt | Before | After, cold | After, warm | Longest main-thread task, before / after |
|---|--:|--:|--:|--:|
| arm | 4.3 / 17.6 | 3.1 / 7.5 | 1.6 / 1.6 | 1850 / 340 ms |
| rover | 18.2 / 46.0 | 15.5 / 24.8 | 3.5 / 3.5 | 765 / 319 ms |
| quadcopter | 4.3 / 13.2 | 6.3 / 7.9 | 2.6 / 2.7 | 764 / 296 ms |

(The low-end runs are the three smallest timing prompts: at 4x on the main thread the big robots take most of an hour each.)

What these show:

- **The 3D harness** comes 2 to 3 times sooner on every robot that has one (the battle mech's from 7.8 minutes to 2.8, the
  humanoid's from 3.4 minutes to 1.3). That was the longest wait: the router's search, and the second pass finding the first
  pass's parts.
- **Warm**, every prompt but the Mark 43 is on screen with its harness in 1.6 to 2.5 s, whatever the robot: the answer comes
  from the cache. The Mark 43 reference suit is designed again (its armour comes from the forge, whose answer is not kept),
  as before.
- **Cold, robot on screen**: about the same or a little sooner. On this emulated GPU the picture is the slow part, and the
  page no longer queues frames behind the GPU, so a few small robots come a second later while the main thread stays free.
  On a real GPU a frame takes milliseconds.
- **The main thread**: the longest task fell on most robots, most of all on the low-end profile (1.85 s to 0.34 s for the
  arm), but not under 0.2 s everywhere: what is left is WebGL itself on a software GPU (three.js asks whether a shader
  program linked, a call that waits for the GPU) and, for the Mark 43, its 434 parts arriving at once.

## Where the time went (before)

Measured with Node's CPU profiler on the engine as it was (main at 63d2f99), one fresh process per prompt as each website
worker is. The first pass is the robot on screen; the website then designs it a second time with the 3D harness.

| Prompt | First pass | Where |
|---|--:|---|
| arm | 5.3 s | printed parts' solids 4.3 s (2.4 s for the meshes, then 1.8 s evaluating the same solids again for their print checks), clearance sweeps 1.0 s, wiring 0.5 s |
| rover | 6.5 s | printed solids 5.3 s (3.2 + 2.1 again), wiring 1.0 s, clearance 0.8 s |
| quadruped | 2.6 s | printed solids 1.9 s (1.3 + 0.6 again), clearance 0.8 s, wiring 0.6 s |
| humanoid | 10.4 s | printed solids 5.6 s (3.4 + 2.2 again), clearance 2.9 s, bounding boxes of parts cut to the bed 1.6 s, wiring 0.9 s |
| battle mech | 20.7 s | printed solids 11.6 s (7.1 + 4.5 again), clearance 4.8 s, part bounding boxes 3.7 s, wiring 2.5 s |
| Arduino car | 16.6 s | CAD parts on OpenCascade 15.6 s (meshing 5.5 s, the exact bounding box 5.1 s, booleans and fillets 3.9 s, weld 0.8 s, STEP 0.3 s), wiring 2.7 s |
| quadcopter | 0.9 s | printed solids 0.6 s (0.4 + 0.2 again), wiring 0.2 s |
| Mark 43 reference | 14.3 s | CAD parts 12.2 s (the armour fittings), armour meshes 0.7 s |

The second pass, the 3D harness, was the longest wait: 72 s for the humanoid in Node, 58.5 s of it (81 %) in the router's A*
search; the battle mech took about seven minutes on the website. In the downloads, the CAD package of the battle mech took
17.7 s, 10 s of it the breadboard drawing's maze router.

The biggest costs, in order, and what I did with each:

1. **The router's A* search** (most of every harness pass): the same search, rewritten to keep its buffers and test each cube's
   neighbours once. On the humanoid's 359 recorded searches it takes 19.0 s instead of 115.9 s (same machine, same run), with
   every path identical.
2. **Printed parts' solids evaluated twice** (about a third of every first pass): once now, for both the mesh and the check.
3. **The second pass designing everything again**: it now finds every part the first pass built in the cache.
4. **The breadboard drawing's maze router** (most of a big robot's CAD download): the same routes, with typed-array heaps and
   reused buffers.
5. **OpenCascade CAD parts** (the Arduino car, the Mark 43): pure single-threaded kernel work on parts the designer needs one at
   a time; nothing in their result may change, so they are kept in the cache and built once per engine version.
6. **Clearance sweeps**: exact, and they set the joint limits; left as they are.

## Stage by stage now

`node scripts/profile_engine.ts --cache <dir>`, cold (the cache empty when each prompt starts; the second pass finds what the
first made, as on the website), Node 22 on the same machine. Seconds; the top three stages of each pass.

| Prompt | First pass | Its biggest stages | 3D harness pass | Its biggest stages | Downloads |
|---|--:|---|--:|---|--:|
| arm | 4.6 | printed solids 2.6, clearance checks 1.3, design 0.4 | 2.6 | clearance checks 1.1, harness grid 0.8, design 0.4 | 0.9 |
| rover | 5.3 | printed solids 2.6, design 1.2, clearance checks 1.1 | 6.6 | harness routing 3.4, design 1.0, clearance checks 0.9 | 1.9 |
| quadruped | 2.7 | clearance checks 1.0, printed solids 1.0, design 0.4 | 3.0 | clearance checks 1.1, harness routing 0.9, harness grid 0.4 | 1.4 |
| humanoid | 9.9 | printed solids 4.6, clearance checks 3.8, design 1.1 | 29.5 | harness routing 23.0, clearance checks 4.0, design 0.9 | 4.4 |
| battle mech | 19.3 | printed solids 10.2, clearance checks 6.2, design 2.1 | 64.2 | harness routing 51.5, clearance checks 6.7, design 2.1 | 21.4 |
| Arduino car | 23.1 | CAD parts 21.3, clearance checks 0.6, wiring 0.5 | 7.5 | CAD parts 6.0, design 0.4, wiring 0.3 | 0.8 |
| quadcopter | 0.9 | printed solids 0.3, clearance checks 0.2, design 0.2 | 2.2 | harness routing 1.3, harness grid 0.3, wiring 0.2 | 0.5 |
| Mark 43 reference | 19.7 | CAD parts 15.1, design 3.3, mesh files 1.0 | 3.5 | design 3.2, wiring 0.1, validate, URDF, BOM 0.1 | 10.1 |

The downloads column is the routed robot's CAD, ROS 2 and training packages and its meshes, made by a fresh engine worker that
finds its parts in the cache. The battle mech's CAD package was measured before the breadboard router's rewrite: 20.1 s of
its 21.4 s; after it, 8.2 s for the CAD package alone.

Warm (every result in the cache; Node has no whole-answer cache, so the designers still run): first pass 0.7 s (quadcopter) to
12.1 s (battle mech), the clearance sweeps now most of it. On the website a warm prompt is answered whole from the cache.

## What runs where

Pressing Generate on the website runs three kinds of work, each off the page's main thread:

1. **The first pass** (the engine worker): the prompt is read, the robot designed from parts with its wires as straight runs,
   checked, and its meshes sent to the 3D view. This is "robot on screen".
2. **The 3D harness pass** (the wiring worker): the same prompt designed again with every wire laid through free space, its
   checks run again on the new wires, and the result swapped in place. This is "routed".
3. **Downloads**, only when asked for: the CAD, ROS 2 and training packages, drawings and meshes.

## The device plan

`apps/web/src/device.ts` sizes the work to the device from what the browser reports:

| | |
|---|---|
| workers | `navigator.hardwareConcurrency - 1`, at least 1, at most 6 |
| memory | 4 GB or less (`navigator.deviceMemory`): at most 2 workers; 2 GB or less: 1 |
| light schedule | a coarse pointer with 4 GB or less (a phone or small tablet), or a battery under 20 % and not charging: no spare worker started ahead, and the 3D harness pass waits while the page is hidden |
| back-off | a worker that dies (out of memory) is replaced and the tab runs one worker fewer from then on, never fewer than one, so it cannot fall into a crash loop; the page's JS heap over 75 % of its limit (`performance.memory`) and, on a cross-origin isolated page, the tab over half the device's memory (`performance.measureUserAgentSpecificMemory`) count as pressure too |

The engine worker is one worker; the wiring worker is the second (with one worker the engine lays the harness itself, after
the robot); what is left (`workers - 2`, at most 4) are helpers shared by the armour forge and the parts pool. Helpers start
with their first job and end when idle, so a visitor who never needs them never holds their memory. `?workers=N` caps the
plan for a test; the page reports it as `ttrStatic.plan()`.

## What makes it faster without changing the output

- **Each printed part's solid is built once.** A printed part's mesh and its print check used to evaluate the same CSG
  program twice; now one evaluation gives both. Identical parts (four legs, two arms, a part a sizing loop builds again) are
  built once per design (`@ttr/parts/memo`).
- **A persistent cache** (`apps/web/src/result-cache.ts`, IndexedDB): printed solids, CAD part files, part boxes and whole
  answers to deterministic requests, keyed by a SHA-256 of the engine's build hash and the exact input. The build hash
  (`deploy/build-pages.sh`) covers the engine's sources, the Python helpers its exports embed and the locked dependencies (the
  WebAssembly kernels), so a changed engine never reads an older engine's results. Every entry stores its input and a hit is
  only taken when it equals the asked input. Size: the smaller of 200 MB and a tenth of `navigator.storage.estimate()`'s
  quota, least recently used out first. Private mode or a full disk: the engine runs as if there were no cache.
- **The 3D harness pass finds the first pass's parts.** It starts once the first pass's results are in the cache and reads
  them, so it builds only the parts its clips cut into.
- **The wiring worker starts while the first pass works**, so its kernels have loaded when the robot is on screen.
- **The router's search is faster**, the same search: a cube's cost so far in reused float32 buffers with generation stamps
  instead of three fresh arrays per search, the six face neighbours tested once per cube instead of up to three times per
  diagonal step, the compartment test as index ranges. The circuit drawings' maze router (the breadboard view) likewise keeps
  its buffers and a typed-array heap with the same moves. `tests/route-search.test.ts` keeps both old routers and holds the
  new ones to them, path for path, on random grids.
- **Parts built ahead on helpers.** Where a robot's parts are known before the work that needs them (a robot opened from a
  link, a file or the history, the routed robot when it arrives, an export), the parts pool builds the ones not cached yet in
  parallel, one helper per spare core.

## WebAssembly SIMD

Feature-detected (`WebAssembly.validate` on the smallest module with a v128 instruction). There is nothing to switch between:
the OpenCascade kernel (replicad-opencascadejs 1.1.0) ships only as a SIMD build, and manifold-3d 3.5.4 only without SIMD
(checked with wabt). A browser without SIMD could never start the engine; it now says so plainly instead of failing.

## Safety

- The page's main thread does no designing: the engine and every helper are workers.
- **The 3D view does not queue frames behind the GPU.** Each frame leaves a WebGL fence, and a frame is drawn only while
  fewer than two are still on the GPU (polled once a frame, never waited on; a lost context or a frame older than 3 s is let
  go). A frame held back still moves the camera and the parts, so picking and dragging work on where things are. New part
  geometry goes to the GPU up to 96 MB a frame. Before, a slow GPU received frame after frame and the page
  blocked behind them: up to 2.2 s at a time while the Mark 43's 434 parts streamed in (headless Chromium on SwiftShader),
  and 0.5 to 1.6 s on every other robot.
- **New shaders compile in the background.** The first time a material is drawn, three.js asks the GPU whether its shader
  program linked, which blocks the page until the GPU has done it (up to a second on a software GPU, the longest task left in
  the traces). A frame with a material not drawn before now waits, without blocking, until `renderer.compileAsync` reports
  its program ready (`KHR_parallel_shader_compile`, polled once a frame; at most 3 s, and each material is waited for once).
  The picture is the same; the robot comes in the frame after its shaders are ready.
- **Cancel** (beside Generate while it works, and **Stop** on the 3D harness note) ends every worker of the tab at once and
  starts a fresh engine; the robot on screen stays.
- Never more workers than the plan: the engine, the wiring worker (or its spare) and the helpers' budget add up to it.
- No busy loops: waits are events or timers.

## Quality

`tests/speed-identical.test.ts` designs and exports every prompt four ways, each in a fresh process: no pool and no cache, the
parts pool building every part of the routed robot on worker threads, a warm cache, and both. Every output must be
byte-identical: URDF, xacro, the robot record with its check results and wiring record, BOM, every mesh STL, the CAD package
(print STLs, STEP, drawings, the electronics GLB), the ROS 2 and training packages. A STEP file's header (its time stamp and the
translator's count of models written in that process) is the only allowance, the same one `scripts/check_site.py` makes.
For an example's prompt it also holds the robot record, URDF, BOM and every mesh to the files in its `examples/` folder,
which the engine made before any of these changes. `npm test` runs four prompts; `TTR_SPEED_FULL=1` runs all 24 examples and
seven open prompts. `tests/example-prompts.test.ts` regenerates every example's robot record in one process, where the
in-memory results are shared from robot to robot.

Result on the final code (`TTR_SPEED_FULL=1`, 28 minutes): 31 of 31 prompts identical in all four runs, and all 24 examples
identical to their shipped files (robot record, URDF, BOM and every mesh).

**Across versions** (`scripts/xver/`: the same prompts through the old engine and the new, each pass in a process of its own
as each website worker is, every output file compared byte for byte): against main before these changes (63d2f99), 236 of
236 prompts identical on the first pass and the Arduino options with every export (15,303 files), and 12 of 12 with the 3D
harness and every export (2,196 files); against main after rebasing onto it (311049c), 41 of 41 prompts identical (all 24
examples, seven open prompts and every twentieth prompt of the launch-audit corpus; 1,759 files). Left out: the seven prompts
that forge a new Mark 43 armour shape (40 minutes or more each in Node on either version; the forge is unchanged here).

## Measuring

    node --max-old-space-size=8192 scripts/profile_engine.ts       (the stage breakdown, Node; out/profile/engine.json)
    deploy/build-pages.sh pages-dist
    python scripts/bench_site.py                                   (Generate to robot on screen and routed, cold and warm)
    python scripts/bench_site.py --profile lowend                  (main thread 4x slower, 2 GB, 4 cores, a touch screen)
    cp scripts/xver/*.ts scripts/xver/*.py out/ && node out/xver.ts <label> quick,arduino   (in each version's checkout;
    python3 out/xver-compare.py <old .jsonl> <new .jsonl> out/xver/prompts.json            then compare the two)

`bench_site.py` fails a run on any main-thread long task over 200 ms, a page error or a crashed tab. It runs Chromium with GPU
compositing on SwiftShader, as any device with WebGL composites; the headless shell's default composites in software and reads
every WebGL frame back on the main thread (`--software-compositing`), which blocks it for as long as the frame takes to draw.
DevTools CPU throttling reaches only the page's main thread (Chromium refuses it for workers), so the low-end profile's workers
run at full speed; its 2 GB puts the whole design on one worker.
