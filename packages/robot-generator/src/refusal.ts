/** Why a prompt was not built. The message is complete: it says what was asked, why not, and what to try instead. */
// Why a prompt was not built: thrown by the parser with a complete message for the visitor.
export type RefusalKind = "empty" | "harmful" | "impossible" | "not_understood" | "not_supported";
export class PromptRefusal extends Error {
  kind: RefusalKind;
  constructor(kind: RefusalKind, message: string) { super(message); this.kind = kind; this.name = "PromptRefusal"; }
}

