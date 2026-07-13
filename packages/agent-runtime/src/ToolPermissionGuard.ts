import type { AgentAction, AgentDefinition } from "@laboratory/shared-types";
import { AgentRuntimeError } from "./errors.js";
export class ToolPermissionGuard {
  assertAllowed(agent: AgentDefinition, action: AgentAction): void {
    if (action.type === "finish") return;
    if (!agent.permittedTools.includes(action.type))
      throw new AgentRuntimeError(
        "DISALLOWED_TOOL",
        `Agent ${agent.id} cannot use ${action.type}`,
      );
  }
}
