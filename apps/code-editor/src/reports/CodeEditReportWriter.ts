import { ReportWriter } from "@laboratory/tracing";
import type { ChangePlan } from "../agents/PlannerAgent.js";
import type { CodeReview } from "../agents/ReviewerAgent.js";
export interface ChangedFileRecord {
  readonly path: string;
  readonly originalSha256: string | null;
  readonly finalSha256: string;
  readonly dryRun: boolean;
}
export class CodeEditReportWriter {
  private readonly writer: ReportWriter;
  constructor(directory: string) {
    this.writer = new ReportWriter(directory);
  }
  async writePlan(plan: ChangePlan): Promise<void> {
    await this.writer.writeJson("change-plan.json", plan);
  }
  async writeProposedDiff(diff: string): Promise<void> {
    await this.writer.writeText("proposed-changes.diff", diff);
  }
  async writeChangedFiles(files: readonly ChangedFileRecord[]): Promise<void> {
    await this.writer.writeJson("changed-files.json", files);
  }
  async writeReview(review: CodeReview): Promise<void> {
    await this.writer.writeJson("review-report.json", review);
  }
  async writeFinal(
    success: boolean,
    mode: string,
    runId: string,
    summary: string,
  ): Promise<void> {
    await this.writer.writeJson("final-result.json", {
      success,
      mode,
      runId,
      summary,
    });
    await this.writer.writeMarkdown(
      "final-report.md",
      `# Code Editor Report\n\n- Run: ${runId}\n- Mode: ${mode}\n- Success: ${success ? "yes" : "no"}\n\n${summary}\n`,
    );
  }
}
