import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  commandSchema,
  type CommandDefinition,
} from "@laboratory/process-tools";
import { modelConfigSchema, type ModelConfig } from "@laboratory/shared-types";
import {
  pathPolicySchema,
  type ResolvedPathPolicy,
} from "@laboratory/workspace-security";
export const releaseOperationSchema = z.enum([
  "check",
  "prepare",
  "package",
  "release",
]);
export type ReleaseOperation = z.infer<typeof releaseOperationSchema>;
export const releaseOptionsSchema = z.object({
  operation: releaseOperationSchema,
  workspace: z.string().min(1),
  task: z.string().default("Prepare a safe local release candidate"),
  repair: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  model: z.string().min(1),
  ollamaUrl: z.url(),
  maxSteps: z.number().int().positive().max(100),
  maxRepairPasses: z.number().int().min(0).max(20),
  reportDirectory: z.string().min(1),
  verbose: z.boolean().default(false),
});
export type ReleaseOptions = z.infer<typeof releaseOptionsSchema>;
const safeRelativePatternSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine(
    (value) =>
      !path.isAbsolute(value) &&
      !value.includes("\0") &&
      !value.replaceAll("\\", "/").split("/").includes(".."),
    "Path or glob must remain relative to the workspace",
  );
const validationConfigSchema = z.object({
  commands: z.record(
    z.string(),
    commandSchema.omit({ workingDirectory: true }).extend({
      workingDirectory: z.string().optional(),
      mandatory: z.boolean().default(true),
    }),
  ),
  requiredFiles: z.array(safeRelativePatternSchema).default([]),
  forbiddenFiles: z.array(safeRelativePatternSchema).default([]),
});
export const packageRulesSchema = z.object({
  requiredFiles: z
    .array(safeRelativePatternSchema)
    .default(["package.json", "README.md"]),
  forbiddenPaths: z
    .array(safeRelativePatternSchema)
    .default([
      ".git/**",
      ".github/**",
      "node_modules/**",
      ".env",
      ".env.*",
      "*.key",
      "*.pem",
      "reports/**",
      "workspaces/**",
      "**/*.tmp",
      "**/*.log",
    ]),
  includedPaths: z
    .array(safeRelativePatternSchema)
    .default(["dist/**", "package.json", "README.md"]),
  excludedPaths: z.array(safeRelativePatternSchema).default([]),
  expectedTopLevelDirectory: z.boolean().default(false),
  maximumArchiveBytes: z.number().int().positive().default(52_428_800),
  verifyExtraction: z.boolean().default(true),
});
export type PackageRules = z.infer<typeof packageRulesSchema>;
export interface ReleaseConfiguration {
  readonly options: ReleaseOptions;
  readonly model: ModelConfig;
  readonly commands: Record<string, CommandDefinition>;
  readonly mandatoryCommands: ReadonlySet<string>;
  readonly requiredFiles: readonly string[];
  readonly forbiddenFiles: readonly string[];
  readonly packageRules: PackageRules;
  readonly policy: ResolvedPathPolicy;
}
export async function loadReleaseConfiguration(
  input: Partial<ReleaseOptions> &
    Pick<ReleaseOptions, "operation" | "workspace">,
): Promise<ReleaseConfiguration> {
  const validation = validationConfigSchema.parse(
    JSON.parse(
      await readFile(
        path.join(input.workspace, ".release-checks.json"),
        "utf8",
      ),
    ) as unknown,
  );
  let packageInput: unknown = {};
  try {
    packageInput = JSON.parse(
      await readFile(path.join(input.workspace, ".package-rules.json"), "utf8"),
    ) as unknown;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
  const packageRules = packageRulesSchema.parse(packageInput);
  const options = releaseOptionsSchema.parse({
    ...input,
    model: input.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b",
    ollamaUrl:
      input.ollamaUrl ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434",
    maxSteps:
      input.maxSteps ?? Number(process.env.DEFAULT_MAX_AGENT_STEPS ?? 20),
    maxRepairPasses:
      input.maxRepairPasses ??
      Number(process.env.DEFAULT_MAX_REPAIR_PASSES ?? 3),
    reportDirectory:
      input.reportDirectory ?? process.env.REPORTS_DIRECTORY ?? "reports/runs",
  });
  const commands = Object.fromEntries(
    Object.entries(validation.commands).map(([id, command]) => [
      id,
      commandSchema.parse({
        ...command,
        workingDirectory: options.workspace,
        mode: "one-shot",
      }),
    ]),
  );
  const mandatoryCommands = new Set(
    Object.entries(validation.commands)
      .filter(([, value]) => value.mandatory)
      .map(([id]) => id),
  );
  const model = modelConfigSchema.parse({
    baseUrl: options.ollamaUrl,
    model: options.model,
    timeoutMilliseconds: Number(
      process.env.MODEL_REQUEST_TIMEOUT_MS ?? 180_000,
    ),
    temperature: Number(process.env.MODEL_TEMPERATURE ?? 0.1),
    contextTokens: Number(process.env.MODEL_CONTEXT_TOKENS ?? 32_768),
    retryCount: Number(process.env.MODEL_MAX_RETRIES ?? 2),
    retryDelayMilliseconds: Number(process.env.MODEL_RETRY_DELAY_MS ?? 500),
  });
  const policy = pathPolicySchema.parse({
    read: ["**"],
    write: ["src/**", "test/**", "tests/**", "package.json", "tsconfig*.json"],
    forbidden: [".release-checks.json", ".package-rules.json"],
  });
  return {
    options,
    model,
    commands,
    mandatoryCommands,
    requiredFiles: validation.requiredFiles,
    forbiddenFiles: validation.forbiddenFiles,
    packageRules,
    policy,
  };
}
