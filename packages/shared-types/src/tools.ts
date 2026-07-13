import { z } from "zod";
import { structuredErrorSchema } from "./errors.js";

const safePathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => !value.includes("\0"), "Path contains a null byte");
const dryRunSchema = z.boolean().default(false);

export const listFilesActionSchema = z.object({
  type: z.literal("list_files"),
  path: safePathSchema.default("."),
  pattern: z.string().max(1_024).optional(),
});
export const readFileActionSchema = z.object({
  type: z.literal("read_file"),
  path: safePathSchema,
});
export const readFileMetadataActionSchema = z.object({
  type: z.literal("read_file_metadata"),
  path: safePathSchema,
});
export const searchTextActionSchema = z.object({
  type: z.literal("search_text"),
  path: safePathSchema.default("."),
  query: z.string().min(1).max(8_192),
  caseSensitive: z.boolean().default(true),
});
export const createFileActionSchema = z.object({
  type: z.literal("create_file"),
  path: safePathSchema,
  content: z.string(),
  dryRun: dryRunSchema,
});
export const writeFileActionSchema = z.object({
  type: z.literal("write_file"),
  path: safePathSchema,
  content: z.string(),
  dryRun: dryRunSchema,
});
export const applyPatchActionSchema = z.object({
  type: z.literal("apply_patch"),
  path: safePathSchema,
  patch: z.string().min(1),
  dryRun: dryRunSchema,
});
export const readProcessLogActionSchema = z.object({
  type: z.literal("read_process_log"),
  processId: z.string().min(1),
  stream: z.enum(["stdout", "stderr", "both"]).default("both"),
});
export const getProcessStatusActionSchema = z.object({
  type: z.literal("get_process_status"),
  processId: z.string().min(1),
});
export const finishActionSchema = z.object({
  type: z.literal("finish"),
  result: z.unknown(),
});

export const agentActionSchema = z.discriminatedUnion("type", [
  listFilesActionSchema,
  readFileActionSchema,
  readFileMetadataActionSchema,
  searchTextActionSchema,
  createFileActionSchema,
  writeFileActionSchema,
  applyPatchActionSchema,
  readProcessLogActionSchema,
  getProcessStatusActionSchema,
  finishActionSchema,
]);
export const actionSchema = agentActionSchema;
export type AgentAction = z.infer<typeof agentActionSchema>;
export type ToolName = AgentAction["type"];

export const toolResultSchema = z.object({
  ok: z.boolean(),
  output: z.unknown().optional(),
  error: structuredErrorSchema.optional(),
  truncated: z.boolean().optional(),
  originalBytes: z.number().int().nonnegative().optional(),
  returnedBytes: z.number().int().nonnegative().optional(),
});
export interface ToolResult {
  readonly ok: boolean;
  readonly output?: unknown;
  readonly error?: import("./errors.js").StructuredError;
  readonly truncated?: boolean;
  readonly originalBytes?: number;
  readonly returnedBytes?: number;
}
export interface ToolDefinition {
  readonly name: ToolName;
  readonly description: string;
  readonly mutating: boolean;
}
export interface ToolCall {
  readonly id: string;
  readonly agentId: string;
  readonly action: AgentAction;
}
