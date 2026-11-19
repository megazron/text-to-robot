// Deterministic natural-language understanding for local generation. No ML: ordered
// keyword/regex rules, negation-aware matching and unit-aware quantities. Every
// request is either applied, approximated with a stated substitute, or reported as
// ignored; nothing is dropped silently.
import { stage } from "@ttr/parts/profile";
import type { RobotSpecification, SensorType } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { fk, defaultRouterMode } from "@ttr/design";
import { normalize, find, findAll, mentions, negates, extractDofMentions, type DofMention, extractLengths, extractMasses, extractSpeeds, parseBudget, extractName, extractColour, maskNames, paintSpec, paintRgb, STYLE_PALETTE, variantPalette, jobKey } from "./text.ts";
import { armourShape, shapeKey } from "@ttr/mesh";
import { suitOptions } from "./suit.ts";
import { MAX_ARM_DOF, RX, ARM_IT_FITS, SUPPORTED_HINT, wheelCount, gripperRequest, chooseFamily, RECOLOURABLE, type Choice, type GripperKind, type DesignContext } from "./families.ts";
import { translateKeywords, correctTypos } from "./lexicon.ts";
import { applySizeDirectives, designedSizes, reportDesignedReach } from "./sizing.ts";
import { applyInlineSensors, requestedSensors, sensorCount, SENSOR_WORDS, UNMODELLED_SENSORS } from "./sensors.ts";
import { dofOf } from "./spec-utils.ts";
import { triage, PromptRefusal, type Triage } from "./triage.ts";
import { translateScripts } from "./multilingual.ts";
import { readNamed } from "./reading.ts";
import { TOOL_WORDS, type ToolKind } from "./tools.ts";
import { toolPlan } from "./tool-plan.ts";
import { readShape, shapeChips, oneRobot, type RequestShape } from "./request.ts";
import { readShell, SHELL_FAMILIES } from "./shape.ts";
import { KNOWLEDGE } from "./knowledge.ts";
import { budgetNotes } from "@ttr/design";
import { COLOURS as SHELL_COLOURS } from "./text.ts";
import { builtShape, shapeGaps, type BuiltShape } from "./fidelity.ts";

export { MAX_ARM_DOF } from "./families.ts";

/** Requested DOF, clamped to what the serial-arm designer supports (1 to MAX_ARM_DOF). */
// Designers are deterministic in their request and take seconds (sizing loops, exact clearance sweeps):
// a process keeps the last designs it built, and hands out copies (callers edit specs in place).
const designCache = new Map<string, RobotSpecification>();
function buildCached(choice: Choice, ctx: DesignContext): RobotSpecification {
  if (!choice.designed) return choice.build(ctx);
  // (the router is part of the key: the same request wired another way is another robot)
  const key = `${choice.family}|${choice.label}|${defaultRouterMode()}|${JSON.stringify(ctx)}`, hit = designCache.get(key);
  if (hit) return structuredClone(hit);
  const spec = stage("design", () => choice.build(ctx));
  if (budgetNotes().length) return spec;   // cut short by the time budget: not kept, the next ask designs it in full
  if (designCache.size >= 64) designCache.delete(designCache.keys().next().value as string);
  designCache.set(key, structuredClone(spec));
  return spec;
}

export function extractDof(text: string): number | undefined {
  const raw = extractDofMentions(translateKeywords(normalize(text)).text)[0]?.value;
  return raw === undefined ? undefined : Math.min(MAX_ARM_DOF, Math.max(1, Math.round(raw)));
}

/** What the parser understood. `ignored`, `approximations` and `conflicts` are surfaced as warnings. */
export interface Interpretation {
  family: string;
  label: string;
  /** the words that selected the template */
  matched: string;
  dof: number;
  /** the tool that was built: a one-servo claw is reported as a claw, not as jaws */
  gripper?: GripperKind | "claw";
  sensors: { type: SensorType; mount: string }[];
  dimensions: string[];
  name?: string;
  colour?: string;
  budget_usd?: number;
  payload_kg?: number;
  wearer_height_m?: number;
  approximations: string[];
  ignored: string[];
  /** requests that contradict each other ("2 DOF ... 7 joints"); each says which one was used */
  conflicts: string[];
  /** engineering checks the designed robot fails (it was built, but would not work as asked) */
  warnings?: string[];
  /** which path designed the robot: "rules" (keyword rules), "knowledge table", "similarity (...)", or a model provider */
  path: string;
  /** task tools asked for or implied by the task, and whether each was built */
  tools?: { kind: ToolKind; label: string; built: boolean; note?: string }[];
  /** the structure read from the prompt (arms, joints per arm, base, wheels, legs) and the structure built, as chips */
  understood?: { asked: RequestShape; built: BuiltShape; chips: string[]; askedChips: string[] };
}

export interface PromptResult { spec: RobotSpecification; interpretation: Interpretation; }

/** Sensors a designed robot carries, reported like inline sensors (type + the link they sit on). */
const designedSensors = (spec: RobotSpecification) => spec.sensors.map((x) => ({ type: x.type, mount: spec.joints.find((j) => j.child === x.parent)?.parent ?? x.parent }));

/** Deterministic NL -> RobotSpecification plus a record of how each request was handled. */
export interface InterpretOptions { /** a knowledge entry chosen beforehand by a sentence-embedding model (similarity.ts) */ knowledgeHint?: string; }
export function interpretPrompt(original: string, opts: InterpretOptions = {}): PromptResult { return stage("parse", () => interpretIn(original, opts)); }
function interpretIn(original: string, opts: InterpretOptions): PromptResult {
  // markup, instructions to the parser and over-long text are removed first (and said); harmful and impossible requests stop here
  const tri = buildableTriage(original), prompt = tri.text;
  // names and quoted text ("named Tiny", "called 'Unit 50'") never describe the robot's features
  // robot words in other scripts, then basic German/French/Spanish/Hinglish keywords, are mapped onto the English vocabulary first
  const scripts = translateScripts(maskNames(prompt));
  const translation = translateKeywords(scripts.text), typos = correctTypos(translation.text);
  // a named or fictional robot ("R2-D2", "Spot") is read as its body plan
  const named = readNamed(normalize(typos.text));
  const t = named.text;
  const dofMentions = extractDofMentions(t);
  const rawDof = dofMentions[0]?.value;
  const dof = rawDof === undefined ? undefined : Math.min(MAX_ARM_DOF, Math.max(1, Math.round(rawDof)));
  const grip = gripperRequest(t);
  const g = grip.kind;
  const lengths = extractLengths(t);
  const ignored: string[] = [], approximations: string[] = [], dimensions: string[] = [], conflicts: string[] = [], warnings: string[] = [];
  approximations.push(...tri.notes);
  if (tri.impossible) conflicts.push(tri.impossible);
  if (scripts.mapped.length || translation.mapped.length) approximations.push(`read non-English keywords as English: ${[...scripts.mapped, ...translation.mapped].join(", ")}`);
  if (named.note) approximations.push(named.note);
  if (typos.mapped.length) approximations.push(`read misspelt words and emoji as: ${typos.mapped.join(", ")}`);

  // A stated stature fits a wearable suit to its wearer.
  // a standalone battle mech is a robot, not something worn
  const standaloneMech = /\bmech\b(?!\s+suit)/.test(t) && !/iron[\s-]?man|exo|wearable|suit/.test(t);
  const suitish = mentions(t, RX.suit) && !standaloneMech;
  let heightM: number | undefined;
  const stature = suitish ? lengths.find((l) => l.context === "height" && l.metres > 1) : undefined;
  if (stature) {
    if (stature.metres >= 1.5 && stature.metres <= 2.05) heightM = +stature.metres.toFixed(3);
    else ignored.push(`wearer height ${stature.raw} is outside the supported 1.50–2.05 m range; fitted to 1.75 m`);
  }

  const choice = chooseOrFallback(oneRobot(t, readShape(t)), prompt, tri, dof, g, heightM, grip.explicit, opts.knowledgeHint);
  const budget = parseBudget(t);
  const masses = extractMasses(t);
  const payload = masses.find((x) => x.context === "payload");
  const asked = choice.designed && (choice.family === "serial_arm" || choice.family === "scara" || choice.family === "arm_workcell") ? designedSizes(t, choice.label, lengths, stature, { dimensions, approximations, ignored, conflicts }) : undefined;
  const hobby = hobbyServos(t);
  // the Mark 43's own shape and paint: the forge makes the armour from them (generateRobot forges it before this runs)
  const suit = choice.family === "iron_man_mark_43" ? suitOptions(t) : undefined;
  if (suit) {
    dimensions.push(...suit.said); ignored.push(...suit.ignored);
    const loaded = armourShape();
    if (shapeKey(loaded) !== shapeKey(suit.shape)) ignored.push(`armour shape (${suit.said.filter((x) => !/paint|steel parts/.test(x)).join(", ")}): not applied, the loaded armour was forged as ${shapeKey(loaded)}; generate it again to forge this one`);
  }
  // a look asked for is a printed shell on the robot (shell.ts): over a wheeled deck, a legged body, a humanoid's head and
  // chest, an arm's base, a drone's canopy; on any other body it is said (characters keep their own look)
  // asks no designer here builds, said rather than dropped
  if (/\bbalanc(?:e|es|ing)\b|\bself[\s-]?balancing\b|\bsegway\b/.test(t) && ["diff_drive", "four_wheel", "mecanum", "arduino_car"].includes(choice.family))
    approximations.push("self-balancing on two wheels is not designed yet (it needs a balance controller tuned to the robot): built with a caster, so it stands on its own");
  const look = readShell(t, prompt), fits = SHELL_FAMILIES.has(choice.family) && !!choice.designed;
  const lookColour = look ? extractColour(t) : undefined;
  if (look && !fits && !["wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "arduino_car"].includes(choice.family))
    ignored.push(`"${look.said}": shape shells are fitted to wheeled, legged, humanoid, arm and drone robots; the ${choice.label} keeps its own look`);
  const ctx: DesignContext = { ...(look && fits ? { shell: { shape: look.shape, style: look.style, ...(look.emoji ? { emoji: look.emoji } : {}), ...(lookColour ? { colour: SHELL_COLOURS[lookColour].slice(0, 3) as [number, number, number] } : {}) } } : {}), ...(suit ? { suit: { shape: armourShape(), paint: suit.paint } } : {}), ...(hobby ? { hobby } : {}), prompt, budget: budget.usd, payloadKg: payload ? +payload.kg.toFixed(3) : undefined, reachM: asked?.reachM, segments: asked?.segments,
    sensors: requestedSensors(choice.sensorWords ? `${t} ; ${choice.sensorWords}` : t).filter((type) => !negates(t, SENSOR_WORDS.find(([, k]) => k === type)![0])),
    excludeSensors: SENSOR_WORDS.filter(([rx]) => negates(t, rx)).map(([, k]) => k), ...(heightM ? { heightM } : {}) };
  // a standing robot's stated height is a design input of the humanoid / mech designers
  const robotHeight = !suitish && choice.designed && (choice.family === "humanoid" || choice.family === "battle_mech")
    ? lengths.find((l) => l.context === "height") : undefined;
  let spec: RobotSpecification;
  if (robotHeight) {
    // the designers scale legs and torso from the height; one correction step lands the built height on the target
    const built = (s: RobotSpecification) => (s.metadata as { design?: { performance?: { height_m?: number } } }).design?.performance?.height_m ?? 0;
    spec = buildCached(choice, { ...ctx, heightM: robotHeight.metres });
    const h0 = built(spec);
    if (h0 > 0 && Math.abs(h0 - robotHeight.metres) / robotHeight.metres > 0.03) {
      const again = buildCached(choice, { ...ctx, heightM: +(robotHeight.metres * robotHeight.metres / h0).toFixed(3) });
      if (Math.abs(built(again) - robotHeight.metres) < Math.abs(h0 - robotHeight.metres)) spec = again;
    }
    const h = built(spec);
    if (Math.abs(h - robotHeight.metres) / robotHeight.metres <= 0.03) dimensions.push(`height ${h.toFixed(2)} m`);
    else approximations.push(`${robotHeight.raw}: humanoids are designed 0.5-0.85 m tall on servos and up to about 1.3 m on QDD actuators; built ${h.toFixed(2)} m tall`);
    if (choice.family === "humanoid" && robotHeight.metres > 0.9) approximations.push("full-size humanoid: built on CubeMars quasi-direct-drive leg actuators (servo legs cannot carry it)");
    lengths.splice(lengths.indexOf(robotHeight), 1);
  } else spec = buildCached(choice, ctx);
  // record what kind of robot this is, so simulators and exporters pick the right tests and controllers
  const meta = spec.metadata as unknown as Record<string, unknown>;
  if (!meta.family && !(meta.design as { family?: string } | undefined)?.family) meta.family = choice.family;
  if (hobby) {
    if (choice.family === "serial_arm" && choice.designed) dimensions.push(`hobby servos${hobby.only ? ` (${hobby.only.map((k) => k.replace("hobby_", "").toUpperCase()).join(", ")})` : ""} on an Arduino Uno + PCA9685`);
    else if (choice.family.startsWith("arduino_") || choice.family === "iron_man_mark_43") { /* designed around Arduino parts */ }
    else ignored.push(`hobby servos / Arduino: only arms are designed for hobby servos so far; the ${choice.label} uses its standard actuators`);
  }
  if (asked) reportDesignedReach(spec, asked, { dimensions, approximations, ignored, conflicts });
  namedParts(t, spec, { dimensions, approximations });
  // engineering checks that fail are shown with the result, not only in the build report
  const failed = ((spec.metadata as { design?: { checks?: { name: string; pass: boolean; detail: string }[] } }).design?.checks ?? []).filter((c) => !c.pass);
  if (failed.length) {
    const weak = failed.filter((c) => c.name.startsWith("torque:")).map((c) => c.name.slice(7));
    const hint = weak.length && hobby?.only ? ` (try stronger servos, e.g. "with MG996R servos", a shorter reach or a lighter payload)` : weak.length ? " (try a shorter reach or a lighter payload)" : "";
    warnings.push(`design check failed: ${failed.slice(0, 4).map((c) => `${c.name}: ${c.detail.split(" — ")[0]}`).join("; ")}${failed.length > 4 ? ` and ${failed.length - 4} more` : ""}${hint}`);
  }
  if (choice.approx) approximations.push(choice.approx);
  // a template is a shape, not a design: say so where the result is shown, not only in the build report
  if (!choice.designed) approximations.push(`the ${choice.label} is a template robot: not designed from real parts (no actuator sizing, wiring or print checks; the parts list is a rough estimate)`);
  if (grip.note && choice.usesGripper) approximations.push(grip.note);

  if (rawDof !== undefined) {
    const first = dofMentions[0];
    if (first.unit === "link" && choice.usesDof) approximations.push(`"${first.raw}" read as ${dof} DOF (one revolute joint per link)`);
    if (!choice.usesDof) { if (!limbDofs(spec).has(rawDof)) ignored.push(`${rawDof} DOF: the ${choice.label} template has fixed kinematics`); }
    else if (rawDof !== dof) approximations.push(`${rawDof} DOF clamped to ${dof} (supported range 1–${MAX_ARM_DOF})`);
  }
  if (grip.explicit && !choice.usesGripper && !["wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "battle_mech"].includes(choice.family))
    ignored.push(`gripper: the ${choice.label} template has no arm (try "mobile manipulator")`);
  if (g === "suction" && choice.family === "humanoid") ignored.push("suction gripper: humanoid hands use two-finger grippers");
  if (choice.family === "hexapod" && mentions(t, /\b(?:arms?|manipulator)\b/))
    ignored.push(`arm: an arm on the hexapod is not designed (a quadruped carries one: "a robot dog with an arm")`);

  conflicts.push(...dofConflicts(dofMentions, choice), ...familyConflicts(t, choice));
  if (choice.family === "serial_arm" && mentions(t, /\bplanar\b/) && !isPlanar(spec))
    ignored.push(`planar: the ${choice.label} template turns about a vertical base axis; only the 2-DOF arm is planar`);

  // name from prompt if the user names it
  const name = extractName(prompt);
  if (name) spec.robot_name = safeName(name, spec.robot_name);

  if (!asked) applySizeDirectives(spec, t, choice.family, choice.label, lengths, stature, { dimensions, approximations, ignored, conflicts });
  if (heightM) {
    dimensions.push(choice.family === "iron_man_mark_43" ? `sized for a ${heightM.toFixed(2)} m wearer` : `fitted to a ${heightM.toFixed(2)} m wearer`);
    if (Math.abs(heightM - 1.75) > 0.005) approximations.push(choice.family === "iron_man_mark_43"
      ? `the armour is scaled as a whole from its 1.75 m design to ${heightM.toFixed(2)} m (there is no body model); joint limits and clearances were measured at 1.75 m`
      : "suit proportions scaled from the 1.75 m reference; clearance and wearer-contact audits cover the reference size only");
  }
  const sensors = choice.designed ? designedSensors(spec) : applyInlineSensors(spec, t);
  if (choice.designed) for (const type of ctx.sensors) {
    const mounted = spec.sensors.filter((x) => x.type === type).length, wanted = sensorCount(t, type);
    if (!mounted) ignored.push(`${type}: the ${choice.label} design has no mount for it yet`);
    else if (wanted > mounted) ignored.push(`${wanted} ${type}s: the ${choice.label} design mounts ${mounted}`);
  }
  // an ultrasonic ranger the design itself carries (the Arduino car, WALL-E) is applied, not ignored
  const ranger = spec.sensors.some((x) => x.type === "range");
  for (const x of findAll(t, UNMODELLED_SENSORS)) if (!(ranger && /ultrasonic|sonar|proximity/.test(x.text))) ignored.push(`${x.text}: only cameras, depth cameras, lidars, IMUs and (on the Arduino designs) ultrasonic rangers are modelled`);

  const colour = suit ? undefined : extractColour(t);
  if (colour) {
    // the printed body in the colour, accents a shade deeper (text.ts paintSpec); characters keep their livery
    if (!(RECOLOURABLE.has(choice.family) && paintSpec(spec, colour))) ignored.push(`colour "${colour}": the ${choice.label} keeps its own livery`);
  } else if (!suit && RECOLOURABLE.has(choice.family) && choice.designed) {
    // no colour named: a style word brings its palette ("sci-fi", "rugged", "retro"), and a robot made for a job its own
    // (the job's words choose it: the same job, the same palette); a robot asked for by its type keeps the house colours
    const style = look && look.style !== "plain" ? STYLE_PALETTE[look.style] : undefined;
    if (style) paintRgb(spec, style[0], style[1], `${look!.style} style`);
    else {
      // the job: a table entry's own words, or the clause that says what the robot does ("that takes photos of my dog")
      const job = jobKey(t, choice.knowledge || choice.path === "general job" ? t : "");
      const clause = /\b(?:that|which|who|to)\s+\S/.test(t);
      if (job && (choice.knowledge || choice.path === "general job" || clause)) {
        const i = choice.knowledge ? KNOWLEDGE.findIndex((k) => k.id === choice.knowledge) : -1;
        // a table entry sets the hue (the golden angle apart from the other entries), the job's own words move it a little
        const [p, a, label] = variantPalette(`${choice.knowledge ?? ""}|${job}`, i >= 0 ? i : undefined, job); paintRgb(spec, p, a, label);
      }
    }
  }

  if (budget.unsupported) ignored.push(`budget "${budget.unsupported}": only US-dollar budgets are supported`);
  if (budget.invalid) ignored.push(`budget "${budget.invalid}": a budget must be more than $0; built without one`);
  // "-5 kg payload": a load cannot be negative, so the number is not used as one
  if (payload && /-\s*$/.test(t.slice(0, t.indexOf(payload.raw)))) ignored.push(`payload -${payload.raw}: a payload cannot be negative; sized for ${payload.raw}`);
  // "a rover with 6 wheels" on a base that has another number of wheels
  // (casters count: "a 3 wheel robot" is two driven wheels and a caster)
  const shape = readShape(t), built = builtShape(spec);
  const wheelsAsked = wheelCount(t) ?? shape.wheels?.count, wheelsBuilt = built.wheels;
  if (wheelsAsked !== undefined && wheelsBuilt > 0 && wheelsAsked !== wheelsBuilt && wheelsAsked !== built.driven) ignored.push(`${wheelsAsked} wheels: the ${choice.label} has ${built.driven}${wheelsBuilt > built.driven ? ` and ${wheelsBuilt - built.driven} caster${wheelsBuilt - built.driven > 1 ? "s" : ""}` : ""}`);
  else if (wheelsAsked !== undefined && wheelsBuilt === 0 && !/drone|rov|gantry|delta|snake|hand|gripper/.test(choice.family)) ignored.push(`${wheelsAsked} wheels: the ${choice.label} has no wheels`);
  if (shape.robots && choice.family !== "arm_workcell") approximations.push(`"${shape.robots.said}": one prompt designs one robot, so one ${choice.label} was built; ask again for each of the others`);
  // every arm, joint and leg count asked for and not built is said, even where no rule above said it
  const said = [...approximations, ...ignored, ...conflicts].join(" ");
  for (const gap of shapeGaps(shape, built)) if (!(/arms? asked/.test(gap) && /\barms?\b[^.;]*\bbuilt\b|\bone arm\b/.test(said)) && !(/DOF asked/.test(gap) && /DOF/.test(said)) && !(/legs asked/.test(gap) && /legs?/.test(said))) ignored.push(gap);
  let payloadKg: number | undefined;
  if (payload) {
    if (spec.end_effectors.length || choice.designed) payloadKg = +payload.kg.toFixed(3); // designed bases carry it as cargo
    else ignored.push(`payload ${payload.raw}: the ${choice.label} has no end effector to carry it`);
  }
  for (const v of extractSpeeds(t)) ignored.push(`speed ${v}: speed targets are not modelled; ${choice.designed ? "speeds follow the chosen actuators' datasheets" : "joint velocity limits come from the template"}`);
  for (const x of masses) {
    if (x === payload) continue;
    ignored.push(x.context === "payload" ? `payload ${x.raw}: only one payload is sized; using ${payload!.raw}`
      : `mass ${x.raw}: target robot mass is not adjustable; masses follow geometry and materials`);
  }

  // task tools (pump and hose, brush, camera mast...): built where a tool module fits the robot, said where not
  const toolKinds = [...new Set<ToolKind>([...(choice.tools ?? []), ...TOOL_WORDS.filter(([rx]) => mentions(t, rx)).map(([, k]) => k)])];
  const tools = toolKinds.length ? toolPlan(spec, toolKinds, choice) : [];
  for (const x of tools) if (!x.built) ignored.push(`${x.label}: ${x.note}`); else dimensions.push(x.label);
  conflicts.push(...sizeConflicts(t, payload?.kg));
  // the prompt as typed, unless markup or over-long text was removed from it
  spec.metadata.source_prompt = tri.notes.length ? prompt : original;
  spec.metadata.notes.push(`Interpreted locally: type inferred, DOF=${dofOf(spec)}, gripper=${g}.`);
  const interpretation: Interpretation = {
    family: choice.family, label: choice.label, matched: choice.matched, dof: dofOf(spec),
    // report the tool that was actually built (a pick-and-place SCARA gets a suction cup without asking)
    ...(choice.usesGripper ? { gripper: builtTool(spec, g) } : {}),
    sensors, dimensions, ...(name ? { name: spec.robot_name } : {}),
    ...(colour && !ignored.some((i) => i.startsWith("colour")) ? { colour } : {}),
    ...(budget.usd !== undefined ? { budget_usd: budget.usd } : {}),
    ...(payloadKg !== undefined ? { payload_kg: payloadKg } : {}),
    ...(heightM ? { wearer_height_m: heightM } : {}),
    approximations, ignored, conflicts, ...(warnings.length ? { warnings } : {}),
    path: choice.path ?? "rules", ...(tools.length ? { tools } : {}),
    understood: { asked: shape, built, askedChips: shapeChips(shape), chips: builtChips(built, choice, g, spec) },
  };
  // a robot read by the rules carries nothing new (the shipped examples stay byte-identical); any other path is recorded with it
  if (interpretation.path !== "rules" || named.entry) (spec.metadata as unknown as Record<string, unknown>).understood = { path: interpretation.path, ...(choice.knowledge ? { knowledge: choice.knowledge } : {}), ...(named.entry ? { named: named.entry.id } : {}) };
  return { spec, interpretation };
}

/** What was built, as short chips: "2x 6-DOF arm", "6-wheel rover", "gripper", "camera". */
function builtChips(b: BuiltShape, choice: Choice, g: GripperKind, spec: RobotSpecification): string[] {
  const chips: string[] = [];
  const dofs = b.arms.map((a) => a.dof);
  if (dofs.length && dofs.every((d) => d === dofs[0])) chips.push(`${dofs.length}x ${dofs[0]}-DOF arm`);
  else chips.push(...dofs.map((d) => `1x ${d}-DOF arm`));
  if (choice.family === "arm_workcell") chips.push(/torso/.test(choice.label) ? "on a torso column" : "on a shared base plate");
  else if (b.wheels) chips.push(`${b.arms.length ? "on " : ""}${b.wheels}-wheel ${/rover/.test(choice.family) || /rocker/.test(String((spec.metadata as { design?: { family?: string } }).design?.family)) ? "rover" : "base"}`);
  if (b.legs) chips.push(`${b.arms.length ? "on " : ""}${b.legs} legs`);
  if (!b.arms.length && !b.wheels && !b.legs) chips.push(choice.label);
  const shell = (spec.metadata as { design?: { performance?: { shell?: string } } }).design?.performance?.shell;
  if (shell) chips.push(`${shell.split(",")[0]} shell`);
  if (spec.end_effectors.length) chips.push(spec.end_effectors.length > 1 ? `${spec.end_effectors.length}x ${g === "suction" ? "suction cup" : "gripper"}` : g === "suction" ? "suction cup" : "gripper");
  for (const [type, n] of Object.entries(spec.sensors.reduce((m, x) => ({ ...m, [x.type]: (m[x.type] ?? 0) + 1 }), {} as Record<string, number>))) chips.push(n > 1 ? `${n}x ${type}` : type);
  return chips;
}

/** Every prompt gets a robot: one that cannot be placed is built as the general-purpose robot, an impossible one as the
 *  nearest real thing, each said with the result (only harmful requests and empty prompts are refused). */
const GENERAL_ROBOT = "6 dof robot arm with a gripper";
/** The safe build in place of a harmful request: what it asked for is left out and said. */
export function safeInstead(original: string): { body: string; what: string } {
  const t = normalize(original);
  // weapons and explosives: the robot people build to deal with them, an inspection rover with an arm and a camera
  if (/\b(?:guns?|rifles?|pistols?|firearms?|weapon\w*|bombs?|explosives?|grenades?|missiles?|kamikaze|flame[\s-]?throwers?|tasers?|pepper\s+spray|tear\s+gas|stun)\b/.test(t))
    return { body: "a tracked inspection rover with a 6 dof arm and a camera", what: "an inspection rover of the bomb-disposal kind (a camera and an arm, no weapon)" };
  // watching or following a person: a robot with no camera, that goes where it is driven
  if (/\b(?:spy|spies|spying|stalk\w*|track(?:s|ing)?\s+(?:my|a|her|his|their|the)\b|follow(?:s|ing)?\s+(?:my\s+ex|her|him|someone)|hidden\s+camera|without\s+(?:her|his|their)\s+knowing|bathroom|neighbou?r)\b/.test(t))
    return { body: "a differential drive robot without a camera", what: "a plain wheeled robot with no camera" };
  return { body: "a 4 dof robot arm with a gripper", what: "a small desk arm with a gripper" };
}
function buildableTriage(original: string): Triage & { fallback?: string } {
  try { return triage(original); }
  catch (e) {
    if (e instanceof PromptRefusal && e.kind === "harmful") {
      const s = safeInstead(original);
      return { text: s.body, notes: [`${e.message} That part was left out: built ${s.what} instead.`], fallback: "harmful" };
    }
    if (e instanceof PromptRefusal && e.kind === "empty")
      return { text: GENERAL_ROBOT, notes: [`${e.message.split(". ")[0]}: built the general-purpose robot (a 6 DOF arm with a gripper) as a starting point. Describe the robot or its job to change it.`], fallback: "empty" };
    if (!(e instanceof PromptRefusal) || e.kind !== "impossible") throw e;
    const instead = e.message.match(/\btry\s+"([^"]+)"/)?.[1] ?? GENERAL_ROBOT;
    return { text: instead, notes: [`${e.message.replace(/\s*(?:The nearest thing[^:]*:\s*)?try\s+".*$/is, "").replace(/\s*Try\s+.*$/s, "").trim()} I built the nearest real thing instead: "${instead}"`], fallback: "impossible" };
  }
}
function chooseOrFallback(t: string, prompt: string, tri: Triage & { fallback?: string }, dof: number | undefined, g: GripperKind, heightM: number | undefined, explicitGripper: boolean, knowledgeHint?: string): Choice {
  try {
    const c = chooseFamily(t, prompt, dof, g, heightM, explicitGripper, knowledgeHint);
    // the only job in it is the impossible part ("a robot that reads my mind"): the nearest real thing, not a general-purpose arm
    if (c.path === "general job" && tri.impossible) throw new Error("not recognised");
    return c;
  }
  catch (e) {
    if (e instanceof PromptRefusal || !/not recognised/.test((e as Error).message)) throw e;
    let why: string;
    if (tri.impossible) why = `${tri.impossible.replace(/;[^;]*$/, "")}; I built the nearest real thing`;
    // a prompt in another script (Hindi, Urdu, Chinese...) whose words are not in the list
    else if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(prompt) && !/[a-z]{3,}/.test(t)) why = "this prompt is in a language the parser does not read yet (it reads English, with common robot words in Hindi, Urdu, Arabic, Japanese, Chinese, German, French and Spanish, and romanised Hindi)";
    // a greeting, a thank-you or a question about the site: answered, with a robot to start from
    else if (/^\W*(?:hi|hello|hey|hiya|yo|hola|namaste|salam|thanks?|thank\s+you|ty|ok(?:ay)?|cool|nice|lol|help|test(?:ing)?|what\s+(?:can|do)\s+you\s+do|how\s+does\s+(?:this|it)\s+work|who\s+are\s+you)\b[^a-z]*$/.test(t))
      why = "Hello! Describe any robot, or what it should do, and I design it from real parts; here is one to start from";
    else why = notUnderstood(t).replace(/^Robot type not recognised\. /, "").replace(/ Describe the robot.*$/s, "").replace(/\.$/, "");
    const suggestion = tri.impossible && tri.nearest ? tri.nearest.match(/\btry\s+"([^"]+)"/)?.[1] : undefined;
    const body = suggestion ?? GENERAL_ROBOT, nt = normalize(body);
    const c = chooseFamily(nt, body, extractDofMentions(nt)[0]?.value ?? dof, g, heightM, explicitGripper);
    return { ...c, matched: body, path: "fallback", approx: `${why.replace(/^./, (x) => x.toUpperCase())}: built ${/^an?\s/.test(body) ? body : `a ${body}`} as a starting point. Describe the robot or its job to change it, for example "a robot that waters my plants" or "two 6 DOF arms on a mobile robot"${c.approx ? `; ${c.approx}` : ""}` };
  }
}

/** The tool the built robot carries: its end effector, else the design's own record (the Arduino arm's one-servo claw). */
function builtTool(spec: RobotSpecification, asked: GripperKind): GripperKind | "claw" {
  const ee = spec.end_effectors[0];
  if (ee) return /suction/.test(ee.type) ? "suction" : asked === "none" ? "parallel" : asked;
  const designed = (spec.metadata as { design?: { performance?: { gripper?: unknown } } }).design?.performance?.gripper;
  if (typeof designed === "string" && designed !== "none") return /claw/.test(designed) ? "claw" : /suction/.test(designed) ? "suction" : "parallel";
  return "none";
}

/** The explanation for a prompt with no robot, task or object in it: what was read, and what to try. */
function notUnderstood(t: string): string {
  const words = t.match(/[a-z]{2,}/g) ?? [];
  const lead = !words.length ? "I could not find any words in this prompt (only symbols, numbers or emoji I do not know)."
    : words.every((w) => !/[aeiouy]/.test(w) || w.length > 14) || /(.)\1{3,}/.test(t) ? "This does not read as words I know (it looks like random letters)."
    : "I could not find a robot type, a task or an object in this prompt.";
  return `Robot type not recognised. ${lead} Describe the robot, or what it should do, for example "a robot that waters my plants", "something to clean solar panels" or "a 6 DOF arm with a gripper". ${SUPPORTED_HINT}`;
}

/** "a tiny robot that lifts 100 kg": a size word and a payload that cannot both hold. The payload wins, and that is said. */
function sizeConflicts(t: string, payloadKg?: number): string[] {
  const small = t.match(/\b(?:tiny|miniature|mini|micro|pocket[\s-]?sized?|palm[\s-]?sized?|small|little|desk(?:top)?[\s-]?sized?)\b/);
  if (small && payloadKg !== undefined && payloadKg >= (/(?:tiny|mini|micro|pocket|palm)/.test(small[0]) ? 2 : 10))
    return [`"${small[0]}" and a ${payloadKg} kg payload cannot both hold: motors that carry ${payloadKg} kg are not ${small[0]}. The payload was sized for; the robot is as big as that load needs`];
  const big = t.match(/\b(?:huge|giant|enormous|massive|life[\s-]?sized?|full[\s-]?sized?)\b/);
  const light = t.match(/\b(?:light(?:weight)?|feather[\s-]?light|weighs?\s+(?:almost\s+)?nothing)\b/);
  if (big && light) return [`"${big[0]}" and "${light[0]}" pull in opposite directions; the robot was built at the size asked, with the mass its parts have`];
  return [];
}

/** Deterministic NL -> RobotSpecification (local generation). */
export function parsePrompt(prompt: string): RobotSpecification {
  return interpretPrompt(prompt).spec;
}

/** One line: "6-DOF serial arm · parallel gripper · camera (wrist) · reach 0.60 m · budget $500". */
const HOBBY_MODELS: [RegExp, string][] = [[/\bsg[\s-]?90\b/, "hobby_sg90"], [/\bmg[\s-]?90s?\b/, "hobby_mg90s"], [/\bmg[\s-]?996r?\b/, "hobby_mg996r"], [/\bds[\s-]?3218\b/, "hobby_ds3218"]];
/** Hobby-servo / Arduino build requested? Named servo models limit the choice to those models. */
export function hobbyServos(t: string): { only?: string[] } | undefined {
  const named = HOBBY_MODELS.filter(([rx]) => rx.test(t)).map(([, k]) => k);
  if (named.length) return { only: named };
  if (/\b(?:hobby|micro|rc|pwm|analog(?:ue)?)\s+servos?\b|\barduino\b|\bpca\s?9685\b|\bservo\s+(?:driver|shield)\b/.test(t)) return {};
  return undefined;
}

export function describeInterpretation(i: Interpretation): string {
  const parts = [i.label];
  if (i.name) parts.push(`named ${i.name}`);
  // a standalone gripper's label already names it; a claw is not a gripper with jaws
  if (i.gripper && i.gripper !== "none" && i.family !== "gripper" && !(i.gripper === "claw" && /claw/.test(i.label))) parts.push(i.gripper === "claw" ? "one-servo claw" : `${i.gripper} gripper`);
  if (i.gripper === "none") parts.push("no gripper");
  for (const s of i.sensors) parts.push(`${s.type} (${s.mount})`);
  parts.push(...i.dimensions);
  if (i.colour) parts.push(i.colour);
  if (i.payload_kg !== undefined) parts.push(`payload ${i.payload_kg} kg`);
  if (i.budget_usd !== undefined) parts.push(`budget $${i.budget_usd}`);
  return parts.join(" · ");
}

/** Total DOF plus the DOF of each limb ("two 7 DOF arms", "3 DOF legs"), grouped by side prefix. */
function limbDofs(spec: RobotSpecification): Set<number> {
  const groups = new Map<string, number>();
  for (const j of spec.joints) {
    if (j.type === "fixed" || j.passive) continue;
    // "front_left_", "left_", and the short leg prefixes of the legged designs ("lf_", "rm_", "fl_")
    const side = j.name.match(/^((?:(?:front|rear|back|middle|mid|left|right)_)+|(?:[lr][fmr]|[fbr][lr])_)/)?.[1];
    if (!side) continue;
    const limb = side + (/arm|shoulder|elbow|wrist|finger|thumb/.test(j.name) ? "arm" : /hip|knee|ankle|leg|coxa|femur|tibia/.test(j.name) ? "leg" : "other");
    groups.set(limb, (groups.get(limb) ?? 0) + 1);
  }
  return new Set([dofOf(spec), ...groups.values()]);
}

/** Stated joint counts that disagree: "a 2 DOF arm with 7 joints" builds 2 DOF and says so. */
function dofConflicts(mentions: DofMention[], choice: Choice): string[] {
  if (!choice.usesDof || choice.family === "humanoid") return [];   // humanoids state per-limb counts
  const first = mentions[0];
  return mentions.slice(1).filter((m) => m.value !== first?.value)
    .map((m) => `"${m.raw}" contradicts "${first.raw}"; built ${first.value} DOF from the first count stated`);
}

/** Robot types named in the prompt that the chosen template does not provide. */
const OTHER_TYPES: { rx: RegExp; what: string; fits: string[] }[] = [
  { rx: /humanoid|\bbiped(?:al)?\b|\b(?:two|2)[\s-]?legged\b/, what: "humanoid", fits: ["humanoid", "arm_workcell"] },
  { rx: /quadruped|\b(?:four|4)[\s-]?legged\b|\b(?:four|4) legs\b|robo(?:t)?[\s-]?dog\b/, what: "quadruped", fits: ["quadruped", "quadruped_arm"] },
  { rx: RX.hexapod, what: "hexapod", fits: ["hexapod"] },
  { rx: RX.scara, what: "SCARA", fits: ["scara"] },
  { rx: new RegExp([RX.wheels.source, RX.diffDrive.source, RX.fourWheel.source, RX.mecanum.source, RX.omni.source, RX.tracked.source].join("|")),
    what: "wheeled base", fits: ["diff_drive", "four_wheel", "mecanum", "rover_arm", "rover", "arduino_car"] },
  // legged bases already report an arm as not applied
  { rx: RX.arm, what: "arm", fits: ["serial_arm", "rover_arm", "scara", "humanoid", "quadruped", "quadruped_arm", "hexapod", "arduino_arm", "arm_workcell"] },
];
/** Characters and suits are themed designs; their keywords overlap by design. */
const THEMED = new Set(["wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "battle_mech"]);
/** "an arm that is also a rover", "an arm or a rover": two robots in one description. */
const IDENTITY = /\b(?:is|are|be|being)\s+(?:also\s+)?an?\b|\balso\s+an?\b|\bor\s+(?:an?\s+)?\b|\bas well as being\b/;

function familyConflicts(t: string, choice: Choice): string[] {
  if (THEMED.has(choice.family)) return [];
  // quote the keyword with the noun it describes: "wheeled rover", not just "wheeled"
  const phrase = (h: { index: number; text: string }) =>
    (h.text + (t.slice(h.index + h.text.length).match(/^\s+(?:rover|robot|base|platform|chassis|vehicle)\b/)?.[0] ?? "")).trim();
  const out: string[] = [];
  for (const o of OTHER_TYPES) {
    const hit = find(o.what === "arm" && choice.family === "gripper" ? t.replace(ARM_IT_FITS, (x) => " ".repeat(x.length)) : t, o.rx);
    if (hit && !o.fits.includes(choice.family)) out.push(`"${phrase(hit)}" asks for a ${o.what}, but a prompt builds one robot; built the ${choice.label}`);
  }
  if (choice.family === "rover_arm") {
    const arm = find(t, RX.arm), base = find(t, OTHER_TYPES[4].rx);
    if (arm && base) {
      const [a, b] = arm.index < base.index ? [arm, base] : [base, arm];
      if (IDENTITY.test(t.slice(a.index + a.text.length, b.index)))
        out.push(`"${phrase(arm)}" and "${phrase(base)}" describe two different robots; combined them into one mobile manipulator (wheeled base carrying the arm)`);
    }
  }
  return out;
}

/** All moving joints share one axis (a planar chain), compared in the world frame. */
function isPlanar(spec: RobotSpecification): boolean {
  const f = fk(spec), axes = spec.joints.filter((j) => (j.type === "revolute" || j.type === "continuous") && j.name !== "gripper").map((j) => f.joint[j.name].axis);
  return axes.length > 0 && axes.every((a) => Math.abs(a[0] * axes[0][0] + a[1] * axes[0][1] + a[2] * axes[0][2]) > 0.999);
}

/** Boards and drivers named in the prompt: used when the design can take them, otherwise the swap is said with the reason. */
const UNO_KEPT = "the Uno is kept: the board sits on the desk beside the arm, so either works and the sketch is the same";
const NAMED_PARTS: { rx: RegExp; key: string | string[]; label: string; instead: Record<string, string> }[] = [
  { rx: /\barduino\s+nano\b|\bnano\b/, key: "arduino_nano_clone", label: "Arduino Nano",
    instead: { arduino_uno_clone: UNO_KEPT, arduino_uno_r3: UNO_KEPT } },
  { rx: /\barduino\s+uno\b|\buno\b/, key: ["arduino_uno_clone", "arduino_uno_r3"], label: "Arduino Uno",
    instead: { arduino_nano_clone: "an Arduino Nano is used instead: it plugs into the breadboard with the motor driver (an Uno does not), and the sketch runs unchanged on an Uno wired with jumpers" } },
  { rx: /\bl298n?\b/, key: "l298n_module", label: "L298N",
    instead: { tb6612fng_module: "a TB6612FNG is used instead: the L298N loses about 2 V in its bipolar bridge (TT motors on the 7.4 V pack would run slow and hot) and it does not plug into the breadboard" } },
  { rx: /\btb6612(?:fng)?\b/, key: "tb6612fng_module", label: "TB6612FNG", instead: {} },
  { rx: /\bpca9685\b/, key: "pca9685_clone", label: "PCA9685", instead: {} },
  { rx: /\bhc[\s-]?sr04\b/, key: "hc_sr04", label: "HC-SR04", instead: {} },
];
function namedParts(t: string, spec: RobotSpecification, out: { dimensions: string[]; approximations: string[] }): void {
  const design = (spec.metadata as { design?: { purchased?: { key: string }[] } }).design;
  if (!design?.purchased) return;
  const have = new Set(design.purchased.map((p) => p.key));
  for (const n of NAMED_PARTS) {
    if (!n.rx.test(t)) continue;
    if ([n.key].flat().some((k) => have.has(k))) { out.dimensions.push(`${n.label} as asked`); continue; }
    const swap = Object.entries(n.instead).find(([k]) => have.has(k));
    out.approximations.push(swap ? `${n.label} named: ${swap[1]}` : `${n.label} named but this design does not use one`);
  }
}

/** What a prompt would build, without designing it (fast): the family, the path that chose it and the tools. Throws PromptRefusal like interpretPrompt. */
export function understandPrompt(original: string, opts: InterpretOptions = {}): { family: string; label: string; path: string; matched: string; approx?: string; tools: ToolKind[]; notes: string[]; text: string; designed: boolean } {
  const tri = buildableTriage(original);
  const scripts = translateScripts(maskNames(tri.text));
  const translation = translateKeywords(scripts.text), typos = correctTypos(translation.text);
  const named = readNamed(normalize(typos.text)), t = named.text;
  const rawDof = extractDofMentions(t)[0]?.value, dof = rawDof === undefined ? undefined : Math.min(MAX_ARM_DOF, Math.max(1, Math.round(rawDof)));
  const grip = gripperRequest(t);
  const c = chooseOrFallback(oneRobot(t, readShape(t)), tri.text, tri, dof, grip.kind, undefined, grip.explicit, opts.knowledgeHint);
  const tools = [...new Set<ToolKind>([...(c.tools ?? []), ...TOOL_WORDS.filter(([rx]) => mentions(t, rx)).map(([, k]) => k)])];
  return { family: c.family, label: c.label, path: c.path ?? "rules", matched: c.matched, ...(c.approx ? { approx: c.approx } : {}), tools, text: t, designed: !!c.designed,
    notes: [...tri.notes, ...(tri.impossible ? [tri.impossible] : []), ...scripts.mapped, ...translation.mapped, ...typos.mapped, ...(named.note ? [named.note] : [])] };
}
