import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const editSummarySchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string()),
  validationNotes: z.array(z.string()),
  remainingRisks: z.array(z.string()),
});
export type EditSummary = z.infer<typeof editSummarySchema>;
export const createEditorAgent = (
  systemInstructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "code-editor-editor",
  name: "Editor Agent",
  description: "Policy-confined source editor",
  systemInstructions,
  permittedTools: [
    "list_files",
    "read_file",
    "read_file_metadata",
    "search_text",
    "create_file",
    "write_file",
    "apply_patch",
  ],
  maximumSteps,
  outputSchema: editSummarySchema,
});
