// Bring your own key: a model writes the robot's body plan, the local design engine builds it from real parts.
// Built as its own file (byok.js) and loaded by the engine worker only when a key is set, so the site never downloads
// the SDK otherwise. The key lives in this browser: the page hands it to the worker, the worker sends it only to the
// provider chosen. What the model returns is untrusted: plan.ts reads it against closed lists and clamps it, and any
// failure (network, refusal, bad JSON) falls back to the local parser with a warning (robot-generator/generate.ts).
import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "@ttr/llm-providers";
import type { RobotSpecification } from "@ttr/robot-schema";

export interface ModelSettings {
  kind: "anthropic" | "openai";
  key: string;
  /** OpenAI-compatible only: the API base, e.g. https://api.openai.com/v1 or a local server */
  baseUrl?: string;
  /** model id; Anthropic defaults to claude-opus-5-5 */
  model?: string;
}

const noSpec = (name: string) => () => Promise.reject(new Error(`${name} writes body plans only; the robot file is built by the local engine`));

function anthropicProvider(s: ModelSettings, PLAN_SCHEMA: object): LlmProvider {
  const model = s.model?.trim() || "claude-opus-5-5";
  // the visitor's own key, in their own browser, sent to Anthropic only: the case this flag exists for
  const client = new Anthropic({ apiKey: s.key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  return {
    name: `Anthropic ${model}`,
    available: () => !!s.key,
    generateSpec: noSpec("Anthropic"), modifySpec: noSpec("Anthropic") as never,
    async generatePlan(prompt: string, system: string) {
      const res = await client.beta.messages.create({
        model, max_tokens: 4000, system,
        messages: [{ role: "user", content: prompt }],
        // a small JSON plan: low effort is enough, and the schema constrains the answer
        output_config: { effort: "low", format: { type: "json_schema", schema: PLAN_SCHEMA as Record<string, unknown> } },
        // a declined request is re-run on a fallback model chosen by the API, inside the same call
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      } as never) as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
      if (res.stop_reason === "refusal") throw new Error("the model declined this request");
      if (res.stop_reason === "max_tokens") throw new Error("the model's answer was cut off");
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      return JSON.parse(text);
    },
  };
}

function openaiProvider(s: ModelSettings, PLAN_SCHEMA: object): LlmProvider {
  const base = (s.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""), model = s.model?.trim() || "gpt-4o-mini";
  return {
    name: `${new URL(base).host} ${model}`,
    available: () => !!s.key || !/api\.openai\.com/.test(base),
    generateSpec: noSpec("This model"), modifySpec: noSpec("This model") as never,
    async generatePlan(prompt: string, system: string) {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(s.key ? { Authorization: `Bearer ${s.key}` } : {}) },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          response_format: { type: "json_schema", json_schema: { name: "body_plan", strict: true, schema: PLAN_SCHEMA } } }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(base).host}`);
      const j = await r.json() as { choices?: { message?: { content?: string; refusal?: string } }[] };
      const m = j.choices?.[0]?.message;
      if (m?.refusal) throw new Error("the model declined this request");
      return JSON.parse(m?.content ?? "");
    },
  };
}

/** The plan schema comes from the engine (robot-generator/plan.ts), so this file carries none of the generator. */
export function makeProvider(s: ModelSettings, planSchema: object): LlmProvider {
  return s.kind === "anthropic" ? anthropicProvider(s, planSchema) : openaiProvider(s, planSchema);
}
export type { RobotSpecification };
