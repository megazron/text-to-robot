// The 24 gallery examples' prompts (examples/*/prompt.txt; tests/gallery-prompts.test.ts holds this list to them). Typed in
// as they are, each gives the gallery's own robot, as it was designed, simulated, rendered and checked (its house look);
// every other prompt gets a designed look of its own (styling.ts).
import { lookKey } from "./shape.ts";

export const GALLERY_PROMPTS: readonly string[] = [
  "Create a 2 DOF robotic arm",
  "Create a 6 DOF robotic arm with a parallel gripper",
  "Create a 7 DOF robotic arm with a two-finger gripper",
  "Create a SCARA robot",
  "Create a differential drive mobile robot",
  "Create a four-wheel robot",
  "Create a mecanum-wheel robot",
  "Create a small humanoid robot with a torso, head, two arms and two-finger grippers",
  "Create a two-finger parallel gripper",
  "Create a quadruped robot",
  "Build a six-legged reconnaissance spider-bot with a LiDAR turret, budget $1500",
  "Design a Mars rover with four wheels and a 6 DOF sampling arm, RGB-D camera, budget $4000",
  "Create a humanoid battle mech with two 7 DOF arms, a head camera and an IMU",
  "Build me a movie-accurate wearable Iron Man Mark 43 suit from Age of Ultron with all the small polygon armour plates that open and close, repulsors, a HUD and an IMU. Budget $60000",
  "Build WALL-E: a tracked trash-compactor robot with a telescoping neck, binocular eyes and two gripper arms",
  "Build EVA, a sleek hovering egg-shaped droid with a visor and two floating arms",
  "Build Baymax, an inflatable healthcare companion robot",
  "An Arduino 4WD obstacle avoiding car with an ultrasonic sensor",
  "A cheap Arduino robot arm with a claw",
  "A quadcopter drone with a camera for aerial photos of my garden",
  "A small underwater ROV with a camera to explore a lake",
  "A pen plotter that draws portraits",
  "A five-finger robot hand",
  "A robot that waters my plants",
];
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const SET = new Set(GALLERY_PROMPTS.map(norm));
/** a gallery example's prompt, typed in as it is (case and spacing aside) */
export const isGalleryPrompt = (prompt: string) => SET.has(norm(prompt));
/** a job a gallery example is made for, said any way ("a robot to water my plants", "plant watering robot"): its robot */
const JOBS = new Set(GALLERY_PROMPTS.filter((p) => /\b(?:that|which|who|to|for)\s/i.test(p)).map((p) => lookKey(p.toLowerCase())));
export const isGalleryJob = (text: string) => JOBS.has(lookKey(text));
