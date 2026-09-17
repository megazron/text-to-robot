import type { LlmProvider } from "./types.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicProvider } from "./anthropic.ts";

export * from "./types.ts";
export * from "./json.ts";
export { OpenAIProvider } from "./openai.ts";
export { AnthropicProvider } from "./anthropic.ts";

/** Return the first configured cloud provider, or null (caller uses demo mode). */
export function selectCloudProvider(): LlmProvider | null {
  const anthropic = new AnthropicProvider();
  if (anthropic.available()) return anthropic;
  const openai = new OpenAIProvider();
  if (openai.available()) return openai;
  return null;
}

export function providerStatus(): { anthropic: boolean; openai: boolean; mode: "cloud" | "demo" } {
  const a = new AnthropicProvider().available();
  const o = new OpenAIProvider().available();
  return { anthropic: a, openai: o, mode: a || o ? "cloud" : "demo" };
}
