import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const codeReviewSchema = z.object({
  approved: z.boolean(),
  summary: z.string().min(1),
  findings: z.array(
    z.object({
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      path: z.string().optional(),
    }),
  ),
  omissions: z.array(z.string()),
  unrelatedChanges: z.array(z.string()),
});
export type CodeReview = z.infer<typeof codeReviewSchema>;
export const createReviewerAgent = (
  systemInstructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "code-editor-reviewer",
  name: "Reviewer Agent",
  description: "Read-only post-edit reviewer",
  systemInstructions,
  permittedTools: [
    "list_files",
    "read_file",
    "read_file_metadata",
    "search_text",
  ],
  maximumSteps,
  outputSchema: codeReviewSchema,
});
