import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const releaseReviewSchema = z.object({
  summary: z.string().min(1),
  repairable: z.boolean(),
  risks: z.array(z.string()),
  repairStrategy: z.array(z.string()),
});
export type ReleaseReview = z.infer<typeof releaseReviewSchema>;
export const createReleaseReviewerAgent = (
  instructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "release-reviewer",
  name: "Release Reviewer Agent",
  description: "Read-only validation failure reviewer",
  systemInstructions: instructions,
  permittedTools: [
    "list_files",
    "read_file",
    "read_file_metadata",
    "search_text",
  ],
  maximumSteps,
  outputSchema: releaseReviewSchema,
});
