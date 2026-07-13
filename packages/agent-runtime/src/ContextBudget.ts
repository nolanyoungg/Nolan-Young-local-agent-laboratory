import type { ToolResult } from "@laboratory/shared-types";
import { AgentRuntimeError } from "./errors.js";
export class ContextBudget {
  constructor(
    readonly maximumTokens: number,
    readonly reservedResponseTokens = 2_048,
  ) {}
  assertWithin(estimatedTokens: number): void {
    if (estimatedTokens > this.maximumTokens - this.reservedResponseTokens)
      throw new AgentRuntimeError(
        "CONTEXT_BUDGET",
        `Conversation requires approximately ${estimatedTokens} tokens, exceeding the available context budget`,
      );
  }
  truncateToolResult(
    result: ToolResult,
    maximumCharacters = 40_000,
  ): ToolResult {
    const serialized = JSON.stringify(result);
    if (serialized.length <= maximumCharacters) return result;
    return {
      ok: result.ok,
      output: `${serialized.slice(0, maximumCharacters)}\n[tool result truncated by context budget]`,
      truncated: true,
      originalBytes: Buffer.byteLength(serialized),
      returnedBytes: Buffer.byteLength(serialized.slice(0, maximumCharacters)),
      ...(result.error ? { error: result.error } : {}),
    };
  }
}
