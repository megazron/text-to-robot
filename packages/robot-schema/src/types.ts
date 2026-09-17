// Text-to-Robot :: RobotSpecification -- the strongly-typed intermediate
// representation. The LLM produces this; deterministic code turns it into URDF.

export type Vec3 = [number, number, number];
export type RGBA = [number, number, number, number];

export interface Pose {
  /** translation in metres, relative to the parent frame */
  xyz: Vec3;
  /** roll-pitch-yaw in radians */
  rpy: Vec3;
}

// ---- geometry (discriminated union on `type`) ----
export interface BoxGeometry { type: "box"; size: Vec3; }
export interface CylinderGeometry { type: "cylinder"; radius: number; length: number; }
export interface SphereGeometry { type: "sphere"; radius: number; }
export interface CapsuleGeometry { type: "capsule"; radius: number; length: number; }
export type Geometry = BoxGeometry | CylinderGeometry | SphereGeometry | CapsuleGeometry;

export interface Inertia {
  ixx: number; iyy: number; izz: number;
  ixy: number; ixz: number; iyz: number;
}

export interface Link {
  name: string;
  /** semantic role, e.g. "base" | "link" | "wrist" | "gripper" | "wheel" | "sensor" */
  role?: string;
  geometry: Geometry;
  /** collision geometry; defaults to a copy of `geometry` when omitted */
  collision?: Geometry;
  mass: number;
  inertia?: Inertia;
  /** name of a material defined in RobotSpecification.materials */
  material?: string;
  /** offset of the visual/collision/inertial frame from the link frame */
  origin: Pose;
  /** names of fields that were inferred rather than user-specified */
  inferred?: string[];
}

export type JointType = "revolute" | "continuous" | "prismatic" | "fixed";
export const JOINT_TYPES: readonly JointType[] = ["revolute", "continuous", "prismatic", "fixed"];

export interface JointLimit {
  /** radians (revolute) or metres (prismatic); omitted for continuous/fixed */
  lower?: number;
  upper?: number;
  /** max effort (N or N*m) */
  effort: number;
  /** max velocity (rad/s or m/s) */
  velocity: number;
}

export interface JointDynamics { damping: number; friction: number; }

export interface Joint {
  name: string;
  type: JointType;
  parent: string; // link name
  child: string;  // link name
  origin: Pose;
  axis: Vec3;
  limit?: JointLimit;
  dynamics?: JointDynamics;
  inferred?: string[];
}

export interface Material { name: string; color: RGBA; }

export type SensorType = "camera" | "depth" | "lidar" | "imu" | "force";
export interface Sensor {
  name: string;
  type: SensorType;
  /** link this sensor is rigidly attached to */
  parent: string;
  origin: Pose;
  params?: Record<string, number | string>;
}

export type EndEffectorType = "parallel_gripper" | "two_finger_gripper" | "suction_gripper";
export interface EndEffector {
  name: string;
  type: EndEffectorType;
  /** the link the gripper base attaches to */
  attach_link: string;
}

export interface SpecMetadata {
  generator: string;
  created: string;
  /** dotted paths of values chosen automatically, e.g. "links.forearm.mass" */
  inferred_fields: string[];
  notes: string[];
  source_prompt?: string;
}

export interface RobotSpecification {
  robot_name: string;
  /** explicit root link name; if omitted it is derived from the joint graph */
  root?: string;
  links: Link[];
  joints: Joint[];
  materials: Material[];
  sensors: Sensor[];
  end_effectors: EndEffector[];
  metadata: SpecMetadata;
}

// ---- validation result shared across packages ----
export type IssueSeverity = "error" | "warning";
export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  path?: string;
}
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** human-readable checklist lines for the UI/CLI */
  checks: string[];
}
