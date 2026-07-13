import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AgentRunner,
  ToolRegistry,
  type ToolExecutor,
} from "@laboratory/agent-runtime";
import { FilesystemToolFactory } from "@laboratory/filesystem-tools";
import type { LocalModelClient } from "@laboratory/local-model-client";
import type {
  AgentAction,
  ToolName,
  ToolResult,
} from "@laboratory/shared-types";
import { RunDirectoryManager, TraceRecorder } from "@laboratory/tracing";
import { WorkspaceGuard, WorkspaceLock } from "@laboratory/workspace-security";
import { createEditorAgent, type EditSummary } from "./agents/EditorAgent.js";
import { createPlannerAgent, type ChangePlan } from "./agents/PlannerAgent.js";
import {
  createReviewerAgent,
  type CodeReview,
} from "./agents/ReviewerAgent.js";
import type { CodeEditorConfiguration } from "./config.js";
import {
  CodeEditReportWriter,
  type ChangedFileRecord,
} from "./reports/CodeEditReportWriter.js";
interface RecordedMutation {
  readonly action: Extract<
    AgentAction,
    { type: "create_file" | "write_file" | "apply_patch" }
  >;
  readonly result: ToolResult;
}
class RecordingExecutor implements ToolExecutor {
  readonly mutations: RecordedMutation[] = [];
  constructor(
    private readonly delegate: ToolExecutor,
    private readonly forceDryRun: boolean,
  ) {}
  async execute(action: AgentAction): Promise<ToolResult> {
    const effective =
      this.forceDryRun &&
      (action.type === "create_file" ||
        action.type === "write_file" ||
        action.type === "apply_patch")
        ? { ...action, dryRun: true }
        : action;
    const result = await this.delegate.execute(effective);
    if (
      effective.type === "create_file" ||
      effective.type === "write_file" ||
      effective.type === "apply_patch"
    )
      this.mutations.push({ action: effective, result });
    return result;
  }
}
const filesystemNames: readonly ToolName[] = [
  "list_files",
  "read_file",
  "read_file_metadata",
  "search_text",
  "create_file",
  "write_file",
  "apply_patch",
];
export interface CodeEditorWorkflowResult {
  readonly success: boolean;
  readonly runId: string;
  readonly reportDirectory: string;
  readonly plan: ChangePlan;
  readonly review: CodeReview;
  readonly changedFiles: readonly ChangedFileRecord[];
}
export class CodeEditorWorkflow {
  constructor(
    private readonly model: LocalModelClient,
    private readonly promptsDirectory: string,
    private readonly onRunCreated?: (directory: string) => void,
  ) {}
  async run(
    configuration: CodeEditorConfiguration,
  ): Promise<CodeEditorWorkflowResult> {
    const { options } = configuration;
    const guard = await WorkspaceGuard.create(
      options.workspace,
      configuration.policy,
    );
    const lock = new WorkspaceLock(guard.root);
    await lock.acquire();
    const run = await RunDirectoryManager.create(
      options.reportDirectory,
      "code-editor",
      {
        workspace: guard.root,
        mode: options.mode,
        model: configuration.model.model,
      },
    ).catch(async (error: unknown) => {
      await lock.release();
      throw error;
    });
    const trace = new TraceRecorder(run.runId, run.tracePath);
    this.onRunCreated?.(run.directory);
    const reports = new CodeEditReportWriter(run.directory);
    await trace.initialize();
    try {
      await trace.record("workflow_started", {
        workspace: guard.root,
        mode: options.mode,
      });
      const prompts = await this.loadPrompts();
      const readRegistry = this.createRegistry(guard, [
        "list_files",
        "read_file",
        "read_file_metadata",
        "search_text",
      ]);
      const planner = new AgentRunner(this.model, readRegistry, trace);
      const plan = (await planner.run(
        createPlannerAgent(prompts.planner, options.maxSteps),
        options.task,
        configuration.model,
      )) as ChangePlan;
      await reports.writePlan(plan);
      if (options.mode === "plan-only") {
        const review: CodeReview = {
          approved: true,
          summary: "Plan-only mode completed without modifying the workspace.",
          findings: [],
          omissions: [],
          unrelatedChanges: [],
        };
        await reports.writeProposedDiff("");
        await reports.writeChangedFiles([]);
        await reports.writeReview(review);
        await reports.writeFinal(true, options.mode, run.runId, review.summary);
        await trace.record("workflow_completed", {
          mode: options.mode,
          changedFiles: 0,
        });
        return {
          success: true,
          runId: run.runId,
          reportDirectory: run.directory,
          plan,
          review,
          changedFiles: [],
        };
      }
      const factory = new FilesystemToolFactory(guard);
      const recorder = new RecordingExecutor(
        {
          execute: async (action) =>
            factory.create(action.type).execute(action),
        },
        options.mode === "dry-run",
      );
      const editRegistry = new ToolRegistry();
      for (const name of filesystemNames) editRegistry.register(name, recorder);
      const editor = new AgentRunner(this.model, editRegistry, trace);
      const editTask = `${options.task}\n\nApproved plan:\n${JSON.stringify(plan, null, 2)}\n\nMode: ${options.mode}.`;
      const editSummary = (await editor.run(
        createEditorAgent(prompts.editor, options.maxSteps),
        editTask,
        configuration.model,
      )) as EditSummary;
      const changedFiles = this.changedFiles(recorder.mutations);
      const proposedDiff = this.proposedDiff(recorder.mutations);
      await reports.writeProposedDiff(proposedDiff);
      await reports.writeChangedFiles(changedFiles);
      const reviewer = new AgentRunner(this.model, readRegistry, trace);
      const review = (await reviewer.run(
        createReviewerAgent(prompts.reviewer, options.maxSteps),
        `${options.task}\n\nPlan:\n${JSON.stringify(plan)}\n\nEditor summary:\n${JSON.stringify(editSummary)}\n\nChanged files:\n${JSON.stringify(changedFiles)}`,
        configuration.model,
      )) as CodeReview;
      const success = review.findings.every(
        (finding) =>
          finding.severity !== "critical" && finding.severity !== "error",
      );
      await reports.writeReview(review);
      await reports.writeFinal(
        success,
        options.mode,
        run.runId,
        review.summary,
      );
      await trace.record(success ? "workflow_completed" : "workflow_failed", {
        changedFiles: changedFiles.length,
        approved: review.approved,
      });
      return {
        success,
        runId: run.runId,
        reportDirectory: run.directory,
        plan,
        review,
        changedFiles,
      };
    } catch (error) {
      await trace.record("workflow_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      await reports.writeFinal(
        false,
        options.mode,
        run.runId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      await lock.release();
    }
  }
  private createRegistry(
    guard: WorkspaceGuard,
    names: readonly ToolName[],
  ): ToolRegistry {
    const factory = new FilesystemToolFactory(guard);
    const registry = new ToolRegistry();
    for (const name of names)
      registry.register(name, {
        execute: async (action) => factory.create(name).execute(action),
      });
    return registry;
  }
  private async loadPrompts(): Promise<{
    planner: string;
    editor: string;
    reviewer: string;
  }> {
    const [planner, editor, reviewer] = await Promise.all(
      ["planner", "editor", "reviewer"].map((name) =>
        readFile(path.join(this.promptsDirectory, `${name}.system.md`), "utf8"),
      ),
    );
    return {
      planner: planner ?? "",
      editor: editor ?? "",
      reviewer: reviewer ?? "",
    };
  }
  private changedFiles(
    mutations: readonly RecordedMutation[],
  ): ChangedFileRecord[] {
    const records = new Map<string, ChangedFileRecord>();
    for (const mutation of mutations) {
      if (
        !mutation.result.ok ||
        typeof mutation.result.output !== "object" ||
        mutation.result.output === null
      )
        continue;
      const output = mutation.result.output as {
        path?: unknown;
        beforeHash?: unknown;
        afterHash?: unknown;
        changed?: unknown;
        dryRun?: unknown;
      };
      if (
        typeof output.path === "string" &&
        typeof output.afterHash === "string" &&
        output.changed === true
      ) {
        const existing = records.get(output.path);
        records.set(output.path, {
          path: output.path,
          originalSha256:
            existing?.originalSha256 ??
            (typeof output.beforeHash === "string" ? output.beforeHash : null),
          finalSha256: output.afterHash,
          dryRun: output.dryRun === true,
        });
      }
    }
    return [...records.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  }
  private proposedDiff(mutations: readonly RecordedMutation[]): string {
    return mutations
      .filter((mutation) => mutation.result.ok)
      .map(({ action }) => {
        if (action.type === "apply_patch")
          return `--- a/${action.path}\n+++ b/${action.path}\n${action.patch}\n`;
        return `--- a/${action.path}\n+++ b/${action.path}\n@@ proposed complete content @@\n${action.content}\n`;
      })
      .join("\n");
  }
}
