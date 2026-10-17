// "Bring your own model" extension point -- NOT used by the shipped CLI, API or web UI.
//
// Everything text-to-robot ships generates robots with the local rule-based prompt
// parser (robot-generator/nlp) and parameterised templates. No model adapter is
// included. If you want to plug in your own model, implement `LlmProvider` and pass
// it as `generateRobot(prompt, { provider })` / `modifyRobot(spec, text, { provider })`;
// its output is treated as untrusted (coerceSpec + full validation and repair), and
// any provider error falls back to the local parser.
export * from "./types.ts";
export * from "./json.ts";
/** Status of the shipped service: always the local rule-based parser. */
export function providerStatus() {
  return { mode: "local" as const, requires_account: false, requires_token: false, external_inference: false };
}
