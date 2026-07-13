import type { LocalModelClient } from "@laboratory/local-model-client";
import type { AgentDefinition, ModelConfig } from "@laboratory/shared-types";
import type { TraceRecorder } from "@laboratory/tracing";
import { AgentLoop } from "./AgentLoop.js";
import type { ToolRegistry } from "./ToolRegistry.js";
export class AgentRunner {
  constructor(
    private readonly model: LocalModelClient,
    private readonly tools: ToolRegistry,
    private readonly trace: TraceRecorder,
  ) {}
  run(
    agent: AgentDefinition,
    task: string,
    config: ModelConfig,
  ): Promise<unknown> {
    return new AgentLoop(this.model, this.tools, this.trace).run(
      agent,
      task,
      config,
    );
  }
}
