import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const buildRepairSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string()),
  safeToRetry: z.boolean(),
  remainingRisks: z.array(z.string()),
});
export type BuildRepair = z.infer<typeof buildRepairSchema>;
export const createBuildRepairAgent = (
  instructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "build-repair",
  name: "Build Repair Agent",
  description: "Failure-scoped source repair agent",
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
  outputSchema: buildRepairSchema,
});
