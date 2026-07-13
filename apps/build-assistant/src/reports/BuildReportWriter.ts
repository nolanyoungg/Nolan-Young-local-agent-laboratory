import { ReportWriter } from "@laboratory/tracing";
import type { ProcessResult } from "@laboratory/process-tools";
import type { BuildDiagnosis } from "../agents/BuildDiagnosisAgent.js";
import type { BuildReview } from "../agents/BuildReviewerAgent.js";
export interface RepairAttempt {
  readonly pass: number;
  readonly diagnosis: BuildDiagnosis;
  readonly repair: unknown;
  readonly buildStatus:
    ProcessResult | { success: boolean; processId: string; state: string };
}
export class BuildReportWriter {
  private readonly writer: ReportWriter;
  constructor(directory: string) {
    this.writer = new ReportWriter(directory);
  }
  writeInitial(value: unknown): Promise<string> {
    return this.writer.writeJson("initial-build-status.json", value);
  }
  writeDiagnosis(value: unknown): Promise<string> {
    return this.writer.writeJson("diagnosis.json", value);
  }
  writeAttempts(value: readonly RepairAttempt[]): Promise<string> {
    return this.writer.writeJson("repair-attempts.json", value);
  }
  writeChangedFiles(value: unknown): Promise<string> {
    return this.writer.writeJson("changed-files.json", value);
  }
  writeFinalStatus(value: unknown): Promise<string> {
    return this.writer.writeJson("final-build-status.json", value);
  }
  writeReview(value: BuildReview): Promise<string> {
    return this.writer.writeJson("review-report.json", value);
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
      `# Build Assistant Report\n\n- Run: ${runId}\n- Success: ${success ? "yes" : "no"}\n\n${summary}\n`,
    );
  }
}
