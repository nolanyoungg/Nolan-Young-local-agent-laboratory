import type {
  AgentAction,
  ToolName,
  ToolResult,
} from "@laboratory/shared-types";
import { AgentRuntimeError } from "./errors.js";
export interface ToolExecutor {
  execute(action: AgentAction): Promise<ToolResult>;
}
export class ToolRegistry {
  private readonly tools = new Map<ToolName, ToolExecutor>();
  register(name: ToolName, executor: ToolExecutor): void {
    if (name === "finish")
      throw new AgentRuntimeError(
        "UNKNOWN_TOOL",
        "finish is handled by the runtime and cannot be registered",
      );
    this.tools.set(name, executor);
  }
  has(name: ToolName): boolean {
    return this.tools.has(name);
  }
  async execute(action: AgentAction): Promise<ToolResult> {
    const tool = this.tools.get(action.type);
    if (!tool)
      throw new AgentRuntimeError(
        "UNKNOWN_TOOL",
        `Unknown or unregistered tool: ${action.type}`,
      );
    return tool.execute(action);
  }
}
