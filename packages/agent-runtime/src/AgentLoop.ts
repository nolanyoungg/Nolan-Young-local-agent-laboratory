import { createHash } from "node:crypto";
import type { LocalModelClient } from "@laboratory/local-model-client";
import type {
  AgentAction,
  AgentDefinition,
  ModelConfig,
  ToolResult,
} from "@laboratory/shared-types";
import type { TraceRecorder } from "@laboratory/tracing";
import { ContextBudget } from "./ContextBudget.js";
import { ConversationState } from "./ConversationState.js";
import { RetryPolicy } from "./RetryPolicy.js";
import { StepLimiter } from "./StepLimiter.js";
import { buildStructuredActionProtocol } from "./StructuredActionProtocol.js";
import { StructuredResponseParser } from "./StructuredResponseParser.js";
import { ToolPermissionGuard } from "./ToolPermissionGuard.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { AgentRuntimeError } from "./errors.js";

const contentDigest = (value: string): { bytes: number; sha256: string } => ({
  bytes: Buffer.byteLength(value),
  sha256: createHash("sha256").update(value).digest("hex"),
});

const summarizeAction = (action: AgentAction): Record<string, unknown> => {
  switch (action.type) {
    case "list_files":
      return {
        path: action.path,
        ...(action.pattern ? { pattern: action.pattern } : {}),
      };
    case "read_file":
    case "read_file_metadata":
      return { path: action.path };
    case "search_text":
      return {
        path: action.path,
        query: contentDigest(action.query),
        caseSensitive: action.caseSensitive,
      };
    case "create_file":
    case "write_file":
      return {
        path: action.path,
        content: contentDigest(action.content),
        dryRun: action.dryRun,
      };
    case "apply_patch":
      return {
        path: action.path,
        patch: contentDigest(action.patch),
        dryRun: action.dryRun,
      };
    case "read_process_log":
      return { processId: action.processId, stream: action.stream };
    case "get_process_status":
      return { processId: action.processId };
    case "finish":
      return { final: true };
  }
};

const summarizeResult = (result: ToolResult): Record<string, unknown> => {
  const summary: Record<string, unknown> = {
    ok: result.ok,
    truncated: result.truncated ?? false,
    ...(result.originalBytes === undefined
      ? {}
      : { originalBytes: result.originalBytes }),
    ...(result.returnedBytes === undefined
      ? {}
      : { returnedBytes: result.returnedBytes }),
    ...(result.error
      ? { error: { code: result.error.code, message: result.error.message } }
      : {}),
  };
  if (
    result.output &&
    typeof result.output === "object" &&
    !Array.isArray(result.output)
  ) {
    const output = result.output as Record<string, unknown>;
    for (const key of [
      "path",
      "beforeHash",
      "afterHash",
      "changed",
      "dryRun",
      "size",
      "sha256",
      "type",
    ])
      if (output[key] !== undefined) summary[key] = output[key];
  } else if (typeof result.output === "string") {
    summary.output = contentDigest(result.output);
  } else if (Array.isArray(result.output)) {
    summary.outputItems = result.output.length;
  }
  return summary;
};
export class AgentLoop {
  private readonly parser = new StructuredResponseParser();
  private readonly permissions = new ToolPermissionGuard();
  constructor(
    private readonly model: LocalModelClient,
    private readonly tools: ToolRegistry,
    private readonly trace: TraceRecorder,
  ) {}
  async run(
    agent: AgentDefinition,
    task: string,
    config: ModelConfig,
  ): Promise<unknown> {
    for (const tool of agent.permittedTools)
      if (tool !== "finish" && !this.tools.has(tool))
        throw new AgentRuntimeError(
          "UNKNOWN_TOOL",
          `Agent ${agent.id} permits unregistered tool: ${tool}`,
        );
    const protocol = buildStructuredActionProtocol(agent);
    const state = new ConversationState([
      {
        role: "system",
        content: `${agent.systemInstructions}\n\n${protocol.instructions}`,
      },
      { role: "user", content: task },
    ]);
    const steps = new StepLimiter(agent.maximumSteps);
    const context = new ContextBudget(config.contextTokens);
    const malformedRetries = new RetryPolicy(
      config.retryCount,
      config.retryDelayMilliseconds,
    );
    const repeated = new Map<string, number>();
    await this.trace.record("agent_started", {
      agentId: agent.id,
      permittedTools: agent.permittedTools,
    });
    try {
      for (;;) {
        const step = steps.next();
        context.assertWithin(state.estimatedTokens());
        let responseContent: string | undefined;
        let action: AgentAction | undefined;
        for (
          let attempt = 0;
          attempt <= malformedRetries.maximumRetries;
          attempt += 1
        ) {
          await this.trace.record("model_request_started", {
            agentId: agent.id,
            step,
            attempt,
          });
          const response = await this.model.complete({
            messages: state.messages(),
            config: { ...config, ...(agent.modelConfig ?? {}) },
            // Ollama JSON mode prevents prose/fences. The stricter discriminated
            // union remains in the system contract and is enforced by Zod here;
            // some Ollama grammar backends reject complex oneOf schemas.
            responseFormat: "json",
          });
          responseContent = response.content;
          await this.trace.record("model_response_received", {
            agentId: agent.id,
            step,
            attempt,
            responseBytes: Buffer.byteLength(response.content),
            responseSha256: contentDigest(response.content).sha256,
            responseEnvelope: /^```/u.test(response.content.trim())
              ? "markdown_fence"
              : response.content.trim().startsWith("{")
                ? "json_object"
                : "other",
            model: response.model,
          });
          try {
            action = this.parser.parse(response.content);
            break;
          } catch (error) {
            if (
              !(error instanceof AgentRuntimeError) ||
              error.code !== "MALFORMED_MODEL_OUTPUT" ||
              attempt === malformedRetries.maximumRetries
            )
              throw error;
            state.append(
              { role: "assistant", content: response.content },
              {
                role: "tool",
                name: "validation_error",
                content: JSON.stringify({
                  ok: false,
                  error: { code: error.code, message: error.message },
                  instruction:
                    "Correct the response using the exact JSON Schema in the system message. Return one raw JSON object only, with exact property names and no Markdown fence or commentary.",
                  allowedActionTypes: protocol.actionTypes,
                }),
              },
            );
            await malformedRetries.wait(attempt);
          }
        }
        if (!action || responseContent === undefined)
          throw new AgentRuntimeError(
            "MALFORMED_MODEL_OUTPUT",
            "No validated action was produced",
          );
        if (action.type === "finish") {
          const result = agent.outputSchema
            ? agent.outputSchema.parse(action.result)
            : action.result;
          await this.trace.record("agent_completed", {
            agentId: agent.id,
            step,
          });
          return result;
        }
        try {
          this.permissions.assertAllowed(agent, action);
        } catch (error) {
          await this.trace.record("tool_rejected", {
            agentId: agent.id,
            tool: action.type,
            reason: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        const signature = JSON.stringify(action);
        const count = (repeated.get(signature) ?? 0) + 1;
        repeated.set(signature, count);
        if (count > 2)
          throw new AgentRuntimeError(
            "REPEATED_TOOL_CALL",
            `Repeated identical tool call detected: ${action.type}`,
          );
        await this.trace.record("tool_requested", {
          agentId: agent.id,
          tool: action.type,
          action: summarizeAction(action),
        });
        await this.trace.record("tool_started", {
          agentId: agent.id,
          tool: action.type,
        });
        let result;
        try {
          result = await this.tools.execute(action);
          await this.trace.record(
            result.ok ? "tool_completed" : "tool_failed",
            {
              agentId: agent.id,
              tool: action.type,
              result: summarizeResult(result),
            },
          );
        } catch (error) {
          await this.trace.record("tool_failed", {
            agentId: agent.id,
            tool: action.type,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        state.append(
          { role: "assistant", content: responseContent },
          {
            role: "tool",
            name: action.type,
            content: JSON.stringify({
              ...context.truncateToolResult(result),
              ...(result.ok
                ? {}
                : {
                    runtimeInstruction:
                      "This tool action did not take effect. Correct the next action using the error details, or finish honestly without claiming it succeeded.",
                  }),
            }),
          },
        );
      }
    } catch (error) {
      await this.trace.record("agent_completed", {
        agentId: agent.id,
        failed: true,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
