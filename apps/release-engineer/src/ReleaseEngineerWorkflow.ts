import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LocalModelClient } from "@laboratory/local-model-client";
import { RunDirectoryManager, TraceRecorder } from "@laboratory/tracing";
import { WorkspaceGuard, WorkspaceLock } from "@laboratory/workspace-security";
import type { ReleaseConfiguration } from "./config.js";
import { ChecksumGenerator } from "./packaging/ChecksumGenerator.js";
import { PackageBuilder } from "./packaging/PackageBuilder.js";
import { PackageValidator } from "./packaging/PackageValidator.js";
import { ReleaseRepairLoop } from "./RepairLoop.js";
import { ReleaseReportWriter } from "./reports/ReleaseReportWriter.js";
import { ValidationWorkflow } from "./ValidationWorkflow.js";
export interface ReleaseWorkflowResult {
  readonly success: boolean;
  readonly runId: string;
  readonly reportDirectory: string;
  readonly archivePath?: string;
}
export class ReleaseEngineerWorkflow {
  constructor(
    private readonly model: LocalModelClient,
    private readonly promptsDirectory: string,
    private readonly onRunCreated?: (directory: string) => void,
  ) {}
  async run(
    configuration: ReleaseConfiguration,
  ): Promise<ReleaseWorkflowResult> {
    const guard = await WorkspaceGuard.create(
      configuration.options.workspace,
      configuration.policy,
    );
    const lock = new WorkspaceLock(guard.root);
    await lock.acquire();
    const run = await RunDirectoryManager.create(
      configuration.options.reportDirectory,
      "release-engineer",
      { workspace: guard.root, operation: configuration.options.operation },
    ).catch(async (error: unknown) => {
      await lock.release();
      throw error;
    });
    const trace = new TraceRecorder(run.runId, run.tracePath);
    this.onRunCreated?.(run.directory);
    const reports = new ReleaseReportWriter(run.directory);
    try {
      await trace.record("workflow_started", {
        operation: configuration.options.operation,
        workspace: guard.root,
      });
      const validationWorkflow = new ValidationWorkflow(configuration, trace);
      let validation = await validationWorkflow.run();
      const prompts = await this.prompts();
      const repairLoop = new ReleaseRepairLoop(
        this.model,
        trace,
        guard,
        prompts,
      );
      if (!validation.success && configuration.options.repair)
        validation = await repairLoop.run(
          configuration,
          validationWorkflow,
          validation,
        );
      await reports.writeValidation(validation);
      await reports.writeRepairs(repairLoop.attempts);
      const packageJson = JSON.parse(
        await readFile(path.join(guard.root, "package.json"), "utf8"),
      ) as { name?: unknown; version?: unknown };
      const project =
        typeof packageJson.name === "string" ? packageJson.name : "release";
      const version =
        typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
      if (!validation.success) {
        const summary = `Mandatory release checks remain unsuccessful: ${validation.failedMandatoryChecks.join(", ")}`;
        await reports.writeNotes(project, version, validation);
        await reports.writeFinal(false, run.runId, summary);
        await trace.record("workflow_failed", {
          failedChecks: validation.failedMandatoryChecks,
        });
        return {
          success: false,
          runId: run.runId,
          reportDirectory: run.directory,
        };
      }
      if (configuration.options.operation === "check") {
        await reports.writeNotes(project, version, validation);
        await reports.writeFinal(
          true,
          run.runId,
          "All mandatory deterministic release checks passed.",
        );
        await trace.record("workflow_completed", { packaged: false });
        return {
          success: true,
          runId: run.runId,
          reportDirectory: run.directory,
        };
      }
      const manifest = await new PackageBuilder(
        guard.root,
        configuration.packageRules,
      ).build(path.join(run.directory, "artifacts"), project, version);
      const packageValidation = await new PackageValidator(
        configuration.packageRules,
      ).validate(manifest.archivePath);
      await reports.writePackageValidation(packageValidation);
      if (!packageValidation.success) {
        await reports.writeNotes(project, version, validation);
        await reports.writeFinal(
          false,
          run.runId,
          `Package validation failed: ${packageValidation.findings.join("; ")}`,
        );
        await trace.record("workflow_failed", {
          packageFindings: packageValidation.findings,
        });
        return {
          success: false,
          runId: run.runId,
          reportDirectory: run.directory,
          archivePath: manifest.archivePath,
        };
      }
      const checksum = await new ChecksumGenerator().generate(
        manifest.archivePath,
      );
      await reports.writeManifest({ ...manifest, sha256: checksum.sha256 });
      await reports.writeNotes(project, version, validation);
      await reports.writeFinal(
        true,
        run.runId,
        "Validation, archive inspection, extraction verification, and checksum generation passed.",
      );
      await trace.record("workflow_completed", {
        archivePath: manifest.archivePath,
        sha256: checksum.sha256,
      });
      return {
        success: true,
        runId: run.runId,
        reportDirectory: run.directory,
        archivePath: manifest.archivePath,
      };
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
      await lock.release();
    }
  }
  private async prompts(): Promise<{ reviewer: string; repair: string }> {
    const [reviewer, repair] = await Promise.all(
      ["reviewer", "repair"].map((name) =>
        readFile(path.join(this.promptsDirectory, `${name}.system.md`), "utf8"),
      ),
    );
    return { reviewer: reviewer ?? "", repair: repair ?? "" };
  }
}
