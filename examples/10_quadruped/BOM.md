# Bill of Materials — quadruped

**Estimated total: $530.42**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(IMU (body attitude) · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V regulator (computer, sensors) · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint fl_hip_abduction; joint fl_hip_pitch; joint fl_knee; joint fr_hip_abduction; … · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 12 | 22 | 264 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(forward camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(main computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to servo bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 14 printed parts _(base_link, top_deck, fl_shoulder, fl_thigh, fl_shin, fr_shoulder, fr_thigh, fr_shin, rl_shoulder, rl_thigh, rl_shin, rr_shoulder, rr_thigh, rr_shin)_ | 1 | 11.89 | 11.89 | 470 g of parts (+15 % supports/waste), about 42.8 h of printing |
| Fasteners | Screws, nuts and inserts | 104 | 0.12 | 12.48 | 4x M2.5 x 10 board screws; 4x M3 x 10 deck screws; 48x M2 x 6 case screws; 48x horn screws |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| fl_hip_abduction | 0.841 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.5x |
| fl_hip_pitch | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.34x |
| fl_knee | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.33x |
| fr_hip_abduction | 0.841 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.5x |
| fr_hip_pitch | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.34x |
| fr_knee | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.33x |
| rl_hip_abduction | 0.841 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.5x |
| rl_hip_pitch | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.34x |
| rl_knee | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.33x |
| rr_hip_abduction | 0.841 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.5x |
| rr_hip_pitch | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.34x |
| rr_knee | 1.26 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.33x |

## Notes
- Servo quadruped, 1.41 kg, hip height 0.18 m, 12 DOF, 33 min runtime, $506 of parts
- Sized for a 0.3 kg payload.
- A trot has two diagonal feet on the ground: the COM sits on the support line, so trotting needs the dynamic balance of the gait controller; the creep gait keeps three feet down (statically stable).
- Every joint's limits are inside its collision-free range (exact solid sweeps).
- Zero joint angles are the standing pose (knees bent); the base origin is at hip-axis height with the feet on the ground plane.
- Joint loads are J^T F at the stance feet for a trot (two diagonal feet carry the whole robot + payload) over a gait envelope, plus ±15 % traction forces, x 1.3 dynamic factor; continuous duty checked at 71 % of the worst stance load (RMS over a gait cycle with half of it in stance).
- Feet are moulded / TPU-printed rubber spheres (contact pads) bolted to the shin tip.
- Servo dog: position-controlled gaits (open-loop trot / creep) run on the computer through the serial servo bus.
- Battery is strapped into the printed fence on the body floor; never screw into a pack.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
