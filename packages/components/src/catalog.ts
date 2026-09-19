// Approximate real-world component catalog (street prices, USD, 2024-2026 order of
// magnitude). Prices are estimates for planning, not quotes. Torque in N*m.
export type Tier = "hobby" | "prosumer" | "research";

export interface Part {
  name: string; category: string; unit_cost: number; spec: string; tiers: Tier[];
}
export interface Actuator extends Part { torque?: number; force_n?: number; peak_torque?: number; rating_basis?: string; source_url?: string; requires_custom_design?: boolean; kind: "servo" | "smart_servo" | "stepper" | "bldc" | "linear"; needs_driver?: string; driver_cost?: number; }
export interface Sensor extends Part { sensor: "camera" | "depth" | "lidar" | "imu" | "force"; }
export interface Compute extends Part { level: number; ros2: boolean; }

export const ACTUATORS: Actuator[] = [
  { name: "TowerPro SG90 micro servo", category: "actuator", kind: "servo", torque: 0.18, unit_cost: 3, spec: "9g, PWM, plastic gears", tiers: ["hobby"] },
  { name: "TowerPro MG996R servo", category: "actuator", kind: "servo", torque: 1.1, unit_cost: 5, spec: "55g, PWM, metal gears", tiers: ["hobby"] },
  { name: "DS3218 20kg servo", category: "actuator", kind: "servo", torque: 1.96, unit_cost: 12, spec: "PWM, waterproof, metal gears", tiers: ["hobby", "prosumer"] },
  { name: "NEMA17 stepper", category: "actuator", kind: "stepper", torque: 0.45, unit_cost: 14, spec: "1.8deg, needs driver", needs_driver: "TMC2209 driver", driver_cost: 10, tiers: ["hobby", "prosumer"] },
  { name: "NEMA23 stepper", category: "actuator", kind: "stepper", torque: 1.9, unit_cost: 22, spec: "high torque, needs driver", needs_driver: "DM542 driver", driver_cost: 25, tiers: ["prosumer"] },
  { name: "Dynamixel AX-12A", category: "actuator", kind: "smart_servo", torque: 1.5, unit_cost: 45, spec: "TTL smart servo, daisy-chain", tiers: ["prosumer"] },
  { name: "Dynamixel XM430-W350", category: "actuator", kind: "smart_servo", torque: 4.1, unit_cost: 270, spec: "RS485 smart servo, encoder", tiers: ["prosumer", "research"] },
  { name: "Dynamixel MX-64AR", category: "actuator", kind: "smart_servo", torque: 6.0, unit_cost: 300, spec: "RS485 smart servo", tiers: ["research"] },
  { name: "Dynamixel PRO H54", category: "actuator", kind: "smart_servo", torque: 44, unit_cost: 1800, spec: "industrial smart actuator", tiers: ["research"] },
  { name: "T-Motor AK80-9 (BLDC + driver)", category: "actuator", kind: "bldc", torque: 18, unit_cost: 320, spec: "quasi-direct-drive, CAN", tiers: ["research"] },
  { name: "Unitree GO-M8010-6", category: "actuator", kind: "bldc", torque: 23, unit_cost: 400, spec: "integrated BLDC + planetary, RS485", tiers: ["prosumer", "research"] },
  { name: "CubeMars AK80-64", category: "actuator", kind: "bldc", torque: 48, peak_torque: 120, rating_basis: "manufacturer rated output torque; peak is not a continuous allowance", source_url: "https://www.cubemars.com/goods.php?id=1143", unit_cost: 700, spec: "AK80-64 KV80: 64:1, 48 N m rated / 120 N m peak, 98 x 61.9 mm, 850 g; mounting interfaces require vendor drawing", tiers: ["research"] },
  { name: "Harmonic Drive CSD + frameless BLDC (150 N·m)", category: "actuator", kind: "bldc", torque: 150, requires_custom_design: true, unit_cost: 2400, spec: "wearable-robot joint module, absolute encoder", tiers: ["research"] },
  { name: "Linear actuator 100N", category: "actuator", kind: "linear", force_n: 100, unit_cost: 35, spec: "12V, 100mm stroke (prismatic)", tiers: ["hobby", "prosumer"] },
  { name: "NEMA17 + lead screw", category: "actuator", kind: "linear", force_n: 60, unit_cost: 26, spec: "lead-screw linear stage", needs_driver: "TMC2209 driver", driver_cost: 10, tiers: ["prosumer", "research"] },
];

export const SENSORS: Record<string, Sensor[]> = {
  camera: [
    { name: "Raspberry Pi Camera Module 3", category: "sensor", sensor: "camera", unit_cost: 25, spec: "12MP, CSI", tiers: ["hobby", "prosumer"] },
    { name: "Arducam IMX477 HQ", category: "sensor", sensor: "camera", unit_cost: 50, spec: "12.3MP, C-mount", tiers: ["prosumer", "research"] },
  ],
  depth: [
    { name: "OAK-D Lite", category: "sensor", sensor: "depth", unit_cost: 150, spec: "stereo depth + AI", tiers: ["prosumer"] },
    { name: "Intel RealSense D435i", category: "sensor", sensor: "depth", unit_cost: 180, spec: "RGB-D + IMU", tiers: ["prosumer", "research"] },
  ],
  lidar: [
    { name: "Slamtec RPLidar A1M8", category: "sensor", sensor: "lidar", unit_cost: 99, spec: "2D, 12m, 8k samples/s", tiers: ["hobby", "prosumer"] },
    { name: "Livox Mid-360", category: "sensor", sensor: "lidar", unit_cost: 620, spec: "3D, 40m", tiers: ["research"] },
  ],
  force: [
    { name: "FSR insole pad (x4)", category: "sensor", sensor: "force", unit_cost: 25, spec: "foot contact / CoP estimate", tiers: ["hobby", "prosumer"] },
    { name: "Loadstar / Tekscan insole force sensor", category: "sensor", sensor: "force", unit_cost: 350, spec: "calibrated plantar force", tiers: ["research"] },
  ],
  imu: [
    { name: "MPU-6050", category: "sensor", sensor: "imu", unit_cost: 4, spec: "6-axis, I2C", tiers: ["hobby"] },
    { name: "Bosch BNO085", category: "sensor", sensor: "imu", unit_cost: 20, spec: "9-axis fused AHRS", tiers: ["prosumer", "research"] },
  ],
};

export const COMPUTE: Compute[] = [
  { name: "ESP32 DevKit", category: "compute", level: 1, ros2: false, unit_cost: 8, spec: "microcontroller, micro-ROS", tiers: ["hobby"] },
  { name: "Teensy 4.1", category: "compute", level: 2, ros2: false, unit_cost: 32, spec: "600MHz MCU, real-time control", tiers: ["hobby", "prosumer"] },
  { name: "Raspberry Pi 5 (8GB)", category: "compute", level: 3, ros2: true, unit_cost: 80, spec: "SBC, runs ROS 2", tiers: ["hobby", "prosumer"] },
  { name: "NVIDIA Jetson Orin Nano", category: "compute", level: 4, ros2: true, unit_cost: 499, spec: "GPU SBC, perception + ROS 2", tiers: ["prosumer", "research"] },
  { name: "NVIDIA Jetson AGX Orin", category: "compute", level: 5, ros2: true, unit_cost: 1999, spec: "275 TOPS, full autonomy stack", tiers: ["research"] },
];

export const POWER = {
  batteries: [
    { name: "LiPo 3S 2200mAh", cost: 18, wh: 24, tiers: ["hobby"] as Tier[] },
    { name: "LiPo 4S 5000mAh", cost: 40, wh: 74, tiers: ["hobby", "prosumer"] as Tier[] },
    { name: "LiPo 6S 10000mAh", cost: 95, wh: 222, tiers: ["prosumer", "research"] as Tier[] },
    { name: "Li-ion 48V 20Ah pack", cost: 320, wh: 960, tiers: ["research"] as Tier[] },
  ],
  regulator: { name: "DC-DC buck regulator (5V/10A)", cost: 12, spec: "logic + servo rail" },
  distribution: { name: "Power distribution board + fuse + switch", cost: 14, spec: "wiring harness backbone" },
};

export const STRUCTURE = {
  print_cost_per_kg: 22,   // PLA/PETG filament
  alu_cost_per_kg: 30,     // 2020 extrusion + brackets
  fasteners: { name: "Fastener + bearing kit", cost: 18, spec: "M3 screws, heat inserts, 608 bearings" },
};
