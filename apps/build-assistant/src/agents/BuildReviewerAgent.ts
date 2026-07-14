import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const buildReviewSchema = z.strictObject({
  approved: z.boolean(),
  summary: z.string().min(1),
  findings: z.array(
    z.strictObject({
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      path: z.string().optional(),
    }),
  ),
  unrelatedChanges: z.array(z.string()),
});
export type BuildReview = z.infer<typeof buildReviewSchema>;
export const createBuildReviewerAgent = (
  instructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "build-reviewer",
  name: "Build Reviewer Agent",
  description: "Read-only build repair reviewer",
  systemInstructions: instructions,
  permittedTools: [
    "list_files",
    "read_file",
    "read_file_metadata",
    "search_text",
    "read_process_log",
    "get_process_status",
  ],
  maximumSteps,
  outputSchema: buildReviewSchema,
});
