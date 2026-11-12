// A motion as files: a joint CSV (one column per joint), the root's path as CSV when it moves, a ROS 2
// trajectory_msgs/JointTrajectory as YAML (the motor-driven joints), a small rclpy script that replays it on /joint_states
// or to a joint_trajectory_controller, and BVH for a body skeleton (wearables and humanoids).
import type { Trajectory } from "./traj.ts";
import { type Model, fk, qVector } from "./model.ts";
import type { Semantics } from "./semantics.ts";
import { type T34, type V3, inv, mul, sub, atan2 } from "./math.ts";

const f6 = (x: number) => { const s = (Math.round(x * 1e6) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, ""); return s === "-0" ? "0" : s; };

export function toCsv(tr: Trajectory): string {
  const rows = [["time_s", ...tr.joints].join(",")];
  tr.t.forEach((t, k) => rows.push([f6(t), ...tr.q[k].map(f6)].join(",")));
  return `${rows.join("\n")}\n`;
}
export function baseCsv(tr: Trajectory): string | null {
  if (!tr.base) return null;
  const rows = ["time_s,x,y,z,qx,qy,qz,qw"];
  tr.t.forEach((t, k) => rows.push([f6(t), ...tr.base![k].map(f6)].join(",")));
  return `${rows.join("\n")}\n`;
}
/** ROS 2 trajectory_msgs/JointTrajectory (ros2 topic pub / a YAML message file); `joints` defaults to the motor-driven ones */
export function toJointTrajectoryYaml(tr: Trajectory, joints: string[] = tr.actuated.filter((n) => tr.joints.includes(n)), step = 1): string {
  const cols = joints.map((n) => tr.joints.indexOf(n));
  const lines = [
    `# ${tr.title}: ${tr.robot}, ${tr.duration_s} s, ${joints.length} joints. Made by Text to Robot.`,
    "# trajectory_msgs/JointTrajectory. Replay: python3 scripts/replay_motion.py motions/<file>.yaml",
    "header:", "  frame_id: ''", "joint_names:", ...joints.map((n) => `  - ${n}`), "points:",
  ];
  const dt = 1 / tr.fps;
  for (let k = 0; k < tr.t.length; k += step) {
    const tk = k / tr.fps, sec = Math.floor(tk + 1e-9), nsec = Math.round((tk - sec) * 1e9);
    const vel = cols.map((c) => { const a = tr.q[Math.max(0, k - step)][c], b = tr.q[Math.min(tr.t.length - 1, k + step)][c], span = (Math.min(tr.t.length - 1, k + step) - Math.max(0, k - step)) * dt; return span > 0 ? (b - a) / span : 0; });
    lines.push(`  - positions: [${cols.map((c) => f6(tr.q[k][c])).join(", ")}]`, `    velocities: [${vel.map(f6).join(", ")}]`, `    time_from_start: {sec: ${sec}, nanosec: ${nsec}}`);
  }
  return `${lines.join("\n")}\n`;
}

export function replayScript(pkg: string): string {
  return `#!/usr/bin/env python3
"""Replay a motion made by Text to Robot.

  ros2 launch ${pkg} display.launch.py motion:=<motion>   (RViz replays motions/<motion>.yaml in a loop)
  python3 scripts/replay_motion.py motions/<motion>.yaml --all-joints urdf/${pkg}.urdf   (publishes /joint_states yourself)

  python3 scripts/replay_motion.py motions/<motion>.yaml --controller /joint_trajectory_controller
      sends the whole trajectory to a running joint_trajectory_controller (Gazebo or the robot) instead.
Joints the file does not list stay at zero. Needs rclpy and PyYAML (both come with ROS 2).
"""
import argparse, sys, time
import yaml
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from trajectory_msgs.msg import JointTrajectory, JointTrajectoryPoint
from builtin_interfaces.msg import Duration


def main():
    ap = argparse.ArgumentParser(description="Replay a Text to Robot motion")
    ap.add_argument("file")
    ap.add_argument("--controller", help="send to <controller>/joint_trajectory instead of publishing joint states")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--rate", type=float, default=1.0, help="playback speed")
    ap.add_argument("--all-joints", metavar="URDF", help="also publish 0 for every other moving joint of this URDF (robot_state_publisher needs them all)")
    a = ap.parse_args(rclpy.utilities.remove_ros_args(sys.argv)[1:])
    msg = yaml.safe_load(open(a.file))
    names, pts = msg["joint_names"], msg["points"]
    rest = []
    if a.all_joints:
        import xml.etree.ElementTree as ET
        rest = [j.get("name") for j in ET.parse(a.all_joints).getroot().findall("joint") if j.get("type") != "fixed" and j.find("mimic") is None and j.get("name") not in names]
    rclpy.init()
    node = Node("replay_motion")
    if a.controller:
        pub = node.create_publisher(JointTrajectory, a.controller.rstrip("/") + "/joint_trajectory", 10)
        time.sleep(1.0)
        jt = JointTrajectory(joint_names=names)
        for p in pts:
            t = (p["time_from_start"]["sec"] + p["time_from_start"]["nanosec"] * 1e-9) / a.rate
            jt.points.append(JointTrajectoryPoint(positions=[float(x) for x in p["positions"]], velocities=[float(x) * a.rate for x in p.get("velocities", [])], time_from_start=Duration(sec=int(t), nanosec=int((t % 1) * 1e9))))
        pub.publish(jt); rclpy.spin_once(node, timeout_sec=0.5)
        print(f"sent {len(pts)} points to {a.controller}"); return
    pub = node.create_publisher(JointState, "joint_states", 10)
    while rclpy.ok():
        t0 = time.monotonic()
        for p in pts:
            t = (p["time_from_start"]["sec"] + p["time_from_start"]["nanosec"] * 1e-9) / a.rate
            while time.monotonic() - t0 < t: time.sleep(0.002)
            js = JointState(name=names + rest, position=[float(x) for x in p["positions"]] + [0.0] * len(rest))
            js.header.stamp = node.get_clock().now().to_msg(); pub.publish(js)
        if not a.loop: break
    node.destroy_node(); rclpy.shutdown()


if __name__ == "__main__":
    main()
`;
}

/** BVH of the robot's body: the links that carry its anatomical joints (and the root), in centimetres, ZXY rotations */
export function toBvh(m: Model, sem: Semantics, tr: Trajectory): string {
  const keep = new Set<number>([m.root]);
  for (const a of sem.anatomy) keep.add(m.joints[a.joint].child);
  const q0 = qVector(m, {}), W0 = fk(m, q0);
  const T = (W: Float64Array, l: number) => W.subarray(12 * l, 12 * l + 12) as T34;
  const parentKept = (l: number): number => { for (let j = m.parentJoint[l]; j >= 0; j = m.parentJoint[m.joints[j].parent]) if (keep.has(m.joints[j].parent)) return m.joints[j].parent; return -1; };
  const kids = new Map<number, number[]>();
  for (const l of keep) if (l !== m.root) { const p = parentKept(l); if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(l); }
  const order: number[] = [], lines: string[] = ["HIERARCHY"];
  const cm = (v: number) => (v * 100).toFixed(4);
  const write = (l: number, depth: number) => {
    const pad = "  ".repeat(depth), p = l === m.root ? -1 : parentKept(l);
    const off: V3 = p < 0 ? [0, 0, 0] : rel(T(W0, p), T(W0, l));
    order.push(l);
    lines.push(`${pad}${l === m.root ? "ROOT" : "JOINT"} ${m.links[l]}`, `${pad}{`, `${pad}  OFFSET ${cm(off[0])} ${cm(off[1])} ${cm(off[2])}`,
      `${pad}  CHANNELS ${l === m.root ? "6 Xposition Yposition Zposition " : "3 "}Zrotation Xrotation Yrotation`);
    const ch = kids.get(l) ?? [];
    for (const c of ch) write(c, depth + 1);
    if (!ch.length) lines.push(`${pad}  End Site`, `${pad}  {`, `${pad}    OFFSET 0 0 -5`, `${pad}  }`);
    lines.push(`${pad}}`);
  };
  write(m.root, 0);
  lines.push("MOTION", `Frames: ${tr.t.length}`, `Frame Time: ${(1 / tr.fps).toFixed(6)}`);
  for (let k = 0; k < tr.t.length; k++) {
    const q = qVector(m, Object.fromEntries(tr.joints.map((n, c) => [n, tr.q[k][c]]))), W = fk(m, q);
    const vals: string[] = [];
    for (const l of order) {
      const p = l === m.root ? -1 : parentKept(l);
      // the rotation of a link relative to its kept parent, less the rest rotation (BVH OFFSETs carry no rotation)
      const R = p < 0 ? T(W, l) : mul(inv(mul(inv(T(W0, p)), T(W0, l))), mul(inv(T(W, p)), T(W, l)));
      if (l === m.root) { const b = tr.base?.[k] ?? [0, 0, 0]; vals.push(cm(b[0]), cm(b[1]), cm(b[2])); }
      const [z, x, y] = zxy(R);
      vals.push(...[z, x, y].map((v) => ((v * 180) / Math.PI).toFixed(4)));
    }
    lines.push(vals.join(" "));
  }
  return `${lines.join("\n")}\n`;
}
function rel(P: T34, C: T34): V3 {
  const d = sub([C[3], C[7], C[11]], [P[3], P[7], P[11]]);
  return [P[0] * d[0] + P[4] * d[1] + P[8] * d[2], P[1] * d[0] + P[5] * d[1] + P[9] * d[2], P[2] * d[0] + P[6] * d[1] + P[10] * d[2]];
}
/** R = Rz Rx Ry -> [z, x, y] */
function zxy(R: T34): [number, number, number] {
  const x = Math.asin(Math.max(-1, Math.min(1, R[9])));
  return [atan2(-R[1], R[5]), x, atan2(-R[8], R[10])];
}
