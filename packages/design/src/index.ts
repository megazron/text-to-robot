export * from "./assembly.ts";
export * from "./kin.ts";
export * from "./sizing.ts";
export { designArm, type ArmRequest } from "./families/arm.ts";

import type { RobotSpecification } from "@ttr/robot-schema";
import { designArm as _arm } from "./families/arm.ts";
import * as _mobile from "./families/mobile.ts";
import * as _legged from "./families/legged.ts";
import * as _hexapod from "./families/hexapod.ts";
import * as _humanoid from "./families/humanoid.ts";
import * as _scara from "./families/scara.ts";
import * as _gripper from "./families/gripper.ts";
/** Designer per record family: edits re-run the designer with an updated request. */
export const DESIGNERS: Record<string, (req: any) => RobotSpecification> = {
  arm: _arm,
  mobile_diff_drive: _mobile.designDiffDrive, mobile_skid_steer: _mobile.designFourWheel, mobile_mecanum: _mobile.designMecanum,
  mobile_rocker_bogie: _mobile.designRover, character_walle: _mobile.designWallE, character_eva: _mobile.designEva, character_baymax: _mobile.designBaymax,
  quadruped: _legged.designQuadruped, hexapod: _hexapod.designHexapod, humanoid: _humanoid.designHumanoid, mech: _humanoid.designBattleMech,
  scara: _scara.designScara, gripper: _gripper.designGripper,
};
/** The record a designed robot carries (undefined for template robots). */
export const designOf = (spec: RobotSpecification) => (spec.metadata as { design?: import("./assembly.ts").DesignRecord }).design;
export { designDiffDrive } from "./families/mobile.ts";
export { designFourWheel } from "./families/mobile.ts";
export { designMecanum } from "./families/mobile.ts";
export { designRover } from "./families/mobile.ts";
export { designWallE } from "./families/mobile.ts";
export { designEva } from "./families/mobile.ts";
export { designBaymax } from "./families/mobile.ts";
export type { MobileRequest, MobileSensor } from "./families/mobile.ts";
export { interference, type Overlap } from "./interference.ts";
export * from "./clearance.ts";
export { designQuadruped, type LeggedRequest, type SensorKind } from "./families/legged.ts";
export { designHexapod } from "./families/hexapod.ts";
export { designHumanoid, designBattleMech } from "./families/humanoid.ts";
export { designGripper, buildParallelGripper, chooseGripperServo, gripperLevels, GRIP } from "./families/gripper.ts";
export type { DesignRequest } from "./families/common.ts";
export { designScara } from "./families/scara.ts";
export { designArduinoCar, arduinoCarOptions, type ArduinoCarRequest, type ArduinoTier } from "./families/arduino-car.ts";
export { designArduinoArm, type ArduinoArmRequest } from "./families/arduino-arm.ts";
export { designArduinoWallE, type ArduinoWallERequest } from "./families/arduino-walle.ts";
