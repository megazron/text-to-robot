// The website's bring-your-own-key path (apps/web/src/byok.ts) with the network mocked: the request each provider sends,
// a model's body plan built from real parts, untrusted or failing output falling back to the local parser, harmful
// prompts never sent, and the key never in the result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, PLAN_SCHEMA } from "@ttr/robot-generator";
import { makeProvider } from "../apps/web/src/byok.ts";

const KEY = "sk-test-0123456789";
const plan = { locomotion: "multirotor", count: 4, arms: { count: 0, dof: 0, reach_m: 0 }, effector: "none", tools: [], sensors: ["camera"], payload_kg: 0, budget_usd: 400, size: "small", task: "aerial photos of a field" };
type Seen = { url: string; headers: Record<string, string>; body: any };
function mockFetch(reply: (s: Seen) => unknown, status = 200) {
  const seen: Seen[] = [], real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input), h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const s: Seen = { url, headers: Object.fromEntries(h.entries()), body: JSON.parse(String(init?.body ?? (input instanceof Request ? await input.text() : "{}"))) };
    seen.push(s);
    return new Response(JSON.stringify(reply(s)), { status, headers: { "Content-Type": "application/json", "request-id": "req_test" } });
  }) as typeof fetch;
  return { seen, restore: () => { globalThis.fetch = real; } };
}
const anthropicReply = (text: string, stop = "end_turn") => ({ id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: stop, stop_sequence: null,
  content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } });

test("Anthropic: claude-opus-5-5 with the plan schema; the plan is designed from real parts and the key is not in the result", async () => {
  const m = mockFetch(() => anthropicReply(JSON.stringify(plan)));
  try {
    const r = await generateRobot("something to take aerial photos of my farm", { provider: makeProvider({ kind: "anthropic", key: KEY }, PLAN_SCHEMA) });
    const s = m.seen[0];
    assert.match(s.url, /api\.anthropic\.com\/v1\/messages/);
    assert.equal(s.headers.authorization ?? `Bearer ${s.headers["x-api-key"]}`, `Bearer ${KEY}`);
    assert.equal(s.headers["anthropic-dangerous-direct-browser-access"], "true");
    assert.equal(s.body.model, "claude-opus-5-5");
    assert.equal(s.body.fallbacks, "default");
    assert.equal(s.body.output_config.format.type, "json_schema");
    assert.deepEqual(s.body.output_config.format.schema, PLAN_SCHEMA);
    assert.equal(r.interpretation?.path, "model (Anthropic claude-opus-5-5)");
    assert.match(r.designedBy, /model wrote a body plan; the local design engine built it from real parts/);
    assert.equal((r.robot.metadata as any).design.family, "drone_quad");
    assert.doesNotMatch(JSON.stringify(r), new RegExp(KEY));
  } finally { m.restore(); }
});

test("OpenAI-compatible: chat completions with a strict JSON schema at the chosen base URL", async () => {
  const m = mockFetch(() => ({ choices: [{ message: { content: JSON.stringify({ ...plan, locomotion: "gantry", sensors: [], task: "plot drawings with a pen", tools: ["pen"] }) } }] }));
  try {
    const r = await generateRobot("a machine that draws", { provider: makeProvider({ kind: "openai", key: KEY, baseUrl: "http://localhost:11434/v1", model: "llama3" }, PLAN_SCHEMA) });
    const s = m.seen[0];
    assert.equal(s.url, "http://localhost:11434/v1/chat/completions");
    assert.equal(s.headers.authorization, `Bearer ${KEY}`);
    assert.equal(s.body.response_format.json_schema.strict, true);
    assert.equal((r.robot.metadata as any).design.family, "gantry_xyz");
    assert.match(r.interpretation!.path, /^model \(localhost:11434 llama3\)$/);
  } finally { m.restore(); }
});

test("untrusted output: garbage, a refusal or an HTTP error falls back to the local parser and says so", async () => {
  for (const [reply, status] of [[anthropicReply("not json at all"), 200], [anthropicReply("", "refusal"), 200], [{ type: "error", error: { type: "authentication_error", message: "bad key" } }, 401]] as const) {
    const m = mockFetch(() => reply, status);
    try {
      const r = await generateRobot("a robot that waters my plants", { provider: makeProvider({ kind: "anthropic", key: KEY }, PLAN_SCHEMA) });
      assert.match(r.warnings.join(), /designed by the local parser instead/);
      assert.equal(r.interpretation?.path, "knowledge table");
      assert.doesNotMatch(JSON.stringify(r), new RegExp(KEY));
    } finally { m.restore(); }
  }
});

test("a model's plan is clamped to what the engine builds: an unknown body is said, not trusted", async () => {
  const m = mockFetch(() => anthropicReply(JSON.stringify({ ...plan, locomotion: "teleporter", payload_kg: 9999 })));
  try {
    const r = await generateRobot("a robot", { provider: makeProvider({ kind: "anthropic", key: KEY }, PLAN_SCHEMA) });
    assert.match(r.interpretation!.approximations.join(), /not one the engine builds/);
  } finally { m.restore(); }
});

test("harmful prompts are refused before anything is sent", async () => {
  const m = mockFetch(() => anthropicReply(JSON.stringify(plan)));
  try {
    await assert.rejects(generateRobot("a drone that drops bombs", { provider: makeProvider({ kind: "anthropic", key: KEY }, PLAN_SCHEMA) }), /weapons/);
    assert.equal(m.seen.length, 0);
  } finally { m.restore(); }
});
