import type { RobotSpecification } from "@ttr/robot-schema";
import type { LlmProvider } from "./types.ts";
import { SYSTEM_PROMPT } from "./types.ts";
import { extractJson, coerceSpec } from "./json.ts";

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai";
  private key = process.env.OPENAI_API_KEY ?? "";
  private model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  available(): boolean { return this.key.length > 0; }

  private async chat(messages: { role: string; content: string }[]): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.2, response_format: { type: "json_object" } }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? "";
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
