// Motions in the engine: the list of motions a robot has, sampled trajectories with their self-collision check, inverse
// kinematics for dragging, and a motion's files. The collision check uses the same solids as the design's interference
// checks (@ttr/design linkSolid); a part whose mesh is not here (the Mark 43 armour before its forge has run) is left out
// and named, and nothing here ever starts a forge.
import type { RobotSpecification } from "@ttr/robot-schema";
import { linkSolid } from "@ttr/design";
import { build } from "@ttr/solid";
import { armourAvailable, buildPart, meshTopology } from "@ttr/mesh";
import { motions, motion, checkTrajectory, ik, bodyIk, kinematics, robotOf, collisionModel, poseCollisions, toCsv, baseCsv, toJointTrajectoryYaml, toBvh, qVector, type CollisionModel, type LinkMesh, type Trajectory, type IkTarget, type IkOpts } from "@ttr/motion";

/** each link's solid as a triangle mesh in its own frame (metres), null when it has none, or the reason it is not here */
export function linkMeshes(spec: RobotSpecification, given?: (link: RobotSpecification["links"][number]) => LinkMesh | undefined): (LinkMesh | null | { error: string })[] {
  return build(() => spec.links.map((l) => {
    try {
      const mine = given?.(l); if (mine) return mine;
      if (l.geometry.type === "mesh" && l.geometry.part === "armour" && !armourAvailable()) return { error: "armour not forged in this tab yet" };
      // a bought part as the part itself (what the viewer shows and the film check uses), not its bounding box, when its mesh is closed
      if (l.geometry.type === "mesh" && l.geometry.part === "component") {
        const pm = buildPart(l.geometry as never), sc = (l.geometry as { scale?: number[] }).scale ?? [1, 1, 1];
        if (meshTopology(pm).closed) {
          const o = l.origin, cr = Math.cos(o.rpy[0]), sr = Math.sin(o.rpy[0]), cp = Math.cos(o.rpy[1]), sp = Math.sin(o.rpy[1]), cy = Math.cos(o.rpy[2]), sy = Math.sin(o.rpy[2]);
          const R = [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, -sp, cp * sr, cp * cr];
          const positions = new Float32Array(pm.v.length * 3);
          pm.v.forEach((v, i) => { const x = v[0] * sc[0], y = v[1] * sc[1], z = v[2] * sc[2]; positions[3 * i] = R[0] * x + R[1] * y + R[2] * z + o.xyz[0]; positions[3 * i + 1] = R[3] * x + R[4] * y + R[5] * z + o.xyz[1]; positions[3 * i + 2] = R[6] * x + R[7] * y + R[8] * z + o.xyz[2]; });
          return { positions, triangles: Uint32Array.from(pm.f.flat()) };
        }
      }
      const s = linkSolid(l); if (!s) return null;
      const g = s.getMesh(), n = g.numProp, v = g.vertProperties, positions = new Float32Array((v.length / n) * 3);
      for (let i = 0, k = 0; i < v.length; i += n, k += 3) { positions[k] = v[i] / 1000; positions[k + 1] = v[i + 1] / 1000; positions[k + 2] = v[i + 2] / 1000; }
      return { positions, triangles: Uint32Array.from(g.triVerts) };
    } catch (e) { return { error: (e as Error).message }; }
  }));
}
/** the collision model of a robot, built once per spec object */
const models = new WeakMap<RobotSpecification, CollisionModel>();
export function collisionOf(spec: RobotSpecification, given?: Parameters<typeof linkMeshes>[1]): CollisionModel {
  let cm = models.get(spec);
  if (!cm) {
    const meshes = linkMeshes(spec, given);
    cm = collisionModel(robotOf(spec).m, (i) => { const x = meshes[i]; if (x && "error" in x) throw new Error(x.error); return x; });
    models.set(spec, cm);
  }
  return cm;
}

// Sessions: the page registers a robot once and then sends small requests (an IK solve per pointer move) by handle.
const sessions = new Map<string, RobotSpecification>();
let nextHandle = 1;
export function session(spec: RobotSpecification): string {
  for (const [h, s] of sessions) if (s === spec) return h;
  const h = `m${nextHandle++}`; sessions.set(h, spec);
  while (sessions.size > 32) sessions.delete(sessions.keys().next().value as string);
  return h;
}
function specOf(body: { robot?: RobotSpecification; handle?: string }): RobotSpecification {
  if (body.handle) { const s = sessions.get(body.handle); if (s) return s; throw new Error(`unknown motion session '${body.handle}'`); }
  if (!body.robot) throw new Error("send robot or handle");
  return body.robot;
}

export function motionTrajectory(spec: RobotSpecification, name: string, o: { fps?: number; collision?: boolean; to?: [number, number] } = {}): Trajectory {
  let cm: CollisionModel | null = null;
  if (o.collision !== false) { try { cm = collisionOf(spec); } catch { cm = null; } }
  const tr = motion(spec, name, { fps: o.fps, collision: cm, to: o.to });
  if (!cm && o.collision !== false) tr.notes.push("Self-collision was not checked: the parts' solids could not be built here.");
  return tr;
}

/** the files of a motion: joint CSV, root path CSV, ROS 2 JointTrajectory YAML, BVH for a body */
export function motionFiles(spec: RobotSpecification, tr: Trajectory): Record<string, string> {
  const { m, sem } = robotOf(spec), out: Record<string, string> = {};
  out[`${tr.name}.csv`] = toCsv(tr);
  const b = baseCsv(tr); if (b) out[`${tr.name}_base.csv`] = b;
  const act = tr.actuated.filter((n) => { const c = tr.joints.indexOf(n); return c >= 0 && tr.q.some((r) => Math.abs(r[c] - tr.q[0][c]) > 1e-6); });
  if (act.length) out[`${tr.name}.yaml`] = toJointTrajectoryYaml(tr, act);
  if (sem.anatomy.length >= 4) out[`${tr.name}.bvh`] = toBvh(m, sem, tr);
  return out;
}

const json = (code: number, body: unknown) => new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json" } });
/** /api/engine/motion* and /api/engine/ik */
export function motionApi(p: string, body: any): Response | null {
  try {
    if (p === "motion-session") return json(200, { handle: session(body.robot) });
    if (p === "motions") { const spec = specOf(body); return json(200, { motions: motions(spec), kinematics: kinematics(spec) }); }
    if (p === "motion") {
      const spec = specOf(body), tr = motionTrajectory(spec, String(body.name ?? "default"), { fps: body.fps, collision: body.collision, to: body.to });
      return json(200, body.files ? { trajectory: tr, files: motionFiles(spec, tr) } : { trajectory: tr });
    }
    if (p === "motion-check") {
      const spec = specOf(body); let cm: CollisionModel | null = null; try { cm = collisionOf(spec); } catch { cm = null; }
      const tr = checkTrajectory(spec, body.trajectory, cm);
      return json(200, { trajectory: tr, files: motionFiles(spec, tr) });
    }
    if (p === "ik") {
      const spec = specOf(body), r = ik(spec, String(body.link), body.target as IkTarget, (body.options ?? {}) as IkOpts);
      let collisions: { a: string; b: string; depth_mm: number }[] | null = null;
      if (body.options?.collision) { try { const { m } = robotOf(spec); collisions = poseCollisions(collisionOf(spec), qVector(m, { ...(body.options?.seed ?? {}), ...r.values })); } catch { collisions = null; } }
      return json(200, { ...r, collisions });
    }
    if (p === "body-ik") { const spec = specOf(body); return json(200, bodyIk(spec, body.base, body.options ?? {})); }
    if (p === "pose-collisions") { const spec = specOf(body), { m } = robotOf(spec); return json(200, { collisions: poseCollisions(collisionOf(spec), qVector(m, body.values ?? {})) }); }
  } catch (e) { return json(400, { error: (e as Error).message }); }
  return null;
}
