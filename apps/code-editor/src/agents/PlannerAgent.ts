import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const changePlanSchema = z.strictObject({
  summary: z.string().min(1),
  affectedFiles: z.array(z.string()),
  risks: z.array(z.string()),
  steps: z.array(z.string()).min(1),
  validation: z.array(z.string()),
});
export type ChangePlan = z.infer<typeof changePlanSchema>;
export const createPlannerAgent = (
  systemInstructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "code-editor-planner",
  name: "Planner Agent",
  description: "Read-only bounded source-change planner",
  systemInstructions,
  permittedTools: [
    "list_files",
    "read_file",
    "read_file_metadata",
    "search_text",
  ],
  maximumSteps,
  outputSchema: changePlanSchema,
});
