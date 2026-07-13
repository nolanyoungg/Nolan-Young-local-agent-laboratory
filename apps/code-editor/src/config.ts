import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { modelConfigSchema, type ModelConfig } from "@laboratory/shared-types";
import {
  pathPolicySchema,
  type ResolvedPathPolicy,
} from "@laboratory/workspace-security";
export const codeEditorModeSchema = z.enum(["plan-only", "dry-run", "apply"]);
export type CodeEditorMode = z.infer<typeof codeEditorModeSchema>;
export const codeEditorOptionsSchema = z.object({
  workspace: z.string().min(1),
  task: z.string().min(1),
  mode: codeEditorModeSchema.default("plan-only"),
  model: z.string().min(1),
  ollamaUrl: z.url(),
  maxSteps: z.number().int().positive().max(100),
  reportDirectory: z.string().min(1),
  verbose: z.boolean().default(false),
});
export type CodeEditorOptions = z.infer<typeof codeEditorOptionsSchema>;
export interface CodeEditorConfiguration {
  readonly options: CodeEditorOptions;
  readonly model: ModelConfig;
  readonly policy: ResolvedPathPolicy;
}
export async function loadCodeEditorConfiguration(
  input: Partial<CodeEditorOptions> &
    Pick<CodeEditorOptions, "workspace" | "task">,
  configDirectory: string,
): Promise<CodeEditorConfiguration> {
  const policyFile = JSON.parse(
    await readFile(path.join(configDirectory, "edit-policy.json"), "utf8"),
  ) as unknown;
  const options = codeEditorOptionsSchema.parse({
    workspace: input.workspace,
    task: input.task,
    mode: input.mode ?? "plan-only",
    model: input.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b",
    ollamaUrl:
      input.ollamaUrl ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434",
    maxSteps:
      input.maxSteps ?? Number(process.env.DEFAULT_MAX_AGENT_STEPS ?? 20),
    reportDirectory:
      input.reportDirectory ?? process.env.REPORTS_DIRECTORY ?? "reports/runs",
    verbose: input.verbose ?? false,
  });
  const model = modelConfigSchema.parse({
    provider: "ollama",
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
  return { options, model, policy: pathPolicySchema.parse(policyFile) };
}
