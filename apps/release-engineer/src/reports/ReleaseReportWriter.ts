import { ReportWriter } from "@laboratory/tracing";
import type { PackageManifest } from "../packaging/PackageBuilder.js";
import type { PackageValidation } from "../packaging/PackageValidator.js";
import type { ReleaseRepairAttempt } from "../RepairLoop.js";
import type { ValidationReport } from "../ValidationWorkflow.js";
export class ReleaseReportWriter {
  private readonly writer: ReportWriter;
  constructor(directory: string) {
    this.writer = new ReportWriter(directory);
  }
  writeValidation(value: ValidationReport): Promise<string> {
    return this.writer.writeJson("validation-report.json", value);
  }
  writeRepairs(value: readonly ReleaseRepairAttempt[]): Promise<string> {
    return this.writer.writeJson("repair-attempts.json", value);
  }
  writeManifest(value: PackageManifest & { sha256: string }): Promise<string> {
    return this.writer.writeJson("package-manifest.json", value);
  }
  writePackageValidation(value: PackageValidation): Promise<string> {
    return this.writer.writeJson("package-validation.json", value);
  }
  writeNotes(
    project: string,
    version: string,
    validation: ValidationReport,
  ): Promise<string> {
    return this.writer.writeMarkdown(
      "release-notes.md",
      `# ${project} ${version}\n\nDeterministic validation: ${validation.success ? "passed" : "failed"}.\n\nChecks executed: ${validation.checks.length}.\n`,
    );
  }
  async writeFinal(
    success: boolean,
    runId: string,
    summary: string,
  ): Promise<void> {
    await this.writer.writeJson("final-result.json", {
      success,
      runId,
      summary,
    });
    await this.writer.writeMarkdown(
      "final-report.md",
      `# Release Engineer Report\n\n- Run: ${runId}\n- Success: ${success ? "yes" : "no"}\n\n${summary}\n`,
    );
  }
}
