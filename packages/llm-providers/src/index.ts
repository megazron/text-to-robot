import { HuggingFaceProvider } from "./huggingface.ts";
import type { LlmProvider } from "./types.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicProvider } from "./anthropic.ts";

export { HuggingFaceProvider } from "./huggingface.ts";
export * from "./types.ts";
export * from "./json.ts";
export { OpenAIProvider } from "./openai.ts";
export { AnthropicProvider } from "./anthropic.ts";

/** Return the first configured cloud provider, or null (caller uses demo mode). */
export function selectCloudProvider(): LlmProvider | null {
  const hf = new HuggingFaceProvider();
  if (hf.available()) return hf;
  const anthropic = new AnthropicProvider();
  if (anthropic.available()) return anthropic;
  const openai = new OpenAIProvider();
  if (openai.available()) return openai;
  return null;
}

export function providerStatus(): { anthropic: boolean; openai: boolean; huggingface: boolean; mode: "cloud" | "demo" } {
  const a = new AnthropicProvider().available();
  const o = new OpenAIProvider().available();
  const h = new HuggingFaceProvider().available();
  return { anthropic: a, openai: o, huggingface: h, mode: a || o || h ? "cloud" : "demo" };
}
