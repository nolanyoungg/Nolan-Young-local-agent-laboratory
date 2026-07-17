import { z } from "zod";
import { modelConfigSchema } from "./models.js";

export const agentIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
export const agentExecutionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "limited",
]);
export type AgentExecutionStatus = z.infer<typeof agentExecutionStatusSchema>;
export const agentPermissionsSchema = z.object({
  tools: z.array(
    z.enum([
      "list_files",
      "read_file",
      "read_file_metadata",
      "search_text",
      "php_syntax_check",
      "finish",
    ]),
  ),
  readOnly: z.boolean(),
});

export interface AgentInstructions {
  readonly system: string;
  readonly completionCriteria: readonly string[];
}
export interface AgentPermissions {
  readonly tools: readonly import("./tools.js").ToolName[];
  readonly readOnly: boolean;
}
export interface AgentDefinition extends AgentIdentity {
  readonly systemInstructions: string;
  readonly permittedTools: readonly import("./tools.js").ToolName[];
  readonly maximumSteps: number;
  readonly outputSchema?: z.ZodType<unknown>;
  readonly modelConfig?: Partial<z.infer<typeof modelConfigSchema>>;
}
