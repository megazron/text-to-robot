// The design engine of the API server, in a worker thread. manifold-3d 3.5.4 keeps WebAssembly memory after every boolean
// (see apps/web/src/wasm-memory.ts), and a process that designs robot after robot would abort at 4 GB: the server runs the
// engine here and replaces this worker when its kernel memory is full (pool.ts), as the website does in the browser.
import "../../web/src/wasm-memory.ts";   // first: it watches the kernels' memories from the moment they load
import { parentPort } from "node:worker_threads";
import { wasmPeakMb } from "../../web/src/wasm-memory.ts";
import { generateRobot, modifyRobot, finalizeSpec, arduinoOptions, forgeForRobot } from "@ttr/robot-generator";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { validateSpec, type RobotSpecification } from "@ttr/robot-schema";
import { exportRos2Package } from "@ttr/ros2-export";
import { buildBom } from "@ttr/components";
import { generateCadFiles } from "@ttr/cad";
import { exportTraining } from "@ttr/training-export";
import { buildPart, toStlBinary, meshTopology } from "@ttr/mesh";

/** A request the server could not answer: an HTTP status and a message. */
class Refused extends Error {
  status: number; extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) { super(message); this.status = status; this.extra = extra; }
}

async function importRobot(robot: any) {
  if (!robot || !Array.isArray(robot.links) || !Array.isArray(robot.joints)) throw new Refused(400, "provide a RobotSpecification JSON");
  // a file that is not a robot from here (no metadata, links without geometry) is refused with a reason, not a TypeError
  let spec: RobotSpecification;
  try { spec = finalizeSpec(structuredClone({ ...robot, metadata: robot.metadata ?? { notes: [], inferred_fields: [] } }) as RobotSpecification); }
  catch (e) { throw new Refused(400, `This is not a robot file this site can open: ${(e as Error).message}`); }
  const validation = validateSpec(spec);
  if (!validation.valid) throw new Refused(400, "Invalid robot specification", { validation });
  await forgeForRobot(spec);
  for (const link of spec.links) if (link.geometry.type === "mesh") {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.stl$/i.test(link.geometry.file)) throw new Refused(400, "Mesh filenames must be simple STL names");
    // a catalog part comes from our own data by key, not from the imported file
    if (link.geometry.part !== "component" && !meshTopology(buildPart(link.geometry)).closed) throw new Refused(400, `${link.name}: mesh is not a closed volume`);
  }
  const urdf = generateUrdf(spec), urdfValidation = validateUrdf(urdf);
  if (!urdfValidation.valid) throw new Refused(400, "Invalid exported URDF", { urdfValidation });
  return { robot: spec, urdf, xacro: generateXacro(spec), validation, urdfValidation, bom: buildBom(spec),
    warnings: ["Imported geometry and structure checked; hardware fit and dynamic performance remain unverified."] };
}

const OPS: Record<string, (a: any) => unknown> = {
  generate: (a) => generateRobot(String(a.prompt ?? "")),
  modify: async (a) => { await forgeForRobot(a.robot); return modifyRobot(a.robot as RobotSpecification, String(a.instruction ?? "")); },
  arduino: (a) => arduinoOptions(String(a.prompt ?? "")),
  import: (a) => importRobot(a.robot),
  cad: async (a) => { await forgeForRobot(a.robot); return generateCadFiles(a.robot); },
  training: async (a) => { await forgeForRobot(a.robot); return exportTraining(a.robot); },
  export: async (a) => { await forgeForRobot(a.robot); return exportRos2Package(a.robot, { ros2_control: !!a.ros2_control }); },
  mesh: async (a) => { await forgeForRobot(a.robot); return toStlBinary(buildPart(a.geometry), 1); },
};

parentPort!.on("message", async ({ id, op, args }) => {
  try {
    const value = await OPS[op](args);
    parentPort!.postMessage({ id, ok: true, value, wasm_mb: wasmPeakMb() });
  } catch (e) {
    const r = e instanceof Refused ? { status: e.status, extra: e.extra } : { status: 400, extra: {} };
    parentPort!.postMessage({ id, ok: false, error: (e as Error).message, ...r, wasm_mb: wasmPeakMb() });
  }
});
parentPort!.postMessage({ ready: true });
