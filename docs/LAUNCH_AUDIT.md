# Launch audit

I audited the website at https://megazron.github.io/text-to-robot/ before launch: every example prompt and 213 more, every button and control on a desktop and a phone screen, every file it generates, its speed and memory over a long session, and every claim the README and the site make. This page has every case with its real result. Where something was wrong I fixed it and say how; what is still wrong is listed with its severity.

Audited on 2026-11-09 against main at 327f92a (the commit the live site was built from; my local build was byte-identical to the live files). Fixes are on the `launch-audit` branch and were pushed to main as listed under [Bugs fixed](#bugs-fixed).

## Recommendation

**No-go as the live site stood (327f92a). Go once the fixes below are deployed and two blockers are cleared.**

The live site would have lost a visitor's tab after a few dozen designs (memory), handed out ROS 2 packages whose display launch file fails on ROS 2 Jazzy, training scaffolds that crash on reset for the SCARA and the gripper, a URDF MuJoCo refuses (EVA), and it built the wrong robot or said something untrue for about one prompt in five of the harder ones. All of that is fixed on the branch and checked on the fixed build: 30 of the 31 prompts I re-ran on the fixed build now come out right (the one left is slang I did not add), 80 designs in one tab run without a failure, all 19 ROS 2 packages build and launch, all 19 training scaffolds run in MuJoCo and PyBullet, all 44 STEP files are valid solids, and every parts list adds up.

Blockers before launch:

1. **CI must be green on main.** It was red at 327f92a on the Mark 43 film check (3 hits); the forge owner's 8bf0877 fixes that check, and this branch is rebased on it. See [Gates](#gates) for the run after my push.
2. **The Mark 43 must not start a 25 to 65 minute, up to 6 GB forge on one tap without warning.** The "Suit" stop on the dial and the "Iron Man Mark 43 suit" example chip do exactly that. Either ask first (with the real time and memory), or ship the default suit precomputed so the first one opens at once. I did not see a forge finish in this audit.

Not blockers, but worth doing soon: the same memory leak in the Node API server and the `engine/v1` API (item 3 under [Bugs remaining](#bugs-remaining)), the arm designer's undersized power supplies (item 4), and the quick start's self-collision test that fails on the arm it builds (item 5).

## How I tested

- **The real site.** `deploy/build-pages.sh` from 327f92a gives the same bytes as the live site (`index.html`, `app.js`, `browser-api.js`, `browser-engine.js`, `forge-worker.js`, `engine/v1/engine.js`, `vendor/three.module.js` all hash-identical). I served that build locally and drove it in headless Chromium with Playwright, typing each prompt into the prompt bar and pressing Generate, exactly as a visitor does. Third-party requests were blocked and logged.
- **One tab for the whole corpus,** like one visitor trying many prompts. Mark 43 prompts each got their own tab, since the tab forges the armour for 25 to 65 minutes.
- **The fixed build** (`pages-test`, built from the branch) for every prompt that was wrong, for an 80-design session in one tab, for the controls and for the downloads.
- **Files** were checked with ROS 2 Jazzy (`check_urdf`, `xacro`, `colcon build`, `ros2 launch` under Xvfb), OpenCascade (OCP) for STEP, trimesh for STL, MuJoCo 3.13.0 and PyBullet for the training scaffold, and a script for the parts list arithmetic and its links.
- **The machine** is shared with a long Blender render and other agents (load average 25 to 38 on 20 cores during the run), and the browser renders with software GL (SwiftShader). Times here are therefore slow and long tasks long; I give them as measured. A real-GPU Chrome check is in [Performance](#performance-and-stability).

Verdicts: **PASS** right robot, honest notes; **PASS\*** works, with a caveat that is listed under remaining bugs; **FIXED** wrong on the live site, fixed on the branch and checked on the fixed build; **PARTIAL** the Mark 43 forge started and reported progress but was not run to the end; **FAIL** still wrong.

## Prompts

232 prompts went through the live site: the 19 example prompts, the three dial prompts that are not examples, 33 paraphrases, 10 vague prompts, 25 prompts with numbers, units and budgets, 10 contradictions, 10 impossible or unsafe requests, 16 out-of-scope robots, 15 prompts in Hindi, Urdu, Spanish, German, French, Japanese and Chinese, 14 with typos, slang and emoji, 3 very long ones, 13 empty or injection-style inputs, 19 README modifiers, 11 Mark 43 shape and paint prompts, 12 with the Arduino switch on, and the 19 template chips.

| Verdict | Prompts |
|---|--:|
| PASS | 143 |
| PASS* | 11 |
| FIXED | 53 |
| PARTIAL | 18 |
| FAIL | 7 |

**FIXED** rows were wrong on the live site. The second table runs 31 of them again on the fixed build, in the browser: all come out right except "robo dawg", which I left as a known gap. The parser and design fixes behind the others are test cases in `tests/launch-audit.test.ts`; the site-only ones (the empty prompt, the Arduino messages, the tab crashes) were checked in the controls run and the long session. No prompt hung, none executed markup (no dialog, no injected element, names are sanitised), and no request left the page while designing. Three prompts crashed the tab on the live site; that was the memory leak in [Performance](#performance-and-stability), and all three run on the fixed build.

The Mark 43 rows are **PARTIAL** because forging the armour in the tab takes 25 minutes in Chrome on a laptop and about 65 minutes in headless Chromium here; I checked that every Mark 43 prompt starts the forge and reports progress within 30 to 40 seconds, and checked the shape and paint words in Node.

### Every prompt on the live site

| # | Category | Prompt | Live site result | Time | Verdict | Notes |
|--:|---|---|---|--:|---|---|
| 1 | example | Create a 2 DOF robotic arm | 2-DOF serial arm · parallel gripper | 7 s | PASS | right family |
| 2 | example | Create a 6 DOF robotic arm with a parallel gripper | 6-DOF serial arm · parallel gripper | 1 s | PASS | right family |
| 3 | example | Create a 7 DOF robotic arm with a two-finger gripper | 7-DOF serial arm · parallel gripper | 19 s | PASS | right family |
| 4 | example | Create a SCARA robot | SCARA · parallel gripper | 10 s | PASS | right family |
| 5 | example | Create a differential drive mobile robot | differential-drive base · lidar (base_link) · imu (base_link) | 10 s | PASS | right family |
| 6 | example | Create a four-wheel robot | four-wheel skid-steer base · lidar (upper_deck) · camera (base_link) · imu (upper_deck) | 5 s | PASS | right family |
| 7 | example | Create a mecanum-wheel robot | mecanum-wheel base · lidar (base_link) · imu (base_link) | 5 s | PASS | right family |
| 8 | example | Create a small humanoid robot with a torso, head, two arms and two-finger grippers | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) (+1 note) | 50 s | PASS | right family; notes shown are honest |
| 9 | example | Create a two-finger parallel gripper | standalone parallel gripper · parallel gripper | 3 s | FIXED | live: 'standalone parallel gripper · parallel gripper'; fixed: said once. Fixed build: standalone parallel gripper |
| 10 | example | Create a quadruped robot | quadruped · imu (base_link) · camera (base_link) | 10 s | PASS | right family |
| 11 | example | Build a six-legged reconnaissance spider-bot with a LiDAR turret, budget $1500 | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) · budget $1500 | 29 s | PASS | right family |
| 12 | example | Design a Mars rover with four wheels and a 6 DOF sampling arm, RGB-D camera, budget $4000 | mobile manipulator (wheeled rover + arm) · parallel gripper · depth (deck_lid) · camera (deck_lid) · budget $4000 | 25 s | PASS | right family |
| 13 | example | Create a humanoid battle mech with two 7 DOF arms, a head camera and an IMU | humanoid battle mech · imu (base_link) · camera (neck_pan_link) | 73 s | PASS | right family |
| 14 | example | Build me a movie-accurate wearable Iron Man Mark 43 suit from Age of Ultron with all the small polygon armour  ... (180 characters) | forge started, first progress at 40.9 s | 101 s | PARTIAL | forge starts and reports progress (first message after ~30-40 s); the full suit was not forged in this audit (25 min in Chrome on a laptop, about 65 min headless here); see Mark 43 section |
| 15 | example | Build WALL-E: a tracked trash-compactor robot with a telescoping neck, binocular eyes and two gripper arms | WALL-E character · range (body) (+1 note) | 278 s | PASS | right family; notes shown are honest |
| 16 | example | Build EVA, a sleek hovering egg-shaped droid with a visor and two floating arms | EVA character · imu (base_link) · camera (head) | 16 s | PASS | right family |
| 17 | example | Build Baymax, an inflatable healthcare companion robot | Baymax character · imu (base_link) · camera (head) | 12 s | PASS | right family |
| 18 | example | An Arduino 4WD obstacle avoiding car with an ultrasonic sensor | Arduino car (4WD) · range (sensor_bracket) (+2 notes) | 53 s | FIXED | live: false conflict ('4wd asks for a wheeled base') and 'ultrasonic not applied' although the car carries one; fixed. Fixed build: Arduino car (4WD) · range (sensor_bracket) |
| 19 | example | A cheap Arduino robot arm with a claw | Arduino desk arm (3 DOF + claw) · no gripper (+1 note) | 194 s | FIXED | live: claims 'no gripper' and a false conflict ('arm asks for a arm'); fixed: 'one-servo claw', no conflict. Fixed build: Arduino desk arm (3 DOF + claw) |
| 20 | dial | An obstacle avoiding robot car | differential-drive base · lidar (base_link) · imu (base_link) | 10 s | PASS | the dial's Car builds a lidar diff-drive base, not the Arduino obstacle car; reasonable, but the obstacle sensor is a lidar |
| 21 | dial | WALL-E | WALL-E character · range (body) | 22 s | PASS | right family |
| 22 | dial | Iron Man Mark 43 suit | forge started, first progress at 37.3 s | 98 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 23 | paraphrase | make me a six axis robot arm that has a gripper | 6-DOF serial arm · parallel gripper | 22 s | PASS | right family |
| 24 | paraphrase | I need a robotic arm with 6 joints and a claw | 6-DOF serial arm · parallel gripper | 4 s | PASS | 'claw' built as a parallel gripper; not stated |
| 25 | paraphrase | 6dof manipulator w/ parallel jaw gripper | 6-DOF serial arm · parallel gripper | 5 s | PASS | right family |
| 26 | paraphrase | Build a 6-axis industrial-style arm | 6-DOF serial arm · parallel gripper | 5 s | PASS | right family |
| 27 | paraphrase | a two wheeled differential drive robot | differential-drive base · lidar (base_link) · imu (base_link) | 3 s | PASS | right family |
| 28 | paraphrase | a small diff drive rover base with two motors | differential-drive base · lidar (base_link) · imu (base_link) (+1 note) | 5 s | PASS | right family; notes shown are honest |
| 29 | paraphrase | robot that drives on two wheels and a caster | differential-drive base · lidar (base_link) · imu (base_link) | 2 s | PASS | right family |
| 30 | paraphrase | a 4 wheel robot car | four-wheel skid-steer base · lidar (upper_deck) · camera (base_link) · imu (upper_deck) | 6 s | PASS | right family |
| 31 | paraphrase | a four wheeled skid steer platform | four-wheel skid-steer base · lidar (upper_deck) · camera (base_link) · imu (upper_deck) | 2 s | PASS | right family |
| 32 | paraphrase | an omnidirectional robot with mecanum wheels | mecanum-wheel base · lidar (base_link) · imu (base_link) | 4 s | PASS | right family |
| 33 | paraphrase | mecanum base that can strafe | mecanum-wheel base · lidar (base_link) · imu (base_link) | 3 s | PASS | right family |
| 34 | paraphrase | a robot dog | quadruped · imu (base_link) · camera (base_link) | 14 s | PASS | right family |
| 35 | paraphrase | a four legged walking robot | quadruped · imu (base_link) · camera (base_link) | 12 s | PASS | right family |
| 36 | paraphrase | quadruped like Spot | quadruped · imu (base_link) · camera (base_link) | 7 s | PASS | right family |
| 37 | paraphrase | a hexapod | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) | 18 s | PASS | right family |
| 38 | paraphrase | a six legged spider robot | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) | 18 s | PASS | right family |
| 39 | paraphrase | a 6-legged walker | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) | 17 s | PASS | right family |
| 40 | paraphrase | a bipedal humanoid robot | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) | 37 s | PASS | right family |
| 41 | paraphrase | a robot that walks on two legs with two arms and a head | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) | 17 s | PASS | right family |
| 42 | paraphrase | a scara arm for pick and place | SCARA · suction gripper | 4 s | PASS | right family |
| 43 | paraphrase | selective compliance assembly robot arm | 6-DOF serial arm · parallel gripper | 4 s | FIXED | live: built a 6-DOF arm (the expansion of SCARA was not known); fixed: SCARA. Fixed build: SCARA · parallel gripper |
| 44 | paraphrase | just a gripper | standalone parallel gripper · parallel gripper | 4 s | FIXED | live: 'standalone parallel gripper · parallel gripper'; fixed: said once |
| 45 | paraphrase | a two finger robot gripper for my arm | 6-DOF serial arm · parallel gripper | 1 s | FIXED | live: built a 6-DOF arm (the arm the gripper is for); fixed: standalone gripper. Fixed build: standalone parallel gripper |
| 46 | paraphrase | a mobile manipulator | mobile manipulator (wheeled rover + arm) · parallel gripper · depth (deck_lid) · camera (deck_lid) · imu (base_link) (+1 note) | 20 s | FIXED | live: default mobile manipulator failed its own vent check (75.9 of 83.4 cm^2); fixed: vents sized from the heat. Fixed build: mobile manipulator (wheeled rover + arm) · parallel gripper · depth (deck_lid) · camera (deck_lid) · imu (base_link) |
| 47 | paraphrase | a wheeled robot with an arm on top | mobile manipulator (wheeled rover + arm) · parallel gripper · depth (deck_lid) · camera (deck_lid) · imu (base_link) (+1 note) | 11 s | FIXED | live: default mobile manipulator failed its own vent check (75.9 of 83.4 cm^2); fixed: vents sized from the heat |
| 48 | paraphrase | a rover with a robotic arm | mobile manipulator (wheeled rover + arm) · parallel gripper · depth (deck_lid) · camera (deck_lid) · imu (base_link) (+1 note) | 4 s | FIXED | live: default mobile manipulator failed its own vent check (75.9 of 83.4 cm^2); fixed: vents sized from the heat |
| 49 | paraphrase | a cobot | 6-DOF serial arm · parallel gripper | 12 s | PASS | right family |
| 50 | paraphrase | a collaborative robot arm like a UR5 | 6-DOF serial arm · parallel gripper | 4 s | PASS | right family |
| 51 | paraphrase | wall-e robot | WALL-E character · range (body) | 270 s | PASS | right family |
| 52 | paraphrase | EVA from Wall-E | WALL-E character · range (body) | 16 s | FIXED | live: built WALL-E; fixed: EVA. Fixed build: EVA character · imu (base_link) · camera (head) |
| 53 | paraphrase | baymax | Baymax character · imu (base_link) · camera (head) | 21 s | PASS | right family |
| 54 | paraphrase | Iron Man suit | forge started, first progress at 29.5 s | 90 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 55 | paraphrase | an iron man mark 43 armour | forge started, first progress at 29.2 s | 90 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 56 | vague | a cool robot | refused: Robot type not recognised. | 0 s | PASS | refused with the list of robot types it can build |
| 57 | vague | robot | refused: Robot type not recognised. | 0 s | PASS | refused with the list of robot types it can build |
| 58 | vague | make something awesome | refused: Robot type not recognised. | 0 s | PASS | refused with the list of robot types it can build |
| 59 | vague | a robot that helps at home | refused: Robot type not recognised. | 0 s | PASS | refused with the list of robot types it can build |
| 60 | vague | a robot for my kid | refused: Robot type not recognised. | 0 s | PASS | refused with the list of robot types it can build |
| 61 | vague | something that can pick things up | 6-DOF serial arm · parallel gripper (+1 note) | 2 s | PASS | right family; notes shown are honest |
| 62 | vague | a robot that cleans | refused: Robot type not recognised. | 2 s | PASS | refused with the list of robot types it can build |
| 63 | vague | I want a robot | refused: Robot type not recognised. | 1 s | PASS | refused with the list of robot types it can build |
| 64 | vague | surprise me | refused: Robot type not recognised. | 0 s | PASS | refused with the list of robot types it can build |
| 65 | vague | a useful robot | refused: Robot type not recognised. | 0 s | PASS | refused with the list of robot types it can build |
| 66 | specific | a 6 DOF arm, 600 mm reach, 1 kg payload, under $300, Arduino | 6-DOF serial arm · parallel gripper · hobby servos on an Arduino Uno + PCA9685 · reach 0.60 m · payload 1 kg · budget $300 (+1 note) | 17 s | PASS | honest: torque and speed checks fail and are shown |
| 67 | specific | a 4 DOF arm with 30 cm reach and 200 g payload | 4-DOF serial arm · parallel gripper · reach 0.34 m · payload 0.2 kg (+1 note) | 11 s | PASS | right family; notes shown are honest |
| 68 | specific | a 5-axis arm, reach 0.5 m, payload 500 g, budget $800 | 5-DOF serial arm · parallel gripper · reach 0.50 m · payload 0.5 kg · budget $800 (+1 note) | 19 s | PASS* | built and the warning is shown, but the designer leaves the power supply too small for the peak current (wiring rail check fails): remaining |
| 69 | specific | a 7 DOF arm with 1 m reach and 5 kg payload, budget $5000 | 7-DOF serial arm · parallel gripper · reach 1.00 m · payload 5 kg · budget $5000 (+1 note) | 26 s | PASS | honest: torque and speed checks fail and are shown |
| 70 | specific | a 3-link arm, each link 25 cm | 3-DOF serial arm · parallel gripper · upper_arm, forearm 0.25 m each (+2 notes) | 17 s | PASS | print check fails honestly: 25 cm links are longer than the bed |
| 71 | specific | a 2 DOF arm with 15 cm links | 2-DOF serial arm · parallel gripper · upper_arm, forearm 0.15 m each | 6 s | PASS | right family |
| 72 | specific | a 6 DOF arm with 24 inch reach | 6-DOF serial arm · parallel gripper · reach 0.61 m (+1 note) | 17 s | PASS* | built and the warning is shown, but the designer leaves the power supply too small for the peak current (wiring rail check fails): remaining |
| 73 | specific | 6 dof arm 0.45m reach 0.3kg payload | 6-DOF serial arm · parallel gripper · reach 0.45 m · payload 0.3 kg (+1 note) | 12 s | PASS* | built and the warning is shown, but the designer leaves the power supply too small for the peak current (wiring rail check fails): remaining |
| 74 | specific | a 12 DOF arm | 7-DOF serial arm · parallel gripper (+1 note) | 14 s | PASS | clamped to 7 and said; the README claimed 1-12 DOF arms (fixed) |
| 75 | specific | a 1 DOF arm | 1-DOF serial arm · parallel gripper | 6 s | PASS | right family |
| 76 | specific | a 20 DOF arm | 7-DOF serial arm · parallel gripper (+1 note) | 5 s | PASS | clamped to 7 and said; the README claimed 1-12 DOF arms (fixed) |
| 77 | specific | a 6 DOF arm with 3 m reach | 6-DOF serial arm · parallel gripper · reach 3.00 m (+1 note) | 20 s | PASS | honest: torque and speed checks fail and are shown |
| 78 | specific | a 6 DOF arm with 1 mm reach | 6-DOF serial arm · parallel gripper · reach 0.40 m (+2 notes) | 8 s | PASS | right family; notes shown are honest |
| 79 | specific | a 6 DOF arm with 100 kg payload | 6-DOF serial arm · parallel gripper · payload 100 kg (+1 note) | 16 s | PASS | honest: torque and speed checks fail and are shown |
| 80 | specific | a 6 DOF arm with -5 kg payload | 6-DOF serial arm · parallel gripper · payload 5 kg (+1 note) | 13 s | FIXED | live: payload read as +5 kg silently; fixed: says a payload cannot be negative. Fixed build: 6-DOF serial arm · parallel gripper · payload 5 kg (+2 notes) |
| 81 | specific | a 6 DOF arm with a budget of $0 | 6-DOF serial arm · parallel gripper | 14 s | FIXED | live: $0 budget dropped silently; fixed: says a budget must be more than $0. Fixed build: 6-DOF serial arm · parallel gripper (+1 note) |
| 82 | specific | a diff drive robot 30 cm wide that carries 2 kg at 1 m/s | differential-drive base · lidar (base_link) · imu (base_link) · payload 2 kg (+2 notes) | 5 s | PASS | right family; notes shown are honest |
| 83 | specific | a four wheel robot that climbs 20 degree slopes, budget $400 | four-wheel skid-steer base · lidar (upper_deck) · camera (base_link) · imu (upper_deck) · budget $400 (+1 note) | 4 s | PASS* | 'climbs 20 degree slopes' is not listed as not applied (silently ignored): remaining |
| 84 | specific | a mecanum robot carrying 10 kg | mecanum-wheel base · lidar (base_link) · imu (base_link) · payload 10 kg | 8 s | PASS | right family |
| 85 | specific | a rover with 6 wheels | differential-drive base · lidar (base_link) · imu (base_link) | 5 s | FIXED | live: two-wheel diff drive, 6 wheels ignored silently; fixed: '6 wheels: the differential-drive base has 2'. Fixed build: differential-drive base · lidar (base_link) · imu (base_link) (+1 note) |
| 86 | specific | a 4WD car with 100 mm wheels and 2 hour runtime | four-wheel skid-steer base · lidar (upper_deck) · camera (base_link) · imu (upper_deck) (+1 note) | 6 s | PASS* | '2 hour runtime' is not listed as not applied: remaining |
| 87 | specific | a quadruped 50 cm long that carries 3 kg | quadruped · imu (base_link) · camera (base_link) · payload 3 kg (+1 note) | 25 s | PASS | right family; notes shown are honest |
| 88 | specific | a hexapod with 3 DOF legs, budget $600 | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) · budget $600 (+2 notes) | 29 s | FIXED | live: wrongly said '3 DOF: the hexapod template has fixed kinematics' (its legs are 3 DOF); fixed. Fixed build: hexapod · imu (base_link) · lidar (base_link) · camera (base_link) · budget $600 (+1 note) |
| 89 | specific | a 12 DOF quadruped robot dog under $1000 | quadruped · imu (base_link) · camera (base_link) · budget $1000 | 19 s | PASS | right family |
| 90 | specific | a humanoid 1.2 m tall | tab crashed: Page.evaluate: Target crashed  | - | FIXED | live: the tab crashed (renderer out of memory after about 50 designs, see Performance); fixed build: the engine is recycled before that. Fixed build: humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) · height 1.23 m (+2 notes) |
| 91 | contradiction | a wheeled hexapod drone | refused: Aerial robots (drones, multirotors) are not supported yet. | 4 s | PASS | refused: drones |
| 92 | contradiction | a 6 DOF arm with 4 DOF | 6-DOF serial arm · parallel gripper (+1 note) | 7 s | PASS | right family; notes shown are honest |
| 93 | contradiction | an arm with 50 cm reach and 80 cm reach | 6-DOF serial arm · parallel gripper · reach 0.50 m (+1 note) | 14 s | PASS | right family; notes shown are honest |
| 94 | contradiction | a quadruped hexapod | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) (+1 note) | 16 s | PASS | right family; notes shown are honest |
| 95 | contradiction | a tracked mecanum robot | mecanum-wheel base · lidar (base_link) · imu (base_link) | 9 s | FAIL | low: tracks ignored without a conflict note |
| 96 | contradiction | a humanoid car | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) (+1 note) | 45 s | PASS | right family; notes shown are honest |
| 97 | contradiction | a SCARA quadruped | quadruped · imu (base_link) · camera (base_link) (+1 note) | 14 s | PASS | right family; notes shown are honest |
| 98 | contradiction | a red blue arm | 6-DOF serial arm · parallel gripper · red | 17 s | FAIL | low: the second colour is ignored without a conflict note |
| 99 | contradiction | a cheap robot arm with budget $5000 and budget $50 | 6-DOF serial arm · parallel gripper · budget $5000 | 8 s | FAIL | low: two budgets, the first used without a conflict note; 'cheap' not applied |
| 100 | contradiction | a gripper with no gripper | standalone parallel gripper · parallel gripper | 4 s | FAIL | low: contradiction not flagged |
| 101 | unsafe | a robot that can lift a car on $20 | differential-drive base · lidar (base_link) · imu (base_link) · budget $20 (+1 note) | 7 s | FAIL | low: built a $514 diff-drive robot; the budget failure is shown but 'lift a car' is not flagged |
| 102 | unsafe | a robot arm that lifts 500 kg for $100 | 6-DOF serial arm · parallel gripper · payload 500 kg · budget $100 (+1 note) | 22 s | PASS | honest: torque and speed checks fail and are shown |
| 103 | unsafe | a robot with a gun | refused: Robot type not recognised. | 3 s | FIXED | live: refused only as 'not recognised' (or built: the knife arm); fixed: explicit refusal of weapons and robots meant to hurt. Fixed build: refused: Text to Robot does not design weapons or robots meant to hurt people or animals. |
| 104 | unsafe | a weaponised drone that shoots people | refused: Aerial robots (drones, multirotors) are not supported yet. | 2 s | FIXED | live: refused only as 'not recognised' (or built: the knife arm); fixed: explicit refusal of weapons and robots meant to hurt |
| 105 | unsafe | a battle robot with a flamethrower | refused: Robot type not recognised. | 2 s | FIXED | live: refused only as 'not recognised' (or built: the knife arm); fixed: explicit refusal of weapons and robots meant to hurt. Fixed build: refused: Text to Robot does not design weapons or robots meant to hurt people or animals. |
| 106 | unsafe | a robot that can kill | refused: Robot type not recognised. | 0 s | FIXED | live: refused only as 'not recognised' (or built: the knife arm); fixed: explicit refusal of weapons and robots meant to hurt |
| 107 | unsafe | an exoskeleton that lets me lift 1000 kg | wearable exoskeleton (+1 note) | 2 s | FIXED | template exoskeleton, payload listed as not applied; fixed: now also says it is a template robot not designed from real parts |
| 108 | unsafe | a robot dog that runs at 100 km/h | quadruped · imu (base_link) · camera (base_link) (+1 note) | 8 s | PASS | right family; notes shown are honest |
| 109 | unsafe | a 6 DOF arm with a knife to stab | 6-DOF serial arm · parallel gripper | 10 s | FIXED | live: refused only as 'not recognised' (or built: the knife arm); fixed: explicit refusal of weapons and robots meant to hurt. Fixed build: refused: Text to Robot does not design weapons or robots meant to hurt people or animals. |
| 110 | unsafe | a self driving car for the road | differential-drive base · lidar (base_link) · imu (base_link) | 3 s | FAIL | low: built a desk-scale diff-drive robot without saying road vehicles are out of scope |
| 111 | scope | a drone | refused: Aerial robots (drones, multirotors) are not supported yet. | 3 s | PASS | refused: drones |
| 112 | scope | a quadcopter | refused: Aerial robots (drones, multirotors) are not supported yet. | 1 s | PASS | refused: drones |
| 113 | scope | a robot fish | refused: Robot type not recognised. | 1 s | PASS | refused (generic 'not recognised' with the list) |
| 114 | scope | an underwater ROV | refused: Underwater and marine robots are not supported yet. | 0 s | PASS | refused with the reason |
| 115 | scope | a humanoid hand | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) | 40 s | FIXED | live: built a full humanoid robot (README says hands are refused); fixed: refused with the reason. Fixed build: refused: Dexterous robot hands are not supported yet. |
| 116 | scope | a dexterous five finger robot hand | refused: Dexterous robot hands are not supported yet. | 3 s | PASS | refused with the reason |
| 117 | scope | a delta robot | refused: Parallel-kinematics robots (delta, Stewart) are not supported yet. | 2 s | PASS | refused with the reason |
| 118 | scope | a gantry robot / 3D printer | refused: Cartesian/gantry robots are not supported yet. | 0 s | PASS | refused with the reason |
| 119 | scope | a snake robot | refused: Snake robots are not supported yet. | 0 s | PASS | refused with the reason |
| 120 | scope | a robot boat | refused: Underwater and marine robots are not supported yet. | 0 s | PASS | refused with the reason |
| 121 | scope | a robot bird | refused: Robot type not recognised. | 1 s | PASS | refused (generic 'not recognised' with the list) |
| 122 | scope | a satellite | refused: Robot type not recognised. | 0 s | PASS | refused (generic 'not recognised' with the list) |
| 123 | scope | a self balancing robot | refused: Robot type not recognised. | 0 s | PASS | refused (generic 'not recognised' with the list) |
| 124 | scope | a robot vacuum cleaner | differential-drive base · lidar (base_link) · imu (base_link) | 5 s | PASS | right family |
| 125 | scope | a ball balancing robot | refused: Robot type not recognised. | 2 s | PASS | refused (generic 'not recognised' with the list) |
| 126 | scope | a robotic exoskeleton for the leg | wearable exoskeleton | 4 s | FIXED | template exoskeleton, payload listed as not applied; fixed: now also says it is a template robot not designed from real parts |
| 127 | language | एक रोबोटिक हाथ जिसमें ग्रिपर हो | refused: Robot type not recognised. | 2 s | FIXED | live: 'Robot type not recognised'; fixed: says the parser does not read this language yet and which ones it reads (no Hindi/Urdu/Japanese/Chinese support: remaining). Fixed build: refused: This prompt is in a language the parser does not read yet: it reads English, with common German, French, Spanish and rom |
| 128 | language | छह पैरों वाला रोबोट | refused: Robot type not recognised. | 2 s | FIXED | live: 'Robot type not recognised'; fixed: says the parser does not read this language yet and which ones it reads (no Hindi/Urdu/Japanese/Chinese support: remaining) |
| 129 | language | ek robot arm banao 6 dof wala | 6-DOF serial arm · parallel gripper (+1 note) | 25 s | PASS | right family; notes shown are honest |
| 130 | language | mujhe ek sasta arduino car chahiye | Arduino car · range (sensor_bracket) (+2 notes) | 56 s | FIXED | live: false conflict ('arduino car asks for a wheeled base'); fixed. Fixed build: Arduino car · range (sensor_bracket) (+1 note) |
| 131 | language | ایک روبوٹک بازو گرپر کے ساتھ | refused: Robot type not recognised. | 4 s | FIXED | live: 'Robot type not recognised'; fixed: says the parser does not read this language yet and which ones it reads (no Hindi/Urdu/Japanese/Chinese support: remaining). Fixed build: refused: This prompt is in a language the parser does not read yet: it reads English, with common German, French, Spanish and rom |
| 132 | language | ایک چار پہیوں والی روبوٹ گاڑی | refused: Robot type not recognised. | 3 s | FIXED | live: 'Robot type not recognised'; fixed: says the parser does not read this language yet and which ones it reads (no Hindi/Urdu/Japanese/Chinese support: remaining) |
| 133 | language | un brazo robótico de 6 ejes con pinza | 6-DOF serial arm · parallel gripper (+1 note) | 4 s | PASS | right family; notes shown are honest |
| 134 | language | un robot de cuatro ruedas | four-wheel skid-steer base · lidar (upper_deck) · camera (base_link) · imu (upper_deck) (+1 note) | 8 s | PASS | right family; notes shown are honest |
| 135 | language | un perro robot | refused: Robot type not recognised. | 1 s | FIXED | live: not recognised; fixed: perro -&gt; dog. Fixed build: quadruped · imu (base_link) · camera (base_link) (+1 note) |
| 136 | language | un robot humanoide pequeño | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) (+1 note) | 17 s | PASS* | 'pequeño' (small) silently dropped |
| 137 | language | Roboterarm mit sechs Achsen und Greifer | 6-DOF serial arm · parallel gripper (+1 note) | 6 s | PASS | right family; notes shown are honest |
| 138 | language | un bras robotique avec une pince | 6-DOF serial arm · parallel gripper (+1 note) | 5 s | PASS | right family; notes shown are honest |
| 139 | language | un robot à six pattes | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) (+1 note) | 26 s | PASS | right family; notes shown are honest |
| 140 | language | ロボットアーム | refused: Robot type not recognised. | 4 s | FIXED | live: 'Robot type not recognised'; fixed: says the parser does not read this language yet and which ones it reads (no Hindi/Urdu/Japanese/Chinese support: remaining) |
| 141 | language | 机器人手臂 | refused: Robot type not recognised. | 2 s | FIXED | live: 'Robot type not recognised'; fixed: says the parser does not read this language yet and which ones it reads (no Hindi/Urdu/Japanese/Chinese support: remaining) |
| 142 | noisy | a 6 dof robtic arm wiht a griper | 6-DOF serial arm · parallel gripper | 4 s | PASS | right family |
| 143 | noisy | quadrupad robot | refused: Robot type not recognised. | 2 s | FIXED | live: not recognised; fixed: misspelt robot words are corrected and said. Fixed build: quadruped · imu (base_link) · camera (base_link) (+1 note) |
| 144 | noisy | hexapd | refused: Robot type not recognised. | 0 s | FIXED | live: not recognised; fixed: misspelt robot words are corrected and said. Fixed build: hexapod · imu (base_link) · lidar (base_link) · camera (base_link) (+1 note) |
| 145 | noisy | mecanumm wheel robot | mecanum-wheel base · lidar (base_link) · imu (base_link) | 8 s | PASS | right family |
| 146 | noisy | humanoyd robot | refused: Robot type not recognised. | 2 s | FIXED | live: not recognised; fixed: misspelt robot words are corrected and said. Fixed build: humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) (+1 note) |
| 147 | noisy | a robo dawg | refused: Robot type not recognised. | 0 s | FAIL | low: slang not read |
| 148 | noisy | yo make me a sick robot arm fr | 6-DOF serial arm · parallel gripper | 3 s | PASS | right family |
| 149 | noisy | gimme a lil spider bot | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) | 11 s | PASS | right family |
| 150 | noisy | 🤖 arm with 🤏 gripper | 6-DOF serial arm · parallel gripper | 2 s | PASS | right family |
| 151 | noisy | 🐕 robot | refused: Robot type not recognised. | 7 s | FIXED | live: not recognised; fixed: a few emoji are read and said. Fixed build: quadruped · imu (base_link) · camera (base_link) (+1 note) |
| 152 | noisy | a robot 🚗 | refused: Robot type not recognised. | 2 s | FIXED | live: not recognised; fixed: a few emoji are read and said. Fixed build: differential-drive base · lidar (base_link) · imu (base_link) (+1 note) |
| 153 | noisy | ARM!!!!!!! | 6-DOF serial arm · parallel gripper | 3 s | PASS | right family |
| 154 | noisy | a     6    dof     arm | 6-DOF serial arm · parallel gripper | 2 s | PASS | right family |
| 155 | noisy | A 6 DOF ARM WITH A GRIPPER | 6-DOF serial arm · parallel gripper | 3 s | PASS | right family |
| 156 | long | I would like you to design for me, if at all possible, a robotic arm that has six degrees of freedom so that i ... (1218 characters) | 6-DOF serial arm · parallel gripper · camera (wrist_rotator) · budget $400 | 3 s | FIXED | live: the blue colour ('please make it blue') was dropped silently; fixed |
| 157 | long | a robot arm a robot arm a robot arm a robot arm a robot arm a robot arm a robot arm a robot arm a robot arm a  ... (4799 characters) | 6-DOF serial arm · parallel gripper | 3 s | PASS | right family |
| 158 | long | Build very very very very very very very very very very very very very very very very very very very very very ... (10019 characters) | quadruped · imu (base_link) · camera (base_link) (+2 notes) | 16 s | PASS* | 'big' not applied (said); the big quadruped switches to QDD actuators and fails its own connector and switch checks (18.97 A through a 15 A spade): remaining |
| 159 | injection | (empty) | nothing happened (no message) | 4 s | FIXED | live: Generate did nothing and said nothing; fixed: a hint |
| 160 | injection | (spaces) | nothing happened (no message) | 4 s | FIXED | live: Generate did nothing and said nothing; fixed: a hint |
| 161 | injection | &lt;script&gt;alert(1)&lt;/script&gt; | refused: Robot type not recognised. | 0 s | PASS | refused; nothing executed, no dialog, no injected element |
| 162 | injection | &lt;img src=x onerror=alert(1)&gt; arm | 6-DOF serial arm · parallel gripper | 4 s | PASS | arm built; the markup is text only, no dialog, no injected element |
| 163 | injection | a 6 dof arm called &lt;b&gt;bold&lt;/b&gt; | 6-DOF serial arm · parallel gripper | 9 s | PASS | arm built; the markup is text only, no dialog, no injected element |
| 164 | injection | "; DROP TABLE robots; -- | refused: Robot type not recognised. | 3 s | PASS | refused; nothing executed, no dialog, no injected element |
| 165 | injection | a robot arm called ../../etc/passwd | 6-DOF serial arm · parallel gripper | 4 s | PASS | name sanitised to a safe identifier (path and XML characters removed) |
| 166 | injection | a robot arm called &lt;/robot&gt;&lt;link name='x'/&gt; | 6-DOF serial arm · named x · parallel gripper | 6 s | PASS | name sanitised to a safe identifier (path and XML characters removed) |
| 167 | injection | a robot arm named Robert'); &amp; &lt;x&gt; | 6-DOF serial arm · named robert · parallel gripper | 3 s | PASS | name sanitised to a safe identifier (path and XML characters removed) |
| 168 | injection | AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ... (20000 characters) | refused: Robot type not recognised. | 1 s | PASS | refused; nothing executed, no dialog, no injected element |
| 169 | injection | a 6 dof arm\x00\x07 with nulls | 6-DOF serial arm · parallel gripper | 2 s | PASS | arm built; the markup is text only, no dialog, no injected element |
| 170 | injection | {{7*7}} ${7*7} arm | 6-DOF serial arm · parallel gripper | 8 s | PASS | arm built; the markup is text only, no dialog, no injected element |
| 171 | injection | a 6 dof arm called 名前 | 6-DOF serial arm · parallel gripper | 5 s | PASS* | a non-Latin name is dropped silently |
| 172 | modifier | a seven-axis arm | 7-DOF serial arm · parallel gripper | 16 s | PASS | right family |
| 173 | modifier | a 3-link arm | 3-DOF serial arm · parallel gripper (+1 note) | 12 s | PASS | right family; notes shown are honest |
| 174 | modifier | a 6 DOF arm with 60 cm reach | 6-DOF serial arm · parallel gripper · reach 0.60 m (+1 note) | 21 s | PASS* | built and the warning is shown, but the designer leaves the power supply too small for the peak current (wiring rail check fails): remaining |
| 175 | modifier | a small 6 DOF arm | 6-DOF serial arm · parallel gripper · small: reach 0.46 m | 18 s | PASS | right family |
| 176 | modifier | a 6 DOF arm with 2 kg payload | 6-DOF serial arm · parallel gripper · payload 2 kg (+1 note) | 17 s | PASS* | built and the warning is shown, but the designer leaves the power supply too small for the peak current (wiring rail check fails): remaining |
| 177 | modifier | a 6 DOF arm, budget $1500 | 6-DOF serial arm · parallel gripper · budget $1500 | 6 s | PASS | right family |
| 178 | modifier | a 6 DOF arm with a wrist camera | 6-DOF serial arm · parallel gripper · camera (wrist_rotator) | 4 s | PASS | right family |
| 179 | modifier | a mobile robot with lidar on the front | differential-drive base · lidar (base_link) | 7 s | PASS | right family |
| 180 | modifier | a mars rover with no lidar | differential-drive base · imu (base_link) | 4 s | FIXED | live: built a two-wheel base silently; fixed: says a rover without an arm is built as a differential-drive base. Fixed build: differential-drive base · imu (base_link) (+1 note) |
| 181 | modifier | a 6 DOF arm with a suction cup | tab crashed: Page.evaluate: Target crashed  | - | FIXED | live: the tab crashed (renderer out of memory after about 50 designs, see Performance); fixed build: the engine is recycled before that. Fixed build: 6-DOF serial arm · suction gripper |
| 182 | modifier | a robot dog called Atlas | quadruped · named atlas · imu (base_link) · camera (base_link) | 17 s | PASS | right family |
| 183 | modifier | a hexapod painted blue | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) · blue | 19 s | PASS | right family |
| 184 | modifier | a red 6 dof arm with 70 cm reach, a wrist camera and no lidar, lifting 1 kg, budget $600 | 6-DOF serial arm · parallel gripper · camera (wrist_rotator) · reach 0.70 m · red · payload 1 kg · budget $600 (+1 note) | 21 s | PASS* | built and the warning is shown, but the designer leaves the power supply too small for the peak current (wiring rail check fails): remaining |
| 185 | modifier | a green quadruped | quadruped · imu (base_link) · camera (base_link) · green | 8 s | PASS | right family |
| 186 | modifier | a SCARA robot called Picker | SCARA · named picker · parallel gripper | 8 s | PASS | right family |
| 187 | modifier | a diff drive robot with an RGB-D camera and an IMU | refused: electronics bay: lipo_3s_5000, cytron_mdd10a do not fit on {"x0":-112,"x1":112,"y0":-90,"y1":90} | 5 s | FIXED | live: the design failed with an internal error ('electronics bay: lipo_3s_5000, cytron_mdd10a do not fit on {...}'); fixed: a longer deck. Fixed build: differential-drive base · depth (base_link) · camera (base_link) · imu (base_link) |
| 188 | modifier | a 6 DOF arm with MG996R servos and an Arduino Nano | 6-DOF serial arm · parallel gripper · hobby servos (MG996R) on an Arduino Uno + PCA9685 (+2 notes) | 10 s | FIXED | live: 'Arduino Nano named but this design does not use one' (it uses an Uno); fixed: says why the Uno is kept. Torque checks fail honestly. Fixed build: 6-DOF serial arm · parallel gripper · hobby servos (MG996R) on an Arduino Uno + PCA9685 (+2 notes) |
| 189 | modifier | a car with TT motors and an L298N | Arduino car · range (sensor_bracket) (+2 notes) | 49 s | FIXED | live: false conflict ('car asks for a wheeled base'); fixed. The L298N swap is explained. Fixed build: Arduino car · range (sensor_bracket) (+1 note) |
| 190 | modifier | a cobot with 5 kg payload | 6-DOF serial arm · parallel gripper · payload 5 kg (+1 note) | 17 s | PASS | honest: torque and speed checks fail and are shown |
| 191 | mark43 | Iron Man Mark 43 suit for a 1.85 m wearer | forge started, first progress at 30.5 s | 91 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 192 | mark43 | a bulky Iron Man Mark 43 suit | forge started, first progress at 30.9 s | 91 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 193 | mark43 | a sleek Iron Man Mark 43 | forge started, first progress at 33.9 s | 94 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 194 | mark43 | Iron Man Mark 43 suit, 10 % bulkier | forge started, first progress at 34.9 s | 95 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 195 | mark43 | Iron Man Mark 43 with bigger shoulders | forge started, first progress at 29.3 s | 90 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 196 | mark43 | Iron Man Mark 43 with smooth panels | forge started, first progress at 32.2 s | 92 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 197 | mark43 | Iron Man Mark 43 suit in black and gold | forge started, first progress at 28.0 s | 88 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 198 | mark43 | Iron Man Mark 43 with silver joints | forge started, first progress at 26.5 s | 87 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 199 | mark43 | Iron Man Mark 43 suit, budget $500 | forge started, first progress at 39.5 s | 100 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 200 | mark43 | Iron Man Mark 43 with heavy plates | forge started, first progress at 36.2 s | 97 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 201 | mark43 | a purple Iron Man Mark 43 with 300 % bigger shoulders | forge started, first progress at 40.8 s | 101 s | PARTIAL | forge starts; in Node the shape parser turns '300 % bigger shoulders' into 1.2 without saying the 300 % was not applied (Mark 43 parser, reported to the forge owner) |
| 202 | arduino (Arduino on) | an arduino car with four wheels | 2 tier(s): $33cheapest works cheapest that  works  (floors, r; $45stronger works stronger (4WD, ramps up to 10 de | 54 s | FIXED | tiers work; live tier cards showed $33/$45 while the parts list said $43/$58.13; fixed: the card shows the parts list total |
| 203 | arduino (Arduino on) | A cheap Arduino robot arm with a claw | 3 tier(s): $42cheapest works cheapest that  works : carries 2; $50stronger works stronger: carries 100 g, 28 cm r; $50best works best on Arduino: carries 200 g, 24 c | 348 s | PASS | three tiers, all pass; took 348 s here (the live log said 'a few seconds': fixed) |
| 204 | arduino (Arduino on) | WALL-E | 1 tier(s): $85cheapest works Arduino WALL-E: TPU tracks, pan/ | 289 s | PASS | one tier; 289 s here |
| 205 | arduino (Arduino on) | a 6 DOF arm | 3 tier(s): $42cheapest works cheapest that  works : carries 2; $50stronger works stronger: carries 100 g, 28 cm r; $50best works best on Arduino: carries 200 g, 24 c | 35 s | PASS | 3-DOF desk arm, the 6 DOF note is shown |
| 206 | arduino (Arduino on) | a quadruped | arduino_arm | 1 s | FIXED | live: tiers empty and the log kept saying 'Designing Arduino versions...'; fixed: says nothing was designed and what Arduino robots exist |
| 207 | arduino (Arduino on) | a hexapod | arduino_arm | 1 s | FIXED | as above |
| 208 | arduino (Arduino on) | a humanoid | arduino_arm | 1 s | FIXED | as above |
| 209 | arduino (Arduino on) | a mecanum robot | 2 tier(s): $33cheapest works cheapest that  works  (floors, r; $45stronger works stronger (4WD, ramps up to 10 de | 4 s | PASS | TT-motor car, note says mecanum is not in the Arduino range |
| 210 | arduino (Arduino on) | a SCARA robot | arduino_car | 3 s | FIXED | as above |
| 211 | arduino (Arduino on) | a drone | arduino_car | 1 s | FIXED | as above (the refusal reason is in the notes) |
| 212 | arduino (Arduino on) | a 6 DOF arm, 600 mm reach, 1 kg payload, under $300 | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c (+1 note) | 176 s | FIXED | live: tier card read 'cheapest that works' while 2 checks fail, and the 600 mm reach was not mentioned; fixed: 'cheapest tried', reach note |
| 213 | arduino (Arduino on) | Iron Man Mark 43 suit | forge started, first progress at 32.5 s | 92 s | PARTIAL | forge starts; the Arduino helmet/armour tiers come after the forge |
| 214 | template | Create a 2 DOF arm | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 7 s | PASS | right family |
| 215 | template | Create a 3 DOF arm | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 11 s | PASS | right family |
| 216 | template | Create a 6 DOF arm | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 17 s | PASS | right family |
| 217 | template | Create a 7 DOF arm | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 23 s | PASS | right family |
| 218 | template | Create a SCARA | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 5 s | PASS | right family |
| 219 | template | Create a Humanoid | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 41 s | PASS | right family |
| 220 | template | Create a Differential drive | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 5 s | PASS | right family |
| 221 | template | Create a Four-wheel robot | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 8 s | PASS | right family |
| 222 | template | Create a Mecanum robot | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 6 s | PASS | right family |
| 223 | template | Create a Quadruped | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 12 s | PASS | right family |
| 224 | template | Create a Hexapod | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 24 s | PASS | right family |
| 225 | template | Create a Rover + arm | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c (+1 note) | 29 s | PASS | right family; notes shown are honest |
| 226 | template | Create a Iron Man Mark 43 (wearable) | forge started, first progress at 36.8 s | 97 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 227 | template | Create a Iron Man Mark suit (primitive) | forge started, first progress at 35.6 s | 96 s | PARTIAL | forge starts and reports progress; not run to completion (see Mark 43 section). Shape words checked in Node: applied |
| 228 | template | Create a Powered exoskeleton (bare) | 1 tier(s): $58cheapest 2 checks fail cheapest that  works : c | 1 s | FIXED | template exoskeleton, payload listed as not applied; fixed: now also says it is a template robot not designed from real parts |
| 229 | template | Create a Battle mech (humanoid) | tab crashed: Page.evaluate: Target crashed  | - | FIXED | live: the tab crashed (renderer out of memory after about 50 designs, see Performance); fixed build: the engine is recycled before that |
| 230 | template | Create a WALL-E | WALL-E character · range (body) | 299 s | PASS | right family |
| 231 | template | Create a EVA | EVA character · imu (base_link) · camera (head) | 12 s | PASS | right family |
| 232 | template | Create a Baymax | Baymax character · imu (base_link) · camera (head) | 18 s | PASS | right family |

### The wrong ones again, on the fixed build

| # | Prompt | Fixed build result | Time |
|--:|---|---|--:|
| 1 | a humanoid hand | refused: Dexterous robot hands are not supported yet. | 1 s |
| 2 | EVA from Wall-E | EVA character · imu (base_link) · camera (head) | 18 s |
| 3 | a two finger robot gripper for my arm | standalone parallel gripper | 2 s |
| 4 | selective compliance assembly robot arm | SCARA · parallel gripper | 6 s |
| 5 | a rover with 6 wheels | differential-drive base · lidar (base_link) · imu (base_link) (+1 note): not applied: 6 wheels: the differential-drive base has 2 | 5 s |
| 6 | a 6 DOF arm with a budget of $0 | 6-DOF serial arm · parallel gripper (+1 note): not applied: budget "$0": a budget must be more than $0; built without one | 2 s |
| 7 | a 6 DOF arm with -5 kg payload | 6-DOF serial arm · parallel gripper · payload 5 kg (+2 notes): warning: design check failed: gripper:hold: fingertip force 42.4 N at 70 mm (rated torque), holds 4.33 kg with friction 0.5 vs payload 5 kg x 1.5; wir / not applied: payload -5 kg: a payload cannot be negative; sized for 5 kg | 17 s |
| 8 | a hexapod with 3 DOF legs, budget $600 | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) · budget $600 (+1 note): warning: design check failed: budget: bought parts $1030 vs budget $600 | 22 s |
| 9 | a robot with a gun | refused: Text to Robot does not design weapons or robots meant to hurt people or animals. | 1 s |
| 10 | a 6 DOF arm with a knife to stab | refused: Text to Robot does not design weapons or robots meant to hurt people or animals. | 1 s |
| 11 | a battle robot with a flamethrower | refused: Text to Robot does not design weapons or robots meant to hurt people or animals. | 0 s |
| 12 | quadrupad robot | quadruped · imu (base_link) · camera (base_link) (+1 note): approximated: read misspelt words and emoji as: quadrupad -&gt; quadruped | 10 s |
| 13 | hexapd | hexapod · imu (base_link) · lidar (base_link) · camera (base_link) (+1 note): approximated: read misspelt words and emoji as: hexapd -&gt; hexapod | 12 s |
| 14 | humanoyd robot | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) (+1 note): approximated: read misspelt words and emoji as: humanoyd -&gt; humanoid | 36 s |
| 15 | 🐕 robot | quadruped · imu (base_link) · camera (base_link) (+1 note): approximated: read misspelt words and emoji as: 🐕 -&gt; robot dog | 5 s |
| 16 | un perro robot | quadruped · imu (base_link) · camera (base_link) (+1 note): approximated: read non-English keywords as English: perro -&gt; dog, un -&gt; a | 8 s |
| 17 | एक रोबोटिक हाथ जिसमें ग्रिपर हो | refused: This prompt is in a language the parser does not read yet: it reads English, with common German, French, Spanish and rom | 1 s |
| 18 | a diff drive robot with an RGB-D camera and an IMU | differential-drive base · depth (base_link) · camera (base_link) · imu (base_link) | 8 s |
| 19 | a mars rover with no lidar | differential-drive base · imu (base_link) (+1 note): approximated: a rover without an arm is built as a differential-drive base (the rocker-bogie rover is designed with an arm: ask for "a Mars rover with | 3 s |
| 20 | A cheap Arduino robot arm with a claw | Arduino desk arm (3 DOF + claw) | 215 s |
| 21 | An Arduino 4WD obstacle avoiding car with an ultrasonic sensor | Arduino car (4WD) · range (sensor_bracket) | 54 s |
| 22 | mujhe ek sasta arduino car chahiye | Arduino car · range (sensor_bracket) (+1 note): approximated: read non-English keywords as English: chahiye (no English word needed), mujhe (no English word needed), ek -&gt; a | 54 s |
| 23 | a car with TT motors and an L298N | Arduino car · range (sensor_bracket) (+1 note): approximated: L298N named: a TB6612FNG is used instead: the L298N loses about 2 V in its bipolar bridge (TT motors on the 7.4 V pack would run slow an | 4 s |
| 24 | a 6 DOF arm with MG996R servos and an Arduino Nano | 6-DOF serial arm · parallel gripper · hobby servos (MG996R) on an Arduino Uno + PCA9685 (+2 notes): warning: design check failed: torque:shoulder_pitch: holds 1.62 N·m continuously (rated 0.3236), peaks 2.111 N·m (peak 1.0787, margin 0.51x); speed:sh / approximated: Arduino Nano named: the Uno is kept: the board sits on the desk beside the arm, so either works and the sketch is the same | 12 s |
| 25 | a mobile manipulator | mobile manipulator (wheeled rover + arm) · parallel gripper · depth (deck_lid) · camera (deck_lid) · imu (base_link) | 26 s |
| 26 | a humanoid 1.2 m tall | humanoid · parallel gripper · imu (base_link) · camera (neck_pan_link) · height 1.23 m (+2 notes): warning: design check failed: print:l_hip_pitch_armour_front: 271 x 35.6 x 57.9 mm, 55.25 cm^3, 51 g; print:r_hip_pitch_armour_front: 271 x 35.6 x 57. / approximated: full-size humanoid: built on CubeMars quasi-direct-drive leg actuators (servo legs cannot carry it) | 132 s |
| 27 | a 6 DOF arm with a suction cup | 6-DOF serial arm · suction gripper | 15 s |
| 28 | Create a two-finger parallel gripper | standalone parallel gripper | 6 s |
| 29 | a robot 🚗 | differential-drive base · lidar (base_link) · imu (base_link) (+1 note): approximated: read misspelt words and emoji as: 🚗 -&gt; car | 9 s |
| 30 | ایک روبوٹک بازو گرپر کے ساتھ | refused: This prompt is in a language the parser does not read yet: it reads English, with common German, French, Spanish and rom | 2 s |
| 31 | robo dawg | refused: Robot type not recognised. | 2 s |

## Buttons and controls

Every control was pressed by `scripts/launch_audit/run_buttons.py` (Playwright) on a desktop window (1280 x 800) and an iPhone 13 profile (390 x 844, touch), on the live build and on the fixed build: the dock, the family dial (keyboard), Generate (empty and with an example chip), the template chips, Modify, History, the joint sliders, Structure and the inspector, a tap and a drag on the 3D view, Collision, Axes, Frames and Reset, the Summary and Parts tabs with the budget field, all seven downloads, Copy launch command, Import JSON (a saved robot and a bad file), Share (clipboard on desktop, the system share sheet on the phone) and opening the shared link in a new tab, Publish to gallery, Show published designs, the Arduino switch with tiers and choosing a tier, the Arduino tag in the prompt bar, and on the phone the sheet grabber and horizontal overflow. Console errors and failed requests were collected for the whole session.

What was wrong on the live site: **Generate with an empty prompt did nothing and said nothing** (fixed: a hint); **importing a file that is not a robot showed a JavaScript error** ("Cannot read properties of undefined (reading 'design')"; fixed: a reason); the **CAD button promised STEP** for robots without any (fixed); the Arduino log hung on "Designing..." for robots with no Arduino version (fixed, see the prompt table). **"Publish to gallery" opens nothing for a designed robot** on either build: the robot's share link is about 22,000 characters and the button stops at 7,000 with "This design is too large for a gallery post link" (remaining item 19). The live run's row reads the address of another window; the fixed-build run waits for a GitHub window and, when none opens, records the message in the log. The 3D tap selected a part each time, but the part under the centre of the view was the one already selected, so that row shows the selection works, not which part was hit. There is no theme or settings control, and no link to docs or Robot Studio on the page, so there was nothing to press for those.


| View | Control | Live site | Fixed build |
|---|---|---|---|
| desktop | page load + default robot | PASS: 26.8s to the first robot (arm_6dof); long tasks max 1677 ms | PASS: 30.4s to the first robot (arm_6dof); long tasks max 2274 ms |
| desktop | icons, manifest, favicon | PASS: fetched | PASS: fetched |
| desktop | dock: arduino | PASS: active pane arduino | PASS: active pane arduino |
| desktop | dock: model | PASS: active pane model | PASS: active pane model |
| desktop | dock: build | PASS: active pane build | PASS: active pane build |
| desktop | dock: share | PASS: active pane share | PASS: active pane share |
| desktop | dock: design | PASS: active pane design | PASS: active pane design |
| desktop | family dial: arrow key turns the ring and fills the prompt | PASS: An obstacle avoiding robot car | PASS: An obstacle avoiding robot car |
| desktop | Generate with an empty prompt | PASS: toast:  \| status: → Interpreted as: 6-DOF serial arm · parallel gripper ✓ Robot topology valid ✓ 2 | PASS: toast: Describe a robot first, for example "a 6 DOF arm with a gripper". \| status: → Interpreted as: 6-DOF serial arm · parallel gripper ✓ Robot topology valid ✓ 2 |
| desktop | example chip 2 ('An obstacle avoiding robot car') | PASS: diff_drive_robot in 5.5s | PASS: diff_drive_robot in 5.6s |
| desktop | template chips listed | PASS: ['2 DOF arm', '3 DOF arm', '6 DOF arm', '7 DOF arm', 'SCARA', 'Humanoid', 'Differential drive', 'Four-wheel robot', 'Mecanum robot', 'Quadruped', 'Hexapod', 'Rover + arm', 'Iron Ma | PASS: ['2 DOF arm', '3 DOF arm', '6 DOF arm', '7 DOF arm', 'SCARA', 'Humanoid', 'Differential drive', 'Four-wheel robot', 'Mecanum robot', 'Quadruped', 'Hexapod', 'Rover + arm', 'Iron Ma |
| desktop | Modify: 'make the forearm longer' | PASS: ROBOT CHANGES~ forearm 0.149 m -> 0.179 m (no amount given, used 20%); actuators re-sized | PASS: ROBOT CHANGES~ forearm 0.149 m -> 0.179 m (no amount given, used 20%); actuators re-sized |
| desktop | History: open v1 | PASS: 2 versions | PASS: 2 versions |
| desktop | Joints: slider moves a joint | PASS: 0.00 -> 0.30 | PASS: 0.00 -> 0.30 |
| desktop | Structure: tap a link opens the inspector | PASS: turret | PASS: turret |
| desktop | 3D view: tap a part | PASS: inspector: turret | PASS: inspector: turret |
| desktop | view: showCollision | PASS: toggled on and off | PASS: toggled on and off |
| desktop | view: showAxes | PASS: toggled on and off | PASS: toggled on and off |
| desktop | view: showFrames | PASS: toggled on and off | PASS: toggled on and off |
| desktop | 3D view: drag orbits | PASS: [0.78, -1.027, 0.742] -> [0.163, -1.237, 0.959] | PASS: [0.78, -1.027, 0.742] -> [0.081, -1.239, 0.985] |
| desktop | view: Reset | PASS: camera reframed | PASS: camera reframed |
| desktop | Build: Summary | PASS: $1170 all 41 pass | PASS: $1170 all 41 pass |
| desktop | Parts: budget field | PASS: $100: $1168.42 ✗ over \| $100000: $1168.42 ✓ within | PASS: $100: $1168.42 ✗ over \| $100000: $1168.42 ✓ within |
| desktop | download: urdf | PASS: arm_6dof.urdf 18630 bytes in 1.5s | PASS: arm_6dof.urdf 18630 bytes in 1.4s |
| desktop | download: xacro | PASS: arm_6dof.urdf.xacro 19058 bytes in 0.7s | PASS: arm_6dof.urdf.xacro 19058 bytes in 0.3s |
| desktop | download: json | PASS: arm_6dof.json 224373 bytes in 0.7s | PASS: arm_6dof.json 224373 bytes in 2.6s |
| desktop | download: bom | PASS: arm_6dof_BOM.md 4019 bytes in 1.1s | PASS: arm_6dof_BOM.md 4016 bytes in 1.0s |
| desktop | download: cad | PASS: arm_6dof_cad.zip 4080768 bytes in 6.9s (label 'STEP + STL') | PASS: arm_6dof_cad.zip 4080768 bytes in 6.9s (label 'STL') |
| desktop | download: ros2 | PASS: arm_6dof_ros2.zip 1632536 bytes in 3.0s | PASS: arm_6dof_ros2.zip 1634482 bytes in 3.4s |
| desktop | download: train | PASS: arm_6dof_training.zip 2014481 bytes in 3.1s | PASS: arm_6dof_training.zip 2014481 bytes in 4.0s |
| desktop | Copy launch cmd | PASS: ros2 launch arm_6dof display.launch.py | PASS: ros2 launch arm_6dof display.launch.py |
| desktop | Import JSON | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry present ✓ Root link: b | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry present ✓ Root link: b |
| desktop | Import JSON: a bad file is refused with a message | PASS: ✗ Cannot read properties of undefined (reading 'design') | PASS: ✗ provide a RobotSpecification JSON |
| desktop | Share this robot | PASS: 21998 chars to the clipboard | PASS: 21998 chars to the clipboard |
| desktop | Share link opens the same robot in a new tab | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry pr | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry pr |
| desktop | Publish to gallery (opens a GitHub issue form) | FAIL: http://127.0.0.1:36955/text-to-robot/ | FAIL: no window opened; the log says: This design is too large for a gallery post link; download the JSON and attach it to a post instead. |
| desktop | Show published designs (GitHub API) | PASS: Nothing published yet. Press “Publish to gallery” to be the first. | PASS: Nothing published yet. Press “Publish to gallery” to be the first. |
| desktop | Arduino switch + Generate: price tiers | PASS: tag visible True; tiers ['$33cheapestworkscheapest that works (floors, ramps up to 5 deg)', '$45strongerworksstronger (4WD, ramps up to 10 deg)'] | PASS: tag visible True; tiers ['$43cheapestworkscheapest that works (floors, ramps up to 5 deg)', '$58strongerworksstronger (4WD, ramps up to 10 deg)'] |
| desktop | Arduino: choose tier 2 | PASS: arduino_car | PASS: arduino_car |
| desktop | Arduino tag in the prompt bar turns it off | PASS:  | PASS:  |
| desktop | console errors | PASS: [] | PASS: [] |
| desktop | failed requests | PASS: [] | PASS: [] |
| desktop | requests to other sites | PASS: ['https://api.github.com/repos/megazron/text-to-robot/issues'] | PASS: ['https://api.github.com/repos/megazron/text-to-robot/issues'] |
| phone | page load + default robot | PASS: 29.2s to the first robot (arm_6dof); long tasks max 1855 ms | PASS: 17.3s to the first robot (arm_6dof); long tasks max 1771 ms |
| phone | icons, manifest, favicon | PASS: fetched | PASS: fetched |
| phone | dock: arduino | PASS: active pane arduino | PASS: active pane arduino |
| phone | dock: model | PASS: active pane model | PASS: active pane model |
| phone | dock: build | PASS: active pane build | PASS: active pane build |
| phone | dock: share | PASS: active pane share | PASS: active pane share |
| phone | dock: design | PASS: active pane design | PASS: active pane design |
| phone | family dial: arrow key turns the ring and fills the prompt | PASS: An obstacle avoiding robot car | PASS: An obstacle avoiding robot car |
| phone | Generate with an empty prompt | PASS: toast:  \| status: → Interpreted as: 6-DOF serial arm · parallel gripper ✓ Robot topology valid ✓ 2 | PASS: toast: Describe a robot first, for example "a 6 DOF arm with a gripper". \| status: → Interpreted as: 6-DOF serial arm · parallel gripper ✓ Robot topology valid ✓ 2 |
| phone | example chip 2 ('An obstacle avoiding robot car') | PASS: diff_drive_robot in 6.0s | PASS: diff_drive_robot in 7.7s |
| phone | template chips listed | PASS: ['2 DOF arm', '3 DOF arm', '6 DOF arm', '7 DOF arm', 'SCARA', 'Humanoid', 'Differential drive', 'Four-wheel robot', 'Mecanum robot', 'Quadruped', 'Hexapod', 'Rover + arm', 'Iron Ma | PASS: ['2 DOF arm', '3 DOF arm', '6 DOF arm', '7 DOF arm', 'SCARA', 'Humanoid', 'Differential drive', 'Four-wheel robot', 'Mecanum robot', 'Quadruped', 'Hexapod', 'Rover + arm', 'Iron Ma |
| phone | Modify: 'make the forearm longer' | PASS: ROBOT CHANGES~ forearm 0.149 m -> 0.179 m (no amount given, used 20%); actuators re-sized | PASS: ROBOT CHANGES~ forearm 0.149 m -> 0.179 m (no amount given, used 20%); actuators re-sized |
| phone | History: open v1 | PASS: 2 versions | PASS: 2 versions |
| phone | Joints: slider moves a joint | PASS: 0.00 -> 0.30 | PASS: 0.00 -> 0.30 |
| phone | Structure: tap a link opens the inspector | PASS: turret | PASS: turret |
| phone | 3D view: tap a part | PASS: inspector: turret | PASS: inspector: turret |
| phone | view: showCollision | PASS: toggled on and off | PASS: toggled on and off |
| phone | view: showAxes | PASS: toggled on and off | PASS: toggled on and off |
| phone | view: showFrames | PASS: toggled on and off | PASS: toggled on and off |
| phone | 3D view: drag orbits | PASS: [0.78, -1.027, 0.742] -> [-0.363, -1.14, 1.133] | PASS: [0.78, -1.027, 0.742] -> [-0.282, -1.173, 1.105] |
| phone | view: Reset | PASS: camera reframed | PASS: camera reframed |
| phone | Build: Summary | PASS: $1170 all 41 pass | PASS: $1170 all 41 pass |
| phone | Parts: budget field | PASS: $100: $1168.42 ✗ over \| $100000: $1168.42 ✓ within | PASS: $100: $1168.42 ✗ over \| $100000: $1168.42 ✓ within |
| phone | download: urdf | PASS: arm_6dof.urdf 18630 bytes in 4.0s | PASS: arm_6dof.urdf 18630 bytes in 3.9s |
| phone | download: xacro | PASS: arm_6dof.urdf.xacro 19058 bytes in 0.6s | PASS: arm_6dof.urdf.xacro 19058 bytes in 0.7s |
| phone | download: json | PASS: arm_6dof.json 224373 bytes in 0.8s | PASS: arm_6dof.json 224373 bytes in 0.6s |
| phone | download: bom | PASS: arm_6dof_BOM.md 4019 bytes in 0.8s | PASS: arm_6dof_BOM.md 4016 bytes in 0.6s |
| phone | download: cad | PASS: arm_6dof_cad.zip 4080768 bytes in 7.2s (label 'STEP + STL') | PASS: arm_6dof_cad.zip 4080768 bytes in 4.1s (label 'STL') |
| phone | download: ros2 | PASS: arm_6dof_ros2.zip 1632536 bytes in 4.7s | PASS: arm_6dof_ros2.zip 1634482 bytes in 2.1s |
| phone | download: train | PASS: arm_6dof_training.zip 2014481 bytes in 2.4s | PASS: arm_6dof_training.zip 2014481 bytes in 1.7s |
| phone | Copy launch cmd | PASS: ros2 launch arm_6dof display.launch.py | PASS: ros2 launch arm_6dof display.launch.py |
| phone | Import JSON | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry present ✓ Root link: b | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry present ✓ Root link: b |
| phone | Import JSON: a bad file is refused with a message | PASS: ✗ Cannot read properties of undefined (reading 'design') | PASS: ✗ provide a RobotSpecification JSON |
| phone | Share this robot | PASS: 21998 chars via navigator.share | PASS: 21998 chars via navigator.share |
| phone | Share link opens the same robot in a new tab | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry pr | PASS: ✓ Robot topology valid ✓ 20 links ✓ 19 joints ✓ Inertia present on all links ✓ Collision geometry pr |
| phone | Publish to gallery (opens a GitHub issue form) | FAIL: http://127.0.0.1:36955/text-to-robot/ | FAIL: no window opened; the log says: This design is too large for a gallery post link; download the JSON and attach it to a post instead. |
| phone | Show published designs (GitHub API) | PASS: Nothing published yet. Press “Publish to gallery” to be the first. | PASS: Nothing published yet. Press “Publish to gallery” to be the first. |
| phone | Arduino switch + Generate: price tiers | PASS: tag visible True; tiers ['$33cheapestworkscheapest that works (floors, ramps up to 5 deg)', '$45strongerworksstronger (4WD, ramps up to 10 deg)'] | PASS: tag visible True; tiers ['$43cheapestworkscheapest that works (floors, ramps up to 5 deg)', '$58strongerworksstronger (4WD, ramps up to 10 deg)'] |
| phone | Arduino: choose tier 2 | PASS: arduino_car | PASS: arduino_car |
| phone | Arduino tag in the prompt bar turns it off | PASS:  | PASS:  |
| phone | Sheet grabber drag | PASS: top 252.32000732421875 -> 50.51310729980469 | PASS: top 252.32000732421875 -> 52 |
| phone | No horizontal overflow | PASS: [390, 390] | PASS: [390, 390] |
| phone | console errors | PASS: [] | PASS: [] |
| phone | failed requests | PASS: [] | PASS: [] |
| phone | requests to other sites | PASS: ['https://api.github.com/repos/megazron/text-to-robot/issues'] | PASS: ['https://api.github.com/repos/megazron/text-to-robot/issues'] |

## Generated files

I checked the files for every example (each one byte-equal to what the site generates for its prompt: `scripts/check_site.py` compares them in CI) and the downloads the site gave for a representative set on the fixed build: the 19 examples' prompts, a 6-DOF suction arm, a template SCARA, a template exoskeleton, the hobby-servo 6-DOF arm and the three Arduino tier sets (car, arm, WALL-E). Every zip was unpacked; every text file was scanned for `NaN`, `undefined`, `Infinity`, `[object Object]`, placeholder words and em dashes.

| File | How it was checked | Result |
|---|---|---|
| URDF | XML parse; `check_urdf` (ROS 2 Jazzy); every revolute and prismatic joint has lower < upper and positive effort and velocity, unit axes; every link with geometry has an inertial with positive mass, positive principal moments, A + B >= C and a radius of gyration under 3 m; mesh paths resolve inside the ROS 2 package; loaded and stepped 200 times in MuJoCo 3.13.0 | 19/19 pass `check_urdf` and load in MuJoCo through the shipped converter. **EVA's base link broke A + B >= C** after rounding to six decimals and plain MuJoCo refused the URDF (`inertia must satisfy A + B >= C`): **fixed** (nine significant figures for such a link; the validator now checks it) |
| Xacro | expanded with `xacro` inside the colcon-built package, compared element by element with the package URDF | 19/19 expand; the result is the URDF plus its `ros2_control` block (the plain URDF download leaves that block out, by design) |
| ROS 2 package | `colcon build` on Jazzy, every `package://` path resolved, `CMakeLists.txt` installs every folder, then `ros2 launch <pkg> display.launch.py gui:=false` and, for arms, `move_group.launch.py`, under Xvfb | 19/19 build. **On the live site every `display.launch.py` and `gazebo.launch.py` stopped at once on Jazzy** (`Unable to parse the value of parameter robot_description as yaml`), the display RViz layout loaded the MoveIt panel without move_group, and the `gui` argument did nothing: **fixed**; all 19 now reach `Robot initialized`, and every arm's move_group reaches `You can start planning now!` |
| Meshes (ROS package, training) | trimesh: loads, finite, positive volume when closed, extents in metres | All load; every extent is in metres. A few bought-part reference meshes in the ROS package are open shells (visual only) |
| Printed STL (CAD zip) | trimesh watertight and winding, size under 1 m, not under 1 mm (unit check) | Every printed part is millimetres and fits the size checks. 8 parts are two solids touching along an edge (non-manifold, so not watertight to trimesh): 06 `electronics_lid`, 07 `electronics_lid_front`, 13 four leg links (three listed in `examples/print_known_issues.json`), 16 `electronics_lid`, `right_arm_upper_arm`. Remaining, low |
| STEP (CAD zip) | OpenCascade (OCP): read, transfer, `BRepCheck_Analyzer` valid, positive volume | 44/44 valid (WALL-E 21, Arduino arm 9, Arduino car 4, Mark 43 10). **15 of 19 examples have no STEP file** while the button said "STEP + STL": **fixed** (the label now says what that robot's zip holds) |
| Parts list (BOM) | every line: quantity x unit price = subtotal, quantities positive; sum of lines = stated total; supplier links requested | All 19 add up to the cent. **The SCARA's list printed `undefined N·m peak, undefined V`** for its lead-screw coupler: **fixed**. Of 76 supplier links 51 answer 200, 21 refuse a script (403/429, they open in a browser), 1 timed out and **3 are dead** (two Samick linear-bushing pages, a Velcro straps page): remaining, low |
| Wiring (WIRING.md, wiring.svg) | SVG parses; tables present; parts in the wiring table are in the parts list | All present and well-formed for the designed robots |
| Training zip | MuJoCo: the URDF converted by the shipped `ttr_mujoco` and stepped 200 times; PyBullet: the shipped gym env created, reset and stepped 60 times with random actions, for every task | MuJoCo 19/19. **PyBullet failed for the SCARA and the gripper** (`No collision-free target found in 128 joint configurations`: PyBullet ignores `<mimic>`, so the second finger stayed put), and the gripper was given reach tasks it cannot do: **fixed** (mimic joints set and driven from their leader, a geared gripper does not collide with itself, a gripper trains on `aperture`); 19/19 now run |
| CLI output (`node cli/src/index.ts "a 6 DOF arm with a gripper" -o out/arm`) | the README's layout; the README's `ttr-mujoco test ... --self-collision` and `convert` | Layout as the README says. The CLI said "CAD (OpenSCAD) parts generated" for a robot with no OpenSCAD file: **fixed**. `ttr-mujoco test --self-collision` on that arm gives **4/5** (`actuator_sweep`: the base-yaw servo body touches the turret): remaining, medium |
| Text in every generated doc | scanned for NaN, undefined, Infinity, placeholders, em dashes | Only the SCARA `undefined` (fixed). **Em dashes** remain in headings and lists of the generated docs (7 to 12 files per robot: `cad/README.md`, `PRINT_LIST.md`, `ASSEMBLY.md`, `BOM.md`, the MoveIt and Gazebo READMEs, the training README, check details in `robot.json`): remaining, low; fixing it changes every example's archives including the Mark 43's 70 MB CAD zip, so I left it for one regeneration |

Downloads on the fixed build, per robot, are in the table below (sizes and times from the tab).

| Robot | Prompt | Design | URDF | Xacro | JSON | Parts list | CAD | ROS 2 | Train | Share link reopens the same robot | Validation |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|---|---|
| arm6 | Create a 6 DOF robotic arm with a parallel gripper | 9 s | 19 kB, 0 s | 19 kB, 0 s | 224 kB, 0 s | 4 kB, 0 s | 4.1 MB, 6 s | 1.6 MB, 3 s | 2.0 MB, 3 s | yes | all checks pass |
| scara_suction | a scara arm for pick and place | 1 s | 13 kB, 0 s | 14 kB, 0 s | 34 kB, 0 s | 1 kB, 0 s | 833 kB, 1 s | 178 kB, 0 s | 375 kB, 0 s | yes | all checks pass |
| diff | Create a differential drive mobile robot | 6 s | 28 kB, 0 s | 28 kB, 0 s | 345 kB, 0 s | 5 kB, 0 s | 3.2 MB, 4 s | 1.2 MB, 1 s | 1.7 MB, 2 s | yes | all checks pass |
| gripper | Create a two-finger parallel gripper | 3 s | 16 kB, 0 s | 16 kB, 0 s | 223 kB, 0 s | 3 kB, 0 s | 2.3 MB, 3 s | 943 kB, 1 s | 1.3 MB, 2 s | yes | all checks pass |
| quad | Create a quadruped robot | 20 s | 34 kB, 0 s | 34 kB, 0 s | 369 kB, 0 s | 5 kB, 0 s | 5.8 MB, 10 s | 1.8 MB, 3 s | 2.3 MB, 3 s | yes | all checks pass |
| walle | Build WALL-E: a tracked trash-compactor robot with a telescoping neck, binocular eyes and two gripper arms | 356 s | 41 kB, 0 s | 41 kB, 0 s | 406 kB, 0 s | 5 kB, 0 s | 51.2 MB, 76 s | 17.5 MB, 26 s | 18.0 MB, 19 s | yes | all checks pass; 21/21 STEP valid |
| acar | An Arduino 4WD obstacle avoiding car with an ultrasonic sensor | 79 s | 17 kB, 0 s | 18 kB, 0 s | 171 kB, 0 s | 4 kB, 0 s | 11.4 MB, 8 s | 4.8 MB, 3 s | 5.1 MB, 3 s | yes | all checks pass; 4/4 STEP valid |
| arm6_suction | a 6 DOF arm with a suction cup | 16 s | 18 kB, 0 s | 18 kB, 0 s | 215 kB, 0 s | 4 kB, 0 s | 3.7 MB, 10 s | 1.5 MB, 4 s | 1.9 MB, 5 s | yes | all checks pass |
| exosuit | a robotic exoskeleton for the leg | 1 s | 31 kB, 0 s | 31 kB, 0 s | 69 kB, 0 s | 2 kB, 0 s | 1.5 MB, 1 s | 279 kB, 0 s | 479 kB, 0 s | yes | all checks pass |
| arm_hobby | a 6 DOF arm, 600 mm reach, 1 kg payload, under $300, Arduino | 25 s | 19 kB, 0 s | 20 kB, 0 s | 277 kB, 0 s | 4 kB, 0 s | 4.3 MB, 9 s | 1.7 MB, 5 s | 2.2 MB, 8 s | yes | all checks pass |
| tiers_car tier 1 | an arduino car with four wheels | 80 s | 14 kB, 0 s | 15 kB, 0 s | 139 kB, 0 s | 4 kB, 0 s | 8.6 MB, 5 s | 3.6 MB, 2 s | 3.9 MB, 2 s | yes | all checks pass; 4/4 STEP valid |
| tiers_car tier 2 | an arduino car with four wheels | 80 s | 17 kB, 0 s | 18 kB, 0 s | 171 kB, 0 s | 4 kB, 0 s | 11.4 MB, 13 s | 4.8 MB, 3 s | 5.1 MB, 2 s | yes | all checks pass; 4/4 STEP valid |
| tiers_arm tier 1 | A cheap Arduino robot arm with a claw | 401 s | 16 kB, 0 s | 17 kB, 0 s | 205 kB, 0 s | 4 kB, 0 s | 64.0 MB, 54 s | 27.2 MB, 24 s | 27.5 MB, 18 s | yes | all checks pass; 9/9 STEP valid |
| tiers_arm tier 2 | A cheap Arduino robot arm with a claw | 401 s | 16 kB, 0 s | 17 kB, 0 s | 205 kB, 0 s | 4 kB, 0 s | 64.2 MB, 37 s | 27.3 MB, 18 s | 27.7 MB, 14 s | yes | all checks pass; 9/9 STEP valid |
| tiers_arm tier 3 | A cheap Arduino robot arm with a claw | 401 s | 16 kB, 0 s | 17 kB, 0 s | 205 kB, 0 s | 4 kB, 0 s | 64.2 MB, 35 s | 27.3 MB, 15 s | 27.7 MB, 16 s | yes | all checks pass; 9/9 STEP valid |

## Performance and stability

**Memory: the blocker I found, now fixed.** On the live site every design leaves memory behind in the engine's worker. In the one-tab corpus run the tab grew by about 100 MB per design (1.2 GB after the first robot, 6.3 GB after 39). At prompt 40 the CAD kernel aborted (`✗ Aborted(). Build with -sASSERTIONS for more info.`), and from then on every request failed (`✗ offset is out of bounds`) until a reload; in later stretches the tab itself crashed at about 5.4 GB, three times (`a humanoid 1.2 m tall`, `a 6 DOF arm with a suction cup`, the `Battle mech (humanoid)` chip). A visitor who tries a few dozen robots loses the page.

The cause is in manifold-3d 3.5.4, the CSG kernel: every boolean keeps about 90 kB of WebAssembly memory even when every solid is deleted (3000 `subtract` calls with every object freed grew its memory by 275 MB), WebAssembly memory never shrinks, and one memory stops at 4 GB. The project's own code frees every solid it makes (`liveSolids()` is 0 after each design); 3.5.4 is the newest release, so there is no upgrade to take. Its `Manifold.revolve` also leaked an outline per call; that one I fixed in `@ttr/solid`.

The fix is in the site: the worker reports its fullest kernel memory with each answer, and past 1.8 GB the page starts a fresh worker while nothing is waiting (saved robots and forged armour carry over); a request whose kernel aborts is sent once more to a fresh worker. On the fixed build I ran 80 designs in one tab (20 heavy prompts, four rounds, worded differently each round so nothing came from a cache): no failure, 10 fresh workers, the tab never above 2.96 GB. The same leak remains in the Node API server (`npm run api`) and in pages using the engine API (`engine/v1`), which run one engine for their whole life: see [Bugs remaining](#bugs-remaining).

**Time to a result** (live site, headless Chromium with software GL on a machine at load 25 to 38; a fast laptop is several times quicker):

| | Median | 90th percentile | Slowest |
|---|--:|--:|--:|
| Site open to the first robot | 25 s (desktop), 29 s (phone viewport) | | 36 s |
| A prompt (all 209 that built a robot) | 5.8 s | 22 s | 278 s (WALL-E, first time: its 21 exact STEP solids) |
| Arduino tiers | | | car 54 s, WALL-E 289 s, arm 348 s (three complete designs with exact printed parts) |
| Mark 43 | first progress message 30 to 40 s; the whole forge 25 min in Chrome on a laptop (README), about 65 min headless | | |

**Freezes.** The engine runs in a worker, so the page keeps responding to input while it designs, but the main thread still has long tasks when a robot arrives: parsing its STL meshes and drawing it. Per generation the longest task had a median of 1.5 s and a worst of 6.2 s (WALL-E), with SwiftShader software rendering. I did not repeat these timings on a real GPU: the machine was busy with a render, and the long tasks above are dominated by software rendering, so they overstate what a visitor with a GPU sees. A real-GPU run (Windows Chrome over CDP, ANGLE d3d11) is the right next measurement before quoting load times publicly.

**Repeated generation in one tab** is covered by the memory test above. Mesh caches are bounded (512 geometries on the page, 300 kernel parts and 64 designs in the worker).

## Claims

Every claim in the README, the site and the docs that I could test, with what I found. Claims that were untrue and are now corrected say **fixed**.

| Where | Claim | What is true today |
|---|---|---|
| README hero | "An Arduino 4WD obstacle avoiding car ... 4WD on TT gear motors · 0.6 kg · $58 of parts · 36/36 design checks · 3/3 simulation tests" | True: 0.605 kg, parts list $58.13, 36/36 checks, 3/3 tests. (The design's own summary says "$51 of parts": it leaves out wiring and fasteners. Remaining, low) |
| README | "a ROS 2 package and a physics test report" | Not true for a new robot: the site and CLI give the MuJoCo tests to run, and the 19 examples carry reports. **Fixed** wording: "the physics tests to run on it" |
| README, What you get | "Physics tests: Each robot is driven through its tasks in MuJoCo" | Same as above. **Fixed** wording |
| README | "Your design stays yours. The website runs entirely in your browser, nothing is uploaded" | True: while designing, no request left the page in any run (Playwright logged every request). The only outside requests are GitHub's API when you press "Show published designs" and GitHub's issue form on "Publish to gallery" |
| README | "Every one of them is generated on the website by a browser test in CI, and every frame of every film is checked on the exact meshes" | The site test is true (CI `site` job). **Not true today:** CI on main is red because `check_motion.py` finds 3 film hits in the Mark 43 (being fixed by the forge owner) |
| README, Printable parts | "STL files that fit a normal print bed" | True for every example part (`print_audit.py --check` passes). Asked-for sizes can exceed the bed, and the design check then says so (for example `a 3-link arm, each link 25 cm`) |
| README, Arduino mode | "If a request can't be done on a budget it says so and offers what can" | True for cars, arms, WALL-E and the suit. For other robots the live site left "Designing Arduino versions..." in the log with no answer: **fixed** |
| README, Arduino mode | "Name a part ("with MG996R servos and an Arduino Nano") and it is used, or you are told why not" | Was untrue for that very prompt ("Arduino Nano named but this design does not use one", while it uses an Uno): **fixed**. The MG996R arm then fails its torque checks and says so |
| README, What you can ask for | "Anything it cannot apply is listed as `not applied`" | Not quite: wheel counts, a $0 budget, a negative payload and "make it blue" were dropped silently (**fixed**); a slope or runtime target, a second colour or budget, "pequeño" and a few others still are. **Fixed** wording, and listed below |
| README | "Families: 1-12 DOF arms" | Untrue: arms are clamped to 7 DOF (and the parser says so). **Fixed** to 1-7 |
| README | "dexterous hands are refused with a reason" | Untrue for "a humanoid hand" (built a whole humanoid). **Fixed** |
| README | "A small German, French and Spanish keyword list" | True (also romanised Hindi). Hindi and Urdu script, Japanese and Chinese were answered "Robot type not recognised"; now the site says the language is not read yet |
| README, Mark 43 | "The first suit takes about 25 minutes in the tab ... up to 6 GB" | Not re-measured to the end in this audit (about 65 minutes headless here). The site's own message said "takes minutes": **fixed** to give the real time |
| README, Quick start | `ttr-mujoco test out/arm/arm_6dof.sim.urdf --self-collision` | Runs, but reports 4/5 on the arm the quick start builds (`actuator_sweep` contact-limited at the base yaw). Remaining, medium |
| README, Quick start | the CLI output layout | True |
| Site, Files tab | "CAD: STEP + STL" | Untrue for 15 of 19 examples (no STEP file). **Fixed**: the label says STEP + STL, STL, or OpenSCAD + STL for the robot shown |
| Site, Files tab | "Train (RL): MuJoCo training scaffold" | The RL environment is PyBullet; MuJoCo is its test and training tool alongside. **Fixed** label |
| Site, Arduino | "this takes a few seconds" | Arms take minutes. **Fixed** |
| CLI | "CAD (OpenSCAD) parts generated", "RL training scaffold generated (PyBullet + PPO)" | Untrue for designed robots. **Fixed** |
| docs/ENGINE_API.md | "the CAD files (STEP and STL)" | As the site label. **Fixed** |
| Site, Arduino tiers | tier prices | The cards showed bought parts only ($33 / $45 for the car) while the parts list said $43 / $58.13. **Fixed**: the card is the parts list total |
| Gallery | "19 robots ... every prompt is generated on the website by scripts/check_site.py" | True (CI `site` job) |
| Site | links to the source, docs, licence, terms, privacy and the fan-work notice | There are none on the site. Remaining, low |
| Site | "Robot Studio" | Robot Studio is a separate, private editor built on the engine API; the site and README link to it nowhere, so there was no link to test. The engine API it uses passes `scripts/check_engine.py` on the fixed build |

## Bugs fixed

| Commit | Fix |
|---|---|
| [`44e9e34`](https://github.com/megazron/text-to-robot/commit/44e9e34) | ROS 2 export: display and Gazebo launch start on Jazzy (robot_description typed as a string); the display RViz layout needs no MoveIt; gui argument works |
| [`d978941`](https://github.com/megazron/text-to-robot/commit/d978941) | Design: the rover's body vents are sized from the heat inside; a wheeled base gets a longer deck when its electronics do not fit |
| [`1ccc74a`](https://github.com/megazron/text-to-robot/commit/1ccc74a) | Solid: Manifold.revolve frees the outline it builds (manifold-3d 3.5.4 leaked a CrossSection and a polygon vector per call) |
| [`653f8f0`](https://github.com/megazron/text-to-robot/commit/653f8f0) | Prompts: refuse hands asked for alone and weapons; read EVA from WALL-E, a gripper for an arm, the SCARA's full name, typos, a few emoji, perro/chien/Hund; say what is not applied |
| [`7c970c3`](https://github.com/megazron/text-to-robot/commit/7c970c3) | CLI: say what the build package and training scaffold hold (it claimed OpenSCAD parts for designed robots, and PyBullet + PPO only) |
| [`ebf4b47`](https://github.com/megazron/text-to-robot/commit/ebf4b47) | Site: a fresh engine worker before the CAD kernel runs out of memory, and after an abort; labels say what the downloads hold |
| [`72a0a8e`](https://github.com/megazron/text-to-robot/commit/72a0a8e) | Parts list: a part with a torque rating but no peak or voltage (the SCARA's lead-screw coupler) no longer prints 'undefined N·m peak, undefined V' |
| [`5327b98`](https://github.com/megazron/text-to-robot/commit/5327b98) | Training scaffold: mimic joints are set and driven from their leader in PyBullet, and a geared gripper does not collide with itself; a standalone gripper trains on aperture |
| [`7b13e91`](https://github.com/megazron/text-to-robot/commit/7b13e91) | URDF: a flat part's inertia keeps A + B >= C (EVA's base broke it at six decimals and MuJoCo refused the URDF); the validator checks mass and inertia |
| [`3b4604e`](https://github.com/megazron/text-to-robot/commit/3b4604e) | Tests: no example's parts list prints undefined or NaN |
| [`8ff0c63`](https://github.com/megazron/text-to-robot/commit/8ff0c63) | Import: a file that is not a robot is refused with a reason (it showed 'Cannot read properties of undefined (reading design)'); README says what the physics tests are and which requests are still dropped silently |
| [`fb162e2`](https://github.com/megazron/text-to-robot/commit/fb162e2) | Launch audit harness: the prompt corpus and the Playwright runs for prompts, controls and downloads, the file validator and the supplier link check |

## Gates

Run on the branch before pushing, reading the full output of each:

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean (182 files) |
| `python3 scripts/check_links.py` | 0 broken links |
| every node test file on its own (41 files, `tests/launch-audit.test.ts` and `tests/example-prompts.test.ts` included) | 41/41 pass |
| `scripts/verify_examples.py` | 19 examples verified |
| `scripts/print_audit.py --check` | pass |
| `scripts/simulate_examples.py --check` | pass (EVA re-simulated for its corrected URDF, 3/3) |
| `scripts/check_mesh_assets.py` | 396/396 |
| static interference (`tests/examples-interference.test.ts`) | 19/19 |
| `scripts/check_motion.py --record` | all pass except the Mark 43 (3 film hits) at 327f92a; fixed on main by 8bf0877, which this branch is rebased on: CI confirms |
| `scripts/check_engine.py` | pass (engine v1 loaded across origins, designs, checks and exports) |
| `scripts/check_site.py`, every case except the two Mark 43 ones (each forges for over an hour headless; CI runs them) | 22/22 pass, downloads equal to the shipped examples |
| ROS 2 Jazzy: colcon build and launch of all 19 packages | 19/19 build, display launches, arms reach move_group planning |

## Bugs remaining

| # | Severity | What | Where | Notes |
|--:|---|---|---|---|
| 1 | **High (blocker until confirmed)** | CI was red on main at 327f92a: `check_motion.py` found 3 film hits in the Mark 43 | Mark 43 example | Fixed by the forge owner in 8bf0877; confirm green CI before launch |
| 2 | **High** | The Mark 43 forge takes 25 minutes in Chrome on a laptop (about 65 headless here) and up to 6 GB, and the "Suit" dial stop and the "Iron Man Mark 43 suit" example chip start it with one tap, before the visitor knows | Mark 43 forge, site | The page stays usable and says so, but a first visitor on a phone or a small laptop may never see a result. I did not run a forge to the end. Suggest: ask before forging, or ship the default pack precomputed |
| 3 | Medium | The CAD kernel leak (manifold-3d 3.5.4, about 90 kB per boolean) is fixed on the site by recycling the worker, but the Node API server (`npm run api`, `docker compose`) and pages using `engine/v1` keep one engine for their whole life and will abort after some tens of designs | `apps/api`, `apps/web/src/engine/client.ts` | Same fix applies: recycle the worker, or run designs in child processes |
| 4 | Medium | Many ordinary arm prompts end with a failing wiring check: the designer keeps a power supply that cannot give the peak current (`6 DOF arm with 60 cm reach`, `2 kg payload`, `24 inch reach`, `0.45 m, 0.3 kg`, the README's own example) | arm designer | Honest (the warning is shown), but the robot is not buildable as designed |
| 5 | Medium | The README quick start's `ttr-mujoco test ... --self-collision` reports 4/5 on the arm it builds: the base-yaw servo body touches the turret | arm designer or the sweep test | |
| 6 | Medium | The big quadruped (QDD actuators) fails its own connector and switch checks: 18.97 A through a 15 A spade and a 16 A switch | quadruped designer | Found with "very ... big quadruped" |
| 7 | Medium | Mark 43 shape words: "300 % bigger shoulders" and "2x bigger shoulders" become 1.2 with no note; "tiny shoulders" does nothing and says nothing | `packages/robot-generator/src/suit.ts` | The README promises out-of-range shape words are reported. Left for the forge owner |
| 8 | Medium | Arduino arm tiers take 3.5 to 6 minutes and WALL-E about 5 minutes the first time, on this machine | design engine | The status now says minutes |
| 9 | Low | Silent drops: a slope target ("climbs 20 degree slopes"), a runtime target ("2 hour runtime"), a second colour, a second budget, "a tracked mecanum robot" (no conflict), "a gripper with no gripper", "lift a car" on a car, "a self driving car for the road", "pequeño", a non-Latin robot name, "robo dawg" | parser | Each listed in the prompt table |
| 10 | Low | Em dashes in generated docs (7 to 12 files per robot) and in check details | `packages/cad`, `components`, `ros2-export`, `training-export`, design checks | Needs one regeneration of every example archive, the Mark 43's included |
| 11 | Low | 8 printed parts are two solids touching along an edge (non-manifold): 06, 07, 13 (one not in the known-issues list), 16 | enclosures, mech legs | Slicers usually cope; trimesh reports them not watertight |
| 12 | Low | 3 dead supplier links (Samick linear bushings x2, Velcro straps) | parts catalog | |
| 13 | Low | Price wording: a design summary says "$51 of parts" where the parts list (with wiring and fasteners) says $58.13 | design summaries | The site's cost now uses the parts list total |
| 14 | Low | No link from the site to the source, docs, licence, terms, privacy or the fan-work notice for the character robots | site | |
| 15 | Low | `robot_state_publisher` warns for every robot that KDL ignores the root link's inertia | URDF | Usual fix: a massless `base_footprint` root |
| 16 | Low | Prompts in Hindi or Urdu script, Japanese or Chinese are not read (now said) | parser | |
| 17 | Low | The gripper example has 0/0 simulation tests | `simulate_examples.py` | Its training scaffold now has an aperture task |
| 18 | Low | The lead-screw coupler is listed under "Power" in the parts list | parts catalog | |
| 19 | Medium | "Publish to gallery" cannot post a designed robot: its share link is about 22,000 characters and the button refuses links over 7,000 ("This design is too large for a gallery post link"), so the gallery can only ever show template robots | site (`publish()` in `app.js`) | A prompt link would be short and, with the deterministic parser, opens the same robot |

| 20 | Low | The site's zips are stored uncompressed: WALL-E's CAD download is 51 MB (14.7 MB deflated in the repo), its ROS 2 package 17.5 MB, its training zip 18 MB; the worker also sends binary files to the page as base64 text. The Mark 43's would be several hundred MB | `makeZip` in `robotkit.js`, `encodeFiles` in `browser-engine.ts` | Deflate with `CompressionStream` and transfer bytes |
