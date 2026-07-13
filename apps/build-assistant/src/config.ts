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
export const buildAssistantOptionsSchema = z.object({
  workspace: z.string().min(1),
  command: z.string().min(1),
  task: z.string().min(1),
  watch: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  model: z.string().min(1),
  ollamaUrl: z.url(),
  maxSteps: z.number().int().positive().max(100),
  maxRepairPasses: z.number().int().min(0).max(20),
  reportDirectory: z.string().min(1),
  verbose: z.boolean().default(false),
});
export type BuildAssistantOptions = z.infer<typeof buildAssistantOptionsSchema>;
export interface BuildAssistantConfiguration {
  readonly options: BuildAssistantOptions;
  readonly model: ModelConfig;
  readonly policy: ResolvedPathPolicy;
  readonly commands: Record<string, CommandDefinition>;
}
const commandFileSchema = z.object({
  commands: z.record(
    z.string(),
    commandSchema
      .omit({ workingDirectory: true })
      .extend({ workingDirectory: z.string().optional() }),
  ),
});
export async function loadBuildAssistantConfiguration(
  input: Partial<BuildAssistantOptions> &
    Pick<BuildAssistantOptions, "workspace" | "command" | "task">,
): Promise<BuildAssistantConfiguration> {
  const commandFile = commandFileSchema.parse(
    JSON.parse(
      await readFile(
        path.join(input.workspace, ".agent-commands.json"),
        "utf8",
      ),
    ) as unknown,
  );
  const options = buildAssistantOptionsSchema.parse({
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
    Object.entries(commandFile.commands).map(([id, command]) => [
      id,
      commandSchema.parse({
        ...command,
        workingDirectory: options.workspace,
        mode:
          options.watch && id === options.command ? "watcher" : command.mode,
      }),
    ]),
  );
  if (!commands[options.command])
    throw new Error(
      `Command ${options.command} is not registered in .agent-commands.json`,
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
    forbidden: [".agent-commands.json"],
  });
  return { options, model, policy, commands };
}
