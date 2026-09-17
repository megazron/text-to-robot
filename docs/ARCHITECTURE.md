# Architecture

The central rule: **the LLM never writes URDF**. It only produces a structured
`RobotSpecification`. Everything downstream is deterministic, typed and tested.

```
User prompt
   │
   ▼
LLM provider  ──(or)──►  deterministic demo parser   (packages/llm-providers, robot-generator/nlp)
   │
   ▼
RobotSpecification (JSON)                              (packages/robot-schema)
   │
   ▼
Schema + topology + physics validation                (robot-schema/validate)
   │
   ├─ invalid ─► repair (max 3 attempts) ─► re-validate  (robot-generator/repair)
   ▼
Inertia + collision finalized                         (kinematics, robot-generator/finalize)
   │
   ▼
Deterministic URDF / Xacro generation                 (packages/urdf-generator)
   │
   ▼
URDF structural validation                            (packages/urdf-validator)
   │
   ├─► 3D viewer (client FK)                           (apps/web)
   ├─► ROS 2 package + MoveIt 2 + Gazebo               (packages/ros2-export)
   ├─► Bill of Materials sized to a budget             (packages/components)
   ├─► CAD: native STL + OpenSCAD + printability       (packages/cad)
   └─► Training suite: RL / imitation / evaluation     (packages/training-export)
```

## Packages

| Package | Responsibility |
|---|---|
| `robot-schema` | Types, defaults, spec validation (topology + physics) |
| `kinematics` | Inertia tensors, transforms, forward kinematics |
| `robot-templates` | Deterministic starting robots (arms, mobile, legged, humanoid, grippers) |
| `urdf-generator` | Pure URDF + Xacro string generation |
| `urdf-validator` | XML parser, URDF structural validation, URDF→spec parser |
| `llm-providers` | Provider interface + OpenAI + Anthropic; demo mode owned by generator |
| `robot-generator` | Orchestration: NL parse, generate, modify, repair loop, diff |
| `ros2-export` | ament_cmake package, MoveIt 2 config (SRDF/kinematics/controllers/launch), Gazebo world + spawn launch |
| `components` | Real-part catalogue; BOM sized by per-joint holding torque and fitted to a cost budget |
| `cad` | Native STL triangulation per link + assembly, OpenSCAD source, printability report |
| `training-export` | PyBullet + Gymnasium suite: task catalogue per robot class, PPO/SAC, demo collection, behaviour cloning, evaluation |

## Persistence and sharing

The API keeps generated robots in memory and persists them to `data/robots.json`
(configurable with `TTR_DATA_DIR`, capped by `TTR_MAX_ROBOTS`). Every robot has an id;
`/r/<id>` serves the app, which restores that robot from `GET /api/robots/<id>`
(spec + regenerated URDF/Xacro). The Dockerfile mounts `/data` as a volume so a hosted
instance keeps its share links across restarts.

## Verification

- `npm test` — 55 `node:test` cases across schema, kinematics, templates, URDF, NLP, CLI,
  modification, BOM, CAD, MoveIt/Gazebo, training export.
- `npm run typecheck` — strict TypeScript (`erasableSyntaxOnly`, `verbatimModuleSyntax`).
- `scripts/physics_check.py` — loads every example URDF in PyBullet and steps it.
- The generated training suite has been executed end to end (demo collection → PPO/SAC →
  behaviour cloning → evaluation) on a generated arm, and the environments run for every
  robot class.

## Safety

The LLM is treated as an untrusted data source. Its output is parsed as JSON,
coerced into the spec shape, then fully validated and repaired. No LLM output is
ever executed, and all identifiers, filenames and XML are sanitized before use.
