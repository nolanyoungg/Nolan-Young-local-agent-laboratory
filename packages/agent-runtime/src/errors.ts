export class AgentRuntimeError extends Error {
  constructor(
    readonly code:
      | "MALFORMED_MODEL_OUTPUT"
      | "UNKNOWN_TOOL"
      | "DISALLOWED_TOOL"
      | "MAXIMUM_STEPS"
      | "REPEATED_TOOL_CALL"
      | "CONTEXT_BUDGET"
      | "INVALID_FINAL_RESULT",
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}
