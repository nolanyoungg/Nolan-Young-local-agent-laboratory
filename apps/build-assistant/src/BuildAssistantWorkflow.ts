import { readFile } from "node:fs/promises";
import path from "node:path";
import { AgentRunner, ToolRegistry } from "@laboratory/agent-runtime";
import { FilesystemToolFactory } from "@laboratory/filesystem-tools";
import type { LocalModelClient } from "@laboratory/local-model-client";
import {
  CommandAllowlist,
  ProcessManager,
  type ProcessResult,
  type WatcherHandle,
} from "@laboratory/process-tools";
import { RunDirectoryManager, TraceRecorder } from "@laboratory/tracing";
import { WorkspaceGuard, WorkspaceLock } from "@laboratory/workspace-security";
import {
  createBuildReviewerAgent,
  type BuildReview,
} from "./agents/BuildReviewerAgent.js";
import type { BuildAssistantConfiguration } from "./config.js";
import { RepairLoop } from "./RepairLoop.js";
import { BuildReportWriter } from "./reports/BuildReportWriter.js";
export interface BuildAssistantWorkflowResult {
  readonly success: boolean;
  readonly runId: string;
  readonly reportDirectory: string;
}
export class BuildAssistantWorkflow {
  constructor(
    private readonly model: LocalModelClient,
    private readonly promptsDirectory: string,
    private readonly onRunCreated?: (directory: string) => void,
  ) {}
  async run(
    configuration: BuildAssistantConfiguration,
  ): Promise<BuildAssistantWorkflowResult> {
    const guard = await WorkspaceGuard.create(
      configuration.options.workspace,
      configuration.policy,
    );
    const lock = new WorkspaceLock(guard.root);
    await lock.acquire();
    const run = await RunDirectoryManager.create(
      configuration.options.reportDirectory,
      "build-assistant",
      {
        workspace: guard.root,
        command: configuration.options.command,
        watch: configuration.options.watch,
      },
    ).catch(async (error: unknown) => {
      await lock.release();
      throw error;
    });
    const trace = new TraceRecorder(run.runId, run.tracePath);
    this.onRunCreated?.(run.directory);
    const reports = new BuildReportWriter(run.directory);
    const processes = new ProcessManager(
      new CommandAllowlist(configuration.commands),
    );
    let watcher: WatcherHandle | undefined;
    try {
      await trace.record("workflow_started", {
        command: configuration.options.command,
        watch: configuration.options.watch,
      });
      const prompts = await this.prompts();
      let initial: ProcessResult;
      if (configuration.options.watch) {
        watcher = await processes.startWatcher(configuration.options.command);
        await trace.record("process_started", {
          processId: watcher.id,
          command: configuration.options.command,
        });
        await watcher.waitForInitialStatus();
        initial = this.watcherSnapshot(watcher, configuration);
      } else {
        await trace.record("process_started", {
          command: configuration.options.command,
        });
        initial = await processes.run(configuration.options.command);
        await trace.record("process_completed", {
          processId: initial.id,
          exitCode: initial.exitCode,
        });
      }
      await reports.writeInitial(initial);
      let final = initial;
      let diagnosis = null;
      const loop = new RepairLoop(this.model, trace, guard, processes, {
        diagnosis: prompts.diagnosis,
        repair: prompts.repair,
      });
      if (initial.exitCode !== 0)
        ({ final, diagnosis } = await loop.run(
          configuration,
          initial,
          watcher
            ? async () => {
                await new Promise<void>((resolve) => setTimeout(resolve, 500));
                return this.watcherSnapshot(watcher!, configuration);
              }
            : undefined,
        ));
      await reports.writeDiagnosis(
        diagnosis ?? {
          summary:
            final.exitCode === 0
              ? "Initial command passed; diagnosis was not required."
              : "No repairable diagnosis was produced.",
        },
      );
      await reports.writeAttempts(loop.attempts);
      await reports.writeChangedFiles([...loop.changedFiles.values()]);
      await reports.writeFinalStatus(final);
      const reviewRegistry = this.readRegistry(guard, processes);
      const review = (await new AgentRunner(
        this.model,
        reviewRegistry,
        trace,
      ).run(
        createBuildReviewerAgent(
          prompts.reviewer,
          configuration.options.maxSteps,
        ),
        `Task: ${configuration.options.task}\nInitial: ${JSON.stringify({ id: initial.id, exitCode: initial.exitCode })}\nFinal: ${JSON.stringify({ id: final.id, exitCode: final.exitCode })}\nChanges: ${JSON.stringify([...loop.changedFiles.values()])}`,
        configuration.model,
      )) as BuildReview;
      await reports.writeReview(review);
      const success =
        final.exitCode === 0 &&
        review.findings.every(
          (finding) => !["error", "critical"].includes(finding.severity),
        );
      const summary = success
        ? "Approved command completed successfully and final review found no blocking issue."
        : `Approved command remains unsuccessful (exit code ${final.exitCode}); workspace and logs were preserved.`;
      await reports.writeFinal(success, run.runId, summary);
      await trace.record(success ? "workflow_completed" : "workflow_failed", {
        exitCode: final.exitCode,
      });
      return { success, runId: run.runId, reportDirectory: run.directory };
    } catch (error) {
      await trace.record("workflow_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      await reports.writeFinal(
        false,
        run.runId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      try {
        await watcher?.stop();
        await processes.stopAll();
      } finally {
        await lock.release();
      }
    }
  }
  private async prompts(): Promise<{
    diagnosis: string;
    repair: string;
    reviewer: string;
  }> {
    const [diagnosis, repair, reviewer] = await Promise.all(
      ["diagnosis", "repair", "reviewer"].map((name) =>
        readFile(path.join(this.promptsDirectory, `${name}.system.md`), "utf8"),
      ),
    );
    return {
      diagnosis: diagnosis ?? "",
      repair: repair ?? "",
      reviewer: reviewer ?? "",
    };
  }
  private readRegistry(
    guard: WorkspaceGuard,
    processes: ProcessManager,
  ): ToolRegistry {
    const registry = new ToolRegistry();
    const filesystem = new FilesystemToolFactory(guard);
    for (const name of [
      "list_files",
      "read_file",
      "read_file_metadata",
      "search_text",
    ] as const)
      registry.register(name, {
        execute: async (action) => filesystem.create(name).execute(action),
      });
    registry.register("read_process_log", {
      execute: async (action) =>
        action.type === "read_process_log"
          ? { ok: true, output: processes.getLogs(action.processId) }
          : { ok: false },
    });
    registry.register("get_process_status", {
      execute: async (action) =>
        action.type === "get_process_status"
          ? { ok: true, output: processes.getStatus(action.processId) }
          : { ok: false },
    });
    return registry;
  }
  private watcherSnapshot(
    watcher: WatcherHandle,
    configuration: BuildAssistantConfiguration,
  ): ProcessResult {
    const status = watcher.status();
    const logs = watcher.logs();
    const combined = `${logs.stdout}\n${logs.stderr}`;
    const command = configuration.commands[configuration.options.command];
    const failureIndex = command?.failurePattern
      ? combined.lastIndexOf(command.failurePattern)
      : -1;
    const readyIndex = command?.readyPattern
      ? combined.lastIndexOf(command.readyPattern)
      : -1;
    const failed = status.state === "failed" || failureIndex > readyIndex;
    return {
      ...status,
      stoppedAt: status.stoppedAt ?? new Date().toISOString(),
      exitCode: status.exitCode ?? (failed ? 1 : 0),
      signal: status.signal ?? null,
      stdout: logs.stdout,
      stderr: logs.stderr,
      stdoutTruncated: logs.stdoutTruncated,
      stderrTruncated: logs.stderrTruncated,
    };
  }
}
