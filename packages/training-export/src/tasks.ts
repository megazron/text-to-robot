import type { RobotClass } from "./classify.ts";

// Task catalogue per robot class. Each entry is a name + a Python reward body
// (variables available: p, self, action, np; must set `reward`, `terminated`).
export interface TaskDef { id: string; title: string; reward: string; }

export const TASKS: Record<RobotClass, TaskDef[]> = {
  gripper: [
    {id:"aperture",title:"Control additional finger opening from home",reward:
`        travel = sum(p.getJointState(self.robot,j)[0] for j in self.joints)
        error = abs(travel - float(self.target[0]))
        reward = -error - 0.001 * float(np.square(action).sum())
        terminated = error < 0.002`},
  ],
  manipulator: [
    { id: "reach", title: "Reach a sampled collision-free target", reward:
`        tip = p.getLinkState(self.robot, self.tip_index)[4]
        dist = float(np.linalg.norm(np.array(tip) - self.target))
        reward = -dist - 0.001 * float(np.square(action).sum())
        terminated = dist < 0.05` },
    { id: "track", title: "Track a sequence of reachable targets", reward:
`        if self.steps % 100 == 0: self.target = self._reachable_target()
        tip = p.getLinkState(self.robot, self.tip_index)[4]
        dist = float(np.linalg.norm(np.array(tip) - self.target))
        reward = -dist
        terminated = False` },
    { id: "hold", title: "Reach and hold (settle) at the target", reward:
`        tip = p.getLinkState(self.robot, self.tip_index)[4]
        vel = np.array([p.getJointState(self.robot, j)[1] for j in self.joints])
        dist = float(np.linalg.norm(np.array(tip) - self.target))
        reward = -dist - 0.05 * float(np.linalg.norm(vel))
        terminated = dist < 0.04 and float(np.linalg.norm(vel)) < 0.1` },
  ],
  mobile: [
    { id: "forward", title: "Drive forward as fast as possible", reward:
`        vel, _ = p.getBaseVelocity(self.robot)
        pos, _ = p.getBasePositionAndOrientation(self.robot)
        reward = float(vel[0]) - 0.5 * abs(float(vel[1]))
        terminated = pos[2] < 0.02` },
    { id: "goto", title: "Navigate to a goal point", reward:
`        pos, _ = p.getBasePositionAndOrientation(self.robot)
        dist = float(np.linalg.norm(np.array(pos[:2]) - self.target[:2]))
        reward = -dist
        terminated = dist < 0.15` },
  ],
  locomotion: [
    { id: "walk", title: "Walk forward without falling", reward:
`        pos, orn = p.getBasePositionAndOrientation(self.robot)
        vel, _ = p.getBaseVelocity(self.robot)
        up = p.getMatrixFromQuaternion(orn)[8]
        reward = float(vel[0]) + 0.5 * up - 0.001 * float(np.square(action).sum())
        terminated = pos[2] < self.fall_height` },
    { id: "balance", title: "Stand and balance in place", reward:
`        pos, orn = p.getBasePositionAndOrientation(self.robot)
        up = p.getMatrixFromQuaternion(orn)[8]
        reward = up - 0.5 * float(np.linalg.norm(p.getBaseVelocity(self.robot)[0]))
        terminated = pos[2] < self.fall_height` },
    { id: "turn", title: "Turn in place to a heading", reward:
`        _, orn = p.getBasePositionAndOrientation(self.robot)
        yaw = p.getEulerFromQuaternion(orn)[2]
        reward = -abs(yaw - float(self.target[2]))
        terminated = False` },
  ],
};
