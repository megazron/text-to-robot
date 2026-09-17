import type { RobotSpecification } from "@ttr/robot-schema";
import type { LlmProvider } from "./types.ts";
import { SYSTEM_PROMPT } from "./types.ts";
import { extractJson, coerceSpec } from "./json.ts";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private key = process.env.ANTHROPIC_API_KEY ?? "";
  private model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  available(): boolean { return this.key.length > 0; }

  private async message(user: string, system: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: this.model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json() as any;
    return (data.content ?? []).map((b: any) => b.text ?? "").join("");
  }

  async generateSpec(prompt: string): Promise<RobotSpecification> {
    return coerceSpec(extractJson(await this.message(prompt, SYSTEM_PROMPT)), prompt);
  }
  async modifySpec(spec: RobotSpecification, instruction: string): Promise<RobotSpecification> {
    const out = await this.message(
      `Current spec:\n${JSON.stringify(spec)}\n\nInstruction: ${instruction}`,
      SYSTEM_PROMPT + " Modify the given spec minimally; keep unrelated parts identical.",
    );
    return coerceSpec(extractJson(out), instruction);
  }
}
