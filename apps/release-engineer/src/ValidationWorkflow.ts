import { CommandAllowlist, ProcessManager } from "@laboratory/process-tools";
import type { TraceRecorder } from "@laboratory/tracing";
import { CommandCheck } from "./checks/CommandCheck.js";
import type { CheckResult } from "./checks/CheckDefinition.js";
import { FilePresenceCheck } from "./checks/FilePresenceCheck.js";
import { ForbiddenFileCheck } from "./checks/ForbiddenFileCheck.js";
import type { ReleaseConfiguration } from "./config.js";
export interface ValidationReport {
  readonly success: boolean;
  readonly checks: readonly CheckResult[];
  readonly failedMandatoryChecks: readonly string[];
}
export class ValidationWorkflow {
  readonly processes: ProcessManager;
  constructor(
    private readonly configuration: ReleaseConfiguration,
    private readonly trace: TraceRecorder,
  ) {
    this.processes = new ProcessManager(
      new CommandAllowlist(configuration.commands),
    );
  }
  async run(): Promise<ValidationReport> {
    await this.trace.record("validation_started", {
      commandChecks: Object.keys(this.configuration.commands).length,
    });
    const checks: CheckResult[] = [];
    for (const id of Object.keys(this.configuration.commands).sort()) {
      await this.trace.record("process_started", { commandIdentifier: id });
      const result = await new CommandCheck(
        id,
        this.configuration.mandatoryCommands.has(id),
        this.processes,
      ).run();
      checks.push(result);
      await this.trace.record("process_completed", {
        commandIdentifier: id,
        success: result.success,
      });
    }
    for (const file of this.configuration.requiredFiles)
      checks.push(
        await new FilePresenceCheck(
          this.configuration.options.workspace,
          file,
        ).run(),
      );
    if (this.configuration.forbiddenFiles.length > 0)
      checks.push(
        await new ForbiddenFileCheck(
          this.configuration.options.workspace,
          this.configuration.forbiddenFiles,
        ).run(),
      );
    const failedMandatoryChecks = checks
      .filter((check) => check.mandatory && !check.success)
      .map((check) => check.id);
    const report = {
      success: failedMandatoryChecks.length === 0,
      checks,
      failedMandatoryChecks,
    };
    await this.trace.record("validation_completed", {
      success: report.success,
      failedMandatoryChecks,
    });
    return report;
  }
}
