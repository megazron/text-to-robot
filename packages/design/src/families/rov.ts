// Small tethered ROV: a 4 in watertight acrylic tube (aluminium end caps, potted cable penetrators) held in a frame of
// four aluminium tubes and printed end frames, two horizontal T200 thrusters at the stern (surge and yaw) and two
// vertical ones amidships (heave and roll), subsea foam on top and stainless ballast on the skid, so the vehicle
// floats up slowly and rights itself (centre of buoyancy above the centre of mass).
// Inside the hull a printed tray carries the 4S pack, a Raspberry Pi 5 (talks to the surface over the tether's
// Ethernet), a PCA9685 that drives the four Basic ESCs, a 5 V regulator, an IMU and a forward camera behind the
// clear end cap.
//
// Checks: buoyancy and trim (net lift, metacentric height), thrust against drag at the cruise speed, heave thrust,
// pack current and run time, heat out through the sealed hull, the hull's depth rating.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, type Vec3 } from "@ttr/parts";
import { frame, translation, invert, apply, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass, comWorld, fk, linkCom } from "../kin.ts";
import { registerBay, enclosureChecks, standoffOps } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { withSolids, interferences } from "../clearance.ts";
import { recordCost, tubeLink, buyTubeStock, type DesignRequest } from "./common.ts";

const THRUSTER = "t200_thruster", ESC = "basic_esc_30a", HULL = "wte_4in_300", PACK = "lipo_4s_5000", FOAM = "buoyancy_foam_1l", BALLAST = "ballast_200g";
const RHO = 1000, G = 9.81;
const TUBE_Y = 80, TUBE_Z = 70, FRAME_X = 190;      // frame tubes (mm) and end-frame stations
const CD = 1.0;                                      // box-like ROV drag coefficient on its frontal area

/** T200 thrust (N) forward at a supply voltage: the maker's figures at 12 V and 16 V, interpolated. */
const t200Thrust = (v: number) => { const s = part(THRUSTER).specs; const a = Number(s.thrust_at_12v_fwd_kgf), b = Number(s.max_thrust_fwd_kgf); return (a + (b - a) * (v - 12) / 4) * G; };

/** Printed end frame (a plate in the y-z plane at x) with four sockets for the frame tubes and a centre ring round the hull cap. */
function endFrameOps(x: number, t = 8): Op[] {
  const ops: Op[] = [];
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) ops.push({ op: "beam", a: [x, 0, 0], b: [x, sy * TUBE_Y, sz * TUBE_Z], w: 16, h: t, up: [1, 0, 0] }, { op: "rod", a: [x - 12, sy * TUBE_Y, sz * TUBE_Z], b: [x + 12, sy * TUBE_Y, sz * TUBE_Z], r: 15 });
  ops.push({ op: "rod", a: [x - t / 2, 0, 0], b: [x + t / 2, 0, 0], r: 66 }, { op: "hole", a: [x - t, 0, 0], b: [x + t, 0, 0], d: 116 });
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) ops.push({ op: "hole", a: [x - 13, sy * TUBE_Y, sz * TUBE_Z], b: [x + 13, sy * TUBE_Y, sz * TUBE_Z], d: 20.3 }, { op: "hole", a: [x, sy * (TUBE_Y + 16), sz * TUBE_Z], b: [x, sy * (TUBE_Y + 6), sz * TUBE_Z], d: 4.4 });
  return ops;
}
/** Hull saddle: a ring round the tube at x, joined to the four frame tubes. */
function saddleOps(x: number): Op[] {
  const ops: Op[] = [{ op: "rod", a: [x - 8, 0, 0], b: [x + 8, 0, 0], r: 66 }];
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) ops.push({ op: "beam", a: [x, sy * 40, sz * 40], b: [x, sy * TUBE_Y, sz * TUBE_Z], w: 14, h: 16, up: [1, 0, 0] }, { op: "rod", a: [x - 8, sy * TUBE_Y, sz * TUBE_Z], b: [x + 8, sy * TUBE_Y, sz * TUBE_Z], r: 14 });
  ops.push({ op: "hole", a: [x - 9, 0, 0], b: [x + 9, 0, 0], d: 114.6 });
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) ops.push({ op: "hole", a: [x - 9, sy * TUBE_Y, sz * TUBE_Z], b: [x + 9, sy * TUBE_Y, sz * TUBE_Z], d: 20.3 });
  return ops;
}
/** Thruster post: a printed upright between the upper and lower frame tube on one side, the thruster's foot bolted to it at height z. */
function postOps(x: number, side: 1 | -1, zFoot: number): Op[] {
  const y0 = side * (TUBE_Y - 6), y1 = side * (TUBE_Y + 6);
  const ops: Op[] = [{ op: "box", min: [x - 14, Math.min(y0, y1), -TUBE_Z + 10], max: [x + 14, Math.max(y0, y1), TUBE_Z - 10] }];
  for (const sz of [-1, 1]) ops.push({ op: "rod", a: [x - 14, side * TUBE_Y, sz * TUBE_Z], b: [x + 14, side * TUBE_Y, sz * TUBE_Z], r: 14 }, { op: "hole", a: [x - 15, side * TUBE_Y, sz * TUBE_Z], b: [x + 15, side * TUBE_Y, sz * TUBE_Z], d: 20.3 });
  ops.push({ op: "box", min: [x - 14, Math.min(side * (TUBE_Y + 6), side * (TUBE_Y + 14)), zFoot - 15], max: [x + 14, Math.max(side * (TUBE_Y + 6), side * (TUBE_Y + 14)), zFoot + 15] });
  return ops;
}

export function designRov(req: DesignRequest = {}): RobotSpecification {
  const A = new Assembly(req.name ?? "underwater_rov", "rov_underwater", req.prompt);
  A.design.request = { ...req } as Record<string, unknown>;
  const payload = Math.max(0, req.payloadKg ?? 0);
  const I = translation([0, 0, 0]);
  // the skid (bottom plate with clamps round the two lower tubes) is the base; printed in two halves that meet at x = 0
  // the plate runs 4 mm under the tubes' lowest point: the saddles and posts that clamp the same tubes stay clear of it
  const ZP = -TUBE_Z - 14;
  const skid: Op[] = [{ op: "box", min: [-168, -TUBE_Y - 10, ZP - 4], max: [168, TUBE_Y + 10, ZP], r: 6 }];
  for (const x of [-160, -60, 60, 155]) for (const sy of [-1, 1]) skid.push({ op: "rod", a: [x - 8, sy * TUBE_Y, -TUBE_Z], b: [x + 8, sy * TUBE_Y, -TUBE_Z], r: 13 }, { op: "box", min: [x - 8, sy * TUBE_Y - 10, ZP - 0.5], max: [x + 8, sy * TUBE_Y + 10, -TUBE_Z] });
  for (const x of [-160, -60, 60, 155]) for (const sy of [-1, 1]) skid.push({ op: "hole", a: [x - 9, sy * TUBE_Y, -TUBE_Z], b: [x + 9, sy * TUBE_Y, -TUBE_Z], d: 20.3 });
  for (const x of [-110, 110]) skid.push({ op: "hole", a: [x, 0, ZP - 5], b: [x, 0, ZP + 1], d: 30 });
  for (const y of [-50, 50]) skid.push({ op: "box", min: [-10, y - 8, ZP - 4], max: [10, y + 8, ZP + 8] }, { op: "hole", a: [-11, y, ZP + 3], b: [11, y, ZP + 3], d: 3.4 });
  A.printedLink("base_link", { name: "base_link", ops: [...skid, { op: "cutbox", min: [0, -200, -200], max: [200, 200, 200] }] }, { role: "base", material: "printed_accent" });
  A.printedLink("skid_fore", { name: "skid_fore", ops: [...skid, { op: "cutbox", min: [-200, -200, -200], max: [0, 200, 200] }] }, { material: "printed_accent" });
  A.fixed("skid_fore_mount", "base_link", "skid_fore", I);
  A.fastener("M3 x 20 + nut (skid halves, through the joining lugs)", 2);
  A.spec.root = "base_link";

  // ---------------- frame: four 20 mm aluminium tubes, two printed end frames, two hull saddles
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) tubeLink(A, "base_link", I, `frame_tube_${sy > 0 ? "l" : "r"}${sz > 0 ? "t" : "b"}`, [-FRAME_X - 10, sy * TUBE_Y, sz * TUBE_Z], [FRAME_X + 10, sy * TUBE_Y, sz * TUBE_Z], "al_tube_20x2_1m", "frame tubes");
  for (const [n, x] of [["bow_frame", FRAME_X - 4], ["stern_frame", -FRAME_X + 4]] as const) { A.printedLink(n, { name: n, ops: endFrameOps(x) }, { material: "printed_dark" }); A.fixed(`${n}_mount`, "base_link", n, I); }
  for (const [n, x] of [["saddle_fore", 95], ["saddle_aft", -95]] as const) { A.printedLink(n, { name: n, ops: saddleOps(x) }, { material: "printed_dark" }); A.fixed(`${n}_mount`, "base_link", n, I); }
  A.fastener("M4 x 25 + nyloc (tube sockets, through the tube)", 16);

  // ---------------- hull along x, centred; the tray inside it carries the electronics
  const hullT = frame([-149, 0, 0], [1, 0, 0], [0, 0, 1]);
  A.mount("base_link", HULL, hullT, "hull", "watertight electronics hull", "metal");
  const trayZ = -18;
  const tray: Op[] = [{ op: "box", min: [-140, -42, trayZ - 3], max: [140, 42, trayZ], r: 4 },
    // joining lugs where the two halves meet
    ...[-8, 8].map((y): Op => ({ op: "box", min: [-8, y - 5, trayZ - 10], max: [8, y + 5, trayZ - 3] })),
    // ribs that rest on the tube's inside, a lightening pattern, strap slots for the pack
    ...[-120, -40, 40, 120].map((x): Op => ({ op: "box", min: [x - 3, -44, trayZ - 24], max: [x + 3, 44, trayZ - 3] })),
    ...[-90, 20, 100].map((x): Op => ({ op: "hole", a: [x, 0, trayZ - 4], b: [x, 0, trayZ + 1], d: 18 })),
    ...[-120, -40].map((x): Op => ({ op: "cutbox", min: [x - 2, -40, trayZ - 4], max: [x + 2, 40, trayZ + 1] }))];
  // ribs follow the tube's inner circle: trim them with a cylinder just inside the 101.6 mm bore
  tray.push({ op: "subtract", of: [{ op: "box", min: [-150, -60, -60], max: [150, 60, 60] }, { op: "hole", a: [-151, 0, 0], b: [151, 0, 0], d: 99 }] });
  for (const y of [-8, 8]) tray.push({ op: "hole", a: [-9, y, trayZ - 6.5], b: [9, y, trayZ - 6.5], d: 3.4 });
  // standoffs for the boards with holes, on the tray top
  const boards: [string, Mat4][] = [["rpi5", translation([22, -27, 5.5])], ["buck_5v_5a", translation([113, -38, 4])], ["bno085_breakout", translation([113, 14, 4])]];
  for (const [k, T] of boards) tray.push({ op: "at", T: translation([0, 0, trayZ]), of: standoffOps(k, T) });
  // printed in two halves (the bed is 250 mm): aft carries the pack and two ESCs, fore the rest
  A.printedLink("hull_tray_aft", { name: "hull_tray_aft", ops: [...tray, { op: "cutbox", min: [0, -200, -200], max: [200, 200, 200] }] }, { material: "printed" });
  A.printedLink("hull_tray_fore", { name: "hull_tray_fore", ops: [...tray, { op: "cutbox", min: [-200, -200, -200], max: [0, 200, 200] }] }, { material: "printed" });
  A.fixed("hull_tray_aft_mount", "hull", "hull_tray_aft", invert(hullT));
  A.fixed("hull_tray_fore_mount", "hull_tray_aft", "hull_tray_fore", I);
  A.fastener("M3 x 20 + nut (tray halves)", 2);
  const on = (key: string, name: string, T: Mat4, use: string) => A.mount(T[12] < 0 ? "hull_tray_aft" : "hull_tray_fore", key, T, name, use);
  on(PACK, "battery", translation([-126, -20, trayZ]), "4S 5000 mAh pack (strapped to the tray)");
  A.buy("strap_50mm_velcro", 1, "battery strap");
  // on the tray: pack, Pi, regulator, IMU, camera; hanging under it between the ribs: the PWM board and the four ESCs
  on("rpi5", "controller", translation([22, -27, trayZ + 5.5]), "Raspberry Pi 5 (vehicle computer, Ethernet to the surface)");
  on("pca9685_clone", "pwm_driver", translation([50, -12.7, trayZ - 3 - 10.7]), "PCA9685: PWM to the four ESCs (hangs under the tray)");
  on("buck_5v_5a", "regulator", translation([113, -38, trayZ + 4]), "5 V 5 A for the Pi");
  on("bno085_breakout", "imu", translation([113, 14, trayZ + 4]), "IMU (attitude for stabilisation)");
  for (let k = 0; k < 4; k++) on(ESC, `esc_${k + 1}`, translation([k < 2 ? -112 : -36, k % 2 ? 17 : -39, trayZ - 3 - 9]), `thruster ESC ${k + 1} (hangs under the tray)`);
  on("rpi_camera_module_3", "camera", frame([138.5, -12.5, -11.9], [1, 0, 0], [0, 1, 0]), "forward camera behind the clear end cap");
  A.spec.sensors.push({ name: "camera", type: "camera", parent: "camera", origin: { xyz: [0.0125, 0.0144, 0.0091], rpy: [0, 0, 0] }, params: { part: "rpi_camera_module_3", note: "looks out through the clear front end cap" } });
  A.spec.sensors.push({ name: "imu", type: "imu", parent: "imu", origin: { xyz: [0.0128, 0.01135, 0.0026], rpy: [0, 0, 0] }, params: { part: "bno085_breakout" } });
  A.fastener("M2.5 x 6 self-tapping (boards to tray)", 16);

  // ---------------- thrusters: horizontal pair at the stern (+x thrust), vertical pair amidships (+z thrust)
  const thrusters: { name: string; at: Vec3; dir: Vec3 }[] = [];
  const thr = (name: string, at: Vec3, dir: Vec3, xdir: Vec3, post: Op[]) => {
    A.printedLink(`${name}_post`, { name: `${name}_post`, ops: post }, { material: "printed_dark" }); A.fixed(`${name}_post_mount`, "base_link", `${name}_post`, I);
    A.mount("base_link", THRUSTER, frame(at, dir, xdir), name, "thruster");
    A.fastener("M3 x 12 (thruster foot to post)", 2);
    thrusters.push({ name, at: at.map((v) => v / 1000) as Vec3, dir });
  };
  const yT = TUBE_Y + 14 + 60;    // the foot (60 mm off the axis) on the post's outer face
  thr("thruster_left", [-130 + 70, yT, 0], [1, 0, 0], [0, 0, -1], postOps(-130, 1, 0));
  thr("thruster_right", [-130 + 70, -yT, 0], [1, 0, 0], [0, 0, 1], postOps(-130, -1, 0));
  thr("thruster_vert_left", [20, yT, 40 + 70], [0, 0, 1], [1, 0, 0], postOps(20, 1, 40));
  thr("thruster_vert_right", [20, -yT, 40 + 70], [0, 0, 1], [-1, 0, 0], postOps(20, -1, 40));

  // ---------------- buoyancy: displaced volume of everything vs its weight; foam on top, ballast on the skid
  const volOf = (l: { geometry: { type: string; volume?: number; radius?: number; length?: number }; name: string }) => {
    if (l.name === "hull") return Number(part(HULL).specs.displaced_volume_l) / 1000;
    if (l.geometry.type === "mesh") return Number(l.geometry.volume ?? 0);
    if (l.geometry.type === "cylinder") return Math.PI * (l.geometry.radius ?? 0) ** 2 * (l.geometry.length ?? 0) * 0.36;   // tube wall only (20 x 2 mm)
    return 0;
  };
  const inHull = new Set(["battery", "controller", "pwm_driver", "regulator", "imu", "camera", "hull_tray_aft", "hull_tray_fore", ...[1, 2, 3, 4].map((k) => `esc_${k}`)]);
  const displaced = () => A.spec.links.filter((l) => !inHull.has(l.name)).reduce((s, l) => s + volOf(l as never), 0);
  // centre of buoyancy: each flooded part's displaced volume at its centroid in the world (the hull at its own centre)
  const cobOf = (): Vec3 => { const F = fk(A.spec); const s: Vec3 = [0, 0, 0]; let v = 0; for (const l of A.spec.links.filter((x) => !inHull.has(x.name))) { const vol = volOf(l as never), T = F.link[l.name], c = l.name === "hull" ? [0, 0, 0.149] : linkCom(l); if (!vol || !T) continue; for (let i = 0; i < 3; i++) s[i] += (T.R[i][0] * c[0] + T.R[i][1] * c[1] + T.R[i][2] * c[2] + T.p[i]) * vol; v += vol; } return s.map((x) => x / Math.max(v, 1e-9)) as Vec3; };
  let foam = 0, ballast = 0;
  const net = () => (displaced() * RHO) - (totalMass(A.spec) + payload);      // kg of lift (positive floats)
  // foam blocks (1 L, 0.31 kg) on top until it floats, then 200 g ballast weights under the skid down to slightly positive
  const foamT = (k: number) => translation([-160, -50, TUBE_Z + 10 + k * 50]);   // on the top tubes between the vertical thrusters, aft of centre: its lift balances the pack
  // at least one block high up: foam on top and ballast low is what keeps it upright
  while ((foam === 0 || net() < 0.15) && foam < 3) { A.mount("base_link", FOAM, foamT(foam), `foam_${foam + 1}`, "buoyancy foam (strapped to the top tubes)", "printed"); foam++; }
  const ballastT = (k: number) => translation([-135 + (k % 4) * 70, -40 + Math.floor(k / 4) * 28, ZP - 4 - 17]);
  while (net() > 0.25 && ballast < 12) { A.mount("base_link", BALLAST, ballastT(ballast), `ballast_${ballast + 1}`, "trim ballast (bolted under the skid)"); ballast++; }
  // level it: slide the ballast along and across the skid until the centre of mass sits under the centre of buoyancy
  // (the weights move together, so they keep their spacing; the group stays on the skid)
  if (ballast) for (let it = 0; it < 6; it++) {
    const cb = cobOf(), cm = comWorld(A.spec), m = totalMass(A.spec), eff = ballast * (0.2 - 0.0253);
    const js = A.spec.joints.filter((j) => /^ballast_\d+$/.test(j.child)), xs = js.map((j) => j.origin.xyz[0]), ys = js.map((j) => j.origin.xyz[1]);
    const dx = Math.max(-0.168 - Math.min(...xs), Math.min(0.108 - Math.max(...xs), ((cb[0] - cm[0]) * m) / eff));
    const dy = Math.max(-0.085 - Math.min(...ys), Math.min(0.06 - Math.max(...ys), ((cb[1] - cm[1]) * m) / eff));
    for (const j of js) { j.origin.xyz[0] += dx; j.origin.xyz[1] += dy; }
  }
  A.mount("base_link", "tether_cat5_25m", translation([-FRAME_X - 60, -75, -20]), "tether", "tether (coiled at the surface; its weight is carried there)");
  A.spec.joints.pop(); A.spec.links.pop();   // the coil stays topside: bought, not carried
  A.buy("tether_cat5_25m", 1, "tether to the surface laptop (Ethernet)");
  for (const n of ["penetrator_m10"]) A.buy(n, 6, "four thruster cables, the tether and a vent plug through the rear end cap");

  // ---------------- the hull is the compartment: sealed, cooled through its wall into the water
  const H = new Harness(A);
  // cable exits through the rear end cap, given in the hull's own frame (z along the hull, the cap face at z = -12)
  const exits = [...thrusters.map((_, k) => ({ id: `hull_bay.pen_${k + 1}`, kind: "gland", face: "floor" as const, at: [20, (k - 1.5) * 18, -12] as Vec3, normal: [0, 0, -1] as Vec3, hole_mm: 10 })),
    { id: "hull_bay.tether", kind: "gland", face: "floor" as const, at: [-25, 0, -12] as Vec3, normal: [0, 0, -1] as Vec3, hole_mm: 10 }];
  registerBay(A, { name: "hull_bay", tub: "hull", lid: "hull", parent: "base_link", T: translation([0, 0, 0]), min: [-50.8, -50.8, 0], max: [50.8, 50.8, 298],
    parts: [...inHull].filter((n) => !n.startsWith("hull_tray")), exits, screws: 8, sealed: true, solids: ["hull_tray_aft", "hull_tray_fore"],
    note: "sealed hull: double O-ring end caps, potted penetrators; heat leaves through the acrylic wall into the water" }, H);
  H.mainPower("VBAT", { source: "battery", pos: "BAT+", neg: "BAT-", volts: 14.8, cont: 60, peakLimit: 120, simultaneous: 4, simNote: "all four thrusters at full thrust" });
  H.regulator("regulator", "VBAT", "5V", { vin: "VIN", gin: "GND", vout: "VOUT", gout: "GND", volts: 5, cont: 5, peakLimit: 5 });
  H.feed("5V", "controller", { v: "power_usbc.VBUS", g: "power_usbc.GND", typ: 1.2, peak: 3 });
  H.spare("controller.power_usbc.CC1", "controller.power_usbc.CC2", "regulator.EN", "regulator.PG", "regulator.VRP");
  H.feed("5V", "pwm_driver", { v: "VCC", g: "GND", typ: 0.01, peak: 0.02 });
  H.signals("controller", "pwm_driver", [["GPIO2", "SDA", "I2C_SDA"], ["GPIO3", "SCL", "I2C_SCL"]]);
  H.feed("5V", "imu", { v: "VIN", g: "GND" });
  H.signals("controller", "imu", [["GPIO2", "SDA", "I2C_SDA"], ["GPIO3", "SCL", "I2C_SCL"]]);
  thrusters.forEach((t, k) => {
    const e = `esc_${k + 1}`, r = H.rec(t.name).current_a.v;
    H.feed("VBAT", e, { v: "VBAT+", g: "GND", typ: r.typical, peak: r.peak });
    H.signals("pwm_driver", e, [[`PWM${k}`, "PWM", `ESC${k + 1}_PWM`]]);
    for (const ph of ["A", "B", "C"]) { const n = `${t.name}_${ph}`.toUpperCase(); H.net(n, "signal"); H.wire(n, `${e}.${ph}`, `${t.name}.${ph}`, { typ: r.typical / 1.5, peak: r.peak / 1.5 }); }
    H.wire("GND", `pwm_driver.ch${k}.GND`, `${e}.GND_SIG`, { typ: 0.01 });
    H.spare(`${e}.signal.NC`, `pwm_driver.ch${k}.V+`);
  });
  H.bought("camera.@csi", "controller.cam_dsi_0.CAM_DN0", "camera FFC, 200 mm (Pi 5 22-pin to 15-pin)");
  H.spare("controller.cam_dsi_1", "controller.gpio40", "controller.usb_a", "controller.micro_hdmi", "controller.fan", "controller.uart_debug", "controller.rtc_battery_j5", "controller.power_button_j2", "controller.pcie_fpc", "battery.balance");
  H.spare("controller.ethernet");
  for (let k = 4; k < 16; k++) H.spare(`pwm_driver.ch${k}`);
  H.spare("pwm_driver.control_out", "pwm_driver.v_plus", "pwm_driver.control_in.V+");
  H.plugSwitch = "no switch in the sealed hull: the pack's XT60 is plugged in through the open end cap just before the hull is sealed, and unplugged first after a dive";
  H.notes.push("The tether's twisted pairs carry 100 Mbit Ethernet from the Pi to the surface laptop; it enters through a potted penetrator in the rear end cap like the thruster cables.");
  finishWiring(H, { noClips: /hull|tray|esc_|pwm|controller|regulator|imu|camera|battery/ });
  enclosureChecks(A);
  // inside the round hull: every part's box corners within the 101.6 mm bore (less 1 mm) and between the end caps
  { const f = fk(A.spec), hw = f.link.hull, out: string[] = [];
    for (const n of [...inHull].filter((x) => !x.startsWith("hull_tray"))) {
      const l = A.spec.links.find((x) => x.name === n)!, b = part(String(l.geometry.type === "mesh" ? l.geometry.params?.key : "")).bbox_mm!, w = f.link[n];
      for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
        const pw = [0, 1, 2].map((i) => w.R[i][0] * x / 1000 + w.R[i][1] * y / 1000 + w.R[i][2] * z / 1000 + w.p[i]), d = pw.map((v, i) => v - hw.p[i]);
        const loc = [0, 1, 2].map((i) => (hw.R[0][i] * d[0] + hw.R[1][i] * d[1] + hw.R[2][i] * d[2]) * 1000);
        if (Math.hypot(loc[0], loc[1]) > 50.8 - 1 || loc[2] < 0 || loc[2] > 298) { out.push(`${n} (${Math.hypot(loc[0], loc[1]).toFixed(1)} mm from the axis at ${loc[2].toFixed(0)} mm)`); break; }
      }
    }
    A.check("hull:fit", !out.length, out.length ? `outside the bore: ${[...new Set(out)].join(", ")}` : "every part in the hull is inside the 101.6 mm bore with 1 mm to spare and between the end caps"); }

  // ---------------- clearance at rest
  const skip = new Set<string>([...inHull].map((n) => `hull|${n}`));
  for (const j of A.spec.joints) if (j.type === "fixed" && (inHull.has(j.child) || /frame_tube|foam|ballast/.test(j.child))) skip.add(`${j.parent}|${j.child}`);
  const hits = withSolids(A.spec, (mdl) => interferences(mdl, {}, undefined, 2, skip));
  A.check("clearance:home", hits.length === 0, hits.length ? `intersecting: ${hits.slice(0, 6).map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no part intersects another");

  // ---------------- trim, thrust, power, heat
  const mass = totalMass(A.spec) + payload, V = displaced(), lift = V * RHO - mass;
  A.check("buoyancy:net", lift > 0 && lift < 0.4, `displaces ${(V * 1000).toFixed(2)} L (${(V * RHO).toFixed(2)} kg of water) and weighs ${mass.toFixed(2)} kg: ${lift >= 0 ? "floats up" : "sinks"} with ${(lift * 1000).toFixed(0)} g net (target: slightly positive, so it surfaces if power is lost); ${foam} foam block${foam === 1 ? "" : "s"}, ${ballast} ballast weight${ballast === 1 ? "" : "s"}`);
  // centre of buoyancy (volume-weighted) against the centre of mass: CoB above CoG rights the vehicle
  const f = comWorld(A.spec);
  const cob = cobOf();
  const gb = (cob[2] - f[2]) * 1000;
  const pitchDeg = Math.atan2(Math.abs(cob[0] - f[0]) * 1000, Math.max(gb, 1e-6)) * 180 / Math.PI, rollDeg = Math.atan2(Math.abs(cob[1] - f[1]) * 1000, Math.max(gb, 1e-6)) * 180 / Math.PI;
  A.check("buoyancy:trim", pitchDeg <= 8 && rollDeg <= 5, `it floats ${pitchDeg.toFixed(1)} deg nose ${cob[0] > f[0] ? "up" : "down"} and ${rollDeg.toFixed(1)} deg rolled (centre of buoyancy ${((cob[0] - f[0]) * 1000).toFixed(0)} mm ahead of the centre of mass, ${gb.toFixed(0)} mm above it); slide a ballast weight along the skid to level it`);
  A.check("buoyancy:righting", gb >= 10, `centre of buoyancy ${gb.toFixed(0)} mm above the centre of mass (foam high, pack and ballast low): it rolls and pitches back upright on its own`);
  const v = 14.8, Fh = 2 * t200Thrust(v), area = 0.25 * 0.25, drag1 = 0.5 * RHO * CD * area * 1.0 ** 2;
  const vmax = Math.sqrt((2 * Fh) / (RHO * CD * area));
  A.check("thrust:surge", Fh >= 1.5 * drag1, `two T200s give ${Fh.toFixed(0)} N forward at ${v} V; drag at 1 m/s is ${drag1.toFixed(0)} N (Cd ${CD} on ${(area * 1e4).toFixed(0)} cm^2): top speed about ${vmax.toFixed(1)} m/s before the tether's drag`);
  const Fv = 2 * t200Thrust(v);
  A.check("thrust:heave", Fv >= 3 * Math.abs(lift) * G, `vertical thrusters give ${Fv.toFixed(0)} N against ${(Math.abs(lift) * G).toFixed(1)} N of net buoyancy: dives and holds depth easily`);
  const thrA = Number(H.rec("thruster_left").current_a.v.peak), cruiseA = 4 * 3 + 1.5, peakA = 4 * thrA + 1.5;
  const packA = Number(part(PACK).specs.max_current_a);
  A.check("power:pack_current", peakA <= packA, `four thrusters at full thrust draw ${peakA.toFixed(0)} A (${thrA} A each at 16 V) vs the pack's ${packA} A; the electronics draw about 1.5 A`);
  const runMin = (Number(part(PACK).specs.capacity_mah) / 1000 * 0.8) / cruiseA * 60;
  A.check("power:run_time", runMin >= 15, `${runMin.toFixed(0)} min at cruise (about 3 A per thruster) from 80 % of the 5000 mAh pack; full thrust empties it in ${((5 * 0.8) / peakA * 60).toFixed(0)} min`);
  const heat = 5 + 4 * 0.6 + 1;   // Pi 5 working; four ESCs at cruise (about 1 % of 50 W each); regulator and boards
  const Aw = Math.PI * 0.114 * 0.3, dT = heat * (0.0062 / (0.19 * Aw) + 1 / (500 * Aw) + 1 / (5 * Math.PI * 0.1016 * 0.298));
  A.check("hull:heat", dT <= 30, `${heat} W inside the sealed hull leave through the 6 mm acrylic wall into the water: the air inside runs about ${dT.toFixed(0)} K above the water (the Pi throttles above 80 C)`);
  A.check("hull:depth", true, `${part(HULL).specs.depth_rating_m} m rating for the tube and caps; printed frame parts are open (flooded) and see no pressure difference`);
  if (req.budget !== undefined) A.check("budget", recordCost(A) <= req.budget, `$${recordCost(A).toFixed(2)} of parts vs $${req.budget} budget`);
  buyTubeStock(A);

  (A.design as unknown as { thrusters: typeof thrusters; buoyancy: unknown }).thrusters = thrusters;
  (A.design as unknown as { buoyancy: unknown }).buoyancy = { displaced_l: +(V * 1000).toFixed(3), net_lift_kg: +lift.toFixed(3), cob_m: cob.map((x) => +x.toFixed(4)), com_m: f.map((x) => +x.toFixed(4)), drag_cd: CD, frontal_area_m2: area };
  A.design.performance = { mass_kg: +mass.toFixed(2), displaced_l: +(V * 1000).toFixed(2), net_buoyancy_g: Math.round(lift * 1000), righting_arm_mm: Math.round(gb), surge_thrust_n: Math.round(Fh), heave_thrust_n: Math.round(Fv),
    max_thrust_per_thruster_n: +t200Thrust(v).toFixed(1), top_speed_m_s: +vmax.toFixed(2), run_time_min: Math.round(runMin), depth_rating_m: Number(part(HULL).specs.depth_rating_m), foam_blocks: foam, ballast_weights: ballast, payload_kg: payload };
  A.design.assumptions.push(
    "Seal the hull with fresh, greased O-rings and pull a vacuum through the vent plug (it must hold 10 minutes) before every dive; a flooded hull destroys the electronics.",
    "Thrust is the maker's bollard figure interpolated to 14.8 V; drag uses Cd 1.0 on a 25 x 25 cm frontal area (a guess for an open frame) and leaves out the tether's drag.",
    "Trim (foam and ballast) is computed for fresh water; in sea water it floats about 2.5 % more, so add one ballast weight.",
    "The printed frame parts flood: they carry no pressure. PETG is fine in water; avoid PLA, which slowly swells.",
  );
  recordCost(A);
  return A.finish(`Tethered ROV: 4 in sealed hull, 4 x T200 (surge, yaw, heave, roll), ${mass.toFixed(1)} kg, ${(lift * 1000).toFixed(0)} g net lift, about ${vmax.toFixed(1)} m/s, ${runMin.toFixed(0)} min`);
}
void apply;
