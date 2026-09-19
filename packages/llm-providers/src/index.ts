// Legacy extension contract. The shipped service only uses local generation.
export * from "./types.ts";
export * from "./json.ts";
export function providerStatus() {
  return { mode: "local" as const, requires_account: false, requires_token: false, external_inference: false };
}
