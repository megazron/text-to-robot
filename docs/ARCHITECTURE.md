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
   └─► ROS 2 package export                            (packages/ros2-export)
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
| `ros2-export` | ament_cmake package generation |

## Safety

The LLM is treated as an untrusted data source. Its output is parsed as JSON,
coerced into the spec shape, then fully validated and repaired. No LLM output is
ever executed, and all identifiers, filenames and XML are sanitized before use.
