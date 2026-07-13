import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "@laboratory/local-model-client";
import { BuildAssistantWorkflow } from "./BuildAssistantWorkflow.js";
import {
  loadBuildAssistantConfiguration,
  type BuildAssistantOptions,
} from "./config.js";
export const helpText = `Nolan Young Local Agent Laboratory - build-assistant\nUsage: build-assistant --workspace PATH --command ID --task TEXT [--watch] [options]\nOptions: --model NAME --ollama-url URL --max-steps N --max-repair-passes N --report-directory PATH --dry-run --verbose --help --version`;
const parse = (
  args: readonly string[],
): {
  help: boolean;
  version: boolean;
  values: Partial<BuildAssistantOptions>;
} => {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") return { help: true, version: false, values: {} };
    if (arg === "--version") return { help: false, version: true, values: {} };
    if (arg === "--watch" || arg === "--dry-run" || arg === "--verbose") {
      values[
        arg
          .slice(2)
          .replace(/-([a-z])/g, (_m, letter: string) => letter.toUpperCase())
      ] = true;
      continue;
    }
    if (!arg?.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = args[++index];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    const key = arg
      .slice(2)
      .replace(/-([a-z])/g, (_m, letter: string) => letter.toUpperCase());
    values[key] = ["maxSteps", "maxRepairPasses"].includes(key)
      ? Number(value)
      : value;
  }
  return {
    help: false,
    version: false,
    values: values as Partial<BuildAssistantOptions>,
  };
};
export async function runBuildAssistantCli(
  args = process.argv.slice(2),
): Promise<number> {
  try {
    const parsed = parse(args);
    if (parsed.help) {
      console.log(helpText);
      return 0;
    }
    if (parsed.version) {
      console.log("0.1.0");
      return 0;
    }
    if (
      !parsed.values.workspace ||
      !parsed.values.command ||
      !parsed.values.task
    )
      throw new Error("--workspace, --command, and --task are required");
    const base = process.env.INIT_CWD ?? process.cwd();
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const configuration = await loadBuildAssistantConfiguration({
      ...parsed.values,
      workspace: path.resolve(base, parsed.values.workspace),
      command: parsed.values.command,
      task: parsed.values.task,
      reportDirectory: path.resolve(
        base,
        parsed.values.reportDirectory ??
          process.env.REPORTS_DIRECTORY ??
          "reports/runs",
      ),
    });
    console.log(`Workspace: ${configuration.options.workspace}`);
    console.log(
      `Model: ${process.env.MODEL_PROVIDER ?? "ollama"}/${configuration.model.model}`,
    );
    const result = await new BuildAssistantWorkflow(
      createModelClient(process.env.MODEL_PROVIDER ?? "ollama"),
      path.resolve(moduleDirectory, "../prompts"),
      (directory) => console.log(`Reports: ${directory}`),
    ).run(configuration);
    console.log(
      result.success
        ? "Build Assistant completed successfully."
        : "Build Assistant stopped with unresolved failures.",
    );
    return result.success ? 0 : 1;
  } catch (error) {
    console.error(
      `Build Assistant failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
