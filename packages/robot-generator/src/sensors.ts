// Sensor requests: which sensors, how many, and where they mount on the body surface.
import type { RobotSpecification, Geometry, Sensor, SensorType, Pose, Vec3 } from "@ttr/robot-schema";
import { poseToMat, type Mat4 } from "@ttr/kinematics";
import { pose } from "@ttr/robot-schema";
import { cyl, box, link, joint } from "@ttr/robot-templates";
import { find, findAll, negates, type Hit } from "./text.ts";
import { subtreeLinks } from "./spec-utils.ts";

export type Box3 = { min: Vec3; max: Vec3 };

/** Axis-aligned bounds of a geometry placed at `origin` (a pose or a 4x4 frame), in that pose's parent frame. */
export function placedBounds(g: Geometry, origin: Pose | Mat4): Box3 {
  const half: Vec3 = g.type === "box" ? [g.size[0] / 2, g.size[1] / 2, g.size[2] / 2]
    : g.type === "cylinder" ? [g.radius, g.radius, g.length / 2]
    : g.type === "capsule" ? [g.radius, g.radius, g.length / 2 + g.radius]
    : g.type === "sphere" ? [g.radius, g.radius, g.radius] : [0, 0, 0];
  const lo: Vec3 = g.type === "mesh" ? g.bbox.min : [-half[0], -half[1], -half[2]];
  const hi: Vec3 = g.type === "mesh" ? g.bbox.max : half;
  const m = Array.isArray(origin) ? origin : poseToMat(origin);
  const out: Box3 = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const p = [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    for (let k = 0; k < 3; k++) { out.min[k] = Math.min(out.min[k], p[k]); out.max[k] = Math.max(out.max[k], p[k]); }
  }
  return out;
}

/** Outer envelope of a link together with the fixed housing panels that share its frame
 *  (a hollow chassis is a bottom plate plus lid and wall panels). */
export function bodyEnvelope(spec: RobotSpecification, name: string): Box3 {
  const l = spec.links.find((x) => x.name === name)!;
  const env = placedBounds(l.geometry, l.origin);
  for (const j of spec.joints) {
    if (j.parent !== name || j.type !== "fixed") continue;
    const c = spec.links.find((x) => x.name === j.child);
    if (c?.role !== "housing") continue;
    const b = placedBounds(c.geometry, { xyz: [c.origin.xyz[0] + j.origin.xyz[0], c.origin.xyz[1] + j.origin.xyz[1], c.origin.xyz[2] + j.origin.xyz[2]], rpy: c.origin.rpy });
    for (let k = 0; k < 3; k++) { env.min[k] = Math.min(env.min[k], b.min[k]); env.max[k] = Math.max(env.max[k], b.max[k]); }
  }
  return env;
}

const SENSOR_SIZE = { box: [0.04, 0.06, 0.03] as Vec3, lidar: { radius: 0.03, length: 0.05 } };
const MOUNT_CLEARANCE = 0.07;

/** Where a sensor sits on its parent's outer surface (never buried inside the body):
 *  IMUs inside the body centre, lidars on top, cameras on the front face of a head,
 *  on the side of a wrist, or on the top edge of a base. Top-surface spots avoid
 *  anything else mounted there (an arm's shoulder, another sensor). */
function mountPose(spec: RobotSpecification, parent: string, type: SensorType, onWrist: boolean): Pose {
  const env = bodyEnvelope(spec, parent);
  const mid = (k: number) => (env.min[k] + env.max[k]) / 2;
  if (type === "imu") return pose([mid(0), mid(1), mid(2)]);
  const lidar = type === "lidar";
  const [bx, , bz] = SENSOR_SIZE.box;
  if (onWrist) return pose([env.max[0] + (lidar ? SENSOR_SIZE.lidar.radius : bx / 2), mid(1), Math.max(mid(2), env.max[2] - 0.03)]);
  const head = /head|helmet|visor/.test(parent);
  if (head && !lidar) return pose([env.max[0] + bx / 2, mid(1), mid(2)]);
  const topZ = env.max[2] + (lidar ? 0 : bz / 2);
  const inset = lidar ? SENSOR_SIZE.lidar.radius : bx / 2;
  const front = env.max[0] - inset, rear = env.min[0] + inset, centre = mid(0);
  const spots = (lidar ? [centre, rear, front] : [front, centre, rear]).map((x) => [x, mid(1)] as const);
  const occupied = spec.joints.filter((j) => j.parent === parent && j.origin.xyz[2] > mid(2) && spec.links.find((c) => c.name === j.child)?.role !== "housing").map((j) => j.origin.xyz);
  const free = spots.find(([x, y]) => occupied.every((o) => Math.hypot(o[0] - x, o[1] - y) >= MOUNT_CLEARANCE));
  if (free) return pose([free[0], free[1], topZ]);
  // crowded top (a small arm base): hang the sensor on the front face instead
  return pose([env.max[0] + (lidar ? SENSOR_SIZE.lidar.radius : bx / 2), mid(1), mid(2) - (lidar ? SENSOR_SIZE.lidar.length / 2 : 0)]);
}

export function addSensor(spec: RobotSpecification, type: SensorType, where: string): string[] {
  const changes: string[] = [];
  // choose attach link
  let parent = spec.links.find((l) => /head/.test(l.name))?.name;
  const wrist = /wrist|gripper|hand/.test(where);
  if (wrist) parent = spec.end_effectors[0]?.attach_link ?? [...spec.links].reverse().find((l) => /wrist|flange|tool/.test(l.name) && l.role !== "sensor")?.name ?? parent;
  if (/front|base|chassis/.test(where)) parent = spec.links.find((l) => l.role === "base")?.name ?? parent;
  parent ??= spec.links.find((l) => l.role === "base")?.name ?? spec.links[0]?.name;
  if (!parent) return changes;
  const index = Math.max(0, ...spec.sensors.filter((s) => s.type === type).map((s) => parseInt(s.name.split("_").pop() ?? "0", 10) || 0)) + 1;
  const sname = `${type}_${index}`;
  const geom: Geometry = type === "lidar" ? cyl(SENSOR_SIZE.lidar.radius, SENSOR_SIZE.lidar.length) : box(...SENSOR_SIZE.box);
  const lname = `${sname}_link`;
  const onWrist = wrist && /wrist|flange|tool|hand|gripper/.test(parent + " " + (spec.links.find((l) => l.name === parent)?.role ?? ""));
  const origin = mountPose(spec, parent, type, onWrist);
  spec.links.push(link(lname, geom, { material: "sensor_mat", role: "sensor", origin: pose([0, 0, geom.type === "cylinder" ? geom.length / 2 : 0]) }));
  spec.joints.push(joint(`${sname}_joint`, "fixed", parent, lname, { origin }));
  const sensor: Sensor = { name: sname, type, parent: lname, origin: pose(), params: {} };
  spec.sensors.push(sensor);
  changes.push(`+ Added link: ${lname}`);
  changes.push(`+ Added joint: ${sname}_joint`);
  changes.push(`+ Added ${type} sensor: ${sname} on ${parent}`);
  return changes;
}

/** Remove a sensor with its mount link and joint (and anything hanging off that link). */
export function removeSensor(spec: RobotSpecification, s: Sensor): string[] {
  const doomed = subtreeLinks(spec, s.parent);
  const sensorJoint = spec.joints.find((j) => j.child === s.parent);
  const onlySensor = spec.links.find((l) => l.name === s.parent)?.role === "sensor";
  spec.sensors = spec.sensors.filter((x) => x !== s);
  if (!onlySensor) return [`- Removed ${s.type} sensor: ${s.name}`];
  spec.links = spec.links.filter((l) => !doomed.has(l.name));
  spec.joints = spec.joints.filter((j) => !doomed.has(j.child));
  spec.sensors = spec.sensors.filter((x) => !doomed.has(x.parent));
  return [`- Removed link: ${s.parent}`, ...(sensorJoint ? [`- Removed joint: ${sensorJoint.name}`] : []), `- Removed ${s.type} sensor: ${s.name}`];
}


export const SENSOR_WORDS: [RegExp, SensorType][] = [
  [/\blidars?\b|laser\s*scan(?:ner)?s?|\blaser\s+range/, "lidar"],
  [/\bdepth\b|rgb-?d\b|\bstereo\b|\b3d\s+camera|\btof\s+camera/, "depth"],
  [/\bcameras?\b|\bvision\b|\beyes?\b|\boptical\b|\bwebcam\b/, "camera"],
  [/\bimus?\b|\bgyro(?:scope)?s?\b|acceleromet\w*/, "imu"],
];

export const UNMODELLED_SENSORS = new RegExp([
  String.raw`\bforce[\s/-]*(?:torque\s+)?sensors?\b`, String.raw`\bf\/t\s+sensors?\b`,
  String.raw`\bultrasonic(?:\s+sensors?)?`, String.raw`\bsonars?\b`, String.raw`\bgps\b`,
  String.raw`\bbumpers?(?:\s+sensors?)?`, String.raw`\binfrared(?:\s+sensors?)?`, String.raw`\bir\s+sensors?\b`,
  String.raw`\bthermal\s+cameras?\b`, String.raw`\bmicrophones?\b`, String.raw`\btactile\s+sensors?\b`,
  String.raw`\btouch\s+sensors?\b`, String.raw`\bproximity\s+sensors?\b`, String.raw`\bgas\s+sensors?\b`,
  String.raw`\btemperature\s+sensors?\b`,
].join("|"));
const CAMERA_WORDS = /\bcameras?\b|\bvision\b|\beyes?\b|\boptical\b|\bwebcams?\b/;

/** "depth camera" / "stereo camera" is one depth sensor; "RGB-D camera" is colour + depth. */
export function cameraHit(t: string): Hit | undefined {
  return findAll(t, CAMERA_WORDS).find((h) => !/\b(?:depth|stereo|3d|tof|thermal)\s+$/.test(t.slice(Math.max(0, h.index - 8), h.index)));
}

/** Where the text puts this sensor: "wrist camera", "lidar on the front", else `fallback`. */
export function locationOf(t: string, hit: Hit, fallback: string): string {
  const before = t.slice(Math.max(0, hit.index - 20), hit.index).split(/[,;.]|\bbut\b|\band\b/).pop() ?? "";
  const after = t.slice(hit.index + hit.text.length, hit.index + hit.text.length + 30).split(/[,;.]|\bbut\b|\band\b|\bwith\b/)[0];
  const near = before + " " + after;
  if (/\b(?:wrist|gripper|end[\s-]?effector|hand|tool|eye[\s-]in[\s-]hand)\b/.test(near)) return "wrist";
  if (/\b(?:front|base|chassis|body|deck)\b/.test(near)) return "front";
  if (/\b(?:head|top|mast)\b/.test(near)) return "head";
  return fallback;
}

/** "two cameras", "a pair of lidars" (capped at 4). */
export function countOf(t: string, hit: Hit): number {
  const m = t.slice(Math.max(0, hit.index - 18), hit.index).match(/\b(two|three|four|2|3|4|a pair of|pair of|dual|twin)\s+(?:[a-z-]+\s+)?$/);
  if (!m || !/s\b/.test(hit.text)) return 1;
  return ({ two: 2, three: 3, four: 4, "a pair of": 2, "pair of": 2, dual: 2, twin: 2 } as Record<string, number>)[m[1]] ?? Math.min(4, parseInt(m[1], 10));
}

/** Sensor types the prompt asks for (designers mount real parts for them). */
export function requestedSensors(t: string): SensorType[] {
  const hits: [unknown, SensorType][] = [[find(t, SENSOR_WORDS[0][0]), "lidar"], [find(t, SENSOR_WORDS[1][0]), "depth"], [cameraHit(t), "camera"], [find(t, SENSOR_WORDS[3][0]), "imu"]];
  return hits.filter(([h]) => h).map(([, type]) => type);
}

export function applyInlineSensors(spec: RobotSpecification, t: string): { type: SensorType; mount: string }[] {
  const out: { type: SensorType; mount: string }[] = [];
  const lidar = find(t, SENSOR_WORDS[0][0]), depth = find(t, SENSOR_WORDS[1][0]), camera = cameraHit(t), imu = find(t, SENSOR_WORDS[3][0]);
  const wants: [Hit | undefined, SensorType, string][] = [
    [lidar, "lidar", lidar && locationOf(t, lidar, "head")],
    [depth, "depth", depth && locationOf(t, depth, "head")],
    [camera, "camera", camera && locationOf(t, camera, "head")],
    [imu, "imu", "base"],
  ] as [Hit | undefined, SensorType, string][];
  for (const [hit, type, where] of wants) {
    if (!hit) continue;
    const want = countOf(t, hit), have = spec.sensors.filter((x) => x.type === type).length;
    for (let i = have; i < want || (i === 0 && have === 0); i++) addSensor(spec, type, where);   // templates that already carry the sensor win
    for (const s of spec.sensors.filter((x) => x.type === type).slice(0, Math.max(want, 1))) {
      out.push({ type, mount: spec.joints.find((j) => j.child === s.parent)?.parent ?? s.parent });
    }
  }
  // an explicit "no camera" removes a sensor a template would otherwise carry
  for (const [rx, type] of SENSOR_WORDS) if (negates(t, rx) && !out.some((o) => o.type === type))
    for (const s of spec.sensors.filter((x) => x.type === type)) removeSensor(spec, s);
  return out;
}
