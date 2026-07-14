import { z } from "zod";
import type { AgentDefinition } from "@laboratory/shared-types";
export const buildDiagnosisSchema = z.strictObject({
  summary: z.string().min(1),
  rootCauses: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  repairSteps: z.array(z.string()),
  repairable: z.boolean(),
});
export type BuildDiagnosis = z.infer<typeof buildDiagnosisSchema>;
export const createBuildDiagnosisAgent = (
  instructions: string,
  maximumSteps: number,
): AgentDefinition => ({
  id: "build-diagnosis",
  name: "Build Diagnosis Agent",
  description: "Read-only deterministic build failure diagnostician",
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
  outputSchema: buildDiagnosisSchema,
});
