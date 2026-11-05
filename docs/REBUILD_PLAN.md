# Rebuild plan: real CAD, an Arduino mode, price tiers

Status: started 2026-11-05. Each step lands on `main` when its tests pass.

Done: step 1 (kernel, `packages/kernel`, tests in `tests/kernel.test.ts`).

## Why

- Printed parts are built by a mesh CSG engine (manifold-3d) from boxes, cylinders and hulls: no fillets,
  no shells, no STEP files, so parts look blocky and cannot be opened as solids in Fusion / FreeCAD.
- The engine leaks WASM memory (about 35 MB per robot design), which crashes long test runs.
- Designers pick capable parts (DYNAMIXEL, CubeMars, LiPo) that are expensive. Most people asking for a
  robot want the cheapest version that works, on an Arduino.

## Stack

| Layer | Now | After |
|---|---|---|
| Part modelling | manifold-3d mesh CSG | **Replicad** (OpenCascade B-rep, WASM): fillets, chamfers, shells, lofts, STEP export |
| Print meshes | manifold-3d | OpenCascade mesher, welded and validated by manifold-3d (watertight, single solid) |
| Runs in | browser + Node | browser + Node (both kernels are WASM; no server needed for GitHub Pages) |
| Designers, URDF, ROS 2, MuJoCo | TypeScript / Python | unchanged |

Spike (2026-11-05, Node 22): OpenCascade init 0.17 s, booleans and fillets 20-90 ms each; a filleted SG90
bracket exported to STEP (Fusion-readable) and to an STL that welds into a closed solid (genus 2 = its two
screw holes, volume identical to the B-rep). Fillets that the kernel rejects fall back to the sharp edge.

## Arduino mode (a button in the web app, `--arduino` in the CLI)

Every robot is built from cheap, common, Arduino-compatible parts:
Arduino Uno / Nano / Mega (clone prices), SG90 / MG90S / MG996R / DS3218 servos on a PCA9685,
TT gear motors on a TB6612FNG or L298N, HC-SR04, IR line sensors, WS2812 LEDs, 2S 18650 pack + buck.

The result is **price tiers**, not one robot:

- **Cheapest that works** - lowest-cost parts that still pass every load, speed, power and print check.
- **Balanced** - metal-gear servos / better drivers where they buy margin or life.
- **Best on Arduino** - strongest parts the Arduino ecosystem offers.

When the request cannot be met at a price or with named parts, the result says what can:
"a wearable Mark 43 suit cannot move on hobby servos; at this budget: motorised helmet (faceplate on two
MG90S, LED eyes) + arc reactor + repulsor gloves, $XX".

## Order of work

1. Replicad kernel package: part programs -> B-rep -> STEP + welded STL; fillet fallback; memory freed.
2. Arduino parts catalog: clone boards, TT motor, TB6612FNG, L298N, HC-SR04, 18650 2S pack, WS2812,
   with dimensions, hole patterns, prices (uncertain values flagged, as the catalog already does).
3. Arduino mode + price tiers in the generator, CLI flag, web button and tier picker.
4. Designers rebuilt on the kernel, Arduino first: desk arm, 2WD/4WD car, WALL-E, Mark 43 (helmet ->
   armour pieces -> full suit tiers, each with what it can and cannot do).
5. Remaining designers moved to the kernel; examples, GIFs and README regenerated from the new designs.
6. New web UI: a bento card dashboard (rounded cards, slim icon sidebar, pill badges, soft depth) in green
   and black, with the Arduino button and the price-tier picker built in.

## Privacy (kept, and said on the page)

- Robots are generated in the user's browser; the static site has no server that could receive them.
- Designs are kept in the browser's own storage. A share link carries the design after `#` in the URL,
  which browsers never send to a server.
- A public gallery / blog of designs is opt-in only: a design leaves the device when its owner presses
  Publish, and can be unpublished. That needs a small storage backend, designed as its own step.
