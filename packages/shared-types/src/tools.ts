import { z } from "zod";
import { structuredErrorSchema } from "./errors.js";

const safePathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => !value.includes("\0"), "Path contains a null byte");
const dryRunSchema = z.boolean().default(false);

export const listFilesActionSchema = z.strictObject({
  type: z.literal("list_files"),
  path: safePathSchema
    .default(".")
    .describe("Workspace-relative directory to list; use . for the root."),
  pattern: z
    .string()
    .max(1_024)
    .optional()
    .describe("Optional glob used to filter returned workspace paths."),
});
export const readFileActionSchema = z.strictObject({
  type: z.literal("read_file"),
  path: safePathSchema.describe("Exact workspace-relative file path to read."),
});
export const readFileMetadataActionSchema = z.strictObject({
  type: z.literal("read_file_metadata"),
  path: safePathSchema.describe(
    "Exact workspace-relative path whose type, size, and hash are requested.",
  ),
});
export const searchTextActionSchema = z.strictObject({
  type: z.literal("search_text"),
  path: safePathSchema
    .default(".")
    .describe("Workspace-relative directory or file to search."),
  query: z
    .string()
    .min(1)
    .max(8_192)
    .describe("Literal text to search for; this is not a regular expression."),
  caseSensitive: z
    .boolean()
    .default(true)
    .describe("Whether the literal search must match letter case."),
});
export const createFileActionSchema = z.strictObject({
  type: z.literal("create_file"),
  path: safePathSchema.describe(
    "Workspace-relative path for a new file; the action fails if it exists.",
  ),
  content: z.string().describe("Complete UTF-8 contents of the new file."),
  dryRun: dryRunSchema,
});
export const writeFileActionSchema = z.strictObject({
  type: z.literal("write_file"),
  path: safePathSchema.describe(
    "Workspace-relative path to create or atomically overwrite.",
  ),
  content: z
    .string()
    .describe(
      "Complete replacement UTF-8 contents. Preserve every unrelated line.",
    ),
  dryRun: dryRunSchema,
});
export const applyPatchActionSchema = z.strictObject({
  type: z.literal("apply_patch"),
  path: safePathSchema.describe("Workspace-relative existing file to patch."),
  patch: z
    .string()
    .min(1)
    .describe(
      "One exact replacement encoded as <old text>\\n---REPLACE-WITH---\\n<new text>. The marker must occur exactly once and old text must match exactly once in the current file. This is not a unified diff.",
    ),
  dryRun: dryRunSchema,
});
export const readProcessLogActionSchema = z.strictObject({
  type: z.literal("read_process_log"),
  processId: z
    .string()
    .min(1)
    .describe("Exact process identifier supplied by deterministic evidence."),
  stream: z
    .enum(["stdout", "stderr", "both"])
    .default("both")
    .describe(
      "Process stream to read. Start with both because build diagnostics may be emitted to stdout or stderr; an empty single stream is inconclusive.",
    ),
});
export const getProcessStatusActionSchema = z.strictObject({
  type: z.literal("get_process_status"),
  processId: z
    .string()
    .min(1)
    .describe("Exact process identifier supplied by deterministic evidence."),
});
export const finishActionSchema = z.strictObject({
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

export type JsonSchema = Readonly<Record<string, unknown>>;

const withoutSchemaDialect = (schema: Record<string, unknown>): JsonSchema => {
  const embedded = { ...schema };
  delete embedded.$schema;
  return embedded;
};

export const zodToEmbeddedJsonSchema = (
  schema: z.ZodType<unknown>,
): JsonSchema =>
  withoutSchemaDialect(
    z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<
      string,
      unknown
    >,
  );

export const toolActionJsonSchemas: Readonly<
  Record<Exclude<ToolName, "finish">, JsonSchema>
> = {
  list_files: zodToEmbeddedJsonSchema(listFilesActionSchema),
  read_file: zodToEmbeddedJsonSchema(readFileActionSchema),
  read_file_metadata: zodToEmbeddedJsonSchema(readFileMetadataActionSchema),
  search_text: zodToEmbeddedJsonSchema(searchTextActionSchema),
  create_file: zodToEmbeddedJsonSchema(createFileActionSchema),
  write_file: zodToEmbeddedJsonSchema(writeFileActionSchema),
  apply_patch: zodToEmbeddedJsonSchema(applyPatchActionSchema),
  read_process_log: zodToEmbeddedJsonSchema(readProcessLogActionSchema),
  get_process_status: zodToEmbeddedJsonSchema(getProcessStatusActionSchema),
};

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
