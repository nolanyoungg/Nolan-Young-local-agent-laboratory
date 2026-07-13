import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "@laboratory/local-model-client";
import { CodeEditorWorkflow } from "./CodeEditorWorkflow.js";
import {
  loadCodeEditorConfiguration,
  type CodeEditorOptions,
} from "./config.js";
export const helpText = `Nolan Young Local Agent Laboratory - code-editor\nUsage: code-editor --workspace PATH --task TEXT --mode plan-only|dry-run|apply [options]\nOptions: --model NAME --ollama-url URL --max-steps N --report-directory PATH --verbose --dry-run --help --version`;
const parseArguments = (
  argumentsList: readonly string[],
): { help: boolean; version: boolean; values: Partial<CodeEditorOptions> } => {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help")
      return { help: true, version: false, values: {} };
    if (argument === "--version")
      return { help: false, version: true, values: {} };
    if (argument === "--verbose") {
      values.verbose = true;
      continue;
    }
    if (argument === "--dry-run") {
      values.mode = "dry-run";
      continue;
    }
    if (!argument?.startsWith("--"))
      throw new Error(`Unexpected argument: ${argument}`);
    const value = argumentsList[++index];
    if (value === undefined) throw new Error(`Missing value for ${argument}`);
    const key = argument
      .slice(2)
      .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    values[key] = key === "maxSteps" ? Number(value) : value;
  }
  return {
    help: false,
    version: false,
    values: values as Partial<CodeEditorOptions>,
  };
};
export async function runCodeEditorCli(
  argumentsList = process.argv.slice(2),
): Promise<number> {
  try {
    const parsed = parseArguments(argumentsList);
    if (parsed.help) {
      console.log(helpText);
      return 0;
    }
    if (parsed.version) {
      console.log("0.1.0");
      return 0;
    }
    if (!parsed.values.workspace || !parsed.values.task)
      throw new Error("--workspace and --task are required");
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const configuration = await loadCodeEditorConfiguration(
      {
        ...parsed.values,
        workspace: path.resolve(invocationDirectory, parsed.values.workspace),
        task: parsed.values.task,
        reportDirectory: path.resolve(
          invocationDirectory,
          parsed.values.reportDirectory ??
            process.env.REPORTS_DIRECTORY ??
            "reports/runs",
        ),
      },
      path.resolve(moduleDirectory, "../config"),
    );
    console.log(`Workspace: ${configuration.options.workspace}`);
    console.log(
      `Model: ${process.env.MODEL_PROVIDER ?? "ollama"}/${configuration.model.model}`,
    );
    const workflow = new CodeEditorWorkflow(
      createModelClient(process.env.MODEL_PROVIDER ?? "ollama"),
      path.resolve(moduleDirectory, "../prompts"),
      (directory) => console.log(`Reports: ${directory}`),
    );
    const result = await workflow.run(configuration);
    console.log(
      result.success
        ? "Code Editor completed successfully."
        : "Code Editor completed with review failures.",
    );
    return result.success ? 0 : 1;
  } catch (error) {
    console.error(
      `Code Editor failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
