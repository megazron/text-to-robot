// Actuator selection: smallest real actuator whose datasheet rating covers the load with margin.
import { rating, part, armature, noLoadSpeed, type ActuatorRating } from "@ttr/parts";

/** Families share one bus and one supply voltage; ladders are ordered weakest -> strongest. */
export const LADDERS = {
  feetech: { label: "Feetech STS serial-bus servos (12 V)", bus: "waveshare_bus_servo_adapter", keys: ["feetech_sts3215_c047", "feetech_sts3250"] },
  dynamixel: { label: "ROBOTIS DYNAMIXEL X-series (12 V)", bus: "dxl_u2d2", keys: ["dxl_xl430_w250", "dxl_xm430_w350", "dxl_xh540_w270"] },
  cubemars: { label: "CubeMars AK quasi-direct-drive (48 V, CAN) with DYNAMIXEL wrist", bus: "dxl_u2d2", keys: ["dxl_xm430_w350", "dxl_xh540_w270", "cubemars_ak60_6", "cubemars_ak70_10", "cubemars_ak80_9", "cubemars_ak80_64"] },
} as const;
export type Ladder = keyof typeof LADDERS;

/** Load factor for acceleration and model error applied to static gravity torque (peak check). */
export const DYNAMIC_FACTOR = 1.3;
/** The worst static pose must be holdable indefinitely: static load <= rated (continuous) torque. */
export const DUTY = 1.0;
/** Slowest joint speed under load worth calling a working robot joint (rad/s). */
export const MIN_SPEED = 1.0;

export interface Choice { key: string; rating: ActuatorRating; required_nm: number; margin: number; ok: boolean; continuous_ok: boolean; speed_ok: boolean; loaded_speed_rad_s: number; }
/**
 * Joint speed this actuator reaches while carrying the load: a point-to-point move over pi rad
 * peaks at accel ~ 1.05 v^2 / pi (min-jerk at 80 % of v), and the motor follows the linear
 * torque-speed line tau <= peak * (1 - w / w0). Keep 10 % in hand.
 */
export function loadedSpeed(key: string, staticNm: number, inertia: number): number {
  const r = rating(key), w0 = noLoadSpeed(key), I = inertia + armature(key);
  for (let v = Math.min(r.speed_rad_s, w0) * 0.95; v > 0.05; v -= 0.02) {
    if (staticNm + I * 1.05 * v * v / Math.PI <= 0.9 * r.peak_nm * (1 - (0.8 * v) / w0)) return +v.toFixed(2);
  }
  return 0;
}
export function evaluate(key: string, staticNm: number, inertia = 0): Choice {
  const r = rating(key), req = staticNm * DYNAMIC_FACTOR;
  const ok = r.peak_nm >= req, continuous_ok = r.rated_nm >= staticNm * DUTY;
  const loaded_speed_rad_s = loadedSpeed(key, staticNm, inertia);
  return { key, rating: r, required_nm: +req.toFixed(3), margin: +Math.min(99, r.peak_nm / Math.max(req, 1e-6)).toFixed(2), ok, continuous_ok, speed_ok: loaded_speed_rad_s >= MIN_SPEED, loaded_speed_rad_s };
}
export const passes = (c: Choice) => c.ok && c.continuous_ok && c.speed_ok;
/** Smallest actuator in the ladder that passes; the strongest one (failing) if none does. */
export function choose(ladder: readonly string[], staticNm: number, inertia = 0): Choice {
  for (const k of ladder) { const c = evaluate(k, staticNm, inertia); if (passes(c)) return c; }
  return evaluate(ladder[ladder.length - 1], staticNm, inertia);
}
export const ladderFor = (budget?: number, need?: number): Ladder => {
  if (need !== undefined) {
    if (need * DYNAMIC_FACTOR <= rating("feetech_sts3250").peak_nm && (budget === undefined || budget < 1500)) return "feetech";
    if (need * DYNAMIC_FACTOR <= rating("dxl_xh540_w270").peak_nm) return budget !== undefined && budget < 800 ? "feetech" : "dynamixel";
    return "cubemars";
  }
  return budget === undefined || budget < 1500 ? "feetech" : "dynamixel";
};
export const priceOf = (key: string) => part(key).price_usd;
