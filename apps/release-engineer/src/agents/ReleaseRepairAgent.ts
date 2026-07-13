import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const releaseRepairSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string()),
  safeToRevalidate: z.boolean(),
  remainingRisks: z.array(z.string()),
});
export type ReleaseRepair = z.infer<typeof releaseRepairSchema>;
export const createReleaseRepairAgent = (
  instructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "release-repair",
  name: "Release Repair Agent",
  description: "Policy-preserving release repair agent",
  systemInstructions: instructions,
  permittedTools: [
    "list_files",
    "read_file",
    "read_file_metadata",
    "search_text",
    "create_file",
    "write_file",
    "apply_patch",
    "read_process_log",
    "get_process_status",
  ],
  maximumSteps,
  outputSchema: releaseRepairSchema,
});
