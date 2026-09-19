import type { RobotSpecification } from "@ttr/robot-schema";
import type { LlmProvider } from "./types.ts";
import { SYSTEM_PROMPT } from "./types.ts";
import { extractJson, coerceSpec } from "./json.ts";

export class HuggingFaceProvider implements LlmProvider {
  readonly name = "huggingface";
  private key = process.env.HF_TOKEN?.trim() ?? "";
  private model = process.env.HF_MODEL?.trim() ?? "";
  available(): boolean { return this.key.length > 0 && this.model.length > 0; }

  private async chat(messages: { role: string; content: string }[]): Promise<string> {
    if (!this.available()) throw new Error("Hugging Face requires HF_TOKEN and HF_MODEL");
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.2, response_format: { type: "json_object" } }),
    });
    if (!res.ok) throw new Error(`Hugging Face HTTP ${res.status}`);
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("Hugging Face returned no text");
    return content;
  }

  async generateSpec(prompt: string): Promise<RobotSpecification> {
    const out = await this.chat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }]);
    return coerceSpec(extractJson(out), prompt);
  }
  async modifySpec(spec: RobotSpecification, instruction: string): Promise<RobotSpecification> {
    const out = await this.chat([
      { role: "system", content: SYSTEM_PROMPT + " Modify the given spec minimally to satisfy the instruction; keep unrelated parts identical." },
      { role: "user", content: `Current spec:\n${JSON.stringify(spec)}\n\nInstruction: ${instruction}` },
    ]);
    return coerceSpec(extractJson(out), instruction);
  }
}
