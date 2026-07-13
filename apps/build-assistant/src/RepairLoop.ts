import { AgentRunner, ToolRegistry } from "@laboratory/agent-runtime";
import { FilesystemToolFactory } from "@laboratory/filesystem-tools";
import type { LocalModelClient } from "@laboratory/local-model-client";
import type { ProcessManager, ProcessResult } from "@laboratory/process-tools";
import type {
  AgentAction,
  ToolName,
  ToolResult,
} from "@laboratory/shared-types";
import type { TraceRecorder } from "@laboratory/tracing";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import {
  createBuildDiagnosisAgent,
  type BuildDiagnosis,
} from "./agents/BuildDiagnosisAgent.js";
import { createBuildRepairAgent } from "./agents/BuildRepairAgent.js";
import type { BuildAssistantConfiguration } from "./config.js";
import type { RepairAttempt } from "./reports/BuildReportWriter.js";
class ProcessEvidenceExecutor {
  constructor(private readonly processes: ProcessManager) {}
  async execute(action: AgentAction): Promise<ToolResult> {
    if (action.type === "read_process_log") {
      const logs = this.processes.getLogs(action.processId);
      return {
        ok: true,
        output:
          action.stream === "stdout"
            ? logs.stdout
            : action.stream === "stderr"
              ? logs.stderr
              : logs,
      };
    }
    if (action.type === "get_process_status")
      return { ok: true, output: this.processes.getStatus(action.processId) };
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_TOOL",
        message: "Expected a process evidence action",
      },
    };
  }
}
export class RepairLoop {
  readonly attempts: RepairAttempt[] = [];
  readonly changedFiles = new Map<string, unknown>();
  constructor(
    private readonly model: LocalModelClient,
    private readonly trace: TraceRecorder,
    private readonly guard: WorkspaceGuard,
    private readonly processes: ProcessManager,
    private readonly prompts: { diagnosis: string; repair: string },
  ) {}
  async run(
    configuration: BuildAssistantConfiguration,
    initial: ProcessResult,
    rerun?: () => Promise<ProcessResult>,
  ): Promise<{ final: ProcessResult; diagnosis: BuildDiagnosis | null }> {
    let current = initial;
    let diagnosis: BuildDiagnosis | null = null;
    for (
      let pass = 1;
      current.exitCode !== 0 && pass <= configuration.options.maxRepairPasses;
      pass += 1
    ) {
      await this.trace.record("repair_pass_started", {
        pass,
        processId: current.id,
      });
      const readRegistry = this.registry([
        "list_files",
        "read_file",
        "read_file_metadata",
        "search_text",
        "read_process_log",
        "get_process_status",
      ]);
      diagnosis = (await new AgentRunner(
        this.model,
        readRegistry,
        this.trace,
      ).run(
        createBuildDiagnosisAgent(
          this.prompts.diagnosis,
          configuration.options.maxSteps,
        ),
        `Task: ${configuration.options.task}\nFailed process: ${current.id}\nExit code: ${current.exitCode}`,
        configuration.model,
      )) as BuildDiagnosis;
      if (!diagnosis.repairable) break;
      const writeRegistry = this.registry(
        [
          "list_files",
          "read_file",
          "read_file_metadata",
          "search_text",
          "create_file",
          "write_file",
          "apply_patch",
          "read_process_log",
          "get_process_status",
        ],
        configuration.options.dryRun,
      );
      const repair = await new AgentRunner(
        this.model,
        writeRegistry,
        this.trace,
      ).run(
        createBuildRepairAgent(
          this.prompts.repair,
          configuration.options.maxSteps,
        ),
        `Task: ${configuration.options.task}\nDiagnosis: ${JSON.stringify(diagnosis)}\nFailed process: ${current.id}`,
        configuration.model,
      );
      if (!configuration.options.dryRun) {
        await this.trace.record("process_started", {
          command: configuration.options.command,
          repairPass: pass,
        });
        current = rerun
          ? await rerun()
          : await this.processes.run(configuration.options.command);
        await this.trace.record("process_completed", {
          processId: current.id,
          exitCode: current.exitCode,
          repairPass: pass,
        });
      }
      this.attempts.push({ pass, diagnosis, repair, buildStatus: current });
      await this.trace.record("repair_pass_completed", {
        pass,
        exitCode: current.exitCode,
        dryRun: configuration.options.dryRun,
      });
      if (configuration.options.dryRun) break;
    }
    return { final: current, diagnosis };
  }
  private registry(names: readonly ToolName[], dryRun = false): ToolRegistry {
    const registry = new ToolRegistry();
    const filesystem = new FilesystemToolFactory(this.guard);
    const processEvidence = new ProcessEvidenceExecutor(this.processes);
    for (const name of names) {
      if (name === "read_process_log" || name === "get_process_status")
        registry.register(name, processEvidence);
      else
        registry.register(name, {
          execute: async (action) => {
            const effective =
              dryRun &&
              (action.type === "create_file" ||
                action.type === "write_file" ||
                action.type === "apply_patch")
                ? { ...action, dryRun: true }
                : action;
            const result = await filesystem.create(name).execute(effective);
            if (
              result.ok &&
              (effective.type === "create_file" ||
                effective.type === "write_file" ||
                effective.type === "apply_patch") &&
              typeof result.output === "object" &&
              result.output
            ) {
              const value = result.output as { path?: unknown };
              if (typeof value.path === "string")
                this.changedFiles.set(value.path, result.output);
            }
            return result;
          },
        });
    }
    return registry;
  }
}
