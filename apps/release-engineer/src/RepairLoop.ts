import { AgentRunner, ToolRegistry } from "@laboratory/agent-runtime";
import { FilesystemToolFactory } from "@laboratory/filesystem-tools";
import type { LocalModelClient } from "@laboratory/local-model-client";
import type { ToolName } from "@laboratory/shared-types";
import type { TraceRecorder } from "@laboratory/tracing";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { createReleaseRepairAgent } from "./agents/ReleaseRepairAgent.js";
import {
  createReleaseReviewerAgent,
  type ReleaseReview,
} from "./agents/ReleaseReviewerAgent.js";
import type { ReleaseConfiguration } from "./config.js";
import type {
  ValidationReport,
  ValidationWorkflow,
} from "./ValidationWorkflow.js";
export interface ReleaseRepairAttempt {
  readonly pass: number;
  readonly review: ReleaseReview;
  readonly repair: unknown;
  readonly validation: ValidationReport;
}
export class ReleaseRepairLoop {
  readonly attempts: ReleaseRepairAttempt[] = [];
  constructor(
    private readonly model: LocalModelClient,
    private readonly trace: TraceRecorder,
    private readonly guard: WorkspaceGuard,
    private readonly prompts: { reviewer: string; repair: string },
  ) {}
  async run(
    configuration: ReleaseConfiguration,
    validationWorkflow: ValidationWorkflow,
    initial: ValidationReport,
  ): Promise<ValidationReport> {
    let current = initial;
    for (
      let pass = 1;
      !current.success && pass <= configuration.options.maxRepairPasses;
      pass += 1
    ) {
      await this.trace.record("repair_pass_started", {
        pass,
        failedChecks: current.failedMandatoryChecks,
      });
      const review = (await new AgentRunner(
        this.model,
        this.registry([
          "list_files",
          "read_file",
          "read_file_metadata",
          "search_text",
        ]),
        this.trace,
      ).run(
        createReleaseReviewerAgent(
          this.prompts.reviewer,
          configuration.options.maxSteps,
        ),
        `Task: ${configuration.options.task}\nFailed checks: ${JSON.stringify(current)}`,
        configuration.model,
      )) as ReleaseReview;
      if (!review.repairable) {
        this.attempts.push({
          pass,
          review,
          repair: null,
          validation: current,
        });
        await this.trace.record("repair_pass_completed", {
          pass,
          success: false,
          repairSkipped: true,
        });
        break;
      }
      const repair = await new AgentRunner(
        this.model,
        this.registry(
          [
            "list_files",
            "read_file",
            "read_file_metadata",
            "search_text",
            "create_file",
            "write_file",
            "apply_patch",
          ],
          configuration.options.dryRun,
        ),
        this.trace,
      ).run(
        createReleaseRepairAgent(
          this.prompts.repair,
          configuration.options.maxSteps,
        ),
        `Task: ${configuration.options.task}\nReview: ${JSON.stringify(review)}\nFailed checks: ${JSON.stringify(current.failedMandatoryChecks)}\nMandatory policy files are forbidden and must not be changed.`,
        configuration.model,
      );
      if (!configuration.options.dryRun)
        current = await validationWorkflow.run();
      this.attempts.push({ pass, review, repair, validation: current });
      await this.trace.record("repair_pass_completed", {
        pass,
        success: current.success,
        dryRun: configuration.options.dryRun,
      });
      if (configuration.options.dryRun) break;
    }
    return current;
  }
  private registry(names: readonly ToolName[], dryRun = false): ToolRegistry {
    const registry = new ToolRegistry();
    const filesystem = new FilesystemToolFactory(this.guard);
    for (const name of names)
      registry.register(name, {
        execute: async (action) => {
          const effective =
            dryRun &&
            (action.type === "create_file" ||
              action.type === "write_file" ||
              action.type === "apply_patch")
              ? { ...action, dryRun: true }
              : action;
          return filesystem.create(name).execute(effective);
        },
      });
    return registry;
  }
}
