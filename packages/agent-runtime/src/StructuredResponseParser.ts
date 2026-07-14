import { agentActionSchema, type AgentAction } from "@laboratory/shared-types";
import { AgentRuntimeError } from "./errors.js";
export class StructuredResponseParser {
  parse(content: string): AgentAction {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
    const candidate = fenced?.[1]?.trim() ?? trimmed;
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch (error) {
      throw new AgentRuntimeError(
        "MALFORMED_MODEL_OUTPUT",
        "Model response is not valid JSON",
        error,
      );
    }
    const parsed = agentActionSchema.safeParse(json);
    if (!parsed.success)
      throw new AgentRuntimeError(
        "MALFORMED_MODEL_OUTPUT",
        `Model response does not match the action schema: ${parsed.error.message}`,
        parsed.error,
      );
    return parsed.data;
  }
}
