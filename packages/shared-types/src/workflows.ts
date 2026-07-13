import { z } from "zod";

export const workflowIdentifierSchema = z.enum([
  "code-editor",
  "build-assistant",
  "release-engineer",
]);
export type WorkflowIdentifier = z.infer<typeof workflowIdentifierSchema>;
export const severitySchema = z.enum(["info", "warning", "error", "critical"]);
export type Severity = z.infer<typeof severitySchema>;
export const validationFindingSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: severitySchema,
  path: z.string().optional(),
  repairable: z.boolean().default(false),
});
export type ValidationFinding = z.infer<typeof validationFindingSchema>;
export const runIdSchema = z.string().uuid();
export type RunId = z.infer<typeof runIdSchema>;
export const workspaceMetadataSchema = z.object({
  root: z.string().min(1),
  canonicalRoot: z.string().min(1),
  locked: z.boolean(),
  external: z.boolean(),
});
export type WorkspaceMetadata = z.infer<typeof workspaceMetadataSchema>;
export const workflowResultSchema = z.object({
  runId: runIdSchema,
  application: workflowIdentifierSchema,
  success: z.boolean(),
  summary: z.string(),
  findings: z.array(validationFindingSchema),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
});
export type WorkflowResult = z.infer<typeof workflowResultSchema>;
