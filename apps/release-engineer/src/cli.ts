import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "@laboratory/local-model-client";
import {
  loadReleaseConfiguration,
  releaseOperationSchema,
  type ReleaseOptions,
} from "./config.js";
import { ReleaseEngineerWorkflow } from "./ReleaseEngineerWorkflow.js";
export const helpText = `Nolan Young Local Agent Laboratory - release-engineer\nUsage: release-engineer check|prepare|package|release --workspace PATH [options]\nOptions: --repair --dry-run --task TEXT --model NAME --ollama-url URL --max-steps N --max-repair-passes N --report-directory PATH --verbose --help --version`;
const parse = (
  args: readonly string[],
): { help: boolean; version: boolean; values: Partial<ReleaseOptions> } => {
  if (args.includes("--help"))
    return { help: true, version: false, values: {} };
  if (args.includes("--version"))
    return { help: false, version: true, values: {} };
  const [operationValue, ...remaining] = args;
  const values: Record<string, unknown> = {
    operation: releaseOperationSchema.parse(operationValue),
  };
  for (let index = 0; index < remaining.length; index += 1) {
    const arg = remaining[index];
    if (arg === "--repair" || arg === "--dry-run" || arg === "--verbose") {
      values[
        arg
          .slice(2)
          .replace(/-([a-z])/g, (_m, letter: string) => letter.toUpperCase())
      ] = true;
      continue;
    }
    if (!arg?.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = remaining[++index];
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
    values: values as Partial<ReleaseOptions>,
  };
};
export async function runReleaseEngineerCli(
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
    if (!parsed.values.operation || !parsed.values.workspace)
      throw new Error("An operation and --workspace are required");
    const base = process.env.INIT_CWD ?? process.cwd();
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const configuration = await loadReleaseConfiguration({
      ...parsed.values,
      operation: parsed.values.operation,
      workspace: path.resolve(base, parsed.values.workspace),
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
    const result = await new ReleaseEngineerWorkflow(
      createModelClient(process.env.MODEL_PROVIDER ?? "ollama"),
      path.resolve(moduleDirectory, "../prompts"),
      (directory) => console.log(`Reports: ${directory}`),
    ).run(configuration);
    console.log(
      result.success
        ? "Release Engineer completed successfully."
        : "Release Engineer stopped with unresolved failures.",
    );
    return result.success ? 0 : 1;
  } catch (error) {
    console.error(
      `Release Engineer failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
