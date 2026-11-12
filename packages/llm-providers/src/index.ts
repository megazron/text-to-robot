// "Bring your own model" extension point. The CLI and the API server always use the local rule-based parser. The website
// offers one opt-in adapter (apps/web/src/byok.ts: Anthropic or any OpenAI-compatible API, with the visitor's own key kept in
// their browser), and anyone can implement `LlmProvider` and pass it as `generateRobot(prompt, { provider })`.
// A provider's output is untrusted: a body plan is checked field by field (robot-generator/plan.ts) and built by the local
// design engine from real parts; a raw spec goes through coerceSpec, validation and repair; any provider error falls back to
// the local parser, and the result says which path designed the robot.
export * from "./types.ts";
export * from "./json.ts";
/** Status of the CLI and API server: the local rule-based parser (the website adds its opt-in reading options in the page). */
export function providerStatus() {
  return { mode: "local" as const, requires_account: false, requires_token: false, external_inference: false };
}
